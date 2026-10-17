// Designer home → "Import HTML + CSS": paste (or open) markup and a stylesheet
// and get a new design holding it as one HTML + CSS layer — or, with
// JavaScript / TSX, one code layer (an .ssx file, a .tsx/.jsx/.js component,
// or an .html page with inline scripts). The editing, checking and live
// preview are HtmlCssLayerPanel's / CodeLayerPanel's; this only picks the
// canvas, names the design and creates it.
//
// Images in pasted code must be https URLs — local files travel in an overlay
// package instead (ImportPackageDialog).

import React, { useMemo, useRef, useState } from 'react';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { createEmptyLayout } from '../schema/layoutSchema.js';
import { layoutsApi, apiErrorMessage } from '../api.ts';
import { CACHE_KEYS, invalidate } from '../requestCache.ts';
import { splitPastedDocument } from '../renderer/htmlCss.ts';
import { CANVAS_PRESETS } from '../dashboard/canvasPresets.ts';
import { HtmlCssLayerPanel } from './HtmlCssLayerPanel.tsx';
import { CodeLayerPanel, ssxFromCssLayer } from './CodeLayerPanel.tsx';
import { ssxFromFile } from '../code/ssx.ts';
import { Modal } from './dialogs.tsx';
import { Btn, cx } from './ui.tsx';

const readText = (f: File) => f.text();

export function ImportHtmlCssDialog({ onClose, onCreated }: {
  onClose(): void;
  /** The new design's id (the caller opens it). */
  onCreated(id: string): void;
}) {
  const [name, setName] = useState('');
  const [canvas, setCanvas] = useState({ width: 1920, height: 1080 });
  const [code, setCode] = useState<{ html: string; css: string } | null>(null);
  const [kind, setKind] = useState<'html' | 'code'>('html');
  const [ssx, setSsx] = useState<string | null>(null);
  const [panelKey, setPanelKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const creating = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const doc = useMemo<LayoutDocument>(() => {
    const d = createEmptyLayout() as LayoutDocument;
    return { ...d, stage: { ...d.stage, width: canvas.width, height: canvas.height, background: null } };
  }, [canvas]);

  /** Open .html (and optionally a .css): a whole document is split into markup + styles. */
  const openFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    let html = '';
    let css = '';
    for (const f of Array.from(files)) {
      if (f.size > 512 * 1024) { setErr(`${f.name} is too large (max 512 KB).`); return; }
    }
    // A script (or a page with inline scripts) becomes a code layer.
    for (const f of Array.from(files)) {
      const text = /\.(ssx|tsx|jsx|ts|js|html?)$/i.test(f.name) ? await readText(f) : '';
      if (/\.(ssx|tsx|jsx|ts|js)$/i.test(f.name) || (/\.html?$/i.test(f.name) && /<script\b(?![^>]*\bsrc\s*=)[^>]*>\s*\S/i.test(text))) {
        const { source, notes } = ssxFromFile(f.name, text);
        if (!name.trim()) setName(f.name.replace(/\.[^.]*$/, '').slice(0, 120));
        setErr(notes.length ? notes.join(' ') : null);
        setSsx(source);
        setKind('code');
        setPanelKey((k) => k + 1);
        return;
      }
    }
    for (const f of Array.from(files)) {
      if (/\.css$/i.test(f.name)) css += `${await readText(f)}\n`;
      else if (/\.html?$/i.test(f.name)) {
        const parts = splitPastedDocument(await readText(f));
        html = parts.html;
        if (parts.css) css = `${parts.css}\n${css}`;
        if (!name.trim()) setName(f.name.replace(/\.html?$/i, '').slice(0, 120));
      }
    }
    if (!html.trim()) { setErr('Choose an .html file (and optionally its .css).'); return; }
    setErr(null);
    setCode({ html: html.trim(), css: css.trim() });
    setPanelKey((k) => k + 1); // the panel takes its starting code on mount
  };

  const create = async (els: LayoutElement[]) => {
    if (creating.current) return;
    creating.current = true;
    setBusy(true);
    setErr(null);
    try {
      const draft: LayoutDocument = { ...doc, elements: els };
      const full = await layoutsApi.create({ name: name.trim() || els[0]?.name || 'Imported HTML', draft });
      invalidate(CACHE_KEYS.layouts);
      onCreated(full._id);
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not create the design'));
      creating.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal title="Import HTML + CSS" onClose={busy ? undefined : onClose} width={1100}>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
          Design name
          <input
            value={name}
            maxLength={120}
            placeholder="e.g. Neon lower third"
            data-testid="html-import-name"
            onChange={(e) => setName(e.target.value)}
            className="w-64 rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm normal-case tracking-normal text-slate-100 outline-none focus:border-amber-400/60"
          />
        </label>
        <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
          Canvas
          <div className="flex gap-1" role="radiogroup" aria-label="Canvas size">
            {CANVAS_PRESETS.map((p) => {
              const on = p.width === canvas.width && p.height === canvas.height;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setCanvas({ width: p.width, height: p.height })}
                  className={cx('rounded border px-2 py-1 text-[11px] normal-case tracking-normal', on ? 'border-amber-400/70 bg-amber-400/10 text-slate-100' : 'border-white/10 text-slate-300 hover:bg-white/5')}
                >
                  {p.label} <span className="text-slate-500">{p.width}×{p.height}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
          Layer
          <div className="flex gap-1" role="radiogroup" aria-label="Layer kind">
            {([['html', 'HTML + CSS'], ['code', 'With JavaScript / TSX']] as const).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={kind === id} data-testid={`html-import-kind-${id}`}
                onClick={() => { setKind(id); setPanelKey((k) => k + 1); }}
                className={cx('rounded border px-2 py-1 text-[11px] normal-case tracking-normal', kind === id ? 'border-amber-400/70 bg-amber-400/10 text-slate-100' : 'border-white/10 text-slate-300 hover:bg-white/5')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <input ref={input} type="file" accept=".html,.htm,.css,.ssx,.tsx,.jsx,.js" multiple className="hidden" data-testid="html-import-files"
          onChange={(e) => { void openFiles(e.target.files); e.target.value = ''; }} />
        <Btn onClick={() => input.current?.click()} disabled={busy}>Open .html / .css / .ssx / .tsx files…</Btn>
      </div>
      <p className="mb-3 text-[11px] text-slate-500">
        {kind === 'html'
          ? <>Animate with CSS (<span className="font-mono">@keyframes</span>, transitions). Need scripts? Switch to “With JavaScript / TSX”. </>
          : <>One .ssx file: <span className="font-mono">{'<template>'}</span>, <span className="font-mono">{'<style>'}</span> and <span className="font-mono">{'<script lang="tsx|js">'}</span>; it runs sandboxed. </>}
        Images must be <span className="font-mono">https://</span> links;
        for local images and fonts, import an animated package (.zip) instead. The layer starts full-canvas; resize it with W / H.
      </p>

      {kind === 'code' ? (
        <CodeLayerPanel
          key={`code${panelKey}`}
          doc={doc}
          selected={[]}
          editing={null}
          state={null}
          disabled={busy}
          exec={() => {}}
          onInsert={(els) => void create(els)}
          onClose={() => { if (!creating.current) onClose(); }}
          initialSize={{ w: canvas.width, h: canvas.height }}
          initialSource={ssx ?? (code ? ssxFromCssLayer({ name: name || 'Code layer', w: canvas.width, h: canvas.height, css: code }) : undefined)}
          submitLabel={busy ? 'Creating…' : 'Create design'}
          footerNote="Creates a new design with this as its first layer. Keep editing it in the Designer."
        />
      ) : <HtmlCssLayerPanel
        key={panelKey}
        doc={doc}
        selected={[]}
        editing={null}
        state={null}
        disabled={busy}
        exec={() => {}}
        onInsert={(els) => void create(els)}
        onClose={() => { if (!creating.current) onClose(); }}
        initialSize={{ w: canvas.width, h: canvas.height }}
        initialCode={code || undefined}
        submitLabel={busy ? 'Creating…' : 'Create design'}
        footerNote="Creates a new design with this as its first layer. Keep editing it in the Designer."
        onAddScript={(draft) => { setCode(draft.css); setSsx(ssxFromCssLayer(draft)); setKind('code'); setPanelKey((k) => k + 1); }}
      />}
      {err && <div className="mt-2 text-xs text-red-300" role="alert">{err}</div>}
    </Modal>
  );
}
