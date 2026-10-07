// The front app's transport for the overlay engine: the shared axios `api`
// (relay-first on overlay routes, with reactive cloud fallback + health-probe
// return — login/api.tsx) and the page's one shared SocketManager socket.
//
// Kept out of transport.ts so the external SDK bundle never pulls in axios or
// the app's auth/localStorage plumbing.

import api, { isUsingRelay } from '../login/api.tsx';
import SocketManager from '../dashboard/socketManager.tsx';
import { HttpError, AbortError } from './retry.ts';
import { decodeBulkBody, type EngineTransport, type EngineSocket } from './transport.ts';

export function createAppTransport(): EngineTransport {
  return {
    canFallBack: true,
    async getBulk(path, signal) {
      try {
        const res = await api.get(path, { signal, responseType: 'arraybuffer' });
        const buf = new Uint8Array(res.data);
        return { data: decodeBulkBody(buf, res.headers?.['content-type']), bytes: buf.byteLength };
      } catch (err: any) {
        if (signal.aborted || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') throw new AbortError();
        const status = err?.response?.status;
        if (status) {
          const ra = Number(err.response.headers?.['retry-after']);
          throw new HttpError(status, Number.isFinite(ra) && ra > 0 ? ra : null);
        }
        throw err; // network error / timeout — transient
      }
    },
    socket(): EngineSocket {
      // Shared for the life of the page — never closed by a consumer.
      return SocketManager.getInstance().connect();
    },
    usingRelay: () => isUsingRelay(),
    release() {
      /* the shared socket outlives any one engine */
    },
  };
}
