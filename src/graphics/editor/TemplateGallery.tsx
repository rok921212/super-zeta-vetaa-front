// The template gallery on the Designer home: every editable template, every
// built-in theme graphic and the account's own templates, filed under the
// same categories the design library uses, searchable, each with a real
// thumbnail (the template drawn by the renderer on sample data).
//
// Two things to do with one:
//   Use template     name it + pick the canvas, and a NEW design seeded with a
//                    copy opens in the editor. The template itself never changes.
//   Add to theme     pick one per view, then make a new theme (Theme9, …)
//                    out of the picks: each becomes a published layout in
//                    its own slot, ready in DisplayHud.

import React, { useMemo, useState } from 'react';
import type { LayoutDocument } from '../schema/layoutTypes.ts';
import { layoutsApi, themesApi, apiErrorMessage, type LayoutSummary } from '../api.ts';
import { CACHE_KEYS, invalidate } from '../requestCache.ts';
import { DESKTOP_VIEWS, viewLabel } from '../../dashboard/overlayViews.ts';
import { TEMPLATES } from '../templates/index.ts';
import { listBuiltinGraphics } from '../../Themes/registry.ts';
import { EDITABLE, buildGallery, galleryOrigins, type GalleryItem } from './templateCatalog.ts';
import { BUILTIN_CATEGORIES, categoryForView } from '../dashboard/categories.ts';
import { DesignThumb, DocThumb } from '../dashboard/DesignThumb.tsx';
import { Btn, cx } from './ui.tsx';

interface Props {
  /** A new layout document seeded from a gallery source. */
  makeDocument(source: string): LayoutDocument;
  /** "Use template": the caller asks for a name and a canvas, then creates the design. */
  onUse(item: GalleryItem): void;
  /** The account's own designs saved as templates. */
  userTemplates?: LayoutSummary[];
  /** "Use" on one of the account's own templates (a copy is made). */
  onUseOwn?(layout: LayoutSummary): void;
  /** A theme was made: layouts and themes changed on the server. */
  onThemeCreated(message: string): void;
  onError(message: string): void;
}

export const GALLERY_ALL = 'all';
export const GALLERY_OWN = 'own';
const GALLERY_DESKTOP = 'desktop';
const GALLERY_OTHER = 'other';

export interface GalleryShelf { id: string; label: string; items: GalleryItem[] }

/** Every gallery entry, filed under the design library's categories (plus Desktop app / Other). */
export function galleryShelves(items: GalleryItem[]): GalleryShelf[] {
  const shelves: GalleryShelf[] = [
    ...BUILTIN_CATEGORIES.filter((c) => c.id !== 'custom').map((c) => ({ id: c.id, label: c.label, items: [] as GalleryItem[] })),
    { id: GALLERY_DESKTOP, label: 'Desktop app', items: [] },
    { id: GALLERY_OTHER, label: 'Other', items: [] },
  ];
  for (const item of items) {
    const id = item.viewKey && DESKTOP_VIEWS.some((v) => v.key === item.viewKey) ? GALLERY_DESKTOP : categoryForView(item.viewKey) || GALLERY_OTHER;
    (shelves.find((s) => s.id === id) || shelves[shelves.length - 1]).items.push(item);
  }
  return shelves.filter((s) => s.items.length > 0);
}

/** Case-insensitive match on name, description, origin and the view it fills. */
export function searchGallery(items: GalleryItem[], query: string): GalleryItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => `${i.name} ${i.description} ${i.origin} ${i.viewKey ? viewLabel(i.viewKey) : ''}`.toLowerCase().includes(q));
}

export default function TemplateGallery({ makeDocument, onUse, userTemplates = [], onUseOwn, onThemeCreated, onError }: Props) {
  const all = useMemo(() => buildGallery(TEMPLATES, listBuiltinGraphics()).flatMap((c) => c.items), []);
  const origins = useMemo(() => galleryOrigins([{ id: '', label: '', hint: '', items: all }]), [all]);
  const [shelf, setShelf] = useState<string>(GALLERY_ALL);
  // Editable templates first: they are the ones made of ordinary layers.
  const [origin, setOrigin] = useState<string>(EDITABLE);
  const [query, setQuery] = useState('');
  // One pick per view: a theme has one slot for each.
  const [picks, setPicks] = useState<Record<string, GalleryItem>>({});
  const [themeName, setThemeName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const byOrigin = useMemo(() => all.filter((i) => origin === 'all' || i.origin === origin), [all, origin]);
  const shelves = useMemo(() => galleryShelves(searchGallery(byOrigin, query)), [byOrigin, query]);
  const shown = shelf === GALLERY_ALL ? shelves.flatMap((s) => s.items) : shelves.find((s) => s.id === shelf)?.items ?? [];
  const ownShown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return userTemplates.filter((l) => !q || `${l.name} ${l.description || ''} ${(l.tags || []).join(' ')}`.toLowerCase().includes(q));
  }, [userTemplates, query]);
  const picked = Object.values(picks);
  const total = shelves.reduce((n, s) => n + s.items.length, 0);

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
      onThemeCreated(`Made ${theme.label} “${theme.name}” with ${made} overlay${made === 1 ? '' : 's'}. Pick it in DisplayHud, or open any of its designs below to edit.`);
    } catch (err) {
      onError(`${apiErrorMessage(err, 'Could not finish the theme')}${made ? ` (${made} of ${picked.length} overlays were added)` : ''}`);
    } finally {
      invalidate(CACHE_KEYS.layouts);
      invalidate(CACHE_KEYS.themes);
      setBusy(null);
    }
  };

  const shelfButton = (id: string, label: string, count: number) => (
    <button
      key={id}
      type="button"
      aria-pressed={shelf === id}
      onClick={() => setShelf(id)}
      className={cx('flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs', shelf === id ? 'bg-amber-400/15 text-amber-100' : 'text-slate-300 hover:bg-white/5')}
    >
      <span className="truncate">{label}</span>
      <span className="text-[10px] text-slate-500">{count}</span>
    </button>
  );

  return (
    <div data-testid="template-gallery">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search templates"
          placeholder="Search templates: lower third, MVP, kill feed…"
          className="w-72 max-w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-amber-400/60"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
          <span>Made of</span>
          {[...origins, 'all'].map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={origin === o}
              onClick={() => setOrigin(o)}
              title={o === EDITABLE ? 'Ordinary layers: every text, shape and image can be edited' : o === 'all' ? 'Everything' : `${o}'s finished graphics, placed as one piece`}
              className={cx('rounded px-2 py-0.5', origin === o ? 'bg-amber-400/20 text-amber-100' : 'bg-white/5 hover:bg-white/10')}
            >
              {o === 'all' ? 'All' : o === EDITABLE ? 'Editable layers' : o}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-slate-500">{shelf === GALLERY_OWN ? ownShown.length : shown.length} template{(shelf === GALLERY_OWN ? ownShown.length : shown.length) === 1 ? '' : 's'}</span>
      </div>

      <div className="flex gap-4">
        <div className="hidden w-44 shrink-0 flex-col gap-0.5 sm:flex" role="group" aria-label="Template categories">
          {shelfButton(GALLERY_ALL, 'All templates', total)}
          {shelves.map((s) => shelfButton(s.id, s.label, s.items.length))}
          <div className="my-1 border-t border-white/5" />
          {shelfButton(GALLERY_OWN, 'Custom templates', ownShown.length)}
        </div>

        <div className="min-w-0 flex-1">
          <select aria-label="Template category" className="mb-2 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-slate-100 sm:hidden" value={shelf} onChange={(e) => setShelf(e.target.value)}>
            <option value={GALLERY_ALL}>All templates ({total})</option>
            {shelves.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.items.length})</option>)}
            <option value={GALLERY_OWN}>Custom templates ({ownShown.length})</option>
          </select>

          {shelf === GALLERY_OWN ? (
            <div className="grid max-h-[560px] gap-3 overflow-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {ownShown.map((l) => (
                <div key={l._id} className="overflow-hidden rounded border border-white/10 bg-white/[0.02]">
                  <div className="aspect-video border-b border-white/5"><DesignThumb layout={l} /></div>
                  <div className="p-2.5">
                    <div className="truncate text-sm font-medium text-slate-100" title={l.name}>{l.name}</div>
                    <div className="line-clamp-2 min-h-[2em] text-[11px] text-slate-500">{l.description || 'Your own template.'}</div>
                    <div className="mt-2"><Btn small active disabled={busy !== null} onClick={() => onUseOwn?.(l)}>Use template</Btn></div>
                  </div>
                </div>
              ))}
              {ownShown.length === 0 && (
                <div className="col-span-full rounded border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">
                  {userTemplates.length === 0
                    ? 'No templates of your own yet. On any design below, choose ⋯ → Save as template.'
                    : `None of your templates match “${query}”.`}
                </div>
              )}
            </div>
          ) : (
            <div className="grid max-h-[560px] gap-3 overflow-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((item) => {
                const on = !!item.viewKey && picks[item.viewKey]?.source === item.source;
                return (
                  <div key={item.source} className={cx('overflow-hidden rounded border', on ? 'border-violet-400/60 bg-violet-500/10' : 'border-white/10 bg-white/[0.02]')} data-template={item.source}>
                    <button type="button" className="block aspect-video w-full border-b border-white/5 text-left" onClick={() => onUse(item)} aria-label={`Use template ${item.name}`}>
                      <DocThumb make={() => makeDocument(item.source)} label={item.name} />
                    </button>
                    <div className="p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-100" title={item.name}>{item.name}</div>
                          <div className="line-clamp-2 min-h-[2em] text-[11px] text-slate-500">{item.description}</div>
                        </div>
                        <span className={cx('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', item.kind === 'editable' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/10 text-slate-300')}>
                          {item.kind === 'editable' ? 'Editable layers' : 'Built-in'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Btn small active disabled={busy !== null} onClick={() => onUse(item)}>Use template</Btn>
                        {item.viewKey ? (
                          <Btn small disabled={busy !== null} onClick={() => toggle(item)} title={`Use this as ${viewLabel(item.viewKey)} in a new theme pack`}>
                            {on ? '✓ In new theme' : 'Add to theme'}
                          </Btn>
                        ) : null}
                        <span className="ml-auto font-mono text-[10px] text-slate-600">1920 × 1080</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {shown.length === 0 && (
                <div className="col-span-full rounded border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">
                  {query ? `No template matches “${query}”.` : 'Nothing here from that source. Pick another one above.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {picked.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-violet-400/30 bg-violet-500/[0.08] p-3">
          <div className="min-w-0 flex-1 text-xs text-slate-300">
            <span className="font-semibold text-violet-100">New theme pack · {picked.length} overlay{picked.length === 1 ? '' : 's'}:</span>{' '}
            {picked.map((p) => `${viewLabel(p.viewKey!)} (${p.name})`).join(', ')}
          </div>
          <input
            className="w-48 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-400/60"
            placeholder="Theme name (optional)"
            aria-label="Theme name"
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
