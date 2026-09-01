import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Team, MatchData } from '../../shared/hooks/unsortteams';
import { isWinningPlacement, computeMatchStandings } from '../../shared/hooks/officialStandings';
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

interface WwcdSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

// Basic WWCD Summary component
const WwcdStats: React.FC<WwcdSummaryProps> = ({ tournament, round, match, matchData }) => {
  // Derived values - recalculated whenever matchData changes
  const teamsWithTotals = useMemo(() => computeMatchStandings(matchData).filter((t) => t.wwcd), [matchData]);

  const winner = teamsWithTotals[0];
  const others = teamsWithTotals.slice(1);

  if (!matchData) {
    return (
      <div className="w-[1920px] h-[1080px] bg-black flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No match data available</div>
      </div>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden ">
      {/* Header */}
      <motion.div
        className="relative z-10 text-center left-[600px] top-[0px] text-[5rem] font-bebas font-[300]"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="flex items-center justify-between ">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className=" font-bold whitespace-pre text-[8rem] bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text drop-shadow-[0px_7px_10px_rgba(0,0,0,0.3)]  font-[Awaking] ">BOOYAH TEAM STATS</h1>
              {round && match && (
                <motion.p
                  className="text-white text-[2.5rem] font-[AGENCYB] whitespace-pre p-[0px] mt-[-30px]"
                  initial={{ backgroundColor: 'rgba(255,0,0,0.2)' }}
                  animate={{ backgroundColor: ['rgba(255,0,0,0.25)', 'rgba(255,0,0,0.45)', 'rgba(255,0,0,0.25)'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    background: `linear-gradient(45deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                  }}
                >
                  {`${round.roundName} - DAY${(round as any).day ? ` ${(round as any).day}` : ''} - ${match.matchName ? match.matchName : `Match ${match.matchNo || match._matchNo}`}`}
                </motion.p>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Teams with placement points = 10 */}
      <div className="absolute inset-x-0 top-[150px] px-10">
        <div className="">
          {teamsWithTotals.length === 0 ? (
            <div className="text-center text-white font-[Righteous] text-3xl">No team with placement points 10</div>
          ) : (
            teamsWithTotals.map((team) => (
<motion.div
  key={(team as any)._id || (team as any).teamId}
  className="flex justify-between items-center px-20"
  initial={{ opacity: 0, x: -20 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ duration: 0.4 }}
>
  {/* Left column (2 players stacked vertically) */}
  <div className="flex flex-col gap-2 relative left-[400px] top-[100px]">
    {team.players?.slice(0, 2).map((player, idx) => (
      <div className='w-[300px] h-[350px]'
      style={{background: `linear-gradient(135deg, ${tournament.primaryColor || '#333'}, ${tournament.secondaryColor || '#666'})`}}
      >
          <div className='w-[400px] h-[350px] bg-[#0000008d] absolute left-[-400px]'>
            <div
             className='w-full h-[25%] bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] flex items-center justify-center'>
<span className='text-[2.5rem] font-bold font-[Righteous] '>{player.playerName}</span>
            </div>


<div className="w-full text-white font-bebas items-center h-[88px] ">

  <div   style={{color:tournament.primaryColor}}
   className="text-[9rem] text-center  mb-[-40px]">{player.killNum}</div>
    <div className="text-[4rem] ml-[0px] text-center border-t-[2px] border-white ">ELIMINATION</div>
</div>


          </div>
      <img
        key={player._id || idx}
        src={player.picUrl || "/def_char2.avif"}
        alt={player.playerName}
     className="w-[300px] h-[350px] object-cover "
      />



      </div>
    ))}
  </div>

<div className='bg-[#00000078] w-[250px] h-[710px] absolute left-[835px] top-[100px] flex items-center flex-col'>
<img src= {team.teamLogo} alt="" className='w-full h-full object-contain' />
   <div className='text-white text-[3rem] mt-[-230px] font-bebas'>{team.teamTag}</div>
</div>

  {/* Right column (2 players stacked vertically) */}
  <div className="flex flex-col gap-2 relative right-[400px] top-[100px]">
    {team.players?.slice(2, 4).map((player, idx) => (
       <div className=''
       style={{background: `linear-gradient(135deg, ${tournament.primaryColor || '#333'}, ${tournament.secondaryColor || '#666'})`}}
       >
          <div className='w-[400px] h-[350px] bg-[#0000008d] absolute right-[-400px]'>

            <div
             className='w-full h-[25%] bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] flex items-center justify-center'>
<span className='text-[2.5rem] font-bold font-[Righteous] '>{player.playerName}</span>
            </div>


<div className="w-full text-white font-bebas items-center h-[88px] ">
   <div

   style={{color:tournament.primaryColor}}
   className="text-[9rem] text-center  mb-[-40px]">{player.killNum}</div>
  <div className="text-[4rem] ml-[0px] text-center border-t-[2px] border-white ">ELIMINATION</div>

</div>


          </div>
       <img
         key={player._id || idx}
         src={player.picUrl || "/def_char2.avif"}
         alt={player.playerName}
      className="w-[300px] h-[350px] object-cover "
       />
       </div>
    ))}
  </div>
</motion.div>


            ))
          )}
        </div>
      </div>

    </div>
  );
};

export default WwcdStats;
