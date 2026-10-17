// Where a Live part goes. A part reads a team row or a player row; it is put
// where that row exists (inside a team list, a player list), and otherwise
// wrapped in a list that provides it, so it shows data the moment it lands:
//
//   team part   in a team list            -> as is
//   team part   anywhere else             -> inside a new Team list
//   player part in a player list          -> as is (raw or live player fields)
//   player part in a team row             -> inside a list of that team's 4 players
//   player part anywhere else             -> inside a new list of live players

import type { LayoutDocument, LayoutElement, RepeaterSource } from '../schema/layoutTypes.ts';
import { PARTS_BY_ID, type Part, type PlayerRows } from '../templates/parts.ts';
import { placeDraft, type Draft } from './elementFactory.ts';
import { insertTarget } from './InsertPanel.tsx';
import { locate } from './tree.ts';

export type RowContext = { kind: 'none' } | { kind: 'team' } | { kind: 'player'; rows: PlayerRows };

/** The row a new layer under `parentId` reads: the nearest list (repeater) it sits in. */
export function rowContextAt(doc: LayoutDocument, parentId: string | null): RowContext {
  if (!parentId) return { kind: 'none' };
  const loc = locate(doc.elements, parentId);
  if (!loc) return { kind: 'none' };
  const chain = [...loc.ancestors, loc.el];
  for (let i = chain.length - 1; i >= 0; i--) {
    const src = chain[i].type === 'repeater' ? chain[i].repeater?.source : undefined;
    if (!src) continue;
    if (/players|fraggers/i.test(src)) return { kind: 'player', rows: /^live\./.test(src) ? 'live' : 'raw' };
    if (/teams|standings|deadTeamList/i.test(src)) return { kind: 'team' };
    return { kind: 'none' };
  }
  return { kind: 'none' };
}

/** A list around a part: `count` rows of it, in a column or a row. */
function wrap(d: Draft, name: string, source: RepeaterSource, count: number, direction: 'row' | 'column', gap: number): Draft {
  const inner: Draft = { ...d, x: 0, y: 0 };
  const w = direction === 'row' ? count * (d.w + gap) - gap : d.w;
  const h = direction === 'column' ? count * (d.h + gap) - gap : d.h;
  return {
    type: 'repeater', name, x: 0, y: 0, w, h,
    repeater: { source, limit: count, direction, itemWidth: d.w, itemHeight: d.h, gap },
    children: [inner],
  };
}

export interface PlacedPart {
  el: LayoutElement;
  parentId: string | null;
  index: number | null;
  /** Said to the user when the part was put inside a new list. */
  note?: string;
}

/** Build `part` for where it is being inserted (next to / inside the selection). */
export function placePart(part: Part | string, doc: LayoutDocument, selected: string[]): PlacedPart {
  const p = typeof part === 'string' ? PARTS_BY_ID[part] : part;
  if (!p) throw new Error(`unknown part ${String(part)}`);
  const target = insertTarget(doc, selected);
  const ctx = rowContextAt(doc, target.parentId);
  let draft: Draft;
  let note: string | undefined;
  if (p.needs === 'team') {
    draft = p.build('raw');
    if (ctx.kind !== 'team') {
      // A whole LiveStats row becomes the full standings list; a single piece follows the leading team.
      const rows = p.id === 'live-stats-row' ? 16 : 1;
      draft = wrap(draft, rows > 1 ? 'Team rows' : 'Leading team', 'derived.teams', rows, 'column', rows > 1 ? 4 : 0);
      note = rows > 1 ? 'Added inside a new team list (one row per team).' : 'Added inside a new team list showing the leading team. Put it inside your own team row to follow that team.';
    }
  } else if (p.needs === 'player') {
    if (ctx.kind === 'player') draft = p.build(ctx.rows);
    else if (ctx.kind === 'team') {
      draft = wrap(p.build('raw'), 'Team players', 'item.players', 4, 'row', 8);
      note = 'Added as this team’s 4 players.';
    } else {
      draft = wrap(p.build('live'), 'Players', 'live.players', 4, 'row', 12);
      note = 'Added inside a new player list (4 players). Change the list’s source or count in the panel on the right.';
    }
  } else {
    draft = p.build('raw');
  }
  return { el: placeDraft(draft, doc, target.area), parentId: target.parentId, index: target.index, note };
}
