// Insert panel: element kinds (Basic / Data / Advanced) and the starter
// templates. Inserts into the selected group/repeater, next to a selected
// layer inside a group (so editing a template adds to the template), else at
// the top of the stage.

import React, { memo, useState } from 'react';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { INSERT_CATEGORIES, createElement, type InsertKind } from './elementFactory.ts';
import { TEMPLATES } from '../templates/index.ts';
import { cloneWithNewIds } from './ids.ts';
import { locate } from './tree.ts';
import { insertionTarget } from './ops.ts';
import { Section, cx } from './ui.tsx';
import { PARTS } from '../templates/parts.ts';
import { placePart } from './partPlacement.ts';
import { useInsertMemory } from './insertMemory.ts';

const KIND_ITEMS = INSERT_CATEGORIES.flatMap((c) => c.items);

/** A ☆ / ★ in the corner of an insert card (a sibling of the card button: buttons cannot nest). */
function Star({ on, onClick, name }: { on: boolean; onClick(): void; name: string }) {
  return (
    <button
      type="button"
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      aria-pressed={on}
      onClick={onClick}
      className={cx('absolute right-1 top-1 text-[11px] leading-none', on ? 'text-amber-300' : 'text-slate-600 hover:text-slate-300')}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

export interface InsertPanelProps {
  doc: LayoutDocument;
  selected: string[];
  disabled?: boolean;
  onInsert(els: LayoutElement[], parentId: string | null, index?: number | null): void;
  /** Open Import from CSS on its HTML + CSS layer tab. */
  onImportCss?(): void;
  /** Opens the code layer editor (.ssx: HTML + CSS + JavaScript / TSX). */
  onImportCode?(): void;
  /** A short message for the user (a part was wrapped in a new list…). */
  onNote?(message: string): void;
}

/** Where new elements go (see ops.insertionTarget), plus the parent's area to place them in. */
export function insertTarget(doc: LayoutDocument, selected: string[]): { parentId: string | null; index: number | null; area?: { w: number; h: number } } {
  const t = insertionTarget(doc, selected);
  const el = t.parentId ? locate(doc.elements, t.parentId)?.el : null;
  if (!el) return { parentId: null, index: null };
  const area = el.type === 'repeater' && el.repeater
    ? { w: el.repeater.itemWidth || el.w, h: el.repeater.itemHeight || el.h }
    : { w: el.w, h: el.h };
  return { parentId: el.id, index: t.index, area };
}

export const InsertPanel = memo(function InsertPanel({ doc, selected, disabled, onInsert, onImportCss, onImportCode, onNote }: InsertPanelProps) {
  const [partQuery, setPartQuery] = useState('');
  const { memory, used, toggleFavorite } = useInsertMemory();
  const fav = (key: string) => memory.favorites.includes(key);
  const target = insertTarget(doc, selected);
  const targetName = target.parentId ? locate(doc.elements, target.parentId)?.el.name || target.parentId : null;

  const insertKind = (kind: InsertKind) => {
    onInsert([createElement(kind, doc, target.area)], target.parentId, target.index);
    used(`kind:${kind}`);
  };

  const insertPart = (id: string) => {
    const placed = placePart(id, doc, selected);
    onInsert([placed.el], placed.parentId, placed.index);
    if (placed.note) onNote?.(placed.note);
    used(`part:${id}`);
  };
  const q = partQuery.trim().toLowerCase();
  const parts = q ? PARTS.filter((p) => `${p.name} ${p.hint} ${p.badges.join(' ')}`.toLowerCase().includes(q)) : PARTS;
  const categories = INSERT_CATEGORIES.map((c) => ({ ...c, items: q ? c.items.filter((it) => `${it.label} ${it.hint}`.toLowerCase().includes(q)) : c.items })).filter((c) => c.items.length);

  // Favourites first, then recent ones that are not favourites; keys of items that no longer exist are skipped.
  const quick = [...memory.favorites, ...memory.recent.filter((k) => !memory.favorites.includes(k))].flatMap((key) => {
    const [type, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (type === 'kind') { const it = KIND_ITEMS.find((i) => i.kind === id); return it ? [{ key, label: it.label, run: () => insertKind(it.kind) }] : []; }
    if (type === 'part') { const p = PARTS.find((x) => x.id === id); return p ? [{ key, label: p.name, run: () => insertPart(p.id) }] : []; }
    return [];
  });

  return (
    <div className="flex flex-col">
      {targetName && (
        <div className="border-b border-white/5 px-3 py-2 text-[10px] text-amber-200/80">Inserting into “{targetName}”</div>
      )}
      <div className="border-b border-white/5 p-2">
        <input
          aria-label="Search elements and live parts"
          value={partQuery}
          placeholder="Search: text, team list, dead, recall…"
          onChange={(e) => setPartQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-amber-400/60"
        />
      </div>
      {quick.length > 0 && !q && (
        <Section title="Favourites and recent">
          <div className="flex flex-wrap gap-1" data-testid="insert-quick">
            {quick.map((it) => (
              <button
                key={it.key}
                type="button"
                disabled={disabled}
                onClick={it.run}
                className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-[2px] text-[10px] text-slate-200 hover:border-amber-400/50 hover:bg-amber-400/10 disabled:opacity-40"
              >
                {fav(it.key) && <span className="text-amber-300">★ </span>}{it.label}
              </button>
            ))}
          </div>
        </Section>
      )}
      <Section title="Live parts" help="liveParts">
        <div className="flex flex-col gap-1.5" data-testid="live-parts">
          {parts.map((p) => (
            <div key={p.id} className="relative">
            <button
              type="button"
              disabled={disabled}
              data-part={p.id}
              title={p.needs === 'none' ? p.hint : `${p.hint}. Reads a ${p.needs} row: select a ${p.needs === 'team' ? 'team' : 'player'} list first, or it gets one of its own.`}
              onClick={() => insertPart(p.id)}
              className="w-full rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 pr-5 text-left hover:border-amber-400/50 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div className="text-[11px] font-medium text-slate-200">{p.name}</div>
              <div className="truncate text-[10px] text-slate-500">{p.hint}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {p.badges.map((b) => <span key={b} className="rounded bg-amber-400/10 px-1 text-[9px] font-semibold uppercase text-amber-200/90">{b}</span>)}
              </div>
            </button>
            <Star on={fav(`part:${p.id}`)} name={p.name} onClick={() => toggleFavorite(`part:${p.id}`)} />
            </div>
          ))}
          {!parts.length && <div className="text-[10px] text-slate-500">No part matches “{partQuery}”.</div>}
        </div>
      </Section>
      {categories.map((cat) => (
        <Section key={cat.title} title={cat.title}>
          <div className="grid grid-cols-2 gap-1.5">
            {cat.items.map((it) => (
              <div key={it.kind} className="relative">
              <button
                type="button"
                disabled={disabled}
                title={it.hint}
                onClick={() => insertKind(it.kind)}
                className={cx(
                  'w-full rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 pr-4 text-left text-[11px] text-slate-200 hover:border-amber-400/50 hover:bg-amber-400/10',
                  'disabled:cursor-not-allowed disabled:opacity-40'
                )}
              >
                <div className="font-medium">{it.label}</div>
                <div className="truncate text-[10px] text-slate-500">{it.hint}</div>
              </button>
              <Star on={fav(`kind:${it.kind}`)} name={it.label} onClick={() => toggleFavorite(`kind:${it.kind}`)} />
              </div>
            ))}
          </div>
        </Section>
      ))}
      {onImportCss && (
        <Section title="Code">
          <button
            type="button"
            disabled={disabled}
            title="Write or paste HTML and CSS; it becomes one layer"
            onClick={onImportCss}
            data-testid="insert-html-css"
            className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left hover:border-amber-400/50 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <div className="text-[11px] font-medium text-slate-200">HTML + CSS layer…</div>
            <div className="text-[10px] text-slate-500">Import from CSS: your own markup and styles</div>
          </button>
          {onImportCode && (
            <button
              type="button"
              disabled={disabled}
              title="One .ssx file: HTML + CSS + JavaScript, or a TSX component like the built-in themes (runs sandboxed)"
              onClick={onImportCode}
              data-testid="insert-code-layer"
              className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left hover:border-amber-400/50 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div className="text-[11px] font-medium text-slate-200">Code layer (TSX / JS)…</div>
              <div className="text-[10px] text-slate-500">HTML + CSS + JavaScript, or a React component</div>
            </button>
          )}
        </Section>
      )}
      <Section title="Templates">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={disabled}
            onClick={() => onInsert(cloneWithNewIds(t.elements, doc.elements), null)}
            className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left hover:border-amber-400/50 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <div className="text-[11px] font-medium text-slate-200">{t.name}</div>
            <div className="text-[10px] text-slate-500">{t.description}</div>
          </button>
        ))}
      </Section>
    </div>
  );
});
