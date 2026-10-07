// Engine unit + failure tests: retry/abort, bounded cache, the audit fixes
// (hardReset resets seq, no stale option closures, bounded memory), relay
// offline detection, reconnect recovery, event dedupe, and teardown.

import { createOverlayEngine } from '../engine.ts';
import { BoundedCache } from '../cache.ts';
import { HttpError, sleep as abortableSleep, retryTransient, isTransient, AbortError } from '../retry.ts';
import { computePhase } from '../recovery.ts';
import { fakeTransport, encodeFrame, settle, sleep } from '../__fixtures__/testkit.ts';
import type { EngineEvent } from '../engineTypes.ts';

const TID = '65f000000000000000000001';
const RID = '65f000000000000000000002';

const player = (uId: string, extra: any = {}) => ({
  docId: `p-${uId}`, uId, playerName: `P${uId}`, liveState: 0, bHasDied: false, killNum: 0, ...extra,
});
const team = (id: string, players: any[]) => ({ teamId: id, docId: `d-${id}`, teamName: id, teamTag: id, players });
const live = (matchId: string, seq: number, teams: any[]) => encodeFrame('MatchDataPayload', { matchId, seq, teams });
const roster = (matchId: string, seq: number, deadB = false) => live(matchId, seq, [
  team('a', [player('1'), player('2')]),
  team('b', [player('3', deadB ? { liveState: 5, bHasDied: true } : {}), player('4', deadB ? { liveState: 5, bHasDied: true } : {})]),
]);

const bulk = (publicRev = 1) => ({
  tournamentData: { _id: TID, tournamentName: 'T' },
  roundData: { _id: RID, roundName: 'R', publicRev },
  matchesData: { list: [], current: { _id: 'm1', map: 'Erangel' }, effectiveMatchId: 'm1' },
  matchDatasData: [],
  currentMatchData: null,
  overallData: null,
});

function start(opts: any = {}, transport = fakeTransport(bulk())) {
  transport.sock.connected = true;
  const engine = createOverlayEngine({ tournamentId: TID, roundId: RID, ...opts }, { transport, ...(opts.deps || {}) });
  return { engine, t: transport, sock: transport.sock };
}

describe('retry', () => {
  test('sleep rejects the moment its signal aborts', async () => {
    const c = new AbortController();
    const started = Date.now();
    const p = abortableSleep(10000, c.signal);
    setTimeout(() => c.abort(), 20);
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test('retryTransient retries 429/503/network, stops on 404 and on abort', async () => {
    expect(isTransient(new HttpError(429))).toBe(true);
    expect(isTransient(new HttpError(503))).toBe(true);
    expect(isTransient(new Error('network'))).toBe(true);
    expect(isTransient(new HttpError(404))).toBe(false);

    let n = 0;
    const c = new AbortController();
    const value = await retryTransient(async () => {
      n++;
      if (n < 3) throw new HttpError(503, null);
      return 'ok';
    }, { signal: c.signal, random: () => 0 });
    expect(value).toBe('ok');

    await expect(retryTransient(async () => { throw new HttpError(404); }, { signal: c.signal })).rejects.toBeInstanceOf(HttpError);

    const c2 = new AbortController();
    const p = retryTransient(async () => { throw new Error('down'); }, { signal: c2.signal });
    setTimeout(() => c2.abort(), 30);
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });
});

describe('BoundedCache', () => {
  test('LRU-evicts past maxEntries and fences on generation + TTL', () => {
    let now = 0;
    const c = new BoundedCache<string, number>({ maxEntries: 2, maxAgeMs: 1000, now: () => now });
    c.set('a', 1, 0);
    c.set('b', 2, 0);
    expect(c.get('a', 0)).toBe(1); // a is now most recent
    c.set('c', 3, 0); // evicts b
    expect(c.get('b', 0)).toBeUndefined();
    expect(c.get('a', 1)).toBeUndefined(); // generation moved
    c.set('d', 4, 0);
    now = 2000;
    expect(c.get('d', 0)).toBeUndefined(); // expired
    expect(c.getStats().evictions).toBeGreaterThanOrEqual(1);
    expect(c.size).toBeLessThanOrEqual(2);
  });
});

describe('computePhase', () => {
  const base = {
    destroyed: false, started: true, firstFetchDone: true, hasData: true, socketConnected: true,
    hasConnectedBefore: true, relayReachable: true, onCloudFallback: false, upstreamConnected: true,
    awaitingSnapshot: false, stale: false,
  };
  test('maps facts to the connection state machine', () => {
    expect(computePhase(base)).toBe('CONNECTED');
    expect(computePhase({ ...base, relayReachable: false })).toBe('RELAY_OFFLINE');
    expect(computePhase({ ...base, relayReachable: false, onCloudFallback: true })).toBe('DEGRADED');
    expect(computePhase({ ...base, socketConnected: false })).toBe('RECONNECTING');
    expect(computePhase({ ...base, upstreamConnected: false })).toBe('UPSTREAM_OFFLINE');
    expect(computePhase({ ...base, awaitingSnapshot: true })).toBe('REHYDRATING');
    expect(computePhase({ ...base, stale: true })).toBe('STALE');
    expect(computePhase({ ...base, firstFetchDone: false, socketConnected: false, hasConnectedBefore: false })).toBe('CONNECTING');
    expect(computePhase({ ...base, destroyed: true })).toBe('DESTROYED');
  });
});

describe('overlay engine', () => {
  test('joins the round with protobuf + snapshots and hydrates over HTTP', async () => {
    const { engine, sock, t } = start({ view: 'LiveStats' });
    await settle();
    expect(sock.emittedOf('joinRoundRoom')[0]).toEqual({
      tournamentId: TID, roundId: RID, view: 'LiveStats', wireFormat: 'protobuf', snapshots: true,
    });
    expect(t.bulkCalls[0]).toBe(`public/bulk/${TID}/${RID}/selected?view=LiveStats&followSelected=true`);
    const s = engine.getState();
    expect(s.status.loading).toBe(false);
    expect(s.tournament.tournamentName).toBe('T');
    expect(s.status.phase).toBe('CONNECTED');
    engine.destroy();
  });

  test('hardReset resets the sequence baseline (old renderer bug) and does not flash loading', async () => {
    const { engine, sock } = start();
    await settle();
    sock.serverEmit('liveMatchSnapshot', roster('m1', 5));
    await settle();
    expect(engine.getState().status.lastSequence).toBe(5);
    engine.hardReset();
    await settle();
    expect(engine.getState().status.loading).toBe(false);
    expect(engine.getState().matchData).toBeNull();
    // A fresh stream restarting at seq 1 must be applied, not skipped as "old".
    sock.serverEmit('liveMatchSnapshot', roster('m1', 1));
    await settle();
    expect(engine.getState().matchData?.teams.length).toBe(2);
    expect(engine.getState().status.lastSequence).toBe(1);
    engine.destroy();
  });

  test('option changes take effect in the socket handlers (no stale closures)', async () => {
    const { engine, sock } = start({ matchId: 'm1', followSelected: false });
    await settle();
    sock.serverEmit('liveMatchSnapshot', roster('m2', 1));
    await settle();
    expect(engine.getState().matchData).toBeNull(); // not our fixed match
    engine.update({ matchId: 'm2' });
    await settle();
    sock.serverEmit('liveMatchSnapshot', roster('m2', 1));
    await settle();
    expect(String(engine.getState().matchData?.matchId)).toBe('m2');
    engine.destroy();
  });

  test('a seq gap marks REHYDRATING, requests a snapshot, and the snapshot recovers', async () => {
    const { engine, sock } = start();
    const events: EngineEvent[] = [];
    engine.on('*', (e) => events.push(e));
    await settle();
    sock.serverEmit('liveMatchSnapshot', roster('m1', 1));
    await settle();
    sock.serverEmit('liveMatchUpdate', live('m1', 4, [team('a', [player('1', { killNum: 1 })])]));
    await settle();
    let s = engine.getState();
    expect(s.status.sequenceGapCount).toBe(1);
    expect(s.status.phase).toBe('REHYDRATING');
    expect(sock.emittedOf('requestLiveSnapshot').length).toBeGreaterThanOrEqual(1);
    sock.serverEmit('liveMatchSnapshot', roster('m1', 5));
    await settle();
    s = engine.getState();
    expect(s.status.awaitingSnapshot).toBe(false);
    expect(s.status.phase).toBe('CONNECTED');
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['sequenceGap', 'snapshotRecovery']));
    engine.destroy();
  });

  test('reconnect rejoins, asks for a snapshot, and never re-fires an elimination', async () => {
    const { engine, sock } = start();
    const elims: EngineEvent[] = [];
    engine.on('elimination', (e) => elims.push(e));
    await settle();
    sock.serverEmit('liveMatchSnapshot', roster('m1', 1));
    await settle();
    sock.serverEmit('liveMatchSnapshot', roster('m1', 2, true)); // b wiped
    await settle();
    expect(elims.map((e) => e.id)).toEqual(['m1:elim:b']);

    sock.dropNow();
    await settle();
    expect(engine.getState().status.phase).toBe('RECONNECTING');
    await sleep(1100); // past the 1s snapshot limiter
    sock.connectNow();
    await settle();
    expect(sock.emittedOf('joinRoundRoom').length).toBe(2);
    expect(engine.getState().status.reconnectCount).toBe(1);
    expect(sock.emittedOf('requestLiveSnapshot').length).toBeGreaterThanOrEqual(1);

    sock.serverEmit('liveMatchSnapshot', roster('m1', 3, true)); // same state replayed
    await settle();
    expect(elims.length).toBe(1);
    engine.destroy();
  });

  test('invalid protobuf is ignored without touching state', async () => {
    const { engine, sock } = start();
    await settle();
    const before = engine.getState();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    sock.serverEmit('liveMatchUpdate', new Uint8Array([0xc1, 0xff, 0xff, 0xff]));
    await settle();
    spy.mockRestore();
    expect(engine.getState().matchData).toBe(before.matchData);
    engine.destroy();
  });

  test('a 404 first fetch is a terminal NOT_FOUND error', async () => {
    const t = fakeTransport(bulk());
    t.failWith(new HttpError(404));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { engine } = start({}, t);
    await settle();
    spy.mockRestore();
    const s = engine.getState();
    expect(s.status.loading).toBe(false);
    expect(s.status.error?.code).toBe('NOT_FOUND');
    engine.destroy();
  });

  test('relay offline: reported after ~8s of failures, retries continue, recovers on success', async () => {
    let offset = 0;
    const clock = () => Date.now() + offset;
    const t = fakeTransport(bulk());
    t.sock.connected = false;
    t.failWith(new Error('ECONNREFUSED'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = createOverlayEngine({ tournamentId: TID, roundId: RID }, { transport: t, clock });
    await settle();
    offset = 9000;
    await sleep(700); // next retry fires onRetry -> publish with the advanced clock
    expect(engine.getState().status.phase).toBe('RELAY_OFFLINE');
    expect(engine.getState().status.relayReachable).toBe(false);
    const calls = t.bulkCalls.length;
    t.failWith(null);
    await sleep(1300);
    expect(t.bulkCalls.length).toBeGreaterThan(calls);
    expect(engine.getState().status.relayReachable).toBe(true);
    expect(engine.getState().status.loading).toBe(false);
    warn.mockRestore();
    engine.destroy();
  });

  test('destroy leaves the room and removes every socket listener', async () => {
    const { engine, sock } = start();
    await settle();
    expect(sock.listenerCount()).toBeGreaterThan(0);
    engine.destroy();
    expect(sock.listenerCount()).toBe(0);
    expect(sock.emittedOf('leaveRoundRoom')).toEqual([{ tournamentId: TID, roundId: RID }]);
  });

  test('derived values are lazy and memoised on input identity', async () => {
    const { engine, sock } = start();
    await settle();
    sock.serverEmit('liveMatchSnapshot', roster('m1', 1));
    await settle();
    expect(engine.diagnostics().derived.teams).toBeUndefined(); // nobody read it
    const s = engine.getState();
    const a = s.derived.teams;
    const b = s.derived.teams;
    expect(a).toBe(b);
    expect(engine.diagnostics().derived.teams.executions).toBe(1);
    engine.destroy();
  });

  test('round change re-initialises: leaves the old room, joins the new one, drops live state', async () => {
    const { engine, sock } = start();
    await settle();
    sock.serverEmit('liveMatchSnapshot', roster('m1', 3));
    await settle();
    const RID2 = '65f000000000000000000003';
    engine.update({ roundId: RID2 });
    await settle();
    expect(sock.emittedOf('leaveRoundRoom')).toEqual([{ tournamentId: TID, roundId: RID }]);
    expect(sock.emittedOf('joinRoundRoom').pop().roundId).toBe(RID2);
    expect(engine.getState().status.lastSequence).toBe(0);
    engine.destroy();
  });
});
