import { useEffect, useRef, useState } from 'react';
import { Player, MatchData } from './unsortteams';

// Shared kill-milestone detection for every theme's on-screen/Dom.tsx.
//
// The per-theme Dom.tsx files each hand-rolled ~150 lines of per-player
// prev-value ref tracking for: first blood, 3/5/8 kill streaks, grenade
// kills, vehicle kills, a damage threshold, and airdrop pickups — and they
// had drifted apart (Theme1 tracked only a subset; damage threshold and
// streak labels differed). This is the one detector.
//
// It emits a canonical typed event; each theme maps `type` to its own
// label string ("UNSTOPPABLE" vs "UNSTOPABLE" …) and renders its own card.
// `types` lets a theme opt into a subset; `damageThreshold` defaults to 500.

export type MilestoneType =
  | 'firstBlood'
  | 'streak3'
  | 'streak5'
  | 'streak8'
  | 'grenadeKill'
  | 'vehicleKill'
  | 'damage'
  | 'airdrop'
  | 'distanceKill';

export interface MilestoneEvent {
  /** Monotonic — use as the React key / useEffect dep so the same player
   *  hitting the same milestone twice still re-fires the card. */
  nonce: number;
  type: MilestoneType;
  player: Player;
  teamTag: string;
  teamLogo: string;
  value?: number;
}

export interface MilestoneOptions {
  types?: MilestoneType[];
  damageThreshold?: number;
  /** metres; a kill from >= this far latches a 'distanceKill'. 0 = never. */
  distanceThreshold?: number;
}

const ALL_TYPES: MilestoneType[] = [
  'firstBlood',
  'streak8',
  'streak5',
  'streak3',
  'grenadeKill',
  'vehicleKill',
  'damage',
  'airdrop',
];

type NumMap = { current: Record<string, number> };

export function useKillMilestones(
  matchData: MatchData | null | undefined,
  match: { _id?: string } | null | undefined,
  options?: MilestoneOptions
): MilestoneEvent | null {
  const damageThreshold = options?.damageThreshold ?? 500;
  const distanceThreshold = options?.distanceThreshold ?? 0;
  const enabledRef = useRef<Set<MilestoneType>>(
    (() => {
      const s = new Set(options?.types ?? ALL_TYPES);
      if (!options?.types && distanceThreshold > 0) s.add('distanceKill');
      return s;
    })()
  );

  const matchIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);
  const prevKills = useRef<Record<string, number>>({});
  const prevGrenade = useRef<Record<string, number>>({});
  const prevVehicle = useRef<Record<string, number>>({});
  const prevDamage = useRef<Record<string, number>>({});
  const prevAirdrop = useRef<Record<string, number>>({});
  const prevDistance = useRef<Record<string, number>>({});
  const firstBloodDone = useRef(false);
  const damageDone = useRef<Record<string, boolean>>({});
  const distanceDone = useRef<Record<string, boolean>>({});
  const prevSig = useRef<string>('');
  const nonceRef = useRef(0);

  const [event, setEvent] = useState<MilestoneEvent | null>(null);

  useEffect(() => {
    if (!matchData) return;
    const enabled = enabledRef.current;

    const newId = matchData._id?.toString() ?? null;
    if (newId !== matchIdRef.current) {
      matchIdRef.current = newId;
      prevKills.current = {};
      prevGrenade.current = {};
      prevVehicle.current = {};
      prevDamage.current = {};
      prevAirdrop.current = {};
      prevDistance.current = {};
      damageDone.current = {};
      distanceDone.current = {};
      firstBloodDone.current = false;
      prevSig.current = '';
      setEvent(null);
    }

    // Change gate — same idea as each per-theme Dom.tsx: skip when no
    // tracked counter moved.
    const sig = JSON.stringify(
      matchData.teams
        .flatMap((t) =>
          t.players.map((p) => ({
            _id: p._id,
            k: p.killNum || 0,
            g: (p as any).killNumByGrenade || 0,
            v: (p as any).killNumInVehicle || 0,
            d: (p as any).damage || 0,
            a: (p as any).gotAirDropNum || 0,
            m: (p as any).maxKillDistance || 0,
          }))
        )
        .sort((x, y) => x._id.localeCompare(y._id))
    );
    if (sig === prevSig.current) return;
    prevSig.current = sig;

    let found: Omit<MilestoneEvent, 'nonce'> | null = null;

    // First blood (latched)
    if (!found && enabled.has('firstBlood') && !firstBloodDone.current) {
      outer: for (const team of matchData.teams) {
        for (const p of team.players) {
          if ((p.killNum || 0) === 1 && (prevKills.current[p.playerName] || 0) === 0) {
            found = { type: 'firstBlood', player: p, teamTag: team.teamTag, teamLogo: team.teamLogo, value: 1 };
            firstBloodDone.current = true;
            break outer;
          }
        }
      }
    }

    // Kill streaks — most recent first, highest threshold wins
    if (!found) {
      outer2: for (let ti = matchData.teams.length - 1; ti >= 0; ti--) {
        const team = matchData.teams[ti];
        for (let pi = team.players.length - 1; pi >= 0; pi--) {
          const p = team.players[pi];
          const cur = p.killNum || 0;
          const prev = prevKills.current[p.playerName] || 0;
          if (cur <= prev) continue;
          let type: MilestoneType | null = null;
          if (cur >= 8 && prev < 8 && enabled.has('streak8')) type = 'streak8';
          else if (cur >= 5 && prev < 5 && enabled.has('streak5')) type = 'streak5';
          else if (cur >= 3 && prev < 3 && enabled.has('streak3')) type = 'streak3';
          if (type) {
            found = { type, player: p, teamTag: team.teamTag, teamLogo: team.teamLogo, value: cur };
            break outer2;
          }
        }
      }
    }

    const incMilestone = (type: MilestoneType, field: string, tracker: NumMap) => {
      if (found || !enabled.has(type)) return;
      for (let ti = matchData.teams.length - 1; ti >= 0; ti--) {
        const team = matchData.teams[ti];
        for (let pi = team.players.length - 1; pi >= 0; pi--) {
          const p = team.players[pi];
          const cur = (p as any)[field] || 0;
          if (cur > (tracker.current[p.playerName] || 0)) {
            found = { type, player: p, teamTag: team.teamTag, teamLogo: team.teamLogo, value: cur };
            return;
          }
        }
      }
    };
    incMilestone('grenadeKill', 'killNumByGrenade', prevGrenade);
    incMilestone('vehicleKill', 'killNumInVehicle', prevVehicle);

    // Damage threshold — latched per player
    if (!found && enabled.has('damage')) {
      outer5: for (let ti = matchData.teams.length - 1; ti >= 0; ti--) {
        const team = matchData.teams[ti];
        for (let pi = team.players.length - 1; pi >= 0; pi--) {
          const p = team.players[pi];
          const cur = (p as any).damage || 0;
          const prev = prevDamage.current[p.playerName] || 0;
          if (cur >= damageThreshold && prev < damageThreshold && !damageDone.current[p.playerName]) {
            found = { type: 'damage', player: p, teamTag: team.teamTag, teamLogo: team.teamLogo, value: cur };
            damageDone.current[p.playerName] = true;
            break outer5;
          }
        }
      }
    }

    incMilestone('airdrop', 'gotAirDropNum', prevAirdrop);

    // Distance kill — latched per player, only when a threshold is set
    if (!found && enabled.has('distanceKill') && distanceThreshold > 0) {
      outer7: for (let ti = matchData.teams.length - 1; ti >= 0; ti--) {
        const team = matchData.teams[ti];
        for (let pi = team.players.length - 1; pi >= 0; pi--) {
          const p = team.players[pi];
          const cur = (p as any).maxKillDistance || 0;
          const prev = prevDistance.current[p.playerName] || 0;
          if (cur >= distanceThreshold && prev < distanceThreshold && !distanceDone.current[p.playerName]) {
            found = { type: 'distanceKill', player: p, teamTag: team.teamTag, teamLogo: team.teamLogo, value: cur };
            distanceDone.current[p.playerName] = true;
            break outer7;
          }
        }
      }
    }

    // Update all trackers
    for (const team of matchData.teams) {
      for (const p of team.players) {
        prevKills.current[p.playerName] = p.killNum || 0;
        prevGrenade.current[p.playerName] = (p as any).killNumByGrenade || 0;
        prevVehicle.current[p.playerName] = (p as any).killNumInVehicle || 0;
        prevDamage.current[p.playerName] = (p as any).damage || 0;
        prevAirdrop.current[p.playerName] = (p as any).gotAirDropNum || 0;
        prevDistance.current[p.playerName] = (p as any).maxKillDistance || 0;
      }
    }

    if (found) {
      nonceRef.current += 1;
      setEvent({ ...found, nonce: nonceRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchData]);

  return event;
}
