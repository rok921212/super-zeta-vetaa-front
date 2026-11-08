// Pure pixel functions for the image studio. Everything works on a single
// alpha mask (Uint8ClampedArray, one byte per pixel, 0 = removed, 255 = kept)
// next to the working image's RGBA pixels. No DOM here, so it is unit-tested
// directly and could move into a worker unchanged.

export type Mask = Uint8ClampedArray;

export interface Pixels {
  data: Uint8ClampedArray; // RGBA
  width: number;
  height: number;
}

export type RGB = [number, number, number];

const colorDist = (d: Uint8ClampedArray, i: number, c: RGB) => {
  const r = d[i] - c[0];
  const g = d[i + 1] - c[1];
  const b = d[i + 2] - c[2];
  return Math.sqrt(r * r + g * g + b * b);
};

/** The source's own alpha as a mask (a PNG that is already transparent stays so). */
export function alphaOf(px: Pixels): Mask {
  const n = px.width * px.height;
  const m = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) m[i] = px.data[i * 4 + 3];
  return m;
}

/** Pixel-wise minimum, written into `a`. */
export function intersect(a: Mask, b: Mask): Mask {
  for (let i = 0; i < a.length; i++) if (b[i] < a[i]) a[i] = b[i];
  return a;
}

// ── Border analysis ──────────────────────────────────────────────────────────

export interface BorderInfo {
  /** Share (0-1) of border pixels that are already transparent. */
  transparent: number;
  /** Dominant opaque border colour and the share of border pixels close to it. */
  color: RGB | null;
  uniformity: number;
}

/**
 * Looks at the outermost 2 px ring. A logo on a flat white / black / coloured
 * card has one colour covering most of it — that is when a colour key beats
 * the AI model (which is trained on photos and often eats flat logo parts).
 */
export function analyzeBorder(px: Pixels, tolerance = 32): BorderInfo {
  const { data, width: w, height: h } = px;
  const idx: number[] = [];
  const ring = Math.min(2, Math.floor(Math.min(w, h) / 2));
  for (let r = 0; r < ring; r++) {
    for (let x = 0; x < w; x++) { idx.push((r * w + x) * 4, ((h - 1 - r) * w + x) * 4); }
    for (let y = ring; y < h - ring; y++) { idx.push((y * w + r) * 4, (y * w + (w - 1 - r)) * 4); }
  }
  if (!idx.length) return { transparent: 0, color: null, uniformity: 0 };

  let transparent = 0;
  // 4-bit-per-channel histogram of opaque border pixels.
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    if (data[i + 3] < 128) { transparent++; continue; }
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bucket = buckets.get(key);
    if (bucket) { bucket.n++; bucket.r += data[i]; bucket.g += data[i + 1]; bucket.b += data[i + 2]; }
    else buckets.set(key, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  buckets.forEach((b) => { if (!best || b.n > best.n) best = b; });
  if (!best) return { transparent: transparent / idx.length, color: null, uniformity: 0 };
  const top = best as { n: number; r: number; g: number; b: number };
  const color: RGB = [top.r / top.n, top.g / top.n, top.b / top.n];
  let close = 0;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    if (data[i + 3] >= 128 && colorDist(data, i, color) <= tolerance) close++;
  }
  return { transparent: transparent / idx.length, color, uniformity: close / idx.length };
}

// ── Colour key ───────────────────────────────────────────────────────────────

export interface ColorKeyOptions {
  color: RGB;
  /** RGB distance (0-441) still counted as background. */
  tolerance: number;
  /** Extra distance over which the edge fades from removed to kept. */
  feather?: number;
  /**
   * Also remove matching colour that is NOT connected to the border
   * (the inside of an "O", gaps between letters).
   */
  everywhere?: boolean;
}

/**
 * Removes the background colour by flood-filling from the image border.
 * Edges get a soft ramp, and `decontaminate` can later strip the colour
 * fringe from those pixels.
 */
export function colorKeyMask(px: Pixels, opts: ColorKeyOptions): Mask {
  const { data, width: w, height: h } = px;
  const n = w * h;
  const tol = opts.tolerance;
  const feather = Math.max(1, opts.feather ?? 24);
  const dist = new Float32Array(n);
  for (let p = 0; p < n; p++) dist[p] = colorDist(data, p * 4, opts.color);

  const bg = new Uint8Array(n); // 1 = background
  if (opts.everywhere) {
    for (let p = 0; p < n; p++) if (dist[p] <= tol) bg[p] = 1;
  } else {
    const stack = new Int32Array(n);
    let sp = 0;
    const seed = (p: number) => { if (!bg[p] && dist[p] <= tol) { bg[p] = 1; stack[sp++] = p; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w;
      if (x > 0) seed(p - 1);
      if (x < w - 1) seed(p + 1);
      if (p >= w) seed(p - w);
      if (p < n - w) seed(p + w);
    }
  }

  const mask = new Uint8ClampedArray(n);
  for (let p = 0; p < n; p++) mask[p] = bg[p] ? 0 : 255;
  // Soft edge: kept pixels touching the background ramp with colour distance,
  // so anti-aliased logo edges don't turn into a hard staircase.
  const near = dilate(bg, w, h, 2);
  for (let p = 0; p < n; p++) {
    if (bg[p] || !near[p]) continue;
    const t = (dist[p] - tol) / feather;
    if (t < 1) mask[p] = Math.round(Math.max(0, t) * 255);
  }
  return mask;
}

/**
 * Un-blends a known background colour out of semi-transparent edge pixels
 * (c = a·fg + (1-a)·bg  →  fg = (c - (1-a)·bg) / a), so a logo cut from white
 * doesn't keep a white halo on a dark overlay. Writes into `px.data`.
 */
export function decontaminate(px: Pixels, mask: Mask, bg: RGB) {
  const { data } = px;
  for (let p = 0; p < mask.length; p++) {
    const a = mask[p] / 255;
    if (a <= 0.02 || a >= 0.98) continue;
    const i = p * 4;
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.max(0, Math.min(255, (data[i + c] - (1 - a) * bg[c]) / a));
    }
  }
}

// ── Morphology / components ──────────────────────────────────────────────────

/** Square dilation of a 0/1 map (separable running max). */
export function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let last = -Infinity;
    for (let x = 0; x < w; x++) { if (src[row + x]) last = x; if (x - last <= r) tmp[row + x] = 1; }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) { if (src[row + x]) last = x; if (last - x <= r) tmp[row + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) { if (tmp[y * w + x]) last = y; if (y - last <= r) out[y * w + x] = 1; }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) last = y; if (last - y <= r) out[y * w + x] = 1; }
  }
  return out;
}

/**
 * Drops leftover specks: kept islands smaller than `minArea` px are removed,
 * and removed holes smaller than `minArea` that don't touch the border are
 * filled. Typical AI leftovers are a bit of background next to the subject or
 * pin-holes in a jersey.
 */
export function removeSmallIslands(mask: Mask, w: number, h: number, minArea: number): Mask {
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const members = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (seen[start]) continue;
    const fg = mask[start] > 127;
    let sp = 0;
    let count = 0;
    let touchesBorder = false;
    seen[start] = 1;
    stack[sp++] = start;
    while (sp > 0) {
      const p = stack[--sp];
      members[count++] = p;
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;
      // eslint-disable-next-line no-loop-func -- stack/sp are local to this fill
      const visit = (q: number) => {
        if (!seen[q] && (mask[q] > 127) === fg) { seen[q] = 1; stack[sp++] = q; }
      };
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (y > 0) visit(p - w);
      if (y < h - 1) visit(p + w);
    }
    if (count >= minArea) continue;
    if (fg) for (let k = 0; k < count; k++) mask[members[k]] = 0;
    else if (!touchesBorder) for (let k = 0; k < count; k++) mask[members[k]] = 255;
  }
  return mask;
}

/** Number of kept (>127) pixels. */
export function keptArea(mask: Mask): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > 127) n++;
  return n;
}

// ── Edge refinement ──────────────────────────────────────────────────────────

/** Box mean with radius r (integral image), into `out`. */
function boxMean(src: Float32Array, w: number, h: number, r: number, out: Float32Array) {
  const W = w + 1;
  const sat = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += src[y * w + x];
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + rowSum;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const s = sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0];
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
}

/**
 * Guided filter (He et al.) with the photo's luminance as guide. The model
 * predicts at 1024² and its mask is upscaled bilinearly, so hair, fingers and
 * jersey edges come out blurry; this snaps the soft band to real image edges.
 * Pixels far from any edge keep the model's value.
 */
export function refineEdges(px: Pixels, mask: Mask, radius?: number, eps = 1e-4): Mask {
  const { data, width: w, height: h } = px;
  const n = w * h;
  const r = radius ?? Math.max(2, Math.round(Math.max(w, h) / 400));
  const I = new Float32Array(n);
  const P = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    I[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    P[p] = mask[p] / 255;
  }
  const meanI = new Float32Array(n);
  const meanP = new Float32Array(n);
  const tmp = new Float32Array(n);
  const corrI = new Float32Array(n);
  const corrIP = new Float32Array(n);
  boxMean(I, w, h, r, meanI);
  boxMean(P, w, h, r, meanP);
  for (let p = 0; p < n; p++) tmp[p] = I[p] * I[p];
  boxMean(tmp, w, h, r, corrI);
  for (let p = 0; p < n; p++) tmp[p] = I[p] * P[p];
  boxMean(tmp, w, h, r, corrIP);
  // a, b reuse corrI / corrIP.
  for (let p = 0; p < n; p++) {
    const varI = corrI[p] - meanI[p] * meanI[p];
    const cov = corrIP[p] - meanI[p] * meanP[p];
    const a = cov / (varI + eps);
    corrI[p] = a;
    corrIP[p] = meanP[p] - a * meanI[p];
  }
  boxMean(corrI, w, h, r, tmp); // mean a
  boxMean(corrIP, w, h, r, corrI); // mean b
  const out = new Uint8ClampedArray(n);
  for (let p = 0; p < n; p++) {
    // Only the band where the model was undecided (mean neither 0 nor 1).
    const m = meanP[p];
    if (m < 0.01 || m > 0.99) { out[p] = mask[p]; continue; }
    const q = tmp[p] * I[p] + corrI[p];
    out[p] = Math.round(Math.max(0, Math.min(1, q)) * 255);
  }
  return out;
}

/**
 * Soft alpha is only real along the subject's outline (hair, motion blur).
 * The model also returns big half-grey areas where it is unsure — a dark
 * chair behind a player shows up as a translucent ghost. Outside a band of
 * `band` px around the 50 % outline, every pixel is snapped to fully kept or
 * fully removed.
 */
export function snapOutsideEdgeBand(mask: Mask, w: number, h: number, band?: number): Mask {
  const n = w * h;
  const b = band ?? Math.max(3, Math.round(Math.max(w, h) * 0.012));
  const edge = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const fg = mask[p] > 127;
      if ((x < w - 1 && (mask[p + 1] > 127) !== fg) || (y < h - 1 && (mask[p + w] > 127) !== fg)) {
        edge[p] = 1;
      }
    }
  }
  const near = dilate(edge, w, h, b);
  for (let p = 0; p < n; p++) if (!near[p]) mask[p] = mask[p] > 127 ? 255 : 0;
  return mask;
}

const ALPHA_LOW = 30;
const ALPHA_HIGH = 225;

/**
 * Near-transparent → transparent (halo), near-opaque → opaque (faint holes),
 * band between contrast-stretched so antialiasing survives.
 */
export function tightenAlpha(mask: Mask, low = ALPHA_LOW, high = ALPHA_HIGH): Mask {
  const range = high - low;
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i];
    if (a <= low) mask[i] = 0;
    else if (a >= high) mask[i] = 255;
    else mask[i] = Math.round(((a - low) / range) * 255);
  }
  return mask;
}

// ── Manual marking ───────────────────────────────────────────────────────────

export type MarkMode = 'keep' | 'remove';

/**
 * Stamps a round, slightly soft brush. Keep raises the mask (never above the
 * source's own alpha `limit`), Remove lowers it.
 * Returns the touched rectangle [x0, y0, x1, y1) for partial redraws.
 */
export function stampBrush(
  mask: Mask, w: number, h: number,
  cx: number, cy: number, radius: number, mode: MarkMode, limit?: Mask,
): [number, number, number, number] {
  const soft = Math.max(1, radius * 0.15);
  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const x1 = Math.min(w, Math.ceil(cx + radius + 1));
  const y1 = Math.min(h, Math.ceil(cy + radius + 1));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > radius) continue;
      const cov = d <= radius - soft ? 1 : (radius - d) / soft;
      const p = y * w + x;
      if (mode === 'keep') {
        const cap = limit ? limit[p] : 255;
        const v = Math.min(cap, Math.max(mask[p], cov * 255));
        mask[p] = v;
      } else {
        mask[p] = Math.min(mask[p], (1 - cov) * 255);
      }
    }
  }
  return [x0, y0, x1, y1];
}

/** Stamps along a segment so fast strokes don't leave dotted gaps. */
export function strokeBrush(
  mask: Mask, w: number, h: number,
  ax: number, ay: number, bx: number, by: number,
  radius: number, mode: MarkMode, limit?: Mask,
): [number, number, number, number] {
  const len = Math.hypot(bx - ax, by - ay);
  const step = Math.max(1, radius / 3);
  const steps = Math.max(1, Math.ceil(len / step));
  let rx0 = w, ry0 = h, rx1 = 0, ry1 = 0;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const [x0, y0, x1, y1] = stampBrush(mask, w, h, ax + (bx - ax) * t, ay + (by - ay) * t, radius, mode, limit);
    rx0 = Math.min(rx0, x0); ry0 = Math.min(ry0, y0); rx1 = Math.max(rx1, x1); ry1 = Math.max(ry1, y1);
  }
  return [rx0, ry0, rx1, ry1];
}

/**
 * Magic wand: the connected area of similar colour around (sx, sy) is set to
 * removed or kept. Returns the touched rectangle, or null if nothing changed.
 */
export function wandFill(
  px: Pixels, mask: Mask, sx: number, sy: number, tolerance: number, mode: MarkMode, limit?: Mask,
): [number, number, number, number] | null {
  const { data, width: w, height: h } = px;
  const x = Math.floor(sx);
  const y = Math.floor(sy);
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const n = w * h;
  const start = y * w + x;
  const seedColor: RGB = [data[start * 4], data[start * 4 + 1], data[start * 4 + 2]];
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  let rx0 = x, ry0 = y, rx1 = x + 1, ry1 = y + 1;
  seen[start] = 1;
  stack[sp++] = start;
  while (sp > 0) {
    const p = stack[--sp];
    const px0 = p % w;
    const py0 = (p - px0) / w;
    mask[p] = mode === 'remove' ? 0 : (limit ? limit[p] : 255);
    if (px0 < rx0) rx0 = px0; if (px0 + 1 > rx1) rx1 = px0 + 1;
    if (py0 < ry0) ry0 = py0; if (py0 + 1 > ry1) ry1 = py0 + 1;
    // eslint-disable-next-line no-loop-func -- stack/sp are local to this fill
    const visit = (q: number) => {
      if (!seen[q] && colorDist(data, q * 4, seedColor) <= tolerance) { seen[q] = 1; stack[sp++] = q; }
    };
    if (px0 > 0) visit(p - 1);
    if (px0 < w - 1) visit(p + 1);
    if (py0 > 0) visit(p - w);
    if (py0 < h - 1) visit(p + w);
  }
  return [rx0, ry0, rx1, ry1];
}

/** RGBA copy of the source with the mask as alpha. */
export function applyMask(px: Pixels, mask: Mask): Uint8ClampedArray {
  const out = new Uint8ClampedArray(px.data);
  for (let p = 0; p < mask.length; p++) out[p * 4 + 3] = mask[p];
  return out;
}
