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

  // Aggregated stats
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
}

interface OverallData {
  tournamentId: string;
  roundId: string;
  userId: string;
  teams: Team[];
  createdAt: string;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface OverallFragsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matches?: Match[];
  matchDatas?: MatchData[];
}

const parseNum = (value: any) => {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

const OverallFrags: React.FC<OverallFragsProps> = ({
  tournament,
  round,
  overallData: rawOverallData,
  matchDatas = [],
}) => {
  const [page, setPage] = useState(1);

  // Derive matchesPlayed per team from matchDatas, same as the old fetch
  // effect did, but from the prop PublicThemeRenderer now supplies.
  const overallData = useMemo(() => {
    if (!rawOverallData) return null;

    const teamMatchesCount = new Map<string, number>();
    matchDatas.forEach(matchData => {
      matchData?.teams.forEach(team => {
        const count = teamMatchesCount.get(team.teamId) || 0;
        teamMatchesCount.set(team.teamId, count + 1);
      });
    });

    const updatedTeams = rawOverallData.teams.map(team => ({
      ...team,
      matchesPlayed: teamMatchesCount.get(team.teamId) || 0,
    }));

    return { ...rawOverallData, teams: updatedTeams };
  }, [rawOverallData, matchDatas]);

  // Get all players sorted by kills
  const topPlayers = useMemo(() => {
    if (!overallData || matchDatas.length === 0) return [];

    const playerMap = new Map<string, any>();

    matchDatas.forEach(matchData => {
      matchData.teams.forEach(team => {
        team.players.forEach(player => {
          const key = player.uId || player._id;
          if (!playerMap.has(key)) {
            playerMap.set(key, {
              ...player,
              totalKills: Number(player.killNum || 0),
              totalDamage: Number((player as any).damage ?? 0) || 0,
              totalAssists: Number((player as any).assists ?? 0) || 0,
              totalSurvival: player.survivalTime || 0,
              appearances: 1,
              teamTag: team.teamTag,
              teamLogo: team.teamLogo,
              teamName: team.teamName,
              teamPoints: team.placePoints,
              teamTotalKills: 0
            });
          } else {
            const existing = playerMap.get(key);
            existing.totalKills += Number(player.killNum || 0);
            existing.totalDamage += Number((player as any).damage ?? 0) || 0;
            existing.totalAssists += Number((player as any).assists ?? 0) || 0;
            existing.totalSurvival += player.survivalTime || 0;
            existing.appearances += 1;
            if (player.playerName) existing.playerName = player.playerName;
            if (player.picUrl) existing.picUrl = player.picUrl;
            if (team.placePoints > existing.teamPoints) {
              existing.teamTag = team.teamTag;
              existing.teamLogo = team.teamLogo;
              existing.teamName = team.teamName;
              existing.teamPoints = team.placePoints;
            }
          }
        });
      });
    });

    let totalKillsAll = 0;
    let totalDamageAll = 0;
    let totalAssistsAll = 0;
    let totalSurvivalAll = 0;
    let totalAppearances = 0;
    playerMap.forEach(player => {
      totalKillsAll += player.totalKills;
      totalDamageAll += player.totalDamage;
      totalAssistsAll += player.totalAssists;
      totalSurvivalAll += player.totalSurvival;
      totalAppearances += player.appearances;
    });

    const avgKills = totalAppearances > 0 ? totalKillsAll / totalAppearances : 0;
    const avgDamage = totalAppearances > 0 ? totalDamageAll / totalAppearances : 0;
    const avgAssists = totalAppearances > 0 ? totalAssistsAll / totalAppearances : 0;
    const avgSurvival = totalAppearances > 0 ? totalSurvivalAll / totalAppearances : 0;

    const allPlayers = Array.from(playerMap.values()).map(player => {
      const playerAvgKills = player.appearances > 0 ? player.totalKills / player.appearances : 0;
      const playerAvgDamage = player.appearances > 0 ? player.totalDamage / player.appearances : 0;
      const playerAvgAssists = player.appearances > 0 ? player.totalAssists / player.appearances : 0;
      const playerAvgSurvival = player.appearances > 0 ? player.totalSurvival / player.appearances : 0;
      const score = avgKills > 0 && avgDamage > 0 && avgSurvival > 0 ?
        (playerAvgKills / avgKills * 0.45) + (playerAvgDamage / avgDamage * 0.3) + (playerAvgSurvival / avgSurvival * 0.25) : 0;

      const playerTeam = overallData.teams.find(t => t.teamTag === player.teamTag);
      const teamTotalKills = playerTeam ? playerTeam.players.reduce((sum, p) => sum + (p.killNum || 0), 0) : 0;

      return {
        ...player,
        killNum: player.totalKills,
        numericDamage: playerAvgDamage,
        assists: playerAvgAssists,
        matchesPlayed: player.appearances,
        score,
        teamTotalKills
      };
    });

    const sorted = allPlayers.sort((a, b) => {
      // 1. Sort by kills
      if (b.killNum !== a.killNum) return b.killNum - a.killNum;

      // 2. Then by comprehensive score
      if (b.score !== a.score) return b.score - a.score;

      // 3. Then by average damage
      if (b.numericDamage !== a.numericDamage) return b.numericDamage - a.numericDamage;

      // 4. Then by average assists
      return b.assists - a.assists;
    });

    return sorted;
  }, [overallData, matchDatas]);

  const pageSize = 8; // Show 8 rows per page
  const totalPages = Math.ceil(topPlayers.length / pageSize);

  useEffect(() => {
    const interval = setInterval(() => {
      setPage((prev) => (prev % totalPages) + 1); // cycle pages 1 → totalPages → 1
    }, 15000); // change every 15 seconds

    return () => clearInterval(interval);
  }, [topPlayers]);

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const visibleData = topPlayers.slice(startIndex, endIndex);

  if (!overallData) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No overall data available</div>
      </div>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px]">
      <div className="w-full h-[30%]">
        <div className="px-6 py-2 font-bebas-neue text-[160px] leading-[1] absolute top-[50px] left-[190px] font-[700] bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text drop-shadow-[0px_7px_10px_rgba(0,0,0,0.3)] scale-y-[1.4]">
          TOP FRAGGERS
        </div>

        <div
          style={{
            backgroundImage: `linear-gradient(to left, transparent, ${tournament.primaryColor || '#ffa300'})`,
            clipPath: "polygon(30px 0%, 100% 0%, 100% 100%, 30px 100%, 0% 50%)",
          }}
          className="w-[1000px] h-[60px] absolute left-[240px] top-[240px] text-white font-bebas-neue font-[100] text-[3rem] tracking-wide"
        >
          <div className="relative top-[-5px] left-[50px]">
            {tournament.tournamentName} - {round?.roundName || ''} - DAY {round?.day || ''} - TOP FRAGGERS
          </div>
        </div>
      </div>

      <div className="pt-[30px]">
        <div 
          className="w-[1400px] h-[37px] bg-white absolute left-[220px] top-[333px] flex text-[24px] font-bebas-neue"
        >
          <div className="ml-[25px]">#</div>
          <div className="ml-[120px]">PLAYER NAME</div>
          <div className="ml-[660px]">KILLS</div>
          <div className="ml-[100px]">AVG DMG</div>
          <div className="ml-[90px]">AVG AST</div>
          <div className="ml-[110px]">SCORE</div>
        </div>
        {visibleData.map((player, index) => (
          <motion.div
            key={`${page}-${index}`}
            className="mb-0 w-[1900px] h-[80px] relative left-[220px] top-[25px] flex items-center font-russo"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              ease: "easeOut",
              delay: index * 0.2,
            }}
          >
            <div className="bg-[#000000c4] w-[1400px] h-[70px] flex items-center px-4 text-white">
              <div className="w-[60px] text-[2rem] font-bold ml-[20px]">{index + 1 + (page - 1) * pageSize}</div>
              <img 
                src={player.picUrl || 'https://res.cloudinary.com/dqckienxj/image/upload/v1735718663/defult_chach_apsjhc_jydubc.png'} 
                alt="player" 
                className="h-[50px] w-[60px] object-contain rounded-full" 
              />
              <div
                style={{
                  backgroundImage: `linear-gradient(to bottom right, ${tournament.primaryColor || '#ffa300'}, ${tournament.secondaryColor || '#f9df67'})`
                }}
                className="w-[600px] text-[2rem] font-semibold ml-[20px] h-[100%]"
              >
                <div className="mt-[12px] ml-[20px] tracking-widest">{player.playerName}</div>
              </div>
              <div className="absolute left-[850px] flex text-[2rem] font-bold">
                <div className="w-[140px] text-center">{player.killNum}</div> {/* Kills */}
                <div className="w-[140px] text-center">{player.numericDamage.toFixed(0)}</div> {/* Avg Damage */}
                <div className="w-[140px] text-center">{player.assists.toFixed(0)}</div> {/* Avg Assists */}
                <div className="w-[140px] text-center">{player.score.toFixed(2)}</div> {/* Score */}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default OverallFrags;
