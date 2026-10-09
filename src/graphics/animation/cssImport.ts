// Import CSS animations as timeline clips.
//
// The pasted CSS is PARSED, never used: no stylesheet is created, nothing is
// injected into the page, no selector is ever matched. Each `@keyframes` block
// becomes an ordinary TimelineClip (keyframes on the properties the timeline
// already animates), which the renderer plays like any other clip and the
// server validates with the shared schema on save and on publish.
//
// A documented subset, and everything outside it is an error with its line
// number — never silently dropped:
//
//   @keyframes <name> { from | to | <n>% [, …] { <declarations> } … }
//   <one simple selector> { animation: … ; animation-*: … }      (optional)
//
//   declarations inside keyframes:
//     opacity
//     transform          translate / translateX / translateY / translate3d,
//                        scale / scaleX / scaleY, rotate / rotateZ / rotateX /
//                        rotateY, skew / skewX / skewY, none
//     transform-origin   two values, % or left / center / right / top / bottom
//     filter             blur, grayscale, brightness, saturate, contrast, hue-rotate, none
//     color, background-color (a plain colour), letter-spacing (px)
//     animation-timing-function   (the easing from this keyframe to the next)
//
// Refused: @import and every other at-rule, url(), var(), calc(), !important,
// steps() other than a hold, any other property, any other selector content.
//
// Pure: no DOM, no React.

import type { Keyframe, KeyframeEase, TimelineClip, TimelineProp, TimelineTrack } from '../schema/layoutTypes.ts';
import { TIMELINE_LIMITS } from '../schema/layoutSchema.js';

export interface CssProblem { line: number; message: string }

export interface ImportedAnimation {
  /** The @keyframes name. */
  name: string;
  clip: TimelineClip;
  /** Taken from an `animation` declaration that names these keyframes (false = defaults were used). */
  timed: boolean;
}

export interface CssImportResult {
  animations: ImportedAnimation[];
  errors: CssProblem[];
  warnings: CssProblem[];
}

export interface CssImportOptions {
  /** The layer the animation is for: needed for `translate(…%)` and to keep its own rotation. */
  box?: { w: number; h: number; rotation?: number };
  /** Ids already used by the layer's clips (the new clip gets a free one). */
  takenIds?: string[];
}

export const DEFAULT_CSS_DURATION = 1000;
const LIMITS = TIMELINE_LIMITS as { maxTracks: number; maxKeyframes: number; maxDuration: number };

const CSS_EASE: Record<string, KeyframeEase> = {
  linear: 'linear',
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  'step-end': 'hold',
};

// ── tokens ──────────────────────────────────────────────────────────────────

/** Comments replaced by spaces (newlines kept, so line numbers stay true). */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

const lineAt = (src: string, index: number): number => {
  let n = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
};

interface Block { prelude: string; body: string; line: number; bodyStart: number }

/** Top-level `prelude { body }` blocks of `src` (offsets are relative to `base` in the original text). */
function readBlocks(src: string, full: string, base: number, errors: CssProblem[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    const semi = src.indexOf(';', i);
    // A statement that ends before any block: `@import "x";`, a stray declaration.
    if (semi !== -1 && (open === -1 || semi < open)) {
      const stmt = src.slice(i, semi).trim();
      if (stmt) {
        const at = /^@([a-z-]+)/i.exec(stmt);
        errors.push({ line: lineAt(full, base + i + (src.slice(i).length - src.slice(i).trimStart().length)), message: at ? `@${at[1].toLowerCase()} is not allowed` : `“${stmt.slice(0, 40)}” is outside any block` });
      }
      i = semi + 1;
      continue;
    }
    if (open === -1) {
      const rest = src.slice(i).trim();
      if (rest) errors.push({ line: lineAt(full, base + i + (src.slice(i).length - src.slice(i).trimStart().length)), message: `“${rest.slice(0, 40)}” is not a complete rule (missing “{”)` });
      break;
    }
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      j++;
    }
    const preludeRaw = src.slice(i, open);
    const line = lineAt(full, base + i + (preludeRaw.length - preludeRaw.trimStart().length));
    if (depth > 0) {
      errors.push({ line, message: 'a “{” is never closed' });
      break;
    }
    blocks.push({ prelude: preludeRaw.trim(), body: src.slice(open + 1, j - 1), line, bodyStart: base + open + 1 });
    i = j;
  }
  return blocks;
}

interface Decl { prop: string; value: string; line: number }

function readDeclarations(body: string, full: string, base: number, errors: CssProblem[]): Decl[] {
  const out: Decl[] = [];
  let offset = 0;
  for (const part of splitTop(body, ';')) {
    const text = part.trim();
    const line = lineAt(full, base + offset + (part.length - part.trimStart().length));
    offset += part.length + 1;
    if (!text) continue;
    const colon = text.indexOf(':');
    if (colon <= 0) { errors.push({ line, message: `“${text.slice(0, 40)}” is not a property: value pair` }); continue; }
    const prop = text.slice(0, colon).trim().toLowerCase();
    const value = text.slice(colon + 1).trim();
    if (!/^-?[a-z][a-z-]*$/.test(prop)) { errors.push({ line, message: `“${prop}” is not a property name` }); continue; }
    if (!value) { errors.push({ line, message: `${prop} has no value` }); continue; }
    if (/!important/i.test(value)) { errors.push({ line, message: `!important is not allowed (${prop})` }); continue; }
    if (/url\s*\(/i.test(value)) { errors.push({ line, message: `url() is not allowed (${prop}): an animation cannot load anything` }); continue; }
    if (/\b(var|calc|env|attr|expression)\s*\(/i.test(value)) { errors.push({ line, message: `${/\b(var|calc|env|attr|expression)\s*\(/i.exec(value)![1].toLowerCase()}() is not supported (${prop}): use a plain value` }); continue; }
    if (/[<>{}\\]|javascript:/i.test(value)) { errors.push({ line, message: `${prop} has characters that are not allowed` }); continue; }
    out.push({ prop, value, line });
  }
  return out;
}

/** Split on `sep` outside parentheses. */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    if (c === sep && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

/** `name(args)` calls in a value, in order. Anything between them makes the whole value invalid (returns null). */
function readFunctions(value: string): Array<{ name: string; args: string[] }> | null {
  const out: Array<{ name: string; args: string[] }> = [];
  const re = /\s*([a-z][a-z0-9-]*)\(([^()]*)\)\s*/gi;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(value))) {
    if (m.index !== last) return null; // something between two functions that is not a function
    out.push({ name: m[1].toLowerCase(), args: splitTop(m[2], ',').map((a) => a.trim()).filter((a) => a !== '') });
    last = re.lastIndex;
    if (last >= value.length) break;
  }
  return last >= value.length && out.length ? out : null;
}

// ── values ──────────────────────────────────────────────────────────────────

const NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i;

function numberUnit(raw: string): { n: number; unit: string } | null {
  const m = NUM.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  return { n, unit: raw.trim().slice(m[0].length).trim().toLowerCase() };
}

function angleDeg(raw: string): number | null {
  const v = numberUnit(raw);
  if (!v) return null;
  if (v.unit === 'deg' || (v.unit === '' && v.n === 0)) return v.n;
  if (v.unit === 'turn') return v.n * 360;
  if (v.unit === 'rad') return (v.n * 180) / Math.PI;
  if (v.unit === 'grad') return v.n * 0.9;
  return null;
}

/** A length in px. `%` resolves against `size` (null when there is no layer to measure). */
function lengthPx(raw: string, size: number | null): number | null | 'needs-box' {
  const v = numberUnit(raw);
  if (!v) return null;
  if (v.unit === 'px' || (v.unit === '' && v.n === 0)) return v.n;
  if (v.unit === '%') return size == null ? 'needs-box' : (v.n / 100) * size;
  return null;
}

/** `1.2`, `120%` -> 1.2 */
function ratio(raw: string): number | null {
  const v = numberUnit(raw);
  if (!v) return null;
  if (v.unit === '') return v.n;
  if (v.unit === '%') return v.n / 100;
  return null;
}

const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%deg/]+\)|transparent|[a-z]{3,20})$/i;
const CSS_WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'currentcolor', 'auto', 'none']);

function cssColor(raw: string): string | null {
  const v = raw.trim();
  if (!COLOR_RE.test(v) || CSS_WIDE.has(v.toLowerCase())) return null;
  return v;
}

function cssEase(raw: string): KeyframeEase | null {
  const v = raw.trim().toLowerCase();
  if (CSS_EASE[v]) return CSS_EASE[v];
  let m = /^cubic-bezier\(\s*([^)]*)\)$/.exec(v);
  if (m) {
    const p = m[1].split(',').map((x) => Number(x.trim()));
    if (p.length !== 4 || p.some((x) => !Number.isFinite(x))) return null;
    if (p[0] < 0 || p[0] > 1 || p[2] < 0 || p[2] > 1) return null; // CSS requires x in 0..1
    if (p[1] < -2 || p[1] > 3 || p[3] < -2 || p[3] > 3) return null; // what the timeline stores
    return [p[0], p[1], p[2], p[3]];
  }
  // A single step that jumps at the end is a hold keyframe; any other steps() has no equivalent.
  m = /^steps\(\s*1\s*(?:,\s*(end|jump-end))?\s*\)$/.exec(v);
  if (m) return 'hold';
  return null;
}

/** `1s`, `250ms` -> ms */
function timeMs(raw: string): number | null {
  const v = numberUnit(raw);
  if (!v) return null;
  if (v.unit === 's') return v.n * 1000;
  if (v.unit === 'ms') return v.n;
  return null;
}

// ── keyframe declarations -> timeline values ────────────────────────────────

type Values = Partial<Record<TimelineProp, number | string>>;

/** What a property is when an animation does not mention it at some keyframe. */
const IDENTITY: Partial<Record<TimelineProp, number>> = {
  opacity: 1, dx: 0, dy: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0,
  blur: 0, grayscale: 0, brightness: 1, saturate: 1, contrast: 1, hueRotate: 0, originX: 50, originY: 50, letterSpacing: 0,
};

const ORIGIN_WORD: Record<string, number> = { left: 0, top: 0, center: 50, right: 100, bottom: 100 };

function readTransform(value: string, box: CssImportOptions['box'], fail: (m: string) => void): Values | null {
  const out: Values = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, rotation: 0, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0 };
  if (value.trim().toLowerCase() === 'none') return out;
  const fns = readFunctions(value);
  if (!fns) { fail(`transform “${value.slice(0, 50)}” could not be read`); return null; }
  const len = (raw: string, axis: 'w' | 'h'): number | null => {
    const r = lengthPx(raw, box ? box[axis] : null);
    if (r === 'needs-box') { fail('translate in % needs a selected layer (its size is what the % is of)'); return null; }
    if (r === null) { fail(`“${raw}” is not a length in px or %`); return null; }
    return r;
  };
  for (const f of fns) {
    const a = f.args;
    const need = (min: number, max: number): boolean => {
      if (a.length >= min && a.length <= max) return true;
      fail(`${f.name}() takes ${min === max ? min : `${min}-${max}`} value${max === 1 ? '' : 's'}`);
      return false;
    };
    switch (f.name) {
      case 'translate': {
        if (!need(1, 2)) return null;
        const x = len(a[0], 'w'); const y = a[1] != null ? len(a[1], 'h') : 0;
        if (x === null || y === null) return null;
        out.dx = (out.dx as number) + x; out.dy = (out.dy as number) + y;
        break;
      }
      case 'translate3d': {
        if (!need(3, 3)) return null;
        const x = len(a[0], 'w'); const y = len(a[1], 'h');
        if (x === null || y === null) return null;
        out.dx = (out.dx as number) + x; out.dy = (out.dy as number) + y;
        break;
      }
      case 'translatex': { if (!need(1, 1)) return null; const x = len(a[0], 'w'); if (x === null) return null; out.dx = (out.dx as number) + x; break; }
      case 'translatey': { if (!need(1, 1)) return null; const y = len(a[0], 'h'); if (y === null) return null; out.dy = (out.dy as number) + y; break; }
      case 'translatez': { if (!need(1, 1)) return null; break; } // depth has no effect on a flat layer
      case 'scale': {
        if (!need(1, 2)) return null;
        const x = ratio(a[0]); const y = a[1] != null ? ratio(a[1]) : x;
        if (x === null || y === null) { fail('scale() takes plain numbers (1.2) or percentages'); return null; }
        out.scaleX = (out.scaleX as number) * x; out.scaleY = (out.scaleY as number) * y;
        break;
      }
      case 'scalex': { if (!need(1, 1)) return null; const x = ratio(a[0]); if (x === null) { fail('scaleX() takes a number'); return null; } out.scaleX = (out.scaleX as number) * x; break; }
      case 'scaley': { if (!need(1, 1)) return null; const y = ratio(a[0]); if (y === null) { fail('scaleY() takes a number'); return null; } out.scaleY = (out.scaleY as number) * y; break; }
      case 'rotate': case 'rotatez': { if (!need(1, 1)) return null; const d = angleDeg(a[0]); if (d === null) { fail(`${f.name}() takes an angle (deg, turn, rad)`); return null; } out.rotation = (out.rotation as number) + d; break; }
      case 'rotatex': { if (!need(1, 1)) return null; const d = angleDeg(a[0]); if (d === null) { fail('rotateX() takes an angle'); return null; } out.rotateX = (out.rotateX as number) + d; break; }
      case 'rotatey': { if (!need(1, 1)) return null; const d = angleDeg(a[0]); if (d === null) { fail('rotateY() takes an angle'); return null; } out.rotateY = (out.rotateY as number) + d; break; }
      case 'skewx': { if (!need(1, 1)) return null; const d = angleDeg(a[0]); if (d === null) { fail('skewX() takes an angle'); return null; } out.skewX = (out.skewX as number) + d; break; }
      case 'skewy': { if (!need(1, 1)) return null; const d = angleDeg(a[0]); if (d === null) { fail('skewY() takes an angle'); return null; } out.skewY = (out.skewY as number) + d; break; }
      case 'skew': {
        if (!need(1, 2)) return null;
        const x = angleDeg(a[0]); const y = a[1] != null ? angleDeg(a[1]) : 0;
        if (x === null || y === null) { fail('skew() takes angles'); return null; }
        out.skewX = (out.skewX as number) + x; out.skewY = (out.skewY as number) + y;
        break;
      }
      case 'perspective': { if (!need(1, 1)) return null; break; } // the renderer applies its own perspective to 3D flips
      default:
        fail(`transform function ${f.name}() is not supported`);
        return null;
    }
  }
  return out;
}

function readFilter(value: string, fail: (m: string) => void): Values | null {
  const out: Values = { blur: 0, grayscale: 0, brightness: 1, saturate: 1, contrast: 1, hueRotate: 0 };
  if (value.trim().toLowerCase() === 'none') return out;
  const fns = readFunctions(value);
  if (!fns) { fail(`filter “${value.slice(0, 50)}” could not be read`); return null; }
  for (const f of fns) {
    if (f.args.length !== 1) { fail(`${f.name}() takes one value`); return null; }
    const a = f.args[0];
    switch (f.name) {
      case 'blur': { const r = lengthPx(a, null); if (typeof r !== 'number' || r < 0) { fail('blur() takes a length in px'); return null; } out.blur = r; break; }
      case 'grayscale': { const r = ratio(a); if (r === null) { fail('grayscale() takes a number or %'); return null; } out.grayscale = Math.max(0, Math.min(1, r)); break; }
      case 'brightness': { const r = ratio(a); if (r === null || r < 0) { fail('brightness() takes a number or %'); return null; } out.brightness = r; break; }
      case 'saturate': { const r = ratio(a); if (r === null || r < 0) { fail('saturate() takes a number or %'); return null; } out.saturate = r; break; }
      case 'contrast': { const r = ratio(a); if (r === null || r < 0) { fail('contrast() takes a number or %'); return null; } out.contrast = r; break; }
      case 'hue-rotate': { const d = angleDeg(a); if (d === null) { fail('hue-rotate() takes an angle'); return null; } out.hueRotate = d; break; }
      default:
        fail(`filter function ${f.name}() is not supported`);
        return null;
    }
  }
  return out;
}

function readOrigin(value: string, fail: (m: string) => void): Values | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length < 1 || parts.length > 2) { fail('transform-origin takes one or two values (the depth value is not supported)'); return null; }
  const one = (raw: string): number | null => {
    const w = ORIGIN_WORD[raw.toLowerCase()];
    if (w != null) return w;
    const v = numberUnit(raw);
    return v && v.unit === '%' ? v.n : null;
  };
  let [a, b] = parts;
  // `top left` is the same as `left top`.
  if (/^(top|bottom)$/i.test(a) && b && /^(left|right|center)$/i.test(b)) [a, b] = [b, a];
  const x = one(a);
  const y = b == null ? 50 : one(b);
  if (x === null || y === null) { fail('transform-origin takes % or left / center / right / top / bottom (px is not supported)'); return null; }
  return { originX: x, originY: y };
}

interface Stop { t: number; values: Values; ease?: KeyframeEase; line: number }

function readKeyframeDecls(decls: Decl[], opts: CssImportOptions, errors: CssProblem[]): { values: Values; ease?: KeyframeEase } {
  const values: Values = {};
  let ease: KeyframeEase | undefined;
  for (const d of decls) {
    const fail = (message: string) => errors.push({ line: d.line, message });
    switch (d.prop) {
      case 'opacity': {
        const r = ratio(d.value);
        if (r === null) fail('opacity takes a number from 0 to 1 (or a %)'); else values.opacity = Math.max(0, Math.min(1, r));
        break;
      }
      case 'transform': case '-webkit-transform': { const v = readTransform(d.value, opts.box, fail); if (v) Object.assign(values, v); break; }
      case 'transform-origin': case '-webkit-transform-origin': { const v = readOrigin(d.value, fail); if (v) Object.assign(values, v); break; }
      case 'filter': case '-webkit-filter': { const v = readFilter(d.value, fail); if (v) Object.assign(values, v); break; }
      case 'color': { const c = cssColor(d.value); if (!c) fail('color takes a plain colour (#hex, rgb(), rgba(), a name)'); else values.color = c; break; }
      case 'background-color': case 'background': {
        const c = cssColor(d.value);
        if (!c) fail(`${d.prop} takes a plain colour here (gradients and images cannot be animated this way)`); else values.fill = c;
        break;
      }
      case 'letter-spacing': {
        const r = d.value.trim().toLowerCase() === 'normal' ? 0 : lengthPx(d.value, null);
        if (typeof r !== 'number') fail('letter-spacing takes a length in px'); else values.letterSpacing = r;
        break;
      }
      case 'animation-timing-function': case '-webkit-animation-timing-function': {
        const e = cssEase(d.value);
        if (!e) fail(`timing function “${d.value}” is not supported (use linear, ease, ease-in, ease-out, ease-in-out or cubic-bezier())`); else ease = e;
        break;
      }
      default:
        fail(`“${d.prop}” cannot be animated here. Supported: opacity, transform, transform-origin, filter, color, background-color, letter-spacing`);
    }
  }
  return { values, ease };
}

// ── the animation shorthand ─────────────────────────────────────────────────

interface Timing {
  name?: string;
  duration?: number;
  delay?: number;
  ease?: KeyframeEase;
  /** true = infinite, n = play n times in total. */
  iterations?: number | true;
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  fill?: string;
  line: number;
}

const DIRECTIONS = new Set(['normal', 'reverse', 'alternate', 'alternate-reverse']);
const FILLS = new Set(['none', 'forwards', 'backwards', 'both']);
const PLAY_STATES = new Set(['running', 'paused']);

function readAnimationShorthand(value: string, line: number, errors: CssProblem[]): Timing[] {
  const out: Timing[] = [];
  for (const one of splitTop(value, ',')) {
    const t: Timing = { line };
    const tokens = one.trim().match(/[a-z-]+\([^)]*\)|\S+/gi) || [];
    for (const tok of tokens) {
      const low = tok.toLowerCase();
      const ms = timeMs(tok);
      if (ms !== null) { if (t.duration === undefined) t.duration = ms; else if (t.delay === undefined) t.delay = ms; else errors.push({ line, message: `animation has a third time (“${tok}”)` }); continue; }
      if (low === 'infinite') { t.iterations = true; continue; }
      if (DIRECTIONS.has(low)) { t.direction = low as Timing['direction']; continue; }
      if (FILLS.has(low)) { t.fill = low; continue; }
      if (PLAY_STATES.has(low)) continue;
      const e = cssEase(tok);
      if (e) { t.ease = e; continue; }
      if (/^(cubic-bezier|steps)\(/.test(low) || low === 'step-start') { errors.push({ line, message: `timing function “${tok}” is not supported` }); continue; }
      if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(tok)) { t.iterations = Number(tok); continue; }
      if (/^-?[a-z_][a-z0-9_-]*$/i.test(tok)) { if (t.name === undefined) t.name = tok; else errors.push({ line, message: `animation names two keyframes sets (“${t.name}” and “${tok}”): separate animations with a comma` }); continue; }
      errors.push({ line, message: `“${tok}” in animation was not understood` });
    }
    out.push(t);
  }
  return out;
}

// ── assembly ────────────────────────────────────────────────────────────────

const safeId = (name: string, taken: Set<string>): string => {
  const base = `css_${name.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'anim'}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  taken.add(id);
  return id;
};

const round = (n: number, places = 3): number => { const k = Math.pow(10, places); return Math.round(n * k) / k; };

function buildClip(name: string, stops: Stop[], timing: Timing | undefined, opts: CssImportOptions, taken: Set<string>, errors: CssProblem[], warnings: CssProblem[], line: number): TimelineClip | null {
  const duration = Math.round(timing?.duration ?? DEFAULT_CSS_DURATION);
  if (!(duration >= 1)) { errors.push({ line: timing?.line ?? line, message: 'animation-duration must be more than 0' }); return null; }
  if (duration > LIMITS.maxDuration) { errors.push({ line: timing?.line ?? line, message: `animation-duration can be at most ${LIMITS.maxDuration / 1000}s` }); return null; }
  if (timing?.delay != null && timing.delay < 0) { errors.push({ line: timing.line, message: 'a negative animation-delay is not supported' }); return null; }
  if (timing?.delay != null && timing.delay > LIMITS.maxDuration) { errors.push({ line: timing.line, message: `animation-delay can be at most ${LIMITS.maxDuration / 1000}s` }); return null; }

  // CSS starts / ends at the element's own values when 0% / 100% is left out: here that is the layer at rest.
  const hasFrom = stops.some((s) => s.t === 0);
  const hasTo = stops.some((s) => s.t === 1);
  const ordered = [...stops, ...(hasFrom ? [] : [{ t: 0, values: {}, line }]), ...(hasTo ? [] : [{ t: 1, values: {}, line }])].sort((a, b) => a.t - b.t);
  // Every property any keyframe sets.
  const props = Array.from(new Set(ordered.flatMap((s) => Object.keys(s.values)))) as TimelineProp[];
  if (!props.length) { errors.push({ line, message: `@keyframes ${name} animates nothing that is supported` }); return null; }

  // scaleX + scaleY that always agree are stored as one `scale` track.
  const uniform = ordered.every((s) => (s.values.scaleX ?? 1) === (s.values.scaleY ?? 1));
  const baseRotation = opts.box?.rotation || 0;
  const reverse = timing?.direction === 'reverse' || timing?.direction === 'alternate-reverse';
  const tracks: TimelineTrack[] = [];

  for (const prop of props) {
    if (uniform && prop === 'scaleY') continue;
    const outProp: TimelineProp = uniform && prop === 'scaleX' ? 'scale' : prop;
    const isColor = prop === 'color' || prop === 'fill';
    const keyframes: Keyframe[] = [];
    for (const s of ordered) {
      let v = s.values[prop];
      if (v === undefined) {
        // CSS would use the element's own value at 0% / 100%. A property a middle keyframe skips is interpolated (no key needed).
        if (s.t !== 0 && s.t !== 1) continue;
        if (isColor) continue; // the layer's own colour is not known here: the track simply starts / ends at its first / last key
        v = IDENTITY[prop];
        if (v === undefined) continue;
      }
      if (prop === 'rotation' && typeof v === 'number') v = v + baseRotation; // CSS rotates relative to the layer; the timeline stores the angle itself
      const k: Keyframe = { t: Math.round(s.t * duration), value: typeof v === 'number' ? round(v) : v };
      const ease = s.ease ?? timing?.ease;
      if (ease && ease !== 'linear') k.ease = ease;
      keyframes.push(k);
    }
    // A track whose value never changes from the identity adds nothing.
    const identity = IDENTITY[prop];
    if (!isColor && keyframes.every((k) => k.value === (prop === 'rotation' ? (identity ?? 0) + baseRotation : identity))) continue;
    if (!keyframes.length) continue;
    if (keyframes.length > LIMITS.maxKeyframes) { errors.push({ line, message: `@keyframes ${name} has more than ${LIMITS.maxKeyframes} keyframes` }); return null; }
    tracks.push({ prop: outProp, keyframes });
  }
  if (!tracks.length) { errors.push({ line, message: `@keyframes ${name} never changes anything` }); return null; }
  if (tracks.length > LIMITS.maxTracks) { errors.push({ line, message: `@keyframes ${name} animates more than ${LIMITS.maxTracks} properties` }); return null; }
  if (!hasFrom) warnings.push({ line, message: `@keyframes ${name} has no 0% (from): it starts from the layer at rest` });
  if (!hasTo) warnings.push({ line, message: `@keyframes ${name} has no 100% (to): it ends with the layer at rest` });

  if (reverse) {
    for (const track of tracks) {
      // Mirror the times; an ease belongs to the segment AFTER its keyframe, so it moves to the neighbour.
      const ks = [...track.keyframes].sort((a, b) => a.t - b.t);
      track.keyframes = ks.map((k, i) => {
        const out: Keyframe = { t: duration - k.t, value: k.value };
        const fromPrev = ks[i - 1]?.ease;
        if (fromPrev) out.ease = fromPrev;
        return out;
      }).reverse();
    }
  }

  const clip: TimelineClip = { id: safeId(name, taken), name, trigger: { type: 'enter' }, duration, tracks };
  if (timing?.delay) clip.delay = Math.round(timing.delay);
  if (timing?.iterations === true) { clip.loop = true; clip.trigger = { type: 'loop' }; }
  else if (typeof timing?.iterations === 'number') {
    if (timing.iterations <= 0 || !Number.isInteger(timing.iterations)) warnings.push({ line: timing.line, message: 'animation-iteration-count must be a whole number or infinite: it plays once' });
    else if (timing.iterations > 1) clip.loop = Math.min(1000, timing.iterations - 1);
  }
  if (timing?.direction === 'alternate' || timing?.direction === 'alternate-reverse') clip.direction = 'alternate';
  if (timing?.fill === 'none' || timing?.fill === 'backwards') warnings.push({ line: timing.line, message: `animation-fill-mode: ${timing.fill} is not supported: the layer keeps the last frame when the animation ends` });
  return clip;
}

/** Parse pasted CSS into timeline clips. Never throws. */
export function importCssAnimations(css: string, opts: CssImportOptions = {}): CssImportResult {
  const errors: CssProblem[] = [];
  const warnings: CssProblem[] = [];
  const animations: ImportedAnimation[] = [];
  if (typeof css !== 'string' || !css.trim()) return { animations, errors: [{ line: 1, message: 'Paste a CSS @keyframes block to import' }], warnings };
  if (css.length > 200000) return { animations, errors: [{ line: 1, message: 'That is too much CSS (200 KB at most)' }], warnings };
  if (/<\/?\s*(script|style)\b/i.test(css)) return { animations, errors: [{ line: 1, message: 'Paste the CSS only, without <style> or <script> tags' }], warnings };

  const src = stripComments(css);
  const sets: Array<{ name: string; stops: Stop[]; line: number }> = [];
  const timings: Timing[] = [];

  for (const block of readBlocks(src, src, 0, errors)) {
    const kf = /^@(?:-webkit-|-moz-)?keyframes\s+(.+)$/i.exec(block.prelude);
    if (kf) {
      const name = kf[1].trim().replace(/^["']|["']$/g, '');
      if (!/^-?[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) { errors.push({ line: block.line, message: `“${name}” is not a valid @keyframes name` }); continue; }
      if (sets.some((s) => s.name === name)) { errors.push({ line: block.line, message: `@keyframes ${name} is defined twice` }); continue; }
      const stops: Stop[] = [];
      for (const frame of readBlocks(block.body, src, block.bodyStart, errors)) {
        const times: number[] = [];
        let bad = false;
        for (const sel of frame.prelude.split(',').map((s) => s.trim().toLowerCase())) {
          if (sel === 'from') times.push(0);
          else if (sel === 'to') times.push(1);
          else {
            const m = /^(\d+\.?\d*|\.\d+)%$/.exec(sel);
            const pct = m ? Number(m[1]) : NaN;
            if (!m || pct < 0 || pct > 100) { errors.push({ line: frame.line, message: `“${sel || frame.prelude}” is not a keyframe position (use from, to or 0%-100%)` }); bad = true; } else times.push(pct / 100);
          }
        }
        if (bad) continue;
        const decls = readDeclarations(frame.body, src, frame.bodyStart, errors);
        const { values, ease } = readKeyframeDecls(decls, opts, errors);
        for (const t of times) {
          const existing = stops.find((s) => s.t === t);
          if (existing) { Object.assign(existing.values, values); if (ease) existing.ease = ease; } else stops.push({ t, values: { ...values }, ease, line: frame.line });
        }
      }
      if (!stops.length) { errors.push({ line: block.line, message: `@keyframes ${name} has no keyframes` }); continue; }
      sets.push({ name, stops, line: block.line });
      continue;
    }
    if (block.prelude.startsWith('@')) {
      const at = /^@([a-z-]+)/i.exec(block.prelude);
      errors.push({ line: block.line, message: `@${at ? at[1].toLowerCase() : 'rule'} is not allowed: only @keyframes can be imported` });
      continue;
    }
    // A style rule: read only its animation properties. The selector is never used for anything.
    if (!/^[.#]?-?[A-Za-z_][A-Za-z0-9_-]*$/.test(block.prelude)) {
      errors.push({ line: block.line, message: `Selector “${block.prelude.slice(0, 40)}” is not allowed: use one plain class, like “.my-layer”, to hold the animation line` });
      continue;
    }
    const long: Timing = { line: block.line };
    let usedLong = false;
    for (const d of readDeclarations(block.body, src, block.bodyStart, errors)) {
      const p = d.prop.replace(/^-webkit-/, '');
      if (p === 'animation') { timings.push(...readAnimationShorthand(d.value, d.line, errors)); continue; }
      const first = splitTop(d.value, ',')[0].trim();
      if (splitTop(d.value, ',').length > 1) warnings.push({ line: d.line, message: `${p} lists several values: only the first is used` });
      usedLong = true;
      long.line = d.line;
      if (p === 'animation-name') long.name = first;
      else if (p === 'animation-duration') { const ms = timeMs(first); if (ms === null) errors.push({ line: d.line, message: 'animation-duration takes a time (1s, 400ms)' }); else long.duration = ms; }
      else if (p === 'animation-delay') { const ms = timeMs(first); if (ms === null) errors.push({ line: d.line, message: 'animation-delay takes a time (1s, 400ms)' }); else long.delay = ms; }
      else if (p === 'animation-timing-function') { const e = cssEase(first); if (!e) errors.push({ line: d.line, message: `timing function “${first}” is not supported` }); else long.ease = e; }
      else if (p === 'animation-iteration-count') { if (first.toLowerCase() === 'infinite') long.iterations = true; else if (Number.isFinite(Number(first))) long.iterations = Number(first); else errors.push({ line: d.line, message: 'animation-iteration-count takes a number or infinite' }); }
      else if (p === 'animation-direction') { if (DIRECTIONS.has(first.toLowerCase())) long.direction = first.toLowerCase() as Timing['direction']; else errors.push({ line: d.line, message: `animation-direction “${first}” is not supported` }); }
      else if (p === 'animation-fill-mode') { if (FILLS.has(first.toLowerCase())) long.fill = first.toLowerCase(); else errors.push({ line: d.line, message: `animation-fill-mode “${first}” is not supported` }); }
      else if (p === 'animation-play-state') { /* nothing to store */ }
      else { usedLong = false; errors.push({ line: d.line, message: `“${d.prop}” is not an animation property: outside @keyframes only animation settings are read` }); }
    }
    if (usedLong) timings.push(long);
  }

  if (!sets.length && !errors.length) errors.push({ line: 1, message: 'No @keyframes block was found' });

  const taken = new Set(opts.takenIds || []);
  for (const set of sets) {
    // The animation line that names this set; a lone, unnamed one applies when there is exactly one set.
    const timing = timings.find((t) => t.name === set.name) || (sets.length === 1 ? timings.find((t) => t.name === undefined) : undefined);
    const before = errors.length;
    const clip = buildClip(set.name, set.stops, timing, opts, taken, errors, warnings, set.line);
    if (clip && errors.length === before) animations.push({ name: set.name, clip, timed: !!timing && timing.duration !== undefined });
  }
  for (const t of timings) {
    if (t.name && !sets.some((s) => s.name === t.name)) warnings.push({ line: t.line, message: `animation names “${t.name}”, but there is no @keyframes ${t.name} here` });
  }
  errors.sort((a, b) => a.line - b.line);
  warnings.sort((a, b) => a.line - b.line);
  // One bad block must not let a half-read animation through.
  return { animations: errors.length ? [] : animations, errors, warnings };
}

/** A copy of an imported clip ready to put on a layer: a free id and the chosen trigger. */
export function clipForLayer(clip: TimelineClip, trigger: TimelineClip['trigger'], takenIds: string[]): TimelineClip {
  const taken = new Set(takenIds);
  let id = clip.id;
  for (let n = 2; taken.has(id); n++) id = `${clip.id}_${n}`.slice(0, 64);
  const next: TimelineClip = { ...JSON.parse(JSON.stringify(clip)), id, trigger };
  // A looping clip loops because of its trigger, not a count.
  if (trigger.type === 'loop') next.loop = true;
  else if (next.loop === true) delete next.loop;
  return next;
}
