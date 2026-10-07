// MANDATORY parity guard (spec §69): one recorded protobuf event sequence,
// replayed through every consumer of the overlay engine — the engine itself,
// the React adapter (what PublicThemeRenderer and the Designer runtime use)
// and the SDK facade connectOverlay() — must produce the same state, the same
// event sequence and the same sequence handling. The built SDK bundle is held
// to the same fixture through a real relay in
// desktop-app/relay/test/parity.test.cjs.

import { act, renderHook } from '@testing-library/react';
import fixture from '../__fixtures__/replay-basic.json';
import { digest, withIds } from '../__fixtures__/replayDigest.js';
import { fakeTransport, encodeFrame, settle, sleep, type FakeTransport } from '../__fixtures__/testkit.ts';
import { createOverlayEngine } from '../engine.ts';
import { useOverlayEngine, useEngineEvent } from '../react.ts';
import { connectOverlay } from '../client.ts';
import type { EngineEvent } from '../engineTypes.ts';

const TID = '65f000000000000000000001';
const RID = '65f000000000000000000002';

interface Run {
  events: EngineEvent[];
  digestAfterF9: any;
  final: any;
  sequenceGaps: number;
  snapshotRequests: number;
  bulkCalls: number;
}

type Consumer = (t: FakeTransport, onEvent: (e: EngineEvent) => void) => Promise<{
  getState: () => any;
  close: () => void;
}>;

async function replay(consumer: Consumer): Promise<Run> {
  const t = fakeTransport(withIds(fixture.bulk, TID, RID));
  t.sock.connected = true; // already-connected shared socket, like SocketManager
  const events: EngineEvent[] = [];
  const c = await consumer(t, (e) => events.push(e));
  await settle();
  let digestAfterF9: any = null;
  for (const f of fixture.frames as any[]) {
    await act(async () => {
      if (f.json) t.sock.serverEmit(f.event, withIds(f.json, TID, RID));
      else t.sock.serverEmit(f.event, encodeFrame(f.type, withIds(f.message, TID, RID)));
      await settle();
      if (f.event === 'publicDataInvalidated') await sleep(350); // 250ms debounce + refetch
    });
    if (String(f.note).startsWith('F9')) digestAfterF9 = digest(c.getState());
  }
  const state = c.getState();
  const run: Run = {
    events,
    digestAfterF9,
    final: digest(state),
    sequenceGaps: state.status.sequenceGapCount,
    snapshotRequests: t.sock.emittedOf('requestLiveSnapshot').length,
    bulkCalls: t.bulkCalls.length,
  };
  c.close();
  return run;
}

const engineConsumer: Consumer = async (t, onEvent) => {
  const e = createOverlayEngine({ tournamentId: TID, roundId: RID }, { transport: t });
  e.on('*', onEvent);
  return { getState: () => e.getState(), close: () => e.destroy() };
};

const reactConsumer: Consumer = async (t, onEvent) => {
  const hook = renderHook(() => {
    const r = useOverlayEngine({ tournamentId: TID, roundId: RID }, () => t);
    useEngineEvent(r.engine, '*', onEvent);
    return r;
  });
  await act(async () => { await settle(); });
  return {
    getState: () => hook.result.current.state,
    close: () => hook.unmount(),
  };
};

const sdkConsumer: Consumer = async (t, onEvent) => {
  const feed = connectOverlay({ tournamentId: TID, roundId: RID }, { transport: t });
  feed.on('*', onEvent);
  return {
    getState: () => {
      const s = feed.getState();
      return { ...s, status: { ...s.status, lastSequence: s.status.seq, sequenceGapCount: s.status.sequenceGapCount } };
    },
    close: () => feed.close(),
  };
};

const detectedIds = (events: EngineEvent[]) =>
  events.filter((e) => fixture.expected.eventTypes.includes(e.type)).map((e) => e.id);

// Everything but the generation-dependent bulkApplied bookkeeping.
const comparable = (events: EngineEvent[]) =>
  events.filter((e) => e.type !== 'bulkApplied').map((e) => `${e.type}|${e.id}|${e.sequence}|${e.matchId}`);

describe('engine parity replay', () => {
  let runs: Record<string, Run>;

  beforeAll(async () => {
    runs = {
      engine: await replay(engineConsumer),
      react: await replay(reactConsumer),
      sdk: await replay(sdkConsumer),
    };
  }, 30000);

  test.each(['engine', 'react', 'sdk'])('%s reaches the expected state and events', (name) => {
    const r = runs[name];
    expect(detectedIds(r.events)).toEqual(fixture.expected.eventIds);
    expect(r.digestAfterF9).toEqual(fixture.expected.digestAfterF9);
    expect(r.final).toEqual(fixture.expected.final);
    expect(r.sequenceGaps).toBe(1);
  });

  test('all consumers agree on every event, in order, with the same sequence numbers', () => {
    expect(comparable(runs.react.events)).toEqual(comparable(runs.engine.events));
    expect(comparable(runs.sdk.events)).toEqual(comparable(runs.engine.events));
  });

  test('all consumers issued the same snapshot requests and bulk fetches', () => {
    for (const name of ['react', 'sdk']) {
      expect(runs[name].snapshotRequests).toBe(runs.engine.snapshotRequests);
      expect(runs[name].bulkCalls).toBe(runs.engine.bulkCalls);
    }
    // gap + match boundary at minimum (the 1s limiter may merge nothing here: they are far apart in replay order)
    expect(runs.engine.snapshotRequests).toBeGreaterThanOrEqual(1);
  });
});
