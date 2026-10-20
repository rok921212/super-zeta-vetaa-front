// Designer SIMULATION mode: the REAL overlay engine driven by a scripted
// transport. The sample round is served as the bulk body, and every control
// (+Kill, +Elimination, recall, HP, match start/end ...) emits a genuine
// protobuf 0xC1 liveMatchUpdate frame — so decoding, merging, derived values,
// elimination detection and the event stream are the exact code a live match
// runs. Switching LIVE <-> SIMULATION never changes a binding.

import { overlay as overlayProto } from '../../proto/overlay.pb';
import type { EngineTransport, EngineSocket } from '../../overlayClient/transport.ts';

export const SIM_TOURNAMENT_ID = '5ce1a7ed0000000000000001';
export const SIM_ROUND_ID = '5ce1a7ed0000000000000002';

const TEAM_NAMES = [
  'Alpha Wolves', 'Blaze Esports', 'Crimson Tide', 'Delta Force', 'Echo Rangers', 'Falcon Squad', 'Ghost Unit', 'Hydra Gaming',
  'Iron Legion', 'Jade Dragons', 'Kraken Five', 'Lunar Eclipse', 'Mystic Owls', 'Nova Strike', 'Omega Titans', 'Phantom X',
];
const MAPS = ['Erangel', 'Miramar', 'Rondo', 'Sanhok', 'Erangel', 'Rondo'];

type Player = {
  uId: string; playerName: string; picUrl: string; health: number; healthMax: number; liveState: number; bHasDied: boolean;
  killNum: number; damage: number; assists: number; knockouts: number; headShotNum: number; heal: number; survivalTime: number;
  maxKillDistance: number; killNumByGrenade: number; killNumInVehicle: number; gotAirDropNum: number;
  isFiring: boolean; isOutsideBlueCircle: boolean;
};
type Team = { teamId: string; docId: string; teamName: string; teamTag: string; teamLogo: string; slot: number; placePoints: number; rank: number; players: Array<Player & { docId: string }> };

const tag = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 4).toUpperCase();

/**
 * Real event data to run the simulation on instead of the built-in sample (the
 * home page's showcase, picked by the site admin). Display fields only: the
 * match itself is still simulated.
 */
export interface ShowcaseSeed {
  tournament?: { tournamentName?: string; torLogo?: string; primaryColor?: string; secondaryColor?: string; overlayBg?: string; day?: string };
  round?: { roundName?: string; day?: string };
  /** The group these teams play in, when the round has groups. */
  groupName?: string;
  /** One map per match, in order. */
  maps?: string[];
  teams?: Array<{ name: string; tag?: string; logo?: string; slot?: number; players: Array<{ name: string; photo?: string; uId?: string }> }>;
}

type RosterTeam = { teamName: string; teamTag: string; teamLogo: string; slot: number; players: Array<{ playerName: string; picUrl: string; uId: string }> };

const DEFAULT_ROSTER: RosterTeam[] = TEAM_NAMES.map((name, t) => ({
  teamName: name,
  teamTag: tag(name),
  teamLogo: '/def_logo.avif',
  slot: t + 1,
  players: Array.from({ length: 4 }, (_, p) => ({
    playerName: `${tag(name)}_${['Ace', 'Viper', 'Ghost', 'Rook'][p]}`,
    picUrl: '/def_char.avif',
    uId: String(5100000 + t * 10 + p),
  })),
}));

/** Drops empty fields, so a blank value in the seed keeps the sample's. */
const defined = <T extends object>(o?: T): Partial<T> =>
  Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== '')) as Partial<T>;

/** The seed's teams (4 players max each), or the built-in sample when it has fewer than 3 usable teams. */
function rosterFrom(seed?: ShowcaseSeed): RosterTeam[] {
  const teams = (seed?.teams || []).filter((t) => t && t.name && t.players?.length);
  if (teams.length < 3) return DEFAULT_ROSTER;
  return teams.map((t, i) => ({
    teamName: t.name,
    teamTag: t.tag || tag(t.name),
    teamLogo: t.logo || '/def_logo.avif',
    slot: t.slot || i + 1,
    players: t.players.slice(0, 4).map((p, j) => ({
      playerName: p.name,
      picUrl: p.photo || '/def_char.avif',
      uId: p.uId || String(5100000 + i * 10 + j),
    })),
  }));
}

function makeTeams(seed = 1, roster: RosterTeam[] = DEFAULT_ROSTER): Team[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return roster.map((r, t) => ({
    teamId: `team${t + 1}`,
    docId: `d-team${t + 1}`,
    teamName: r.teamName,
    teamTag: r.teamTag,
    teamLogo: r.teamLogo,
    slot: r.slot,
    placePoints: 0,
    rank: 0,
    players: r.players.map((rp, p) => ({
      docId: `p-${t + 1}-${p + 1}`,
      uId: rp.uId,
      playerName: rp.playerName,
      picUrl: rp.picUrl,
      health: 100, healthMax: 100, liveState: 0, bHasDied: false,
      killNum: 0, damage: Math.round(rnd() * 50), assists: 0, knockouts: 0, headShotNum: 0, heal: 0, survivalTime: 0,
      maxKillDistance: 0, killNumByGrenade: 0, killNumInVehicle: 0, gotAirDropNum: 0,
      isFiring: false, isOutsideBlueCircle: false,
    })),
  }));
}

/**
 * The live match as it starts: one team firing and another outside the zone, so
 * firing bullets and zone glows show (and stay) while a design is laid out.
 */
function makeLiveTeams(seed: number, roster?: RosterTeam[]): Team[] {
  const teams = makeTeams(seed, roster);
  teams[0].players.slice(0, 2).forEach((p) => { p.isFiring = true; });
  teams[2].players.forEach((p) => { p.isOutsideBlueCircle = true; });
  return teams;
}

/** A finished past match with plausible numbers, for standings / fraggers bindings. */
function pastMatch(matchNo: number, roster?: RosterTeam[]): any {
  const teams = makeTeams(matchNo * 7919, roster);
  let s = matchNo * 104729;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const order = teams.map((_, i) => i).sort(() => rnd() - 0.5);
  const placePts = [10, 6, 5, 4, 3, 2, 1, 1];
  order.forEach((ti, place) => {
    const team = teams[ti];
    team.rank = place + 1;
    team.placePoints = placePts[place] || 0;
    team.players.forEach((p) => {
      p.killNum = Math.floor(rnd() * (place < 4 ? 6 : 3));
      p.damage = p.killNum * 100 + Math.round(rnd() * 150);
      p.headShotNum = Math.floor(p.killNum / 2);
      p.knockouts = p.killNum + Math.floor(rnd() * 2);
      p.liveState = place === 0 ? 0 : 5;
      p.bHasDied = place !== 0;
      p.health = place === 0 ? 60 : 0;
    });
  });
  return {
    _id: `md-past-${matchNo}`,
    matchId: `m${matchNo}`,
    matchNo,
    teams: teams.map(toMongoTeam),
  };
}

const toMongoTeam = (t: Team) => ({
  ...t,
  _id: t.docId,
  docId: undefined,
  players: t.players.map((p) => ({ ...p, _id: p.docId, docId: undefined })),
});

const encode = (type: 'MatchDataPayload' | 'OverallDataPayload', message: any): Uint8Array => {
  const T: any = (overlayProto as any)[type];
  const body: Uint8Array = T.encode(T.fromObject(message)).finish();
  const out = new Uint8Array(body.length + 1);
  out[0] = 0xc1;
  out.set(body, 1);
  return out;
};

type Listener = (...a: any[]) => void;

class SimSocket implements EngineSocket {
  connected = true;
  private handlers = new Map<string, Set<Listener>>();
  constructor(private onEmit: (event: string, data: any) => void) {}
  on(event: string, cb: Listener) {
    let s = this.handlers.get(event);
    if (!s) { s = new Set(); this.handlers.set(event, s); }
    s.add(cb);
  }
  off(event: string, cb: Listener) { this.handlers.get(event)?.delete(cb); }
  emit(event: string, data?: any) { setTimeout(() => this.onEmit(event, data), 0); }
  push(event: string, payload: any) { for (const cb of Array.from(this.handlers.get(event) || [])) cb(payload); }
}

export interface SimulationControls {
  kill(teamIndex?: number): void;
  eliminate(teamIndex?: number): void;
  recall(): void;
  /** Knock down one alive player (liveState 4). */
  knock(): void;
  /** Pick a knocked player back up. */
  revive(): void;
  /** A milestone the themes' Dom cards show; no type = the next kill streak of one player. */
  milestone(type?: SimMilestone): void;
  /** Players of one alive team start (or all players stop) firing. */
  setFiring(on: boolean): void;
  /** Firing that stops by itself after `ms`, the way the live feed flickers it. */
  pulseFiring(ms?: number): void;
  /** Players of one alive team go outside the zone (or everyone comes back in). */
  setOutsideZone(on: boolean): void;
  setHealth(pct: number): void;
  setAliveTeams(n: number): void;
  rankShuffle(): void;
  matchStart(): void;
  matchEnd(): void;
  reset(): void;
}

export type SimMilestone = 'firstBlood' | 'streak3' | 'streak5' | 'streak8' | 'damage';

export const SIM_MILESTONES: Array<{ id: SimMilestone; label: string }> = [
  { id: 'firstBlood', label: 'First blood' },
  { id: 'streak3', label: 'Domination (3)' },
  { id: 'streak5', label: 'Rampage (5)' },
  { id: 'streak8', label: 'Unstoppable (8)' },
  { id: 'damage', label: 'Damage 500' },
];

export interface Simulation {
  transport: EngineTransport;
  controls: SimulationControls;
}

/**
 * Representative moments of a match, so a design can be checked against each
 * without waiting for one: every scenario is built from the same controls the
 * status bar buttons use (the data is still the simulation's, never real).
 */
export const SIM_SCENARIOS: Array<{ id: string; label: string; hint: string; run(c: SimulationControls): void }> = [
  { id: 'start', label: 'Match start', hint: 'Everyone alive, no kills yet', run: (c) => { c.reset(); } },
  { id: 'early', label: 'Early fights', hint: 'A few kills, one team knocked', run: (c) => { c.reset(); c.kill(0); c.kill(1); c.kill(0); c.knock(); } },
  { id: 'mid', label: 'Mid game', hint: 'Several teams out, health dropping', run: (c) => { c.reset(); for (let i = 0; i < 8; i++) c.kill(); c.eliminate(); c.eliminate(); c.eliminate(); c.setHealth(60); c.knock(); } },
  { id: 'firefight', label: 'Firefight', hint: 'Two teams firing, one knock, a team outside the zone', run: (c) => { c.reset(); c.kill(0); c.setFiring(true); c.setFiring(true); c.knock(); c.setOutsideZone(true); } },
  { id: 'final', label: 'Final circle', hint: 'Three teams left, one outside the zone', run: (c) => { c.reset(); for (let i = 0; i < 12; i++) c.kill(); c.setAliveTeams(3); c.setHealth(35); c.setOutsideZone(true); } },
  { id: 'ended', label: 'Match ended', hint: 'One team left: the winner', run: (c) => { c.reset(); for (let i = 0; i < 10; i++) c.kill(); c.matchEnd(); } },
];

export function runScenario(controls: SimulationControls, id: string): boolean {
  const s = SIM_SCENARIOS.find((x) => x.id === id);
  if (!s) return false;
  s.run(controls);
  return true;
}

export function createSimulation(seed?: ShowcaseSeed): Simulation {
  const roster = rosterFrom(seed);
  const maps = seed?.maps?.length ? seed.maps : MAPS;
  const totalMatches = maps.length;
  let matchNo = Math.min(4, totalMatches);
  let teams = makeLiveTeams(matchNo, roster);
  let seq = 0;
  let rng = 12345;
  const rnd = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  const past = Array.from({ length: matchNo - 1 }, (_, i) => pastMatch(i + 1, roster));
  const matchId = () => `m${matchNo}`;

  const overall = () => {
    const totals = new Map<string, number>();
    for (const m of past) for (const t of m.teams) totals.set(t.teamId, (totals.get(t.teamId) || 0) + t.placePoints);
    return {
      tournamentId: SIM_TOURNAMENT_ID,
      roundId: SIM_ROUND_ID,
      totalMatches,
      teams: roster.map((r, i) => ({
        _id: `d-team${i + 1}`, teamId: `team${i + 1}`, teamName: r.teamName, teamTag: r.teamTag, teamLogo: r.teamLogo,
        placePoints: totals.get(`team${i + 1}`) || 0, players: [],
      })),
    };
  };

  const bulk = () => ({
    tournamentData: { tournamentName: 'ScoreSync Invitational', torLogo: '/def_logo.avif', primaryColor: '#e11d2e', secondaryColor: '#111827', day: 'Day 2', ...defined(seed?.tournament), _id: SIM_TOURNAMENT_ID },
    roundData: { roundName: 'Grand Finals', day: 'Day 2', ...defined(seed?.round), _id: SIM_ROUND_ID, apiEnable: true, publicRev: 1 },
    matchesData: {
      list: maps.map((map, i) => ({ _id: `m${i + 1}`, matchNo: i + 1, map, matchName: `Match ${i + 1}` })),
      // A sample Smash Point so Smash Point layers preview (the operator sets the real one per match).
      current: { _id: matchId(), matchNo, map: maps[matchNo - 1] || 'Rondo', matchName: `Match ${matchNo}`, smashPoint: { enabled: true, value: '80', displayText: '' } },
      effectiveMatchId: matchId(),
    },
    matchDatasData: past.map((md) => ({ matchId: md.matchId, matchData: md })),
    currentMatchData: { matchId: matchId(), matchData: { _id: `md-live-${matchNo}`, matchId: matchId(), matchNo, teams: teams.map(toMongoTeam) } },
    overallData: overall(),
  });

  const snapshot = () => encode('MatchDataPayload', { matchId: matchId(), seq, teams });
  const deltaFor = (changed: Team[]) => encode('MatchDataPayload', { matchId: matchId(), seq: ++seq, teams: changed });

  const sock = new SimSocket((event) => {
    if (event === 'joinRoundRoom') {
      sock.push('roundStructureChanged', { tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, version: 1, publicRev: 1 });
      sock.push('relayUpstreamStatus', { tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, connected: true });
      sock.push('liveMatchSnapshot', snapshot());
    }
    if (event === 'requestLiveSnapshot') sock.push('liveMatchSnapshot', snapshot());
  });

  const aliveTeams = () => teams.filter((t) => t.players.some((p) => p.liveState !== 5));
  const pickAlive = (teamIndex?: number) => (teamIndex != null ? teams[teamIndex] : aliveTeams()[Math.floor(rnd() * aliveTeams().length)]);
  const sendTeams = (changed: Team[]) => sock.push('liveMatchUpdate', deltaFor(changed));
  let firingTimer: ReturnType<typeof setTimeout> | undefined;

  const killPlayers = (team: Team) => {
    team.players.forEach((p) => { p.liveState = 5; p.bHasDied = true; p.health = 0; });
    team.rank = aliveTeams().length + 1;
  };

  const controls: SimulationControls = {
    kill(teamIndex) {
      const team = pickAlive(teamIndex);
      if (!team) return;
      const shooter = team.players.find((p) => p.liveState !== 5) || team.players[0];
      shooter.killNum += 1;
      shooter.damage += 100 + Math.round(rnd() * 80);
      shooter.knockouts += 1;
      shooter.maxKillDistance = Math.max(shooter.maxKillDistance, Math.round(rnd() * 300));
      // someone on another alive team loses a player
      const victims = aliveTeams().filter((t) => t !== team);
      const vt = victims[Math.floor(rnd() * victims.length)];
      const vp = vt?.players.find((p) => p.liveState !== 5);
      if (vp) { vp.liveState = 5; vp.bHasDied = true; vp.health = 0; }
      if (vt && vt.players.every((p) => p.liveState === 5)) vt.rank = aliveTeams().length + 1;
      sendTeams(vt ? [team, vt] : [team]);
    },
    eliminate(teamIndex) {
      const team = pickAlive(teamIndex);
      if (!team) return;
      killPlayers(team);
      sendTeams([team]);
    },
    recall() {
      const team = teams.find((t) => t.players.some((p) => p.liveState === 5) && t.players.some((p) => p.liveState !== 5)) ||
        teams.find((t) => t.players.some((p) => p.liveState === 5));
      const p = team?.players.find((x) => x.liveState === 5);
      if (!team || !p) return;
      p.liveState = 0; p.bHasDied = false; p.health = 100;
      sendTeams([team]);
    },
    knock() {
      const team = aliveTeams().find((t) => t.players.some((p) => p.liveState === 0));
      const p = team?.players.find((x) => x.liveState === 0);
      if (!team || !p) return;
      p.liveState = 4; p.health = 30;
      sendTeams([team]);
    },
    revive() {
      const team = teams.find((t) => t.players.some((p) => p.liveState === 4));
      const p = team?.players.find((x) => x.liveState === 4);
      if (!team || !p) return;
      p.liveState = 0; p.health = 60;
      sendTeams([team]);
    },
    milestone(type) {
      if (type === 'firstBlood') {
        const fresh = teams.every((t) => t.players.every((p) => p.killNum === 0));
        const shoot = () => {
          const team = aliveTeams()[0];
          const p = team?.players.find((x) => x.liveState !== 5);
          if (!team || !p) return;
          p.killNum = 1;
          sendTeams([team]);
        };
        // First blood happens once a match: with kills already on the board, start the next one.
        if (fresh) shoot();
        else { controls.matchStart(); setTimeout(shoot, 300); }
        return;
      }
      if (type === 'damage') {
        const team = aliveTeams().find((t) => t.players.some((p) => p.liveState !== 5 && p.damage < 500));
        const p = team?.players.find((x) => x.liveState !== 5 && x.damage < 500);
        if (!team || !p) return;
        p.damage = 520;
        sendTeams([team]);
        return;
      }
      if (type) {
        const n = type === 'streak3' ? 3 : type === 'streak5' ? 5 : 8;
        const team = aliveTeams().find((t) => t.players.some((p) => p.liveState !== 5 && p.killNum < n));
        const p = team?.players.find((x) => x.liveState !== 5 && x.killNum < n);
        if (!team || !p) return;
        p.killNum = n;
        sendTeams([team]);
        return;
      }
      const team = pickAlive();
      if (!team) return;
      const p = team.players.find((x) => x.liveState !== 5) || team.players[0];
      p.killNum = Math.max(p.killNum + 1, p.killNum < 3 ? 3 : p.killNum < 5 ? 5 : 8);
      sendTeams([team]);
    },
    setFiring(on) {
      clearTimeout(firingTimer);
      if (!on) {
        const changed = teams.filter((t) => t.players.some((p) => p.isFiring));
        changed.forEach((t) => t.players.forEach((p) => { p.isFiring = false; }));
        if (changed.length) sendTeams(changed);
        return;
      }
      const team = aliveTeams().find((t) => !t.players.some((p) => p.isFiring)) || aliveTeams()[0];
      if (!team) return;
      team.players.filter((p) => p.liveState !== 5).slice(0, 2).forEach((p) => { p.isFiring = true; });
      sendTeams([team]);
    },
    pulseFiring(ms = 3000) {
      controls.setFiring(true);
      firingTimer = setTimeout(() => controls.setFiring(false), ms);
    },
    setOutsideZone(on) {
      if (!on) {
        const changed = teams.filter((t) => t.players.some((p) => p.isOutsideBlueCircle));
        changed.forEach((t) => t.players.forEach((p) => { p.isOutsideBlueCircle = false; }));
        if (changed.length) sendTeams(changed);
        return;
      }
      const team = aliveTeams().find((t) => !t.players.some((p) => p.isOutsideBlueCircle)) || aliveTeams()[0];
      if (!team) return;
      team.players.forEach((p) => { if (p.liveState !== 5) p.isOutsideBlueCircle = true; });
      sendTeams([team]);
    },
    setHealth(pct) {
      for (const t of teams) for (const p of t.players) if (p.liveState !== 5) p.health = Math.round(pct);
      sendTeams(teams);
    },
    setAliveTeams(n) {
      const alive = aliveTeams();
      const changed: Team[] = [];
      for (let i = alive.length - 1; i >= Math.max(1, n); i--) { killPlayers(alive[i]); changed.push(alive[i]); }
      if (changed.length) sendTeams(changed);
    },
    rankShuffle() {
      const alive = aliveTeams();
      const t = alive[Math.floor(rnd() * alive.length)];
      if (!t) return;
      t.placePoints += 2;
      t.players[0].killNum += 2;
      sendTeams([t]);
    },
    matchStart() {
      past.push({ ...pastMatch(matchNo, roster), _id: `md-past-${matchNo}` });
      matchNo = matchNo >= totalMatches ? 1 : matchNo + 1;
      teams = makeLiveTeams(matchNo * 31, roster);
      seq = 0;
      sock.push('liveMatchUpdate', deltaFor(teams));
    },
    matchEnd() {
      const alive = aliveTeams();
      alive.slice(1).forEach(killPlayers);
      if (alive[0]) { alive[0].rank = 1; alive[0].placePoints = 10; }
      sendTeams(alive);
    },
    reset() {
      teams = makeLiveTeams(matchNo, roster);
      sock.push('liveMatchSnapshot', encode('MatchDataPayload', { matchId: matchId(), seq: ++seq, teams }));
    },
  };

  const transport: EngineTransport = {
    canFallBack: false,
    async getBulk() {
      return { data: JSON.parse(JSON.stringify(bulk())), bytes: 0 };
    },
    socket: () => sock,
    usingRelay: () => true,
    release() {},
  };

  return { transport, controls };
}
