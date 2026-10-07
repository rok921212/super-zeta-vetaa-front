// The template gallery's catalog: every starting point for a design, sorted
// into the same categories DisplayHud uses (dashboard/overlayViews.ts).
//
// Two kinds of entry:
//   editable  a template made of ordinary layers (templates/index.ts)
//   builtin   one of the hand-coded theme graphics, placed as a single
//             full-stage element (Themes/registry.ts)
//
// `viewKey` is the theme slot an entry fills when a new theme is made from
// the gallery; null = it has no slot (it can still be edited on its own).

import { DESKTOP_VIEWS, VIEW_GROUPS, VIEW_OPTIONS, guessViewKey } from '../../dashboard/overlayViews.ts';
import type { BuiltinGraphic } from '../../Themes/registry.ts';
import type { Template } from '../templates/index.ts';
import { VIEW_TEMPLATE_SLOTS } from '../templates/views.ts';

export interface GalleryItem {
  /** What `newLayoutDocument` takes: a template id or "builtin:Theme6/alerts". */
  source: string;
  name: string;
  description: string;
  kind: 'editable' | 'builtin';
  /** "Editable" or the built-in theme it comes from. */
  origin: string;
  viewKey: string | null;
}

export interface GalleryCategory {
  id: string;
  label: string;
  hint: string;
  items: GalleryItem[];
}

export const EDITABLE = 'Editable';

/** The slot each editable template is made for. */
const TEMPLATE_VIEW: Record<string, string> = {
  'lower-third': 'Lower', 'live-standings': 'LiveStats', 'kill-feed': 'LiveFrags', 'player-card': 'MatchSummary',
  'match-header': 'Upper', 'mvp-card': 'mvp', 'elimination-alert': 'Alerts', 'player-status': 'LiveData',
  'rb-lower-third': 'Lower', 'rb-upper-third': 'Upper', 'rb-elimination': 'Alerts', 'rb-recall': 'Recall',
  'rb-kill-feed': 'LiveFrags', 'rb-live-stats': 'LiveStats', 'rb-live-frags': 'LiveFrags', 'rb-dominator': 'Dom',
  'rb-overall': 'OverAllData', 'rb-match-fraggers': 'MatchFragrs', 'rb-wwcd': 'WwcdSummary', 'rb-mvp': 'mvp',
  'rb-domination-alert': 'Dom', 'rb-match-intro': 'intro',
  'dt-map': 'DesktopMap', 'dt-battle-bar': 'DesktopBattleBar', 'dt-observing': 'DesktopObserving',
  'dt-map-timer': 'DesktopMapTimer', 'dt-team-slots': 'DesktopTeamSlots',
  ...VIEW_TEMPLATE_SLOTS,
};

/** Registry keys are lowercase file names; two do not match their view key. */
const BUILTIN_VIEW: Record<string, string> = {
  ...Object.fromEntries(VIEW_OPTIONS.map((v) => [v.key.toLowerCase(), v.key])),
  firstrunnerup: '1stRunnerUp',
  secondrunnerup: '2ndRunnerUp',
};

const OTHER = 'other';
const DESKTOP = 'desktop';

export function buildGallery(templates: Template[], builtins: BuiltinGraphic[]): GalleryCategory[] {
  const categories: GalleryCategory[] = [
    ...VIEW_GROUPS.filter((g) => g.id !== 'schedule').map((g) => ({ id: g.id, label: g.label, hint: g.hint, items: [] as GalleryItem[] })),
    { id: DESKTOP, label: 'Desktop app', hint: 'Map, battle bar, observing player, zone timer, team slots: run inside the desktop app', items: [] },
    { id: OTHER, label: 'Other', hint: 'No theme slot: edit and publish on their own', items: [] },
  ];
  const categoryOf = (viewKey: string | null) => {
    if (viewKey && DESKTOP_VIEWS.some((v) => v.key === viewKey)) return categories.find((c) => c.id === DESKTOP)!;
    const group = viewKey ? VIEW_GROUPS.find((g) => g.views.some((v) => v.key === viewKey)) : null;
    return categories.find((c) => c.id === (group && group.id !== 'schedule' ? group.id : OTHER))!;
  };
  for (const t of templates) {
    const viewKey = TEMPLATE_VIEW[t.id] ?? guessViewKey(t.name);
    categoryOf(viewKey).items.push({ source: t.id, name: t.name, description: t.description, kind: 'editable', origin: EDITABLE, viewKey });
  }
  for (const b of builtins) {
    const viewKey = BUILTIN_VIEW[b.view] ?? null;
    categoryOf(viewKey).items.push({
      source: `builtin:${b.theme}/${b.view}`, name: `${b.theme} · ${b.label}`, description: `${b.group} · live graphic, placed as one piece`,
      kind: 'builtin', origin: b.theme, viewKey,
    });
  }
  return categories.filter((c) => c.items.length > 0);
}

/** Every place an entry comes from, for the filter: "Editable", then Theme1, Theme2, … */
export function galleryOrigins(categories: GalleryCategory[]): string[] {
  const seen = new Set(categories.flatMap((c) => c.items.map((i) => i.origin)));
  const themes = Array.from(seen).filter((o) => o !== EDITABLE).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
  return [...(seen.has(EDITABLE) ? [EDITABLE] : []), ...themes];
}
