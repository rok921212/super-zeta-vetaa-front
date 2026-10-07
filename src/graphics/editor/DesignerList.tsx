// /designer — the signed-in user's overlay layouts (the API is owner-scoped,
// so another account's layouts can never appear here), plus "Create Layout"
// from a blank stage or one of the starter templates.

import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../dashboard/Navbar';
import type { LayoutDocument } from '../schema/layoutTypes.ts';
import { createEmptyLayout } from '../schema/layoutSchema.js';
import { layoutsApi, themesApi, overlayUrl, apiErrorMessage, findThemeSlot, LockedError, type CustomTheme, type LayoutSummary } from '../api.ts';
import { useCustomThemes } from './ThemeAssign.tsx';
import { CACHE_KEYS, invalidate, setCached, useCached } from '../requestCache.ts';
import { viewLabel } from '../../dashboard/overlayViews.ts';
import { TEMPLATES } from '../templates/index.ts';
import { cloneWithNewIds } from './ids.ts';
import { createBuiltinElement } from './BuiltinBrowser.tsx';
import { builtinLabel, listBuiltinGraphics } from '../../Themes/registry.ts';
import { Modal } from './dialogs.tsx';
import { ImportThemeDialog, exportLayoutFile, exportThemeFile } from './ImportThemeDialog.tsx';
import { Btn, cx } from './ui.tsx';
import { InfoButton } from './Help.tsx';
import TemplateGallery from './TemplateGallery.tsx';

/** A new layout document: empty stage, optionally seeded with a template's elements. */
/**
 * A new layout document: empty stage, seeded with a starter template's
 * elements ("lower-third") or ONE full-stage built-in graphic ("builtin:Theme6/alerts").
 */
export function newLayoutDocument(source: string | null): LayoutDocument {
  const doc = createEmptyLayout() as LayoutDocument;
  if (source && source.startsWith('builtin:')) {
    const [theme, view] = source.slice(8).split('/');
    doc.elements = [createBuiltinElement({ theme, view, label: builtinLabel(view) }, doc)];
    return doc;
  }
  const t = source ? TEMPLATES.find((x) => x.id === source) : null;
  if (t) doc.elements = cloneWithNewIds(t.elements, []);
  return doc;
}

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
};

export default function DesignerList() {
  const navigate = useNavigate();
  // Cached: coming back from the editor only refetches if something was saved meanwhile
  // (the editor invalidates this key on save / publish / lock).
  const listQuery = useCached<LayoutSummary[]>(CACHE_KEYS.layouts, () => layoutsApi.list());
  const layouts = useMemo(() => (listQuery.data ? [...listQuery.data].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : null), [listQuery.data]);
  const setLayouts = (fn: (l: LayoutSummary[] | null) => LayoutSummary[] | null) => setCached<LayoutSummary[]>(CACHE_KEYS.layouts, (cur) => fn(cur ?? null) ?? []);
  const error = listQuery.error && !listQuery.data ? apiErrorMessage(listQuery.error, 'Could not load your layouts') : null;
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const customThemes = useCustomThemes();

  const load = useCallback(() => { void listQuery.reload(); }, [listQuery.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const duplicate = async (id: string) => {
    setBusy(id);
    try {
      const copy = await layoutsApi.duplicate(id);
      setLayouts((l) => (l ? [copy, ...l] : [copy]));
    } catch (err) { setNotice(apiErrorMessage(err, 'Duplicate failed')); } finally { setBusy(null); }
  };

  const exportLayout = async (l: LayoutSummary) => {
    setBusy(l._id);
    try { setNotice(await exportLayoutFile(l)); } catch (err) { setNotice(apiErrorMessage(err, 'Export failed')); } finally { setBusy(null); }
  };

  const remove = async (id: string) => {
    setBusy(id);
    setConfirmDelete(null);
    try {
      await layoutsApi.remove(id);
      setLayouts((l) => l?.filter((x) => x._id !== id) ?? null);
    } catch (err) {
      setNotice(err instanceof LockedError ? 'That layout is production-locked — unlock it in the editor first.' : apiErrorMessage(err, 'Delete failed'));
    } finally {
      setBusy(null);
      void customThemes.reload(); // a deleted layout leaves its theme slot
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-slate-200">
      <Navbar active="designer" brandText="DESIGNER" />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Overlay Designer</h1>
            <p className="mt-1 text-sm text-slate-400">Design broadcast overlays on live data, publish them, and add the URL to OBS as a Browser Source.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <InfoButton topic="share" label="Export / import" />
            <button
              type="button"
              onClick={() => setImporting(true)}
              title="Import a theme file (.sstheme) into your account"
              className="rounded border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Import theme
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded border border-red-500/60 bg-red-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
            >
              + Create Layout
            </button>
          </div>
        </div>

        {notice && (
          <div className="mb-4 flex items-center gap-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {notice}
            <button type="button" className="ml-auto" onClick={() => setNotice(null)}>✕</button>
          </div>
        )}

        {error && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error} <Btn small className="ml-2" onClick={load}>Retry</Btn>
          </div>
        )}
        {!layouts && !error && <div className="text-sm text-slate-500">Loading layouts…</div>}
        {layouts && layouts.length === 0 && (
          <div className="rounded border border-dashed border-white/10 p-10 text-center">
            <div className="mb-2 text-sm text-slate-300">No layouts yet.</div>
            <Btn onClick={() => setCreating(true)}>Create your first layout</Btn>
          </div>
        )}

        {customThemes.themes && customThemes.themes.length > 0 && (
          <ThemesStrip themes={customThemes.themes} onChanged={() => void customThemes.reload()} onNotice={setNotice} />
        )}

        <TemplateGallery
          makeDocument={newLayoutDocument}
          onOpen={(id) => navigate(`/designer/${id}`)}
          onThemeCreated={(message) => { setNotice(message); load(); void customThemes.reload(); }}
          onError={setNotice}
        />

        {layouts && layouts.length > 0 && (
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Your layouts</div>
        )}
        {layouts && layouts.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="layout-grid">
            {layouts.map((l) => (
              <div key={l._id} className="flex flex-col overflow-hidden rounded-lg border border-white/10 bg-neutral-900/70">
                <button
                  type="button"
                  onClick={() => navigate(`/designer/${l._id}`)}
                  className="relative flex aspect-video items-center justify-center border-b border-white/5 text-left"
                  style={{ backgroundColor: '#15151a', backgroundImage: 'linear-gradient(45deg,#1c1c22 25%,transparent 25%),linear-gradient(-45deg,#1c1c22 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1c1c22 75%),linear-gradient(-45deg,transparent 75%,#1c1c22 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0' }}
                  aria-label={`Open ${l.name}`}
                >
                  <span className="text-2xl font-semibold tracking-wide text-white/15">{l.name.slice(0, 2).toUpperCase()}</span>
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-100" title={l.name}>{l.name}</div>
                      <div className="text-[11px] text-slate-500">Updated {ago(l.updatedAt)}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {l.productionLocked && <Chip className="bg-sky-500/15 text-sky-200">🔒 Locked</Chip>}
                      {(() => {
                        const slot = customThemes.themes ? findThemeSlot(customThemes.themes, l._id) : null;
                        return slot ? <Chip className="bg-violet-500/15 text-violet-200">{slot.theme.label} · {viewLabel(slot.slot.viewKey)}</Chip> : null;
                      })()}
                      {l.publishedRev > 0
                        ? <Chip className="bg-emerald-500/15 text-emerald-200">Published · rev {l.publishedRev}</Chip>
                        : <Chip className="bg-white/10 text-slate-300">Draft</Chip>}
                    </div>
                  </div>
                  {l.publishedRev > 0 && (
                    <div className="truncate font-mono text-[10px] text-slate-500" title={overlayUrl(l.publicId)}>/o/{l.publicId}</div>
                  )}
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    <Btn small active onClick={() => navigate(`/designer/${l._id}`)}>Edit</Btn>
                    <Btn small disabled={busy === l._id} onClick={() => duplicate(l._id)}>Duplicate</Btn>
                    <Btn small disabled={busy === l._id} onClick={() => exportLayout(l)} title="Download this layout as a theme file another account can import">Export</Btn>
                    {confirmDelete === l._id ? (
                      <>
                        <Btn small danger disabled={busy === l._id} onClick={() => remove(l._id)}>Confirm delete</Btn>
                        <Btn small onClick={() => setConfirmDelete(null)}>Cancel</Btn>
                      </>
                    ) : (
                      <Btn small danger disabled={busy === l._id || l.productionLocked} title={l.productionLocked ? 'Unlock it first' : undefined} onClick={() => setConfirmDelete(l._id)}>Delete</Btn>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {creating && <CreateLayoutDialog onClose={() => setCreating(false)} onCreated={(id) => navigate(`/designer/${id}`)} />}
      {importing && (
        <ImportThemeDialog
          onClose={() => setImporting(false)}
          onImported={(theme, warnings) => {
            setImporting(false);
            setNotice([`Imported “${theme.name}” as ${theme.label} — it is ready in DisplayHud.`, ...warnings].join(' '));
            load();
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

function CreateLayoutDialog({ onClose, onCreated }: { onClose(): void; onCreated(id: string): void }) {
  const [name, setName] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [tab, setTab] = useState<'templates' | 'builtin'>('templates');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const builtins = useMemo(() => listBuiltinGraphics(), []);
  const templateOptions: Array<{ id: string | null; name: string; description: string }> = [
    { id: null, name: 'Blank', description: 'An empty 1920×1080 transparent stage — draw anything.' },
    ...TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description })),
  ];
  const builtinOptions = builtins
    .filter((g) => !query || `${g.theme} ${g.label} ${g.view}`.toLowerCase().includes(query.toLowerCase()))
    .map((g) => ({ id: `builtin:${g.theme}/${g.view}`, name: `${g.theme} · ${g.label}`, description: `${g.group} · live graphic` }));
  const defaultName = source?.startsWith('builtin:')
    ? builtinOptions.find((o) => o.id === source)?.name || source.slice(8)
    : templateOptions.find((o) => o.id === source)?.name || 'Untitled overlay';

  const create = async () => {
    setSaving(true);
    setErr(null);
    try {
      const full = await layoutsApi.create({ name: name.trim() || defaultName, draft: newLayoutDocument(source) });
      invalidate(CACHE_KEYS.layouts);
      onCreated(full._id);
    } catch (e: any) {
      setErr(apiErrorMessage(e, 'Could not create the layout'));
      setSaving(false);
    }
  };
  const options = tab === 'templates' ? templateOptions : builtinOptions;
  return (
    <Modal title="Create layout" onClose={onClose} width={720}>
      <label className="mb-3 flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
        Name
        <input
          autoFocus
          className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm normal-case tracking-normal text-slate-100 outline-none focus:border-amber-400/60"
          value={name}
          maxLength={120}
          placeholder={defaultName}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !saving) void create(); }}
        />
      </label>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">Start from</span>
        <Btn small active={tab === 'templates'} onClick={() => setTab('templates')}>Editable templates ({templateOptions.length})</Btn>
        <Btn small active={tab === 'builtin'} onClick={() => setTab('builtin')}>Built-in graphics ({builtins.length})</Btn>
        {tab === 'builtin' && (
          <input
            className="ml-auto w-48 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-400/60"
            placeholder="Search Alerts, Recall, Theme6…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>
      <div className="mb-4 grid max-h-[50vh] gap-2 overflow-auto sm:grid-cols-2" role="radiogroup">
        {options.map((o) => (
          <button
            key={o.id ?? 'blank'}
            type="button"
            role="radio"
            aria-checked={source === o.id}
            onClick={() => setSource(o.id)}
            className={cx(
              'rounded border p-3 text-left',
              source === o.id ? 'border-amber-400/70 bg-amber-400/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
            )}
          >
            <div className="text-sm font-medium text-slate-100">{o.name}</div>
            <div className="text-[11px] text-slate-500">{o.description}</div>
          </button>
        ))}
        {options.length === 0 && <div className="text-xs text-slate-500">Nothing matches “{query}”.</div>}
      </div>
      {err && <div className="mb-3 text-xs text-red-300">{err}</div>}
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn active disabled={saving} onClick={create}>{saving ? 'Creating…' : 'Create & open'}</Btn>
      </div>
    </Modal>
  );
}
