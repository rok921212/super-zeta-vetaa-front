// What a design or template needs from the live data: every data path it
// reads (bindings, data-driven styles, conditions, watched values), the lists
// it repeats, the live events it reacts to, and whether it only works in the
// desktop app. Worked out from the layers themselves, so it cannot drift from
// what the template really does. Shown in the template gallery; the template
// tests resolve every path here against the simulation (the real engine's
// data shape). Pure.

import type { Condition, LayoutElement } from '../schema/layoutTypes.ts';

export interface Requirements {
  /** Data paths read outside a list row or an event (absolute: they must exist in the match data). */
  fields: string[];
  /** Paths read from a list row (`item.*`) or an event (`event.*`): they exist only there. */
  rowFields: string[];
  /** Lists repeated ("Repeat for each…" sources). */
  lists: string[];
  /** Live events it animates on (kill, elimination, knock…). */
  events: string[];
  /** Reads the desktop app's game feed (`local.*`): empty on the website. */
  desktopOnly: boolean;
}

/** Words for the kinds of data, by root (what the gallery shows). */
export const SOURCE_WORDS: Record<string, string> = {
  tournament: 'tournament', round: 'round', match: 'match', matches: 'match list', matchData: 'match results', derived: 'teams and players',
  live: 'live match state', feed: 'kill feed', overallData: 'overall standings', matchDatas: 'overall standings', deadTeamList: 'eliminated teams',
  local: 'desktop game feed', status: 'connection', theme: 'theme',
};

const ROW_ROOTS = new Set(['item', 'rank', 'index', 'parent', 'event']);
const DESIGN_ROOTS = new Set(['theme', 'variables', 'brand']);

function conditionPaths(c: Condition | undefined, out: string[]) {
  if (!c) return;
  if ('all' in c) c.all.forEach((x) => conditionPaths(x, out));
  else if ('any' in c) c.any.forEach((x) => conditionPaths(x, out));
  else if ('not' in c) conditionPaths(c.not, out);
  else if ('path' in c) out.push(c.path);
}

/** Every `{ ref }` and `{ bind: { path } }` string anywhere inside a value (styles, gradients, keyframes). */
function refPaths(v: unknown, out: string[], depth = 0) {
  if (!v || typeof v !== 'object' || depth > 8) return;
  if (Array.isArray(v)) { v.forEach((x) => refPaths(x, out, depth + 1)); return; }
  const o = v as Record<string, unknown>;
  if (typeof o.ref === 'string') out.push(o.ref);
  if (o.bind && typeof o.bind === 'object' && typeof (o.bind as any).path === 'string') out.push((o.bind as any).path);
  for (const k of Object.keys(o)) if (k !== 'ref') refPaths(o[k], out, depth + 1);
}

export function requirementsOf(elements: LayoutElement[]): Requirements {
  const paths: string[] = [];
  const lists = new Set<string>();
  const events = new Set<string>();
  const walk = (list: LayoutElement[] | undefined) => (list || []).forEach((el) => {
    Object.values(el.bind || {}).forEach((ref) => ref?.path && paths.push(ref.path));
    refPaths(el.style, paths);
    refPaths((el as any).styleWhen, paths);
    conditionPaths(el.visibleWhen, paths);
    if (el.repeater) { lists.add(el.repeater.source); conditionPaths(el.repeater.filter, paths); }
    if (el.anim?.onEvent) events.add(el.anim.onEvent.event);
    for (const clip of el.timeline?.clips || []) {
      if (clip.trigger.type === 'event' && clip.trigger.event) events.add(clip.trigger.event);
      if (clip.trigger.type === 'change' && clip.trigger.watch) paths.push(clip.trigger.watch);
      conditionPaths(clip.trigger.when, paths);
      conditionPaths(clip.trigger.filter, paths);
      refPaths(clip.tracks, paths);
    }
    walk(el.children);
  });
  walk(elements);
  const rootOf = (p: string) => p.split(/[.[]/)[0];
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const data = paths.filter((p) => !DESIGN_ROOTS.has(rootOf(p)));
  // A list source that reads a row (`item.players`) belongs to the row, not to the match data.
  const listRoots = [...lists].filter((l) => !ROW_ROOTS.has(rootOf(l)));
  return {
    fields: uniq(data.filter((p) => !ROW_ROOTS.has(rootOf(p)))),
    rowFields: uniq(data.filter((p) => ROW_ROOTS.has(rootOf(p)))),
    lists: uniq(listRoots),
    events: uniq([...events]),
    desktopOnly: [...data, ...listRoots].some((p) => rootOf(p) === 'local'),
  };
}

/** One line for a gallery card: which kinds of live data a template reads, and what it reacts to. */
export function requirementsSummary(r: Requirements): string {
  const roots = [...new Set([...r.fields, ...r.lists].map((p) => p.split(/[.[]/)[0]))];
  const words = [...new Set(roots.map((x) => SOURCE_WORDS[x]).filter(Boolean))];
  const parts: string[] = [];
  parts.push(words.length ? `Reads: ${words.join(', ')}` : r.rowFields.length ? 'Reads: one row of its list' : 'No live data');
  if (r.events.length) parts.push(`Reacts to: ${r.events.join(', ')}`);
  if (r.desktopOnly) parts.push('Desktop app only');
  return parts.join(' · ');
}
