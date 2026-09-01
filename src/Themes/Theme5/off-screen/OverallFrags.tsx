import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';

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
  const matchDatas = useMemo(() => propMatchDatas || [], [propMatchDatas]);

  // Overall Fragger Score: pool every player-appearance across the round's
  // matchDatas (event-wide — matchDatas was previously accepted as a prop
  // but never actually consumed here, so this component was ranking off
  // overallData.teams alone) instead of the old bespoke kills/damage/
  // survival formula. KNOCKOUTS is displayed as an average, matching this
  // component's original display semantic.
  const topPlayers = useMemo(() => {
    if (!overallData || matchDatas.length === 0) return [];

    const scored = computeFraggerScores(buildFraggerPool(matchDatas)).sort(compareFraggerScore);

    const allPlayers = scored.map(player => {
      const playerTeam = overallData.teams.find(t => t.teamTag === player.teamTag);
      const teamTotalKills = playerTeam ? playerTeam.players.reduce((sum, p) => sum + (p.killNum || 0), 0) : 0;

      return {
        ...player,
        killNum: player.totalKills,
        numericDamage: player.avgDamage,
        assists: player.avgAssists,
        knockouts: player.avgKnockouts,
        matchesPlayed: player.appearances,
        teamTotalKills
      };
    });

    return allPlayers.slice(0, 5);
  }, [overallData, matchDatas]);

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
