// src/Themes/shared/hooks/useLocalAirdrops.ts
//
// This match's airdrop crates and their contents, for the Airdrop Info
// overlay. Only the game's local feed has them (POST /setairdropboxinfo, read
// back by the desktop app's relay: desktop-app/relay/server.cjs,
// /local/airdrops) — never the cloud. Off an overlay route (dashboard
// previews) there is no relay: `live` is false and nothing is fetched.
// Whenever there are no real crates the overlay runs its demo session
// (AIRDROP_DEMO_CRATES).

import { useEffect, useState } from 'react';
import { RELAY_ORIGIN, isOverlayRoute } from '../../../login/api.tsx';

const POLL_MS = 2_000;

export interface AirdropCrate {
  id: number;
  /** Relay clock when the crate was first read. */
  at: number;
  items: Array<{ id: number; count: number }>;
}

export interface AirdropState {
  /** On an overlay route, asking the relay. */
  live: boolean;
  /** The relay has answered at least once. */
  loaded: boolean;
  /** The relay has reached the game's airdrop feed. */
  available: boolean;
  /** Changes when a new match's crates start. */
  matchSeq: number;
  /** Real crates only (empty while loading / before the first drop). */
  crates: AirdropCrate[];
}

/** The demo session: shown while there is no real crate (loading, before the first drop, previews). */
export const AIRDROP_DEMO_CRATES: AirdropCrate[] = [
  { id: 1, at: 0, items: [{ id: 103012, count: 1 }, { id: 306002, count: 10 }, { id: 203005, count: 1 }, { id: 503003, count: 1 }, { id: 502003, count: 1 }, { id: 501003, count: 1 }] },
  { id: 2, at: 0, items: [{ id: 102105, count: 1 }, { id: 301002, count: 200 }, { id: 205002, count: 1 }, { id: 503003, count: 1 }, { id: 502003, count: 1 }, { id: 501003, count: 1 }] },
  { id: 3, at: 0, items: [{ id: 103007, count: 1 }, { id: 302001, count: 60 }, { id: 204013, count: 1 }, { id: 503003, count: 1 }, { id: 502003, count: 1 }, { id: 501003, count: 1 }, { id: 601006, count: 1 }] },
  { id: 4, at: 0, items: [{ id: 105010, count: 1 }, { id: 302001, count: 100 }, { id: 601002, count: 1 }, { id: 503003, count: 1 }, { id: 502003, count: 1 }, { id: 501003, count: 1 }] },
  { id: 5, at: 0, items: [{ id: 103003, count: 1 }, { id: 306001, count: 20 }, { id: 201007, count: 1 }, { id: 403045, count: 1 }, { id: 503003, count: 1 }, { id: 502003, count: 1 }, { id: 501003, count: 1 }] },
];

export function useLocalAirdrops(): AirdropState {
  const live = isOverlayRoute();
  const [state, setState] = useState<AirdropState>({ live, loaded: false, available: false, matchSeq: 0, crates: [] });

  useEffect(() => {
    if (!live) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSig = '';
    const poll = async () => {
      try {
        const res = await fetch(`${RELAY_ORIGIN}/local/airdrops`, { cache: 'no-store' });
        if (res.ok) {
          const body = await res.json();
          const crates: AirdropCrate[] = (Array.isArray(body?.crates) ? body.crates : [])
            .filter((c: any) => Number.isFinite(Number(c?.id)) && Array.isArray(c?.items))
            .map((c: any) => ({
              id: Number(c.id),
              at: Number(c.at) || 0,
              items: c.items.map((i: any) => ({ id: Number(i.id), count: Number(i.count) || 1 })),
            }));
          const next: AirdropState = { live: true, loaded: true, available: !!body?.available, matchSeq: Number(body?.matchSeq) || 0, crates };
          // Only re-render when something changed (the poll is every 2 s).
          const sig = `${next.available}|${next.matchSeq}|${crates.map((c) => `${c.id}@${c.at}`).join(',')}`;
          if (sig !== lastSig && !stopped) {
            lastSig = sig;
            setState(next);
          }
        }
      } catch {
        // Relay down: keep the last data (or the demo session).
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [live]);

  return state;
}
