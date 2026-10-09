// Inspector: an image layer's picture — which one (from the library or a URL),
// how it fits its box, where it sits, and what shows when it is missing.

import React, { useState } from 'react';
import type { LayoutElement, StyleValue } from '../../schema/layoutTypes.ts';
import { assetIdOf, assetRef, assetUrl } from '../../renderer/assets.ts';
import { AssetPickerDialog } from '../AssetLibrary.tsx';
import type { AssetLibraryApi } from '../useAssets.ts';
import { Btn, Field, Grid2, NumberInput, Section, Select, TextInput, cx } from '../ui.tsx';
import { withStyle } from './FillSection.tsx';

type Edit = (field: string, fn: (e: LayoutElement) => LayoutElement, label?: string) => void;

const num = (v: StyleValue | undefined): number | undefined => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !isNaN(Number(v)) ? Number(v) : undefined);

const FITS = [
  { value: 'contain', label: 'Contain (show all of it)' },
  { value: 'cover', label: 'Cover (fill the box, crop)' },
  { value: 'fill', label: 'Stretch' },
  { value: 'none', label: 'Native size' },
];

/** "50% 20%" -> [50, 20]; anything else -> [50, 50]. */
export function parsePosition(v: unknown): [number, number] {
  const m = typeof v === 'string' ? /^\s*(-?[\d.]+)%\s+(-?[\d.]+)%\s*$/.exec(v) : null;
  return m ? [Number(m[1]), Number(m[2])] : [50, 50];
}

export function ImageSection({ el, edit, assets, assetBase }: { el: LayoutElement; edit: Edit; assets?: AssetLibraryApi; assetBase?: string }) {
  const s = el.style || {};
  const [picking, setPicking] = useState<'src' | 'fallbackSrc' | null>(null);
  const [asUrl, setAsUrl] = useState(false);
  const setSrc = (key: 'src' | 'fallbackSrc', v: string | undefined) => edit(key, (e) => {
    const next = { ...e, [key]: v };
    if (!v) delete (next as any)[key];
    // A new picture has its own proportions: an old crop would cut the wrong part.
    if (key === 'src') delete next.crop;
    return next;
  }, key === 'src' ? 'Image source' : 'Fallback image');
  const [px, py] = parsePosition(s.objectPosition);
  const setPos = (x: number, y: number) => edit('style.objectPosition', (e) => withStyle(e, { objectPosition: x === 50 && y === 50 ? undefined : `${x}% ${y}%` }), 'Image position');
  const fit = typeof s.objectFit === 'string' ? s.objectFit : '';

  const source = (key: 'src' | 'fallbackSrc', label: string) => {
    const value = el[key];
    const id = assetIdOf(value);
    const asset = id ? assets?.assets?.find((a) => a._id === id) : null;
    const missing = !!id && !!assets?.assets && !asset;
    const typing = !id && (asUrl || !!value || !assets);
    return (
      <Field label={label} hint={typing ? 'https:// or /relative' : undefined}>
        {id ? (
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded border border-white/10 bg-black/40">
              {!missing && <img src={assetUrl(value, assetBase)} alt="" className="h-full w-full object-cover" />}
            </div>
            <span className={cx('min-w-0 flex-1 truncate text-[11px]', missing ? 'text-red-300' : 'text-slate-200')} title={asset?.name}>
              {missing ? 'Deleted from the library' : asset?.name || 'Uploaded image'}
            </span>
          </div>
        ) : typing ? (
          <TextInput value={value} mono onChange={(v) => setSrc(key, v || undefined)} />
        ) : (
          <span className="text-[11px] text-slate-500">None</span>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {assets && <Btn small active={key === 'src'} onClick={() => setPicking(key)}>{value ? 'Replace…' : 'Choose image…'}</Btn>}
          {assets && !id && !typing && <Btn small onClick={() => setAsUrl(true)}>Use a URL</Btn>}
          {value && <Btn small danger onClick={() => setSrc(key, undefined)}>Remove</Btn>}
        </div>
      </Field>
    );
  };

  return (
    <Section title="Image" help="image">
      {el.bind?.src && <div className="rounded border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-[10px] text-sky-100">The picture comes from data (<span className="font-mono">{el.bind.src.path}</span>). “Source” shows while that value is empty; “Fallback” shows when the picture fails to load.</div>}
      {source('src', 'Source')}
      {source('fallbackSrc', 'Fallback')}
      <Field label="Fit" hint={el.crop ? 'A custom crop is set (under Mask & clipping): the cropped part is stretched to the box' : undefined}>
        <Select value={fit || undefined} allowEmpty={el.type === 'playerAvatar' ? 'Automatic (cover)' : 'Automatic (contain)'} options={FITS} onChange={(v) => edit('style.objectFit', (e) => withStyle(e, { objectFit: v }), 'Image fit')} />
      </Field>
      <Grid2>
        <Field label="Position X %"><NumberInput value={px} min={0} max={100} onChange={(v) => v != null && setPos(Math.min(100, Math.max(0, v)), py)} /></Field>
        <Field label="Position Y %"><NumberInput value={py} min={0} max={100} onChange={(v) => v != null && setPos(px, Math.min(100, Math.max(0, v)))} /></Field>
        <Field label="Radius"><NumberInput value={num(s.radius)} min={0} onChange={(v) => edit('style.radius', (e) => withStyle(e, { radius: v }), 'Corner radius')} /></Field>
        <Field label="Grayscale"><NumberInput value={num(s.grayscale)} min={0} max={1} step={0.1} onChange={(v) => edit('style.grayscale', (e) => withStyle(e, { grayscale: v || undefined }), 'Grayscale')} /></Field>
      </Grid2>
      <div className="text-[10px] text-slate-500">Position matters when the picture is cropped by Cover or shown at Native size. For a picture inside a shape, draw the shape and put the image in it instead.</div>
      {picking && assets && (
        <AssetPickerDialog
          library={assets}
          currentId={assetIdOf(el[picking])}
          title={picking === 'src' ? 'Choose the image' : 'Choose the fallback image'}
          onPick={(a) => setSrc(picking, assetRef(a._id))}
          onClose={() => setPicking(null)}
        />
      )}
    </Section>
  );
}
