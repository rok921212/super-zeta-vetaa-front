import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { isWinningPlacement, compareOfficialStandings } from '../../shared/hooks/officialStandings';
// NOTE: SocketManager import removed, along with the six manual socket
// event handlers and the localMatchData mirror they wrote into.
// PublicThemeRenderer owns the single socket connection and passes
// freshly-merged `matchData` down as a prop — teamsWithTotals below is
// derived directly from that prop now.

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

interface Player {
  _id: string;
  playerName: string;
  killNum: number;
  rank?: number;
  bHasDied: boolean;
  picUrl?: string;
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  // Live stats fields
  health?: number;
  healthMax?: number;
  liveState?: number; // 0,1,2,3 = alive, 4 = knocked, 5 = dead
}

interface Team {
  _id: string;
  teamId?: string;
  teamName?: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface WwcdSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

// Basic WWCD Summary component
const WwcdStats: React.FC<WwcdSummaryProps> = ({ tournament, round, match, matchData }) => {
  const teamsWithTotals = useMemo(() => {
    if (!matchData) return [] as Array<Team & { totalKills: number; total: number }>;
    return matchData.teams
      .map((team) => {
        const totalKills = (team.players || []).reduce((sum, p) => sum + (Number(p.killNum) || 0), 0);
        return {
          ...team,
          totalKills,
          total: totalKills + (Number(team.placePoints) || 0),
        };
      })
      .filter((team) => isWinningPlacement(team.placePoints, team.players?.[0]?.rank))
      .sort((a, b) => {
        // Official standings tie-break (single-match scope): wwcd is
        // computed fresh for this match, so every surviving team here is
        // already wwcd=1 and this naturally falls through to
        // totalPlacePoints/totalKills among them.
        const toStandingsInput = (t: typeof a) => ({
          wwcd: isWinningPlacement(t.placePoints, t.players?.[0]?.rank) ? 1 : 0,
          totalPlacePoints: t.placePoints || 0,
          totalKills: t.totalKills || 0,
          lastMatchPlacePoints: t.placePoints || 0,
        });
        return compareOfficialStandings(toStandingsInput(a), toStandingsInput(b));
      });
  }, [matchData]);

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
              <h1 className="text-white font-bold whitespace-pre text-[8rem]">WWCD TEAM STATS</h1>
              {round && match && (
                <motion.p
                  className="text-gray-300 text-[2rem] font-[Righteous] whitespace-pre p-[10px] mt-[-30px]"
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
            <div className="w-full font-bebas grid grid-cols-2 items-center h-[88px] text-white border-b-[2px] border-white">
  <span className="text-[4rem] ml-[20px]">DAMAGE</span>
  <span className="text-[4rem] text-center">{player.damage}</span>
</div>

<div className="w-full text-white font-bebas grid grid-cols-2 items-center h-[88px] border-b-[2px] border-white">
  <span className="text-[4rem] ml-[20px]">KILLS</span>
  <span className="text-[4rem] text-center">{player.killNum}</span>
</div>

<div className="w-full text-white font-bebas grid grid-cols-2 items-center h-[88px] border-b-[2px] border-white">
  <span className="text-[4rem] ml-[20px]">ASSISTS</span>
  <span className="text-[4rem] text-center">{player.assists}</span>
</div>

          </div>
      <img
        key={player._id || idx}
        src={player.picUrl || "/def_char.png"}
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
            <div className="w-full font-bebas grid grid-cols-2 items-center h-[88px] text-white border-b-[2px] border-white">
  <span className="text-[4rem] ml-[20px]">DAMAGE</span>
  <span className="text-[4rem] text-center">{player.damage}</span>
</div>

<div className="w-full text-white font-bebas grid grid-cols-2 items-center h-[88px] border-b-[2px] border-white">
  <span className="text-[4rem] ml-[20px]">KILLS</span>
  <span className="text-[4rem] text-center">{player.killNum}</span>
</div>

<div className="w-full text-white font-bebas grid grid-cols-2 items-center h-[88px] border-b-[2px] border-white">
  <span className="text-[4rem] ml-[20px]">ASSISTS</span>
  <span className="text-[4rem] text-center">{player.assists}</span>
</div>
          </div>
       <img
         key={player._id || idx}
         src={player.picUrl || "https://res.cloudinary.com/dqckienxj/image/upload/v1735718663/defult_chach_apsjhc_jydubc.png"}
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
