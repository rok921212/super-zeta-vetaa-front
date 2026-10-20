// Why a connected field shows nothing, in words a designer can act on.
//
// `resolvePathDetailed` says THAT a path did not resolve and where; this says
// WHY, using what the scope itself knows: the engine's connection status
// (`status`), which roots exist (`item` only inside a repeater, `event` only
// inside an event-driven layer, `local` only in the desktop app), how long a
// list really is, and which field names really exist next to the missing one.
// It never guesses about data it cannot see. Pure.

import { isSafePath } from '../schema/layoutSchema.js';
import { resolvePathDetailed, tokenizePath, type BindingScope } from './resolve.ts';

export type BindingState =
  | 'ok'          // found, with a value (0 and false count as values)
  | 'empty'       // found, but null or '' right now
  | 'invalid'     // not a path the editor accepts
  | 'loading'     // the live data has not arrived yet
  | 'disconnected'// the live data source is down
  | 'no-selection'// no tournament / round / match picked
  | 'row-only'    // item.* outside a "repeat for each" list
  | 'event-only'  // event.* outside an event-driven layer
  | 'desktop-only'// local.* outside the desktop app
  | 'list-short'  // [n] past the end of the list
  | 'missing';    // the field does not exist in this data

export interface BindingExplanation {
  state: BindingState;
  /** True for ok; false otherwise (the fallback, if any, is shown). */
  found: boolean;
  value: unknown;
  /** One sentence for the user; '' when ok. */
  message: string;
}

const ROW_ROOTS = new Set(['item', 'rank', 'index', 'parent']);
/** Roots that are filled by the live connection (not by the design itself). */
const LIVE_ROOTS = new Set(['tournament', 'round', 'match', 'matches', 'matchData', 'deadTeamList', 'overallData', 'matchDatas', 'derived', 'live', 'feed']);

const PHASE_DOWN: Record<string, string> = {
  IDLE: 'not connected yet',
  RECONNECTING: 'reconnecting',
  RELAY_OFFLINE: 'the desktop relay is offline — start the ScoreSync desktop app',
  UPSTREAM_OFFLINE: 'the server is unreachable',
  DESTROYED: 'disconnected',
};

const isBlank = (v: unknown) => v === null || v === undefined || v === '';
const isEmptyObject = (v: unknown) => v != null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0;

/** Levenshtein distance, capped (only short field names are compared). */
function distance(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** The existing key closest to `key`, if it is close enough to be a likely typo or rename. */
export function closestKey(key: string, keys: string[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const k of keys) {
    const d = k.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(k.toLowerCase()) ? 1 : distance(key, k);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best !== null && bestD <= Math.max(2, Math.floor(key.length / 3)) ? best : null;
}

const pathOf = (tokens: Array<string | number>) =>
  tokens.reduce<string>((s, t) => (typeof t === 'number' ? `${s}[${t}]` : s ? `${s}.${t}` : t), '');

/** Why `path` shows what it shows in `scope`. */
export function explainBinding(scope: BindingScope, path: string): BindingExplanation {
  const miss = (state: BindingState, message: string): BindingExplanation => ({ state, found: false, value: undefined, message });
  if (!path || !isSafePath(path)) return miss('invalid', 'This is not a valid data address. Pick the field from the list instead of typing it.');
  const r = resolvePathDetailed(scope, path);
  if (r.found) {
    if (isBlank(r.value)) return { state: 'empty', found: true, value: r.value, message: 'The field exists but is empty right now; the text for missing data is shown.' };
    return { state: 'ok', found: true, value: r.value, message: '' };
  }

  const tokens = tokenizePath(path)!;
  const root = String(tokens[0]);
  const rootValue = (scope as Record<string, unknown>)[root];

  if (ROW_ROOTS.has(root) && rootValue === undefined) {
    return miss('row-only', 'This field belongs to one row of a list. Put this layer inside a “Repeat for each team / player” list, or pick a field that is not under “This row”.');
  }
  if (root === 'event' && rootValue === undefined) {
    return miss('event-only', 'This field only has a value while a kill, elimination or recall is on screen. Make the layer (or its group) appear on that event in Animate.');
  }
  if (root === 'local' && (rootValue === undefined || isEmptyObject(rootValue) || (rootValue as any)?.connected === false)) {
    return miss('desktop-only', 'This comes from the desktop app’s game feed. It is filled in the desktop app and empty on the website.');
  }
  if (rootValue === undefined) return miss('invalid', `“${root}” is not a kind of data the overlay has. Pick the field from the list.`);

  if (LIVE_ROOTS.has(root)) {
    const status = (scope.status || {}) as { phase?: string; loading?: boolean };
    if (status.phase && PHASE_DOWN[status.phase]) return miss('disconnected', `The live data source is down (${PHASE_DOWN[status.phase]}). The value comes back when it reconnects.`);
    if (status.loading) return miss('loading', 'The live data is still loading.');
    if (root === 'tournament' && rootValue === null) return miss('no-selection', 'No tournament is selected. Pick one in the LIVE DATA bar, or switch to SIMULATION.');
    if (root === 'round' && rootValue === null) return miss('no-selection', 'No round is selected. Pick one in the LIVE DATA bar, or switch to SIMULATION.');
    if ((root === 'match' || root === 'matchData') && rootValue === null) {
      return miss('no-selection', 'No match is selected. Select the match in the dashboard (the overlay follows it), or pin one in the LIVE DATA bar.');
    }
  }

  // Walk to the last value that does exist, to say exactly what is missing under it.
  let parent: unknown = scope;
  for (let i = 0; i < r.missingAt; i++) parent = (parent as any)[tokens[i] as any];
  const missing = tokens[r.missingAt];
  const where = pathOf(tokens.slice(0, r.missingAt));

  if (parent == null) return miss('missing', `“${where}” is empty right now, so nothing under it can be shown yet.`);
  if (typeof missing === 'number') {
    if (!Array.isArray(parent)) return miss('missing', `“${where}” is not a list.`);
    if (parent.length === 0) return miss('list-short', `The list “${where}” is empty right now (nothing has happened yet, or the match has not started).`);
    return miss('list-short', `The list “${where}” has ${parent.length} item${parent.length === 1 ? '' : 's'} right now, so item ${missing + 1} does not exist yet. To show every item, use a “Repeat for each” list.`);
  }
  if (typeof parent !== 'object') return miss('missing', `“${where}” is a single value; it has no “${missing}” inside it.`);
  const keys = Array.isArray(parent) ? [] : Object.keys(parent as object);
  const near = closestKey(String(missing), keys);
  return miss('missing', `“${missing}” is not in ${where ? `“${where}”` : 'this data'} for the current ${LIVE_ROOTS.has(root) ? 'match' : 'design'}.${near ? ` Did you mean “${near}”?` : ''}`);
}
