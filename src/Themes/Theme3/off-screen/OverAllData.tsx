import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';

interface Tournament {
  _id: string;
  tournamentName: string;
  torLogo?: string;
  day?: string;
  primaryColor?: string;
  secondaryColor?: string;
  overlayBg?: string;
}

interface Round {
  _id: string;
  roundName: string;
  apiEnable?: boolean;
  day?: string;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
}

interface Player {
  _id: string;
  uId: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;
  damage?: string;
  survivalTime?: number;
  assists?: number;
  health: number;
  healthMax: number;
  liveState: number;
}

interface Team {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  slot: number;
  placePoints: number;
  wwcd?: number;
  players: Player[];
  matchesPlayed?: number;
  totalKills?: number;
  totalScore?: number;
  rank?: number;
  rankChange?: number | null;
  totalPlacePoints?: number;
}

interface OverallData {
  tournamentId: string;
  roundId: string;
  userId: string;
  teams: Team[];
  createdAt: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface OverAllDataProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matches?: Match[];
  matchDatas?: MatchData[];
}

interface AggregatedTeam {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  totalKills: number;
  totalPlacePoints: number;
  totalScore: number;
  wwcd: number;
}

// Sort priority: TOTAL SCORE -> WWCD -> PLACE POINTS -> KILLS
const sortByStandings = (a: AggregatedTeam, b: AggregatedTeam) => {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
  if (b.wwcd !== a.wwcd) return b.wwcd - a.wwcd;
  if (b.totalPlacePoints !== a.totalPlacePoints) return b.totalPlacePoints - a.totalPlacePoints;
  return b.totalKills - a.totalKills;
};

/**
 * A match counts as "played" if at least one team has a recorded result.
 * Matches that exist as placeholders (scheduled but not yet started) come
 * back with every team at 0 kills / 0 placement — those must be skipped
 * when picking the match to diff against, or "previous" collapses to be
 * identical to "current" (subtracting a zero delta changes nothing).
 */
const isMatchPlayed = (match: MatchData) =>
  match.teams.some((team) => {
    const kills = team.players.reduce((s, p) => s + (p.killNum || 0), 0);
    return kills > 0 || (team.placePoints || 0) > 0;
  });

/**
 * Single-pass ranking builder.
 *
 * Instead of re-aggregating the whole match history twice (once for the
 * "current" standings, once again for "standings before the last match"),
 * this walks every match exactly once. While summing each team's running
 * totals, it also records the *last played* match's per-team contribution
 * (skipping any trailing scheduled-but-not-started matches). The
 * "previous" standing is then derived by subtracting that one delta from
 * the final totals — no second full aggregation needed.
 */
const buildStandings = (matches: MatchData[]) => {
  const totals = new Map<string, AggregatedTeam>();
  const lastMatchDelta = new Map<string, { kills: number; place: number; wwcd: number }>();

  // Find the last match that actually has a result — not just the last
  // element in the array, which may be an unplayed/scheduled match.
  let lastPlayedIndex = -1;
  let playedCount = 0;
  for (let idx = 0; idx < matches.length; idx++) {
    if (isMatchPlayed(matches[idx])) {
      lastPlayedIndex = idx;
      playedCount++;
    }
  }

  for (let idx = 0; idx < matches.length; idx++) {
    const match = matches[idx];
    for (const team of match.teams) {
      const kills = team.players.reduce((s, p) => s + (p.killNum || 0), 0);
      const place = team.placePoints || 0;
      const isWWCD = team.placePoints === 10 ? 1 : 0;

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
  }

  const current = Array.from(totals.values()).sort(sortByStandings);

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
          .sort(sortByStandings)
      : [];

  return { current, previous, playedCount };
};

const OverAllData: React.FC<OverAllDataProps> = ({
  tournament,
  round,
  overallData,
  matchDatas = []
}) => {
  const [page, setPage] = useState(1);

  // Calculate team rankings with rank change (memoized — only recomputes
  // when the underlying match/overall data actually changes).
  const teamRankings = useMemo(() => {
    if (matchDatas.length === 0 && !overallData) return [];

    if (matchDatas.length > 0) {
      const { current, previous, playedCount } = buildStandings(matchDatas);

      const prevRankMap = new Map<string, number>();
      previous.forEach((team, index) => prevRankMap.set(team.teamId, index + 1));

      const hasPreviousData = playedCount > 1;

      return current.map((team, index) => {
        const currentRank = index + 1;
        const previousRank = prevRankMap.get(team.teamId);
        // rankChange is null (unknown) when there's no prior *played* match
        // to compare against — never silently reported as "0 change".
        const rankChange = hasPreviousData && previousRank !== undefined
          ? previousRank - currentRank
          : null;

        return { ...team, rank: currentRank, rankChange };
      });
    }

    // Fallback: only a single overall snapshot, no match-by-match history —
    // there is genuinely nothing to diff against, so rankChange is null
    // rather than a misleading 0.
    if (overallData?.teams) {
      const teams: (AggregatedTeam & { rankChange: number | null })[] = overallData.teams.map((team) => {
        const totalKills = team.players?.reduce((sum, p) => sum + (p.killNum || 0), 0) || 0;
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
          rankChange: null,
        };
      });

      return teams.sort(sortByStandings);
    }

    return [];
  }, [overallData, matchDatas]);

  const pageSize = 8; // Show 8 rows per page
  const totalPages = Math.ceil(teamRankings.length / pageSize);

  useEffect(() => {
    if (totalPages > 0) {
      const interval = setInterval(() => {
        setPage((prev) => (prev % totalPages) + 1); // cycle pages 1 → totalPages → 1
      }, 25000); // change every 15 seconds

      return () => clearInterval(interval);
    }
  }, [teamRankings]);

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const visibleData = teamRankings.slice(startIndex, endIndex);

  if (!overallData && matchDatas.length === 0) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No overall data available</div>
      </div>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px]">
      <div className="w-full h-[30%]">
        <div className="px-6 py-2 font-[Awaking] text-[160px] leading-[1] absolute top-[40px] left-[230px] font-[700] bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text drop-shadow-[0px_7px_10px_rgba(0,0,0,0.3)]  tracking-wider">
          OVERALL STANDINGS
        </div>

        <div
          style={{
            backgroundImage: `linear-gradient(to left, transparent, ${tournament.primaryColor || '#ffa300'})`,
            clipPath: "polygon(30px 0%, 100% 0%, 100% 100%, 30px 100%, 0% 50%)",
          }}
          className="w-[1400px] h-[50px] absolute left-[240px] top-[230px] text-white font-[supermolot] font-[700] text-[2rem] tracking-wide"
        >
          <div className="relative top-[px] left-[50px]">
            {tournament.tournamentName} - {round?.roundName || ''} 
          </div>
        </div>
      </div>

      <div className="pt-[30px] ">
        <div 
          className="w-[1400px] h-[37px] bg-white absolute left-[220px] top-[303px] flex text-[24px] font-[supermolot] font-[900]"
        >
          <div className="ml-[25px] text-[20px] font-bold">
  ▲▼
</div>
          <div className="ml-[40px]">#</div>
          <div className="ml-[130px]">TEAM</div>
          <div className="ml-[580px]">WWCD</div>
          <div className="ml-[60px]">PLACE</div>
          <div className="ml-[80px]">KILL</div>
          <div className="ml-[80px]">TOTAL</div>
        </div>
        {visibleData.map((team, index) => (
          <motion.div
            key={`${page}-${index}`}
            className="mb-0 w-[1900px] h-[80px] relative left-[220px] top-[5px] flex items-center font-russo"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              ease: "easeOut",
              delay: index * 0.2,
            }}
          >
            <div className="bg-[#000000d2] w-[1400px] h-[70px] flex items-center px-4 text-white font-[AGENCYB]">
              {/* Rank Change */}
              <div className="w-[60px] text-[1.8rem] font-bold ml-[10px]">
                {team.rankChange === null && (
                  <span className="text-gray-500">–</span>
                )}
                {team.rankChange !== null && team.rankChange > 0 && (
                  <span className="text-green-400">▲{team.rankChange}</span>
                )}
                {team.rankChange === 0 && (
                  <span className="text-gray-400">–</span>
                )}
                {team.rankChange !== null && team.rankChange < 0 && (
                  <span className="text-red-400">▼{Math.abs(team.rankChange)}</span>
                )}
              </div>
              {/* Rank */}
              <div className="w-[60px] text-[2.5rem] font-bold ml-[10px]">{index + 1 + (page - 1) * pageSize}</div>
              <img 
                src={team.teamLogo || 'https://res.cloudinary.com/dqckienxj/image/upload/v1730785916/default_ryi6uf_edmapm.png'} 
                alt="logo" 
                className="h-[50px] w-[60px] object-contain" 
              />
              <div
                style={{
                  backgroundImage: `linear-gradient(to bottom right, ${tournament.primaryColor || '#ffa300'}, ${tournament.secondaryColor || '#f9df67'})`
                }}
                className="w-[600px] text-[2.5rem] font-semibold ml-[20px] h-[100%]"
              >
                <div className="mt-[2px] ml-[20px] font-[AGENCYB]">{team.teamName || team.teamTag}</div>
              </div>
              <div className="absolute left-[850px] flex text-[2.5rem] font-bold">
                <div className="w-[140px] text-center font-[AGENCYB]">{team.wwcd || 0}</div> {/* WWCD */}
                <div className="w-[140px] text-center font-[AGENCYB]">{team.totalPlacePoints || 0}</div> {/* Placement */}
                <div className="w-[140px] text-center font-[AGENCYB]">{team.totalKills || 0}</div> {/* Kills */}
                <div 
                style={{
                  backgroundImage: `linear-gradient(to bottom right, ${tournament.primaryColor || '#ffa300'}, ${tournament.secondaryColor || '#f9df67'})`
                }}
                className="w-[120px] text-center font-[AGENCYB]">{team.totalScore || 0}</div> {/* Total */}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(OverAllData);