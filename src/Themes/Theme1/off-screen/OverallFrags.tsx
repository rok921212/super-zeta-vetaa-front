import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
// NOTE: api import and the fetch-on-mount effect removed (which fetched
// matches, then per-match matchdata, then overall). PublicThemeRenderer
// already supplies overallData, matches, and matchDatas as props — the
// matchesPlayed-per-team aggregation that used to run after the fetches
// now runs in the topPlayers useMemo below, off the matchDatas prop.

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
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matches?: Match[];
  matchDatas?: MatchData[];
}

const OverallFrags: React.FC<OverallFragsProps> = ({ tournament, round, overallData: rawOverallData, matches, matchDatas: rawMatchDatas }) => {
  const matchDatas = useMemo(() => rawMatchDatas || [], [rawMatchDatas]);

  // Fold in matchesPlayed-per-team, same aggregation the old fetch effect
  // did after pulling every match's matchdata — now derived from the
  // matchDatas prop instead of a chain of REST calls.
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

  // Typed text helper using Framer Motion
  const renderTyped = (text: string, className?: string, delayBase: number = 0) => {
    const letters = Array.from(text || '');
    return (
      <motion.span
        className={className}
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.03, delayChildren: delayBase } }
        }}
      >
        {letters.map((char, i) => (
          <motion.span
            key={i}
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
            className="inline-block"
          >
            {char}
          </motion.span>
        ))}
      </motion.span>
    );
  };

  // Variants for staggered card reveal
  const cardVariants = {
    hidden: { opacity: 0, y: 120 },
    show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as any } }
  };

  // Get top 5 players by comprehensive score
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


    return sorted.slice(0, 5);
  }, [overallData, matchDatas]);

  if (!overallData) {
    return (
      <div className="w-[1920px] h-[1080px]  flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No overall data available</div>
      </div>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden">
      {/* Background Pattern */}
      <motion.div
        className="absolute inset-0 opacity-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />

      {/* Header */}
      <motion.div className="relative z-10 text-center left-[600px] top-[100px] text-[5rem] font-bebas font-[300]"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="flex items-center justify-between mb-[60px]">
          <div className="flex items-center space-x-4 ">

            <div>
              <h1 className="text-white font-bold whitespace-pre text-[8rem] ">
                OVERALL TOP FRAGGERS
              </h1>
              {round && (
                <motion.p
                  className="text-white text-[2rem] font-[Righteous] whitespace-pre p-[10px]"
                  initial={{ backgroundColor: 'rgba(255,0,0,0.2)' }}
                  animate={{ backgroundColor: ['rgba(255,0,0,0.25)','rgba(255,0,0,0.45)','rgba(255,0,0,0.25)'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    background: `linear-gradient(45deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                  }}
                >
                  {renderTyped(
                    `${round.roundName} - DAY${(round as any).day ? ` ${round.day}` : ''} - ${tournament.tournamentName}`,
                    undefined,
                    0.35
                  )}
                </motion.p>
              )}

            </div>
          </div>


        </div>


      </motion.div>

      {/* Content Area */}
      <div className="relative z-10 ">
        <div className="">
          <motion.div className="grid grid-cols-5 gap-[0px]"

            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.18, delayChildren: 0.50 } }
            }}
          >
            {topPlayers.map((player, index) => {
              // For overall, assume all players are "alive" or use aggregated health
              const healthPercentage = 100; // Since it's overall, no live health

              const contribution = player.teamTotalKills > 0
                ? Math.min(100, Math.round((player.killNum / player.teamTotalKills) * 100))
                : 0;

              return (
                <motion.div
                  style={{
                    background: `linear-gradient(45deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                  }}
                  key={player._id}
                  className="flex flex-col bg-gray-900 w-[300px] h-[500px] relative top-[150px] left-[40px]"

                  variants={cardVariants}
                >
                  {/* Rank */}
                  <div className="text-yellow-400 text-2xl font-bold font-[Righteous] ml-[20px] ">#{index + 1}</div>
                  <div className='w-[249px] h-[1px] bg-white relative left-[50px] top-[-15px]'></div>
                  <div className='w-[60px] absolute left-[235px] top-[30px]'><img src={player.teamLogo} alt="" className='absolute' /></div>
                  <div className='w-[250px] absolute left-[20px] opacity-40'><img src={player.teamLogo} alt="" className='absolute' /></div>
                  {/* Player Avatar */}
                  <div className="w-[300px] h-[300px] ml-[0px] absolute z-0">
                    <img
                      src={player.picUrl || '/def_char.png'}
                      alt={player.playerName}
                      className="w-full h-full "
                    />
                  </div>

                  {/* Player Info */}
                  <div className="text-center z-10 relative top-[220px]">
                    <div className="text-black pt-[0px] text-[1.8rem] font-bold font-[Righteous] bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] w-[300px] h-[50px]">{player.playerName}</div>
                    <div className="text-gray-300 text-[15px] font-[Righteous] absolute w-[100%] h-[55%] border-b-2 bg-[#00000099]">esports athlete for {player.teamTag}</div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 text-[2rem] w-full text-center absolute top-[330px] font-bebas font-[500] bg-[#00000099]">
                    <div>
                      <div className="text-yellow-400 text-[3rem] ">{player.killNum}</div>
                      <div className="text-white mt-[-20px]">KILLS</div>
                    </div>
                    <div>
                      <div className="text-yellow-400 text-[3rem] ">{player.numericDamage.toFixed(0)}</div>
                      <div className="text-white mt-[-20px]">AVG DMG</div>
                    </div>
                    <div>
                      <div className="text-yellow-400 text-[3rem] ">{player.assists.toFixed(0)}</div>
                      <div className="text-white mt-[-20px]">AVG AST</div>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="w-full absolute top-[450px]">
                    <div className="flex text-xs text-white font-[Righteous] mb-1 items-center justify-center">
                      <span className='text-[1rem] '>comprehensive score</span>
                      <span className=' text-center text-[1rem] ml-[10px]'>{player.score.toFixed(2)}</span>
                    </div>
                    <div className="w-[90%] bg-gray-700 rounded-full h-2 relative left-[10px] ">
                      <div className="h-2 rounded-full bg-yellow-400 transition-all duration-500" style={{ width: `${Math.min(100, player.score * 10)}%` }} />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default OverallFrags;