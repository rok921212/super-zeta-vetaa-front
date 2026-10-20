// Why a connected field shows nothing (bindings/explain.ts): every reason the
// editor can give, from the scope alone.

import { buildScope, explainBinding, closestKey, EMPTY_LOCAL } from '../bindings/index.ts';

const layout = { theme: {}, variables: {}, brand: {} } as any;
const team = { teamName: 'Alpha', teamTag: 'ALP', totalKills: 0, players: [{ playerName: 'P1', killNum: 0 }] };
const liveState = (over: Record<string, unknown> = {}) => ({
  tournament: { tournamentName: 'Cup' },
  round: { roundName: 'Finals' },
  match: { matchNo: 3, smashPoint: { enabled: true, value: '80' } },
  matchData: { teams: [team] },
  derived: { teams: [team] },
  status: { phase: 'CONNECTED', loading: false },
  ...over,
});
const scope = (over?: Record<string, unknown>) => buildScope(liveState(over) as any, layout);

test('a found value is ok, and a real 0 counts as a value', () => {
  expect(explainBinding(scope(), 'tournament.tournamentName')).toMatchObject({ state: 'ok', found: true, value: 'Cup', message: '' });
  expect(explainBinding(scope(), 'derived.teams[0].totalKills')).toMatchObject({ state: 'ok', value: 0 });
  expect(explainBinding(scope(), 'match.smashPoint.value')).toMatchObject({ state: 'ok', value: '80' });
});

test('a field that exists but is empty is told apart from a missing one', () => {
  const s = scope({ tournament: { tournamentName: '' } });
  expect(explainBinding(s, 'tournament.tournamentName')).toMatchObject({ state: 'empty', found: true });
});

test('invalid addresses', () => {
  expect(explainBinding(scope(), 'a..b').state).toBe('invalid');
  expect(explainBinding(scope(), '').state).toBe('invalid');
  expect(explainBinding(scope(), 'constructor.name').state).toBe('invalid');
});

test('nothing selected, loading, disconnected', () => {
  expect(explainBinding(scope({ match: null }), 'match.matchNo')).toMatchObject({ state: 'no-selection', message: expect.stringMatching(/No match is selected/) });
  expect(explainBinding(scope({ tournament: null }), 'tournament.tournamentName').state).toBe('no-selection');
  expect(explainBinding(scope({ match: null, status: { phase: 'HYDRATING', loading: true } }), 'match.matchNo').state).toBe('loading');
  expect(explainBinding(scope({ match: null, status: { phase: 'RELAY_OFFLINE' } }), 'match.matchNo'))
    .toMatchObject({ state: 'disconnected', message: expect.stringMatching(/desktop relay is offline/) });
  // A field that IS there is shown even while reconnecting: stale data beats nothing.
  expect(explainBinding(scope({ status: { phase: 'RECONNECTING' } }), 'match.matchNo').state).toBe('ok');
});

test('row, event and desktop-only fields outside their context', () => {
  expect(explainBinding(scope(), 'item.teamName').state).toBe('row-only');
  expect(explainBinding(scope(), 'event.player.playerName').state).toBe('event-only');
  const s = { ...scope(), local: EMPTY_LOCAL };
  expect(explainBinding(s, 'local.observed.playerName').state).toBe('desktop-only');
});

test('a list shorter than the item asked for says how long it is', () => {
  const r = explainBinding(scope(), 'derived.teams[3].teamName');
  expect(r.state).toBe('list-short');
  expect(r.message).toMatch(/has 1 item right now, so item 4 does not exist yet/);
  expect(explainBinding(scope({ derived: { teams: [] } }), 'derived.teams[0].teamName').message).toMatch(/is empty right now/);
});

test('a misspelt field suggests the real one', () => {
  const r = explainBinding(scope(), 'derived.teams[0].teamNme');
  expect(r.state).toBe('missing');
  expect(r.message).toMatch(/Did you mean “teamName”/);
  expect(explainBinding(scope(), 'tournament.sponsorName').message).not.toMatch(/Did you mean/);
  expect(closestKey('killnum', ['killNum', 'damage'])).toBe('killNum');
  expect(closestKey('zzz', ['killNum', 'damage'])).toBeNull();
});
