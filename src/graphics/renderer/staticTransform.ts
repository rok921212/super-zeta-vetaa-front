// A layer's static transform (LayoutElement.xform): scale, skew, flip, anchor
// point and a four-corner pin. Rotation stays on the layer's own box
// (LayoutRenderer PlacedElement) where the timeline already composes it; these
// go on an inner wrapper so a playing timeline clip (which writes the outer
// box's transform) and a framer-motion enter/exit never overwrite them.
//
// The corner pin is a true projective transform (CSS matrix3d from a
// homography), not skew: it maps the layer's rectangle onto any convex
// quadrilateral, e.g. a player panel fitted into an angled broadcast frame.

import type { LayoutElement, LayerTransform } from '../schema/layoutTypes';

export const isIdentityTransform = (t?: LayerTransform | null): boolean =>
  !t ||
  ((t.scaleX ?? 1) === 1 &&
    (t.scaleY ?? 1) === 1 &&
    !t.skewX &&
    !t.skewY &&
    !t.flipX &&
    !t.flipY &&
    !hasCorners(t));

export const hasCorners = (t?: LayerTransform | null): boolean =>
  !!t?.corners && t.corners.some(([dx, dy]) => dx !== 0 || dy !== 0);

/** scale / flip / skew around the anchor point; undefined when there is none. */
export function affineCss(t?: LayerTransform | null): { transform: string; transformOrigin: string } | undefined {
  if (!t) return undefined;
  const sx = (t.scaleX ?? 1) * (t.flipX ? -1 : 1);
  const sy = (t.scaleY ?? 1) * (t.flipY ? -1 : 1);
  const parts: string[] = [];
  if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`);
  if (t.skewX) parts.push(`skewX(${t.skewX}deg)`);
  if (t.skewY) parts.push(`skewY(${t.skewY}deg)`);
  if (!parts.length) return undefined;
  return { transform: parts.join(' '), transformOrigin: `${t.originX ?? 50}% ${t.originY ?? 50}%` };
}

/** Solves A·x = b (n×n) by Gaussian elimination with partial pivoting; null if singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * The homography taking the rectangle (0,0) (w,0) (w,h) (0,h) to those
 * corners moved by `corners` (top-left, top-right, bottom-right, bottom-left
 * offsets in layout px), as a CSS matrix3d to apply with transform-origin
 * 0 0. Undefined for no pin, or a quad that cannot be mapped (collapsed).
 */
export function quadToMatrix3d(w: number, h: number, corners?: LayerTransform['corners']): string | undefined {
  if (!corners || corners.length !== 4 || !(w > 0) || !(h > 0)) return undefined;
  if (!corners.some(([dx, dy]) => dx !== 0 || dy !== 0)) return undefined;
  const src: [number, number][] = [[0, 0], [w, 0], [w, h], [0, h]];
  const dst = src.map(([x, y], i) => [x + corners[i][0], y + corners[i][1]] as [number, number]);
  // u = (a x + b y + c) / (g x + h y + 1), v = (d x + e y + f) / (g x + h y + 1)
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    B.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    B.push(v);
  }
  const s = solve(A, B);
  if (!s || s.some((n) => !Number.isFinite(n))) return undefined;
  const [a, b, c, d, e, f, g, hh] = s;
  // CSS matrix3d is column-major.
  const m = [a, d, 0, g, b, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((n) => +n.toFixed(9)).join(',')})`;
}

/** Where a point of the layer's box lands under the corner pin (for tests and editor handles). */
export function pinnedPoint(w: number, h: number, corners: LayerTransform['corners'], x: number, y: number): [number, number] {
  const css = quadToMatrix3d(w, h, corners);
  if (!css) return [x, y];
  const m = css.slice(9, -1).split(',').map(Number);
  const X = m[0] * x + m[4] * y + m[12];
  const Y = m[1] * x + m[5] * y + m[13];
  const W = m[3] * x + m[7] * y + m[15];
  return [X / W, Y / W];
}

/** The layer's transform reset: everything but position, size and rotation. */
export const withoutTransform = (el: LayoutElement): LayoutElement => {
  const { xform: _drop, ...rest } = el;
  return rest;
};
