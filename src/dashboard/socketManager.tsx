import { io, Socket } from "socket.io-client";
import { getBackendOrigin, isOverlayRoute, isUsingRelay, markRelayUnreachable, RELAY_ONLY } from "../login/api";

// One socket.io connection per browser tab / OBS Browser Source, shared across
// every React component in that page via this singleton.
//
// Overlay pages (/public/*) point this at the co-located desktop overlay relay
// (http://127.0.0.1:8787) — see login/api.tsx. Each OBS Browser Source is its
// own CEF process, so there is no cross-source sharing to do at this layer:
// the relay is what collapses N sources to one upstream connection to Render.
// (The previous SharedWorker path only ever helped same-process browser tabs
// and could not bridge OBS sources; it was removed with the relay-first
// architecture — see the bandwidth plan.)
//
// Overlay pages are relay-only (login/api.tsx RELAY_ONLY): if the relay stops
// answering, the socket keeps reconnecting to it and the overlay keeps its
// last data — it never swaps to the cloud. Other pages with an explicit
// `?relay=` still swap to the direct cloud origin (markRelayUnreachable).

type Listener = (...args: any[]) => void;

// Minimal surface every consumer in front/src actually uses on the socket
// (confirmed via a full-repo grep of socket.on/.off/.emit/.connected/.id) —
// both a real socket.io Socket and ResilientSocket below satisfy it.
export interface SocketLike {
  on(event: string, cb: Listener): void;
  off(event: string, cb: Listener): void;
  emit(event: string, data?: any): void;
  readonly connected: boolean;
  readonly id?: string;
  readonly recovered: boolean;
}

// Same "user" localStorage shape login/page.tsx writes ({ ..., token }). Read
// fresh on every (re)connect (callback-style `auth` below) so a later
// re-login's token is picked up without recreating the socket.
function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw)?.token ?? null : null;
  } catch {
    return null;
  }
}

// Relay connect_errors tolerated before falling back to the cloud origin.
// With the relay's 2s reconnect cap this is ~6s — enough to ride out a
// desktop-supervisor respawn without ever leaving the relay.
const RELAY_ERRORS_BEFORE_FALLBACK = 5;

function makeSocket(url: string): Socket {
  return io(url, {
    transports: ["websocket"],
    auth: (cb) => cb({ token: getStoredToken() }),
    reconnection: true,
    reconnectionAttempts: Infinity, // this tab may run unattended in OBS for hours
    reconnectionDelay: 500,
    // Loopback relay: retry fast (a restart takes ~1-3s). Cloud: back off more.
    reconnectionDelayMax: isUsingRelay() ? 2000 : 5000,
    // Declares this client can decode msgpack on the dashboard's
    // user:<id> liveMatchUpdate. PERMANENT negotiated default, not a rollout
    // flag. See matchDataController.tsx's decodeIncoming.
    // `client` labels this socket in the backend's egress accounting, and
    // `overlay` keeps it out of the dashboard-only user:<id> room.
    query: { msgpackLiveUpdate: "1", client: isOverlayRoute() ? "overlay" : "dashboard" },
  });
}

// A socket facade whose backing io() connection can be swapped (relay -> cloud
// on fallback) while every consumer keeps the same object reference and its
// registered listeners.
class ResilientSocket implements SocketLike {
  private sock: Socket;
  private listeners = new Map<string, Set<Listener>>();
  private relayErrors = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Follows login/api.tsx's origin in BOTH directions: `relay-fallback` (an
  // /api call gave up on the relay) and `relay-restored` (its health probe
  // answered again) — so the socket + HTTP never end up split across two
  // backends, and a page that fell back returns to the relay on its own.
  private onRelayFallback = () => {
    if (getBackendOrigin() !== this.currentUrl) this.swap(getBackendOrigin());
  };
  private currentUrl: string;

  constructor(url: string) {
    this.currentUrl = url;
    this.sock = this.build(url);
    try {
      window.addEventListener("relay-fallback", this.onRelayFallback);
      window.addEventListener("relay-restored", this.onRelayFallback);
    } catch {
      /* non-DOM context */
    }
  }

  private build(url: string): Socket {
    this.currentUrl = url;
    console.log(`SocketManager: connecting to ${url}${isUsingRelay() ? " (local overlay relay)" : ""}`);
    const s = makeSocket(url);

    s.on("connect", () => {
      this.relayErrors = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      console.log(`[bw][socketManager] connected id=${s.id} url=${url} recovered=${(s as any).recovered ?? false}`);
    });

    s.on("disconnect", (reason: string) => {
      console.log("SocketManager: disconnected:", reason);
      if (reason === "io server disconnect") this.scheduleReconnect();
    });

    s.on("connect_error", (err: any) => {
      console.error("SocketManager: connection error:", err?.message || err);
      // If the backend origin has already moved on (an /api call fell back
      // first), catch up immediately. Otherwise, after a couple of failed
      // attempts against the relay, give up on it and fall back to cloud.
      if (getBackendOrigin() !== url) {
        this.swap(getBackendOrigin());
        return;
      }
      if (RELAY_ONLY) {
        // Overlay page: never swap to the cloud. socket.io keeps retrying
        // the relay on its own (reconnectionAttempts: Infinity); this only
        // flags it as down so RelayGate / the probe can follow.
        if (++this.relayErrors >= RELAY_ERRORS_BEFORE_FALLBACK) markRelayUnreachable();
        return;
      }
      if (isUsingRelay() && ++this.relayErrors >= RELAY_ERRORS_BEFORE_FALLBACK) {
        markRelayUnreachable();
        this.swap(getBackendOrigin());
        return;
      }
      this.scheduleReconnect();
    });

    // Re-attach every consumer listener to the new backing socket.
    for (const [event, set] of this.listeners) {
      for (const cb of set) s.on(event, cb);
    }
    return s;
  }

  // Fire a tracked consumer listener directly (not via the socket) — used to
  // drive consumers through a synthetic disconnect on a transport swap.
  private dispatch(event: string, ...args: any[]): void {
    const set = this.listeners.get(event);
    if (set) for (const cb of [...set]) cb(...args);
  }

  private swap(url: string): void {
    if (url === this.currentUrl && this.sock.connected) return;
    console.warn(`SocketManager: swapping socket backend -> ${url}`);
    try {
      this.sock.removeAllListeners();
      this.sock.disconnect();
    } catch {
      /* noop */
    }
    // Let consumers see the transport go away, so effects keyed on connect
    // state (e.g. PublicThemeRenderer's joinRoundRoom effect) tear down and
    // then re-run on the new socket's real `connect` — otherwise a
    // still-"connected" status would skip the re-join and the new socket
    // would sit in no room.
    this.dispatch("disconnect", "transport swap");
    this.relayErrors = 0;
    this.sock = this.build(url); // re-attaches tracked listeners; will fire `connect`
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.sock.connect();
    }, 3000);
  }

  on(event: string, cb: Listener): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    this.sock.on(event, cb);
  }

  off(event: string, cb: Listener): void {
    this.listeners.get(event)?.delete(cb);
    this.sock.off(event, cb);
  }

  emit(event: string, data?: any): void {
    this.sock.emit(event, data);
  }

  connect(): void {
    this.sock.connect();
  }

  teardown(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      window.removeEventListener("relay-fallback", this.onRelayFallback);
      window.removeEventListener("relay-restored", this.onRelayFallback);
    } catch {
      /* non-DOM context */
    }
    try {
      this.sock.removeAllListeners();
      this.sock.disconnect();
    } catch {
      /* noop */
    }
    this.listeners.clear();
  }

  get connected(): boolean {
    return this.sock.connected;
  }

  get id(): string | undefined {
    return this.sock.id;
  }

  get recovered(): boolean {
    return (this.sock as any).recovered ?? false;
  }
}

class SocketManager {
  private static instance: SocketManager;
  private socket: ResilientSocket | null = null;

  // Dashboard feed gate (backend `setUserFeed`): this tab receives the
  // user:<id> liveMatchUpdate stream only while some page holds it
  // (acquireUserFeed — the match-data page) AND the tab is visible. Every
  // other dashboard page, and a hidden tab, gets just the dataHeartbeat.
  private feedHolders = 0;
  private lastSentFeed: boolean | null = null;
  private onVisibility = () => this.syncUserFeed();

  private constructor() {
    try {
      if (!isOverlayRoute()) document.addEventListener("visibilitychange", this.onVisibility);
    } catch {
      /* non-DOM context */
    }
  }

  private wantUserFeed(): boolean {
    try {
      return this.feedHolders > 0 && document.visibilityState === "visible";
    } catch {
      return this.feedHolders > 0;
    }
  }

  // force: always send (on connect — the server's per-socket state may be a
  // fresh default or a recovered session's, so never assume it).
  private syncUserFeed(force = false): void {
    if (isOverlayRoute() || !this.socket || !this.socket.connected) return;
    const want = this.wantUserFeed();
    if (!force && want === this.lastSentFeed) return;
    // Resuming: the server replays a full baseline with the current seq —
    // consumers reset their seq tracking so it isn't read as a gap.
    if (want && this.lastSentFeed === false) {
      try {
        window.dispatchEvent(new CustomEvent("user-feed-resumed"));
      } catch {
        /* non-DOM context */
      }
    }
    this.lastSentFeed = want;
    this.socket.emit("setUserFeed", { on: want });
  }

  /** Hold the live user:<id> match stream for as long as the caller is
   * mounted; returns the release function. */
  acquireUserFeed(): () => void {
    this.feedHolders++;
    this.syncUserFeed();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.feedHolders = Math.max(0, this.feedHolders - 1);
      this.syncUserFeed();
    };
  }

  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  /**
   * Returns the shared socket, creating it only the first time. Safe to call
   * from any number of components — they all share the one connection. This
   * connection is meant to live for the lifetime of the tab; components must
   * NOT call disconnect() on unmount (see below).
   */
  connect(): SocketLike {
    if (!this.socket) {
      this.socket = new ResilientSocket(getBackendOrigin());
      // Tracked listener: survives transport swaps like any consumer's.
      this.socket.on("connect", () => this.syncUserFeed(true));
    }
    return this.socket;
  }

  /**
   * A no-op. Kept so existing `socketManager.disconnect()` call sites don't
   * need removing — a shared connection must never be closed just because one
   * component unmounted.
   */
  disconnect(): void {
    console.log("SocketManager: disconnect() called — no-op, shared socket stays alive");
  }

  /** Full teardown — logout / app shutdown only, never a component cleanup. */
  forceDisconnect(): void {
    if (this.socket) {
      console.log("SocketManager: force-closing socket connection");
      this.socket.teardown();
      this.socket = null;
      this.lastSentFeed = null;
    }
  }

  /**
   * Kept for existing login/logout call sites. The per-tab socket's
   * callback-style `auth` re-reads localStorage on its next (re)connect, and
   * logout pairs this with forceDisconnect(), so nothing more is needed here.
   */
  updateAuthToken(_token: string | null): void {
    /* intentionally empty — see doc comment */
  }

  getSocket(): SocketLike | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export default SocketManager;
