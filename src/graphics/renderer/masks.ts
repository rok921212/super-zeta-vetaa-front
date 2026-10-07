// Masks & clipping (pure): element masks (rect / ellipse / path, optional
// invert), Photoshop clipping masks (a layer clipped to the sibling directly
// below it) and SVG path scaling. Everything resolves to CSS clip-path or an
// SVG mask image in the clipped element's OWN coordinate box.

import type React from 'react';
import type { ElementMask, LayoutElement } from '../schema/layoutTypes.ts';

// ── SVG path transform ──────────────────────────────────────────────────────

const CMD_RE = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
const NUM_RE = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Scale (and translate absolute coordinates of) an SVG path. Relative commands only scale. */
export function transformPath(d: string, sx: number, sy: number, tx = 0, ty = 0): string {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  CMD_RE.lastIndex = 0;
  while ((m = CMD_RE.exec(d))) {
    const cmd = m[1];
    const up = cmd.toUpperCase();
    const abs = cmd === up;
    const nums = (m[2].match(NUM_RE) || []).map(Number);
    if (up === 'Z') { out.push(cmd); continue; }
    const n = ARGS[up];
    const parts: number[] = [];
    for (let i = 0; i + n <= nums.length; i += n) {
      const a = nums.slice(i, i + n);
      if (up === 'H') parts.push(r3(a[0] * sx + (abs ? tx : 0)));
      else if (up === 'V') parts.push(r3(a[0] * sy + (abs ? ty : 0)));
      else if (up === 'A') parts.push(r3(a[0] * sx), r3(a[1] * sy), a[2], a[3], a[4], r3(a[5] * sx + (abs ? tx : 0)), r3(a[6] * sy + (abs ? ty : 0)));
      else for (let j = 0; j < n; j += 2) parts.push(r3(a[j] * sx + (abs ? tx : 0)), r3(a[j + 1] * sy + (abs ? ty : 0)));
    }
    out.push(`${cmd}${parts.join(' ')}`);
  }
  return out.join(' ');
}

/** Bounding box of a path's absolute points (good enough for M/L/C/Q built by the pen tool). */
export function pathBounds(d: string): { x: number; y: number; w: number; h: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  let cx = 0;
  let cy = 0;
  let m: RegExpExecArray | null;
  CMD_RE.lastIndex = 0;
  while ((m = CMD_RE.exec(d))) {
    const up = m[1].toUpperCase();
    const rel = m[1] !== up;
    const nums = (m[2].match(NUM_RE) || []).map(Number);
    const n = ARGS[up];
    if (!n) continue;
    for (let i = 0; i + n <= nums.length; i += n) {
      const a = nums.slice(i, i + n);
      const pts: Array<[number, number]> = [];
      if (up === 'H') pts.push([rel ? cx + a[0] : a[0], cy]);
      else if (up === 'V') pts.push([cx, rel ? cy + a[0] : a[0]]);
      else if (up === 'A') pts.push([rel ? cx + a[5] : a[5], rel ? cy + a[6] : a[6]]);
      else for (let j = 0; j < n; j += 2) pts.push([rel ? cx + a[j] : a[j], rel ? cy + a[j + 1] : a[j + 1]]);
      for (const [px, py] of pts) { xs.push(px); ys.push(py); }
      const last = pts[pts.length - 1];
      cx = last[0];
      cy = last[1];
    }
  }
  if (!xs.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// ── masks ───────────────────────────────────────────────────────────────────

interface Box { x: number; y: number; w: number; h: number }

const svgUrl = (w: number, h: number, inner: string) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${inner}</svg>`)}")`;

/** A mask shape placed at `box` (in the clipped element's coordinates) as CSS. */
function shapeCss(shape: ElementMask, box: Box, target: { w: number; h: number }): React.CSSProperties {
  const w = Math.max(1, target.w);
  const h = Math.max(1, target.h);
  const pathD = shape.shape === 'path' && shape.d
    ? transformPath(shape.d, box.w / (shape.vb?.[0] || box.w || 1), box.h / (shape.vb?.[1] || box.h || 1), box.x, box.y)
    : null;
  if (shape.invert) {
    const hole = shape.shape === 'ellipse'
      ? `<ellipse cx='${r3(box.x + box.w / 2)}' cy='${r3(box.y + box.h / 2)}' rx='${r3(box.w / 2)}' ry='${r3(box.h / 2)}' fill='black'/>`
      : pathD
        ? `<path d='${pathD}' fill='black'/>`
        : `<rect x='${r3(box.x)}' y='${r3(box.y)}' width='${r3(box.w)}' height='${r3(box.h)}' rx='${shape.radius ?? 0}' fill='black'/>`;
    const img = svgUrl(w, h, `<rect width='${w}' height='${h}' fill='white'/>${hole}`);
    return { maskImage: img, WebkitMaskImage: img, maskSize: '100% 100%', WebkitMaskSize: '100% 100%', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskMode: 'luminance' } as React.CSSProperties;
  }
  let clip: string;
  if (shape.shape === 'ellipse') clip = `ellipse(${r3(box.w / 2)}px ${r3(box.h / 2)}px at ${r3(box.x + box.w / 2)}px ${r3(box.y + box.h / 2)}px)`;
  else if (pathD) clip = `path('${pathD}')`;
  else {
    const top = r3(box.y);
    const left = r3(box.x);
    const right = r3(w - (box.x + box.w));
    const bottom = r3(h - (box.y + box.h));
    clip = `inset(${top}px ${right}px ${bottom}px ${left}px${shape.radius ? ` round ${shape.radius}px` : ''})`;
  }
  return { clipPath: clip, WebkitClipPath: clip };
}

/** The element's own mask, in its own box. */
export function maskCss(el: Pick<LayoutElement, 'mask' | 'w' | 'h'>): React.CSSProperties | null {
  if (!el.mask) return null;
  return shapeCss(el.mask, { x: 0, y: 0, w: el.w, h: el.h }, el);
}

const numStyle = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Clipping mask: `el` is clipped to the shape of `base` (the sibling below).
 * rect/ellipse/path bases clip exactly; an image base masks by its alpha;
 * anything else clips to the base's (rounded) box.
 */
export function clipToBaseCss(el: Pick<LayoutElement, 'x' | 'y' | 'w' | 'h'>, base: LayoutElement): React.CSSProperties {
  const box = { x: base.x - el.x, y: base.y - el.y, w: base.w, h: base.h };
  if (base.type === 'image' || base.type === 'teamLogo' || base.type === 'playerAvatar' || base.type === 'flag') {
    const src = base.src || '';
    if (/^(https:\/\/|\/)/.test(src)) {
      const img = `url("${src.replace(/"/g, '%22')}")`;
      return {
        maskImage: img, WebkitMaskImage: img,
        maskSize: `${box.w}px ${box.h}px`, WebkitMaskSize: `${box.w}px ${box.h}px`,
        maskPosition: `${box.x}px ${box.y}px`, WebkitMaskPosition: `${box.x}px ${box.y}px`,
        maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
      } as React.CSSProperties;
    }
  }
  if (base.type === 'ellipse') return shapeCss({ shape: 'ellipse' }, box, el);
  if (base.type === 'path' && base.d) return shapeCss({ shape: 'path', d: base.d, vb: base.vb || [base.w, base.h] }, box, el);
  const radius = numStyle(base.style?.radius);
  return shapeCss({ shape: 'rect', radius }, box, el);
}

/** For each child index, the clipping base (nearest sibling below that isn't itself clipped). */
export function clipBases(list: LayoutElement[]): Array<LayoutElement | null> {
  const out: Array<LayoutElement | null> = [];
  let base: LayoutElement | null = null;
  for (const el of list) {
    if (el.clipToBelow && base) out.push(base);
    else { out.push(null); base = el; }
  }
  return out;
}
