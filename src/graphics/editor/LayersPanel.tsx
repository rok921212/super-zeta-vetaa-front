// Layers panel: the element tree, top-most first (children render in array
// order, so the list is reversed). Selection is the same `selected` array the
// Canvas uses, so both stay in sync by construction.

import React, { memo, useEffect, useState } from 'react';
import type { LayoutElement } from '../schema/layoutTypes.ts';
import { Btn, cx } from './ui.tsx';

export interface LayersPanelProps {
  elements: LayoutElement[];
  selected: string[];
  disabled?: boolean;
  onSelect(ids: string[]): void;
  onToggle(id: string, key: 'hidden' | 'locked' | 'clipToBelow'): void;
  onRename(id: string, name: string): void;
  onDelete(ids: string[]): void;
  onReorder(id: string, move: 1 | -1): void;
  /** Drop `id` so it sits at `index` within its own parent (array index, bottom = 0). */
  onMoveToIndex(id: string, index: number): void;
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
};

interface RowProps {
  el: LayoutElement;
  depth: number;
  index: number;
  parentId: string | null;
  props: LayersPanelProps;
  drag: { id: string; parentId: string | null } | null;
  setDrag(d: { id: string; parentId: string | null } | null): void;
}

const Row = memo(function Row({ el, depth, index, parentId, props, drag, setDrag }: RowProps) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(el.name || '');
  const isSel = props.selected.includes(el.id);
  const kids = el.children || [];

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
        draggable={!props.disabled && !editing}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag({ id: el.id, parentId }); }}
        onDragEnd={() => setDrag(null)}
        onDragOver={(e) => { if (drag && drag.parentId === parentId && drag.id !== el.id) e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          if (drag && drag.parentId === parentId && drag.id !== el.id) props.onMoveToIndex(drag.id, index);
          setDrag(null);
        }}
        onClick={click}
        onDoubleClick={() => { if (!props.disabled) { setName(el.name || ''); setEditing(true); } }}
        className={cx(
          'group flex h-7 cursor-pointer items-center gap-1 pr-1 text-[11px]',
          isSel ? 'bg-amber-400/15 text-amber-100' : 'text-slate-300 hover:bg-white/5',
          el.hidden && 'opacity-50'
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <span
          className="w-3 text-center text-slate-500"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        >
          {kids.length ? (open ? '▾' : '▸') : ''}
        </span>
        {el.clipToBelow && <span className="w-3 text-center text-sky-300" title="Clipped to the layer below (Alt+click to release)">↳</span>}
        <span className="w-4 text-center text-slate-500">{TYPE_GLYPH[el.type] || '•'}</span>
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
      {open && kids.length > 0 && [...kids].map((c, i) => ({ c, i })).reverse().map(({ c, i }) => (
        <Row key={c.id} el={c} depth={depth + 1} index={i} parentId={el.id} props={props} drag={drag} setDrag={setDrag} />
      ))}
    </>
  );
});

/** Memoised: with stable handlers it only re-renders when the tree or the selection changes. */
export const LayersPanel = memo(function LayersPanel(props: LayersPanelProps) {
  const [drag, setDrag] = useState<{ id: string; parentId: string | null } | null>(null);
  const one = props.selected.length === 1 ? props.selected[0] : null;
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/5 p-2">
        <Btn small disabled={props.disabled || !one} title="Bring forward" onClick={() => one && props.onReorder(one, 1)}>▲</Btn>
        <Btn small disabled={props.disabled || !one} title="Send backward" onClick={() => one && props.onReorder(one, -1)}>▼</Btn>
        <Btn small disabled={props.disabled || !props.canGroup} onClick={props.onGroup} title="Group selection (Ctrl+G)">Group</Btn>
        <Btn small disabled={props.disabled || !props.canUngroup} onClick={props.onUngroup} title="Ungroup (Ctrl+Shift+G)">Ungroup</Btn>
        <Btn small danger disabled={props.disabled || !props.selected.length} onClick={() => props.onDelete(props.selected)} title="Delete (Del)">Delete</Btn>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {props.elements.length === 0 && <div className="px-3 py-4 text-[11px] text-slate-500">No layers yet — add one from Insert.</div>}
        {[...props.elements].map((el, i) => ({ el, i })).reverse().map(({ el, i }) => (
          <Row key={el.id} el={el} depth={0} index={i} parentId={null} props={props} drag={drag} setDrag={setDrag} />
        ))}
      </div>
    </div>
  );
});
