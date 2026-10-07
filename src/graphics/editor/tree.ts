// Pure element-tree operations for the Designer. Every function returns new
// arrays (structural sharing) and never mutates its input.

import type { LayoutElement } from '../schema/layoutTypes.ts';

export interface Located {
  el: LayoutElement;
  parentId: string | null;
  index: number;
  /** Ancestors, outermost first. */
  ancestors: LayoutElement[];
}

export function locate(list: LayoutElement[], id: string, parentId: string | null = null, ancestors: LayoutElement[] = []): Located | null {
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (el.id === id) return { el, parentId, index: i, ancestors };
    if (el.children) {
      const found = locate(el.children, id, el.id, [...ancestors, el]);
      if (found) return found;
    }
  }
  return null;
}

export function flatten(list: LayoutElement[], depth = 0, out: Array<{ el: LayoutElement; depth: number }> = []) {
  for (const el of list) {
    out.push({ el, depth });
    if (el.children) flatten(el.children, depth + 1, out);
  }
  return out;
}

export function mapTree(list: LayoutElement[], fn: (el: LayoutElement) => LayoutElement): LayoutElement[] {
  return list.map((el) => {
    const next = fn(el);
    return next.children ? { ...next, children: mapTree(next.children, fn) } : next;
  });
}

export function updateById(list: LayoutElement[], id: string, patch: (el: LayoutElement) => LayoutElement): LayoutElement[] {
  let changed = false;
  const walk = (items: LayoutElement[]): LayoutElement[] =>
    items.map((el) => {
      if (el.id === id) { changed = true; return patch(el); }
      if (el.children) {
        const kids = walk(el.children);
        return kids === el.children ? el : { ...el, children: kids };
      }
      return el;
    });
  const next = walk(list);
  return changed ? next : list;
}

export function removeById(list: LayoutElement[], ids: Set<string>): LayoutElement[] {
  return list
    .filter((el) => !ids.has(el.id))
    .map((el) => (el.children ? { ...el, children: removeById(el.children, ids) } : el));
}

/** Insert at parent (null = root) and index (default: end = top-most). */
export function insertAt(list: LayoutElement[], parentId: string | null, index: number | null, els: LayoutElement[]): LayoutElement[] {
  if (parentId == null) {
    const i = index == null ? list.length : Math.max(0, Math.min(index, list.length));
    return [...list.slice(0, i), ...els, ...list.slice(i)];
  }
  return updateById(list, parentId, (p) => ({ ...p, children: insertAt(p.children || [], null, index, els) }));
}

export function childrenOf(list: LayoutElement[], parentId: string | null): LayoutElement[] {
  if (parentId == null) return list;
  return locate(list, parentId)?.el.children || [];
}

export function allIds(list: LayoutElement[], out = new Set<string>()): Set<string> {
  for (const el of list) {
    out.add(el.id);
    if (el.children) allIds(el.children, out);
  }
  return out;
}

/** Absolute stage position of an element (sum of ancestor offsets; repeaters count their first cell). */
export function absoluteOrigin(list: LayoutElement[], id: string): { x: number; y: number } | null {
  const loc = locate(list, id);
  if (!loc) return null;
  let x = loc.el.x;
  let y = loc.el.y;
  for (const a of loc.ancestors) { x += a.x; y += a.y; }
  return { x, y };
}
