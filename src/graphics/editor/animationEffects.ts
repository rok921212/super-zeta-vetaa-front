// The ready-made animations ("DO …") the Animate panel offers — 150 of them.
//
// Every effect is a pure function (layer, options) -> keyframe tracks. They
// are written with RELATIVE properties (dx / dy / scale / wipe…) wherever
// possible, so a preset keeps working after the layer is moved or resized.
//
// "In" effects are described once (where each property starts, and how it
// eases to rest); the matching "out" and "in → stay → out" versions are derived
// from the same description, so every entrance has its exit.

import type { KeyframeEase, KeyframeValue, LayoutElement, TimelineProp, TimelineTrack } from '../schema/layoutTypes.ts';

export type EffectGroup = 'in' | 'out' | 'popup' | 'attention' | 'state' | 'loop';

export interface EffectOptions {
  /** Time multiplier: 0.6 fast · 1 normal · 1.6 slow. */
  speed: number;
  /** Popups: how long it stays on screen (ms). */
  hold: number;
  /** Colour effects. */
  color: string;
}

export const DEFAULT_OPTIONS: EffectOptions = { speed: 1, hold: 3000, color: '#ef4444' };

export interface Built { duration: number; tracks: TimelineTrack[]; loop?: boolean }

export interface EffectDef {
  id: string;
  label: string;
  group: EffectGroup;
  /** Family heading inside the group ("Slide", "Wipe"…), for browsing. */
  family: string;
  /** Uses the colour option. */
  usesColor?: boolean;
  /** Only for layers with their own colour (text, shapes) — not groups. */
  leafOnly?: boolean;
  build(el: LayoutElement, o: EffectOptions): Built;
}

/** [time ms, value, ease to the next key] */
type Key = [number, KeyframeValue, KeyframeEase?];

const track = (prop: TimelineProp, keys: Key[], s: number): TimelineTrack => ({
  prop,
  keyframes: keys.map(([t, value, ease]) => ({ t: Math.round(t * s), value, ...(ease ? { ease } : null) })),
});

const fx = (duration: number, s: number, tracks: Array<[TimelineProp, Key[]]>, loop = false): Built => ({
  duration: Math.max(1, Math.round(duration * s)),
  tracks: tracks.map(([prop, keys]) => track(prop, keys, s)),
  ...(loop ? { loop: true } : null),
});

const rot = (el: LayoutElement) => el.rotation || 0;
const opa = (el: LayoutElement) => el.opacity ?? 1;
const tracking = (el: LayoutElement) => (typeof el.style?.letterSpacing === 'number' ? el.style.letterSpacing : 0);

/** Which colour a layer's own colour effects animate. */
export function colorPropOf(el: LayoutElement): 'color' | 'fill' | null {
  if (el.type === 'text' || el.type === 'icon') return 'color';
  if (['rect', 'ellipse', 'polygon', 'path'].includes(el.type)) return 'fill';
  return null;
}

/** The layer's resting colour as a keyframe value — a theme token stays a live reference. */
function restColor(el: LayoutElement, prop: 'color' | 'fill'): KeyframeValue {
  const v = el.style?.[prop];
  if (v && typeof v === 'object' && 'ref' in v) return { bind: { path: v.ref } };
  return typeof v === 'string' && v ? v : '#ffffff';
}

// ── entrances (and the exits / alerts derived from them) ────────────────────

type Num = number | ((el: LayoutElement) => number);
const val = (n: Num, el: LayoutElement): number => (typeof n === 'function' ? n(el) : n);

/** One animated property of an entrance: starts at `from`, eases to `to` (its resting value). */
type Part = [TimelineProp, Num, Num, KeyframeEase?];

interface Entrance {
  /** Shared stem: ids are `${stem}` variants given below. */
  inId: string;
  outId: string;
  /** Present = an "in → stay → out" alert version exists too. */
  popupId?: string;
  family: string;
  inLabel: string;
  outLabel: string;
  popupLabel?: string;
  ms: number;
  parts: Part[];
  /** Properties held at one value for the whole move (an anchor point, usually). */
  hold?: Array<[TimelineProp, number]>;
  /** Fade with it, over this fraction of the move (0 = no fade). Default 0.5. */
  fade?: number;
  /** Ease used on the way out (default easeInCubic; spring / bounce eases do not reverse well). */
  outEase?: KeyframeEase;
}

const E = (
  inId: string, outId: string, family: string, inLabel: string, outLabel: string, ms: number, parts: Part[],
  extra: Partial<Entrance> = {}
): Entrance => ({ inId, outId, family, inLabel, outLabel, ms, parts, ...extra });

const fromTop = (el: LayoutElement) => rot(el);

const ENTRANCES: Entrance[] = [
  E('fadeIn', 'fadeOut', 'Fade', 'Fade in', 'Fade out', 500, [], { fade: 1, popupId: 'fadeInOut', popupLabel: 'Fade in, stay, fade out' }),

  E('slideInLeft', 'slideOutLeft', 'Slide', 'Slide in from the left', 'Slide out to the left', 600, [['dx', -300, 0, 'easeOutCubic']], { popupId: 'slideInOutLeft', popupLabel: 'Slide in from the left, stay, slide out' }),
  E('slideInRight', 'slideOutRight', 'Slide', 'Slide in from the right', 'Slide out to the right', 600, [['dx', 300, 0, 'easeOutCubic']], { popupId: 'slideInOutRight', popupLabel: 'Slide in from the right, stay, slide out' }),
  E('slideInUp', 'slideOutDown', 'Slide', 'Slide in from below', 'Slide out downwards', 600, [['dy', 200, 0, 'easeOutCubic']], { popupId: 'slideInOutUp', popupLabel: 'Slide up, stay, slide down' }),
  E('slideInDown', 'slideOutUp', 'Slide', 'Slide in from above', 'Slide out upwards', 600, [['dy', -200, 0, 'easeOutCubic']], { popupId: 'slideInOutDown', popupLabel: 'Slide down, stay, slide up' }),

  E('flyInLeft', 'flyOutLeft', 'Fly', 'Fly in from the far left', 'Fly out to the far left', 700, [['dx', -1200, 0, 'easeOutExpo']], { fade: 0.25, outEase: 'easeInExpo', popupId: 'flyInOutLeft', popupLabel: 'Fly in from the left, stay, fly out' }),
  E('flyInRight', 'flyOutRight', 'Fly', 'Fly in from the far right', 'Fly out to the far right', 700, [['dx', 1200, 0, 'easeOutExpo']], { fade: 0.25, outEase: 'easeInExpo', popupId: 'flyInOutRight', popupLabel: 'Fly in from the right, stay, fly out' }),
  E('flyInUp', 'flyOutDown', 'Fly', 'Fly in from far below', 'Fly out far below', 700, [['dy', 800, 0, 'easeOutExpo']], { fade: 0.25, outEase: 'easeInExpo', popupId: 'flyInOutUp', popupLabel: 'Fly up, stay, fly down' }),
  E('flyInDown', 'flyOutUp', 'Fly', 'Fly in from far above', 'Fly out far above', 700, [['dy', -800, 0, 'easeOutExpo']], { fade: 0.25, outEase: 'easeInExpo', popupId: 'flyInOutDown', popupLabel: 'Fly down, stay, fly up' }),

  E('zoomIn', 'zoomOut', 'Zoom', 'Zoom in (grow)', 'Zoom out (shrink away)', 500, [['scale', 0.6, 1, 'easeOutCubic']], { popupId: 'growInOut', popupLabel: 'Grow in, stay, shrink out' }),
  E('zoomInBig', 'zoomOutBig', 'Zoom', 'Zoom in from large', 'Zoom out to large', 500, [['scale', 1.6, 1, 'easeOutCubic']], { popupId: 'zoomInOut', popupLabel: 'Zoom in, stay, zoom out' }),
  E('popIn', 'popOut', 'Zoom', 'Pop in', 'Pop out', 450, [['scale', 0.4, 1, 'backOut']], { fade: 0.45, outEase: 'backIn', popupId: 'popInOut', popupLabel: 'Pop in, stay, pop out' }),
  E('elasticIn', 'elasticOut', 'Zoom', 'Spring in', 'Spring out', 900, [['scale', 0.3, 1, 'elasticOut']], { fade: 0.2, outEase: 'backIn', popupId: 'elasticInOut', popupLabel: 'Spring in, stay, snap out' }),

  E('bounceInLeft', 'bounceOutLeft', 'Bounce', 'Bounce in from the left', 'Bounce out to the left', 800, [['dx', -400, 0, 'bounceOut']], { fade: 0.2 }),
  E('bounceInRight', 'bounceOutRight', 'Bounce', 'Bounce in from the right', 'Bounce out to the right', 800, [['dx', 400, 0, 'bounceOut']], { fade: 0.2 }),
  E('bounceIn', 'bounceOut', 'Bounce', 'Bounce in from above', 'Bounce out upwards', 800, [['dy', -300, 0, 'bounceOut']], { fade: 0.2, popupId: 'bounceInOut', popupLabel: 'Bounce in, stay, drop out' }),
  E('bounceInUp', 'bounceOutDown', 'Bounce', 'Bounce in from below', 'Bounce out downwards', 800, [['dy', 300, 0, 'bounceOut']], { fade: 0.2 }),

  E('springInLeft', 'springOutLeft', 'Spring', 'Spring in from the left', 'Snap out to the left', 900, [['dx', -260, 0, 'elasticOut']], { fade: 0.2, outEase: 'backIn' }),
  E('springInRight', 'springOutRight', 'Spring', 'Spring in from the right', 'Snap out to the right', 900, [['dx', 260, 0, 'elasticOut']], { fade: 0.2, outEase: 'backIn' }),
  E('springInUp', 'springOutDown', 'Spring', 'Spring in from below', 'Snap out downwards', 900, [['dy', 200, 0, 'elasticOut']], { fade: 0.2, outEase: 'backIn' }),
  E('springInDown', 'springOutUp', 'Spring', 'Spring in from above', 'Snap out upwards', 900, [['dy', -200, 0, 'elasticOut']], { fade: 0.2, outEase: 'backIn' }),

  E('dropIn', 'liftOut', 'Drop', 'Drop in', 'Lift out', 550, [['dy', -400, 0, 'backOut']], { fade: 0.35, outEase: 'backIn', popupId: 'dropInOut', popupLabel: 'Drop in, stay, lift out' }),
  E('riseIn', 'sinkOut', 'Drop', 'Rise in (gentle)', 'Sink out (gentle)', 800, [['dy', 60, 0, 'easeOutQuart']], { fade: 0.8 }),

  E('flipIn', 'flipOut', 'Flip & turn', 'Flip in (sideways)', 'Flip out (sideways)', 500, [['rotateY', 90, 0, 'backOut']], { fade: 0.3, popupId: 'flipInOut', popupLabel: 'Flip in, stay, flip out' }),
  E('flipInX', 'flipOutX', 'Flip & turn', 'Flip in (top over)', 'Flip out (top over)', 500, [['rotateX', -90, 0, 'backOut']], { fade: 0.3, popupId: 'flipInOutX', popupLabel: 'Tip in, stay, tip out' }),
  E('tiltIn', 'tiltOut', 'Flip & turn', 'Tilt up into place', 'Tilt down and away', 650, [['rotateX', 60, 0, 'easeOutCubic'], ['dy', 80, 0, 'easeOutCubic']]),
  E('rotateIn', 'rotateOut', 'Flip & turn', 'Rotate in', 'Rotate out', 550, [['rotation', (el) => rot(el) - 90, fromTop, 'easeOutCubic']]),
  E('spinIn', 'spinOut', 'Flip & turn', 'Spin in', 'Spin out', 600, [['rotation', (el) => rot(el) - 360, fromTop, 'easeOutCubic'], ['scale', 0.3, 1, 'easeOutCubic']]),
  E('swingIn', 'swingOut', 'Flip & turn', 'Swing in (hinged at the top)', 'Swing out', 900, [['rotation', (el) => rot(el) - 35, fromTop, 'elasticOut']], { hold: [['originX', 50], ['originY', 0]], fade: 0.2, outEase: 'easeInCubic' }),
  E('rollIn', 'rollOut', 'Flip & turn', 'Roll in from the left', 'Roll out to the right', 700, [['dx', -320, 0, 'easeOutCubic'], ['rotation', (el) => rot(el) - 180, fromTop, 'easeOutCubic']]),

  E('wipeInLeft', 'wipeOutLeft', 'Wipe', 'Wipe in from the left', 'Wipe out to the left', 550, [['wipeR', 1, 0, 'easeInOutCubic']], { fade: 0, outEase: 'easeInOutCubic', popupId: 'wipeInOutLeft', popupLabel: 'Wipe in from the left, stay, wipe out' }),
  E('wipeInRight', 'wipeOutRight', 'Wipe', 'Wipe in from the right', 'Wipe out to the right', 550, [['wipeL', 1, 0, 'easeInOutCubic']], { fade: 0, outEase: 'easeInOutCubic', popupId: 'wipeInOutRight', popupLabel: 'Wipe in from the right, stay, wipe out' }),
  E('wipeInDown', 'wipeOutUp', 'Wipe', 'Wipe in from the top', 'Wipe out to the top', 550, [['wipeB', 1, 0, 'easeInOutCubic']], { fade: 0, outEase: 'easeInOutCubic' }),
  E('wipeInUp', 'wipeOutDown', 'Wipe', 'Wipe in from the bottom', 'Wipe out to the bottom', 550, [['wipeT', 1, 0, 'easeInOutCubic']], { fade: 0, outEase: 'easeInOutCubic' }),
  E('splitIn', 'splitOut', 'Wipe', 'Open from the centre (sideways)', 'Close to the centre (sideways)', 550, [['wipeL', 0.5, 0, 'easeInOutCubic'], ['wipeR', 0.5, 0, 'easeInOutCubic']], { fade: 0, outEase: 'easeInOutCubic', popupId: 'splitInOut', popupLabel: 'Open from the centre, stay, close' }),
  E('splitInY', 'splitOutY', 'Wipe', 'Open from the centre (up & down)', 'Close to the centre (up & down)', 550, [['wipeT', 0.5, 0, 'easeInOutCubic'], ['wipeB', 0.5, 0, 'easeInOutCubic']], { fade: 0, outEase: 'easeInOutCubic' }),

  E('stretchInX', 'squeezeOutX', 'Stretch', 'Stretch in (sideways)', 'Squeeze out (sideways)', 450, [['scaleX', 0, 1, 'backOut']], { fade: 0.3, outEase: 'backIn' }),
  E('stretchInY', 'squeezeOutY', 'Stretch', 'Stretch in (up & down)', 'Squeeze out (up & down)', 450, [['scaleY', 0, 1, 'backOut']], { fade: 0.3, outEase: 'backIn' }),
  E('growFromLeft', 'shrinkToLeft', 'Stretch', 'Grow from its left edge', 'Shrink to its left edge', 500, [['scaleX', 0, 1, 'easeOutCubic']], { hold: [['originX', 0], ['originY', 50]], fade: 0 }),
  E('growFromRight', 'shrinkToRight', 'Stretch', 'Grow from its right edge', 'Shrink to its right edge', 500, [['scaleX', 0, 1, 'easeOutCubic']], { hold: [['originX', 100], ['originY', 50]], fade: 0 }),
  E('growFromTop', 'shrinkToTop', 'Stretch', 'Grow from its top edge', 'Shrink to its top edge', 500, [['scaleY', 0, 1, 'easeOutCubic']], { hold: [['originX', 50], ['originY', 0]], fade: 0 }),
  E('growFromBottom', 'shrinkToBottom', 'Stretch', 'Grow from its bottom edge', 'Shrink to its bottom edge', 500, [['scaleY', 0, 1, 'easeOutCubic']], { hold: [['originX', 50], ['originY', 100]], fade: 0 }),
  E('growFromCorner', 'shrinkToCorner', 'Stretch', 'Grow from its top-left corner', 'Shrink to its top-left corner', 500, [['scale', 0, 1, 'easeOutCubic']], { hold: [['originX', 0], ['originY', 0]], fade: 0.3 }),
  E('skewIn', 'skewOut', 'Stretch', 'Skid in (skewed)', 'Skid out (skewed)', 550, [['dx', -220, 0, 'easeOutCubic'], ['skewX', 25, 0, 'easeOutCubic']]),

  E('blurIn', 'blurOut', 'Light & focus', 'Focus in (blur)', 'Blur out', 600, [['blur', 18, 0, 'easeOutCubic']], { fade: 0.7, popupId: 'blurInOut', popupLabel: 'Focus in, stay, blur out' }),
  E('focusIn', 'defocusOut', 'Light & focus', 'Rack focus in', 'Rack focus out', 650, [['blur', 10, 0, 'easeOutCubic'], ['scale', 1.15, 1, 'easeOutCubic']], { fade: 0.6 }),
  E('flashIn', 'flashOut', 'Light & focus', 'Flash in (bright)', 'Flash out (bright)', 450, [['brightness', 3, 1, 'easeOutCubic']], { fade: 0.3, popupId: 'flashInOut', popupLabel: 'Flash in, stay, flash out' }),
  E('colourIn', 'colourOut', 'Light & focus', 'Colour in (from grey)', 'Drain to grey and fade', 700, [['grayscale', 1, 0, 'easeOutCubic']], { fade: 0.4 }),
  E('trackingIn', 'trackingOut', 'Light & focus', 'Letters close in (text)', 'Letters spread out (text)', 700, [['letterSpacing', (el) => tracking(el) + 30, tracking, 'easeOutCubic']], { fade: 0.7 }),
];

const fadeMs = (e: Entrance) => Math.round(e.ms * (e.fade ?? 0.5));

function buildIn(e: Entrance, el: LayoutElement, o: EffectOptions): Built {
  const tracks: Array<[TimelineProp, Key[]]> = e.parts.map(([prop, from, to, ease]) => [prop, [[0, val(from, el), ease || 'easeOut'], [e.ms, val(to, el)]]]);
  for (const [prop, v] of e.hold || []) tracks.push([prop, [[0, v]]]);
  if (fadeMs(e) > 0) tracks.push(['opacity', [[0, 0, 'easeOut'], [fadeMs(e), opa(el)]]]);
  return fx(e.ms, o.speed, tracks);
}

function buildOut(e: Entrance, el: LayoutElement, o: EffectOptions): Built {
  const ease = e.outEase || 'easeInCubic';
  const tracks: Array<[TimelineProp, Key[]]> = e.parts.map(([prop, from, to]) => [prop, [[0, val(to, el), ease], [e.ms, val(from, el)]]]);
  for (const [prop, v] of e.hold || []) tracks.push([prop, [[0, v]]]);
  const f = fadeMs(e);
  if (f > 0) tracks.push(['opacity', f >= e.ms ? [[0, opa(el), 'easeIn'], [e.ms, 0]] : [[0, opa(el)], [e.ms - f, opa(el), 'easeIn'], [e.ms, 0]]]);
  return fx(e.ms, o.speed, tracks);
}

/** In, hold for `o.hold`, out — one clip (an alert). Rests invisible before and after. */
function buildPopup(e: Entrance, el: LayoutElement, o: EffectOptions): Built {
  const a = Math.round(e.ms * o.speed);
  const b = a + Math.max(0, Math.round(o.hold));
  const outMs = Math.round(e.ms * 0.8 * o.speed);
  const c = b + outMs;
  const ease = e.outEase || 'easeInCubic';
  const tracks: TimelineTrack[] = e.parts.map(([prop, from, to, inEase]) => ({
    prop,
    keyframes: [{ t: 0, value: val(from, el), ease: inEase || 'easeOut' }, { t: a, value: val(to, el) }, { t: b, value: val(to, el), ease }, { t: c, value: val(from, el) }],
  }));
  for (const [prop, v] of e.hold || []) tracks.push({ prop, keyframes: [{ t: 0, value: v }] });
  // A popup must be invisible at rest: wipes hide it themselves, everything else fades.
  const hidesItself = e.parts.some(([p]) => p.startsWith('wipe'));
  if (!hidesItself) {
    const f = Math.max(120, Math.round(fadeMs(e) * o.speed) || Math.round(a * 0.4));
    tracks.push({ prop: 'opacity', keyframes: [{ t: 0, value: 0, ease: 'easeOut' }, { t: Math.min(a, f), value: opa(el) }, { t: Math.max(b, c - Math.min(outMs, f)), value: opa(el), ease: 'easeIn' }, { t: c, value: 0 }] });
  }
  return { duration: c, tracks };
}

const entranceEffects: EffectDef[] = ENTRANCES.flatMap((e) => {
  const list: EffectDef[] = [
    { id: e.inId, label: e.inLabel, group: 'in', family: e.family, build: (el, o) => buildIn(e, el, o) },
    { id: e.outId, label: e.outLabel, group: 'out', family: e.family, build: (el, o) => buildOut(e, el, o) },
  ];
  if (e.popupId) list.push({ id: e.popupId, label: e.popupLabel || `${e.inLabel}, stay, ${e.outLabel.toLowerCase()}`, group: 'popup', family: e.family, build: (el, o) => buildPopup(e, el, o) });
  return list;
});

// ── attention, looks and loops ──────────────────────────────────────────────

const A = (id: string, label: string, family: string, build: EffectDef['build'], extra: Partial<EffectDef> = {}): EffectDef => ({ id, label, group: 'attention', family, build, ...extra });
const S = (id: string, label: string, family: string, build: EffectDef['build'], extra: Partial<EffectDef> = {}): EffectDef => ({ id, label, group: 'state', family, build, ...extra });
const L = (id: string, label: string, family: string, build: EffectDef['build']): EffectDef => ({ id, label, group: 'loop', family, build });

const otherEffects: EffectDef[] = [
  // ── get attention (starts and ends as it was) ──
  A('pop', 'Pop', 'Scale', (_el, o) => fx(400, o.speed, [['scale', [[0, 1, 'easeOut'], [140, 1.25, 'easeInOut'], [400, 1]]]])),
  A('pulse', 'Pulse once', 'Scale', (_el, o) => fx(600, o.speed, [['scale', [[0, 1, 'easeInOut'], [300, 1.08, 'easeInOut'], [600, 1]]]])),
  A('heartbeat', 'Heartbeat (two beats)', 'Scale', (_el, o) => fx(700, o.speed, [['scale', [[0, 1, 'easeOut'], [120, 1.15, 'easeIn'], [260, 1, 'easeOut'], [400, 1.1, 'easeIn'], [700, 1]]]])),
  A('rubberBand', 'Rubber band', 'Scale', (_el, o) => fx(800, o.speed, [['scaleX', [[0, 1], [240, 1.25], [320, 0.75], [400, 1.15], [520, 0.95], [600, 1.05], [800, 1]]], ['scaleY', [[0, 1], [240, 0.75], [320, 1.25], [400, 0.85], [520, 1.05], [600, 0.95], [800, 1]]]])),
  A('squash', 'Squash and stretch', 'Scale', (_el, o) => fx(500, o.speed, [['scaleY', [[0, 1, 'easeOut'], [150, 0.7, 'easeInOut'], [320, 1.12, 'easeInOut'], [500, 1]]], ['scaleX', [[0, 1, 'easeOut'], [150, 1.2, 'easeInOut'], [320, 0.94, 'easeInOut'], [500, 1]]], ['originY', [[0, 100]]], ['originX', [[0, 50]]]])),
  A('tada', 'Ta-da', 'Scale', (el, o) => fx(900, o.speed, [['scale', [[0, 1], [90, 0.9], [270, 1.12], [810, 1.12], [900, 1]]], ['rotation', [[0, rot(el)], [90, rot(el) - 3], [270, rot(el) + 3], [360, rot(el) - 3], [450, rot(el) + 3], [540, rot(el) - 3], [630, rot(el) + 3], [810, rot(el) - 3], [900, rot(el)]]]])),
  A('shake', 'Shake (sideways)', 'Shake', (_el, o) => fx(500, o.speed, [['dx', [[0, 0], [70, -10], [150, 10], [230, -8], [310, 8], [400, -4], [500, 0]]]])),
  A('shakeY', 'Shake (up & down)', 'Shake', (_el, o) => fx(500, o.speed, [['dy', [[0, 0], [70, -10], [150, 10], [230, -8], [310, 8], [400, -4], [500, 0]]]])),
  A('headShake', 'Head shake ("no")', 'Shake', (_el, o) => fx(700, o.speed, [['dx', [[0, 0, 'easeInOut'], [100, -8, 'easeInOut'], [250, 7, 'easeInOut'], [400, -4, 'easeInOut'], [550, 2, 'easeInOut'], [700, 0]]], ['rotateY', [[0, 0, 'easeInOut'], [100, -9, 'easeInOut'], [250, 7, 'easeInOut'], [400, -5, 'easeInOut'], [550, 3, 'easeInOut'], [700, 0]]]])),
  A('nudge', 'Nudge right', 'Shake', (_el, o) => fx(450, o.speed, [['dx', [[0, 0, 'easeOut'], [140, 18, 'easeInOut'], [450, 0]]]])),
  A('wobble', 'Wobble', 'Turn', (el, o) => fx(600, o.speed, [['rotation', [[0, rot(el), 'easeInOut'], [150, rot(el) - 6, 'easeInOut'], [300, rot(el) + 6, 'easeInOut'], [450, rot(el) - 3, 'easeInOut'], [600, rot(el)]]]])),
  A('jello', 'Jello', 'Turn', (_el, o) => fx(800, o.speed, [['skewX', [[0, 0], [180, -12], [270, 6.25], [360, -3.1], [450, 1.6], [540, -0.8], [630, 0.4], [800, 0]]], ['skewY', [[0, 0], [180, -12], [270, 6.25], [360, -3.1], [450, 1.6], [540, -0.8], [630, 0.4], [800, 0]]]])),
  A('swing', 'Swing (hinged at the top)', 'Turn', (el, o) => fx(800, o.speed, [['rotation', [[0, rot(el), 'easeInOut'], [160, rot(el) + 12, 'easeInOut'], [320, rot(el) - 9, 'easeInOut'], [480, rot(el) + 5, 'easeInOut'], [640, rot(el) - 3, 'easeInOut'], [800, rot(el)]]], ['originY', [[0, 0]]], ['originX', [[0, 50]]]])),
  A('spin', 'Spin once', 'Turn', (el, o) => fx(700, o.speed, [['rotation', [[0, rot(el), 'easeInOut'], [700, rot(el) + 360]]]])),
  A('flipOnce', 'Flip once', 'Turn', (_el, o) => fx(700, o.speed, [['rotateY', [[0, 0, 'easeInOut'], [700, 360]]]])),
  A('bounce', 'Bounce', 'Move', (_el, o) => fx(600, o.speed, [['dy', [[0, 0, 'easeOut'], [150, -24, 'easeIn'], [300, 0, 'easeOut'], [420, -10, 'easeIn'], [600, 0]]]])),
  A('hop', 'Hop', 'Move', (_el, o) => fx(450, o.speed, [['dy', [[0, 0, 'easeOutCubic'], [200, -34, 'easeInCubic'], [450, 0]]], ['scaleY', [[0, 1], [200, 1.06], [400, 0.94], [450, 1]]]])),
  A('flash', 'Flash (blink twice)', 'Light', (el, o) => fx(600, o.speed, [['opacity', [[0, opa(el)], [150, opa(el) * 0.2], [300, opa(el)], [450, opa(el) * 0.2], [600, opa(el)]]]])),
  A('glow', 'Light up', 'Light', (_el, o) => fx(600, o.speed, [['brightness', [[0, 1, 'easeOut'], [150, 1.9, 'easeInOut'], [600, 1]]]])),
  A('strobe', 'Strobe', 'Light', (_el, o) => fx(500, o.speed, [['brightness', [[0, 1, 'hold'], [60, 2.6, 'hold'], [120, 1, 'hold'], [180, 2.6, 'hold'], [240, 1, 'hold'], [300, 2.6, 'hold'], [360, 1]]]])),
  A('hueSweep', 'Colour sweep', 'Light', (_el, o) => fx(900, o.speed, [['hueRotate', [[0, 0, 'easeInOut'], [900, 360]]]])),
  A('colorFlash', 'Flash a colour', 'Light', (el, o) => { const p = colorPropOf(el) || 'color'; const base = restColor(el, p); return fx(700, o.speed, [[p, [[0, base, 'easeOut'], [150, o.color, 'easeInOut'], [700, base]]]]); }, { usesColor: true, leafOnly: true }),
  A('wipeFlash', 'Wipe across and back', 'Light', (_el, o) => fx(700, o.speed, [['wipeR', [[0, 0, 'easeInOutCubic'], [340, 1, 'hold'], [350, 0]]], ['wipeL', [[0, 0, 'hold'], [350, 1, 'easeInOutCubic'], [700, 0]]]])),
  A('trackPulse', 'Letters breathe (text)', 'Light', (el, o) => fx(700, o.speed, [['letterSpacing', [[0, tracking(el), 'easeOutCubic'], [250, tracking(el) + 8, 'easeInOutCubic'], [700, tracking(el)]]]])),

  // ── a look it keeps while something is true ──
  S('greyOut', 'Grey out', 'Fade', (el, o) => fx(300, o.speed, [['grayscale', [[0, 0, 'easeOut'], [300, 1]]], ['opacity', [[0, opa(el), 'easeOut'], [300, opa(el) * 0.55]]]])),
  S('dim', 'Dim', 'Fade', (el, o) => fx(300, o.speed, [['opacity', [[0, opa(el), 'easeOut'], [300, opa(el) * 0.35]]]])),
  S('hide', 'Hide', 'Fade', (el, o) => fx(300, o.speed, [['opacity', [[0, opa(el), 'easeOut'], [300, 0]]]])),
  S('desaturate', 'Drain the colour', 'Fade', (_el, o) => fx(300, o.speed, [['saturate', [[0, 1, 'easeOut'], [300, 0.15]]]])),
  S('blurOutState', 'Blur', 'Fade', (_el, o) => fx(300, o.speed, [['blur', [[0, 0, 'easeOut'], [300, 6]]]])),
  S('shrink', 'Shrink back', 'Shape', (el, o) => fx(300, o.speed, [['scale', [[0, 1, 'easeOut'], [300, 0.88]]], ['opacity', [[0, opa(el), 'easeOut'], [300, opa(el) * 0.6]]]])),
  S('enlarge', 'Stand out (larger)', 'Shape', (_el, o) => fx(300, o.speed, [['scale', [[0, 1, 'backOut'], [300, 1.1]]]])),
  S('shiftRight', 'Step aside (right)', 'Shape', (_el, o) => fx(300, o.speed, [['dx', [[0, 0, 'easeOutCubic'], [300, 24]]]])),
  S('tilt', 'Tilt', 'Shape', (el, o) => fx(300, o.speed, [['rotation', [[0, rot(el), 'easeOutCubic'], [300, rot(el) - 4]]]])),
  S('collapse', 'Collapse (wipe shut)', 'Shape', (_el, o) => fx(350, o.speed, [['wipeR', [[0, 0, 'easeInOutCubic'], [350, 1]]]])),
  S('brighten', 'Brighten', 'Light', (_el, o) => fx(300, o.speed, [['brightness', [[0, 1, 'easeOut'], [300, 1.5]]]])),
  S('darken', 'Darken', 'Light', (_el, o) => fx(300, o.speed, [['brightness', [[0, 1, 'easeOut'], [300, 0.45]]]])),
  S('vivid', 'More vivid', 'Light', (_el, o) => fx(300, o.speed, [['saturate', [[0, 1, 'easeOut'], [300, 1.8]]], ['contrast', [[0, 1, 'easeOut'], [300, 1.15]]]])),
  S('tint', 'Change colour', 'Light', (el, o) => { const p = colorPropOf(el) || 'color'; return fx(250, o.speed, [[p, [[0, restColor(el, p), 'easeOut'], [250, o.color]]]]); }, { usesColor: true, leafOnly: true }),
  S('alertPulse', 'Alert pulse (keeps pulsing)', 'Pulse', (_el, o) => fx(900, o.speed, [['scale', [[0, 1, 'easeInOut'], [450, 1.05, 'easeInOut'], [900, 1]]], ['brightness', [[0, 1, 'easeInOut'], [450, 1.5, 'easeInOut'], [900, 1]]]], true)),
  S('tintPulse', 'Pulse a colour (keeps pulsing)', 'Pulse', (el, o) => { const p = colorPropOf(el) || 'color'; const base = restColor(el, p); return fx(800, o.speed, [[p, [[0, base, 'easeInOut'], [400, o.color, 'easeInOut'], [800, base]]]], true); }, { usesColor: true, leafOnly: true }),
  S('tremble', 'Tremble (keeps shaking)', 'Pulse', (_el, o) => fx(240, o.speed, [['dx', [[0, 0], [60, -3], [120, 3], [180, -2], [240, 0]]]], true)),

  // ── never stops ──
  L('pulseLoop', 'Pulse', 'Scale', (_el, o) => fx(1200, o.speed, [['scale', [[0, 1, 'easeInOut'], [600, 1.06, 'easeInOut'], [1200, 1]]]], true)),
  L('heartbeatLoop', 'Heartbeat', 'Scale', (_el, o) => fx(1200, o.speed, [['scale', [[0, 1, 'easeOut'], [140, 1.12, 'easeIn'], [280, 1, 'easeOut'], [420, 1.08, 'easeIn'], [600, 1], [1200, 1]]]], true)),
  L('breatheScale', 'Breathe (slow scale)', 'Scale', (_el, o) => fx(3200, o.speed, [['scale', [[0, 1, 'easeInOut'], [1600, 1.03, 'easeInOut'], [3200, 1]]]], true)),
  L('blinkLoop', 'Blink', 'Light', (el, o) => fx(800, o.speed, [['opacity', [[0, opa(el), 'easeInOut'], [400, opa(el) * 0.3, 'easeInOut'], [800, opa(el)]]]], true)),
  L('breatheLoop', 'Breathe (glow)', 'Light', (_el, o) => fx(2400, o.speed, [['brightness', [[0, 1, 'easeInOut'], [1200, 1.3, 'easeInOut'], [2400, 1]]]], true)),
  L('shimmerLoop', 'Shimmer', 'Light', (_el, o) => fx(1800, o.speed, [['brightness', [[0, 1, 'easeInOut'], [300, 1.6, 'easeInOut'], [600, 1], [1800, 1]]]], true)),
  L('rainbowLoop', 'Colour cycle', 'Light', (_el, o) => fx(6000, o.speed, [['hueRotate', [[0, 0], [6000, 360]]]], true)),
  L('floatLoop', 'Float', 'Move', (_el, o) => fx(2400, o.speed, [['dy', [[0, 0, 'easeInOut'], [1200, -12, 'easeInOut'], [2400, 0]]]], true)),
  L('swayLoop', 'Sway (side to side)', 'Move', (_el, o) => fx(3000, o.speed, [['dx', [[0, -10, 'easeInOut'], [1500, 10, 'easeInOut'], [3000, -10]]]], true)),
  L('orbitLoop', 'Orbit (small circle)', 'Move', (_el, o) => fx(3200, o.speed, [['dx', [[0, 8, 'easeInOut'], [800, 0, 'easeInOut'], [1600, -8, 'easeInOut'], [2400, 0, 'easeInOut'], [3200, 8]]], ['dy', [[0, 0, 'easeInOut'], [800, 8, 'easeInOut'], [1600, 0, 'easeInOut'], [2400, -8, 'easeInOut'], [3200, 0]]]], true)),
  {
    id: 'wiggleLoop', label: 'Wiggle (random drift)', group: 'loop', family: 'Move',
    build: (_el, o) => ({
      duration: Math.round(4000 * o.speed), loop: true,
      tracks: [
        { prop: 'dx', keyframes: [{ t: 0, value: 0 }], wiggle: { freq: Math.round((1.2 / o.speed) * 100) / 100, amp: 6 } },
        { prop: 'dy', keyframes: [{ t: 0, value: 0 }], wiggle: { freq: Math.round((1 / o.speed) * 100) / 100, amp: 6 } },
      ],
    }),
  },
  L('wobbleLoop', 'Wobble', 'Turn', (el, o) => fx(1600, o.speed, [['rotation', [[0, rot(el) - 3, 'easeInOut'], [800, rot(el) + 3, 'easeInOut'], [1600, rot(el) - 3]]]], true)),
  L('spinLoop', 'Spin', 'Turn', (el, o) => fx(4000, o.speed, [['rotation', [[0, rot(el)], [4000, rot(el) + 360]]]], true)),
  L('pendulumLoop', 'Pendulum (hinged at the top)', 'Turn', (el, o) => fx(2000, o.speed, [['rotation', [[0, rot(el) - 8, 'easeInOut'], [1000, rot(el) + 8, 'easeInOut'], [2000, rot(el) - 8]]], ['originY', [[0, 0]]], ['originX', [[0, 50]]]], true)),
  L('turnLoop', 'Turn (3D)', 'Turn', (_el, o) => fx(5000, o.speed, [['rotateY', [[0, 0], [5000, 360]]]], true)),
];

export const EFFECT_LIST: EffectDef[] = [...entranceEffects, ...otherEffects];

export const EFFECTS: Record<string, EffectDef> = Object.fromEntries(EFFECT_LIST.map((e) => [e.id, e]));

export const EFFECT_GROUP_LABEL: Record<EffectGroup, string> = {
  in: 'Appear', out: 'Disappear', popup: 'Show, then hide', attention: 'Get attention', state: 'Change its look', loop: 'Keep moving',
};

/** The exit that mirrors an entrance (slideInLeft -> slideOutLeft), for a one-click lifecycle. */
export function matchingExit(inEffect: string): string {
  return ENTRANCES.find((e) => e.inId === inEffect)?.outId ?? 'fadeOut';
}
