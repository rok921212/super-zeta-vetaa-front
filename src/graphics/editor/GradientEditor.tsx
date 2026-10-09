// Gradient editor: linear / radial, any number of colour stops (2-16) on a
// draggable bar, per-stop colour + opacity + position, angle, presets. Used
// for a shape's fill, gradient text and the gradient-overlay effect.
// Edits the schema's Gradient object; the maths lives in ./gradient.ts.

import React, { useRef, useState } from 'react';
import type { Gradient } from '../schema/layoutTypes.ts';
import { gradientCss } from '../renderer/styleToCss.ts';
import { GRADIENT_PRESETS, MAX_STOPS, MIN_STOPS, addStop, normalizeGradient, removeStop, reverseGradient, updateStop } from './gradient.ts';
import { alphaOf, withAlpha } from './color.ts';
import { Btn, ColorInput, Field, Grid2, NumberInput, Select, cx } from './ui.tsx';

const CHECKER = 'linear-gradient(45deg,#3a3a42 25%,transparent 25%),linear-gradient(-45deg,#3a3a42 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#3a3a42 75%),linear-gradient(-45deg,transparent 75%,#3a3a42 75%)';

export function GradientEditor({ value, onChange, disabled }: { value: Gradient; onChange(g: Gradient): void; disabled?: boolean }) {
  const [selected, setSelected] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const g = value;
  const index = Math.min(selected, g.stops.length - 1);
  const stop = g.stops[index];
  // The bar always reads left to right, whatever the gradient's own angle.
  const preview = gradientCss({ ...g, type: 'linear', angle: 90 });

  const offsetAt = (clientX: number): number => {
    const r = bar.current?.getBoundingClientRect();
    if (!r || !r.width) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const startDrag = (i: number, e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(i);
    let current = g;
    const move = (ev: PointerEvent) => { current = updateStop(current, i, { offset: offsetAt(ev.clientX) }); onChange(current); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // Stops are stored in position order; the dragged one keeps the selection.
      const moved = current.stops[i];
      const done = normalizeGradient(current);
      setSelected(Math.max(0, done.stops.indexOf(moved)));
      onChange(done);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const add = (e: React.MouseEvent) => {
    if (disabled || g.stops.length >= MAX_STOPS) return;
    const res = addStop(g, offsetAt(e.clientX));
    if (res.index < 0) return;
    setSelected(res.index);
    onChange(res.gradient);
  };

  return (
    <div className="flex flex-col gap-2" data-testid="gradient-editor">
      <Grid2>
        <Field label="Type">
          <Select value={g.type} options={[{ value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }]} onChange={(v) => v && onChange({ ...g, type: v as Gradient['type'] })} />
        </Field>
        {g.type === 'linear' && (
          <Field label={`Angle ${Math.round(g.angle ?? 90)}°`}>
            <input type="range" min={0} max={360} step={1} aria-label="Gradient angle" disabled={disabled} className="accent-amber-400" value={g.angle ?? 90} onChange={(e) => onChange({ ...g, angle: Number(e.target.value) })} />
          </Field>
        )}
      </Grid2>

      <div className="px-1.5 pb-3 pt-1">
        <div
          ref={bar}
          role="presentation"
          title={g.stops.length >= MAX_STOPS ? `A gradient can have ${MAX_STOPS} stops at most` : 'Click to add a colour stop'}
          onClick={add}
          className="relative h-6 cursor-copy rounded border border-white/15"
          style={{ backgroundColor: '#22222a', backgroundImage: `${preview}, ${CHECKER}`, backgroundSize: 'auto, 8px 8px, 8px 8px, 8px 8px, 8px 8px', backgroundPosition: '0 0, 0 0, 0 4px, 4px -4px, -4px 0' }}
        >
          {g.stops.map((s, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Colour stop ${i + 1} at ${Math.round(s.offset * 100)}%`}
              aria-pressed={i === index}
              disabled={disabled}
              onClick={(e) => { e.stopPropagation(); setSelected(i); }}
              onPointerDown={(e) => startDrag(i, e)}
              className={cx('absolute top-full h-3.5 w-3 -translate-x-1/2 cursor-ew-resize rounded-sm border', i === index ? 'border-amber-300 ring-1 ring-amber-300' : 'border-white/60')}
              style={{ left: `${s.offset * 100}%`, background: s.color, marginTop: 1 }}
            />
          ))}
        </div>
      </div>

      {stop && (
        <div className="rounded border border-white/5 bg-white/[0.02] p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
            <span>Stop {index + 1} of {g.stops.length}</span>
            <button type="button" disabled={disabled || g.stops.length <= MIN_STOPS} title={g.stops.length <= MIN_STOPS ? 'A gradient needs two stops' : 'Remove this stop'} className="text-slate-400 hover:text-red-300 disabled:opacity-30" onClick={() => { onChange(removeStop(g, index)); setSelected(Math.max(0, index - 1)); }}>Remove</button>
          </div>
          <ColorInput value={stop.color} onChange={(v) => onChange(updateStop(g, index, { color: v || '#000000' }))} />
          <div className="mt-2">
            <Grid2>
              <Field label="Position %">
                <NumberInput value={Math.round(stop.offset * 100)} min={0} max={100} onChange={(v) => v != null && onChange(normalizeGradient(updateStop(g, index, { offset: v / 100 })))} />
              </Field>
              <Field label="Opacity %">
                <NumberInput value={Math.round(alphaOf(stop.color) * 100)} min={0} max={100} onChange={(v) => v != null && onChange(updateStop(g, index, { color: withAlpha(stop.color, Math.min(100, Math.max(0, v)) / 100) }))} />
              </Field>
            </Grid2>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {GRADIENT_PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            title={p.name}
            aria-label={`Preset ${p.name}`}
            disabled={disabled}
            onClick={() => { setSelected(0); onChange(JSON.parse(JSON.stringify(p.gradient))); }}
            className="h-5 w-7 rounded border border-white/15 hover:border-amber-300"
            style={{ backgroundColor: '#22222a', backgroundImage: gradientCss(p.gradient) }}
          />
        ))}
        <Btn small className="ml-auto" disabled={disabled} onClick={() => onChange(reverseGradient(g))} title="Swap the direction of the stops">Reverse</Btn>
      </div>
    </div>
  );
}
