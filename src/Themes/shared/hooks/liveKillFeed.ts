import { useMemo } from 'react';
import { Player, MatchData, isPlayerDead } from './unsortteams';

// The live "match fraggers" kill feed — every theme's on-screen/LiveFrags.tsx
// had its own identical copy of: flatMap players, attach team context +
// isTeamAllDead, sort by killNum desc, slice. This is the one version.
//
// Ordering is the canonical one: raw killNum descending. Dead-state is the
// shared isPlayerDead predicate (liveState === 5 || bHasDied), matching
// useSortedTeams — not a theme-local `bHasDied || liveState === 5` copy.

export interface FeedPlayer extends Player {
  teamTag: string;
  teamLogo: string;
  teamId?: string;
  isTeamAllDead: boolean;
}

export function useLiveKillFeed(
  matchData: MatchData | null | undefined,
  limit?: number
): FeedPlayer[] {
  return useMemo(() => {
    const teams = matchData?.teams;
    if (!teams || teams.length === 0) return [];

    const all: FeedPlayer[] = [];
    for (const team of teams) {
      const players = team.players || [];
      const isTeamAllDead = players.length > 0 && players.every(isPlayerDead);
      for (const p of players) {
        all.push({
          ...p,
          teamTag: team.teamTag,
          teamLogo: team.teamLogo,
          teamId: team.teamId ?? team._id,
          isTeamAllDead,
        });
      }
    }

    all.sort((a, b) => (b.killNum || 0) - (a.killNum || 0));
    return typeof limit === 'number' ? all.slice(0, limit) : all;
  }, [matchData, limit]);
}
