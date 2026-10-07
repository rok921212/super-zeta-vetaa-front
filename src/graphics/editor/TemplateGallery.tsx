// The template gallery on the Designer home: every editable template and
// every built-in theme graphic, by category. Two things to do with one:
//   Edit a copy      a new layout seeded with it, opened in the editor
//   Add to theme     pick one per view, then make a new theme (Theme9, …)
//                    out of the picks: each becomes a published layout in
//                    its own slot, ready in DisplayHud.

import React, { useMemo, useState } from 'react';
import type { LayoutDocument } from '../schema/layoutTypes.ts';
import { layoutsApi, themesApi, apiErrorMessage } from '../api.ts';
import { CACHE_KEYS, invalidate } from '../requestCache.ts';
import { viewLabel } from '../../dashboard/overlayViews.ts';
import { TEMPLATES } from '../templates/index.ts';
import { listBuiltinGraphics } from '../../Themes/registry.ts';
import { EDITABLE, buildGallery, galleryOrigins, type GalleryItem } from './templateCatalog.ts';
import { Btn, cx } from './ui.tsx';

interface Props {
  /** A new layout document seeded from a gallery source. */
  makeDocument(source: string): LayoutDocument;
  onOpen(layoutId: string): void;
  /** A theme was made: layouts and themes changed on the server. */
  onThemeCreated(message: string): void;
  onError(message: string): void;
}

export default function TemplateGallery({ makeDocument, onOpen, onThemeCreated, onError }: Props) {
  const categories = useMemo(() => buildGallery(TEMPLATES, listBuiltinGraphics()), []);
  const origins = useMemo(() => galleryOrigins(categories), [categories]);
  const [category, setCategory] = useState(categories[0]?.id ?? '');
  const [origin, setOrigin] = useState<string>('all');
  // One pick per view: a theme has one slot for each.
  const [picks, setPicks] = useState<Record<string, GalleryItem>>({});
  const [themeName, setThemeName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const shown = (categories.find((c) => c.id === category)?.items ?? []).filter((i) => origin === 'all' || i.origin === origin);
  const picked = Object.values(picks);

  const editCopy = async (item: GalleryItem) => {
    setBusy(item.source);
    try {
      const full = await layoutsApi.create({ name: item.name, draft: makeDocument(item.source) });
      invalidate(CACHE_KEYS.layouts);
      onOpen(full._id);
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not create the layout'));
      setBusy(null);
    }
  };

  const toggle = (item: GalleryItem) => {
    if (!item.viewKey) return;
    const key = item.viewKey;
    setPicks((prev) => {
      const next = { ...prev };
      if (next[key]?.source === item.source) delete next[key];
      else next[key] = item;
      return next;
    });
  };

  const createTheme = async () => {
    setBusy('theme');
    let made = 0;
    try {
      const theme = await themesApi.create(themeName.trim() || undefined);
      for (const item of picked) {
        const layout = await layoutsApi.create({ name: `${theme.name} · ${viewLabel(item.viewKey!)}`, draft: makeDocument(item.source) });
        await layoutsApi.publish(layout._id);
        await themesApi.setSlot(theme._id, item.viewKey!, layout._id);
        made++;
      }
      setPicks({});
      setThemeName('');
      onThemeCreated(`Made ${theme.label} “${theme.name}” with ${made} overlay${made === 1 ? '' : 's'}. Pick it in DisplayHud, or open any of its layouts below to edit.`);
    } catch (err) {
      onError(`${apiErrorMessage(err, 'Could not finish the theme')}${made ? ` (${made} of ${picked.length} overlays were added)` : ''}`);
    } finally {
      invalidate(CACHE_KEYS.layouts);
      invalidate(CACHE_KEYS.themes);
      setBusy(null);
    }
  };

  return (
    <div className="mb-8" data-testid="template-gallery">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Template gallery · start from a ready overlay, or build a whole theme</div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <Btn key={c.id} small active={c.id === category} onClick={() => setCategory(c.id)} title={c.hint}>
            {c.label} ({c.items.length})
          </Btn>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
        <span>From</span>
        {['all', ...origins].map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOrigin(o)}
            className={cx('rounded px-2 py-0.5', origin === o ? 'bg-amber-400/20 text-amber-100' : 'bg-white/5 hover:bg-white/10')}
          >
            {o === 'all' ? 'All' : o === EDITABLE ? 'Editable layers' : o}
          </button>
        ))}
      </div>

      <div className="grid max-h-[420px] gap-2 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((item) => {
          const on = !!item.viewKey && picks[item.viewKey]?.source === item.source;
          return (
            <div key={item.source} className={cx('rounded border p-3', on ? 'border-violet-400/60 bg-violet-500/10' : 'border-white/10 bg-white/[0.02]')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-100" title={item.name}>{item.name}</div>
                  <div className="text-[11px] text-slate-500">{item.description}</div>
                </div>
                <span className={cx('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', item.kind === 'editable' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/10 text-slate-300')}>
                  {item.kind === 'editable' ? 'Editable layers' : 'Built-in'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Btn small active disabled={busy !== null} onClick={() => editCopy(item)}>{busy === item.source ? 'Creating…' : 'Edit a copy'}</Btn>
                {item.viewKey ? (
                  <Btn small disabled={busy !== null} onClick={() => toggle(item)} title={`Use this as ${viewLabel(item.viewKey)} in a new theme`}>
                    {on ? '✓ In new theme' : 'Add to theme'}
                  </Btn>
                ) : null}
                {item.viewKey && <span className="text-[10px] text-slate-500">{viewLabel(item.viewKey)}</span>}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <div className="text-xs text-slate-500">Nothing here from {origin}. Pick another source above.</div>}
      </div>

      {picked.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-violet-400/30 bg-violet-500/[0.08] p-3">
          <div className="min-w-0 flex-1 text-xs text-slate-300">
            <span className="font-semibold text-violet-100">New theme · {picked.length} overlay{picked.length === 1 ? '' : 's'}:</span>{' '}
            {picked.map((p) => `${viewLabel(p.viewKey!)} (${p.name})`).join(', ')}
          </div>
          <input
            className="w-48 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-400/60"
            placeholder="Theme name (optional)"
            maxLength={60}
            value={themeName}
            onChange={(e) => setThemeName(e.target.value)}
          />
          <Btn small disabled={busy !== null} onClick={() => setPicks({})}>Clear</Btn>
          <Btn small active disabled={busy !== null} onClick={createTheme}>{busy === 'theme' ? 'Making theme…' : 'Create theme'}</Btn>
        </div>
      )}
    </div>
  );
}
