// Which props each built-in theme view gets, shared by PublicThemeRenderer (the
// OBS overlay) and the home page simulator, so a view renders with exactly the
// same data in both.

import React from 'react';
import { resolveComponent } from '../Themes/registry.ts';

export const PLACEHOLDER_STYLE: React.CSSProperties = {
  width: '100%',
  height: '100%',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '24px',
};

export interface ThemeViewData {
  tournament: any;
  round: any;
  match: any;
  matchData: any;
  matches: any[];
  matchDatas: any[];
  overallData: any;
  deadTeamList: any[];
  backpackInfo: any;
  selectedScheduleMatchIds: string[];
  /** Remount key for the ranking views (rankingPager.ts). */
  rankingReplay?: React.Key;
  loading?: boolean;
  error?: string | null;
}

/** The component file each view renders, where its name differs from the view key (the switch below). */
const VIEW_COMPONENT: Record<string, string> = {
  OverAllData: 'OverallData', '1stRunnerUp': 'FirstRunnerUp', '2ndRunnerUp': 'SecondRunnerUp', playerH2H: 'PlayerH2H',
  intro: 'Intro', mapPreview: 'MapPreview', slots: 'Slots', mvp: 'Mvp', highlightPoints: 'HighlightPoints',
};

/** Whether `theme` has a component for `view` (so a picker can leave the view out). */
export function themeHasView(view: string, theme: string): boolean {
  return !!resolveComponent(theme, VIEW_COMPONENT[view] || view);
}

/** The theme's component for `view` with its props, or an in-place message when the theme lacks it. */
export function renderThemeView(view: string, theme: string, d: ThemeViewData): React.ReactNode {
  const {
    tournament, round, match, matchData, matches, matchDatas, overallData, deadTeamList, backpackInfo,
    selectedScheduleMatchIds, rankingReplay, loading, error,
  } = d;

  // Renders the resolved component for `key`, or a clear in-place message
  // instead of crashing when a theme has no matching component.
  const renderComp = (key: string, props: Record<string, any>) => {
    const Comp = resolveComponent(theme, key);
    if (!Comp) {
      return <div style={PLACEHOLDER_STYLE}>"{view}" isn't available on {theme}.</div>;
    }
    const { key: mountKey, ...rest } = props;
    // Theme views load on demand (Themes/registry.ts); nothing shows until the chunk arrives.
    return <React.Suspense key={mountKey} fallback={null}><Comp {...rest} /></React.Suspense>;
  };

  switch (view) {
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
      return <div style={PLACEHOLDER_STYLE}>View "{view}" not implemented yet.</div>;
  }
}
