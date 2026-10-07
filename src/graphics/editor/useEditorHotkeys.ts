// Designer keyboard shortcuts (Figma's map, where a Designer action exists).
// Ignored while typing in a field (inputs also stopPropagation their own
// keydowns), except Ctrl+S which always saves. `handleEditorKey` is the ONE
// place a key becomes an action; SHORTCUTS below is the same list for people
// (the `?` sheet), and a test keeps the two in step.

import { useEffect, useRef } from 'react';

export type ToolKey = 'select' | 'direct' | 'pen' | 'pencil' | 'hand' | 'eyedropper' | 'rect' | 'ellipse' | 'line' | 'text';
export type AlignKey = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

export interface HotkeyHandlers {
  deleteSelection(): void;
  undo(): void;
  redo(): void;
  save(): void;
  duplicate(): void;
  clearSelection(): void;
  nudge(dx: number, dy: number): void;
  group(): void;
  ungroup(): void;
  selectAll(): void;
  setTool?(tool: ToolKey): void;
  /** Ctrl+Alt+C / Ctrl+Alt+V: copy / paste layer style (effects, style, mask). */
  copyStyle?(): void;
  pasteStyle?(): void;
  /** Ctrl+' : show / hide the grid. */
  toggleGrid?(): void;
  // layers on the clipboard
  copy?(): void;
  cut?(): void;
  paste?(): void;
  rename?(): void;
  // stacking order
  reorder?(move: 1 | -1 | 'front' | 'back'): void;
  align?(mode: AlignKey): void;
  distribute?(axis: 'h' | 'v'): void;
  // selection
  selectChildren?(): void;
  selectParent?(): void;
  selectSibling?(dir: 1 | -1): void;
  // view
  zoomFit?(): void;
  zoomSelection?(): void;
  zoom100?(): void;
  zoomStep?(dir: 1 | -1): void;
  toggleRulers?(): void;
  togglePanels?(): void;
  // layer
  toggleHidden?(): void;
  toggleLocked?(): void;
  /** 1–9 = 10–90 %, 0 = 100 %. */
  setOpacity?(pct: number): void;
  showShortcuts?(): void;
}

const TOOL_KEYS: Record<string, ToolKey> = {
  v: 'select', a: 'direct', p: 'pen', n: 'pencil', h: 'hand', i: 'eyedropper', r: 'rect', o: 'ellipse', l: 'line', t: 'text',
};
const ALIGN_KEYS: Record<string, AlignKey> = { a: 'left', d: 'right', w: 'top', s: 'bottom', h: 'hcenter', v: 'vcenter' };

/** The shortcut sheet (`?`). `mod` = Ctrl on Windows / Linux, ⌘ on a Mac. */
export const SHORTCUTS: Array<{ group: string; items: Array<{ keys: string; does: string }> }> = [
  { group: 'Tools', items: [
    { keys: 'V', does: 'Move / select' }, { keys: 'R', does: 'Rectangle — drag to draw' }, { keys: 'O', does: 'Ellipse — drag to draw' },
    { keys: 'L', does: 'Line — drag to draw' }, { keys: 'T', does: 'Text — click or drag' }, { keys: 'P', does: 'Pen' },
    { keys: 'Shift+P', does: 'Pencil (freehand)' }, { keys: 'A', does: 'Edit path points' }, { keys: 'H', does: 'Hand (pan) — or hold Space' },
    { keys: 'I', does: 'Eyedropper' }, { keys: 'F', does: 'Group the selection' },
  ] },
  { group: 'Edit', items: [
    { keys: 'mod+C / mod+X / mod+V', does: 'Copy / cut / paste layers' }, { keys: 'mod+D', does: 'Duplicate' }, { keys: 'Alt+drag', does: 'Duplicate while dragging' },
    { keys: 'mod+Alt+C / mod+Alt+V', does: 'Copy / paste style' }, { keys: 'mod+R', does: 'Rename layer' }, { keys: 'Delete', does: 'Delete' },
    { keys: 'mod+Z / mod+Shift+Z', does: 'Undo / redo' }, { keys: 'mod+S', does: 'Save now' },
  ] },
  { group: 'Arrange', items: [
    { keys: ']  /  [', does: 'Bring to front / send to back' }, { keys: 'mod+]  /  mod+[', does: 'Bring forward / send backward' },
    { keys: 'mod+G / mod+Shift+G', does: 'Group / ungroup' }, { keys: 'Alt+A / Alt+D', does: 'Align left / right' },
    { keys: 'Alt+W / Alt+S', does: 'Align top / bottom' }, { keys: 'Alt+H / Alt+V', does: 'Align centres (horizontal / vertical)' },
    { keys: 'mod+Alt+Shift+H / V', does: 'Distribute spacing (horizontal / vertical)' },
    { keys: 'Arrows / Shift+Arrows', does: 'Nudge 1 px / 10 px' },
  ] },
  { group: 'Select', items: [
    { keys: 'mod+A', does: 'Select all' }, { keys: 'Esc', does: 'Deselect' }, { keys: 'Enter', does: 'Select what is inside' },
    { keys: 'Shift+Enter', does: 'Select the parent' }, { keys: 'Tab / Shift+Tab', does: 'Next / previous sibling' },
    { keys: 'Shift+click', does: 'Add to the selection' },
  ] },
  { group: 'View', items: [
    { keys: 'Scroll', does: 'Zoom the canvas toward the cursor' }, { keys: 'Shift+Scroll', does: 'Pan sideways' },
    { keys: 'Shift+1', does: 'Zoom to fit' }, { keys: 'Shift+2', does: 'Zoom to the selection' }, { keys: 'mod+0', does: 'Zoom to 100 %' },
    { keys: '+  /  −', does: 'Zoom in / out' }, { keys: "mod+'", does: 'Show / hide the grid' }, { keys: 'Shift+R', does: 'Show / hide rulers' },
    { keys: 'mod+\\', does: 'Show / hide the panels' }, { keys: '?', does: 'This list' },
  ] },
  { group: 'Layer', items: [
    { keys: 'mod+Shift+H', does: 'Hide / show' }, { keys: 'mod+Shift+L', does: 'Lock / unlock' }, { keys: '1 … 9, 0', does: 'Opacity 10 % … 90 %, 100 %' },
  ] },
  { group: 'Keyframe timeline (click it first)', items: [
    { keys: 'Space', does: 'Play / pause' }, { keys: 'J / K', does: 'Previous / next keyframe' }, { keys: 'Home / End', does: 'Start / end' },
    { keys: 'PgUp / PgDn', does: 'One frame back / forward (Shift = 10)' }, { keys: 'P  S  R  T  A', does: 'Keyframe Move / Scale / Rotation / Opacity / Anchor' },
    { keys: 'F9', does: 'Easy Ease (Shift = ease out, mod+Shift = ease in)' }, { keys: 'mod+Alt+H', does: 'Hold keyframe' },
    { keys: 'mod+C / mod+V', does: 'Copy keyframes / paste at the playhead' }, { keys: 'Alt+← / Alt+→', does: 'Nudge keyframes 10 ms (Shift = 100)' },
    { keys: 'B / N', does: 'Work area start / end' }, { keys: 'U', does: 'All animated layers' }, { keys: 'Delete', does: 'Delete keyframes' },
  ] },
];

export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target'> & { altKey?: boolean; code?: string };

/** Pure key -> action mapping (exported for tests). */
export function handleEditorKey(e: KeyLike, h: HotkeyHandlers, readOnly: boolean): boolean {
  const mod = e.ctrlKey || e.metaKey;
  const alt = !!e.altKey;
  const shift = e.shiftKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const code = e.code || '';
  const run = (fn: (() => void) | undefined): boolean => { if (!fn) return false; fn(); return true; };

  if (mod && key === 's') { h.save(); return true; }
  if (isTypingTarget(e.target)) return false;

  // ── always available (read-only too) ──
  if (key === '?' || (shift && code === 'Slash')) return run(h.showShortcuts);
  if (key === 'Escape') { h.clearSelection(); return true; }
  if (mod && !alt && !shift && key === 'a') { h.selectAll(); return true; }
  if (mod && key === "'" && h.toggleGrid) { h.toggleGrid(); return true; }
  if (mod && key === '\\') return run(h.togglePanels);
  if (!mod && !alt && shift && (code === 'Digit1' || key === '!')) return run(h.zoomFit);
  if (!mod && !alt && shift && (code === 'Digit2' || key === '@')) return run(h.zoomSelection);
  if (mod && !alt && key === '0') return run(h.zoom100);
  if (!mod && !alt && (key === '+' || key === '=')) return run(h.zoomStep && (() => h.zoomStep!(1)));
  if (!mod && !alt && key === '-') return run(h.zoomStep && (() => h.zoomStep!(-1)));
  if (!mod && !alt && shift && key === 'r') return run(h.toggleRulers);
  if (mod && !alt && !shift && key === 'c') return run(h.copy);
  if (!mod && !alt && key === 'Enter') return run(shift ? h.selectParent : h.selectChildren);
  if (!mod && !alt && key === 'Tab') return run(h.selectSibling && (() => h.selectSibling!(shift ? -1 : 1)));
  if (!mod && !alt && shift && key === 'p' && h.setTool) { h.setTool('pencil'); return true; }
  if (!mod && !alt && !shift && TOOL_KEYS[key] && h.setTool) { h.setTool(TOOL_KEYS[key]); return true; }
  if (readOnly) return false;

  // ── editing ──
  if (mod && alt && shift && (key === 'h' || key === 'v')) return run(h.distribute && (() => h.distribute!(key as 'h' | 'v')));
  if (mod && alt && key === 'c' && h.copyStyle) { h.copyStyle(); return true; }
  if (mod && alt && key === 'v' && h.pasteStyle) { h.pasteStyle(); return true; }
  if (mod && !alt && key === 'x') return run(h.cut);
  if (mod && !alt && key === 'v') return run(h.paste);
  if (mod && key === 'z') { if (shift) h.redo(); else h.undo(); return true; }
  if (mod && key === 'y') { h.redo(); return true; }
  if (mod && key === 'd') { h.duplicate(); return true; }
  if (mod && key === 'g') { if (shift) h.ungroup(); else h.group(); return true; }
  if (mod && !shift && key === 'r') return run(h.rename);
  if (mod && shift && key === 'h') return run(h.toggleHidden);
  if (mod && shift && key === 'l') return run(h.toggleLocked);
  if (key === ']') return run(h.reorder && (() => h.reorder!(mod ? 1 : 'front')));
  if (key === '[') return run(h.reorder && (() => h.reorder!(mod ? -1 : 'back')));
  if (alt && !mod && ALIGN_KEYS[key]) return run(h.align && (() => h.align!(ALIGN_KEYS[key])));
  if (!mod && !alt && !shift && key === 'f') { h.group(); return true; }
  if (!mod && !alt && !shift && /^[0-9]$/.test(key)) return run(h.setOpacity && (() => h.setOpacity!(key === '0' ? 100 : Number(key) * 10)));
  if (key === 'Delete' || key === 'Backspace') { h.deleteSelection(); return true; }
  const step = shift ? 10 : 1;
  if (key === 'ArrowLeft') { h.nudge(-step, 0); return true; }
  if (key === 'ArrowRight') { h.nudge(step, 0); return true; }
  if (key === 'ArrowUp') { h.nudge(0, -step); return true; }
  if (key === 'ArrowDown') { h.nudge(0, step); return true; }
  return false;
}

export function useEditorHotkeys(handlers: HotkeyHandlers, readOnly: boolean, enabled = true): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  const ro = useRef(readOnly);
  ro.current = readOnly;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (handleEditorKey(e, ref.current, ro.current)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
