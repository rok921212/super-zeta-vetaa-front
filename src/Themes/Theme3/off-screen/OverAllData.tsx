import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  computeRankedStandings,
  compareOfficialStandings,
  OfficialStandingsInput,
  RankedTeam,
} from '../../shared/hooks/officialStandings';

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
  rank?: number;
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
  matchNo?: number;
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

const OverAllData: React.FC<OverAllDataProps> = ({
  tournament,
  round,
  overallData,
  matchDatas = []
}) => {
  const [page, setPage] = useState(1);

  // Calculate team rankings with rank change (memoized — only recomputes
  // when the underlying match/overall data actually changes).
  const teamRankings: RankedTeam[] = useMemo(() => {
    if (matchDatas.length === 0 && !overallData) return [];

    if (matchDatas.length > 0) {
      return computeRankedStandings(matchDatas);
    }

    // Fallback: only a single overall snapshot, no match-by-match history —
    // there is genuinely nothing to diff against, so rankChange is null
    // rather than a misleading 0.
    if (overallData?.teams) {
      const teams = overallData.teams.map((team) => {
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
          rankChange: null as number | null,
        };
      });

      // No match-by-match history here, so there's no "most recent match"
      // to break ties with — lastMatchPlacePoints is 0 for everyone.
      const sorted = teams.sort((a, b) => compareOfficialStandings(
        { totalScore: a.totalScore, wwcd: a.wwcd, totalPlacePoints: a.totalPlacePoints, totalKills: a.totalKills, lastMatchPlacePoints: 0 },
        { totalScore: b.totalScore, wwcd: b.wwcd, totalPlacePoints: b.totalPlacePoints, totalKills: b.totalKills, lastMatchPlacePoints: 0 }
      ));

      return sorted.map((team, index) => ({ ...team, rank: index + 1 }));
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