// Every built-in theme graphic (Theme1-8 on-screen/off-screen views) renders
// through the Designer's `builtin` element, fed by the REAL engine running on
// the simulation transport. Jest has no require.context, so the registry is
// built here from the filesystem with the same canonicalisation.

import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, cleanup } from '@testing-library/react';
import { setThemeRegistryForTests, canonicalize, listBuiltinGraphics, resolveComponent, type ComponentRegistry } from '../../Themes/registry.ts';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { createOverlayEngine } from '../../overlayClient/engine.ts';
import { createSimulation, SIM_ROUND_ID, SIM_TOURNAMENT_ID } from '../editor/simulation.ts';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
import { newLayoutDocument } from '../editor/DesignerList.tsx';

jest.setTimeout(120000);

const THEMES_DIR = path.resolve(__dirname, '../../Themes');

function buildRegistryFromDisk() {
  const registry: ComponentRegistry = {};
  const screens: Record<string, 'on-screen' | 'off-screen'> = {};
  for (const theme of fs.readdirSync(THEMES_DIR).filter((d) => /^Theme\d+$/.test(d))) {
    for (const screen of ['on-screen', 'off-screen'] as const) {
      const dir = path.join(THEMES_DIR, theme, screen);
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(path.join(dir, file));
        if (!mod?.default) continue;
        const key = canonicalize(file.replace(/\.tsx$/, ''));
        registry[theme] ||= {};
        registry[theme][key] = mod.default;
        screens[`${theme}/${key}`] = screen;
      }
    }
  }
  return { registry, screens };
}

let engineState: any = null;
const consoleError = console.error;

beforeAll(async () => {
  const { registry, screens } = buildRegistryFromDisk();
  setThemeRegistryForTests(registry, screens);
  const sim = createSimulation();
  const engine = createOverlayEngine({ tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, matchId: null, followSelected: true, view: null }, { transport: sim.transport });
  engineState = await new Promise((resolve) => {
    const un = engine.subscribe((s: any) => {
      if (s.matchData?.teams?.length && s.overallData && !s.status.loading) { un(); resolve(s); }
    });
  });
  // make the scene interesting: a kill, an elimination, a recall
  sim.controls.kill(0);
  sim.controls.eliminate(5);
  await new Promise((r) => setTimeout(r, 50));
  engineState = engine.getState();
  engine.destroy();
});

afterEach(() => { cleanup(); console.error = consoleError; });

test('registry lists every theme graphic on disk (~230)', () => {
  const all = listBuiltinGraphics();
  expect(new Set(all.map((g) => g.theme)).size).toBe(8);
  expect(all.length).toBeGreaterThan(150);
  expect(all.find((g) => g.theme === 'Theme6' && g.view === 'alerts')?.label).toBe('Elimination Alerts');
  expect(resolveComponent('Theme3', 'rostershowcase')).toBeTruthy(); // FALLBACKS still apply (Theme3 has no file of its own)
});

test('every built-in graphic renders through the builtin element with live engine data', () => {
  const failures: string[] = [];
  const only = process.env.BUILTIN_LIMIT ? listBuiltinGraphics().slice(0, Number(process.env.BUILTIN_LIMIT)) : listBuiltinGraphics();
  for (const g of only) {
    const t0 = Date.now();
    if (process.env.BUILTIN_TRACE) fs.appendFileSync(process.env.BUILTIN_TRACE, `${g.theme}/${g.view} start\n`);
    const layout: any = { ...createEmptyLayout(), elements: [{ id: 'b', type: 'builtin', x: 0, y: 0, w: 960, h: 540, builtin: { theme: g.theme, view: g.view } }] };
    const errors: string[] = [];
    console.error = (...args: any[]) => { if (String(args[0]).includes('failed to render')) errors.push(String(args[1] ?? args[0]).slice(0, 160)); };
    try {
      const { container, unmount } = render(<LayoutRenderer layout={layout} state={engineState} events={null} fit={1} />);
      const host = container.querySelector('[data-element-id="b"]');
      if (!host) errors.push('element not mounted');
      else if (/not found/.test(host.textContent || '')) errors.push('component not resolved');
      unmount();
    } catch (e: any) {
      errors.push(e?.message || String(e));
    }
    console.error = consoleError;
    if (process.env.BUILTIN_TRACE) fs.appendFileSync(process.env.BUILTIN_TRACE, `${g.theme}/${g.view} ${Date.now() - t0}ms\n`);
    if (errors.length) failures.push(`${g.theme}/${g.view}: ${errors[0]}`);
  }
  if (failures.length) console.warn(`[builtins] ${failures.length} graphic(s) failed:\n${failures.join('\n')}`);
  expect(failures).toEqual([]);
});

test('a layout can start from a built-in graphic and validates', () => {
  const doc = newLayoutDocument('builtin:Theme6/alerts');
  expect(doc.elements).toHaveLength(1);
  expect(doc.elements[0]).toMatchObject({ type: 'builtin', w: 1920, h: 1080, builtin: { theme: 'Theme6', view: 'alerts' } });
  expect(validateLayout(doc).ok).toBe(true);
});
