// "When a value changes" (trigger type `change`), the Smash Point / observed
// player rules built on it, and reduced motion for endless loops.

import React from 'react';
import { act, render } from '@testing-library/react';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { changeKey } from '../renderer/useTimeline.ts';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
import type { LayoutElement, TimelineClip } from '../schema/layoutTypes.ts';
import { DEFAULT_OPTIONS } from '../editor/animationEffects.ts';
import { clipToRule, ruleToClip, TRIGGERS } from '../editor/animationLibrary.ts';

const slide = (over: Partial<TimelineClip>): TimelineClip => ({
  id: 'c1', duration: 1000, trigger: { type: 'enter' }, retrigger: 'restart',
  tracks: [{ prop: 'x', keyframes: [{ t: 0, value: 0, ease: 'linear' }, { t: 1000, value: 100 }] }],
  ...over,
});

const layoutWith = (c: TimelineClip): any => {
  const doc = { ...createEmptyLayout(), elements: [{ id: 'el', type: 'rect', x: 0, y: 0, w: 100, h: 100, timeline: { clips: [c] } }] };
  const v = validateLayout(doc);
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return doc;
};
const state = (value: string) => ({ match: { _id: 'm1', smashPoint: { enabled: true, value } } }) as any;

describe('runtime', () => {
  let raf: FrameRequestCallback[];
  let clock = 0;
  beforeEach(() => {
    raf = [];
    clock = 0;
    jest.spyOn(performance, 'now').mockImplementation(() => clock);
    (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => { raf.push(cb); return raf.length; };
    (global as any).cancelAnimationFrame = () => {};
  });
  afterEach(() => { jest.restoreAllMocks(); delete (window as any).matchMedia; });
  const step = (ms: number) => { clock += ms; const q = raf; raf = []; q.forEach((cb) => cb(clock)); };

  test('a change clip plays on a new value only: not the first value, not a re-sent identical one', () => {
    const doc = layoutWith(slide({ trigger: { type: 'change', watch: 'match.smashPoint.value' } }));
    const { container, rerender } = render(<LayoutRenderer layout={doc} state={state('80')} events={null} fit={1} />);
    const node = () => container.querySelector('[data-element-id="el"]') as HTMLElement;
    act(() => step(500));
    expect(node().style.left).toBe('0px');

    rerender(<LayoutRenderer layout={doc} state={state('80')} events={null} fit={1} />); // heartbeat / reconnect: same value, new object
    act(() => step(500));
    expect(node().style.left).toBe('0px');

    rerender(<LayoutRenderer layout={doc} state={state('90')} events={null} fit={1} />);
    act(() => step(500));
    expect(node().style.left).toBe('50px');
  });

  test('reduced motion: an endless loop stays at rest, a one-off clip still plays', () => {
    (window as any).matchMedia = (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} });
    const loop = render(<LayoutRenderer layout={layoutWith(slide({ trigger: { type: 'loop' }, loop: true }))} state={null} events={null} fit={1} />);
    act(() => step(500));
    expect((loop.container.querySelector('[data-element-id="el"]') as HTMLElement).style.left).toBe('0px');
    loop.unmount();

    const once = render(<LayoutRenderer layout={layoutWith(slide({}))} state={null} events={null} fit={1} />);
    act(() => step(500));
    expect((once.container.querySelector('[data-element-id="el"]') as HTMLElement).style.left).toBe('50px');
  });
});

test('changeKey compares by content', () => {
  expect(changeKey({ a: 1 })).toBe(changeKey({ a: 1 }));
  expect(changeKey(0)).not.toBe(changeKey('0'));
  expect(changeKey(undefined)).not.toBe(changeKey(null));
});

test('schema: a change trigger needs a valid path to watch', () => {
  const bad: any = { ...createEmptyLayout(), elements: [{ id: 'e', type: 'rect', x: 0, y: 0, w: 1, h: 1, timeline: { clips: [{ id: 'c', duration: 100, trigger: { type: 'change' }, tracks: [] }] } }] };
  expect(validateLayout(bad).errors.map((e: any) => e.path)).toContain('elements[0].timeline.clips[0].trigger.watch');
});

describe('Animate rules', () => {
  const text: LayoutElement = { id: 't', type: 'text', x: 0, y: 0, w: 100, h: 20, bind: { text: { path: 'live.killLeader.killNum' } } } as any;
  const rule = (trigger: string, effect = 'pop') => ruleToClip(text, { trigger, effect, options: DEFAULT_OPTIONS } as any, 'r1');

  test('"its value changes" watches the layer’s own binding and reads back', () => {
    const c = rule('valueChanges');
    expect(c.trigger).toEqual({ type: 'change', watch: 'live.killLeader.killNum' });
    expect(clipToRule(c).trigger?.id).toBe('valueChanges');
  });

  test('Smash Point and observed-player rules', () => {
    expect(rule('smashPointChanges').trigger).toEqual({ type: 'change', watch: 'match.smashPoint.value' });
    expect(clipToRule(rule('smashPointChanges')).trigger?.id).toBe('smashPointChanges');
    expect(rule('observedChanges').trigger).toEqual({ type: 'change', watch: 'local.observed.uId' });
    const on = rule('smashPointOn', 'fadeIn');
    expect(on.trigger).toMatchObject({ type: 'condition', revert: true });
    expect(clipToRule(on).trigger?.id).toBe('smashPointOn');
    expect(TRIGGERS.smashPointOn.kind).toBe('state');
  });
});
