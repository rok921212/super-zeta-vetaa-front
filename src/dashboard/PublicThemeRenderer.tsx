import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  readCachedStatic,
  writeCachedStatic,
  publicCacheBustKey,
  PUBLIC_CACHE_INVALIDATION_EVENT,
} from './publicCache.ts';
import { registerOverlaySW } from './registerOverlaySW.ts';
import { useOverlaySyncTarget } from './overlaySync.ts';
import { useOverlayEngine, useEngineEvent } from '../overlayClient/react.ts';
import { createAppTransport } from '../overlayClient/appTransport.ts';
import { viewNeedsLiveTier } from '../overlayClient/viewTiers.ts';
import type { EngineOptions } from '../overlayClient/engineTypes.ts';

// Theme component registry (require.context over Themes/ThemeN/{on,off}-screen)
// lives in Themes/registry.ts, shared with the Designer's built-in graphics.
import { resolveComponent, AVAILABLE_THEMES } from '../Themes/registry.ts';
import TeamSlotsObserver from '../Themes/shared/components/TeamSlotsObserver.tsx';
import { useRankingReplay } from '../Themes/shared/hooks/rankingPager.ts';


// ============================================================================
// Live data
// ============================================================================
// Everything protocol-related — bulk hydration, socket join/rejoin, protobuf
// delta merge, seq-gap/stall snapshot recovery, the publicRev gate, structure
// and invalidation refetches, the followSelected match boundary — is the
// shared overlay engine (overlayClient/engine.ts), the SAME code the external
// SDK and the Designer run. This component only adds what is specific to the
// built-in themes: the localStorage shell cache, "swap the view only once its
// data is in hand", and the public-cache invalidation listeners.
//
// Backpack info (Upper / mvp) is not fetched: the backend route is a stub that
// always returns an empty list, and the old per-tick fetch was already
// disabled behind BACKPACK_ENABLED=false. Themes receive `backpackInfo: null`,
// exactly as before.

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

const PublicThemeRenderer: React.FC = () => {
  // /public/live/:overlayKey is a permanent link: no tournament, round or
  // match in the URL, only the account's overlay key.
  const { tournamentId: urlTournamentId, roundId: urlRoundId, matchId: urlMatchId, overlayKey } = useParams<{
    tournamentId: string;
    roundId: string;
    matchId: string;
    overlayKey: string;
  }>();
  const [searchParams] = useSearchParams();
  const requestedTheme = searchParams.get('theme') || 'Theme1';
  const view = searchParams.get('view') || 'Lower';
  // Observer panel (DisplayHud's Team Slots tile): not a theme view. Its link
  // carries view=LiveStats so the backend and relay send it exactly the
  // LiveStats feed, with no new view key to mirror in their tier lists.
  const teamSlotsPanel = searchParams.get('panel') === 'teamSlots';

  // SYNC OVERLAY: if this link's account has a sync target set, render that
  // round instead of the one in the URL (overlaySync.ts). Everything below
  // works off these effective ids; with no target they ARE the URL's ids.
  const sync = useOverlaySyncTarget(urlTournamentId, urlRoundId, overlayKey);
  const { tournamentId, roundId } = sync;
  // A redirected link's match id / schedule picks belong to the URL's round,
  // not the one being shown — follow the target round's own selection.
  const matchId = sync.redirected ? undefined : urlMatchId;
  const followSelected = sync.redirected
    || (searchParams.get('followSelected') || 'false').toLowerCase() === 'true';
  const selectedScheduleMatchIds = sync.redirected
    ? sync.scheduleMatches
    : searchParams.get('scheduleMatches')?.split(',') || [];

  // Silently fall back to Theme1 for an unknown/unbuilt theme (e.g. a stale
  // ?theme=Theme2 link) rather than rendering nothing.
  const theme = AVAILABLE_THEMES.includes(requestedTheme) ? requestedTheme : 'Theme1';

  // What's actually rendered right now — deliberately decoupled from the
  // `view`/`theme` TARGET above. It only follows once the engine has applied
  // a fetch made for the new target (the bulkApplied handler below), so a
  // switch never shows a blank/loading frame or a wrong-shaped render: the old
  // view stays up, unchanged, until the new one is ready, then both flip.
  const [displayedView, setDisplayedView] = useState(view);
  const [displayedTheme, setDisplayedTheme] = useState(theme);
  const getComp = (key: string) => resolveComponent(displayedTheme, key);
  // Changes when a page is picked on DisplayHud: the ranking is mounted again
  // and plays its animation on that page (rankingPager.ts).
  const rankingReplay = useRankingReplay(displayedView);

  // Static shell (tournament / round / matches list) from localStorage, read
  // once per round (mount, or a SYNC OVERLAY redirect), so header/branding
  // paint on the first frame after a hard OBS reload. Never live data — see
  // publicCache.ts.
  const initialStaticCache = useMemo(() => {
    if (!tournamentId || !roundId) return null;
    return readCachedStatic(tournamentId, roundId);
  }, [tournamentId, roundId]);

  // Register the overlay service worker (front/public/overlay-sw.js). It
  // cache-firsts the app shell + <img>/font assets so a hard OBS Browser
  // Source reload paints branding/logos/art from disk even offline. It never
  // touches the data path (/api, /public/bulk, /socket.io).
  useEffect(() => {
    registerOverlaySW();
  }, []);

  const engineOptions = useMemo<EngineOptions | null>(() => {
    if (!tournamentId || !roundId) return null;
    return {
      tournamentId,
      roundId,
      matchId: matchId || null,
      followSelected,
      view,
      // Echoed back on bulkApplied: the theme that fetch was made for.
      tag: theme,
      verbose: true,
      debug: DEBUG_PUBLIC_CACHE,
      initial: initialStaticCache
        ? {
            tournament: initialStaticCache.tournamentData,
            round: initialStaticCache.roundData,
            matches: initialStaticCache.matchesList,
          }
        : undefined,
    };
  }, [tournamentId, roundId, matchId, followSelected, view, theme, initialStaticCache]);

  const makeTransport = useCallback(() => createAppTransport(), []);
  const { state, engine } = useOverlayEngine(engineOptions, makeTransport);

  // A bulk fetch landed (past the engine's generation + revision guards):
  // write the static shell through, then flip what's on screen to the
  // view/theme that fetch was for.
  useEngineEvent(engine, 'bulkApplied', (ev) => {
    if (!engine || !tournamentId || !roundId) return;
    const s = engine.getState();
    // Identity check: around a SYNC OVERLAY redirect the engine can still be
    // holding the previous round for a moment — never file that under the new ids.
    if (s.round?._id == null || String(s.round._id) === String(roundId)) {
      writeCachedStatic(tournamentId, roundId, {
        tournamentData: s.tournament ?? null,
        roundData: s.round ?? null,
        matchesList: s.matches ?? [],
      });
    }
    if (ev.payload?.view) setDisplayedView(ev.payload.view);
    if (typeof ev.payload?.tag === 'string') setDisplayedTheme(ev.payload.tag);
  });

  // Cross-component / cross-tab public-cache invalidation (a polling toggle,
  // PollingManager -> this overlay): the CustomEvent on the same document and
  // the `storage` event from a sibling tab. A separate-process OBS source gets
  // neither and self-heals via readCachedStatic's guard + the engine's own
  // socket/HTTP stream. Drops all live state and re-hydrates quietly.
  useEffect(() => {
    if (!engine || !tournamentId || !roundId) return;
    const onInvalidated = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (String(detail.tournamentId) === String(tournamentId) && String(detail.roundId) === String(roundId)) {
        engine.hardReset();
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === publicCacheBustKey(tournamentId, roundId)) engine.hardReset();
    };
    window.addEventListener(PUBLIC_CACHE_INVALIDATION_EVENT, onInvalidated as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PUBLIC_CACHE_INVALIDATION_EVENT, onInvalidated as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [engine, tournamentId, roundId]);

  // Until the engine has published, paint from the static shell.
  const tournament = state?.tournament ?? initialStaticCache?.tournamentData ?? null;
  const round = state?.round ?? initialStaticCache?.roundData ?? null;
  const matches = state?.matches ?? initialStaticCache?.matchesList ?? [];
  const match = state?.match ?? null;
  const matchData = state?.matchData ?? null;
  const deadTeamList = state?.deadTeamList ?? [];
  const overallData = state?.overallData ?? null;
  const matchDatas = state?.matchDatas ?? [];
  const backpackInfo = null;

  // Placeholder until the first fetch settles — UNLESS the static shell is
  // cached and this view needs no live-tier data (Lower / CommingUpNext),
  // which renders fully from static state immediately.
  const firstFetchPending = !state || state.status.loading;
  const loading = firstFetchPending && (!initialStaticCache || viewNeedsLiveTier(displayedView));
  const error = state?.status.error ? 'Failed to load tournament data' : null;

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
      const { key: mountKey, ...rest } = props;
      return <Comp key={mountKey} {...rest} />;
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
        return renderComp('MatchData', { key: rankingReplay, tournament, round, match, matchData });
      case 'MatchFragrs':
        return renderComp('MatchFragrs', { tournament, round, match, matchData });
      case 'WwcdSummary':
        return renderComp('WwcdSummary', { tournament, round, match, matchData });
      case 'WwcdStats':
        return renderComp('WwcdStats', { tournament, round, match, matchData });
      case 'OverAllData':
        return renderComp('OverallData', { key: rankingReplay, tournament, round, match, matchData, overallData, matches, matchDatas });
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

  // Fills its tab / OBS dock instead of the fixed 1920px overlay canvas.
  if (teamSlotsPanel) {
    return (
      <TeamSlotsObserver
        round={round}
        matchData={matchData}
        overallData={overallData}
        transparent={searchParams.get('transparent') === '1'}
      />
    );
  }

  return (
    <div style={{ width: '1920px', height: '1400px', top: 0, left: 0, margin: 0, padding: 0, overflow: 'hidden' }}>
      {renderView()}
    </div>
  );
};

export default PublicThemeRenderer;
