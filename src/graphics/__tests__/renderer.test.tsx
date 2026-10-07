import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { LayoutRenderer, type EventSource } from '../renderer/LayoutRenderer.tsx';
import { registerElement } from '../renderer/elements.tsx';
import { createEmptyLayout, normalizeLayout, validateLayout } from '../schema/layoutSchema.js';
import type { EngineEvent } from '../../overlayClient/engineTypes.ts';

const state: any = {
  tournament: { tournamentName: 'Parity Cup' },
  round: { apiEnable: true },
  match: { map: 'Erangel' },
  derived: {
    teams: [
      { teamId: 'a', teamName: 'Alpha', totalKills: 7, isAllDead: false },
      { teamId: 'b', teamName: 'Bravo', totalKills: 2, isAllDead: true },
    ],
  },
};

const doc = (elements: any[]) => {
  const d = normalizeLayout({ ...createEmptyLayout(), elements });
  const v = validateLayout(d);
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return d as any;
};

test('renders bound text, repeaters and conditions', () => {
  const layout = doc([
    { id: 'title', type: 'text', x: 0, y: 0, w: 400, h: 50, bind: { text: { path: 'tournament.tournamentName', format: 'upper' } } },
    {
      id: 'rows', type: 'repeater', x: 0, y: 100, w: 400, h: 200,
      repeater: { source: 'derived.teams', limit: 5, direction: 'column', itemHeight: 40 },
      children: [
        { id: 'name', type: 'text', x: 0, y: 0, w: 200, h: 40, bind: { text: { path: 'item.teamName' } } },
        { id: 'rank', type: 'text', x: 200, y: 0, w: 50, h: 40, bind: { text: { path: 'rank', format: 'ordinal' } } },
        { id: 'dead', type: 'text', x: 260, y: 0, w: 80, h: 40, text: 'OUT', visibleWhen: { path: 'item.isAllDead', op: 'equals', value: true } },
      ],
    },
  ]);
  render(<LayoutRenderer layout={layout} state={state} fit={1} />);
  expect(screen.getByText('PARITY CUP')).toBeTruthy();
  expect(screen.getByText('Alpha')).toBeTruthy();
  expect(screen.getByText('Bravo')).toBeTruthy();
  expect(screen.getByText('2nd')).toBeTruthy();
  expect(screen.getAllByText('OUT')).toHaveLength(1);
});

test('a throwing element is contained by its error boundary', () => {
  registerElement('rect', () => { throw new Error('boom'); });
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const layout = doc([
    { id: 'bad', type: 'rect', x: 0, y: 0, w: 10, h: 10 },
    { id: 'ok', type: 'text', x: 0, y: 20, w: 100, h: 20, text: 'still here' },
  ]);
  render(<LayoutRenderer layout={layout} state={state} fit={1} />);
  expect(screen.getByText('still here')).toBeTruthy();
  spy.mockRestore();
});

test('editor mode tags elements for hit testing without changing output', () => {
  const layout = doc([{ id: 'hello', type: 'text', x: 5, y: 5, w: 100, h: 20, text: 'hi' }]);
  const onDown = jest.fn();
  const { container } = render(<LayoutRenderer layout={layout} state={state} fit={1} mode="editor" onElementPointerDown={onDown} />);
  const node = container.querySelector('[data-element-id="hello"]') as HTMLElement;
  expect(node).toBeTruthy();
  expect(node.style.left).toBe('5px');
  node.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(onDown).toHaveBeenCalledWith('hello', expect.anything());
});

test('event-driven element appears when its event fires, with the event in scope', async () => {
  const listeners: Array<(e: EngineEvent) => void> = [];
  const events: EventSource = {
    on: (_type, l) => { listeners.push(l); return () => {}; },
  };
  const layout = doc([{
    id: 'elim', type: 'text', x: 0, y: 0, w: 400, h: 60,
    bind: { text: { path: 'event.payload.teamName', suffix: ' ELIMINATED' } },
    anim: { onEvent: { event: 'elimination', preset: 'slideRight', duration: 10, hold: 50 } },
  }]);
  render(<LayoutRenderer layout={layout} state={state} events={events} fit={1} />);
  expect(screen.queryByText(/ELIMINATED/)).toBeNull();
  await act(async () => {
    listeners.forEach((l) => l({ id: 'm1:elim:b', type: 'elimination', timestamp: 0, sequence: 1, matchId: 'm1', payload: { teamName: 'Bravo' } }));
  });
  expect(screen.getByText('Bravo ELIMINATED')).toBeTruthy();
});
