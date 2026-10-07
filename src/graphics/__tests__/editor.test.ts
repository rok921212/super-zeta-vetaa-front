import {
  addElementsCmd,
  editElements,
  editorReducer,
  initEditor,
  removeElementsCmd,
  setChildrenCmd,
} from '../editor/store.ts';
import { cloneWithNewIds } from '../editor/ids.ts';
import { locate } from '../editor/tree.ts';
import { createEmptyLayout } from '../schema/layoutSchema.js';

const rect = (id: string, x = 0) => ({ id, type: 'rect' as const, x, y: 0, w: 10, h: 10 });
const base = () => ({ ...createEmptyLayout(), elements: [rect('a'), rect('b', 20)] }) as any;

test('undo/redo of add, edit and delete', () => {
  let s = initEditor(base());
  s = editorReducer(s, { type: 'exec', cmd: addElementsCmd([rect('c', 40) as any]) });
  expect(s.doc.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  s = editorReducer(s, { type: 'exec', cmd: editElements(s.doc, ['a'], (e) => ({ ...e, x: 99 }), 'move')! });
  expect(locate(s.doc.elements, 'a')!.el.x).toBe(99);
  s = editorReducer(s, { type: 'exec', cmd: removeElementsCmd(s.doc, ['b'])! });
  expect(s.doc.elements.map((e) => e.id)).toEqual(['a', 'c']);

  s = editorReducer(s, { type: 'undo' });
  expect(s.doc.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  s = editorReducer(s, { type: 'undo' });
  expect(locate(s.doc.elements, 'a')!.el.x).toBe(0);
  s = editorReducer(s, { type: 'redo' });
  expect(locate(s.doc.elements, 'a')!.el.x).toBe(99);
  expect(s.future.length).toBe(1);
});

test('a drag gesture coalesces into ONE undo step that restores the start position', () => {
  let s = initEditor(base());
  for (let i = 1; i <= 30; i++) {
    s = editorReducer(s, { type: 'exec', now: 1000 + i * 16, cmd: editElements(s.doc, ['a'], (e) => ({ ...e, x: i }), 'move', 'drag:a')! });
  }
  expect(s.past.length).toBe(1);
  expect(locate(s.doc.elements, 'a')!.el.x).toBe(30);
  s = editorReducer(s, { type: 'undo' });
  expect(locate(s.doc.elements, 'a')!.el.x).toBe(0);
});

test('history stores element diffs, not document snapshots', () => {
  const big = { ...createEmptyLayout(), elements: Array.from({ length: 1500 }, (_, i) => rect(`r${i}`)) } as any;
  let s = initEditor(big);
  s = editorReducer(s, { type: 'exec', cmd: editElements(s.doc, ['r5'], (e) => ({ ...e, x: 1 }), 'move')! });
  const pairs = (s.past[0] as any).__pairs;
  expect(pairs).toHaveLength(1);
  expect(JSON.stringify(pairs).length).toBeLessThan(500);
});

test('deleting a parent and its child together restores both in place', () => {
  const doc = { ...createEmptyLayout(), elements: [rect('a'), { ...rect('g'), type: 'group', children: [rect('g1'), rect('g2')] }, rect('z')] } as any;
  let s = initEditor(doc);
  s = editorReducer(s, { type: 'exec', cmd: removeElementsCmd(s.doc, ['g1', 'g', 'a'])! });
  expect(s.doc.elements.map((e) => e.id)).toEqual(['z']);
  s = editorReducer(s, { type: 'undo' });
  expect(s.doc.elements.map((e) => e.id)).toEqual(['a', 'g', 'z']);
  expect(locate(s.doc.elements, 'g')!.el.children!.map((c) => c.id)).toEqual(['g1', 'g2']);
});

test('reorder via setChildren is undoable', () => {
  let s = initEditor(base());
  s = editorReducer(s, { type: 'exec', cmd: setChildrenCmd(s.doc, null, [...s.doc.elements].reverse(), 'Bring forward') });
  expect(s.doc.elements.map((e) => e.id)).toEqual(['b', 'a']);
  s = editorReducer(s, { type: 'undo' });
  expect(s.doc.elements.map((e) => e.id)).toEqual(['a', 'b']);
});

test('paste clones get fresh ids everywhere and an offset', () => {
  const group = { ...rect('g', 5), type: 'group', children: [rect('a'), rect('b')] } as any;
  const existing = [group];
  const [copy] = cloneWithNewIds([group], existing, { x: 20, y: 20 });
  expect(copy.id).not.toBe('g');
  expect(copy.x).toBe(25);
  expect(copy.children!.map((c) => c.id)).not.toContain('a');
  expect(new Set([copy.id, ...copy.children!.map((c) => c.id), 'g', 'a', 'b']).size).toBe(6);
});
