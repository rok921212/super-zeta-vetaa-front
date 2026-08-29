// One reduce over a single match's players — replaces the hand-rolled
// accumulator loop in every theme's off-screen/MatchSummary.tsx (and the
// per-team display reduces in WwcdStats / WwcdSummary / teamh2h).
//
// The result carries the SUPERSET of every field any theme's MatchSummary
// renders (T1/2/3/7 use the elims/assists/knockouts/vehicle/grenade/
// headshot set; T4/T5 use heals/airdrops/damage/revives/longestDistElim/
// matchDuration; T6 a mix). Aliases (totalElims == totalEliminations,
// totalKnocks == totalKnockouts, totalGrenadeKills == totalKillsByGrenade)
// keep each theme's existing `stats.xxx` JSX working unchanged.

export interface MatchTotalsTeam {
  teamId: string;
  teamTag: string;
  teamName?: string;
  teamLogo?: string;
  placePoints: number;
  totalKills: number;
  totalDamage: number;
  totalAssists: number;
  totalKnockouts: number;
  totalHeadshots: number;
}

export interface MatchTotals {
  totalEliminations: number;
  totalElims: number;
  totalAssists: number;
  totalKnockouts: number;
  totalKnocks: number;
  totalKillsInVehicle: number;
  totalKillsByGrenade: number;
  totalGrenadeKills: number;
  totalHeadshots: number;
  totalHeals: number;
  totalAirdrops: number;
  totalDamage: number;
  totalRevives: number;
  /** running MAX of maxKillDistance across every player in the match */
  longestDistElim: number;
  /** max survivalTime (seconds) of the winning team — 0 if no winner yet */
  matchDurationSeconds: number;
  teams: MatchTotalsTeam[];
}

const n = (v: any) => Number(v) || 0;

// Winner test mirrors officialStandings.isWinningPlacement (kept inline so
// this module has no import cycle risk): rank === 1, else placePoints 10.
const isWinner = (team: any): boolean => {
  const rank = team.players?.[0]?.rank;
  if (rank === 1) return true;
  if (typeof rank === 'number' && rank > 0) return false;
  return n(team.placePoints) === 10;
};

export function computeMatchTotals(matchData: { teams?: any[] } | null | undefined): MatchTotals | null {
  if (!matchData?.teams) return null;

  const t: MatchTotals = {
    totalEliminations: 0, totalElims: 0,
    totalAssists: 0,
    totalKnockouts: 0, totalKnocks: 0,
    totalKillsInVehicle: 0,
    totalKillsByGrenade: 0, totalGrenadeKills: 0,
    totalHeadshots: 0,
    totalHeals: 0,
    totalAirdrops: 0,
    totalDamage: 0,
    totalRevives: 0,
    longestDistElim: 0,
    matchDurationSeconds: 0,
    teams: [],
  };

  for (const team of matchData.teams) {
    const players: any[] = team.players || [];
    const teamRow: MatchTotalsTeam = {
      teamId: String(team.teamId ?? team._id ?? ''),
      teamTag: team.teamTag,
      teamName: team.teamName,
      teamLogo: team.teamLogo,
      placePoints: n(team.placePoints),
      totalKills: 0, totalDamage: 0, totalAssists: 0, totalKnockouts: 0, totalHeadshots: 0,
    };

    for (const p of players) {
      const kills = n(p.killNum);
      const damage = n(p.damage);
      const assists = n(p.assists);
      const knocks = n(p.knockouts);
      const headshots = n(p.headShotNum);

      t.totalEliminations += kills;
      t.totalAssists += assists;
      t.totalKnockouts += knocks;
      t.totalKillsInVehicle += n(p.killNumInVehicle);
      t.totalKillsByGrenade += n(p.killNumByGrenade);
      t.totalHeadshots += headshots;
      t.totalHeals += n(p.heal);
      t.totalAirdrops += n(p.gotAirDropNum);
      t.totalDamage += damage;
      t.totalRevives += n(p.rescueTimes);
      if (n(p.maxKillDistance) > t.longestDistElim) t.longestDistElim = n(p.maxKillDistance);

      teamRow.totalKills += kills;
      teamRow.totalDamage += damage;
      teamRow.totalAssists += assists;
      teamRow.totalKnockouts += knocks;
      teamRow.totalHeadshots += headshots;
    }

    if (isWinner(team)) {
      const maxSurvival = players.reduce((mx, p) => Math.max(mx, n(p.survivalTime)), 0);
      if (maxSurvival > t.matchDurationSeconds) t.matchDurationSeconds = maxSurvival;
    }

    t.teams.push(teamRow);
  }

  t.totalElims = t.totalEliminations;
  t.totalKnocks = t.totalKnockouts;
  t.totalGrenadeKills = t.totalKillsByGrenade;
  return t;
}
