import React, { useMemo } from 'react';
import { isWinningPlacement, compareOfficialStandings } from '../../shared/hooks/officialStandings';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
// NOTE: SocketManager import removed, along with the local matchData mirror
// state and its socket handlers. PublicThemeRenderer owns the single socket
// connection and passes freshly-merged `matchData` down as a prop on every
// 'bulkUpdate' — this component just reacts to that prop, same as
// WwcdStats.tsx.

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
  rank?: number;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  health?: number;
  healthMax?: number;
  liveState?: number; // 0,1,2,3 = alive, 4 = knocked, 5 = dead
  knockouts: number;
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

const WwcdSummary: React.FC<WwcdSummaryProps> = ({ tournament, round, match, matchData }) => {
  const teamsWithTotals = useMemo(() => {
    if (!matchData) return [] as Array<Team & { totalKills: number; total: number; totalDamage: number; totalAssists: number }>;
    return matchData.teams
      .map((team) => {
        const totalKills = team.players.reduce((sum, p) => sum + (Number(p.killNum) || 0), 0);
        const totalDamage = team.players.reduce((sum, p) => sum + (Number(p.damage) || 0), 0);
        const totalAssists = team.players.reduce((sum, p) => sum + (Number(p.assists) || 0), 0);
        const totakKnockouts = team.players.reduce((sum, p) => sum + (Number(p.knockouts) || 0), 0);
        return {
          ...team,
          totalKills,
          totalDamage,
          totalAssists,
          totakKnockouts,
          total: totalKills + (Number(team.placePoints) || 0),
        };
      })
      .filter((team) => isWinningPlacement(team.placePoints, team.players?.[0]?.rank))
      .sort((a, b) => compareOfficialStandings(
        {
          wwcd: isWinningPlacement(a.placePoints, a.players?.[0]?.rank) ? 1 : 0,
          totalPlacePoints: a.placePoints || 0,
          totalKills: a.totalKills || 0,
          lastMatchPlacePoints: a.placePoints || 0,
        },
        {
          wwcd: isWinningPlacement(b.placePoints, b.players?.[0]?.rank) ? 1 : 0,
          totalPlacePoints: b.placePoints || 0,
          totalKills: b.totalKills || 0,
          lastMatchPlacePoints: b.placePoints || 0,
        }
      ));
  }, [matchData]);

  const winner = teamsWithTotals[0];

  if (!matchData) {
    return (
      <div className="w-[1920px] h-[1080px] bg-black flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No match data available</div>
      </div>
    );
  }

  // Get top 4 players from the winning team via Fragger Score, scoped to
  // just this one team's roster (a one-match, one-team pool) — kills alone
  // no longer drives the ranking.
  const topPlayers = winner
    ? computeFraggerScores(buildFraggerPool([{ teams: [winner] }]))
        .sort(compareFraggerScore)
        .filter(player => player.picUrl) // Filter players with pictures
        .slice(0, 4) // Get top 4 players
    : undefined;

  return (
  <div className=' w-[1920px] h-[1080px] '>
    <div
     style={{
   backgroundImage: `linear-gradient(135deg, ${
 tournament.secondaryColor || '#000'
}, #000)`,
   WebkitBackgroundClip: 'text',
   WebkitTextFillColor: 'transparent',
 }}
   className='text-white text-[10rem] font-[agencyb] absolute left-[500px] top-[0px]'>
     <div>WINNER WINNER</div>
     <div>CHICKEN DINNER</div>

   </div>

     <div
    style={{
    border: "2px solid",
    borderImage: `linear-gradient(135deg, ${
      tournament.primaryColor || "#000"
    }, #000) 1`,
  }}
      className='bg-white w-[350px] h-[130px] absolute left-[760px] top-[940px] flex '>
        <div

        className='w-full h-[100%]'
           style={{
   backgroundImage: `linear-gradient(135deg, ${
 tournament.secondaryColor || '#000'
}, #000)`,

 }}>
       <img

       src={winner?.teamLogo ||  "/def_logo.png"} alt="" className='w-[150px] h-[100px] object-contain pl-[20px] ' />
       </div>
        <div className='text-black text-[79px] font-[agencyb]  text-center w-full'>{winner.teamTag}</div>
      </div>

   <div
    key={winner?._id || winner?.teamId}
     style={{
  backgroundImage: `linear-gradient(135deg, ${
 tournament.primaryColor || '#000'
}, #000)`

 }}
   className='bg-black w-[900px] h-[130px] absolute left-[500px] top-[810px]'>
<div className="text-white text-[76px] font-[agencyb] flex items-center gap-[100px] w-full ml-[210px]">

 <span>DAY {round?.day}</span>
 <span>MATCH {match?.matchNo}</span>

</div>

   </div>

   {/* Player images - 4 players with proper gaps */}
      {topPlayers && topPlayers.length > 0 && (
     <div className='flex justify-center items-end absolute top-[350px]  left-[490px]  w-[900px] h-[500px]'>
       {topPlayers.slice(0, 4).map((player, index) => (
         <div key={player._id || index} className='flex flex-col items-center justify-center   w-[500px] h-[400px] ml-[10px]'>
           <img
             src={player.picUrl || "/def_char.png"}
             alt={player.playerName || "Player"}
             className='w-[600px] h-[250px]  bg-gray-800 z-20  '
           />
           <div
              style={{
   backgroundImage: `linear-gradient(135deg, ${
 tournament.secondaryColor || '#000'
}, #000)`,

 }}

           className='text-white text-[29px] font-[agencyb]  text-center w-full '>
             {player.playerName.toUpperCase()}
           </div>
         </div>
       ))}
     </div>
   )}
  </div>
  );
};

export default WwcdSummary;
