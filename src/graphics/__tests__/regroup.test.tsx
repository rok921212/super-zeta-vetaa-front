// Adding layers inside a template's groups, and moving layers in / out of groups.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
import { editorReducer, initEditor, type EditorState } from '../editor/store.ts';
import { addAtCanvasCmd, containerAt, insertionTarget, moveToParentCmd, regroupTargets } from '../editor/ops.ts';
import { absoluteOrigin, locate } from '../editor/tree.ts';
import { clearClipboard, copyLayers, pasteLayersCmd } from '../editor/clipboard.ts';
import { insertTarget } from '../editor/InsertPanel.tsx';
import { LayersPanel, type LayersPanelProps } from '../editor/LayersPanel.tsx';

const rect = (id: string, x = 0, y = 0, w = 10, h = 10) => ({ id, type: 'rect' as const, name: id, x, y, w, h });
/** A template: group "lt" at (100,800) 600×120 holding a box and a nested group. */
const templateDoc = (): any => ({
  ...createEmptyLayout(),
  elements: [
    rect('bg', 0, 0, 1920, 1080),
    {
      id: 'lt', type: 'group', name: 'Lower third', x: 100, y: 800, w: 600, h: 120,
      children: [
        rect('box', 0, 0, 600, 120),
        { id: 'inner', type: 'group', name: 'Inner', x: 20, y: 20, w: 200, h: 80, children: [rect('label', 10, 10, 100, 30)] },
      ],
    },
    rect('solo', 1500, 100),
  ],
});
const exec = (s: EditorState, cmd: any) => (cmd ? editorReducer(s, { type: 'exec', cmd }) : s);

describe('where new layers go', () => {
  test('containerAt: the deepest group under the point; hidden / locked groups do not count', () => {
    const doc = templateDoc();
    expect(containerAt(doc, 150, 830)).toBe('inner'); // (100+20+30, 800+20+10)
    expect(containerAt(doc, 600, 900)).toBe('lt');
    expect(containerAt(doc, 1000, 100)).toBeNull();
    const hidden = { ...doc, elements: doc.elements.map((e: any) => (e.id === 'lt' ? { ...e, hidden: true } : e)) };
    expect(containerAt(hidden, 600, 900)).toBeNull();
    const locked = { ...doc, elements: doc.elements.map((e: any) => (e.id === 'lt' ? { ...e, locked: true } : e)) };
    expect(containerAt(locked, 600, 900)).toBeNull();
  });

  test('insertionTarget: inside a selected group; next to a selected child; else top level', () => {
    const doc = templateDoc();
    expect(insertionTarget(doc, ['lt'])).toEqual({ parentId: 'lt', index: null });
    expect(insertionTarget(doc, ['box'])).toEqual({ parentId: 'lt', index: 1 }); // just above box
    expect(insertionTarget(doc, ['label'])).toEqual({ parentId: 'inner', index: 1 });
    expect(insertionTarget(doc, ['solo'])).toEqual({ parentId: null, index: null });
    expect(insertionTarget(doc, ['box', 'solo'])).toEqual({ parentId: null, index: null });
    // the Insert panel follows the same rule, sized to the group
    expect(insertTarget(doc, ['box'])).toMatchObject({ parentId: 'lt', index: 1, area: { w: 600, h: 120 } });
  });

  test('a shape drawn over the template becomes its child, still where it was drawn', () => {
    const doc = templateDoc();
    const { cmd, parentId } = addAtCanvasCmd(doc, [rect('new', 400, 820, 100, 40)]);
    expect(parentId).toBe('lt');
    const after = cmd.apply(doc);
    const loc = locate(after.elements, 'new')!;
    expect(loc.parentId).toBe('lt');
    expect([loc.el.x, loc.el.y]).toEqual([300, 20]);
    expect(absoluteOrigin(after.elements, 'new')).toEqual({ x: 400, y: 820 });
    expect(loc.index).toBe(2); // on top inside the group
    expect(validateLayout(after).errors).toEqual([]);
    // drawn elsewhere: top level, unchanged coordinates
    const away = addAtCanvasCmd(doc, [rect('far', 1000, 100)]);
    expect(away.parentId).toBeNull();
    expect(locate(away.cmd.apply(doc).elements, 'far')!.el.x).toBe(1000);
  });
});

describe('copy / paste keeps the on-screen position', () => {
  test('a child of an offset group pasted at the top level lands where it was (+20)', () => {
    clearClipboard();
    const doc = templateDoc();
    copyLayers(doc, ['label']); // absolute (130, 830)
    const p = pasteLayersCmd(doc, [])!;
    const after = p.cmd.apply(doc);
    const loc = locate(after.elements, p.newIds[0])!;
    expect(loc.parentId).toBeNull();
    expect([loc.el.x, loc.el.y]).toEqual([150, 850]);
  });

  test('with a template layer selected the paste goes into that group, same spot on screen', () => {
    clearClipboard();
    const doc = templateDoc();
    copyLayers(doc, ['solo']); // absolute (1500, 100)
    const p = pasteLayersCmd(doc, ['box'])!;
    const after = p.cmd.apply(doc);
    const loc = locate(after.elements, p.newIds[0])!;
    expect(loc.parentId).toBe('lt');
    expect(loc.index).toBe(1);
    expect(absoluteOrigin(after.elements, p.newIds[0])).toEqual({ x: 1520, y: 120 });
  });
});

describe('moving layers in and out of groups', () => {
  test('into a group: same place on screen, one undo step', () => {
    let s = initEditor(templateDoc());
    s = exec(s, moveToParentCmd(s.doc, ['solo'], 'lt', null));
    const loc = locate(s.doc.elements, 'solo')!;
    expect(loc.parentId).toBe('lt');
    expect([loc.el.x, loc.el.y]).toEqual([1400, -700]);
    expect(absoluteOrigin(s.doc.elements, 'solo')).toEqual({ x: 1500, y: 100 });
    s = editorReducer(s, { type: 'undo' });
    expect(locate(s.doc.elements, 'solo')!.parentId).toBeNull();
    expect(locate(s.doc.elements, 'solo')!.el.x).toBe(1500);
  });

  test('out of nested groups to the top level, above a given index', () => {
    const doc = templateDoc();
    const after = moveToParentCmd(doc, ['label'], null, 2)!.apply(doc);
    const loc = locate(after.elements, 'label')!;
    expect(loc.parentId).toBeNull();
    expect(loc.index).toBe(2);
    expect([loc.el.x, loc.el.y]).toEqual([130, 830]);
    expect(validateLayout(after).errors).toEqual([]);
  });

  test('reorder inside the same group still works (index counted before removal)', () => {
    const doc = templateDoc();
    // box (index 0) dropped "above" inner (index 1) → index 2 → ends on top
    const after = moveToParentCmd(doc, ['box'], 'lt', 2)!.apply(doc);
    expect(locate(after.elements, 'lt')!.el.children!.map((c: any) => c.id)).toEqual(['inner', 'box']);
  });

  test('never into itself or its own children; a no-op move is null', () => {
    const doc = templateDoc();
    expect(moveToParentCmd(doc, ['lt'], 'lt', null)).toBeNull();
    expect(moveToParentCmd(doc, ['lt'], 'inner', null)).toBeNull();
    expect(moveToParentCmd(doc, ['box'], 'lt', 0)).toBeNull();
    expect(moveToParentCmd(doc, ['solo'], 'box', null)).toBeNull(); // not a container
  });

  test('right-click targets: the group under the layer, and out of its group', () => {
    const doc = templateDoc();
    const solo = { ...doc, elements: doc.elements.map((e: any) => (e.id === 'solo' ? { ...e, x: 500, y: 870 } : e)) };
    expect(regroupTargets(solo, 'solo').into).toEqual({ id: 'lt', name: 'Lower third' });
    expect(regroupTargets(solo, 'solo').out).toBeNull();
    const r = regroupTargets(doc, 'label');
    expect(r.into).toBeNull(); // already in the deepest group under it
    expect(r.out).toEqual({ parentId: 'lt', index: 2 });
  });
});

describe('layers panel drag and drop', () => {
  const props = (over: Partial<LayersPanelProps> = {}): LayersPanelProps => ({
    elements: templateDoc().elements, selected: [], onSelect: jest.fn(), onToggle: jest.fn(), onRename: jest.fn(), onDelete: jest.fn(),
    onReorder: jest.fn(), onMoveToParent: jest.fn(), onGroup: jest.fn(), onUngroup: jest.fn(), canGroup: false, canUngroup: false, ...over,
  });
  const row = (name: string) => screen.getByText(name).closest('[data-layer-id]') as HTMLElement;
  const dt = () => ({ effectAllowed: '', setData: jest.fn(), getData: jest.fn() });

  test('dropping a top-level layer on the middle of a group row moves it inside', () => {
    const p = props();
    render(<LayersPanel {...p} />);
    fireEvent.dragStart(row('solo'), { dataTransfer: dt() });
    fireEvent.dragOver(row('Lower third'), { dataTransfer: dt() }); // jsdom: no height → middle
    fireEvent.drop(row('Lower third'), { dataTransfer: dt() });
    expect(p.onMoveToParent).toHaveBeenCalledWith('solo', 'lt', null);
  });

  test('a template child dropped next to a top-level row moves out of the group', () => {
    const p = props();
    render(<LayersPanel {...p} />);
    fireEvent.dragStart(row('box'), { dataTransfer: dt() });
    fireEvent.drop(row('solo'), { dataTransfer: dt() }); // non-group middle → below solo (index 2)
    expect(p.onMoveToParent).toHaveBeenCalledWith('box', null, 2);
  });

  test('a group cannot be dropped into its own child', () => {
    const p = props();
    render(<LayersPanel {...p} />);
    fireEvent.dragStart(row('Lower third'), { dataTransfer: dt() });
    fireEvent.drop(row('Inner'), { dataTransfer: dt() });
    expect(p.onMoveToParent).not.toHaveBeenCalled();
  });
});
