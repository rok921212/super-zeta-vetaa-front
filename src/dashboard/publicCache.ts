// Global localStorage-backed cache for the public OBS overlay data path
// (PublicThemeRenderer.tsx). Wraps the existing getCache/setCache primitives
// (cache.tsx) rather than reinventing localStorage mechanics — this file owns
// the key scheme, the identity envelope, the TTL policy, and the invalidation
// signal for the bulk payload.
//
// Two tiers, split along the same boundary buildBulkPayload already uses
// server-side (Bulkpublic.controller.js):
//   - a "static" slice that barely changes and is shared across every
//     view/match of the same round (so the several concurrent OBS browser
//     sources for one round can share it), and
//   - a "live" slice scoped to the exact match/view/followSelected combo,
//     short-TTL, only ever used to paint the very first frame after a reload
//     before the real fetch lands.
//
// Hard rule: the cache SEEDS PIXELS. It is never an authoritative source of
// live player/team state. Every slice is wrapped in a CacheEnvelope so the
// reader can prove the bytes belong to the tournament/round/match/view it is
// about to paint, and every read is gated on an invalidation timestamp so a
// polling toggle (or match switch) disposes of it instantly — even across a
// hard OBS Browser Source reload.
import { getCache, setCache, removeCache, clearCacheByPrefix } from './cache.tsx';

// Live cache is a first-paint seed ONLY: the real HTTP fetch always runs, and
// the socket delta stream + joinRoundRoom hydration correct it within ~2s. The
// backend's own bulk-response cache is 20s (Bulkpublic.route.js), so holding a
// local copy much longer than the live tick rate just widens how stale that
// first frame can look after a reload.
const STATIC_TTL_MS = 30_000;
const LIVE_TTL_MS = 2_000;

// Fired by invalidatePublicCache on the SAME document (e.g. a PublicThemeRenderer
// mounted in the operator's own tab alongside PollingManager). A different tab
// in the same browser profile is covered instead by a `storage` event on the
// bust key (publicCacheBustKey). A separate-process OBS Browser Source gets
// neither and self-heals via the identity guards in readCachedBulk + the
// always-run HTTP fetch + socket hydration.
export const PUBLIC_CACHE_INVALIDATION_EVENT = 'public-overlay-cache-invalidated';

const STATIC_PREFIX = 'pubCache:v1:static:';
const LIVE_PREFIX = 'pubCache:v1:live:';
const BUST_PREFIX = 'pubCache:v1:bust:';

const staticKey = (tournamentId: string, roundId: string) =>
  `${STATIC_PREFIX}${tournamentId}:${roundId}`;

const liveKey = (
  tournamentId: string,
  roundId: string,
  matchId: string | undefined,
  view: string,
  followSelected: boolean
) => `${LIVE_PREFIX}${tournamentId}:${roundId}:${matchId || ''}:${view}:${followSelected}`;

export const publicCacheBustKey = (tournamentId: string, roundId: string) =>
  `${BUST_PREFIX}${tournamentId}:${roundId}`;

// Every cached slice is wrapped in this so the reader can prove identity before
// painting. A raw slice carries no context and could be seeded into the wrong
// overlay after a followSelected match switch or a stale reload.
interface CacheEnvelope<T> {
  v: 1;
  tournamentId: string;
  roundId: string;
  matchId?: string;
  view?: string;
  followSelected?: boolean;
  createdAt: number;
  payload: T;
}

interface StaticSlice {
  tournamentData: any;
  roundData: any;
  matchesList: any[];
}

interface LiveSlice {
  matchesCurrent: any;
  effectiveMatchId: any;
  matchDatasData: any[];
  currentMatchData: any;
  overallData: any;
}

export interface CachedBulk {
  tournamentData: any;
  roundData: any;
  matchesData: { list: any[]; current: any; effectiveMatchId: any };
  matchDatasData: any[];
  currentMatchData: any;
  overallData: any;
}

export interface CachedBulkResult {
  bulk: CachedBulk;
  // Whether the LIVE tier specifically hit, as opposed to matchDatasData/
  // currentMatchData/overallData/matchesData.current merely defaulting to
  // null/[] because that tier missed or was rejected for identity/freshness.
  // Callers that need live-tier fields for the current view must not treat a
  // static-only hit as a complete result — see PublicThemeRenderer.tsx.
  liveHit: boolean;
}

// Timestamp of the last invalidatePublicCache for this round (0 if never).
// Any slice created at or before this instant is refused on read — this is
// what makes a polling toggle survive a hard OBS Browser Source reload: the
// slice written before the toggle is on disk with an older createdAt and is
// rejected instead of painted.
export function readPublicCacheBust(tournamentId: string, roundId: string): number {
  const ts = getCache<number>(publicCacheBustKey(tournamentId, roundId), Number.MAX_SAFE_INTEGER, 'local');
  return typeof ts === 'number' && Number.isFinite(ts) ? ts : 0;
}

// Reads one envelope and validates it against what the caller actually asked
// for. Any mismatch (wrong tournament/round/match/view/followSelected, wrong
// version, older than the last invalidation) -> drop the entry and return
// null. Malformed data is never repaired.
function readEnvelope<T>(
  key: string,
  ttlMs: number,
  expect: {
    tournamentId: string;
    roundId: string;
    matchId?: string;
    view?: string;
    followSelected?: boolean;
    bustAt: number;
  }
): T | null {
  const env = getCache<CacheEnvelope<T>>(key, ttlMs, 'local');
  if (!env) return null;

  if (env.v !== 1 || typeof env.createdAt !== 'number' || env.payload == null) {
    removeCache(key, 'local');
    return null;
  }
  if (env.createdAt <= expect.bustAt) {
    removeCache(key, 'local');
    return null;
  }
  if (
    String(env.tournamentId) !== String(expect.tournamentId) ||
    String(env.roundId) !== String(expect.roundId) ||
    (expect.matchId !== undefined && String(env.matchId ?? '') !== String(expect.matchId ?? '')) ||
    (expect.view !== undefined && env.view !== expect.view) ||
    (expect.followSelected !== undefined && !!env.followSelected !== !!expect.followSelected)
  ) {
    removeCache(key, 'local');
    return null;
  }
  return env.payload;
}

// Reassembles a bulk-shaped object from whichever tier(s) are still fresh AND
// pass identity validation — the same shape applyBulkPayload() expects from a
// live fetch, so PublicThemeRenderer seeds from it with no special-casing.
// Returns null only when NEITHER tier has anything usable.
export function readCachedBulk(
  tournamentId: string,
  roundId: string,
  matchId: string | undefined,
  view: string,
  followSelected: boolean
): CachedBulkResult | null {
  const bustAt = readPublicCacheBust(tournamentId, roundId);

  const staticSlice = readEnvelope<StaticSlice>(staticKey(tournamentId, roundId), STATIC_TTL_MS, {
    tournamentId,
    roundId,
    bustAt,
  });

  // The live tier is a visual first-frame seed only, never authoritative:
  //   - followSelected overlays: the key can't encode which match was actually
  //     effective when the slice was written, so its roster might belong to a
  //     different match entirely -> never seed live state from cache.
  //   - fixed-match overlays: the key pins matchId, but still cross-check the
  //     slice's OWN embedded matchId before trusting it (defends against a key
  //     collision / a hand-mangled localStorage entry).
  let liveSlice: LiveSlice | null = null;
  if (!followSelected) {
    const lKey = liveKey(tournamentId, roundId, matchId, view, followSelected);
    liveSlice = readEnvelope<LiveSlice>(lKey, LIVE_TTL_MS, {
      tournamentId,
      roundId,
      matchId,
      view,
      followSelected,
      bustAt,
    });
    const embeddedMatchId =
      liveSlice?.effectiveMatchId ??
      liveSlice?.currentMatchData?.matchData?.matchId ??
      null;
    if (
      liveSlice &&
      matchId &&
      embeddedMatchId != null &&
      String(embeddedMatchId) !== String(matchId)
    ) {
      removeCache(lKey, 'local');
      liveSlice = null;
    }
  }

  console.log('[public-cache]', 'READ', {
    tournamentId,
    roundId,
    matchId,
    view,
    followSelected,
    staticHit: !!staticSlice,
    liveHit: !!liveSlice,
    bustAt,
  });

  if (!staticSlice && !liveSlice) return null;

  return {
    bulk: {
      tournamentData: staticSlice?.tournamentData ?? null,
      roundData: staticSlice?.roundData ?? null,
      matchesData: {
        list: staticSlice?.matchesList ?? [],
        current: liveSlice?.matchesCurrent ?? null,
        effectiveMatchId: liveSlice?.effectiveMatchId ?? null,
      },
      matchDatasData: liveSlice?.matchDatasData ?? [],
      currentMatchData: liveSlice?.currentMatchData ?? null,
      overallData: liveSlice?.overallData ?? null,
    },
    liveHit: liveSlice != null,
  };
}

// Wipes both tiers for a round (every match/view/followSelected combo the live
// key scheme can produce) AND records the invalidation instant so a slice
// already on disk when an OBS Browser Source hard-reloads AFTER this call is
// rejected too (readEnvelope's createdAt <= bustAt check). Then notifies:
//   - the same document, via CustomEvent (operator preview tab), and
//   - other tabs in the same browser profile, via the `storage` event that
//     writing the bust key fires.
// Called immediately on a polling toggle (isPolling.tsx), before AND after the
// server PATCH — see that call site for why the pre-PATCH call matters.
export function invalidatePublicCache(tournamentId: string, roundId: string): void {
  clearCacheByPrefix(`${STATIC_PREFIX}${tournamentId}:${roundId}`, 'local');
  clearCacheByPrefix(`${LIVE_PREFIX}${tournamentId}:${roundId}:`, 'local');

  setCache(publicCacheBustKey(tournamentId, roundId), Date.now(), 'local');

  try {
    window.dispatchEvent(
      new CustomEvent(PUBLIC_CACHE_INVALIDATION_EVENT, {
        detail: { tournamentId, roundId },
      })
    );
  } catch {
    // non-DOM context (tests / SSR) — nothing to notify
  }

  console.log('[public-cache]', 'INVALIDATED', { tournamentId, roundId });
}

// Write-through after a real fetch succeeds. Deliberately never called from the
// socket tick handlers (liveMatchUpdate/overallDataUpdate can arrive every
// ~150ms) — this cache only needs to be fresh enough for one first-paint frame
// after a reload, not live-accurate on every tick. The caller (PublicThemeRenderer)
// must additionally gate this on its in-memory cacheGeneration so a fetch that
// started before an invalidation can't repopulate what the invalidation wiped.
export function writeCachedBulk(
  tournamentId: string,
  roundId: string,
  matchId: string | undefined,
  view: string,
  followSelected: boolean,
  bulk: CachedBulk
): void {
  const now = Date.now();

  const staticEnv: CacheEnvelope<StaticSlice> = {
    v: 1,
    tournamentId,
    roundId,
    createdAt: now,
    payload: {
      tournamentData: bulk.tournamentData ?? null,
      roundData: bulk.roundData ?? null,
      matchesList: bulk.matchesData?.list ?? [],
    },
  };
  setCache(staticKey(tournamentId, roundId), staticEnv, 'local');

  const liveEnv: CacheEnvelope<LiveSlice> = {
    v: 1,
    tournamentId,
    roundId,
    matchId: matchId || undefined,
    view,
    followSelected,
    createdAt: now,
    payload: {
      matchesCurrent: bulk.matchesData?.current ?? null,
      effectiveMatchId: bulk.matchesData?.effectiveMatchId ?? null,
      matchDatasData: bulk.matchDatasData ?? [],
      currentMatchData: bulk.currentMatchData ?? null,
      overallData: bulk.overallData ?? null,
    },
  };
  setCache(liveKey(tournamentId, roundId, matchId, view, followSelected), liveEnv, 'local');
}
