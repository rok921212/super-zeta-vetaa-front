// The observer Team Slots panel (DisplayHud → Observer → Team Slots): which
// teams it marks as fighting, from successive ticks of the live feed.

import React from 'react';
import { act, render } from '@testing-library/react';
import TeamSlotsObserver from '../TeamSlotsObserver.tsx';

const player = (uId: string, over: Record<string, unknown> = {}) => ({
  _id: uId, uId, playerName: `P${uId}`, killNum: 0, damage: 0, health: 100, healthMax: 100, liveState: 0, bHasDied: false, isFiring: false, ...over,
});
const team = (slot: number, players: any[], over: Record<string, unknown> = {}) => ({
  _id: `t${slot}`, teamId: `t${slot}`, slot, teamName: `Team ${slot}`, teamTag: `T${slot}`, teamLogo: '', placePoints: 0, players, ...over,
});
/** A fresh match-data object, the way every feed tick hands the page a new one. */
const match = (teams: any[]) => ({ _id: 'md1', matchId: 'm1', userId: 'u1', teams });
const quiet = () => [team(1, [player('11'), player('12')]), team(2, [player('21'), player('22')]), team(3, [player('31'), player('32')])];

const fightingTags = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('div')).filter((d) => d.textContent === 'FIGHTING').map((d) => d.parentElement!.textContent!.match(/T\d/)![0]);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const setup = () => {
  const view = render(<TeamSlotsObserver round={{ apiEnable: true }} matchData={match(quiet()) as any} />);
  const tick = (teams: any[]) => act(() => { view.rerender(<TeamSlotsObserver round={{ apiEnable: true }} matchData={match(teams) as any} />); });
  return { ...view, tick };
};

test('every team is a card in slot order, none fighting at rest', () => {
  const { container } = setup();
  expect(container.textContent).toContain('T1');
  expect(container.textContent!.indexOf('T1')).toBeLessThan(container.textContent!.indexOf('T3'));
  expect(fightingTags(container)).toEqual([]);
});

test('a team is fighting while one of its players fires', () => {
  const { container, tick } = setup();
  const teams = quiet();
  teams[1].players[0] = player('21', { isFiring: true });
  tick(teams);
  expect(fightingTags(container)).toEqual(['T2']);
});

test('dealing damage, scoring a kill, or losing a player each count as a fight', () => {
  const { container, tick } = setup();
  let teams = quiet();
  teams[0].players[0] = player('11', { damage: 40 });
  tick(teams);
  expect(fightingTags(container)).toEqual(['T1']);

  teams = quiet();
  teams[0].players[0] = player('11', { damage: 40 });
  teams[2].players[1] = player('32', { liveState: 4, health: 100 });
  tick(teams);
  expect(fightingTags(container).sort()).toEqual(['T1', 'T3']);
});

test('losing health outside the zone is not a fight; inside it is', () => {
  const { container, tick } = setup();
  let teams = quiet();
  teams[0].players[0] = player('11', { health: 80, isOutsideBlueCircle: true });
  tick(teams);
  expect(fightingTags(container)).toEqual([]);
  teams = quiet();
  teams[1].players[0] = player('21', { health: 60 });
  tick(teams);
  expect(fightingTags(container)).toEqual(['T2']);
});

test('the mark holds for five seconds after the last sign, then clears by itself', () => {
  const { container, tick } = setup();
  const teams = quiet();
  teams[1].players[0] = player('21', { isFiring: true });
  tick(teams);
  tick(quiet().map((t, i) => (i === 1 ? team(2, [player('21'), player('22')]) : t)));
  act(() => { jest.advanceTimersByTime(4000); });
  expect(fightingTags(container)).toEqual(['T2']);
  act(() => { jest.advanceTimersByTime(1500); });
  expect(fightingTags(container)).toEqual([]);
});

test('a wiped team is never shown as fighting', () => {
  const { container, tick } = setup();
  const teams = quiet();
  teams[0].players = [player('11', { bHasDied: true, liveState: 5, health: 0 }), player('12', { bHasDied: true, liveState: 5, health: 0 })];
  tick(teams);
  expect(fightingTags(container)).toEqual([]);
  expect(container.textContent).toContain('eliminated');
});
