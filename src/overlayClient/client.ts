// Framework-free live overlay feed for EXTERNAL, self-hosted overlays.
//
// Speaks exactly the same protocol the built-in overlay (PublicThemeRenderer)
// speaks against the local desktop relay (http://127.0.0.1:8787):
//   - HTTP  GET /api/public/bulk/...        MessagePack body (initial state)
//   - Socket.IO joinRoundRoom {wireFormat:'protobuf', snapshots:true}
//       liveMatchUpdate    protobuf delta   -> merged
//       liveMatchSnapshot  protobuf full    -> replaces
//       overallDataUpdate  protobuf delta   -> merged
//       roundStructureChanged / publicDataInvalidated -> quiet HTTP refetch
//       relayUpstreamStatus                  -> resync after a relay outage
// and runs the same decode / merge / elimination / derived-standings code
// the themes use (./wire, ./deadTeamList, dashboard/matchTeamMerge,
// Themes/shared/hooks/*), so an external overlay sees the same numbers.
//
// The orchestration below mirrors PublicThemeRenderer's socket + fetch
// effects one-for-one (seq gap -> requestLiveSnapshot, stall watchdog,
// publicRev gate, socket-owned roster, match boundary reset). Keep the two
// in step when either changes.

import { io, type Socket } from 'socket.io-client';
import { decode } from '@msgpack/msgpack';
import { overlay as overlayProto } from '../proto/overlay.pb';
import { mergeTeamsWithPlayers, normalizeMatchTeams, replaceTeamsPinningIds } from '../dashboard/matchTeamMerge.ts';
import { decodeWireMessage } from './wire.ts';
import {
  computeDeadTeamList,
  sortDeadTeamList,
  newDeathTracker,
  type DeadTeamListEntry,
  type DeathTracker,
} from './deadTeamList.ts';
import { deriveTeams, type PriorBaselineCache } from '../Themes/shared/hooks/unsortteams.ts';
import { buildOverallStandings, computeMatchStandings } from '../Themes/shared/hooks/officialStandings.ts';
import { computeMatchTotals } from '../Themes/shared/hooks/matchTotals.ts';

export const OVERLAY_API_VERSION = 1;
export const DEFAULT_RELAY_ORIGIN = 'http://127.0.0.1:8787';

// Same constants as PublicThemeRenderer.
const LIVE_STALL_MS = 30000;
const SNAPSHOT_MIN_INTERVAL_MS = 1000;
const QUIET_REFETCH_DEBOUNCE_MS = 250;
const BULK_TRANSIENT_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 5000];

export interface OverlayClientOptions {
  tournamentId: string;
  roundId: string;
  /** A fixed match. Omit (or pass followSelected) to follow the operator's live selection. */
  matchId?: string;
  /** Follow whichever match the operator has selected. Default: true when matchId is omitted. */
  followSelected?: boolean;
  /**
   * Optional built-in view name (e.g. 'LiveStats'). Omit for EVERYTHING —
   * full player fields, overall standings and every match's data. Passing a
   * view slims the payload to what that view needs.
   */
  view?: string | null;
  /** Relay origin. Default http://127.0.0.1:8787 (the desktop app's local relay). */
  origin?: string;
  debug?: boolean;
}

export interface OverlayStatus {
  /** Socket to the relay is up. */
  socketConnected: boolean;
  /** The relay's own cloud connection (null = not reported yet). */
  upstreamConnected: boolean | null;
  /** True until the first HTTP state has been applied. */
  loading: boolean;
  error: string | null;
  /** Epoch ms of the last applied change (HTTP or socket). */
  lastUpdateAt: number | null;
  /** Epoch ms of the last live socket payload. */
  lastLiveAt: number | null;
  /** Last live sequence number applied (0 = none yet). */
  seq: number;
  /** Highest Round.publicRev seen. */
  publicRev: number;
}

export interface OverlayState {
  apiVersion: number;
  status: OverlayStatus;
  tournament: any | null;
  round: any | null;
  match: any | null;
  matches: any[];
  /** Live, merged roster for the current match — same shape the built-in themes receive. */
  matchData: any | null;
  /** Elimination list, oldest first. */
  deadTeamList: DeadTeamListEntry[];
  overallData: any | null;
  matchDatas: any[];
  derived: {
    /** Teams + totalKills/aliveCount/isAllDead/isEliminationLocked/teamRank/totalPoints, ranked like LiveStats. */
    teams: any[];
    /** Same fields, ranked by this match's placePoints then kills. */
    liveTeams: any[];
    /** Round standings (rank, rankChange, wwcd, matchesPlayed, leadOverNext, total...). */
    overallStandings: any[];
    /** This match's standings with per-team totals. */
    matchStandings: any[];
    /** Match-wide totals (kills, damage, heals, longest kill...). */
    matchTotals: any | null;
  };
}

export type OverlayListener = (state: OverlayState) => void;

export interface OverlayFeed {
  /** Called immediately with the current state, then on every change. Returns an unsubscribe fn. */
  subscribe(listener: OverlayListener): () => void;
  getState(): OverlayState;
  /** Ask for a full authoritative live roster (rate-limited to 1/s). */
  requestSnapshot(): void;
  /** Re-pull the HTTP state now. */
  refresh(): Promise<void>;
  close(): void;
}

class HttpError extends Error {
  status: number;
  retryAfter: number | null;
  constructor(status: number, retryAfter: number | null) {
    super(`HTTP ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function connectOverlay(options: OverlayClientOptions): OverlayFeed {
  const { tournamentId, roundId } = options;
  if (!tournamentId || !roundId) throw new Error('connectOverlay: tournamentId and roundId are required');
  const matchId = options.matchId || 'selected';
  const followSelected = options.followSelected ?? !options.matchId;
  const view = options.view || null;
  const origin = (options.origin || DEFAULT_RELAY_ORIGIN).replace(/\/+$/, '');
  const dlog = (...args: any[]) => { if (options.debug) console.log('[overlay-client]', ...args); };

  // ── mutable feed state (the renderer's refs) ──────────────────────────────
  let closed = false;
  let tournament: any = null;
  let round: any = null;
  let match: any = null;
  let matches: any[] = [];
  let matchData: any = null;
  let deadTeamList: DeadTeamListEntry[] = [];
  let overallData: any = null;
  let matchDatas: any[] = [];
  const status: OverlayStatus = {
    socketConnected: false,
    upstreamConnected: null,
    loading: true,
    error: null,
    lastUpdateAt: null,
    lastLiveAt: null,
    seq: 0,
    publicRev: 0,
  };

  const deathTracker: { current: DeathTracker } = { current: newDeathTracker() };
  const baselineCache: PriorBaselineCache = new Map();
  let lastDeadTeamListLength = 0;
  let lastSeq = 0;
  let socketOwnedMatchId: string | null = null;
  let lastLiveAt = Date.now();
  let generation = 0;
  let knownRev = 0;
  let structureVersion = 0;
  let firstFetchDone = false;
  let hasConnectedBefore = false;
  let fetchAbort: AbortController | null = null;
  let quietRefetchTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSnapshotRequestAt = 0;

  // ── publishing ────────────────────────────────────────────────────────────
  const listeners = new Set<OverlayListener>();
  let current: OverlayState = buildState();
  let notifyQueued = false;

  function buildState(): OverlayState {
    const md = matchData as any;
    return {
      apiVersion: OVERLAY_API_VERSION,
      status: { ...status },
      tournament,
      round,
      match,
      matches,
      matchData,
      deadTeamList,
      overallData,
      matchDatas,
      derived: {
        teams: md ? deriveTeams(md, overallData, 'liveUntilDead', baselineCache) : [],
        liveTeams: md ? deriveTeams(md, overallData, 'live', baselineCache) : [],
        overallStandings: buildOverallStandings(matchDatas as any, overallData as any),
        matchStandings: md ? computeMatchStandings(md) : [],
        matchTotals: md ? computeMatchTotals(md) : null,
      },
    };
  }

  // A burst of socket chunks from one tick collapses into one publish.
  const changed = () => {
    status.lastUpdateAt = Date.now();
    if (notifyQueued || closed) return;
    notifyQueued = true;
    queueMicrotask(() => {
      notifyQueued = false;
      if (closed) return;
      current = buildState();
      for (const l of listeners) {
        try { l(current); } catch (err) { console.error('[overlay-client] listener threw:', err); }
      }
    });
  };

  // ── HTTP (initial / quiet refetch) ────────────────────────────────────────
  const bulkUrl = () => {
    const params = new URLSearchParams();
    if (view) params.set('view', view);
    if (followSelected) params.set('followSelected', 'true');
    const qs = params.toString();
    return `${origin}/api/public/bulk/${encodeURIComponent(tournamentId)}/${encodeURIComponent(roundId)}/${encodeURIComponent(matchId)}${qs ? `?${qs}` : ''}`;
  };

  const getBulk = async (signal: AbortSignal) => {
    const res = await fetch(bulkUrl(), { signal, cache: 'no-store' });
    if (!res.ok) {
      const ra = Number(res.headers.get('retry-after'));
      throw new HttpError(res.status, Number.isFinite(ra) && ra > 0 ? ra : null);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    // The bulk body is MessagePack; a backend without Redis serves JSON.
    const type = res.headers.get('content-type') || '';
    return type.includes('json') ? JSON.parse(new TextDecoder().decode(buf)) : decode(buf);
  };

  const isTransient = (err: any) => {
    if (!(err instanceof HttpError)) return true; // network error / relay down
    return err.status === 502 || err.status === 503 || err.status === 504;
  };

  const getBulkWithRetry = async (signal: AbortSignal) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await getBulk(signal);
      } catch (err: any) {
        if (signal.aborted || !isTransient(err)) throw err;
        const delayMs = err instanceof HttpError && err.retryAfter
          ? Math.min(err.retryAfter * 1000, 10000)
          : BULK_TRANSIENT_RETRY_DELAYS_MS[Math.min(attempt, BULK_TRANSIENT_RETRY_DELAYS_MS.length - 1)];
        dlog(`bulk fetch failed (${err?.status ?? 'network'}) — retrying in ${delayMs}ms`);
        await sleep(delayMs);
        if (signal.aborted) throw err;
      }
    }
  };

  const applyBulkPayload = (bulk: any, httpRev: number | null) => {
    tournament = bulk.tournamentData ?? null;
    round = bulk.roundData ?? null;
    match = bulk.matchesData?.current ?? null;
    matches = bulk.matchesData?.list ?? [];

    // An older HTTP body must NOT overwrite newer socket-merged live state.
    if (httpRev !== null && httpRev < knownRev) {
      dlog('stale bulk live slices skipped', { httpRev, knownRev });
      return;
    }

    const rawMatchData = bulk.currentMatchData?.matchData ?? null;
    const bulkMatchId = rawMatchData?.matchId != null ? String(rawMatchData.matchId) : null;
    const liveOwnedBySocket =
      bulkMatchId != null &&
      socketOwnedMatchId === bulkMatchId &&
      matchData != null &&
      String(matchData.matchId) === bulkMatchId;
    if (!liveOwnedBySocket) {
      const initial = rawMatchData ? { ...rawMatchData, teams: normalizeMatchTeams(rawMatchData.teams) } : null;
      const computed = computeDeadTeamList(initial?.matchId, initial?.teams, deathTracker);
      matchData = initial ? { ...initial, deadTeamList: computed } : null;
      lastDeadTeamListLength = computed.length;
      deadTeamList = sortDeadTeamList(computed);
    }

    const rawOverall = bulk.overallData ?? null;
    overallData = rawOverall ? { ...rawOverall, teams: normalizeMatchTeams(rawOverall.teams) } : null;
    matchDatas = (bulk.matchDatasData ?? []).map((e: any) => e.matchData).filter(Boolean);

    if (httpRev !== null) status.publicRev = Math.max(status.publicRev, httpRev);
  };

  const fetchData = async () => {
    if (closed) return;
    fetchAbort?.abort();
    const controller = new AbortController();
    fetchAbort = controller;
    const generationAtStart = generation;
    const isFirst = !firstFetchDone;
    try {
      const bulk: any = isFirst ? await getBulkWithRetry(controller.signal) : await getBulk(controller.signal);
      if (closed || controller.signal.aborted) return;
      // Invalidated mid-flight: this body predates the new truth.
      if (generationAtStart !== generation) {
        dlog('stale request dropped');
        return;
      }
      applyBulkPayload(bulk, Number(bulk?.roundData?.publicRev) || 0);
      status.error = null;
      firstFetchDone = true;
      status.loading = false;
      changed();
    } catch (err: any) {
      if (controller.signal.aborted || closed) return;
      console.error('[overlay-client] failed to fetch data:', err);
      if (isFirst) {
        status.error = err instanceof HttpError && err.status === 404
          ? 'Not found — check tournamentId / roundId'
          : 'Failed to load tournament data';
        status.loading = false;
        changed();
      }
    }
  };

  const scheduleQuietRefetch = () => {
    if (quietRefetchTimer) clearTimeout(quietRefetchTimer);
    quietRefetchTimer = setTimeout(() => {
      quietRefetchTimer = null;
      fetchData();
    }, QUIET_REFETCH_DEBOUNCE_MS);
  };

  // ── socket ────────────────────────────────────────────────────────────────
  const socket: Socket = io(origin, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2000,
    query: { client: 'overlay' },
  });

  const requestLiveSnapshot = (reason: string) => {
    const now = Date.now();
    if (now - lastSnapshotRequestAt < SNAPSHOT_MIN_INTERVAL_MS) return;
    lastSnapshotRequestAt = now;
    dlog('request snapshot', { reason });
    socket.emit('requestLiveSnapshot', { tournamentId, roundId });
  };

  const resetForNewMatch = () => {
    generation += 1;
    knownRev = 0;
    deathTracker.current = newDeathTracker();
    lastDeadTeamListLength = 0;
    lastSeq = 0;
    status.seq = 0;
  };

  const markLive = () => {
    lastLiveAt = Date.now();
    status.lastLiveAt = lastLiveAt;
  };

  const setDeadList = (computed: DeadTeamListEntry[]) => {
    if (computed.length !== lastDeadTeamListLength) {
      lastDeadTeamListLength = computed.length;
      deadTeamList = sortDeadTeamList(computed);
    }
  };

  const handleLiveMatchUpdate = (raw: ArrayBuffer | Uint8Array) => {
    const incoming = decodeWireMessage(raw, overlayProto.MatchDataPayload);
    if (!incoming) return;
    if (!(followSelected || String(incoming.matchId) === String(matchId))) return;
    markLive();

    const incomingTeams: any[] = Array.isArray(incoming.teams) ? incoming.teams : [];
    const prev = matchData;
    const previousMatchId = prev?.matchId;
    const sameMatch = previousMatchId != null && String(previousMatchId) === String(incoming.matchId);

    if (previousMatchId != null && !sameMatch) {
      dlog('match boundary', { previousMatchId, incomingMatchId: incoming.matchId });
      resetForNewMatch();
      requestLiveSnapshot('match boundary');
    }

    const incomingSeq = typeof incoming.seq === 'number' ? incoming.seq : null;
    if (incomingSeq != null) {
      if (lastSeq > 0 && incomingSeq > lastSeq + 1) {
        dlog('seq gap', { lastSeq, incomingSeq });
        requestLiveSnapshot('seq gap');
      }
      if (incomingSeq > lastSeq) lastSeq = incomingSeq;
      status.seq = lastSeq;
    }

    const mergedTeams = mergeTeamsWithPlayers(sameMatch ? prev?.teams || [] : [], incomingTeams);
    // Re-check only the teams in this delta, against their FULL merged roster.
    const changedKeys = new Set(incomingTeams.map((t) => String(t.teamId ?? t._id)));
    const computed = computeDeadTeamList(
      incoming.matchId,
      mergedTeams.filter((t) => changedKeys.has(String(t.teamId ?? t._id))),
      deathTracker
    );
    matchData = sameMatch
      ? { ...prev, ...incoming, teams: mergedTeams, deadTeamList: computed }
      : { ...incoming, teams: mergedTeams, deadTeamList: computed };
    socketOwnedMatchId = String(incoming.matchId);
    setDeadList(computed);
    changed();
  };

  const handleLiveMatchSnapshot = (raw: ArrayBuffer | Uint8Array) => {
    const incoming = decodeWireMessage(raw, overlayProto.MatchDataPayload);
    if (!incoming) return;
    if (!(followSelected || String(incoming.matchId) === String(matchId))) return;
    markLive();

    const prev = matchData;
    const previousMatchId = prev?.matchId;
    const sameMatch = previousMatchId != null && String(previousMatchId) === String(incoming.matchId);
    const incomingSeq = typeof incoming.seq === 'number' ? incoming.seq : null;

    // Older than deltas already applied (e.g. the relay's cached copy) — skip.
    if (sameMatch && incomingSeq != null && incomingSeq < lastSeq) {
      dlog('old snapshot skipped', { incomingSeq, lastSeq });
      return;
    }
    if (previousMatchId != null && !sameMatch) resetForNewMatch();
    if (incomingSeq != null && incomingSeq > lastSeq) lastSeq = incomingSeq;
    status.seq = lastSeq;

    const teams = replaceTeamsPinningIds(sameMatch ? prev?.teams || [] : [], incoming.teams || []);
    // Every team, not just changed ones: this is where a lost final death delta is caught.
    const computed = computeDeadTeamList(incoming.matchId, teams, deathTracker);
    matchData = sameMatch
      ? { ...prev, ...incoming, teams, deadTeamList: computed }
      : { ...incoming, teams, deadTeamList: computed };
    socketOwnedMatchId = String(incoming.matchId);
    setDeadList(computed);
    changed();
  };

  const handleOverallDataUpdate = (raw: ArrayBuffer | Uint8Array) => {
    const incoming = decodeWireMessage(raw, overlayProto.OverallDataPayload);
    if (!incoming) return;
    const incomingTeams: any[] = Array.isArray(incoming.teams) ? incoming.teams : [];
    // Keyed on roundId — overall standings span the whole round.
    const prevTeams: any[] =
      overallData && String(overallData.roundId) === String(incoming.roundId) ? overallData.teams || [] : [];
    overallData = { ...(overallData || {}), ...incoming, teams: mergeTeamsWithPlayers(prevTeams, incomingTeams) };
    changed();
  };

  // The first roundStructureChanged after each (re)join is the baseline.
  let sawBaseline = false;
  const handleRoundStructureChanged = (msg?: { roundId?: string; version?: number; publicRev?: number }) => {
    if (!msg || String(msg.roundId) !== String(roundId)) return;
    const pr = Number(msg.publicRev) || 0;
    if (pr > knownRev) knownRev = pr;
    status.publicRev = Math.max(status.publicRev, knownRev);
    const v = Number(msg.version) || 0;
    if (!sawBaseline) {
      sawBaseline = true;
      if (v > structureVersion) structureVersion = v;
      return;
    }
    if (v <= structureVersion) return;
    structureVersion = v;
    dlog('roundStructureChanged -> refetch', { v });
    generation += 1;
    scheduleQuietRefetch();
  };

  const handlePublicDataInvalidated = (msg?: {
    roundId?: string; matchId?: string | null; scope?: string; rev?: number; reason?: string;
  }) => {
    if (!msg || String(msg.roundId) !== String(roundId)) return;
    const rev = Number(msg.rev) || 0;
    if (rev <= knownRev) return;
    knownRev = rev;
    status.publicRev = Math.max(status.publicRev, rev);
    if ((msg.scope === 'match' || msg.scope === 'exact')
      && !followSelected && msg.matchId != null && String(msg.matchId) !== String(matchId)) {
      return;
    }
    dlog('publicDataInvalidated -> refetch', msg);
    generation += 1;
    scheduleQuietRefetch();
  };

  let upstreamWasDown = false;
  const handleRelayUpstreamStatus = (msg?: { roundId?: string; connected?: boolean }) => {
    if (!msg || String(msg.roundId) !== String(roundId)) return;
    status.upstreamConnected = msg.connected !== false;
    if (msg.connected === false) {
      upstreamWasDown = true;
      changed();
      return;
    }
    if (upstreamWasDown) {
      upstreamWasDown = false;
      dlog('relay upstream restored — resyncing');
      generation += 1;
      scheduleQuietRefetch();
      requestLiveSnapshot('relay upstream restored');
    }
    changed();
  };

  socket.on('connect', () => {
    status.socketConnected = true;
    // Room membership does not survive a reconnect — always re-join.
    sawBaseline = false;
    socket.emit('joinRoundRoom', {
      tournamentId,
      roundId,
      ...(view ? { view } : {}),
      wireFormat: 'protobuf',
      snapshots: true,
    });
    // The live board re-hydrates from the join; overall standings have no
    // socket hydration, so pull them over HTTP after a REconnect.
    if (hasConnectedBefore) scheduleQuietRefetch();
    hasConnectedBefore = true;
    changed();
  });
  socket.on('disconnect', () => { status.socketConnected = false; changed(); });
  socket.on('connect_error', () => { status.socketConnected = false; changed(); });
  socket.on('liveMatchUpdate', handleLiveMatchUpdate);
  socket.on('liveMatchSnapshot', handleLiveMatchSnapshot);
  socket.on('overallDataUpdate', handleOverallDataUpdate);
  socket.on('roundStructureChanged', handleRoundStructureChanged);
  socket.on('publicDataInvalidated', handlePublicDataInvalidated);
  socket.on('relayUpstreamStatus', handleRelayUpstreamStatus);

  // Stall watchdog: if the last delta of a burst was lost and the match goes
  // quiet, no keyframe would ever come.
  const stallTimer = setInterval(() => {
    if (!matchData) return;
    if (Date.now() - lastLiveAt < LIVE_STALL_MS) return;
    lastLiveAt = Date.now(); // at most one ask per LIVE_STALL_MS
    requestLiveSnapshot('stall');
  }, 5000);

  fetchData();

  return {
    subscribe(listener) {
      listeners.add(listener);
      try { listener(current); } catch (err) { console.error('[overlay-client] listener threw:', err); }
      return () => { listeners.delete(listener); };
    },
    getState: () => current,
    requestSnapshot: () => requestLiveSnapshot('manual'),
    refresh: () => fetchData(),
    close() {
      if (closed) return;
      closed = true;
      clearInterval(stallTimer);
      if (quietRefetchTimer) clearTimeout(quietRefetchTimer);
      fetchAbort?.abort();
      try { socket.emit('leaveRoundRoom', { tournamentId, roundId }); } catch { /* already down */ }
      socket.close();
      listeners.clear();
    },
  };
}
