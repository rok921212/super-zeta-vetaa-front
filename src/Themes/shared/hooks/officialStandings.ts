// Official PUBG MOBILE tie-break logic for cross-match tournament
// standings, shared by every ThemeN/off-screen/OverAllData.tsx so the
// ranking rules stop drifting independently per theme.
//
// Sort order:
//   PRIMARY:  Total Score (Kill Points + Placement Points)
//   Tie-break (only when Total Score is equal for both teams):
//     1. Most Chicken Dinners / #1 finishes (WWCD)
//     2. Highest total Placement Points
//     3. Highest total Kill / Elimination Points
//     4. Better placement in the most recent match
//
// NOTE: this previously had WWCD as the primary key with Total Score
// folded into the tie-break chain. That was changed intentionally —
// Total Score is now checked FIRST, and the WWCD/placement/kills/last-match
// chain only runs when both teams have an identical Total Score.

export interface StandingsPlayerLike {
  killNum?: number;
  rank?: number;
}

export interface StandingsTeamLike {
  teamId: string;
  placePoints?: number;
  players: StandingsPlayerLike[];
}

export interface StandingsMatchLike {
  teams: StandingsTeamLike[];
  matchNo?: number;
}

// Mirrors the backend's own win definition exactly (see
// Render_hosted/test-back/controller/overall.controller.js line 213):
// prefer the real computed rank; only fall back to the placePoints
// heuristic when no rank is available. A team's rank lives on its first
// player record (same convention already used in unsortteams.ts).
export function isWinningPlacement(placePoints?: number, rank?: number): boolean {
  if (rank === 1) return true;
  if (typeof rank === 'number' && rank > 0) return false;
  return Number(placePoints || 0) === 10;
}

// A match counts as "played" if at least one team has a recorded result.
// Matches that exist as placeholders (scheduled but not yet started) come
// back with every team at 0 kills / 0 placement — those must be skipped
// when picking the match to break ties against.
export function isMatchPlayed(match: StandingsMatchLike): boolean {
  return match.teams.some((team) => {
    const kills = team.players.reduce((s, p) => s + (p.killNum || 0), 0);
    return kills > 0 || (team.placePoints || 0) > 0;
  });
}

// Defensive: sort matches by matchNo when present, so "last match" is
// based on actual match order rather than however the caller's array
// happened to be built (fetch order, ID order, async completion order,
// etc). Matches without a matchNo keep their relative position (stable
// sort) rather than being reshuffled.
function sortedByMatchNo<T extends StandingsMatchLike>(matches: T[]): T[] {
  const hasAnyMatchNo = matches.some((m) => typeof m.matchNo === 'number');
  if (!hasAnyMatchNo) return matches;
  return [...matches].sort((a, b) => {
    if (typeof a.matchNo !== 'number') return 1;
    if (typeof b.matchNo !== 'number') return -1;
    return a.matchNo - b.matchNo;
  });
}

export function getLastPlayedMatchIndex(matches: StandingsMatchLike[]): number {
  let lastPlayedIndex = -1;
  for (let idx = 0; idx < matches.length; idx++) {
    if (isMatchPlayed(matches[idx])) lastPlayedIndex = idx;
  }
  return lastPlayedIndex;
}

// Each team's placePoints specifically from the last-played match — a
// team's placePoints in a single match already directly encodes that
// match's placement (higher = better finish), so this alone is enough for
// tie-break #4 without needing a separate rank field.
export function getLastMatchPlacePoints(matches: StandingsMatchLike[]): Map<string, number> {
  const map = new Map<string, number>();
  const ordered = sortedByMatchNo(matches);
  const idx = getLastPlayedMatchIndex(ordered);
  if (idx === -1) return map;
  ordered[idx].teams.forEach((team) => map.set(team.teamId, team.placePoints || 0));
  return map;
}

export interface OfficialStandingsInput {
  totalScore: number;
  wwcd: number;
  totalPlacePoints: number;
  totalKills: number;
  lastMatchPlacePoints: number;
}

export function compareOfficialStandings(a: OfficialStandingsInput, b: OfficialStandingsInput): number {
  // Primary: total score (kills + placement points)
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;

  // Totals tied — fall through to the official tie-break chain
  if (b.wwcd !== a.wwcd) return b.wwcd - a.wwcd;
  if (b.totalPlacePoints !== a.totalPlacePoints) return b.totalPlacePoints - a.totalPlacePoints;
  if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
  return b.lastMatchPlacePoints - a.lastMatchPlacePoints;
}

// --- Full standings builder (shared, moved from OverAllData.tsx) ---

export interface DisplayTeamLike extends StandingsTeamLike {
  teamName: string;
  teamTag: string;
  teamLogo: string;
}

export interface DisplayMatchLike<T extends DisplayTeamLike> extends StandingsMatchLike {
  teams: T[];
}

export interface AggregatedTeam {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  totalKills: number;
  totalPlacePoints: number;
  totalScore: number;
  wwcd: number;
}

export interface RankedTeam extends AggregatedTeam {
  rank: number;
  rankChange: number | null;
}

/**
 * Single-pass ranking builder.
 *
 * Walks every match exactly once, summing each team's running totals,
 * while also recording the *last played* match's per-team contribution
 * (skipping any trailing scheduled-but-not-started matches). The
 * "previous" standing is then derived by subtracting that one delta from
 * the final totals — no second full aggregation needed.
 *
 * Matches are defensively re-sorted by matchNo (when present) before
 * processing, so "last match" reflects actual match order regardless of
 * how the caller's array was built/fetched.
 */
export function buildStandings<T extends DisplayTeamLike>(
  matches: Array<DisplayMatchLike<T>>
): { current: AggregatedTeam[]; previous: AggregatedTeam[]; playedCount: number } {
  const ordered = sortedByMatchNo(matches);

  const totals = new Map<string, AggregatedTeam>();
  const lastMatchDelta = new Map<string, { kills: number; place: number; wwcd: number }>();

  const lastPlayedIndex = getLastPlayedMatchIndex(ordered);
  let playedCount = 0;
  for (const match of ordered) {
    if (isMatchPlayed(match)) playedCount++;
  }

  ordered.forEach((match, idx) => {
    for (const team of match.teams) {
      const kills = team.players.reduce((s, p) => s + (p.killNum || 0), 0);
      const place = team.placePoints || 0;
      const isWWCD = isWinningPlacement(team.placePoints, team.players?.[0]?.rank) ? 1 : 0;

      let t = totals.get(team.teamId);
      if (!t) {
        t = {
          teamId: team.teamId,
          teamName: team.teamName,
          teamTag: team.teamTag,
          teamLogo: team.teamLogo,
          totalKills: 0,
          totalPlacePoints: 0,
          totalScore: 0,
          wwcd: 0,
        };
        totals.set(team.teamId, t);
      }
      t.totalKills += kills;
      t.totalPlacePoints += place;
      t.totalScore += kills + place;
      t.wwcd += isWWCD;

      if (idx === lastPlayedIndex) {
        lastMatchDelta.set(team.teamId, { kills, place, wwcd: isWWCD });
      }
    }
  });

  const toInput = (t: AggregatedTeam): OfficialStandingsInput => ({
    totalScore: t.totalScore,
    wwcd: t.wwcd,
    totalPlacePoints: t.totalPlacePoints,
    totalKills: t.totalKills,
    lastMatchPlacePoints: lastMatchDelta.get(t.teamId)?.place || 0,
  });

  const current = Array.from(totals.values()).sort((a, b) => compareOfficialStandings(toInput(a), toInput(b)));

  // Only meaningful once at least 2 matches have actually been played —
  // with just one completed match there is no "before" state to diff.
  const previous =
    playedCount > 1
      ? current
          .map((team) => {
            const delta = lastMatchDelta.get(team.teamId);
            if (!delta) return team; // team sat out the most recent match — no change to subtract
            return {
              ...team,
              totalKills: team.totalKills - delta.kills,
              totalPlacePoints: team.totalPlacePoints - delta.place,
              totalScore: team.totalScore - (delta.kills + delta.place),
              wwcd: team.wwcd - delta.wwcd,
            };
          })
          .sort((a, b) => compareOfficialStandings(toInput(a), toInput(b)))
      : [];

  return { current, previous, playedCount };
}

/**
 * Wraps buildStandings and derives each team's rank + rankChange
 * (index-position jump/drop vs standings before the last-played match).
 * rankChange is null (never a misleading 0) whenever there's no prior
 * played match to compare against.
 */
export function computeRankedStandings<T extends DisplayTeamLike>(
  matches: Array<DisplayMatchLike<T>>
): RankedTeam[] {
  const { current, previous, playedCount } = buildStandings(matches);
  const hasPreviousData = playedCount > 1;

  const prevRankMap = new Map<string, number>();
  previous.forEach((team, index) => prevRankMap.set(team.teamId, index + 1));

  return current.map((team, index) => {
    const currentRank = index + 1;
    const previousRank = prevRankMap.get(team.teamId);
    const rankChange = hasPreviousData && previousRank !== undefined ? previousRank - currentRank : null;
    return { ...team, rank: currentRank, rankChange };
  });
}

// --- OverAllData / Champions / RunnerUp standings list (shared) ---

function toOfficialInput(
  t: Pick<AggregatedTeam, 'totalScore' | 'wwcd' | 'totalPlacePoints' | 'totalKills'>,
  lastMatchPlacePoints = 0
): OfficialStandingsInput {
  return {
    totalScore: t.totalScore,
    wwcd: t.wwcd,
    totalPlacePoints: t.totalPlacePoints,
    totalKills: t.totalKills,
    lastMatchPlacePoints,
  };
}

export interface OverallStandingRow extends RankedTeam {
  /** Count of *played* matches (isMatchPlayed) that contain this team. */
  matchesPlayed: number;
  /** Total Score gap to the next-ranked team (0 for the last row). */
  leadOverNext: number;
  // ── aliases so existing per-theme OverAllData JSX keeps working ──
  placePoints: number; // === totalPlacePoints
  total: number; // === totalScore
  booyah: number; // === wwcd
}

export interface OverallSnapshotTeamLike extends DisplayTeamLike {
  players: StandingsPlayerLike[];
  wwcd?: number;
}

/**
 * The one OverAllData / Champions / RunnerUp standings list for every
 * theme. Prefers match-by-match history (computeRankedStandings — Total
 * Score is the PRIMARY key, real rankChange). Falls back to a single
 * overallData snapshot when there is no per-match history (rankChange is
 * null — nothing to diff). Decorates every row with matchesPlayed +
 * leadOverNext, plus placePoints / total / booyah aliases.
 *
 * This replaces the per-theme aggregation loops that called
 * compareOfficialStandings WITHOUT a totalScore field — which silently
 * skipped the primary key and ranked WWCD-first.
 */
export function buildOverallStandings<T extends DisplayTeamLike>(
  matchDatas: Array<DisplayMatchLike<T>> | null | undefined,
  overallData?: { teams?: OverallSnapshotTeamLike[] } | null
): OverallStandingRow[] {
  let ranked: RankedTeam[] = [];
  const playedByTeam = new Map<string, number>();

  if (matchDatas && matchDatas.length > 0) {
    ranked = computeRankedStandings(matchDatas);
    for (const m of sortedByMatchNo(matchDatas)) {
      if (!isMatchPlayed(m)) continue;
      for (const t of m.teams) {
        if (!t.players || t.players.length === 0) continue;
        playedByTeam.set(t.teamId, (playedByTeam.get(t.teamId) || 0) + 1);
      }
    }
  } else if (overallData?.teams && overallData.teams.length > 0) {
    const rows: AggregatedTeam[] = overallData.teams.map((team) => {
      const totalKills = (team.players || []).reduce((s, p) => s + (p.killNum || 0), 0);
      const totalPlacePoints = team.placePoints || 0;
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        teamTag: team.teamTag,
        teamLogo: team.teamLogo,
        totalKills,
        totalPlacePoints,
        totalScore: totalKills + totalPlacePoints,
        wwcd: team.wwcd || 0,
      };
    });
    ranked = rows
      .sort((a, b) => compareOfficialStandings(toOfficialInput(a), toOfficialInput(b)))
      .map((t, i) => ({ ...t, rank: i + 1, rankChange: null }));
  }

  return ranked.map((t, i) => {
    const next = ranked[i + 1];
    return {
      ...t,
      matchesPlayed: playedByTeam.get(t.teamId) || 0,
      leadOverNext: next ? t.totalScore - next.totalScore : 0,
      placePoints: t.totalPlacePoints,
      total: t.totalScore,
      booyah: t.wwcd,
    };
  });
}

export type MatchStandingRow<T> = T & {
  totalKills: number;
  /** kills + placePoints for THIS match */
  total: number;
  /** 1 if this team won the match (isWinningPlacement), else 0 */
  wwcd: number;
  totalDamage: number;
  totalAssists: number;
  totalKnockouts: number;
  knockouts: number; // alias of totalKnockouts (teamh2h JSX)
  totalHeadshots: number;
  totalHeal: number;
  totalHeals: number; // alias of totalHeal
};

type MatchTeamLike = { players?: any[]; placePoints?: number; [k: string]: any };

const sumBy = (players: any[], field: string) =>
  players.reduce((s, p) => s + (Number(p[field]) || 0), 0);

/**
 * Single-match team standings — one row per team with this match's derived
 * totals (kills / total / damage / assists / knockouts / headshots / heals)
 * and wwcd, sorted by the official tie-break (Total Score primary).
 * Replaces the near-identical `.map(t => ({...t, totalKills, ...}))
 * .filter(isWinningPlacement).sort(compareOfficialStandings(...))` block in
 * every theme's off-screen/MatchData.tsx / RosterShowCase.tsx /
 * WwcdStats.tsx / WwcdSummary.tsx / teamh2h.tsx (most of which omitted
 * totalScore and so ranked WWCD-first).
 */
export function computeMatchStandings<T extends MatchTeamLike>(
  matchData: { teams?: T[] } | null | undefined
): MatchStandingRow<T>[] {
  if (!matchData?.teams) return [];
  return matchData.teams
    .map((team) => {
      const players = team.players || [];
      const totalKills = sumBy(players, 'killNum');
      const placePoints = Number(team.placePoints) || 0;
      const total = totalKills + placePoints;
      const wwcd = isWinningPlacement(team.placePoints, team.players?.[0]?.rank) ? 1 : 0;
      const totalKnockouts = sumBy(players, 'knockouts');
      const totalHeal = sumBy(players, 'heal');
      return {
        ...team,
        totalKills,
        total,
        wwcd,
        totalDamage: sumBy(players, 'damage'),
        totalAssists: sumBy(players, 'assists'),
        totalKnockouts,
        knockouts: totalKnockouts,
        totalHeadshots: sumBy(players, 'headShotNum'),
        totalHeal,
        totalHeals: totalHeal,
      };
    })
    .sort((a, b) =>
      compareOfficialStandings(
        {
          totalScore: a.total,
          wwcd: a.wwcd,
          totalPlacePoints: Number(a.placePoints) || 0,
          totalKills: a.totalKills,
          lastMatchPlacePoints: Number(a.placePoints) || 0,
        },
        {
          totalScore: b.total,
          wwcd: b.wwcd,
          totalPlacePoints: Number(b.placePoints) || 0,
          totalKills: b.totalKills,
          lastMatchPlacePoints: Number(b.placePoints) || 0,
        }
      )
    );
}

export interface StandingTeamWithPlayers extends OverallStandingRow {
  players: any[];
}

/**
 * The ranked team at `index` (0 = champion, 1 = 1st runner-up, 2 = 2nd
 * runner-up) with its roster re-attached from the overallData snapshot —
 * for the Champions / RunnerUp podium views. Ranking comes from
 * buildOverallStandings (Total Score primary), replacing the per-theme
 * compareOfficialStandings calls that omitted totalScore and ranked
 * WWCD-first.
 */
export function pickStandingTeam<T extends DisplayTeamLike>(
  matchDatas: Array<DisplayMatchLike<T>> | null | undefined,
  overallData: { teams?: Array<OverallSnapshotTeamLike & { players?: any[] }> } | null | undefined,
  index: number
): StandingTeamWithPlayers | null {
  const rows = buildOverallStandings(matchDatas, overallData);
  const row = rows[index];
  if (!row) return null;
  const src = overallData?.teams?.find((t) => t.teamId === row.teamId);
  return { ...row, players: src?.players ?? [] };
}