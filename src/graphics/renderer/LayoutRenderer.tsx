// THE layout renderer — used unchanged by the Designer canvas and the
// published OBS runtime (/o/:publicId): what you see in the Designer is what
// OBS gets. `mode="editor"` only adds hit-testing hooks (data attributes +
// pointer handler); it never changes what is drawn.
//
// Data comes from the ONE overlay engine's state (or the Designer's
// simulation, which exposes the same shape); bindings resolve through
// graphics/bindings (whitelisted data paths, no code).

import React, { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LayoutDocument, LayoutElement, TimelineClip } from '../schema/layoutTypes.ts';
import {
  buildScope,
  evaluateCondition,
  isElementVisible,
  itemScope,
  resolveBoundProps,
  resolveElementStyle,
  resolveRepeaterItems,
  feedReducer,
  EMPTY_FEED,
  type BindingScope,
  type DataState,
  type FeedState,
} from '../bindings/index.ts';
import type { EngineEvent, EngineEventType } from '../../overlayClient/engineTypes.ts';
import { leafComponent } from './elements.tsx';
import { changeProps, motionProps } from './animation.ts';
import { createPreviewStore, useTimeline, type PreviewStore, type TimelineLife, type TimelinePreview } from './useTimeline.ts';
import { clipTotalMs } from './timeline.ts';
import { effectsToCss, hasEffects } from './effects.ts';
import { clipBases, clipToBaseCss, maskCss } from './masks.ts';
import { assetUrl } from './assets.ts';

export type { TimelinePreview, PreviewStore } from './useTimeline.ts';
export { createPreviewStore } from './useTimeline.ts';

/** Anything that emits engine events (the real engine or the Designer simulation). */
export interface EventSource {
  on(type: EngineEventType | '*', listener: (e: EngineEvent) => void): () => void;
}

export interface LayoutRendererProps {
  layout: LayoutDocument;
  state: DataState | null;
  events?: EventSource | null;
  mode?: 'runtime' | 'editor';
  /** Resolves root-relative asset paths (/def_logo.avif). Defaults to this page's origin. */
  assetBase?: string;
  /** 'contain' scales the stage to fit its container; a number forces a scale. */
  fit?: 'contain' | number;
  /** Editor: show event-driven elements with their last (or a sample) event while idle. */
  previewEvents?: boolean;
  sampleEvent?: EngineEvent | null;
  onElementPointerDown?: (id: string, e: React.PointerEvent) => void;
  onAssetError?: (id: string) => void;
  /** Called with the stage scale actually applied (editor overlays need it). */
  onScale?: (scale: number) => void;
  stageRef?: React.Ref<HTMLDivElement>;
  /** Editor: play timeline clips live (default true). */
  playTimelines?: boolean;
  /** Editor: show one element's clip at an exact time (timeline scrubbing). */
  preview?: TimelinePreview | null;
  /**
   * Editor: the same, but driven from outside React — a scrub or a preview
   * playback then updates one DOM node and re-renders nothing. Wins over `preview`.
   */
  previewStore?: PreviewStore | null;
}

// Everything here is identity-stable across document edits and data ticks, so a
// change to one layer never re-renders the others through context.
interface Ctx {
  components: LayoutDocument['components'];
  mode: 'runtime' | 'editor';
  assetBase?: string;
  events?: EventSource | null;
  previewEvents: boolean;
  sampleEvent?: EngineEvent | null;
  onElementPointerDown?: (id: string, e: React.PointerEvent) => void;
  onAssetError?: (id: string) => void;
  playTimelines?: boolean;
  previewStore: PreviewStore;
}

const RenderCtx = createContext<Ctx | null>(null);

// ── error boundary: one broken element never takes the layout down ──────────
class ElementBoundary extends React.Component<{ id: string; editor: boolean; children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown) {
    console.error(`[layout] element "${this.props.id}" failed to render:`, err);
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (!this.props.editor) return null;
    return (
      <div title={this.state.error} style={{ position: 'absolute', inset: 0, outline: '2px dashed #ef4444', background: 'rgba(239,68,68,0.12)' }} />
    );
  }
}

// ── element node ────────────────────────────────────────────────────────────
interface NodeProps {
  el: LayoutElement;
  scope: BindingScope;
  /** Instance suffix inside repeaters, so each copy has a unique React key / DOM id. */
  instance?: string;
  /** Clipping mask: the sibling below this element is clipped to (Photoshop Alt+click). */
  clipBase?: LayoutElement | null;
}

const exitClipOf = (el: LayoutElement): TimelineClip | undefined => el.timeline?.clips.find((c) => c.trigger.type === 'exit');

// Memoised: the editor's tree updates keep untouched elements identical, so
// dragging one layer re-renders that layer, not the whole stage.
const ElementNode = memo(function ElementNode({ el, scope, instance = '', clipBase }: NodeProps) {
  const ctx = useContext(RenderCtx)!;
  if (el.anim?.onEvent) return <EventDrivenNode el={el} scope={scope} instance={instance} clipBase={clipBase} />;
  // In the editor a layer never takes itself away — it has to stay selectable.
  if (ctx.mode === 'runtime' && exitClipOf(el)) return <LifecycleNode el={el} scope={scope} instance={instance} clipBase={clipBase} />;
  return <StaticNode el={el} scope={scope} instance={instance} clipBase={clipBase} />;
});

/**
 * A layer with an exit clip: in → (stay) → out.
 *   - visibility turns false: the exit clip plays, THEN the layer is removed;
 *   - `trigger.after`: it leaves by itself that long after it finished
 *     appearing, and comes back the next time its condition turns true again
 *     (a layer with no condition is a one-shot intro).
 */
function LifecycleNode({ el, scope, instance, clipBase }: NodeProps) {
  const ctx = useContext(RenderCtx)!;
  const bound = resolveBoundProps(el, scope);
  const visible = isElementVisible(el, scope, bound);
  const exit = exitClipOf(el)!;
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>(visible ? 'in' : 'gone');
  const [cycle, setCycle] = useState(0);
  // Left on its own timer: stays away until the condition has gone false and come back.
  const dismissed = useRef(false);

  useEffect(() => {
    if (visible) {
      if (dismissed.current) return;
      setPhase((p) => { if (p === 'gone') setCycle((c) => c + 1); return 'in'; });
    } else {
      dismissed.current = false;
      setPhase((p) => (p === 'in' ? 'out' : p));
    }
  }, [visible]);

  const after = exit.trigger.after;
  const index = typeof scope.index === 'number' ? scope.index : 0;
  useEffect(() => {
    if (phase !== 'in' || after == null) return;
    const enter = el.timeline?.clips.find((c) => c.trigger.type === 'enter');
    const enterMs = enter ? clipTotalMs(enter, index) : 0;
    const t = setTimeout(() => { dismissed.current = true; setPhase('out'); }, (Number.isFinite(enterMs) ? enterMs : 0) + after);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cycle, after]);

  const life = useMemo<TimelineLife>(() => ({ exiting: phase === 'out', onExited: () => setPhase('gone') }), [phase]);
  if (phase === 'gone') return null;
  return <PlacedElement key={`${el.id}:${cycle}`} el={el} scope={scope} bound={bound} instance={instance} ctx={ctx} clipBase={clipBase} life={life} />;
}

function StaticNode({ el, scope, instance, clipBase }: NodeProps) {
  const ctx = useContext(RenderCtx)!;
  const bound = resolveBoundProps(el, scope);
  const visible = isElementVisible(el, scope, bound);
  return (
    <AnimatePresence initial>
      {visible && <PlacedElement key={el.id} el={el} scope={scope} bound={bound} instance={instance} ctx={ctx} clipBase={clipBase} />}
    </AnimatePresence>
  );
}

/** Hidden until its event fires; then shows (with `event` in scope) for enter + hold, one event at a time. */
function EventDrivenNode({ el, scope, instance, clipBase }: NodeProps) {
  const ctx = useContext(RenderCtx)!;
  const spec = el.anim!.onEvent!;
  const [queue, setQueue] = useState<EngineEvent[]>([]);
  const [current, setCurrent] = useState<EngineEvent | null>(null);
  const [lastSeen, setLastSeen] = useState<EngineEvent | null>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    if (!ctx.events) return;
    return ctx.events.on(spec.event, (ev) => {
      if (spec.filter && !evaluateCondition(spec.filter, { ...scopeRef.current, event: ev })) return;
      setQueue((q) => (q.length > 20 ? q : [...q, ev]));
    });
  }, [ctx.events, spec.event, spec.filter]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    setCurrent(queue[0]);
    setLastSeen(queue[0]);
    setQueue((q) => q.slice(1));
  }, [queue, current]);

  useEffect(() => {
    if (!current) return;
    const showMs = (spec.duration ?? 400) + (spec.delay ?? 0) + (spec.hold ?? 3000);
    const t = setTimeout(() => setCurrent(null), showMs);
    return () => clearTimeout(t);
  }, [current, spec.duration, spec.delay, spec.hold]);

  const shown = current ?? (ctx.previewEvents ? lastSeen ?? ctx.sampleEvent ?? null : null);
  const evScope = shown ? { ...scope, event: shown } : scope;
  const bound = resolveBoundProps(el, evScope);
  const visible = !!shown && isElementVisible(el, evScope, bound);
  const enter = { ...spec, preset: el.anim?.enter?.preset ?? spec.preset };
  return (
    <AnimatePresence>
      {visible && (
        <PlacedElement
          key={`${el.id}:${shown!.id}`}
          el={{ ...el, anim: { ...el.anim, enter } }}
          scope={evScope}
          bound={bound}
          instance={instance}
          ctx={ctx}
          clipBase={clipBase}
        />
      )}
    </AnimatePresence>
  );
}

interface PlacedProps {
  el: LayoutElement;
  scope: BindingScope;
  bound: Record<string, unknown>;
  instance?: string;
  ctx: Ctx;
  clipBase?: LayoutElement | null;
  /** In → stay → out: set by LifecycleNode. */
  life?: TimelineLife;
}

const COLOR_TRACK_PROPS = ['fill', 'color', 'stroke'] as const;

const PlacedElement = React.forwardRef<HTMLDivElement, PlacedProps>(function PlacedElement({ el, scope: baseScope, bound: baseBound, instance, ctx, clipBase, life }, ref) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const setRef = (node: HTMLDivElement | null) => {
    nodeRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };
  const baseStyle = resolveElementStyle(el, baseScope);
  const x = numberOr(baseBound.x, el.x);
  const y = numberOr(baseBound.y, el.y);
  const w = numberOr(baseBound.width, el.w);
  const h = numberOr(baseBound.height, el.h);
  const op = numberOr(baseBound.opacity, baseStyle.opacity ?? el.opacity ?? 1);
  // Timeline clips (enter / live event / data condition / loop). An event clip puts `event` in scope.
  const tl = useTimeline(el, baseScope, ctx, nodeRef, { x, y, w, h, rotation: el.rotation || 0, opacity: op }, life);
  const scope = tl.event ? { ...baseScope, event: tl.event } : baseScope;
  const bound = tl.event ? resolveBoundProps(el, scope) : baseBound;
  let style = tl.event ? resolveElementStyle(el, scope).style : baseStyle.style;
  // Animated colors reach the leaves as CSS variables (no per-frame React render).
  const animatedColors = COLOR_TRACK_PROPS.filter((p) => el.timeline?.clips.some((c) => c.tracks.some((t) => t.prop === p)));
  if (animatedColors.length) {
    style = { ...style };
    for (const p of animatedColors) style[p] = `var(--tl-${p}, ${typeof style[p] === 'string' ? style[p] : 'transparent'})`;
  }
  const editor = ctx.mode === 'editor';
  const enterExit = motionProps(el.anim?.enter, el.anim?.exit);
  const change = changeProps(el.anim?.onChange);
  const changeKey = change ? `${String(bound.text ?? '')}|${String(bound.value ?? '')}|${String(bound.src ?? '')}` : 'static';

  return (
    <div
      ref={setRef}
      data-element-id={el.id}
      data-instance={instance || undefined}
      onPointerDown={editor && ctx.onElementPointerDown ? (e) => { e.stopPropagation(); ctx.onElementPointerDown!(el.id, e); } : undefined}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        zIndex: el.z ?? undefined,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        opacity: op,
        pointerEvents: editor ? 'auto' : 'none',
      }}
    >
      <motion.div style={{ position: 'absolute', inset: 0 }} {...enterExit}>
        <motion.div key={changeKey} style={{ position: 'absolute', inset: 0 }} {...(change || {})}>
          <ElementBoundary id={el.id} editor={editor}>
            <Styled el={el} w={w} h={h} x={x} y={y} radius={style.radius} clipBase={clipBase}>
              <ElementBody el={{ ...el, w, h }} scope={scope} bound={bound} style={style} instance={instance} ctx={ctx} />
            </Styled>
          </ElementBoundary>
        </motion.div>
      </motion.div>
    </div>
  );
});

/**
 * Layer effects (drop shadow, glows, stroke, overlays, blend mode), the
 * element's own mask, and a clipping mask to the sibling below. Adds wrappers
 * only when the element uses any of them.
 */
function Styled({ el, w, h, x, y, radius, clipBase, children }: {
  el: LayoutElement; w: number; h: number; x: number; y: number; radius: unknown; clipBase?: LayoutElement | null; children: React.ReactNode;
}) {
  const fx = hasEffects(el) ? effectsToCss(el) : null;
  const mask = el.mask ? maskCss({ mask: el.mask, w, h }) : null;
  const clip = clipBase ? clipToBaseCss({ x, y, w, h }, clipBase) : null;
  if (!fx && !mask && !clip) return <>{children}</>;
  const r = typeof radius === 'number' ? radius : typeof radius === 'string' && radius !== '' && Number.isFinite(Number(radius)) ? Number(radius) : 0;
  return (
    <div data-fx style={{ position: 'absolute', inset: 0, filter: fx?.filter, outline: fx?.outline, outlineOffset: fx?.outlineOffset, borderRadius: fx?.outline ? r : undefined, mixBlendMode: fx?.mixBlendMode, ...(clip || {}) }}>
      <div style={{ position: 'absolute', inset: 0, ...(mask || {}) }}>
        {children}
        {fx?.overlays.map((o, i) => (
          <div key={i} data-fx-overlay style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: r, ...o }} />
        ))}
      </div>
    </div>
  );
}

function numberOr(v: unknown, d: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
}

function ElementBody({ el, scope, bound, style, instance, ctx }: PlacedProps & { style: Record<string, unknown> }) {
  switch (el.type) {
    case 'group':
      return <Children list={el.children || []} scope={scope} instance={instance} />;
    case 'repeater':
      return <Repeater el={el} scope={scope} instance={instance} />;
    case 'component':
      return <ComponentInstance el={el} scope={scope} instance={instance} ctx={ctx} />;
    default: {
      const Leaf = leafComponent(el.type);
      if (!Leaf) return null;
      return <Leaf el={el} bound={bound} style={style} assetBase={ctx.assetBase} item={scope.item} onAssetError={ctx.onAssetError} scope={scope} />;
    }
  }
}

function Children({ list, scope, instance }: { list: LayoutElement[]; scope: BindingScope; instance?: string }) {
  const bases = list.some((c) => c.clipToBelow) ? clipBases(list) : null;
  return (
    <>
      {list.map((child, i) => (
        <ElementNode key={child.id} el={child} scope={scope} instance={instance} clipBase={bases?.[i]} />
      ))}
    </>
  );
}

// uId first: live.players rows carry their team's teamId too, and that is shared by the whole squad.
const itemKey = (item: any, i: number) =>
  String(item?.uId ?? item?.teamId ?? item?._id ?? item?.matchId ?? item?.playerName ?? `i${i}`);

function Repeater({ el, scope, instance }: { el: LayoutElement; scope: BindingScope; instance?: string }) {
  const cfg = el.repeater!;
  const items = resolveRepeaterItems(cfg, scope);
  const kids = el.children || [];
  const childW = Math.max(1, ...kids.map((c) => c.x + c.w));
  const childH = Math.max(1, ...kids.map((c) => c.y + c.h));
  const iw = cfg.itemWidth ?? (cfg.direction === 'column' ? el.w : childW);
  const ih = cfg.itemHeight ?? (cfg.direction === 'row' ? el.h : childH);
  const gap = cfg.gap ?? 0;
  const cols = cfg.direction === 'grid' ? Math.max(1, cfg.columns ?? 2) : 1;
  const offset = cfg.offset || 0;
  const rows = (
    <>
      {items.map((item, i) => {
        const col = cfg.direction === 'row' ? i : cfg.direction === 'grid' ? i % cols : 0;
        const row = cfg.direction === 'column' ? i : cfg.direction === 'grid' ? Math.floor(i / cols) : 0;
        const key = itemKey(item, i);
        return (
          // `layout` animates reorders (rank changes) smoothly.
          <motion.div
            key={key}
            layout="position"
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            style={{ position: 'absolute', left: col * (iw + gap), top: row * (ih + gap), width: iw, height: ih }}
          >
            <Children list={kids} scope={itemScope(scope, item, i, offset)} instance={`${instance || ''}/${key}`} />
          </motion.div>
        );
      })}
    </>
  );
  // overflow 'clip': rows that do not fit the list's own box are cut off instead of running over what is below.
  return cfg.overflow === 'clip' ? <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>{rows}</div> : rows;
}

function ComponentInstance({ el, scope, instance, ctx }: { el: LayoutElement; scope: BindingScope; instance?: string; ctx: Ctx }) {
  const comp = el.componentId ? ctx.components?.[el.componentId] : undefined;
  if (!comp) return null;
  const overrides = el.overrides || {};
  const list = comp.elements.map((c) => (overrides[c.id] ? ({ ...c, ...overrides[c.id], id: c.id, type: c.type } as LayoutElement) : c));
  return <Children list={list} scope={scope} instance={`${instance || ''}#${el.id}`} />;
}

// ── event feed (feed.* binding root) ────────────────────────────────────────

/** Rolling per-type log of the engine's events (kill feed, recalls, eliminations…), one subscription. */
function useEventFeed(events: EventSource | null | undefined): FeedState {
  const [feed, setFeed] = useState<FeedState>(EMPTY_FEED);
  useEffect(() => {
    setFeed(EMPTY_FEED);
    if (!events) return;
    return events.on('*', (ev) => setFeed((f) => feedReducer(f, ev)));
  }, [events]);
  return feed;
}

// ── stage ───────────────────────────────────────────────────────────────────
export function LayoutRenderer(props: LayoutRendererProps) {
  const {
    layout, state, events, mode = 'runtime', assetBase, fit = 'contain', previewEvents = false, sampleEvent,
    onElementPointerDown, onAssetError, onScale, stageRef, playTimelines, preview, previewStore,
  } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [autoScale, setAutoScale] = useState(1);
  const W = layout.stage?.width || 1920;
  const H = layout.stage?.height || 1080;

  useLayoutEffect(() => {
    if (typeof fit === 'number' || !wrapRef.current) return;
    const el = wrapRef.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setAutoScale(Math.min(r.width / W, r.height / H));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, W, H]);

  const scale = typeof fit === 'number' ? fit : autoScale;
  useEffect(() => { onScale?.(scale); }, [scale, onScale]);

  const feed = useEventFeed(events);
  // The scope only reads theme / variables / brand from the layout: editing an
  // element must not hand every layer a new scope object.
  const { theme, variables, brand, components } = layout;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sampleLocal = mode === 'editor';
  const scope = useMemo(() => buildScope(state, { theme, variables, brand }, feed, { sampleLocal }), [state, theme, variables, brand, feed, sampleLocal]);

  // The editor's handlers change identity on every edit; layers get stable wrappers.
  const handlers = useRef({ onElementPointerDown, onAssetError });
  handlers.current = { onElementPointerDown, onAssetError };
  const hasPointer = !!onElementPointerDown;
  const hasAssetError = !!onAssetError;
  const ownStore = useRef<PreviewStore | null>(null);
  if (!ownStore.current) ownStore.current = createPreviewStore(preview ?? null);
  const store = previewStore || ownStore.current;
  // `preview` as a prop still works (tests, simple hosts): it is forwarded into the store.
  useLayoutEffect(() => { if (!previewStore) ownStore.current!.set(preview ?? null); }, [preview, previewStore]);

  const ctx = useMemo<Ctx>(() => ({
    components, mode, assetBase: assetBase ?? (typeof window !== 'undefined' ? window.location.origin : ''), events,
    previewEvents, sampleEvent, playTimelines, previewStore: store,
    onElementPointerDown: hasPointer ? (id, e) => handlers.current.onElementPointerDown?.(id, e) : undefined,
    onAssetError: hasAssetError ? (id) => handlers.current.onAssetError?.(id) : undefined,
  }), [components, mode, assetBase, events, previewEvents, sampleEvent, playTimelines, store, hasPointer, hasAssetError]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div
        ref={stageRef}
        data-stage
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          background: layout.stage?.background || 'transparent',
          overflow: 'hidden',
        }}
      >
        {layout.stage?.backgroundImage && (
          <img
            data-stage-background
            src={assetUrl(layout.stage.backgroundImage, ctx.assetBase)}
            alt=""
            draggable={false}
            decoding="async"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          />
        )}
        <RenderCtx.Provider value={ctx}>
          <Children list={layout.elements || []} scope={scope} />
        </RenderCtx.Provider>
      </div>
    </div>
  );
}

export default LayoutRenderer;
