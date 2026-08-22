// src/components/OverallFrags.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getCache, setCache } from '../../../dashboard/cache.tsx';
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
  health: number;
  healthMax: number;
  liveState: number;
  numericDamage?: number; // computed
  knockouts?: number;
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

interface MatchData {
  _id: string;
  teams: Team[];
}

interface OverallFragsProps {
  tournament: Tournament;
  round?: Round | null;
  overallData?: OverallData | null;
  matchDatas?: MatchData[];
}

const CACHE_KEY = 'overallDataCache';

const OverallFrags: React.FC<OverallFragsProps> = ({ tournament, round, overallData: propOverallData, matchDatas: rawMatchDatas }) => {
  const matchDatas = useMemo(() => rawMatchDatas || [], [rawMatchDatas]);
  const [overallData, setOverallData] = useState<OverallData | null>(() => {
    const cached = getCache(CACHE_KEY);
    if (cached) {
      console.log('Using cached overall data');
      return cached;
    }
    if (propOverallData) {
      console.log('Using fresh overall data');
      return propOverallData;
    }
    console.log('No overall data available yet');
    return null;
  });

  // Only update state if data actually changed
  useEffect(() => {
    if (!propOverallData) return;

    const cached = getCache(CACHE_KEY);
    const cachedStr = JSON.stringify(cached);
    const propStr = JSON.stringify(propOverallData);

    if (cachedStr !== propStr) {
      console.log('Updating cache with fresh overall data');
      setCache(CACHE_KEY, propOverallData);
    }

    if (cachedStr !== propStr || !overallData) {
      console.log('Updating state with fresh overall data');
      setOverallData(propOverallData);
    } else {
      console.log('Overall data unchanged, not updating state');
    }
    // Only depend on propOverallData and overallData to avoid infinite loop
  }, [propOverallData, overallData]);

  // Overall Fragger Score: pool every player-appearance across the round's
  // matchDatas (previously not even accepted as a prop here, so this
  // component ranked off overallData.teams' single-snapshot totals only)
  // instead of the old plain kills→damage→assists sort. KNOCKOUTS is now
  // shown as a per-match average (avgKnockouts), matching how DAMAGE and
  // ASSISTS are already displayed as averages — previously this used
  // totalKnockouts (a running total), which was inconsistent with the
  // other two stat boxes.
  const topPlayers = useMemo(() => {
    if (!overallData || matchDatas.length === 0) return [];

    const scored = computeFraggerScores(buildFraggerPool(matchDatas)).sort(compareFraggerScore);

    return scored.slice(0, 5).map((player) => ({
      ...player,
      killNum: player.totalKills,
      numericDamage: player.avgDamage,
      assists: player.avgAssists,
      knockouts: player.avgKnockouts,
      matchesPlayed: player.appearances,
    }));
  }, [overallData, matchDatas]);

  if (!overallData) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center text-white text-2xl">
        No data available
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
      <div className="w-[1920px] h-[1080px] flex font-bebas-neue font-[500] ">
        <div
          className="font-[Awaking] text-[140px] leading-[1] absolute top-[30px] left-[270px] font-[700] bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text drop-shadow-[0px_7px_10px_rgba(0,0,0,0.3)] scale-y-[1.4]"
        >
          OVERALL FRAGGERS
        </div>

        {/* Tournament Header */}
        <div
          style={{
            backgroundImage: `linear-gradient(to left, transparent, ${tournament.primaryColor})`,
            clipPath: "polygon(30px 0%, 100% 0%, 100% 100%, 30px 100%, 0% 50%)",
          }}
          className="w-[1000px] h-[55px] absolute left-[260px] top-[210px] text-white font-bebas-neue font-[700] text-[2.5rem] tracking-wide"
        >
          <div className="relative top-[-5px] left-[50px] font-[agencyb]">
            {tournament.tournamentName} | {round?.roundName}
          </div>
        </div>

        <div className="flex flex-wrap justify-center space-x-4">
          {topPlayers.map((player, index) => (
            <motion.div
              className="flex mb-[20px] relative left-[35px] top-[350px] font-[AGENCYB]"
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
                className="bg-[#ffffff] border-solid border-red-800 w-[340px] h-[416px] mr-[20px] border-[2px] scale-95 relative"
                style={{ borderColor: tournament?.primaryColor }}
              >
                {/* Player Photo */}
                <div className="w-[340px] h-[340px] absolute top-[-50px] left-0 overflow-hidden z-20">
                  <img
                    src={player.picUrl || "/def_char.avif"}
                    alt={player.playerName || "player image"}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Rank */}
                <div className="text-black text-[30px] ml-[10px] absolute z-10">
                  #{index + 1}
                </div>

                {/* Team Logo */}
                {player.teamLogo && (
                  <>
                    <div className="w-[70px] h-[65px] absolute right-[10px] top-[10px] z-0">
                      <img src={player.teamLogo || "/def_logo.avif"} alt="team logo" className="bg-cover" />
                    </div>

                    <div className="h-[65px] absolute left-[10px] top-[80px] z-0">
                      <img
                        src={player.teamLogo || "/def_logo.avif"}
                        alt="team logo"
                        className="bg-cover transform blur-sm saturate-0 opacity-[30%]"
                      />
                    </div>
                  </>
                )}

                {/* Player Name */}
                <div className="w-[100%] bg-black text-white h-[80px] absolute top-[280px] z-50">
                  <div className="text-[50px] text-center" >
                    {player.playerName.toUpperCase()}
                  </div>
                </div>

                {/* Stats Box */}
                <div
                  className="bg-red-800 w-[100%] h-[286px] absolute top-[350px] z-10 flex"
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, ${tournament?.primaryColor}, ${tournament?.secondaryColor}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
                  }}
                >
                  <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-0 p-4 text-white text-[50px] mb-0 mt-0 relative">
                    {/* DAMAGE */}
                    <div className="flex flex-col justify-center items-center">
                      <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[44px]">
                        {Math.floor(player.numericDamage || 0)}
                      </div>
                      <div className="mt-2 text-[30px]">AVG DMG</div>
                    </div>

                    {/* KILLS */}
                    <div className="flex flex-col justify-center items-center">
                      <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[44px]">
                        {player.killNum || 0}
                      </div>
                      <div className="mt-2 text-[30px]">KILLS</div>
                    </div>

                    {/* KNOCKOUTS */}
                    <div className="flex flex-col justify-center items-center">
                      <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[36px]">
                        {Math.floor(player.knockouts || 0)}
                      </div>
                      <div className="mt-2 text-[30px]">AVG KO</div>
                    </div>

                    {/* ASSISTS */}
                    <div className="flex flex-col justify-center items-center">
                      <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[36px]">
                        {Math.floor(player.assists || 0)}
                      </div>
                      <div className="mt-2 text-[30px]">AVG AST</div>
                    </div>

                    <div className="bg-white w-full h-[10%] absolute left-0 bottom-0 text-black text-[20px] text-center">
                      {player.teamName.toUpperCase()}
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