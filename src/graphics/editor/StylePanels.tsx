// Inspector sections for Photoshop-style styling: the layer-effects stack
// (drop shadow, glows, stroke, overlays, blur), blend mode, element mask,
// clipping mask (clip to the layer below) and image crop.

import React, { useState } from 'react';
import type { BlendMode, Effect, EffectType, ElementMask, LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { alignCmd, distributeCmd, matchSizeCmd, type AlignMode } from './align.ts';
import type { Command } from './store.ts';
import { BLEND_MODES, EFFECT_TYPES } from '../schema/layoutSchema.js';
import { defaultEffect } from '../renderer/effects.ts';
import { Btn, ColorInput, Field, Grid2, NumberInput, Section, Select, cx } from './ui.tsx';

const EFFECT_LABEL: Record<EffectType, string> = {
  dropShadow: 'Drop shadow', innerShadow: 'Inner shadow', outerGlow: 'Outer glow', innerGlow: 'Inner glow',
  stroke: 'Stroke', colorOverlay: 'Color overlay', gradientOverlay: 'Gradient overlay', blur: 'Blur',
};

type Edit = (field: string, fn: (e: LayoutElement) => LayoutElement, label?: string) => void;

const setList = (e: LayoutElement, effects: Effect[]): LayoutElement => {
  const next = { ...e };
  if (effects.length) next.effects = effects; else delete next.effects;
  return next;
};

/** Copy / paste an element's look (effects + style + blend) between layers — Ctrl+Alt+C / V. */
let styleClipboard: Pick<LayoutElement, 'effects' | 'style' | 'mask'> | null = null;
export function copyStyle(el: LayoutElement) { styleClipboard = JSON.parse(JSON.stringify({ effects: el.effects, style: el.style, mask: el.mask })); }
export function pasteStyle(el: LayoutElement): LayoutElement {
  if (!styleClipboard) return el;
  const next = { ...el, ...JSON.parse(JSON.stringify(styleClipboard)) };
  (['effects', 'style', 'mask'] as const).forEach((k) => { if (next[k] === undefined) delete next[k]; });
  return next;
}
export const hasCopiedStyle = () => !!styleClipboard;

export function EffectsSection({ el, edit }: { el: LayoutElement; edit: Edit }) {
  const effects = el.effects || [];
  const [open, setOpen] = useState<number | null>(null);
  const update = (i: number, patch: Partial<Effect>) =>
    edit(`effects.${i}`, (e) => setList(e, (e.effects || []).map((fx, j) => (j === i ? { ...fx, ...patch } : fx))), 'Edit effect');
  const blend = typeof el.style?.blendMode === 'string' ? el.style.blendMode : 'normal';
  return (
    <Section
      title="Effects"
      help="effects"
      right={
        <div className="w-32">
          <Select<EffectType> value={undefined} allowEmpty="+ Add effect" options={(EFFECT_TYPES as EffectType[]).map((t) => ({ value: t, label: EFFECT_LABEL[t] }))}
            onChange={(t) => { if (!t) return; edit('effects', (e) => setList(e, [...(e.effects || []), defaultEffect(t)]), 'Add effect'); setOpen(effects.length); }} />
        </div>
      }
    >
      <Field label="Blend mode">
        <Select<BlendMode> value={blend as BlendMode} options={BLEND_MODES as BlendMode[]}
          onChange={(v) => edit('style.blendMode', (e) => {
            const style = { ...(e.style || {}) };
            if (!v || v === 'normal') delete style.blendMode; else style.blendMode = v;
            const next: LayoutElement = { ...e, style };
            if (!Object.keys(style).length) delete next.style;
            return next;
          }, 'Blend mode')} />
      </Field>
      {effects.length === 0 && <div className="text-[10px] text-slate-500">No effects. Add a drop shadow, glow, stroke or overlay — they stack like Photoshop layer styles.</div>}
      {effects.map((fx, i) => (
        <div key={i} className="rounded border border-white/5 bg-white/[0.02]" data-effect={fx.type}>
          <div className="flex items-center gap-1 px-2 py-1">
            <input type="checkbox" checked={fx.enabled !== false} onChange={(e) => update(i, { enabled: e.target.checked })} aria-label={`Enable ${EFFECT_LABEL[fx.type]}`} />
            <button type="button" className="flex-1 text-left text-[11px] text-slate-200" onClick={() => setOpen(open === i ? null : i)}>{EFFECT_LABEL[fx.type]}</button>
            <button type="button" title="Move up" className="text-slate-500 hover:text-slate-200" disabled={i === 0}
              onClick={() => edit('effects', (e) => { const l = [...(e.effects || [])]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; return setList(e, l); }, 'Reorder effect')}>▲</button>
            <button type="button" title="Remove" className="text-slate-500 hover:text-red-300"
              onClick={() => edit('effects', (e) => setList(e, (e.effects || []).filter((_, j) => j !== i)), 'Remove effect')}>✕</button>
          </div>
          {open === i && (
            <div className="flex flex-col gap-2 border-t border-white/5 p-2">
              {fx.type !== 'blur' && fx.type !== 'gradientOverlay' && (
                <Field label="Color"><ColorInput value={fx.color} onChange={(v) => update(i, { color: v })} /></Field>
              )}
              <Grid2>
                {fx.type !== 'blur' && <Field label="Opacity %"><NumberInput value={Math.round((fx.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => update(i, { opacity: v == null ? undefined : Math.max(0, Math.min(100, v)) / 100 })} /></Field>}
                {(fx.type === 'dropShadow' || fx.type === 'innerShadow') && (
                  <>
                    <Field label="X"><NumberInput value={fx.x ?? 0} min={-500} max={500} onChange={(v) => update(i, { x: v })} /></Field>
                    <Field label="Y"><NumberInput value={fx.y ?? 0} min={-500} max={500} onChange={(v) => update(i, { y: v })} /></Field>
                  </>
                )}
                {(fx.type === 'dropShadow' || fx.type === 'innerShadow' || fx.type === 'blur') && (
                  <Field label="Blur"><NumberInput value={fx.blur ?? 0} min={0} max={500} onChange={(v) => update(i, { blur: v })} /></Field>
                )}
                {(fx.type === 'outerGlow' || fx.type === 'innerGlow' || fx.type === 'stroke') && (
                  <Field label="Size"><NumberInput value={fx.size ?? 0} min={0} max={500} onChange={(v) => update(i, { size: v })} /></Field>
                )}
                {fx.type === 'innerShadow' && <Field label="Choke"><NumberInput value={fx.spread ?? 0} min={0} max={500} onChange={(v) => update(i, { spread: v })} /></Field>}
                {fx.type === 'stroke' && (
                  <Field label="Position"><Select value={fx.position || 'outside'} options={['outside', 'inside', 'center']} onChange={(v) => update(i, { position: v as Effect['position'] })} /></Field>
                )}
                {(fx.type === 'colorOverlay' || fx.type === 'gradientOverlay') && (
                  <Field label="Blend"><Select<BlendMode> value={fx.blendMode || 'normal'} options={BLEND_MODES as BlendMode[]} onChange={(v) => update(i, { blendMode: v })} /></Field>
                )}
              </Grid2>
              {fx.type === 'gradientOverlay' && fx.gradient && (
                <Grid2>
                  <Field label="From"><ColorInput value={fx.gradient.stops[0]?.color} onChange={(v) => v && update(i, { gradient: { ...fx.gradient!, stops: [{ ...fx.gradient!.stops[0], color: v }, ...fx.gradient!.stops.slice(1)] } })} /></Field>
                  <Field label="To"><ColorInput value={fx.gradient.stops[fx.gradient.stops.length - 1]?.color} onChange={(v) => v && update(i, { gradient: { ...fx.gradient!, stops: [...fx.gradient!.stops.slice(0, -1), { ...fx.gradient!.stops[fx.gradient!.stops.length - 1], color: v }] } })} /></Field>
                  <Field label="Angle"><NumberInput value={fx.gradient.angle ?? 180} onChange={(v) => update(i, { gradient: { ...fx.gradient!, angle: v ?? 180 } })} /></Field>
                </Grid2>
              )}
            </div>
          )}
        </div>
      ))}
    </Section>
  );
}

export function MaskSection({ el, edit, canClip }: { el: LayoutElement; edit: Edit; canClip: boolean }) {
  const m = el.mask;
  const setMask = (mask: ElementMask | undefined) => edit('mask', (e) => { const n = { ...e }; if (mask) n.mask = mask; else delete n.mask; return n; }, mask ? 'Mask' : 'Remove mask');
  const isImage = el.type === 'image' || el.type === 'teamLogo' || el.type === 'playerAvatar' || el.type === 'flag';
  return (
    <Section title="Mask & clipping" help="mask">
      <label className={cx('flex items-center gap-2 text-[11px]', !canClip && 'opacity-40')} title="Photoshop clipping mask: show this layer only inside the layer directly below it (Alt+click between layers)">
        <input type="checkbox" disabled={!canClip} checked={!!el.clipToBelow} onChange={(e) => edit('clipToBelow', (x) => { const n = { ...x }; if (e.target.checked) n.clipToBelow = true; else delete n.clipToBelow; return n; }, 'Clipping mask')} />
        Clip to layer below
      </label>
      <Grid2>
        <Field label="Mask shape">
          <Select value={m?.shape} allowEmpty="none" options={[{ value: 'rect', label: 'Rounded rect' }, { value: 'ellipse', label: 'Ellipse / circle' }]}
            onChange={(v) => setMask(v ? { ...(m || {}), shape: v as ElementMask['shape'] } : undefined)} />
        </Field>
        {m?.shape === 'rect' && <Field label="Radius"><NumberInput value={m.radius ?? 0} min={0} onChange={(v) => setMask({ ...m, radius: v })} /></Field>}
      </Grid2>
      {m && (
        <label className="flex items-center gap-2 text-[11px]">
          <input type="checkbox" checked={!!m.invert} onChange={(e) => setMask({ ...m, invert: e.target.checked || undefined })} /> Invert (cut the shape out)
        </label>
      )}
      {m?.shape === 'path' && <div className="text-[10px] text-slate-500">Custom path mask (drawn with the Pen tool).</div>}
      {isImage && (
        <>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Crop (% of image)</div>
          <Grid2>
            {(['x', 'y', 'w', 'h'] as const).map((k) => (
              <Field key={k} label={k === 'w' ? 'Width' : k === 'h' ? 'Height' : k.toUpperCase()}>
                <NumberInput value={Math.round(((el.crop?.[k] ?? (k === 'w' || k === 'h' ? 1 : 0)) * 100))} min={k === 'w' || k === 'h' ? 1 : 0} max={100}
                  onChange={(v) => {
                    if (v == null) return;
                    const c = { x: 0, y: 0, w: 1, h: 1, ...(el.crop || {}), [k]: Math.max(0, Math.min(100, v)) / 100 };
                    c.w = Math.min(Math.max(0.01, c.w), 1 - c.x);
                    c.h = Math.min(Math.max(0.01, c.h), 1 - c.y);
                    edit('crop', (e) => ({ ...e, crop: c }), 'Crop');
                  }} />
              </Field>
            ))}
          </Grid2>
          {el.crop && <Btn small onClick={() => edit('crop', (e) => { const n = { ...e }; delete n.crop; return n; }, 'Reset crop')}>Reset crop</Btn>}
        </>
      )}
    </Section>
  );
}

// ── align & distribute ──────────────────────────────────────────────────────

const ALIGN_BTNS: Array<{ mode: AlignMode; label: string; title: string }> = [
  { mode: 'left', label: '⇤', title: 'Align left' },
  { mode: 'hcenter', label: '↔', title: 'Align horizontal centers' },
  { mode: 'right', label: '⇥', title: 'Align right' },
  { mode: 'top', label: '⤒', title: 'Align top' },
  { mode: 'vcenter', label: '↕', title: 'Align vertical middles' },
  { mode: 'bottom', label: '⤓', title: 'Align bottom' },
];

/** Align to the selection (2+ layers) or the stage (1 layer / "to stage"); distribute 3+. */
export function AlignBar({ doc, selected, exec, disabled }: { doc: LayoutDocument; selected: string[]; exec(cmd: Command | null): void; disabled?: boolean }) {
  const [toStage, setToStage] = useState(false);
  if (!selected.length) return null;
  const stage = toStage || selected.length === 1;
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-white/5 px-3 py-2" data-testid="align-bar">
      {ALIGN_BTNS.map((b) => (
        <Btn key={b.mode} small disabled={disabled} title={`${b.title}${stage ? ' (to stage)' : ''}`} onClick={() => exec(alignCmd(doc, selected, b.mode, toStage))}>{b.label}</Btn>
      ))}
      {selected.length >= 3 && (
        <>
          <Btn small disabled={disabled} title="Distribute horizontally" onClick={() => exec(distributeCmd(doc, selected, 'h'))}>⋯</Btn>
          <Btn small disabled={disabled} title="Distribute vertically" onClick={() => exec(distributeCmd(doc, selected, 'v'))}>⋮</Btn>
        </>
      )}
      {selected.length >= 2 && (
        <>
          <Btn small disabled={disabled} title="Match width to the first selected" onClick={() => exec(matchSizeCmd(doc, selected, 'w'))}>W=</Btn>
          <Btn small disabled={disabled} title="Match height to the first selected" onClick={() => exec(matchSizeCmd(doc, selected, 'h'))}>H=</Btn>
          <label className="ml-auto flex items-center gap-1 text-[10px] text-slate-400"><input type="checkbox" checked={toStage} onChange={(e) => setToStage(e.target.checked)} /> to stage</label>
        </>
      )}
    </div>
  );
}
