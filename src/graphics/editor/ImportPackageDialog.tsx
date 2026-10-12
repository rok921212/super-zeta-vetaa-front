// Designer home → "Import animated package": an overlay package (.zip) made
// outside the Designer — HTML + CSS layers, images, fonts and CSS animation —
// or a design another user exported. The server reads the file (a dry run for
// this summary, services/overlayPackage.js) and saves it as a new design.
//
// The format is spelled out in PACKAGE_FORMAT below and in the downloadable
// example, so people can build packages in any code editor.

import React, { useRef, useState } from 'react';
import { packApi, apiErrorMessage, formatBytes, downloadBlob, packageFileName, MAX_PACKAGE_BYTES, type PackageSummary } from '../api.ts';
import { CACHE_KEYS, invalidate } from '../requestCache.ts';
import { Modal } from './dialogs.tsx';
import { Btn } from './ui.tsx';

export const EXAMPLE_PACKAGE_URL = '/designer/overlay-package-example.zip';

export const PACKAGE_FORMAT = `my-overlay.zip
├─ overlay.json     required — the manifest below
├─ index.html       markup (a whole HTML page is fine)
├─ style.css        styles + @keyframes animations
├─ assets/          png · jpg · webp · gif · svg  (use relative paths: assets/logo.png)
├─ fonts/           .woff2  (list them below, or use @font-face in style.css)
└─ preview.png      optional thumbnail

overlay.json
{
  "format": "scoresync-overlay",
  "version": 1,
  "kind": "html",
  "name": "Neon Kill Feed",
  "description": "Animated kill feed with team colours",
  "author": { "name": "Your name", "url": "https://…" },
  "license": "CC-BY-4.0",
  "tags": ["killfeed", "neon"],
  "canvas": { "width": 1920, "height": 1080, "background": "transparent" },
  "layers": [
    { "name": "Feed", "html": "index.html", "css": "style.css",
      "x": 1400, "y": 80, "width": 480, "height": 600 }
  ],
  "fonts": [{ "family": "Bebas Neue", "file": "fonts/BebasNeue.woff2" }]
}`;

const RULES = [
  'Animate with CSS only (@keyframes, transitions). JavaScript files and <script> tags are removed.',
  'No event handlers (onclick=…), iframes, forms, @import or external stylesheets.',
  'Show live data with tokens: {{derived.teams[0].teamName|upper}}, {{derived.teams[0].totalPoints}}.',
  '"layers" is optional — without it, index.html + style.css become one full-canvas layer.',
  'Limits: 24 MB zip, 200 files, 20 layers, 60 000 characters of HTML and of CSS per layer, 4 MB per image.',
  'A design exported from the Designer is a package too ("kind": "design") — anyone can import it.',
];

export function ImportPackageDialog({ onClose, onImported }: {
  onClose(): void;
  /** The new design is saved; `warnings` are things the user should know (a skipped file…). */
  onImported(layoutId: string, name: string, warnings: string[]): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<PackageSummary | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'reading' | 'importing' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [errors, setErrors] = useState<Array<{ path: string; message: string }>>([]);
  const [showFormat, setShowFormat] = useState(false);
  const [dragging, setDragging] = useState(false);

  const pick = async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setSummary(null);
    setErr(null);
    setErrors([]);
    if (!/\.zip$/i.test(f.name)) { setErr('Choose a .zip overlay package.'); return; }
    if (f.size > MAX_PACKAGE_BYTES) { setErr('That package is too large (max 24 MB).'); return; }
    setBusy('reading');
    try {
      const s = await packApi.inspectPackage(f);
      setSummary(s);
      setName(s.name);
    } catch (e: any) {
      setErr(apiErrorMessage(e, 'Could not read that package'));
      const list = e?.response?.data?.errors;
      if (Array.isArray(list)) setErrors(list);
    } finally {
      setBusy(null);
    }
  };

  const trimmed = name.trim();
  const run = async () => {
    if (!file || !summary || !trimmed || busy) return;
    setBusy('importing');
    setErr(null);
    try {
      const out = await packApi.importPackage(file, trimmed);
      invalidate(CACHE_KEYS.layouts);
      invalidate(CACHE_KEYS.assets);
      invalidate(CACHE_KEYS.fonts);
      onImported(out.layout._id, out.layout.name, out.warnings || []);
    } catch (e) {
      setErr(apiErrorMessage(e, 'Import failed'));
      setBusy(null);
    }
  };

  return (
    <Modal title="Import animated package" onClose={busy === 'importing' ? undefined : onClose} width={620}>
      <input ref={input} type="file" accept=".zip,application/zip" className="hidden" data-testid="package-file-input"
        onChange={(e) => { void pick(e.target.files?.[0] || null); e.target.value = ''; }} />
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void pick(e.dataTransfer.files?.[0] || null); }}
        className={`mb-3 flex flex-wrap items-center gap-2 rounded border border-dashed p-3 ${dragging ? 'border-amber-400/70 bg-amber-400/10' : 'border-white/15'}`}
      >
        <Btn onClick={() => input.current?.click()} disabled={!!busy}>{file ? 'Choose another package' : 'Choose a .zip package'}</Btn>
        {file ? <span className="min-w-0 truncate text-xs text-slate-400" title={file.name}>{file.name} · {formatBytes(file.size)}</span>
          : <span className="text-xs text-slate-500">or drop it here</span>}
      </div>

      {!file && (
        <p className="mb-3 text-xs text-slate-500">
          A package is a .zip holding an <span className="font-mono">overlay.json</span> manifest, HTML, CSS (with its animations), images and fonts.
          It becomes a new design you can edit, publish and add to OBS.
        </p>
      )}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <a href={EXAMPLE_PACKAGE_URL} download className="rounded border border-white/15 px-2 py-1 text-slate-200 hover:bg-white/10" data-testid="package-example">Download example package</a>
        <button type="button" className="rounded border border-white/15 px-2 py-1 text-slate-200 hover:bg-white/10" aria-expanded={showFormat} onClick={() => setShowFormat((v) => !v)}>
          {showFormat ? 'Hide' : 'Show'} package format
        </button>
      </div>
      {showFormat && (
        <div className="mb-3 rounded border border-white/10 bg-black/30 p-3" data-testid="package-format">
          <pre className="mb-2 overflow-x-auto whitespace-pre text-[11px] leading-4 text-slate-300">{PACKAGE_FORMAT}</pre>
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-400">
            {RULES.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}

      {busy === 'reading' && <div className="mb-3 text-xs text-slate-400">Reading package…</div>}

      {summary && (
        <>
          <label className="mb-3 flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
            Design name
            <input
              autoFocus
              className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm normal-case tracking-normal text-slate-100 outline-none focus:border-amber-400/60"
              value={name}
              maxLength={120}
              data-testid="package-name-input"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
            />
          </label>
          <div className="mb-3 space-y-1 rounded border border-white/10 bg-white/[0.02] p-3 text-xs" data-testid="package-summary">
            {summary.author.name && (
              <div>By <span className="text-slate-200">{summary.author.name}</span>{summary.license ? <span className="text-slate-500"> · {summary.license}</span> : null}</div>
            )}
            {summary.description && <div className="text-slate-400">{summary.description}</div>}
            <div className="text-slate-400">
              {summary.kind === 'design' ? 'Designer design' : 'HTML + CSS'} · {summary.canvas.width} × {summary.canvas.height} ·{' '}
              {summary.layerCount === 1 ? '1 layer' : `${summary.layerCount} layers`} · {summary.images === 1 ? '1 image' : `${summary.images} images`}
            </div>
            {summary.kind === 'html' && summary.layers.length > 0 && <div className="truncate text-slate-500">Layers: {summary.layers.join(', ')}</div>}
            {summary.fonts.length > 0 && <div className="text-slate-400">Fonts: {summary.fonts.join(', ')}</div>}
            {summary.tags.length > 0 && <div className="text-slate-500">Tags: {summary.tags.join(', ')}</div>}
          </div>
          {summary.warnings.map((w, i) => (
            <div key={i} className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">{w}</div>
          ))}
        </>
      )}

      {err && <div className="mb-2 text-xs text-red-300" role="alert">{err}</div>}
      {errors.length > 0 && (
        <ul className="mb-3 max-h-32 list-disc overflow-auto pl-4 text-[11px] text-red-200" data-testid="package-errors">
          {errors.slice(0, 20).map((e, i) => <li key={i}><span className="font-mono text-red-300">{e.path}</span> · {e.message}</li>)}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose} disabled={busy === 'importing'}>Cancel</Btn>
        <Btn active disabled={!summary || !trimmed || !!busy} onClick={run} data-testid="package-import-confirm">
          {busy === 'importing' ? 'Importing…' : 'Import as new design'}
        </Btn>
      </div>
    </Modal>
  );
}

/** Download one design as an overlay package. Resolves with a line for the status notice. */
export async function exportPackageFile(layout: { _id: string; name: string }): Promise<string> {
  const blob = await packApi.exportPackage(layout._id);
  const fileName = packageFileName(layout.name);
  downloadBlob(blob, fileName);
  return `Exported ${fileName} (${formatBytes(blob.size)})`;
}
