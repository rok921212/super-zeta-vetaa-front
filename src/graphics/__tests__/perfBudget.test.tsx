// Timing budgets for work that runs while someone designs or while an overlay
// is on air, measured on the 500-layer fixture against the simulation's real
// engine state. jsdom is slower than a browser, so passing here leaves margin.
// Run with PERF_REPORT=1 to print the numbers.

import React from 'react';
import { act, render } from '@testing-library/react';
import { buildPerfDocument } from '../__fixtures__/perfDoc.ts';
import { checkPublish } from '../editor/publishChecks.ts';
import { designProgress } from '../editor/progress.ts';
import { explainBinding, buildScope } from '../bindings/index.ts';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { createOverlayEngine } from '../../overlayClient/engine.ts';
import { createSimulation, SIM_ROUND_ID, SIM_TOURNAMENT_ID } from '../editor/simulation.ts';

jest.setTimeout(120000);

let state: any = null;
beforeAll(async () => {
  const sim = createSimulation();
  const engine = createOverlayEngine({ tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, matchId: null, followSelected: true, view: null }, { transport: sim.transport });
  await new Promise<void>((resolve) => {
    const un = engine.subscribe((s: any) => { if (s.matchData?.teams?.length && s.overallData && !s.status.loading) { un(); resolve(); } });
  });
  state = engine.getState();
  engine.destroy();
});

/** Median of `runs` timings of fn, in ms (after one warm-up). */
function median(fn: () => void, runs = 9): number {
  fn();
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return t.sort((a, b) => a - b)[Math.floor(runs / 2)];
}

const report: Record<string, string> = {};
afterAll(() => {
  if (process.env.PERF_REPORT) console.log(JSON.stringify(report, null, 1));
});

test('guided steps: publish checks + progress on a 500-layer design stay under a frame budget per edit', () => {
  const doc = buildPerfDocument(500);
  const ms = median(() => {
    const r = checkPublish(doc, { name: 'perf', state, assetIds: null });
    designProgress({ report: r, stage: doc.stage, previewing: true, unsaved: false, draftRev: 1, publishedRev: 0 });
  });
  report.stepsPerEdit500 = `${ms.toFixed(1)} ms`;
  expect(ms).toBeLessThan(100);
});

test('explaining a binding is cheap enough to run on every binding row render', () => {
  const scope = buildScope(state, buildPerfDocument(1) as any);
  const paths = ['tournament.tournamentName', 'derived.teams[0].teamName', 'derived.teams[40].teamName', 'derived.teams[0].teamNme', 'match.smashPoint.value'];
  const ms = median(() => { for (let i = 0; i < 200; i++) paths.forEach((p) => explainBinding(scope, p)); });
  report.explain1000 = `${ms.toFixed(1)} ms per 1000 explanations`;
  expect(ms).toBeLessThan(100);
});

test('on air: a heartbeat (same data, new object) re-renders a 500-layer overlay within budget', () => {
  const doc = buildPerfDocument(500);
  let mount = 0;
  const s0 = performance.now();
  const view = render(<LayoutRenderer layout={doc} state={state} events={null} fit={1} />);
  mount = performance.now() - s0;
  const ms = median(() => { act(() => { view.rerender(<LayoutRenderer layout={doc} state={{ ...state }} events={null} fit={1} />); }); }, 5);
  report.mount500 = `${mount.toFixed(0)} ms`;
  report.heartbeatRerender500 = `${ms.toFixed(1)} ms`;
  view.unmount();
  expect(ms).toBeLessThan(400);
});
