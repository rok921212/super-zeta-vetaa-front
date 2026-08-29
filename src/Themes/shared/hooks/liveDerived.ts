import { SortedTeam } from './unsortteams';

// Small shared display-derivations that had a copy in every theme.

// The "WWCD chance %" gauge on every on-screen/Upper.tsx.
//  - API enabled  → sum of the four players' live health / 4 (0..100)
//  - API disabled → alive count * 25 (0, 25, 50, 75, 100)
// aliveCount comes from useSortedTeams (SortedTeam), so it already uses the
// shared isPlayerDead predicate — not a theme-local `!bHasDied` count.
// Number(p.health) tolerates a string health field (Theme5 used parseInt).
export function wwcdChance(
  team: Pick<SortedTeam, 'players' | 'aliveCount'>,
  apiEnable: boolean
): number {
  if (apiEnable) {
    const sum = team.players.reduce((s, p) => s + (Number((p as any).health) || 0), 0);
    return Math.round(sum / 4);
  }
  return Math.round(team.aliveCount * 25);
}
