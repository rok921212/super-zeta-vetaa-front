// Cold start and sleep.
//
// The backend runs on a Render plan that sleeps after about 15 minutes idle;
// the first request after that waits for it to boot. And a laptop that slept
// comes back with a socket that looks connected but is dead until the
// heartbeat notices (~18 s), or one sitting out a reconnect backoff.
//
// startWakeWatch() (called once from index.js):
//   - wakes the server as soon as the page loads, before login or any data
//     request, so the boot overlaps with the page loading;
//   - on a return from sleep (clock jump), the network coming back, or the
//     tab shown again after a long time hidden: wakes the server and drops +
//     reopens the shared socket at once (consumers, including the overlay
//     engine, re-join and refetch on its `connect` as on any reconnect).
// Overlay pages (OBS sources) talk only to the local relay — the desktop app
// wakes the server and the relay's cloud sockets for them — so they only
// reconnect their relay socket.

import { DEFAULT_BACKEND, RELAY_ONLY, setBackendWaking } from '../login/api';
import SocketManager from '../dashboard/socketManager';

const TICK_MS = 5000;
/** A tick this late (wall clock) means the machine slept. */
const SLEEP_GAP_MS = 30000;
/** Shown again after at least this long hidden counts as a wake. */
const LONG_HIDDEN_MS = 60000;

let wakeInFlight: Promise<boolean> | null = null;

/** Ask the cloud backend to come up; resolves true once it is ready. */
export function wakeBackend(): Promise<boolean> {
  if (RELAY_ONLY) return Promise.resolve(true);
  if (wakeInFlight) return wakeInFlight;
  wakeInFlight = (async () => {
    const slow = setTimeout(() => setBackendWaking(true), 1500);
    try {
      const res = await fetch(`${DEFAULT_BACKEND}/api/wake`, { cache: 'no-store' });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(slow);
      setBackendWaking(false);
      wakeInFlight = null;
    }
  })();
  return wakeInFlight;
}

/** "Reconnect now" and every wake signal. */
export function reconnectNow(why = 'manual'): void {
  void wakeBackend();
  SocketManager.getInstance().forceReconnect(why);
}

let started = false;
export function startWakeWatch(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  void wakeBackend();

  const visible = () => {
    try {
      return document.visibilityState === 'visible';
    } catch {
      return true;
    }
  };

  // Clock-jump check. Only while visible at both ticks: a hidden tab's timers
  // are throttled to about once a minute, which is not a sleep.
  let last = Date.now();
  let lastVisible = visible();
  setInterval(() => {
    const now = Date.now();
    const isVisible = visible();
    if (isVisible && lastVisible && now - last > SLEEP_GAP_MS) reconnectNow('resume from sleep');
    last = now;
    lastVisible = isVisible;
  }, TICK_MS);

  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (!visible()) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt != null && Date.now() - hiddenAt >= LONG_HIDDEN_MS) reconnectNow('shown after a long time hidden');
    hiddenAt = null;
  });
  window.addEventListener('online', () => reconnectNow('network back'));
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) reconnectNow('restored from page cache');
  });
}
