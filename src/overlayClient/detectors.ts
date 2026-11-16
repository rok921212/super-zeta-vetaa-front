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
  | 'distanceKill'
  /** A player finished a knock another TEAM made (from the :10086 killfeed, not matchData). */
  | 'killSteal';

/** The words the theme Dom cards show for each milestone (ThemeN/on-screen/Dom.tsx LABELS). */
export const MILESTONE_LABELS: Record<MilestoneType, string> = {
  firstBlood: 'FIRST BLOOD',
  streak3: 'DOMINATION',
  streak5: 'RAMPAGE',
  streak8: 'UNSTOPPABLE',
  grenadeKill: 'GRENADE KILL',
  vehicleKill: 'VEHICLE KILL',
  damage: '500+ DAMAGE',
  airdrop: 'AIRDROP LOOTED',
  distanceKill: 'LONG SHOT',
  killSteal: 'KILL STOLEN',
};

export interface MilestoneFound {
  type: MilestoneType;
  player: AnyPlayer;
  teamId: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
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
              found = { type: 'firstBlood', player: p, teamId: String(team.teamId ?? team._id ?? ''), teamTag: team.teamTag, teamLogo: team.teamLogo, teamFlag: team.teamFlag, value: 1 };
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
              found = { type, player: p, teamId: String(team.teamId ?? team._id ?? ''), teamTag: team.teamTag, teamLogo: team.teamLogo, teamFlag: team.teamFlag, value: cur };
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
              found = { type, player: p, teamId: String(team.teamId ?? team._id ?? ''), teamTag: team.teamTag, teamLogo: team.teamLogo, teamFlag: team.teamFlag, value: cur };
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
              found = { type: 'damage', player: p, teamId: String(team.teamId ?? team._id ?? ''), teamTag: team.teamTag, teamLogo: team.teamLogo, teamFlag: team.teamFlag, value: cur };
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
              found = { type: 'distanceKill', player: p, teamId: String(team.teamId ?? team._id ?? ''), teamTag: team.teamTag, teamLogo: team.teamLogo, teamFlag: team.teamFlag, value: cur };
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

// ── Kill steals (from the game's killfeed, GET :10086/getkillinfo) ──────────
//
// The killfeed is the whole match so far, re-sent on every read:
//   { killInfo: [{ CauserUID, VictimUID, CauserName, VictimName, ItemID,
//                  ResultHealthStatus: '1' knock | '2' kill, CurGameTime, Distance }] }
// A steal = the victim was knocked by one team and killed by a DIFFERENT team.
// A teammate finishing the knock is ordinary play and is not reported.

export interface KillFeedEntry {
  CauserUID?: string | number;
  VictimUID?: string | number;
  CauserName?: string;
  VictimName?: string;
  ItemID?: string | number;
  ResultHealthStatus?: string | number;
  CurGameTime?: string | number;
  Distance?: string | number;
}

export interface KillStealFound extends MilestoneFound {
  type: 'killSteal';
  /** The stealer (finisher) is `player`; these describe who lost the kill. */
  knockerName: string;
  knockerTeamTag: string;
  victimName: string;
  weaponId: string;
  gameTime: number;
}

export interface KillStealDetector {
  /**
   * Steals in the killfeed entries this call has not seen before. The first
   * call after a reset (new detector, match switch, new game) only records
   * knocks, so opening an overlay mid-match doesn't replay old steals.
   */
  process(killInfo: KillFeedEntry[] | null | undefined, matchData: AnyMatchData | null | undefined): KillStealFound[];
  readonly lastCallResetMatch: boolean;
}

/**
 * Window event the simulators fire to show a KILL STOLEN card without a live
 * killfeed (graphics/editor/simulation.ts -> Themes/shared/hooks/killMilestones.ts).
 */
export const SIM_KILLSTEAL_EVENT = 'scoresync:sim-killsteal';

/** Pull the list out of a /getkillinfo body (tolerates the key's casing, or a bare array). */
export function killFeedList(body: any): KillFeedEntry[] {
  const list = body?.killInfo ?? body?.KillInfo ?? body;
  return Array.isArray(list) ? list : [];
}

const entryKey = (e: KillFeedEntry) =>
  `${e.CauserUID}|${e.VictimUID}|${e.ResultHealthStatus}|${e.CurGameTime}|${e.ItemID}`;

export function createKillStealDetector(initialMatchId: string | null = null): KillStealDetector {
  let matchId: string | null = initialMatchId;
  let seen = 0; // entries of the cumulative list already handled
  let firstKey = ''; // identity of the list (its first entry) — changes on a new game
  let primed = false;
  /** victim uId -> knocker uId, for knocks not yet finished or revived. */
  let knocks = new Map<string, string>();
  /** Victims the player list has shown as knocked since their last knock entry. */
  let sawKnocked = new Set<string>();
  let resetMatch = false;

  const reset = (silent: boolean) => {
    seen = 0;
    firstKey = '';
    primed = !silent;
    knocks = new Map();
    sawKnocked = new Set();
  };

  return {
    get lastCallResetMatch() { return resetMatch; },
    process(killInfo, md) {
      resetMatch = false;
      const newId = md?._id?.toString() ?? null;
      if (newId !== matchId) {
        matchId = newId;
        reset(true);
        resetMatch = true;
      }
      const list = Array.isArray(killInfo) ? killInfo : [];
      const key0 = list.length ? entryKey(list[0]) : '';
      // A shorter list or a different first entry = the game started a new
      // killfeed while we were watching: its entries are new, so report them.
      if (list.length < seen || (seen > 0 && key0 !== firstKey)) reset(!primed);
      firstKey = key0;

      // uId -> { player, team } from the overlay's own roster (server teams).
      const roster = new Map<string, { p: AnyPlayer; team: any }>();
      for (const team of md?.teams || []) {
        for (const p of team.players || []) {
          if (p?.uId != null) roster.set(String(p.uId), { p, team });
        }
      }
      const teamKey = (team: any) => String(team?.teamId ?? team?._id ?? team?.slot ?? '');

      // A knocked victim the roster later shows alive again was revived.
      for (const victim of Array.from(knocks.keys())) {
        const r = roster.get(victim);
        if (!r) continue;
        const state = playerLifeState(r.p);
        if (state === 'knocked') sawKnocked.add(victim);
        else if (state === 'alive' && sawKnocked.has(victim)) {
          knocks.delete(victim);
          sawKnocked.delete(victim);
        }
      }

      const found: KillStealFound[] = [];
      for (let i = seen; i < list.length; i++) {
        const e = list[i] || {};
        const causer = String(e.CauserUID ?? '');
        const victim = String(e.VictimUID ?? '');
        const status = String(e.ResultHealthStatus ?? '');
        if (!victim) continue;
        if (status === '1') {
          knocks.set(victim, causer);
          sawKnocked.delete(victim);
          continue;
        }
        if (status !== '2') continue;
        const knocker = knocks.get(victim);
        knocks.delete(victim);
        sawKnocked.delete(victim);
        if (!primed || !knocker || !causer || causer === '0' || causer === knocker || causer === victim) continue;
        const fin = roster.get(causer);
        const kno = roster.get(knocker);
        if (!fin || !kno) continue; // can't tell the teams apart: say nothing
        if (teamKey(fin.team) === teamKey(kno.team)) continue; // teammate finish
        found.push({
          type: 'killSteal',
          player: fin.p,
          teamId: teamKey(fin.team),
          teamTag: fin.team.teamTag,
          teamLogo: fin.team.teamLogo,
          teamFlag: fin.team.teamFlag,
          value: Number(e.Distance) || 0,
          knockerName: String(kno.p.playerName ?? e.CauserName ?? ''),
          knockerTeamTag: kno.team.teamTag ?? '',
          victimName: String(roster.get(victim)?.p.playerName ?? e.VictimName ?? ''),
          weaponId: String(e.ItemID ?? ''),
          gameTime: Number(e.CurGameTime) || 0,
        });
      }
      seen = list.length;
      primed = true;
      return found;
    },
  };
}

// ── Recall (Rondo dead → alive) ─────────────────────────────────────────────
export interface RecallFound {
  /** Stable identity — uId (a recalled player gets a fresh subdoc _id). */
  id: string;
  playerName: string;
  teamId: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
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
              teamFlag: team.teamFlag,
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
  teamFlag?: string;
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
              teamFlag: team.teamFlag,
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
  teamFlag?: string;
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
            teamFlag: team.teamFlag,
          });
        }
      }
      return found;
    },
  };
}
