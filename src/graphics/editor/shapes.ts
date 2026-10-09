// Polygon geometry for the shape tools and for image frames: regular
// polygons, stars and the slanted / notched panels broadcast graphics use.
// Points are in a box of `w` × `h` (the element's `vb`), so the shape scales
// with the layer. Pure.

import type { ElementMask, LayoutElement } from '../schema/layoutTypes.ts';

export type Pt = [number, number];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A regular polygon inscribed in the box, first corner at the top. */
export function regularPolygon(sides: number, w: number, h: number): Pt[] {
  const n = Math.max(3, Math.min(12, Math.round(sides)));
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  return fitToBox(pts, w, h);
}

/** A star with `points` tips; `inner` is the inner radius as a fraction of the outer (0.1..0.9). */
export function starPolygon(points: number, w: number, h: number, inner = 0.45): Pt[] {
  const n = Math.max(3, Math.min(12, Math.round(points)));
  const k = Math.max(0.1, Math.min(0.9, inner));
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 === 0 ? 1 : k;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return fitToBox(pts, w, h);
}

/** Stretch a set of points so its bounding box is exactly 0..w × 0..h. */
export function fitToBox(pts: Pt[], w: number, h: number): Pt[] {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const sx = Math.max(...xs) - x0 || 1;
  const sy = Math.max(...ys) - y0 || 1;
  return pts.map(([x, y]) => [r2(((x - x0) / sx) * w), r2(((y - y0) / sy) * h)]);
}

export interface ShapePreset { id: string; label: string; points(w: number, h: number): Pt[] }

/** Shapes offered by the polygon tool, "Change frame shape" and the mask presets. */
export const SHAPE_PRESETS: ShapePreset[] = [
  { id: 'triangle', label: 'Triangle', points: (w, h) => regularPolygon(3, w, h) },
  { id: 'diamond', label: 'Diamond', points: (w, h) => [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]] },
  { id: 'pentagon', label: 'Pentagon', points: (w, h) => regularPolygon(5, w, h) },
  { id: 'hexagon', label: 'Hexagon', points: (w, h) => [[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]] },
  { id: 'octagon', label: 'Octagon', points: (w, h) => [[w * 0.3, 0], [w * 0.7, 0], [w, h * 0.3], [w, h * 0.7], [w * 0.7, h], [w * 0.3, h], [0, h * 0.7], [0, h * 0.3]] },
  { id: 'star', label: 'Star', points: (w, h) => starPolygon(5, w, h) },
  { id: 'slant', label: 'Slanted panel', points: (w, h) => [[w * 0.18, 0], [w, 0], [w * 0.82, h], [0, h]] },
  { id: 'slant-left', label: 'Slanted panel (reversed)', points: (w, h) => [[0, 0], [w * 0.82, 0], [w, h], [w * 0.18, h]] },
  { id: 'chevron', label: 'Arrow panel', points: (w, h) => [[0, 0], [w * 0.82, 0], [w, h / 2], [w * 0.82, h], [0, h], [w * 0.18, h / 2]] },
  { id: 'notch', label: 'Cut corner', points: (w, h) => [[0, 0], [w * 0.86, 0], [w, h * 0.3], [w, h], [0, h]] },
];

export const shapePreset = (id: string): ShapePreset | undefined => SHAPE_PRESETS.find((s) => s.id === id);

const round = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [r2(x), r2(y)]);

/** The fields of a polygon element for `points` laid out in a `w` × `h` box. */
export function polygonFields(points: Pt[], w: number, h: number): Pick<LayoutElement, 'type' | 'points' | 'vb'> {
  return { type: 'polygon', points: round(points), vb: [Math.max(1, r2(w)), Math.max(1, r2(h))] };
}

/** A polygon as SVG path data ("M x y L x y … Z"): what a `path` mask stores. */
export function polygonPath(points: Pt[]): string {
  return `${round(points).map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')} Z`;
}

/** A mask in the shape of a preset, sized to the element (it scales with the element afterwards). */
export function presetMask(id: string, w: number, h: number): ElementMask | null {
  const p = shapePreset(id);
  if (!p) return null;
  const bw = Math.max(1, w);
  const bh = Math.max(1, h);
  return { shape: 'path', d: polygonPath(p.points(bw, bh)), vb: [bw, bh] };
}
