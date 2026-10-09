// Insert panel: element kinds (Basic / Data / Advanced) and the starter
// templates. Inserts into the selected group/repeater, next to a selected
// layer inside a group (so editing a template adds to the template), else at
// the top of the stage.

import React, { memo } from 'react';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { INSERT_CATEGORIES, createElement, type InsertKind } from './elementFactory.ts';
import { TEMPLATES } from '../templates/index.ts';
import { cloneWithNewIds } from './ids.ts';
import { locate } from './tree.ts';
import { insertionTarget } from './ops.ts';
import { Section, cx } from './ui.tsx';

export interface InsertPanelProps {
  doc: LayoutDocument;
  selected: string[];
  disabled?: boolean;
  onInsert(els: LayoutElement[], parentId: string | null, index?: number | null): void;
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

export const InsertPanel = memo(function InsertPanel({ doc, selected, disabled, onInsert }: InsertPanelProps) {
  const target = insertTarget(doc, selected);
  const targetName = target.parentId ? locate(doc.elements, target.parentId)?.el.name || target.parentId : null;

  const insertKind = (kind: InsertKind) => {
    onInsert([createElement(kind, doc, target.area)], target.parentId, target.index);
  };

  return (
    <div className="flex flex-col">
      {targetName && (
        <div className="border-b border-white/5 px-3 py-2 text-[10px] text-amber-200/80">Inserting into “{targetName}”</div>
      )}
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
