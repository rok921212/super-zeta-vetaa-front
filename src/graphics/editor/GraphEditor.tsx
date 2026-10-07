// The ease of one keyframe as a curve (After Effects' graph editor, for the
// segment that leaves the selected keyframe): time runs left to right, the
// value's progress bottom to top. Drag the two handles to shape it.

import React, { useRef } from 'react';
import type { KeyframeEase } from '../schema/layoutTypes.ts';
import { EASE_CURVES, EASE_FUNCTIONS, easeFn } from '../renderer/timeline.ts';

const W = 150;
const H = 150;
const PAD = 14;
// progress is drawn from -0.4 to 1.4 so overshoot (back / elastic) stays visible
const Y_MIN = -0.4;
const Y_MAX = 1.4;

const sx = (x: number) => PAD + x * (W - PAD * 2);
const sy = (y: number) => H - PAD - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * (H - PAD * 2);

export type Bezier = [number, number, number, number];

/** The control points of an ease, when it is a bézier (named or custom). */
export function bezierOf(ease: KeyframeEase | undefined): Bezier | null {
  if (Array.isArray(ease)) return ease as Bezier;
  if (typeof ease === 'string' && EASE_FUNCTIONS[ease]) return null;
  return (EASE_CURVES[(ease as keyof typeof EASE_CURVES) || 'linear'] as Bezier) || [0, 0, 1, 1];
}

const round = (n: number) => Math.round(n * 100) / 100;

export function GraphEditor({ ease, onChange, disabled }: {
  ease: KeyframeEase | undefined;
  onChange(ease: KeyframeEase): void;
  disabled?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pts = bezierOf(ease);
  const fn = easeFn(ease);
  const path = Array.from({ length: 61 }, (_, i) => { const p = i / 60; return `${i ? 'L' : 'M'}${sx(p).toFixed(1)},${sy(fn(p)).toFixed(1)}`; }).join(' ');

  const drag = (which: 0 | 1) => (e: React.PointerEvent) => {
    if (disabled || !pts) return;
    e.preventDefault();
    e.stopPropagation();
    const move = (ev: PointerEvent) => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return;
      const x = Math.max(0, Math.min(1, ((ev.clientX - r.left) / r.width * W - PAD) / (W - PAD * 2)));
      const y = Math.max(-2, Math.min(3, Y_MIN + ((H - PAD - (ev.clientY - r.top) / r.height * H) / (H - PAD * 2)) * (Y_MAX - Y_MIN)));
      const next: Bezier = [...pts] as Bezier;
      next[which * 2] = round(x);
      next[which * 2 + 1] = round(y);
      onChange(next);
    };
    move(e.nativeEvent);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true });
  };

  return (
    <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="rounded border border-white/10 bg-black/40" data-testid="graph-editor" role="img" aria-label="Ease curve">
      <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(0)} stroke="rgba(255,255,255,0.15)" />
      <line x1={sx(0)} y1={sy(1)} x2={sx(1)} y2={sy(1)} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
      <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="rgba(255,255,255,0.08)" />
      <path d={path} fill="none" stroke="#fbbf24" strokeWidth={2} data-curve />
      {pts && (
        <>
          <line x1={sx(0)} y1={sy(0)} x2={sx(pts[0])} y2={sy(pts[1])} stroke="#38bdf8" />
          <line x1={sx(1)} y1={sy(1)} x2={sx(pts[2])} y2={sy(pts[3])} stroke="#38bdf8" />
          <circle cx={sx(pts[0])} cy={sy(pts[1])} r={5} fill="#38bdf8" style={{ cursor: disabled ? 'default' : 'grab' }} onPointerDown={drag(0)} data-handle="0" />
          <circle cx={sx(pts[2])} cy={sy(pts[3])} r={5} fill="#38bdf8" style={{ cursor: disabled ? 'default' : 'grab' }} onPointerDown={drag(1)} data-handle="1" />
        </>
      )}
      <circle cx={sx(0)} cy={sy(0)} r={3} fill="#fbbf24" />
      <circle cx={sx(1)} cy={sy(1)} r={3} fill="#fbbf24" />
    </svg>
  );
}
