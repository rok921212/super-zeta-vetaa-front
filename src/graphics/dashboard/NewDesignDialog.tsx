// "New design": name it, pick the canvas, create it. Used for a blank design
// and for a copy of a template (the template itself is never touched: the new
// design gets its own document with fresh layer ids).

import React, { useState } from 'react';
import type { LayoutDocument } from '../schema/layoutTypes.ts';
import { layoutsApi, apiErrorMessage } from '../api.ts';
import { CACHE_KEYS, invalidate } from '../requestCache.ts';
import { Modal } from '../editor/dialogs.tsx';
import { Btn, ColorInput, cx } from '../editor/ui.tsx';
import { CANVAS_LIMITS, CANVAS_PRESETS, aspectLabel, canvasSizeProblem, presetFor } from './canvasPresets.ts';
import type { Categories } from './categories.ts';

export interface CanvasChoice { width: number; height: number; background: string | null }

export interface NewDesignSource {
  /** What `makeDocument` takes: a template id, "builtin:Theme6/alerts", or null for a blank design. */
  source: string | null;
  /** Shown as the suggested name. */
  name: string;
  /** The library category the new design starts in. */
  categoryId?: string | null;
  /** A template is laid out for this size; it is the default and changing it does not move its layers. */
  width?: number;
  height?: number;
}

export function NewDesignDialog({ from, categories, makeDocument, onClose, onCreated }: {
  from: NewDesignSource;
  categories: Categories;
  makeDocument(source: string | null, canvas: CanvasChoice): LayoutDocument;
  onClose(): void;
  onCreated(id: string): void;
}) {
  const blank = from.source === null;
  const [name, setName] = useState('');
  const [width, setWidth] = useState<number | ''>(from.width || 1920);
  const [height, setHeight] = useState<number | ''>(from.height || 1080);
  const [custom, setCustom] = useState(false);
  const [transparent, setTransparent] = useState(true);
  const [background, setBackground] = useState('#0b0b0f');
  const [categoryId, setCategoryId] = useState<string>(from.categoryId || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const sizeProblem = canvasSizeProblem(width, height);
  const finalName = name.trim();
  const nameProblem = !finalName ? 'Give the design a name, for example “R2R Lower Third V1”' : null;
  const preset = !custom && typeof width === 'number' && typeof height === 'number' ? presetFor(width, height) : undefined;

  const create = async () => {
    setTouched(true);
    if (nameProblem || sizeProblem || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const draft = makeDocument(from.source, { width: Number(width), height: Number(height), background: transparent ? null : background });
      const full = await layoutsApi.create({ name: finalName, draft });
      invalidate(CACHE_KEYS.layouts);
      if (categoryId) {
        // Filing it is a second, small request: a failure there must not lose the design that was just made.
        try { await layoutsApi.patchMeta(full._id, { categoryId }); invalidate(CACHE_KEYS.layouts); } catch { /* it opens uncategorised */ }
      }
      onCreated(full._id);
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not create the design'));
      setSaving(false);
    }
  };

  const numberField = (label: string, value: number | '', set: (v: number | '') => void, max: number) => (
    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
      {label}
      <input
        type="number"
        aria-label={label}
        min={CANVAS_LIMITS.minSide}
        max={max}
        className="w-28 rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm normal-case tracking-normal text-slate-100 outline-none focus:border-amber-400/60"
        value={value}
        onChange={(e) => { setCustom(true); set(e.target.value === '' ? '' : Math.round(Number(e.target.value))); }}
      />
    </label>
  );

  return (
    <Modal title={blank ? 'New blank design' : `New design from “${from.name}”`} onClose={saving ? undefined : onClose} width={560}>
      <div className="flex flex-col gap-4" data-testid="new-design-dialog">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
          Name
          <input
            autoFocus
            aria-label="Design name"
            className={cx('rounded border bg-black/40 px-2 py-1.5 text-sm normal-case tracking-normal text-slate-100 outline-none focus:border-amber-400/60', touched && nameProblem ? 'border-red-500/60' : 'border-white/10')}
            value={name}
            maxLength={120}
            placeholder={blank ? 'R2R Lower Third V1' : from.name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
          />
          {touched && nameProblem && <span className="text-[11px] normal-case tracking-normal text-red-300">{nameProblem}</span>}
          {!blank && !name && (
            <button type="button" className="self-start text-[11px] normal-case tracking-normal text-amber-200/80 hover:underline" onClick={() => setName(from.name)}>
              Use “{from.name}”
            </button>
          )}
        </label>

        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-400">Canvas size</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Canvas size">
            {CANVAS_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={preset?.id === p.id}
                onClick={() => { setCustom(false); setWidth(p.width); setHeight(p.height); }}
                className={cx('rounded border px-3 py-2 text-left', preset?.id === p.id ? 'border-amber-400/70 bg-amber-400/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/5')}
              >
                <div className="text-xs font-medium text-slate-100">{p.label}</div>
                <div className="font-mono text-[10px] text-slate-500">{p.width} × {p.height}</div>
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={!preset}
              onClick={() => setCustom(true)}
              className={cx('rounded border px-3 py-2 text-left', !preset ? 'border-amber-400/70 bg-amber-400/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/5')}
            >
              <div className="text-xs font-medium text-slate-100">Custom</div>
              <div className="font-mono text-[10px] text-slate-500">your size</div>
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            {numberField('Width', width, setWidth, CANVAS_LIMITS.maxWidth)}
            {numberField('Height', height, setHeight, CANVAS_LIMITS.maxHeight)}
            {!sizeProblem && <span className="pb-2 font-mono text-[11px] text-slate-500" data-testid="aspect">{aspectLabel(Number(width), Number(height))}</span>}
          </div>
          {sizeProblem
            ? <div className="mt-1 text-[11px] text-red-300" data-testid="size-problem">{sizeProblem}</div>
            : <div className="mt-1 text-[10px] text-slate-500">Pixels of the finished graphic, {CANVAS_LIMITS.minSide} to {CANVAS_LIMITS.maxWidth} × {CANVAS_LIMITS.maxHeight}. Zooming the editor never changes it.</div>}
          {!blank && (Number(width) !== (from.width || 1920) || Number(height) !== (from.height || 1080)) && !sizeProblem && (
            <div className="mt-1 text-[10px] text-amber-200/80">This template is laid out for {from.width || 1920} × {from.height || 1080}. Its layers keep their positions on the new canvas.</div>
          )}
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-400">Background</div>
            <label className="flex items-center gap-2 text-xs text-slate-200">
              <input type="checkbox" className="accent-amber-400" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
              Transparent (what OBS lays over the game)
            </label>
            {!transparent && <div className="mt-1.5 w-44"><ColorInput value={background} onChange={(v) => setBackground(v || '#000000')} /></div>}
          </div>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
            Category
            <select
              aria-label="Category"
              className="w-48 rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs normal-case tracking-normal text-slate-100 outline-none focus:border-amber-400/60"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Uncategorised</option>
              {categories.all.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        </div>

        {err && <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-200" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn active disabled={saving || !!sizeProblem} onClick={create} data-testid="create-design">{saving ? 'Creating…' : 'Create and open'}</Btn>
        </div>
      </div>
    </Modal>
  );
}
