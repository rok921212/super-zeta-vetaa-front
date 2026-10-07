// `live.*` binding root: the at-a-glance values the built-in themes compute
// (alive counts, kill leader, recall map, WWCD chance…), derived from the SAME
// engine state with the SAME shared helpers the themes use
// (Themes/shared/hooks) — so a Designer layout shows exactly the numbers a
// built-in overlay would. Pure, and memoised on the input slices' identity.

import { isPlayerDead, isRondoMap } from '../../Themes/shared/hooks/unsortteams.ts';
import { wwcdChance } from '../../Themes/shared/hooks/liveDerived.ts';
import { playerLifeState } from '../../overlayClient/detectors.ts';

export interface LivePlayer {
  playerName: string;
  uId?: string | number;
  picUrl?: string;
  killNum: number;
  damage: number;
  health: number;
  healthMax: number;
  healthPct: number;
  knocked: boolean;
  dead: boolean;
  /** 'alive' | 'knocked' | 'dead' — one field to test in conditions. */
  state: 'alive' | 'knocked' | 'dead';
  teamId: string;
  teamTag: string;
  teamName?: string;
  teamLogo?: string;
}

export interface LiveTeam {
  teamId: string;
  teamTag: string;
  teamName?: string;
  teamLogo?: string;
  rank: number;
  kills: number;
  points: number;
  aliveCount: number;
  isAllDead: boolean;
  isEliminated: boolean;
  wwcdChance: number;
  /** Mean live health of the team's players, 0..100. */
  health: number;
  players: LivePlayer[];
}

export interface LiveState {
  mapName: string;
  isRecallMap: boolean;
  matchNo: number | null;
  teamsTotal: number;
  aliveTeamsCount: number;
  deadTeamsCount: number;
  alivePlayersCount: number;
  totalKills: number;
  aliveTeams: LiveTeam[];
  deadTeams: LiveTeam[];
  players: LivePlayer[];
  alivePlayers: LivePlayer[];
  killLeader: LivePlayer | null;
  topTeam: LiveTeam | null;
  lastEliminated: LiveTeam | null;
}

const EMPTY: LiveState = {
  mapName: '', isRecallMap: false, matchNo: null, teamsTotal: 0, aliveTeamsCount: 0, deadTeamsCount: 0,
  alivePlayersCount: 0, totalKills: 0, aliveTeams: [], deadTeams: [], players: [], alivePlayers: [],
  killLeader: null, topTeam: null, lastEliminated: null,
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

let lastKey: { teams: unknown; match: unknown; round: unknown; dead: unknown } | null = null;
let lastValue: LiveState = EMPTY;

/** `state` is anything shaped like EngineState (derived.teams, match, round, deadTeamList). */
export function computeLive(state: { derived?: any; match?: any; round?: any; deadTeamList?: any[] } | null | undefined): LiveState {
  if (!state) return EMPTY;
  const teams: any[] = state.derived?.teams || [];
  if (lastKey && lastKey.teams === teams && lastKey.match === state.match && lastKey.round === state.round && lastKey.dead === state.deadTeamList) {
    return lastValue;
  }
  const apiEnable = !!state.round?.apiEnable;
  const mapName = String(state.match?.map ?? state.match?.mapName ?? '');

  const liveTeams: LiveTeam[] = teams.map((t: any) => {
    const teamId = String(t.teamId ?? t._id ?? '');
    const players: LivePlayer[] = (t.players || []).map((p: any) => {
      const health = num(p.health);
      const healthMax = num(p.healthMax) || 100;
      return {
        playerName: String(p.playerName ?? ''),
        uId: p.uId,
        picUrl: p.picUrl,
        killNum: num(p.killNum),
        damage: num(p.damage),
        health,
        healthMax,
        healthPct: Math.max(0, Math.min(100, Math.round((health / healthMax) * 100))),
        knocked: playerLifeState(p) === 'knocked',
        dead: isPlayerDead(p),
        state: playerLifeState(p),
        teamId,
        teamTag: String(t.teamTag ?? ''),
        teamName: t.teamName,
        teamLogo: t.teamLogo,
      };
    });
    const alive = players.filter((p) => !p.dead);
    return {
      teamId,
      teamTag: String(t.teamTag ?? ''),
      teamName: t.teamName,
      teamLogo: t.teamLogo,
      rank: num(t.teamRank ?? t.rank),
      kills: num(t.totalKills),
      points: num(t.totalPoints ?? t.placePoints),
      aliveCount: num(t.aliveCount ?? alive.length),
      isAllDead: !!t.isAllDead,
      isEliminated: !!(t.isEliminationLocked ?? t.isAllDead),
      wwcdChance: wwcdChance({ players: t.players || [], aliveCount: num(t.aliveCount ?? alive.length) } as any, apiEnable),
      health: alive.length ? Math.round(alive.reduce((s, p) => s + p.healthPct, 0) / alive.length) : 0,
      players,
    };
  });

  const aliveTeams = liveTeams.filter((t) => !t.isAllDead);
  const deadTeams = liveTeams.filter((t) => t.isAllDead);
  const players = liveTeams.flatMap((t) => t.players);
  const alivePlayers = players.filter((p) => !p.dead);
  const killLeader = players.reduce<LivePlayer | null>((best, p) => (!best || p.killNum > best.killNum || (p.killNum === best.killNum && p.damage > best.damage) ? p : best), null);
  const dl = state.deadTeamList || [];
  const lastDeadId = dl.length ? String(dl[dl.length - 1]?.teamId ?? '') : '';

  const value: LiveState = {
    mapName,
    isRecallMap: isRondoMap(mapName),
    matchNo: state.match?.matchNo ?? null,
    teamsTotal: liveTeams.length,
    aliveTeamsCount: aliveTeams.length,
    deadTeamsCount: deadTeams.length,
    alivePlayersCount: alivePlayers.length,
    totalKills: players.reduce((s, p) => s + p.killNum, 0),
    aliveTeams,
    deadTeams,
    players,
    alivePlayers,
    killLeader: killLeader && killLeader.killNum > 0 ? killLeader : killLeader,
    topTeam: liveTeams[0] ?? null,
    lastEliminated: lastDeadId ? liveTeams.find((t) => t.teamId === lastDeadId) ?? null : null,
  };
  lastKey = { teams, match: state.match, round: state.round, dead: state.deadTeamList };
  lastValue = value;
  return value;
}

// ── feed.*: rolling event logs ──────────────────────────────────────────────

export const FEED_LIMIT = 20;

export interface FeedState {
  kills: any[];
  eliminations: any[];
  recalls: any[];
  milestones: any[];
  rankChanges: any[];
  knocks: any[];
  /** The newest event of any tracked type. */
  last: any | null;
}

export const EMPTY_FEED: FeedState = { kills: [], eliminations: [], recalls: [], milestones: [], rankChanges: [], knocks: [], last: null };

const FEED_KEY: Record<string, keyof Omit<FeedState, 'last'>> = {
  kill: 'kills', elimination: 'eliminations', recall: 'recalls', milestone: 'milestones', rankChange: 'rankChanges', knock: 'knocks',
};

/** Pure reducer: add one engine event to the feed (newest first, capped, deduped by id). */
export function feedReducer(feed: FeedState, ev: { id: string; type: string; timestamp?: number; payload?: any }): FeedState {
  const key = FEED_KEY[ev.type];
  if (!key) return feed;
  if (feed[key].some((e) => e.id === ev.id)) return feed;
  const payload = ev.payload && typeof ev.payload === 'object' ? ev.payload : { value: ev.payload };
  // Milestones carry their own `type` (firstBlood / damage / …): keep it as `kind`.
  const entry = { ...payload, ...(payload.type !== undefined ? { kind: payload.type } : null), id: ev.id, type: ev.type, at: ev.timestamp ?? Date.now() };
  return { ...feed, [key]: [entry, ...feed[key]].slice(0, FEED_LIMIT), last: entry };
}
