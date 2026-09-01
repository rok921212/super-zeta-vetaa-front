import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { decode } from '@msgpack/msgpack';
import { overlay as overlayProto } from '../proto/overlay.pb';
import api, { isUsingRelay, getBackendOrigin } from '../login/api.tsx';
import SocketManager from '../dashboard/socketManager.tsx';
import {
  readCachedStatic,
  writeCachedStatic,
  publicCacheBustKey,
  PUBLIC_CACHE_INVALIDATION_EVENT,
} from './publicCache.ts';
import { registerOverlaySW } from './registerOverlaySW.ts';
import { remapProtoTeam, mergeTeamsWithPlayers, normalizeMatchTeams } from './matchTeamMerge.ts';

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
  // From the Match doc (schema: required String). Forwarded to theme views
  // as the `match` prop; LiveStats / Recall read it via isRondoMap() to gate
  // recall-overlay behaviour. Only refreshed on HTTP bulk fetches (mount /
  // view change / reconnect / match switch), never on socket ticks.
  map?: string;
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

// Bandwidth: the backend `/api/public/bagPack/...` route is currently a
// hard-coded stub that always returns `{ teambackpackinfo: { TeamBackPackList: [] } }`
// (index.js), yet refreshBackpackInfo() below was firing a full HTTP
// round-trip for it on every bulk fetch AND on every `liveMatchUpdate`
// socket tick (~2s) for every open 'Upper' overlay. Until the feature is
// real, skip the request entirely. Flip this to re-enable in one place.
// Explicitly typed `boolean` (not literal `false`) so the guarded fetch
// below isn't statically flagged as unreachable code.
const BACKPACK_ENABLED: boolean = false;

// Mirrors buildBulkPayload's view -> data-requirement tables
// (Bulkpublic.controller.js) — kept in sync manually, same convention as
// VIEWS_NEEDING_BACKPACK above. localStorage no longer carries live data, so
// this is used to decide whether a view can paint immediately from a
// static-only cache hit (Lower / CommingUpNext) or must hold the loading
// placeholder until the first HTTP fetch + socket hydration lands — see the
// `loading` initial value below.
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

// Opt-in cache/live-boundary diagnostics — add ?debug=1 to the overlay URL.
// Off by default so a production OBS source's console isn't spammed every tick.
const DEBUG_PUBLIC_CACHE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('debug') === '1';
const dlog = (...args: any[]) => {
  if (DEBUG_PUBLIC_CACHE) console.log(...args);
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

  // Bumped on every public-cache invalidation (a polling toggle, via the
  // window/storage listeners below) and on a followSelected match boundary. A
  // fetch captures this at its start and refuses to apply state or write
  // localStorage if it moved meanwhile (a request that began before the
  // invalidation); the in-memory HTTP cache entries in cachedGet/cachedGetMsgpack
  // also carry it and become unreadable the moment it advances — so a stale
  // <ttl in-memory hit can never defeat an invalidation either.
  const cacheGenerationRef = useRef(0);

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
  // Skips the reconnect catch-up on the very first "connected" transition
  // (the initial mount connect) — already covered by the data-fetch
  // effect's own mount-time fetchData() call.
  const isFirstConnectRef = useRef(true);
  // Highest `roundStructureChanged` version this overlay has acted on.
  // The server sends the current version once as a baseline when this
  // socket joins the round room (and again to the whole room on every real
  // structural mutation); we only refetch structural data when the number
  // strictly advances past this. Replaces the old blind 10-min poll +
  // unconditional refetch on every socket reconnect. See
  // Render_hosted/test-back/utils/roundStructure.js.
  const structureVersionRef = useRef(0);

  // Authoritative per-round data revision (Round.publicRev). `knownRevRef` is
  // the highest rev seen from ANY socket signal (`publicDataInvalidated`, or
  // the `publicRev` field on `roundStructureChanged`). `appliedRevRef` is the
  // highest rev actually applied to LIVE state. Together they stop an older
  // HTTP bulk body (a slow mount / reconnect catch-up / structural refetch)
  // from overwriting newer socket-merged live state: applyBulkPayload only
  // applies its live slices when the body's rev >= knownRevRef. Both reset on
  // a match boundary / hardReset / matchId change.
  const knownRevRef = useRef(0);
  const appliedRevRef = useRef(0);
  // Debounced "quiet" refetch (no loading flash) — a burst of invalidation
  // signals collapses to one coalesced HTTP fetch.
  const quietRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleQuietRefetch = () => {
    if (quietRefetchTimerRef.current) clearTimeout(quietRefetchTimerRef.current);
    quietRefetchTimerRef.current = setTimeout(() => {
      quietRefetchTimerRef.current = null;
      fetchDataRef.current?.();
    }, 250);
  };

  const cachedGet = async (url: string, signal: AbortSignal, ttlMs = 5000) => {
    const cache = cacheRef.current;
    const gen = cacheGenerationRef.current;
    const hit = cache.get(url);
    if (hit && hit.generation === gen && Date.now() - hit.time < ttlMs) {
      return hit.response;
    }
    const response = await api.get(url, { signal });
    cache.set(url, { response, time: Date.now(), generation: gen });
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
    const gen = cacheGenerationRef.current;
    const hit = cache.get(url);
    if (hit && hit.generation === gen && Date.now() - hit.time < ttlMs) {
      return hit.data;
    }
    const response = await api.get(url, { signal, responseType: 'arraybuffer' });
    const data = decode(new Uint8Array(response.data)) as any;
    cache.set(url, { data, time: Date.now(), generation: gen });
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
  // browser-source refresh (unlike the in-memory cacheRef below), letting the
  // overlay shell (header, branding, schedule/match-list chrome) paint
  // immediately instead of a blank frame while the real fetch (always run
  // regardless, see below) resolves and the socket hydrates live data.
  //
  // localStorage now holds ONLY static/structural data — tournament meta,
  // round meta, the matches list. No roster, no standings, no elimination
  // state, no current-match object. readCachedStatic self-validates identity
  // and rejects anything created at/before the last invalidatePublicCache, so
  // a stale reload or a pre-toggle slice can't seed anything here.
  const [initialStaticCache] = useState(() => {
    if (!tournamentId || !roundId) return null;
    return readCachedStatic(tournamentId, roundId);
  });

  // STATIC — seeded from cache so the shell paints on the first frame after reload.
  const [tournament, setTournament] = useState<Tournament | null>(() => initialStaticCache?.tournamentData ?? null);
  const [round, setRound] = useState<Round | null>(() => initialStaticCache?.roundData ?? null);
  const [matches, setMatches] = useState<Match[]>(() => initialStaticCache?.matchesList ?? []);

  // `match` (the currently-selected match object) is structural but
  // SELECTION-scoped — which match is "current" changes with the operator's
  // selection / polling toggle — so it is deliberately NOT part of the static
  // cache. Re-hydrated from bulk.matchesData.current on every HTTP fetch.
  const [match, setMatch] = useState<Match | null>(null);

  // REAL-TIME gameplay state — NEVER seeded from localStorage. Starts
  // empty/null and is filled only by the always-run HTTP bulk fetch
  // (applyBulkPayload) and the socket delta stream. After a hard reload the
  // affected view shows its own empty/loading branch until that hydration
  // lands (typically a few hundred ms) — intended: a stale cached roster /
  // standings / elimination frame must never paint.
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [deadTeamList, setDeadTeamList] = useState<DeadTeamListEntry[]>([]);
  const [overallData, setOverallData] = useState<OverallData | null>(null);
  const [matchDatas, setMatchDatas] = useState<MatchData[]>([]);

  // Not seeded from cache: Upper-only, fetched separately keyed off a
  // matchDataId that only exists after the real fetch resolves.
  const [backpackInfo, setBackpackInfo] = useState<BackpackInfo | null>(null);

  // First paint shows the placeholder until the first real fetch resolves,
  // UNLESS we have a static cache hit AND this view needs no live-tier data
  // (only Lower / CommingUpNext) — those render fully from static state
  // immediately. Every other view needs roster/standings and must wait.
  const [loading, setLoading] = useState(() => !initialStaticCache || viewNeedsLiveTier(view));
  const [error, setError] = useState<string | null>(null);
  // Tracks the socket's real wire state so the room-join effect below can
  // re-emit joinRoundRoom every time the connection recovers, not just on
  // mount — room membership is server-side, per-socket-id state that does
  // NOT survive a reconnect (see the join-room effect for the full
  // explanation). Same pattern as isPolling.tsx's PollingManager.
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  // Register the overlay service worker (front/public/overlay-sw.js). It
  // cache-firsts the app shell + <img>/font assets so a hard OBS Browser
  // Source reload paints branding/logos/art from disk even offline. It never
  // touches the data path (/api, /public/bulk, /socket.io). No-ops when the
  // context isn't secure (file://, plain-http LAN host).
  useEffect(() => {
    registerOverlaySW();
  }, []);

  const applyBulkPayload = (bulk: any, httpRev?: number | null) => {
    // STATIC / structural slices — no socket stream races these, always apply.
    // (A stale-vs-fresh selection change is already caught by the
    // cacheGenerationRef guard at the fetch call site.)
    setTournament(bulk.tournamentData);
    setRound(bulk.roundData);
    setMatch(bulk.matchesData?.current ?? null);
    setMatches(bulk.matchesData?.list ?? []);

    // LIVE slices — an older HTTP body must NOT overwrite newer socket-merged
    // live state. Apply only if this body is at least as new as the highest
    // revision any socket signal has told us about.
    const rev = typeof httpRev === 'number' ? httpRev : null;
    if (rev !== null && rev < knownRevRef.current) {
      dlog('[public-rev]', 'STALE BULK LIVE SLICES SKIPPED', {
        httpRev: rev, knownRev: knownRevRef.current,
      });
      return;
    }

    const rawInitialMatchData = bulk.currentMatchData?.matchData ?? null;
    // Normalize at the data-layer boundary so every theme downstream receives
    // one record per team / per player, with no id-less phantom teams.
    const initialMatchData = rawInitialMatchData
      ? { ...rawInitialMatchData, teams: normalizeMatchTeams(rawInitialMatchData.teams) }
      : null;
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

    const rawOverallData = bulk.overallData ?? null;
    const normalizedOverallData = rawOverallData
      ? { ...rawOverallData, teams: normalizeMatchTeams(rawOverallData.teams) }
      : null;
    overallDataRef.current = normalizedOverallData;
    setOverallData(normalizedOverallData);
    setMatchDatas(
      (bulk.matchDatasData ?? [])
        .map((entry: any) => entry.matchData)
        .filter(Boolean)
    );

    if (rev !== null) appliedRevRef.current = Math.max(appliedRevRef.current, rev);
  };

  const refreshBackpackInfo = async (bulk: any, signal?: AbortSignal) => {
    if (!BACKPACK_ENABLED) return;
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

  // publicRev is per-round and monotonic only WITHIN a round — a different
  // round starts its own (possibly much lower) sequence. Reset the revision
  // gate whenever the round identity changes so a new round's authoritative
  // bulk isn't rejected as "older" than the previous round's last rev.
  useEffect(() => {
    knownRevRef.current = 0;
    appliedRevRef.current = 0;
  }, [tournamentId, roundId]);

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
      // Snapshot the cache generation now. If a public-cache invalidation (a
      // polling toggle, or a followSelected match boundary) lands while this
      // request is in flight, its body predates the new truth and must neither
      // paint nor repopulate the cache it was meant to refresh — see the two
      // guards below, before applyBulkPayload and before writeCachedStatic.
      const generationAtStart = cacheGenerationRef.current;
      try {
        if (isFirstFetch) {
          // Keep whatever the initial state painted IF we have a static cache
          // hit AND this view needs no live-tier data (Lower / CommingUpNext)
          // — flipping loading on there would just reintroduce the
          // blank-frame-on-refresh the cache exists to prevent. Every other
          // view has nothing trustworthy to show yet (no roster/standings in
          // localStorage anymore), so it keeps the placeholder until this
          // fetch lands. Condition kept identical to the `loading` initial
          // value above so the two never disagree.
          if (!initialStaticCache || viewNeedsLiveTier(view)) setLoading(true);
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
        // `via` is the real origin the bulk bytes came from: the co-located
        // relay (http://127.0.0.1:8787 — it may have served this from its own
        // /api/public/* cache or by proxying the cloud) or the direct cloud
        // origin after a fallback. `cachedGetMsgpack` may also have returned
        // a &lt;3s in-memory hit with no request at all — this line still fires.
        console.log(
          `[DATA SOURCE] bulk received | via=${isUsingRelay() ? 'relay' : 'cloud'} ${getBackendOrigin()} | match=${matchId}`
        );
        if (cancelled) return;
        // Invalidated mid-flight: drop this response entirely rather than let
        // it overwrite the fresher state the invalidation is bringing in, or
        // resurrect the localStorage slice it just wiped.
        if (generationAtStart !== cacheGenerationRef.current) {
          dlog('[public-cache]', 'STALE REQUEST DROPPED', { tournamentId, roundId, matchId });
          return;
        }
        applyBulkPayload(bulk, Number(bulk?.roundData?.publicRev) || 0);
        // Write-through of STATIC / structural data ONLY (tournament meta,
        // round meta, matches list) — never roster, standings, current-match,
        // or elimination state. Keeps the shell warm for the next reload / the
        // next OBS source on this round. Only from a real, non-aborted fetch,
        // and only past the generation guard above — never from the socket
        // handlers below.
        writeCachedStatic(tournamentId, roundId, {
          tournamentData: bulk.tournamentData ?? null,
          roundData: bulk.roundData ?? null,
          matchesList: bulk.matchesData?.list ?? [],
        });

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

    // Structural fields (matches list, match selection, per-match summaries,
    // tournament/round meta) are now pushed: the backend emits
    // `roundStructureChanged` into round:<tid>:<rid>:control on every real
    // structural mutation, and the room-join effect below listens for it and
    // calls this same fetchData. This interval is just a slow backstop for
    // the rare missed notification (e.g. a structural change that lands
    // during a socket outage AND a server restart before reconnect) — 30
    // min, not 10, since it's no longer the primary refresh path.
    const pollTimer = setInterval(() => {
      if (!cancelled) fetchData();
    }, 1800000);

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

  // Cross-component / cross-tab public-cache invalidation (PollingManager ->
  // this overlay). Same document: the CustomEvent. A sibling tab in the same
  // browser profile: the `storage` event fired when the bust key is written.
  // A separate-process OBS Browser Source gets neither and instead self-heals
  // via readCachedStatic's identity guard + the always-run fetch + socket
  // hydration.
  //
  // On either signal: advance the cache generation (kills every in-memory HTTP
  // entry and voids any in-flight fetch's write-back), drop the in-memory map,
  // clear all LIVE state — matchData, standings, elimination tracking — while
  // keeping static tournament/round/matches, then pull a fresh authoritative
  // bulk. The existing socket + room are left as-is; the fresh bulk plus the
  // ongoing delta stream re-establish live truth.
  useEffect(() => {
    if (!tournamentId || !roundId) return;

    const hardReset = () => {
      cacheGenerationRef.current += 1;
      cacheRef.current.clear();
      matchDataRef.current = null;
      overallDataRef.current = null;
      // The next authoritative bulk defines a new revision baseline.
      knownRevRef.current = 0;
      appliedRevRef.current = 0;
      deathTrackerRef.current = { matchId: null, dead: new Map() };
      lastDeadTeamListLengthRef.current = 0;
      setMatchData(null);
      setOverallData(null);
      setDeadTeamList([]);
      setError(null);
      setLoading(true);
      dlog('[public-cache]', 'HARD RESET', { tournamentId, roundId });
      const run = fetchDataRef.current;
      if (run) Promise.resolve(run()).finally(() => setLoading(false));
      else setLoading(false);
    };

    const onInvalidated = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (
        String(detail.tournamentId) === String(tournamentId) &&
        String(detail.roundId) === String(roundId)
      ) {
        hardReset();
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === publicCacheBustKey(tournamentId, roundId)) hardReset();
    };

    window.addEventListener(PUBLIC_CACHE_INVALIDATION_EVENT, onInvalidated as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PUBLIC_CACHE_INVALIDATION_EVENT, onInvalidated as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [tournamentId, roundId]);

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

  // Reconnect catch-up. On a reconnect the room-join effect below re-emits
  // joinRoundRoom, and the server replies with a full `liveMatchUpdate`
  // hydration snapshot from liveMatchCache — so the LIVE match board catches
  // itself up automatically, no HTTP needed. Two things that hydration does
  // NOT cover:
  //   - overallData (round standings): the :overall room has no full-snapshot
  //     hydration server-side, only forward deltas — an elimination missed
  //     during the outage would leave standings stale until the next one.
  //   - structural fields: covered separately by `roundStructureChanged`
  //     (handled in the room-join effect below).
  // So ONLY overall-showing views need a bulk refetch here; every other
  // overlay (Upper / Lower / Alerts / kill feeds / minimap) skips it. This
  // replaces the old unconditional full-bulk refetch on every reconnect for
  // every OBS source — the single biggest HTTP amplifier.
  useEffect(() => {
    if (socketStatus !== 'connected') return;
    if (isFirstConnectRef.current) {
      isFirstConnectRef.current = false;
      return;
    }
    if (VIEWS_NEEDING_OVERALL.has(view)) fetchDataRef.current?.();
  }, [socketStatus, view]);

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
      const previousMatchId = prevMatchData?.matchId;
      const sameMatch =
        previousMatchId != null && String(previousMatchId) === String(incoming.matchId);

      // Match boundary: a followSelected overlay whose selected match just
      // changed. The incoming payload is the NEW match's authoritative BASE,
      // not a delta against the previous match — so previous teams and scalar
      // fields must NOT carry over (a direct cause of ghost teams / doubled
      // health bars), the per-match death tracker resets, and the URL-keyed
      // in-memory HTTP cache is voided: a followSelected bulk URL does not
      // change across a selection switch, so without bumping the generation
      // the structure-triggered refetch could serve the OLD match from cacheRef.
      if (previousMatchId != null && !sameMatch) {
        dlog('[public-live]', 'MATCH BOUNDARY', {
          previousMatchId,
          incomingMatchId: incoming.matchId,
        });
        cacheGenerationRef.current += 1;
        cacheRef.current.clear();
        // New match => new revision baseline; don't let the previous match's
        // rev gate (or an in-flight bulk for the old match) touch the new one.
        knownRevRef.current = 0;
        appliedRevRef.current = 0;
        deathTrackerRef.current = { matchId: null, dead: new Map() };
        lastDeadTeamListLengthRef.current = 0;
      }

      // Same match -> incoming.teams is a delta, merge onto the known roster.
      // Different match (or first tick) -> no previous base, incoming stands alone.
      const prevTeams: any[] = sameMatch ? prevMatchData?.teams || [] : [];

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

      const nextMatchData = sameMatch
        ? { ...prevMatchData, ...incoming, teams: mergedTeams, deadTeamList: computedDeadTeamList }
        : { ...incoming, teams: mergedTeams, deadTeamList: computedDeadTeamList };
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

    // Structural change signal (matches list / selection / schedule / round
    // meta). The server emits exactly one `roundStructureChanged` to THIS
    // socket synchronously inside joinRoundRoom (the "baseline"), then
    // broadcasts to the whole :control room on every real mutation. The
    // first message after each (re)join is therefore always the baseline —
    // absorb its version and don't refetch (the mount / view fetch already
    // has current data). Every later message is a genuine change: refetch
    // once if it advances past what we've acted on. A reconnect that just
    // replays the same baseline version thus costs nothing.
    let sawBaseline = false;
    const handleRoundStructureChanged = (msg?: { roundId?: string; version?: number; publicRev?: number }) => {
      if (!msg || String(msg.roundId) !== String(roundId)) return;
      // Absorb the authoritative revision baseline on every (re)join, and any
      // later advance — this is what a structural-only overlay (Lower, Schedule)
      // learns publicRev from. ADVANCE-GUARDED: the relay/backend re-emit an
      // UNCHANGED baseline every ~45s.
      const pr = Number(msg.publicRev) || 0;
      if (pr > knownRevRef.current) knownRevRef.current = pr;

      const v = Number(msg.version) || 0;
      if (!sawBaseline) {
        sawBaseline = true;
        if (v > structureVersionRef.current) structureVersionRef.current = v;
        return;
      }
      if (v <= structureVersionRef.current) return;
      structureVersionRef.current = v;
      console.log(`[bw][overlay] roundStructureChanged version=${v} -> structural refetch`);
      // publicDataInvalidated (emitted alongside this) already bumped the
      // generation + scheduled the coalesced refetch; bump here too so a
      // structure-only signal still busts the in-memory HTTP cache.
      cacheGenerationRef.current += 1;
      cacheRef.current.clear();
      scheduleQuietRefetch();
    };

    // Dedicated authoritative cache-invalidation signal — emitted to
    // round:<tid>:<rid>:control after any successful backend mutation that can
    // change this round's public bulk payload (roster/points/stat edits,
    // match select/deselect, tournament-skin changes, ...). See
    // Render_hosted/test-back/utils/publicRevision.js.
    const handlePublicDataInvalidated = (msg?: {
      roundId?: string; matchId?: string | null; scope?: string; rev?: number; reason?: string;
    }) => {
      if (!msg || String(msg.roundId) !== String(roundId)) return;
      const rev = Number(msg.rev) || 0;
      // ADVANCE-GUARDED: the relay re-forwards its last structure blob to new
      // joiners and on reconnect; only a strictly-higher rev is a real change.
      if (rev <= knownRevRef.current) return;
      // A match-scoped invalidation for a DIFFERENT fixed match doesn't touch
      // our payload — record the rev, don't refetch.
      if ((msg.scope === 'match' || msg.scope === 'exact')
        && !followSelected && msg.matchId != null && String(msg.matchId) !== String(matchId)) {
        knownRevRef.current = rev;
        return;
      }
      knownRevRef.current = rev;
      console.log(`[bw][overlay] publicDataInvalidated rev=${rev} scope=${msg.scope} reason=${msg.reason} -> quiet refetch`);
      // Void the in-memory HTTP cache + any in-flight fetch's write-back, then
      // pull fresh data with NO loading flash (the socket stream keeps
      // rendering; applyBulkPayload's rev guard swaps it in cleanly).
      cacheGenerationRef.current += 1;
      cacheRef.current.clear();
      scheduleQuietRefetch();
    };

    socket.on('liveMatchUpdate', handleLiveMatchUpdate);
    socket.on('overallDataUpdate', handleOverallDataUpdate);
    socket.on('roundStructureChanged', handleRoundStructureChanged);
    socket.on('publicDataInvalidated', handlePublicDataInvalidated);

    return () => {
      socket.off('liveMatchUpdate', handleLiveMatchUpdate);
      socket.off('overallDataUpdate', handleOverallDataUpdate);
      socket.off('roundStructureChanged', handleRoundStructureChanged);
      socket.off('publicDataInvalidated', handlePublicDataInvalidated);
      if (quietRefetchTimerRef.current) {
        clearTimeout(quietRefetchTimerRef.current);
        quietRefetchTimerRef.current = null;
      }
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
    // server-side, per-socket-id state that does NOT survive a reconnect for
    // the transport this overlay actually uses — the local relay's socket.io
    // server (desktop-app/relay/server.cjs) has no connectionStateRecovery,
    // and even on the degraded direct-to-cloud fallback a re-join is
    // harmless. So simply reconnecting does NOT re-join the room by itself.
    // Without this dependency, ANY connection hiccup (ping timeout, a
    // network reset) would leave this overlay silently excluded from the
    // room forever, even though the socket looks connected again — exactly
    // the "frontend never receives socket update" symptom this effect now
    // guards against. Same fix already proven in isPolling.tsx's
    // PollingManager.
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