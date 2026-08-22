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