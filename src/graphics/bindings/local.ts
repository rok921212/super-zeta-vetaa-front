// local.* — the desktop app's own game feed, shaped for bindings.
//
// The desktop tools (map, battle bar, observing player, zone timer, team
// slots) read the game client's local feed on the operator's machine. This
// file turns that feed into one plain object a layout can bind to, so a tool
// designed on the website runs on the desktop from the same paths:
//
//   local.players / local.alivePlayers   every player, with map position
//   local.teams / local.aliveTeams       teams with their players and counts
//   local.observed / local.observedTeam  the player on screen, and their team
//   local.zone                           safe zone: where, how big, time left
//   local.counts                         alive players / teams, kills
//
// On the website there is no local feed: the Designer shows SAMPLE_LOCAL so
// the design can be seen, and a published page gets EMPTY_LOCAL.
//
// Pure: no React, no network. The desktop passes in what it fetched.

/** Side of every map in game units (cm). */
export const MAP_UNITS = 819200;

export interface LocalPlayer {
  uId: string;
  playerName: string;
  picUrl: string;
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  slot: number;
  /** One colour per team, the same on the map and in the lists. */
  color: string;
  health: number;
  healthMax: number;
  healthPct: number;
  killNum: number;
  state: 'alive' | 'knocked' | 'dead';
  alive: boolean;
  knocked: boolean;
  dead: boolean;
  /** Map position, 0-1 from the top-left corner. */
  x: number;
  y: number;
  hasPosition: boolean;
  observed: boolean;
}

export interface LocalTeam {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  slot: number;
  color: string;
  players: LocalPlayer[];
  alive: number;
  knocked: number;
  dead: number;
  kills: number;
  eliminated: boolean;
  observed: boolean;
}

export interface LocalZone {
  known: boolean;
  /** The damage boundary right now, 0-1 of the map. */
  x: number;
  y: number;
  r: number;
  /** The circle it is closing to. */
  nextX: number;
  nextY: number;
  nextR: number;
  hasNext: boolean;
  index: number;
  status: 'wait' | 'delay' | 'move' | 'unknown';
  statusLabel: string;
  moving: boolean;
  /** Seconds left in this phase, and how long the phase is. */
  timeLeft: number;
  total: number;
  /** 0-1 through the phase. */
  progress: number;
}

export interface LocalState {
  connected: boolean;
  /** Map id of the match: erangle, miramar, rondo. */
  map: string;
  players: LocalPlayer[];
  alivePlayers: LocalPlayer[];
  teams: LocalTeam[];
  aliveTeams: LocalTeam[];
  observed: LocalPlayer | null;
  observedTeam: LocalTeam | null;
  zone: LocalZone;
  counts: { alivePlayers: number; aliveTeams: number; kills: number; players: number; teams: number };
}

const NO_ZONE: LocalZone = {
  known: false, x: 0.5, y: 0.5, r: 0.5, nextX: 0.5, nextY: 0.5, nextR: 0.5, hasNext: false,
  index: 0, status: 'unknown', statusLabel: '', moving: false, timeLeft: 0, total: 0, progress: 0,
};

export const EMPTY_LOCAL: LocalState = {
  connected: false, map: '', players: [], alivePlayers: [], teams: [], aliveTeams: [], observed: null, observedTeam: null,
  zone: NO_ZONE, counts: { alivePlayers: 0, aliveTeams: 0, kills: 0, players: 0, teams: 0 },
};

/** What the desktop fetched; every part may be missing. */
export interface LocalInput {
  /** The match's roster from the backend: teams with names, logos and players. */
  matchData?: { teams?: any[] } | null;
  /** The feed's player list (`gettotalplayerlist`). */
  players?: any[] | null;
  observedUid?: string | number | null;
  /** `gameGlobalInfo`: CircleArray [{ X, Y, Size }]. */
  globalInfo?: { CircleArray?: any[] } | null;
  /** `circleInfo`: CircleIndex, CircleStatus, Counter, MaxTime. */
  circle?: any | null;
  map?: string | null;
  connected?: boolean;
}

const num = (v: unknown, or = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : or;
};
const uid = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A steady colour for a team: the same slot always gets the same hue. */
export const teamColor = (slot: number): string => `hsl(${(Math.abs(Math.round(slot)) * 47) % 360}, 82%, 58%)`;

const STATUS: Array<[LocalZone['status'], string]> = [['wait', 'Zone holds'], ['delay', 'Zone closes soon'], ['move', 'Zone closing']];

function buildZone(globalInfo: LocalInput['globalInfo'], circle: any): LocalZone {
  const circles = (globalInfo?.CircleArray || []).map((c: any) => ({ x: num(c?.X) / MAP_UNITS, y: num(c?.Y) / MAP_UNITS, r: num(c?.Size) / MAP_UNITS }));
  if (!circles.length) return NO_ZONE;
  const hasTimer = circle && Number.isFinite(parseInt(String(circle.CircleIndex), 10));
  const index = hasTimer ? parseInt(String(circle.CircleIndex), 10) : circles.length - 1;
  // The zone moves FROM circles[index - 1] TO circles[index].
  const from = hasTimer ? circles[index - 1] ?? circles[0] : circles[circles.length - 2] ?? circles[circles.length - 1];
  const to = hasTimer ? circles[index] : circles[circles.length - 1];
  const code = hasTimer ? parseInt(String(circle.CircleStatus), 10) : -1;
  const [status, statusLabel] = STATUS[code] ?? (['unknown', ''] as [LocalZone['status'], string]);
  const total = hasTimer ? num(circle.MaxTime) : 0;
  const counter = hasTimer ? num(circle.Counter) : 0;
  const progress = total > 0 ? clamp01(counter / total) : 0;
  const t = status === 'move' && to ? progress : 0;
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    known: true,
    x: to ? mix(from.x, to.x) : from.x,
    y: to ? mix(from.y, to.y) : from.y,
    r: to ? mix(from.r, to.r) : from.r,
    nextX: (to ?? from).x, nextY: (to ?? from).y, nextR: (to ?? from).r,
    hasNext: !!to && t < 1,
    index, status, statusLabel, moving: status === 'move',
    timeLeft: Math.max(0, Math.ceil(total - counter)), total, progress,
  };
}

export function buildLocal(input: LocalInput): LocalState {
  const raw = new Map<string, any>();
  for (const p of input.players || []) {
    const id = uid(p?.uId);
    if (id) raw.set(id, p);
  }
  const observedUid = uid(input.observedUid);

  const player = (roster: any, live: any, team: { teamId: string; teamName: string; teamTag: string; teamLogo: string; slot: number; color: string }): LocalPlayer => {
    const src = live ?? roster ?? {};
    const healthMax = num(src.healthMax, 100) || 100;
    const health = num(src.health, live ? 0 : healthMax);
    const dead = !!src.bHasDied || num(src.liveState) === 5;
    const knocked = !dead && num(src.liveState) === 4;
    const loc = live?.location;
    const hasPosition = !!loc && (num(loc.x) !== 0 || num(loc.y) !== 0);
    const id = uid(live?.uId ?? roster?.uId);
    return {
      uId: id,
      playerName: String(roster?.playerName || live?.playerName || ''),
      picUrl: String(roster?.picUrl || roster?.photo || live?.picUrl || ''),
      ...team,
      health, healthMax, healthPct: clamp01(health / healthMax) * 100,
      killNum: num(src.killNum),
      state: dead ? 'dead' : knocked ? 'knocked' : 'alive',
      alive: !dead, knocked, dead,
      x: hasPosition ? clamp01(num(loc.x) / MAP_UNITS) : 0.5,
      y: hasPosition ? clamp01(num(loc.y) / MAP_UNITS) : 0.5,
      hasPosition,
      observed: !!observedUid && id === observedUid,
    };
  };

  const teams: LocalTeam[] = [];
  const finish = (base: Omit<LocalTeam, 'alive' | 'knocked' | 'dead' | 'kills' | 'eliminated' | 'observed' | 'players'>, players: LocalPlayer[]) => {
    const alive = players.filter((p) => p.alive).length;
    teams.push({
      ...base, players, alive,
      knocked: players.filter((p) => p.knocked).length,
      dead: players.length - alive,
      kills: players.reduce((sum, p) => sum + p.killNum, 0),
      eliminated: players.length > 0 && alive === 0,
      observed: players.some((p) => p.observed),
    });
  };

  const seen = new Set<string>();
  for (const t of input.matchData?.teams || []) {
    const slot = num(t?.slot, teams.length + 1);
    const base = {
      teamId: uid(t?.teamId ?? t?._id), teamName: String(t?.teamName || ''), teamTag: String(t?.teamTag || t?.teamName || ''),
      teamLogo: String(t?.teamLogo || ''), slot, color: teamColor(slot),
    };
    const players = (t?.players || []).map((p: any) => {
      const id = uid(p?.uId);
      if (id) seen.add(id);
      return player(p, id ? raw.get(id) : null, base);
    });
    finish(base, players);
  }
  // Players the feed has that the roster does not: grouped by the feed's own team id.
  const strays = new Map<string, any[]>();
  raw.forEach((p, id) => {
    if (seen.has(id)) return;
    const key = uid(p?.teamId) || '?';
    strays.set(key, [...(strays.get(key) || []), p]);
  });
  strays.forEach((list, key) => {
    const slot = num(key, teams.length + 1);
    const name = String(list[0]?.teamName || `Team ${key}`);
    const base = { teamId: key, teamName: name, teamTag: name, teamLogo: '', slot, color: teamColor(slot) };
    finish(base, list.map((p: any) => player(null, p, base)));
  });
  teams.sort((a, b) => a.slot - b.slot);

  const players = teams.flatMap((t) => t.players);
  const observed = players.find((p) => p.observed) ?? null;
  const alivePlayers = players.filter((p) => p.alive);
  const aliveTeams = teams.filter((t) => !t.eliminated);
  return {
    connected: input.connected ?? raw.size > 0,
    map: String(input.map || '').toLowerCase(),
    players, alivePlayers, teams, aliveTeams, observed,
    observedTeam: observed ? teams.find((t) => t.observed) ?? null : null,
    zone: buildZone(input.globalInfo, input.circle),
    counts: {
      alivePlayers: alivePlayers.length, aliveTeams: aliveTeams.length, kills: players.reduce((sum, p) => sum + p.killNum, 0),
      players: players.length, teams: teams.length,
    },
  };
}

// ── What the Designer shows, since the website has no local feed ─────────────
const SAMPLE_TAGS = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL'];

export const SAMPLE_LOCAL: LocalState = buildLocal({
  connected: true,
  map: 'erangle',
  observedUid: '1001',
  matchData: {
    teams: SAMPLE_TAGS.map((tag, t) => ({
      teamId: String(t + 1), slot: t + 1, teamName: `Team ${tag[0]}${tag.slice(1).toLowerCase()}`, teamTag: tag, teamLogo: '/def_logo.avif',
      players: [0, 1, 2, 3].map((i) => ({ uId: String((t + 1) * 1000 + i + 1), playerName: `${tag.slice(0, 3)}_P${i + 1}`, picUrl: '/def_char.avif' })),
    })),
  },
  players: SAMPLE_TAGS.flatMap((_, t) =>
    [0, 1, 2, 3].map((i) => {
      // Teams spread around the zone, players close to their team.
      const angle = (t / SAMPLE_TAGS.length) * Math.PI * 2;
      const [cx, cy] = [0.52 + Math.cos(angle) * 0.14, 0.48 + Math.sin(angle) * 0.14];
      const dead = t === 6 || (t === 3 && i > 1);
      return {
        uId: String((t + 1) * 1000 + i + 1), teamId: t + 1,
        location: { x: (cx + (i % 2) * 0.012) * MAP_UNITS, y: (cy + Math.floor(i / 2) * 0.012) * MAP_UNITS, z: 0 },
        health: dead ? 0 : t === 1 && i === 2 ? 35 : 100 - i * 12, healthMax: 100,
        liveState: dead ? 5 : t === 1 && i === 2 ? 4 : 0, bHasDied: dead, killNum: (t * 3 + i * 2) % 5,
      };
    })
  ),
  globalInfo: { CircleArray: [{ X: 0.5 * MAP_UNITS, Y: 0.5 * MAP_UNITS, Size: 0.45 * MAP_UNITS }, { X: 0.52 * MAP_UNITS, Y: 0.48 * MAP_UNITS, Size: 0.26 * MAP_UNITS }, { X: 0.54 * MAP_UNITS, Y: 0.47 * MAP_UNITS, Size: 0.14 * MAP_UNITS }] },
  circle: { CircleIndex: '2', CircleStatus: '2', Counter: '40', MaxTime: '120', GameTime: '600' },
});
