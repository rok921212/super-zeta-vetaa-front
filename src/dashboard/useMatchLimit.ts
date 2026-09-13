import { useEffect, useState } from "react";
import api from "../login/api";

// Per-user match quota state, shared across every in-tournament page.
//
// Source of truth is GET /api/matches/usage. The result is cached in
// sessionStorage (short TTL) so navigating between Rounds / Matches / Teams
// doesn't refetch on every mount, and a `matchlimit:update` window event
// keeps all mounted consumers (the Navbar banner, the Match page's disabled
// "Add Match" button) in sync — including the instant a create is rejected
// server-side with { code: "MATCH_LIMIT" }.

export interface MatchLimitState {
  used: number;
  max: number | null; // null = unlimited
  unlimited: boolean;
  limitReached: boolean;
}

const KEY = "cache:v1:matchlimit";
const TTL_MS = 60_000;
const EVT = "matchlimit:update";

const DEFAULT: MatchLimitState = { used: 0, max: null, unlimited: true, limitReached: false };

type Stored = MatchLimitState & { ts: number };

function read(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p.ts !== "number") return null;
    return p as Stored;
  } catch {
    return null;
  }
}

function write(s: MatchLimitState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...s, ts: Date.now() }));
  } catch {
    /* private mode / quota — best effort */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVT, { detail: s }));
  } catch {
    /* non-DOM */
  }
}

let inFlight: Promise<void> | null = null;

/** Fetch usage from the server. No-op if a fresh cached value exists (unless `force`). */
export async function refreshMatchLimit(force = false): Promise<void> {
  const cached = read();
  if (!force && cached && Date.now() - cached.ts < TTL_MS) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const { data } = await api.get("/matches/usage");
      write({
        used: Number(data?.used) || 0,
        max: data?.max ?? null,
        unlimited: !!data?.unlimited,
        limitReached: !!data?.limitReached,
      });
    } catch {
      /* transient failure — keep the prior state, don't flip the banner */
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Inspect a failed create response. If it's the server's MATCH_LIMIT rejection,
 * flip the shared state to limitReached and return true (so the caller knows it
 * was handled).
 */
export function noteMatchLimitError(err: any): boolean {
  const d = err?.response?.data;
  if (!d || d.code !== "MATCH_LIMIT") return false;
  const prev = read();
  write({
    used: Number(d.used ?? prev?.used) || 0,
    max: d.max ?? prev?.max ?? null,
    unlimited: false,
    limitReached: true,
  });
  return true;
}

export function useMatchLimit(): MatchLimitState {
  const [state, setState] = useState<MatchLimitState>(() => {
    const c = read();
    return c ? { used: c.used, max: c.max, unlimited: c.unlimited, limitReached: c.limitReached } : DEFAULT;
  });

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as MatchLimitState | undefined;
      if (detail) {
        setState(detail);
      } else {
        const c = read();
        if (c) setState({ used: c.used, max: c.max, unlimited: c.unlimited, limitReached: c.limitReached });
      }
    };
    window.addEventListener(EVT, onUpdate);
    // Throttled by TTL — cheap on repeat mounts.
    refreshMatchLimit();
    return () => window.removeEventListener(EVT, onUpdate);
  }, []);

  return state;
}
