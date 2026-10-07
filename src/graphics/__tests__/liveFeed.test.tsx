import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { computeLive, feedReducer, EMPTY_FEED, FEED_LIMIT, buildScope, resolvePath } from '../bindings/index.ts';
import { LayoutRenderer, type EventSource } from '../renderer/LayoutRenderer.tsx';
import { createEmptyLayout, validateLayout, isSafePath } from '../schema/layoutSchema.js';
import type { EngineEvent } from '../../overlayClient/engineTypes.ts';

const player = (name: string, kills: number, dead = false, health = dead ? 0 : 100) => ({ playerName: name, killNum: kills, damage: kills * 100, health, healthMax: 100, liveState: dead ? 5 : 0, bHasDied: dead });
const state: any = {
  match: { map: 'Rondo', matchNo: 3 },
  round: { apiEnable: true },
  deadTeamList: [{ teamId: 'b', teamName: 'Bravo' }],
  derived: {
    teams: [
      { teamId: 'a', teamTag: 'AA', teamName: 'Alpha', totalKills: 7, aliveCount: 2, isAllDead: false, teamRank: 1, players: [player('A1', 5), player('A2', 2, false, 50), player('A3', 0, true)] },
      { teamId: 'b', teamTag: 'BB', teamName: 'Bravo', totalKills: 1, aliveCount: 0, isAllDead: true, isEliminationLocked: true, teamRank: 2, players: [player('B1', 1, true)] },
    ],
  },
};

test('live.* mirrors the themes: alive counts, kill leader, recall map, last eliminated', () => {
  const live = computeLive(state);
  expect(live.isRecallMap).toBe(true);
  expect(live.aliveTeamsCount).toBe(1);
  expect(live.deadTeamsCount).toBe(1);
  expect(live.alivePlayersCount).toBe(2);
  expect(live.totalKills).toBe(8);
  expect(live.killLeader?.playerName).toBe('A1');
  expect(live.lastEliminated?.teamName).toBe('Bravo');
  expect(live.aliveTeams[0].health).toBe(75); // mean of alive players' health %
  expect(live.aliveTeams[0].wwcdChance).toBe(38); // (100+50+0)/4 with apiEnable
  expect(computeLive(state)).toBe(live); // memoised on identity
  expect(computeLive(null).aliveTeamsCount).toBe(0);
});

test('feed reducer: newest first, per type, capped, deduped; milestone kind kept', () => {
  let f = EMPTY_FEED;
  for (let i = 0; i < FEED_LIMIT + 5; i++) f = feedReducer(f, { id: `k${i}`, type: 'kill', timestamp: i, payload: { player: { playerName: `P${i}` } } });
  expect(f.kills).toHaveLength(FEED_LIMIT);
  expect(f.kills[0].player.playerName).toBe(`P${FEED_LIMIT + 4}`);
  expect(feedReducer(f, { id: `k${FEED_LIMIT + 4}`, type: 'kill', payload: {} })).toBe(f);
  f = feedReducer(f, { id: 'm1', type: 'milestone', payload: { type: 'firstBlood', value: 1 } });
  expect(f.milestones[0]).toMatchObject({ kind: 'firstBlood', type: 'milestone' });
  expect(f.last.id).toBe('m1');
  expect(feedReducer(f, { id: 'x', type: 'bulkApplied', payload: {} })).toBe(f);
});

test('live / feed are safe binding roots and repeater sources', () => {
  expect(isSafePath('live.killLeader.playerName')).toBe(true);
  expect(isSafePath('feed.kills[0].player.playerName')).toBe(true);
  const scope = buildScope(state, createEmptyLayout() as any);
  expect(resolvePath(scope, 'live.aliveTeamsCount')).toBe(1);
  const doc = { ...createEmptyLayout(), elements: [{ id: 'r', type: 'repeater', x: 0, y: 0, w: 100, h: 100, repeater: { source: 'feed.kills', limit: 5, direction: 'column' }, children: [] }] };
  expect(validateLayout(doc).ok).toBe(true);
});

test('renderer: feed.* fills from live engine events (kill feed)', () => {
  const listeners: Array<(e: EngineEvent) => void> = [];
  const events: EventSource = { on: (_t, l) => { listeners.push(l); return () => {}; } };
  const layout: any = {
    ...createEmptyLayout(),
    elements: [{ id: 'last', type: 'text', x: 0, y: 0, w: 300, h: 40, bind: { text: { path: 'feed.kills[0].player.playerName', fallback: 'none' } } }],
  };
  render(<LayoutRenderer layout={layout} state={state} events={events} fit={1} />);
  expect(screen.getByText('none')).toBeInTheDocument();
  act(() => { listeners.forEach((l) => l({ id: 'k1', type: 'kill', timestamp: 1, sequence: 1, matchId: null, payload: { player: { playerName: 'Sniper' } } })); });
  expect(screen.getByText('Sniper')).toBeInTheDocument();
});
