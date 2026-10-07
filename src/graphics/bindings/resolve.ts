// Safe data-path resolution for layout bindings.
//
// A path is data, never code: `derived.teams[0].teamName`, `item.players[1].health`.
// It is tokenised (dot + [index] only), must start at a whitelisted root, and
// only OWN properties are read — `__proto__`, `constructor`, prototype methods
// and anything outside the scope object are unreachable. No eval, no Function.

import { isSafePath } from '../schema/layoutSchema.js';

/** What a binding path can see. `item/index/rank/parent` exist inside repeaters, `event` inside event-driven elements. */
export interface BindingScope {
  tournament?: any;
  round?: any;
  match?: any;
  matches?: any;
  matchData?: any;
  deadTeamList?: any;
  overallData?: any;
  matchDatas?: any;
  derived?: any;
  status?: any;
  item?: any;
  index?: number;
  rank?: number;
  parent?: any;
  variables?: any;
  theme?: any;
  brand?: any;
  event?: any;
  /** Theme-parity live values (bindings/live.ts). */
  live?: any;
  /** Rolling event logs: kills, eliminations, recalls, milestones, rankChanges, last. */
  feed?: any;
  /** The desktop app's own game feed (bindings/local.ts). Empty on the website. */
  local?: any;
}

type Token = string | number;

const tokenCache = new Map<string, Token[] | null>();

/** Split `a.b[2].c` into ['a', 'b', 2, 'c']; null when the path is not allowed. */
export function tokenizePath(path: string): Token[] | null {
  const cached = tokenCache.get(path);
  if (cached !== undefined) return cached;
  let tokens: Token[] | null = null;
  if (isSafePath(path)) {
    tokens = [];
    const re = /([A-Za-z_$][A-Za-z0-9_$]*)|\[(\d{1,4})\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(path))) tokens.push(m[1] !== undefined ? m[1] : Number(m[2]));
  }
  if (tokenCache.size > 5000) tokenCache.clear();
  tokenCache.set(path, tokens);
  return tokens;
}

const hasOwn = (o: any, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k);

export interface Resolved {
  /** The path was allowed and every segment existed. */
  found: boolean;
  value: unknown;
  /** Index of the first missing segment (for diagnostics), -1 when found. */
  missingAt: number;
}

export function resolvePathDetailed(scope: BindingScope, path: string): Resolved {
  const tokens = tokenizePath(path);
  if (!tokens) return { found: false, value: undefined, missingAt: 0 };
  let cur: any = scope;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (cur == null) return { found: false, value: undefined, missingAt: i };
    if (typeof t === 'number') {
      if (!Array.isArray(cur) || t >= cur.length) return { found: false, value: undefined, missingAt: i };
      cur = cur[t];
      continue;
    }
    if (t === 'length' && (Array.isArray(cur) || typeof cur === 'string')) {
      cur = cur.length;
      continue;
    }
    if (typeof cur !== 'object' || !hasOwn(cur, t)) return { found: false, value: undefined, missingAt: i };
    cur = cur[t];
  }
  return { found: true, value: cur, missingAt: -1 };
}

export function resolvePath(scope: BindingScope, path: string): unknown {
  return resolvePathDetailed(scope, path).value;
}
