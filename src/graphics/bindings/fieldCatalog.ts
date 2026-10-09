// The Data panel's view of the binding scope: every value a layer can be
// connected to, grouped the way a designer thinks about it, with its type and
// what it is right now.
//
// The catalog is BUILT FROM THE SCOPE (the same object bindings resolve
// against), so a field can only appear here if the engine really provides it.
// The descriptions below are the only hand-written part, and only for field
// names the app itself uses (the common-data shortcuts, the built-in
// templates); a field without one is still listed, just undescribed.

import type { BindingScope } from './resolve.ts';
import { valueKind, type ValueKind } from './compat.ts';

export interface FieldCategory { id: string; label: string; hint: string; roots: string[] }

/** Scope roots grouped for display. A root that is absent from the current scope is simply not shown. */
export const FIELD_CATEGORIES: FieldCategory[] = [
  { id: 'row', label: 'This row', hint: 'The team or player this row of a list is showing', roots: ['item', 'rank', 'index', 'parent'] },
  { id: 'event', label: 'This event', hint: 'The kill, elimination or recall that made this layer appear', roots: ['event'] },
  { id: 'tournament', label: 'Tournament', hint: 'Name, logo and colours of the tournament', roots: ['tournament'] },
  { id: 'round', label: 'Round', hint: 'The round (stage) being played', roots: ['round'] },
  { id: 'match', label: 'Match', hint: 'The current match and the list of matches in the round', roots: ['match', 'matches', 'matchData'] },
  { id: 'live', label: 'Match state', hint: 'What is happening right now: teams and players alive, kill leader, map', roots: ['live'] },
  { id: 'teams', label: 'Teams, players, leaderboard', hint: 'Teams of the match with their players and statistics; standings and top fraggers', roots: ['derived'] },
  { id: 'feed', label: 'Kill feed', hint: 'The latest kills, eliminations, knocks, recalls and milestones, newest first', roots: ['feed'] },
  { id: 'overall', label: 'Overall standings', hint: 'Totals across the matches of the round', roots: ['overallData', 'matchDatas', 'deadTeamList'] },
  { id: 'desktop', label: 'Desktop app', hint: 'The game feed of the desktop app (observed player, zone). Empty on the website', roots: ['local'] },
  { id: 'design', label: 'This design', hint: 'The design\'s own colours, variables and brand', roots: ['theme', 'variables', 'brand'] },
  { id: 'connection', label: 'Connection', hint: 'The state of the live data connection', roots: ['status'] },
];

/** What a field is, by its own name (the last part of its path). */
const DESCRIPTIONS: Record<string, string> = {
  tournamentName: 'Name of the tournament',
  torLogo: 'Logo of the tournament',
  primaryColor: 'Main colour set for the tournament',
  secondaryColor: 'Second colour set for the tournament',
  roundName: 'Name of the round',
  day: 'Day label of the round',
  matchNo: 'Number of the match',
  matchName: 'Name of the match',
  map: 'Map of the match',
  mapName: 'Map being played',
  teamName: 'Full team name',
  teamTag: 'Short team name',
  teamLogo: 'Team logo',
  teamId: 'Id of the team',
  playerName: 'Player name',
  killNum: 'Kills by this player in the match',
  totalKills: 'Kills by the team in the match',
  totalPoints: 'Points of the team (placement + kills)',
  placePoints: 'Placement points',
  rank: 'Position in the list, starting at 1',
  index: 'Position in the list, starting at 0',
  health: 'Health of the player',
  healthMax: 'Full health of the player',
  healthPct: 'Health of the player, 0 to 100',
  liveState: 'State of the player (alive, knocked, dead)',
  aliveTeamsCount: 'Teams still alive',
  alivePlayersCount: 'Players still alive',
  isRecallMap: 'Whether this map has recalls',
  length: 'How many items the list has',
  timeLeft: 'Time left in the zone phase',
  statusLabel: 'What the zone is doing',
};

export function describeField(path: string): string | undefined {
  const leaf = path.split('.').pop() || '';
  return DESCRIPTIONS[leaf.replace(/\[\d+\]$/, '')];
}

export interface FieldEntry {
  path: string;
  /** The path without its root ("teams[0].teamName"). */
  label: string;
  value: unknown;
  kind: ValueKind;
  category: string;
  description?: string;
}

// Keys that are noise for a designer (ids, protobuf bookkeeping, positions).
const HIDDEN_KEYS = new Set(['__v', 'userId', 'createdAt', 'updatedAt', 'location', 'playerOpenId', 'showPicUrl', 'latestPlayerRaw', '_id']);
const KEY_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const FIELD_LIMITS = { maxDepth: 6, maxFields: 1500 };

export const categoryOfRoot = (root: string): string => FIELD_CATEGORIES.find((c) => c.roots.includes(root))?.id || 'design';

/**
 * Every single value reachable in the scope, as a flat list. A list
 * contributes its length and its FIRST item (the shape of every item);
 * bounded in depth and count so a huge payload cannot stall the panel.
 */
export function listFields(scope: BindingScope): FieldEntry[] {
  const out: FieldEntry[] = [];
  const seen = new WeakSet<object>();
  const walk = (path: string, value: unknown, root: string, depth: number) => {
    if (out.length >= FIELD_LIMITS.maxFields) return;
    const kind = valueKind(value);
    if (kind === 'list') {
      const list = value as unknown[];
      push(`${path}.length`, list.length, root);
      if (list.length && depth < FIELD_LIMITS.maxDepth) walk(`${path}[0]`, list[0], root, depth + 1);
      return;
    }
    if (kind === 'object') {
      const obj = value as Record<string, unknown>;
      if (seen.has(obj) || depth >= FIELD_LIMITS.maxDepth) return;
      seen.add(obj);
      for (const k of Object.keys(obj).sort()) {
        if (HIDDEN_KEYS.has(k) || !KEY_RE.test(k)) continue;
        walk(`${path}.${k}`, obj[k], root, depth + 1);
      }
      return;
    }
    push(path, value, root);
  };
  const push = (path: string, value: unknown, root: string) => {
    if (out.length >= FIELD_LIMITS.maxFields) return;
    out.push({ path, label: path === root ? root : path.slice(root.length + (path[root.length] === '.' ? 1 : 0)), value, kind: valueKind(value), category: categoryOfRoot(root), description: describeField(path) });
  };
  for (const cat of FIELD_CATEGORIES) {
    for (const root of cat.roots) {
      const v = (scope as Record<string, unknown>)[root];
      if (v === undefined) continue;
      walk(root, v, root, 0);
    }
  }
  return out;
}

/** Fields whose path or description contains every word of the query. */
export function searchFields(fields: FieldEntry[], query: string): FieldEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return fields;
  return fields.filter((f) => {
    const hay = `${f.path} ${f.description || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** A short, safe rendering of a value for a list row. */
export function previewValue(v: unknown, max = 26): string {
  if (v === null) return 'null';
  if (v === undefined) return '—';
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === 'object') return '{…}';
  const s = String(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
