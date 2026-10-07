// Import a theme file (.sstheme): pick the file, see what is in it, name the
// theme, and it is saved — published — into the signed-in account. The server
// reads the file (a dry run first, for this summary); nothing is decoded here.
//
// Also home of the small "export to a file" helpers the list page, the editor
// and DisplayHud share.

import React, { useRef, useState } from 'react';
import {
  packApi, apiErrorMessage, downloadBlob, formatBytes, themeFileName, THEME_FILE_EXTENSION,
  type CustomTheme, type ThemeFileSummary,
} from '../api.ts';
import { CACHE_KEYS, invalidate } from '../requestCache.ts';
import { guessViewKey, viewLabel } from '../../dashboard/overlayViews.ts';
import { Modal } from './dialogs.tsx';
import { Btn } from './ui.tsx';

/** Same limit as the backend's upload (services/themePack.js). */
export const MAX_THEME_FILE_BYTES = 12 * 1024 * 1024;

/** Download one layout as a theme file. Resolves with a line for the status notice. */
export async function exportLayoutFile(layout: { _id: string; name: string }): Promise<string> {
  const blob = await packApi.exportLayout(layout._id, guessViewKey(layout.name));
  const fileName = themeFileName(layout.name);
  downloadBlob(blob, fileName);
  return `Exported ${fileName} (${formatBytes(blob.size)})`;
}

/** Download a whole custom theme (every layout in it) as a theme file. */
export async function exportThemeFile(theme: { _id: string; name: string }): Promise<string> {
  const blob = await packApi.exportTheme(theme._id);
  const fileName = themeFileName(theme.name);
  downloadBlob(blob, fileName);
  return `Exported ${fileName} (${formatBytes(blob.size)})`;
}

export function ImportThemeDialog({ onClose, onImported }: {
  onClose(): void;
  /** The new theme is saved; `warnings` are things the user should know (a skipped font…). */
  onImported(theme: CustomTheme, warnings: string[]): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ThemeFileSummary | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'reading' | 'importing' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (f: File | null) => {
    if (!f) return;
    setFile(f);
    setSummary(null);
    setErr(null);
    if (f.size > MAX_THEME_FILE_BYTES) { setErr('That file is too large to be a theme file.'); return; }
    setBusy('reading');
    try {
      const s = await packApi.inspect(f);
      setSummary(s);
      setName(s.name);
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not read that file'));
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
      const out = await packApi.importPack(file, trimmed);
      invalidate(CACHE_KEYS.layouts);
      invalidate(CACHE_KEYS.themes);
      invalidate(CACHE_KEYS.fonts);
      onImported(out.theme, out.warnings || []);
    } catch (e) {
      setErr(apiErrorMessage(e, 'Import failed'));
      setBusy(null);
    }
  };

  return (
    <Modal title="Import theme" onClose={busy === 'importing' ? undefined : onClose} width={520}>
      <input
        ref={input}
        type="file"
        accept={THEME_FILE_EXTENSION}
        className="hidden"
        data-testid="theme-file-input"
        onChange={(e) => { void pick(e.target.files?.[0] || null); e.target.value = ''; }}
      />
      <div className="mb-3 flex items-center gap-2">
        <Btn onClick={() => input.current?.click()} disabled={!!busy}>{file ? 'Choose another file' : `Choose a ${THEME_FILE_EXTENSION} file`}</Btn>
        {file && <span className="min-w-0 truncate text-xs text-slate-400" title={file.name}>{file.name} · {formatBytes(file.size)}</span>}
      </div>
      {!file && (
        <p className="mb-3 text-xs text-slate-500">
          A theme file holds one or more Designer layouts and the fonts they use. Importing saves them into your account as a new theme.
        </p>
      )}
      {busy === 'reading' && <div className="mb-3 text-xs text-slate-400">Reading file…</div>}

      {summary && (
        <>
          <label className="mb-3 flex flex-col gap-1 text-[11px] uppercase tracking-wide text-slate-400">
            Theme name
            <input
              autoFocus
              className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-sm normal-case tracking-normal text-slate-100 outline-none focus:border-amber-400/60"
              value={name}
              maxLength={60}
              data-testid="theme-name-input"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
            />
          </label>
          <div className="mb-3 rounded border border-white/10 bg-white/[0.02] p-3 text-xs">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">{summary.layouts.length === 1 ? '1 layout' : `${summary.layouts.length} layouts`}</div>
            {summary.layouts.map((l, i) => (
              <div key={i} className="truncate">
                <span className="text-slate-300">{viewLabel(l.viewKey)}</span> <span className="text-slate-500">—</span> {l.name}
              </div>
            ))}
            {summary.fonts.length > 0 && (
              <div className="mt-2 text-slate-400">Fonts: {summary.fonts.join(', ')}</div>
            )}
          </div>
          {summary.warnings.map((w, i) => (
            <div key={i} className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">{w}</div>
          ))}
          <p className="mb-3 text-[11px] text-slate-500">The layouts are published straight away, so the theme is ready in DisplayHud. You can still edit them in the Designer.</p>
        </>
      )}

      {err && <div className="mb-3 text-xs text-red-300" role="alert">{err}</div>}
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose} disabled={busy === 'importing'}>Cancel</Btn>
        <Btn active disabled={!summary || !trimmed || !!busy} onClick={run} data-testid="theme-import-confirm">
          {busy === 'importing' ? 'Importing…' : 'Import theme'}
        </Btn>
      </div>
    </Modal>
  );
}
