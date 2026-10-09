// The canvas's right-click menu. It only lists actions that apply to what was
// clicked, and every item runs the same command its keyboard shortcut runs.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from './ui.tsx';

export interface MenuItem {
  label: string;
  /** Shown on the right ("Ctrl+D"). */
  keys?: string;
  onClick(): void;
  disabled?: boolean;
  danger?: boolean;
  /** An on/off option: shows a tick when true. */
  checked?: boolean;
  title?: string;
  testId?: string;
}

/** `null` entries are separators. */
export type MenuEntry = MenuItem | null;

export function CanvasMenu({ x, y, items, onClose, testId = 'canvas-menu' }: { x: number; y: number; items: MenuEntry[]; onClose(): void; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Keep the whole menu on screen.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  // Leading / trailing / doubled separators are dropped.
  const shown = items.filter((it, i, all) => it !== null || (i > 0 && i < all.length - 1 && all[i - 1] !== null));

  return (
    <div
      ref={ref}
      role="menu"
      data-testid={testId}
      className="fixed z-[120] min-w-[200px] overflow-hidden rounded border border-white/10 bg-neutral-950 py-1 text-xs shadow-2xl"
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
    >
      {shown.map((it, i) => (it === null ? (
        <div key={`sep${i}`} className="my-1 border-t border-white/5" />
      ) : (
        <button
          key={it.label}
          type="button"
          role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
          aria-checked={it.checked}
          title={it.title}
          data-testid={it.testId}
          disabled={it.disabled}
          onClick={() => { onClose(); it.onClick(); }}
          className={cx('flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-35', it.danger ? 'text-red-300 hover:bg-red-500/15' : 'text-slate-200 hover:bg-white/10')}
        >
          <span>{it.checked !== undefined && <span className="mr-2 inline-block w-3 text-amber-300">{it.checked ? '✓' : ''}</span>}{it.label}</span>
          {it.keys && <span className="font-mono text-[10px] text-slate-500">{it.keys}</span>}
        </button>
      )))}
    </div>
  );
}

/** A toolbar button that opens a CanvasMenu under itself (fixed, so a scrolling toolbar cannot clip it). */
export function ToolbarMenu({ label, items, title, testId, active }: { label: React.ReactNode; items: MenuEntry[]; title?: string; testId?: string; active?: boolean }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  // The menu closes on any outside pointerdown, including one on this button: don't reopen on that same click.
  const closedAt = useRef(0);
  const close = useCallback(() => { closedAt.current = Date.now(); setAt(null); }, []);
  return (
    <>
      <button
        ref={btn}
        type="button"
        title={title}
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={!!at}
        onClick={() => {
          if (at || Date.now() - closedAt.current < 250) { setAt(null); return; }
          const r = btn.current!.getBoundingClientRect();
          setAt({ x: r.left, y: r.bottom + 4 });
        }}
        className={cx('inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] transition-colors', at || active ? 'border-amber-400/70 bg-amber-400/15 text-amber-200' : 'border-white/10 text-slate-300 hover:bg-white/5')}
      >
        {label} <span className="text-[9px] opacity-70">▾</span>
      </button>
      {at && <CanvasMenu x={at.x} y={at.y} items={items} onClose={close} testId={testId ? testId + '-menu' : 'toolbar-menu'} />}
    </>
  );
}
