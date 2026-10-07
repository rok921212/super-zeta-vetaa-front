/* ============================================================================
   THEME COMPONENT REGISTRY (shared by PublicThemeRenderer and the Designer)
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
   with CRA/webpack). Under Jest it doesn't exist: the registry is then empty
   unless a test installs one with `setThemeRegistryForTests()`. If this
   project ever moves to Vite, replace it with an eager import.meta.glob.
   ============================================================================ */

import type React from 'react';

export type ComponentRegistry = Record<string, Record<string, React.ComponentType<any>>>;

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

export const canonicalize = (fileBase: string): string => {
  const lower = fileBase.toLowerCase();
  return KEY_ALIASES[lower] || lower;
};

const FILE_RE = /^\.\/(Theme\d+)\/(on-screen|off-screen)\/(.+)\.tsx$/;

function buildRegistry(): { registry: ComponentRegistry; screens: Record<string, 'on-screen' | 'off-screen'> } {
  const registry: ComponentRegistry = {};
  const screens: Record<string, 'on-screen' | 'off-screen'> = {};
  // require.context must stay a DIRECT call so webpack can resolve it
  // statically. Jest (JEST_WORKER_ID set) has no require.context: skip it.
  const themeFiles = process.env.JEST_WORKER_ID
    ? null
    // @ts-ignore -- require.context is injected by webpack, not a real Node API
    : require.context('./', true, /\/(on-screen|off-screen)\/.+\.tsx$/);
  if (!themeFiles) return { registry, screens };
  themeFiles.keys().forEach((path: string) => {
    // path shape: "./Theme1/on-screen/Lower.tsx"
    const match = path.match(FILE_RE);
    if (!match) return;
    const [, themeName, screen, fileBase] = match;
    const mod = themeFiles(path);
    const Component = mod?.default;
    if (!Component) return; // no default export — skip rather than register `undefined`
    const key = canonicalize(fileBase);
    registry[themeName] ||= {};
    registry[themeName][key] = Component;
    screens[`${themeName}/${key}`] = screen as 'on-screen' | 'off-screen';
  });
  return { registry, screens };
}

let built = buildRegistry();

export let THEME_REGISTRY: ComponentRegistry = built.registry;
export let AVAILABLE_THEMES: string[] = Object.keys(THEME_REGISTRY);

/** Tests only (Jest has no require.context): install a registry built from the filesystem. */
export function setThemeRegistryForTests(registry: ComponentRegistry, screens: Record<string, 'on-screen' | 'off-screen'> = {}): void {
  built = { registry, screens };
  THEME_REGISTRY = registry;
  AVAILABLE_THEMES = Object.keys(registry);
}

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

export function resolveComponent(theme: string, rawKey: string): React.ComponentType<any> | null {
  const key = rawKey.toLowerCase();
  const themeSet = THEME_REGISTRY[theme] || THEME_REGISTRY['Theme1'];

  if (themeSet?.[key]) return themeSet[key];

  const fb = FALLBACKS[key];
  if (fb?.sameTheme && themeSet?.[fb.sameTheme]) return themeSet[fb.sameTheme];
  if (fb?.theme && fb?.key) return THEME_REGISTRY[fb.theme]?.[fb.key] || null;

  return null;
}

// ── Designer: every built-in graphic as an insertable element ───────────────

/** Human labels for canonical registry keys (the files' own names otherwise). */
const LABELS: Record<string, string> = {
  alerts: 'Elimination Alerts', lower: 'Lower Third', upper: 'Upper Third', dom: 'Dominator', intro: 'Intro',
  livestats: 'Live Stats', livefrags: 'Live Frags', livedata: 'Live Data', recall: 'Recall', achive: 'Player Summary',
  overalldata: 'Overall Standings', overallfrags: 'Overall Frags', mvp: 'MVP', wwcdstats: 'WWCD Stats',
  wwcdsummary: 'WWCD Summary', matchsummary: 'Match Summary', matchdata: 'Match Data', matchfragrs: 'Match Fraggers',
  playerh2h: 'Player H2H', teamh2h: 'Team H2H', champions: 'Champions', firstrunnerup: '1st Runner Up',
  secondrunnerup: '2nd Runner Up', eventmvp: 'Event MVP', commingupnext: 'Up Next', highlightpoints: 'Highlight Points',
  highlightschedule: 'Highlight Schedule', schedule: 'Schedule', slots: 'Slots', rostershowcase: 'Roster Showcase',
  playerswitch: 'Player Switch', mappreview: 'Map Preview',
};

/** Which view uses which schedule/event group (for the browser's grouping). */
const GROUP: Record<string, string> = {
  alerts: 'On-air', lower: 'On-air', upper: 'On-air', dom: 'On-air', intro: 'On-air', livestats: 'On-air', livefrags: 'On-air',
  livedata: 'On-air', recall: 'On-air', achive: 'Post match', overalldata: 'Overall', overallfrags: 'Overall',
  mvp: 'Post match', wwcdstats: 'Post match', wwcdsummary: 'Post match', matchsummary: 'Post match', matchdata: 'Post match',
  matchfragrs: 'Post match', playerh2h: 'Post match', teamh2h: 'Post match', champions: 'Awards', firstrunnerup: 'Awards',
  secondrunnerup: 'Awards', eventmvp: 'Awards', commingupnext: 'Pre-match', highlightpoints: 'Pre-match', slots: 'Pre-match',
  rostershowcase: 'Pre-match', playerswitch: 'Pre-match', mappreview: 'Pre-match', schedule: 'Schedule', highlightschedule: 'Schedule',
};

export interface BuiltinGraphic {
  theme: string;
  /** Canonical registry key (lowercase), stored in the layout as builtin.view. */
  view: string;
  label: string;
  group: string;
  screen: 'on-screen' | 'off-screen' | null;
}

export const builtinLabel = (view: string): string =>
  LABELS[view] || view.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** Every built-in graphic that exists on disk, theme by theme. */
export function listBuiltinGraphics(): BuiltinGraphic[] {
  const out: BuiltinGraphic[] = [];
  const themes = Object.keys(THEME_REGISTRY).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
  for (const theme of themes) {
    for (const view of Object.keys(THEME_REGISTRY[theme]).sort()) {
      out.push({ theme, view, label: builtinLabel(view), group: GROUP[view] || 'Other', screen: built.screens[`${theme}/${view}`] ?? null });
    }
  }
  return out;
}

/**
 * Props for a built-in graphic. PublicThemeRenderer passes each view a
 * subset of these engine slices; components ignore props they don't use,
 * so the Designer passes the full set (same values, same engine).
 */
export function builtinProps(s: {
  tournament?: any; round?: any; match?: any; matches?: any[]; matchData?: any; overallData?: any;
  matchDatas?: any[]; deadTeamList?: any[];
}): Record<string, any> {
  const matches = s.matches ?? [];
  return {
    tournament: s.tournament ?? null,
    round: s.round ?? null,
    match: s.match ?? null,
    matches,
    totalMatches: matches.length,
    matchData: s.matchData ?? null,
    overallData: s.overallData ?? null,
    matchDatas: s.matchDatas ?? [],
    deadTeamList: s.deadTeamList ?? [],
    backpackInfo: null,
    // Schedule views: every match of the round (the operator picks a subset in DisplayHud).
    selectedScheduleMatches: matches.map((m: any) => m?._id).filter(Boolean),
    loading: false,
    error: null,
  };
}
