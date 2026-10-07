import React, { Profiler, useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createEmptyLayout, validateLayout, EASINGS, TIMELINE_PROPS } from '../schema/layoutSchema.js';
import type { LayoutDocument, LayoutElement, TimelineClip } from '../schema/layoutTypes.ts';

jest.mock('../../login/api.tsx', () => {
  const api = { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: api, DEFAULT_BACKEND: 'http://backend.test' };
});

// eslint-disable-next-line import/first
import api from '../../login/api.tsx';
// eslint-disable-next-line import/first
import { layoutsApi, noteCapabilities, gzipText, lastSave } from '../api.ts';
// eslint-disable-next-line import/first
import { SHORTCUTS, handleEditorKey, type HotkeyHandlers } from '../editor/useEditorHotkeys.ts';
// eslint-disable-next-line import/first
import { ShortcutsPanel } from '../editor/ShortcutsPanel.tsx';
// eslint-disable-next-line import/first
import { shapeFromDrag } from '../editor/ToolLayer.tsx';
// eslint-disable-next-line import/first
import { clearClipboard, copyLayers, hasClipboardLayers, pasteLayersCmd } from '../editor/clipboard.ts';
// eslint-disable-next-line import/first
import { EASE_CURVES, clipDelay, clipTime, clipTotalMs, easeFn, frameStyle, sampleTrack, wiggleAt } from '../renderer/timeline.ts';
// eslint-disable-next-line import/first
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
// eslint-disable-next-line import/first
import { createPreviewStore } from '../renderer/useTimeline.ts';
// eslint-disable-next-line import/first
import * as bindings from '../bindings/index.ts';
// eslint-disable-next-line import/first
import { EFFECTS, EFFECT_LIST, DEFAULT_OPTIONS, matchingExit } from '../editor/animationEffects.ts';
// eslint-disable-next-line import/first
import { TRIGGERS, clipToRule, effectsFor, lifecycleOf, ruleToClip, withLifecycle } from '../editor/animationLibrary.ts';
// eslint-disable-next-line import/first
import {
  copyKeyframes, deleteKeyframes, keyframeTimes, pasteKeyframes, reverseClip, setKeyframesEase, setTrackWiggle, shiftKeyframes,
} from '../editor/timelineOps.ts';
// eslint-disable-next-line import/first
import { TimelinePanel, type TimelineUiState } from '../editor/TimelinePanel.tsx';
// eslint-disable-next-line import/first
import { GraphEditor, bezierOf } from '../editor/GraphEditor.tsx';
// eslint-disable-next-line import/first
import { AnimatePanel } from '../editor/AnimatePanel.tsx';
// eslint-disable-next-line import/first
import { editorReducer, initEditor } from '../editor/store.ts';
// eslint-disable-next-line import/first
import { TEMPLATES } from '../templates/index.ts';

const mockApi = api as unknown as Record<'get' | 'put', jest.Mock>;

// jsdom (Jest 27) has no PointerEvent: without it, fireEvent.pointer* drops modifier keys and coordinates.
if (!(window as any).PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  }
  (window as any).PointerEvent = PointerEventPolyfill;
}
const rect = (over: Partial<LayoutElement> = {}): LayoutElement => ({ id: 'r', type: 'rect', x: 100, y: 50, w: 200, h: 80, style: { fill: '#e11d2e' }, ...over });
const docOf = (els: LayoutElement[]): LayoutDocument => ({ ...(createEmptyLayout() as LayoutDocument), elements: els });

// ── shortcuts ───────────────────────────────────────────────────────────────

describe('Figma-style shortcuts', () => {
  const recorder = () => {
    const calls: string[] = [];
    const h = new Proxy({}, { get: (_t, name: string) => (...args: unknown[]) => { calls.push(args.length ? `${name}(${args.join(',')})` : name); } }) as unknown as HotkeyHandlers;
    return { h, calls };
  };
  const press = (h: HotkeyHandlers, key: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; code: string }> = {}, readOnly = false, target: any = document.body) =>
    handleEditorKey({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target, ...mods }, h, readOnly);

  test('tools, clipboard, order, alignment, selection, view and layer keys', () => {
    const cases: Array<[string, Parameters<typeof press>[2], string]> = [
      ['v', {}, 'setTool(select)'], ['r', {}, 'setTool(rect)'], ['o', {}, 'setTool(ellipse)'], ['l', {}, 'setTool(line)'], ['t', {}, 'setTool(text)'],
      ['p', {}, 'setTool(pen)'], ['P', { shiftKey: true }, 'setTool(pencil)'], ['h', {}, 'setTool(hand)'], ['i', {}, 'setTool(eyedropper)'], ['f', {}, 'group'],
      ['c', { ctrlKey: true }, 'copy'], ['x', { ctrlKey: true }, 'cut'], ['v', { ctrlKey: true }, 'paste'], ['d', { metaKey: true }, 'duplicate'],
      ['c', { ctrlKey: true, altKey: true }, 'copyStyle'], ['v', { ctrlKey: true, altKey: true }, 'pasteStyle'], ['r', { ctrlKey: true }, 'rename'],
      [']', {}, 'reorder(front)'], ['[', {}, 'reorder(back)'], [']', { ctrlKey: true }, 'reorder(1)'], ['[', { ctrlKey: true }, 'reorder(-1)'],
      ['g', { ctrlKey: true }, 'group'], ['G', { ctrlKey: true, shiftKey: true }, 'ungroup'],
      ['a', { altKey: true }, 'align(left)'], ['d', { altKey: true }, 'align(right)'], ['w', { altKey: true }, 'align(top)'], ['s', { altKey: true }, 'align(bottom)'],
      ['h', { altKey: true }, 'align(hcenter)'], ['v', { altKey: true }, 'align(vcenter)'],
      ['H', { ctrlKey: true, altKey: true, shiftKey: true }, 'distribute(h)'], ['V', { ctrlKey: true, altKey: true, shiftKey: true }, 'distribute(v)'],
      ['a', { ctrlKey: true }, 'selectAll'], ['Escape', {}, 'clearSelection'], ['Enter', {}, 'selectChildren'], ['Enter', { shiftKey: true }, 'selectParent'],
      ['Tab', {}, 'selectSibling(1)'], ['Tab', { shiftKey: true }, 'selectSibling(-1)'],
      ['!', { shiftKey: true, code: 'Digit1' }, 'zoomFit'], ['@', { shiftKey: true, code: 'Digit2' }, 'zoomSelection'], ['0', { ctrlKey: true }, 'zoom100'],
      ['+', { shiftKey: true }, 'zoomStep(1)'], ['=', {}, 'zoomStep(1)'], ['-', {}, 'zoomStep(-1)'],
      ["'", { ctrlKey: true }, 'toggleGrid'], ['R', { shiftKey: true }, 'toggleRulers'], ['\\', { ctrlKey: true }, 'togglePanels'], ['?', { shiftKey: true }, 'showShortcuts'],
      ['H', { ctrlKey: true, shiftKey: true }, 'toggleHidden'], ['L', { ctrlKey: true, shiftKey: true }, 'toggleLocked'],
      ['5', {}, 'setOpacity(50)'], ['0', {}, 'setOpacity(100)'],
      ['ArrowLeft', {}, 'nudge(-1,0)'], ['ArrowUp', { shiftKey: true }, 'nudge(0,-10)'], ['Delete', {}, 'deleteSelection'],
      ['z', { ctrlKey: true }, 'undo'], ['Z', { ctrlKey: true, shiftKey: true }, 'redo'], ['s', { ctrlKey: true }, 'save'],
    ];
    for (const [key, mods, expected] of cases) {
      const { h, calls } = recorder();
      const handled = press(h, key, mods);
      expect({ key, mods, handled, calls }).toEqual({ key, mods, handled: true, calls: [expected] });
    }
  });

  test('typing in a field is left alone (Ctrl+C copies text, R types an r); read-only blocks edits but not view / tools', () => {
    const input = document.createElement('input');
    for (const [key, mods] of [['r', {}], ['c', { ctrlKey: true }], ['Delete', {}], ['5', {}], ['Tab', {}]] as const) {
      const { h, calls } = recorder();
      expect(press(h, key, mods, false, input)).toBe(false);
      expect(calls).toEqual([]);
    }
    for (const [key, mods] of [['x', { ctrlKey: true }], ['v', { ctrlKey: true }], ['Delete', {}], [']', {}], ['a', { altKey: true }], ['5', {}]] as const) {
      const { h, calls } = recorder();
      expect(press(h, key, mods, true)).toBe(false);
      expect(calls).toEqual([]);
    }
    for (const [key, mods, call] of [['c', { ctrlKey: true }, 'copy'], ['!', { shiftKey: true, code: 'Digit1' }, 'zoomFit'], ['h', {}, 'setTool(hand)']] as const) {
      const { h, calls } = recorder();
      press(h, key, mods, true);
      expect(calls).toEqual([call]);
    }
  });

  test('the shortcut sheet lists them, and can be searched', () => {
    expect(SHORTCUTS.flatMap((g) => g.items).length).toBeGreaterThan(50);
    const onClose = jest.fn();
    render(<ShortcutsPanel onClose={onClose} />);
    expect(screen.getByText('Rectangle — drag to draw')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'distribute' } });
    expect(screen.getByText('Distribute spacing (horizontal / vertical)')).toBeInTheDocument();
    expect(screen.queryByText('Rectangle — drag to draw')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('drawing and clipboard', () => {
  test('shapeFromDrag: any direction, Shift squares / snaps a line, a click gives a default size', () => {
    expect(shapeFromDrag('rect', { x: 100, y: 100 }, { x: 300, y: 220 }, false)).toEqual({ tool: 'rect', x: 100, y: 100, w: 200, h: 120 });
    expect(shapeFromDrag('rect', { x: 300, y: 220 }, { x: 100, y: 100 }, false)).toEqual({ tool: 'rect', x: 100, y: 100, w: 200, h: 120 });
    expect(shapeFromDrag('ellipse', { x: 0, y: 0 }, { x: 80, y: 30 }, true)).toMatchObject({ w: 80, h: 80 });
    expect(shapeFromDrag('text', { x: 500, y: 300 }, { x: 501, y: 300 }, false)).toEqual({ tool: 'text', x: 300, y: 270, w: 400, h: 60 });
    const line = shapeFromDrag('line', { x: 100, y: 100 }, { x: 200, y: 195 }, true);
    expect(line).toMatchObject({ tool: 'line', h: 0, rotation: 45 });
    expect(shapeFromDrag('line', { x: 0, y: 0 }, { x: 300, y: 0 }, false)).toEqual({ tool: 'line', x: 0, y: 0, w: 300, h: 0, rotation: 0 });
  });

  test('copy / paste: fresh ids, each paste a step further, children travel with their group', () => {
    clearClipboard();
    const doc = docOf([{ id: 'g', type: 'group', x: 10, y: 10, w: 100, h: 100, children: [rect({ id: 'c1' })] }, rect({ id: 'solo' })]);
    expect(hasClipboardLayers()).toBe(false);
    expect(pasteLayersCmd(doc)).toBeNull();
    expect(copyLayers(doc, ['g', 'c1'])).toBe(1); // c1 is inside g: one top-level layer
    const p1 = pasteLayersCmd(doc)!;
    const after = p1.cmd.apply(doc);
    const pasted = after.elements.find((e) => e.id === p1.newIds[0])!;
    expect(pasted.id).not.toBe('g');
    expect([pasted.x, pasted.y]).toEqual([30, 30]);
    expect(pasted.children![0].id).not.toBe('c1');
    expect(validateLayout(after).errors).toEqual([]);
    const p2 = pasteLayersCmd(after)!;
    expect(p2.cmd.apply(after).elements.find((e) => e.id === p2.newIds[0])!.x).toBe(50);
    expect(p1.cmd.revert(after).elements.map((e) => e.id)).toEqual(['g', 'solo']);
  });
});

// ── after-effects-style timing ──────────────────────────────────────────────

describe('easing, timing and properties', () => {
  test('every easing runs from 0 to 1; hold jumps; elastic overshoots; bounce stays inside', () => {
    for (const name of EASINGS as string[]) {
      const f = easeFn(name as any);
      expect({ name, a: Math.round(f(0) * 1000) / 1000, b: Math.round(f(1) * 1000) / 1000 }).toEqual({ name, a: 0, b: 1 });
    }
    expect(easeFn('hold')(0.99)).toBe(0);
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => easeFn('elasticOut')(i / 50)))).toBeGreaterThan(1.05);
    expect(Array.from({ length: 50 }, (_, i) => easeFn('bounceOut')(i / 50)).every((v) => v >= 0 && v <= 1.0001)).toBe(true);
    expect(EASE_CURVES.easeOutExpo).toEqual([0.16, 1, 0.3, 1]);
  });

  test('clipTime: delay, speed, stagger per row, ping-pong', () => {
    const clip = (over: Partial<TimelineClip> = {}): TimelineClip => ({ id: 'c', duration: 1000, trigger: { type: 'enter' }, tracks: [], ...over });
    expect(clipTime(clip({ delay: 300 }), 200)).toEqual({ t: 0, done: false }); // still waiting, on the first frame
    expect(clipTime(clip({ delay: 300 }), 800)).toEqual({ t: 500, done: false });
    expect(clipTime(clip({ speed: 2 }), 250)).toEqual({ t: 500, done: false });
    expect(clipTime(clip({ speed: 2 }), 500)).toEqual({ t: 1000, done: true });
    expect(clipTime(clip({ stagger: 100 }), 350, 3)).toEqual({ t: 50, done: false }); // row 3 starts 300 ms late
    expect(clipDelay(clip({ delay: 50, stagger: 100 }), 2)).toBe(250);
    expect(clipTotalMs(clip({ delay: 200, speed: 2, loop: 1 }))).toBe(200 + 1000);
    expect(clipTotalMs(clip({ loop: true }))).toBe(Infinity);
    const pp = clip({ loop: true, direction: 'alternate' });
    expect(clipTime(pp, 250).t).toBe(250);
    expect(clipTime(pp, 1250).t).toBe(750); // second pass runs backwards
    expect(clipTime(pp, 2250).t).toBe(250);
    expect(clipTime(clip({ loop: 1, direction: 'alternate' }), 5000)).toEqual({ t: 0, done: true }); // there and back: ends where it began
  });

  test('wiggle is smooth, bounded, repeatable, and differs per row', () => {
    const a = Array.from({ length: 200 }, (_, i) => wiggleAt(i * 16, 2, 10, 'dx:0'));
    expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(10);
    expect(Math.max(...a.slice(1).map((v, i) => Math.abs(v - a[i])))).toBeLessThan(4); // no jumps between frames
    expect(wiggleAt(480, 2, 10, 'dx:0')).toBe(a[30]);
    expect(wiggleAt(480, 2, 10, 'dx:1')).not.toBe(a[30]);
    const tr = { prop: 'dx' as const, keyframes: [{ t: 0, value: 100 }], wiggle: { freq: 2, amp: 10 } };
    expect(sampleTrack(tr, 480, null)).toBeCloseTo(100 + a[30], 6);
  });

  test('frame style: relative move, 3D, anchor, wipes, colour grading, tracking', () => {
    const base = { x: 10, y: 20, w: 100, h: 50, rotation: 0, opacity: 1 };
    const f = frameStyle(base, { dx: 30, dy: -5, rotateY: 45, scale: 2, skewY: 3, originX: 0, originY: 100, wipeR: 0.25, saturate: 0.5, hueRotate: 90, contrast: 1.2, letterSpacing: 6 });
    expect([f.left, f.top]).toEqual([10, 20]); // the box itself does not move: dx / dy are a transform
    expect(f.transform).toBe('translate(30px, -5px) perspective(900px) rotateY(45deg) scale(2, 2) skewY(3deg)');
    expect(f.origin).toBe('0% 100%');
    expect(f.clip).toBe('inset(0% 25% 0% 0%)');
    expect(f.filter).toBe('saturate(0.5) hue-rotate(90deg) contrast(1.2)');
    expect(f.letterSpacing).toBe(6);
    const none = frameStyle(base, {});
    expect([none.transform, none.origin, none.clip, none.filter, none.letterSpacing]).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect((TIMELINE_PROPS as string[]).length).toBeGreaterThanOrEqual(31);
  });
});

// ── 100+ presets ────────────────────────────────────────────────────────────

describe('preset library', () => {
  test('more than 100 presets, unique ids, every entrance has its exit, and every one validates', () => {
    expect(EFFECT_LIST.length).toBeGreaterThanOrEqual(140);
    expect(new Set(EFFECT_LIST.map((e) => e.id)).size).toBe(EFFECT_LIST.length);
    const count = (g: string) => EFFECT_LIST.filter((e) => e.group === g).length;
    expect(count('in')).toBe(count('out'));
    expect(count('in')).toBeGreaterThanOrEqual(40);
    expect(count('popup')).toBeGreaterThanOrEqual(16);
    for (const e of EFFECT_LIST.filter((x) => x.group === 'in')) expect(EFFECTS[matchingExit(e.id)]?.group).toBe('out');

    const text: LayoutElement = { id: 't', type: 'text', x: 0, y: 0, w: 200, h: 40, style: { color: '#ffffff', letterSpacing: 2 } };
    for (const e of EFFECT_LIST) {
      const built = e.build(text, { ...DEFAULT_OPTIONS, speed: 1.6 });
      const clip: TimelineClip = { id: 'c', duration: built.duration, trigger: { type: 'enter' }, tracks: built.tracks, ...(built.loop ? { loop: true } : null) };
      const v = validateLayout({ ...createEmptyLayout(), elements: [{ ...text, timeline: { clips: [clip] } }] });
      expect({ effect: e.id, errors: v.errors }).toEqual({ effect: e.id, errors: [] });
      expect(built.tracks.every((tr) => tr.keyframes.every((k) => k.t <= built.duration))).toBe(true);
    }
  });

  test('presets are position-independent: the same keyframes wherever the layer sits', () => {
    const moved = ['slideInLeft', 'flyOutUp', 'bounceIn', 'dropIn', 'shake', 'floatLoop', 'springInRight', 'popInOut', 'slideInOutLeft'];
    for (const id of moved) {
      const a = EFFECTS[id].build(rect({ x: 0, y: 0 }), DEFAULT_OPTIONS);
      const b = EFFECTS[id].build(rect({ x: 1500, y: 900 }), DEFAULT_OPTIONS);
      expect({ id, same: JSON.stringify(a) === JSON.stringify(b) }).toEqual({ id, same: true });
      expect(a.tracks.some((t) => t.prop === 'x' || t.prop === 'y')).toBe(false);
    }
  });

  test('an entrance ends at rest, its exit starts there; a popup is invisible before and after', () => {
    const last = (keys: any[]) => keys[keys.length - 1].value;
    const inn = EFFECTS.slideInLeft.build(rect(), DEFAULT_OPTIONS);
    const out = EFFECTS.slideOutLeft.build(rect(), DEFAULT_OPTIONS);
    expect(last(inn.tracks.find((t) => t.prop === 'dx')!.keyframes)).toBe(0);
    expect(out.tracks.find((t) => t.prop === 'dx')!.keyframes[0].value).toBe(0);
    expect(last(out.tracks.find((t) => t.prop === 'opacity')!.keyframes)).toBe(0);
    for (const e of EFFECT_LIST.filter((x) => x.group === 'popup')) {
      const b = e.build(rect(), { ...DEFAULT_OPTIONS, hold: 2000 });
      const op = b.tracks.find((t) => t.prop === 'opacity');
      const wipes = b.tracks.filter((t) => t.prop.startsWith('wipe'));
      const hiddenAt = (i: 0 | -1) => (op ? (i === 0 ? op.keyframes[0].value : last(op.keyframes)) === 0 : wipes.reduce((s, t) => s + Number(i === 0 ? t.keyframes[0].value : last(t.keyframes)), 0) >= 1);
      expect({ id: e.id, start: hiddenAt(0), end: hiddenAt(-1) }).toEqual({ id: e.id, start: true, end: true });
      expect(b.duration).toBeGreaterThan(2000);
    }
    expect(effectsFor('exit', rect()).flatMap((g) => g.effects).every((e) => e.group === 'out')).toBe(true);
  });
});

// ── exit / lifecycle ────────────────────────────────────────────────────────

describe('in → stay → out', () => {
  test('lifecycle <-> clips: set, change, time it, remove; other rules untouched', () => {
    let el = rect({ timeline: { clips: [ruleToClip(rect(), { trigger: 'anyKill', effect: 'pop', options: DEFAULT_OPTIONS }, 'k')] } });
    expect(lifecycleOf(el)).toEqual({ in: null, stay: null, out: null });
    el = withLifecycle(el, { in: 'slideInLeft', stay: null, out: 'fadeOut' });
    expect(lifecycleOf(el)).toEqual({ in: 'slideInLeft', stay: null, out: 'fadeOut' });
    expect(el.timeline!.clips.map((c) => c.trigger.type)).toEqual(['enter', 'event', 'exit']);
    el = withLifecycle(el, { in: 'slideInLeft', stay: 5, out: 'fadeOut' });
    expect(el.timeline!.clips[2].trigger).toEqual({ type: 'exit', after: 5000 });
    expect(clipToRule(el.timeline!.clips[2])).toMatchObject({ trigger: TRIGGERS.timedExit, n: 5 });
    // a set time with no exit chosen gets the matching one
    expect(lifecycleOf(withLifecycle(rect(), { in: 'dropIn', stay: 3, out: null }))).toEqual({ in: 'dropIn', stay: 3, out: 'liftOut' });
    el = withLifecycle(el, { in: null, stay: null, out: null });
    expect(el.timeline!.clips.map((c) => c.id)).toEqual(['k']);
    expect(validateLayout(docOf([withLifecycle(rect(), { in: 'popIn', stay: 2.5, out: 'popOut' })])).errors).toEqual([]);
  });

  describe('renderer', () => {
    let raf: FrameRequestCallback[];
    let clock = 0;
    beforeEach(() => {
      raf = [];
      clock = 0;
      jest.useFakeTimers();
      jest.spyOn(performance, 'now').mockImplementation(() => clock);
      (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => { raf.push(cb); return raf.length; };
      (global as any).cancelAnimationFrame = () => {};
    });
    afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
    const step = (ms: number) => act(() => { clock += ms; jest.advanceTimersByTime(ms); const q = raf; raf = []; q.forEach((cb) => cb(clock)); });
    const node = (c: HTMLElement) => c.querySelector('[data-element-id="r"]') as HTMLElement | null;
    const state = (alive: number) => ({ derived: { teams: Array.from({ length: alive }, (_, i) => ({ teamId: `t${i}`, isAllDead: false, players: [{ uId: `p${i}`, liveState: 0, health: 100 }] })) }, match: {}, round: {}, deadTeamList: [] });
    const when = { path: 'live.aliveTeamsCount', op: 'lessOrEqual' as const, value: 2 };

    test('hidden by its condition: the exit plays first, THEN the layer is removed', () => {
      const el = withLifecycle(rect({ visibleWhen: when }), { in: 'fadeIn', stay: null, out: 'slideOutLeft' });
      const doc = docOf([el]);
      const { container, rerender } = render(<LayoutRenderer layout={doc} state={state(5)} events={null} fit={1} />);
      expect(node(container)).toBeNull();

      rerender(<LayoutRenderer layout={doc} state={state(2)} events={null} fit={1} />);
      step(600);
      expect(node(container)!.style.opacity).toBe('1');

      rerender(<LayoutRenderer layout={doc} state={state(5)} events={null} fit={1} />);
      step(300);
      const mid = node(container)!; // still there, on its way out
      expect(mid.style.transform).toMatch(/translate\(-\d/);
      step(400);
      act(() => { jest.runOnlyPendingTimers(); });
      expect(node(container)).toBeNull();
    });

    test('a set time: it leaves by itself, stays away, and returns when the condition comes true again', () => {
      const el = withLifecycle(rect({ visibleWhen: when }), { in: 'fadeIn', stay: 2, out: 'fadeOut' });
      const doc = docOf([el]);
      const { container, rerender } = render(<LayoutRenderer layout={doc} state={state(2)} events={null} fit={1} />);
      step(500);
      expect(node(container)!.style.opacity).toBe('1');
      step(1900); // 500 in + 2000 stay = 2500: still on screen at 2400
      expect(node(container)).not.toBeNull();
      step(200); // exit begins
      step(600); // … and ends
      act(() => { jest.runOnlyPendingTimers(); });
      expect(node(container)).toBeNull();

      rerender(<LayoutRenderer layout={doc} state={{ ...state(2) }} events={null} fit={1} />); // still true: it must not pop back
      expect(node(container)).toBeNull();
      rerender(<LayoutRenderer layout={doc} state={state(5)} events={null} fit={1} />);
      rerender(<LayoutRenderer layout={doc} state={state(1)} events={null} fit={1} />); // true again -> shows again
      expect(node(container)).not.toBeNull();
    });

    test('in the editor the layer never removes itself', () => {
      const el = withLifecycle(rect(), { in: 'fadeIn', stay: 1, out: 'fadeOut' });
      const { container } = render(<LayoutRenderer layout={docOf([el])} state={state(5)} events={null} fit={1} mode="editor" />);
      step(5000);
      expect(node(container)).not.toBeNull();
    });
  });

  test('templates: the alert and the intro carry an in / stay / out lifecycle', () => {
    const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!.elements[0];
    expect(lifecycleOf(tpl('rb-domination-alert'))).toEqual({ in: 'dropIn', stay: 6, out: 'liftOut' });
    expect(tpl('rb-domination-alert').visibleWhen).toEqual({ path: 'live.killLeader.killNum', op: 'greaterOrEqual', value: 3 });
    expect(lifecycleOf(tpl('rb-match-intro'))).toEqual({ in: 'zoomIn', stay: 5, out: 'fadeOut' });
  });
});

// ── speed ───────────────────────────────────────────────────────────────────

describe('rendering cost', () => {
  const clip: TimelineClip = { id: 'c1', duration: 1000, trigger: { type: 'enter' }, tracks: [{ prop: 'dx', keyframes: [{ t: 0, value: 0 }, { t: 1000, value: 100 }] }] };
  const doc = docOf([rect({ id: 'a', timeline: { clips: [clip] } }), rect({ id: 'b' }), rect({ id: 'c' })]);

  test('scrubbing through the preview store writes the layer and commits nothing in React', () => {
    const store = createPreviewStore();
    let commits = 0;
    const { container } = render(
      <Profiler id="stage" onRender={() => { commits++; }}>
        <LayoutRenderer layout={doc} state={null} events={null} fit={1} mode="editor" playTimelines={false} previewStore={store} />
      </Profiler>
    );
    const a = container.querySelector('[data-element-id="a"]') as HTMLElement;
    act(() => store.set({ elementId: 'a', clipId: 'c1', t: 0 })); // entering preview may render that one layer
    const settled = commits;
    for (let t = 100; t <= 1000; t += 100) act(() => store.set({ elementId: 'a', clipId: 'c1', t }));
    expect(a.style.transform).toBe('translate(100px, 0px)');
    expect(commits).toBe(settled); // ten frames, zero renders
  });

  test('editing one layer re-renders that layer only', () => {
    const spy = jest.spyOn(bindings, 'resolveBoundProps');
    const { rerender } = render(<LayoutRenderer layout={doc} state={null} events={null} fit={1} mode="editor" playTimelines={false} />);
    spy.mockClear();
    const moved = { ...doc, elements: [doc.elements[0], { ...doc.elements[1], x: 400 }, doc.elements[2]] };
    rerender(<LayoutRenderer layout={moved} state={null} events={null} fit={1} mode="editor" playTimelines={false} onElementPointerDown={() => {}} />);
    rerender(<LayoutRenderer layout={moved} state={null} events={null} fit={1} mode="editor" playTimelines={false} onElementPointerDown={() => {}} />);
    const moved2 = { ...moved, elements: [moved.elements[0], { ...moved.elements[1], x: 500 }, moved.elements[2]] };
    spy.mockClear();
    // a brand-new handler identity (as the editor passes on every edit) must not matter
    rerender(<LayoutRenderer layout={moved2} state={null} events={null} fit={1} mode="editor" playTimelines={false} onElementPointerDown={() => {}} />);
    expect(spy.mock.calls.map((c: any[]) => (c[0] as LayoutElement).id)).toEqual(['b']);
    spy.mockRestore();
  });
});

// ── keyframe editing ────────────────────────────────────────────────────────

describe('keyframe operations', () => {
  const clip: TimelineClip = {
    id: 'c1', duration: 1000, trigger: { type: 'enter' }, tracks: [
      { prop: 'dx', keyframes: [{ t: 0, value: -100, ease: 'easeOut' }, { t: 400, value: 20, ease: 'easeIn' }, { t: 1000, value: 0 }] },
      { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 400, value: 1 }] },
    ],
  };
  const el = rect({ timeline: { clips: [clip] } });
  const kf = (e: LayoutElement, prop: string) => e.timeline!.clips[0].tracks.find((t) => t.prop === prop)!.keyframes;

  test('move several together (clamped), ease several, delete several', () => {
    const keys = [{ prop: 'dx' as const, t: 400 }, { prop: 'opacity' as const, t: 400 }];
    const moved = shiftKeyframes(el, 'c1', keys, 200);
    expect(moved.keys.map((k) => k.t)).toEqual([600, 600]);
    expect(kf(moved.el, 'dx').map((k) => k.t)).toEqual([0, 600, 1000]);
    expect(kf(moved.el, 'opacity').map((k) => k.t)).toEqual([0, 600]);
    expect(shiftKeyframes(el, 'c1', keys, 5000).keys.map((k) => k.t)).toEqual([1000, 1000]); // cannot leave the clip
    expect(shiftKeyframes(el, 'c1', keys, -5000).keys.map((k) => k.t)).toEqual([0, 0]);
    const eased = setKeyframesEase(el, 'c1', keys, 'easeInOutCubic');
    expect([kf(eased, 'dx')[1].ease, kf(eased, 'opacity')[1].ease, kf(eased, 'dx')[0].ease]).toEqual(['easeInOutCubic', 'easeInOutCubic', 'easeOut']);
    expect(kf(setKeyframesEase(eased, 'c1', keys, null), 'dx')[1].ease).toBeUndefined();
    const del = deleteKeyframes(el, 'c1', [{ prop: 'opacity', t: 0 }, { prop: 'opacity', t: 400 }, { prop: 'dx', t: 0 }]);
    expect(del.timeline!.clips[0].tracks.map((t) => t.prop)).toEqual(['dx']); // an emptied track is removed
    expect(el.timeline!.clips[0].tracks).toHaveLength(2); // never mutates
  });

  test('copy / paste at the playhead keeps spacing and eases; reverse; wiggle; keyframe times', () => {
    const copied = copyKeyframes(clip, [{ prop: 'dx', t: 400 }, { prop: 'dx', t: 1000 }, { prop: 'opacity', t: 400 }]);
    expect(copied.map((c) => [c.prop, c.dt])).toEqual([['dx', 0], ['dx', 600], ['opacity', 0]]);
    const pasted = pasteKeyframes(el, 'c1', copied, 100);
    expect(pasted.keys.map((k) => `${k.prop}@${k.t}`)).toEqual(['dx@100', 'dx@700', 'opacity@100']);
    expect(kf(pasted.el, 'dx').find((k) => k.t === 100)).toEqual({ t: 100, value: 20, ease: 'easeIn' });
    expect(pasteKeyframes(el, 'c1', copied, 900).el.timeline!.clips[0].duration).toBe(1500); // the clip grows to fit

    const rev = reverseClip(el, 'c1');
    expect(kf(rev, 'dx')).toEqual([{ t: 0, value: 0, ease: 'easeIn' }, { t: 600, value: 20, ease: 'easeOut' }, { t: 1000, value: -100 }]);
    expect(kf(reverseClip(rev, 'c1'), 'dx')).toEqual(clip.tracks[0].keyframes);

    const wig = setTrackWiggle(el, 'c1', 'dx', { freq: 3, amp: 8 });
    expect(wig.timeline!.clips[0].tracks[0].wiggle).toEqual({ freq: 3, amp: 8 });
    expect(setTrackWiggle(wig, 'c1', 'dx', null).timeline!.clips[0].tracks[0].wiggle).toBeUndefined();
    expect(keyframeTimes(clip)).toEqual([0, 400, 1000]);
    expect(validateLayout(docOf([wig])).errors).toEqual([]);
  });

  test('graph editor: béziers get handles, function eases do not', () => {
    expect(bezierOf('easeOutExpo')).toEqual([0.16, 1, 0.3, 1]);
    expect(bezierOf([0.1, 0.2, 0.3, 0.4])).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(bezierOf(undefined)).toEqual([0, 0, 1, 1]);
    expect(bezierOf('bounceOut')).toBeNull();
    const { container, rerender } = render(<GraphEditor ease="easeInOut" onChange={() => {}} />);
    expect(container.querySelectorAll('[data-handle]')).toHaveLength(2);
    rerender(<GraphEditor ease="elasticOut" onChange={() => {}} />);
    expect(container.querySelectorAll('[data-handle]')).toHaveLength(0);
    expect(container.querySelector('[data-curve]')).toBeInTheDocument();
  });
});

describe('keyframe timeline panel', () => {
  const clip: TimelineClip = {
    id: 'c1', name: 'Move', duration: 1000, trigger: { type: 'enter' }, tracks: [
      { prop: 'dx', keyframes: [{ t: 0, value: -100 }, { t: 500, value: 0 }] },
      { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 500, value: 1 }] },
    ],
  };
  function Harness({ store }: { store?: ReturnType<typeof createPreviewStore> }) {
    const [doc, setDoc] = useState(docOf([rect({ timeline: { clips: [clip] } }), rect({ id: 'plain' })]));
    const [ui, setUi] = useState<TimelineUiState>({ clipId: 'c1', playhead: 0, recording: false });
    const [sel, setSel] = useState('r');
    return (
      <>
        <TimelinePanel doc={doc} selectedId={sel} exec={(cmd) => { if (cmd) setDoc((d) => cmd.apply(d)); }} scope={bindings.buildScope(null, doc)} sim={null}
          ui={ui} setUi={(p) => setUi((s) => ({ ...s, ...p }))} onPreviewChange={() => {}} previewStore={store} onSelectLayer={setSel} />
        <output data-testid="doc">{JSON.stringify(doc.elements[0].timeline?.clips[0])}</output>
        <output data-testid="ui">{`${sel}|${ui.playhead}`}</output>
      </>
    );
  }
  const clipNow = (): TimelineClip => JSON.parse(screen.getByTestId('doc').textContent!);
  const key = (panel: HTMLElement, id: string) => panel.querySelector(`[data-keyframe="${id}"]`) as HTMLElement;
  const click = (n: HTMLElement, init: any = {}) => { fireEvent.pointerDown(n, init); fireEvent.pointerUp(window); };

  test('Shift+click selects several; F9 eases them; Ctrl+C then Ctrl+V pastes at the playhead; Delete removes them', () => {
    render(<Harness />);
    const panel = screen.getByTestId('timeline-panel');
    click(key(panel, 'dx@0'));
    click(key(panel, 'opacity@0'), { shiftKey: true });
    expect(within(panel).getByText('2 keyframes selected')).toBeInTheDocument();
    expect(panel.querySelectorAll('[data-selected]')).toHaveLength(2);

    fireEvent.keyDown(panel, { key: 'F9' });
    expect(clipNow().tracks.map((t) => t.keyframes[0].ease)).toEqual(['easeInOutCubic', 'easeInOutCubic']);

    fireEvent.keyDown(panel, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(panel, { key: 'End' });
    expect(screen.getByTestId('ui').textContent).toBe('r|1000');
    fireEvent.keyDown(panel, { key: 'v', ctrlKey: true });
    expect(clipNow().tracks.map((t) => t.keyframes.map((k) => k.t))).toEqual([[0, 500, 1000], [0, 500, 1000]]);
    expect(clipNow().tracks[0].keyframes[2]).toEqual({ t: 1000, value: -100, ease: 'easeInOutCubic' });

    fireEvent.keyDown(panel, { key: 'Delete' }); // the pasted pair is the selection
    expect(clipNow().tracks.map((t) => t.keyframes.map((k) => k.t))).toEqual([[0, 500], [0, 500]]);
  });

  test('J / K walk the keyframes, R keys a property at the playhead, the head goes through the preview store', () => {
    const store = createPreviewStore();
    render(<Harness store={store} />);
    const panel = screen.getByTestId('timeline-panel');
    expect(store.get()).toEqual({ elementId: 'r', clipId: 'c1', t: 0 });
    fireEvent.keyDown(panel, { key: 'k' });
    expect(screen.getByTestId('ui').textContent).toBe('r|500');
    expect(store.get()).toEqual({ elementId: 'r', clipId: 'c1', t: 500 });
    expect(screen.getByTestId('playhead').textContent).toBe('0.50s');
    fireEvent.keyDown(panel, { key: 'r' });
    expect(clipNow().tracks.find((t) => t.prop === 'rotation')!.keyframes).toEqual([{ t: 500, value: 0 }]);
    fireEvent.keyDown(panel, { key: 'j' });
    expect(screen.getByTestId('ui').textContent).toBe('r|0');
  });

  test('timing row writes delay / speed / stagger; ping-pong; exit trigger with a time; reverse', () => {
    render(<Harness />);
    const panel = screen.getByTestId('timeline-panel');
    const timing = within(panel).getByTestId('clip-timing');
    const [delay, speed, stagger] = within(timing).getAllByRole('spinbutton');
    fireEvent.change(delay, { target: { value: '200' } });
    fireEvent.change(speed, { target: { value: '150' } });
    fireEvent.change(stagger, { target: { value: '80' } });
    expect(clipNow()).toMatchObject({ delay: 200, speed: 1.5, stagger: 80 });
    const select = (first: string) => within(panel).getAllByRole('combobox').find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.text === first))!;
    fireEvent.change(select('ping-pong forever'), { target: { value: 'pingpong' } });
    expect(clipNow()).toMatchObject({ loop: true, direction: 'alternate' });
    fireEvent.change(select('on exit'), { target: { value: 'exit' } });
    expect(clipNow().trigger).toEqual({ type: 'exit' });
    expect(clipNow().loop).toBeUndefined();
    fireEvent.click(within(timing).getByText('⇄ Reverse'));
    expect(clipNow().tracks[0].keyframes.map((k) => [k.t, k.value])).toEqual([[500, 0], [1000, -100]]);
  });

  test('U shows every animated layer; clicking a bar opens that layer', () => {
    render(<Harness />);
    const panel = screen.getByTestId('timeline-panel');
    fireEvent.keyDown(panel, { key: 'u' });
    const sheet = screen.getByTestId('dope-sheet');
    expect(sheet.querySelectorAll('[data-layer]')).toHaveLength(1); // only "r" is animated
    fireEvent.click(within(sheet).getByText('Move'));
    expect(screen.queryByTestId('dope-sheet')).toBeNull();
    expect(screen.getByTestId('ui').textContent).toBe('r|0');
  });
});

// ── animate panel: lifecycle row + gallery ──────────────────────────────────

describe('animate panel', () => {
  function Harness({ initial }: { initial: LayoutDocument }) {
    const [st, setSt] = useState(() => initEditor(initial));
    return (
      <>
        <AnimatePanel doc={st.doc} selectedId="r" exec={(cmd) => { if (cmd) setSt((s) => editorReducer(s, { type: 'exec', cmd })); }} scope={{} as any} sim={null} onPreview={() => {}} onEditKeyframes={() => {}} />
        <output data-testid="life">{JSON.stringify(lifecycleOf(st.doc.elements[0]))}</output>
      </>
    );
  }
  const life = () => JSON.parse(screen.getByTestId('life').textContent!);

  test('the On-screen row builds in → stay → out', () => {
    render(<Harness initial={docOf([rect()])} />);
    const row = screen.getByTestId('lifecycle');
    fireEvent.change(within(row).getByLabelText('Comes in with'), { target: { value: 'slideInRight' } });
    expect(life()).toEqual({ in: 'slideInRight', stay: null, out: null });
    fireEvent.change(within(row).getByLabelText('Stays'), { target: { value: 'timed' } });
    expect(life()).toEqual({ in: 'slideInRight', stay: 5, out: 'slideOutRight' }); // the matching exit is chosen for you
    fireEvent.change(within(row).getByLabelText('Seconds on screen'), { target: { value: '8' } });
    fireEvent.change(within(row).getByLabelText('Goes out with'), { target: { value: 'zoomOut' } });
    expect(life()).toEqual({ in: 'slideInRight', stay: 8, out: 'zoomOut' });
    fireEvent.change(within(row).getByLabelText('Goes out with'), { target: { value: '' } });
    expect(life()).toEqual({ in: 'slideInRight', stay: null, out: null });
  });

  test('Browse… opens a searchable gallery of the effects that fit, and picking one applies it', () => {
    render(<Harness initial={docOf([rect()])} />);
    fireEvent.click(within(screen.getByTestId('lifecycle')).getAllByText('Browse…')[0]);
    const gallery = screen.getByTestId('effect-gallery');
    expect(gallery.querySelectorAll('[data-effect]').length).toBeGreaterThanOrEqual(40);
    fireEvent.change(within(gallery).getByPlaceholderText(/Search/), { target: { value: 'wipe' } });
    const hits = Array.from(gallery.querySelectorAll('[data-effect]')).map((n) => n.getAttribute('data-effect'));
    expect(hits).toEqual(expect.arrayContaining(['wipeInLeft', 'wipeInRight']));
    expect(hits.every((id) => EFFECTS[id!].group === 'in')).toBe(true);
    fireEvent.click(gallery.querySelector('[data-effect="wipeInLeft"]')!);
    expect(screen.queryByTestId('effect-gallery')).toBeNull();
    expect(life().in).toBe('wipeInLeft');
  });
});

// ── bandwidth ───────────────────────────────────────────────────────────────

describe('save transport', () => {
  const ID = '65f0000000000000000000c9';
  const draft = docOf(Array.from({ length: 40 }, (_, i) => rect({ id: `e${i}` })));
  beforeEach(() => { mockApi.put.mockReset(); mockApi.put.mockResolvedValue({ data: { _id: ID, draftRev: 2 } }); });

  test('an older backend (no capabilities) gets the plain body it always did', async () => {
    noteCapabilities(ID, undefined);
    await layoutsApi.save(ID, 1, { draft });
    expect(mockApi.put).toHaveBeenCalledWith(`/overlay-layouts/${ID}`, { expectedRev: 1, draft }, { params: undefined });
  });

  test('a capable backend is asked for a summary; without CompressionStream the body stays plain JSON', async () => {
    noteCapabilities(ID, ['gzip-save', 'summary-save']);
    expect(await gzipText('x'.repeat(5000))).toBeNull(); // jsdom has no CompressionStream
    const res = await layoutsApi.save(ID, 1, { draft });
    expect(mockApi.put).toHaveBeenCalledWith(`/overlay-layouts/${ID}`, { expectedRev: 1, draft }, { params: { return: 'summary' } });
    expect(res.draftRev).toBe(2);
    expect(lastSave.rawBytes).toBe(JSON.stringify({ expectedRev: 1, draft }).length);
  });

  test('with CompressionStream the body goes out gzipped, labelled as such', async () => {
    noteCapabilities(ID, ['gzip-save', 'summary-save']);
    const realBlob = global.Blob;
    const realResponse = (global as any).Response;
    // a stand-in pipeline: "compress" to a tenth, enough to prove the request shape
    (global as any).CompressionStream = function CompressionStream(this: any, format: string) { this.format = format; };
    (global as any).Blob = class extends realBlob { stream(): any { return { pipeThrough: () => ({ size: Math.ceil(this.size / 10) }) }; } };
    (global as any).Response = class { constructor(private s: any) {} async blob() { return new realBlob([new Uint8Array(this.s.size)]); } };
    try {
      await layoutsApi.save(ID, 1, { draft });
      const [url, body, cfg] = mockApi.put.mock.calls[0];
      expect(url).toBe(`/overlay-layouts/${ID}`);
      expect(body).toBeInstanceOf(realBlob);
      expect(cfg).toEqual({ params: { return: 'summary' }, headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } });
      expect(lastSave.sentBytes).toBeLessThan(lastSave.rawBytes / 5);
    } finally {
      delete (global as any).CompressionStream;
      (global as any).Blob = realBlob;
      (global as any).Response = realResponse;
    }
  });
});
