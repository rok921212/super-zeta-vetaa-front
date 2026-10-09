// Manage the account's own design categories. Built-in ones are listed but
// fixed. Deleting a category never deletes a design: its designs become
// uncategorised, and the dialog says how many before anything happens.

import React, { useState } from 'react';
import { categoriesApi, apiErrorMessage, type LayoutSummary } from '../api.ts';
import { CACHE_KEYS, invalidate, setCached } from '../requestCache.ts';
import type { CategoryInfo } from '../api.ts';
import { Modal } from '../editor/dialogs.tsx';
import { Btn } from '../editor/ui.tsx';
import { BUILTIN_CATEGORIES, type Categories } from './categories.ts';

export function CategoryManager({ categories, layouts, onClose }: { categories: Categories; layouts: LayoutSummary[]; onClose(): void }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const countIn = (id: string) => layouts.filter((l) => l.categoryId === id).length;
  const setList = (fn: (list: CategoryInfo[]) => CategoryInfo[]) => setCached<CategoryInfo[]>(CACHE_KEYS.categories, (cur) => fn(cur || []));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (e) { setErr(apiErrorMessage(e, 'That did not work')); } finally { setBusy(false); }
  };
  const add = () => run(async () => {
    const made = await categoriesApi.create(name.trim());
    setList((l) => [...l, made].sort((a, b) => a.name.localeCompare(b.name)));
    setName('');
  });
  const rename = () => editing && run(async () => {
    const next = await categoriesApi.rename(editing.id, editing.name.trim());
    setList((l) => l.map((c) => (c._id === next._id ? next : c)).sort((a, b) => a.name.localeCompare(b.name)));
    setEditing(null);
  });
  const remove = (id: string) => run(async () => {
    await categoriesApi.remove(id);
    setList((l) => l.filter((c) => c._id !== id));
    // Its designs changed on the server (they are uncategorised now): refetch the list.
    invalidate(CACHE_KEYS.layouts);
    setConfirm(null);
  });

  const input = 'min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-400/60';
  return (
    <Modal title="Categories" onClose={busy ? undefined : onClose} width={480}>
      <div className="flex flex-col gap-3" data-testid="category-manager">
        <p className="text-[11px] text-slate-400">A category is a label on a design. Moving a design between categories, or deleting a category, never changes or deletes the design.</p>
        <div className="flex gap-2">
          <input
            className={input}
            aria-label="New category name"
            placeholder="New category, for example “Grand Finals”"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && !busy) void add(); }}
          />
          <Btn active disabled={busy || !name.trim()} onClick={() => void add()}>Add</Btn>
        </div>
        {err && <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200" role="alert">{err}</div>}
        {categories.error && <div className="text-[11px] text-amber-200">{categories.error}. <button type="button" className="underline" onClick={() => void categories.reload()}>Retry</button></div>}

        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Yours</div>
          {categories.custom.length === 0 && <div className="text-[11px] text-slate-500">None yet.</div>}
          {categories.custom.map((c) => (
            <div key={c._id} className="flex items-center gap-2 border-b border-white/5 py-1.5">
              {editing?.id === c._id ? (
                <>
                  <input autoFocus aria-label="Category name" className={input} value={editing.name} maxLength={40} onChange={(e) => setEditing({ id: c._id, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && editing.name.trim()) void rename(); if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }} />
                  <Btn small active disabled={busy || !editing.name.trim()} onClick={() => void rename()}>Save</Btn>
                  <Btn small onClick={() => setEditing(null)}>Cancel</Btn>
                </>
              ) : confirm === c._id ? (
                <>
                  <span className="min-w-0 flex-1 text-[11px] text-slate-300">Delete “{c.name}”? {countIn(c._id) ? `Its ${countIn(c._id)} design${countIn(c._id) === 1 ? '' : 's'} become uncategorised.` : 'No design uses it.'}</span>
                  <Btn small danger disabled={busy} onClick={() => void remove(c._id)}>Delete category</Btn>
                  <Btn small onClick={() => setConfirm(null)}>Cancel</Btn>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-100">{c.name}</span>
                  <span className="text-[10px] text-slate-500">{countIn(c._id)} design{countIn(c._id) === 1 ? '' : 's'}</span>
                  <Btn small onClick={() => setEditing({ id: c._id, name: c.name })}>Rename</Btn>
                  <Btn small danger onClick={() => setConfirm(c._id)}>Delete</Btn>
                </>
              )}
            </div>
          ))}
        </div>

        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Built in</div>
          <div className="flex flex-wrap gap-1">
            {BUILTIN_CATEGORIES.map((c) => (
              <span key={c.id} className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">{c.label} <span className="text-slate-500">{countIn(c.id)}</span></span>
            ))}
          </div>
        </div>
        <div className="flex justify-end"><Btn active onClick={onClose} disabled={busy}>Done</Btn></div>
      </div>
    </Modal>
  );
}
