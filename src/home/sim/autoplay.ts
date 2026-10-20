// A scripted match for visitors who touch nothing: it plays the simulation's
// own controls and walks the stage through the overlays a producer would put
// on air, from the pre-match lower third to the champions screen (~90 s).

import type { SimulationControls } from '../../graphics/editor/simulation.ts';

export interface AutoplayStep {
  /** ms after the previous step. */
  wait: number;
  /** Put this view on the stage (a VIEW_GROUPS key). */
  view?: string;
  run?(c: SimulationControls): void;
}

const kills = (n: number) => (c: SimulationControls) => { for (let i = 0; i < n; i++) c.kill(); };

export const AUTOPLAY: AutoplayStep[] = [
  { wait: 0, view: 'Lower', run: (c) => c.reset() },
  { wait: 5000, view: 'intro' },
  { wait: 6000, view: 'LiveStats', run: (c) => c.milestone('firstBlood') },
  { wait: 2500, run: kills(2) },
  { wait: 2500, run: (c) => c.knock() },
  { wait: 2500, view: 'Alerts', run: (c) => c.eliminate() },
  { wait: 3500, view: 'Dom', run: (c) => c.milestone('streak3') },
  { wait: 4000, view: 'LiveStats', run: kills(3) },
  { wait: 3000, run: (c) => { c.eliminate(); c.setHealth(70); } },
  { wait: 3000, view: 'Upper', run: (c) => c.pulseFiring(4000) },
  { wait: 4500, view: 'LiveFrags', run: kills(3) },
  { wait: 4000, view: 'Alerts', run: (c) => c.eliminate() },
  { wait: 3500, view: 'LiveStats', run: (c) => { c.setAliveTeams(4); c.setOutsideZone(true); } },
  { wait: 4000, run: kills(2) },
  { wait: 3000, run: (c) => { c.setOutsideZone(false); c.setAliveTeams(2); } },
  { wait: 3500, view: 'WwcdStats', run: (c) => c.matchEnd() },
  { wait: 6000, view: 'MatchData' },
  { wait: 6000, view: 'MatchFragrs' },
  { wait: 6000, view: 'OverAllData' },
  { wait: 7000, view: 'mvp' },
  { wait: 6000, view: 'Champions' },
  { wait: 7000 },
];

/**
 * Runs the script. `setView` gets each view change; it is skipped when the
 * current theme lacks the view (`hasView`). Returns a stop function. The
 * script pauses while the tab is hidden and resumes where it was.
 */
export function startAutoplay(
  controls: SimulationControls,
  setView: (view: string) => void,
  hasView: (view: string) => boolean,
  onDone: () => void,
): () => void {
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const step = () => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.hidden) {
      document.addEventListener('visibilitychange', resume, { once: true });
      return;
    }
    const s = AUTOPLAY[i];
    if (!s) { stopped = true; onDone(); return; }
    try { s.run?.(controls); } catch { /* a control with nothing to act on */ }
    if (s.view && hasView(s.view)) setView(s.view);
    i += 1;
    const next = AUTOPLAY[i];
    timer = setTimeout(step, next ? next.wait : 0);
  };
  const resume = () => { if (!stopped) step(); };

  timer = setTimeout(step, 0);
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', resume);
  };
}
