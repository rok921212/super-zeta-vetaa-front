// Inspector: a layer's transform beyond position, size and rotation — scale,
// skew, flip, anchor point and a four-corner pin (perspective). Everything is
// stored on `el.xform` (schema LayerTransform) and drawn by
// renderer/staticTransform.ts; every change goes through the editor's history.

import React from 'react';
import type { LayerTransform, LayoutElement } from '../../schema/layoutTypes.ts';
import { isIdentityTransform } from '../../renderer/staticTransform.ts';
import { Btn, Field, Grid2, NumberInput, Section } from '../ui.tsx';

type Edit = (field: string, fn: (e: LayoutElement) => LayoutElement, label?: string) => void;

const CORNER_NAMES = ['Top left', 'Top right', 'Bottom right', 'Bottom left'] as const;
const NO_CORNERS: NonNullable<LayerTransform['corners']> = [[0, 0], [0, 0], [0, 0], [0, 0]];
const ANCHORS: Array<[number, number]> = [
  [0, 0], [50, 0], [100, 0],
  [0, 50], [50, 50], [100, 50],
  [0, 100], [50, 100], [100, 100],
];

/** The layer with `patch` merged into its xform; an all-default xform is dropped. */
export function withXform(el: LayoutElement, patch: Partial<LayerTransform>): LayoutElement {
  const xform: LayerTransform = { ...(el.xform || {}), ...patch };
  for (const k of Object.keys(xform) as (keyof LayerTransform)[]) {
    if (xform[k] === undefined) delete xform[k];
  }
  if (xform.scaleX === 1) delete xform.scaleX;
  if (xform.scaleY === 1) delete xform.scaleY;
  if (!xform.skewX) delete xform.skewX;
  if (!xform.skewY) delete xform.skewY;
  if (!xform.flipX) delete xform.flipX;
  if (!xform.flipY) delete xform.flipY;
  if (xform.originX === 50) delete xform.originX;
  if (xform.originY === 50) delete xform.originY;
  if (xform.corners && !xform.corners.some(([dx, dy]) => dx || dy)) delete xform.corners;
  const next: LayoutElement = { ...el, xform };
  if (!Object.keys(xform).length) delete next.xform;
  return next;
}

export function TransformSection({ el, edit, distort, onDistort }: {
  el: LayoutElement;
  edit: Edit;
  /** Corner handles shown on the canvas. */
  distort?: boolean;
  onDistort?: (on: boolean) => void;
}) {
  const t = el.xform || {};
  const sx = t.scaleX ?? 1;
  const sy = t.scaleY ?? 1;
  const keepRatio = !!el.lockAspect;
  const corners = t.corners ?? NO_CORNERS;
  const put = (field: string, patch: Partial<LayerTransform>, label?: string) =>
    edit(`xform.${field}`, (e) => withXform(e, patch), label ?? `Transform ${field}`);
  const setScale = (axis: 'x' | 'y', pct: number | undefined) => {
    if (pct == null) return;
    const v = Math.min(10000, Math.max(1, pct)) / 100;
    if (keepRatio) put('scale', { scaleX: v, scaleY: v });
    else put(axis === 'x' ? 'scaleX' : 'scaleY', axis === 'x' ? { scaleX: v } : { scaleY: v });
  };
  const setCorner = (i: number, axis: 0 | 1, v: number | undefined) => {
    const next = corners.map((c) => [...c]) as NonNullable<LayerTransform['corners']>;
    next[i][axis] = v ?? 0;
    put('corners', { corners: next }, 'Corner pin');
  };

  return (
    <Section
      title="Transform"
      help="transform"
      right={!isIdentityTransform(el.xform) ? (
        <Btn small title="Back to the plain layer: scale 100%, no skew, no flip, no corner pin" onClick={() => edit('xform', (e) => { const n = { ...e }; delete n.xform; return n; }, 'Reset transform')}>
          Reset
        </Btn>
      ) : undefined}
    >
      <Grid2>
        <Field label={keepRatio ? 'Scale %' : 'Scale X %'}>
          <NumberInput value={Math.round(sx * 1000) / 10} min={1} max={10000} onChange={(v) => setScale('x', v)} />
        </Field>
        {!keepRatio && (
          <Field label="Scale Y %"><NumberInput value={Math.round(sy * 1000) / 10} min={1} max={10000} onChange={(v) => setScale('y', v)} /></Field>
        )}
        <Field label="Skew X °"><NumberInput value={t.skewX ?? 0} min={-89} max={89} onChange={(v) => put('skewX', { skewX: v == null ? undefined : Math.max(-89, Math.min(89, v)) })} /></Field>
        <Field label="Skew Y °"><NumberInput value={t.skewY ?? 0} min={-89} max={89} onChange={(v) => put('skewY', { skewY: v == null ? undefined : Math.max(-89, Math.min(89, v)) })} /></Field>
      </Grid2>
      <div className="flex flex-wrap items-center gap-1.5">
        <Btn small active={!!t.flipX} title="Mirror left to right" onClick={() => put('flipX', { flipX: !t.flipX }, 'Flip horizontal')}>⇋ Flip H</Btn>
        <Btn small active={!!t.flipY} title="Mirror top to bottom" onClick={() => put('flipY', { flipY: !t.flipY }, 'Flip vertical')}>⇵ Flip V</Btn>
        <span className="ml-auto text-[10px] text-slate-500" title="The point scale, skew and flip happen around">Anchor</span>
        <div className="grid grid-cols-3 gap-0.5" role="group" aria-label="Anchor point">
          {ANCHORS.map(([ax, ay]) => {
            const on = (t.originX ?? 50) === ax && (t.originY ?? 50) === ay;
            return (
              <button
                key={`${ax}-${ay}`}
                type="button"
                title={`Anchor ${ax}% ${ay}%`}
                aria-pressed={on}
                onClick={() => put('origin', { originX: ax, originY: ay }, 'Anchor point')}
                className={`h-2.5 w-2.5 rounded-sm border ${on ? 'border-amber-300 bg-amber-300' : 'border-white/25 bg-black/40 hover:border-amber-200'}`}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-slate-500">Corner pin (perspective)</span>
        {onDistort && (
          <Btn small active={!!distort} className="ml-auto" title="Drag the four corners on the canvas to fit the layer into an angled frame" onClick={() => onDistort(!distort)}>
            {distort ? 'Done' : 'Distort on canvas'}
          </Btn>
        )}
      </div>
      {(distort || t.corners) && (
        <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-1.5 gap-y-1 text-[10px] text-slate-500">
          <span />
          <span>Δx px</span>
          <span>Δy px</span>
          {CORNER_NAMES.map((name, i) => (
            <React.Fragment key={name}>
              <span>{name}</span>
              <NumberInput value={corners[i][0]} onChange={(v) => setCorner(i, 0, v)} />
              <NumberInput value={corners[i][1]} onChange={(v) => setCorner(i, 1, v)} />
            </React.Fragment>
          ))}
        </div>
      )}
    </Section>
  );
}
