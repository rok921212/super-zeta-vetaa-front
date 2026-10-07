// Revision history: the current draft plus every published revision.
// Published revisions are immutable; "Restore" copies one into a NEW draft
// revision on the server (the published record is never touched).

import React, { useEffect, useRef, useState } from 'react';
import { layoutsApi, type RevisionInfo } from '../api.ts';
import { CACHE_KEYS, useCached } from '../requestCache.ts';
import { Btn, Section, cx } from './ui.tsx';

export interface HistoryPanelProps {
  layoutId: string;
  draftRev: number;
  publishedRev: number;
  updatedAt?: string;
  disabled?: boolean;
  /** Bumped after a publish so the list refreshes. */
  refreshKey: number;
  onRestore(rev: number): Promise<void>;
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function HistoryPanel({ layoutId, draftRev, publishedRev, updatedAt, disabled, refreshKey, onRestore }: HistoryPanelProps) {
  // Cached per layout: reopening History costs nothing; a publish (refreshKey) refetches.
  const query = useCached<RevisionInfo[]>(CACHE_KEYS.revisions(layoutId), () => layoutsApi.revisions(layoutId));
  const revs = query.data ? [...query.data].sort((a, b) => b.rev - a.rev) : null;
  const [actionErr, setErr] = useState<string | null>(null);
  const err = actionErr || (query.error && !query.data ? 'Could not load revisions' : null);
  const [busy, setBusy] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);

  const load = () => { setErr(null); void query.reload(); };
  const firstKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === firstKey.current) return; // the mount fetch (or the cache) already covers it
    firstKey.current = refreshKey;
    void query.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const restore = async (rev: number) => {
    setBusy(rev);
    setConfirm(null);
    try { await onRestore(rev); } catch (e: any) { setErr(e?.message || 'Restore failed'); } finally { setBusy(null); }
  };

  return (
    <Section title="History" help="history" right={<Btn small onClick={load}>↻</Btn>}>
      <div className="rounded border border-amber-400/30 bg-amber-400/5 px-2 py-1.5">
        <div className="text-[11px] font-semibold text-amber-100">Draft · save #{draftRev}</div>
        <div className="text-[10px] text-slate-500">Working copy{updatedAt ? ` · ${fmt(updatedAt)}` : ''}</div>
      </div>
      {err && <div className="text-[11px] text-red-300">{err}</div>}
      {!revs && !err && <div className="text-[11px] text-slate-500">Loading…</div>}
      {revs && revs.length === 0 && <div className="text-[11px] text-slate-500">Not published yet.</div>}
      {revs?.map((r) => (
        <div key={r.rev} className={cx('rounded border px-2 py-1.5', r.rev === publishedRev ? 'border-emerald-400/40 bg-emerald-400/5' : 'border-white/5')}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold text-slate-100">
                Revision {r.rev} {r.rev === publishedRev && <span className="ml-1 rounded bg-emerald-400/20 px-1 text-[9px] uppercase text-emerald-200">live</span>}
              </div>
              <div className="text-[10px] text-slate-500">Published · {fmt(r.createdAt)}</div>
            </div>
            {confirm === r.rev ? (
              <div className="flex gap-1">
                <Btn small active disabled={disabled} onClick={() => restore(r.rev)}>Confirm</Btn>
                <Btn small onClick={() => setConfirm(null)}>✕</Btn>
              </div>
            ) : (
              <Btn small disabled={disabled || busy != null} onClick={() => setConfirm(r.rev)}>{busy === r.rev ? '…' : 'Restore'}</Btn>
            )}
          </div>
          {confirm === r.rev && <div className="mt-1 text-[10px] text-slate-400">Replaces the current draft with revision {r.rev}. The live overlay is unchanged until you publish.</div>}
        </div>
      ))}
    </Section>
  );
}
