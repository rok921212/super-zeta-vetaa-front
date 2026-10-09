// Inspector: how a shape is filled — a solid colour, a gradient, or a picture
// clipped to the shape (the shape then works as a frame) — plus its outline,
// corner radius and shadow. A group / list only has the colour and gradient.

import React, { useState } from 'react';
import type { ElementStyle, Gradient, ImageFill, LayoutElement, StyleValue } from '../../schema/layoutTypes.ts';
import { IMAGE_FITS } from '../../schema/layoutSchema.js';
import { assetIdOf, assetRef, assetUrl } from '../../renderer/assets.ts';
import { defaultGradient } from '../gradient.ts';
import { GradientEditor } from '../GradientEditor.tsx';
import { isFrame, patchImageFill } from '../imageOps.ts';
import { SHAPE_PRESETS, polygonFields, shapePreset } from '../shapes.ts';
import { AssetPickerDialog } from '../AssetLibrary.tsx';
import type { AssetLibraryApi } from '../useAssets.ts';
import { Btn, ColorInput, Field, Grid2, NumberInput, Section, Select, TextInput, cx } from '../ui.tsx';
import { ShadowField } from './ShadowField.tsx';

type Edit = (field: string, fn: (e: LayoutElement) => LayoutElement, label?: string) => void;
type Mode = 'solid' | 'gradient' | 'image';

const isRef = (v: unknown): v is { ref: string } => !!v && typeof v === 'object' && typeof (v as any).ref === 'string';
const num = (v: StyleValue | undefined): number | undefined => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !isNaN(Number(v)) ? Number(v) : undefined);

const FIT_LABEL: Record<string, string> = { cover: 'Fill the frame (crop)', contain: 'Show all of it', fill: 'Stretch', none: 'Original size' };

/** Set / clear style keys in one step; an emptied style object is dropped. */
export function withStyle(e: LayoutElement, patch: Partial<Record<keyof ElementStyle, unknown>>): LayoutElement {
  const style: Record<string, unknown> = { ...(e.style || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '' || v === null) delete style[k];
    else style[k] = v;
  }
  const next: LayoutElement = { ...e, style: style as ElementStyle };
  if (!Object.keys(style).length) delete next.style;
  return next;
}

/** A colour field that also understands "follows the design's theme" values. */
export function StyleColorField({ label, value, onChange }: { label: string; value: StyleValue | undefined; onChange(v: StyleValue | undefined): void }) {
  if (isRef(value)) {
    return (
      <Field label={label}>
        <div className="flex items-center gap-1.5">
          <span className="flex-1 truncate rounded border border-sky-400/30 bg-sky-400/10 px-2 py-1 font-mono text-[10px] text-sky-200" title="Follows the layout theme">{value.ref}</span>
          <Btn small onClick={() => onChange(undefined)} title="Detach from theme">✕</Btn>
        </div>
      </Field>
    );
  }
  return <Field label={label}><ColorInput value={typeof value === 'string' ? value : undefined} onChange={(v) => onChange(v)} /></Field>;
}

export function FillSection({ el, edit, assets, assetBase, resolvedFill, onAdjust }: {
  el: LayoutElement;
  edit: Edit;
  assets?: AssetLibraryApi;
  assetBase?: string;
  /** The fill colour as drawn right now (theme references resolved), to start a gradient from. */
  resolvedFill?: string;
  /** Enter "drag the picture inside the frame" mode on the canvas. */
  onAdjust?(): void;
}) {
  const s = el.style || {};
  const frame = isFrame(el);
  const fill = el.imageFill;
  const [mode, setMode] = useState<Mode>(fill?.src || el.bind?.src ? 'image' : s.gradient ? 'gradient' : 'solid');
  const [picking, setPicking] = useState(false);
  const tabs: Mode[] = frame ? ['solid', 'gradient', 'image'] : ['solid', 'gradient'];
  const shown: Mode = tabs.includes(mode) ? mode : 'solid';

  const setFill = (patch: Partial<ImageFill>, label = 'Image in frame') => edit('imageFill', (e) => ({ ...e, imageFill: patchImageFill(e.imageFill, patch) }), label);
  const setGradient = (g: Gradient | null) => edit('style.gradient', (e) => withStyle(e, { gradient: g }), g ? 'Gradient' : 'Remove gradient');
  const assetId = assetIdOf(fill?.src);
  const asset = assetId ? assets?.assets?.find((a) => a._id === assetId) : null;
  const missing = !!assetId && !!assets?.assets && !asset;
  const shapeValue = el.type === 'rect' || el.type === 'ellipse' ? el.type : '';

  return (
    <Section title="Colour & outline" help="fill">
      <div className="flex overflow-hidden rounded border border-white/10" role="tablist" aria-label="Fill type">
        {tabs.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={shown === m}
            onClick={() => {
              setMode(m);
              // Opening the Gradient tab on a flat-coloured shape starts one from that colour.
              if (m === 'gradient' && !s.gradient) setGradient(defaultGradient(resolvedFill));
            }}
            className={cx('flex-1 px-2 py-1 text-[11px]', shown === m ? 'bg-amber-400/20 text-amber-100' : 'text-slate-400 hover:bg-white/5')}
          >
            {m === 'solid' ? 'Colour' : m === 'gradient' ? 'Gradient' : 'Image'}
            {m === 'gradient' && s.gradient ? ' •' : m === 'image' && (fill?.src || el.bind?.src) ? ' •' : ''}
          </button>
        ))}
      </div>

      {shown === 'solid' && (
        <>
          <StyleColorField label="Fill" value={s.fill} onChange={(v) => edit('style.fill', (e) => withStyle(e, { fill: v }), 'Fill')} />
          {s.gradient && (
            <div className="flex items-center justify-between gap-2 text-[10px] text-amber-200/80">
              <span>A gradient is drawn over this colour.</span>
              <Btn small onClick={() => setGradient(null)}>Remove gradient</Btn>
            </div>
          )}
        </>
      )}

      {shown === 'gradient' && (
        s.gradient
          ? (
            <>
              <GradientEditor value={s.gradient} onChange={(g) => edit('style.gradient', (e) => withStyle(e, { gradient: g }), 'Gradient')} />
              <Btn small onClick={() => { setGradient(null); setMode('solid'); }}>Remove gradient</Btn>
            </>
          )
          : <Btn small active onClick={() => setGradient(defaultGradient(resolvedFill))}>Add a gradient</Btn>
      )}

      {shown === 'image' && frame && (
        <div className="flex flex-col gap-2" data-testid="frame-image">
          {el.bind?.src && <div className="rounded border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-[10px] text-sky-100">The picture comes from data (<span className="font-mono">{el.bind.src.path}</span>). The image below shows when that value is empty.</div>}
          {fill?.src ? (
            <div className="flex items-center gap-2">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded border border-white/10 bg-black/40">
                {!missing && <img src={assetUrl(fill.src, assetBase)} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className={cx('truncate text-[11px]', missing ? 'text-red-300' : 'text-slate-200')}>{missing ? 'This image was deleted from the library' : asset?.name || (assetId ? 'Uploaded image' : fill.src)}</div>
                {asset && <div className="text-[10px] text-slate-500">{asset.width} × {asset.height}</div>}
              </div>
            </div>
          ) : (
            <div className="rounded border border-dashed border-white/10 p-3 text-center text-[11px] text-slate-500">
              No picture in this frame. Choose one, or drop an image file onto the shape.
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {assets && <Btn small active onClick={() => setPicking(true)}>{fill?.src ? 'Replace image…' : 'Choose image…'}</Btn>}
            {fill?.src && onAdjust && <Btn small onClick={onAdjust} title="Drag the picture inside the frame; scroll to zoom (or double-click the layer)">Reposition</Btn>}
            {fill?.src && (
              <Btn small danger onClick={() => edit('imageFill', (e) => { const n = { ...e }; delete n.imageFill; return n; }, 'Remove image from frame')} title="Takes the picture out. The frame stays as it is.">Remove</Btn>
            )}
          </div>
          {!assets && (
            <Field label="Image URL" hint="https:// or /relative">
              <TextInput value={fill?.src} mono onChange={(v) => setFill({ src: v || undefined })} />
            </Field>
          )}
          {(fill?.src || el.bind?.src) && (
            <>
              <Field label="Fit">
                <Select value={fill?.fit || 'cover'} options={(IMAGE_FITS as string[]).map((f) => ({ value: f, label: FIT_LABEL[f] || f }))} onChange={(v) => v && setFill({ fit: v as ImageFill['fit'] })} />
              </Field>
              <Field label={`Zoom ${Math.round((fill?.scale ?? 1) * 100)}%`}>
                <input type="range" min={10} max={500} step={1} aria-label="Zoom inside the frame" className="accent-amber-400" value={Math.round((fill?.scale ?? 1) * 100)} onChange={(e) => setFill({ scale: Number(e.target.value) / 100 })} />
              </Field>
              <Grid2>
                <Field label="Position X %"><NumberInput value={Math.round((fill?.posX ?? 0.5) * 100)} min={0} max={100} onChange={(v) => v != null && setFill({ posX: v / 100 })} /></Field>
                <Field label="Position Y %"><NumberInput value={Math.round((fill?.posY ?? 0.5) * 100)} min={0} max={100} onChange={(v) => v != null && setFill({ posY: v / 100 })} /></Field>
                <Field label="Image opacity %"><NumberInput value={Math.round((fill?.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => v != null && setFill({ opacity: v / 100 })} /></Field>
              </Grid2>
              {(fill?.scale || fill?.posX != null || fill?.posY != null) && <Btn small onClick={() => setFill({ scale: 1, posX: 0.5, posY: 0.5 }, 'Reset image position')}>Reset zoom and position</Btn>}
              <div className="text-[10px] text-slate-500">Resizing or restyling the frame keeps this crop. A colour or gradient overlay goes under Effects.</div>
            </>
          )}
          <Field label="Frame shape" hint="Changes the shape only; the picture, colours and animations stay">
            <Select
              value={shapeValue}
              allowEmpty={el.type === 'polygon' ? 'Polygon (current)' : el.type === 'path' ? 'Drawn path (current)' : undefined}
              options={[{ value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse / circle' }, ...SHAPE_PRESETS.map((p) => ({ value: p.id, label: p.label }))]}
              onChange={(v) => {
                if (!v) return;
                edit('shape', (e) => {
                  const next: LayoutElement = { ...e };
                  delete next.points; delete next.d; delete next.vb;
                  const preset = shapePreset(v);
                  if (preset) return withStyle({ ...next, ...polygonFields(preset.points(Math.max(1, e.w), Math.max(1, e.h)), Math.max(1, e.w), Math.max(1, e.h)) }, { radius: undefined });
                  return { ...next, type: v as 'rect' | 'ellipse' };
                }, 'Frame shape');
              }}
            />
          </Field>
        </div>
      )}

      <StyleColorField label="Stroke" value={s.stroke} onChange={(v) => edit('style.stroke', (e) => withStyle(e, { stroke: v }), 'Stroke')} />
      <Grid2>
        <Field label="Stroke width"><NumberInput value={num(s.strokeWidth)} min={0} onChange={(v) => edit('style.strokeWidth', (e) => withStyle(e, { strokeWidth: v }), 'Stroke width')} /></Field>
        {(el.type === 'rect' || el.type === 'group' || el.type === 'repeater') && (
          <Field label="Radius"><NumberInput value={num(s.radius)} min={0} onChange={(v) => edit('style.radius', (e) => withStyle(e, { radius: v }), 'Corner radius')} /></Field>
        )}
      </Grid2>
      <ShadowField label="Shadow" value={typeof s.shadow === 'string' ? s.shadow : ''} onChange={(v) => edit('style.shadow', (e) => withStyle(e, { shadow: v }), 'Shadow')} />

      {picking && assets && (
        <AssetPickerDialog
          library={assets}
          currentId={assetId}
          title="Choose the picture for this frame"
          onPick={(a) => { setFill({ src: assetRef(a._id), fit: fill?.fit || 'cover' }, fill?.src ? 'Replace image' : 'Place image in frame'); setMode('image'); }}
          onClose={() => setPicking(false)}
        />
      )}
    </Section>
  );
}
