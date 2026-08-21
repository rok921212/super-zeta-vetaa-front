import React, { useMemo } from 'react';
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

const OverallFrags: React.FC<OverallFragsProps> = ({ tournament, round, match, matchData, overallData: propOverallData, matches: propMatches, matchDatas: propMatchDatas }) => {
  const overallData = propOverallData;

  // Get top 5 players by comprehensive score
  const topPlayers = useMemo(() => {
    if (!overallData) return [];

    const playerMap = new Map<string, any>();

    overallData.teams.forEach(team => {
      team.players.forEach(player => {
        const key = player.uId || player._id;
        if (!playerMap.has(key)) {
          playerMap.set(key, {
            ...player,
            totalKills: Number(player.killNum || 0),
            totalDamage: Number((player as any).damage ?? 0) || 0,
            totalAssists: Number((player as any).assists ?? 0) || 0,
            totalKnockouts: Number((player as any).knockouts ?? 0) || 0,
            totalSurvival: player.survivalTime || 0,
            appearances: 1,
            teamTag: team.teamTag,
            teamName: team.teamName,
            teamLogo: team.teamLogo,
            teamPoints: team.placePoints,
            teamTotalKills: 0
          });
        } else {
          const existing = playerMap.get(key);
          existing.totalKills += Number(player.killNum || 0);
          existing.totalDamage += Number((player as any).damage ?? 0) || 0;
          existing.totalAssists += Number((player as any).assists ?? 0) || 0;
          existing.totalKnockouts += Number((player as any).knockouts ?? 0) || 0;
          existing.totalSurvival += player.survivalTime || 0;
          existing.appearances += 1;
          if (player.playerName) existing.playerName = player.playerName;
          if (player.picUrl) existing.picUrl = player.picUrl;
          if (team.placePoints > existing.teamPoints) {
            existing.teamName = team.teamName;
            existing.teamTag = team.teamTag;
            existing.teamLogo = team.teamLogo;
            existing.teamPoints = team.placePoints;
          }
        }
      });
    });

    let totalKillsAll = 0;
    let totalDamageAll = 0;
    let totalAssistsAll = 0;
    let totalKnockoutsAll = 0;
    let totalSurvivalAll = 0;
    let totalAppearances = 0;
    playerMap.forEach(player => {
      totalKillsAll += player.totalKills;
      totalDamageAll += player.totalDamage;
      totalAssistsAll += player.totalAssists;
      totalKnockoutsAll += player.totalKnockouts;
      totalSurvivalAll += player.totalSurvival;
      totalAppearances += player.appearances;
    });

    const avgKills = totalAppearances > 0 ? totalKillsAll / totalAppearances : 0;
    const avgDamage = totalAppearances > 0 ? totalDamageAll / totalAppearances : 0;
    const avgAssists = totalAppearances > 0 ? totalAssistsAll / totalAppearances : 0;
    const avgKnockouts = totalAppearances > 0 ? totalKnockoutsAll / totalAppearances : 0;
    const avgSurvival = totalAppearances > 0 ? totalSurvivalAll / totalAppearances : 0;

    const allPlayers = Array.from(playerMap.values()).map(player => {
      const playerAvgKills = player.appearances > 0 ? player.totalKills / player.appearances : 0;
      const playerAvgDamage = player.appearances > 0 ? player.totalDamage / player.appearances : 0;
      const playerAvgAssists = player.appearances > 0 ? player.totalAssists / player.appearances : 0;
      const playerAvgKnockouts = player.appearances > 0 ? player.totalKnockouts / player.appearances : 0;
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
        knockouts: playerAvgKnockouts,
        matchesPlayed: player.appearances,
        score,
        teamTotalKills,
        avgSurvivalSeconds: playerAvgSurvival
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

    return sorted.slice(0, 5);
  }, [overallData]);

  if (!overallData) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No overall data available</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
    >
      <div className="w-[1920px] h-[1080px] flex font-bebas-neue font-[500]">
        <div
          className="px-6 py-2 font-[Awaking] text-[120px] leading-[1] absolute top-[30px] left-[270px] font-[700] bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text drop-shadow-[0px_7px_10px_rgba(0,0,0,0.3)] scale-y-[1.4]"
        >
          OVERALL FRAGGERS
        </div>

        {/* Tournament Header */}
        <div
          style={{
            backgroundImage: `linear-gradient(to left, transparent, ${tournament.primaryColor})`,
            clipPath: "polygon(30px 0%, 100% 0%, 100% 100%, 30px 100%, 0% 50%)",
          }}
          className="w-[1000px] h-[60px] absolute left-[260px] top-[180px] text-white font-bebas-neue font-[700] text-[3rem] tracking-wide"
        >
          <div className="relative top-[-5px] left-[50px] font-[supermolot]">
            {tournament.tournamentName} | {round?.roundName}
          </div>
        </div>

        <div className="flex flex-wrap justify-center space-x-4">
          {topPlayers.map((player, index) => (
            <motion.div
              className="flex mb-[20px] relative left-[35px] top-[300px] font-[AGENCYB]"
              key={player.uId || index}
              initial={{ opacity: 0, y: 550 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                ease: "easeOut",
                delay: index * 0.2,
              }}
            >
              <div
                className="bg-[#000000bb] border-solid border-red-800 w-[340px] h-[416px] mr-[20px] border-[0px] scale-95 relative"
                style={{
                  borderColor: tournament?.primaryColor,
                }}
              >
                {/* Player Photo - clipped container */}
                <div className="w-[340px] h-[340px] absolute top-[-50px] left-0 overflow-hidden z-20">
                  <img
                    src={player.picUrl || "/def_char.avif"}
                    alt={player.playerName || "player image"}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Rank number */}
                <div className="text-white text-[60px] ml-[10px] relative z-10">
                  #{index + 1}
                </div>

                {/* Team logo - top right */}
                {player.teamLogo && (
                  <div className="w-[100px] h-[65px] absolute right-[0px] top-[0px] z-10">
                    <img
                      src={player.teamLogo || "/def_logo.avif"}
                      alt="team logo"
                      className="bg-cover"
                    />
                  </div>
                )}

                {/* Team logo - blurred background */}
                {player.teamLogo && (
                  <div className="h-[65px] absolute left-[10px] top-[80px] z-0">
                    <img
                      src={player.teamLogo || "/def_logo.avif"}
                      alt="team logo"
                      className="bg-cover transform blur-sm"
                    />
                  </div>
                )}

                {/* Player name */}
                <div className="w-[100%] bg-white h-[80px] relative top-[200px] z-10">
                  <div
                    className="text-[50px] text-center"
                    style={{
                      color: tournament?.primaryColor,
                    }}
                  >
                    {player.playerName}
                  </div>
                </div>

                {/* Data box */}
                <div
                  className="bg-red-800 w-[100%] h-[316px] text-white text-[60px] relative top-[200px] z-10"
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, ${tournament?.primaryColor}, ${tournament?.secondaryColor}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
                  }}
                >
                  <div className="ml-[9px] relative top-[10px] flex">
                    DAMAGE
                    <div className="absolute left-[250px] z-10 text-[44px] mt-[10px]">{player.numericDamage?.toFixed(0) || "N/A"}</div>
                    <div className="bg-black w-[90px] h-[60px] absolute left-[237px] top-[13px] border-solid border-white border-l-[1px] border-t-[1px] border-b-[1px]">

                    </div>
                  </div>

                  <div className="w-[65%] h-[1px] bg-white relative left-[10px] top-[-9px]"></div>

                  <div className="ml-[9px] relative top-[-10px] flex">
                    <div>KILLS</div>
                    <div className="bg-black w-[90px] h-[60px] absolute left-[237px] top-[13px] border-solid border-white border-l-[1px] border-t-[1px] border-b-[1px]">
                      <div className="text-center top-[0px] relative text-[44px]">{player.killNum || "0"}</div>
                    </div>
                  </div>

                  <div className="w-[65%] h-[1px] bg-white relative left-[10px] top-[-28px]"></div>

                  <div className="ml-[6px] relative top-[-30px] flex">
                    <div className="text-[50px] relative top-[8px]">KNOCKOUTS</div>
                    <div className="bg-black w-[90px] h-[60px] absolute left-[240px] top-[13px] border-solid border-white border-l-[1px] border-t-[1px] border-b-[1px]">
                      <div className="text-center top-[2px] relative text-[36px] left-[0px]">{player.knockouts || "0"}</div>
                    </div>
                  </div>

                  <div className="w-[65%] h-[1px] bg-white relative left-[10px] top-[-28px]"></div>

                  <div className="ml-[6px] relative top-[-30px] flex">
                    <div className="text-[50px] relative top-[2px]">ASSISTS</div>
                    <div className="bg-black w-[90px] h-[60px] absolute left-[240px] top-[13px] border-solid border-white border-l-[1px] border-t-[1px] border-b-[1px]">
                      <div className="text-center top-[2px] relative text-[36px] left-[0px]">{player.assists.toFixed(0) || "0"}</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default OverallFrags;
