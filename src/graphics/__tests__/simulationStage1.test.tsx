// Stage 1 of the simple Designer: the simulation shows the team count the user
// picks, Recall and +Kill play the way a live match does, and the theme parts
// (ELIMINATED / RECALLED sweeps, firing bullet) match Theme6/7 and fire per row.

import React from 'react';
import { act, render } from '@testing-library/react';
import { createEmptyLayout, normalizeLayout, validateLayout } from '../schema/layoutSchema.js';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { createOverlayEngine } from '../../overlayClient/engine.ts';
import { createSimulation, SIM_ROUND_ID, SIM_TOURNAMENT_ID } from '../editor/simulation.ts';
import { DEFAULT_OPTIONS, EFFECTS, clipToRule, ruleToClip, triggerOfClip } from '../editor/animationLibrary.ts';
import { LayoutRenderer, type ClipPlayInfo } from '../renderer/LayoutRenderer.tsx';
import { PARTS_BY_ID } from '../templates/parts.ts';
import { materialize } from '../editor/elementFactory.ts';
import { flatten } from '../editor/tree.ts';

jest.setTimeout(30000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startEngine(teamCount?: number) {
  const sim = createSimulation(undefined, teamCount ? { teamCount } : undefined);
  const engine = createOverlayEngine({ tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, matchId: null, followSelected: true, view: null }, { transport: sim.transport });
  await new Promise<void>((resolve) => {
    const un = engine.subscribe((s: any) => { if (s.matchData?.teams?.length && s.overallData && !s.status.loading) { un(); resolve(); } });
  });
  await sleep(100); // the join's live snapshot lands (it re-seeds the event detectors), as before any click in the editor
  return { sim, engine };
}

describe('simulation', () => {
  test('shows the number of teams asked for, and can change it', async () => {
    const { sim, engine } = await startEngine(1);
    expect((engine.getState() as any).matchData.teams).toHaveLength(1);
    expect(sim.controls.teamCount()).toBe(1);
    sim.controls.setTeamCount(4);
    await sleep(600); // snapshot + debounced structural refetch
    const s: any = engine.getState();
    expect(s.matchData.teams).toHaveLength(4);
    expect(s.overallData.teams).toHaveLength(4);
    engine.destroy();
  });

  test('the sample match is on Rondo, so Recall fires a real recall event', async () => {
    const { sim, engine } = await startEngine(4);
    expect(String((engine.getState() as any).match?.map)).toBe('Rondo');
    const recalls: any[] = [];
    const off = engine.on('recall', (e: any) => recalls.push(e));
    sim.controls.eliminate(1);
    await sleep(50);
    sim.controls.recall();
    await sleep(50);
    expect(recalls).toHaveLength(1);
    expect(String(recalls[0].teamId)).toMatch(/team2$/);
    off();
    engine.destroy();
  });

  test('Reset and a new team count start a fresh match: no false recalls', async () => {
    const { sim, engine } = await startEngine(4);
    const recalls: any[] = [];
    const off = engine.on('recall', (e: any) => recalls.push(e));
    sim.controls.eliminate(1);
    await sleep(50);
    sim.controls.reset();
    await sleep(600);
    sim.controls.eliminate(2);
    await sleep(50);
    sim.controls.setTeamCount(2);
    await sleep(600);
    expect(recalls).toHaveLength(0);
    expect((engine.getState() as any).matchData.teams).toHaveLength(2);
    off();
    engine.destroy();
  });

  test('+Kill knocks the victim first, then they die', async () => {
    const { sim, engine } = await startEngine(4);
    const seen: string[] = [];
    const offs = ['knock', 'playerDeath'].map((t) => engine.on(t as any, () => seen.push(t)));
    // Detectors start with the first listener: their first frame only records who is alive.
    sim.controls.setHealth(100);
    await sleep(50);
    sim.controls.kill(0);
    await sleep(50);
    expect(seen).toEqual(['knock']);
    await sleep(1100);
    expect(seen).toEqual(['knock', 'playerDeath']);
    offs.forEach((o) => o());
    engine.destroy();
  });
});

describe('"just eliminated" rule', () => {
  const host: LayoutElement = { id: 'x', type: 'rect', x: 0, y: 0, w: 100, h: 20 };

  test('builds an edge-only condition clip that validates and reads back as the same rule', () => {
    const clip = ruleToClip(host, { trigger: 'teamJustEliminated', effect: 'themeSweep', options: { ...DEFAULT_OPTIONS, hold: 1000 } }, 'c1');
    expect(clip.trigger).toEqual({ type: 'condition', when: { path: 'item.isAllDead', op: 'equals', value: true }, edge: true });
    expect(triggerOfClip(clip)?.def.id).toBe('teamJustEliminated');
    const plain = ruleToClip(host, { trigger: 'teamEliminated', effect: 'greyOut', options: DEFAULT_OPTIONS }, 'c2');
    expect(triggerOfClip(plain)?.def.id).toBe('teamEliminated');
    const doc = normalizeLayout({ ...createEmptyLayout(), elements: [{ ...host, timeline: { clips: [clip] } }] });
    expect(validateLayout(doc).errors).toEqual([]);
  });

  test('theme sweep timing: grown at 1.5s, shrinking from 2.5s, gone at 3.1s', () => {
    const built = EFFECTS.themeSweep.build(host as any, { ...DEFAULT_OPTIONS, hold: 1000 });
    expect(built.duration).toBe(3100);
    expect(built.tracks[0].keyframes.map((k) => [k.t, k.value])).toEqual([[0, 1], [1500, 0], [2500, 0], [3100, 1]]);
  });

  test('plays once when a team is wiped, not for a team already out when the overlay loads, and again after a recall', () => {
    const plays: ClipPlayInfo[] = [];
    const onClipPlay = (i: ClipPlayInfo) => plays.push(i);
    const clip = ruleToClip(host, { trigger: 'teamJustEliminated', effect: 'themeSweep', options: { ...DEFAULT_OPTIONS, hold: 1000 } }, 'c1');
    const doc = normalizeLayout({
      ...createEmptyLayout(),
      elements: [{
        id: 'rows', type: 'repeater', x: 0, y: 0, w: 200, h: 100,
        repeater: { source: 'derived.teams', limit: 4, direction: 'column', itemHeight: 20 },
        children: [{ ...host, id: 'sweep', name: 'Sweep', timeline: { clips: [clip] } }],
      }],
    }) as LayoutDocument;
    // A new matchData object each tick, as the engine publishes (the renderer keys its scope on it).
    const teams = (aDead: boolean, bDead: boolean) => ({ matchData: { teams: [] }, derived: { teams: [{ teamId: 'a', teamName: 'Alpha', players: [], isAllDead: aDead }, { teamId: 'b', teamName: 'Bravo', players: [], isAllDead: bDead }] } });
    const ui = render(<LayoutRenderer layout={doc} state={teams(false, true) as any} events={null} fit={1} onClipPlay={onClipPlay} />);
    expect(plays).toHaveLength(0); // Bravo was already out
    act(() => { ui.rerender(<LayoutRenderer layout={doc} state={teams(true, true) as any} events={null} fit={1} onClipPlay={onClipPlay} />); });
    expect(plays.map((p) => p.row)).toEqual(['#1 Alpha']);
    act(() => { ui.rerender(<LayoutRenderer layout={doc} state={teams(false, true) as any} events={null} fit={1} onClipPlay={onClipPlay} />); }); // recalled
    act(() => { ui.rerender(<LayoutRenderer layout={doc} state={teams(true, true) as any} events={null} fit={1} onClipPlay={onClipPlay} />); }); // wiped again
    expect(plays.map((p) => p.row)).toEqual(['#1 Alpha', '#1 Alpha']);
  });
});

describe('theme parts', () => {
  const build = (id: string) => materialize(PARTS_BY_ID[id].build('raw') as any, createEmptyLayout() as any) as LayoutElement;

  test('the LiveStats row is the Theme 7 row and validates', () => {
    const row = build('live-stats-row');
    expect([row.w, row.h]).toEqual([570, 50]);
    expect(validateLayout(normalizeLayout({ ...createEmptyLayout(), elements: [row] })).errors).toEqual([]);
    const names = flatten([row]).map((e) => e.el.name);
    expect(names).toEqual(expect.arrayContaining(['Rank cell', 'Tag cell', 'Stats cell', 'Firing bullet', 'Eliminated sweep', 'Recall sweep', 'Alive bars']));
  });

  test('the firing bullet is the themes’ bullet: 44px, red double glow (18 + 30), shown while firing', () => {
    const b = build('firing-bullet');
    expect([b.w, b.h, b.rotation]).toEqual([44, 44, 90]);
    expect(b.effects?.map((e: any) => [e.type, e.color, e.size])).toEqual([['outerGlow', '#ff0000', 18], ['outerGlow', '#ff0000', 30]]);
    expect(b.visibleWhen).toEqual({ path: 'item.hasFiring', op: 'equals', value: true });
  });

  test('ELIMINATED sweep uses the tournament gradient and the just-eliminated rule; RECALLED names the player', () => {
    const elim = build('eliminated-sweep');
    expect(triggerOfClip(elim.timeline!.clips[0])?.def.id).toBe('teamJustEliminated');
    const bar = elim.children!.find((c) => c.name === 'Eliminated sweep bar')!;
    expect((bar.style as any).gradient.stops.map((s: any) => s.color)).toEqual([{ ref: 'tournament.primaryColor' }, { ref: 'tournament.secondaryColor' }]);
    expect(elim.children!.find((c) => c.name === 'Eliminated sweep label')!.text).toBe('ELIMINATED');
    const recall = build('recall-sweep');
    const label = recall.children!.find((c) => c.name === 'Recall sweep label')!;
    expect(label.bind?.text).toMatchObject({ path: 'event.payload.playerName', prefix: 'RECALLED - ' });
    expect(clipToRule(label.timeline!.clips[0]).trigger?.id).toBe('teamRecall');
  });
});
