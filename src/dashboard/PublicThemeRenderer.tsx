import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { decode } from '@msgpack/msgpack';
import { overlay as overlayProto } from '../proto/overlay.pb';
import api from '../login/api.tsx';
import SocketManager from '../dashboard/socketManager.tsx';
import { readCachedBulk, writeCachedBulk } from './publicCache.ts';
import { remapProtoTeam, mergeTeamsWithPlayers } from './matchTeamMerge.ts';

/* ============================================================================
   THEME COMPONENT REGISTRY
   ============================================================================
   This used to be ~150 individual `import X from '../Themes/ThemeN/.../Y.tsx'`
   lines plus a hand-written `themes` object repeating every key per theme.
   That listing silently going stale (an object claiming a key the folder
   doesn't have) is exactly what caused the "Element type is invalid" crash —
   Theme3/Theme1 etc. had no Achive/LiveData component but the switch
   statement rendered them unconditionally.

   Instead: require.context walks every file under Themes/ once at build
   time and the registry is built from whatever actually exists on disk.
   Add a new theme folder or a new view file and it's live automatically —
   no import line, no object entry to remember to add.

   NOTE: require.context is a webpack build-time macro (this project builds
   with CRA/webpack — see the bundle.js path in your dev server errors). If
   this project ever moves to Vite, this block needs to be replaced with
   Vite's equivalent eager import.meta.glob call instead.
   ============================================================================ */

// @ts-ignore -- require.context is injected by webpack, not a real Node API
const themeFiles = (require as any).context(
  '../Themes',
  true,
  /\/(on-screen|off-screen)\/.+\.tsx$/
);

// File names on disk don't always match the canonical view key used
// elsewhere in the app (query params, DisplayHud tile keys, etc). This is
// the one place that mapping lives — everything else works off lowercase
// comparisons so casing differences (OverAllData.tsx vs "OverallData")
// never matter on their own.
const KEY_ALIASES: Record<string, string> = {
  '1strunnerup': 'firstrunnerup',   // 1stRunnerUp.tsx
  '2ndrunnerup': 'secondrunnerup',  // 2ndRunnerUp.tsx
  achieve: 'achive',                // Achieve.tsx -> view=Achive (URL back-compat)
};

const canonicalize = (fileBase: string): string => {
  const lower = fileBase.toLowerCase();
  return KEY_ALIASES[lower] || lower;
};

type ComponentRegistry = Record<string, Record<string, React.ComponentType<any>>>;

function buildRegistry(): ComponentRegistry {
  const registry: ComponentRegistry = {};
  themeFiles.keys().forEach((path: string) => {
    // path shape: "./Theme1/on-screen/Lower.tsx"
    const match = path.match(/^\.\/(Theme\d+)\/(?:on-screen|off-screen)\/(.+)\.tsx$/);
    if (!match) return;
    const [, themeName, fileBase] = match;
    const mod = themeFiles(path);
    const Component = mod?.default;
    if (!Component) return; // no default export — skip rather than register `undefined`
    registry[themeName] ||= {};
    registry[themeName][canonicalize(fileBase)] = Component;
  });
  return registry;
}

const THEME_REGISTRY = buildRegistry();
const AVAILABLE_THEMES = Object.keys(THEME_REGISTRY);

// A few views were never given their own file per theme and instead
// deliberately reused another component (Theme1's "Mvp" view just showed
// MatchFragrs) or another theme's file entirely (Theme1/Theme3's
// RosterShowCase view always rendered Theme4's component, because no
// Theme1/off-screen/RosterShowCase.tsx or Theme3 equivalent exists on
// disk). Preserved explicitly here since a folder scan alone can't infer
// "reuse this other thing" — everything else is fully automatic.
const FALLBACKS: Record<string, { sameTheme?: string; theme?: string; key?: string }> = {
  mvp: { sameTheme: 'matchfragrs' },
  highlightpoints: { sameTheme: 'overalldata' },
  highlightschedule: { sameTheme: 'schedule' },
  rostershowcase: { theme: 'Theme4', key: 'rostershowcase' },
};

function resolveComponent(theme: string, rawKey: string): React.ComponentType<any> | null {
  const key = rawKey.toLowerCase();
  const themeSet = THEME_REGISTRY[theme] || THEME_REGISTRY['Theme1'];

  if (themeSet?.[key]) return themeSet[key];

  const fb = FALLBACKS[key];
  if (fb?.sameTheme && themeSet?.[fb.sameTheme]) return themeSet[fb.sameTheme];
  if (fb?.theme && fb?.key) return THEME_REGISTRY[fb.theme]?.[fb.key] || null;

  return null;
}

// ============================================================================
// Types
// ============================================================================
interface Tournament {
  _id: string;
  tournamentName: string;
  torLogo?: string;
  day?: string;
  primaryColor?: string;
  secondaryColor?: string;
  overlayBg?: string;
}

interface Round {
  _id: string;
  roundName: string;
  apiEnable?: boolean;
  day: string;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
  groups?: string[];
}

interface MatchData {
  _id: string;
  matchId: string;
  userId: string;
  teams: any[];
  deadTeamList?: DeadTeamListEntry[];
}

interface OverallData {
  tournamentId: string;
  roundId: string;
  userId: string;
  teams: any[];
  createdAt: string;
}

interface BackpackInfo {
  userId: string;
  tournamentId: string;
  roundId: string;
  matchId: string;
  matchDataId: string;
  teambackpackinfo: {
    TeamBackPackList: any[];
  };
}

// Shape of each entry in the client-side-computed elimination list — see
// isTeamAllDead/computeDeadTeamList below. No longer sourced from the
// backend's matchData.deadTeamList field.
interface DeadTeamListEntry {
  teamId: string;
  teamTag: string;
  teamName: string;
  teamLogo: string;
  placePoints: number;
  rank: number | null;
  totalKills: number;
  deadAt: string;
}

const VIEWS_NEEDING_BACKPACK = new Set(['Upper']);

// Mirrors buildBulkPayload's view -> data-requirement tables
// (Bulkpublic.controller.js) — kept in sync manually, same convention as
// VIEWS_NEEDING_BACKPACK above. Used only to decide whether a cache seed
// that's missing the LIVE tier (matchDatasData/currentMatchData/overallData/
// matchesData.current) is actually usable for the current view, or whether
// it should be treated as incomplete instead of painted as final — see
// liveTierUsable below.
const VIEWS_NEEDING_OVERALL = new Set([
  'OverAllData', 'OverallFrags', 'LiveStats', '1stRunnerUp', '2ndRunnerUp', 'EventMvp', 'highlightPoints',
  'Champions',
]);
const VIEWS_NEEDING_MATCH_DATA = new Set([
  'Upper', 'Dom', 'Alerts', 'LiveStats', 'LiveFrags', 'MatchData', 'Achive', 'MatchFragrs',
  'WwcdSummary', 'WwcdStats', 'playerH2H', 'mapPreview', 'slots', 'TeamH2H', 'mvp',
  'RosterShowCase', 'MatchSummary', 'Champions', '1stRunnerUp', '2ndRunnerUp', 'EventMvp',
  'PlayerSwitch', 'LiveData', 'Recall',
]);
const VIEWS_NEEDING_ALL_MATCH_DATAS = new Set([
  'Schedule', 'highlightPoints', 'HighlightSchedule', 'OverAllData', 'OverallFrags',
  'EventMvp', 'Champions', '1stRunnerUp', '2ndRunnerUp', 'Achive',
]);

const viewNeedsLiveTier = (view: string) =>
  VIEWS_NEEDING_OVERALL.has(view) || VIEWS_NEEDING_MATCH_DATA.has(view) || VIEWS_NEEDING_ALL_MATCH_DATAS.has(view);

const PLACEHOLDER_STYLE: React.CSSProperties = {
  width: '100%',
  height: '100%',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '24px',
};

// Consumers (Alerts, in particular) build their elimination-alert queue by
// walking this array in order, so it must always be in actual death order —
// oldest elimination first — no matter what order the backend happened to
// return entries in, or what order a burst of socket updates lands in.
//
// Ordering rules, in priority order:
//   1. deadAt ascending — the team eliminated earlier (e.g. 3:45) sorts
//      before the team eliminated later (e.g. 3:55).
//   2. rank descending, used only when deadAt is missing on one/both sides
//      or two entries land on the exact same timestamp — a HIGHER rank
//      number is a WORSE placement, and in a battle royale a worse
//      placement always means that team went out earlier. So rank 10
//      sorts before rank 9.
const sortDeadTeamList = (list?: DeadTeamListEntry[] | null): DeadTeamListEntry[] => {
  if (!list || list.length === 0) return [];
  return [...list].sort((a, b) => {
    const aTime = a.deadAt ? new Date(a.deadAt).getTime() : NaN;
    const bTime = b.deadAt ? new Date(b.deadAt).getTime() : NaN;
    const aValid = !Number.isNaN(aTime);
    const bValid = !Number.isNaN(bTime);

    // Both have real timestamps and they differ: earlier time wins outright.
    if (aValid && bValid && aTime !== bTime) return aTime - bTime;
    // Only one side has a usable timestamp: prefer the one that does.
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;

    // Same timestamp (or neither has one): fall back to rank, worst-first.
    return (b.rank ?? 0) - (a.rank ?? 0);
  });
};

// ============================================================================
// Client-side team-elimination detection
// ============================================================================
// A team only counts as eliminated once every player actually reported live
// this tick has either liveState === 5 or bHasDied === true — matchData no
// longer pads teams with unobserved roster players, so `team.players` here
// is exactly who the API reported. `length > 0` guards a team with no live
// players yet (nothing to conclude from), and also means a short/partial
// player list (a player's data not having arrived yet this tick) is never
// mistaken for a wipe once that player's entry does arrive.
const isTeamAllDead = (team: any): boolean => {
  if (!Array.isArray(team.players)) return false;

  return (
    team.players.length > 0 &&
    team.players.every(
      (p: any) => p.liveState === 5 || p.bHasDied === true
    )
  );
};

interface DeadTeamSnapshot {
  teamId: any;
  teamTag: string;
  teamName: string;
  teamLogo: string;
  placePoints: number;
  rank: number | null;
  totalKills: number;
  deadAt: number; // epoch ms
}

// Persists across ticks (held in a ref) so a team's elimination
// timestamp/locked stats are stamped ONCE, the first tick it's confirmed
// dead — not recomputed (and drifting) on every subsequent tick, matching
// what unsortteams.ts expects ("locked" points that stop changing after
// death). Scoped per-match: `matchId` mismatch wipes the tracker so a
// match switch (followSelected) never carries over a previous match's
// dead teams.
interface DeathTracker {
  matchId: string | null;
  dead: Map<string, DeadTeamSnapshot>;
}

const computeDeadTeamList = (
  matchId: string | null | undefined,
  teams: any[] | undefined,
  trackerRef: React.MutableRefObject<DeathTracker>
): DeadTeamListEntry[] => {
  if (trackerRef.current.matchId !== (matchId ?? null)) {
    trackerRef.current = { matchId: matchId ?? null, dead: new Map() };
  }
  const { dead } = trackerRef.current;

  if (Array.isArray(teams)) {
    for (const team of teams) {
      const teamKey = String(team.teamId ?? team._id ?? '');
      if (!teamKey || dead.has(teamKey)) continue;
      if (isTeamAllDead(team)) {
        const totalKills = (team.players || []).reduce((sum: number, p: any) => sum + (p.killNum || 0), 0);
        dead.set(teamKey, {
          teamId: team.teamId ?? team._id,
          teamTag: team.teamTag,
          teamName: team.teamName,
          teamLogo: team.teamLogo,
          placePoints: team.placePoints,
          rank: team.rank ?? null,
          totalKills,
          deadAt: Date.now(),
        });
      }
    }
  }

  return Array.from(dead.values()).map((snap) => ({
    ...snap,
    deadAt: new Date(snap.deadAt).toISOString(),
  }));
};

// ============================================================================
// Protobuf decode support (bandwidth: round:${id}:${id}:matchData/overall
// rooms now negotiate protobuf per-socket — see socketManager.tsx's
// wireFormat query param and joinRoundRoom below).
// ============================================================================
// Backend (protobufCodec.js) prefixes every protobuf payload with this byte
// so the client can tell it apart from a plain msgpack payload arriving on
// the SAME event name from the user:${userId} room (a socket can be in both
// rooms at once, e.g. an operator viewing the overlay in their own logged-in
// tab) — 0xC1 is formally reserved/"never used" by the msgpack spec, so no
// genuine msgpack stream this codebase produces can ever start with it.
const PROTOBUF_MARKER_BYTE = 0xc1;

// decodeWireMessage(raw, overlayProto.MatchDataPayload) /
// decodeWireMessage(raw, overlayProto.OverallDataPayload) — each event
// handler knows its own message type, so the type is passed in rather than
// inferred (protobuf bytes carry no self-describing type tag the way
// msgpack's leading byte does).
const decodeWireMessage = (raw: unknown, ProtoType: any): any => {
  if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
    const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw;
    if (bytes.length > 0 && bytes[0] === PROTOBUF_MARKER_BYTE) {
      try {
        const decoded = ProtoType.decode(bytes.subarray(1));
        const obj: any = ProtoType.toObject(decoded, { defaults: true, longs: String });
        if (Array.isArray(obj.teams)) obj.teams = obj.teams.map(remapProtoTeam);
        return obj;
      } catch (err) {
        console.error('[bw][PublicThemeRenderer] protobuf decode failed:', err, bytes);
        return null;
      }
    }
    // Not protobuf-marked -> msgpack, either because this socket hasn't
    // negotiated protobuf for this room yet, or because it's arriving via
    // the user:${userId} room's separately-negotiated msgpack path.
    try {
      return decode(bytes);
    } catch (err) {
      console.error('[bw][PublicThemeRenderer] msgpack decode failed:', err, bytes);
      return null;
    }
  }
  return raw;
};

const PublicThemeRenderer: React.FC = () => {
  // Module-level cache shared across all mounts of this component in the
  // current tab session — survives view switches and re-mounts, cleared
  // only on a hard page reload.
  const cacheRef = useRef<Map<string, any>>((PublicThemeRenderer as any)._cache ||= new Map());

  // Backs computeDeadTeamList — see its comment above.
  const deathTrackerRef = useRef<DeathTracker>({ matchId: null, dead: new Map() });

  // computeDeadTeamList's backing Map only ever grows (an entry, once
  // recorded, is never re-mutated — see its comment above), so the dead
  // team list only actually CHANGES when its length changes. Tracking that
  // lets the socket handler below skip sortDeadTeamList's copy+sort and the
  // setDeadTeamList render on the vast majority of ticks where no team
  // newly died.
  const lastDeadTeamListLengthRef = useRef<number>(0);

  // Mirrors the latest matchData outside of React's state so a burst of
  // several chunk-carrying liveMatchUpdate pushes (see below) can merge each
  // one against the truly-latest teams array, not a stale snapshot from
  // before an earlier chunk in the same burst was applied — setState's
  // result isn't readable synchronously, but this ref is.
  const matchDataRef = useRef<MatchData | null>(null);

  // Mirrors matchDataRef, same reason: overallDataUpdate is now a team-level
  // delta (backend: pubgApiMatchData.controller.js's emitOverallUpdate), so
  // the socket handler needs the truly-latest standings to merge each
  // incoming chunk against, not a stale snapshot from before React applied
  // an earlier setOverallData in the same burst.
  const overallDataRef = useRef<OverallData | null>(null);

  // Tracks whether the fetch effect below has completed its first real run
  // for this mount, so its setLoading(true)/setError(...) can only ever
  // happen on that very first run — every later run (a view/theme switch,
  // a match/followSelected change, the background poll, a reconnect
  // catch-up) fetches quietly and only ever touches the screen once new
  // data is fully ready, via setDisplayedView/setDisplayedTheme. Only ever
  // consumed (set false) from inside fetchData's `finally`, gated on
  // `!cancelled` — see that function's comments for why it must not be
  // consumed any earlier (React 18 StrictMode double-invokes this effect
  // on mount).
  const firstFetchRef = useRef(true);
  // Holds the latest fetchData (defined further below) so the reconnect
  // effect can trigger a quiet refetch without becoming a dependency of
  // the data-fetch effect itself.
  const fetchDataRef = useRef<(() => Promise<void>) | null>(null);
  // Skips the reconnect-refetch on the very first "connected" transition
  // (the initial mount connect) — that case is already covered by the
  // data-fetch effect's own mount-time fetchData() call.
  const isFirstConnectRef = useRef(true);

  const cachedGet = async (url: string, signal: AbortSignal, ttlMs = 5000) => {
    const cache = cacheRef.current;
    const hit = cache.get(url);
    if (hit && Date.now() - hit.time < ttlMs) {
      return hit.response;
    }
    const response = await api.get(url, { signal });
    cache.set(url, { response, time: Date.now() });
    return response;
  };

  // The bulk endpoint now responds with a MessagePack-encoded body
  // (backend: msgpackCacheMiddleware in middleware/cache.js), so it needs
  // its own fetch that asks axios for a raw arraybuffer and decodes it,
  // rather than letting axios auto-parse as JSON. Caches the decoded plain
  // object, same as cachedGet does for its response, so repeated calls
  // within ttlMs don't re-decode.
  const cachedGetMsgpack = async (url: string, signal: AbortSignal, ttlMs = 5000) => {
    const cache = cacheRef.current;
    const hit = cache.get(url);
    if (hit && Date.now() - hit.time < ttlMs) {
      return hit.data;
    }
    const response = await api.get(url, { signal, responseType: 'arraybuffer' });
    const data = decode(new Uint8Array(response.data)) as any;
    cache.set(url, { data, time: Date.now() });
    return data;
  };

  const { tournamentId, roundId, matchId } = useParams<{
    tournamentId: string;
    roundId: string;
    matchId: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTheme = searchParams.get('theme') || 'Theme1';
  const view = searchParams.get('view') || 'Lower';
  const followSelected = (searchParams.get('followSelected') || 'false').toLowerCase() === 'true';
  const selectedScheduleMatchIds = searchParams.get('scheduleMatches')?.split(',') || [];

  // Silently fall back to Theme1 for an unknown/unbuilt theme (e.g. a stale
  // ?theme=Theme2 link) rather than rendering nothing.
  const theme = AVAILABLE_THEMES.includes(requestedTheme) ? requestedTheme : 'Theme1';

  // What's actually rendered right now — deliberately decoupled from the
  // `view`/`theme` TARGET above. A plain ?view=/&theme= link change moves
  // the target instantly, but this only follows once the matching
  // fetch below has the new view's data fully in hand (see the fetch
  // effect's setDisplayedView/setDisplayedTheme calls) — that's what stops
  // a switch from ever showing a blank/loading frame or a wrong-shaped
  // render: the old view/data stays on screen, unchanged, until the new
  // one is completely ready, then both flip together in a single render.
  const [displayedView, setDisplayedView] = useState(view);
  const [displayedTheme, setDisplayedTheme] = useState(theme);
  const getComp = (key: string) => resolveComponent(displayedTheme, key);

  // Read once, synchronously, on mount — the lazy-initializer form runs
  // exactly once and never again on re-render, so this never re-reads/
  // re-parses localStorage on a socket-driven tick. Survives a hard OBS
  // browser-source refresh (unlike the in-memory cacheRef below), letting
  // the view paint immediately from last-known data instead of a blank
  // frame while the real fetch (always run regardless, see below) resolves.
  const [initialCache] = useState(() => {
    const cached = tournamentId && roundId
      ? readCachedBulk(tournamentId, roundId, matchId, view, followSelected)
      : null;
    // Prime matchDataRef too, not just matchData state — the socket
    // handler below merges incoming chunks against matchDataRef.current,
    // and if it stayed null a socket tick arriving before the first real
    // fetch resolves would merge against an empty team list, making the
    // just-painted cached teams disappear instead of merely being briefly
    // stale. Safe here since this initializer runs exactly once, on mount.
    if (cached?.bulk?.currentMatchData?.matchData) {
      matchDataRef.current = cached.bulk.currentMatchData.matchData;
    }
    if (cached?.bulk?.overallData) {
      overallDataRef.current = cached.bulk.overallData;
    }
    return cached;
  });
  const initialBulk = initialCache?.bulk ?? null;

  // A static-only cache hit (live tier expired/missing) still returns a
  // non-null result, but with matchDatasData/currentMatchData/overallData/
  // matchesData.current all defaulted to null/[] — NOT a real "nothing
  // changed since last time", just a gap in what's cached. Painting that as
  // final for a view that actually reads those fields is what produced the
  // "previous match info disappeared" flash reported on Schedule/
  // HighlightSchedule/MatchSummary: treat it as incomplete instead and keep
  // the normal loading state until the real fetch fills it in.
  const liveTierUsable = !initialCache || initialCache.liveHit || !viewNeedsLiveTier(view);

  const [tournament, setTournament] = useState<Tournament | null>(() => initialBulk?.tournamentData ?? null);
  const [round, setRound] = useState<Round | null>(() => initialBulk?.roundData ?? null);
  const [match, setMatch] = useState<Match | null>(() => initialBulk?.matchesData?.current ?? null);
  const [matchData, setMatchData] = useState<MatchData | null>(() => initialBulk?.currentMatchData?.matchData ?? null);
  // Not seeded from cache: elimination banners must never show a stale
  // "already eliminated" state from an old cached tick — it starts empty
  // and fills in correctly the moment the real fetch/socket data arrives.
  const [deadTeamList, setDeadTeamList] = useState<DeadTeamListEntry[]>([]);
  const [overallData, setOverallData] = useState<OverallData | null>(() => initialBulk?.overallData ?? null);
  const [matches, setMatches] = useState<Match[]>(() => initialBulk?.matchesData?.list ?? []);
  const [matchDatas, setMatchDatas] = useState<MatchData[]>(() =>
    (initialBulk?.matchDatasData ?? []).map((entry: any) => entry.matchData).filter(Boolean)
  );
  // Not seeded from cache: Upper-only, fetched separately keyed off a
  // matchDataId that only exists after the real fetch resolves.
  const [backpackInfo, setBackpackInfo] = useState<BackpackInfo | null>(null);
  const [loading, setLoading] = useState(() => !initialCache || !liveTierUsable);
  const [error, setError] = useState<string | null>(null);
  // Tracks the socket's real wire state so the room-join effect below can
  // re-emit joinRoundRoom every time the connection recovers, not just on
  // mount — room membership is server-side, per-socket-id state that does
  // NOT survive a reconnect (see the join-room effect for the full
  // explanation). Same pattern as isPolling.tsx's PollingManager.
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const applyBulkPayload = (bulk: any) => {
    setTournament(bulk.tournamentData);
    setRound(bulk.roundData);
    setMatch(bulk.matchesData?.current ?? null);
    setMatches(bulk.matchesData?.list ?? []);

    const initialMatchData = bulk.currentMatchData?.matchData ?? null;
    // Computed client-side, not read off bulk.currentMatchData.matchData's
    // own deadTeamList field — see isTeamAllDead/computeDeadTeamList above.
    const computedDeadTeamList = computeDeadTeamList(
      initialMatchData?.matchId,
      initialMatchData?.teams,
      deathTrackerRef
    );
    const fullMatchData = initialMatchData ? { ...initialMatchData, deadTeamList: computedDeadTeamList } : null;
    matchDataRef.current = fullMatchData;
    setMatchData(fullMatchData);
    lastDeadTeamListLengthRef.current = computedDeadTeamList.length;
    setDeadTeamList(sortDeadTeamList(computedDeadTeamList));

    overallDataRef.current = bulk.overallData ?? null;
    setOverallData(bulk.overallData ?? null);
    setMatchDatas(
      (bulk.matchDatasData ?? [])
        .map((entry: any) => entry.matchData)
        .filter(Boolean)
    );
  };

  const refreshBackpackInfo = async (bulk: any, signal?: AbortSignal) => {
    if (!VIEWS_NEEDING_BACKPACK.has(view)) return;
    const effectiveMatchId = bulk.matchesData?.effectiveMatchId || matchId;
    const matchDataId = bulk.currentMatchData?.matchData?._id;
    if (!matchDataId) return;
    try {
      const backpackRes = await cachedGet(
        `public/bagPack/tournament/${tournamentId}/round/${roundId}/match/${effectiveMatchId}/matchdata/${matchDataId}`,
        signal as AbortSignal,
        3000
      );
      setBackpackInfo(backpackRes.data);
    } catch (err) {
      console.error('Failed to fetch backpack info:', err);
      setBackpackInfo(null);
    }
  };

  useEffect(() => {
    if (!tournamentId || !roundId) return;

    const controller = new AbortController();
    let cancelled = false;
    const LIVE_TTL = 3000;

    // Only the very first fetch this component ever makes touches the
    // loading/error UI at all. Every later run of this effect — a view/
    // theme switch pushed live via Overlay Control, the background poll,
    // a post-reconnect catch-up fetch — fetches quietly in the background
    // and leaves whatever's currently rendered (displayedView/displayedTheme,
    // and the last-applied data) completely untouched, success or failure,
    // right up until new data actually lands. That's the only thing that
    // ever flips what's on screen (see setDisplayedView/setDisplayedTheme
    // below) — so a switch either shows the fully-ready new view, or (on a
    // slow/failed fetch) just keeps showing the old one a little longer,
    // never a blank/loading frame or a half-applied render in between.
    const fetchData = async () => {
      // Read fresh on every call, but deliberately NOT consumed here yet —
      // see the finally block below for why. (React 18 StrictMode
      // double-invokes this effect on mount: it runs, is immediately
      // cleaned up — cancelled = true, controller.abort() — then runs
      // again. If firstFetchRef were consumed here, before the await, the
      // FIRST — soon-to-be-aborted — call would consume it, leaving the
      // SECOND, actually-surviving call unable to ever tell it was the
      // real first fetch, so it would never flip loading off. Consuming it
      // only in finally, gated on !cancelled, means only a call that ran to
      // completion can ever claim "first fetch".)
      const isFirstFetch = firstFetchRef.current;
      try {
        if (isFirstFetch) {
          // Skip the loading flip when a cache hit already seeded real,
          // complete-enough data into initial state (see initialCache/
          // liveTierUsable above) — showing the placeholder here would just
          // reintroduce the blank-frame-on-refresh symptom the cache exists
          // to fix. A static-only hit for a view that needs live-tier data
          // is NOT complete enough (liveTierUsable is false), so this still
          // flips loading on rather than painting an empty matchDatas/
          // overallData as if it were final.
          if (!initialCache || !liveTierUsable) setLoading(true);
          setError(null);
        }

        const params = new URLSearchParams();
        params.set('view', view);
        if (followSelected) params.set('followSelected', 'true');
        const query = `?${params.toString()}`;

        const bulk = await cachedGetMsgpack(
          `public/bulk/${tournamentId}/${roundId}/${matchId}${query}`,
          controller.signal,
          LIVE_TTL
        );
console.log(
  `[DATA SOURCE] 🌐 REMOTE HTTP | bulk data received | match=${matchId}`
);
        if (cancelled) return;
        applyBulkPayload(bulk);
        // Write-through: keeps the global cache warm for the next refresh
        // or the next OBS source hitting this same round. Only from a real,
        // non-aborted fetch — never from the socket handlers below.
        writeCachedBulk(tournamentId, roundId, matchId, view, followSelected, bulk);

        await refreshBackpackInfo(bulk, controller.signal);
        if (cancelled) return;
        // The new view's data (and, on the very first fetch, the initial
        // one) is now fully applied above — only now is it safe to actually
        // switch what renders. No-op when view/theme didn't change (a plain
        // background poll or reconnect catch-up).
        setDisplayedView(view);
        setDisplayedTheme(theme);
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.error('Failed to fetch data:', err);
        if (!cancelled && isFirstFetch) setError('Failed to load tournament data');
      } finally {
        // !cancelled is the guard that makes this StrictMode-safe: a call
        // cut short by this effect's own cleanup never reaches here with
        // cancelled still false, so it can neither falsely consume
        // firstFetchRef nor flip loading off on behalf of the call that's
        // actually still in flight.
        if (!cancelled) {
          firstFetchRef.current = false;
          if (isFirstFetch) setLoading(false);
        }
      }
    };

    fetchDataRef.current = fetchData;
    fetchData();

    // No backend event tells this overlay when a round/match/schedule
    // changes (roundUpdated/matchCreated/Updated/Deleted/matchSelected are
    // only broadcast to the operator's own user room, never into this
    // round's room — see publicCache.ts's invalidatePublicCache comment).
    // Without that push, the only way structural fields (matches list,
    // match selection, per-match summaries) ever refresh is this poll —
    // otherwise a long-running OBS browser source that never remounts would
    // show whatever was true at mount time forever. Interval, not a fixed
    // countdown: naturally self-throttles around whatever fetchData's own
    // latency is, and the backend's own bulk-response cache is already only
    // a 3s TTL, so polling much faster than this wouldn't buy freshness,
    // just load.
    const pollTimer = setInterval(() => {
      if (!cancelled) fetchData();
    }, 600000);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(pollTimer);
    };
    // `theme` is a dep too even though the fetch itself doesn't use it —
    // this is what makes a theme-only live push (bundled with a view push
    // or, in principle, on its own) go through the same "wait for data,
    // then swap both together" path as a view change, via the
    // setDisplayedView/setDisplayedTheme pair above, instead of applying
    // instantly and momentarily mismatching the still-old displayedView.
  }, [tournamentId, roundId, matchId, followSelected, view, theme]);

  // Tracks connect/disconnect/connect_error so the room-join effect below
  // can react to a reconnect. Same shape as isPolling.tsx's PollingManager.
  useEffect(() => {
    const socketManager = SocketManager.getInstance();
    const socket = socketManager.connect();

    // Sync immediately in case connect() returned an already-connected
    // socket (e.g. another tab/component already established it) — must
    // not wait for a 'connect' event that may never fire again.
    setSocketStatus(socket.connected ? 'connected' : 'connecting');

    const handleConnect = () => setSocketStatus('connected');
    const handleDisconnect = () => setSocketStatus('disconnected');
    const handleConnectError = () => setSocketStatus('disconnected');

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socketManager.disconnect(); // no-op, shared socket stays alive — kept for parity
    };
  }, []);

  // Rejoining the room only resumes the LIVE delta stream going forward —
  // it doesn't resend state for teams that changed during the outage but
  // haven't changed again since. Reuse the same bulk-fetch the mount-time
  // fetch and the 10-minute pollTimer already use (fetchDataRef, above) to
  // silently (no loading flip) catch this overlay back up the moment the
  // room is rejoined, instead of leaving it stale until a team's next live
  // tick or the next scheduled poll.
  useEffect(() => {
    if (socketStatus !== 'connected') return;
    if (isFirstConnectRef.current) {
      // The initial mount connect — already covered by the data-fetch
      // effect's own fetchData() call, so skip it here.
      isFirstConnectRef.current = false;
      return;
    }
    fetchDataRef.current?.();
  }, [socketStatus]);

  useEffect(() => {
    if (!tournamentId || !roundId || socketStatus !== 'connected') return;

    const socketManager = SocketManager.getInstance();
    const socket = socketManager.connect();

    // Room is scoped per ROUND (not per match) — backend:
    // pubgApiMatchData.controller.js pushes whichever match is currently
    // selected for this round into round:${tournamentId}:${roundId}:*, so a
    // followSelected overlay keeps receiving updates across a match switch
    // without needing to rejoin anything.
    //
    // `view` tells the server which round:...:matchData / :overall
    // sub-room(s) this socket actually needs (a view using neither, e.g.
    // Lower/CommingUpNext, joins nothing and gets zero live-tick bytes) —
    // see utils/viewDataTiers.js server-side. `wireFormat: 'protobuf'`
    // negotiates the denser encoding for this socket, permanently (not a
    // one-time migration flag) — an old/unreloaded tab that never sends
    // this keeps working via msgpack forever, see decodeWireMessage above.
    console.log(`[bw][overlay] joinRoundRoom tournamentId=${tournamentId} roundId=${roundId} view=${view} wireFormat=protobuf`);
    socket.emit('joinRoundRoom', { tournamentId, roundId, view, wireFormat: 'protobuf' });

    // The server emits 'liveMatchUpdate'/'overallDataUpdate' into THIS room
    // as MessagePack- or protobuf-encoded binary payloads depending on this
    // socket's negotiated format (see decodeWireMessage above) — socket.io-
    // client hands them back as an ArrayBuffer/Uint8Array, so decode before
    // touching any field. Both are now TEAM-LEVEL DELTAS — incoming.teams is
    // only the teams that changed since the backend's last tick, which is
    // exactly why the merge-by-teamId logic below (mergedTeams) keeps a
    // team's last-known value when it's absent from a given payload, rather
    // than replacing wholesale. A client that misses a delta entirely isn't
    // stranded: the HTTP bulk-fetch effect (applyBulkPayload, above) does
    // an unconditional full replace on mount/view-change/match-switch,
    // independent of the socket.
    //
    // BUT: this same socket can ALSO be a member of a `user:${userId}`
    // room at the same time — the backend auto-joins any socket carrying a
    // valid session cookie into that room regardless of whether it's the
    // dashboard or this public overlay (e.g. viewing the overlay in the
    // same logged-in browser). liveMatchUpdate on THAT room is msgpack- or
    // plain-JSON-encoded depending on that room's OWN separate negotiation
    // (matchDataController.tsx's ?msgpackLiveUpdate=1) — decodeWireMessage
    // handles all three shapes (plain object, msgpack, protobuf) landing on
    // the same event name.
    //
    // incoming.teams is only a SLICE of this match's teams now (backend:
    // TEAMS_PER_LIVE_CHUNK) — merge by teamId into the latest known state
    // instead of replacing it wholesale, so:
    //   - a team not in THIS chunk keeps showing its last-known (still
    //     correct, just not-yet-refreshed-this-tick) values rather than
    //     being blanked out or reverted to something older/stale, and
    //   - a team IS updated the instant its own chunk lands, instead of the
    //     whole board waiting on the slowest chunk of the tick.
    // Applied immediately, with no client-side throttling: the backend's
    // own EVENT_DEBOUNCE_MS already guarantees at least ~150ms between
    // actual ticks, so chunks arriving faster than that are always genuine,
    // non-redundant pieces of the SAME tick — queuing/delaying them would
    // only add latency for no coalescing benefit.
    const processLiveMatchUpdate = (raw: ArrayBuffer | Uint8Array) => {
      const incoming = decodeWireMessage(raw, overlayProto.MatchDataPayload);
      if (!incoming) return;

      // A followSelected overlay wants every push for this round (whichever
      // match is currently selected); a fixed-match overlay only wants
      // pushes for its own matchId.
      const isOurMatch = followSelected || String(incoming.matchId) === String(matchId);
      if (!isOurMatch) return;

      const incomingTeams: any[] = Array.isArray(incoming.teams) ? incoming.teams : [];
      const prevMatchData = matchDataRef.current;
      const prevTeams: any[] =
        prevMatchData && String(prevMatchData.matchId) === String(incoming.matchId)
          ? prevMatchData.teams || []
          : [];

      const mergedTeams = mergeTeamsWithPlayers(prevTeams, incomingTeams);

      // Computed client-side, not read off incoming.deadTeamList — see
      // isTeamAllDead/computeDeadTeamList above. MUST use each team's fully
      // merged roster (mergedTeams), not the raw incomingTeams delta:
      // isTeamAllDead does `team.players.every(...)`, and the backend's
      // player-level delta (matchTeamDiff.js's computeChangedPlayers) means
      // a changed team's incoming `players` may now be just the ONE player
      // who actually changed this tick — checking `.every()` against that
      // alone would misjudge "one player died" as "whole team wiped".
      // Still only re-checks teams that actually appeared in this tick's
      // delta (changedTeamKeys) — already-dead teams stay skipped via
      // computeDeadTeamList's own `dead.has(teamKey)` guard, same as before.
      const changedTeamKeys = new Set(incomingTeams.map((t) => String(t.teamId ?? t._id)));
      const changedTeamsFullRoster = mergedTeams.filter((t) => changedTeamKeys.has(String(t.teamId ?? t._id)));
      const computedDeadTeamList = computeDeadTeamList(incoming.matchId, changedTeamsFullRoster, deathTrackerRef);

      const nextMatchData = {
        ...(prevMatchData || {}),
        ...incoming,
        teams: mergedTeams,
        deadTeamList: computedDeadTeamList,
      };
      matchDataRef.current = nextMatchData;
      setMatchData(nextMatchData);

      // Skip the copy+sort and the extra render when no team newly died
      // this tick (see lastDeadTeamListLengthRef above).
      if (computedDeadTeamList.length !== lastDeadTeamListLengthRef.current) {
        lastDeadTeamListLengthRef.current = computedDeadTeamList.length;
        setDeadTeamList(sortDeadTeamList(computedDeadTeamList));
      }

      refreshBackpackInfo({
        matchesData: { effectiveMatchId: incoming.matchId },
        currentMatchData: { matchData: nextMatchData },
      });
    };

    const handleLiveMatchUpdate = (raw: ArrayBuffer | Uint8Array) => {
      processLiveMatchUpdate(raw);
    };

    // overallDataUpdate is a TEAM-LEVEL delta, and (as of the backend's
    // player-level delta, matchTeamDiff.js's computeChangedPlayers) a
    // changed team's OWN `players` is now itself only the players that
    // changed — same shape/reasoning as processLiveMatchUpdate above, so
    // this reuses the same mergeTeamsWithPlayers helper rather than a
    // shallower team-only merge.
    const handleOverallDataUpdate = (raw: ArrayBuffer | Uint8Array) => {
      const incoming = decodeWireMessage(raw, overlayProto.OverallDataPayload);
      if (!incoming) return;

      const incomingTeams: any[] = Array.isArray(incoming.teams) ? incoming.teams : [];
      const prevOverallData = overallDataRef.current;
      // Keyed on roundId, not matchId — OverallData is standings for the
      // WHOLE round (see the OverallData interface above, which has no
      // matchId field at all), so incoming.matchId only identifies which
      // match's tick triggered this particular recompute. Comparing against
      // matchId here always fails (prevOverallData.matchId is undefined),
      // which silently discarded prevTeams on every single delta and
      // replaced the board with just that chunk's teams — every other
      // team's points would vanish until the next full HTTP poll restored
      // them.
      const prevTeams: any[] =
        prevOverallData && String(prevOverallData.roundId) === String(incoming.roundId)
          ? prevOverallData.teams || []
          : [];

      const mergedTeams = mergeTeamsWithPlayers(prevTeams, incomingTeams);

      const nextOverallData = { ...(prevOverallData || {}), ...incoming, teams: mergedTeams };
      overallDataRef.current = nextOverallData;
      setOverallData(nextOverallData);
    };

    socket.on('liveMatchUpdate', handleLiveMatchUpdate);
    socket.on('overallDataUpdate', handleOverallDataUpdate);

    return () => {
      socket.off('liveMatchUpdate', handleLiveMatchUpdate);
      socket.off('overallDataUpdate', handleOverallDataUpdate);
      console.log(`[bw][overlay] leaveRoundRoom tournamentId=${tournamentId} roundId=${roundId}`);
      socket.emit('leaveRoundRoom', { tournamentId, roundId });
      socketManager.disconnect();
    };
    // `view` is intentionally a dep here (unlike before) — a view change
    // must rejoin the correct round:...:matchData/:overall sub-room(s), not
    // silently keep whatever was joined for the PREVIOUS view.
    // socketManager.disconnect() in the cleanup above is a documented no-op
    // ("shared socket stays alive"), so re-running this effect on a view
    // change is cheap: it just re-emits join/leave and re-registers two
    // listeners, it does not tear down or reconnect the transport.
    //
    // `socketStatus` is also a dep, and deliberately so: room membership is
    // server-side, per-socket-id state that does NOT survive a reconnect
    // (confirmed against socket.io's own source — this backend doesn't set
    // connectionStateRecovery), so simply reconnecting the transport does
    // NOT re-join the room by itself. Without this dependency, ANY
    // connection hiccup (ping timeout, a network reset) would leave this
    // overlay silently excluded from the room forever, even though the
    // socket looks connected again — exactly the "frontend never receives
    // socket update" symptom this effect now guards against. Same fix
    // already proven in isPolling.tsx's PollingManager.
  }, [tournamentId, roundId, view, socketStatus]);

  const renderView = () => {
    if (loading) return <div style={PLACEHOLDER_STYLE} />;

    if (error) {
      return <div style={{ ...PLACEHOLDER_STYLE, color: '#ff0000' }}>{error}</div>;
    }

    if (!tournament) {
      return <div style={PLACEHOLDER_STYLE}>No tournament data found</div>;
    }

    // Renders the resolved component for `key`, or a clear in-place message
    // instead of crashing when a theme has no matching component.
    const renderComp = (key: string, props: Record<string, any>) => {
      const Comp = getComp(key);
      if (!Comp) {
        return <div style={PLACEHOLDER_STYLE}>"{displayedView}" isn't available on {displayedTheme}.</div>;
      }
      return <Comp {...props} />;
    };

    switch (displayedView) {
      case 'Lower':
        return renderComp('Lower', { tournament, round, match, totalMatches: matches.length, matches });
      case 'Upper':
        return renderComp('Upper', { tournament, round, match, matchData, backpackInfo });
      case 'Dom':
        return renderComp('Dom', { tournament, round, match, matchData });
      case 'Achive':
        return renderComp('Achive', { tournament, round, match, matchData, matchDatas });
      case 'Recall':
        return renderComp('Recall', { tournament, round, match, matchData });
      case 'Alerts':
        return renderComp('Alerts', { tournament, round, match, matchData, deadTeamList });
      case 'LiveStats':
        return renderComp('LiveStats', { tournament, round, match, matchData, overallData });
      case 'LiveFrags':
        return renderComp('LiveFrags', { tournament, round, match, matchData });
      case 'MatchData':
        return renderComp('MatchData', { tournament, round, match, matchData });
      case 'MatchFragrs':
        return renderComp('MatchFragrs', { tournament, round, match, matchData });
      case 'WwcdSummary':
        return renderComp('WwcdSummary', { tournament, round, match, matchData });
      case 'WwcdStats':
        return renderComp('WwcdStats', { tournament, round, match, matchData });
      case 'OverAllData':
        return renderComp('OverallData', { tournament, round, match, matchData, overallData, matches, matchDatas });
      case 'OverallFrags':
        return renderComp('OverallFrags', { tournament, round, match, matchData, overallData, matches, matchDatas });
      case 'Schedule':
        return renderComp('Schedule', { tournament, round, matches, matchDatas, selectedScheduleMatches: selectedScheduleMatchIds });
      case 'CommingUpNext':
        return renderComp('CommingUpNext', { tournament, round, match, matches });
      case 'Champions':
        return renderComp('Champions', { tournament, round, matchData, overallData, matchDatas });
      case '1stRunnerUp':
        return renderComp('FirstRunnerUp', { tournament, round, overallData, matchDatas });
      case '2ndRunnerUp':
        return renderComp('SecondRunnerUp', { tournament, round, overallData, matchDatas });
      case 'EventMvp':
        return renderComp('EventMvp', { tournament, round, overallData, matches, matchDatas });
      case 'MatchSummary':
        return renderComp('MatchSummary', { tournament, round, match, matchData });
      case 'playerH2H':
        return renderComp('PlayerH2H', { tournament, round, match, matchData });
      case 'TeamH2H':
        return renderComp('TeamH2H', { tournament, round, match, matchData });
      case 'intro':
        return renderComp('Intro', { tournament, round, match, matchData });
      case 'mapPreview':
        return renderComp('MapPreview', { tournament, round, match, matchData });
      case 'slots':
        return renderComp('Slots', { tournament, round, match, matchData });
      case 'mvp':
        return renderComp('Mvp', { tournament, round, match, matchData, backpackInfo });
      case 'highlightPoints':
        return renderComp('HighlightPoints', { tournament, round, match, matchData, overallData, matches, matchDatas });
      case 'HighlightSchedule':
        return renderComp('HighlightSchedule', { tournament, round, matches, matchDatas, selectedScheduleMatches: selectedScheduleMatchIds });
      case 'RosterShowCase':
        return renderComp('RosterShowCase', { tournament, round, match, matchData });
      case 'PlayerSwitch':
        return renderComp('PlayerSwitch', { match, matchData, loading, error });
      case 'LiveData':
        return renderComp('LiveData', { tournament, round, match, matchData, overallData });
      default:
        return <div style={PLACEHOLDER_STYLE}>View "{displayedView}" not implemented yet.</div>;
    }
  };

  return (
    <div style={{ width: '1920px', height: '1400px', top: 0, left: 0, margin: 0, padding: 0, overflow: 'hidden' }}>
      {renderView()}
    </div>
  );
};

export default PublicThemeRenderer;