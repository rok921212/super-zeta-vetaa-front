// src/shared/hooks/useLocalTeamThrowables.ts
//
// Throwables each team carries, for the current match. Only the game's local
// feed has backpacks (POST /setteambackpackinfo), and only for the team being
// spectated, so the desktop app's overlay relay keeps every team's last seen
// backpack (desktop-app/relay/server.cjs, /local/team-backpacks) — never the
// cloud. Keyed by the in-game team id, which is the team's slot. Off an
// overlay route (home simulator, previews) there is no relay: returns null.

import { useEffect, useState } from 'react';
import { RELAY_ORIGIN, isOverlayRoute } from '../../../login/api.tsx';

const POLL_MS = 2_000;

// PUBG Mobile item ids, as the backpack feed keys them.
export const THROWABLE_IDS = {
  frag: '602004',
  smoke: '602002',
  molotov: '602003',
  stun: '602001',
} as const;

export type ThrowableKind = keyof typeof THROWABLE_IDS;

export interface TeamThrowables extends Record<ThrowableKind, number> {
  total: number;
  /** ms since the team was last spectated (its numbers are from then). */
  ageMs: number;
}

/** "Quality:0,Num:3,Worth:0" -> 3 */
function itemCount(raw: unknown): number {
  const m = typeof raw === 'string' ? /Num:(\d+)/.exec(raw) : null;
  return m ? Number(m[1]) : 0;
}

function countTeam(players: any[]): Omit<TeamThrowables, 'ageMs'> {
  const out = { frag: 0, smoke: 0, molotov: 0, stun: 0, total: 0 };
  for (const p of players) {
    for (const kind of Object.keys(THROWABLE_IDS) as ThrowableKind[]) {
      const n = itemCount(p?.[THROWABLE_IDS[kind]]);
      out[kind] += n;
      out.total += n;
    }
  }
  return out;
}

/** slot -> throwables; null when there is no relay to ask. */
export function useLocalTeamThrowables(enabled = true): Map<number, TeamThrowables> | null {
  const live = enabled && isOverlayRoute();
  const [teams, setTeams] = useState<Map<number, TeamThrowables> | null>(live ? new Map() : null);

  useEffect(() => {
    if (!live) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await fetch(`${RELAY_ORIGIN}/local/team-backpacks`, { cache: 'no-store' });
        if (res.ok) {
          const body = await res.json();
          const now = Number(body?.now) || Date.now();
          const next = new Map<number, TeamThrowables>();
          for (const t of Array.isArray(body?.teams) ? body.teams : []) {
            const slot = Number(t?.teamId);
            if (!Number.isFinite(slot)) continue;
            next.set(slot, { ...countTeam(Array.isArray(t.players) ? t.players : []), ageMs: Math.max(0, now - (Number(t.updatedAt) || now)) });
          }
          if (!stopped) setTeams(next);
        }
      } catch {
        // Relay down: keep the last data.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [live]);

  return teams;
}
