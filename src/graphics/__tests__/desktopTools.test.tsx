// The desktop app's tools as Designer layouts: the local.* data they bind to
// (bindings/local.ts), the `map` element, and the five templates drawn the
// way the desktop app draws them (runtime mode, real local data, no engine).

import React from 'react';
import { render } from '@testing-library/react';
import { DESKTOP_TEMPLATES } from '../templates/desktop.ts';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
import { buildLocal, EMPTY_LOCAL, MAP_UNITS, SAMPLE_LOCAL } from '../bindings/local.ts';

const textOf = (c: HTMLElement, id: string) => (c.querySelector(`[data-element-id$="${id}"]`)?.textContent || '').trim();
const layoutOf = (id: string) => ({ ...createEmptyLayout(), elements: DESKTOP_TEMPLATES.find((t) => t.id === id)!.elements }) as any;

const roster = {
  teams: [
    { teamId: 'a', slot: 3, teamName: 'Alpha Wolves', teamTag: 'AW', teamLogo: '/aw.png', players: [{ uId: '11', playerName: 'Ace' }, { uId: '12', playerName: 'Bolt' }] },
    { teamId: 'b', slot: 1, teamName: 'Bravo Six', teamTag: 'B6', players: [{ uId: 21, playerName: 'Cruz' }] },
  ],
};
const feed = [
  { uId: 11, teamId: 3, health: 80, healthMax: 100, liveState: 0, killNum: 2, location: { x: MAP_UNITS / 2, y: MAP_UNITS / 4, z: 0 } },
  { uId: '12', teamId: 3, health: 20, healthMax: 100, liveState: 4, killNum: 1, location: { x: 1000, y: 2000, z: 0 } },
  { uId: '21', teamId: 1, health: 0, liveState: 5, bHasDied: true, killNum: 0, location: { x: 0, y: 0, z: 0 } },
  { uId: '99', teamId: 7, playerName: 'Stray', teamName: 'Unlisted', health: 100, liveState: 0, killNum: 4, location: { x: 5000, y: 5000, z: 0 } },
];

describe('local game data', () => {
  const local = buildLocal({
    matchData: roster, players: feed, observedUid: 12, map: 'Miramar',
    globalInfo: { CircleArray: [{ X: '409600', Y: '409600', Size: '409600' }, { X: '204800', Y: '409600', Size: '204800' }] },
    circle: { CircleIndex: '1', CircleStatus: '2', Counter: '30', MaxTime: '120' },
  });

  it('joins the roster with the feed by player id, in slot order', () => {
    expect(local.teams.map((t) => t.teamTag)).toEqual(['B6', 'AW', 'Unlisted']);
    const ace = local.players.find((p) => p.uId === '11')!;
    expect(ace).toMatchObject({ playerName: 'Ace', teamName: 'Alpha Wolves', teamLogo: '/aw.png', slot: 3, healthPct: 80, killNum: 2, state: 'alive', x: 0.5, y: 0.25, hasPosition: true });
    expect(ace.color).toBe(local.teams[1].color);
  });

  it('knows who is knocked, dead, wiped and on screen', () => {
    const [bravo, alpha] = local.teams;
    expect(alpha).toMatchObject({ alive: 2, knocked: 1, dead: 0, kills: 3, eliminated: false, observed: true });
    expect(bravo).toMatchObject({ alive: 0, dead: 1, eliminated: true, observed: false });
    expect(local.observed).toMatchObject({ playerName: 'Bolt', knocked: true, state: 'knocked', observed: true });
    expect(local.observedTeam!.teamName).toBe('Alpha Wolves');
    // A dead player at 0,0 has no place on the map.
    expect(local.players.find((p) => p.uId === '21')!.hasPosition).toBe(false);
    expect(local.counts).toEqual({ alivePlayers: 3, aliveTeams: 2, kills: 7, players: 4, teams: 3 });
    expect(local.map).toBe('miramar');
  });

  it('keeps feed players the roster does not have', () => {
    expect(local.teams[2]).toMatchObject({ teamId: '7', teamName: 'Unlisted', alive: 1 });
    expect(local.teams[2].players[0].playerName).toBe('Stray');
  });

  it('moves the zone from the last circle to the next while it closes', () => {
    // A quarter of the way from circle 0 to circle 1.
    expect(local.zone).toMatchObject({ known: true, status: 'move', moving: true, index: 1, timeLeft: 90, total: 120, progress: 0.25, hasNext: true });
    expect(local.zone.x).toBeCloseTo(0.5 - 0.25 * 0.25);
    expect(local.zone.r).toBeCloseTo(0.5 - 0.25 * 0.25);
    expect(local.zone.nextR).toBeCloseTo(0.25);
    // Waiting: the boundary sits on the last circle.
    const waiting = buildLocal({ globalInfo: { CircleArray: [{ X: 409600, Y: 409600, Size: 409600 }, { X: 204800, Y: 409600, Size: 204800 }] }, circle: { CircleIndex: 1, CircleStatus: 0, Counter: 30, MaxTime: 120 } });
    expect(waiting.zone).toMatchObject({ status: 'wait', moving: false, r: 0.5, statusLabel: 'Zone holds' });
  });

  it('is empty, not broken, with nothing to read', () => {
    expect(buildLocal({})).toEqual(EMPTY_LOCAL);
  });
});

describe('desktop tool templates', () => {
  it.each(DESKTOP_TEMPLATES.map((t) => [t.id, t] as const))('%s is a valid layout', (_id, t) => {
    expect(validateLayout({ ...createEmptyLayout(), elements: t.elements }).errors).toEqual([]);
  });

  const draw = (id: string, local: any, mode: 'runtime' | 'editor' = 'runtime') =>
    render(<LayoutRenderer layout={layoutOf(id)} state={local ? { local } : null} events={null} fit={1} mode={mode} playTimelines={false} />);

  it('observing player follows the player on screen', () => {
    const { container } = draw('dt-observing', SAMPLE_LOCAL);
    expect(textOf(container, 'dto_name')).toBe(SAMPLE_LOCAL.observed!.playerName.toUpperCase());
    expect(textOf(container, 'dto_team')).toBe(SAMPLE_LOCAL.observedTeam!.teamName.toUpperCase());
    expect(textOf(container, 'dto_kills')).toMatch(/^\d+ KILLS$/);
    // The four teammates, each with a name.
    expect(container.querySelectorAll('[data-element-id$="dto_mate_name"]')).toHaveLength(4);
  });

  it('observing player is hidden when nobody is on screen', () => {
    const { container } = draw('dt-observing', { ...SAMPLE_LOCAL, observed: null, observedTeam: null });
    expect(container.querySelector('[data-element-id$="dto_name"]')).toBeNull();
  });

  it('battle bar and team slots list every team with its numbers', () => {
    const bar = draw('dt-battle-bar', SAMPLE_LOCAL).container;
    expect(Array.from(bar.querySelectorAll('[data-element-id$="dtb_tag"]')).map((n) => n.textContent)).toEqual(SAMPLE_LOCAL.teams.map((t) => t.teamTag.toUpperCase()));
    expect(bar.querySelectorAll('[data-element-id$="dtb_pips_pip"]')).toHaveLength(SAMPLE_LOCAL.players.length);
    const slots = draw('dt-team-slots', SAMPLE_LOCAL).container;
    expect(slots.querySelectorAll('[data-element-id$="dts_p_name"]')).toHaveLength(SAMPLE_LOCAL.players.length);
    expect(textOf(slots, 'dts_slot')).toBe('01');
  });

  it('zone timer shows the phase and the time left', () => {
    const { container } = draw('dt-map-timer', SAMPLE_LOCAL);
    expect(textOf(container, 'dtt_zone_status')).toBe('ZONE CLOSING');
    expect(textOf(container, 'dtt_zone_time')).toBe('01:20');
    expect(textOf(container, 'dtt_zone_no')).toBe('CIRCLE 2');
  });

  it('map draws a dot for every living player with a position, and the zone', () => {
    const { container } = draw('dt-map', SAMPLE_LOCAL);
    const map = container.querySelector('[data-element-id$="dtm_map"]')!;
    const dots = map.querySelectorAll('div[style*="border-radius: 50%"]');
    expect(dots).toHaveLength(SAMPLE_LOCAL.players.filter((p) => p.hasPosition && !p.dead).length);
    expect(map.querySelectorAll('svg circle')).toHaveLength(2);
    expect(textOf(container, 'dtm_players_n')).toBe(String(SAMPLE_LOCAL.counts.alivePlayers));
  });

  it('the Designer shows sample players; a published page without a local feed shows none', () => {
    const editor = draw('dt-battle-bar', null, 'editor').container;
    expect(editor.querySelectorAll('[data-element-id$="dtb_tag"]').length).toBe(SAMPLE_LOCAL.teams.length);
    const published = draw('dt-battle-bar', null).container;
    expect(published.querySelectorAll('[data-element-id$="dtb_tag"]')).toHaveLength(0);
  });
});
