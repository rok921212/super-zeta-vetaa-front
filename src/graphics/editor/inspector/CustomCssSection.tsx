// Inspector: the layer's own CSS (el.customCss) — plain declarations on a box
// the size of the layer, with {{ … }} live-data tokens and @when blocks that
// apply while a condition holds. Rules for several layers belong in the layout
// stylesheet (Document panel).

import React, { useEffect, useState } from 'react';
import type { LayoutElement } from '../../schema/layoutTypes.ts';
import { LIMITS, splitCustomCss } from '../../schema/layoutSchema.js';
import { declarationProblems } from '../../renderer/customCss.ts';
import { useDataLink } from '../dataLink.tsx';
import { Section, cx } from '../ui.tsx';

type Edit = (field: string, fn: (e: LayoutElement) => LayoutElement, label?: string) => void;

const EXAMPLE = "border-radius: 12px;\ncolor: {{ item.isFiring ? '#ff5a1f' : '#ffffff' }};\n@when item.isFiring {\n  transform: scale(1.1);\n}";

export function CustomCssSection({ el, edit }: { el: LayoutElement; edit: Edit }) {
  const link = useDataLink();
  const [draft, setDraft] = useState(el.customCss || '');
  useEffect(() => setDraft(el.customCss || ''), [el.id, el.customCss]);
  const problems = declarationProblems(draft);
  const tooLong = draft.length > LIMITS.maxCustomCssLength;
  const commit = (text: string) => {
    if (tooLong || splitCustomCss(text).error || text === (el.customCss || '')) return;
    edit('customCss', (e) => {
      const next = { ...e };
      if (text.trim()) next.customCss = text; else delete next.customCss;
      return next;
    }, 'Layer CSS');
  };
  return (
    <Section title="Custom CSS" help="customCss">
      <textarea
        aria-label="Layer CSS"
        data-testid="layer-css"
        spellCheck={false}
        placeholder={EXAMPLE}
        className={cx(
          'min-h-[96px] w-full rounded border bg-black/40 px-2 py-1 font-mono text-[11px] text-slate-100 outline-none',
          problems.length || tooLong ? 'border-amber-400/50' : 'border-white/10 focus:border-amber-400/60',
        )}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit(draft); }}
      />
      {tooLong && <div className="text-[10px] text-red-300">Too long ({draft.length} / {LIMITS.maxCustomCssLength} characters)</div>}
      {problems.slice(0, 4).map((p, i) => (
        <div key={i} className="text-[10px] text-amber-200">Line {p.line}: {p.message}</div>
      ))}
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
        <span className="flex-1">
          Any CSS property. <span className="font-mono">{'{{ … }}'}</span> puts live data in a value (<span className="font-mono">{"a ? b : c"}</span> works);{' '}
          <span className="font-mono">{'@when … { }'}</span> applies only while true. Saved when you leave the box (Ctrl+Enter).
        </span>
        {link?.picker(undefined, (p) => setDraft((d) => `${d}${d && !/\s$/.test(d) ? ' ' : ''}{{${p}}}`), '+ Data')}
      </div>
    </Section>
  );
}
