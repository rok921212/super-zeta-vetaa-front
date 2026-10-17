// Code layer editor: one .ssx file (<template>, <style>, <script lang="tsx|jsx|js">)
// written like a built-in theme component. It is compiled here (sucrase +
// Tailwind, loaded on demand), previewed through the real renderer — i.e. in
// the same sandboxed iframe OBS will use — and saved as a `code` layer that
// stores the source and the compiled output.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CodeLayer, LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { LIMITS } from '../schema/layoutSchema.js';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import type { DataState } from '../bindings/index.ts';
import { compileSsx, type SsxResult } from '../code/compile.ts';
import { parseSsx, serializeSsx, ssxFromFile } from '../code/ssx.ts';
import { CODE_SAMPLES } from '../code/samples.ts';
import { CODE_SNIPPETS, insertSnippet } from '../code/snippets.ts';
import { SCORESYNC_NAMES } from '../code/imports.ts';
import { describeStatus, useCodeStatus } from '../code/layerStatus.ts';
import { type Command, editElements } from './store.ts';
import { allIds } from './tree.ts';
import { newId } from './ids.ts';
import { insertTarget } from './InsertPanel.tsx';
import { Btn, cx } from './ui.tsx';
import { CodeBox, SizeInput } from './HtmlCssLayerPanel.tsx';

const MAX = (LIMITS as { maxCodeSourceLength: number }).maxCodeSourceLength;
const CHECKER = { backgroundColor: '#1a1a1f', backgroundImage: 'linear-gradient(45deg,#232329 25%,transparent 25%),linear-gradient(-45deg,#232329 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#232329 75%),linear-gradient(-45deg,transparent 75%,#232329 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0,0 10px,10px -10px,-10px 0' };

/** An HTML + CSS layer's code as the start of a code layer ("Add JavaScript"). */
export function ssxFromCssLayer(el: Pick<LayoutElement, 'name' | 'w' | 'h' | 'css'>): string {
  return serializeSsx({
    name: el.name || 'Code layer', width: el.w, height: el.h,
    html: el.css?.html || '', css: el.css?.css || '', styleLang: 'css',
    script: "// Runs in the layer's sandbox. ss.on('data', fn) on every update, ss.on('event', fn) on live events.\nss.on('data', (data) => {\n  // e.g. document.querySelector('.name').textContent = data.derived.teams[0]?.teamName;\n});\n",
    lang: 'js',
  });
}

const REFERENCE = [
  ['Props', 'tournament, round, match, matches, matchData, matchDatas, overallData, deadTeamList, derived, live, feed, variables, theme, brand, width, height'],
  ["import … from 'scoresync'", SCORESYNC_NAMES.join(', ')],
  ['Theme files', "Imports of the themes' shared hooks/components ('../../shared/hooks/…') are pointed at 'scoresync' for you, so a theme component can be pasted as it is."],
  ['Other imports', "react, react-dom, framer-motion (motion, AnimatePresence…). React is also global."],
  ['Plain JS (lang="js")', "ss.on('data', fn) · ss.on('event', fn) · ss.get('matchData.teams[0].teamName') · ss.format(v, 'ordinal') · ss.asset(id) · {{tokens}} in <template>"],
  ['Sandbox', 'Runs in an isolated frame: no network (fetch / sockets), no access to the page or your login. Images: https URLs or asset:<id>.'],
];

export function CodeLayerPanel({ doc, selected, editing, replacing, state, assetBase, disabled, exec, onInsert, onClose, initialSource, initialSize, submitLabel, footerNote }: {
  doc: LayoutDocument;
  selected: string[];
  /** An existing code layer to update. */
  editing: LayoutElement | null;
  /** An HTML + CSS layer that becomes this code layer on save (same id, place and animations). */
  replacing?: LayoutElement | null;
  state: DataState | null;
  assetBase?: string;
  disabled?: boolean;
  exec(cmd: Command | null): void;
  onInsert(els: LayoutElement[], parentId: string | null, index?: number | null): void;
  onClose(): void;
  initialSource?: string;
  initialSize?: { w: number; h: number };
  submitLabel?: string;
  footerNote?: string;
}) {
  const base = editing || replacing || null;
  const [source, setSource] = useState<string>(editing?.code?.source ?? initialSource ?? (replacing ? ssxFromCssLayer(replacing) : ''));
  const [name, setName] = useState(base?.name ?? 'Code layer');
  const [w, setW] = useState(base?.w ?? initialSize?.w ?? 800);
  const [h, setH] = useState(base?.h ?? initialSize?.h ?? 400);
  const [result, setResult] = useState<SsxResult | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showRef, setShowRef] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const run = useRef(0);

  // Compile shortly after typing stops; only the newest run's result is kept.
  useEffect(() => {
    if (!source.trim()) { setResult(null); setCompiling(false); return; }
    const id = ++run.current;
    setCompiling(true);
    const t = setTimeout(() => {
      compileSsx(source).then((r) => { if (id === run.current) { setResult(r); setCompiling(false); } });
    }, 450);
    return () => clearTimeout(t);
  }, [source]);

  const tooLong = source.length > MAX;
  const layer: CodeLayer | null = result && result.layer && result.layer.source === source ? result.layer : null;
  const canSave = !disabled && !!layer && !compiling && !tooLong;
  // "Compiled" only means the syntax is valid: what the preview frame reports is whether it actually draws.
  const runStatus = useCodeStatus(layer ? 'code_preview' : null);
  const runBad = !!runStatus && ['error', 'empty', 'outside', 'stalled'].includes(runStatus.state);

  const addSnippet = (id: string) => {
    const r = insertSnippet(source || CODE_SAMPLES[0].source, id);
    if (r.error) { setNote(r.error); return; }
    if (!r.added.length) { setNote('That piece is already in the file.'); return; }
    setSource(r.source);
    const s = CODE_SNIPPETS.find((x) => x.id === id);
    setNote(`Added ${r.added.join(' + ')} above export default. ${s?.usage ?? ''}`);
  };

  // Take the size from <overlay width height> when a file / sample sets it.
  const applySize = (text: string) => {
    const { parts } = parseSsx(text);
    if (parts.width) setW(parts.width);
    if (parts.height) setH(parts.height);
    if (parts.name && !base) setName(parts.name);
  };

  const previewDoc = useMemo<LayoutDocument>(() => ({
    ...doc,
    stage: { ...doc.stage, width: Math.max(16, w), height: Math.max(16, h), background: null, backgroundImage: null },
    elements: layer ? [{ id: 'code_preview', type: 'code', name, x: 0, y: 0, w, h, code: layer }] : [],
  }), [doc, w, h, name, layer]);

  const openFile = async (file: File) => {
    const text = await file.text();
    const { source: next, notes } = ssxFromFile(file.name, text);
    setSource(next);
    applySize(next);
    setNote(notes.length ? notes.join(' ') : `Opened ${file.name}.`);
  };

  const download = () => {
    const blob = new Blob([source], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(name || 'code-layer').replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'code-layer'}.ssx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const save = () => {
    if (!canSave || !layer) return;
    const label = name.trim() || 'Code layer';
    if (base) {
      exec(editElements(doc, [base.id], (e) => {
        const { css: _css, ...rest } = e;
        return { ...rest, type: 'code', name: label, w, h, code: layer };
      }, replacing ? `Turn “${label}” into a code layer` : `Edit code layer “${label}”`));
    } else {
      const target = insertTarget(doc, selected);
      const area = target.area || { w: doc.stage.width, h: doc.stage.height };
      const el: LayoutElement = {
        id: newId('code', allIds(doc.elements)), type: 'code', name: label,
        x: Math.max(0, Math.round((area.w - w) / 2)), y: Math.max(0, Math.round((area.h - h) / 2)), w, h,
        code: layer,
      };
      onInsert([el], target.parentId, target.index);
    }
    onClose();
  };

  return (
    <div className="flex flex-col gap-3" data-testid="code-layer" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } }}>
      <div className="text-[11px] text-slate-400">
        One file, like a theme component: <span className="font-mono text-slate-200">{'<template>'}</span> (optional HTML),{' '}
        <span className="font-mono text-slate-200">{'<style lang="tailwind|css">'}</span> and{' '}
        <span className="font-mono text-slate-200">{'<script lang="tsx|jsx|js">'}</span>. A component gets the same props as the built-in themes and can import the shared hooks from <span className="font-mono text-slate-200">'scoresync'</span>.
        It runs sandboxed — no network, no access to the page. <button type="button" className="text-amber-200 hover:underline" onClick={() => setShowRef(!showRef)}>{showRef ? 'Hide reference' : 'Reference'}</button>
      </div>
      {showRef && (
        <div className="grid gap-1 rounded border border-white/10 bg-black/30 p-2 text-[11px]" data-testid="code-reference">
          {REFERENCE.map(([k, v]) => <div key={k}><span className="text-slate-200">{k}:</span> <span className="font-mono text-slate-400">{v}</span></div>)}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <CodeBox label="Component file (.ssx)" value={source} max={MAX} height="h-[26rem]"
            onChange={(v) => { setSource(v); setNote(null); }}
            placeholder={CODE_SAMPLES[0].source}
            problems={(result?.problems || []).map((p) => ({ line: p.line, level: p.level }))} />
          <div className="flex flex-wrap items-center gap-1.5">
            <select aria-label="Start from a sample" value="" disabled={disabled}
              onChange={(e) => { const s = CODE_SAMPLES.find((x) => x.id === e.target.value); if (s) { setSource(s.source); setW(s.w); setH(s.h); if (!base) setName(s.name.replace(/\s*\(.*\)$/, '')); setNote(`${s.name}: ${s.hint}.`); } }}
              className="rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-slate-100 outline-none focus:border-amber-400/60" data-testid="code-sample">
              <option value="">Start from a sample…</option>
              {CODE_SAMPLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select aria-label="Insert a ready piece" value="" disabled={disabled}
              onChange={(e) => { if (e.target.value) addSnippet(e.target.value); }}
              title="Drop-in components (alive bars, dead swipe, recall…) that read live data themselves"
              className="rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-slate-100 outline-none focus:border-amber-400/60" data-testid="code-snippet">
              <option value="">Insert a ready piece…</option>
              {CODE_SNIPPETS.map((s) => <option key={s.id} value={s.id} title={s.hint}>{s.name}</option>)}
            </select>
            <Btn small onClick={() => fileInput.current?.click()} title=".ssx, .tsx, .jsx, .js or .html">Open file…</Btn>
            <input ref={fileInput} type="file" accept=".ssx,.tsx,.jsx,.ts,.js,.html,.htm,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFile(f); e.target.value = ''; }} data-testid="code-file" />
            <Btn small disabled={!source.trim()} onClick={download}>Download .ssx</Btn>
            <Btn small disabled={!source} onClick={() => { setSource(''); setNote(null); }}>Reset</Btn>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="relative h-64 overflow-hidden rounded border border-white/10" style={CHECKER} data-testid="code-preview">
            {layer && <LayoutRenderer layout={previewDoc} state={state} events={null} mode="editor" fit="contain" assetBase={assetBase} />}
            {!layer && <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-500">{compiling ? 'Compiling…' : source.trim() ? 'Fix the problems to see the layer.' : 'Pick a sample or write a component.'}</div>}
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
          <div className="max-h-40 overflow-auto rounded border border-white/10 bg-black/30 p-2 text-[11px]" role="status" data-testid="code-problems">
            {!source.trim() && <div className="text-slate-500">Compile problems appear here as you type. Runtime errors show on the preview.</div>}
            {source.trim() && compiling && <div className="text-slate-500">Compiling…</div>}
            {source.trim() && !compiling && layer && !tooLong && (
              !runStatus || runStatus.state === 'loading' || runStatus.state === 'waiting'
                ? <div className="text-slate-400">Compiled. {runStatus?.state === 'waiting' ? 'Waiting for data in the preview…' : 'Starting the preview…'}</div>
                : runBad
                  ? (
                    <div className="text-amber-200" data-testid="code-run-status">
                      <div><span className="font-mono text-amber-400">{runStatus.state === 'error' || runStatus.state === 'stalled' ? 'RUN ERROR' : 'PREVIEW'}{runStatus.line ? ` line ${runStatus.line}` : ''}</span> · {runStatus.state === 'error' ? runStatus.message : describeStatus(runStatus)}</div>
                      {runStatus.hint && <div className="mt-0.5 text-slate-300">→ {runStatus.hint}</div>}
                      <div className="mt-0.5 text-slate-500">It compiled, so it can still be saved — but this is what OBS will show.</div>
                    </div>
                  )
                  : <div className="text-emerald-300" data-testid="code-run-status">Compiled and running — {describeStatus(runStatus).replace(/^Running · /, '')}. Ready to {base ? 'update the layer' : 'create the layer'}.</div>
            )}
            {tooLong && <div className="text-red-300">The file can be at most {MAX.toLocaleString()} characters.</div>}
            {!compiling && result?.problems.map((p, i) => (
              <div key={i} className={p.level === 'error' ? 'text-red-300' : p.level === 'info' ? 'text-slate-400' : 'text-amber-200'}>
                <span className={cx('font-mono', p.level === 'error' ? 'text-red-400' : p.level === 'info' ? 'text-slate-500' : 'text-amber-400')}>{p.where.toUpperCase()} line {p.line}</span> · {p.message}
              </div>
            ))}
          </div>
        </div>
      </div>

      {note && <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100" role="status">{note}</div>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-slate-500">{footerNote ?? 'Saved with the design. The compiled code is what OBS runs; edit it later from the Inspector.'}</span>
        <Btn onClick={onClose}>Close</Btn>
        <Btn active disabled={!canSave} onClick={save} data-testid="code-save">{base ? (replacing ? 'Turn into code layer' : 'Update layer') : submitLabel || 'Create layer'}</Btn>
      </div>
    </div>
  );
}
