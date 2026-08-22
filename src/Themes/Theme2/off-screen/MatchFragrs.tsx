import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Team, MatchData } from '../../shared/hooks/unsortteams';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
// NOTE: SocketManager import removed — this component no longer opens its
// own socket subscription. PublicThemeRenderer owns the single socket
// connection, listens to 'bulkUpdate', and passes the freshly-merged
// matchData down as a prop on every change. That prop update is what
// re-renders this component now, same as the Theme2 conversion pattern
// used in Alerts.tsx / Dom.tsx / LiveStats.tsx.
//
// Player / Team / MatchData are imported from useSortedTeams' shared hook
// module rather than redeclared locally — duplicate same-named interfaces
// with different shapes are NOT the same type to TypeScript.

// ─────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────
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
  _matchNo?: number;
}

interface MatchFragrsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const MatchFragrs: React.FC<MatchFragrsProps> = ({ tournament, round, match, matchData }) => {
  const [selectedView, setSelectedView] = useState<'fragers' | 'teams'>('fragers');

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



  // Single-Match Fragger Score: same weighted formula as the Overall score,
  // fed just this match via buildFraggerPool([matchData]). latestPlayerRaw
  // is spread back in first so live-only fields (health, healthMax,
  // liveState, bHasDied) the card below needs survive into the final object.
  const topPlayers = useMemo(() => {
    if (!matchData) return [];

    const scored = computeFraggerScores(buildFraggerPool([matchData])).sort(compareFraggerScore);

    return scored.slice(0, 5).map(player => {
      const teamTotalKills = matchData.teams
        .find((t: Team) => t.teamTag === player.teamTag)
        ?.players.reduce((sum, p) => sum + (p.killNum || 0), 0) || 0;

      return {
        ...(player.latestPlayerRaw as any),
        ...player,
        killNum: player.totalKills,
        numericDamage: player.totalDamage,
        assists: player.totalAssists,
        teamTotalKills
      };
    });
  }, [matchData]);

  // Get sorted teams by points and kills - recalculated whenever matchData changes
  const sortedTeams = useMemo(() => {
    if (!matchData) return [];

    return matchData.teams
      .map((team: Team) => ({
        ...team,
        totalKills: team.players.reduce((sum, p) => sum + (p.killNum || 0), 0),
        alive: team.players.filter(p => p.liveState !== 5 && !p.bHasDied).length,
        totalDamage: team.players.reduce((sum, p) => sum + (parseInt((p as any).damage || '0') || 0), 0),
      }))
      .sort((a, b) => {
        // Sort by points first (descending), then by kills (descending)
        if (b.placePoints !== a.placePoints) {
          return b.placePoints - a.placePoints;
        }
        return b.totalKills - a.totalKills;
      });
  }, [matchData]);

  if (!matchData) {
    return (
      <div className="w-[1920px] h-[1080px] bg-black flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No match data available</div>
      </div>
    );
  }

  return (

    <div className="w-[1920px] h-[1080px]  relative overflow-hidden">
      {/* Background Pattern */}
      <motion.div
        className="absolute inset-0 opacity-10"

        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />

      {/* Header */}
      <motion.div className="relative z-10  text-center left-[600px] top-[100px] text-[5rem] font-bebas font-[300]"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="flex items-center justify-between mb-[60px]">
          <div className="flex items-center space-x-4 ">

            <div>
              <h1 className=" font-bold font-[awaking] whitespace-pre text-[8rem]  bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text drop-shadow-[0px_7px_10px_rgba(0,0,0,0.3)]  tracking-wider "


              >
              TOP FRAGGERS
              </h1>
              {round && match && (
                <motion.p
                  className="text-white text-[3rem] font-[AGENCYB] whitespace-pre p-[0px]"
                  initial={{ backgroundColor: 'rgba(255,0,0,0.2)' }}
                  animate={{ backgroundColor: ['rgba(255,0,0,0.25)','rgba(255,0,0,0.45)','rgba(255,0,0,0.25)'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    background: `linear-gradient(45deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                  }}
                >
              {renderTyped(
  `${round.roundName} - DAY${(round as any).day ? ` ${round.day}` : ''} - MATCH ${match.matchNo || match._matchNo}`,
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
        {selectedView === 'fragers' ? (
          /* Top Fraggers View */
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
                // Calculate health percentage based on API enable
                let healthPercentage = 100;
                if (round?.apiEnable) {
                  healthPercentage = player.healthMax > 0 ? Math.max(0, Math.min(100, (player.health / player.healthMax) * 100)) : 0;
                } else {
                  healthPercentage = player.bHasDied ? 0 : 100;
                }

                // Check player status
                const isAlive = [0, 1, 2, 3].includes(player.liveState);
                const isKnocked = player.liveState === 4;
                const isDead = player.bHasDied || player.liveState === 5;

                // Determine bar color and status
                let barColor = 'bg-gray-500';
                let statusText = 'Dead';

                if (isDead) {
                  barColor = 'bg-gray-500';
                  statusText = 'Dead';
                } else if (isKnocked) {
                  barColor = 'bg-red-500';
                  statusText = 'Knocked';
                } else if (isAlive) {
                  if (healthPercentage > 75) barColor = 'bg-green-500';
                  else if (healthPercentage > 50) barColor = 'bg-yellow-500';
                  else if (healthPercentage > 25) barColor = 'bg-orange-500';
                  else barColor = 'bg-red-500';
                  statusText = `${Math.round(healthPercentage)}%`;
                }

                const contribution = player.teamTotalKills > 0
                  ? Math.min(100, Math.round((player.killNum / player.teamTotalKills) * 100))
                  : 0;

                return (
                  <motion.div
                  style={{
                      clipPath: "polygon(10% 2%, 100% -30%, 100% 80%, 85% 100%, 0 100%)",
                    background: `linear-gradient(45deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                  }}
                    key={player._id}
                    className="flex flex-col  bg-gray-900 w-[300px] h-[500px] relative top-[150px] left-[40px]"

                    variants={cardVariants}
                  >
                    {/* Rank */}
                    <div className="text-yellow-400 text-2xl font-bold font-[Righteous] ml-[20px] ">#{index + 1}</div>
                    <div className='w-[249px] h-[1px] bg-white relative left-[50px] top-[-15px]'></div>
                    <div className='w-[60px] absolute left-[235px] top-[30px]'><img src={player.teamLogo} alt="" className='aboslute' /></div>
<div className='w-[250px] absolute left-[20px] opacity-40'><img src={player.teamLogo} alt="" className='aboslute' /></div>
                    {/* Player Avatar */}
                    <div className="w-[300px] h-[300px] ml-[0px] absolute z-0">
                      <img
                        src={player.picUrl || '/def_char2.avif'}
                        alt={player.playerName}
                        className="w-full h-full "
                      />
                    </div>

                    {/* Player Info */}
                    <div className="text-center z-10 relative top-[220px]">
                      <div className="text-black pt-[0px] text-[1.8rem] font-bold font-[Righteous] bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] w-[300px] h-[50px]">{player.playerName}</div>
                      <div className="text-gray-300 text-[15px] font-[Righteous] absolute w-[100%] h-[55%] border-b-2  bg-[#00000099]">esports athlete for {player.teamTag}</div>
                    </div>

                    {/* Health Bar */}



                    {/* Stats */}
                    <div className=" text-[2rem] w-full text-center absolute top-[330px] font-bebas  font-[500] bg-[#00000099] flex justify-center">
                      <div>
                        <div className="text-yellow-400  text-[4rem] ">{player.killNum} <span className='text-white'>KILLS</span></div>

                      </div>


                    </div>

                    {/* Contribution */}
                    <div className="w-full absolute top-[450px]">
                      <div className="flex  text-xs text-gray-300 font-[Righteous] mb-1 items-center justify-center">
                        <span className='text-[1rem] '>Contribution</span>
                        <span className=' text-center text-[1rem] ml-[10px]'>{contribution}%</span>
                      </div>
                      <div className="w-[90%] bg-gray-700 rounded-full h-2 relative left-[10px] ">
                        <div className="h-2 rounded-full bg-yellow-400 transition-all duration-500" style={{ width: `${contribution}%` }} />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        ) : (
          /* Team Rankings View */
          <div className="space-y-4">

          </div>
        )}
      </div>

    </div>
  );
};

export default MatchFragrs;
