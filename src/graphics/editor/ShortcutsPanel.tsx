// The keyboard shortcut sheet (press ?). Reads the same SHORTCUTS list the
// tests check against the real key map, so it cannot drift from what works.

import React, { useEffect, useMemo, useState } from 'react';
import { SHORTCUTS } from './useEditorHotkeys.ts';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

export const showKeys = (keys: string): string => keys.replace(/mod/g, isMac ? '⌘' : 'Ctrl');

export function ShortcutsPanel({ onClose }: { onClose(): void }) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SHORTCUTS
      .map((g) => ({ ...g, items: g.items.filter((i) => !q || `${i.does} ${i.keys} ${g.group}`.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [query]);
  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose} data-testid="shortcuts-panel">
      <div className="flex max-h-[86vh] w-full max-w-4xl flex-col rounded-lg border border-white/10 bg-neutral-900 text-slate-200 shadow-2xl" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="text-sm font-semibold text-slate-100">Keyboard shortcuts</div>
          <input
            autoFocus
            className="ml-auto w-64 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-400/60"
            placeholder="Search — align, zoom, keyframe…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }}
          />
          <button type="button" className="text-slate-500 hover:text-slate-200" aria-label="Close shortcuts" onClick={onClose}>✕</button>
        </div>
        <div className="grid min-h-0 flex-1 gap-x-8 gap-y-4 overflow-y-auto p-4 sm:grid-cols-2">
          {groups.length === 0 && <div className="text-xs text-slate-500">Nothing matches “{query}”.</div>}
          {groups.map((g) => (
            <div key={g.group}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{g.group}</div>
              <div className="flex flex-col gap-1">
                {g.items.map((i) => (
                  <div key={i.keys + i.does} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-slate-300">{i.does}</span>
                    <kbd className="shrink-0 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">{showKeys(i.keys)}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
