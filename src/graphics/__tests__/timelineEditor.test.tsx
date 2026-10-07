import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import {
  CLIP_PRESETS, addClip, animToClip, deleteKeyframe, moveKeyframe, presetClip, setKeyframe, upsertKeyframe,
} from '../editor/timelineOps.ts';
import { TimelinePanel, type TimelineUiState } from '../editor/TimelinePanel.tsx';
import { buildScope } from '../bindings/index.ts';

jest.mock('../../login/api.tsx', () => ({ __esModule: true, default: { get: jest.fn(async () => ({ data: [] })) }, DEFAULT_BACKEND: '' }));

const rect = (over: Partial<LayoutElement> = {}): LayoutElement => ({ id: 'r', type: 'rect', name: 'Box', x: 100, y: 50, w: 200, h: 100, ...over });

describe('timeline ops', () => {
  test('every preset builds a valid clip', () => {
    for (const p of CLIP_PRESETS) {
      const el = addClip(rect(), presetClip(p.id, rect(), 'c1', 'recall'));
      const v = validateLayout({ ...createEmptyLayout(), elements: [el] });
      expect(v.errors).toEqual([]);
    }
  });

  test('upsert / move / edit / delete keyframes; last keyframe removal drops the track', () => {
    let el = addClip(rect(), presetClip('blank', rect(), 'c1'));
    el = upsertKeyframe(el, 'c1', 'x', 0, 100);
    el = upsertKeyframe(el, 'c1', 'x', 500, 300, 'easeOut');
    el = upsertKeyframe(el, 'c1', 'x', 500, 350); // replace, keeps ease
    let tr = el.timeline!.clips[0].tracks[0];
    expect(tr.keyframes).toEqual([{ t: 0, value: 100 }, { t: 500, value: 350, ease: 'easeOut' }]);
    el = upsertKeyframe(el, 'c1', 'opacity', 2000, 0.5); // beyond duration -> extends it
    expect(el.timeline!.clips[0].duration).toBe(2000);
    el = moveKeyframe(el, 'c1', 'x', 500, 800);
    el = setKeyframe(el, 'c1', 'x', 800, { value: { bind: { path: 'live.aliveTeamsCount' } }, ease: null });
    tr = el.timeline!.clips[0].tracks[0];
    expect(tr.keyframes[1]).toEqual({ t: 800, value: { bind: { path: 'live.aliveTeamsCount' } } });
    el = deleteKeyframe(el, 'c1', 'opacity', 2000);
    expect(el.timeline!.clips[0].tracks.map((t) => t.prop)).toEqual(['x']);
    expect(validateLayout({ ...createEmptyLayout(), elements: [el] }).ok).toBe(true);
  });

  test('legacy enter / onEvent presets convert to editable clips', () => {
    const enter = animToClip(rect({ anim: { enter: { preset: 'slideLeft', duration: 400 } } }), 'c1')!;
    expect(enter.trigger).toEqual({ type: 'enter' });
    expect(enter.tracks.find((t) => t.prop === 'x')!.keyframes).toEqual([{ t: 0, value: 300, ease: 'easeOut' }, { t: 400, value: 100 }]);
    const ev = animToClip(rect({ anim: { onEvent: { event: 'recall', preset: 'pop', duration: 300, hold: 2000 } } }), 'c2')!;
    expect(ev.trigger).toMatchObject({ type: 'event', event: 'recall' });
    expect(ev.duration).toBe(2600);
    expect(ev.tracks.find((t) => t.prop === 'opacity')!.keyframes.map((k) => k.value)).toEqual([0, 1, 1, 0]);
  });
});

function Harness({ initial }: { initial: LayoutDocument }) {
  const [doc, setDoc] = useState(initial);
  const [ui, setUi] = useState<TimelineUiState>({ clipId: null, playhead: 0, recording: false });
  return (
    <TimelinePanel
      doc={doc}
      selectedId="r"
      exec={(cmd) => { if (cmd) setDoc((d) => cmd.apply(d)); }}
      scope={buildScope(null, doc)}
      sim={null}
      ui={ui}
      setUi={(p) => setUi((s) => ({ ...s, ...p }))}
      onPreviewChange={() => {}}
    />
  );
}

test('panel: add a preset clip, add a keyframe at the playhead, delete it', () => {
  render(<Harness initial={{ ...createEmptyLayout(), elements: [rect()] } as any} />);
  const panel = screen.getByTestId('timeline-panel');
  expect(within(panel).getByText(/No clips on this layer/)).toBeInTheDocument();
  const newClip = within(panel).getAllByRole('combobox').find((s) => (s as HTMLSelectElement).options[0]?.text === '+ New clip…')!;
  fireEvent.change(newClip, { target: { value: 'popOnEvent' } });
  expect(within(panel).getAllByDisplayValue('Pop on kill').length).toBeGreaterThan(0);
  expect(panel.querySelectorAll('[data-keyframe^="opacity@"]').length).toBe(4);

  // new track at the playhead
  const addProp = within(panel).getAllByRole('combobox').find((s) => (s as HTMLSelectElement).options[0]?.text === '+ Add property…')!;
  fireEvent.change(addProp, { target: { value: 'rotation' } });
  expect(panel.querySelector('[data-keyframe="rotation@0"]')).toBeTruthy();

  // select a keyframe and delete it with the keyboard
  fireEvent.pointerDown(panel.querySelector('[data-keyframe="rotation@0"]')!);
  fireEvent.pointerUp(window);
  expect(within(panel).getByText(/Rotation @ 0.00s/)).toBeInTheDocument();
  fireEvent.keyDown(panel, { key: 'Delete' });
  expect(panel.querySelector('[data-keyframe="rotation@0"]')).toBeNull();
});
