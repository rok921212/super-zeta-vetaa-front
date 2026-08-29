// Global localStorage-backed cache for the public OBS overlay data path
// (PublicThemeRenderer.tsx). Wraps the getCache/setCache primitives (cache.tsx).
//
// HARD RULE (v2): localStorage holds ONLY static/structural tournament data —
// tournament meta, round meta, and the matches list. It NEVER holds real-time
// gameplay data: no rosters, no live scores, no round standings, no elimination
// state, no "currently selected match" object. Those are re-hydrated at runtime
// by PublicThemeRenderer's always-run HTTP bulk fetch and the socket delta
// stream — a stale cached gameplay frame must never be painted, not even for one
// frame after a hard OBS Browser Source reload.
//
// The static slice barely changes and is shared across every view/match of the
// same round, so concurrent OBS sources for one round share it. It is wrapped in
// a CacheEnvelope so the reader can prove the bytes belong to the tournament/
// round it is about to paint, and every read is gated on an invalidation
// timestamp so a polling toggle (or match switch) disposes of it instantly —
// even across a hard reload.
import { getCache, setCache, removeCache, clearCacheByPrefix } from './cache.tsx';

// Static structural data changes rarely. There is deliberately NO "live" tier
// and no gameplay cache of any kind — do not reintroduce one with a longer TTL.
const STATIC_TTL_MS = 30_000;

// Fired by invalidatePublicCache on the SAME document (operator preview tab).
// Sibling tabs in the same profile are covered by the `storage` event on the
// bust key. A separate-process OBS Browser Source gets neither and self-heals
// via readCachedStatic's identity/bust guard + the always-run HTTP fetch.
export const PUBLIC_CACHE_INVALIDATION_EVENT = 'public-overlay-cache-invalidated';

// v2: namespace bumped when the live/gameplay tier was removed.
const STATIC_PREFIX = 'pubCache:v2:static:';
const BUST_PREFIX = 'pubCache:v2:bust:';

// One-time upgrade cleanup, runs once when this module is first imported
// (PublicThemeRenderer.tsx and isPolling.tsx). v1 had a `pubCache:v1:live:*`
// tier that persisted real rosters / standings / elimination state. Drop every
// v1 entry so an upgraded browser can never read the old live-data format back.
clearCacheByPrefix('pubCache:v1:', 'local');
// Legacy per-theme gameplay caches (Theme6/Theme7 off-screen/mvp.tsx wrote
// `mvp_<matchDataId>`; Theme6 off-screen/OverallFrags.tsx wrote the
// un-namespaced global `overallDataCache`).
clearCacheByPrefix('mvp_', 'local');
removeCache('overallDataCache', 'local');

const staticKey = (tournamentId: string, roundId: string) =>
  `${STATIC_PREFIX}${tournamentId}:${roundId}`;

export const publicCacheBustKey = (tournamentId: string, roundId: string) =>
  `${BUST_PREFIX}${tournamentId}:${roundId}`;

interface CacheEnvelope<T> {
  v: 2;
  tournamentId: string;
  roundId: string;
  createdAt: number;
  payload: T;
}

// The ONLY shape this cache stores. No currentMatchData / overallData /
// matchDatasData / matchesCurrent / effectiveMatchId / deadTeamList.
//   tournamentData – Tournament doc (name, logo, colours, day)
//   roundData      – Round doc (name, day, apiEnable)
//   matchesList    – the round's Match docs (matchNo, matchName, map, groups, ordering)
export interface CachedStaticData {
  tournamentData: any | null;
  roundData: any | null;
  matchesList: any[];
}

// Timestamp of the last invalidatePublicCache for this round (0 if never). Any
// slice created at/before this instant is refused on read — this is what makes a
// polling toggle survive a hard reload.
export function readPublicCacheBust(tournamentId: string, roundId: string): number {
  const ts = getCache<number>(publicCacheBustKey(tournamentId, roundId), Number.MAX_SAFE_INTEGER, 'local');
  return typeof ts === 'number' && Number.isFinite(ts) ? ts : 0;
}

// Reads the static envelope and validates identity/version/freshness. Any
// mismatch -> drop the entry and return null. Malformed data is never repaired.
function readEnvelope<T>(
  key: string,
  ttlMs: number,
  expect: { tournamentId: string; roundId: string; bustAt: number }
): T | null {
  const env = getCache<CacheEnvelope<T>>(key, ttlMs, 'local');
  if (!env) return null;

  if (env.v !== 2 || typeof env.createdAt !== 'number' || env.payload == null) {
    removeCache(key, 'local');
    return null;
  }
  if (env.createdAt <= expect.bustAt) {
    removeCache(key, 'local');
    return null;
  }
  if (
    String(env.tournamentId) !== String(expect.tournamentId) ||
    String(env.roundId) !== String(expect.roundId)
  ) {
    removeCache(key, 'local');
    return null;
  }
  return env.payload;
}

// Returns the cached static slice for a round, or null when nothing fresh and
// identity-valid is on disk. Callers seed tournament/round/matches state from it
// for a first paint after reload, then let the always-run HTTP fetch overwrite it.
export function readCachedStatic(tournamentId: string, roundId: string): CachedStaticData | null {
  const bustAt = readPublicCacheBust(tournamentId, roundId);
  const slice = readEnvelope<CachedStaticData>(staticKey(tournamentId, roundId), STATIC_TTL_MS, {
    tournamentId,
    roundId,
    bustAt,
  });

  console.log('[public-cache]', 'READ', { tournamentId, roundId, staticHit: !!slice, bustAt });

  if (!slice) return null;
  return {
    tournamentData: slice.tournamentData ?? null,
    roundData: slice.roundData ?? null,
    matchesList: Array.isArray(slice.matchesList) ? slice.matchesList : [],
  };
}

// Wipes the static slice for a round AND records the invalidation instant so a
// slice already on disk when an OBS source hard-reloads AFTER this call is
// rejected too. Then notifies the same document (CustomEvent) and sibling tabs
// (the `storage` event from writing the bust key). Called on a polling toggle
// (isPolling.tsx), before AND after the server PATCH.
export function invalidatePublicCache(tournamentId: string, roundId: string): void {
  clearCacheByPrefix(`${STATIC_PREFIX}${tournamentId}:${roundId}`, 'local');
  setCache(publicCacheBustKey(tournamentId, roundId), Date.now(), 'local');
  try {
    window.dispatchEvent(
      new CustomEvent(PUBLIC_CACHE_INVALIDATION_EVENT, { detail: { tournamentId, roundId } })
    );
  } catch {
    // non-DOM context (tests / SSR)
  }
  console.log('[public-cache]', 'INVALIDATED', { tournamentId, roundId });
}

// Write-through after a real bulk fetch succeeds. Stores ONLY the static slice.
// The caller must additionally gate this on its in-memory cacheGeneration so a
// fetch that started before an invalidation can't repopulate what was wiped.
// Never called from socket tick handlers.
export function writeCachedStatic(tournamentId: string, roundId: string, data: CachedStaticData): void {
  const env: CacheEnvelope<CachedStaticData> = {
    v: 2,
    tournamentId,
    roundId,
    createdAt: Date.now(),
    payload: {
      tournamentData: data.tournamentData ?? null,
      roundData: data.roundData ?? null,
      matchesList: Array.isArray(data.matchesList) ? data.matchesList : [],
    },
  };
  setCache(staticKey(tournamentId, roundId), env, 'local');
}
