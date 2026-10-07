// Keyframe timeline (the After-Effects-style view of a layer's clips).
//
//   [clip ▾] [+ clip ▾] name  play [trigger ▾]  dur  loop  delay  speed  stagger   ▶ ■ 0.00s ● rec  test ⚡  − +  ✕
//   ┌ tracks ─────┬ ruler 0s ─ 1s ─ 2s ──────────────────────────────── playhead ┐
//   │ Move X ◆+ 〰 │   ◆──────────◆                                               │
//   │ Opacity     │   ◆────◆                                                     │
//   └─────────────┴──────────────────────────────────────────────────────────────┘
//   selected keyframe(s): value [..] [Bind data]  ease [▾] [curve]  Easy Ease …
//
// Keyframes: click = select, Shift+click = add to the selection, drag an empty
// area = box-select, drag = move them all, Ctrl+C / Ctrl+V = copy / paste at
// the playhead. Keys (panel focused): Space play · J / K previous / next
// keyframe · Home / End · PgUp / PgDn one frame · P S R T A add a Move / Scale
// / Rotation / Opacity / Anchor keyframe · F9 Easy Ease · U all layers.
//
// The playhead is moved through a ref and the canvas frame through the
// PreviewStore, so scrubbing and playback cause no React render at all;
// `ui.playhead` is only committed when the head comes to rest.

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { AnimationEvent, KeyframeEase, LayoutDocument, LayoutElement, TimelineClip, TimelineProp } from '../schema/layoutTypes.ts';
import { ANIMATION_EVENTS, EASINGS, TIMELINE_PROPS, isSafePath } from '../schema/layoutSchema.js';
import type { BindingScope } from '../bindings/index.ts';
import type { PreviewStore } from '../renderer/useTimeline.ts';
import type { SimulationControls } from './simulation.ts';
import { sampleTrack, clipDelay, COLOR_PROPS } from '../renderer/timeline.ts';
import { type Command, editElements } from './store.ts';
import { locate } from './tree.ts';
import {
  CLIP_PRESETS, EVENT_LABELS, addClip, animToClip, baseValue, clipsOf, copyKeyframes, deleteKeyframes, keyframeTimes, newClipId,
  pasteKeyframes, presetClip, removeClip, removeTrack, reverseClip, setKeyframe, setKeyframesEase, setTrackWiggle, shiftKeyframes,
  updateClip, upsertKeyframe, type ClipPreset, type CopiedKey, type KeyRef,
} from './timelineOps.ts';
import { ConditionEditor, PickerButton } from './Inspector.tsx';
import { GraphEditor } from './GraphEditor.tsx';
import { Btn, ColorInput, NumberInput, Select, cx } from './ui.tsx';

export interface TimelineUiState {
  clipId: string | null;
  playhead: number;
  recording: boolean;
}

const PROP_LABEL: Record<TimelineProp, string> = {
  x: 'X', y: 'Y', w: 'Width', h: 'Height', rotation: 'Rotation', opacity: 'Opacity', scale: 'Scale', scaleX: 'Scale X',
  scaleY: 'Scale Y', skewX: 'Skew X', blur: 'Blur', grayscale: 'Grey out', brightness: 'Brightness', fill: 'Fill', color: 'Text color', stroke: 'Stroke',
  dx: 'Move X', dy: 'Move Y', rotateX: 'Tilt (3D X)', rotateY: 'Turn (3D Y)', skewY: 'Skew Y', originX: 'Anchor X %', originY: 'Anchor Y %',
  wipeL: 'Wipe from left', wipeR: 'Wipe from right', wipeT: 'Wipe from top', wipeB: 'Wipe from bottom',
  saturate: 'Saturation', hueRotate: 'Hue shift', contrast: 'Contrast', letterSpacing: 'Letter spacing',
};

export const SIM_FIRE: Partial<Record<AnimationEvent, (c: SimulationControls) => void>> = {
  kill: (c) => c.kill(), elimination: (c) => c.eliminate(), recall: (c) => c.recall(), milestone: (c) => c.milestone(),
  matchStart: (c) => c.matchStart(), matchEnd: (c) => c.matchEnd(), rankChange: (c) => c.rankShuffle(), killsChange: (c) => c.kill(),
  knock: (c) => c.knock(), revive: (c) => c.revive(), playerDeath: (c) => c.kill(),
};

/** After-Effects property shortcuts: one key adds a keyframe for these properties at the playhead. */
const PROP_KEYS: Record<string, TimelineProp[]> = { p: ['dx', 'dy'], s: ['scale'], r: ['rotation'], t: ['opacity'], a: ['originX', 'originY'] };

const TRIGGER_COLOR: Record<string, string> = { enter: '#34d399', exit: '#f87171', event: '#fbbf24', condition: '#38bdf8', loop: '#a78bfa' };
const TRIGGER_LABEL: Record<string, string> = { enter: 'on enter', exit: 'on exit', event: 'on event', condition: 'when true', loop: 'loop' };

const FRAME_MS = 1000 / 30;
const fmt = (ms: number) => `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
const keyId = (k: KeyRef) => `${k.prop}@${k.t}`;

/** Keyframes copied with Ctrl+C: shared by every timeline in the tab. */
let keyClipboard: CopiedKey[] = [];

export const TimelinePanel = memo(function TimelinePanel(props: {
  doc: LayoutDocument;
  selectedId: string | null;
  disabled?: boolean;
  exec(cmd: Command | null): void;
  /** Scope of the selected element (DataPicker for bindings / conditions). */
  scope: BindingScope;
  sim: SimulationControls | null;
  ui: TimelineUiState;
  setUi(patch: Partial<TimelineUiState>): void;
  /** true while the panel is scrubbing (editor passes a preview to the renderer). */
  onPreviewChange(active: boolean): void;
  /** The canvas frame is written here while scrubbing / playing (no React render). */
  previewStore?: PreviewStore | null;
  /** Dope sheet: pick another layer from the timeline. */
  onSelectLayer?(id: string): void;
}) {
  const { doc, selectedId, ui, setUi, exec } = props;
  const el = selectedId ? locate(doc.elements, selectedId)?.el ?? null : null;
  const clips = el ? clipsOf(el) : [];
  const clip = clips.find((c) => c.id === ui.clipId) ?? clips[0] ?? null;
  const [zoom, setZoom] = useState(0.2); // px per ms
  const [sel, setSel] = useState<KeyRef[]>([]);
  const [playing, setPlaying] = useState(false);
  const [allLayers, setAllLayers] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [wiggleFor, setWiggleFor] = useState<TimelineProp | null>(null);
  const [work, setWork] = useState<{ a: number; b: number } | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const readRef = useRef<HTMLSpanElement>(null);
  const headRef = useRef(ui.playhead);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const storeRef = useRef(props.previewStore);
  storeRef.current = props.previewStore;
  const elId = el?.id ?? null;
  const clipId = clip?.id ?? null;

  /** Move the playhead: the line, the readout and the canvas frame — no React render. */
  const paint = (t: number) => {
    headRef.current = t;
    if (lineRef.current) lineRef.current.style.left = `${t * zoomRef.current}px`;
    if (readRef.current) readRef.current.textContent = fmt(t);
    if (elId && clipId) storeRef.current?.set({ elementId: elId, clipId, t });
  };
  /** …and let the rest of the editor know where it came to rest. */
  const commit = (t: number) => { paint(t); if (t !== ui.playhead) setUi({ playhead: t }); };

  // Keep the chosen clip valid as the selection changes.
  useEffect(() => {
    if (clip && ui.clipId !== clip.id) setUi({ clipId: clip.id });
    if (!clip && ui.clipId) setUi({ clipId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id, selectedId]);
  useEffect(() => { setSel([]); setGraphOpen(false); setWiggleFor(null); setWork(null); }, [clip?.id, selectedId]);
  useEffect(() => { props.onPreviewChange(!!clip); /* scrub preview while a clip is open */ }, [clip?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The committed playhead (and zoom) drive the same DOM the scrub writes.
  useEffect(() => { paint(ui.playhead); }, [ui.playhead, zoom, elId, clipId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { storeRef.current?.set(null); }, [elId, clipId]);

  const edit = (fn: (e: LayoutElement) => LayoutElement, label: string, key?: string) => {
    if (!el || props.disabled) return;
    exec(editElements(doc, [el.id], fn, label, key));
  };

  // ── play ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !clip) return;
    const from = work ? work.a : 0;
    const to = work ? work.b : clip.duration;
    let start = performance.now() - Math.max(0, headRef.current - from);
    const step = () => {
      let t = from + (performance.now() - start);
      if (t >= to) {
        if (clip.loop || work) { start = performance.now(); t = from; } else { commit(to); setPlaying(false); return; }
      }
      paint(Math.round(t));
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); commit(Math.round(headRef.current)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, clip?.id]);

  const togglePlay = () => {
    if (!clip) return;
    if (!playing && headRef.current >= (work ? work.b : clip.duration)) paint(work ? work.a : 0);
    setPlaying(!playing);
  };

  // ── keyframes ───────────────────────────────────────────────────────────
  const addKeyAt = (prop: TimelineProp, t: number) => {
    if (!clip || !el) return;
    const track = clip.tracks.find((tr) => tr.prop === prop);
    const current = track ? sampleTrack({ ...track, wiggle: undefined }, t, props.scope) : undefined;
    const v = current ?? baseValue(el, prop);
    edit((x) => upsertKeyframe(x, clip.id, prop, t, typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 'Add keyframe');
  };
  const addKeysAtPlayhead = (propsToKey: TimelineProp[]) => {
    if (!clip || !el || props.disabled) return;
    const t = Math.round(headRef.current);
    let next = el;
    for (const prop of propsToKey) {
      const track = clipsOf(next).find((c) => c.id === clip.id)?.tracks.find((tr) => tr.prop === prop);
      const current = track ? sampleTrack({ ...track, wiggle: undefined }, t, props.scope) : undefined;
      const v = current ?? baseValue(next, prop);
      next = upsertKeyframe(next, clip.id, prop, t, typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
    }
    edit(() => next, 'Add keyframe');
    setSel(propsToKey.map((prop) => ({ prop, t })));
    commit(t);
  };
  const deleteSel = () => {
    if (!clip || !sel.length) return;
    edit((x) => deleteKeyframes(x, clip.id, sel), sel.length > 1 ? 'Delete keyframes' : 'Delete keyframe');
    setSel([]);
  };
  const easeSel = (ease: KeyframeEase | null, label = 'Keyframe ease') => {
    if (!clip || !sel.length) return;
    edit((x) => setKeyframesEase(x, clip.id, sel, ease), label, `ke:${sel.map(keyId).join(',')}`);
  };
  const copySel = () => { if (clip && sel.length) keyClipboard = copyKeyframes(clip, sel); };
  const pasteAtHead = () => {
    if (!clip || !el || !keyClipboard.length || props.disabled) return;
    const r = pasteKeyframes(el, clip.id, keyClipboard, Math.round(headRef.current));
    edit(() => r.el, keyClipboard.length > 1 ? 'Paste keyframes' : 'Paste keyframe');
    setSel(r.keys);
  };
  const jump = (dir: 1 | -1) => {
    if (!clip) return;
    const times = keyframeTimes(clip);
    const cur = Math.round(headRef.current);
    const next = dir > 0 ? times.find((t) => t > cur) : [...times].reverse().find((t) => t < cur);
    if (next != null) { setPlaying(false); commit(next); }
  };

  // ── keyboard (panel focused) ────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation(); // keep editor hotkeys (Delete = delete layer, Space = hand) out of the timeline
    const tag = (e.target as HTMLElement).tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const done = () => e.preventDefault();
    if (key === 'u' && !mod) { setAllLayers((v) => !v); return done(); }
    if (!clip) return;
    if (key === 'Delete' || key === 'Backspace') { deleteSel(); return done(); }
    if (key === ' ') { togglePlay(); return done(); }
    if (key === 'j') { jump(-1); return done(); }
    if (key === 'k') { jump(1); return done(); }
    if (key === 'Home') { setPlaying(false); commit(0); return done(); }
    if (key === 'End') { setPlaying(false); commit(clip.duration); return done(); }
    if (key === 'PageUp' || key === 'PageDown') {
      const d = (key === 'PageDown' ? 1 : -1) * FRAME_MS * (e.shiftKey ? 10 : 1);
      setPlaying(false);
      commit(Math.round(Math.max(0, Math.min(clip.duration, headRef.current + d))));
      return done();
    }
    if (mod && key === 'c') { copySel(); return done(); }
    if (mod && key === 'v') { pasteAtHead(); return done(); }
    if (mod && key === 'a') { setSel(clip.tracks.flatMap((tr) => tr.keyframes.map((k) => ({ prop: tr.prop, t: k.t })))); return done(); }
    if (key === 'F9') { easeSel(mod && e.shiftKey ? 'easeInCubic' : e.shiftKey ? 'easeOutCubic' : 'easeInOutCubic', 'Easy ease'); return done(); }
    if (mod && e.altKey && key === 'h') { easeSel('hold', 'Hold keyframe'); return done(); }
    if (e.altKey && (key === 'ArrowLeft' || key === 'ArrowRight') && sel.length && el) {
      const r = shiftKeyframes(el, clip.id, sel, (key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 100 : 10));
      edit(() => r.el, 'Move keyframes', `kn:${sel.map(keyId).join(',')}`);
      setSel(r.keys);
      return done();
    }
    if (!mod && !e.altKey && key === 'b') { const t = Math.round(headRef.current); setWork((w) => ({ a: t, b: Math.max(t + 50, w?.b ?? clip.duration) })); return done(); }
    if (!mod && !e.altKey && key === 'n') { const t = Math.round(headRef.current); setWork((w) => ({ a: Math.min(w?.a ?? 0, t - 50 < 0 ? 0 : t - 50), b: t })); return done(); }
    if (!mod && !e.altKey && PROP_KEYS[key]) { addKeysAtPlayhead(PROP_KEYS[key]); return done(); }
  };

  // ── ruler / scrub ───────────────────────────────────────────────────────
  const timeAt = (clientX: number) => {
    const r = trackAreaRef.current?.getBoundingClientRect();
    if (!r || !clip) return 0;
    return Math.max(0, Math.min(clip.duration, (clientX - r.left + (trackAreaRef.current?.scrollLeft || 0)) / zoom));
  };
  const scrub = (e: React.PointerEvent) => {
    if (!clip) return;
    setPlaying(false);
    paint(Math.round(timeAt(e.clientX)));
    const move = (ev: PointerEvent) => paint(Math.round(timeAt(ev.clientX)));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', move); commit(Math.round(headRef.current)); }, { once: true });
  };

  // ── keyframe drag (moves the whole selection) ───────────────────────────
  const dragKey = (e: React.PointerEvent, prop: TimelineProp, t0: number) => {
    e.stopPropagation();
    const me: KeyRef = { prop, t: t0 };
    const already = sel.some((k) => keyId(k) === keyId(me));
    if (e.shiftKey) { setSel(already ? sel.filter((k) => keyId(k) !== keyId(me)) : [...sel, me]); return; }
    let moving = already ? sel : [me];
    if (!already) setSel(moving);
    if (!clip || !el || props.disabled) return;
    const startX = e.clientX;
    let applied = 0;
    let frame = 0;
    let lastX = startX;
    let current = el;
    const key = `kf:${el.id}:${clip.id}:${Date.now()}`;
    const apply = (alt: boolean) => {
      frame = 0;
      let delta = (lastX - startX) / zoom;
      if (!alt) delta = Math.round(delta / 50) * 50; // snap to 50 ms; hold Alt for free movement
      const step = Math.round(delta) - applied;
      if (!step) return;
      const r = shiftKeyframes(current, clip.id, moving, step);
      if (r.el === current) return;
      const moved = r.keys[0].t - moving[0].t;
      const next = r.el;
      exec(editElements(doc, [el.id], () => next, 'Move keyframe', key));
      current = next;
      moving = r.keys;
      applied += moved;
      setSel(moving);
    };
    let altKey = false;
    // at most one document change per animation frame, however fast the pointer moves
    const move = (ev: PointerEvent) => { lastX = ev.clientX; altKey = ev.altKey; if (!frame) frame = requestAnimationFrame(() => apply(altKey)); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      if (frame) { cancelAnimationFrame(frame); apply(altKey); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  // ── box select on the empty track area ──────────────────────────────────
  const startBox = (e: React.PointerEvent) => {
    if (!clip || (e.target as HTMLElement).closest('[data-keyframe], [data-testid="timeline-ruler"]')) return;
    const area = trackAreaRef.current;
    if (!area) return;
    const r = area.getBoundingClientRect();
    const x0 = e.clientX - r.left + area.scrollLeft;
    const y0 = e.clientY - r.top + area.scrollTop;
    const additive = e.shiftKey;
    let cur = { x: x0, y: y0, w: 0, h: 0 };
    const move = (ev: PointerEvent) => {
      const x1 = ev.clientX - r.left + area.scrollLeft;
      const y1 = ev.clientY - r.top + area.scrollTop;
      cur = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      setBox(cur);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      setBox(null);
      if (cur.w < 3 && cur.h < 3) { if (!additive) setSel([]); return; }
      const hit: KeyRef[] = [];
      clip.tracks.forEach((tr, i) => {
        const rowTop = 24 + i * 28;
        if (rowTop + 28 < cur.y || rowTop > cur.y + cur.h) return;
        for (const k of tr.keyframes) if (k.t * zoom >= cur.x - 6 && k.t * zoom <= cur.x + cur.w + 6) hit.push({ prop: tr.prop, t: k.t });
      });
      setSel(additive ? [...sel.filter((s) => !hit.some((h) => keyId(h) === keyId(s))), ...hit] : hit);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  // ── dope sheet: every animated layer ────────────────────────────────────
  const animated = useMemo(() => {
    if (!allLayers) return [];
    const out: Array<{ el: LayoutElement; depth: number }> = [];
    const walk = (list: LayoutElement[], depth: number) => {
      for (const x of [...list].reverse()) {
        if (clipsOf(x).length) out.push({ el: x, depth });
        if (x.children) walk(x.children, depth + 1);
      }
    };
    walk(doc.elements, 0);
    return out;
  }, [allLayers, doc.elements]);

  if (allLayers) {
    const longest = Math.max(2000, ...animated.flatMap(({ el: x }) => clipsOf(x).map((c) => clipDelay(c) + c.duration / (c.speed || 1))));
    return (
      <div className="flex h-full min-h-0 flex-col text-[11px] text-slate-300 outline-none" tabIndex={-1} onKeyDown={onKeyDown} data-testid="timeline-panel">
        <div className="flex items-center gap-2 border-b border-white/10 px-2 py-1.5">
          <span className="font-semibold text-slate-100">All animated layers</span>
          <span className="text-slate-500">{animated.length} layer{animated.length === 1 ? '' : 's'} · click a bar to open that animation</span>
          <div className="ml-auto flex items-center gap-2">
            {Object.keys(TRIGGER_LABEL).map((k) => <span key={k} className="flex items-center gap-1 text-[10px] text-slate-400"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: TRIGGER_COLOR[k] }} />{TRIGGER_LABEL[k]}</span>)}
            <Btn small active onClick={() => setAllLayers(false)} title="Back to the selected layer (U)">This layer</Btn>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto" data-testid="dope-sheet">
          {animated.length === 0 && <div className="p-4 text-slate-500">No layer is animated yet.</div>}
          {animated.map(({ el: x, depth }) => (
            <div key={x.id} className={cx('flex border-b border-white/5', x.id === selectedId && 'bg-amber-400/5')} data-layer={x.id}>
              <button type="button" className="w-44 shrink-0 truncate border-r border-white/10 px-2 py-1 text-left hover:text-amber-200" style={{ paddingLeft: 8 + depth * 10 }} onClick={() => props.onSelectLayer?.(x.id)}>{x.name || x.type}</button>
              <div className="relative min-w-0 flex-1">
                {clipsOf(x).map((c, i) => {
                  const w = c.duration / (c.speed || 1);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      title={`${c.name || c.id} · ${TRIGGER_LABEL[c.trigger.type]} · ${fmt(w)}${c.delay ? ` after ${fmt(c.delay)}` : ''}`}
                      onClick={() => { props.onSelectLayer?.(x.id); setUi({ clipId: c.id, playhead: 0 }); setAllLayers(false); }}
                      className="absolute h-4 truncate rounded-sm px-1 text-left text-[9px] leading-4 text-black/80"
                      style={{ top: 3 + i * 18, left: `${(clipDelay(c) / longest) * 100}%`, width: `${Math.max(4, (w / longest) * 100)}%`, background: TRIGGER_COLOR[c.trigger.type], opacity: c.loop === true ? 0.75 : 1 }}
                    >
                      {c.name || c.id}{c.loop === true ? ' ↻' : ''}
                    </button>
                  );
                })}
                <div style={{ height: 6 + clipsOf(x).length * 18 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!el) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[11px] text-slate-500" tabIndex={-1} onKeyDown={onKeyDown} data-testid="timeline-panel">
        <span>Select a layer to animate it. Clips can play on enter, on exit, on a live event (kill, recall, elimination…), when data becomes true, or loop.</span>
        <Btn small onClick={() => setAllLayers(true)} title="See every animated layer (U)">All layers</Btn>
      </div>
    );
  }

  const width = Math.max(400, (clip?.duration ?? 1000) * zoom + 40);
  const one = sel.length === 1 ? sel[0] : null;
  const selTrack = clip && one ? clip.tracks.find((tr) => tr.prop === one.prop) : null;
  const selFrame = one ? selTrack?.keyframes.find((k) => k.t === one.t) ?? null : null;
  const firstEase = clip && sel.length ? clip.tracks.find((tr) => tr.prop === sel[0].prop)?.keyframes.find((k) => k.t === sel[0].t)?.ease : undefined;
  const usedProps = new Set(clip?.tracks.map((tr) => tr.prop) ?? []);
  const ticks: number[] = [];
  const tickStep = zoom > 0.4 ? 100 : zoom > 0.15 ? 250 : zoom > 0.06 ? 500 : 1000;
  for (let t = 0; clip && t <= clip.duration; t += tickStep) ticks.push(t);
  const loopValue = !clip ? 'once' : clip.loop === true ? (clip.direction === 'alternate' ? 'pingpong' : 'loop') : typeof clip.loop === 'number' ? String(clip.loop) : 'once';
  const upd = (fn: (c: TimelineClip) => TimelineClip, label: string, key?: string) => clip && edit((x) => updateClip(x, clip.id, fn), label, key);
  const isSel = (prop: TimelineProp, t: number) => sel.some((k) => k.prop === prop && k.t === t);

  return (
    <div className="relative flex h-full min-h-0 flex-col text-[11px] text-slate-300 outline-none" tabIndex={-1} onKeyDown={onKeyDown} data-testid="timeline-panel">
      {/* header */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-2 py-1.5">
        <span className="font-semibold text-slate-100">{el.name || el.type}</span>
        {clips.length > 0 && (
          <div className="w-40"><Select value={clip?.id} options={clips.map((c) => ({ value: c.id, label: c.name || c.id }))} onChange={(v) => v && setUi({ clipId: v, playhead: 0 })} /></div>
        )}
        <div className="w-44">
          <Select<string>
            value={undefined}
            allowEmpty="+ New clip…"
            options={[...CLIP_PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(el.anim?.enter || el.anim?.onEvent ? [{ value: 'convert', label: 'Convert current animation' }] : [])]}
            onChange={(v) => {
              if (!v || props.disabled) return;
              const id = newClipId(el);
              const c = v === 'convert' ? animToClip(el, id) : presetClip(v as ClipPreset, el, id);
              if (!c) return;
              edit((x) => addClip(x, c), 'Add clip');
              setUi({ clipId: id, playhead: 0 });
            }}
          />
        </div>
        {clip && (
          <>
            <input
              className="w-28 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[11px] text-slate-100 outline-none"
              value={clip.name || ''}
              placeholder="clip name"
              disabled={props.disabled}
              onChange={(e) => upd((c) => ({ ...c, name: e.target.value.slice(0, 120) }), 'Rename clip', `clipname:${clip.id}`)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <span className="text-slate-500">play</span>
            <div className="w-28">
              <Select
                value={clip.trigger.type}
                options={[{ value: 'enter', label: 'on enter' }, { value: 'exit', label: 'on exit' }, { value: 'event', label: 'on live event' }, { value: 'condition', label: 'when data true' }, { value: 'loop', label: 'loop' }]}
                onChange={(v) => v && upd((c) => ({
                  ...c,
                  trigger: v === 'event' ? { type: 'event', event: c.trigger.event || 'kill' } : v === 'condition' ? { type: 'condition', when: c.trigger.when || { path: 'live.aliveTeamsCount', op: 'lessOrEqual', value: 4 } } : { type: v as 'enter' | 'loop' | 'exit' },
                  loop: v === 'loop' ? true : v === 'exit' ? undefined : c.loop,
                }), 'Clip trigger')}
              />
            </div>
            {clip.trigger.type === 'event' && (
              <div className="w-44">
                <Select<AnimationEvent> value={clip.trigger.event} options={(ANIMATION_EVENTS as AnimationEvent[]).map((ev) => ({ value: ev, label: EVENT_LABELS[ev] }))}
                  onChange={(v) => v && upd((c) => ({ ...c, trigger: { ...c.trigger, event: v } }), 'Clip event')} />
              </div>
            )}
            {clip.trigger.type === 'exit' && (
              <label className="flex items-center gap-1 text-slate-500" title="Leave by itself this many seconds after it appeared. Empty = when its condition hides it.">
                after
                <div className="w-16"><NumberInput value={clip.trigger.after != null ? clip.trigger.after / 1000 : undefined} min={0} max={600} step={0.5}
                  onChange={(v) => upd((c) => { const trigger = { ...c.trigger }; if (v == null) delete trigger.after; else trigger.after = Math.round(Math.max(0, Math.min(600, v)) * 1000); return { ...c, trigger }; }, 'Exit timing', `exitafter:${clip.id}`)} /></div>
                s
              </label>
            )}
            <span className="text-slate-500">dur</span>
            <div className="w-20"><NumberInput value={clip.duration} min={1} max={60000} step={100} onChange={(v) => v && upd((c) => ({ ...c, duration: Math.max(1, Math.min(60000, v)) }), 'Clip duration', `clipdur:${clip.id}`)} /></div>
            <div className="w-28">
              <Select value={loopValue}
                options={[{ value: 'once', label: 'play once' }, { value: '1', label: 'repeat ×1' }, { value: '2', label: 'repeat ×2' }, { value: 'loop', label: 'loop forever' }, { value: 'pingpong', label: 'ping-pong forever' }]}
                onChange={(v) => upd((c) => {
                  const n = { ...c };
                  delete n.direction;
                  if (v === 'loop') n.loop = true;
                  else if (v === 'pingpong') { n.loop = true; n.direction = 'alternate'; }
                  else if (v === 'once') delete n.loop;
                  else n.loop = Number(v);
                  return n;
                }, 'Clip loop')} />
            </div>
            {clip.trigger.type !== 'loop' && clip.trigger.type !== 'enter' && clip.trigger.type !== 'exit' && (
              <div className="w-32">
                <Select value={clip.retrigger || 'restart'} options={[{ value: 'restart', label: 'again: restart' }, { value: 'queue', label: 'again: queue' }, { value: 'ignore', label: 'again: ignore' }]}
                  onChange={(v) => v && upd((c) => ({ ...c, retrigger: v as TimelineClip['retrigger'] }), 'Clip retrigger')} />
              </div>
            )}
            <div className="ml-auto flex items-center gap-1">
              <Btn small onClick={togglePlay} title="Play / pause (Space)">{playing ? '❚❚' : '▶'}</Btn>
              <Btn small onClick={() => { setPlaying(false); commit(work ? work.a : 0); }} title="Back to start (Home)">■</Btn>
              <span ref={readRef} className="w-14 text-right font-mono text-amber-200" data-testid="playhead">{fmt(ui.playhead)}</span>
              <Btn small active={ui.recording} danger={ui.recording} onClick={() => setUi({ recording: !ui.recording })} title="Record: moving / resizing / rotating on the canvas writes keyframes at the playhead">● rec</Btn>
              {clip.trigger.type === 'event' && props.sim && SIM_FIRE[clip.trigger.event!] && (
                <Btn small onClick={() => SIM_FIRE[clip.trigger.event!]!(props.sim!)} title="Fire this event in SIMULATION (turn Timeline preview off to see it play live)">test ⚡</Btn>
              )}
              <Btn small onClick={() => setAllLayers(true)} title="See every animated layer (U)">All layers</Btn>
              <Btn small onClick={() => setZoom((z) => Math.max(0.02, z / 1.5))} title="Zoom out">−</Btn>
              <Btn small onClick={() => setZoom((z) => Math.min(2, z * 1.5))} title="Zoom in">+</Btn>
              <Btn small danger disabled={props.disabled} onClick={() => { edit((x) => removeClip(x, clip.id), 'Delete clip'); setUi({ clipId: null }); }} title="Delete clip">✕</Btn>
            </div>
          </>
        )}
      </div>

      {/* timing: delay · speed · stagger · reverse */}
      {clip && (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-2 py-1 text-slate-500" data-testid="clip-timing">
          <label className="flex items-center gap-1" title="Wait before starting">delay
            <div className="w-16"><NumberInput value={clip.delay ?? 0} min={0} max={60000} step={50} onChange={(v) => upd((c) => { const n = { ...c }; if (!v) delete n.delay; else n.delay = Math.max(0, Math.min(60000, v)); return n; }, 'Clip delay', `clipdelay:${clip.id}`)} /></div>ms
          </label>
          <label className="flex items-center gap-1" title="Time-stretch: 200 % plays twice as fast">speed
            <div className="w-16"><NumberInput value={Math.round((clip.speed ?? 1) * 100)} min={10} max={1000} step={10} onChange={(v) => upd((c) => { const n = { ...c }; if (!v || v === 100) delete n.speed; else n.speed = Math.max(0.1, Math.min(10, v / 100)); return n; }, 'Clip speed', `clipspeed:${clip.id}`)} /></div>%
          </label>
          <label className="flex items-center gap-1" title="Inside a list: each row starts this much after the row before it">stagger
            <div className="w-16"><NumberInput value={clip.stagger ?? 0} min={0} max={5000} step={10} onChange={(v) => upd((c) => { const n = { ...c }; if (!v) delete n.stagger; else n.stagger = Math.max(0, Math.min(5000, v)); return n; }, 'Clip stagger', `clipstagger:${clip.id}`)} /></div>ms / row
          </label>
          <Btn small disabled={props.disabled} onClick={() => edit((x) => reverseClip(x, clip.id), 'Reverse keyframes')} title="Time-reverse every keyframe of this clip">⇄ Reverse</Btn>
          {work && <Btn small onClick={() => setWork(null)} title="Play the whole clip again">Clear work area ({fmt(work.a)}–{fmt(work.b)})</Btn>}
          <span className="ml-auto text-[10px] text-slate-600">Space play · J/K keyframes · P S R T A add · F9 easy ease · Ctrl+C/V · U all layers</span>
        </div>
      )}

      {clip && (clip.trigger.type === 'condition' || (clip.trigger.type === 'event')) && (
        <div className="flex items-center gap-2 border-b border-white/5 px-2 py-1">
          <span className="text-slate-500">{clip.trigger.type === 'condition' ? 'Play when' : 'Only if (optional)'}</span>
          <div className="min-w-0 flex-1">
            <ConditionEditor
              cond={clip.trigger.type === 'condition' ? clip.trigger.when : clip.trigger.filter}
              scope={props.scope}
              disabled={props.disabled}
              onChange={(c) => upd((cl) => ({ ...cl, trigger: clip.trigger.type === 'condition' ? { ...cl.trigger, when: c } : { ...cl.trigger, filter: c } }), 'Clip condition')}
            />
          </div>
        </div>
      )}

      {!clip ? (
        <div className="flex flex-1 items-center justify-center text-slate-500">No clips on this layer yet — pick “+ New clip…”.</div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* track names */}
          <div className="w-48 shrink-0 border-r border-white/10">
            <div className="flex h-6 items-center border-b border-white/5 px-2">
              <Select<TimelineProp>
                value={undefined}
                allowEmpty="+ Add property…"
                options={(TIMELINE_PROPS as TimelineProp[]).filter((p) => !usedProps.has(p)).map((p) => ({ value: p, label: PROP_LABEL[p] }))}
                onChange={(p) => { if (p) { addKeyAt(p, Math.round(headRef.current)); setSel([{ prop: p, t: Math.round(headRef.current) }]); } }}
              />
            </div>
            {clip.tracks.map((tr) => (
              <div key={tr.prop} className="group flex h-7 items-center gap-1 border-b border-white/5 px-2">
                <span className="flex-1 truncate">{PROP_LABEL[tr.prop]}</span>
                {!COLOR_PROPS.has(tr.prop) && (
                  <button type="button" title="Wiggle: add smooth random movement to this property" className={cx('hover:text-sky-200', tr.wiggle ? 'text-sky-300' : 'text-slate-600')} onClick={() => setWiggleFor(wiggleFor === tr.prop ? null : tr.prop)}>〰</button>
                )}
                <button type="button" title="Keyframe at playhead" className="text-amber-300 hover:text-amber-100" onClick={() => { addKeyAt(tr.prop, Math.round(headRef.current)); setSel([{ prop: tr.prop, t: Math.round(headRef.current) }]); }}>◆+</button>
                <button type="button" title="Remove track" className="text-slate-500 opacity-0 hover:text-red-300 group-hover:opacity-100" onClick={() => edit((x) => removeTrack(x, clip.id, tr.prop), 'Remove track')}>✕</button>
              </div>
            ))}
          </div>
          {/* ruler + keys */}
          <div ref={trackAreaRef} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-auto" onPointerDown={startBox}>
            <div className="relative" style={{ width, minHeight: '100%' }}>
              <div className="sticky top-0 z-10 h-6 cursor-ew-resize border-b border-white/5 bg-neutral-900" onPointerDown={scrub} data-testid="timeline-ruler">
                {ticks.map((t) => (
                  <div key={t} className="absolute top-0 h-full border-l border-white/10 pl-0.5 text-[9px] text-slate-500" style={{ left: t * zoom }}>{fmt(t)}</div>
                ))}
                {work && <div className="absolute top-0 h-full bg-sky-400/20" style={{ left: work.a * zoom, width: (work.b - work.a) * zoom }} title="Work area" />}
                <div className="absolute top-0 h-full w-px bg-white/30" style={{ left: clip.duration * zoom }} title="clip end" />
              </div>
              {clip.tracks.map((tr) => {
                const kfs = [...tr.keyframes].sort((a, b) => a.t - b.t);
                return (
                  <div key={tr.prop} className="relative h-7 border-b border-white/5"
                    onDoubleClick={(e) => { const t = Math.round(timeAt(e.clientX) / 10) * 10; commit(t); addKeyAt(tr.prop, t); setSel([{ prop: tr.prop, t }]); }}>
                    {kfs.slice(1).map((k, i) => (
                      <div key={`seg${k.t}`} className={cx('absolute top-3 h-px', kfs[i].ease === 'hold' ? 'bg-slate-500/50' : 'bg-amber-300/40')} style={{ left: kfs[i].t * zoom, width: (k.t - kfs[i].t) * zoom }} />
                    ))}
                    {kfs.map((k) => (
                      <div
                        key={k.t}
                        role="button"
                        title={`${fmt(k.t)} = ${typeof k.value === 'object' ? `⟨${(k.value as any).bind.path}⟩` : k.value}`}
                        data-keyframe={`${tr.prop}@${k.t}`}
                        data-selected={isSel(tr.prop, k.t) || undefined}
                        onPointerDown={(e) => dragKey(e, tr.prop, k.t)}
                        className={cx('absolute top-1.5 h-3 w-3 -ml-1.5 cursor-grab border',
                          k.ease === 'hold' ? '' : 'rotate-45',
                          isSel(tr.prop, k.t) ? 'border-white bg-amber-300' : typeof k.value === 'object' ? 'border-sky-300 bg-sky-500/70' : 'border-amber-200 bg-amber-500/80')}
                        style={{ left: k.t * zoom }}
                      />
                    ))}
                  </div>
                );
              })}
              {box && <div className="pointer-events-none absolute border border-sky-300 bg-sky-300/10" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
              <div ref={lineRef} className="pointer-events-none absolute top-0 bottom-0 w-px bg-fuchsia-400" style={{ left: ui.playhead * zoom }} />
            </div>
          </div>
        </div>
      )}

      {/* wiggle of one track */}
      {clip && wiggleFor && clip.tracks.some((tr) => tr.prop === wiggleFor) && (() => {
        const tr = clip.tracks.find((x) => x.prop === wiggleFor)!;
        const w = tr.wiggle || { freq: 2, amp: 10 };
        const set = (patch: Partial<{ freq: number; amp: number }>) => edit((x) => setTrackWiggle(x, clip.id, wiggleFor, { ...w, ...patch }), 'Wiggle', `wig:${wiggleFor}`);
        return (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-2 py-1.5" data-testid="wiggle-bar">
            <span className="text-slate-500">Wiggle {PROP_LABEL[wiggleFor]}</span>
            <label className="flex items-center gap-1 text-slate-500">times a second <div className="w-16"><NumberInput value={w.freq} min={0.05} max={30} step={0.5} onChange={(v) => v && set({ freq: Math.max(0.05, Math.min(30, v)) })} /></div></label>
            <label className="flex items-center gap-1 text-slate-500">by up to <div className="w-16"><NumberInput value={w.amp} min={0} max={10000} step={1} onChange={(v) => v != null && set({ amp: Math.max(0, Math.min(10000, v)) })} /></div></label>
            {!tr.wiggle && <Btn small active onClick={() => set({})}>Turn on</Btn>}
            {tr.wiggle && <Btn small danger onClick={() => { edit((x) => setTrackWiggle(x, clip.id, wiggleFor, null), 'Remove wiggle'); setWiggleFor(null); }}>Remove</Btn>}
          </div>
        );
      })()}

      {/* selected keyframe(s) */}
      {clip && sel.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-2 py-1.5" data-testid="keyframe-bar">
          {one && selFrame ? (
            <>
              <span className="text-slate-500">{PROP_LABEL[one.prop]} @ {fmt(one.t)}</span>
              {typeof selFrame.value === 'object' ? (
                <span className="rounded border border-sky-400/30 bg-sky-400/10 px-1.5 font-mono text-[10px] text-sky-200">⟨{(selFrame.value as any).bind.path}⟩</span>
              ) : COLOR_PROPS.has(one.prop) ? (
                <div className="w-40"><ColorInput value={String(selFrame.value)} onChange={(v) => v && edit((x) => setKeyframe(x, clip.id, one.prop, one.t, { value: v }), 'Keyframe value', `kv:${one.prop}:${one.t}`)} /></div>
              ) : (
                <div className="w-24"><NumberInput value={Number(selFrame.value)} step={one.prop === 'opacity' || one.prop.startsWith('scale') || one.prop.startsWith('wipe') ? 0.05 : 1}
                  onChange={(v) => v != null && edit((x) => setKeyframe(x, clip.id, one.prop, one.t, { value: v }), 'Keyframe value', `kv:${one.prop}:${one.t}`)} /></div>
              )}
              <PickerButton scope={props.scope} value={typeof selFrame.value === 'object' ? (selFrame.value as any).bind.path : undefined}
                label={typeof selFrame.value === 'object' ? 'Rebind' : 'Bind to data'}
                onPick={(p) => isSafePath(p) && edit((x) => setKeyframe(x, clip.id, one.prop, one.t, { value: { bind: { path: p } } }), 'Bind keyframe')} />
              {typeof selFrame.value === 'object' && (
                <Btn small onClick={() => edit((x) => setKeyframe(x, clip.id, one.prop, one.t, { value: baseValue(el, one.prop) }), 'Unbind keyframe')}>Unbind</Btn>
              )}
            </>
          ) : (
            <span className="text-slate-500">{sel.length} keyframes selected</span>
          )}
          <span className="text-slate-500">ease</span>
          <EaseEditor ease={firstEase} onChange={(ease) => easeSel(ease)} />
          <Btn small onClick={() => easeSel('easeInOutCubic', 'Easy ease')} title="Easy Ease (F9)">Easy ease</Btn>
          <Btn small onClick={() => easeSel('hold', 'Hold keyframe')} title="Hold: no movement until the next keyframe (Ctrl+Alt+H)">Hold</Btn>
          <Btn small active={graphOpen} onClick={() => setGraphOpen(!graphOpen)} title="Shape the ease as a curve">Curve</Btn>
          <Btn small onClick={copySel} title="Copy (Ctrl+C); paste at the playhead with Ctrl+V">Copy</Btn>
          <Btn small disabled={!keyClipboard.length || props.disabled} onClick={pasteAtHead} title="Paste at the playhead (Ctrl+V)">Paste</Btn>
          <Btn small danger onClick={deleteSel}>Delete</Btn>
          {graphOpen && (
            <div className="absolute bottom-10 right-4 z-30 rounded border border-white/10 bg-neutral-900 p-2 shadow-2xl">
              <GraphEditor ease={firstEase} disabled={props.disabled} onChange={(ease) => easeSel(ease)} />
              <div className="mt-1 text-center text-[10px] text-slate-500">drag the blue handles</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function EaseEditor({ ease, onChange }: { ease: KeyframeEase | undefined; onChange(e: KeyframeEase | null): void }) {
  const custom = Array.isArray(ease);
  const pts = useMemo(() => (Array.isArray(ease) ? ease : [0.25, 0.1, 0.25, 1]), [ease]);
  return (
    <div className="flex items-center gap-1">
      <div className="w-32">
        <Select<string> value={custom ? 'custom' : ease || 'linear'} options={[...(EASINGS as string[]), 'custom']}
          onChange={(v) => { if (!v) return; if (v === 'custom') onChange(pts as [number, number, number, number]); else onChange(v === 'linear' ? null : (v as KeyframeEase)); }} />
      </div>
      {custom && pts.map((n, i) => (
        <div key={i} className="w-14"><NumberInput value={n} step={0.05} min={i % 2 === 0 ? 0 : -2} max={i % 2 === 0 ? 1 : 3}
          onChange={(v) => { if (v == null) return; const next = [...pts] as [number, number, number, number]; next[i] = v; onChange(next); }} /></div>
      ))}
    </div>
  );
}
