// Inspector: the look of text beyond font and colour — outline, shadow,
// gradient fill, what happens when it does not fit (wrap / cut / shrink).

import React from 'react';
import type { LayoutElement } from '../../schema/layoutTypes.ts';
import { defaultGradient } from '../gradient.ts';
import { GradientEditor } from '../GradientEditor.tsx';
import { Btn, ColorInput, Field, Grid2, NumberInput, Section, Select } from '../ui.tsx';
import { ShadowField } from './ShadowField.tsx';
import { withStyle } from './FillSection.tsx';

type Edit = (field: string, fn: (e: LayoutElement) => LayoutElement, label?: string) => void;

/** How text that is too long for its box behaves: one stored choice out of four. */
export type TextFitMode = 'ellipsis' | 'clip' | 'wrap' | 'shrink';

export function textFitMode(style: LayoutElement['style']): TextFitMode {
  if (style?.textFit === 'shrink') return 'shrink';
  if (style?.whiteSpace === 'normal') return 'wrap';
  return style?.textOverflow === 'clip' ? 'clip' : 'ellipsis';
}

/** The style keys a fit mode sets (the others are cleared, so two modes never fight). */
export function textFitStyle(mode: TextFitMode): { textFit?: string; whiteSpace?: string; textOverflow?: string } {
  switch (mode) {
    case 'shrink': return { textFit: 'shrink', whiteSpace: undefined, textOverflow: undefined };
    case 'wrap': return { textFit: undefined, whiteSpace: 'normal', textOverflow: undefined };
    case 'clip': return { textFit: undefined, whiteSpace: undefined, textOverflow: 'clip' };
    default: return { textFit: undefined, whiteSpace: undefined, textOverflow: undefined };
  }
}

const FIT_OPTIONS: Array<{ value: TextFitMode; label: string }> = [
  { value: 'ellipsis', label: 'One line, end with …' },
  { value: 'clip', label: 'One line, cut off' },
  { value: 'wrap', label: 'Wrap onto more lines' },
  { value: 'shrink', label: 'Shrink to fit the box' },
];

export function TextStyleSection({ el, edit, resolvedColor }: { el: LayoutElement; edit: Edit; resolvedColor?: string }) {
  const s = el.style || {};
  const strokeW = typeof s.textStrokeWidth === 'number' ? s.textStrokeWidth : undefined;
  return (
    <Section title="Text style" help="textStyle">
      <Field label="When it does not fit" hint={el.bind?.text ? 'Live names and numbers vary in length: choose what a long one does' : undefined}>
        <Select<TextFitMode> value={textFitMode(s)} options={FIT_OPTIONS} onChange={(v) => v && edit('style.textFit', (e) => withStyle(e, textFitStyle(v)), 'Text fit')} />
      </Field>
      <Grid2>
        <Field label="Outline">
          <ColorInput value={typeof s.textStroke === 'string' ? s.textStroke : undefined} onChange={(v) => edit('style.textStroke', (e) => withStyle(e, { textStroke: v, textStrokeWidth: v ? (e.style?.textStrokeWidth ?? 2) : undefined }), 'Text outline')} />
        </Field>
        <Field label="Outline width">
          <NumberInput value={strokeW} min={0} max={40} step={0.5} onChange={(v) => edit('style.textStrokeWidth', (e) => withStyle(e, { textStrokeWidth: v || undefined, textStroke: v ? (e.style?.textStroke ?? '#000000') : undefined }), 'Text outline')} />
        </Field>
      </Grid2>
      <ShadowField text label="Shadow" value={typeof s.textShadow === 'string' ? s.textShadow : ''} onChange={(v) => edit('style.textShadow', (e) => withStyle(e, { textShadow: v }), 'Text shadow')} />
      {s.textGradient ? (
        <div className="rounded border border-white/5 bg-white/[0.02] p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Gradient text
            <button type="button" className="text-slate-500 hover:text-red-300" onClick={() => edit('style.textGradient', (e) => withStyle(e, { textGradient: undefined }), 'Remove text gradient')}>Remove</button>
          </div>
          <GradientEditor value={s.textGradient} onChange={(g) => edit('style.textGradient', (e) => withStyle(e, { textGradient: g }), 'Text gradient')} />
          <div className="mt-1 text-[10px] text-slate-500">The gradient replaces the text colour. A colour bound to data is ignored while it is on.</div>
        </div>
      ) : (
        <Field label="Gradient text">
          <Btn small onClick={() => edit('style.textGradient', (e) => withStyle(e, { textGradient: defaultGradient(resolvedColor || '#ffffff', '#f59e0b') }), 'Text gradient')}>+ Add gradient</Btn>
        </Field>
      )}
    </Section>
  );
}
