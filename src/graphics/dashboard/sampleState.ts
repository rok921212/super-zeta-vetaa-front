// One frozen snapshot of the Designer's simulation, shared by every thumbnail
// on the dashboard. The real overlay engine runs once over the simulated
// transport (so the data has exactly the shape live data has), a few events
// are played so kill counts and feeds are not empty, then the engine is torn
// down. Nothing keeps ticking behind the library.

import { useEffect, useState } from 'react';
import { createOverlayEngine } from '../../overlayClient/engine.ts';
import type { DataState } from '../bindings/index.ts';
import { createSimulation, SIM_ROUND_ID, SIM_TOURNAMENT_ID } from '../editor/simulation.ts';

let snapshot: DataState | null = null;
let pending: Promise<DataState | null> | null = null;

/** Resolves with the snapshot (null if the simulation could not start within a few seconds). */
export function loadSampleState(): Promise<DataState | null> {
  if (snapshot) return Promise.resolve(snapshot);
  if (pending) return pending;
  pending = new Promise<DataState | null>((resolve) => {
    let done = false;
    let engine: ReturnType<typeof createOverlayEngine> | null = null;
    const finish = (state: DataState | null) => {
      if (done) return;
      done = true;
      clearTimeout(giveUp);
      try { engine?.destroy(); } catch { /* already gone */ }
      snapshot = state;
      if (!state) pending = null; // let a later mount try again
      resolve(state);
    };
    const giveUp = setTimeout(() => finish(null), 8000);
    try {
      const sim = createSimulation();
      engine = createOverlayEngine(
        { tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, matchId: null, followSelected: true, view: null },
        { transport: sim.transport }
      );
      const e = engine;
      const un = e.subscribe((s: any) => {
        if (!(s?.matchData?.teams?.length && s.overallData && !s.status?.loading)) return;
        un();
        sim.controls.kill(0);
        sim.controls.kill(0);
        sim.controls.kill(1);
        setTimeout(() => finish(e.getState() as unknown as DataState), 40);
      });
    } catch {
      finish(null);
    }
  });
  return pending;
}

/** The shared sample data for thumbnails; null until it is ready. `enabled` false = do not start it yet. */
export function useSampleState(enabled = true): DataState | null {
  const [state, setState] = useState<DataState | null>(snapshot);
  useEffect(() => {
    if (!enabled || state) return;
    let alive = true;
    void loadSampleState().then((s) => { if (alive && s) setState(s); });
    return () => { alive = false; };
  }, [enabled, state]);
  return state;
}

/** Tests: forget the snapshot. */
export function resetSampleState(): void {
  snapshot = null;
  pending = null;
}
