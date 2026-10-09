// Canvas drawing tools (overlay above the stage, in stage coordinates):
//
//   Pen (P)     click = corner point, drag = smooth point (mirrored handles,
//               Alt = break the handle), click the first point = close,
//               Enter / Esc / double-click = finish, Backspace = undo point.
//   Pencil (Shift+P / N)  freehand stroke -> simplified, smoothed bezier path.
//   Rectangle (R) / Ellipse (O) / Line (L) / Text (T)  drag to draw (Shift =
//               square / 45° steps); a plain click drops a default-sized one.
//   Rounded rectangle (U) / Polygon (Y) / Frame (K) / Image (M)  the same drag:
//               a rounded box, the chosen polygon, a clipping group, or the
//               box an image from the library is placed in.
//   Direct (A)  edit the selected path's points: drag anchors / handles
//               (Alt = move one handle), double-click = smooth <-> corner,
//               "+" on a segment = add point, Delete = remove the point.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { absoluteOrigin, locate } from './tree.ts';
import {
  anchorsToD, fromElementPath, pencilToAnchors, splitSegment, toElementPath, toggleSmooth, type Anchor, type Pt,
} from './pathTools.ts';

export type ShapeTool = 'rect' | 'ellipse' | 'line' | 'text' | 'roundRect' | 'polygon' | 'frame' | 'image';
export type DrawTool = 'select' | 'direct' | 'pen' | 'pencil' | 'hand' | 'eyedropper' | ShapeTool;

/** What a shape tool drew, in stage coordinates. A line carries its angle. `clicked` = a plain click (default size). */
export interface DrawnShape { tool: ShapeTool; x: number; y: number; w: number; h: number; rotation?: number; clicked?: boolean }

export const SHAPE_TOOLS: ReadonlySet<DrawTool> = new Set<DrawTool>(['rect', 'ellipse', 'line', 'text', 'roundRect', 'polygon', 'frame', 'image']);
const DEFAULT_SIZE: Record<ShapeTool, { w: number; h: number }> = {
  rect: { w: 240, h: 140 }, ellipse: { w: 160, h: 160 }, line: { w: 240, h: 0 }, text: { w: 400, h: 60 },
  roundRect: { w: 240, h: 140 }, polygon: { w: 200, h: 200 }, frame: { w: 400, h: 300 }, image: { w: 320, h: 320 },
};

/** Pure: the element box for a drag from `a` to `b` (stage px). `tiny` drags become a default-sized shape at `a`. */
export function shapeFromDrag(tool: ShapeTool, a: Pt, b: Pt, shift: boolean): DrawnShape {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 4) {
    const d = DEFAULT_SIZE[tool];
    return { tool, x: Math.round(a.x - (tool === 'line' ? 0 : d.w / 2)), y: Math.round(a.y - d.h / 2), w: d.w, h: d.h, clicked: true };
  }
  if (tool === 'line') {
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (shift) angle = Math.round(angle / 45) * 45;
    const len = Math.round(Math.hypot(dx, dy));
    // a line is a zero-height box rotated about its centre
    const rad = (angle * Math.PI) / 180;
    const cx = a.x + (Math.cos(rad) * len) / 2;
    const cy = a.y + (Math.sin(rad) * len) / 2;
    return { tool, x: Math.round(cx - len / 2), y: Math.round(cy), w: len, h: 0, rotation: Math.round(angle) };
  }
  let w = Math.abs(dx);
  let h = Math.abs(dy);
  if (shift) { w = h = Math.max(w, h); }
  return { tool, x: Math.round(dx < 0 ? a.x - w : a.x), y: Math.round(dy < 0 ? a.y - h : a.y), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

export interface ToolLayerProps {
  tool: DrawTool;
  zoom: number;
  W: number;
  H: number;
  doc: LayoutDocument;
  selected: string[];
  toStage(clientX: number, clientY: number): Pt;
  /** A finished pen / pencil path (stage coordinates). */
  onCreatePath(anchors: Anchor[], closed: boolean): void;
  /** Direct-select edits: new geometry for the path (same key = one undo step). */
  onPathEdit(id: string, patch: Partial<LayoutElement>, key: string): void;
  onGestureEnd(): void;
  /** Leave the tool (Esc with nothing drawn). */
  onExit(): void;
  /** A rectangle / ellipse / line / text box was drawn. */
  onCreateShape?(shape: DrawnShape): void;
}

const near = (a: Pt, b: Pt, r: number) => Math.hypot(a.x - b.x, a.y - b.y) <= r;

/** hand / eyedropper are handled by the editor & canvas, not here. */
export function ToolLayer(props: ToolLayerProps) {
  if (props.tool === 'pen') return <PenLayer {...props} />;
  if (props.tool === 'pencil') return <PencilLayer {...props} />;
  if (props.tool === 'direct') return <DirectLayer {...props} />;
  if (SHAPE_TOOLS.has(props.tool)) return <ShapeLayer {...props} />;
  return null;
}

// ── rectangle / ellipse / line / text: drag to draw ─────────────────────────
function ShapeLayer(props: ToolLayerProps) {
  const tool = props.tool as ShapeTool;
  const [draft, setDraft] = useState<DrawnShape | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDraft(null); props.onExit(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const a = props.toStage(e.clientX, e.clientY);
    let last = shapeFromDrag(tool, a, a, e.shiftKey);
    const move = (ev: PointerEvent) => { last = shapeFromDrag(tool, a, props.toStage(ev.clientX, ev.clientY), ev.shiftKey); setDraft(last); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      last = shapeFromDrag(tool, a, props.toStage(ev.clientX, ev.clientY), ev.shiftKey);
      setDraft(null);
      props.onCreateShape?.(last);
      props.onExit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };
  const sw = 1.5 / props.zoom;
  return (
    <Overlay W={props.W} H={props.H} zoom={props.zoom} cursor={tool === 'text' ? 'text' : 'crosshair'} onPointerDown={down}>
      {draft && (tool === 'ellipse'
        ? <ellipse cx={draft.x + draft.w / 2} cy={draft.y + draft.h / 2} rx={draft.w / 2} ry={draft.h / 2} fill="rgba(251,191,36,0.12)" stroke="#fbbf24" strokeWidth={sw} />
        : tool === 'line'
          ? <line x1={draft.x} y1={draft.y} x2={draft.x + draft.w} y2={draft.y} stroke="#fbbf24" strokeWidth={sw * 2} transform={`rotate(${draft.rotation || 0} ${draft.x + draft.w / 2} ${draft.y})`} />
          : <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} rx={tool === 'roundRect' ? Math.min(24, draft.w / 2, draft.h / 2) : 0} fill="rgba(251,191,36,0.12)" stroke="#fbbf24" strokeWidth={sw} strokeDasharray={tool === 'text' || tool === 'frame' || tool === 'image' || tool === 'polygon' ? `${4 / props.zoom} ${3 / props.zoom}` : undefined} />)}
    </Overlay>
  );
}

function Overlay({ W, H, zoom, children, cursor, onPointerDown, onDoubleClick }: {
  W: number; H: number; zoom: number; children: React.ReactNode; cursor: string;
  onPointerDown?(e: React.PointerEvent): void; onDoubleClick?(e: React.MouseEvent): void;
}) {
  return (
    <svg
      data-tool-layer
      className="absolute left-0 top-0"
      width={W * zoom}
      height={H * zoom}
      viewBox={`0 0 ${W} ${H}`}
      style={{ cursor, touchAction: 'none', overflow: 'visible' }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <rect x={-5000} y={-5000} width={W + 10000} height={H + 10000} fill="transparent" />
      {children}
    </svg>
  );
}

const handleLines = (a: Anchor, sw: number) => (
  <>
    {a.in && <line x1={a.x} y1={a.y} x2={a.in.x} y2={a.in.y} stroke="#38bdf8" strokeWidth={sw} />}
    {a.out && <line x1={a.x} y1={a.y} x2={a.out.x} y2={a.out.y} stroke="#38bdf8" strokeWidth={sw} />}
  </>
);

// ── pen ─────────────────────────────────────────────────────────────────────

function PenLayer({ W, H, zoom, toStage, onCreatePath, onExit }: ToolLayerProps) {
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const dragRef = useRef<number | null>(null);
  const anchorsRef = useRef(anchors);
  anchorsRef.current = anchors;
  const r = 6 / zoom;

  const finish = (closed: boolean) => {
    const a = anchorsRef.current;
    if (a.length >= 2) onCreatePath(a, closed && a.length > 2);
    setAnchors([]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Enter') { e.preventDefault(); finish(false); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (anchorsRef.current.length >= 2) finish(false); else { setAnchors([]); onExit(); } }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); setAnchors((a) => a.slice(0, -1)); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = toStage(e.clientX, e.clientY);
      setHover(p);
      const i = dragRef.current;
      if (i == null) return;
      setAnchors((list) => list.map((a, j) => {
        if (j !== i) return a;
        if (Math.hypot(p.x - a.x, p.y - a.y) < 2 / zoom) return { x: a.x, y: a.y };
        return e.altKey ? { ...a, out: p } : { ...a, out: p, in: { x: 2 * a.x - p.x, y: 2 * a.y - p.y } };
      }));
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [toStage, zoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = toStage(e.clientX, e.clientY);
    if (anchors.length > 2 && near(p, anchors[0], r * 1.5)) { finish(true); return; }
    setAnchors((a) => [...a, { x: p.x, y: p.y }]);
    dragRef.current = anchors.length;
  };

  const d = anchorsToD(anchors, false);
  const last = anchors[anchors.length - 1];
  const rubber = last && hover ? anchorsToD([last, { ...hover }], false) : '';
  const sw = 1.5 / zoom;
  return (
    <Overlay W={W} H={H} zoom={zoom} cursor="crosshair" onPointerDown={onPointerDown} onDoubleClick={(e) => { e.stopPropagation(); finish(false); }}>
      {d && <path d={d} fill="none" stroke="#fbbf24" strokeWidth={sw * 1.5} />}
      {rubber && <path d={rubber} fill="none" stroke="#fbbf24" strokeWidth={sw} strokeDasharray={`${4 / zoom} ${4 / zoom}`} />}
      {anchors.map((a, i) => (
        <g key={i}>
          {handleLines(a, sw)}
          <rect x={a.x - r / 2} y={a.y - r / 2} width={r} height={r} fill={i === 0 && anchors.length > 2 ? '#fbbf24' : '#111827'} stroke="#fbbf24" strokeWidth={sw} data-pen-anchor={i} />
        </g>
      ))}
    </Overlay>
  );
}

// ── pencil ──────────────────────────────────────────────────────────────────

function PencilLayer({ W, H, zoom, toStage, onCreatePath }: ToolLayerProps) {
  const [points, setPoints] = useState<Pt[] | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const start = toStage(e.clientX, e.clientY);
    let pts: Pt[] = [start];
    setPoints(pts);
    const move = (ev: PointerEvent) => {
      const p = toStage(ev.clientX, ev.clientY);
      const last = pts[pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5 / zoom) return;
      pts = [...pts, p];
      setPoints(pts);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      setPoints(null);
      if (pts.length >= 2) onCreatePath(pencilToAnchors(pts, zoom), false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };
  return (
    <Overlay W={W} H={H} zoom={zoom} cursor="crosshair" onPointerDown={onPointerDown}>
      {points && points.length > 1 && (
        <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#fbbf24" strokeWidth={2 / zoom} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Overlay>
  );
}

// ── direct select (edit points of the selected path) ────────────────────────

function DirectLayer({ W, H, zoom, doc, selected, toStage, onPathEdit, onGestureEnd }: ToolLayerProps) {
  const id = selected.length === 1 ? selected[0] : null;
  const loc = id ? locate(doc.elements, id) : null;
  const el = loc?.el.type === 'path' ? loc.el : null;
  const origin = el ? absoluteOrigin(doc.elements, el.id) : null;
  const parsed = useMemo(() => (el && origin ? fromElementPath(el, origin) : null), [el, origin?.x, origin?.y]); // eslint-disable-line react-hooks/exhaustive-deps
  const [active, setActive] = useState<number | null>(null);
  const r = 6 / zoom;
  const sw = 1.5 / zoom;
  const parentOrigin = el && origin ? { x: origin.x - el.x, y: origin.y - el.y } : { x: 0, y: 0 };
  const commit = (anchors: Anchor[], key: string) => {
    if (el && parsed) onPathEdit(el.id, toElementPath(anchors, parsed.closed, parentOrigin), key);
  };

  useEffect(() => {
    if (!el || !parsed) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || active == null) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && parsed.anchors.length > 2) {
        e.preventDefault();
        e.stopPropagation();
        commit(parsed.anchors.filter((_, j) => j !== active), `pts:${Date.now()}`);
        setActive(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, parsed, active]);

  if (!el || !origin) {
    return (
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] text-slate-300">
        Direct select: select a path (drawn with the Pen / Pencil) to edit its points.
      </div>
    );
  }
  if (!parsed) {
    return <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[11px] text-slate-300">This path can’t be point-edited.</div>;
  }
  const drag = (e: React.PointerEvent, i: number, part: 'anchor' | 'in' | 'out') => {
    e.stopPropagation();
    setActive(i);
    const start = toStage(e.clientX, e.clientY);
    const base = parsed.anchors.map((a) => ({ ...a, in: a.in && { ...a.in }, out: a.out && { ...a.out } }));
    const key = `pts:${el.id}:${Date.now()}`;
    const move = (ev: PointerEvent) => {
      const p = toStage(ev.clientX, ev.clientY);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      const next = base.map((a) => ({ ...a, in: a.in && { ...a.in }, out: a.out && { ...a.out } }));
      const a = next[i];
      if (part === 'anchor') {
        a.x += dx; a.y += dy;
        if (a.in) { a.in.x += dx; a.in.y += dy; }
        if (a.out) { a.out.x += dx; a.out.y += dy; }
      } else {
        const h = { x: base[i][part]!.x + dx, y: base[i][part]!.y + dy };
        a[part] = h;
        const other = part === 'in' ? 'out' : 'in';
        if (!ev.altKey && a[other]) a[other] = { x: 2 * a.x - h.x, y: 2 * a.y - h.y };
      }
      commit(next, key);
    };
    const up = () => { window.removeEventListener('pointermove', move); onGestureEnd(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const { anchors, closed } = parsed;
  const segCount = closed ? anchors.length : anchors.length - 1;
  const mids: Array<{ i: number; p: Pt }> = [];
  for (let i = 0; i < segCount; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    const p1 = a.out || a;
    const p2 = b.in || b;
    mids.push({ i, p: { x: (a.x + 3 * p1.x + 3 * p2.x + b.x) / 8, y: (a.y + 3 * p1.y + 3 * p2.y + b.y) / 8 } });
  }
  return (
    <Overlay W={W} H={H} zoom={zoom} cursor="default" onPointerDown={() => setActive(null)}>
      <path d={anchorsToD(anchors, closed)} fill="none" stroke="#38bdf8" strokeWidth={sw} />
      {mids.map(({ i, p }) => (
        <g key={`m${i}`} style={{ cursor: 'copy' }} data-path-split={i}
          onPointerDown={(e) => { e.stopPropagation(); commit(splitSegment(anchors, i, closed), `split:${Date.now()}`); onGestureEnd(); }}>
          <circle cx={p.x} cy={p.y} r={r * 0.7} fill="#0b1220" stroke="#38bdf8" strokeWidth={sw} />
          <path d={`M${p.x - r * 0.4} ${p.y}H${p.x + r * 0.4}M${p.x} ${p.y - r * 0.4}V${p.y + r * 0.4}`} stroke="#38bdf8" strokeWidth={sw} />
        </g>
      ))}
      {anchors.map((a, i) => (
        <g key={i}>
          {handleLines(a, sw)}
          {a.in && <circle cx={a.in.x} cy={a.in.y} r={r * 0.6} fill="#38bdf8" style={{ cursor: 'move' }} onPointerDown={(e) => drag(e, i, 'in')} />}
          {a.out && <circle cx={a.out.x} cy={a.out.y} r={r * 0.6} fill="#38bdf8" style={{ cursor: 'move' }} onPointerDown={(e) => drag(e, i, 'out')} />}
          <rect
            x={a.x - r / 2} y={a.y - r / 2} width={r} height={r}
            fill={active === i ? '#38bdf8' : '#0b1220'} stroke="#38bdf8" strokeWidth={sw}
            style={{ cursor: 'move' }}
            data-path-anchor={i}
            onPointerDown={(e) => drag(e, i, 'anchor')}
            onDoubleClick={(e) => { e.stopPropagation(); commit(toggleSmooth(anchors, i, closed), `smooth:${Date.now()}`); onGestureEnd(); }}
          />
        </g>
      ))}
    </Overlay>
  );
}
