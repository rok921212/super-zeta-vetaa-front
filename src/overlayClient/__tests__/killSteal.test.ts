// Kill-steal detector against a real killfeed: every /setkillinfo the game
// posted on 2026-11-16 (server.exe log), split into its 4 games, with the
// lobby's uId -> teamId roster. A steal = knocked by one team, killed by
// another; a teammate finishing the knock is not one.

import { createKillStealDetector, killFeedList, type KillFeedEntry } from '../detectors.ts';
import fixture from '../__fixtures__/killfeed-20261116.json';

const { roster, games } = fixture as { roster: Record<string, number>; games: KillFeedEntry[][] };

function matchData(id = 'm1') {
  const teams = new Map<number, any>();
  for (const [uId, teamId] of Object.entries(roster)) {
    if (!teams.has(teamId)) teams.set(teamId, { teamId, teamTag: `T${teamId}`, teamLogo: '', players: [] });
    teams.get(teamId).players.push({ uId, playerName: `p${uId}`, liveState: 0, health: 100 });
  }
  return { _id: id, teams: Array.from(teams.values()) };
}

/** The same rule, written plainly, per game. */
function expectedSteals(game: KillFeedEntry[]): number {
  const knocks = new Map<string, string>();
  let n = 0;
  for (const e of game) {
    const c = String(e.CauserUID), v = String(e.VictimUID), s = String(e.ResultHealthStatus);
    if (s === '1') { knocks.set(v, c); continue; }
    const k = knocks.get(v);
    knocks.delete(v);
    if (k && c !== k && roster[c] != null && roster[k] != null && roster[c] !== roster[k]) n++;
  }
  return n;
}

/** Polls the cumulative killfeed the way the hook does, `step` new entries per read. */
function run(step: number, newestFirst = false) {
  const det = createKillStealDetector('m1');
  const md = matchData();
  det.process([], md); // overlay opened before the first game: primes on an empty feed
  const found: any[] = [];
  for (const game of games) {
    for (let end = step; end < game.length + step; end += step) {
      const list = game.slice(0, Math.min(end, game.length));
      // The live GET /getkillinfo lists the feed newest-first.
      if (newestFirst) list.reverse();
      found.push(...det.process(list, md));
      found.push(...det.process(list, md)); // same read twice: nothing new
    }
  }
  return found;
}

describe('kill-steal detector (real 2026-11-16 killfeed)', () => {
  const total = games.reduce((n, g) => n + expectedSteals(g), 0);

  it('finds every cross-team finish and nothing else', () => {
    expect(total).toBeGreaterThan(20); // the log has dozens; guard against an empty fixture
    for (const step of [1, 3, 10]) {
      const found = run(step);
      expect(found).toHaveLength(total);
      for (const f of found) {
        expect(f.type).toBe('killSteal');
        expect(f.teamTag).toBe(`T${roster[String(f.player.uId)]}`); // card shows the stealer's team
        expect(f.knockerTeamTag).not.toBe(f.teamTag); // never a teammate finish
      }
    }
  });

  it('newest-first reads (the live GET order) find the same steals, once each', () => {
    for (const step of [1, 3, 10]) {
      const found = run(step, true);
      expect(found).toHaveLength(total);
      for (const f of found) expect(f.knockerTeamTag).not.toBe(f.teamTag);
    }
  });

  it('stays silent on the first read when opened mid-match, then reports new steals', () => {
    const det = createKillStealDetector('m1');
    const md = matchData();
    const game = games.find((g) => expectedSteals(g) > 0)!;
    const half = Math.floor(game.length / 2);
    expect(det.process(game.slice(0, half), md)).toHaveLength(0);
    const later = det.process(game, md);
    // Steals whose knock AND kill both land in the second half are reported;
    // a kill of a first-half knock is too (the knock was recorded silently).
    const all = expectedSteals(game);
    const first = expectedSteals(game.slice(0, half));
    expect(later.length).toBe(all - first);
  });

  it('a match switch resets and goes silent for one read', () => {
    const det = createKillStealDetector('m1');
    det.process([], matchData('m1'));
    const game = games[0];
    expect(det.process(game, matchData('m2'))).toHaveLength(0);
    expect(det.lastCallResetMatch).toBe(true);
  });

  it('a revived victim (seen knocked, then alive) loses the pending knock', () => {
    const det = createKillStealDetector('m1');
    const md = matchData();
    const [a, b] = md.teams; // two different teams
    const victim = md.teams[2].players[0];
    const knock = { CauserUID: a.players[0].uId, VictimUID: victim.uId, ResultHealthStatus: '1', CurGameTime: '10' };
    const kill = { CauserUID: b.players[0].uId, VictimUID: victim.uId, ResultHealthStatus: '2', CurGameTime: '90' };
    det.process([], md);
    det.process([knock], md);
    victim.liveState = 4; // knocked
    det.process([knock], md);
    victim.liveState = 0; // revived
    det.process([knock], md);
    expect(det.process([knock, kill], md)).toHaveLength(0);
  });

  it('reads the /getkillinfo body shapes', () => {
    expect(killFeedList({ killInfo: [{ VictimUID: '1' }] })).toHaveLength(1);
    expect(killFeedList({ KillInfo: [] })).toHaveLength(0);
    expect(killFeedList(null)).toHaveLength(0);
  });
});
