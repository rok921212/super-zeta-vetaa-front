// Test doubles for the overlay engine: a scriptable socket + transport, and
// protobuf frame encoding identical to the backend (0xC1 marker + message).

import { overlay as overlayProto } from '../../proto/overlay.pb';
import type { EngineTransport, EngineSocket } from '../transport.ts';

type Listener = (...args: any[]) => void;

export class FakeSocket implements EngineSocket {
  connected = false;
  emitted: Array<[string, any]> = [];
  private handlers = new Map<string, Set<Listener>>();

  on(event: string, cb: Listener): void {
    let s = this.handlers.get(event);
    if (!s) { s = new Set(); this.handlers.set(event, s); }
    s.add(cb);
  }
  off(event: string, cb: Listener): void {
    this.handlers.get(event)?.delete(cb);
  }
  emit(event: string, data?: any): void {
    this.emitted.push([event, data]);
  }
  /** Server -> client. */
  serverEmit(event: string, ...args: any[]): void {
    for (const cb of Array.from(this.handlers.get(event) || [])) cb(...args);
  }
  connectNow(): void {
    this.connected = true;
    this.serverEmit('connect');
  }
  dropNow(reason = 'transport close'): void {
    this.connected = false;
    this.serverEmit('disconnect', reason);
  }
  listenerCount(): number {
    let n = 0;
    this.handlers.forEach((s) => { n += s.size; });
    return n;
  }
  emittedOf(event: string): any[] {
    return this.emitted.filter(([e]) => e === event).map(([, d]) => d);
  }
}

export interface FakeTransport extends EngineTransport {
  sock: FakeSocket;
  bulkCalls: string[];
  setBulk(body: any): void;
  failWith(err: unknown | null): void;
}

export function fakeTransport(body: any, sock = new FakeSocket()): FakeTransport {
  let current = body;
  let failure: unknown | null = null;
  const bulkCalls: string[] = [];
  return {
    sock,
    bulkCalls,
    canFallBack: false,
    setBulk(b) { current = b; },
    failWith(err) { failure = err; },
    async getBulk(path, signal) {
      bulkCalls.push(path);
      if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      if (failure) throw failure;
      return { data: JSON.parse(JSON.stringify(current)), bytes: 100 };
    },
    socket: () => sock,
    usingRelay: () => true,
    release() {},
  };
}

export function encodeFrame(type: 'MatchDataPayload' | 'OverallDataPayload', message: any): Uint8Array {
  const T: any = (overlayProto as any)[type];
  const body: Uint8Array = T.encode(T.fromObject(message)).finish();
  const out = new Uint8Array(body.length + 1);
  out[0] = 0xc1;
  out.set(body, 1);
  return out;
}

/** Let queued microtasks (engine publishes) and resolved fetches run. */
export async function settle(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
