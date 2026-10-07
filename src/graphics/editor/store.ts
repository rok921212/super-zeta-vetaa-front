// Designer editor state: the working layout document, the selection, and a
// command-based undo/redo history.
//
// Commands store DIFFS, never whole-document snapshots: an element edit keeps
// that element's before/after; a delete keeps the removed subtrees with their
// positions; a structural change keeps only the affected parent's child list.
// Continuous gestures (drag, resize, slider scrub) share a coalesceKey and
// merge into ONE undo step.

import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { childrenOf, insertAt, locate, removeById, updateById } from './tree.ts';

export interface Command {
  label: string;
  apply(doc: LayoutDocument): LayoutDocument;
  revert(doc: LayoutDocument): LayoutDocument;
  /** Commands with the same key within COALESCE_MS merge into one history entry. */
  coalesceKey?: string;
  /** Merge a later command with the same key into this one. */
  merge?(later: Command): Command;
}

export interface EditorState {
  doc: LayoutDocument;
  selected: string[];
  past: Command[];
  future: Command[];
  lastKey: string | null;
  lastAt: number;
  /** Bumped on every document change (drives autosave). */
  version: number;
}

export const HISTORY_LIMIT = 200;
export const COALESCE_MS = 800;

export function initEditor(doc: LayoutDocument): EditorState {
  return { doc, selected: [], past: [], future: [], lastKey: null, lastAt: 0, version: 0 };
}

export type EditorAction =
  | { type: 'exec'; cmd: Command; now?: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; ids: string[] }
  | { type: 'endGesture' }
  | { type: 'load'; doc: LayoutDocument };

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'exec': {
      const now = action.now ?? Date.now();
      const doc = action.cmd.apply(state.doc);
      if (doc === state.doc) return state;
      const top = state.past[state.past.length - 1];
      const canMerge = !!(action.cmd.coalesceKey && top && top.merge && state.lastKey === action.cmd.coalesceKey && now - state.lastAt < COALESCE_MS);
      const past = canMerge
        ? [...state.past.slice(0, -1), top!.merge!(action.cmd)]
        : [...state.past, action.cmd].slice(-HISTORY_LIMIT);
      return {
        ...state,
        doc,
        past,
        future: [],
        lastKey: action.cmd.coalesceKey ?? null,
        lastAt: now,
        version: state.version + 1,
        selected: state.selected.filter((id) => !!locate(doc.elements, id)),
      };
    }
    case 'undo': {
      const cmd = state.past[state.past.length - 1];
      if (!cmd) return state;
      const doc = cmd.revert(state.doc);
      return {
        ...state, doc, past: state.past.slice(0, -1), future: [...state.future, cmd], lastKey: null, version: state.version + 1,
        selected: state.selected.filter((id) => !!locate(doc.elements, id)),
      };
    }
    case 'redo': {
      const cmd = state.future[state.future.length - 1];
      if (!cmd) return state;
      const doc = cmd.apply(state.doc);
      return {
        ...state, doc, future: state.future.slice(0, -1), past: [...state.past, cmd], lastKey: null, version: state.version + 1,
        selected: state.selected.filter((id) => !!locate(doc.elements, id)),
      };
    }
    case 'select':
      return { ...state, selected: action.ids };
    case 'endGesture':
      return { ...state, lastKey: null };
    case 'load':
      return { ...initEditor(action.doc), version: state.version + 1 };
    default:
      return state;
  }
}

// ── commands ────────────────────────────────────────────────────────────────

/** Replace whole elements by id (before/after pairs). Merges with a later same-key update. */
export function updateElementsCmd(label: string, pairs: Array<{ before: LayoutElement; after: LayoutElement }>, coalesceKey?: string): Command {
  const cmd: Command = {
    label,
    coalesceKey,
    apply: (doc) => ({ ...doc, elements: pairs.reduce((els, p) => updateById(els, p.after.id, () => p.after), doc.elements) }),
    revert: (doc) => ({ ...doc, elements: pairs.reduce((els, p) => updateById(els, p.before.id, () => p.before), doc.elements) }),
    merge: (later) => {
      const laterPairs: Array<{ before: LayoutElement; after: LayoutElement }> = (later as any).__pairs || [];
      const byId = new Map(pairs.map((p) => [p.after.id, { ...p }]));
      for (const lp of laterPairs) {
        const existing = byId.get(lp.after.id);
        byId.set(lp.after.id, existing ? { before: existing.before, after: lp.after } : lp);
      }
      return updateElementsCmd(label, Array.from(byId.values()), coalesceKey);
    },
  };
  (cmd as any).__pairs = pairs;
  return cmd;
}

/** Edit elements with a function; builds the before/after pairs from the current doc. */
export function editElements(doc: LayoutDocument, ids: string[], fn: (el: LayoutElement) => LayoutElement, label: string, coalesceKey?: string): Command | null {
  const pairs: Array<{ before: LayoutElement; after: LayoutElement }> = [];
  for (const id of ids) {
    const loc = locate(doc.elements, id);
    if (!loc) continue;
    const after = fn(loc.el);
    if (after !== loc.el) pairs.push({ before: loc.el, after });
  }
  return pairs.length ? updateElementsCmd(label, pairs, coalesceKey) : null;
}

export function addElementsCmd(els: LayoutElement[], parentId: string | null = null, index: number | null = null): Command {
  const ids = new Set(els.map((e) => e.id));
  return {
    label: els.length === 1 ? `Add ${els[0].type}` : `Add ${els.length} elements`,
    apply: (doc) => ({ ...doc, elements: insertAt(doc.elements, parentId, index, els) }),
    revert: (doc) => ({ ...doc, elements: removeById(doc.elements, ids) }),
  };
}

export function removeElementsCmd(doc: LayoutDocument, idList: string[]): Command | null {
  // Only top-most selected (a child of a removed parent goes with it).
  const set = new Set(idList);
  const removed = idList
    .map((id) => locate(doc.elements, id))
    .filter((l): l is NonNullable<typeof l> => !!l && !l.ancestors.some((a) => set.has(a.id)))
    .map((l) => ({ el: l.el, parentId: l.parentId, index: l.index }));
  if (!removed.length) return null;
  // Re-insert in ascending index order per parent so indices stay valid.
  const ordered = [...removed].sort((a, b) => a.index - b.index);
  const ids = new Set(removed.map((r) => r.el.id));
  return {
    label: removed.length === 1 ? `Delete ${removed[0].el.name || removed[0].el.type}` : `Delete ${removed.length} elements`,
    apply: (d) => ({ ...d, elements: removeById(d.elements, ids) }),
    revert: (d) => ({ ...d, elements: ordered.reduce((els, r) => insertAt(els, r.parentId, r.index, [r.el]), d.elements) }),
  };
}

/** Replace one parent's child list (reorder / group / ungroup). */
export function setChildrenCmd(doc: LayoutDocument, parentId: string | null, next: LayoutElement[], label: string): Command {
  const before = childrenOf(doc.elements, parentId);
  const setKids = (d: LayoutDocument, kids: LayoutElement[]): LayoutDocument =>
    parentId == null
      ? { ...d, elements: kids }
      : { ...d, elements: updateById(d.elements, parentId, (p) => ({ ...p, children: kids })) };
  return { label, apply: (d) => setKids(d, next), revert: (d) => setKids(d, before) };
}

/** Change a document-level field (stage / theme / variables / brand / components). */
export function setDocFieldCmd<K extends 'stage' | 'theme' | 'variables' | 'brand' | 'components' | 'editor'>(
  doc: LayoutDocument, key: K, value: LayoutDocument[K], label: string, coalesceKey?: string
): Command {
  const before = doc[key];
  const cmd: Command = {
    label,
    coalesceKey,
    apply: (d) => ({ ...d, [key]: value }),
    revert: (d) => ({ ...d, [key]: before }),
    merge: (later) => {
      const laterValue = (later as any).__value;
      const merged = setDocFieldCmd({ ...doc, [key]: before } as LayoutDocument, key, laterValue, label, coalesceKey);
      return merged;
    },
  };
  (cmd as any).__value = value;
  return cmd;
}
