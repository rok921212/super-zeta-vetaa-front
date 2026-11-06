import { buildFraggerPool, comparePlayerFrags, compareFraggerScore, computeFraggerScores } from '../fraggerScore';

const player = (uId: string, stats: Record<string, number>) => ({ _id: uId, uId, playerName: uId, ...stats });
const match = (...players: any[]) => ({ teams: [{ teamId: 't1', teamTag: 'T', teamLogo: '', players }] });
const ranked = (...matches: any[]) =>
  computeFraggerScores(buildFraggerPool(matches)).sort(compareFraggerScore).map((p) => p.uId);

const base = { killNum: 5, damage: 500, knockouts: 3, assists: 2, survivalTime: 900 };

describe('top fragger order', () => {
  it.each([
    ['kills beat every other stat', { killNum: 6, damage: 0, knockouts: 0, assists: 0, survivalTime: 0 }, { killNum: 5, damage: 9000, knockouts: 9, assists: 9, survivalTime: 9000 }],
    ['damage decides equal kills', { ...base, damage: 501, knockouts: 0 }, { ...base, knockouts: 9 }],
    ['knocks decide equal damage', { ...base, knockouts: 4, assists: 0 }, { ...base, assists: 9 }],
    ['assists decide equal knocks', { ...base, assists: 3, survivalTime: 0 }, { ...base, survivalTime: 9000 }],
    ['survival decides the rest', { ...base, survivalTime: 901 }, base],
  ])('%s', (_name, winner, loser) => {
    expect(ranked(match(player('loser', loser), player('winner', winner)))).toEqual(['winner', 'loser']);
    expect([player('loser', loser), player('winner', winner)].sort(comparePlayerFrags)[0].uId).toBe('winner');
  });

  it('sums survival across matches', () => {
    const short = { ...base, survivalTime: 500 };
    const mid = { ...base, survivalTime: 600 };
    const long = { ...base, survivalTime: 800 };
    expect(ranked(match(player('a', short), player('b', mid)), match(player('a', long), player('b', short)))).toEqual(['a', 'b']);
  });

  it('counts a missing field as 0', () => {
    const sorted = [player('none', { killNum: 2 }), player('some', { killNum: 2, damage: 1 })].sort(comparePlayerFrags);
    expect(sorted[0].uId).toBe('some');
    expect(comparePlayerFrags({}, {})).toBe(0);
  });
});
