// A small, working slice of the Designer for the home page: layers, a canvas
// and an inspector around the REAL layout renderer, fed by the same seeded
// simulation the simulator uses. A visitor can select layers (in the list or on
// the canvas), drag them, change colours and text, add a shape or a text and
// fire match events. Nothing is saved; "Reset" puts the starter layout back.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SiteContent } from '../../content/siteContent.types.ts';
import { createSimulation, SIM_ROUND_ID, SIM_TOURNAMENT_ID, type Simulation } from '../../graphics/editor/simulation.ts';
import { useOverlayEngine } from '../../overlayClient/react.ts';
import type { EngineOptions } from '../../overlayClient/engineTypes.ts';
import { LayoutRenderer } from '../../graphics/renderer/LayoutRenderer.tsx';
import { STARTER_TEMPLATES } from '../../graphics/templates/index.ts';
import { createEmptyLayout } from '../../graphics/schema/layoutSchema.js';
import type { LayoutDocument, LayoutElement } from '../../graphics/schema/layoutTypes.ts';
import { SmartLink } from '../sections/ui.tsx';

type Text = SiteContent['designer'];

/** The starter scene: three templates that together look like a broadcast. */
const SCENE = ['lower-third', 'live-standings', 'kill-feed'];
const THEME_KEYS = ['primary', 'secondary', 'accent', 'text'] as const;

function starterDoc(): LayoutDocument {
  const doc = createEmptyLayout() as LayoutDocument;
  doc.name = 'My overlay';
  doc.stage = { ...doc.stage, background: null };
  const els = SCENE.flatMap((id) => STARTER_TEMPLATES.find((t) => t.id === id)?.elements || []);
  doc.elements = JSON.parse(JSON.stringify(els));
  return doc;
}

// ── tree helpers ─────────────────────────────────────────────────────────────

interface Row { el: LayoutElement; depth: number; absX: number; absY: number }

function flatten(els: LayoutElement[], depth = 0, ox = 0, oy = 0, out: Row[] = []): Row[] {
  for (const el of els) {
    out.push({ el, depth, absX: ox + el.x, absY: oy + el.y });
    if (el.children?.length) flatten(el.children, depth + 1, ox + el.x, oy + el.y, out);
  }
  return out;
}

function updateEl(els: LayoutElement[], id: string, fn: (el: LayoutElement) => LayoutElement): LayoutElement[] {
  return els.map((el) => {
    if (el.id === id) return fn(el);
    if (el.children?.length) {
      const children = updateEl(el.children, id, fn);
      if (children !== el.children && children.some((c, i) => c !== el.children![i])) return { ...el, children };
    }
    return el;
  });
}

function removeEl(els: LayoutElement[], id: string): LayoutElement[] {
  return els.filter((el) => el.id !== id).map((el) => (el.children?.length ? { ...el, children: removeEl(el.children, id) } : el));
}

/** A style colour is a literal or `{ ref: 'theme.colors.x' }`: this gives the colour it shows. */
function resolveColor(v: unknown, doc: LayoutDocument): { hex: string; themeKey?: string } {
  if (v && typeof v === 'object' && typeof (v as any).ref === 'string') {
    const key = String((v as any).ref).replace(/^theme\.colors\./, '');
    return { hex: toHex((doc.theme?.colors as any)?.[key]), themeKey: key };
  }
  return { hex: toHex(v) };
}

/** <input type="color"> only takes #rrggbb; rgba() and the rest show as their nearest solid. */
function toHex(v: unknown): string {
  const s = String(v || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  const m = s.match(/rgba?\((\d+)\D+(\d+)\D+(\d+)/i);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => Math.min(255, +n).toString(16).padStart(2, '0')).join('')}`;
  return '#000000';
}

const TYPE_ICON: Record<string, string> = { group: '▣', repeater: '☰', rect: '■', text: 'T', image: '◩', teamLogo: '◩', icon: '✦', ellipse: '●' };

let nextId = 1;

// ── small UI pieces ──────────────────────────────────────────────────────────

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="block font-mono text-[9px] tracking-[0.18em] text-[#55565C] uppercase mb-1">{children}</span>
);
const numCls = 'w-full bg-[#0B0C0E] border border-[#24262B] px-2 py-1 text-xs text-[#F4F2EE] font-mono focus:outline-none focus:border-[#E11D2E]';
const ToolBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }> = ({ active, className = '', ...rest }) => (
  <button
    type="button"
    className={`px-2.5 py-1.5 text-[11px] font-mono tracking-[0.06em] uppercase border transition-colors ${active ? 'border-[#E11D2E] bg-[#E11D2E]/15 text-[#F4F2EE]' : 'border-[#24262B] bg-[#17181D] text-[#93959C] hover:border-[#E11D2E] hover:text-[#F4F2EE]'} ${className}`}
    {...rest}
  />
);

// ── the glimpse ──────────────────────────────────────────────────────────────

const DesignerGlimpse: React.FC<{ text: Text }> = ({ text }) => {
  const sim = useMemo<Simulation>(() => createSimulation(), []);
  const engineOptions = useMemo<EngineOptions>(
    () => ({ tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, matchId: null, followSelected: true, view: null }),
    [],
  );
  const makeTransport = useCallback(() => sim.transport, [sim]);
  const { state, engine } = useOverlayEngine(engineOptions, makeTransport);

  const [doc, setDoc] = useState<LayoutDocument>(starterDoc);
  const [selected, setSelected] = useState<string | null>('lt_title');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ ls_rows: true });
  const [scale, setScale] = useState(0);
  const [replay, setReplay] = useState(0);

  const rows = useMemo(() => flatten(doc.elements), [doc.elements]);
  const sel = rows.find((r) => r.el.id === selected) || null;

  // Rows under a collapsed parent are hidden in the list (not on the canvas).
  const visibleRows = useMemo(() => {
    const out: Row[] = [];
    let hideBelow = Infinity;
    for (const r of rows) {
      if (r.depth > hideBelow) continue;
      hideBelow = Infinity;
      out.push(r);
      if (r.el.children?.length && collapsed[r.el.id]) hideBelow = r.depth;
    }
    return out;
  }, [rows, collapsed]);

  const patch = useCallback((id: string, fn: (el: LayoutElement) => LayoutElement) => setDoc((d) => ({ ...d, elements: updateEl(d.elements, id, fn) })), []);
  const patchStyle = (id: string, style: Record<string, unknown>) => patch(id, (el) => ({ ...el, style: { ...(el.style || {}), ...style } as any }));
  const setThemeColor = (key: string, value: string) => setDoc((d) => ({ ...d, theme: { ...d.theme, colors: { ...(d.theme?.colors || {}), [key]: value } } as any }));

  // ── drag on the canvas ──
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const onElementPointerDown = useCallback((id: string, e: React.PointerEvent) => {
    setSelected(id);
    const row = flatten(docRef.current.elements).find((r) => r.el.id === id);
    if (!row || row.el.locked) return;
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: row.el.x, oy: row.el.y };
  }, []);
  const docRef = useRef(doc);
  docRef.current = doc;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !scaleRef.current) return;
      const x = Math.round(d.ox + (e.clientX - d.sx) / scaleRef.current);
      const y = Math.round(d.oy + (e.clientY - d.sy) / scaleRef.current);
      patch(d.id, (el) => (el.x === x && el.y === y ? el : { ...el, x, y }));
    };
    const up = () => { drag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [patch]);

  // ── toolbar actions ──
  const add = (type: 'rect' | 'text') => {
    const id = `home_${type}_${nextId++}`;
    const el: LayoutElement = type === 'rect'
      ? { id, type, name: 'Shape', x: 810, y: 440, w: 300, h: 160, style: { fill: { ref: 'theme.colors.primary' }, radius: 12 } as any }
      : { id, type, name: 'Text', x: 660, y: 480, w: 600, h: 90, text: 'YOUR TEXT', style: { color: '#ffffff', fontSize: 64, fontWeight: 800, align: 'center', fontFamily: { ref: 'theme.typography.fontFamily' } } as any };
    setDoc((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelected(id);
  };
  const remove = () => {
    if (!sel) return;
    setDoc((d) => ({ ...d, elements: removeEl(d.elements, sel.el.id) }));
    setSelected(null);
  };
  const reset = () => { setDoc(starterDoc()); setSelected('lt_title'); setReplay((r) => r + 1); };

  const el = sel?.el;
  const bound = el?.bind?.text?.path;
  const fill = el?.style && 'fill' in (el.style as any) ? resolveColor((el.style as any).fill, doc) : null;
  const color = el?.style && 'color' in (el.style as any) ? resolveColor((el.style as any).color, doc) : null;

  return (
    <div className="bg-[#131418] border border-[#24262B] select-none">
      {/* Title bar + toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[#24262B]">
        <span className="flex gap-1 mr-1" aria-hidden>
          <span className="w-2.5 h-2.5 rounded-full bg-[#3a3b40]" /><span className="w-2.5 h-2.5 rounded-full bg-[#3a3b40]" /><span className="w-2.5 h-2.5 rounded-full bg-[#3a3b40]" />
        </span>
        <span className="font-mono text-[11px] text-[#93959C] mr-3">{doc.name}</span>
        <ToolBtn active title="Move (V)">↖ Move</ToolBtn>
        <ToolBtn onClick={() => add('rect')} title="Add a shape">■ Shape</ToolBtn>
        <ToolBtn onClick={() => add('text')} title="Add a text">T Text</ToolBtn>
        <ToolBtn onClick={remove} disabled={!sel} className="disabled:opacity-40">✕ Delete</ToolBtn>
        <ToolBtn onClick={() => setReplay((r) => r + 1)} title="Play the enter animations again">↻ Animate</ToolBtn>
        <span className="flex-1" />
        <span className="font-mono text-[9px] tracking-[0.18em] text-[#55565C] uppercase hidden sm:inline">Simulate</span>
        <ToolBtn onClick={() => sim.controls.kill()}>+ Kill</ToolBtn>
        <ToolBtn onClick={() => sim.controls.knock()}>Knock</ToolBtn>
        <ToolBtn onClick={() => sim.controls.eliminate()}>Eliminate</ToolBtn>
        <ToolBtn onClick={reset}>Reset</ToolBtn>
      </div>

      <div className="grid lg:grid-cols-[200px_minmax(0,1fr)_240px]">
        {/* Layers */}
        <div className="order-2 lg:order-1 border-t lg:border-t-0 lg:border-r border-[#24262B] p-2 max-h-[260px] lg:max-h-[520px] overflow-y-auto [scrollbar-color:#24262B_transparent] [scrollbar-width:thin]">
          <Label>Layers</Label>
          <ul>
            {visibleRows.map(({ el: r, depth }) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r.id)}
                  className={`w-full flex items-center gap-1.5 py-1 pr-1 text-left text-[12px] truncate ${r.id === selected ? 'bg-[#E11D2E]/15 text-[#F4F2EE]' : 'text-[#93959C] hover:bg-[#17181D]'}`}
                  style={{ paddingLeft: 4 + depth * 12 }}
                >
                  {r.children?.length
                    ? (
                      <span
                        role="button"
                        aria-label={collapsed[r.id] ? 'Expand' : 'Collapse'}
                        onClick={(e) => { e.stopPropagation(); setCollapsed((c) => ({ ...c, [r.id]: !c[r.id] })); }}
                        className="w-3 text-[9px] text-[#55565C]"
                      >{collapsed[r.id] ? '▸' : '▾'}</span>
                    )
                    : <span className="w-3" />}
                  <span className="w-3 text-center text-[10px] text-[#55565C]">{TYPE_ICON[r.type] || '◇'}</span>
                  <span className="truncate">{r.name || r.text || r.id}</span>
                  {r.bind && <span className="ml-auto text-[9px] text-[#E11D2E]" title="Reads live data">●</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Canvas */}
        <div className="order-1 lg:order-2 min-w-0 p-3 bg-[#0B0C0E]">
          <div
            className="relative w-full overflow-hidden ring-1 ring-[#24262B] bg-[radial-gradient(ellipse_at_30%_20%,#1d2430_0%,#0d1117_55%,#050607_100%)]"
            style={{ aspectRatio: '1920 / 1080', touchAction: 'none' }}
            onPointerDown={() => setSelected(null)}
          >
            <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: `${96 * scale}px ${96 * scale}px` }} />
            {state && !state.status.loading ? (
              <LayoutRenderer
                key={replay}
                layout={doc}
                state={state as any}
                events={engine}
                mode="editor"
                previewEvents
                onElementPointerDown={onElementPointerDown}
                onScale={setScale}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] tracking-[0.2em] text-white/40">LOADING…</div>
            )}
            {sel && scale > 0 && (
              <div
                className="pointer-events-none absolute border border-[#E11D2E]"
                style={{ left: sel.absX * scale, top: sel.absY * scale, width: sel.el.w * scale, height: sel.el.h * scale }}
              >
                {['-left-1 -top-1', '-right-1 -top-1', '-left-1 -bottom-1', '-right-1 -bottom-1'].map((p) => (
                  <span key={p} className={`absolute ${p} w-2 h-2 bg-white border border-[#E11D2E]`} />
                ))}
                <span className="absolute -top-5 left-0 px-1 bg-[#E11D2E] text-white font-mono text-[9px] whitespace-nowrap">{sel.el.w} × {sel.el.h}</span>
              </div>
            )}
            <div className="pointer-events-none absolute bottom-2 left-2 bg-black/70 px-2 py-1 font-mono text-[9px] tracking-[0.15em] text-white/90">{text.stageTag}</div>
          </div>
        </div>

        {/* Inspector */}
        <div className="order-3 border-t lg:border-t-0 lg:border-l border-[#24262B] p-3 space-y-4 lg:max-h-[520px] overflow-y-auto">
          {el ? (
            <>
              <div>
                <Label>Layer</Label>
                <div className="text-sm text-[#F4F2EE] truncate">{el.name || el.id}</div>
                <div className="font-mono text-[10px] text-[#55565C] uppercase">{el.type}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['x', 'y', 'w', 'h'] as const).map((k) => (
                  <label key={k}>
                    <Label>{k}</Label>
                    <input
                      type="number"
                      className={numCls}
                      value={el[k]}
                      onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) patch(el.id, (x) => ({ ...x, [k]: k === 'w' || k === 'h' ? Math.max(1, v) : v })); }}
                    />
                  </label>
                ))}
              </div>
              {el.type === 'text' && (
                bound ? (
                  <div>
                    <Label>Text</Label>
                    <div className="px-2 py-1.5 border border-[#E11D2E]/50 bg-[#E11D2E]/10 font-mono text-[11px] text-[#F4F2EE] break-all">● {bound}</div>
                    <p className="mt-1 text-[11px] text-[#55565C]">Live data: fills in from the match.</p>
                  </div>
                ) : (
                  <label className="block">
                    <Label>Text</Label>
                    <input className={numCls} value={el.text ?? ''} maxLength={40} onChange={(e) => patch(el.id, (x) => ({ ...x, text: e.target.value }))} />
                  </label>
                )
              )}
              {el.type === 'text' && (
                <label className="block">
                  <Label>Font size</Label>
                  <input type="range" min={10} max={120} className="w-full accent-[#E11D2E]" value={Number((el.style as any)?.fontSize) || 24} onChange={(e) => patchStyle(el.id, { fontSize: Number(e.target.value) })} />
                </label>
              )}
              {fill && <ColorRow label="Fill" c={fill} onChange={(v) => patchStyle(el.id, { fill: v, gradient: undefined })} />}
              {color && <ColorRow label="Colour" c={color} onChange={(v) => patchStyle(el.id, { color: v })} />}
              <label className="block">
                <Label>Opacity</Label>
                <input type="range" min={0} max={1} step={0.05} className="w-full accent-[#E11D2E]" value={el.opacity ?? 1} onChange={(e) => patch(el.id, (x) => ({ ...x, opacity: Number(e.target.value) }))} />
              </label>
              {(el.anim?.enter || el.anim?.onEvent || el.anim?.onChange) && (
                <div>
                  <Label>Animation</Label>
                  <div className="text-[11px] text-[#93959C] space-y-0.5">
                    {el.anim?.enter && <div>Enter · {el.anim.enter.preset}</div>}
                    {el.anim?.onEvent && <div>On {el.anim.onEvent.event} · {el.anim.onEvent.preset}</div>}
                    {el.anim?.onChange && <div>On change · {el.anim.onChange.preset}</div>}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-[#55565C]">Select a layer to edit it.</p>
          )}
          <div className="pt-3 border-t border-[#24262B]">
            <Label>Theme colours</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {THEME_KEYS.map((k) => (
                <label key={k} className="block text-center">
                  <input type="color" aria-label={`Theme ${k}`} className="w-full h-7 bg-[#0B0C0E] border border-[#24262B] cursor-pointer" value={toHex((doc.theme?.colors as any)?.[k])} onChange={(e) => setThemeColor(k, e.target.value)} />
                  <span className="font-mono text-[8px] text-[#55565C] uppercase">{k}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 border-t border-[#24262B]">
        <p className="text-xs text-[#93959C]">{text.hint}</p>
        <SmartLink href={text.cta.href} className="px-4 py-2 bg-[#E11D2E] text-white font-display font-bold text-xs uppercase tracking-wide hover:bg-[#F4F2EE] hover:text-[#0B0C0E] transition-colors">
          {text.cta.label} →
        </SmartLink>
      </div>
    </div>
  );
};

const ColorRow: React.FC<{ label: string; c: { hex: string; themeKey?: string }; onChange: (v: string) => void }> = ({ label, c, onChange }) => (
  <label className="block">
    <Label>{label}</Label>
    <div className="flex items-center gap-2">
      <input type="color" className="w-10 h-7 bg-[#0B0C0E] border border-[#24262B] cursor-pointer" value={c.hex} onChange={(e) => onChange(e.target.value)} />
      <span className="font-mono text-[10px] text-[#93959C]">{c.themeKey ? `Theme · ${c.themeKey}` : c.hex}</span>
    </div>
  </label>
);

export default DesignerGlimpse;
