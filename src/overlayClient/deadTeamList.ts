// Client-side team-elimination detection — shared by PublicThemeRenderer and
// the external overlay client (./client.ts). The protobuf MatchDataPayload
// deliberately omits deadTeamList; every consumer recomputes its own.

// Shape of each entry in the client-side-computed elimination list — no
// longer sourced from the backend's matchData.deadTeamList field.
export interface DeadTeamListEntry {
  teamId: string;
  teamTag: string;
  teamName: string;
  teamLogo: string;
  placePoints: number;
  rank: number | null;
  totalKills: number;
  deadAt: string;
}

// Consumers (Alerts, in particular) build their elimination-alert queue by
// walking this array in order, so it must always be in actual death order —
// oldest elimination first — no matter what order the backend happened to
// return entries in, or what order a burst of socket updates lands in.
//
// Ordering rules, in priority order:
//   1. deadAt ascending — the team eliminated earlier (e.g. 3:45) sorts
//      before the team eliminated later (e.g. 3:55).
//   2. rank descending, used only when deadAt is missing on one/both sides
//      or two entries land on the exact same timestamp — a HIGHER rank
//      number is a WORSE placement, and in a battle royale a worse
//      placement always means that team went out earlier. So rank 10
//      sorts before rank 9.
export const sortDeadTeamList = (list?: DeadTeamListEntry[] | null): DeadTeamListEntry[] => {
  if (!list || list.length === 0) return [];
  return [...list].sort((a, b) => {
    const aTime = a.deadAt ? new Date(a.deadAt).getTime() : NaN;
    const bTime = b.deadAt ? new Date(b.deadAt).getTime() : NaN;
    const aValid = !Number.isNaN(aTime);
    const bValid = !Number.isNaN(bTime);

    // Both have real timestamps and they differ: earlier time wins outright.
    if (aValid && bValid && aTime !== bTime) return aTime - bTime;
    // Only one side has a usable timestamp: prefer the one that does.
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;

    // Same timestamp (or neither has one): fall back to rank, worst-first.
    return (b.rank ?? 0) - (a.rank ?? 0);
  });
};

// A team only counts as eliminated once every player actually reported live
// this tick has either liveState === 5 or bHasDied === true — matchData no
// longer pads teams with unobserved roster players, so `team.players` here
// is exactly who the API reported. `length > 0` guards a team with no live
// players yet (nothing to conclude from), and also means a short/partial
// player list (a player's data not having arrived yet this tick) is never
// mistaken for a wipe once that player's entry does arrive.
export const isTeamAllDead = (team: any): boolean => {
  if (!Array.isArray(team.players)) return false;

  return (
    team.players.length > 0 &&
    team.players.every(
      (p: any) => p.liveState === 5 || p.bHasDied === true
    )
  );
};

interface DeadTeamSnapshot {
  teamId: any;
  teamTag: string;
  teamName: string;
  teamLogo: string;
  placePoints: number;
  rank: number | null;
  totalKills: number;
  deadAt: number; // epoch ms
}

// Persists across ticks (held in a ref) so a team's elimination
// timestamp/locked stats are stamped ONCE, the first tick it's confirmed
// dead — not recomputed (and drifting) on every subsequent tick, matching
// what unsortteams.ts expects ("locked" points that stop changing after
// death). Scoped per-match: `matchId` mismatch wipes the tracker so a
// match switch (followSelected) never carries over a previous match's
// dead teams.
export interface DeathTracker {
  matchId: string | null;
  dead: Map<string, DeadTeamSnapshot>;
}

export const newDeathTracker = (): DeathTracker => ({ matchId: null, dead: new Map() });

export const computeDeadTeamList = (
  matchId: string | null | undefined,
  teams: any[] | undefined,
  trackerRef: { current: DeathTracker }
): DeadTeamListEntry[] => {
  if (trackerRef.current.matchId !== (matchId ?? null)) {
    trackerRef.current = { matchId: matchId ?? null, dead: new Map() };
  }
  const { dead } = trackerRef.current;

  if (Array.isArray(teams)) {
    for (const team of teams) {
      const teamKey = String(team.teamId ?? team._id ?? '');
      if (!teamKey || dead.has(teamKey)) continue;
      if (isTeamAllDead(team)) {
        const totalKills = (team.players || []).reduce((sum: number, p: any) => sum + (p.killNum || 0), 0);
        dead.set(teamKey, {
          teamId: team.teamId ?? team._id,
          teamTag: team.teamTag,
          teamName: team.teamName,
          teamLogo: team.teamLogo,
          placePoints: team.placePoints,
          rank: team.rank ?? null,
          totalKills,
          deadAt: Date.now(),
        });
      }
    }
  }

  return Array.from(dead.values()).map((snap) => ({
    ...snap,
    deadAt: new Date(snap.deadAt).toISOString(),
  }));
};
