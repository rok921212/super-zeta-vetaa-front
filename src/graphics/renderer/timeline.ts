// Keyframe timeline player (pure). A clip is a set of property tracks; each
// track is a list of keyframes { t (ms), value, ease }. The ease on keyframe k
// shapes the interpolation from k to k+1 (After Effects convention). Values
// may be bound to live data ({ bind: DataRef }) — resolved against the scope
// the clip plays in (with `event` for event-triggered clips).
//
// Nothing here touches React or the DOM: `sampleClip` is a function of
// (clip, time, scope), which makes scrubbing deterministic and testable.

import type { Easing, Keyframe, KeyframeEase, TimelineClip, TimelineProp, TimelineTrack } from '../schema/layoutTypes.ts';
import { resolveBinding, type BindingScope } from '../bindings/index.ts';

export const COLOR_PROPS: ReadonlySet<TimelineProp> = new Set<TimelineProp>(['fill', 'color', 'stroke']);

// ── easing ──────────────────────────────────────────────────────────────────

/** Named easings as cubic-bezier control points (the graph editor shows and edits these). */
export const EASE_CURVES: Partial<Record<Easing, [number, number, number, number]>> = {
  linear: [0, 0, 1, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  backOut: [0.34, 1.56, 0.64, 1],
  anticipate: [0.68, -0.55, 0.27, 1.55],
  easeInQuad: [0.11, 0, 0.5, 0], easeOutQuad: [0.5, 1, 0.89, 1], easeInOutQuad: [0.45, 0, 0.55, 1],
  easeInCubic: [0.32, 0, 0.67, 0], easeOutCubic: [0.33, 1, 0.68, 1], easeInOutCubic: [0.65, 0, 0.35, 1],
  easeInQuart: [0.5, 0, 0.75, 0], easeOutQuart: [0.25, 1, 0.5, 1], easeInOutQuart: [0.76, 0, 0.24, 1],
  easeInExpo: [0.7, 0, 0.84, 0], easeOutExpo: [0.16, 1, 0.3, 1], easeInOutExpo: [0.87, 0, 0.13, 1],
  easeInCirc: [0.55, 0, 1, 0.45], easeOutCirc: [0, 0.55, 0.45, 1], easeInOutCirc: [0.85, 0, 0.15, 1],
  backIn: [0.36, 0, 0.66, -0.56], backInOut: [0.68, -0.6, 0.32, 1.6],
};

/** Easings that are not béziers. */
export const EASE_FUNCTIONS: Partial<Record<Easing, (p: number) => number>> = {
  // overshoots and settles (a damped spring)
  elasticOut: (p) => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin(((p * 10 - 0.75) * 2 * Math.PI) / 3) + 1),
  // falls and bounces to rest
  bounceOut: (p) => {
    const n = 7.5625;
    const d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) { const q = p - 1.5 / d; return n * q * q + 0.75; }
    if (p < 2.5 / d) { const q = p - 2.25 / d; return n * q * q + 0.9375; }
    const q = p - 2.625 / d;
    return n * q * q + 0.984375;
  },
  // After Effects "toggle hold keyframe": the value stays put, then jumps at the next key
  hold: (p) => (p >= 1 ? 1 : 0),
};

/** CSS-style cubic-bezier(x1, y1, x2, y2) as a function of progress 0..1. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  if (x1 === y1 && x2 === y2) return (p) => p; // linear
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solveT = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // bisection fallback
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (p) => (p <= 0 ? 0 : p >= 1 ? 1 : sampleY(solveT(p)));
}

const easeCache = new Map<string, (p: number) => number>();
export function easeFn(ease: KeyframeEase | undefined): (p: number) => number {
  if (typeof ease === 'string' && EASE_FUNCTIONS[ease]) return EASE_FUNCTIONS[ease]!;
  const pts = Array.isArray(ease) ? ease : EASE_CURVES[ease || 'linear'] || EASE_CURVES.linear!;
  const key = pts.join(',');
  let fn = easeCache.get(key);
  if (!fn) { fn = cubicBezier(pts[0], pts[1], pts[2], pts[3]); easeCache.set(key, fn); }
  return fn;
}

// ── colors ──────────────────────────────────────────────────────────────────

export type RGBA = [number, number, number, number];

export function parseColor(c: unknown): RGBA | null {
  if (typeof c !== 'string') return null;
  const s = c.trim();
  let m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
  if (m) {
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), a];
  }
  if (s === 'transparent') return [0, 0, 0, 0];
  return null;
}

export const rgbaString = ([r, g, b, a]: RGBA) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Math.round(a * 1000) / 1000})`;

// ── sampling ────────────────────────────────────────────────────────────────

export type FrameValues = Partial<Record<TimelineProp, number | string>>;

export function keyframeValue(k: Keyframe, scope: BindingScope | null): number | string | undefined {
  const v = k.value as any;
  if (v && typeof v === 'object' && 'bind' in v) {
    const r = scope ? resolveBinding(v.bind, scope) : undefined;
    if (typeof r === 'number' && Number.isFinite(r)) return r;
    if (typeof r === 'string') {
      const n = Number(r);
      return r.trim() !== '' && Number.isFinite(n) ? n : r;
    }
    return undefined;
  }
  return v;
}

const sortedCache = new WeakMap<Keyframe[], Keyframe[]>();
const sorted = (kfs: Keyframe[]) => {
  let s = sortedCache.get(kfs);
  if (!s) { s = [...kfs].sort((a, b) => a.t - b.t); sortedCache.set(kfs, s); }
  return s;
};

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967295; };

/**
 * After-Effects wiggle(freq, amp): smooth, deterministic noise in -amp..amp.
 * Two sines at unrelated rates; `seed` (property + row index) keeps rows and
 * properties out of step with each other.
 */
export function wiggleAt(t: number, freq: number, amp: number, seed: string): number {
  const s = t / 1000;
  const a = hash(seed) * Math.PI * 2;
  const b = hash(`${seed}#`) * Math.PI * 2;
  return amp * (0.62 * Math.sin(2 * Math.PI * freq * s + a) + 0.38 * Math.sin(2 * Math.PI * freq * 2.31 * s + b));
}

/** Value of one track at local time t (ms). Holds the first/last value outside the keyed range. */
export function sampleTrack(track: TimelineTrack, t: number, scope: BindingScope | null): number | string | undefined {
  const v = sampleKeys(track, t, scope);
  if (track.wiggle && typeof v === 'number') return v + wiggleAt(t, track.wiggle.freq, track.wiggle.amp, `${track.prop}:${scope?.index ?? 0}`);
  return v;
}

function sampleKeys(track: TimelineTrack, t: number, scope: BindingScope | null): number | string | undefined {
  const kfs = sorted(track.keyframes);
  if (!kfs.length) return undefined;
  if (t <= kfs[0].t) return keyframeValue(kfs[0], scope);
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return keyframeValue(last, scope);
  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1].t <= t) i++;
  const a = kfs[i];
  const b = kfs[i + 1];
  const va = keyframeValue(a, scope);
  const vb = keyframeValue(b, scope);
  const span = b.t - a.t;
  const p = span > 0 ? easeFn(a.ease)((t - a.t) / span) : 1;
  if (COLOR_PROPS.has(track.prop)) {
    const ca = parseColor(va);
    const cb = parseColor(vb);
    if (!ca || !cb) return p < 0.5 ? va : vb; // unparseable (named color): step
    return rgbaString([0, 1, 2, 3].map((j) => ca[j] + (cb[j] - ca[j]) * p) as RGBA);
  }
  const na = Number(va);
  const nb = Number(vb);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return p < 0.5 ? va : vb;
  return na + (nb - na) * p;
}

export function sampleClip(clip: TimelineClip, t: number, scope: BindingScope | null): FrameValues {
  const out: FrameValues = {};
  for (const track of clip.tracks) {
    const v = sampleTrack(track, t, scope);
    if (v !== undefined) out[track.prop] = v;
  }
  return out;
}

/** How long a clip waits before it starts for the row at `index` (delay + stagger). */
export const clipDelay = (clip: Pick<TimelineClip, 'delay' | 'stagger'>, index = 0): number =>
  Math.max(0, clip.delay || 0) + Math.max(0, clip.stagger || 0) * Math.max(0, index || 0);

/** Wall-clock length of one full run (delay + every play, at the clip's speed). Infinity for endless loops. */
export function clipTotalMs(clip: TimelineClip, index = 0): number {
  if (clip.loop === true) return Infinity;
  const plays = typeof clip.loop === 'number' ? clip.loop + 1 : 1;
  return clipDelay(clip, index) + (Math.max(1, clip.duration) * plays) / Math.max(0.1, clip.speed || 1);
}

/**
 * Local time of a clip `elapsed` ms after it was triggered, and whether it's
 * done. loop: true = forever; a number n = play n extra times; otherwise once.
 * Honours delay (+ stagger per row `index`), speed, and ping-pong direction.
 */
export function clipTime(clip: TimelineClip, elapsed: number, index = 0): { t: number; done: boolean } {
  const d = Math.max(1, clip.duration);
  const e = (elapsed - clipDelay(clip, index)) * Math.max(0.1, clip.speed || 1);
  if (e <= 0) return { t: 0, done: false }; // waiting: rest on the first frame
  const alternate = clip.direction === 'alternate';
  const at = (cycle: number, local: number) => (alternate && cycle % 2 === 1 ? d - local : local);
  if (clip.loop === true) return { t: at(Math.floor(e / d), e % d), done: false };
  const plays = typeof clip.loop === 'number' ? clip.loop + 1 : 1;
  if (e >= d * plays) return { t: at(plays - 1, d), done: true };
  return { t: at(Math.floor(e / d), e % d), done: false };
}

/** Latest keyframe time in a clip (useful default duration). */
export const clipContentEnd = (clip: Pick<TimelineClip, 'tracks'>): number =>
  clip.tracks.reduce((m, tr) => Math.max(m, ...tr.keyframes.map((k) => k.t)), 0);

// ── applying a frame ────────────────────────────────────────────────────────

export interface FrameBase { x: number; y: number; w: number; h: number; rotation: number; opacity: number }

/** Inline style for the element wrapper given base geometry + animated values. */
export function frameStyle(base: FrameBase, v: FrameValues): {
  left: number; top: number; width: number; height: number; opacity: number; transform: string | undefined; filter: string | undefined;
  /** transform-origin (the AE anchor point), when animated. */
  origin: string | undefined;
  /** clip-path for wipes / reveals. */
  clip: string | undefined;
  /** px; inherited by the text inside. */
  letterSpacing: number | undefined;
  vars: Record<string, string>;
} {
  const n = (k: TimelineProp, d: number) => (typeof v[k] === 'number' ? (v[k] as number) : d);
  const rotation = n('rotation', base.rotation);
  const scale = n('scale', 1);
  const sx = n('scaleX', 1) * scale;
  const sy = n('scaleY', 1) * scale;
  const skew = n('skewX', 0);
  const skewY = n('skewY', 0);
  const dx = n('dx', 0);
  const dy = n('dy', 0);
  const rx = n('rotateX', 0);
  const ry = n('rotateY', 0);
  const parts: string[] = [];
  if (dx || dy) parts.push(`translate(${dx}px, ${dy}px)`);
  if (rx || ry) parts.push(`perspective(900px)${rx ? ` rotateX(${rx}deg)` : ''}${ry ? ` rotateY(${ry}deg)` : ''}`);
  if (rotation) parts.push(`rotate(${rotation}deg)`);
  if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`);
  if (skew) parts.push(`skewX(${skew}deg)`);
  if (skewY) parts.push(`skewY(${skewY}deg)`);
  const blur = n('blur', 0);
  const gray = Math.max(0, Math.min(1, n('grayscale', 0)));
  const bright = Math.max(0, n('brightness', 1));
  const filters: string[] = [];
  if (blur > 0) filters.push(`blur(${blur}px)`);
  if (gray > 0) filters.push(`grayscale(${gray})`);
  if (bright !== 1) filters.push(`brightness(${bright})`);
  const sat = Math.max(0, n('saturate', 1));
  const hue = n('hueRotate', 0);
  const con = Math.max(0, n('contrast', 1));
  if (sat !== 1) filters.push(`saturate(${sat})`);
  if (hue) filters.push(`hue-rotate(${hue}deg)`);
  if (con !== 1) filters.push(`contrast(${con})`);
  const pct = (k: TimelineProp) => Math.round(Math.max(0, Math.min(1, n(k, 0))) * 10000) / 100;
  const wl = pct('wipeL'); const wr = pct('wipeR'); const wt = pct('wipeT'); const wb = pct('wipeB');
  const hasOrigin = typeof v.originX === 'number' || typeof v.originY === 'number';
  const vars: Record<string, string> = {};
  for (const k of ['fill', 'color', 'stroke'] as const) if (typeof v[k] === 'string') vars[`--tl-${k}`] = v[k] as string;
  return {
    left: n('x', base.x),
    top: n('y', base.y),
    width: Math.max(0, n('w', base.w)),
    height: Math.max(0, n('h', base.h)),
    opacity: Math.max(0, Math.min(1, n('opacity', base.opacity))),
    transform: parts.length ? parts.join(' ') : undefined,
    filter: filters.length ? filters.join(' ') : undefined,
    origin: hasOrigin ? `${n('originX', 50)}% ${n('originY', 50)}%` : undefined,
    clip: wl || wr || wt || wb ? `inset(${wt}% ${wr}% ${wb}% ${wl}%)` : undefined,
    letterSpacing: typeof v.letterSpacing === 'number' ? (v.letterSpacing as number) : undefined,
    vars,
  };
}
