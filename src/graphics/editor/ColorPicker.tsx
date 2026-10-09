// The colour popover every colour field in the Designer opens: hue from the
// browser's own picker, an opacity slider, HEX / RGBA typing, the design's
// theme colours, the colours used most recently, and the screen eyedropper
// where the browser has one (Chromium). It edits a plain CSS colour string.

import React, { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { formatColor, parseColor, recentColors, rememberColor, subscribeRecentColors, toHex, type Rgba } from './color.ts';

/** The design's own palette (theme colours), offered as swatches. The editor provides it. */
export const SwatchContext = createContext<Array<{ label: string; color: string }>>([]);

const CHECKER = 'linear-gradient(45deg,#3a3a42 25%,transparent 25%),linear-gradient(-45deg,#3a3a42 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#3a3a42 75%),linear-gradient(-45deg,transparent 75%,#3a3a42 75%)';

/** A colour over a checkerboard, so transparency is visible. */
export function Swatch({ color, size = 18, title, selected, onClick }: { color: string | undefined; size?: number; title?: string; selected?: boolean; onClick?(): void }) {
  const Tag: any = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      title={title ?? color}
      aria-label={onClick ? title ?? color : undefined}
      onClick={onClick}
      style={{
        width: size, height: size, flex: 'none', display: 'inline-block', borderRadius: 3, position: 'relative', overflow: 'hidden',
        border: selected ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.18)',
        backgroundColor: '#22222a', backgroundImage: CHECKER, backgroundSize: '8px 8px', backgroundPosition: '0 0,0 4px,4px -4px,-4px 0',
        cursor: onClick ? 'pointer' : undefined, padding: 0,
      }}
    >
      <span style={{ position: 'absolute', inset: 0, background: color || 'transparent' }} />
    </Tag>
  );
}

const hasEyeDropper = (): boolean => typeof window !== 'undefined' && typeof (window as any).EyeDropper === 'function';

export function ColorPopover({ value, onChange, onClose }: { value: string | undefined; onChange(v: string | undefined): void; onClose(): void }) {
  const swatches = useContext(SwatchContext);
  const recents = useSyncExternalStore(subscribeRecentColors, recentColors, recentColors);
  const parsed = parseColor(value);
  const cur: Rgba = parsed || { r: 0, g: 0, b: 0, a: 1 };
  const [text, setText] = useState(value || '');
  const [picking, setPicking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => { setText(value || ''); }, [value]);

  // Outside click / Escape closes; the colour in use when it closes joins the recent list.
  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
      rememberColor(latest.current);
    };
  }, [onClose]);

  const set = (c: Rgba) => onChange(formatColor(c));
  const commitText = () => {
    const t = text.trim();
    if (!t) return onChange(undefined);
    const c = parseColor(t);
    if (c) onChange(formatColor(c));
    else setText(value || ''); // not a colour: put back what was there
  };
  const eyedrop = async () => {
    setPicking(true);
    try {
      const res = await new (window as any).EyeDropper().open();
      const c = parseColor(res?.sRGBHex);
      if (c) { set({ ...c, a: cur.a }); rememberColor(formatColor({ ...c, a: cur.a })); }
    } catch { /* cancelled with Esc */ } finally { setPicking(false); }
  };
  const alphaPct = Math.round(cur.a * 100);
  const opaque = toHex(cur);
  const row = (label: string, list: Array<{ label: string; color: string }>) => list.length > 0 && (
    <div>
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="flex flex-wrap gap-1">
        {list.map((s, i) => <Swatch key={`${s.color}${i}`} color={s.color} title={`${s.label} · ${s.color}`} selected={s.color === value} onClick={() => onChange(s.color)} />)}
      </div>
    </div>
  );

  return (
    <div ref={ref} role="dialog" aria-label="Colour" data-testid="color-popover" className="absolute right-0 z-40 mt-1 flex w-56 flex-col gap-2 rounded border border-white/10 bg-neutral-950 p-2 shadow-2xl" onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label="Hue and shade" className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent" value={opaque} onChange={(e) => { const c = parseColor(e.target.value); if (c) set({ ...c, a: cur.a }); }} />
        <Swatch color={value} size={32} />
        {hasEyeDropper() && (
          <button type="button" disabled={picking} onClick={() => void eyedrop()} title="Pick a colour from anywhere on the screen" className="ml-auto rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10 disabled:opacity-40">
            {picking ? 'Click a pixel…' : 'Eyedropper'}
          </button>
        )}
      </div>
      <label className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
        Opacity
        <input
          type="range" min={0} max={100} value={alphaPct} aria-label="Opacity" className="min-w-0 flex-1 accent-amber-400"
          style={{ background: `linear-gradient(90deg, transparent, ${opaque})` }}
          onChange={(e) => set({ ...cur, a: Number(e.target.value) / 100 })}
        />
        <span className="w-8 text-right font-mono normal-case text-slate-200">{alphaPct}%</span>
      </label>
      <input
        aria-label="HEX or RGBA"
        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-slate-100 outline-none focus:border-amber-400/60"
        value={text}
        placeholder="#rrggbb or rgba(r, g, b, a)"
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => { if (e.key === 'Enter') commitText(); }}
      />
      {row('This design', swatches)}
      {row('Recent', recents.map((c) => ({ label: 'Recent', color: c })))}
      <div className="flex justify-between">
        <button type="button" className="text-[11px] text-slate-400 hover:text-slate-100" onClick={() => onChange(undefined)}>No colour</button>
        <button type="button" className="text-[11px] text-amber-200 hover:text-amber-100" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
