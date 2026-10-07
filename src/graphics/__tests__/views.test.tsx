// templates/views.ts: the overlay types that had no editable version. Each
// is drawn on simulation data and must fill its layers from real values, and
// together with the other templates every DisplayHud view must have one.

import React from 'react';
import { render } from '@testing-library/react';
import { VIEW_TEMPLATES, VIEW_TEMPLATE_SLOTS } from '../templates/views.ts';
import { TEMPLATES } from '../templates/index.ts';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { createEmptyLayout } from '../schema/layoutSchema.js';
import { createOverlayEngine } from '../../overlayClient/engine.ts';
import { createSimulation, SIM_ROUND_ID, SIM_TOURNAMENT_ID } from '../editor/simulation.ts';
import { buildGallery } from '../editor/templateCatalog.ts';
import { VIEW_GROUPS } from '../../dashboard/overlayViews.ts';

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

const draw = (id: string) => {
  const layout = { ...createEmptyLayout(), elements: VIEW_TEMPLATES.find((t) => t.id === id)!.elements } as any;
  return render(<LayoutRenderer layout={layout} state={state} events={null} fit={1} mode="editor" playTimelines={false} />).container;
};
const texts = (c: HTMLElement, id: string) => Array.from(c.querySelectorAll(`[data-element-id$="${id}"]`)).map((n) => (n.textContent || '').trim());

test('every DisplayHud view has a template made of editable layers', () => {
  const gallery = buildGallery(TEMPLATES, []);
  const covered = new Set(gallery.flatMap((c) => c.items.map((i) => i.viewKey)));
  const missing = VIEW_GROUPS.filter((g) => g.id !== 'schedule').flatMap((g) => g.views.map((v) => v.key)).filter((k) => !covered.has(k));
  expect(missing).toEqual([]);
  expect(Object.keys(VIEW_TEMPLATE_SLOTS).sort()).toEqual(VIEW_TEMPLATES.map((t) => t.id).sort());
});

test('no layer in a template is a hand-coded built-in', () => {
  expect(JSON.stringify(VIEW_TEMPLATES)).not.toContain('"builtin"');
});

test('tables and card lists fill a row per team or player', () => {
  const md = draw('vw-match-data');
  expect(texts(md, 'vmd_team').length).toBeGreaterThan(4);
  expect(texts(md, 'vmd_rank')[0]).toBe('1');
  expect(texts(md, 'vmd_team')[0]).toBe(String(state.derived.matchStandings[0].teamName).toUpperCase());
  expect(texts(md, 'vmd_total').every((t) => /^\d+$/.test(t))).toBe(true);

  expect(texts(draw('vw-overall-frags'), 'vof_name').length).toBeGreaterThan(4);
  expect(texts(draw('vw-player-summary'), 'vps_name')).toHaveLength(4);
  expect(texts(draw('vw-highlight-points'), 'vhp_team')).toHaveLength(3);
  expect(texts(draw('vw-slots'), 'vsl_team').length).toBe(Math.min(24, state.matchData.teams.length));
  for (const [id, prefix] of [['vw-roster-showcase', 'vrs'], ['vw-player-switch', 'vpw']] as const) {
    const c = draw(id);
    expect(texts(c, `${prefix}_team`).length).toBeGreaterThan(3);
    expect(texts(c, `${prefix}_pname`).every((t) => t.length > 0)).toBe(true);
  }
});

test('single-subject screens read the right team or player', () => {
  const upper = (v: unknown) => String(v).toUpperCase();
  const standings = state.derived.overallStandings;
  expect(texts(draw('vw-champions'), 'vch_team')).toEqual([upper(standings[0].teamName)]);
  expect(texts(draw('vw-first-runner-up'), 'vr1_team')).toEqual([upper(standings[1].teamName)]);
  expect(texts(draw('vw-second-runner-up'), 'vr2_team')).toEqual([upper(standings[2].teamName)]);
  expect(texts(draw('vw-event-mvp'), 'vem_name')).toEqual([upper(state.derived.fraggers[0].playerName)]);

  const h2h = draw('vw-player-h2h');
  expect(texts(h2h, 'vph_name0')).toEqual([upper(state.derived.matchFraggers[0].playerName)]);
  expect(texts(h2h, 'vph_name1')).toEqual([upper(state.derived.matchFraggers[1].playerName)]);
  expect(texts(h2h, 'vph_a0')[0]).toMatch(/^[\d,]+$/);
  const teams = draw('vw-team-h2h');
  expect(texts(teams, 'vth_name0')).toEqual([upper(state.derived.matchStandings[0].teamName)]);
  expect(texts(teams, 'vth_name1')).toEqual([upper(state.derived.matchStandings[1].teamName)]);

  const summary = draw('vw-match-summary');
  expect(texts(summary, 'vms_el_v')[0]).toMatch(/^[1-9][\d,]*$/);
  expect(texts(summary, 'vms_win_name')).toEqual([upper(state.derived.matchStandings[0].teamName)]);

  const winner = draw('vw-wwcd-stats');
  expect(texts(winner, 'vws_team')).toEqual([upper(state.derived.matchStandings[0].teamName)]);
  expect(texts(winner, 'vws_pname').length).toBeGreaterThan(0);

  expect(texts(draw('vw-up-next'), 'vun_match')[0]).toMatch(/^MATCH \d+$/);
});
