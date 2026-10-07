// Rulers, guides and grid around / over the stage (editor only — stored in
// doc.editor, ignored by the renderer).
//   - drag from the top ruler = horizontal guide, from the left ruler = vertical
//   - drag a guide to move it; drag it off the stage to delete it
//   - grid: optional overlay; snapping handled by the Canvas

import React, { useState } from 'react';
import type { Pt } from './pathTools.ts';

export interface Guides { v: number[]; h: number[] }
export interface Grid { size?: number; show?: boolean; snap?: boolean }

const RULER = 18;

/** Tick spacing so labels stay ~60px apart at this zoom. */
export function rulerStep(zoom: number): number {
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  return steps.find((s) => s * zoom >= 60) ?? 5000;
}

function Ruler({ axis, length, zoom, onStartGuide }: { axis: 'x' | 'y'; length: number; zoom: number; onStartGuide(e: React.PointerEvent): void }) {
  const step = rulerStep(zoom);
  const minor = step / 5;
  const ticks: React.ReactNode[] = [];
  for (let v = 0; v <= length; v += minor) {
    const major = Math.abs(v % step) < 1e-6;
    const p = v * zoom;
    ticks.push(axis === 'x'
      ? <line key={v} x1={p} x2={p} y1={major ? 0 : RULER * 0.6} y2={RULER} stroke="rgba(148,163,184,0.5)" strokeWidth={1} />
      : <line key={v} y1={p} y2={p} x1={major ? 0 : RULER * 0.6} x2={RULER} stroke="rgba(148,163,184,0.5)" strokeWidth={1} />);
    if (major) {
      ticks.push(axis === 'x'
        ? <text key={`t${v}`} x={p + 2} y={9} fontSize={9} fill="#94a3b8">{Math.round(v)}</text>
        : <text key={`t${v}`} x={2} y={p + 10} fontSize={9} fill="#94a3b8">{Math.round(v)}</text>);
    }
  }
  const style: React.CSSProperties = axis === 'x'
    ? { position: 'absolute', left: 0, top: -RULER - 2, width: length * zoom, height: RULER, cursor: 'row-resize' }
    : { position: 'absolute', top: 0, left: -RULER - 2, width: RULER, height: length * zoom, cursor: 'col-resize' };
  return (
    <svg data-ruler={axis} style={{ ...style, background: '#141418', overflow: 'hidden' }} width={style.width as number} height={style.height as number} onPointerDown={onStartGuide}>
      {ticks}
    </svg>
  );
}

export function Rulers({ W, H, zoom, guides, grid, toStage, onGuidesChange, interactive }: {
  W: number; H: number; zoom: number; guides: Guides; grid: Grid;
  toStage(clientX: number, clientY: number): Pt;
  onGuidesChange(g: Guides): void;
  /** Guides can be dragged only with the Select tool. */
  interactive: boolean;
}) {
  const [temp, setTemp] = useState<{ axis: 'v' | 'h'; value: number; index: number | null } | null>(null);

  const drag = (axis: 'v' | 'h', index: number | null, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const pos = (ev: { clientX: number; clientY: number }) => {
      const p = toStage(ev.clientX, ev.clientY);
      return Math.round(axis === 'v' ? p.x : p.y);
    };
    setTemp({ axis, value: pos(e), index });
    const move = (ev: PointerEvent) => setTemp({ axis, value: pos(ev), index });
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      setTemp(null);
      const v = pos(ev);
      const max = axis === 'v' ? W : H;
      const list = [...guides[axis]];
      if (index != null) list.splice(index, 1);
      if (v >= 0 && v <= max) list.push(v); // dropped off the stage = deleted
      onGuidesChange({ ...guides, [axis]: list.sort((a, b) => a - b) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const gridSize = Math.max(1, grid.size || 20);
  const line = (axis: 'v' | 'h', value: number, key: string, index: number | null, dashed = false) => (
    <div
      key={key}
      data-guide={`${axis}:${value}`}
      onPointerDown={interactive && index != null ? (e) => drag(axis, index, e) : undefined}
      className="absolute"
      style={axis === 'v'
        ? { left: value * zoom - 3, top: 0, width: 7, height: H * zoom, cursor: interactive ? 'col-resize' : undefined, pointerEvents: interactive && index != null ? 'auto' : 'none' }
        : { top: value * zoom - 3, left: 0, height: 7, width: W * zoom, cursor: interactive ? 'row-resize' : undefined, pointerEvents: interactive && index != null ? 'auto' : 'none' }}
    >
      <div className="absolute" style={axis === 'v'
        ? { left: 3, top: 0, bottom: 0, width: 1, background: dashed ? 'transparent' : '#22d3ee', borderLeft: dashed ? '1px dashed #22d3ee' : undefined }
        : { top: 3, left: 0, right: 0, height: 1, background: dashed ? 'transparent' : '#22d3ee', borderTop: dashed ? '1px dashed #22d3ee' : undefined }} />
    </div>
  );

  return (
    <>
      {grid.show && (
        <div className="pointer-events-none absolute inset-0" data-grid style={{
          backgroundImage: 'linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)',
          backgroundSize: `${gridSize * zoom}px ${gridSize * zoom}px`,
        }} />
      )}
      <Ruler axis="x" length={W} zoom={zoom} onStartGuide={(e) => drag('h', null, e)} />
      <Ruler axis="y" length={H} zoom={zoom} onStartGuide={(e) => drag('v', null, e)} />
      <div className="absolute" style={{ left: -RULER - 2, top: -RULER - 2, width: RULER, height: RULER, background: '#141418' }} />
      {guides.v.map((v, i) => (temp && temp.axis === 'v' && temp.index === i ? null : line('v', v, `v${i}`, i)))}
      {guides.h.map((v, i) => (temp && temp.axis === 'h' && temp.index === i ? null : line('h', v, `h${i}`, i)))}
      {temp && line(temp.axis, temp.value, 'temp', null, true)}
    </>
  );
}
