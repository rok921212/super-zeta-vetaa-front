// Designer canvas: the shared LayoutRenderer (mode="editor") plus an
// interaction layer — select, multi-select, marquee, move with snapping +
// guides, 8-way resize, rotate. The renderer itself is exactly what OBS gets.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { LayoutRenderer, type EventSource, type PreviewStore, type TimelinePreview } from '../renderer/LayoutRenderer.tsx';
import type { DataState } from '../bindings/index.ts';
import type { EngineEvent } from '../../overlayClient/engineTypes.ts';
import { absoluteOrigin, locate } from './tree.ts';
import { ToolLayer, type DrawTool, type DrawnShape } from './ToolLayer.tsx';
import { Rulers, type Grid, type Guides } from './Rulers.tsx';
import { snapToGrid } from './align.ts';
import type { Anchor } from './pathTools.ts';

const SNAP_PX = 6;
const HANDLE = 9;

type Box = { id: string; x: number; y: number; w: number; h: number; rotation: number; locked: boolean };

export interface CanvasProps {
  doc: LayoutDocument;
  selected: string[];
  state: DataState | null;
  events: EventSource | null;
  previewEvents: boolean;
  sampleEvent: EngineEvent | null;
  assetBase?: string;
  zoom: number;
  showSafeZones: boolean;
  onSelect(ids: string[]): void;
  /** Apply geometry to elements during a gesture (same key = one undo step). */
  onGeometry(changes: Array<{ id: string; patch: Partial<LayoutElement> }>, gestureKey: string): void;
  onGestureEnd(): void;
  onAssetError?(id: string): void;
  /** Timeline: exact-frame preview of one element's clip (scrubbing). */
  preview?: TimelinePreview | null;
  /** The same, driven outside React (no render per frame). */
  previewStore?: PreviewStore | null;
  /** Hide the rulers (Shift+R). */
  hideRulers?: boolean;
  /** A rectangle / ellipse / line / text box drawn with a shape tool. */
  onCreateShape?(shape: DrawnShape): void;
  /** Alt+drag: leave a copy of these layers where they are; the drag then moves the originals. */
  onAltDuplicate?(ids: string[]): void;
  /** Play timeline clips live in the editor. */
  playTimelines?: boolean;
  /** Active tool (select by default). */
  tool?: DrawTool;
  /** Ruler guides + grid (doc.editor). */
  docGuides?: Guides;
  grid?: Grid;
  onGuidesChange?(g: Guides): void;
  onCreatePath?(anchors: Anchor[], closed: boolean): void;
  onPathEdit?(id: string, patch: Partial<LayoutElement>, key: string): void;
  /** Eyedropper: the element clicked. */
  onEyedrop?(id: string): void;
  onElementDoubleClick?(id: string): void;
  onToolExit?(): void;
}

type Gesture =
  | { kind: 'move'; start: { x: number; y: number }; items: Array<{ id: string; x: number; y: number; w: number; h: number; absX: number; absY: number }>; key: string }
  | { kind: 'resize'; handle: string; start: { x: number; y: number }; box: Box; el: { x: number; y: number; w: number; h: number }; key: string }
  | { kind: 'rotate'; center: { x: number; y: number }; key: string }
  | { kind: 'marquee'; start: { x: number; y: number } };

export function Canvas(props: CanvasProps) {
  const { doc, selected, zoom, onSelect, onGeometry, onGestureEnd } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const W = doc.stage.width;
  const H = doc.stage.height;

  /** Client coords -> stage coords. */
  const toStage = useCallback((clientX: number, clientY: number) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom };
  }, [zoom]);

  const boxes: Box[] = useMemo(() => selected.map((id) => {
    const loc = locate(doc.elements, id);
    const abs = absoluteOrigin(doc.elements, id);
    if (!loc || !abs) return null;
    return { id, x: abs.x, y: abs.y, w: loc.el.w, h: loc.el.h, rotation: loc.el.rotation || 0, locked: !!loc.el.locked };
  }).filter(Boolean) as Box[], [doc.elements, selected]);

  // Snap targets: stage edges/centre + every OTHER root element's edges/centre.
  const snapTargets = useMemo(() => {
    const v = [0, W / 2, W, ...(props.docGuides?.v || [])];
    const h = [0, H / 2, H, ...(props.docGuides?.h || [])];
    for (const el of doc.elements) {
      if (selected.includes(el.id) || el.hidden) continue;
      v.push(el.x, el.x + el.w / 2, el.x + el.w);
      h.push(el.y, el.y + el.h / 2, el.y + el.h);
    }
    return { v, h };
  }, [doc.elements, selected, W, H, props.docGuides]);

  const snap = useCallback((pos: number, size: number, targets: number[]): { value: number; guide: number | null } => {
    const tol = SNAP_PX / zoom;
    let best: { d: number; value: number; guide: number } | null = null;
    for (const t of targets) {
      for (const [edge, off] of [[pos, 0], [pos + size / 2, size / 2], [pos + size, size]] as const) {
        const d = Math.abs(edge - t);
        if (d <= tol && (!best || d < best.d)) best = { d, value: t - off, guide: t };
      }
    }
    return best ? { value: best.value, guide: best.guide } : { value: pos, guide: null };
  }, [zoom]);

  // ── element pointerdown (from the renderer) ────────────────────────────────
  const onElementPointerDown = useCallback((id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (props.tool === 'eyedropper') { props.onEyedrop?.(id); return; }
    if (props.tool && props.tool !== 'select' && props.tool !== 'direct') return;
    // Clicking inside a repeater instance selects the template element.
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let next = selected;
    if (additive) next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    else if (!selected.includes(id)) next = [id];
    onSelect(next);
    const items = next
      .map((sid) => {
        const loc = locate(doc.elements, sid);
        const abs = absoluteOrigin(doc.elements, sid);
        return loc && abs && !loc.el.locked ? { id: sid, x: loc.el.x, y: loc.el.y, w: loc.el.w, h: loc.el.h, absX: abs.x, absY: abs.y } : null;
      })
      .filter(Boolean) as Array<{ id: string; x: number; y: number; w: number; h: number; absX: number; absY: number }>;
    if (!items.length) return;
    if (e.altKey && !additive) props.onAltDuplicate?.(items.map((i) => i.id));
    setGesture({ kind: 'move', start: toStage(e.clientX, e.clientY), items, key: `move:${Date.now()}` });
  }, [doc.elements, selected, onSelect, toStage, props.tool, props.onEyedrop, props.onAltDuplicate]); // eslint-disable-line react-hooks/exhaustive-deps

  const onStagePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    onSelect([]);
    setGesture({ kind: 'marquee', start: toStage(e.clientX, e.clientY) });
  };

  const onHandleDown = (e: React.PointerEvent, handle: string, box: Box) => {
    e.stopPropagation();
    const loc = locate(doc.elements, box.id);
    if (!loc || loc.el.locked) return;
    if (handle === 'rot') {
      setGesture({ kind: 'rotate', center: { x: box.x + box.w / 2, y: box.y + box.h / 2 }, key: `rot:${Date.now()}` });
      return;
    }
    setGesture({ kind: 'resize', handle, start: toStage(e.clientX, e.clientY), box, el: { x: loc.el.x, y: loc.el.y, w: loc.el.w, h: loc.el.h }, key: `resize:${Date.now()}` });
  };

  // ── gesture tracking on window ─────────────────────────────────────────────
  useEffect(() => {
    if (!gesture) return;
    const move = (e: PointerEvent) => {
      const p = toStage(e.clientX, e.clientY);
      if (gesture.kind === 'marquee') {
        const x = Math.min(p.x, gesture.start.x);
        const y = Math.min(p.y, gesture.start.y);
        setMarquee({ x, y, w: Math.abs(p.x - gesture.start.x), h: Math.abs(p.y - gesture.start.y) });
        return;
      }
      if (gesture.kind === 'move') {
        let dx = p.x - gesture.start.x;
        let dy = p.y - gesture.start.y;
        const g: { v: number[]; h: number[] } = { v: [], h: [] };
        if (!e.ctrlKey && !e.metaKey && gesture.items.length) {
          // Snap the union box of the moved items (hold Ctrl to move freely; Alt is "duplicate").
          const minX = Math.min(...gesture.items.map((i) => i.absX)) + dx;
          const minY = Math.min(...gesture.items.map((i) => i.absY)) + dy;
          const maxX = Math.max(...gesture.items.map((i) => i.absX + i.w)) + dx;
          const maxY = Math.max(...gesture.items.map((i) => i.absY + i.h)) + dy;
          const sx = snap(minX, maxX - minX, snapTargets.v);
          const sy = snap(minY, maxY - minY, snapTargets.h);
          dx += sx.value - minX;
          dy += sy.value - minY;
          // Grid snap when no guide/edge snapped on that axis.
          const gs = props.grid?.snap ? Math.max(1, props.grid.size || 20) : 0;
          if (gs && sx.guide == null) dx += snapToGrid(minX + (sx.value - minX), gs) - (minX + (sx.value - minX));
          if (gs && sy.guide == null) dy += snapToGrid(minY + (sy.value - minY), gs) - (minY + (sy.value - minY));
          if (sx.guide != null) g.v.push(sx.guide);
          if (sy.guide != null) g.h.push(sy.guide);
        }
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
        }
        setGuides(g);
        onGeometry(gesture.items.map((i) => ({ id: i.id, patch: { x: Math.round(i.x + dx), y: Math.round(i.y + dy) } })), gesture.key);
        return;
      }
      if (gesture.kind === 'resize') {
        const { handle, start, box, el } = gesture;
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        let { x, y, w, h } = el;
        if (handle.includes('e')) w = el.w + dx;
        if (handle.includes('s')) h = el.h + dy;
        if (handle.includes('w')) { w = el.w - dx; x = el.x + dx; }
        if (handle.includes('n')) { h = el.h - dy; y = el.y + dy; }
        if (e.shiftKey && el.w > 0 && el.h > 0) {
          const ratio = el.w / el.h;
          if (handle === 'n' || handle === 's') w = h * ratio; else h = w / ratio;
          if (handle.includes('n')) y = el.y + el.h - h;
          if (handle.includes('w')) x = el.x + el.w - w;
        }
        w = Math.max(1, Math.round(w));
        h = Math.max(1, Math.round(h));
        const g: { v: number[]; h: number[] } = { v: [], h: [] };
        if (!e.altKey && !e.shiftKey) {
          const absDx = box.x - el.x;
          const absDy = box.y - el.y;
          if (handle.includes('e')) { const s = snap(absDx + x + w, 0, snapTargets.v); if (s.guide != null) { w = Math.round(s.value - absDx - x); g.v.push(s.guide); } }
          if (handle.includes('s')) { const s = snap(absDy + y + h, 0, snapTargets.h); if (s.guide != null) { h = Math.round(s.value - absDy - y); g.h.push(s.guide); } }
        }
        setGuides(g);
        onGeometry([{ id: box.id, patch: { x: Math.round(x), y: Math.round(y), w: Math.max(1, w), h: Math.max(1, h) } }], gesture.key);
        return;
      }
      if (gesture.kind === 'rotate') {
        let deg = (Math.atan2(p.y - gesture.center.y, p.x - gesture.center.x) * 180) / Math.PI + 90;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        deg = Math.round(((deg % 360) + 360) % 360);
        onGeometry(selected.map((id) => ({ id, patch: { rotation: deg > 180 ? deg - 360 : deg } })), gesture.key);
      }
    };
    const up = () => {
      if (gesture.kind === 'marquee' && marquee && (marquee.w > 3 || marquee.h > 3)) {
        const hit = doc.elements.filter((el) => !el.locked && !el.hidden &&
          el.x < marquee.x + marquee.w && el.x + el.w > marquee.x && el.y < marquee.y + marquee.h && el.y + el.h > marquee.y);
        onSelect(hit.map((el) => el.id));
      }
      setGesture(null);
      setMarquee(null);
      setGuides({ v: [], h: [] });
      onGestureEnd();
    };
    // A fast pointer fires several moves per frame: apply the first at once and at
    // most one more per animation frame (the latest), so a drag is one document
    // change per frame however fast the mouse is.
    let frame = 0;
    let pending: PointerEvent | null = null;
    const flush = () => { frame = 0; if (pending) { const ev = pending; pending = null; move(ev); } };
    const onMove = (e: PointerEvent) => {
      if (frame) { pending = e; return; }
      move(e);
      frame = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(flush) : 0;
    };
    const onUp = () => {
      if (frame && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame);
      flush();
      up();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      if (frame && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gesture, marquee, toStage, snap, snapTargets, onGeometry, onGestureEnd, onSelect, doc.elements, selected, props.grid]); // eslint-disable-line react-hooks/exhaustive-deps

  const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const handlePos = (hd: string, b: Box) => ({
    left: hd.includes('w') ? 0 : hd.includes('e') ? b.w * zoom : (b.w * zoom) / 2,
    top: hd.includes('n') ? 0 : hd.includes('s') ? b.h * zoom : (b.h * zoom) / 2,
  });
  const cursor: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

  return (
    <div
      className="relative"
      style={{ width: W * zoom, height: H * zoom, cursor: props.tool === 'eyedropper' ? 'copy' : undefined }}
      onDoubleClick={(e) => {
        const id = (e.target as HTMLElement).closest?.('[data-element-id]')?.getAttribute('data-element-id');
        if (id) props.onElementDoubleClick?.(id);
      }}
    >
      {/* checkerboard = transparency */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: '#1a1a1f',
          backgroundImage: 'linear-gradient(45deg,#232329 25%,transparent 25%),linear-gradient(-45deg,#232329 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#232329 75%),linear-gradient(-45deg,transparent 75%,#232329 75%)',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0,0 12px,12px -12px,-12px 0',
        }}
        onPointerDown={onStagePointerDown}
      />
      <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
        <div className="absolute inset-0" style={{ pointerEvents: 'auto' }} onPointerDown={onStagePointerDown}>
          <LayoutRenderer
            layout={doc}
            state={props.state}
            events={props.events}
            mode="editor"
            fit={zoom}
            assetBase={props.assetBase}
            previewEvents={props.previewEvents}
            sampleEvent={props.sampleEvent}
            onElementPointerDown={onElementPointerDown}
            onAssetError={props.onAssetError}
            stageRef={stageRef}
            preview={props.preview}
            previewStore={props.previewStore}
            playTimelines={props.playTimelines}
          />
        </div>
      </div>

      {/* overlays (never part of the render) */}
      <div className="pointer-events-none absolute inset-0">
        {props.showSafeZones && (
          <>
            <div className="absolute border border-dashed border-sky-400/40" style={{ left: W * 0.05 * zoom, top: H * 0.05 * zoom, width: W * 0.9 * zoom, height: H * 0.9 * zoom }} />
            <div className="absolute border border-dashed border-sky-400/25" style={{ left: W * 0.1 * zoom, top: H * 0.1 * zoom, width: W * 0.8 * zoom, height: H * 0.8 * zoom }} />
          </>
        )}
        {guides.v.map((x) => <div key={`v${x}`} className="absolute top-0 bottom-0 w-px bg-fuchsia-400" style={{ left: x * zoom }} />)}
        {guides.h.map((y) => <div key={`h${y}`} className="absolute left-0 right-0 h-px bg-fuchsia-400" style={{ top: y * zoom }} />)}
        {marquee && (
          <div className="absolute border border-amber-300 bg-amber-300/10" style={{ left: marquee.x * zoom, top: marquee.y * zoom, width: marquee.w * zoom, height: marquee.h * zoom }} />
        )}
        {boxes.map((b) => (
          <div
            key={b.id}
            className="absolute"
            style={{
              left: b.x * zoom, top: b.y * zoom, width: b.w * zoom, height: b.h * zoom,
              transform: b.rotation ? `rotate(${b.rotation}deg)` : undefined, transformOrigin: 'center center',
              outline: `1.5px solid ${b.locked ? '#94a3b8' : '#fbbf24'}`,
            }}
          >
            {boxes.length === 1 && !b.locked && (
              <>
                {handles.map((hd) => (
                  <div
                    key={hd}
                    onPointerDown={(e) => onHandleDown(e, hd, b)}
                    className="pointer-events-auto absolute rounded-sm border border-amber-300 bg-neutral-900"
                    style={{ width: HANDLE, height: HANDLE, marginLeft: -HANDLE / 2, marginTop: -HANDLE / 2, cursor: cursor[hd], ...handlePos(hd, b) }}
                  />
                ))}
                <div
                  onPointerDown={(e) => onHandleDown(e, 'rot', b)}
                  title="Rotate (Shift = 15° steps)"
                  className="pointer-events-auto absolute h-3 w-3 cursor-grab rounded-full border border-amber-300 bg-neutral-900"
                  style={{ left: (b.w * zoom) / 2 - 6, top: -26 }}
                />
              </>
            )}
          </div>
        ))}
      </div>

      {/* rulers, guides, grid (editor only) */}
      {!props.hideRulers && <Rulers
        W={W}
        H={H}
        zoom={zoom}
        guides={props.docGuides || { v: [], h: [] }}
        grid={props.grid || {}}
        toStage={toStage}
        onGuidesChange={(g) => props.onGuidesChange?.(g)}
        interactive={!props.tool || props.tool === 'select'}
      />}

      {/* pen / pencil / direct-select */}
      {props.tool && props.tool !== 'select' && (
        <ToolLayer
          tool={props.tool}
          zoom={zoom}
          W={W}
          H={H}
          doc={doc}
          selected={selected}
          toStage={toStage}
          onCreatePath={(a, closed) => props.onCreatePath?.(a, closed)}
          onCreateShape={(s) => props.onCreateShape?.(s)}
          onPathEdit={(id, patch, key) => props.onPathEdit?.(id, patch, key)}
          onGestureEnd={onGestureEnd}
          onExit={() => props.onToolExit?.()}
        />
      )}
    </div>
  );
}
