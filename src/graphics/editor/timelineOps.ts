// Pure edits on an element's timeline (clips / tracks / keyframes) plus the
// clip presets the Timeline panel offers. Every function returns a NEW element
// (never mutates), so the editor wraps them in store commands for undo.

import type {
  AnimationEvent, AnimationStep, Condition, KeyframeEase, KeyframeValue, LayoutElement, TimelineClip, TimelineProp,
} from '../schema/layoutTypes.ts';

export const MIN_KEY_GAP = 1;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function clipsOf(el: LayoutElement): TimelineClip[] {
  return el.timeline?.clips || [];
}

function withClips(el: LayoutElement, clips: TimelineClip[]): LayoutElement {
  const next = { ...el };
  if (clips.length) next.timeline = { clips };
  else delete next.timeline;
  return next;
}

export function newClipId(el: LayoutElement): string {
  const taken = new Set(clipsOf(el).map((c) => c.id));
  for (let i = 1; ; i++) if (!taken.has(`clip${i}`)) return `clip${i}`;
}

export type ClipPreset =
  | 'blank' | 'slideIn' | 'fadeIn' | 'popOnEvent' | 'slideOnEvent' | 'pulseLoop' | 'floatLoop' | 'whenCondition';

export const CLIP_PRESETS: Array<{ id: ClipPreset; label: string; needsEvent?: boolean }> = [
  { id: 'slideIn', label: 'On enter — slide in' },
  { id: 'fadeIn', label: 'On enter — fade in' },
  { id: 'popOnEvent', label: 'On live event — pop in & out', needsEvent: true },
  { id: 'slideOnEvent', label: 'On live event — slide in & out', needsEvent: true },
  { id: 'pulseLoop', label: 'Loop — pulse' },
  { id: 'floatLoop', label: 'Loop — float' },
  { id: 'whenCondition', label: 'When data becomes true — fade in' },
  { id: 'blank', label: 'Blank clip' },
];

export const EVENT_LABELS: Record<AnimationEvent, string> = {
  kill: 'Kill', elimination: 'Team eliminated', recall: 'Player recalled', milestone: 'Milestone (first blood, 5 kills…)',
  matchStart: 'Match start', matchEnd: 'Match end', rankChange: 'Rank change', killsChange: 'Team kills change',
  knock: 'Player knocked', revive: 'Player revived', playerDeath: 'Player died',
};

/** Build a preset clip around the element's current geometry. */
export function presetClip(preset: ClipPreset, el: LayoutElement, id: string, event: AnimationEvent = 'kill', when?: Condition): TimelineClip {
  const { x, y } = el;
  const base = { id, retrigger: 'restart' as const };
  switch (preset) {
    case 'slideIn':
      return { ...base, name: 'Slide in', duration: 600, trigger: { type: 'enter' }, tracks: [
        { prop: 'x', keyframes: [{ t: 0, value: x - 300, ease: 'easeOut' }, { t: 600, value: x }] },
        { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 300, value: 1 }] },
      ] };
    case 'fadeIn':
      return { ...base, name: 'Fade in', duration: 500, trigger: { type: 'enter' }, tracks: [
        { prop: 'opacity', keyframes: [{ t: 0, value: 0, ease: 'easeOut' }, { t: 500, value: 1 }] },
      ] };
    case 'popOnEvent':
      return { ...base, name: `Pop on ${event}`, duration: 3400, trigger: { type: 'event', event }, retrigger: 'queue', tracks: [
        { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 150, value: 1 }, { t: 3100, value: 1 }, { t: 3400, value: 0 }] },
        { prop: 'scale', keyframes: [{ t: 0, value: 0.6, ease: 'backOut' }, { t: 350, value: 1 }, { t: 3100, value: 1, ease: 'easeIn' }, { t: 3400, value: 0.9 }] },
      ] };
    case 'slideOnEvent':
      return { ...base, name: `Slide on ${event}`, duration: 3600, trigger: { type: 'event', event }, retrigger: 'queue', tracks: [
        { prop: 'x', keyframes: [{ t: 0, value: x + 500, ease: 'easeOut' }, { t: 450, value: x }, { t: 3150, value: x, ease: 'easeIn' }, { t: 3600, value: x + 500 }] },
        { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 200, value: 1 }, { t: 3400, value: 1 }, { t: 3600, value: 0 }] },
      ] };
    case 'pulseLoop':
      return { ...base, name: 'Pulse', duration: 1200, loop: true, trigger: { type: 'loop' }, tracks: [
        { prop: 'scale', keyframes: [{ t: 0, value: 1, ease: 'easeInOut' }, { t: 600, value: 1.06, ease: 'easeInOut' }, { t: 1200, value: 1 }] },
      ] };
    case 'floatLoop':
      return { ...base, name: 'Float', duration: 2400, loop: true, trigger: { type: 'loop' }, tracks: [
        { prop: 'y', keyframes: [{ t: 0, value: y, ease: 'easeInOut' }, { t: 1200, value: y - 12, ease: 'easeInOut' }, { t: 2400, value: y }] },
      ] };
    case 'whenCondition':
      return { ...base, name: 'When true', duration: 500, trigger: { type: 'condition', when: when || { path: 'live.isRecallMap', op: 'equals', value: true } }, tracks: [
        { prop: 'opacity', keyframes: [{ t: 0, value: 0, ease: 'easeOut' }, { t: 500, value: 1 }] },
      ] };
    default:
      return { ...base, name: 'Clip', duration: 1000, trigger: { type: 'enter' }, tracks: [] };
  }
}

export function addClip(el: LayoutElement, clip: TimelineClip): LayoutElement {
  return withClips(el, [...clipsOf(el), clip]);
}

export function removeClip(el: LayoutElement, clipId: string): LayoutElement {
  return withClips(el, clipsOf(el).filter((c) => c.id !== clipId));
}

export function updateClip(el: LayoutElement, clipId: string, fn: (c: TimelineClip) => TimelineClip): LayoutElement {
  return withClips(el, clipsOf(el).map((c) => (c.id === clipId ? fn(clone(c)) : c)));
}

export function addTrack(el: LayoutElement, clipId: string, prop: TimelineProp, t: number, value: KeyframeValue): LayoutElement {
  return updateClip(el, clipId, (c) => (c.tracks.some((tr) => tr.prop === prop) ? c : { ...c, tracks: [...c.tracks, { prop, keyframes: [{ t, value }] }] }));
}

export function removeTrack(el: LayoutElement, clipId: string, prop: TimelineProp): LayoutElement {
  return updateClip(el, clipId, (c) => ({ ...c, tracks: c.tracks.filter((tr) => tr.prop !== prop) }));
}

/** Insert or replace the keyframe at time t (within MIN_KEY_GAP). Creates the track if needed. */
export function upsertKeyframe(el: LayoutElement, clipId: string, prop: TimelineProp, t: number, value: KeyframeValue, ease?: KeyframeEase): LayoutElement {
  const time = Math.max(0, Math.round(t));
  return updateClip(el, clipId, (c) => {
    let track = c.tracks.find((tr) => tr.prop === prop);
    if (!track) { track = { prop, keyframes: [] }; c.tracks.push(track); }
    const i = track.keyframes.findIndex((k) => Math.abs(k.t - time) < MIN_KEY_GAP);
    const k = { t: time, value, ...(ease ? { ease } : i >= 0 && track.keyframes[i].ease ? { ease: track.keyframes[i].ease } : null) };
    if (i >= 0) track.keyframes[i] = k; else track.keyframes.push(k);
    track.keyframes.sort((a, b) => a.t - b.t);
    if (time > c.duration) c.duration = Math.min(60000, time);
    return c;
  });
}

export function moveKeyframe(el: LayoutElement, clipId: string, prop: TimelineProp, fromT: number, toT: number): LayoutElement {
  return updateClip(el, clipId, (c) => {
    const track = c.tracks.find((tr) => tr.prop === prop);
    if (!track) return c;
    const k = track.keyframes.find((x) => x.t === fromT);
    if (!k) return c;
    const target = Math.max(0, Math.min(c.duration, Math.round(toT)));
    track.keyframes = track.keyframes.filter((x) => x === k || Math.abs(x.t - target) >= MIN_KEY_GAP);
    k.t = target;
    track.keyframes.sort((a, b) => a.t - b.t);
    return c;
  });
}

export function deleteKeyframe(el: LayoutElement, clipId: string, prop: TimelineProp, t: number): LayoutElement {
  return updateClip(el, clipId, (c) => ({
    ...c,
    tracks: c.tracks
      .map((tr) => (tr.prop === prop ? { ...tr, keyframes: tr.keyframes.filter((k) => k.t !== t) } : tr))
      .filter((tr) => tr.keyframes.length > 0),
  }));
}

export function setKeyframe(el: LayoutElement, clipId: string, prop: TimelineProp, t: number, patch: { value?: KeyframeValue; ease?: KeyframeEase | null }): LayoutElement {
  return updateClip(el, clipId, (c) => {
    const k = c.tracks.find((tr) => tr.prop === prop)?.keyframes.find((x) => x.t === t);
    if (!k) return c;
    if (patch.value !== undefined) k.value = patch.value;
    if (patch.ease === null) delete k.ease; else if (patch.ease !== undefined) k.ease = patch.ease;
    return c;
  });
}

/** The element's current value for a property (the "base" a new keyframe starts from). */
export function baseValue(el: LayoutElement, prop: TimelineProp): number | string {
  switch (prop) {
    case 'x': return el.x;
    case 'y': return el.y;
    case 'w': return el.w;
    case 'h': return el.h;
    case 'rotation': return el.rotation || 0;
    case 'opacity': return el.opacity ?? 1;
    case 'scale': case 'scaleX': case 'scaleY': return 1;
    case 'skewX': case 'skewY': case 'blur': case 'grayscale': case 'dx': case 'dy': case 'rotateX': case 'rotateY': case 'hueRotate':
    case 'wipeL': case 'wipeR': case 'wipeT': case 'wipeB': return 0;
    case 'brightness': case 'saturate': case 'contrast': return 1;
    case 'originX': case 'originY': return 50;
    case 'letterSpacing': return typeof el.style?.letterSpacing === 'number' ? el.style.letterSpacing : 0;
    case 'fill': return typeof el.style?.fill === 'string' ? el.style.fill : '#ffffff';
    case 'color': return typeof el.style?.color === 'string' ? el.style.color : '#ffffff';
    case 'stroke': return typeof el.style?.stroke === 'string' ? el.style.stroke : '#ffffff';
    default: return 0;
  }
}

// ── convert legacy enter/exit/onEvent presets into a clip ────────────────────

function stepTracks(step: AnimationStep, el: LayoutElement, from: number, to: number, entering: boolean) {
  const dur = to - from;
  const a = entering ? 0 : 1;
  const b = entering ? 1 : 0;
  const tracks: TimelineClip['tracks'] = [];
  const kf = (prop: TimelineProp, off: number | string, on: number | string, ease: KeyframeEase = entering ? 'easeOut' : 'easeIn') =>
    tracks.push({ prop, keyframes: [{ t: from, value: entering ? off : on, ease }, { t: from + dur, value: entering ? on : off }] });
  switch (step.preset) {
    case 'fade': kf('opacity', 0, 1); break;
    case 'slideLeft': kf('x', el.x + 200, el.x); kf('opacity', 0, 1); break;
    case 'slideRight': kf('x', el.x - 200, el.x); kf('opacity', 0, 1); break;
    case 'slideUp': kf('y', el.y + 120, el.y); kf('opacity', 0, 1); break;
    case 'slideDown': kf('y', el.y - 120, el.y); kf('opacity', 0, 1); break;
    case 'scale': kf('scale', 0.5, 1); kf('opacity', 0, 1); break;
    case 'pop': kf('scale', 0.6, 1, 'backOut'); kf('opacity', 0, 1); break;
    default: kf('opacity', a, b);
  }
  return tracks;
}

/** Turn an element's enter (+exit) or onEvent preset into an equivalent editable clip. */
export function animToClip(el: LayoutElement, id: string): TimelineClip | null {
  const anim = el.anim;
  if (!anim) return null;
  if (anim.onEvent) {
    const ev = anim.onEvent;
    const inDur = ev.duration ?? 400;
    const hold = ev.hold ?? 3000;
    const tracks = [...stepTracks(ev, el, 0, inDur, true), ...stepTracks(anim.exit ?? { preset: 'fade', duration: 300 }, el, inDur + hold, inDur + hold + (anim.exit?.duration ?? 300), false)];
    return mergeTracks({ id, name: `On ${ev.event}`, duration: inDur + hold + (anim.exit?.duration ?? 300), trigger: { type: 'event', event: ev.event, filter: ev.filter }, retrigger: 'queue', tracks });
  }
  if (anim.enter) {
    const d = anim.enter.duration ?? 500;
    return mergeTracks({ id, name: 'Enter', duration: d + (anim.enter.delay ?? 0), trigger: { type: 'enter' }, retrigger: 'restart', tracks: stepTracks(anim.enter, el, anim.enter.delay ?? 0, (anim.enter.delay ?? 0) + d, true) });
  }
  return null;
}

function mergeTracks(c: TimelineClip): TimelineClip {
  const byProp = new Map<TimelineProp, TimelineClip['tracks'][number]>();
  for (const tr of c.tracks) {
    const cur = byProp.get(tr.prop);
    if (cur) cur.keyframes.push(...tr.keyframes); else byProp.set(tr.prop, { prop: tr.prop, keyframes: [...tr.keyframes] });
  }
  return { ...c, tracks: Array.from(byProp.values()).map((tr) => ({ ...tr, keyframes: tr.keyframes.sort((a, b) => a.t - b.t) })) };
}

// ── several keyframes at once (After-Effects-style editing) ──────────────────

export interface KeyRef { prop: TimelineProp; t: number }

const sameKey = (a: KeyRef, b: KeyRef) => a.prop === b.prop && a.t === b.t;

export function deleteKeyframes(el: LayoutElement, clipId: string, keys: KeyRef[]): LayoutElement {
  return updateClip(el, clipId, (c) => ({
    ...c,
    tracks: c.tracks
      .map((tr) => ({ ...tr, keyframes: tr.keyframes.filter((k) => !keys.some((s) => sameKey(s, { prop: tr.prop, t: k.t }))) }))
      .filter((tr) => tr.keyframes.length > 0),
  }));
}

/** Move a set of keyframes together by `delta` ms (kept inside 0..duration). Returns the element and where they ended up. */
export function shiftKeyframes(el: LayoutElement, clipId: string, keys: KeyRef[], delta: number): { el: LayoutElement; keys: KeyRef[] } {
  const clip = clipsOf(el).find((c) => c.id === clipId);
  if (!clip || !keys.length) return { el, keys };
  const min = Math.min(...keys.map((k) => k.t));
  const max = Math.max(...keys.map((k) => k.t));
  const d = Math.round(Math.max(-min, Math.min(clip.duration - max, delta)));
  if (!d) return { el, keys };
  const moved = keys.map((k) => ({ prop: k.prop, t: k.t + d }));
  const next = updateClip(el, clipId, (c) => {
    for (const tr of c.tracks) {
      const mine = keys.filter((k) => k.prop === tr.prop).map((k) => k.t);
      if (!mine.length) continue;
      const movedFrames = tr.keyframes.filter((k) => mine.includes(k.t)).map((k) => ({ ...k, t: k.t + d }));
      const landing = new Set(movedFrames.map((k) => k.t));
      // a moved keyframe replaces an unselected one it lands on
      tr.keyframes = [...tr.keyframes.filter((k) => !mine.includes(k.t) && !landing.has(k.t)), ...movedFrames].sort((a, b) => a.t - b.t);
    }
    return c;
  });
  return { el: next, keys: moved };
}

/** Set (or with null, clear) the ease of several keyframes. */
export function setKeyframesEase(el: LayoutElement, clipId: string, keys: KeyRef[], ease: KeyframeEase | null): LayoutElement {
  return updateClip(el, clipId, (c) => {
    for (const tr of c.tracks) {
      for (const k of tr.keyframes) {
        if (!keys.some((s) => sameKey(s, { prop: tr.prop, t: k.t }))) continue;
        if (ease === null) delete k.ease; else k.ease = ease;
      }
    }
    return c;
  });
}

/** A keyframe on the clipboard: its time relative to the earliest copied one. */
export interface CopiedKey { prop: TimelineProp; dt: number; value: KeyframeValue; ease?: KeyframeEase }

export function copyKeyframes(clip: TimelineClip, keys: KeyRef[]): CopiedKey[] {
  const found = clip.tracks.flatMap((tr) => tr.keyframes.filter((k) => keys.some((s) => sameKey(s, { prop: tr.prop, t: k.t }))).map((k) => ({ prop: tr.prop, k })));
  if (!found.length) return [];
  const t0 = Math.min(...found.map((f) => f.k.t));
  return found.map(({ prop, k }) => clone({ prop, dt: k.t - t0, value: k.value, ...(k.ease ? { ease: k.ease } : null) }));
}

/** Paste copied keyframes starting at `at` (the playhead). The clip grows if they run past its end. */
export function pasteKeyframes(el: LayoutElement, clipId: string, copied: CopiedKey[], at: number): { el: LayoutElement; keys: KeyRef[] } {
  let next = el;
  const keys: KeyRef[] = [];
  for (const c of copied) {
    const t = Math.max(0, Math.round(at + c.dt));
    next = upsertKeyframe(next, clipId, c.prop, t, clone(c.value), c.ease);
    keys.push({ prop: c.prop, t });
  }
  return { el: next, keys };
}

/** Time-reverse a clip (After Effects "Time-Reverse Keyframes"): each segment keeps its ease. */
export function reverseClip(el: LayoutElement, clipId: string): LayoutElement {
  return updateClip(el, clipId, (c) => {
    for (const tr of c.tracks) {
      const kfs = [...tr.keyframes].sort((a, b) => a.t - b.t);
      const n = kfs.length;
      tr.keyframes = kfs
        .map((k, i) => {
          const out: (typeof kfs)[number] = { t: c.duration - k.t, value: k.value };
          // the segment that used to lead INTO this key now leads out of it
          const ease = i > 0 ? kfs[i - 1].ease : undefined;
          if (ease) out.ease = ease;
          return out;
        })
        .sort((a, b) => a.t - b.t);
      if (n === 1) tr.keyframes[0].t = Math.max(0, Math.min(c.duration, tr.keyframes[0].t));
    }
    return c;
  });
}

/** Add, change or (null) remove a track's wiggle. */
export function setTrackWiggle(el: LayoutElement, clipId: string, prop: TimelineProp, wiggle: { freq: number; amp: number } | null): LayoutElement {
  return updateClip(el, clipId, (c) => {
    const tr = c.tracks.find((x) => x.prop === prop);
    if (!tr) return c;
    if (wiggle) tr.wiggle = wiggle; else delete tr.wiggle;
    return c;
  });
}

/** Every time that has a keyframe in the clip, ascending (J / K navigation). */
export function keyframeTimes(clip: TimelineClip): number[] {
  return Array.from(new Set(clip.tracks.flatMap((tr) => tr.keyframes.map((k) => k.t)))).sort((a, b) => a - b);
}
