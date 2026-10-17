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
  const target = insertTarget(doc, selected);
  const targetName = target.parentId ? locate(doc.elements, target.parentId)?.el.name || target.parentId : null;

  const insertKind = (kind: InsertKind) => {
    onInsert([createElement(kind, doc, target.area)], target.parentId, target.index);
  };

  const insertPart = (id: string) => {
    const placed = placePart(id, doc, selected);
    onInsert([placed.el], placed.parentId, placed.index);
    if (placed.note) onNote?.(placed.note);
  };
  const q = partQuery.trim().toLowerCase();
  const parts = q ? PARTS.filter((p) => `${p.name} ${p.hint} ${p.badges.join(' ')}`.toLowerCase().includes(q)) : PARTS;

  return (
    <div className="flex flex-col">
      {targetName && (
        <div className="border-b border-white/5 px-3 py-2 text-[10px] text-amber-200/80">Inserting into “{targetName}”</div>
      )}
      <Section title="Live parts" help="liveParts">
        <input
          aria-label="Search live parts"
          value={partQuery}
          placeholder="Search: dead, recall, photo…"
          onChange={(e) => setPartQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-amber-400/60"
        />
        <div className="flex flex-col gap-1.5" data-testid="live-parts">
          {parts.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              data-part={p.id}
              title={p.needs === 'none' ? p.hint : `${p.hint}. Reads a ${p.needs} row: select a ${p.needs === 'team' ? 'team' : 'player'} list first, or it gets one of its own.`}
              onClick={() => insertPart(p.id)}
              className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left hover:border-amber-400/50 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div className="text-[11px] font-medium text-slate-200">{p.name}</div>
              <div className="truncate text-[10px] text-slate-500">{p.hint}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {p.badges.map((b) => <span key={b} className="rounded bg-amber-400/10 px-1 text-[9px] font-semibold uppercase text-amber-200/90">{b}</span>)}
              </div>
            </button>
          ))}
          {!parts.length && <div className="text-[10px] text-slate-500">No part matches “{partQuery}”.</div>}
        </div>
      </Section>
      {INSERT_CATEGORIES.map((cat) => (
        <Section key={cat.title} title={cat.title}>
          <div className="grid grid-cols-2 gap-1.5">
            {cat.items.map((it) => (
              <button
                key={it.kind}
                type="button"
                disabled={disabled}
                title={it.hint}
                onClick={() => insertKind(it.kind)}
                className={cx(
                  'rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left text-[11px] text-slate-200 hover:border-amber-400/50 hover:bg-amber-400/10',
                  'disabled:cursor-not-allowed disabled:opacity-40'
                )}
              >
                <div className="font-medium">{it.label}</div>
                <div className="truncate text-[10px] text-slate-500">{it.hint}</div>
              </button>
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
