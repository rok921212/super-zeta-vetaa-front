// The overlay views DisplayHud offers, shared with the Designer (a custom
// theme's slots use these same keys). Keep the flat key list in step with
// Render_hosted/test-back/controller/customTheme.controller.js VIEW_KEYS.
//
// `themes` on a view restricts which BUILT-IN themes show that tile at all.
// Omit it and the view is assumed universal. This is what stops an operator
// from generating a link PublicThemeRenderer has no component for (e.g.
// Player Summary / Live Data only exist on Theme6+).

export interface OverlayView { key: string; label: string; themes?: string[] }
export interface OverlayViewGroup { id: string; label: string; hint: string; requires: 'live' | 'schedule'; views: OverlayView[] }

export const VIEW_GROUPS: OverlayViewGroup[] = [
  {
    id: 'match', label: 'On-air', hint: 'Live match overlays', requires: 'live',
    views: [
      { key: 'Alerts', label: 'Alerts' },
      { key: 'Lower', label: 'Lower Third' },
      { key: 'Upper', label: 'Upper Third' },
      { key: 'Dom', label: 'Dominator' },
      { key: 'intro', label: 'Intro' },
      { key: 'LiveStats', label: 'Live Stats' },
      { key: 'LiveFrags', label: 'Live Frags' },
      { key: 'LiveData', label: 'Live Data', themes: ['Theme6', 'Theme7', 'Theme8'] },
      { key: 'Recall', label: 'Recall', themes: ['Theme6', 'Theme7', 'Theme8'] },
    ],
  },
  {
    id: 'overall', label: 'Post match — overall', hint: 'Tournament-wide standings', requires: 'live',
    views: [
      { key: 'OverAllData', label: 'Overall Data' },
      { key: 'OverallFrags', label: 'Overall Frags' },
    ],
  },
  {
    id: 'h2h', label: 'Post match — this match', hint: 'Results for the selected match', requires: 'live',
    views: [
      { key: 'mvp', label: 'MVP' },
      { key: 'Achive', label: 'Player Summary', themes: ['Theme6', 'Theme7', 'Theme8'] },
      { key: 'WwcdStats', label: 'WWCD Stats' },
      { key: 'WwcdSummary', label: 'WWCD Summary' },
      { key: 'MatchSummary', label: 'Match Summary' },
      { key: 'MatchData', label: 'Match Data' },
      { key: 'MatchFragrs', label: 'Match Fraggers' },
      { key: 'playerH2H', label: 'Player H2H' },
      { key: 'TeamH2H', label: 'Team H2H' },
    ],
  },
  {
    id: 'awards', label: 'Awards', hint: 'Podium & trophy screens', requires: 'live',
    views: [
      { key: 'Champions', label: 'Champions' },
      { key: '1stRunnerUp', label: '1st Runner Up' },
      { key: '2ndRunnerUp', label: '2nd Runner Up' },
      { key: 'EventMvp', label: 'Event MVP' },
    ],
  },
  {
    id: 'broadcast', label: 'Pre-match', hint: 'Before the match goes live', requires: 'live',
    views: [
      { key: 'CommingUpNext', label: 'Up Next' },
      { key: 'highlightPoints', label: 'Highlight Points' },
      { key: 'slots', label: 'Slots' },
      { key: 'RosterShowCase', label: 'Roster Showcase' },
      { key: 'PlayerSwitch', label: 'Player Switch', themes: ['Theme4', 'Theme5', 'Theme6', 'Theme7', 'Theme8'] },
    ],
  },
  {
    id: 'schedule', label: 'Schedule', hint: 'Uses the matches checked below', requires: 'schedule',
    views: [
      { key: '__schedule', label: 'Schedule' },
      { key: '__highlight', label: 'Highlight Schedule' },
    ],
  },
];

/** Extra free slots for brand-new overlays that have no built-in equivalent. */
export const CUSTOM_VIEWS: OverlayView[] = Array.from({ length: 9 }, (_, i) => ({ key: `Custom${i + 1}`, label: `Custom ${i + 1}` }));

/**
 * The desktop app's tools. A design in one of these slots replaces that tool
 * in the desktop app, which draws it itself on the local game feed
 * (graphics/bindings/local.ts). They are not website overlays, so they are
 * not in VIEW_GROUPS and DisplayHud shows no tile for them.
 */
export const DESKTOP_VIEWS: OverlayView[] = [
  { key: 'DesktopMap', label: 'Desktop · Map' },
  { key: 'DesktopBattleBar', label: 'Desktop · Battle Bar' },
  { key: 'DesktopObserving', label: 'Desktop · Observing Player' },
  { key: 'DesktopMapTimer', label: 'Desktop · Zone Timer' },
  { key: 'DesktopTeamSlots', label: 'Desktop · Team Slots' },
];

/** Every view a custom-theme slot can use (no schedule views: those are built-in only). */
export const VIEW_OPTIONS: OverlayView[] = [
  ...VIEW_GROUPS.filter((g) => g.id !== 'schedule').flatMap((g) => g.views.map(({ key, label }) => ({ key, label }))),
  ...CUSTOM_VIEWS,
  ...DESKTOP_VIEWS,
];

export const viewLabel = (key: string): string => VIEW_OPTIONS.find((v) => v.key === key)?.label || key;

/** Best-guess slot for a layout from its name (template names map naturally). */
export function guessViewKey(name: string): string {
  const n = name.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/desktop.*map(?!.*timer)|minimap/, 'DesktopMap'], [/battle ?bar/, 'DesktopBattleBar'], [/observ/, 'DesktopObserving'],
    [/zone ?timer|map ?timer/, 'DesktopMapTimer'], [/team ?slots/, 'DesktopTeamSlots'],
    [/lower/, 'Lower'], [/upper|match header|header/, 'Upper'], [/kill ?feed|alert|elimination/, 'Alerts'],
    [/live ?stand|live ?stat/, 'LiveStats'], [/frag/, 'LiveFrags'], [/mvp/, 'mvp'], [/overall/, 'OverAllData'],
    [/player ?card|summary/, 'MatchSummary'], [/intro/, 'intro'], [/up ?next|coming/, 'CommingUpNext'],
    [/champion/, 'Champions'], [/wwcd/, 'WwcdStats'], [/roster/, 'RosterShowCase'], [/dominat/, 'Dom'],
  ];
  return rules.find(([re]) => re.test(n))?.[1] || 'Custom1';
}
