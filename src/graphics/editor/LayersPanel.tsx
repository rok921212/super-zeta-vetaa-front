// Layers panel: the element tree, top-most first (children render in array
// order, so the list is reversed). Selection is the same `selected` array the
// Canvas uses, so both stay in sync by construction.
//
// Drag a row: drop on the top / bottom edge of another row to put it above /
// below that row (in that row's group, so layers move in and out of groups),
// or on the middle of a group row to put it inside that group, on top.

import React, { memo, useEffect, useMemo, useState } from 'react';
import type { LayoutElement } from '../schema/layoutTypes.ts';
import { allIds, flatten } from './tree.ts';
import { Btn, cx } from './ui.tsx';

/** What a layer does besides being drawn — shown as small marks on its row. */
export function layerMarks(el: LayoutElement): Array<{ key: string; mark: string; title: string; className: string }> {
  const out: Array<{ key: string; mark: string; title: string; className: string }> = [];
  const bound = Object.keys(el.bind || {});
  if (bound.length) out.push({ key: 'data', mark: '⛓', title: `Connected to data: ${bound.join(', ')}`, className: 'text-sky-300' });
  if (el.visibleWhen) out.push({ key: 'when', mark: '?', title: 'Only shown when a condition is true', className: 'text-sky-300' });
  const clips = el.timeline?.clips.length || 0;
  if (clips || el.anim) out.push({ key: 'anim', mark: '▸', title: clips ? `${clips} animation${clips === 1 ? '' : 's'}` : 'Animated', className: 'text-fuchsia-300' });
  if (el.imageFill?.src) out.push({ key: 'frame', mark: '▣', title: 'Holds a picture (a frame)', className: 'text-emerald-300' });
  if (el.mask) out.push({ key: 'mask', mark: '◐', title: 'Masked', className: 'text-slate-400' });
  return out;
}

/** Layers whose name, type or id contains the query, top-most first. */
export function searchLayers(elements: LayoutElement[], query: string): LayoutElement[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return flatten(elements).map((f) => f.el).filter((el) => `${el.name || ''} ${el.type} ${el.id}`.toLowerCase().includes(q)).reverse();
}

export interface LayersPanelProps {
  elements: LayoutElement[];
  selected: string[];
  disabled?: boolean;
  onSelect(ids: string[]): void;
  onToggle(id: string, key: 'hidden' | 'locked' | 'clipToBelow'): void;
  onRename(id: string, name: string): void;
  onDelete(ids: string[]): void;
  onReorder(id: string, move: 1 | -1): void;
  /**
   * Drop `id` into `parentId` (null = top level) at `index` — an array index
   * among that parent's CURRENT children (bottom = 0), null = on top.
   */
  onMoveToParent(id: string, parentId: string | null, index: number | null): void;
  onGroup(): void;
  onUngroup(): void;
  canGroup: boolean;
  canUngroup: boolean;
  /** Ctrl+R: start renaming this layer (`n` changes on every request). */
  renameRequest?: { id: string; n: number } | null;
}

const TYPE_GLYPH: Record<string, string> = {
  text: 'T', rect: '▭', ellipse: '◯', line: '╱', polygon: '⬠', path: '✎', image: '▣', group: '▤', repeater: '☰',
  progress: '▬', healthBar: '♥', teamLogo: '◈', playerAvatar: '☺', flag: '⚑', icon: '★', video: '▶', component: '◇',
  builtin: '◆', map: '⌖',
};
const TYPE_NAME: Record<string, string> = {
  text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', polygon: 'Polygon', path: 'Path', image: 'Image', group: 'Group',
  repeater: 'List (repeats per item)', progress: 'Progress bar', healthBar: 'Health bar', teamLogo: 'Team logo', playerAvatar: 'Player portrait',
  flag: 'Flag', icon: 'Icon', video: 'Video', component: 'Component', builtin: 'Built-in graphic', map: 'Map',
};

type Drag = { id: string; parentId: string | null; /** the dragged layer and its children: never a drop target */ own: Set<string> } | null;
type Zone = 'above' | 'below' | 'inside';
const isContainerType = (el: LayoutElement) => el.type === 'group' || el.type === 'repeater';

/** Which part of a row the pointer is over. Groups take the middle half as "inside". */
function zoneOf(e: React.DragEvent, el: LayoutElement): Zone {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const f = r.height > 0 ? (e.clientY - r.top) / r.height : 0.5;
  if (isContainerType(el) && !el.locked) return f < 0.25 ? 'above' : f > 0.75 ? 'below' : 'inside';
  return f < 0.5 ? 'above' : 'below';
}

interface RowProps {
  el: LayoutElement;
  depth: number;
  index: number;
  parentId: string | null;
  props: LayersPanelProps;
  drag: Drag;
  setDrag(d: Drag): void;
  /** A search result: shown on its own, without its children and not draggable. */
  flat?: boolean;
}

const Row = memo(function Row({ el, depth, index, parentId, props, drag, setDrag, flat }: RowProps) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(el.name || '');
  const isSel = props.selected.includes(el.id);
  const kids = el.children || [];
  const [zone, setZone] = useState<Zone | null>(null);
  const canDrop = !!drag && !drag.own.has(el.id);

  const click = (e: React.MouseEvent) => {
    // Photoshop: Alt+click a layer = clip it to the layer below (toggle).
    if (e.altKey && !props.disabled && index > 0) { props.onToggle(el.id, 'clipToBelow'); return; }
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive) props.onSelect(isSel ? props.selected.filter((s) => s !== el.id) : [...props.selected, el.id]);
    else props.onSelect([el.id]);
  };

  const req = props.renameRequest;
  useEffect(() => {
    if (req && req.id === el.id && !props.disabled) { setName(el.name || ''); setEditing(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.n]);

  const commitName = () => {
    setEditing(false);
    const n = name.trim().slice(0, 120);
    if (n !== (el.name || '')) props.onRename(el.id, n);
  };

  return (
    <>
      <div
        data-layer-id={el.id}
        draggable={!props.disabled && !editing && !flat}
        onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; setDrag({ id: el.id, parentId, own: allIds([el]) }); }}
        onDragEnd={() => { setDrag(null); setZone(null); }}
        onDragOver={(e) => { if (!canDrop) return; e.preventDefault(); const z = zoneOf(e, el); if (z !== zone) setZone(z); }}
        onDragLeave={() => setZone(null)}
        onDrop={(e) => {
          e.preventDefault();
          if (canDrop && drag) {
            const z = zoneOf(e, el);
            // The list is top-most first: "above" a row = in front of it = the next array index.
            if (z === 'inside') props.onMoveToParent(drag.id, el.id, null);
            else props.onMoveToParent(drag.id, parentId, z === 'above' ? index + 1 : index);
          }
          setDrag(null);
          setZone(null);
        }}
        data-drop-zone={canDrop && zone ? zone : undefined}
        onClick={click}
        onDoubleClick={() => { if (!props.disabled) { setName(el.name || ''); setEditing(true); } }}
        className={cx(
          'group flex h-7 cursor-pointer items-center gap-1 pr-1 text-[11px]',
          isSel ? 'bg-amber-400/15 text-amber-100' : 'text-slate-300 hover:bg-white/5',
          el.hidden && 'opacity-50',
          canDrop && zone === 'inside' && 'bg-sky-500/20 ring-1 ring-inset ring-sky-400/70',
          canDrop && zone === 'above' && 'shadow-[inset_0_2px_0_0_rgb(56,189,248)]',
          canDrop && zone === 'below' && 'shadow-[inset_0_-2px_0_0_rgb(56,189,248)]'
        )}
        title={canDrop && zone === 'inside' ? `Drop to move into “${el.name || el.type}”` : undefined}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <span
          className="w-3 text-center text-slate-500"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        >
          {kids.length && !flat ? (open ? '▾' : '▸') : ''}
        </span>
        {el.clipToBelow && <span className="w-3 text-center text-sky-300" title="Clipped to the layer below (Alt+click to release)">↳</span>}
        <span className={cx('w-4 text-center', el.type === 'repeater' ? 'text-sky-300' : 'text-slate-500')} title={TYPE_NAME[el.type] || el.type}>{TYPE_GLYPH[el.type] || '•'}</span>
        {editing ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded border border-amber-400/50 bg-black/60 px-1 text-[11px] text-slate-100 outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{el.name || `${el.type} ${el.id}`}</span>
        )}
        {!editing && layerMarks(el).map((m) => (
          <span key={m.key} data-layer-mark={m.key} title={m.title} className={cx('w-3 shrink-0 text-center text-[10px]', m.className)}>{m.mark}</span>
        ))}
        <button
          type="button"
          title={el.hidden ? 'Show' : 'Hide'}
          disabled={props.disabled}
          aria-label={el.hidden ? 'Show layer' : 'Hide layer'}
          onClick={(e) => { e.stopPropagation(); props.onToggle(el.id, 'hidden'); }}
          className={cx('w-5 text-center text-slate-500 hover:text-slate-100', !el.hidden && 'opacity-0 group-hover:opacity-100')}
        >
          {el.hidden ? '◌' : '◉'}
        </button>
        <button
          type="button"
          title={el.locked ? 'Unlock' : 'Lock'}
          disabled={props.disabled}
          aria-label={el.locked ? 'Unlock layer' : 'Lock layer'}
          onClick={(e) => { e.stopPropagation(); props.onToggle(el.id, 'locked'); }}
          className={cx('w-5 text-center text-slate-500 hover:text-slate-100', !el.locked && 'opacity-0 group-hover:opacity-100')}
        >
          {el.locked ? '🔒' : '🔓'}
        </button>
      </div>
      {!flat && open && kids.length > 0 && [...kids].map((c, i) => ({ c, i })).reverse().map(({ c, i }) => (
        <Row key={c.id} el={c} depth={depth + 1} index={i} parentId={el.id} props={props} drag={drag} setDrag={setDrag} />
      ))}
    </>
  );
});

/** Memoised: with stable handlers it only re-renders when the tree or the selection changes. */
export const LayersPanel = memo(function LayersPanel(props: LayersPanelProps) {
  const [drag, setDrag] = useState<Drag>(null);
  const one = props.selected.length === 1 ? props.selected[0] : null;
  const [query, setQuery] = useState('');
  const found = useMemo(() => searchLayers(props.elements, query), [props.elements, query]);
  const searching = query.trim() !== '';
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/5 p-2">
        <Btn small disabled={props.disabled || !one} title="Bring forward" onClick={() => one && props.onReorder(one, 1)}>▲</Btn>
        <Btn small disabled={props.disabled || !one} title="Send backward" onClick={() => one && props.onReorder(one, -1)}>▼</Btn>
        <Btn small disabled={props.disabled || !props.canGroup} onClick={props.onGroup} title="Group selection (Ctrl+G)">Group</Btn>
        <Btn small disabled={props.disabled || !props.canUngroup} onClick={props.onUngroup} title="Ungroup (Ctrl+Shift+G)">Ungroup</Btn>
        <Btn small danger disabled={props.disabled || !props.selected.length} onClick={() => props.onDelete(props.selected)} title="Delete (Del)">Delete</Btn>
      </div>
      {props.elements.length > 0 && (
        <div className="border-b border-white/5 px-2 py-1.5">
          <input
            type="search"
            aria-label="Search layers"
            placeholder="Search layers"
            className="w-full rounded border border-white/10 bg-black/40 px-2 py-0.5 text-[11px] text-slate-100 outline-none focus:border-amber-400/60"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setQuery(''); }}
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {props.elements.length === 0 && <div className="px-3 py-4 text-[11px] text-slate-500">No layers yet — add one from Insert.</div>}
        {searching && found.length === 0 && <div className="px-3 py-4 text-[11px] text-slate-500">No layer is called “{query}”.</div>}
        {searching && found.map((el) => (
          <Row key={el.id} el={el} depth={0} index={0} parentId={null} props={props} drag={null} setDrag={setDrag} flat />
        ))}
        {!searching && [...props.elements].map((el, i) => ({ el, i })).reverse().map(({ el, i }) => (
          <Row key={el.id} el={el} depth={0} index={i} parentId={null} props={props} drag={drag} setDrag={setDrag} />
        ))}
      </div>
    </div>
  );
});
