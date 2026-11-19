// Recall detection (Rondo). A recall = dead with health 0, then alive with
// health again. Never before the player is in play (game start: health
// 0 → 100, a player left dead from the last game coming back). When the
// server sends `recallsUsed`, its count going up is the recall.

import { createRecallDetector, recallsUsedCount } from '../detectors.ts';

const RONDO = 'Rondo';
const md = (state: Record<string, any>, id = 'm1') => ({
  _id: id,
  teams: [{ _id: 't1', teamTag: 'AAA', teamLogo: '', players: [{ uId: '1', playerName: 'One', ...state }] }],
});
const st = (liveState: number, health: number, extra: Record<string, any> = {}) =>
  ({ liveState, health, bHasDied: liveState === 5, ...extra });

/** Runs ticks, returns how many recalls fired on each. */
function run(ticks: Record<string, any>[], map = RONDO) {
  const d = createRecallDetector('m1');
  return ticks.map((t) => d.process(md(t) as any, map).length);
}

describe('recall detector', () => {
  test('game start is never a recall', () => {
    expect(run([st(0, 0), st(0, 100), st(1, 100), st(2, 100), st(0, 100)])).toEqual([0, 0, 0, 0, 0]);
  });

  test('a player left dead from the last game coming back is not a recall', () => {
    expect(run([st(5, 0), st(0, 100)])).toEqual([0, 0]);
  });

  test('in play, dead with health 0, then back (parachute) = one recall', () => {
    expect(run([st(0, 100), st(5, 0), st(5, 0), st(2, 100), st(0, 100)])).toEqual([0, 0, 0, 1, 0]);
  });

  test('knocked then revived is not a recall', () => {
    expect(run([st(0, 100), st(4, 10), st(0, 60)])).toEqual([0, 0, 0]);
  });

  test('nothing fires off Rondo', () => {
    expect(run([st(0, 100), st(5, 0), st(0, 100)], 'Erangel')).toEqual([0, 0, 0]);
  });

  test('server count: fires when it goes up, never on first sight', () => {
    expect(run([
      st(5, 0, { recallsUsed: 1 }), // first sight with a count already: no banner
      st(0, 100, { recallsUsed: 1 }),
      st(5, 0, { recallsUsed: 1 }),
      st(0, 100, { recallsUsed: 2 }),
    ])).toEqual([0, 0, 0, 1]);
  });

  test('a match switch starts over', () => {
    const d = createRecallDetector('m1');
    d.process(md(st(0, 100)) as any, RONDO);
    d.process(md(st(5, 0)) as any, RONDO);
    expect(d.process(md(st(0, 100), 'm2') as any, RONDO)).toHaveLength(0);
  });
});

describe('recall pip count', () => {
  test('server says 0 but the overlay saw the recall: pip is used', () => {
    expect(recallsUsedCount(0, 1)).toBe(1);
  });
  test('server count survives a reload (overlay saw nothing)', () => {
    expect(recallsUsedCount(1, undefined)).toBe(1);
  });
  test('no data at all = recall still available', () => {
    expect(recallsUsedCount(null, undefined)).toBe(0);
  });
});
