// Layer clipboard (Ctrl+C / Ctrl+X / Ctrl+V). Kept in memory — and mirrored to
// sessionStorage so a copy survives opening another layout in the same tab —
// rather than the system clipboard, which would need a permission prompt.
// Pasting always gives the copies fresh ids.

import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { cloneWithNewIds } from './ids.ts';
import { locate } from './tree.ts';
import { addElementsCmd, type Command } from './store.ts';

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
  memory = JSON.parse(JSON.stringify(els));
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

/** A command that pastes the clipboard at the top of the stage, each paste 20 px further along. */
export function pasteLayersCmd(doc: LayoutDocument): { cmd: Command; newIds: string[] } | null {
  const src = clipboardLayers();
  if (!src.length) return null;
  pasteCount += 1;
  const copies = cloneWithNewIds(src, doc.elements, { x: 20 * pasteCount, y: 20 * pasteCount });
  return { cmd: { ...addElementsCmd(copies, null), label: copies.length === 1 ? 'Paste' : `Paste ${copies.length} layers` }, newIds: copies.map((c) => c.id) };
}

/** Tests. */
export function clearClipboard(): void {
  memory = [];
  pasteCount = 0;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
