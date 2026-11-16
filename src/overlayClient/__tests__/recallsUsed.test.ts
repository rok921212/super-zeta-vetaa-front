// Recalls used, rebuilt from the game's killfeed (the whole game so far), so
// an overlay opened or refreshed mid-match knows who was already recalled.

import { recallsUsedFromKillfeed, type KillFeedEntry } from '../detectors.ts';

const alive = { liveState: 0, health: 100, bHasDied: false };
const dead = { liveState: 5, health: 0, bHasDied: true };

function md(players: Record<string, any>) {
  return {
    _id: 'm1',
    teams: [
      {
        teamId: 1,
        players: Object.entries(players).map(([uId, state]) => ({ uId, playerName: `Name${uId}`, ...state })),
      },
    ],
  };
}

const kill = (victim: string, t: number, causer = '999', name = `Name${victim}`): KillFeedEntry => ({
  CauserUID: causer,
  VictimUID: victim,
  VictimName: name,
  ResultHealthStatus: '2',
  CurGameTime: String(t),
  ItemID: '101003',
});
const knock = (victim: string, t: number): KillFeedEntry => ({ ...kill(victim, t), ResultHealthStatus: '1' });

describe('recallsUsedFromKillfeed', () => {
  it('died once and alive now = recall used', () => {
    expect(recallsUsedFromKillfeed([knock('1', 10), kill('1', 20)], md({ 1: alive }))).toEqual({ 1: 1 });
  });

  it('died once and dead now (waiting for recall) = still has it', () => {
    expect(recallsUsedFromKillfeed([kill('1', 20)], md({ 1: dead }))).toEqual({});
  });

  it('died twice = recall used', () => {
    expect(recallsUsedFromKillfeed([kill('1', 20), kill('1', 300)], md({ 1: dead }))).toEqual({ 1: 1 });
  });

  it('never died = nothing', () => {
    expect(recallsUsedFromKillfeed([knock('1', 10)], md({ 1: alive }))).toEqual({});
  });

  it('a VictimUID "0" death (team wipe / zone) matches the roster by name', () => {
    const wipe = kill('0', 50, '0', 'name2');
    expect(recallsUsedFromKillfeed([wipe], md({ 2: alive }))).toEqual({ 2: 1 });
  });

  it('the same line listed twice counts once', () => {
    expect(recallsUsedFromKillfeed([kill('1', 20), kill('1', 20)], md({ 1: dead }))).toEqual({});
  });

  it('order of the list does not matter', () => {
    const list = [kill('1', 20), knock('2', 30), kill('2', 40), kill('1', 300)];
    const roster = md({ 1: alive, 2: alive });
    expect(recallsUsedFromKillfeed(list, roster)).toEqual(recallsUsedFromKillfeed(list.slice().reverse(), roster));
    expect(recallsUsedFromKillfeed(list, roster)).toEqual({ 1: 2, 2: 1 });
  });

  it('players not on the roster are ignored', () => {
    expect(recallsUsedFromKillfeed([kill('77', 20, '999', 'Stranger')], md({ 1: alive }))).toEqual({});
  });
});
