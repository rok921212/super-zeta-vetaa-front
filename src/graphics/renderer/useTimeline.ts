// Plays an element's timeline clips at runtime.
//
// Triggers: `enter` (on mount), `event` (a live engine event — kill, recall,
// elimination… — optionally filtered; the event is in scope for bound
// keyframes AND the element's own bindings), `condition` (a data condition
// turning true), `loop` (runs whenever nothing else plays), `exit` (the layer
// is leaving — started by the renderer, which removes the layer when it ends).
//
// One clip plays at a time per element. A new trigger follows the NEW clip's
// `retrigger`: restart (default) replaces, ignore drops it while busy, queue
// plays it after. Finished clips hold their last frame; an event clip rests on
// its first frame until it fires (so "hidden until a kill" is just opacity 0
// at t=0).
//
// Two trigger options make clips usable as per-row STATE in a repeater:
//   self   — an event clip only reacts to events about this row's own team /
//            player (a kill pops the killer's row, not all sixteen);
//   revert — a condition clip is a state: it plays when the condition turns
//            true and runs back to its first frame when it turns false
//            ("knocked" tints the row, a revive un-tints it).
//
// Clip timing: `delay`, `speed`, ping-pong `direction`, and `stagger` (each
// row of a list starts that much later than the row before it).
//
// Frames are written straight to the wrapper's style through a ref inside a
// requestAnimationFrame loop that only runs while a clip plays — no React
// render per frame, no document changes. Editor scrubbing goes through a
// PreviewStore the previewed layer subscribes to: a scrub or a preview
// playback writes ONE DOM node and renders nothing.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LayoutElement, TimelineClip } from '../schema/layoutTypes.ts';
import { evaluateCondition, type BindingScope } from '../bindings/index.ts';
import type { EngineEvent } from '../../overlayClient/engineTypes.ts';
import { clipTime, frameStyle, sampleClip, type FrameBase, type FrameValues } from './timeline.ts';

export interface TimelinePreview {
  elementId: string;
  clipId: string;
  /** ms into the clip. */
  t: number;
}

/** The frame the editor wants shown (scrubbing / preview playback), outside React state. */
export interface PreviewStore {
  get(): TimelinePreview | null;
  set(p: TimelinePreview | null): void;
  subscribe(listener: () => void): () => void;
}

export function createPreviewStore(initial: TimelinePreview | null = null): PreviewStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(p) {
      if (p === value || (p && value && p.elementId === value.elementId && p.clipId === value.clipId && p.t === value.t)) return;
      value = p;
      listeners.forEach((l) => l());
    },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

export interface TimelineCtx {
  events?: { on(type: any, l: (e: EngineEvent) => void): () => void } | null;
  mode: 'runtime' | 'editor';
  /** Editor: play clips live (default true). */
  playTimelines?: boolean;
  previewStore?: PreviewStore | null;
  sampleEvent?: EngineEvent | null;
}

/** The renderer's side of a layer's in → stay → out lifecycle. */
export interface TimelineLife {
  /** The layer is leaving: play its exit clip now. */
  exiting: boolean;
  /** The exit clip finished (or there was nothing to play): remove the layer. */
  onExited(): void;
}

interface Active { clip: TimelineClip; start: number; event: EngineEvent | null; /** Reverting: play backwards from this local time. */ reverseFrom?: number }

/** A revert never takes longer than this, however long the clip is. */
const REVERT_MAX_MS = 400;

const idsOf = (...vals: unknown[]): string[] => vals.filter((v) => v != null && v !== '').map(String);

/**
 * Is this event about the repeater row `item`? A row with players (or without
 * a player identity) is a team row and matches on team id; otherwise it is a
 * player row and matches on player id. No row in scope = every event matches.
 */
export function eventMatchesItem(ev: EngineEvent, item: any): boolean {
  if (item == null || typeof item !== 'object') return true;
  const p = ev.payload || {};
  const isPlayerRow = !Array.isArray(item.players) && (item.uId != null || item.playerName != null);
  if (isPlayerRow) {
    const mine = idsOf(item.uId, item._id, item.playerName);
    const theirs = idsOf(ev.playerId, p.playerId, p.id, p.player?.uId, p.player?._id, p.player?.playerName, p.playerName);
    return theirs.some((id) => mine.includes(id));
  }
  const mine = idsOf(item.teamId, item._id);
  const theirs = idsOf(ev.teamId, p.teamId, p.team?.teamId, p.team?._id);
  return theirs.some((id) => mine.includes(id));
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function applyFrame(node: HTMLElement | null, base: FrameBase, values: FrameValues | null) {
  if (!node) return;
  const f = frameStyle(base, values || {});
  node.style.left = `${f.left}px`;
  node.style.top = `${f.top}px`;
  node.style.width = `${f.width}px`;
  node.style.height = `${f.height}px`;
  node.style.opacity = String(f.opacity);
  node.style.transform = f.transform || '';
  node.style.filter = f.filter || '';
  node.style.transformOrigin = f.origin || 'center center';
  node.style.clipPath = f.clip || '';
  node.style.letterSpacing = f.letterSpacing != null ? `${f.letterSpacing}px` : '';
  for (const k of ['--tl-fill', '--tl-color', '--tl-stroke']) {
    if (f.vars[k]) node.style.setProperty(k, f.vars[k]); else node.style.removeProperty(k);
  }
}

export function useTimeline(
  el: LayoutElement,
  scope: BindingScope,
  ctx: TimelineCtx,
  nodeRef: React.RefObject<HTMLElement | null>,
  base: FrameBase,
  life?: TimelineLife
): { event: EngineEvent | null } {
  const clips = el.timeline?.clips;
  const has = !!clips && clips.length > 0;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const baseRef = useRef(base);
  baseRef.current = base;
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const sampleEventRef = useRef(ctx.sampleEvent);
  sampleEventRef.current = ctx.sampleEvent;
  const onExitedRef = useRef(life?.onExited);
  onExitedRef.current = life?.onExited;
  const activeRef = useRef<Active | null>(null);
  const queueRef = useRef<Array<{ clip: TimelineClip; event: EngineEvent | null }>>([]);
  const frameRef = useRef<FrameValues | null>(null);
  const rafRef = useRef<number | null>(null);
  /** Local time of the playing clip, and the clip (if any) resting on its last frame. */
  const lastTRef = useRef(0);
  const heldRef = useRef<string | null>(null);
  const [event, setEvent] = useState<EngineEvent | null>(null);

  const editor = ctx.mode === 'editor';
  const store = ctx.previewStore || null;
  const [previewing, setPreviewing] = useState(() => store?.get()?.elementId === el.id);
  const autoplay = has && !previewing && (!editor || ctx.playTimelines !== false);

  const scopeFor = (ev: EngineEvent | null): BindingScope => (ev ? { ...scopeRef.current, event: ev } : scopeRef.current);
  /** Row index inside a list — what `stagger` multiplies. */
  const rowIndex = () => (typeof scopeRef.current.index === 'number' ? scopeRef.current.index : 0);

  const stopLoop = () => {
    if (rafRef.current != null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const tick = useCallback(() => {
    rafRef.current = null;
    const a = activeRef.current;
    if (!a) return;
    let t: number;
    let done: boolean;
    if (a.reverseFrom != null) {
      const speed = Math.max(1, a.reverseFrom / REVERT_MAX_MS);
      t = Math.max(0, a.reverseFrom - (now() - a.start) * speed);
      done = t <= 0;
    } else {
      ({ t, done } = clipTime(a.clip, now() - a.start, rowIndex()));
    }
    lastTRef.current = t;
    frameRef.current = sampleClip(a.clip, t, scopeFor(a.event));
    applyFrame(nodeRef.current, baseRef.current, frameRef.current);
    if (done) {
      heldRef.current = a.reverseFrom != null ? null : a.clip.id;
      activeRef.current = null;
      if (a.clip.trigger.type === 'exit' && a.reverseFrom == null) {
        // The layer has left: the renderer takes it away (nothing restarts on it).
        queueRef.current = [];
        onExitedRef.current?.();
        return;
      }
      const next = queueRef.current.shift();
      const idle = clips?.find((c) => c.trigger.type === 'loop');
      if (next) begin(next.clip, next.event, true);
      else if (idle) begin(idle, null, true);
      else if (editor && a.clip.trigger.type === 'event') {
        // Designing: once an alert has played, show the layer again so it can be selected and edited.
        heldRef.current = null;
        frameRef.current = null;
        applyFrame(nodeRef.current, baseRef.current, null);
      }
      return;
    }
    if (typeof requestAnimationFrame !== 'undefined') rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  const begin = useCallback((clip: TimelineClip, ev: EngineEvent | null, force = false) => {
    const busy = activeRef.current && activeRef.current.clip.trigger.type !== 'loop';
    if (busy && !force) {
      if (activeRef.current!.clip.trigger.type === 'exit') return; // leaving: nothing interrupts the way out
      const mode = clip.retrigger || 'restart';
      if (mode === 'ignore') return;
      if (mode === 'queue') {
        if (queueRef.current.length < 20) queueRef.current.push({ clip, event: ev });
        return;
      }
    }
    activeRef.current = { clip, start: now(), event: ev };
    heldRef.current = null;
    setEvent((prev) => (prev === ev ? prev : ev));
    stopLoop();
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  /** A `revert` condition clip's condition turned false: run it back to its first frame. */
  const release = useCallback((clip: TimelineClip) => {
    queueRef.current = queueRef.current.filter((q) => q.clip.id !== clip.id);
    const a = activeRef.current;
    const playing = !!a && a.clip.id === clip.id && a.reverseFrom == null;
    if (!playing && heldRef.current !== clip.id) return;
    const from = playing ? (clip.loop === true ? 0 : lastTRef.current) : clip.duration;
    activeRef.current = { clip, start: now(), event: null, reverseFrom: from };
    stopLoop();
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // Rest pose + enter / loop start.
  useEffect(() => {
    if (!autoplay || !clips) return;
    const enter = clips.find((c) => c.trigger.type === 'enter');
    const idle = clips.find((c) => c.trigger.type === 'loop');
    const firstEvent = clips.find((c) => c.trigger.type === 'event' || c.trigger.type === 'condition');
    if (enter) begin(enter, null, true);
    else if (idle) begin(idle, null, true);
    else if (firstEvent && !editor) {
      // Rest on the first frame until the trigger fires ("hidden until a kill").
      frameRef.current = sampleClip(firstEvent, 0, scopeFor(ctx.sampleEvent ?? null));
      applyFrame(nodeRef.current, baseRef.current, frameRef.current);
    }
    return () => {
      stopLoop();
      activeRef.current = null;
      heldRef.current = null;
      queueRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, clips]);

  // Live-event triggers.
  useEffect(() => {
    if (!autoplay || !clips || !ctx.events) return;
    const subs = clips
      .filter((c) => c.trigger.type === 'event' && c.trigger.event)
      .map((c) => ctx.events!.on(c.trigger.event!, (ev) => {
        if (c.trigger.self && !eventMatchesItem(ev, scopeRef.current.item)) return;
        if (c.trigger.filter && !evaluateCondition(c.trigger.filter, { ...scopeRef.current, event: ev })) return;
        begin(c, ev);
      }));
    return () => subs.forEach((u) => u());
  }, [autoplay, clips, ctx.events, begin]);

  // Data-condition triggers: fire on a false -> true edge.
  const edgesRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!autoplay || !clips) return;
    for (const c of clips) {
      if (c.trigger.type !== 'condition' || !c.trigger.when) continue;
      const nowTrue = evaluateCondition(c.trigger.when, scope);
      const was = edgesRef.current[c.id];
      edgesRef.current[c.id] = nowTrue;
      if (nowTrue && was === false) begin(c, null);
      if (nowTrue && was === undefined && !editor) begin(c, null); // already true when the page loads
      if (!nowTrue && was === true && c.trigger.revert) release(c);
    }
  }, [autoplay, clips, scope, begin, release, editor]);

  // Leaving: the renderer says go — play the exit clip, then report back.
  const exiting = !!life?.exiting;
  useEffect(() => {
    if (!exiting) return;
    const exit = clipsRef.current?.find((c) => c.trigger.type === 'exit');
    if (!exit) { onExitedRef.current?.(); return; }
    queueRef.current = [];
    begin(exit, null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting]);

  // Editor scrubbing / preview playback: an exact frame, written without a React render.
  const applyPreview = useCallback(() => {
    const p = store?.get() ?? null;
    const mine = !!p && p.elementId === el.id;
    setPreviewing((prev) => (prev === mine ? prev : mine));
    if (!mine) return;
    const clip = clipsRef.current?.find((c) => c.id === p!.clipId);
    if (!clip) return;
    const ev = clip.trigger.type === 'event' ? sampleEventRef.current ?? null : null;
    frameRef.current = sampleClip(clip, p!.t, scopeFor(ev));
    applyFrame(nodeRef.current, baseRef.current, frameRef.current);
    setEvent((prev) => (prev === ev ? prev : ev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, el.id]);
  useLayoutEffect(() => {
    if (!store) return;
    applyPreview();
    return store.subscribe(applyPreview);
  }, [store, applyPreview]);

  // Leaving preview / removing the timeline: back to the base geometry.
  useEffect(() => {
    if (previewing || has) return;
    frameRef.current = null;
    applyFrame(nodeRef.current, baseRef.current, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing, has]);
  useEffect(() => {
    if (!previewing && !autoplay) {
      frameRef.current = null;
      setEvent(null);
      applyFrame(nodeRef.current, baseRef.current, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing, autoplay]);

  // React re-applies its own style on re-render: re-assert the current frame
  // (re-sampled while previewing, so an edited keyframe shows at once).
  useLayoutEffect(() => {
    if (previewing) applyPreview();
    else if (frameRef.current) applyFrame(nodeRef.current, baseRef.current, frameRef.current);
  });

  return { event };
}
