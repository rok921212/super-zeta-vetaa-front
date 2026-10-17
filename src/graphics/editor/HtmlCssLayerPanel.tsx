// Import from CSS → "HTML + CSS layer": paste markup and a stylesheet, see it
// drawn by the same renderer OBS uses, and create (or update) a `css` layer.
//
// The layer stores the HTML and CSS as written. They are sanitised and scoped
// to the layer every time it is drawn (renderer/htmlCss.ts), and the shared
// schema refuses scripts / handlers / @import on save and publish.

import React, { useMemo, useRef, useState } from 'react';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { LIMITS } from '../schema/layoutSchema.js';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import type { DataState } from '../bindings/index.ts';
import { checkHtmlCss, splitPastedDocument, tokenPaths, type HtmlCssProblem } from '../renderer/htmlCss.ts';
import { type Command, editElements } from './store.ts';
import { allIds } from './tree.ts';
import { newId } from './ids.ts';
import { insertTarget } from './InsertPanel.tsx';
import { Btn, cx } from './ui.tsx';

export const HTML_EXAMPLE = `<div class="card">
  <div class="rank">#1</div>
  <div class="team">
    <div class="name">{{derived.teams[0].teamName|upper}}</div>
    <div class="sub">{{derived.teams[0].totalKills}} FINISHES</div>
  </div>
  <div class="pts">{{derived.teams[0].totalPoints}}</div>
</div>`;

export const LAYER_CSS_EXAMPLE = `.card {
  position: absolute; inset: 0;
  display: flex; align-items: center; gap: 24px;
  padding: 0 28px;
  background: linear-gradient(90deg, #111827, #1f2937);
  border-left: 8px solid #f59e0b;
  border-radius: 14px;
  font-family: system-ui, sans-serif;
  color: #fff;
  animation: slide-in 600ms ease-out both;
}
.rank { font-size: 64px; font-weight: 900; color: #f59e0b; }
.team { flex: 1; }
.name { font-size: 40px; font-weight: 800; letter-spacing: 1px; }
.sub  { font-size: 20px; opacity: .7; }
.pts  { font-size: 56px; font-weight: 900; }

@keyframes slide-in {
  from { transform: translateX(-60px); opacity: 0; }
  to   { transform: none; opacity: 1; }
}`;

const MAX = (LIMITS as { maxCssLayerLength: number }).maxCssLayerLength;

export function CodeBox({ label, value, onChange, placeholder, problems, height = 'h-48', max = MAX }: {
  label: string; value: string; onChange(v: string): void; placeholder: string; problems: Array<{ line: number; level: HtmlCssProblem['level'] | 'info' }>; height?: string; max?: number;
}) {
  const gutter = useRef<HTMLDivElement>(null);
  const lines = Math.max(8, value.split('\n').length);
  const err = new Set(problems.filter((p) => p.level === 'error').map((p) => p.line));
  const warn = new Set(problems.filter((p) => p.level === 'warning').map((p) => p.line));
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span>{label}</span>
        <span className={cx('font-normal normal-case tracking-normal', value.length > max ? 'text-red-300' : 'text-slate-600')}>{value.length.toLocaleString()} / {max.toLocaleString()}</span>
      </div>
      <div className={cx('flex overflow-hidden rounded border border-white/10 bg-black/50 font-mono text-[12px] leading-5', height)}>
        <div ref={gutter} className="select-none overflow-hidden border-r border-white/5 bg-white/[0.02] py-2 text-right text-slate-600" aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} className={cx('px-2', err.has(i + 1) ? 'bg-red-500/25 text-red-200' : warn.has(i + 1) ? 'bg-amber-500/20 text-amber-200' : '')}>{i + 1}</div>
          ))}
        </div>
        <textarea
          aria-label={label}
          spellCheck={false}
          wrap="off"
          className="min-w-0 flex-1 resize-none bg-transparent p-2 leading-5 text-slate-100 outline-none"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop; }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Tab' && !e.shiftKey) {
              e.preventDefault();
              const t = e.currentTarget; const a = t.selectionStart; const b = t.selectionEnd;
              const next = value.slice(0, a) + '  ' + value.slice(b);
              onChange(next);
              requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 2; });
            }
          }}
        />
      </div>
    </div>
  );
}

export function SizeInput({ label, value, onChange }: { label: string; value: number; onChange(v: number): void }) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-slate-400">
      {label}
      <input
        type="number" min={1} max={7680} value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(7680, Math.round(Number(e.target.value) || 1))))}
        onKeyDown={(e) => e.stopPropagation()}
        className="w-20 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-slate-100 outline-none focus:border-amber-400/60"
      />
    </label>
  );
}

export function HtmlCssLayerPanel({ doc, selected, editing, state, assetBase, disabled, exec, onInsert, onClose, initialSize, submitLabel, footerNote, initialCode, onAddScript }: {
  doc: LayoutDocument;
  selected: string[];
  /** An existing css layer to update instead of creating a new one. */
  editing: LayoutElement | null;
  state: DataState | null;
  assetBase?: string;
  disabled?: boolean;
  exec(cmd: Command | null): void;
  onInsert(els: LayoutElement[], parentId: string | null, index?: number | null): void;
  onClose(): void;
  /** Starting layer size for a new layer (default 800 × 160). */
  initialSize?: { w: number; h: number };
  /** The create button's label (Designer home: "Create design"). */
  submitLabel?: string;
  footerNote?: string;
  /** Code to start a new layer with (a file the user opened). */
  initialCode?: { html: string; css: string };
  /** "Add JavaScript": continue as a code layer with this markup and CSS. */
  onAddScript?(draft: { name: string; w: number; h: number; css: { html: string; css: string } }): void;
}) {
  const [html, setHtml] = useState(editing?.css?.html ?? initialCode?.html ?? '');
  const [css, setCss] = useState(editing?.css?.css ?? initialCode?.css ?? '');
  const [name, setName] = useState(editing?.name ?? 'HTML layer');
  const [w, setW] = useState(editing?.w ?? initialSize?.w ?? 800);
  const [h, setH] = useState(editing?.h ?? initialSize?.h ?? 160);
  const [note, setNote] = useState<string | null>(null);

  const problems = useMemo(() => checkHtmlCss(html, css), [html, css]);
  const errors = problems.filter((p) => p.level === 'error');
  const tooLong = html.length > MAX || css.length > MAX;
  const empty = !html.trim();
  const canSave = !disabled && !empty && !errors.length && !tooLong;
  const paths = useMemo(() => tokenPaths(html), [html]);
  const hasPastedStyle = /<\s*style\b/i.test(html) || /<\s*(html|body|head)\b/i.test(html);

  // Preview: the layer alone on a stage its own size, through the real renderer.
  const previewDoc = useMemo<LayoutDocument>(() => ({
    ...doc,
    stage: { ...doc.stage, width: Math.max(16, w), height: Math.max(16, h), background: null, backgroundImage: null },
    elements: problems.some((p) => p.level === 'error') ? [] : [{ id: 'css_preview', type: 'css', name, x: 0, y: 0, w, h, css: { html, css } }],
  }), [doc, w, h, name, html, css, problems]);

  const splitStyle = () => {
    const parts = splitPastedDocument(html);
    setHtml(parts.html);
    if (parts.css) setCss(css.trim() ? `${css.trim()}\n\n${parts.css}` : parts.css);
    setNote('Moved the <style> blocks into the CSS box and kept only what was inside <body>.');
  };

  const save = () => {
    if (!canSave) return;
    const payload = { html, css: css.trim() ? css : undefined };
    if (editing) {
      exec(editElements(doc, [editing.id], (e) => ({ ...e, name: name.trim() || e.name, w, h, css: payload }), `Edit HTML layer “${name}”`));
    } else {
      const target = insertTarget(doc, selected);
      const area = target.area || { w: doc.stage.width, h: doc.stage.height };
      const el: LayoutElement = {
        id: newId('css', allIds(doc.elements)), type: 'css', name: name.trim() || 'HTML layer',
        x: Math.max(0, Math.round((area.w - w) / 2)), y: Math.max(0, Math.round((area.h - h) / 2)), w, h,
        css: payload,
      };
      onInsert([el], target.parentId, target.index);
    }
    onClose();
  };

  return (
    <div className="flex flex-col gap-3" data-testid="html-css-layer">
      <div className="text-[11px] text-slate-400">
        Write or paste HTML and its CSS; it becomes one layer you can move, resize, mask and animate like any other.
        Styles only reach this layer. Use <span className="font-mono text-slate-200">{'{{derived.teams[0].teamName}}'}</span> or <span className="font-mono text-slate-200">{'{{path|upper}}'}</span> to show live data.
        Scripts, event handlers, forms and frames are not allowed here: use “Add JavaScript” for a code layer.
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <CodeBox label="HTML" value={html} onChange={(v) => { setHtml(v); setNote(null); }} placeholder={HTML_EXAMPLE} problems={problems.filter((p) => p.where === 'html')} />
          <CodeBox label="CSS" value={css} onChange={(v) => { setCss(v); setNote(null); }} placeholder={LAYER_CSS_EXAMPLE} problems={problems.filter((p) => p.where === 'css')} />
          <div className="flex flex-wrap gap-1.5">
            <Btn small onClick={() => { setHtml(HTML_EXAMPLE); setCss(LAYER_CSS_EXAMPLE); setW(800); setH(160); setNote(null); }}>Load an example</Btn>
            {hasPastedStyle && <Btn small active onClick={splitStyle} data-testid="html-css-split">Split &lt;style&gt; into CSS</Btn>}
            <Btn small disabled={!html && !css} onClick={() => { setHtml(''); setCss(''); setNote(null); }}>Reset</Btn>
            {onAddScript && (
              <Btn small disabled={disabled} onClick={() => onAddScript({ name, w, h, css: { html, css } })} title="Continue as a code layer: the same HTML and CSS plus your own JavaScript or a TSX component (runs sandboxed)" data-testid="html-css-add-script">Add JavaScript →</Btn>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="relative h-64 overflow-hidden rounded border border-white/10" style={{ backgroundColor: '#1a1a1f', backgroundImage: 'linear-gradient(45deg,#232329 25%,transparent 25%),linear-gradient(-45deg,#232329 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#232329 75%),linear-gradient(-45deg,transparent 75%,#232329 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0,0 10px,10px -10px,-10px 0' }} data-testid="html-css-preview">
            {!empty && <LayoutRenderer layout={previewDoc} state={state} events={null} mode="editor" fit="contain" assetBase={assetBase} />}
            {empty && <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-500">The layer appears here as you type.</div>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-[11px] text-slate-400">
              Name
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()}
                className="w-40 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-slate-100 outline-none focus:border-amber-400/60" />
            </label>
            <SizeInput label="W" value={w} onChange={setW} />
            <SizeInput label="H" value={h} onChange={setH} />
            <Btn small onClick={() => { setW(doc.stage.width); setH(doc.stage.height); }} title="Make the layer cover the whole stage">Full stage</Btn>
          </div>
          {paths.length > 0 && (
            <div className="text-[11px] text-slate-400" data-testid="html-css-data">
              Live data: {paths.slice(0, 12).map((p) => <span key={p} className="mr-1 rounded bg-white/5 px-1 font-mono text-slate-200">{p}</span>)}{paths.length > 12 ? ` +${paths.length - 12} more` : ''}
            </div>
          )}
          <div className="max-h-36 overflow-auto rounded border border-white/10 bg-black/30 p-2 text-[11px]" role="status" data-testid="html-css-problems">
            {empty && !problems.length && <div className="text-slate-500">Problems and warnings appear here as you type.</div>}
            {!empty && !problems.length && !tooLong && <div className="text-emerald-300">No problems. Ready to {editing ? 'update the layer' : 'create the layer'}.</div>}
            {tooLong && <div className="text-red-300">HTML and CSS can each be at most {MAX.toLocaleString()} characters.</div>}
            {problems.map((p, i) => (
              <div key={i} className={p.level === 'error' ? 'text-red-300' : 'text-amber-200'}>
                <span className={cx('font-mono', p.level === 'error' ? 'text-red-400' : 'text-amber-400')}>{p.where.toUpperCase()} line {p.line}</span> · {p.message}
              </div>
            ))}
            {errors.length > 0 && <div className="mt-1 text-slate-500">Fix every red problem to create the layer.</div>}
          </div>
        </div>
      </div>

      {note && <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100" role="status">{note}</div>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-slate-500">{footerNote ?? 'Saved with the design as a CSS layer. Edit it later from the Inspector.'}</span>
        <Btn onClick={onClose}>Close</Btn>
        <Btn active disabled={!canSave} onClick={save} data-testid="html-css-create">{editing ? 'Update layer' : submitLabel || 'Create layer'}</Btn>
      </div>
    </div>
  );
}
