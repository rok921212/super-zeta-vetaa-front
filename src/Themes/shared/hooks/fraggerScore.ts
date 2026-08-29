// Fragger Score: a single weighted, pool-normalized ranking used for both
// the whole-event "Overall Fragger Score" (OverallFrags/EventMvp, fed every
// match in the round) and the "Single-Match Fragger Score" (MatchFragrs, fed
// just the current match wrapped in a 1-element array). One pool-builder +
// one calculator serves both — appearances, sums, and the per-player MAX
// (longest kill) all degenerate correctly to the single-match case with no
// branching required anywhere in this file.

// Deliberately minimal — no index signature. Every existing local
// Player/Team/MatchData interface in OverallFrags.tsx/EventMvp.tsx/
// MatchFragrs.tsx (and unsortteams.ts's exports) already satisfies this
// shape structurally. Fields not declared here (damage, headShotNum,
// maxKillDistance, knockouts, assists) live untyped on the proto payload —
// read via `(player as any).field`, matching how every other off-screen
// component in this codebase already accesses them.
export interface FraggerScorePlayerLike {
  _id: string;
  uId?: string | number;
  playerName: string;
  picUrl?: string;
  killNum?: number;
  [key: string]: any;
}

export interface FraggerScoreTeamLike {
  teamId?: string;
  teamTag: string;
  teamName?: string;
  teamLogo: string;
  placePoints?: number;
  players: FraggerScorePlayerLike[];
}

export interface FraggerScoreMatchLike {
  teams: FraggerScoreTeamLike[];
}

// Per-player aggregate across every appearance in the pool it was built
// from. `latestPlayerRaw` carries the most recent raw player record so a
// caller (MatchFragrs) can pull live-only fields (health/liveState/
// bHasDied) back out without a second lookup — this module only aggregates
// the 5 scoring stats, not the full player record.
export interface FraggerPoolEntry {
  key: string;
  _id: string;
  uId?: string | number;
  playerName: string;
  picUrl?: string;
  teamTag: string;
  teamName: string;
  teamLogo: string;
  teamPoints: number;
  totalKills: number;
  totalDamage: number;
  totalHeadshots: number;
  totalKnockouts: number;
  totalAssists: number;
  // Running MAX across appearances, not a sum — a player's longest single
  // kill of the pool, not the sum of every kill distance they ever landed.
  longestKillDistance: number;
  // Sum of grenade eliminations across the pool.
  totalGrenadeKills: number;
  // Running MAX of (driveDistance + marchDistance) — a player's single
  // best match's total travel, not the sum across every match.
  maxTravelDistance: number;
  appearances: number;
  latestPlayerRaw: FraggerScorePlayerLike;
}

// A match counts if any team has recorded a result — placeholder /
// not-yet-started matches (every team at 0 kills / 0 placement) are
// skipped so they don't dilute the pool averages. Mirrors
// officialStandings.isMatchPlayed (inlined to avoid an import cycle).
function fraggerMatchPlayed(match: FraggerScoreMatchLike): boolean {
  return match.teams.some((team) => {
    const kills = team.players.reduce((s, p) => s + (Number(p.killNum) || 0), 0);
    return kills > 0 || (Number(team.placePoints) || 0) > 0;
  });
}

// Walks matches -> teams -> players, aggregating by player identity
// (uId falls back to _id, same convention already used in OverallFrags.tsx
// and EventMvp.tsx). Unplayed matches are skipped. No sorting here — that's
// the caller's job via compareFraggerScore below.
export function buildFraggerPool(matches: FraggerScoreMatchLike[]): FraggerPoolEntry[] {
  const pool = new Map<string, FraggerPoolEntry>();

  matches.filter(fraggerMatchPlayed).forEach((match) => {
    match.teams.forEach((team) => {
      team.players.forEach((player) => {
        const key = String(player.uId || player._id);
        const kills = Number(player.killNum || 0);
        const damage = Number(player.damage ?? 0) || 0;
        const headshots = Number(player.headShotNum ?? 0) || 0;
        const knockouts = Number(player.knockouts ?? 0) || 0;
        const assists = Number(player.assists ?? 0) || 0;
        const longestKill = Number(player.maxKillDistance ?? 0) || 0;
        const grenadeKills = Number(player.killNumByGrenade ?? player.grenadeKills ?? 0) || 0;
        const travel =
          (Number(player.driveDistance ?? 0) || 0) + (Number(player.marchDistance ?? 0) || 0);
        const teamPoints = team.placePoints || 0;

        const existing = pool.get(key);
        if (!existing) {
          pool.set(key, {
            key,
            _id: player._id,
            uId: player.uId,
            playerName: player.playerName,
            picUrl: player.picUrl,
            teamTag: team.teamTag,
            teamName: team.teamName || team.teamTag,
            teamLogo: team.teamLogo,
            teamPoints,
            totalKills: kills,
            totalDamage: damage,
            totalHeadshots: headshots,
            totalKnockouts: knockouts,
            totalAssists: assists,
            longestKillDistance: longestKill,
            totalGrenadeKills: grenadeKills,
            maxTravelDistance: travel,
            appearances: 1,
            latestPlayerRaw: player,
          });
          return;
        }

        existing.totalKills += kills;
        existing.totalDamage += damage;
        existing.totalHeadshots += headshots;
        existing.totalKnockouts += knockouts;
        existing.totalAssists += assists;
        existing.longestKillDistance = Math.max(existing.longestKillDistance, longestKill);
        existing.totalGrenadeKills += grenadeKills;
        existing.maxTravelDistance = Math.max(existing.maxTravelDistance, travel);
        existing.appearances += 1;
        existing.latestPlayerRaw = player;
        if (player.playerName) existing.playerName = player.playerName;
        if (player.picUrl) existing.picUrl = player.picUrl;
        // Attribute display team to whichever team this player had the
        // highest placement with so far (mirrors OverallFrags.tsx today).
        if (teamPoints > existing.teamPoints) {
          existing.teamTag = team.teamTag;
          existing.teamName = team.teamName || team.teamTag;
          existing.teamLogo = team.teamLogo;
          existing.teamPoints = teamPoints;
        }
      });
    });
  });

  return Array.from(pool.values());
}

export interface FraggerScoreWeights {
  kills: number;
  damage: number;
  headshots: number;
  longestKill: number;
  knockouts: number;
}

export const DEFAULT_FRAGGER_SCORE_WEIGHTS: FraggerScoreWeights = {
  kills: 0.3,
  damage: 0.3,
  headshots: 0.2,
  longestKill: 0.1,
  knockouts: 0.1,
};

export interface FraggerScoreResult extends FraggerPoolEntry {
  avgKills: number;
  avgDamage: number;
  avgHeadshots: number;
  avgKnockouts: number;
  avgAssists: number;
  fraggerScore: number;
}

// Overall Fragger Score / Single-Match Fragger Score (official PUBG MOBILE
// "Gunslinger" formula):
//   (PlayerAvgKills / PoolAvgKills * 30%) + (PlayerAvgDamage / PoolAvgDamage * 30%)
//   + (PlayerAvgHeadshots / PoolAvgHeadshots * 20%) + (PlayerLongestKill / PoolAvgLongestKill * 10%)
//   + (PlayerAvgKnockouts / PoolAvgKnockouts * 10%)
// Each term is guarded independently: a pool average of 0 for one stat
// zeroes only that term, not the whole score. The earlier OverallFrags.tsx
// formula zeroed a player's entire score if ANY single pool average (e.g.
// avgSurvival) was 0 — deliberately not carried forward here.
export function computeFraggerScores(
  pool: FraggerPoolEntry[],
  weights: FraggerScoreWeights = DEFAULT_FRAGGER_SCORE_WEIGHTS
): FraggerScoreResult[] {
  if (pool.length === 0) return [];

  let totalKillsAll = 0;
  let totalDamageAll = 0;
  let totalHeadshotsAll = 0;
  let totalKnockoutsAll = 0;
  let totalAppearances = 0;
  let totalLongestKillAll = 0;

  pool.forEach((p) => {
    totalKillsAll += p.totalKills;
    totalDamageAll += p.totalDamage;
    totalHeadshotsAll += p.totalHeadshots;
    totalKnockoutsAll += p.totalKnockouts;
    totalAppearances += p.appearances;
    totalLongestKillAll += p.longestKillDistance;
  });

  const poolAvgKills = totalAppearances > 0 ? totalKillsAll / totalAppearances : 0;
  const poolAvgDamage = totalAppearances > 0 ? totalDamageAll / totalAppearances : 0;
  const poolAvgHeadshots = totalAppearances > 0 ? totalHeadshotsAll / totalAppearances : 0;
  const poolAvgKnockouts = totalAppearances > 0 ? totalKnockoutsAll / totalAppearances : 0;
  // Mean across PLAYERS (not appearances) of each player's own longest
  // kill — it's already a per-player max, not a summable per-appearance
  // quantity, so averaging it over appearance count would be wrong.
  const poolAvgLongestKill = pool.length > 0 ? totalLongestKillAll / pool.length : 0;

  const ratio = (playerAvg: number, poolAvg: number, weight: number) =>
    poolAvg > 0 ? (playerAvg / poolAvg) * weight : 0;

  return pool.map((p) => {
    const avgKills = p.appearances > 0 ? p.totalKills / p.appearances : 0;
    const avgDamage = p.appearances > 0 ? p.totalDamage / p.appearances : 0;
    const avgHeadshots = p.appearances > 0 ? p.totalHeadshots / p.appearances : 0;
    const avgKnockouts = p.appearances > 0 ? p.totalKnockouts / p.appearances : 0;
    const avgAssists = p.appearances > 0 ? p.totalAssists / p.appearances : 0;

    const fraggerScore =
      ratio(avgKills, poolAvgKills, weights.kills) +
      ratio(avgDamage, poolAvgDamage, weights.damage) +
      ratio(avgHeadshots, poolAvgHeadshots, weights.headshots) +
      ratio(p.longestKillDistance, poolAvgLongestKill, weights.longestKill) +
      ratio(avgKnockouts, poolAvgKnockouts, weights.knockouts);

    return { ...p, avgKills, avgDamage, avgHeadshots, avgKnockouts, avgAssists, fraggerScore };
  });
}

// Ranking order: raw total kills decides first (most kills wins), and only
// when two players are tied on kills does the weighted Gunslinger formula
// (fraggerScore) act as the tiebreaker. totalDamage is kept as a final
// fallback for the rare case both kills and fraggerScore tie exactly.
export function compareFraggerScore(a: FraggerScoreResult, b: FraggerScoreResult): number {
  if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
  if (b.fraggerScore !== a.fraggerScore) return b.fraggerScore - a.fraggerScore;
  return b.totalDamage - a.totalDamage;
}

// The single top pool entry by one numeric stat — for the per-category
// "players to watch" leaderboards (Theme6/Theme7 Achieve). Replaces the
// hand-rolled Map<string, AggregatedPlayer> those files used to build.
export function pickLeader<T extends FraggerPoolEntry>(
  pool: T[],
  statKey: keyof FraggerPoolEntry
): T | null {
  if (!pool.length) return null;
  return [...pool].sort(
    (a, b) => (Number(b[statKey]) || 0) - (Number(a[statKey]) || 0)
  )[0] ?? null;
}