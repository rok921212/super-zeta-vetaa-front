// Design categories: the ten built-in ones (constants in the shared schema)
// plus the ones the account made itself. A category is metadata on a design,
// never part of its identity: a design keeps its id whatever it is filed under.

import { useCallback, useMemo } from 'react';
import { DESIGN_CATEGORIES } from '../schema/layoutSchema.js';
import type { DesignCategory } from '../schema/layoutTypes.ts';
import { categoriesApi, type CategoryInfo } from '../api.ts';
import { CACHE_KEYS, useCached } from '../requestCache.ts';

export const BUILTIN_CATEGORIES = DESIGN_CATEGORIES as DesignCategory[];
export const UNCATEGORISED = 'none';

export interface CategoryOption { id: string; label: string; custom: boolean }

export interface Categories {
  /** Built-in first, then the account's own by name. */
  all: CategoryOption[];
  custom: CategoryInfo[];
  /** "Uncategorised" for null / an id that no longer exists. */
  labelOf(id: string | null | undefined): string;
  /** Null while loading; a message when the account's own categories could not be loaded. */
  error: string | null;
  reload(): Promise<unknown>;
}

export function categoryOptions(custom: CategoryInfo[]): CategoryOption[] {
  return [
    ...BUILTIN_CATEGORIES.map((c) => ({ id: c.id, label: c.label, custom: false })),
    ...custom.map((c) => ({ id: c._id, label: c.name, custom: true })),
  ];
}

export function useCategories(): Categories {
  const q = useCached<CategoryInfo[]>(CACHE_KEYS.categories, () => categoriesApi.list());
  const custom = useMemo(() => q.data || [], [q.data]);
  const all = useMemo(() => categoryOptions(custom), [custom]);
  const labelOf = useCallback((id: string | null | undefined) => all.find((c) => c.id === id)?.label || 'Uncategorised', [all]);
  // The built-in categories always work; only the account's own need the server.
  const error = q.error && !q.data ? 'Your own categories could not be loaded' : null;
  return { all, custom, labelOf, error, reload: q.reload };
}

/** A category the gallery's templates are filed under, by the overlay view they are made for. */
const VIEW_CATEGORY: Record<string, string> = {
  Lower: 'lower-thirds', Upper: 'lower-thirds',
  LiveFrags: 'kill-feed', Alerts: 'kill-feed', Recall: 'kill-feed', Dom: 'kill-feed',
  LiveStats: 'leaderboards', LiveData: 'player-cards', OverAllData: 'leaderboards', MatchData: 'match-statistics',
  MatchSummary: 'match-statistics', MatchFragrs: 'match-statistics', OverallFrags: 'leaderboards', WwcdSummary: 'mvp-winners',
  WwcdStats: 'mvp-winners', mvp: 'mvp-winners', EventMvp: 'mvp-winners', Champions: 'mvp-winners', '1stRunnerUp': 'mvp-winners',
  '2ndRunnerUp': 'mvp-winners', intro: 'intros-outros', UpNext: 'intros-outros', Schedule: 'tournament-graphics',
  HighlightPoints: 'tournament-graphics', Slots: 'team-cards', RosterShowCase: 'team-cards', teamh2h: 'team-cards',
  playerh2h: 'player-cards', PlayerSummary: 'player-cards', PlayerSwitch: 'player-cards',
};

/** The library category a new design from this template starts in (null = uncategorised). */
export function categoryForView(viewKey: string | null | undefined): string | null {
  return (viewKey && VIEW_CATEGORY[viewKey]) || null;
}
