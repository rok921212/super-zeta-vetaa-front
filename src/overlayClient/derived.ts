// Lazily-computed, identity-memoised derived values.
//
// The old SDK client ran deriveTeams twice plus both standings builders on
// EVERY publish, whether anyone read them or not. Here each value is a getter:
// nothing is computed until read, and a value is recomputed only when one of
// its inputs changed identity (untouched slices keep their identity through
// the state reducers, so e.g. a live tick never recomputes round standings).

import { deriveTeams, type PriorBaselineCache } from '../Themes/shared/hooks/unsortteams.ts';
import {
  buildOverallStandings,
  computeMatchStandings,
  computeRankedStandings,
} from '../Themes/shared/hooks/officialStandings.ts';
import { computeMatchTotals } from '../Themes/shared/hooks/matchTotals.ts';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../Themes/shared/hooks/fraggerScore.ts';
import { wwcdChance } from '../Themes/shared/hooks/liveDerived.ts';
import type { DerivedState, EngineData } from './engineTypes.ts';

export interface DerivedPerf {
  executions: number;
  totalMs: number;
}

const now = (): number =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();

/** Memoise fn on the identity of its inputs; record timing under `name`. */
function memo<A extends unknown[], R>(name: string, perf: Record<string, DerivedPerf>, fn: (...args: A) => R) {
  let lastArgs: A | null = null;
  let lastResult: R;
  return (...args: A): R => {
    if (lastArgs && lastArgs.length === args.length && lastArgs.every((a, i) => a === args[i])) return lastResult;
    const t0 = now();
    lastResult = fn(...args);
    const p = (perf[name] ||= { executions: 0, totalMs: 0 });
    p.executions++;
    p.totalMs += now() - t0;
    lastArgs = args;
    return lastResult;
  };
}

export interface DerivedEngine {
  /** A fresh lazy DerivedState view over `data` (cheap — no computation happens here). */
  view(data: EngineData): DerivedState;
  perf(): Record<string, { executions: number; totalMs: number; avgMs: number }>;
  /** Forget memoised results + deriveTeams' prior-baseline cache (round change). */
  reset(): void;
}

export function createDerivedEngine(): DerivedEngine {
  const perf: Record<string, DerivedPerf> = {};
  let baselineCache: PriorBaselineCache = new Map();
  let fns = build();

  function build() {
    const teams = memo('teams', perf, (md: any, od: any) =>
      md ? deriveTeams(md, od, 'liveUntilDead', baselineCache) : []);
    const liveTeams = memo('liveTeams', perf, (md: any, od: any) =>
      md ? deriveTeams(md, od, 'live', baselineCache) : []);
    const overallStandings = memo('overallStandings', perf, (mds: any[], od: any) =>
      buildOverallStandings(mds as any, od as any));
    const matchStandings = memo('matchStandings', perf, (md: any) => (md ? computeMatchStandings(md) : []));
    const rankedStandings = memo('rankedStandings', perf, (mds: any[]) =>
      (mds && mds.length ? computeRankedStandings(mds as any) : []));
    const matchTotals = memo('matchTotals', perf, (md: any) => (md ? computeMatchTotals(md) : null));
    const fraggers = memo('fraggers', perf, (mds: any[]) =>
      (mds && mds.length ? computeFraggerScores(buildFraggerPool(mds as any)).sort(compareFraggerScore) : []));
    const matchFraggers = memo('matchFraggers', perf, (md: any) =>
      (md ? computeFraggerScores(buildFraggerPool([md] as any)).sort(compareFraggerScore) : []));
    const wwcd = memo('wwcdChance', perf, (derivedTeams: any[], apiEnable: boolean) => {
      const out: Record<string, number> = {};
      for (const t of derivedTeams) out[String(t.teamId ?? t._id)] = wwcdChance(t, apiEnable);
      return out;
    });
    return { teams, liveTeams, overallStandings, matchStandings, rankedStandings, matchTotals, fraggers, matchFraggers, wwcd };
  }

  return {
    view(data) {
      const f = fns;
      const d = {} as DerivedState;
      const define = (key: keyof DerivedState, get: () => any) =>
        Object.defineProperty(d, key, { enumerable: true, configurable: false, get });
      define('teams', () => f.teams(data.matchData, data.overallData));
      define('liveTeams', () => f.liveTeams(data.matchData, data.overallData));
      define('overallStandings', () => f.overallStandings(data.matchDatas, data.overallData));
      define('matchStandings', () => f.matchStandings(data.matchData));
      define('rankedStandings', () => f.rankedStandings(data.matchDatas));
      define('matchTotals', () => f.matchTotals(data.matchData));
      define('fraggers', () => f.fraggers(data.matchDatas));
      define('matchFraggers', () => f.matchFraggers(data.matchData));
      define('wwcdChance', () => f.wwcd(f.teams(data.matchData, data.overallData), !!data.round?.apiEnable));
      return d;
    },
    perf() {
      const out: Record<string, { executions: number; totalMs: number; avgMs: number }> = {};
      for (const [k, v] of Object.entries(perf)) {
        out[k] = { ...v, avgMs: v.executions ? v.totalMs / v.executions : 0 };
      }
      return out;
    },
    reset() {
      baselineCache = new Map();
      fns = build();
    },
  };
}
