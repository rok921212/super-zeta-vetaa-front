// How the engine reaches the data. The PROTOCOL (paths, wire formats, events)
// is identical for every transport; only the plumbing differs:
//
//   createDirectTransport(origin) — plain fetch + its own socket.io client,
//     pinned to one origin (the local relay by default). Used by the external
//     SDK and the Designer's live preview. Relay-only by design.
//   createAppTransport()          — ./appTransport.ts: the front app's axios
//     `api` + shared SocketManager (relay first, reactive cloud fallback).
//     Used by PublicThemeRenderer and the published Designer runtime.

import { io, type Socket } from 'socket.io-client';
import { decode } from '@msgpack/msgpack';
import { HttpError, AbortError } from './retry.ts';

type Listener = (...args: any[]) => void;

/** The socket surface the engine uses (a socket.io Socket and the app's ResilientSocket both satisfy it). */
export interface EngineSocket {
  on(event: string, cb: Listener): void;
  off(event: string, cb: Listener): void;
  emit(event: string, data?: any): void;
  readonly connected: boolean;
}

export interface BulkResponse {
  data: any;
  bytes: number;
}

export interface EngineTransport {
  /** GET `/api/<path>` (path has no leading slash, e.g. `public/bulk/...`). Throws HttpError / network Error / AbortError. */
  getBulk(path: string, signal: AbortSignal): Promise<BulkResponse>;
  socket(): EngineSocket;
  /** True while the data path is the local relay (false = cloud fallback, or not a relay transport). */
  usingRelay(): boolean;
  /** Can this transport fall back to the cloud? (Only the app transport can.) */
  readonly canFallBack: boolean;
  /** Engine is done with the transport. */
  release(): void;
}

export const DEFAULT_RELAY_ORIGIN = 'http://127.0.0.1:8787';

/** Decode a bulk body: MessagePack normally, JSON when a backend without Redis serves it. */
export function decodeBulkBody(buf: Uint8Array, contentType: string | null | undefined): any {
  if ((contentType || '').includes('json')) return JSON.parse(new TextDecoder().decode(buf));
  return decode(buf);
}

export function createDirectTransport(origin: string = DEFAULT_RELAY_ORIGIN, opts: { client?: string } = {}): EngineTransport {
  const base = origin.replace(/\/+$/, '');
  let sock: Socket | null = null;
  return {
    canFallBack: false,
    async getBulk(path, signal) {
      let res: Response;
      try {
        res = await fetch(`${base}/api/${path}`, { signal, cache: 'no-store' });
      } catch (err: any) {
        if (signal.aborted) throw new AbortError();
        throw err;
      }
      if (!res.ok) {
        const ra = Number(res.headers.get('retry-after'));
        throw new HttpError(res.status, Number.isFinite(ra) && ra > 0 ? ra : null);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      return { data: decodeBulkBody(buf, res.headers.get('content-type')), bytes: buf.byteLength };
    },
    socket() {
      if (!sock) {
        sock = io(base, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 500,
          reconnectionDelayMax: 2000,
          query: { client: opts.client ?? 'overlay' },
        });
      }
      return sock;
    },
    usingRelay: () => true,
    release() {
      if (sock) {
        sock.removeAllListeners();
        sock.close();
        sock = null;
      }
    },
  };
}
