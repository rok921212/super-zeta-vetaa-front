import { io, Socket } from "socket.io-client";
import api from "../login/api"; // adjust path if needed

// Remove "/api" from the axios baseURL
const SOCKET_URL = (api.defaults.baseURL || "").replace(/\/api\/?$/, "");

// Same "user" localStorage shape login/page.tsx writes ({ ..., token }).
// Read fresh on every (re)connect attempt rather than captured once, so a
// later re-login's token is always picked up without needing to recreate
// the socket.
function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw)?.token ?? null : null;
  } catch {
    return null;
  }
}

// Minimal surface actually used by any consumer anywhere in front/src —
// confirmed via a full-repo grep of every `socket.on/.off/.emit/.connected`
// call site (isPolling.tsx, matchDataController.tsx, PublicThemeRenderer.tsx,
// DisplayHud.tsx, Round.tsx, dashboard/page.tsx, Theme6's Upper.tsx). Both a
// real socket.io-client Socket and SharedSocketProxy below satisfy this, so
// every existing call site keeps working unchanged regardless of which one
// connect() actually returns.
interface SharedSocketLike {
  on(event: string, cb: (...args: any[]) => void): void;
  off(event: string, cb: (...args: any[]) => void): void;
  emit(event: string, data?: any): void;
  readonly connected: boolean;
}

// Tab-side wrapper around a SharedWorker's MessagePort, presenting the same
// on/off/emit/connected surface a real Socket does. The real socket.io
// connection lives entirely inside sharedSocketWorker.ts — this class only
// relays: emit() posts a command to the worker, and the worker's forwarded
// events get dispatched to whichever local listeners this tab registered.
// See sharedSocketWorker.ts's header comment for the exact message protocol.
class SharedSocketProxy implements SharedSocketLike {
  private listeners = new Map<string, Set<(...args: any[]) => void>>();
  connected = false;

  constructor(private port: MessagePort) {
    port.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "status") {
        // One-time sync sent right after this tab's port connects, so a
        // tab that mounts after the worker's socket is already connected
        // (the common case — the worker outlives any single tab) doesn't
        // have to wait for the next transition to know the real state.
        this.connected = !!msg.connected;
        return;
      }
      if (msg.type === "event") {
        if (msg.event === "connect") this.connected = true;
        else if (msg.event === "disconnect" || msg.event === "connect_error") this.connected = false;

        const set = this.listeners.get(msg.event);
        if (set) for (const cb of set) cb(msg.data);
      }
    };

    // Lets the worker prune this tab's port promptly instead of leaking it
    // until the next failed postMessage — see sharedSocketWorker.ts.
    window.addEventListener("beforeunload", () => {
      try {
        port.postMessage({ type: "disconnect" });
      } catch {
        // tab already tearing down — nothing to do
      }
    });
  }

  on(event: string, cb: (...args: any[]) => void): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
  }

  off(event: string, cb: (...args: any[]) => void): void {
    this.listeners.get(event)?.delete(cb);
  }

  emit(event: string, data?: any): void {
    this.port.postMessage({ type: "emit", event, data });
  }

  // Relays the current auth token to the worker — see
  // sharedSocketWorker.ts's header comment for the protocol. Sent right
  // after construction (this tab may hold a more recently issued token
  // than whichever tab originally spun the worker up) and again whenever
  // the token changes (login/logout).
  sendAuth(token: string | null): void {
    this.port.postMessage({ type: "auth", token });
  }
}

class SocketManager {
  private static instance: SocketManager;
  private socket: SharedSocketLike | null = null;
  private usingSharedWorker = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {}

  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  /**
   * Returns the shared socket, creating it only the very first time it's
   * needed. Safe to call from as many components as you like — they all
   * share the same underlying connection.
   *
   * IMPORTANT FIX: the previous version re-created the socket whenever
   * `this.socket.disconnected` was true. But a freshly-created socket.io
   * client is `disconnected === true` for the brief async gap between
   * `io(...)` being called and the `'connect'` event actually firing. Any
   * component calling `connect()` during that gap (e.g. two components
   * mounting close together, or React StrictMode double-invoking effects
   * in dev) would see `disconnected === true` and spin up a SECOND socket,
   * silently orphaning the first — each orphan still finishes connecting
   * on its own, leaking a real connection to the server. That's why you'd
   * see "Creating new socket connection" / "Socket connected" logged
   * multiple times for what should be a single shared connection.
   *
   * Fix: only create a socket if one has never been created (`this.socket
   * === null`). Once it exists, `reconnection: true` (already configured
   * below) is responsible for bringing it back after any drop — we no
   * longer tear down and replace it just because it's momentarily
   * disconnected.
   *
   * There is still no "connection count" here — components must NOT call
   * disconnect() when they unmount (see disconnect() below). This
   * connection is meant to live for the lifetime of the browser tab.
   *
   * BANDWIDTH: each overlay view is opened as its own browser tab/OBS
   * source (see DisplayHud.tsx's window.open calls), so "one socket per
   * tab" used to mean one full connection PER OPEN OVERLAY, all watching
   * the same rooms. connect() now tries to share a single real connection
   * across every same-origin tab in one browser profile via a SharedWorker
   * (sharedSocketWorker.ts) first, and only falls back to a local per-tab
   * `io()` connection — today's exact prior behavior — if SharedWorker
   * isn't available or fails to construct. Never a regression either way;
   * see the project plan for why sharing isn't guaranteed everywhere
   * (regular tabs: yes: separate OBS Browser Source docks: unverified).
   */
  connect(): SharedSocketLike {
    if (!this.socket) {
      const shared = this.tryConnectSharedWorker();
      if (shared) {
        console.log("SocketManager: connected via SharedWorker (sharing one connection with every other open tab in this browser)");
        this.socket = shared;
        this.usingSharedWorker = true;
      } else {
        console.log("SocketManager: Creating new socket connection");
        this.socket = this.createLocalSocket();
        this.usingSharedWorker = false;
      }
    }

    return this.socket;
  }

  private tryConnectSharedWorker(): SharedSocketProxy | null {
    if (typeof SharedWorker === "undefined") return null;
    try {
      const worker = new SharedWorker(new URL("./sharedSocketWorker.ts", import.meta.url), {
        name: "bw-shared-socket",
        type: "module",
      });
      worker.onerror = (err) => {
        // Construction succeeded but the worker script itself failed to
        // load/run (e.g. a build/deploy issue) — nothing to hot-swap to
        // here (connect() has already returned the proxy to callers), but
        // logging loudly makes this diagnosable instead of a silent
        // "never connects" for whoever's using this tab.
        console.error("SocketManager: SharedWorker failed to load, this tab's socket will not connect:", err);
      };
      const proxy = new SharedSocketProxy(worker.port);
      // The worker's own io(...) call waits (autoConnect: false) for this
      // message before ever connecting — see sharedSocketWorker.ts. Also
      // covers the case where a LATER tab holds a more recently issued
      // token than whichever tab originally spun the worker up.
      proxy.sendAuth(getStoredToken());
      return proxy;
    } catch (err) {
      console.warn("SocketManager: SharedWorker unavailable, falling back to a local per-tab connection:", err);
      return null;
    }
  }

  private createLocalSocket(): Socket {
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      // Callback form (not a static object) so every (re)connection
      // attempt re-reads localStorage fresh — a static object captured
      // once here would go stale after a later re-login, since nothing
      // recreates this socket on its own.
      auth: (cb) => cb({ token: getStoredToken() }),
      reconnection: true,
      reconnectionAttempts: Infinity, // keep trying — this tab may run unattended in OBS for hours
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // Bandwidth: declares this client can decode msgpack on the
      // dashboard's user:${userKey} liveMatchUpdate (today it's plain
      // JSON there). PERMANENT negotiated default, not a rollout flag —
      // an old/unreloaded tab that never sends this keeps getting plain
      // JSON forever, correctly. See matchDataController.tsx's
      // decodeIncoming for the matching decode step.
      query: { msgpackLiveUpdate: "1" },
    });

    socket.on("connect", () => {
      console.log(`[bw][socketManager] connected id=${socket.id} msgpackLiveUpdate=1 (negotiated for user: room liveMatchUpdate)`);
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("SocketManager: Socket disconnected:", reason);
      // socket.io's own `reconnection: true` already handles reconnecting
      // the SAME socket instance for us in almost every case. This manual
      // fallback only exists as a belt-and-braces safety net for reasons
      // socket.io itself won't auto-retry (e.g. the server explicitly
      // disconnected the client).
      if (reason === "io server disconnect") {
        this.scheduleReconnect(socket);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("SocketManager: Connection error:", error);
      this.scheduleReconnect(socket);
    });

    return socket;
  }

  /**
   * Components should call this on unmount ONLY to clean up their own
   * listeners — NOT to tear down the shared socket. This method
   * intentionally does nothing to the underlying connection.
   *
   * Kept as a no-op (rather than deleted) so existing call sites like
   * `socketManager.disconnect()` don't need to be ripped out everywhere —
   * they just stop being destructive.
   */
  disconnect(): void {
    // Intentionally does not touch this.socket.
    // A shared connection must never be closed just because one component
    // (Alerts, LiveStats, Dom, etc.) unmounted or re-ran its effect — other
    // components (and, via SharedWorker, other TABS) may still depend on
    // it, and there is no reliable way to count "how many are actively
    // using it" from here.
    console.log(
      "SocketManager: disconnect() called — no-op, shared socket stays alive"
    );
  }

  /**
   * Use this only for an actual full teardown, e.g. on logout or when the
   * whole app is shutting down — never from a single component's cleanup.
   * This is the only place that should ever set this.socket back to null,
   * so a subsequent connect() correctly creates a fresh instance.
   *
   * For the SharedWorker path this only drops THIS tab's own proxy/port —
   * it deliberately does not (and cannot, from one tab) tear down the real
   * connection living in the worker, since other open tabs may still
   * depend on it. That mirrors disconnect()'s own "never destroy what
   * others may need" rule above.
   */
  forceDisconnect(): void {
    if (this.socket) {
      console.log("SocketManager: Force-closing socket connection");
      if (!this.usingSharedWorker) {
        (this.socket as Socket).disconnect();
      }
      this.socket = null;
      this.usingSharedWorker = false;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(socket: Socket): void {
    if (this.reconnectTimer) return;

    console.log("SocketManager: Scheduling reconnection in 3 seconds");

    this.reconnectTimer = setTimeout(() => {
      console.log("SocketManager: Attempting to reconnect");
      // socket already exists at this point (this.socket is only ever set
      // to null by forceDisconnect()), so this just nudges socket.io's own
      // reconnection logic rather than creating another instance.
      socket.connect();
      this.reconnectTimer = null;
    }, 3000);
  }

  /**
   * Call right after a token changes — a fresh login (new token) or a
   * logout (token: null) — so an already-open connection picks it up
   * immediately instead of waiting for its next natural reconnect.
   *
   * Only the SharedWorker path needs an explicit push: a SharedWorker has
   * no localStorage access, so sharedSocketWorker.ts can't just re-read it
   * itself (see its header comment for the message protocol). The local
   * per-tab fallback needs nothing — createLocalSocket's callback-style
   * `auth` above already re-reads localStorage on every reconnect for
   * free, and this method's caller (e.g. logout) is expected to pair this
   * with forceDisconnect()/a fresh connect() to actually force that
   * reconnect for the local-socket case.
   */
  updateAuthToken(token: string | null): void {
    if (this.usingSharedWorker && this.socket instanceof SharedSocketProxy) {
      this.socket.sendAuth(token);
    }
  }

  getSocket(): SharedSocketLike | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export default SocketManager;
