// Every editable template only reads data the engine really provides: each
// path it needs (templates/requirements.ts) is looked up in the simulation's
// engine state, the same shape the live engine produces. A path that is
// missing (a typo, a renamed field) or not allowed fails here before a user
// ever sees a blank layer. Plus the style kits.

import { TEMPLATES } from '../templates/index.ts';
import { requirementsOf, requirementsSummary } from '../templates/requirements.ts';
import { STYLE_KITS, themeFromTournament, themeWithKit } from '../templates/styleKits.ts';
import { BUILTIN_FONTS } from '../renderer/fonts.ts';
import { buildScope, explainBinding, resolvePath } from '../bindings/index.ts';
import { createEmptyLayout } from '../schema/layoutSchema.js';
import { createOverlayEngine } from '../../overlayClient/engine.ts';
import { createSimulation, SIM_ROUND_ID, SIM_TOURNAMENT_ID } from '../editor/simulation.ts';

jest.setTimeout(60000);

let scope: any = null;
beforeAll(async () => {
  const sim = createSimulation();
  const engine = createOverlayEngine({ tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, matchId: null, followSelected: true, view: null }, { transport: sim.transport });
  await new Promise<void>((resolve) => {
    const un = engine.subscribe((s: any) => { if (s.matchData?.teams?.length && s.overallData && !s.status.loading) { un(); resolve(); } });
  });
  sim.controls.kill(0);
  await new Promise((r) => setTimeout(r, 30));
  const state = engine.getState();
  engine.destroy();
  // Sample desktop feed: what the desktop tools read is checked too.
  scope = buildScope(state as any, createEmptyLayout() as any, null, { sampleLocal: true });
});

// A field can be legitimately absent right now (a list too short, an empty value);
// it must never be unknown to the engine.
const BROKEN = new Set(['missing', 'invalid', 'row-only', 'event-only']);

test.each(TEMPLATES.map((t) => [t.id, t] as const))('template %s reads only data the engine provides', (_id, t) => {
  const r = requirementsOf(t.elements);
  const broken = r.fields.map((p) => ({ p, why: explainBinding(scope, p) })).filter(({ why }) => BROKEN.has(why.state));
  expect(broken.map(({ p, why }) => `${p}: ${why.message}`)).toEqual([]);
  for (const list of r.lists) expect({ list, isList: Array.isArray(resolvePath(scope, list)) }).toEqual({ list, isList: true });
  expect(requirementsSummary(r)).not.toBe('');
});

test('requirements are worked out from the layers', () => {
  const r = requirementsOf([
    { id: 'a', type: 'text', x: 0, y: 0, w: 1, h: 1, bind: { text: { path: 'tournament.tournamentName' } }, style: { color: { ref: 'theme.colors.text' } } },
    { id: 'b', type: 'repeater', x: 0, y: 0, w: 1, h: 1, repeater: { source: 'derived.teams', limit: 4, direction: 'column' },
      children: [{ id: 'c', type: 'text', x: 0, y: 0, w: 1, h: 1, bind: { text: { path: 'item.teamName' } } }] },
    { id: 'd', type: 'rect', x: 0, y: 0, w: 1, h: 1, timeline: { clips: [
      { id: 'k', duration: 100, trigger: { type: 'event', event: 'kill' }, tracks: [] },
      { id: 'w', duration: 100, trigger: { type: 'change', watch: 'local.observed.uId' }, tracks: [] },
    ] } },
  ] as any);
  expect(r).toEqual({
    fields: ['local.observed.uId', 'tournament.tournamentName'],
    rowFields: ['item.teamName'],
    lists: ['derived.teams'],
    events: ['kill'],
    desktopOnly: true,
  });
  expect(requirementsSummary(r)).toBe('Reads: desktop game feed, tournament, teams and players · Reacts to: kill · Desktop app only');
});

describe('style kits', () => {
  test('every kit is complete and uses only fonts every page loads', () => {
    expect(STYLE_KITS.length).toBeGreaterThanOrEqual(8);
    const keys = Object.keys(createEmptyLayout().theme.colors).sort();
    for (const k of STYLE_KITS) {
      expect({ id: k.id, keys: Object.keys(k.colors).sort() }).toEqual({ id: k.id, keys });
      expect(BUILTIN_FONTS).toEqual(expect.arrayContaining([k.font, k.headingFont]));
    }
  });

  test('applying a kit replaces the theme tokens and keeps custom ones', () => {
    const theme = { ...createEmptyLayout().theme, colors: { ...createEmptyLayout().theme.colors, myBrand: '#123456' } };
    const gold = STYLE_KITS.find((k) => k.id === 'gold-championship')!;
    const next = themeWithKit(theme, gold);
    expect(next.colors.primary).toBe(gold.colors.primary);
    expect(next.colors.myBrand).toBe('#123456');
    expect(next.typography.fontFamily).toBe('"Bebas Neue", sans-serif');
    expect(next.radius).toBe(gold.radius);
  });

  test('tournament colours: only valid hex colours are taken', () => {
    const theme = createEmptyLayout().theme;
    expect(themeFromTournament(theme, { primaryColor: '#ff0000', secondaryColor: 'javascript:1' })!.colors).toMatchObject({ primary: '#ff0000', secondary: theme.colors.secondary });
    expect(themeFromTournament(theme, {})).toBeNull();
    expect(themeFromTournament(theme, null)).toBeNull();
  });
});
