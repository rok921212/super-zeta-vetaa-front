// The Data tab: where the values come from (live or simulated, connected or
// not), every field the selected layer can be connected to — searchable, with
// its type and what it is right now — and every connection the design already
// has, with its status.
//
// A field is connected by pressing Bind (it picks the property that fits, or
// offers a choice) or by dragging it onto a layer on the canvas. Either way it
// writes the same `bind` entry the inspector edits and the renderer resolves:
// there is one binding system.

import React, { memo, useMemo, useState } from 'react';
import type { BindableProp, LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { resolvePathDetailed, type BindingScope, type DataState, type FeedState } from '../bindings/index.ts';
import { KIND_LABEL, bindingProblem, bindingsOf, propLabel, propsForKind, type ValueKind } from '../bindings/compat.ts';
import { FIELD_CATEGORIES, listFields, previewValue, searchFields, type FieldEntry } from '../bindings/fieldCatalog.ts';
import type { EngineEvent } from '../../overlayClient/engineTypes.ts';
import { isSafePath } from '../schema/layoutSchema.js';
import { DRAG_FIELD } from './Canvas.tsx';
import { COMMON_DATA } from './DataPicker.tsx';
import { bindablePropsFor } from './Inspector.tsx';
import { scopeForElement } from './scope.ts';
import { flatten } from './tree.ts';
import { Btn, cx } from './ui.tsx';

export interface DataSourceStatus {
  mode: 'live' | 'sim';
  /** Live only: a tournament and round are chosen. */
  ready: boolean;
  /** Live only: the socket is up and no error is reported. */
  connected: boolean;
  /** "connected", "reconnecting"… as the engine reports it. */
  phase?: string;
  /** ms since the last live payload while a match is loaded. */
  staleForMs?: number;
}

export interface DataPanelProps {
  doc: LayoutDocument;
  /** The single selected layer, if any. */
  selected: LayoutElement | null;
  /** The scope that layer's bindings resolve in (its list row / event included). */
  scope: BindingScope;
  state: DataState | null;
  lastEvents: Partial<Record<string, EngineEvent>>;
  feed: FeedState | null;
  status: DataSourceStatus;
  disabled?: boolean;
  onBind(elementId: string, prop: BindableProp, path: string): void;
  onSelect(ids: string[]): void;
  onMode(mode: 'live' | 'sim'): void;
}

const KIND_CLASS: Record<ValueKind, string> = {
  text: 'bg-slate-500/20 text-slate-200', number: 'bg-sky-500/20 text-sky-200', boolean: 'bg-violet-500/20 text-violet-200',
  image: 'bg-emerald-500/20 text-emerald-200', color: 'bg-pink-500/20 text-pink-200', list: 'bg-amber-500/20 text-amber-200',
  object: 'bg-amber-500/20 text-amber-200', empty: 'bg-white/10 text-slate-400',
};

export interface Connection {
  elementId: string;
  layer: string;
  prop: BindableProp;
  path: string;
  status: 'ok' | 'missing' | 'warning' | 'error';
  detail: string;
}

/** Every data connection in the design with how it resolves on the current data. */
export function listConnections(doc: LayoutDocument, state: DataState | null, lastEvents: Partial<Record<string, EngineEvent>>, feed: FeedState | null): Connection[] {
  const out: Connection[] = [];
  for (const { el } of flatten(doc.elements)) {
    const bindings = bindingsOf(el);
    if (!bindings.length) continue;
    const scope = scopeForElement(doc, el.id, state, lastEvents, feed);
    for (const { prop, ref } of bindings) {
      const found = resolvePathDetailed(scope, ref.path);
      const problem = found.found ? bindingProblem(prop, found.value, ref) : null;
      const waitsForEvent = !found.found && ref.path.startsWith('event');
      out.push({
        elementId: el.id,
        layer: el.name || `${el.type} ${el.id}`,
        prop,
        path: ref.path,
        status: problem ? problem.level : found.found || waitsForEvent ? 'ok' : 'missing',
        detail: problem ? problem.message
          : found.found ? `= ${previewValue(found.value, 40)}`
            : waitsForEvent ? 'Filled in when the event happens'
              : ref.fallback !== undefined && ref.fallback !== '' ? `Not in the current data: the fallback “${String(ref.fallback)}” is shown` : 'Not in the current data, and it has no fallback',
      });
    }
  }
  return out;
}

const STATUS_DOT: Record<Connection['status'], string> = { ok: 'bg-emerald-400', missing: 'bg-amber-400', warning: 'bg-amber-400', error: 'bg-red-400' };

export const DataPanel = memo(function DataPanel(props: DataPanelProps) {
  const { doc, selected, scope, status } = props;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [view, setView] = useState<'fields' | 'connections'>('fields');

  const fields = useMemo(() => listFields(scope), [scope]);
  const shown = useMemo(() => searchFields(fields, query), [fields, query]);
  const connections = useMemo(() => listConnections(doc, props.state, props.lastEvents, props.feed), [doc, props.state, props.lastEvents, props.feed]);
  const bad = connections.filter((c) => c.status !== 'ok').length;
  const candidates = selected ? bindablePropsFor(selected.type) : [];
  const searching = query.trim() !== '';

  const bind = (f: FieldEntry, prop?: BindableProp) => {
    if (!selected || props.disabled || !isSafePath(f.path)) return;
    const target = prop || propsForKind(candidates, f.kind)[0];
    if (!target) return;
    setMenuFor(null);
    props.onBind(selected.id, target, f.path);
  };

  const sourceLine = status.mode === 'sim'
    ? { tone: 'text-violet-200', dot: 'bg-violet-400', text: 'Simulation: made-up sample data, not a real match' }
    : !status.ready ? { tone: 'text-amber-200', dot: 'bg-amber-400', text: 'Live: no tournament and round chosen yet' }
      : status.connected ? { tone: 'text-emerald-200', dot: 'bg-emerald-400', text: `Live: connected${status.phase ? ` (${status.phase.replace(/_/g, ' ').toLowerCase()})` : ''}` }
        : { tone: 'text-red-200', dot: 'bg-red-400', text: 'Live: connection lost. Values below may be old' };

  const row = (f: FieldEntry) => {
    const fits = selected ? propsForKind(candidates, f.kind) : [];
    const single = f.kind !== 'list' && f.kind !== 'object';
    return (
      <div
        key={f.path}
        data-field={f.path}
        draggable={single && !props.disabled}
        onDragStart={(e) => { e.dataTransfer.setData(DRAG_FIELD, f.path); e.dataTransfer.setData('text/plain', f.path); e.dataTransfer.effectAllowed = 'copy'; }}
        title={`${f.path}${f.description ? `\n${f.description}` : ''}`}
        className="group relative flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-white/5"
      >
        <span className={cx('shrink-0 rounded px-1 text-[9px] font-semibold uppercase', KIND_CLASS[f.kind])}>{KIND_LABEL[f.kind]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-slate-200">{searching ? f.path : f.label}</span>
          {f.description && <span className="block truncate text-[10px] text-slate-500">{f.description}</span>}
        </span>
        <span className="max-w-[72px] shrink-0 truncate font-mono text-[10px] text-slate-500">{previewValue(f.value, 14)}</span>
        {selected && !props.disabled && fits.length > 0 && (
          <button
            type="button"
            aria-label={`Bind ${f.path}`}
            onClick={() => (fits.length === 1 ? bind(f) : setMenuFor(menuFor === f.path ? null : f.path))}
            className="shrink-0 rounded border border-amber-400/40 px-1.5 text-[10px] text-amber-200 hover:bg-amber-400/15"
          >
            Bind{fits.length > 1 ? ' ▾' : ''}
          </button>
        )}
        {menuFor === f.path && (
          <div role="menu" className="absolute right-1 top-full z-30 w-44 overflow-hidden rounded border border-white/10 bg-neutral-950 py-1 shadow-2xl">
            <div className="px-2 pb-1 text-[9px] uppercase tracking-wide text-slate-500">Drives…</div>
            {fits.map((p) => (
              <button key={p} type="button" role="menuitem" onClick={() => bind(f, p)} className="block w-full px-2 py-1 text-left text-[11px] text-slate-200 hover:bg-white/10">
                {propLabel(p)}{selected?.bind?.[p] ? <span className="text-slate-500"> (replaces {selected.bind[p]!.path})</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-full flex-col" data-testid="data-panel">
      <div className="border-b border-white/5 px-3 py-2">
        <div className={cx('flex items-center gap-1.5 text-[11px] font-medium', sourceLine.tone)} data-testid="data-source">
          <span className={cx('h-2 w-2 shrink-0 rounded-full', sourceLine.dot)} />
          {sourceLine.text}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Btn small active={status.mode === 'sim'} onClick={() => props.onMode('sim')}>Simulation</Btn>
          <Btn small active={status.mode === 'live'} onClick={() => props.onMode('live')}>Live</Btn>
        </div>
        {status.mode === 'live' && !status.ready && <div className="mt-1 text-[10px] text-slate-500">Choose the tournament and round under Live data (click the empty canvas).</div>}
      </div>

      <div className="flex border-b border-white/5 text-[11px]" role="tablist">
        {([['fields', `Fields (${fields.length})`], ['connections', `In this design (${connections.length})${bad ? ` · ${bad} to check` : ''}`]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={cx('flex-1 px-2 py-1.5', view === id ? 'bg-white/10 text-amber-200' : 'text-slate-400 hover:text-slate-200')}>{label}</button>
        ))}
      </div>

      {view === 'fields' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-2 py-1.5">
            <input
              type="search"
              aria-label="Search data fields"
              placeholder="Search: team name, kills, logo…"
              className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-amber-400/60"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setQuery(''); }}
            />
            <div className="mt-1 text-[10px] text-slate-500">
              {selected ? <>Binding to “<span className="text-slate-300">{selected.name || selected.type}</span>”. Press Bind, or drag a field onto any layer.</> : 'Select a layer to bind to, or drag a field onto a layer on the canvas.'}
            </div>
          </div>

          {!searching && (
            <div className="border-y border-white/5 px-2 py-1.5">
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Most used</div>
              <div className="flex flex-wrap gap-1">
                {COMMON_DATA.map((c) => {
                  const r = resolvePathDetailed(scope, c.path);
                  if (!r.found) return null; // only what the current data really has
                  const f = fields.find((x) => x.path === c.path);
                  return (
                    <button
                      key={c.path}
                      type="button"
                      disabled={!selected || props.disabled || !f}
                      draggable={!props.disabled}
                      onDragStart={(e) => { e.dataTransfer.setData(DRAG_FIELD, c.path); e.dataTransfer.effectAllowed = 'copy'; }}
                      title={`${c.path} = ${previewValue(r.value, 40)}`}
                      onClick={() => f && bind(f)}
                      className="rounded border border-emerald-400/30 px-1.5 py-[1px] text-[10px] text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-60"
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto px-1 py-1">
            {fields.length === 0 && <div className="px-2 py-4 text-[11px] text-slate-500">No data yet. Switch to Simulation to design on sample data.</div>}
            {searching && shown.length === 0 && <div className="px-2 py-4 text-[11px] text-slate-500">No field matches “{query}”.</div>}
            {searching
              ? shown.slice(0, 200).map(row)
              : FIELD_CATEGORIES.map((cat) => {
                const list = fields.filter((f) => f.category === cat.id);
                if (!list.length) return null;
                const isOpen = open[cat.id] ?? (cat.id === 'row' || cat.id === 'event');
                return (
                  <div key={cat.id} data-category={cat.id}>
                    <button type="button" aria-expanded={isOpen} title={cat.hint} onClick={() => setOpen((o) => ({ ...o, [cat.id]: !isOpen }))} className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] font-medium text-slate-200 hover:bg-white/5">
                      <span className="w-3 text-slate-500">{isOpen ? '▾' : '▸'}</span>
                      <span className="flex-1">{cat.label}</span>
                      <span className="text-[10px] text-slate-500">{list.length}</span>
                    </button>
                    {isOpen && <div className="pl-3">{list.slice(0, 300).map(row)}{list.length > 300 && <div className="px-2 py-1 text-[10px] text-slate-500">{list.length - 300} more: search to find them.</div>}</div>}
                  </div>
                );
              })}
            {searching && shown.length > 200 && <div className="px-2 py-1 text-[10px] text-slate-500">{shown.length - 200} more: type more to narrow it down.</div>}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-2" data-testid="connections">
          {connections.length === 0 && <div className="px-1 py-3 text-[11px] text-slate-500">Nothing in this design is connected to data yet.</div>}
          {connections.map((c) => (
            <button
              key={`${c.elementId}:${c.prop}`}
              type="button"
              data-connection={c.status}
              onClick={() => props.onSelect([c.elementId])}
              className={cx('mb-1 block w-full rounded border p-1.5 text-left hover:bg-white/5', selected?.id === c.elementId ? 'border-amber-400/50' : 'border-white/5')}
            >
              <div className="flex items-center gap-1.5 text-[11px] text-slate-200">
                <span className={cx('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[c.status])} />
                <span className="min-w-0 flex-1 truncate">{c.layer}</span>
                <span className="shrink-0 text-[10px] text-slate-500">{c.prop}</span>
              </div>
              <div className="truncate font-mono text-[10px] text-sky-200">{c.path}</div>
              <div className={cx('text-[10px]', c.status === 'ok' ? 'text-slate-500' : c.status === 'error' ? 'text-red-300' : 'text-amber-200')}>{c.detail}</div>
            </button>
          ))}
          {status.mode === 'sim' && connections.length > 0 && <div className="mt-2 text-[10px] text-slate-500">Checked against the simulation's sample data.</div>}
        </div>
      )}
    </div>
  );
});
