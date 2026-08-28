import axios from "axios";

const DEFAULT_BACKEND = "https://super-zeta-beta-back-h89c.onrender.com";
// Keep in sync with desktop-app/relay/server.cjs RELAY_PORT and
// src-tauri/src/overlay_relay.rs RELAY_PORT.
const DEFAULT_RELAY_ORIGIN = "http://127.0.0.1:8787";

// An explicit `?relay=<origin>` on the page URL — dev, or a non-standard relay
// port. Overrides the route-based default below. http://127.0.0.1 is a
// "potentially trustworthy" origin, so an https overlay page may call it with
// no mixed-content block.
export function getRelayOrigin(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const r = new URLSearchParams(window.location.search).get("relay");
    if (!r) return null;
    return new URL(r).origin;
  } catch {
    return null;
  }
}

// Overlay pages live under /public/. The production machine runs the desktop
// app, which spawns the local overlay relay (desktop-app/relay/server.cjs), so
// every OBS Browser Source routes its socket + /api traffic through that one
// relay instead of opening its own connection to Render — N co-located
// sources collapse to ONE upstream connection. The dashboard (every other
// route) always talks to Render directly: the relay only proxies the public
// round feed + /api/public/*.
function isOverlayRoute(): boolean {
  try {
    return typeof window !== "undefined" && window.location.pathname.startsWith("/public/");
  } catch {
    return false;
  }
}

const EXPLICIT_RELAY = getRelayOrigin();
const RELAY_ORIGIN = EXPLICIT_RELAY || DEFAULT_RELAY_ORIGIN;
const RELAY_IS_DEFAULT = !!EXPLICIT_RELAY || isOverlayRoute();

let backendOrigin = RELAY_IS_DEFAULT ? RELAY_ORIGIN : DEFAULT_BACKEND;
let relayFellBack = false;

// Chrome Private / Local Network Access: an overlay page served from a
// non-secure, non-loopback origin (a LAN IP like http://192.168.x.x:3001)
// that then calls the loopback relay is a "less-private → loopback" request.
// Chrome currently only warns; once enforcement lands it may prompt or block.
// The relay opts in via `Access-Control-Allow-Private-Network`, but the clean
// fix is to serve the overlay from localhost (loopback → loopback never
// triggers the check) or an https:// host (secure context).
try {
  const isLoopbackHost = (h: string) =>
    h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
  if (
    RELAY_IS_DEFAULT &&
    typeof window !== "undefined" &&
    !window.isSecureContext &&
    !isLoopbackHost(window.location.hostname) &&
    (() => { try { return isLoopbackHost(new URL(RELAY_ORIGIN).hostname); } catch { return false; } })()
  ) {
    console.warn(
      `[relay] overlay served from a non-secure LAN origin (${window.location.origin}); ` +
      `Chrome may prompt or block access to the local relay (${RELAY_ORIGIN}). ` +
      `Open it via http://localhost:${window.location.port || "80"} or an https:// host instead.`
    );
  }
} catch {
  /* non-DOM context */
}

const api = axios.create({
  baseURL: `${backendOrigin}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

/** The origin socket + HTTP traffic should currently use (relay or cloud). */
export function getBackendOrigin(): string {
  return backendOrigin;
}

/** True while this page's traffic is (still) pointed at the local relay. */
export function isUsingRelay(): boolean {
  return RELAY_IS_DEFAULT && !relayFellBack;
}

// Called once when the relay origin doesn't answer (socket connect_error, or a
// network error on an /api call) — permanently drop to the direct cloud origin
// for the rest of this page's life so a relay hiccup never blanks a live
// overlay. Fires a `relay-fallback` window event the dashboard can surface.
export function markRelayUnreachable(): void {
  if (relayFellBack || !RELAY_IS_DEFAULT) return;
  relayFellBack = true;
  backendOrigin = DEFAULT_BACKEND;
  api.defaults.baseURL = `${backendOrigin}/api`;
  console.warn("[relay] unreachable — falling back to direct cloud origin", DEFAULT_BACKEND);
  try {
    window.dispatchEvent(new CustomEvent("relay-fallback"));
  } catch {
    /* non-DOM context */
  }
}

// Attaches Authorization: Bearer <token> from the "user" localStorage entry
// login/page.tsx writes on successful login — replaces the old
// withCredentials/session-cookie auth (removed: cookies never worked
// reliably cross-site for the desktop app's Tauri webview anyway).
api.interceptors.request.use((config) => {
  const isAuthRoute = config.url?.includes("/login") || config.url?.includes("/register");
  if (isAuthRoute) return config;

  const raw = localStorage.getItem("user");
  if (raw) {
    try {
      const { token } = JSON.parse(raw);
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {
      // malformed localStorage entry — send unauthenticated, requireAuth
      // will 401 and the response interceptor below sends them to /login
    }
  }
  return config;
});

// A 401 only ever comes from requireAuth/an inline session check on a
// protected route — loginUser itself returns 400 for bad credentials, so
// this can't misfire on a failed login attempt.
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    // A canceled request (AbortController — component unmount, view/match
    // switch, React StrictMode's dev double-mount) also surfaces here with no
    // `err.response`. It is NOT a relay failure — never retry it, never fall
    // back on it. `axios.isCancel` covers ERR_CANCELED / CanceledError; the
    // `signal?.aborted` check also drops a genuine network error whose caller
    // has since given up.
    const canceled = axios.isCancel(err) || err.config?.signal?.aborted;

    // Network error (no response) against the local relay origin — and the
    // caller still wants the result. This is most often a startup race (the
    // overlay's mount-time fetch beat the relay to its port). Retry the SAME
    // (relay) origin a couple of times with a short backoff before giving up;
    // only a relay still not answering after that is treated as genuinely
    // down and the page falls back to the cloud origin permanently.
    if (!err.response && !canceled && isUsingRelay()) {
      const cfg = err.config || {};
      cfg.__relayTries = (cfg.__relayTries || 0) + 1;
      if (cfg.__relayTries < 3) {
        await new Promise((r) => setTimeout(r, 300 * cfg.__relayTries));
        if (cfg.signal?.aborted) return Promise.reject(err); // caller gave up meanwhile
        return api.request(cfg);
      }
      markRelayUnreachable();
      cfg.baseURL = api.defaults.baseURL; // now the cloud origin
      cfg.__relayTries = 0; // let the cloud origin have its own retry budget if needed
      return api.request(cfg);
    }
    if (err.response?.status === 401) {
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
