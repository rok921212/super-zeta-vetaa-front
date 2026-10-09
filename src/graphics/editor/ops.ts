// Designer structural operations built on the store's command primitives:
// group / ungroup, reorder, duplicate, nudge, patch. Pure — they read a
// document and return a Command (or null when there is nothing to do).

import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { type Command, addElementsCmd, editElements, setChildrenCmd } from './store.ts';
import { absoluteOrigin, childrenOf, insertAt, locate, allIds, removeById } from './tree.ts';
import { cloneWithNewIds, newId } from './ids.ts';

/** Container types that accept children (layoutSchema CONTAINER_TYPES). */
export const isContainer = (el: LayoutElement | null | undefined): boolean => !!el && (el.type === 'group' || el.type === 'repeater');

// ── where new layers go ──────────────────────────────────────────────────────
// Group children are stored relative to their group, so adding into / moving
// into a group always converts canvas coordinates to the group's own.

export interface InsertionTarget {
  parentId: string | null;
  /** Position among the parent's children; null = on top (end of the list). */
  index: number | null;
}

/** Canvas position of a parent's (0,0); the stage origin for the top level. */
export function parentOrigin(doc: LayoutDocument, parentId: string | null): { x: number; y: number } {
  return (parentId && absoluteOrigin(doc.elements, parentId)) || { x: 0, y: 0 };
}

/** Canvas coordinates → the coordinates a child of `parentId` uses. */
export function toLocal(doc: LayoutDocument, parentId: string | null, x: number, y: number): { x: number; y: number } {
  const o = parentOrigin(doc, parentId);
  return { x: Math.round(x - o.x), y: Math.round(y - o.y) };
}

/**
 * The deepest visible, unlocked group / repeater whose canvas box contains the
 * point: drawing or dropping over a template puts the new layer inside it.
 */
export function containerAt(doc: LayoutDocument, x: number, y: number, exclude?: Set<string>): string | null {
  let found: string | null = null;
  const walk = (list: LayoutElement[], ox: number, oy: number) => {
    // Front-most first: the end of the list is drawn on top.
    for (let i = list.length - 1; i >= 0; i--) {
      const el = list[i];
      if (!isContainer(el) || el.hidden || el.locked || exclude?.has(el.id)) continue;
      const ax = ox + el.x;
      const ay = oy + el.y;
      if (x >= ax && x <= ax + el.w && y >= ay && y <= ay + el.h) {
        found = el.id;
        walk(el.children || [], ax, ay);
        return;
      }
    }
  };
  walk(doc.elements, 0, 0);
  return found;
}

/**
 * Where an insert with no pointer position (Insert panel, paste) goes:
 * a selected group / repeater → inside it, on top; a selected layer inside a
 * group → the same group, just above it; otherwise the top level.
 */
export function insertionTarget(doc: LayoutDocument, selected: string[]): InsertionTarget {
  if (selected.length !== 1) return { parentId: null, index: null };
  const loc = locate(doc.elements, selected[0]);
  if (!loc) return { parentId: null, index: null };
  if (isContainer(loc.el) && !loc.el.locked) return { parentId: loc.el.id, index: null };
  if (loc.parentId) {
    const parent = loc.ancestors[loc.ancestors.length - 1];
    if (parent && !parent.locked) return { parentId: loc.parentId, index: loc.index + 1 };
  }
  return { parentId: null, index: null };
}

/**
 * Add layers whose x/y are CANVAS coordinates. They go into `target` when
 * given, else into the group under the centre of their box (containerAt), with
 * x/y converted to that parent's coordinates.
 */
export function addAtCanvasCmd(doc: LayoutDocument, els: LayoutElement[], target?: InsertionTarget): { cmd: Command; parentId: string | null } {
  let t = target;
  if (!t) {
    const x1 = Math.min(...els.map((e) => e.x));
    const y1 = Math.min(...els.map((e) => e.y));
    const x2 = Math.max(...els.map((e) => e.x + e.w));
    const y2 = Math.max(...els.map((e) => e.y + e.h));
    t = { parentId: containerAt(doc, (x1 + x2) / 2, (y1 + y2) / 2), index: null };
  }
  const o = parentOrigin(doc, t.parentId);
  const local = els.map((e) => ({ ...e, x: Math.round(e.x - o.x), y: Math.round(e.y - o.y) }));
  return { cmd: addElementsCmd(local, t.parentId, t.index), parentId: t.parentId };
}

/**
 * The right-click "Move into ‹group›" / "Move out of group" targets for one
 * layer: the group under its centre (not itself or its own children) when that
 * is not already its parent, and its parent's parent when it is in a group.
 */
export function regroupTargets(doc: LayoutDocument, id: string): { into: { id: string; name: string } | null; out: InsertionTarget | null } {
  const loc = locate(doc.elements, id);
  if (!loc) return { into: null, out: null };
  const abs = absoluteOrigin(doc.elements, id)!;
  const own = allIds([loc.el]);
  const intoId = containerAt(doc, abs.x + loc.el.w / 2, abs.y + loc.el.h / 2, own);
  const intoEl = intoId && intoId !== loc.parentId ? locate(doc.elements, intoId)?.el : null;
  let out: InsertionTarget | null = null;
  if (loc.parentId) {
    const parentLoc = locate(doc.elements, loc.parentId)!;
    out = { parentId: parentLoc.parentId, index: parentLoc.index + 1 };
  }
  return { into: intoEl ? { id: intoEl.id, name: intoEl.name || intoEl.type } : null, out };
}

/**
 * Move layers to another parent (null = top level) at `index` (null = on top),
 * keeping each one where it is on screen. One undo step. Null when the move
 * is impossible (into itself or one of its own children) or changes nothing.
 */
export function moveToParentCmd(doc: LayoutDocument, ids: string[], newParentId: string | null, index: number | null): Command | null {
  const set = new Set(ids);
  const locs = ids
    .map((id) => locate(doc.elements, id))
    .filter((l): l is NonNullable<typeof l> => !!l && !l.ancestors.some((a) => set.has(a.id)));
  if (!locs.length) return null;
  if (newParentId) {
    const target = locate(doc.elements, newParentId);
    if (!target || !isContainer(target.el)) return null;
    if (set.has(newParentId) || target.ancestors.some((a) => set.has(a.id))) return null;
  }
  const dest = parentOrigin(doc, newParentId);
  // Keep stacking order: sort by the order they appear in the tree.
  const order = Array.from(allIds(doc.elements));
  locs.sort((a, b) => order.indexOf(a.el.id) - order.indexOf(b.el.id));
  const moved = locs.map((l) => {
    const abs = absoluteOrigin(doc.elements, l.el.id)!;
    return { ...l.el, x: Math.round(abs.x - dest.x), y: Math.round(abs.y - dest.y) };
  });
  // Index counted among the destination's children BEFORE removal: adjust for
  // moved siblings that sat below the drop point.
  let at = index;
  if (at != null) {
    const before = childrenOf(doc.elements, newParentId);
    at -= before.slice(0, at).filter((e) => set.has(e.id)).length;
  }
  const removed = removeById(doc.elements, new Set(moved.map((m) => m.id)));
  const nextElements = insertAt(removed, newParentId, at, moved);
  if (JSON.stringify(nextElements) === JSON.stringify(doc.elements)) return null;
  const prevElements = doc.elements;
  const label = moved.length === 1
    ? (newParentId ? `Move into ${locate(doc.elements, newParentId)?.el.name || 'group'}` : 'Move out of group')
    : `Move ${moved.length} layers`;
  return { label, apply: (d) => ({ ...d, elements: nextElements }), revert: (d) => ({ ...d, elements: prevElements }) };
}

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
