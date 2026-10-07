// Framework-free live-event detectors.
//
// These ARE the detection logic of the theme hooks useKillMilestones /
// useRecallEvents (Themes/shared/hooks) — the hooks now hold one of these in a
// ref and call process() per matchData change, and the overlay engine runs the
// same code for its event stream. One implementation, two drivers.

import { isPlayerDead, isRondoMap } from '../Themes/shared/hooks/unsortteams.ts';

type AnyPlayer = any;
type AnyMatchData = { _id?: any; teams: any[] };

// ── Kill milestones ─────────────────────────────────────────────────────────
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

export interface MilestoneFound {
  type: MilestoneType;
  player: AnyPlayer;
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

const ALL_MILESTONE_TYPES: MilestoneType[] = [
  'firstBlood',
  'streak8',
  'streak5',
  'streak3',
  'grenadeKill',
  'vehicleKill',
  'damage',
  'airdrop',
];

export interface MilestoneDetector {
  /** Returns the ONE milestone this change produced (highest priority), or null. */
  process(matchData: AnyMatchData): MilestoneFound | null;
  /** True when process() just crossed into a different matchData._id (trackers were reset). */
  readonly lastCallResetMatch: boolean;
}

export function createMilestoneDetector(options?: MilestoneOptions, initialMatchId: string | null = null): MilestoneDetector {
  const damageThreshold = options?.damageThreshold ?? 500;
  const distanceThreshold = options?.distanceThreshold ?? 0;
  const enabled = new Set(options?.types ?? ALL_MILESTONE_TYPES);
  if (!options?.types && distanceThreshold > 0) enabled.add('distanceKill');

  let matchId: string | null = initialMatchId;
  let prevKills: Record<string, number> = {};
  let prevGrenade: Record<string, number> = {};
  let prevVehicle: Record<string, number> = {};
  let prevDamage: Record<string, number> = {};
  let prevAirdrop: Record<string, number> = {};
  let prevDistance: Record<string, number> = {};
  let firstBloodDone = false;
  let damageDone: Record<string, boolean> = {};
  let distanceDone: Record<string, boolean> = {};
  let prevSig = '';
  let resetMatch = false;

  const detector: MilestoneDetector = {
    get lastCallResetMatch() { return resetMatch; },
    process(md) {
      resetMatch = false;
      const newId = md._id?.toString() ?? null;
      if (newId !== matchId) {
        matchId = newId;
        prevKills = {};
        prevGrenade = {};
        prevVehicle = {};
        prevDamage = {};
        prevAirdrop = {};
        prevDistance = {};
        damageDone = {};
        distanceDone = {};
        firstBloodDone = false;
        prevSig = '';
        resetMatch = true;
      }

      // Change gate: skip when no tracked counter moved.
      const sig = JSON.stringify(
        md.teams
          .flatMap((t: any) =>
            t.players.map((p: any) => ({
              _id: p._id,
              k: p.killNum || 0,
              g: p.killNumByGrenade || 0,
              v: p.killNumInVehicle || 0,
              d: p.damage || 0,
              a: p.gotAirDropNum || 0,
              m: p.maxKillDistance || 0,
            }))
          )
          .sort((x: any, y: any) => String(x._id).localeCompare(String(y._id)))
      );
      if (sig === prevSig) return null;
      prevSig = sig;

      let found: MilestoneFound | null = null;

      // First blood (latched)
      if (!found && enabled.has('firstBlood') && !firstBloodDone) {
        outer: for (const team of md.teams) {
          for (const p of team.players) {
            if ((p.killNum || 0) === 1 && (prevKills[p.playerName] || 0) === 0) {
              found = { type: 'firstBlood', player: p, teamTag: team.teamTag, teamLogo: team.teamLogo, value: 1 };
              firstBloodDone = true;
              break outer;
            }
          }
        }
      }

      // Kill streaks — most recent first, highest threshold wins
      if (!found) {
        outer2: for (let ti = md.teams.length - 1; ti >= 0; ti--) {
          const team = md.teams[ti];
          for (let pi = team.players.length - 1; pi >= 0; pi--) {
            const p = team.players[pi];
            const cur = p.killNum || 0;
            const prev = prevKills[p.playerName] || 0;
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

      const incMilestone = (type: MilestoneType, field: string, tracker: Record<string, number>) => {
        if (found || !enabled.has(type)) return;
        for (let ti = md.teams.length - 1; ti >= 0; ti--) {
          const team = md.teams[ti];
          for (let pi = team.players.length - 1; pi >= 0; pi--) {
            const p = team.players[pi];
            const cur = p[field] || 0;
            if (cur > (tracker[p.playerName] || 0)) {
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
        outer5: for (let ti = md.teams.length - 1; ti >= 0; ti--) {
          const team = md.teams[ti];
          for (let pi = team.players.length - 1; pi >= 0; pi--) {
            const p = team.players[pi];
            const cur = p.damage || 0;
            const prev = prevDamage[p.playerName] || 0;
            if (cur >= damageThreshold && prev < damageThreshold && !damageDone[p.playerName]) {
              found = { type: 'damage', player: p, teamTag: team.teamTag, teamLogo: team.teamLogo, value: cur };
              damageDone[p.playerName] = true;
              break outer5;
            }
          }
        }
      }

      incMilestone('airdrop', 'gotAirDropNum', prevAirdrop);

      // Distance kill — latched per player, only when a threshold is set
      if (!found && enabled.has('distanceKill') && distanceThreshold > 0) {
        outer7: for (let ti = md.teams.length - 1; ti >= 0; ti--) {
          const team = md.teams[ti];
          for (let pi = team.players.length - 1; pi >= 0; pi--) {
            const p = team.players[pi];
            const cur = p.maxKillDistance || 0;
            const prev = prevDistance[p.playerName] || 0;
            if (cur >= distanceThreshold && prev < distanceThreshold && !distanceDone[p.playerName]) {
              found = { type: 'distanceKill', player: p, teamTag: team.teamTag, teamLogo: team.teamLogo, value: cur };
              distanceDone[p.playerName] = true;
              break outer7;
            }
          }
        }
      }

      // Update all trackers
      for (const team of md.teams) {
        for (const p of team.players) {
          prevKills[p.playerName] = p.killNum || 0;
          prevGrenade[p.playerName] = p.killNumByGrenade || 0;
          prevVehicle[p.playerName] = p.killNumInVehicle || 0;
          prevDamage[p.playerName] = p.damage || 0;
          prevAirdrop[p.playerName] = p.gotAirDropNum || 0;
          prevDistance[p.playerName] = p.maxKillDistance || 0;
        }
      }

      return found;
    },
  };
  return detector;
}

// ── Recall (Rondo dead → alive) ─────────────────────────────────────────────
export interface RecallFound {
  /** Stable identity — uId (a recalled player gets a fresh subdoc _id). */
  id: string;
  playerName: string;
  teamId: string;
  teamTag: string;
  teamLogo: string;
  player: AnyPlayer;
}

const stableId = (p: AnyPlayer): string => String(p?.uId ?? p?._id ?? p?.playerName ?? '');

export interface RecallDetector {
  /**
   * Recall transitions in this change (usually []). First sight of a player
   * only records state. Nothing is emitted unless `map` is a recall map, but
   * state is still tracked so a later map flip can't retro-fire.
   */
  process(matchData: AnyMatchData, map: string | null | undefined): RecallFound[];
  readonly lastCallResetMatch: boolean;
}

export function createRecallDetector(initialMatchId: string | null = null): RecallDetector {
  let prevState: Record<string, 'alive' | 'dead'> = {};
  let matchId: string | null = initialMatchId;
  let resetMatch = false;
  return {
    get lastCallResetMatch() { return resetMatch; },
    process(md, map) {
      resetMatch = false;
      const newId = md._id?.toString() ?? null;
      if (newId !== matchId) {
        matchId = newId;
        prevState = {};
        resetMatch = true;
      }
      const supportsRecall = isRondoMap(map);
      const found: RecallFound[] = [];
      // Most-recent-first, same ordering the old per-theme loops used.
      for (let ti = md.teams.length - 1; ti >= 0; ti--) {
        const team = md.teams[ti];
        const players: AnyPlayer[] = team.players || [];
        for (let pi = players.length - 1; pi >= 0; pi--) {
          const player = players[pi];
          const id = stableId(player);
          if (!id) continue;
          const stateNow: 'alive' | 'dead' = isPlayerDead(player) ? 'dead' : 'alive';
          const prev = prevState[id];
          if (prev === 'dead' && stateNow === 'alive' && supportsRecall) {
            found.push({
              id,
              playerName: player.playerName,
              teamId: String(team._id ?? team.teamId ?? ''),
              teamTag: team.teamTag,
              teamLogo: team.teamLogo,
              player,
            });
          }
          prevState[id] = stateNow;
        }
      }
      return found;
    },
  };
}

// ── Kills (one event per kill increment) ────────────────────────────────────
export interface KillFound {
  playerId: string;
  teamId: string;
  killNum: number;
  player: AnyPlayer;
  teamTag: string;
  teamLogo: string;
}

export interface KillDetector {
  /** First sight of a player only records. A correction downward just re-bases. */
  process(matchData: AnyMatchData): KillFound[];
}

export function createKillDetector(): KillDetector {
  let matchId: string | null = null;
  let prev: Record<string, number> = {};
  return {
    process(md) {
      const newId = md._id?.toString() ?? (md as any).matchId?.toString() ?? null;
      if (newId !== matchId) {
        matchId = newId;
        prev = {};
      }
      const found: KillFound[] = [];
      for (const team of md.teams) {
        for (const p of team.players || []) {
          const id = stableId(p);
          if (!id) continue;
          const cur = p.killNum || 0;
          const before = prev[id];
          prev[id] = cur;
          if (before === undefined || cur <= before) continue;
          for (let k = before + 1; k <= cur; k++) {
            found.push({
              playerId: id,
              teamId: String(team.teamId ?? team._id ?? ''),
              killNum: k,
              player: p,
              teamTag: team.teamTag,
              teamLogo: team.teamLogo,
            });
          }
        }
      }
      return found;
    },
  };
}

// ── Player state (alive / knocked / dead transitions) ───────────────────────
export type PlayerLifeState = 'alive' | 'knocked' | 'dead';

/** liveState 4 = knocked down; dead follows the shared isPlayerDead predicate. */
export const playerLifeState = (p: AnyPlayer): PlayerLifeState =>
  isPlayerDead(p) ? 'dead' : Number(p?.liveState) === 4 ? 'knocked' : 'alive';

export interface PlayerStateFound {
  kind: 'knock' | 'revive' | 'playerDeath';
  playerId: string;
  teamId: string;
  from: PlayerLifeState;
  to: PlayerLifeState;
  player: AnyPlayer;
  teamTag: string;
  teamLogo: string;
}

export interface PlayerStateDetector {
  /**
   * Transitions in this change (usually []): alive -> knocked = knock,
   * knocked -> alive = revive, anything -> dead = playerDeath. First sight of
   * a player only records. dead -> alive is the recall detector's business.
   */
  process(matchData: AnyMatchData): PlayerStateFound[];
}

export function createPlayerStateDetector(): PlayerStateDetector {
  let matchId: string | null = null;
  let prev: Record<string, PlayerLifeState> = {};
  return {
    process(md) {
      const newId = md._id?.toString() ?? (md as any).matchId?.toString() ?? null;
      if (newId !== matchId) {
        matchId = newId;
        prev = {};
      }
      const found: PlayerStateFound[] = [];
      for (const team of md.teams) {
        for (const p of team.players || []) {
          const id = stableId(p);
          if (!id) continue;
          const to = playerLifeState(p);
          const from = prev[id];
          prev[id] = to;
          if (from === undefined || from === to) continue;
          const kind = to === 'dead' ? 'playerDeath' : to === 'knocked' && from === 'alive' ? 'knock' : to === 'alive' && from === 'knocked' ? 'revive' : null;
          if (!kind) continue;
          found.push({
            kind,
            playerId: id,
            teamId: String(team.teamId ?? team._id ?? ''),
            from,
            to,
            player: p,
            teamTag: team.teamTag,
            teamLogo: team.teamLogo,
          });
        }
      }
      return found;
    },
  };
}
