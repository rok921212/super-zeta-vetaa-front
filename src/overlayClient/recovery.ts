// Recovery policy: snapshot requests, stall detection, and the connection
// state machine. Pure — the engine feeds it facts, it answers decisions.

import type { ConnectionPhase } from './engineTypes.ts';

// Backend keyframes only ride on ticks that carry a change, so if the LAST
// delta of a burst was lost and the match goes quiet (typically the final
// elimination) no keyframe would ever come. After this long with no live
// traffic, ask for one. Kept well above the backend's LIVE_KEYFRAME_MS (10s).
export const LIVE_STALL_MS = 30000;
export const STALL_CHECK_MS = 5000;
export const SNAPSHOT_MIN_INTERVAL_MS = 1000;
// The relay is declared offline after this long without any answer, but the
// engine never stops retrying.
export const RELAY_OFFLINE_AFTER_MS = 8000;
export const QUIET_REFETCH_DEBOUNCE_MS = 250;
// Slow backstop for a missed structure notification.
export const BACKSTOP_POLL_MS = 1800000;

/**
 * Rate-limits snapshot asks to one per interval — TRAILING-edge: an ask that
 * lands inside the interval is deferred to its end, never dropped. (The old
 * leading-edge limiter silently discarded e.g. a seq-gap ask that came <1s
 * after a startup/boundary ask, leaving the gap unrepaired until a backend
 * keyframe or the 30s stall watchdog.)
 */
export function createSnapshotRequester(send: (reason: string) => void, minIntervalMs = SNAPSHOT_MIN_INTERVAL_MS, clock: () => number = Date.now) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingReason: string | null = null;
  const fire = (reason: string) => {
    last = clock();
    send(reason);
  };
  return {
    /** Returns true when sent now, false when deferred. */
    request(reason: string): boolean {
      const t = clock();
      const wait = last + minIntervalMs - t;
      if (wait <= 0 && !timer) {
        fire(reason);
        return true;
      }
      pendingReason = reason;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          const r = pendingReason || 'deferred';
          pendingReason = null;
          fire(`${r} (deferred)`);
        }, Math.max(0, wait));
      }
      return false;
    },
    reset() {
      last = 0;
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pendingReason = null;
    },
  };
}

export interface PhaseFacts {
  destroyed: boolean;
  started: boolean;
  firstFetchDone: boolean;
  hasData: boolean;
  socketConnected: boolean;
  hasConnectedBefore: boolean;
  relayReachable: boolean;
  onCloudFallback: boolean;
  upstreamConnected: boolean | null;
  awaitingSnapshot: boolean;
  stale: boolean;
}

export function computePhase(f: PhaseFacts): ConnectionPhase {
  if (f.destroyed) return 'DESTROYED';
  if (!f.started) return 'IDLE';
  if (!f.relayReachable && !f.onCloudFallback) return 'RELAY_OFFLINE';
  if (!f.firstFetchDone || !f.hasData) return f.socketConnected ? 'HYDRATING' : 'CONNECTING';
  if (!f.socketConnected) return f.hasConnectedBefore ? 'RECONNECTING' : 'CONNECTING';
  if (f.upstreamConnected === false) return 'UPSTREAM_OFFLINE';
  if (f.awaitingSnapshot) return 'REHYDRATING';
  if (f.stale) return 'STALE';
  if (f.onCloudFallback) return 'DEGRADED';
  return 'CONNECTED';
}
