// Built-in graphics browser: every Theme1-8 view as an insertable element,
// with a live thumbnail (the real component, scaled, fed by the editor's
// current LIVE/SIM data). Thumbnails render lazily (IntersectionObserver) and
// from a SNAPSHOT of the data taken when the tab opens, so ~30 components
// don't re-render on every engine tick while you work.

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import type { DataState } from '../bindings/index.ts';
import { listBuiltinGraphics, resolveComponent, builtinProps, type BuiltinGraphic } from '../../Themes/registry.ts';
import { allIds } from './tree.ts';
import { newId } from './ids.ts';
import { Btn, cx } from './ui.tsx';

const TW = 176;
const TH = 99;

/** A full-stage builtin element for `g`. */
export function createBuiltinElement(g: Pick<BuiltinGraphic, 'theme' | 'view' | 'label'>, doc: LayoutDocument): LayoutElement {
  return {
    id: newId('builtin', allIds(doc.elements)),
    type: 'builtin',
    name: `${g.theme} · ${g.label}`,
    x: 0,
    y: 0,
    w: doc.stage.width,
    h: doc.stage.height,
    builtin: { theme: g.theme, view: g.view },
  };
}

class ThumbBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div className="flex h-full items-center justify-center text-[10px] text-red-300/80">preview failed</div>
      : this.props.children;
  }
}

/** The real component, scaled into a tile. Mounts only once scrolled into view. */
const Thumb = memo(function Thumb({ g, data }: { g: BuiltinGraphic; data: DataState | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (visible || !ref.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setVisible(true); }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);
  const Comp = resolveComponent(g.theme, g.view);
  return (
    <div ref={ref} className="relative overflow-hidden rounded-t bg-[#15151a]" style={{ width: TW, height: TH }}>
      {visible && Comp && (
        <ThumbBoundary>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `scale(${TW / 1920})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
            <Comp {...builtinProps((data || {}) as any)} />
          </div>
        </ThumbBoundary>
      )}
    </div>
  );
});

export function BuiltinBrowser({ doc, state, disabled, onInsert }: {
  doc: LayoutDocument;
  state: DataState | null;
  disabled?: boolean;
  onInsert(el: LayoutElement): void;
}) {
  const all = useMemo(() => listBuiltinGraphics(), []);
  const themes = useMemo(() => Array.from(new Set(all.map((g) => g.theme))), [all]);
  const [theme, setTheme] = useState(themes[0] || 'Theme1');
  const [query, setQuery] = useState('');
  // Snapshot the data when the tab / theme opens; "Refresh" re-snapshots.
  const [snap, setSnap] = useState<DataState | null>(state);
  const [snapKey, setSnapKey] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => { setSnap(stateRef.current); }, [theme, snapKey]);
  // First data arriving after mount (engine was still connecting).
  useEffect(() => { if (!snap && state) setSnap(state); }, [snap, state]);

  const shown = all.filter((g) => (query ? `${g.theme} ${g.label} ${g.view}`.toLowerCase().includes(query.toLowerCase()) : g.theme === theme));
  const groups = Array.from(new Set(shown.map((g) => g.group)));

  if (!all.length) return <div className="p-3 text-[11px] text-slate-500">No built-in graphics found.</div>;

  return (
    <div className="flex flex-col" data-testid="builtin-browser">
      <div className="border-b border-white/5 p-2">
        <input
          className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-amber-400/60"
          placeholder={`Search ${all.length} graphics…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        {!query && (
          <div className="mt-2 flex flex-wrap gap-1">
            {themes.map((t) => (
              <button key={t} type="button" onClick={() => setTheme(t)} data-theme-tab={t}
                className={cx('rounded px-1.5 py-0.5 text-[10px]', theme === t ? 'bg-amber-400/20 text-amber-100' : 'text-slate-400 hover:bg-white/5')}>
                {t.replace('Theme', 'T')}
              </button>
            ))}
            <Btn small className="ml-auto" onClick={() => setSnapKey((k) => k + 1)} title="Refresh previews with the current data">↻</Btn>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 p-2">
        {groups.map((grp) => (
          <div key={grp}>
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{grp}</div>
            <div className="flex flex-col gap-2">
              {shown.filter((g) => g.group === grp).map((g) => (
                <button
                  key={`${g.theme}/${g.view}`}
                  type="button"
                  disabled={disabled}
                  data-builtin={`${g.theme}/${g.view}`}
                  onClick={() => onInsert(createBuiltinElement(g, doc))}
                  className="overflow-hidden rounded border border-white/10 text-left hover:border-amber-400/60 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ width: TW + 2 }}
                >
                  <Thumb g={g} data={snap} />
                  <div className="flex items-center justify-between px-1.5 py-1">
                    <span className="truncate text-[11px] text-slate-200">{g.label}</span>
                    <span className="text-[9px] text-slate-500">{query ? g.theme : g.screen === 'on-screen' ? 'on' : 'off'}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {shown.length === 0 && <div className="text-[11px] text-slate-500">Nothing matches “{query}”.</div>}
      </div>
      <div className="border-t border-white/5 p-2 text-[10px] text-slate-500">
        Live graphics run the theme’s own logic (recalls, kills, eliminations…). Move, scale, recolor, mask and animate them; inner parts aren’t editable.
      </div>
    </div>
  );
}
