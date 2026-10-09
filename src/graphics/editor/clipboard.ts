// Layer clipboard (Ctrl+C / Ctrl+X / Ctrl+V). Kept in memory — and mirrored to
// sessionStorage so a copy survives opening another layout in the same tab —
// rather than the system clipboard, which would need a permission prompt.
// Pasting always gives the copies fresh ids.
//
// Copies are stored with CANVAS x/y (a child of a group is stored relative to
// the group, so its own x/y would put a top-level paste in the wrong place);
// paste converts them to wherever the paste lands.

import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { cloneWithNewIds } from './ids.ts';
import { absoluteOrigin, locate } from './tree.ts';
import { type Command } from './store.ts';
import { addAtCanvasCmd, insertionTarget } from './ops.ts';

const KEY = 'designer.clipboard';
const MAX_BYTES = 400000;

let memory: LayoutElement[] = [];
let pasteCount = 0;

/** The top-most selected elements (a child of a selected parent travels with it). */
export function topLevelSelection(doc: LayoutDocument, ids: string[]): LayoutElement[] {
  const set = new Set(ids);
  return ids
    .map((id) => locate(doc.elements, id))
    .filter((l): l is NonNullable<typeof l> => !!l && !l.ancestors.some((a) => set.has(a.id)))
    .map((l) => l.el);
}

export function copyLayers(doc: LayoutDocument, ids: string[]): number {
  const els = topLevelSelection(doc, ids);
  if (!els.length) return 0;
  memory = JSON.parse(JSON.stringify(els.map((el) => {
    const abs = absoluteOrigin(doc.elements, el.id);
    return abs ? { ...el, x: abs.x, y: abs.y } : el;
  })));
  pasteCount = 0;
  try {
    const json = JSON.stringify(memory);
    if (json.length <= MAX_BYTES) sessionStorage.setItem(KEY, json); else sessionStorage.removeItem(KEY);
  } catch { /* storage unavailable: the in-memory copy still works */ }
  return els.length;
}

export function clipboardLayers(): LayoutElement[] {
  if (memory.length) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) memory = parsed;
  } catch { /* nothing usable stored */ }
  return memory;
}

export const hasClipboardLayers = (): boolean => clipboardLayers().length > 0;

/**
 * Paste, each paste 20 px further along. With a layer inside a group selected
 * (e.g. a template's text) the copies go into that group, just above it; with
 * a group selected, inside it; otherwise at the top level. On screen they land
 * where they were copied from (+20 px per paste) either way.
 */
export function pasteLayersCmd(doc: LayoutDocument, selected: string[] = []): { cmd: Command; newIds: string[] } | null {
  const src = clipboardLayers();
  if (!src.length) return null;
  pasteCount += 1;
  const copies = cloneWithNewIds(src, doc.elements, { x: 20 * pasteCount, y: 20 * pasteCount });
  const { cmd } = addAtCanvasCmd(doc, copies, insertionTarget(doc, selected));
  return { cmd: { ...cmd, label: copies.length === 1 ? 'Paste' : `Paste ${copies.length} layers` }, newIds: copies.map((c) => c.id) };
}

/** Tests. */
export function clearClipboard(): void {
  memory = [];
  pasteCount = 0;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
