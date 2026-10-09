// /designer — the Designer's home. Three ways in (a template, a blank canvas,
// a design you already have), then the account's design library. The API is
// owner-scoped, so another account's designs can never appear here.
//
// Words used on this page: one graphic is a "design"; a "theme" (Theme9, …)
// is a pack of published designs shown in DisplayHud.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../dashboard/Navbar';
import type { LayoutDocument } from '../schema/layoutTypes.ts';
import { createEmptyLayout } from '../schema/layoutSchema.js';
import { layoutsApi, themesApi, apiErrorMessage, type CustomTheme, type LayoutSummary } from '../api.ts';
import { useCustomThemes } from './ThemeAssign.tsx';
import { CACHE_KEYS, invalidate, setCached, useCached } from '../requestCache.ts';
import { viewLabel } from '../../dashboard/overlayViews.ts';
import { TEMPLATES } from '../templates/index.ts';
import { cloneWithNewIds } from './ids.ts';
import { createBuiltinElement } from './BuiltinBrowser.tsx';
import { builtinLabel } from '../../Themes/registry.ts';
import { ImportThemeDialog, exportThemeFile } from './ImportThemeDialog.tsx';
import { Btn, cx } from './ui.tsx';
import { InfoButton } from './Help.tsx';
import TemplateGallery from './TemplateGallery.tsx';
import type { GalleryItem } from './templateCatalog.ts';
import { DesignLibrary } from '../dashboard/DesignLibrary.tsx';
import { NewDesignDialog, type CanvasChoice, type NewDesignSource } from '../dashboard/NewDesignDialog.tsx';
import { CategoryManager } from '../dashboard/CategoryManager.tsx';
import { categoryForView, useCategories } from '../dashboard/categories.ts';

/**
 * A new layout document: an empty stage of the chosen size, seeded with a
 * starter template's elements ("lower-third") or ONE full-stage built-in
 * graphic ("builtin:Theme6/alerts"). Template layers are copied with fresh
 * ids, so the new design shares nothing with the template.
 */
export function newLayoutDocument(source: string | null, canvas?: Partial<CanvasChoice>): LayoutDocument {
  const doc = createEmptyLayout() as LayoutDocument;
  if (canvas) {
    doc.stage = {
      ...doc.stage,
      ...(canvas.width ? { width: canvas.width } : {}),
      ...(canvas.height ? { height: canvas.height } : {}),
      ...(canvas.background !== undefined ? { background: canvas.background } : {}),
    };
  }
  if (source && source.startsWith('builtin:')) {
    const [theme, view] = source.slice(8).split('/');
    doc.elements = [createBuiltinElement({ theme, view, label: builtinLabel(view) }, doc)];
    return doc;
  }
  const t = source ? TEMPLATES.find((x) => x.id === source) : null;
  if (t) doc.elements = cloneWithNewIds(t.elements, []);
  return doc;
}

type HomeView = 'designs' | 'templates';

export default function DesignerList() {
  const navigate = useNavigate();
  // Cached: coming back from the editor only refetches if something was saved meanwhile
  // (the editor invalidates this key on save / publish / lock).
  const listQuery = useCached<LayoutSummary[]>(CACHE_KEYS.layouts, () => layoutsApi.list());
  const layouts = listQuery.data ?? null;
  const changeLayouts = useCallback((fn: (l: LayoutSummary[]) => LayoutSummary[]) => setCached<LayoutSummary[]>(CACHE_KEYS.layouts, (cur) => fn(cur ?? [])), []);
  const error = listQuery.error && !listQuery.data ? apiErrorMessage(listQuery.error, 'Could not load your designs') : null;
  const [notice, setNotice] = useState<string | null>(null);
  const [newFrom, setNewFrom] = useState<NewDesignSource | null>(null);
  const [importing, setImporting] = useState(false);
  const [managing, setManaging] = useState(false);
  const [chosenView, setChosenView] = useState<HomeView | null>(null);
  const [copying, setCopying] = useState(false);
  const customThemes = useCustomThemes();
  const categories = useCategories();
  const sectionRef = useRef<HTMLDivElement>(null);

  // With nothing saved yet the gallery is the useful first screen; otherwise the library is.
  const view: HomeView = chosenView ?? (layouts && layouts.length === 0 ? 'templates' : 'designs');
  const show = (v: HomeView) => {
    setChosenView(v);
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      if (v === 'designs') sectionRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus({ preventScroll: true });
    });
  };

  const load = useCallback(() => { void listQuery.reload(); }, [listQuery.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = useCallback((id: string) => navigate(`/designer/${id}`), [navigate]);
  const userTemplates = useMemo(() => (layouts || []).filter((l) => l.isTemplate && !l.archivedAt), [layouts]);

  const startFromTemplate = (item: GalleryItem) => setNewFrom({ source: item.source, name: item.name, categoryId: categoryForView(item.viewKey), width: 1920, height: 1080 });

  /** One of the account's own templates: the copy is a new design, never the template itself. */
  const copyOwnTemplate = async (l: LayoutSummary) => {
    if (copying) return;
    setCopying(true);
    try {
      const copy = await layoutsApi.duplicate(l._id);
      invalidate(CACHE_KEYS.layouts);
      open(copy._id);
    } catch (err) {
      setNotice(apiErrorMessage(err, 'Could not copy the template'));
      setCopying(false);
    }
  };

  const actions: Array<{ id: string; title: string; body: string; onClick(): void; primary?: boolean }> = [
    { id: 'template', title: 'Create from template', body: 'Lower thirds, kill feeds, leaderboards, MVP cards… Pick one and get your own editable copy.', onClick: () => show('templates'), primary: true },
    { id: 'blank', title: 'Create blank design', body: 'Name it, choose the canvas size, and draw from nothing.', onClick: () => setNewFrom({ source: null, name: 'Untitled design' }) },
    { id: 'open', title: 'Open existing design', body: layouts ? `${layouts.filter((l) => !l.archivedAt).length} saved. Search, filter and continue where you left off.` : 'Search, filter and continue where you left off.', onClick: () => show('designs') },
  ];

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-slate-200">
      <Navbar active="designer" brandText="DESIGNER" />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Overlay Designer</h1>
            <p className="mt-1 text-sm text-slate-400">Design broadcast graphics on live data, publish them, and add the URL to OBS as a Browser Source.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <InfoButton topic="share" label="Export / import" />
            <button
              type="button"
              onClick={() => setImporting(true)}
              title="Import a theme file (.sstheme) into your account"
              className="rounded border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-white/10"
            >
              Import theme
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3" data-testid="home-actions">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              data-action={a.id}
              onClick={a.onClick}
              className={cx(
                'rounded-md border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60',
                a.primary ? 'border-red-500/50 bg-red-600/15 hover:bg-red-600/25' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
              )}
            >
              <div className="text-sm font-semibold text-slate-100">{a.title}</div>
              <div className="mt-1 text-xs text-slate-400">{a.body}</div>
            </button>
          ))}
        </div>

        {notice && (
          <div className="mb-4 flex items-center gap-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100" role="status">
            {notice}
            <button type="button" className="ml-auto" aria-label="Dismiss" onClick={() => setNotice(null)}>✕</button>
          </div>
        )}

        {customThemes.themes && customThemes.themes.length > 0 && (
          <ThemesStrip themes={customThemes.themes} onChanged={() => void customThemes.reload()} onNotice={setNotice} />
        )}

        <div ref={sectionRef} className="mb-4 flex gap-1 border-b border-white/10" role="tablist" aria-label="Designer home">
          {([['designs', 'Your designs'], ['templates', 'Template gallery']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setChosenView(id)}
              className={cx('-mb-px border-b-2 px-3 py-2 text-sm', view === id ? 'border-amber-400 text-slate-100' : 'border-transparent text-slate-400 hover:text-slate-200')}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'templates' ? (
          <TemplateGallery
            makeDocument={newLayoutDocument}
            onUse={startFromTemplate}
            userTemplates={userTemplates}
            onUseOwn={(l) => void copyOwnTemplate(l)}
            onThemeCreated={(message) => { setNotice(message); load(); void customThemes.reload(); }}
            onError={setNotice}
          />
        ) : error ? (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
            {error} <Btn small className="ml-2" onClick={load}>Retry</Btn>
          </div>
        ) : !layouts ? (
          <div className="text-sm text-slate-500" role="status">Loading your designs…</div>
        ) : (
          <DesignLibrary
            layouts={layouts}
            categories={categories}
            themes={customThemes.themes}
            onOpen={open}
            onChange={changeLayouts}
            onNotice={setNotice}
            onThemesChanged={() => void customThemes.reload()}
            onCreate={() => setNewFrom({ source: null, name: 'Untitled design' })}
            onManageCategories={() => setManaging(true)}
          />
        )}
      </div>

      {newFrom && (
        <NewDesignDialog
          from={newFrom}
          categories={categories}
          makeDocument={newLayoutDocument}
          onClose={() => setNewFrom(null)}
          onCreated={open}
        />
      )}
      {managing && <CategoryManager categories={categories} layouts={layouts || []} onClose={() => setManaging(false)} />}
      {importing && (
        <ImportThemeDialog
          onClose={() => setImporting(false)}
          onImported={(theme, warnings) => {
            setImporting(false);
            setNotice([`Imported “${theme.name}” as ${theme.label}. It is ready in DisplayHud.`, ...warnings].join(' '));
            load();
            invalidate(CACHE_KEYS.assets);
            void customThemes.reload();
          }}
        />
      )}
    </div>
  );
}

/** Custom themes (Theme9+) with their filled views; rename + delete. */
function ThemesStrip({ themes, onChanged, onNotice }: { themes: CustomTheme[]; onChanged(): void; onNotice(msg: string): void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const exportTheme = async (t: CustomTheme) => {
    setExporting(t._id);
    try { onNotice(await exportThemeFile(t)); } catch (err) { onNotice(apiErrorMessage(err, 'Export failed')); } finally { setExporting(null); }
  };
  const rename = async (id: string) => {
    try { await themesApi.rename(id, name.trim()); setEditing(null); onChanged(); } catch (err) { onNotice(apiErrorMessage(err, 'Rename failed')); }
  };
  const remove = async (id: string) => {
    try { await themesApi.remove(id); setConfirm(null); onChanged(); } catch (err) { onNotice(apiErrorMessage(err, 'Delete failed')); }
  };
  return (
    <div className="mb-6" data-testid="themes-strip">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Your themes · shown in DisplayHud after Theme1-8</div>
      <div className="flex flex-wrap gap-3">
        {themes.map((t) => (
          <div key={t._id} className="min-w-[220px] rounded-lg border border-violet-400/20 bg-violet-500/[0.06] p-3">
            <div className="flex items-center gap-2">
              <span className="rounded bg-violet-500/25 px-1.5 py-0.5 text-[11px] font-bold text-violet-100">{t.label}</span>
              {editing === t._id ? (
                <input
                  autoFocus
                  className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-xs text-slate-100 outline-none"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) void rename(t._id); if (e.key === 'Escape') setEditing(null); }}
                  onBlur={() => (name.trim() && name.trim() !== t.name ? void rename(t._id) : setEditing(null))}
                />
              ) : (
                <button type="button" className="truncate text-sm font-medium text-slate-100 hover:underline" title="Rename" onClick={() => { setEditing(t._id); setName(t.name); }}>{t.name}</button>
              )}
            </div>
            <div className="mt-1.5 text-[11px] text-slate-400">
              {t.slots.length === 0 ? 'No layouts yet — publish one into this theme.' : t.slots.map((s) => (
                <div key={s.viewKey} className="truncate">
                  <span className="text-slate-300">{viewLabel(s.viewKey)}</span> — {s.name}{s.publishedRev > 0 ? '' : ' (not published)'}
                </div>
              ))}
            </div>
            <div className="mt-2">
              {confirm === t._id ? (
                <span className="flex gap-1">
                  <Btn small danger onClick={() => remove(t._id)}>Delete theme</Btn>
                  <Btn small onClick={() => setConfirm(null)}>Cancel</Btn>
                </span>
              ) : (
                <span className="flex gap-1">
                  <Btn small disabled={exporting === t._id || t.slots.length === 0} onClick={() => exportTheme(t)} title={t.slots.length === 0 ? 'Nothing to export yet' : 'Download the whole theme as one file another account can import'}>
                    {exporting === t._id ? 'Exporting…' : 'Export'}
                  </Btn>
                  <Btn small onClick={() => setConfirm(t._id)} title="Deletes the theme only; its layouts stay">Delete</Btn>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold', className)}>{children}</span>;
}
