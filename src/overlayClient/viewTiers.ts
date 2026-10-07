// Which built-in view needs which live-data tier.
//
// HAND-MIRRORED with Render_hosted/test-back/utils/viewDataTiers.js and
// desktop-app/relay/server.cjs (three repos, no shared tooling). This is the
// ONE front-side copy — PublicThemeRenderer and the engine both import it.

export const VIEWS_NEEDING_OVERALL = new Set([
  'OverAllData', 'OverallFrags', 'LiveStats', '1stRunnerUp', '2ndRunnerUp', 'EventMvp', 'highlightPoints',
  'Champions',
]);

export const VIEWS_NEEDING_MATCH_DATA = new Set([
  'Upper', 'Dom', 'Alerts', 'LiveStats', 'LiveFrags', 'MatchData', 'Achive', 'MatchFragrs',
  'WwcdSummary', 'WwcdStats', 'playerH2H', 'mapPreview', 'slots', 'TeamH2H', 'mvp',
  'RosterShowCase', 'MatchSummary', 'Champions', '1stRunnerUp', '2ndRunnerUp', 'EventMvp',
  'PlayerSwitch', 'LiveData', 'Recall',
]);

export const VIEWS_NEEDING_ALL_MATCH_DATAS = new Set([
  'Schedule', 'highlightPoints', 'HighlightSchedule', 'OverAllData', 'OverallFrags',
  'EventMvp', 'Champions', '1stRunnerUp', '2ndRunnerUp', 'Achive',
]);

/** A null view (SDK / Designer runtime) means "the full feed" — every tier. */
export const viewNeedsMatchData = (view: string | null | undefined): boolean =>
  view == null || view === '' || VIEWS_NEEDING_MATCH_DATA.has(view);

export const viewNeedsOverall = (view: string | null | undefined): boolean =>
  view == null || view === '' || VIEWS_NEEDING_OVERALL.has(view);

export const viewNeedsLiveTier = (view: string | null | undefined): boolean =>
  view == null || view === '' ||
  VIEWS_NEEDING_OVERALL.has(view) || VIEWS_NEEDING_MATCH_DATA.has(view) || VIEWS_NEEDING_ALL_MATCH_DATAS.has(view);
