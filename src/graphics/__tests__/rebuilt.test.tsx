// The 12 editable rebuilds of the built-in theme graphics: valid, and bound to
// real engine data (run against the simulation), with their motion as
// timeline clips.

import React from 'react';
import { act, render } from '@testing-library/react';
import { REBUILT_TEMPLATES } from '../templates/rebuilt.ts';
import { TEMPLATES } from '../templates/index.ts';
import { LayoutRenderer, type EventSource } from '../renderer/LayoutRenderer.tsx';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
import { createOverlayEngine } from '../../overlayClient/engine.ts';
import { createSimulation, SIM_ROUND_ID, SIM_TOURNAMENT_ID } from '../editor/simulation.ts';
import { cloneWithNewIds } from '../editor/ids.ts';
import type { EngineEvent } from '../../overlayClient/engineTypes.ts';

jest.setTimeout(60000);

let state: any = null;
beforeAll(async () => {
  const sim = createSimulation();
  const engine = createOverlayEngine({ tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, matchId: null, followSelected: true, view: null }, { transport: sim.transport });
  await new Promise<void>((resolve) => {
    const un = engine.subscribe((s: any) => { if (s.matchData?.teams?.length && s.overallData && !s.status.loading) { un(); resolve(); } });
  });
  sim.controls.kill(0);
  sim.controls.kill(0);
  sim.controls.kill(1);
  await new Promise((r) => setTimeout(r, 30));
  state = engine.getState();
  engine.destroy();
});

const layoutOf = (els: any[]) => ({ ...createEmptyLayout(), elements: cloneWithNewIds(els, []) }) as any;
const textOf = (c: HTMLElement, id: string) => (c.querySelector(`[data-element-id$="${id}"]`)?.textContent || '').trim();

test('14 rebuilds, all valid, all timeline-animated, registered after the starters', () => {
  expect(REBUILT_TEMPLATES).toHaveLength(14);
  // 8 starters, 14 rebuilds, 16 more overlay types (templates/views.ts), 5 desktop tools (templates/desktop.ts).
  expect(TEMPLATES.length).toBe(8 + 14 + 16 + 5);
  for (const t of REBUILT_TEMPLATES) {
    const v = validateLayout({ ...createEmptyLayout(), elements: t.elements });
    expect({ id: t.id, errors: v.errors }).toEqual({ id: t.id, errors: [] });
    expect(t.source).toMatch(/^Theme\d · /);
    expect(JSON.stringify(t.elements)).toContain('"timeline"');
  }
});

test('data-bound rebuilds show real simulation values', () => {
  const byId = Object.fromEntries(REBUILT_TEMPLATES.map((t) => [t.id, t]));
  const check = (tplId: string, expectations: Array<[string, RegExp]>) => {
    // Render with the ORIGINAL ids so the checks can find elements.
    const layout = { ...createEmptyLayout(), elements: byId[tplId].elements } as any;
    const { container, unmount } = render(<LayoutRenderer layout={layout} state={state} events={null} fit={1} mode="editor" playTimelines={false} />);
    for (const [id, re] of expectations) expect({ tpl: tplId, id, text: textOf(container, id) }).toEqual({ tpl: tplId, id, text: expect.stringMatching(re) });
    unmount();
  };
  check('rb-lower-third', [['rlt_title', /SCORESYNC INVITATIONAL/], ['rlt_round', /GRAND FINALS/], ['rlt_match', /^MATCH \d/]]);
  check('rb-upper-third', [['rut_teams_v', /^\d+$/], ['rut_players_v', /^\d+$/], ['rut_kills_v', /^[1-9]\d*$/]]);
  check('rb-dominator', [['rdm_name', /\S/], ['rdm_kills', /^[1-9]/]]);
  check('rb-overall', [['ros_title', /OVERALL STANDINGS/]]);
  check('rb-mvp', [['rmv_name', /\S/], ['rmv_label', /MATCH MVP/]]);
});

test('event-driven rebuild (elimination) fills from the live event', () => {
  const tpl = REBUILT_TEMPLATES.find((t) => t.id === 'rb-elimination')!;
  const listeners: Record<string, Array<(e: EngineEvent) => void>> = {};
  const events: EventSource = { on: (type, l) => { (listeners[type] ||= []).push(l); return () => {}; } };
  const { container } = render(<LayoutRenderer layout={layoutOf(tpl.elements)} state={state} events={events} fit={1} />);
  act(() => { (listeners.elimination || []).forEach((l) => l({ id: 'e1', type: 'elimination', timestamp: 0, sequence: 1, matchId: null, payload: { teamName: 'Crimson Tide', teamTag: 'CT', totalKills: 6, rank: 12 } })); });
  expect(container.textContent).toContain('CRIMSON TIDE');
  expect(container.textContent).toContain('12th PLACE');
});
