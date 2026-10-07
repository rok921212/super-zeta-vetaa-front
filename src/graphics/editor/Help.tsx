// In-place guidance: an ⓘ button that opens a short "how to use this" card,
// and the first-run quick start. Copy lives in helpContent.ts.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HELP, QUICK_START, type HelpEntry, type HelpTopic } from './helpContent.ts';

const CARD_W = 300;

/** ⓘ — click to read how the panel / section next to it works. */
export function InfoButton({ topic, label }: { topic: HelpTopic; label?: string }) {
  const entry: HelpEntry = HELP[topic];
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Fixed-position, so the card is never clipped by a scrolling panel.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const h = cardRef.current?.offsetHeight ?? 0;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;
    const left = Math.max(8, Math.min(vw - CARD_W - 8, r.left + r.width / 2 - CARD_W / 2));
    const below = r.bottom + 6;
    const top = h && below + h > vh - 8 ? Math.max(8, r.top - 6 - h) : below;
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!cardRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <>
      {/* A span, not a <button>: inside a read-only panel (<fieldset disabled>) a button could not be clicked. */}
      <span
        ref={btnRef}
        role="button"
        tabIndex={0}
        aria-label={`Help: ${entry.title}`}
        aria-expanded={open}
        data-help={topic}
        title={entry.title}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); } }}
        className={`inline-flex shrink-0 cursor-pointer select-none items-center gap-1 rounded-full border px-1.5 text-[10px] leading-4 normal-case tracking-normal ${open ? 'border-sky-400/70 bg-sky-400/20 text-sky-100' : 'border-white/15 text-slate-400 hover:border-sky-400/50 hover:text-sky-200'}`}
      >
        <span aria-hidden>ⓘ</span>{label && <span>{label}</span>}
      </span>
      {open && (
        <div
          ref={cardRef}
          role="dialog"
          aria-label={entry.title}
          data-testid="help-card"
          className="z-[120] rounded-md border border-sky-400/30 bg-neutral-900 p-3 text-left text-[11px] normal-case leading-snug tracking-normal text-slate-300 shadow-2xl"
          style={{ position: 'fixed', width: CARD_W, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
        >
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <div className="text-xs font-semibold text-slate-100">{entry.title}</div>
            <button type="button" aria-label="Close help" className="text-slate-500 hover:text-slate-200" onClick={() => setOpen(false)}>✕</button>
          </div>
          <HelpBody entry={entry} />
        </div>
      )}
    </>
  );
}

function HelpBody({ entry }: { entry: HelpEntry }) {
  return (
    <>
      {entry.intro && <p className="mb-2 text-slate-300">{entry.intro}</p>}
      {entry.steps && (
        <ol className="mb-2 list-decimal space-y-1 pl-4 text-slate-200">
          {entry.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
      {entry.tips && (
        <ul className="space-y-1 text-slate-400">
          {entry.tips.map((t) => <li key={t} className="flex gap-1.5"><span className="text-sky-300">•</span><span>{t}</span></li>)}
        </ul>
      )}
    </>
  );
}

const SEEN_KEY = 'designer.guide.seen';

/** Has this browser already been shown the quick start? (A per-viewer convenience — never required.) */
export function guideSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}
export function markGuideSeen(): void {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage unavailable */ }
}

/** The four-step quick start, opened from the toolbar's Guide button (and once on first use). */
export function QuickStart({ onClose }: { onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose} data-testid="quick-start">
      <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-neutral-900 p-5 text-slate-200 shadow-2xl" role="dialog" aria-label="Quick start" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 text-base font-semibold text-slate-100">Build an overlay in four steps</div>
        <p className="mb-4 text-xs text-slate-400">Every panel has an ⓘ button that explains what it does. This guide is always under “Guide” in the top bar.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {QUICK_START.map((s) => (
            <div key={s.title} className="rounded border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-1 text-sm font-semibold text-amber-200">{s.title}</div>
              <div className="text-xs leading-snug text-slate-300">{s.body}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">Tip: scroll over the canvas to zoom, hold Space and drag to move around.</span>
          <button type="button" className="rounded border border-amber-400/70 bg-amber-400/15 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-400/25" onClick={onClose}>Start designing</button>
        </div>
      </div>
    </div>
  );
}
