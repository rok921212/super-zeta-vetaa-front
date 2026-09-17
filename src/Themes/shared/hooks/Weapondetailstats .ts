// src/shared/hooks/weaponDetailStats.ts
//
// Aggregates the raw `playerweapondetailinfo` feed (per-room, per-weapon
// shot/kill breakdowns) for a single player, matched by PlayerID === uId.
// Two consumers in Mvp.tsx read the result:
//   - the 3-way HEAD / BODY / LIMBS damage-distribution silhouette
//   - the 6-box stat grid (ELIMS / DAMAGE / KNOCKOUTS / SURV. TIME /
//     HEADSHOTS / LONGEST ELIM)
//
// Kept dependency-free (no React) so it's trivially testable and reusable
// from any theme, not just this one.

export interface WeaponResultEntry {
  WeaponId?: number;
  KillCount?: number;
  KnockNumber?: number;
  TotalDamage?: number;
  HeadShootCount?: number;
  BodyShootCount?: number;
  LimbsShootCount?: number;
  HandShootCount?: number;
  FootShootCount?: number;
  FireCount?: number;
  TotalOwnTime?: number;
  TotalUseTime?: number;
  HitDistanceArray?: number[];
  [key: string]: any;
}

export interface PlayerWeaponDetailEntry {
  PlayerID: number | string;
  RoomID?: number | string;
  CustomRoomID?: number | string;
  WeaponResult: WeaponResultEntry[];
}

export interface DamageDistribution {
  head: number;
  body: number;
  limbs: number;
  total: number;
  headPct: number;
  bodyPct: number;
  limbsPct: number;
}

export interface AggregatedWeaponStats {
  kills: number;
  knockouts: number;
  damage: number;
  headshots: number;
  fireCount: number;
  longestHitDistance: number; // meters (raw units, same scale as HitDistanceArray)
  maxOwnTimeSeconds: number; // rough survival-time proxy when no dedicated field exists
  distribution: DamageDistribution;
}

const EMPTY_DISTRIBUTION: DamageDistribution = {
  head: 0,
  body: 0,
  limbs: 0,
  total: 0,
  headPct: 0,
  bodyPct: 0,
  limbsPct: 0,
};

export const EMPTY_WEAPON_STATS: AggregatedWeaponStats = {
  kills: 0,
  knockouts: 0,
  damage: 0,
  headshots: 0,
  fireCount: 0,
  longestHitDistance: 0,
  maxOwnTimeSeconds: 0,
  distribution: EMPTY_DISTRIBUTION,
};

// Every match/room a given uId appears in gets summed together — this is a
// tournament-wide (or round-wide, depending on what slice of the feed is
// passed in) aggregate, not a single-match snapshot.
export function aggregateWeaponStats(
  entries: PlayerWeaponDetailEntry[] | undefined | null,
  uId: string | number | undefined | null
): AggregatedWeaponStats {
  if (!entries?.length || uId === undefined || uId === null || uId === '') return EMPTY_WEAPON_STATS;

  const targetId = String(uId);
  const matches = entries.filter((e) => String(e.PlayerID) === targetId);
  if (!matches.length) return EMPTY_WEAPON_STATS;

  let kills = 0;
  let knockouts = 0;
  let damage = 0;
  let headshots = 0;
  let bodyShots = 0;
  let limbShots = 0;
  let handShots = 0;
  let footShots = 0;
  let fireCount = 0;
  let longestHitDistance = 0;
  let maxOwnTimeSeconds = 0;

  matches.forEach((entry) => {
    (entry.WeaponResult || []).forEach((w) => {
      kills += Number(w.KillCount) || 0;
      knockouts += Number(w.KnockNumber) || 0;
      damage += Number(w.TotalDamage) || 0;
      headshots += Number(w.HeadShootCount) || 0;
      bodyShots += Number(w.BodyShootCount) || 0;
      limbShots += Number(w.LimbsShootCount) || 0;
      handShots += Number(w.HandShootCount) || 0;
      footShots += Number(w.FootShootCount) || 0;
      fireCount += Number(w.FireCount) || 0;
      maxOwnTimeSeconds = Math.max(maxOwnTimeSeconds, Number(w.TotalOwnTime) || 0);
      (w.HitDistanceArray || []).forEach((d) => {
        if (Number(d) > longestHitDistance) longestHitDistance = Number(d);
      });
    });
  });

  // Hands and feet fold into LIMBS — arms/legs is the anatomical grouping
  // the 3-way silhouette (head / body / limbs) uses, matching the reference
  // broadcast graphic's own three-category convention.
  const limbsTotal = limbShots + handShots + footShots;
  const distTotal = headshots + bodyShots + limbsTotal;

  const distribution: DamageDistribution = distTotal > 0
    ? {
        head: headshots,
        body: bodyShots,
        limbs: limbsTotal,
        total: distTotal,
        headPct: (headshots / distTotal) * 100,
        bodyPct: (bodyShots / distTotal) * 100,
        limbsPct: (limbsTotal / distTotal) * 100,
      }
    : EMPTY_DISTRIBUTION;

  return {
    kills,
    knockouts,
    damage,
    headshots,
    fireCount,
    longestHitDistance,
    maxOwnTimeSeconds,
    distribution,
  };
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}