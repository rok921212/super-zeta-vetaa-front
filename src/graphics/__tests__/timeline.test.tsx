import React from 'react';
import { act, render } from '@testing-library/react';
import { clipTime, cubicBezier, easeFn, frameStyle, parseColor, sampleClip, sampleTrack } from '../renderer/timeline.ts';
import { LayoutRenderer, type EventSource } from '../renderer/LayoutRenderer.tsx';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
import type { TimelineClip } from '../schema/layoutTypes.ts';
import type { EngineEvent } from '../../overlayClient/engineTypes.ts';

const clip = (over: Partial<TimelineClip> = {}): TimelineClip => ({
  id: 'c1', name: 'Slide', duration: 1000, trigger: { type: 'enter' }, retrigger: 'restart',
  tracks: [
    { prop: 'x', keyframes: [{ t: 0, value: 0, ease: 'linear' }, { t: 1000, value: 100 }] },
    { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 500, value: 1 }] },
  ],
  ...over,
});

describe('timeline math', () => {
  test('cubic-bezier matches endpoints and is monotonic for standard curves', () => {
    const f = cubicBezier(0.42, 0, 0.58, 1);
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
    expect(f(0.5)).toBeCloseTo(0.5, 3);
    expect(f(0.25)).toBeLessThan(0.25);
    expect(easeFn('linear')(0.3)).toBeCloseTo(0.3, 6);
    expect(easeFn([0, 0, 1, 1])(0.7)).toBeCloseTo(0.7, 6);
  });

  test('linear interpolation, holds outside the keyed range', () => {
    const c = clip();
    expect(sampleTrack(c.tracks[0], -5, null)).toBe(0);
    expect(sampleTrack(c.tracks[0], 250, null)).toBeCloseTo(25, 6);
    expect(sampleTrack(c.tracks[0], 5000, null)).toBe(100);
    expect(sampleClip(c, 250, null)).toEqual({ x: 25, opacity: 0.5 });
  });

  test('colors interpolate in RGBA; unparseable colors step', () => {
    expect(parseColor('#f00')).toEqual([255, 0, 0, 1]);
    expect(parseColor('rgba(0, 0, 255, 0.5)')).toEqual([0, 0, 255, 0.5]);
    const tr = { prop: 'fill' as const, keyframes: [{ t: 0, value: '#ff0000' }, { t: 100, value: '#0000ff' }] };
    expect(sampleTrack(tr, 50, null)).toBe('rgba(128,0,128,1)');
    const named = { prop: 'color' as const, keyframes: [{ t: 0, value: 'red' }, { t: 100, value: 'blue' }] };
    expect(sampleTrack(named, 40, null)).toBe('red');
    expect(sampleTrack(named, 60, null)).toBe('blue');
  });

  test('keyframe values bound to data resolve against the scope (incl. event)', () => {
    const tr = { prop: 'w' as const, keyframes: [{ t: 0, value: 0 }, { t: 100, value: { bind: { path: 'event.payload.health' } } }] };
    const scope: any = { event: { payload: { health: 80 } } };
    expect(sampleTrack(tr, 100, scope)).toBe(80);
    expect(sampleTrack(tr, 50, scope)).toBe(40);
  });

  test('clip time: once, looping, counted loops', () => {
    expect(clipTime(clip(), 400)).toEqual({ t: 400, done: false });
    expect(clipTime(clip(), 1500)).toEqual({ t: 1000, done: true });
    expect(clipTime(clip({ loop: true }), 2500)).toEqual({ t: 500, done: false });
    expect(clipTime(clip({ loop: 2 }), 2500)).toEqual({ t: 500, done: false });
    expect(clipTime(clip({ loop: 2 }), 3000).done).toBe(true);
  });

  test('frame style composes geometry, transform, blur and color vars', () => {
    const f = frameStyle({ x: 10, y: 20, w: 100, h: 50, rotation: 0, opacity: 1 }, { x: 40, scale: 2, rotation: 15, blur: 4, fill: '#fff' });
    expect(f).toMatchObject({ left: 40, top: 20, width: 100, height: 50, opacity: 1, filter: 'blur(4px)' });
    expect(f.transform).toBe('rotate(15deg) scale(2, 2)');
    expect(f.vars['--tl-fill']).toBe('#fff');
  });
});

describe('timeline runtime', () => {
  let raf: Array<FrameRequestCallback>;
  let clock = 0;
  beforeEach(() => {
    raf = [];
    clock = 0;
    jest.spyOn(performance, 'now').mockImplementation(() => clock);
    (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => { raf.push(cb); return raf.length; };
    (global as any).cancelAnimationFrame = () => {};
  });
  afterEach(() => jest.restoreAllMocks());
  const step = (ms: number) => { clock += ms; const q = raf; raf = []; q.forEach((cb) => cb(clock)); };

  const layoutWith = (c: TimelineClip): any => {
    const doc = { ...createEmptyLayout(), elements: [{ id: 'el', type: 'rect', x: 0, y: 0, w: 100, h: 100, style: { fill: '#e11d2e' }, timeline: { clips: [c] } }] };
    const v = validateLayout(doc);
    if (!v.ok) throw new Error(JSON.stringify(v.errors));
    return doc;
  };

  test('an event clip rests on its first frame, then plays when the event fires', () => {
    const listeners: Record<string, Array<(e: EngineEvent) => void>> = {};
    const events: EventSource = { on: (t, l) => { (listeners[t] ||= []).push(l); return () => {}; } };
    const c = clip({ trigger: { type: 'event', event: 'kill' } });
    const { container } = render(<LayoutRenderer layout={layoutWith(c)} state={null} events={events} fit={1} />);
    const node = container.querySelector('[data-element-id="el"]') as HTMLElement;
    expect(node.style.opacity).toBe('0'); // rest pose = frame 0 ("hidden until a kill")
    act(() => { listeners.kill.forEach((l) => l({ id: 'k1', type: 'kill', timestamp: 0, sequence: 1, matchId: null, payload: {} })); });
    act(() => step(500));
    expect(node.style.left).toBe('50px');
    expect(node.style.opacity).toBe('1');
    act(() => step(600));
    expect(node.style.left).toBe('100px'); // finished: holds the last frame
  });

  test('editor scrubbing samples an exact frame', () => {
    const c = clip();
    const { container, rerender } = render(<LayoutRenderer layout={layoutWith(c)} state={null} events={null} fit={1} mode="editor" playTimelines={false} preview={{ elementId: 'el', clipId: 'c1', t: 250 }} />);
    const node = container.querySelector('[data-element-id="el"]') as HTMLElement;
    expect(node.style.left).toBe('25px');
    rerender(<LayoutRenderer layout={layoutWith(c)} state={null} events={null} fit={1} mode="editor" playTimelines={false} preview={{ elementId: 'el', clipId: 'c1', t: 750 }} />);
    expect(node.style.left).toBe('75px');
  });

  test('schema: invalid timelines are rejected', () => {
    const bad: any = { ...createEmptyLayout(), elements: [{ id: 'e', type: 'rect', x: 0, y: 0, w: 1, h: 1, timeline: { clips: [{ id: 'c', duration: 0, trigger: { type: 'event' }, tracks: [{ prop: 'zIndex', keyframes: [] }] }] } }] };
    const paths = validateLayout(bad).errors.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining([
      'elements[0].timeline.clips[0].duration',
      'elements[0].timeline.clips[0].trigger.event',
      'elements[0].timeline.clips[0].tracks[0].prop',
      'elements[0].timeline.clips[0].tracks[0].keyframes',
    ]));
  });
});
