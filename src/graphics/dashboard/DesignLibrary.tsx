// "Your designs": the account's saved designs with search, category / tag
// filters, sorting and status tabs, and everything that can be done to one
// without opening it (rename, file, duplicate, preview, publish, archive,
// export, delete). Every action is a real request; the list only changes after
// the server said yes.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  layoutsApi, overlayUrl, apiErrorMessage, findThemeSlot, LockedError, ValidationError, ConflictError,
  type CustomTheme, type LayoutMetaPatch, type LayoutSummary,
} from '../api.ts';
import { viewLabel } from '../../dashboard/overlayViews.ts';
import { Modal } from '../editor/dialogs.tsx';
import { exportLayoutFile } from '../editor/ImportThemeDialog.tsx';
import { Btn, cx } from '../editor/ui.tsx';
import { aspectLabel } from './canvasPresets.ts';
import { UNCATEGORISED, type Categories } from './categories.ts';
import { DesignThumb } from './DesignThumb.tsx';

export type LibraryTab = 'all' | 'recent' | 'published' | 'drafts' | 'templates' | 'archived';
export type LibrarySort = 'modified' | 'name';

export const LIBRARY_TABS: Array<{ id: LibraryTab; label: string; hint: string }> = [
  { id: 'all', label: 'All', hint: 'Every design that is not archived' },
  { id: 'recent', label: 'Recent', hint: 'The eight you edited last' },
  { id: 'published', label: 'Published', hint: 'Has a revision on air' },
  { id: 'drafts', label: 'Drafts', hint: 'Never published' },
  { id: 'templates', label: 'My templates', hint: 'Designs you saved as starting points' },
  { id: 'archived', label: 'Archived', hint: 'Put away; nothing is deleted' },
];

export const RECENT_COUNT = 8;

export interface LibraryFilter {
  tab: LibraryTab;
  query: string;
  /** 'all', a category id, or UNCATEGORISED. */
  category: string;
  tag: string | null;
  sort: LibrarySort;
}

/** The designs a filter shows, in order (pure: the dashboard and its tests share it). */
export function filterDesigns(layouts: LayoutSummary[], f: LibraryFilter, labelOf: (id: string | null | undefined) => string = () => ''): LayoutSummary[] {
  const q = f.query.trim().toLowerCase();
  const byModified = (a: LayoutSummary, b: LayoutSummary) => b.updatedAt.localeCompare(a.updatedAt);
  let list = layouts.filter((l) => (f.tab === 'archived' ? !!l.archivedAt : !l.archivedAt));
  if (f.tab === 'published') list = list.filter((l) => l.publishedRev > 0);
  if (f.tab === 'drafts') list = list.filter((l) => l.publishedRev === 0);
  if (f.tab === 'templates') list = list.filter((l) => l.isTemplate);
  if (f.tab === 'recent') list = [...list].sort(byModified).slice(0, RECENT_COUNT);
  if (f.category === UNCATEGORISED) list = list.filter((l) => !l.categoryId);
  else if (f.category !== 'all') list = list.filter((l) => l.categoryId === f.category);
  if (f.tag) { const t = f.tag.toLowerCase(); list = list.filter((l) => (l.tags || []).some((x) => x.toLowerCase() === t)); }
  if (q) {
    list = list.filter((l) => [l.name, l.description || '', labelOf(l.categoryId), ...(l.tags || [])].some((s) => s.toLowerCase().includes(q)));
  }
  return [...list].sort(f.sort === 'name' ? (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || byModified(a, b) : byModified);
}

/** Every tag in use, most used first. */
export function tagsOf(layouts: LayoutSummary[]): string[] {
  const count = new Map<string, { tag: string; n: number }>();
  for (const l of layouts) for (const t of l.tags || []) {
    const k = t.toLowerCase();
    const e = count.get(k);
    if (e) e.n++; else count.set(k, { tag: t, n: 1 });
  }
  return Array.from(count.values()).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag)).map((e) => e.tag);
}

/** "a, b ,c" -> ['a', 'b', 'c'] (trimmed, no empties, no repeats ignoring case). */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  return text.split(',').map((t) => t.trim().replace(/\s+/g, ' ')).filter((t) => {
    const k = t.toLowerCase();
    if (!t || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
};

/** Edited after its last publish (what is on air is older than the draft). */
export const hasUnpublishedChanges = (l: LayoutSummary): boolean =>
  l.publishedRev > 0 && !!l.publishedAt && new Date(l.updatedAt).getTime() - new Date(l.publishedAt).getTime() > 2000;

function Chip({ className, children, title }: { className?: string; children: React.ReactNode; title?: string }) {
  return <span title={title} className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold', className)}>{children}</span>;
}

export interface DesignLibraryProps {
  layouts: LayoutSummary[];
  categories: Categories;
  themes: CustomTheme[] | null;
  onOpen(id: string): void;
  /** Replace / add / drop designs in the cached list after a server change. */
  onChange(fn: (list: LayoutSummary[]) => LayoutSummary[]): void;
  onNotice(message: string): void;
  /** A design left a theme slot (deleted). */
  onThemesChanged(): void;
  onCreate(): void;
  onManageCategories(): void;
}

type Dialog =
  | { kind: 'details'; layout: LayoutSummary }
  | { kind: 'delete'; layout: LayoutSummary }
  | { kind: 'preview'; layout: LayoutSummary }
  | { kind: 'publish'; layout: LayoutSummary };

export function DesignLibrary(props: DesignLibraryProps) {
  const { layouts, categories, themes, onChange, onNotice } = props;
  const [filter, setFilter] = useState<LibraryFilter>({ tab: 'all', query: '', category: 'all', tag: null, sort: 'modified' });
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // Canvas sizes learnt from thumbnails, for designs saved before sizes were recorded.
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});

  const shown = useMemo(() => filterDesigns(layouts, filter, categories.labelOf), [layouts, filter, categories.labelOf]);
  const tags = useMemo(() => tagsOf(layouts.filter((l) => !l.archivedAt)), [layouts]);
  const counts = useMemo(() => {
    const out = {} as Record<LibraryTab, number>;
    for (const t of LIBRARY_TABS) out[t.id] = filterDesigns(layouts, { tab: t.id, query: '', category: 'all', tag: null, sort: 'modified' }).length;
    return out;
  }, [layouts]);
  const set = (patch: Partial<LibraryFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const filtered = !!filter.query.trim() || filter.category !== 'all' || !!filter.tag;

  // Close the row menu on any outside click or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement | null)?.closest?.('[data-design-menu]')) setMenu(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key); };
  }, [menu]);

  const replace = (next: LayoutSummary) => onChange((list) => list.map((l) => (l._id === next._id ? { ...l, ...next } : l)));

  /** One metadata change: the card changes only when the server accepted it. */
  const patch = async (l: LayoutSummary, change: LayoutMetaPatch, done?: string): Promise<boolean> => {
    setBusy(l._id);
    setMenu(null);
    try {
      replace(await layoutsApi.patchMeta(l._id, change));
      if (done) onNotice(done);
      return true;
    } catch (err) {
      onNotice(apiErrorMessage(err, 'That change could not be saved'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async (l: LayoutSummary) => {
    setBusy(l._id);
    setMenu(null);
    try {
      const { draft: _draft, ...copy } = await layoutsApi.duplicate(l._id) as LayoutSummary & { draft?: unknown };
      onChange((list) => [copy as LayoutSummary, ...list]);
      onNotice(`Made “${copy.name}”. It is a separate design: editing it never changes “${l.name}”.`);
    } catch (err) { onNotice(apiErrorMessage(err, 'Duplicate failed')); } finally { setBusy(null); }
  };

  const exportOne = async (l: LayoutSummary) => {
    setBusy(l._id);
    setMenu(null);
    try { onNotice(await exportLayoutFile(l)); } catch (err) { onNotice(apiErrorMessage(err, 'Export failed')); } finally { setBusy(null); }
  };

  const remove = async (l: LayoutSummary) => {
    setBusy(l._id);
    setDialog(null);
    try {
      await layoutsApi.remove(l._id);
      onChange((list) => list.filter((x) => x._id !== l._id));
      onNotice(`Deleted “${l.name}”.`);
    } catch (err) {
      onNotice(err instanceof LockedError ? 'That design is production-locked. Unlock it in the editor first.' : apiErrorMessage(err, 'Delete failed'));
    } finally {
      setBusy(null);
      props.onThemesChanged(); // a deleted design leaves its theme slot
    }
  };

  const commitRename = async () => {
    if (!renaming) return;
    const l = layouts.find((x) => x._id === renaming.id);
    const name = renaming.name.trim();
    setRenaming(null);
    if (l && name && name !== l.name) await patch(l, { name });
  };

  const sizeOf = (l: LayoutSummary) => l.stage || sizes[l._id] || null;

  return (
    <div data-testid="design-library">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Your designs</div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Show">
          {LIBRARY_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filter.tab === t.id}
              title={t.hint}
              onClick={() => set({ tab: t.id })}
              className={cx('rounded px-2 py-1 text-[11px]', filter.tab === t.id ? 'bg-amber-400/20 text-amber-100' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200')}
            >
              {t.label} <span className="text-slate-500">{counts[t.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search designs"
          placeholder="Search by name, tag or category"
          className="w-64 max-w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-amber-400/60"
          value={filter.query}
          onChange={(e) => set({ query: e.target.value })}
        />
        <select
          aria-label="Category filter"
          className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-amber-400/60"
          value={filter.category}
          onChange={(e) => set({ category: e.target.value })}
        >
          <option value="all">All categories</option>
          {categories.all.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          <option value={UNCATEGORISED}>Uncategorised</option>
        </select>
        <select
          aria-label="Sort"
          className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-amber-400/60"
          value={filter.sort}
          onChange={(e) => set({ sort: e.target.value as LibrarySort })}
        >
          <option value="modified">Last modified</option>
          <option value="name">Name</option>
        </select>
        <Btn small onClick={props.onManageCategories} title="Add, rename or delete your own categories">Categories…</Btn>
        {filtered && <Btn small onClick={() => set({ query: '', category: 'all', tag: null })}>Clear filters</Btn>}
        <span className="ml-auto text-[11px] text-slate-500" data-testid="library-count">{shown.length} of {counts[filter.tab]}</span>
      </div>

      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
          <span>Tags</span>
          {tags.slice(0, 24).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={filter.tag === t}
              onClick={() => set({ tag: filter.tag === t ? null : t })}
              className={cx('rounded-full border px-2 py-[1px]', filter.tag === t ? 'border-amber-400/60 bg-amber-400/15 text-amber-100' : 'border-white/10 text-slate-300 hover:bg-white/5')}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 && (
        <div className="rounded border border-dashed border-white/10 p-10 text-center" data-testid="library-empty">
          {layouts.length === 0 ? (
            <>
              <div className="mb-1 text-sm text-slate-300">No designs yet.</div>
              <div className="mb-3 text-xs text-slate-500">Start from a template, or draw one from nothing.</div>
              <Btn active onClick={props.onCreate}>Create a blank design</Btn>
            </>
          ) : filtered ? (
            <>
              <div className="mb-2 text-sm text-slate-300">Nothing matches these filters.</div>
              <Btn onClick={() => set({ query: '', category: 'all', tag: null })}>Clear filters</Btn>
            </>
          ) : (
            <div className="text-sm text-slate-400">{EMPTY_TAB[filter.tab]}</div>
          )}
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="layout-grid">
          {shown.map((l) => {
            const slot = themes ? findThemeSlot(themes, l._id) : null;
            const size = sizeOf(l);
            const working = busy === l._id;
            return (
              <div key={l._id} className={cx('flex flex-col overflow-hidden rounded-lg border bg-neutral-900/70', l.archivedAt ? 'border-white/5 opacity-80' : 'border-white/10')} data-design-id={l._id}>
                <button type="button" onClick={() => props.onOpen(l._id)} className="relative block aspect-video border-b border-white/5 text-left" aria-label={`Open ${l.name}`}>
                  <DesignThumb layout={l} onSize={l.stage ? undefined : (s) => setSizes((cur) => (cur[l._id] ? cur : { ...cur, [l._id]: s }))} />
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {renaming?.id === l._id ? (
                        <input
                          autoFocus
                          aria-label="Design name"
                          className="w-full rounded border border-amber-400/50 bg-black/40 px-1.5 py-0.5 text-sm text-slate-100 outline-none"
                          value={renaming.name}
                          maxLength={120}
                          onChange={(e) => setRenaming({ id: l._id, name: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') void commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                          onBlur={() => void commitRename()}
                        />
                      ) : (
                        <button type="button" className="block max-w-full truncate text-left text-sm font-semibold text-slate-100 hover:underline" title={`${l.name} (click to rename)`} onClick={() => setRenaming({ id: l._id, name: l.name })}>
                          {l.name}
                        </button>
                      )}
                      <div className="truncate text-[11px] text-slate-500">
                        {categories.labelOf(l.categoryId)}
                        {size && <> · {size.width} × {size.height} <span className="text-slate-600">({aspectLabel(size.width, size.height)})</span></>}
                      </div>
                      <div className="text-[11px] text-slate-500">Saved {ago(l.updatedAt)}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {l.publishedRev > 0
                        ? <Chip className="bg-emerald-500/15 text-emerald-200">Published · rev {l.publishedRev}</Chip>
                        : <Chip className="bg-white/10 text-slate-300">Draft</Chip>}
                      {hasUnpublishedChanges(l) && <Chip className="bg-amber-500/15 text-amber-200" title="The draft was saved after the last publish. What is on air is still the published revision.">Unpublished changes</Chip>}
                      {l.productionLocked && <Chip className="bg-sky-500/15 text-sky-200">🔒 Locked</Chip>}
                      {l.isTemplate && <Chip className="bg-fuchsia-500/15 text-fuchsia-200">Template</Chip>}
                      {l.archivedAt && <Chip className="bg-white/10 text-slate-400">Archived</Chip>}
                      {slot && <Chip className="bg-violet-500/15 text-violet-200">{slot.theme.label} · {viewLabel(slot.slot.viewKey)}</Chip>}
                    </div>
                  </div>
                  {l.description && <div className="line-clamp-2 text-[11px] text-slate-400" title={l.description}>{l.description}</div>}
                  {(l.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(l.tags || []).map((t) => (
                        <button key={t} type="button" onClick={() => set({ tag: t })} className="rounded-full border border-white/10 px-1.5 text-[10px] text-slate-400 hover:bg-white/5">{t}</button>
                      ))}
                    </div>
                  )}
                  {l.publishedRev > 0 && <div className="truncate font-mono text-[10px] text-slate-500" title={overlayUrl(l.publicId)}>/o/{l.publicId}</div>}
                  <div className="relative mt-auto flex flex-wrap items-center gap-1.5 pt-1" data-design-menu>
                    <Btn small active onClick={() => props.onOpen(l._id)}>Edit</Btn>
                    <Btn small onClick={() => setDialog({ kind: 'preview', layout: l })}>Preview</Btn>
                    <Btn small disabled={working || l.productionLocked || !!l.archivedAt} onClick={() => setDialog({ kind: 'publish', layout: l })} title={l.productionLocked ? 'Unlock it first' : l.archivedAt ? 'Restore it first' : 'Publish the saved draft as a new revision'}>
                      {l.publishedRev > 0 ? 'Republish' : 'Publish'}
                    </Btn>
                    <Btn small className="ml-auto" disabled={working} aria-haspopup="menu" aria-expanded={menu === l._id} aria-label={`More actions for ${l.name}`} onClick={() => setMenu(menu === l._id ? null : l._id)}>{working ? '…' : '⋯'}</Btn>
                    {menu === l._id && (
                      <div role="menu" className="absolute bottom-8 right-0 z-30 w-52 overflow-hidden rounded border border-white/10 bg-neutral-950 py-1 text-xs shadow-2xl">
                        <MenuItem onClick={() => { setMenu(null); setRenaming({ id: l._id, name: l.name }); }}>Rename</MenuItem>
                        <MenuItem onClick={() => { setMenu(null); setDialog({ kind: 'details', layout: l }); }}>Category, tags, description…</MenuItem>
                        <MenuItem onClick={() => void duplicate(l)}>Duplicate</MenuItem>
                        <MenuItem onClick={() => void patch(l, { isTemplate: !l.isTemplate }, l.isTemplate ? `“${l.name}” is no longer a template.` : `“${l.name}” is now under Custom templates in the gallery.`)}>
                          {l.isTemplate ? 'Remove from my templates' : 'Save as template'}
                        </MenuItem>
                        <MenuItem onClick={() => void exportOne(l)}>Export as theme file</MenuItem>
                        <div className="my-1 border-t border-white/5" />
                        {l.archivedAt
                          ? <MenuItem onClick={() => void patch(l, { archived: false }, `Restored “${l.name}”.`)}>Restore from archive</MenuItem>
                          : <MenuItem onClick={() => void patch(l, { archived: true }, `Archived “${l.name}”. It is under Archived; nothing was deleted${l.publishedRev > 0 ? ' and its published overlay keeps working' : ''}.`)}>Archive</MenuItem>}
                        <MenuItem danger disabled={l.productionLocked} title={l.productionLocked ? 'Unlock it first' : undefined} onClick={() => { setMenu(null); setDialog({ kind: 'delete', layout: l }); }}>Delete…</MenuItem>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialog?.kind === 'details' && (
        <DetailsDialog
          layout={dialog.layout}
          categories={categories}
          onClose={() => setDialog(null)}
          onSave={async (change) => { if (await patch(dialog.layout, change)) setDialog(null); }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <Modal title="Delete this design?" onClose={() => setDialog(null)} width={460}>
          <p className="mb-2 text-sm text-slate-200">“{dialog.layout.name}”</p>
          <p className="mb-4 text-xs text-slate-400">
            The design, its draft and all {dialog.layout.publishedRev} published revision{dialog.layout.publishedRev === 1 ? '' : 's'} are removed.
            {dialog.layout.publishedRev > 0 && <> Any OBS source using <span className="font-mono text-slate-300">/o/{dialog.layout.publicId}</span> goes blank.</>} This cannot be undone. To put it away instead, use Archive.
          </p>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setDialog(null)}>Cancel</Btn>
            <Btn danger onClick={() => void remove(dialog.layout)} data-testid="confirm-delete">Delete design</Btn>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'preview' && <PreviewDialog layout={dialog.layout} onClose={() => setDialog(null)} onOpen={() => props.onOpen(dialog.layout._id)} />}
      {dialog?.kind === 'publish' && (
        <QuickPublishDialog
          layout={dialog.layout}
          size={sizeOf(dialog.layout)}
          onClose={() => setDialog(null)}
          onOpen={() => props.onOpen(dialog.layout._id)}
          onPublished={(next) => { replace(next); onNotice(`Published “${next.name}” as revision ${next.publishedRev}.`); }}
        />
      )}
    </div>
  );
}

const EMPTY_TAB: Record<LibraryTab, string> = {
  all: 'No designs here.',
  recent: 'Nothing edited yet.',
  published: 'Nothing is published yet. Open a design and press Publish.',
  drafts: 'No unpublished drafts.',
  templates: 'No templates of your own yet. Use “Save as template” on a design to keep it as a starting point.',
  archived: 'Nothing is archived.',
};

function MenuItem({ children, onClick, danger, disabled, title }: { children: React.ReactNode; onClick(): void; danger?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cx('block w-full px-3 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-40', danger ? 'text-red-300 hover:bg-red-500/15' : 'text-slate-200 hover:bg-white/10')}
    >
      {children}
    </button>
  );
}

function DetailsDialog({ layout, categories, onClose, onSave }: {
  layout: LayoutSummary; categories: Categories; onClose(): void; onSave(change: LayoutMetaPatch): Promise<void>;
}) {
  const [name, setName] = useState(layout.name);
  const [description, setDescription] = useState(layout.description || '');
  const [categoryId, setCategoryId] = useState(layout.categoryId || '');
  const [tags, setTags] = useState((layout.tags || []).join(', '));
  const [saving, setSaving] = useState(false);
  const parsed = parseTags(tags);
  const problem = !name.trim() ? 'A design needs a name' : parsed.length > 12 ? 'At most 12 tags' : parsed.some((t) => t.length > 30) ? 'A tag can be at most 30 characters' : null;
  const input = 'rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm normal-case tracking-normal text-slate-100 outline-none focus:border-amber-400/60';
  const label = 'flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400';
  const save = async () => {
    if (problem) return;
    setSaving(true);
    await onSave({ name: name.trim(), description: description.trim(), categoryId: categoryId || null, tags: parsed });
    setSaving(false);
  };
  return (
    <Modal title="Design details" onClose={saving ? undefined : onClose} width={480}>
      <div className="flex flex-col gap-3" data-testid="details-dialog">
        <label className={label}>Name<input aria-label="Name" className={input} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <label className={label}>
          Category
          <select aria-label="Category" className={input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorised</option>
            {categories.all.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className={label}>
          Tags
          <input aria-label="Tags" className={input} value={tags} placeholder="finals, blue, sponsor" onChange={(e) => setTags(e.target.value)} />
          <span className="text-[10px] normal-case tracking-normal text-slate-500">Separate with commas.</span>
        </label>
        <label className={label}>
          Description
          <textarea aria-label="Description" className={cx(input, 'min-h-[64px]')} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {problem && <div className="text-[11px] text-red-300">{problem}</div>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn active disabled={saving || !!problem} onClick={save}>{saving ? 'Saving…' : 'Save'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function PreviewDialog({ layout, onClose, onOpen }: { layout: LayoutSummary; onClose(): void; onOpen(): void }) {
  const url = layout.publishedRev > 0 ? overlayUrl(layout.publicId, { t: layout.defaults?.tournamentId, r: layout.defaults?.roundId, mode: layout.defaults?.matchMode }) : null;
  return (
    <Modal title={`Preview · ${layout.name}`} onClose={onClose} width={960}>
      <div className="aspect-video w-full overflow-hidden rounded border border-white/10">
        <DesignThumb layout={layout} />
      </div>
      <div className="mt-2 text-[11px] text-slate-500">
        The saved draft, drawn still on sample data. {layout.publishedRev > 0 ? `Revision ${layout.publishedRev} is what OBS shows${hasUnpublishedChanges(layout) ? '; this draft is newer.' : '.'}` : 'It is not published yet.'}
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {url && <Btn onClick={() => window.open(url, '_blank', 'noopener')}>Open published output</Btn>}
        <Btn onClick={onOpen}>Open in editor</Btn>
        <Btn active onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}

/** Publish the saved draft straight from the library. Validation is the server's (the same checks as in the editor). */
function QuickPublishDialog({ layout, size, onClose, onOpen, onPublished }: {
  layout: LayoutSummary; size: { width: number; height: number } | null; onClose(): void; onOpen(): void; onPublished(next: LayoutSummary): void;
}) {
  const [phase, setPhase] = useState<'confirm' | 'publishing' | 'done' | 'error'>('confirm');
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Array<{ path: string; message: string }>>([]);
  const [rev, setRev] = useState(layout.publishedRev);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const go = async () => {
    setPhase('publishing');
    try {
      const next = await layoutsApi.publish(layout._id, layout.draftRev);
      if (!alive.current) return;
      setRev(next.publishedRev);
      onPublished(next);
      setPhase('done');
    } catch (err) {
      if (!alive.current) return;
      setErrors(err instanceof ValidationError ? err.errors : []);
      setMessage(
        err instanceof ValidationError ? 'The server found problems in this design. Open it in the editor to fix them.'
          : err instanceof ConflictError ? 'This design was saved somewhere else a moment ago. Refresh the page and try again.'
            : apiErrorMessage(err, 'Publish failed')
      );
      setPhase('error');
    }
  };
  return (
    <Modal title={phase === 'done' ? 'Published' : `${layout.publishedRev > 0 ? 'Republish' : 'Publish'} design`} onClose={phase === 'publishing' ? undefined : onClose} width={500}>
      <div className="flex flex-col gap-3" data-testid="quick-publish">
        <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-xs">
          <dt className="text-slate-500">Design</dt><dd className="text-slate-100">{layout.name}</dd>
          <dt className="text-slate-500">Revision</dt><dd className="text-slate-100">{phase === 'done' ? `${rev} (on air)` : `${layout.publishedRev + 1}${layout.publishedRev > 0 ? `, replacing ${layout.publishedRev} on air` : ''}`}</dd>
          <dt className="text-slate-500">Canvas</dt><dd className="text-slate-100">{size ? `${size.width} × ${size.height}` : 'as saved'}</dd>
        </dl>
        {phase === 'confirm' && <div className="text-[11px] text-slate-400">The draft as last saved becomes an immutable revision. Earlier revisions are kept, and later edits stay in the draft until you publish again.</div>}
        {phase === 'error' && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-200" role="alert">
            <div className="font-semibold">{message}</div>
            {errors.slice(0, 8).map((e, i) => <div key={i}><span className="font-mono text-red-300">{e.path}</span> {e.message}</div>)}
          </div>
        )}
        {phase === 'done' && <div className="break-all rounded border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-slate-100">{overlayUrl(layout.publicId, { t: layout.defaults?.tournamentId, r: layout.defaults?.roundId, mode: layout.defaults?.matchMode })}</div>}
        <div className="flex justify-end gap-2">
          {phase === 'error' && <Btn onClick={onOpen}>Open in editor</Btn>}
          <Btn onClick={onClose} disabled={phase === 'publishing'}>{phase === 'done' ? 'Done' : 'Cancel'}</Btn>
          {phase !== 'done' && <Btn active disabled={phase === 'publishing'} onClick={go}>{phase === 'publishing' ? 'Publishing…' : phase === 'error' ? 'Try again' : 'Publish'}</Btn>}
        </div>
      </div>
    </Modal>
  );
}
