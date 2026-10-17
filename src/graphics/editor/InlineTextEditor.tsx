// Type text straight on the canvas: double-click a text layer or a shape and a
// box opens over it, written in the layer's own font. Enter or a click
// elsewhere keeps it (one undo step), Shift+Enter starts a new line, Esc
// cancels.
//
// Text connected to data is not typed over: a small card says what it shows
// and offers to pick other data or to switch to typed text.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { resolveBinding, resolveElementStyle, type BindingScope } from '../bindings/index.ts';
import { textCss } from '../renderer/styleToCss.ts';
import { absoluteOrigin, locate } from './tree.ts';
import { PickerButton } from './Inspector.tsx';
import { Btn } from './ui.tsx';

export interface InlineTextEditorProps {
  doc: LayoutDocument;
  id: string;
  zoom: number;
  /** The layer's binding scope (its list row / event included). */
  scope: BindingScope;
  onCommit(text: string): void;
  onCancel(): void;
  /** Data-bound text: stop following data and type instead (`shown` = what it shows now). */
  onDisconnect(shown: string): void;
  /** Data-bound text: follow another field. */
  onRebind(path: string): void;
}

const str = (v: unknown) => (v == null || typeof v === 'object' ? '' : String(v));
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function InlineTextEditor(props: InlineTextEditorProps) {
  const { doc, id, zoom, scope, onCancel } = props;
  const el = locate(doc.elements, id)?.el;
  const abs = absoluteOrigin(doc.elements, id);
  // The layer went away (undo, delete) while editing: close.
  useEffect(() => { if (!el) onCancel(); }, [el, onCancel]);
  if (!el || !abs) return null;
  const frame: React.CSSProperties = {
    left: abs.x * zoom, top: abs.y * zoom, width: el.w * zoom, height: el.h * zoom,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, transformOrigin: 'center center',
  };
  return el.bind?.text
    ? <BoundCard {...props} el={el} frame={frame} />
    : <TypeBox key={id} {...props} el={el} frame={frame} style={resolveElementStyle(el, scope).style} />;
}

type Inner = InlineTextEditorProps & { el: LayoutElement; frame: React.CSSProperties };

function BoundCard({ el, frame, scope, onCancel, onDisconnect, onRebind }: Inner) {
  const ref = el.bind!.text!;
  const shown = str(resolveBinding(ref, scope));
  return (
    <div className="absolute z-30" style={frame} onPointerDown={stop} data-testid="inline-text-bound">
      <div className="absolute inset-0 outline outline-2 outline-sky-400" />
      <div className="absolute left-0 top-full mt-1 w-64 rounded border border-white/10 bg-neutral-900 p-2 text-[11px] text-slate-300 shadow-xl" onKeyDown={stop}>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">This text shows live data</div>
        <div className="truncate font-mono text-sky-200" title={ref.path}>{ref.path}</div>
        <div className="mb-2 truncate text-slate-400">now: {shown || '—'}</div>
        <div className="flex flex-wrap gap-1">
          <PickerButton scope={scope} value={ref.path} label="Change data" onPick={onRebind} />
          <Btn small onClick={() => onDisconnect(shown)} data-testid="inline-text-disconnect">Type my own text</Btn>
          <Btn small onClick={onCancel}>Close</Btn>
        </div>
      </div>
    </div>
  );
}

function TypeBox({ el, frame, zoom, style, onCommit, onCancel }: Inner & { style: Record<string, unknown> }) {
  const initial = el.text ?? '';
  const [value, setValue] = useState(initial);
  const area = useRef<HTMLTextAreaElement>(null);
  // Closed by anything other than Enter / Esc (a click on the canvas changes the selection): keep the typing.
  const latest = useRef({ value, done: false });
  latest.current.value = value;
  const finish = (keep: boolean) => {
    if (latest.current.done) return;
    latest.current.done = true;
    if (keep && latest.current.value !== initial) onCommit(latest.current.value); else onCancel();
  };
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useLayoutEffect(() => {
    area.current?.focus();
    area.current?.select();
    // Unmounted without Enter / Esc / blur: keep real changes only (StrictMode's test unmount changes nothing).
    return () => {
      const l = latest.current;
      if (!l.done && l.value !== initial) { l.done = true; commitRef.current(l.value); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const font = textCss(style);
  return (
    <div className="absolute z-30" style={frame} onPointerDown={stop} onDoubleClick={stop}>
      <textarea
        ref={area}
        data-testid="inline-text"
        value={value}
        placeholder="Type…"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value.slice(0, 2000))}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') { e.preventDefault(); finish(false); }
          else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
        }}
        style={{
          // Drawn at the layer's own size and scaled with the canvas, so the text looks as it will.
          position: 'absolute', left: 0, top: 0, width: el.w, height: el.h, transform: `scale(${zoom})`, transformOrigin: '0 0',
          fontFamily: font.fontFamily, fontSize: font.fontSize ?? 24, fontWeight: font.fontWeight, fontStyle: font.fontStyle,
          letterSpacing: font.letterSpacing, lineHeight: font.lineHeight ?? 1.15, textTransform: font.textTransform, textAlign: font.textAlign,
          color: typeof style.color === 'string' ? style.color : '#ffffff',
          padding: typeof style.padding === 'number' ? style.padding : 4,
          background: 'rgba(15,15,20,0.72)', outline: '2px solid #fbbf24', border: 'none', resize: 'none', overflow: 'hidden',
        }}
      />
      <div className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-900">
        Enter to keep · Shift+Enter new line · Esc to cancel
      </div>
    </div>
  );
}
