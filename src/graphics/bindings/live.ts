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
  teamFlag?: string;
}

export interface LiveTeam {
  teamId: string;
  teamTag: string;
  teamName?: string;
  teamLogo?: string;
  teamFlag?: string;
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
  /** Number of the match the live feed is on right now (follows the panel's selected match). */
  currentMatchNo: number | null;
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
  mapName: '', isRecallMap: false, matchNo: null, currentMatchNo: null, teamsTotal: 0, aliveTeamsCount: 0, deadTeamsCount: 0,
  alivePlayersCount: 0, totalKills: 0, aliveTeams: [], deadTeams: [], players: [], alivePlayers: [],
  killLeader: null, topTeam: null, lastEliminated: null,
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

interface LiveCacheEntry { match: unknown; round: unknown; dead: unknown; matchData: unknown; matches: unknown; value: LiveState }
// Keyed by the derived teams array so two engines on one page (editor live + simulation) don't evict each other.
const liveCache = new WeakMap<object, LiveCacheEntry>();

type LiveInput = { derived?: any; match?: any; round?: any; deadTeamList?: any[]; matchData?: any; matches?: any[] };

const matchNoOf = (m: any): number | null => {
  const n = m?.matchNo ?? m?._matchNo;
  return n == null || n === '' ? null : Number(n);
};

/**
 * The live feed's match wins over `state.match`: after the panel switches match the socket
 * delivers the new matchData before the next bulk fetch replaces `state.match`.
 */
export function currentMatchNoOf(state: LiveInput): number | null {
  const liveId = state.matchData?.matchId != null ? String(state.matchData.matchId) : null;
  const m = state.match;
  if (m && (!liveId || String(m._id ?? '') === liveId)) return matchNoOf(m);
  if (liveId) {
    const hit = (state.matches || []).find((x: any) => String(x?._id ?? '') === liveId);
    if (hit) return matchNoOf(hit);
    if (state.matchData?.matchNo != null) return matchNoOf(state.matchData);
  }
  return matchNoOf(m);
}

/** `state` is anything shaped like EngineState (derived.teams, match, round, deadTeamList). */
export function computeLive(state: LiveInput | null | undefined): LiveState {
  if (!state) return EMPTY;
  const teams: any[] = state.derived?.teams || [];
  const hit = liveCache.get(teams);
  if (hit && hit.match === state.match && hit.round === state.round && hit.dead === state.deadTeamList
    && hit.matchData === state.matchData && hit.matches === state.matches) {
    return hit.value;
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
        teamFlag: t.teamFlag,
      };
    });
    const alive = players.filter((p) => !p.dead);
    return {
      teamId,
      teamTag: String(t.teamTag ?? ''),
      teamName: t.teamName,
      teamLogo: t.teamLogo,
      teamFlag: t.teamFlag,
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
    currentMatchNo: currentMatchNoOf(state),
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
  liveCache.set(teams, { match: state.match, round: state.round, dead: state.deadTeamList, matchData: state.matchData, matches: state.matches, value });
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

/** Engine event types the feed.* logs keep. */
export const FEED_KEY: Record<string, keyof Omit<FeedState, 'last'>> = {
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
