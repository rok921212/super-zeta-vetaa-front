// The Smash Point bar every theme's LiveStats and LiveData share: when it
// shows, what it shows, and that a re-sent match (a heartbeat or a reconnect)
// does not replay its animation.

import React from 'react';
import { render } from '@testing-library/react';
import SmashPointBar, { smashPointOf } from '../SmashPointBar.tsx';

const tournament = { primaryColor: '#112233', secondaryColor: '#445566' };
const match = (smashPoint: unknown) => ({ _id: 'm1', matchNo: 3, smashPoint });
const bar = (c: HTMLElement) => c.querySelector('[data-testid="smash-point-bar"]') as HTMLElement | null;

test('no Smash Point, or a blank one, renders nothing (no empty gap)', () => {
  for (const sp of [undefined, null, { enabled: true, value: '' }, { enabled: true, value: '   ' }]) {
    const { container, unmount } = render(<SmashPointBar match={match(sp)} tournament={tournament} />);
    expect(container.innerHTML).toBe('');
    unmount();
  }
  expect(render(<SmashPointBar match={null} />).container.innerHTML).toBe('');
});

test('switched off hides the bar but keeps the value', () => {
  const { container } = render(<SmashPointBar match={match({ enabled: false, value: '80 PTS' })} tournament={tournament} />);
  expect(bar(container)).toBeNull();
  expect(smashPointOf(match({ enabled: false, value: '80 PTS' }))).toEqual({ visible: false, label: 'SMASH POINT', value: '80 PTS' });
});

test('a set value shows with the default or custom label', () => {
  const { container, rerender } = render(<SmashPointBar match={match({ enabled: true, value: 80 })} tournament={tournament} />);
  const el = bar(container)!;
  expect(el.textContent).toBe('SMASH POINT80');
  expect(el.getAttribute('aria-label')).toBe('SMASH POINT: 80');
  // (Colours are not checked: jsdom drops linear-gradient backgrounds.)
  rerender(<SmashPointBar match={match({ enabled: true, value: '80', displayText: 'MATCH POINT' })} tournament={tournament} />);
  expect(bar(container)!.textContent).toBe('MATCH POINT80');
});

test('LiveStats and LiveData read the same value from the same match', () => {
  const m = match({ enabled: true, value: '75' });
  const a = render(<SmashPointBar match={m} tournament={tournament} height={40} />);
  const b = render(<SmashPointBar match={m} tournament={tournament} height={38} />);
  expect(bar(a.container)!.textContent).toBe(bar(b.container)!.textContent);
});

test('an edited value pulses the value; a re-sent identical match (heartbeat, reconnect) does not', () => {
  const { container, rerender } = render(<SmashPointBar match={match({ enabled: true, value: '80' })} tournament={tournament} />);
  const valueSpan = () => bar(container)!.querySelector('span')!;
  expect(valueSpan().className).toBe('');

  // Same value in a new match object, as every bulk refetch delivers it.
  rerender(<SmashPointBar match={match({ enabled: true, value: '80' })} tournament={tournament} />);
  expect(valueSpan().className).toBe('');
  const entered = bar(container);

  rerender(<SmashPointBar match={match({ enabled: true, value: '90' })} tournament={tournament} />);
  expect(valueSpan().className).toBe('ss-smash-pulse');
  expect(valueSpan().textContent).toBe('90');
  expect(bar(container)).toBe(entered); // the bar itself stays mounted: no second entrance
});

test('clearing it removes the bar', () => {
  const { container, rerender } = render(<SmashPointBar match={match({ enabled: true, value: '80' })} tournament={tournament} />);
  rerender(<SmashPointBar match={match({ enabled: false, value: '', displayText: '' })} tournament={tournament} />);
  expect(container.innerHTML).toBe('');
});
