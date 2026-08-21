import { useMemo, useRef } from 'react';

// Exported so every theme's LiveStats/Alerts/battlebar imports THESE types
// instead of redeclaring their own local Player/Team/MatchData interfaces.
// Two interfaces with the same name but different shapes (e.g. a required
// vs optional isOutsideBlueCircle) are NOT the same type to TypeScript —
// that mismatch is what caused TS2345. Import from here, don't duplicate.
export interface Player {
  _id: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  health: number;
  healthMax: number;
  liveState: number;
  rank?: number;
  isOutsideBlueCircle?: boolean;
  isFiring?: boolean;
  picUrl?: string;
  // Player identifier carried through from the remote/proto payload — used
  // across theme views (Overall/Champions/EventMvp/PlayerSwitch/TopFragger,
  // etc.) to key/match players between updates.
  uId?: string | number;
  [key: string]: any;
}

export interface Team {
  _id: string;
  teamId?: string;
  teamTag: string;
  teamName?: string;
  placePoints: number;
  players: Player[];
  teamLogo: string;
}

// Backend-computed, locked-in result for a team the moment it's eliminated
// — see updateDeadTeamList() in Bulkpublic.controller.js. This is the
// authoritative source for "this match's final points," since team.placePoints
// on matchData keeps live-updating even after death in some payloads.
export interface DeadTeamListEntry {
  teamId: string;
  teamTag?: string;
  teamName?: string;
  teamLogo?: string;
  placePoints?: number;
  rank?: number;
  totalKills?: number;
  deadAt?: string;
}

export interface MatchData {
  _id: string;
  teams: Team[];
  deadTeamList?: DeadTeamListEntry[];
}

export interface OverallData {
  teams: Array<{
    _id?: string;
    teamId?: string;
    placePoints?: number;
    players?: Array<{ killNum?: number }>;
  }>;
}

// Shape returned by useSortedTeams — a Team plus the derived fields.
// Import this where a component needs to type a sorted-team item
// (e.g. the .map() callback over topTeam.players).
export interface SortedTeam extends Team {
  totalKills: number;
  aliveCount: number;
  isAllDead: boolean;
  hasOutsideBlueCircle: boolean;
  teamRank: number;
  totalPoints: number;
}

// One implementation of "sort teams by points/kills, derive totals" for every
// theme instead of five near-identical copies (LiveStats.tsx, battlebar.tsx,
// Alerts.tsx, Upper.tsx all had their own version of this).
//
// sortBy:
//  - 'live'    → placePoints then kills (LiveStats/battlebar in-match ranking)
//  - 'overall' → cumulative points across the event. IMPORTANT: overallData
//                itself updates LIVE — it already folds in each team's
//                current-match placePoints/kills in real time, even while
//                a team is still alive. So to make "only count after death"
//                true, we have to back the live in-match contribution back
//                OUT of overallMap's number to get the true prior-matches
//                baseline, then only add it back in once deadTeamList
//                confirms the team is eliminated (using deadTeamList's
//                locked values, not the still-ticking matchData ones).
//                See thisMatchLiveContribution / thisMatchFinalContribution
//                below. Used by LiveStats' "top team" hero panel.
//  - 'liveUntilDead' → always ranked by totalPoints (kills tiebreak).
//                totalPoints itself only folds this match's points in once
//                the team is confirmed dead (see priorBaseline below), so
//                a still-alive team ranks on its prior cumulative total and
//                doesn't jump around with in-match placePoints churn.
//                Used by every theme's main LiveStats standings list.
export function useSortedTeams(
  matchData: MatchData | null | undefined,
  overallData?: OverallData | null,
  sortBy: 'live' | 'overall' | 'liveUntilDead' = 'live'
) {
  // Freezes each team's "prior matches" baseline the first time it's read
  // for a given match, instead of recomputing it (via the live subtraction
  // below) on every tick. `matchData` and `overallData` are driven by two
  // independent socket streams (liveMatchUpdate / overallDataUpdate, see
  // PublicThemeRenderer.tsx) that are never guaranteed to be in sync — the
  // backend's overallDataUpdate recompute is fired unawaited and can lag
  // behind the matchData tick that just landed. Recomputing the subtraction
  // fresh every render means that lag shows up directly as a transient dip
  // in priorBaseline (and the sort order flickering with it) for a team
  // that's still alive and hasn't actually changed standing at all. Caching
  // it once per (matchId, teamId) makes it behave the way the comments below
  // already claim it does: stable while alive, only moving on death.
  const priorBaselineCacheRef = useRef<Map<string, { matchId: string; value: number }>>(new Map());

  const overallMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!overallData?.teams) return map;
    for (const t of overallData.teams) {
      const placePoints = t.placePoints ?? 0;
      const overallKills = Array.isArray(t.players)
        ? t.players.reduce((sum, p) => sum + (p.killNum || 0), 0)
        : 0;
      const total = placePoints + overallKills;
      if (t.teamId) map.set(t.teamId.toString(), total);
      if (t._id) map.set(t._id.toString(), total);
    }
    return map;
  }, [overallData]);

  // deadTeamList entries keyed by teamId — the one place the FINAL,
  // locked-in placePoints/totalKills for this match live. Used both for
  // isAllDead and for the points math below.
  const deadTeamMap = useMemo(() => {
    const map = new Map<string, DeadTeamListEntry>();
    (matchData?.deadTeamList ?? []).forEach(entry => {
      if (entry.teamId) map.set(entry.teamId.toString(), entry);
    });
    return map;
  }, [matchData?.deadTeamList]);

  return useMemo(() => {
    if (!matchData) return [];

    const withDerived = matchData.teams.map(team => {
      // Try both possible id fields — matchData's team subdocuments don't
      // always populate teamId the same way overallData/deadTeamList key
      // their entries, so a single-key lookup can silently miss.
      const teamIdKey = team.teamId?.toString();
      const teamDocKey = team._id?.toString();
      const lookupKey = teamIdKey ?? teamDocKey ?? '';

      // Math.max(0, ...) guards against a raw negative killNum reaching the
      // overlay (backend now clamps this at the source too, but this stays
      // as cheap display-side insurance).
      const totalKills = team.players.reduce((sum, p) => sum + Math.max(0, p.killNum || 0), 0);
      const aliveCount = team.players.filter(p => p.liveState !== 5 && !p.bHasDied).length;

      const deadEntry =
        (teamIdKey && deadTeamMap.get(teamIdKey)) ||
        (teamDocKey && deadTeamMap.get(teamDocKey));

      // NOTE (kept from the original derivation): deliberately NOT checking
      // health === 0 here. A player who hasn't received their first
      // live-stat tick yet also sits at default health 0 — that's "no data
      // yet," not "dead." liveState === 5 / bHasDied are the only signals
      // the backend sets specifically to mean death.
      const isAllDead = deadEntry
        ? true
        : team.players.length > 0 &&
          team.players.every(p => p.liveState === 5 || p.bHasDied);

      const hasOutsideBlueCircle = team.players.some(p => p.isOutsideBlueCircle === true);
      // Prefer deadTeamList's self-computed elimination-order rank (immune
      // to PCOB's raw -1 "not placed yet" sentinel — same pattern already
      // used for thisMatchFinalContribution above) and only fall back to
      // the raw player field, sanitized, for a team not yet confirmed dead.
      const rawRank = team.players[0]?.rank;
      const teamRank =
        (typeof deadEntry?.rank === 'number' && deadEntry.rank > 0)
          ? deadEntry.rank
          : (typeof rawRank === 'number' && rawRank > 0 ? rawRank : 0);

      // What overallData currently attributes to THIS match, live, using
      // the same placePoints+kills formula the backend uses when it builds
      // overallData — this is what has to be subtracted back out.
      const thisMatchLiveContribution = (team.placePoints ?? 0) + totalKills;

      // What actually counts once the team is confirmed dead — prefer
      // deadTeamList's locked snapshot; fall back to the live numbers if
      // deadTeamList hasn't been populated for this team yet.
      const thisMatchFinalContribution = deadEntry
        ? (deadEntry.placePoints ?? 0) + (deadEntry.totalKills ?? totalKills)
        : thisMatchLiveContribution;

      const liveOverallTotal = overallMap.get(lookupKey) ?? 0;
      // Clamped: overallData (from the separate `overallDataUpdate` socket
      // stream) can momentarily lag behind matchData's live in-match
      // contribution (e.g. right after a kill ticks totalKills up before the
      // next overall push catches up), which would otherwise underflow this
      // subtraction into a negative "prior standing" and flash as -1 on the
      // overlay.
      const rawPriorBaseline = Math.max(0, liveOverallTotal - thisMatchLiveContribution);

      // Freeze priorBaseline instead of trusting the raw subtraction above on
      // every tick — see priorBaselineCacheRef's comment above. Re-seed once
      // whenever this is a new match for this team (cache miss, or a stale
      // matchId left over from a previous match) — in the common case that
      // happens at/near thisMatchLiveContribution === 0 (before this team
      // has scored anything this match), where the subtraction is exact
      // regardless of any matchData/overallData lag. If the hook only ever
      // sees this team mid-match (e.g. a page load/refresh after kills
      // already happened), seed with whatever's available rather than
      // leaving it uncached — a possibly-imprecise value locked in once is
      // still strictly better than the raw subtraction jittering all match.
      //
      // Don't seed at all, though, while overallMap has no entry for this
      // team yet (overallData hasn't loaded/arrived for it this session) —
      // that reads as liveOverallTotal defaulting to 0 above, which isn't a
      // real "0 prior points" reading, just "no data yet." Seeding off that
      // would freeze the team at 0 for the rest of the match even after the
      // real overallData value shows up moments later.
      const cached = priorBaselineCacheRef.current.get(lookupKey);
      let priorBaseline: number;
      if (cached && cached.matchId === matchData._id) {
        priorBaseline = cached.value;
      } else if (overallMap.has(lookupKey)) {
        priorBaselineCacheRef.current.set(lookupKey, { matchId: matchData._id, value: rawPriorBaseline });
        priorBaseline = rawPriorBaseline;
      } else {
        priorBaseline = rawPriorBaseline;
      }

      const totalPoints = priorBaseline + (isAllDead ? thisMatchFinalContribution : 0);

      return { ...team, totalKills, aliveCount, isAllDead, hasOutsideBlueCircle, teamRank, totalPoints };
    });

    if (sortBy === 'liveUntilDead') {
      // Always ranked by totalPoints, kills tiebreak. totalPoints only
      // folds this match's points in once deadTeamList confirms the team
      // dead, so a still-alive team ranks on its prior cumulative total
      // and a team's position locks into its actual tournament standing
      // the moment it's out, instead of moving with in-match placePoints
      // churn while still fighting.
      return withDerived.sort((a, b) => {
        const diff = b.totalPoints - a.totalPoints;
        return diff !== 0 ? diff : b.totalKills - a.totalKills;
      });
    }

    if (sortBy === 'overall') {
      return withDerived.sort((a, b) => b.totalPoints - a.totalPoints);
    }

    return withDerived.sort((a, b) =>
      b.placePoints !== a.placePoints ? b.placePoints - a.placePoints : b.totalKills - a.totalKills
    );
  }, [matchData, overallMap, deadTeamMap, sortBy]);
}