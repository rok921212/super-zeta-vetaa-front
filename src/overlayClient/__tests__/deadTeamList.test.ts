// Client-side elimination tracker: a wipe is stamped once, and a "dead" team
// that keeps reporting live players (wrong roster on its slot) is undone.
import { computeDeadTeamList, newDeathTracker } from '../deadTeamList.ts';

const p = (uId: string, dead: boolean) => ({ uId, liveState: dead ? 5 : 0, bHasDied: dead });
const team = (id: string, dead: boolean[]) => ({
  teamId: id, teamTag: id, teamName: id, teamLogo: '', placePoints: dead.every(Boolean) ? 6 : 0, rank: 0,
  players: dead.map((d, i) => p(`${id}${i}`, d)),
});

describe('computeDeadTeamList', () => {
  let now = 1_000_000;
  beforeEach(() => { now = 1_000_000; jest.spyOn(Date, 'now').mockImplementation(() => now); });
  afterEach(() => { (Date.now as jest.Mock).mockRestore(); });

  test('a wipe is recorded once and keeps its first stats', () => {
    const ref = { current: newDeathTracker() };
    expect(computeDeadTeamList('m1', [team('a', [true, true])], ref)).toHaveLength(1);
    now += 1000;
    const again = computeDeadTeamList('m1', [team('a', [true, true])], ref);
    expect(again).toHaveLength(1);
    expect(again[0].deadAt).toBe(new Date(1_000_000).toISOString());
  });

  test('a one-payload flicker back to alive does not undo the elimination', () => {
    const ref = { current: newDeathTracker() };
    computeDeadTeamList('m1', [team('a', [true, true])], ref);
    now += 100;
    expect(computeDeadTeamList('m1', [team('a', [false, true])], ref)).toHaveLength(1);
    now += 100;
    expect(computeDeadTeamList('m1', [team('a', [true, true])], ref)).toHaveLength(1);
  });

  test('a team that keeps reporting live players is no longer eliminated', () => {
    const ref = { current: newDeathTracker() };
    computeDeadTeamList('m1', [team('a', [true, true])], ref);
    let list: any[] = [];
    for (let i = 0; i < 4; i++) {
      now += 2000;
      list = computeDeadTeamList('m1', [team('a', [false, false])], ref);
    }
    expect(list).toHaveLength(0);
  });

  test('an empty player list says nothing either way', () => {
    const ref = { current: newDeathTracker() };
    computeDeadTeamList('m1', [team('a', [true, true])], ref);
    for (let i = 0; i < 5; i++) {
      now += 2000;
      expect(computeDeadTeamList('m1', [{ ...team('a', []), players: [] }], ref)).toHaveLength(1);
    }
  });
});
