import React, { useMemo } from 'react';
import { FaSkull, FaHeartbeat, FaBomb, FaBullseye  } from 'react-icons/fa';
import { isWinningPlacement, computeMatchStandings } from '../../shared/hooks/officialStandings';
// NOTE: SocketManager import removed, along with the localMatchData mirror
// state and its socket-handler block. PublicThemeRenderer owns the single
// socket connection and passes freshly-merged `matchData` down as a prop —
// this component now just reads that prop directly.
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
  heal?: number;
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  // Live stats fields
  health?: number;
  healthMax?: number;
  liveState?: number; // 0,1,2,3 = alive, 4 = knocked, 5 = dead
  useSmokeGrenadeNum?: number;
  useFragGrenadeNum?: number;
  useBurnGrenadeNum?: number;
  useFlashGrenadeNum?: number;
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
  const localMatchData = matchData ?? null;

  // Derived values
  const teamsWithTotals = useMemo(() => computeMatchStandings(localMatchData).filter((t) => t.wwcd), [localMatchData]);

  const winner = teamsWithTotals[0];
  const others = teamsWithTotals.slice(1);

  if (!localMatchData) {
    return (
      <div className="w-[1920px] h-[1080px]  flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No match data available</div>
      </div>
    );
  }

  return (
    <div className='w-[1920px] h-[1080px] '>
<div
  style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.primaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
  className="w-[1800px] h-[250px] text-[142px] font-[agencyb] absolute left-[140px]"
>
  WWCD TEAM STATS

  
</div>
<div
 style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.primaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
className="text-[78px] font-[agencyb] absolute left-[1340px] top-[0px]">
    {round?.roundName}
  </div>
<div className='text-black w-[458px] h-[200px] text-[78px] font-[agencyb] absolute left-[1300px] top-[70px]'>
DAY {round?.day} MATCH {match?.matchNo}

</div>

<div className='absolute left-[140px] top-[200px]  w-[500px] h-[750px]'>
<div className='w-[300px] h-[300px] absolute left-[80px]'>
  <img src={winner?.teamLogo} alt="" className='w-[100%] h-[100%] bg-[#0000009b]'/>
</div>
<div 

  style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.primaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
className='text-white font-[AGENCYB] text-[273px] absolute left-[140px] top-[230px]'>

  {winner?.totalKills}
</div>
<div
 style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
className='text-white font-[AGENCYB] text-[100px] absolute left-[136px] top-[520px]'>
  ELIMS
</div>
</div>
<div className='w-[1400px] h-[800px]  absolute left-[520px] top-[180px] flex'>
{winner?.players?.map((player, index) => (
  <div key={player._id} className='w-[353px] h-[106%] bg-[#000000c8] ml-[20px]'>
  <div
  style={{
    backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
  }}
  className="w-full h-[400px] relative overflow-hidden "
>
  <img
    src={player?.picUrl || "/def_char.avif"}
    alt={player.playerName}
    className="absolute top-0 left-0 w-full h-full object-cover"
  />
</div>

    <div 
    style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#000'
}, #000)`

  }}
   className='w-[99%] h-[100px] m-[2px] font-[agencyb] flex items-center justify-center'>
    <div className='text-white text-[58px] '>{player?.playerName}</div>
    
   </div>
  <div className="flex flex-col w-[99%] mx-[2px] gap-4">
  {/* DAMAGE */}
  <div
    style={{
      backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
    }}
    className="w-full h-[70px] flex items-center px-4"
  >
    <div className="flex items-center gap-4 w-[300px] h-[83%]">
      <FaSkull className="text-white text-[2.5rem]" />
      <div className="flex justify-between w-full text-white font-[AGENCYB] text-[3rem]">
        <span>DAMAGE</span>
        <span>{player?.damage}</span>
      </div>
    </div>
  </div>

  {/* ELIMS */}
  <div
    style={{
      backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
    }}
    className="w-full h-[70px] flex items-center px-4"
  >
    <div className="flex items-center gap-4 w-[300px] h-[83%]">
      <FaBullseye  className="text-white text-[2.5rem]" />
      <div className="flex justify-between w-full text-white font-[AGENCYB] text-[3rem]">
        <span>ELIMS</span>
        <span>{player?.killNum}</span>
      </div>
    </div>
  </div>

  {/* THROWABLE */}
  <div
    style={{
      backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
    }}
    className="w-full h-[70px] flex items-center px-4"
  >
    <div className="flex items-center gap-4 w-[300px] h-[83%]">
      <FaBomb className="text-white text-[2.5rem]" />
      <div className="flex justify-between w-full text-white font-[AGENCYB] text-[3rem]">
        <span>THROWABLE</span>
        <span>
          {(player?.useSmokeGrenadeNum || 0) +
            (player?.useFragGrenadeNum || 0) +
            (player?.useBurnGrenadeNum || 0) +
            (player?.useFlashGrenadeNum || 0)}
        </span>
      </div>
    </div>
  </div>

  {/* HEAL */}
  <div
    style={{
      backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
    }}
    className="w-full h-[70px] flex items-center px-4"
  >
    <div className="flex items-center gap-4 w-[300px] h-[83%]">
      <FaHeartbeat className="text-white text-[2.5rem]" />
      <div className="flex justify-between w-full text-white font-[AGENCYB] text-[3rem]">
        <span>HEAL</span>
        <span>{player?.heal}</span>
      </div>
    </div>
  </div>
</div>
  </div>
  
  
))}

</div>
</div>


   
  );
};

export default WwcdStats;