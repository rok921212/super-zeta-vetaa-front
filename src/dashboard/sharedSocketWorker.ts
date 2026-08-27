/// <reference lib="webworker" />
// sharedSocketWorker.ts — owns ONE socket.io-client connection shared across
// every same-origin tab (in the same browser profile) that opens this
// SharedWorker, instead of each overlay tab independently creating its own
// connection to the backend. See socketManager.tsx for the tab-side wrapper,
// which feature-detects SharedWorker support and falls back to a local
// per-tab connection (today's exact behavior) wherever it isn't available or
// doesn't end up shared — e.g. confirmed working for ordinary browser tabs,
// unverified across separate OBS Browser Source docks (see the project plan
// for how overlays actually reach OBS).
//
// Protocol between a tab (socketManager.tsx's SharedSocketProxy) and this
// worker, over each tab's own MessagePort:
//   tab    -> worker: { type: 'emit', event: string, data: any }
//   tab    -> worker: { type: 'disconnect' }               (tab is unloading)
//   tab    -> worker: { type: 'auth', token: string | null }
//   worker -> tab:    { type: 'event', event: string, data: any }
//   worker -> tab:    { type: 'status', connected: boolean }
//
// Auth: a SharedWorker has no window/localStorage, so it can't read the
// JWT itself — every tab sends it one right after connecting (see
// socketManager.tsx's tryConnectSharedWorker), since a later tab may hold
// a more recently issued token than whichever tab originally spun this
// worker up. The very first connection is held off (autoConnect: false
// below) until the first 'auth' message arrives, so it never fires
// without a token already in hand; a token that actually CHANGES while
// already connected (e.g. a different user logging in) forces a
// reconnect so the new handshake carries it.
import { io, Socket } from 'socket.io-client';
import api from '../login/api';

declare const self: SharedWorkerGlobalScope;

// Same derivation as socketManager.tsx's per-tab fallback — kept identical
// so both paths always point at the same backend.
const SOCKET_URL = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');

// Every event any consumer anywhere in front/src actually listens for on the
// shared socket, confirmed via a full-repo grep of `socket.on(...)` call
// sites (isPolling.tsx, matchDataController.tsx, PublicThemeRenderer.tsx,
// DisplayHud.tsx, Round.tsx, dashboard/page.tsx, Theme6's Upper.tsx) —
// including 'connect'/'disconnect'/'connect_error' themselves (isPolling.tsx
// tracks live transport status off these). Registered on the real connection
// exactly once here, then fanned out to every connected tab's port — a room
// broadcast to N tabs used to mean N separate socket.io deliveries from the
// server; now it's one delivery here plus N cheap in-browser postMessage
// copies. socketManager.tsx's SharedSocketProxy special-cases these three by
// NAME (not a separate message type) to keep its own `.connected` in sync —
// see its onmessage handler.
const FORWARDED_EVENTS = [
  'liveMatchUpdate',
  'overallDataUpdate',
  'pollingStatusUpdated',
  'matchSelected',
  'matchDeselected',
  'matchDeleted',
  'matchCreated',
  'matchUpdated',
  'connect',
  'disconnect',
  'connect_error',
] as const;

const ports = new Set<MessagePort>();

// Set by the first 'auth' message any tab sends — see the header comment.
let currentToken: string | null = null;

const socket: Socket = io(SOCKET_URL, {
  transports: ['websocket'],
  auth: (cb) => cb({ token: currentToken }),
  // Held off until a tab hands us a token (see port.onmessage's 'auth'
  // case below) so the very first handshake never fires tokenless.
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  // Same negotiation as socketManager.tsx's per-tab fallback — see there
  // for why this is a permanent default, not a rollout flag.
  query: { msgpackLiveUpdate: '1' },
});

// Deliberately NOT using postMessage's transferable-objects list here: a
// transfer detaches the buffer from every context but the one recipient it
// was handed to, which would silently corrupt/empty the payload for every
// OTHER port in this fan-out broadcast. Plain structured-clone (the
// default — a real copy per port) is correct for a one-to-many broadcast,
// and at these payload sizes the copy cost is negligible next to the
// bandwidth already saved by not opening N separate socket connections.
function broadcast(message: { type: 'event'; event: string; data: unknown } | { type: 'status'; connected: boolean }) {
  for (const port of ports) {
    try {
      port.postMessage(message);
    } catch {
      // A port whose tab already closed can throw here in some browsers
      // instead of silently no-op'ing — drop it rather than let one dead
      // port break the broadcast for every other still-open tab.
      ports.delete(port);
    }
  }
}

for (const event of FORWARDED_EVENTS) {
  socket.on(event, (data: unknown) => broadcast({ type: 'event', event, data }));
}

self.onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  ports.add(port);

  port.onmessage = (msg: MessageEvent) => {
    const message = msg.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'emit') {
      socket.emit(message.event, message.data);
    } else if (message.type === 'disconnect') {
      ports.delete(port);
      // Last tab gone — tear the real connection down now instead of
      // leaving it for the browser to eventually garbage-collect this
      // idle SharedWorker on its own schedule (unspecified timing, not
      // guaranteed to be prompt). A later tab's 'auth' message reconnects
      // it fresh, same as the very first connection.
      if (ports.size === 0 && socket.connected) {
        socket.disconnect();
      }
    } else if (message.type === 'auth') {
      const changed = message.token !== currentToken;
      currentToken = message.token;
      if (!socket.connected) {
        // Deferred first connection (autoConnect: false above), or a
        // reconnect attempt already in flight — either way, connect()
        // picks up currentToken via the auth callback fresh.
        socket.connect();
      } else if (changed) {
        // Already connected under a different identity (e.g. a different
        // user just logged in in some tab) — the existing handshake was
        // authenticated with the old token, so it must be redone.
        socket.disconnect();
        socket.connect();
      }
    }
  };

  // A tab connecting after the socket already has a real connection state
  // (the common case — this worker outlives any single tab) shouldn't wait
  // for the next 'connect'/'disconnect' event to fire to learn it — this is
  // a one-time sync for THIS new port only, distinct from the recurring
  // 'connect'/'disconnect' broadcasts above (which is why it's its own
  // 'status' message type, not folded into FORWARDED_EVENTS).
  port.postMessage({ type: 'status', connected: socket.connected });
};
