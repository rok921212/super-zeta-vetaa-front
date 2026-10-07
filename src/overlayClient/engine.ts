// The ONE overlay synchronization engine.
//
// Every live-data consumer runs this: PublicThemeRenderer (built-in themes),
// the external SDK (connectOverlay), the Designer preview and the published
// Designer runtime. It owns, exactly once:
//   - MessagePack bulk hydration (+ first-fetch transient retry, abortable)
//   - socket join / rejoin-on-reconnect (room membership never survives one)
//   - protobuf (0xC1) live delta merge + seq-gap -> snapshot recovery
//   - liveMatchSnapshot replace, overall standings delta merge
//   - publicRev revision gate (an older HTTP body never overwrites newer
//     socket state) + socket-owned roster guard
//   - roundStructureChanged / publicDataInvalidated quiet refetch
//   - relay upstream outage resync, stall watchdog, 30-min backstop poll
//   - followSelected match-boundary reset
//   - a generation fence so a superseded request can't touch newer state
//   - lazily-derived values and the live event stream
// Framework-free; React is an adapter (./react.ts).

import { BoundedCache } from './cache.ts';
import { isAbortError, isTransient, retryTransient, HttpError } from './retry.ts';
import { emptyData, isOurMatch, newLiveBook, resetLive, type LiveBook } from './state.ts';
import {
  BACKSTOP_POLL_MS,
  LIVE_STALL_MS,
  QUIET_REFETCH_DEBOUNCE_MS,
  RELAY_OFFLINE_AFTER_MS,
  STALL_CHECK_MS,
  computePhase,
  createSnapshotRequester,
} from './recovery.ts';
import { viewNeedsMatchData, viewNeedsOverall } from './viewTiers.ts';
import { pubgAdapter, type GameAdapter } from './adapters/pubg.ts';
import type { EngineTransport, EngineSocket } from './transport.ts';
import type {
  EngineData,
  EngineDiagnostics,
  EngineError,
  EngineEvent,
  EngineEventType,
  EngineOptions,
  EngineOptionsUpdate,
  EngineState,
  EngineStatus,
  EventListener,
  OverlayEngine,
  StateListener,
} from './engineTypes.ts';

const BULK_CACHE_TTL_MS = 3000;
const BULK_CACHE_MAX_ENTRIES = 16;
const HOUSEKEEPING_MS = 2000;

const ALL_EVENT_TYPES: EngineEventType[] = [
  'kill', 'elimination', 'milestone', 'recall', 'matchStart', 'matchEnd', 'rankChange', 'killsChange',
  'knock', 'revive', 'playerDeath',
  'sequenceGap', 'snapshotRecovery', 'bulkApplied',
];
const DETECTED_TYPES: EngineEventType[] = [
  'kill', 'elimination', 'milestone', 'recall', 'matchStart', 'matchEnd', 'rankChange', 'killsChange',
  'knock', 'revive', 'playerDeath',
];

export interface EngineDeps {
  transport: EngineTransport;
  adapter?: GameAdapter;
  clock?: () => number;
}

interface ResolvedOptions {
  tournamentId: string;
  roundId: string;
  /** The URL match slot: a real id, or 'selected'. */
  matchId: string;
  followSelected: boolean;
  view: string | null;
  tag: unknown;
  verbose: boolean;
  debug: boolean;
}

function resolveOptions(o: EngineOptions | (EngineOptions & EngineOptionsUpdate)): ResolvedOptions {
  if (!o.tournamentId || !o.roundId) throw new Error('overlay engine: tournamentId and roundId are required');
  return {
    tournamentId: String(o.tournamentId),
    roundId: String(o.roundId),
    matchId: o.matchId ? String(o.matchId) : 'selected',
    followSelected: o.followSelected ?? !o.matchId,
    view: o.view == null || o.view === '' ? null : String(o.view),
    tag: o.tag,
    verbose: !!o.verbose,
    debug: !!o.debug,
  };
}

function toEngineError(err: unknown): EngineError {
  const status = err instanceof HttpError ? err.status : null;
  if (status === 404) return { code: 'NOT_FOUND', status, message: 'Not found — check tournamentId / roundId' };
  return { code: 'FETCH_FAILED', status, message: 'Failed to load tournament data' };
}

export function createOverlayEngine(options: EngineOptions, deps: EngineDeps): OverlayEngine {
  const { transport } = deps;
  const adapter = deps.adapter ?? pubgAdapter;
  const clock = deps.clock ?? Date.now;

  let opts = resolveOptions(options);
  const log = (...a: any[]) => { if (opts.verbose) console.log(...a); };
  const dlog = (...a: any[]) => { if (opts.debug) console.log('[overlay-engine]', ...a); };

  // ── state ───────────────────────────────────────────────────────────────
  let data: EngineData = {
    ...emptyData(),
    tournament: options.initial?.tournament ?? null,
    round: options.initial?.round ?? null,
    matches: options.initial?.matches ?? [],
  };
  let book: LiveBook = newLiveBook();
  let generation = 0;
  const cache = new BoundedCache<string, any>({ maxEntries: BULK_CACHE_MAX_ENTRIES, maxAgeMs: BULK_CACHE_TTL_MS, now: clock });
  const derived = adapter.createDerived();
  const events = adapter.createEvents();

  let destroyed = false;
  let firstFetchDone = false;
  let hasConnectedBefore = false;
  let sawBaseline = false;
  let upstreamWasDown = false;
  let joinedKey: string | null = null;
  let relayFailSince: number | null = null;
  let lastLiveMark = clock();
  let lastUsingRelay = transport.usingRelay();

  const status: EngineStatus = {
    phase: 'IDLE',
    relayReachable: true,
    transport: lastUsingRelay ? 'relay' : 'cloud',
    socketConnected: false,
    upstreamConnected: null,
    loading: true,
    error: null,
    lastUpdateAt: null,
    lastLiveAt: null,
    lastSnapshotAt: null,
    lastSequence: 0,
    sequenceGapCount: 0,
    reconnectCount: 0,
    httpFallbackCount: 0,
    staleForMs: 0,
    awaitingSnapshot: false,
    publicRev: 0,
  };

  const diag = {
    bulkFetches: 0,
    bulkBytes: 0,
    bulkErrors: 0,
    socketMessages: {} as Record<string, number>,
    socketBytes: 0,
    deltasApplied: 0,
    snapshotsApplied: 0,
    snapshotsSkipped: 0,
    snapshotRequests: 0,
    events: {} as Record<string, number>,
    startedAt: clock(),
  };

  // ── publishing ──────────────────────────────────────────────────────────
  const stateListeners = new Set<StateListener>();
  const eventListeners = new Map<EngineEventType | '*', Set<EventListener>>();
  let pendingEvents: EngineEvent[] = [];
  let flushQueued = false;
  let current: EngineState;

  function refreshStatus(): void {
    const now = clock();
    const usingRelay = transport.usingRelay();
    if (lastUsingRelay && !usingRelay) status.httpFallbackCount++;
    lastUsingRelay = usingRelay;
    status.transport = usingRelay ? 'relay' : 'cloud';
    status.relayReachable = transport.canFallBack
      ? usingRelay
      : !(relayFailSince != null && now - relayFailSince >= RELAY_OFFLINE_AFTER_MS);
    status.lastSequence = book.lastSeq;
    const liveHeld = viewNeedsMatchData(opts.view) && !!data.matchData;
    status.staleForMs = liveHeld && status.lastLiveAt != null ? Math.max(0, now - status.lastLiveAt) : 0;
    status.phase = computePhase({
      destroyed,
      started: true,
      firstFetchDone,
      hasData: !!(data.tournament || data.matchData),
      socketConnected: status.socketConnected,
      hasConnectedBefore,
      relayReachable: status.relayReachable,
      onCloudFallback: transport.canFallBack && !usingRelay,
      upstreamConnected: status.upstreamConnected,
      awaitingSnapshot: status.awaitingSnapshot,
      stale: liveHeld && status.staleForMs > LIVE_STALL_MS,
    });
  }

  function buildState(): EngineState {
    refreshStatus();
    return { ...data, status: { ...status }, derived: derived.view(data) };
  }

  function wantedTypes(): Set<EngineEventType> {
    if (eventListeners.has('*')) return new Set(ALL_EVENT_TYPES);
    return new Set(Array.from(eventListeners.keys()).filter((k): k is EngineEventType => k !== '*'));
  }

  function emit(ev: EngineEvent): void {
    diag.events[ev.type] = (diag.events[ev.type] || 0) + 1;
    for (const key of [ev.type, '*'] as const) {
      const set = eventListeners.get(key);
      if (!set) continue;
      for (const l of Array.from(set)) {
        try { l(ev); } catch (err) { console.error('[overlay-engine] event listener threw:', err); }
      }
    }
  }

  function flush(): void {
    flushQueued = false;
    if (destroyed) return;
    current = buildState();
    for (const l of Array.from(stateListeners)) {
      try { l(current); } catch (err) { console.error('[overlay-engine] listener threw:', err); }
    }
    const queued = pendingEvents;
    pendingEvents = [];
    const wanted = wantedTypes();
    // Detectors only run while someone listens for a DETECTED type (a
    // consumer that only wants `bulkApplied` pays nothing per tick).
    if (DETECTED_TYPES.some((t) => wanted.has(t))) {
      try {
        const detected = events.process(
          { data, derived: current.derived, sequence: book.lastSeq, now: clock() },
          wanted
        );
        for (const ev of detected) queued.push(ev);
      } catch (err) {
        // A malformed payload must never take the state stream down with it.
        console.error('[overlay-engine] event detection failed:', err);
      }
    }
    for (const ev of queued) emit(ev);
  }

  /** A burst of socket chunks from one tick collapses into one publish. */
  function changed(): void {
    status.lastUpdateAt = clock();
    if (flushQueued || destroyed) return;
    flushQueued = true;
    queueMicrotask(flush);
  }

  function internalEvent(type: EngineEventType, payload: any, idSuffix: string): void {
    pendingEvents.push({
      id: `${data.matchData?.matchId ?? 'none'}:${type}:${idSuffix}`,
      type,
      timestamp: clock(),
      sequence: book.lastSeq,
      matchId: data.matchData?.matchId != null ? String(data.matchData.matchId) : null,
      payload,
    });
  }

  // ── relay reachability bookkeeping ──────────────────────────────────────
  const markRelayFailure = () => { if (relayFailSince == null) relayFailSince = clock(); };
  const markRelaySuccess = () => { relayFailSince = null; };

  // ── HTTP ────────────────────────────────────────────────────────────────
  let fetchAbort: AbortController | null = null;
  let quietRefetchTimer: ReturnType<typeof setTimeout> | null = null;

  function bulkPath(): string {
    const params = new URLSearchParams();
    if (opts.view) params.set('view', opts.view);
    if (opts.followSelected) params.set('followSelected', 'true');
    const qs = params.toString();
    const enc = encodeURIComponent;
    return `public/bulk/${enc(opts.tournamentId)}/${enc(opts.roundId)}/${enc(opts.matchId)}${qs ? `?${qs}` : ''}`;
  }

  async function cachedBulk(path: string, signal: AbortSignal): Promise<any> {
    const gen = generation;
    const hit = cache.get(path, gen, BULK_CACHE_TTL_MS);
    if (hit !== undefined) return hit;
    const res = await transport.getBulk(path, signal);
    diag.bulkFetches++;
    diag.bulkBytes += res.bytes;
    cache.set(path, res.data, gen);
    return res.data;
  }

  async function fetchData(): Promise<void> {
    if (destroyed) return;
    fetchAbort?.abort();
    const controller = new AbortController();
    fetchAbort = controller;
    const generationAtStart = generation;
    const isFirst = !firstFetchDone;
    const tag = opts.tag;
    const view = opts.view;
    const path = bulkPath();
    try {
      const bulk = isFirst
        ? await retryTransient(() => cachedBulk(path, controller.signal), {
            signal: controller.signal,
            onRetry: (err, _attempt, delayMs) => {
              diag.bulkErrors++;
              markRelayFailure();
              console.warn(`[overlay] bulk fetch failed (${(err as any)?.status ?? 'network'}) — retrying in ${delayMs}ms`);
              changed();
            },
          })
        : await cachedBulk(path, controller.signal);
      if (destroyed || controller.signal.aborted) return;
      markRelaySuccess();
      log(`[DATA SOURCE] bulk received | via=${transport.usingRelay() ? 'relay' : 'cloud'} | match=${opts.matchId}`);
      // Invalidated mid-flight: this body predates the new truth.
      if (generationAtStart !== generation) {
        dlog('stale request dropped', { generationAtStart, generation });
        return;
      }
      const rev = adapter.bulkRevision(bulk);
      const result = adapter.applyBulk(data, book, bulk, rev);
      data = result.data;
      if (!result.liveApplied) dlog('stale bulk live slices skipped', { httpRev: rev, knownRev: book.knownRev });
      else status.publicRev = Math.max(status.publicRev, rev);
      status.error = null;
      firstFetchDone = true;
      status.loading = false;
      internalEvent('bulkApplied', { view, tag, generation, liveApplied: result.liveApplied }, `${generation}:${diag.bulkFetches}`);
      changed();
    } catch (err) {
      if (destroyed || controller.signal.aborted || isAbortError(err)) return;
      diag.bulkErrors++;
      if (isTransient(err)) markRelayFailure();
      console.error('[overlay] failed to fetch data:', err);
      if (isFirst) {
        status.error = toEngineError(err);
        status.loading = false;
        firstFetchDone = true;
        changed();
      }
    }
  }

  function scheduleQuietRefetch(): void {
    if (quietRefetchTimer) clearTimeout(quietRefetchTimer);
    quietRefetchTimer = setTimeout(() => {
      quietRefetchTimer = null;
      fetchData();
    }, QUIET_REFETCH_DEBOUNCE_MS);
  }

  /** Void the in-memory HTTP cache + any in-flight fetch's write-back. */
  function bumpGeneration(): void {
    generation += 1;
    cache.clear();
  }

  // ── socket ──────────────────────────────────────────────────────────────
  const sock: EngineSocket = transport.socket();

  const snapshots = createSnapshotRequester((reason) => {
    diag.snapshotRequests++;
    dlog('request snapshot', { reason });
    sock.emit('requestLiveSnapshot', { tournamentId: opts.tournamentId, roundId: opts.roundId });
  }, undefined, clock);

  const countFrame = (event: string, raw: unknown) => {
    diag.socketMessages[event] = (diag.socketMessages[event] || 0) + 1;
    if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) diag.socketBytes += raw.byteLength;
  };

  function join(): void {
    const payload: Record<string, unknown> = {
      tournamentId: opts.tournamentId,
      roundId: opts.roundId,
      wireFormat: 'protobuf',
      snapshots: true,
    };
    if (opts.view) payload.view = opts.view;
    // The first roundStructureChanged after each (re)join is the baseline.
    sawBaseline = false;
    joinedKey = `${opts.tournamentId}:${opts.roundId}`;
    log(`[bw][overlay] joinRoundRoom tournamentId=${opts.tournamentId} roundId=${opts.roundId} view=${opts.view} wireFormat=protobuf`);
    sock.emit('joinRoundRoom', payload);
  }

  function leave(): void {
    if (!joinedKey) return;
    const [tournamentId, roundId] = joinedKey.split(':');
    log(`[bw][overlay] leaveRoundRoom tournamentId=${tournamentId} roundId=${roundId}`);
    try { sock.emit('leaveRoundRoom', { tournamentId, roundId }); } catch { /* already down */ }
    joinedKey = null;
  }

  const onConnect = () => {
    status.socketConnected = true;
    markRelaySuccess();
    // Room membership does NOT survive a reconnect (the relay has no
    // connectionStateRecovery) — always re-join.
    join();
    if (hasConnectedBefore) {
      status.reconnectCount++;
      // Live board re-hydrates from the join + an explicit snapshot ask;
      // overall standings have no socket hydration, so pull them over HTTP.
      if (viewNeedsMatchData(opts.view)) {
        status.awaitingSnapshot = true;
        snapshots.request('reconnect');
      }
      if (viewNeedsOverall(opts.view)) scheduleQuietRefetch();
    }
    hasConnectedBefore = true;
    changed();
  };
  const onDisconnect = () => {
    status.socketConnected = false;
    joinedKey = null;
    changed();
  };
  const onConnectError = () => {
    status.socketConnected = false;
    markRelayFailure();
    changed();
  };

  const markLive = () => {
    lastLiveMark = clock();
    status.lastLiveAt = lastLiveMark;
  };

  const onMatchBoundary = (previousMatchId: string | null, nextMatchId: unknown) => {
    dlog('match boundary', { previousMatchId, nextMatchId });
    bumpGeneration();
  };

  const onLiveMatchUpdate = (raw: unknown) => {
    countFrame('liveMatchUpdate', raw);
    const incoming = adapter.decodeLive(raw);
    if (!incoming) return;
    if (!isOurMatch(incoming, opts.followSelected, opts.matchId)) return;
    markLive();
    const r = adapter.applyLiveDelta(data, book, incoming);
    if (r.boundary) {
      onMatchBoundary(r.previousMatchId, incoming.matchId);
      snapshots.request('match boundary');
    }
    if (r.gap) {
      status.sequenceGapCount++;
      status.awaitingSnapshot = true;
      dlog('seq gap — requesting snapshot', { seq: incoming.seq, matchId: incoming.matchId });
      internalEvent('sequenceGap', { seq: incoming.seq }, `${incoming.seq}`);
      // What DID arrive is still merged (it is newer than what we hold); the
      // snapshot repairs whatever the lost delta(s) carried.
      snapshots.request('seq gap');
    }
    data = r.data;
    diag.deltasApplied++;
    changed();
  };

  const onLiveMatchSnapshot = (raw: unknown) => {
    countFrame('liveMatchSnapshot', raw);
    const incoming = adapter.decodeLive(raw);
    if (!incoming) return;
    if (!isOurMatch(incoming, opts.followSelected, opts.matchId)) return;
    markLive();
    const r = adapter.applyLiveSnapshot(data, book, incoming);
    if (r.skipped) {
      diag.snapshotsSkipped++;
      dlog('old snapshot skipped', { seq: incoming.seq, lastSeq: book.lastSeq });
      return;
    }
    if (r.boundary) onMatchBoundary(r.previousMatchId, incoming.matchId);
    data = r.data;
    status.lastSnapshotAt = clock();
    diag.snapshotsApplied++;
    if (status.awaitingSnapshot) {
      status.awaitingSnapshot = false;
      internalEvent('snapshotRecovery', { seq: incoming.seq }, `${incoming.seq}:${diag.snapshotsApplied}`);
    }
    changed();
  };

  const onOverallDataUpdate = (raw: unknown) => {
    countFrame('overallDataUpdate', raw);
    const incoming = adapter.decodeOverall(raw);
    if (!incoming) return;
    data = adapter.applyOverallDelta(data, incoming);
    changed();
  };

  const onRoundStructureChanged = (msg?: { roundId?: string; version?: number; publicRev?: number }) => {
    countFrame('roundStructureChanged', null);
    if (!msg || String(msg.roundId) !== opts.roundId) return;
    const pr = Number(msg.publicRev) || 0;
    if (pr > book.knownRev) book.knownRev = pr;
    status.publicRev = Math.max(status.publicRev, book.knownRev);
    const v = Number(msg.version) || 0;
    if (!sawBaseline) {
      sawBaseline = true;
      if (v > book.structureVersion) book.structureVersion = v;
      return;
    }
    if (v <= book.structureVersion) return;
    book.structureVersion = v;
    log(`[bw][overlay] roundStructureChanged version=${v} -> structural refetch`);
    bumpGeneration();
    scheduleQuietRefetch();
  };

  const onPublicDataInvalidated = (msg?: {
    roundId?: string; matchId?: string | null; scope?: string; rev?: number; reason?: string;
  }) => {
    countFrame('publicDataInvalidated', null);
    if (!msg || String(msg.roundId) !== opts.roundId) return;
    const rev = Number(msg.rev) || 0;
    if (rev <= book.knownRev) return;
    book.knownRev = rev;
    status.publicRev = Math.max(status.publicRev, rev);
    // A match-scoped invalidation for a DIFFERENT fixed match: record, don't refetch.
    if ((msg.scope === 'match' || msg.scope === 'exact')
      && !opts.followSelected && msg.matchId != null && String(msg.matchId) !== opts.matchId) {
      return;
    }
    log(`[bw][overlay] publicDataInvalidated rev=${rev} scope=${msg.scope} reason=${msg.reason} -> quiet refetch`);
    bumpGeneration();
    scheduleQuietRefetch();
  };

  const onRelayUpstreamStatus = (msg?: { roundId?: string; connected?: boolean }) => {
    countFrame('relayUpstreamStatus', null);
    if (!msg || String(msg.roundId) !== opts.roundId) return;
    const wasUp = status.upstreamConnected === true;
    status.upstreamConnected = msg.connected !== false;
    if (msg.connected === false) {
      // Only a drop AFTER it was up is an outage. A fresh round reports
      // `false` until the relay's cloud socket first connects, and that
      // first connect's join hydration already reaches this client.
      if (wasUp) upstreamWasDown = true;
      dlog('relay upstream down');
      changed();
      return;
    }
    if (upstreamWasDown) {
      upstreamWasDown = false;
      dlog('relay upstream restored — resyncing');
      bumpGeneration();
      scheduleQuietRefetch();
      if (viewNeedsMatchData(opts.view)) status.awaitingSnapshot = true;
      snapshots.request('relay upstream restored');
    }
    changed();
  };

  const handlers: Array<[string, (...a: any[]) => void]> = [
    ['connect', onConnect],
    ['disconnect', onDisconnect],
    ['connect_error', onConnectError],
    ['liveMatchUpdate', onLiveMatchUpdate],
    ['liveMatchSnapshot', onLiveMatchSnapshot],
    ['overallDataUpdate', onOverallDataUpdate],
    ['roundStructureChanged', onRoundStructureChanged],
    ['publicDataInvalidated', onPublicDataInvalidated],
    ['relayUpstreamStatus', onRelayUpstreamStatus],
  ];
  for (const [ev, fn] of handlers) sock.on(ev, fn);

  // ── timers ──────────────────────────────────────────────────────────────
  const stallTimer = setInterval(() => {
    if (!viewNeedsMatchData(opts.view) || !data.matchData || !sock.connected) return;
    if (clock() - lastLiveMark < LIVE_STALL_MS) return;
    lastLiveMark = clock(); // at most one ask per LIVE_STALL_MS
    snapshots.request('stall');
  }, STALL_CHECK_MS);

  const backstopTimer = setInterval(() => { fetchData(); }, BACKSTOP_POLL_MS);

  let lastPhaseKey = '';
  const housekeepingTimer = setInterval(() => {
    if (destroyed) return;
    refreshStatus();
    const key = `${status.phase}|${status.relayReachable}|${status.transport}`;
    if (key !== lastPhaseKey) {
      lastPhaseKey = key;
      changed();
    }
  }, HOUSEKEEPING_MS);

  for (const t of [stallTimer, backstopTimer, housekeepingTimer] as any[]) t?.unref?.();

  // ── start ───────────────────────────────────────────────────────────────
  current = buildState();
  if (sock.connected) onConnect();
  fetchData();

  // ── API ─────────────────────────────────────────────────────────────────
  const engine: OverlayEngine = {
    getState: () => current,

    subscribe(listener) {
      stateListeners.add(listener);
      try { listener(current); } catch (err) { console.error('[overlay-engine] listener threw:', err); }
      return () => { stateListeners.delete(listener); };
    },

    on(type, listener) {
      // First detected-type listener: re-seed the detectors from the current
      // state, so a late subscriber never gets a burst of stale "new" events.
      const detecting = () => eventListeners.has('*') || DETECTED_TYPES.some((t) => eventListeners.has(t));
      if (!detecting() && (type === '*' || DETECTED_TYPES.includes(type))) events.reset();
      let set = eventListeners.get(type);
      if (!set) { set = new Set(); eventListeners.set(type, set); }
      set.add(listener);
      return () => {
        const s = eventListeners.get(type);
        if (!s) return;
        s.delete(listener);
        if (s.size === 0) eventListeners.delete(type);
      };
    },

    requestSnapshot(reason = 'manual') {
      snapshots.request(reason);
    },

    refresh: () => fetchData(),

    hardReset() {
      if (destroyed) return;
      bumpGeneration();
      resetLive(book); // includes lastSeq — the old renderer's hardReset forgot it
      data = { ...data, matchData: null, overallData: null, deadTeamList: [] };
      status.error = null;
      status.awaitingSnapshot = false;
      events.reset();
      dlog('hard reset');
      changed();
      fetchData(); // quiet: no loading flash
    },

    update(patch) {
      if (destroyed) return;
      const next = resolveOptions({
        tournamentId: patch.tournamentId ?? opts.tournamentId,
        roundId: patch.roundId ?? opts.roundId,
        matchId: 'matchId' in patch ? patch.matchId : (opts.matchId === 'selected' ? null : opts.matchId),
        followSelected: patch.followSelected ?? opts.followSelected,
        view: 'view' in patch ? patch.view : opts.view,
        tag: 'tag' in patch ? patch.tag : opts.tag,
        verbose: patch.verbose ?? opts.verbose,
        debug: patch.debug ?? opts.debug,
      });
      const roundChanged = next.tournamentId !== opts.tournamentId || next.roundId !== opts.roundId;
      const viewChanged = next.view !== opts.view;
      const fetchChanged = roundChanged || viewChanged || next.matchId !== opts.matchId
        || next.followSelected !== opts.followSelected || next.tag !== opts.tag;
      if (roundChanged) leave();
      opts = next;
      if (roundChanged) {
        bumpGeneration();
        book = newLiveBook();
        data = emptyData();
        derived.reset();
        events.reset();
        firstFetchDone = false;
        upstreamWasDown = false;
        status.loading = true;
        status.error = null;
        status.upstreamConnected = null;
        status.awaitingSnapshot = false;
        status.publicRev = 0;
        snapshots.cancel();
        snapshots.reset();
      }
      if ((roundChanged || viewChanged) && sock.connected) join();
      if (fetchChanged) {
        changed();
        fetchData();
      }
    },

    diagnostics(): EngineDiagnostics {
      return {
        ...diag,
        socketMessages: { ...diag.socketMessages },
        events: { ...diag.events },
        cache: cache.getStats(),
        derived: derived.perf(),
      };
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearInterval(stallTimer);
      clearInterval(backstopTimer);
      clearInterval(housekeepingTimer);
      if (quietRefetchTimer) clearTimeout(quietRefetchTimer);
      snapshots.cancel();
      fetchAbort?.abort();
      leave();
      for (const [ev, fn] of handlers) sock.off(ev, fn);
      transport.release();
      stateListeners.clear();
      eventListeners.clear();
      cache.clear();
      status.phase = 'DESTROYED';
    },
  };
  return engine;
}
