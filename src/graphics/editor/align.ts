// Align & distribute (pure). Works in absolute stage coordinates, so layers in
// different groups align visually; results are written back as each layer's
// own (parent-relative) x / y.

import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { type Command, editElements } from './store.ts';
import { absoluteOrigin, locate } from './tree.ts';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type DistributeMode = 'h' | 'v';

interface Box { id: string; x: number; y: number; w: number; h: number; ox: number; oy: number }

function boxes(doc: LayoutDocument, ids: string[]): Box[] {
  return ids.map((id) => {
    const loc = locate(doc.elements, id);
    const abs = absoluteOrigin(doc.elements, id);
    if (!loc || !abs || loc.el.locked) return null;
    return { id, x: abs.x, y: abs.y, w: loc.el.w, h: loc.el.h, ox: abs.x - loc.el.x, oy: abs.y - loc.el.y };
  }).filter(Boolean) as Box[];
}

/** Align to the selection's bounds (2+ layers) or to the stage (1 layer, or `toStage`). */
export function alignCmd(doc: LayoutDocument, ids: string[], mode: AlignMode, toStage = false): Command | null {
  const bs = boxes(doc, ids);
  if (!bs.length) return null;
  const useStage = toStage || bs.length === 1;
  const ref = useStage
    ? { x: 0, y: 0, w: doc.stage.width, h: doc.stage.height }
    : (() => {
      const x = Math.min(...bs.map((b) => b.x));
      const y = Math.min(...bs.map((b) => b.y));
      return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
    })();
  const target = new Map<string, { x?: number; y?: number }>();
  for (const b of bs) {
    const t: { x?: number; y?: number } = {};
    if (mode === 'left') t.x = ref.x;
    if (mode === 'hcenter') t.x = ref.x + (ref.w - b.w) / 2;
    if (mode === 'right') t.x = ref.x + ref.w - b.w;
    if (mode === 'top') t.y = ref.y;
    if (mode === 'vcenter') t.y = ref.y + (ref.h - b.h) / 2;
    if (mode === 'bottom') t.y = ref.y + ref.h - b.h;
    target.set(b.id, t);
  }
  return editElements(doc, bs.map((b) => b.id), (el: LayoutElement) => {
    const b = bs.find((x) => x.id === el.id)!;
    const t = target.get(el.id)!;
    return {
      ...el,
      ...(t.x != null ? { x: Math.round(t.x - b.ox) } : null),
      ...(t.y != null ? { y: Math.round(t.y - b.oy) } : null),
    };
  }, `Align ${mode}`);
}

/** Equal gaps between 3+ layers along an axis (outermost layers stay put). */
export function distributeCmd(doc: LayoutDocument, ids: string[], axis: DistributeMode): Command | null {
  const bs = boxes(doc, ids);
  if (bs.length < 3) return null;
  const key = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'w' : 'h';
  const sorted = [...bs].sort((a, b) => a[key] - b[key]);
  const start = sorted[0][key];
  const end = sorted[sorted.length - 1][key] + sorted[sorted.length - 1][size];
  const total = sorted.reduce((s, b) => s + b[size], 0);
  const gap = (end - start - total) / (sorted.length - 1);
  const pos = new Map<string, number>();
  let cur = start;
  for (const b of sorted) { pos.set(b.id, cur); cur += b[size] + gap; }
  return editElements(doc, sorted.map((b) => b.id), (el) => {
    const b = bs.find((x) => x.id === el.id)!;
    const v = pos.get(el.id)!;
    return axis === 'h' ? { ...el, x: Math.round(v - b.ox) } : { ...el, y: Math.round(v - b.oy) };
  }, `Distribute ${axis === 'h' ? 'horizontally' : 'vertically'}`);
}

/** Make every selected layer the size of the first one. */
export function matchSizeCmd(doc: LayoutDocument, ids: string[], dim: 'w' | 'h'): Command | null {
  const first = ids.map((id) => locate(doc.elements, id)?.el).find(Boolean);
  if (!first || ids.length < 2) return null;
  return editElements(doc, ids.slice(1), (el) => (el.locked ? el : { ...el, [dim]: first[dim] }), `Match ${dim === 'w' ? 'width' : 'height'}`);
}

/** Snap a value to the grid (when snapping is on). */
export const snapToGrid = (v: number, size: number) => Math.round(v / size) * size;
