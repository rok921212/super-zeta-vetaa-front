import { createEmptyLayout, isSafePath, validateLayout } from '../schema/layoutSchema.js';
import { INSERT_CATEGORIES, createElement } from '../editor/elementFactory.ts';
import { editElements, editorReducer, initEditor, type EditorState } from '../editor/store.ts';
import { duplicateCmd, groupCmd, moveToIndexCmd, nudgeCmd, patchCmd, reorderCmd, ungroupCmd } from '../editor/ops.ts';
import { allIds, locate } from '../editor/tree.ts';
import { handleEditorKey, type HotkeyHandlers } from '../editor/useEditorHotkeys.ts';
import { diffDocs, elementIdAtPath } from '../editor/dialogs.tsx';
import { scopeForElement, eventTypeFor } from '../editor/scope.ts';
import { insertTarget } from '../editor/InsertPanel.tsx';
import { newLayoutDocument } from '../editor/DesignerList.tsx';
import { bindablePropsFor } from '../editor/Inspector.tsx';
import { TEMPLATES } from '../templates/index.ts';

const rect = (id: string, x = 0, y = 0) => ({ id, type: 'rect' as const, x, y, w: 10, h: 10 });
const base = (elements: any[] = [rect('a'), rect('b', 20), rect('c', 40)]) => ({ ...createEmptyLayout(), elements }) as any;
const exec = (s: EditorState, cmd: any, now?: number) => (cmd ? editorReducer(s, { type: 'exec', cmd, now }) : s);

describe('element factory', () => {
  test('every Insert kind builds a valid element with unique ids', () => {
    let doc = base();
    for (const cat of INSERT_CATEGORIES) {
      for (const it of cat.items) {
        const el = createElement(it.kind, doc);
        doc = { ...doc, elements: [...doc.elements, el] };
      }
    }
    const v = validateLayout(doc);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
    // ids unique across the whole tree (the validator also enforces this)
    const all: string[] = [];
    const walk = (l: any[]) => l.forEach((e) => { all.push(e.id); if (e.children) walk(e.children); });
    walk(doc.elements);
    expect(new Set(all).size).toBe(all.length);
  });

  test('inserted element is centred in the target area', () => {
    const el = createElement('rect', base());
    expect(el.x).toBe((1920 - 320) / 2);
    const inner = createElement('text', base(), { w: 400, h: 100 });
    expect(inner.x).toBe(0);
    expect(inner.y).toBe(20);
  });

  test('insert target: a selected container, else root', () => {
    const doc = base([{ id: 'g', type: 'group', x: 0, y: 0, w: 300, h: 100, children: [] }, rect('r')]);
    expect(insertTarget(doc, ['g']).parentId).toBe('g');
    expect(insertTarget(doc, ['r']).parentId).toBeNull();
    expect(insertTarget(doc, []).parentId).toBeNull();
  });

  test('new layouts from every template validate', () => {
    for (const t of [null, ...TEMPLATES.map((x) => x.id)]) {
      const v = validateLayout(newLayoutDocument(t));
      expect(v.errors).toEqual([]);
    }
  });
});

describe('editor operations', () => {
  test('drag = one undo step (gesture coalescing)', () => {
    let s = initEditor(base());
    for (let i = 1; i <= 50; i++) {
      s = exec(s, editElements(s.doc, ['a'], (e) => ({ ...e, x: i }), 'Transform', 'move:1'), 1000 + i);
    }
    expect(locate(s.doc.elements, 'a')!.el.x).toBe(50);
    expect(s.past).toHaveLength(1);
    s = editorReducer(s, { type: 'undo' });
    expect(locate(s.doc.elements, 'a')!.el.x).toBe(0);
    s = editorReducer(s, { type: 'redo' });
    expect(locate(s.doc.elements, 'a')!.el.x).toBe(50);
  });

  test('held arrow key nudges merge into one undo step; locked elements do not move', () => {
    let s = initEditor(base([rect('a'), { ...rect('l'), locked: true }]));
    for (let i = 0; i < 10; i++) s = exec(s, nudgeCmd(s.doc, ['a', 'l'], 10, 0), 5000 + i * 30);
    expect(locate(s.doc.elements, 'a')!.el.x).toBe(100);
    expect(locate(s.doc.elements, 'l')!.el.x).toBe(0);
    expect(s.past).toHaveLength(1);
  });

  test('delete + undo restores element at its position', () => {
    let s = initEditor(base());
    s = { ...s, selected: ['b'] };
    const { removeElementsCmd } = require('../editor/store.ts');
    s = exec(s, removeElementsCmd(s.doc, ['b']));
    expect(s.doc.elements.map((e: any) => e.id)).toEqual(['a', 'c']);
    expect(s.selected).toEqual([]);
    s = editorReducer(s, { type: 'undo' });
    expect(s.doc.elements.map((e: any) => e.id)).toEqual(['a', 'b', 'c']);
  });

  test('duplicate gives fresh ids next to the source', () => {
    let s = initEditor(base());
    const r = duplicateCmd(s.doc, ['a'])!;
    s = exec(s, r.cmd);
    expect(s.doc.elements.map((e: any) => e.id)[1]).toBe(r.newIds[0]);
    expect(r.newIds[0]).not.toBe('a');
    const copy = locate(s.doc.elements, r.newIds[0])!.el;
    expect([copy.x, copy.y]).toEqual([20, 20]);
    expect(validateLayout(s.doc).ok).toBe(true);
  });

  test('reorder and move-to-index', () => {
    let s = initEditor(base());
    s = exec(s, reorderCmd(s.doc, 'a', 1));
    expect(s.doc.elements.map((e: any) => e.id)).toEqual(['b', 'a', 'c']);
    s = exec(s, reorderCmd(s.doc, 'a', 'front'));
    expect(s.doc.elements.map((e: any) => e.id)).toEqual(['b', 'c', 'a']);
    s = exec(s, reorderCmd(s.doc, 'a', 'back'));
    expect(s.doc.elements.map((e: any) => e.id)).toEqual(['a', 'b', 'c']);
    s = exec(s, moveToIndexCmd(s.doc, 'c', 0));
    expect(s.doc.elements.map((e: any) => e.id)).toEqual(['c', 'a', 'b']);
    expect(reorderCmd(s.doc, 'c', 'back')).toBeNull();
  });

  test('group rebases children (nothing moves on screen) and ungroup restores', () => {
    let s = initEditor(base([rect('a', 100, 50), rect('b', 200, 80), rect('c', 400, 0)]));
    const g = groupCmd(s.doc, ['a', 'b'])!;
    s = exec(s, g.cmd);
    const grp = locate(s.doc.elements, g.groupId)!.el;
    expect([grp.x, grp.y, grp.w, grp.h]).toEqual([100, 50, 110, 40]);
    expect(grp.children!.map((c) => [c.id, c.x, c.y])).toEqual([['a', 0, 0], ['b', 100, 30]]);
    expect(s.doc.elements.map((e: any) => e.id)).toEqual([g.groupId, 'c']);
    expect(validateLayout(s.doc).ok).toBe(true);

    const u = ungroupCmd(s.doc, g.groupId)!;
    s = exec(s, u.cmd);
    expect(s.doc.elements.map((e: any) => [e.id, e.x, e.y])).toEqual([['a', 100, 50], ['b', 200, 80], ['c', 400, 0]]);
    s = editorReducer(s, { type: 'undo' });
    s = editorReducer(s, { type: 'undo' });
    expect(s.doc.elements.map((e: any) => e.id)).toEqual(['a', 'b', 'c']);
  });

  test('group refuses elements from different parents', () => {
    const doc = base([{ id: 'g', type: 'group', x: 0, y: 0, w: 10, h: 10, children: [rect('in')] }, rect('out')]);
    expect(groupCmd(doc, ['in', 'out'])).toBeNull();
  });

  test('patch removes undefined keys (show/unlock)', () => {
    const doc = base([{ ...rect('a'), hidden: true }]);
    const cmd = patchCmd(doc, ['a'], { hidden: undefined }, 'show')!;
    expect('hidden' in locate(cmd.apply(doc).elements, 'a')!.el).toBe(false);
  });
});

describe('hotkeys', () => {
  const handlers = (): HotkeyHandlers & { calls: string[] } => {
    const calls: string[] = [];
    const h: any = { calls };
    ['deleteSelection', 'undo', 'redo', 'save', 'duplicate', 'clearSelection', 'group', 'ungroup', 'selectAll'].forEach((k) => { h[k] = () => calls.push(k); });
    h.nudge = (dx: number, dy: number) => calls.push(`nudge ${dx},${dy}`);
    return h;
  };
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}, target: any = document.body) =>
    ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, target, ...mods });

  test('maps the standard shortcuts', () => {
    const h = handlers();
    handleEditorKey(key('Delete'), h, false);
    handleEditorKey(key('Backspace'), h, false);
    handleEditorKey(key('z', { ctrlKey: true }), h, false);
    handleEditorKey(key('Z', { ctrlKey: true, shiftKey: true }), h, false);
    handleEditorKey(key('y', { ctrlKey: true }), h, false);
    handleEditorKey(key('s', { ctrlKey: true }), h, false);
    handleEditorKey(key('d', { ctrlKey: true }), h, false);
    handleEditorKey(key('Escape'), h, false);
    handleEditorKey(key('ArrowLeft'), h, false);
    handleEditorKey(key('ArrowDown', { shiftKey: true }), h, false);
    expect(h.calls).toEqual(['deleteSelection', 'deleteSelection', 'undo', 'redo', 'redo', 'save', 'duplicate', 'clearSelection', 'nudge -1,0', 'nudge 0,10']);
  });

  test('ignores editing keys while typing, but Ctrl+S still saves', () => {
    const h = handlers();
    const input = document.createElement('input');
    expect(handleEditorKey(key('Backspace', {}, input), h, false)).toBe(false);
    expect(handleEditorKey(key('z', { ctrlKey: true }, input), h, false)).toBe(false);
    expect(handleEditorKey(key('s', { ctrlKey: true }, input), h, false)).toBe(true);
    expect(h.calls).toEqual(['save']);
  });

  test('read-only (locked) blocks mutations', () => {
    const h = handlers();
    handleEditorKey(key('Delete'), h, true);
    handleEditorKey(key('d', { ctrlKey: true }), h, true);
    handleEditorKey(key('ArrowLeft'), h, true);
    handleEditorKey(key('Escape'), h, true);
    expect(h.calls).toEqual(['clearSelection']);
  });
});

describe('binding scope (DataPicker roots)', () => {
  const state: any = {
    tournament: { tournamentName: 'Cup' },
    derived: { teams: [{ teamId: 't1', teamName: 'Alpha', totalKills: 4, players: [{ playerName: 'A1', killNum: 2 }] }] },
  };

  test('repeater children see item.* (first item), roots do not', () => {
    const doc = base([{
      id: 'rep', type: 'repeater', x: 0, y: 0, w: 100, h: 100,
      repeater: { source: 'derived.teams', limit: 5, direction: 'column' },
      children: [{ id: 'name', type: 'text', x: 0, y: 0, w: 10, h: 10 }],
    }, rect('root')]);
    expect(scopeForElement(doc, 'name', state).item.teamName).toBe('Alpha');
    expect(scopeForElement(doc, 'name', state).rank).toBe(1);
    expect(scopeForElement(doc, 'root', state).item).toBeUndefined();
  });

  test('event-driven elements (and their children) see event.*', () => {
    const doc = base([{
      id: 'pop', type: 'group', x: 0, y: 0, w: 100, h: 100, anim: { onEvent: { event: 'kill', preset: 'fade' } },
      children: [{ id: 'who', type: 'text', x: 0, y: 0, w: 10, h: 10 }],
    }]);
    expect(eventTypeFor(doc, 'who')).toBe('kill');
    const sc = scopeForElement(doc, 'who', state);
    expect(sc.event.type).toBe('kill');
    expect(sc.event.payload.player.playerName).toBe('A1');
    const real: any = { id: 'x', type: 'kill', timestamp: 1, sequence: 1, matchId: null, payload: { player: { playerName: 'REAL' } } };
    expect(scopeForElement(doc, 'who', state, { kill: real }).event.payload.player.playerName).toBe('REAL');
  });

  test('invalid binding paths are rejected by the shared safe-path check', () => {
    expect(isSafePath('item.teamName')).toBe(true);
    expect(isSafePath('event.payload.player.playerName')).toBe(true);
    expect(isSafePath('derived.teams[0].teamName')).toBe(true);
    expect(isSafePath('constructor.prototype')).toBe(false);
    expect(isSafePath('window.alert')).toBe(false);
    expect(isSafePath('item["x"]')).toBe(false);
  });

  test('inspector offers type-appropriate bindable props', () => {
    expect(bindablePropsFor('text')).toContain('text');
    expect(bindablePropsFor('image')).toContain('src');
    expect(bindablePropsFor('healthBar')).toContain('value');
  });
});

describe('dialog helpers', () => {
  test('validator paths map back to element ids', () => {
    const doc = base([{ id: 'g', type: 'group', x: 0, y: 0, w: 10, h: 10, children: [rect('x'), rect('y')] }]);
    expect(elementIdAtPath(doc, 'elements[0].children[1].bind.text')).toBe('y');
    expect(elementIdAtPath(doc, 'elements[0].x')).toBe('g');
    expect(elementIdAtPath(doc, 'stage.width')).toBeNull();
  });

  test('conflict compare summarises element differences', () => {
    const mine = base([rect('a'), rect('b'), rect('mine')]);
    const theirs = base([rect('a'), { ...rect('b'), x: 99 }, rect('theirs')]);
    const d = diffDocs(mine, theirs);
    expect(d.onlyMine).toEqual(['rect mine']);
    expect(d.onlyTheirs).toEqual(['rect theirs']);
    expect(d.changed).toEqual(['rect b']);
    expect(allIds(mine.elements).size).toBe(3);
  });
});
