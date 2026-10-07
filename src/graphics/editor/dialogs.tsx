// Designer modal dialogs: revision conflict and publish.

import React, { useEffect, useMemo, useState } from 'react';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { validateLayout } from '../schema/layoutSchema.js';
import { ValidationError, apiErrorMessage, overlayUrl, type CustomTheme, type LayoutDefaults } from '../api.ts';
import { ThemeAssign, applyThemeChoice, defaultThemeChoice, type ThemeChoice } from './ThemeAssign.tsx';
import { viewLabel } from '../../dashboard/overlayViews.ts';
import { flatten } from './tree.ts';
import { Btn, cx } from './ui.tsx';

export function Modal({ title, children, onClose, width = 480 }: { title: string; children: React.ReactNode; onClose?(): void; width?: number }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full overflow-auto rounded-lg border border-white/10 bg-neutral-900 p-5 text-slate-200 shadow-2xl" style={{ maxWidth: width }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>
          {onClose && <button type="button" className="text-slate-500 hover:text-slate-200" onClick={onClose} aria-label="Close">✕</button>}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── conflict ────────────────────────────────────────────────────────────────

/** Element-level diff summary between two documents (by id). */
export function diffDocs(mine: LayoutDocument, theirs: LayoutDocument) {
  const index = (d: LayoutDocument) => new Map(flatten(d.elements).map(({ el }) => [el.id, el] as [string, LayoutElement]));
  const a = index(mine);
  const b = index(theirs);
  const label = (el: LayoutElement) => el.name || `${el.type} ${el.id}`;
  const onlyMine: string[] = [];
  const onlyTheirs: string[] = [];
  const changed: string[] = [];
  const strip = (el: LayoutElement) => JSON.stringify({ ...el, children: undefined });
  a.forEach((el, id) => {
    const o = b.get(id);
    if (!o) onlyMine.push(label(el));
    else if (strip(el) !== strip(o)) changed.push(label(el));
  });
  b.forEach((el, id) => { if (!a.has(id)) onlyTheirs.push(label(el)); });
  const docChanged = ['stage', 'theme', 'variables', 'brand'].some((k) => JSON.stringify((mine as any)[k]) !== JSON.stringify((theirs as any)[k]));
  return { onlyMine, onlyTheirs, changed, docChanged };
}

export function ConflictDialog({ mine, loadServer, onReload, onKeepMine, onKeepEditing }: {
  mine: LayoutDocument;
  /** Fetch the server's current draft (for Compare). */
  loadServer(): Promise<LayoutDocument>;
  onReload(): void;
  onKeepMine(): void;
  onKeepEditing(): void;
}) {
  const [server, setServer] = useState<LayoutDocument | null>(null);
  const [comparing, setComparing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const diff = useMemo(() => (server ? diffDocs(mine, server) : null), [mine, server]);
  const compare = async () => {
    setComparing(true);
    try { setServer(await loadServer()); } catch { setErr('Could not load the server version'); }
  };
  const list = (title: string, items: string[]) => items.length > 0 && (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{title} ({items.length})</div>
      <div className="text-[11px] text-slate-300">{items.slice(0, 12).join(', ')}{items.length > 12 ? '…' : ''}</div>
    </div>
  );
  return (
    <Modal title="This layout was changed somewhere else">
      <p className="mb-3 text-xs text-slate-400">
        Another tab or device saved this layout after you opened it. Autosave is paused — nothing has been overwritten.
      </p>
      {comparing && (
        <div className="mb-3 flex flex-col gap-2 rounded border border-white/10 bg-black/30 p-3">
          {err && <div className="text-[11px] text-red-300">{err}</div>}
          {!diff && !err && <div className="text-[11px] text-slate-500">Loading server version…</div>}
          {diff && (
            <>
              {list('Only in your version', diff.onlyMine)}
              {list('Only in server version', diff.onlyTheirs)}
              {list('Different', diff.changed)}
              {diff.docChanged && <div className="text-[11px] text-slate-300">Stage / theme settings differ.</div>}
              {!diff.onlyMine.length && !diff.onlyTheirs.length && !diff.changed.length && !diff.docChanged && (
                <div className="text-[11px] text-emerald-300">The versions are identical.</div>
              )}
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {!comparing && <Btn onClick={compare}>Compare</Btn>}
        <Btn onClick={onKeepEditing}>Keep editing</Btn>
        <Btn onClick={onReload}>Reload server version</Btn>
        <Btn active onClick={onKeepMine}>Keep mine (overwrite)</Btn>
      </div>
    </Modal>
  );
}

// ── publish ─────────────────────────────────────────────────────────────────

type PublishPhase = 'confirm' | 'publishing' | 'done' | 'error';

export function PublishDialog({ doc, layoutId, layoutName, themes, onThemesChanged, publicId, publishedRev, defaults, flush, publish, onClose, onSelectPath }: {
  doc: LayoutDocument;
  layoutId: string;
  layoutName: string;
  /** The user's custom themes (null while loading). */
  themes: CustomTheme[] | null;
  /** Called after the theme assignment changed (so callers can reload). */
  onThemesChanged(): void;
  publicId: string;
  publishedRev: number;
  defaults: LayoutDefaults;
  flush(): Promise<void>;
  publish(): Promise<{ publishedRev: number }>;
  onClose(): void;
  /** Jump to the element an error path points at (elements[2].children[0] ...). */
  onSelectPath(path: string): void;
}) {
  const validation = useMemo(() => validateLayout(doc) as { ok: boolean; errors: Array<{ path: string; message: string }> }, [doc]);
  const [phase, setPhase] = useState<PublishPhase>('confirm');
  const [errors, setErrors] = useState<Array<{ path: string; message: string }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [rev, setRev] = useState(publishedRev);
  const [copied, setCopied] = useState(false);
  const url = overlayUrl(publicId, { t: defaults.tournamentId, r: defaults.roundId, mode: defaults.matchMode });
  const shown = phase === 'error' ? errors : validation.errors;
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  useEffect(() => {
    if (themes && !choice) setChoice(defaultThemeChoice(themes, layoutId, layoutName));
  }, [themes, choice, layoutId, layoutName]);
  const [themeResult, setThemeResult] = useState<{ ok: boolean; text: string } | null>(null);

  const go = async () => {
    setPhase('publishing');
    try {
      await flush();
      const res = await publish();
      setRev(res.publishedRev);
      // Theme assignment is best-effort: the publish already succeeded.
      if (choice && themes) {
        try {
          const t = await applyThemeChoice(choice, layoutId, themes);
          setThemeResult({ ok: true, text: t ? `Added to ${t.label} (${t.name}) as ${viewLabel(choice.viewKey)}.` : 'Not added to a theme.' });
          onThemesChanged();
        } catch (err) {
          setThemeResult({ ok: false, text: `Published, but the theme could not be updated: ${apiErrorMessage(err)}` });
        }
      }
      setPhase('done');
    } catch (err: any) {
      if (err instanceof ValidationError) { setErrors(err.errors); setMessage('The server rejected the layout.'); }
      else { setErrors([]); setMessage(apiErrorMessage(err, 'Publish failed')); }
      setPhase('error');
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <Modal title={phase === 'done' ? 'Published successfully' : 'Publish layout'} onClose={phase === 'publishing' ? undefined : onClose} width={560}>
      {phase === 'done' ? (
        <div className="flex flex-col gap-3">
          {themeResult && (
            <div className={cx('rounded border px-2 py-1.5 text-xs', themeResult.ok ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-amber-400/30 bg-amber-400/10 text-amber-100')} data-testid="publish-theme">
              {themeResult.text}{themeResult.ok && themeResult.text.startsWith('Added') && ' It now appears in DisplayHud → Pick a theme.'}
            </div>
          )}
          <div className="text-xs text-slate-400">Revision <span className="font-semibold text-emerald-300">{rev}</span> is live. Published revisions are immutable — later edits stay in the draft until you publish again.</div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">OBS Browser Source URL</div>
            <div className="break-all rounded border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-slate-100" data-testid="publish-url">{url}</div>
          </div>
          <div className="flex justify-end gap-2">
            <Btn onClick={copy}>{copied ? 'Copied' : 'Copy URL'}</Btn>
            <Btn onClick={() => window.open(url, '_blank', 'noopener')}>Open output</Btn>
            <Btn active onClick={onClose}>Done</Btn>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.length > 0 ? (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-2">
              <div className="mb-1 text-[11px] font-semibold text-red-200">{message || `Fix ${shown.length} problem${shown.length > 1 ? 's' : ''} before publishing:`}</div>
              <ul className="max-h-48 overflow-auto text-[11px]">
                {shown.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    <button type="button" className="text-left text-red-100 hover:underline" onClick={() => onSelectPath(e.path)}>
                      <span className="font-mono text-red-300">{e.path}</span> — {e.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : phase === 'error' ? (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-200">{message}</div>
          ) : (
            <div className="text-xs text-slate-400">
              The current draft is saved and becomes revision <span className="font-semibold text-slate-100">{publishedRev + 1}</span>. Every OBS source using this layout picks it up within a minute.
            </div>
          )}
          <div className="rounded border border-white/10 bg-white/[0.02] p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Add to theme</div>
            {themes && choice
              ? <ThemeAssign themes={themes} layoutId={layoutId} value={choice} onChange={setChoice} disabled={phase === 'publishing'} />
              : <div className="text-[11px] text-slate-500">Loading themes…</div>}
            <div className="mt-2 text-[10px] text-slate-500">Custom themes appear in DisplayHud after Theme1-8 (Theme9, Theme10, …).</div>
          </div>
          <div className="flex justify-end gap-2">
            <Btn onClick={onClose} disabled={phase === 'publishing'}>Cancel</Btn>
            <Btn active disabled={!validation.ok || phase === 'publishing'} onClick={go}>
              {phase === 'publishing' ? 'Publishing…' : phase === 'error' ? 'Retry publish' : 'Publish'}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Map a validator path like `elements[2].children[0].bind.text` to an element id. */
export function elementIdAtPath(doc: LayoutDocument, path: string): string | null {
  const m = path.match(/^elements((?:\[\d+\](?:\.children)?)+)/);
  if (!m) return null;
  const idx = (m[1].match(/\d+/g) || []).map(Number);
  let list: LayoutElement[] | undefined = doc.elements;
  let el: LayoutElement | undefined;
  for (const i of idx) {
    el = list?.[i];
    if (!el) return null;
    list = el.children;
  }
  return el?.id ?? null;
}
