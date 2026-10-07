// Designer structural operations built on the store's command primitives:
// group / ungroup, reorder, duplicate, nudge, patch. Pure — they read a
// document and return a Command (or null when there is nothing to do).

import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { type Command, addElementsCmd, editElements, setChildrenCmd } from './store.ts';
import { childrenOf, locate, allIds } from './tree.ts';
import { cloneWithNewIds, newId } from './ids.ts';

/** Container types that accept children (layoutSchema CONTAINER_TYPES). */
export const isContainer = (el: LayoutElement | null | undefined): boolean => !!el && (el.type === 'group' || el.type === 'repeater');

/** Shallow-merge a patch into elements; `coalesceKey` groups continuous edits into one undo step. */
export function patchCmd(doc: LayoutDocument, ids: string[], patch: Partial<LayoutElement>, label: string, coalesceKey?: string): Command | null {
  return editElements(doc, ids, (el) => {
    const next = { ...el, ...patch };
    for (const k of Object.keys(patch) as Array<keyof LayoutElement>) if (patch[k] === undefined) delete (next as any)[k];
    return next;
  }, label, coalesceKey);
}

/** Move the selection by dx/dy. Held arrow keys share `nudge` and merge into one undo step. */
export function nudgeCmd(doc: LayoutDocument, ids: string[], dx: number, dy: number): Command | null {
  return editElements(doc, ids, (el) => (el.locked ? el : { ...el, x: el.x + dx, y: el.y + dy }), 'Nudge', `nudge:${ids.join(',')}`);
}

/** Duplicate each selected element next to itself (+20,+20), fresh ids for the whole subtree. */
export function duplicateCmd(doc: LayoutDocument, ids: string[]): { cmd: Command; newIds: string[] } | null {
  const locs = ids.map((id) => locate(doc.elements, id)).filter((l): l is NonNullable<typeof l> => !!l);
  if (!locs.length) return null;
  // Everything goes after its source, in the source's parent. Group by parent.
  const cmds: Command[] = [];
  const newIds: string[] = [];
  let working = doc;
  for (const loc of locs) {
    const [copy] = cloneWithNewIds([loc.el], working.elements, { x: 20, y: 20 });
    if (loc.el.name) copy.name = `${loc.el.name} copy`.slice(0, 120);
    const index = childrenOf(working.elements, loc.parentId).findIndex((e) => e.id === loc.el.id) + 1;
    const c = addElementsCmd([copy], loc.parentId, index);
    working = c.apply(working);
    cmds.push(c);
    newIds.push(copy.id);
  }
  return {
    newIds,
    cmd: {
      label: newIds.length === 1 ? 'Duplicate' : `Duplicate ${newIds.length}`,
      apply: (d) => cmds.reduce((acc, c) => c.apply(acc), d),
      revert: (d) => cmds.reduceRight((acc, c) => c.revert(acc), d),
    },
  };
}

/** Move an element within its parent: +1 = up (towards the front), -1 = down, 'front' / 'back'. */
export function reorderCmd(doc: LayoutDocument, id: string, move: 1 | -1 | 'front' | 'back'): Command | null {
  const loc = locate(doc.elements, id);
  if (!loc) return null;
  const kids = [...childrenOf(doc.elements, loc.parentId)];
  const from = loc.index;
  const to = move === 'front' ? kids.length - 1 : move === 'back' ? 0 : Math.max(0, Math.min(kids.length - 1, from + move));
  if (to === from) return null;
  const [el] = kids.splice(from, 1);
  kids.splice(to, 0, el);
  return setChildrenCmd(doc, loc.parentId, kids, 'Reorder');
}

/** Move `id` to sit at `index` among the children of `parentId` (same parent only, used by layer drag). */
export function moveToIndexCmd(doc: LayoutDocument, id: string, index: number): Command | null {
  const loc = locate(doc.elements, id);
  if (!loc) return null;
  const kids = [...childrenOf(doc.elements, loc.parentId)];
  const [el] = kids.splice(loc.index, 1);
  const to = Math.max(0, Math.min(kids.length, index));
  if (to === loc.index) return null;
  kids.splice(to, 0, el);
  return setChildrenCmd(doc, loc.parentId, kids, 'Reorder');
}

/**
 * Wrap selected SIBLINGS in a new group sized to their union box. Children
 * are rebased so nothing moves on screen. Returns null unless every selected
 * element shares one parent.
 */
export function groupCmd(doc: LayoutDocument, ids: string[]): { cmd: Command; groupId: string } | null {
  const locs = ids.map((id) => locate(doc.elements, id)).filter((l): l is NonNullable<typeof l> => !!l);
  if (!locs.length) return null;
  const parentId = locs[0].parentId;
  if (locs.some((l) => l.parentId !== parentId)) return null;
  const siblings = childrenOf(doc.elements, parentId);
  const chosen = new Set(locs.map((l) => l.el.id));
  const members = siblings.filter((e) => chosen.has(e.id)); // keep stacking order
  const x = Math.min(...members.map((e) => e.x));
  const y = Math.min(...members.map((e) => e.y));
  const w = Math.max(...members.map((e) => e.x + e.w)) - x;
  const h = Math.max(...members.map((e) => e.y + e.h)) - y;
  const groupId = newId('group', allIds(doc.elements));
  const group: LayoutElement = {
    id: groupId, type: 'group', name: 'Group', x, y, w, h,
    children: members.map((e) => ({ ...e, x: e.x - x, y: e.y - y })),
  };
  const at = Math.max(...members.map((e) => siblings.indexOf(e))) - (members.length - 1);
  const next = siblings.filter((e) => !chosen.has(e.id));
  next.splice(Math.max(0, at), 0, group);
  return { groupId, cmd: setChildrenCmd(doc, parentId, next, 'Group') };
}

/** Replace a group with its children (offset back into the parent's space). */
export function ungroupCmd(doc: LayoutDocument, id: string): { cmd: Command; childIds: string[] } | null {
  const loc = locate(doc.elements, id);
  if (!loc || loc.el.type !== 'group' || !loc.el.children?.length) return null;
  const g = loc.el;
  const lifted = (g.children || []).map((c) => ({
    ...c,
    x: c.x + g.x,
    y: c.y + g.y,
    ...(g.opacity != null && g.opacity !== 1 ? { opacity: (c.opacity ?? 1) * g.opacity } : null),
  }));
  const siblings = [...childrenOf(doc.elements, loc.parentId)];
  siblings.splice(loc.index, 1, ...lifted);
  return { childIds: lifted.map((c) => c.id), cmd: setChildrenCmd(doc, loc.parentId, siblings, 'Ungroup') };
}
