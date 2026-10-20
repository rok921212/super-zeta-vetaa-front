// src/shared/hooks/useLocalWeaponDetails.ts
//
// Per-player weapon detail (head / body / limb hits) for the current match.
// Only the game's local feed has it, so it comes from the desktop app's
// overlay relay (desktop-app/relay/server.cjs, /local/weapon-details) — never
// the cloud. Off an overlay route (home simulator, previews) there is no
// relay, so this returns null and the caller shows its demo numbers.

import { useEffect, useState } from 'react';
import { RELAY_ORIGIN, isOverlayRoute } from '../../../login/api.tsx';
import { PlayerWeaponDetailEntry } from './Weapondetailstats ';

const POLL_MS = 5_000;

export function useLocalWeaponDetails(enabled = true): PlayerWeaponDetailEntry[] | null {
  const live = enabled && isOverlayRoute();
  const [entries, setEntries] = useState<PlayerWeaponDetailEntry[] | null>(live ? [] : null);

  useEffect(() => {
    if (!live) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await fetch(`${RELAY_ORIGIN}/local/weapon-details`, { cache: 'no-store' });
        if (res.ok) {
          const body = await res.json();
          if (!stopped) setEntries(Array.isArray(body?.players) ? body.players : []);
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

  return entries;
}
