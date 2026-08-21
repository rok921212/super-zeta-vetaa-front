import React, { useMemo } from 'react';
import { MatchData } from '../../shared/hooks/unsortteams';
// NOTE: SocketManager import removed along with the six manual socket event
// handlers (handleLiveUpdate, handleMatchDataUpdate, handlePlayerUpdate,
// handleTeamPointsUpdate, handleTeamStatsUpdate, handleBulkTeamUpdate) and
// the localMatchData mirror they all wrote into. PublicThemeRenderer owns
// the single socket connection and passes freshly-merged `matchData` down
// as a prop — this component now just derives from that prop directly.

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
  // Derived values
  const teamsWithTotals = useMemo(() => {
    if (!matchData) return [] as Array<any>;
    return matchData.teams
      .map((team) => {
        const totalKills = (team.players || []).reduce((sum, p) => sum + (Number(p.killNum) || 0), 0);
        return {
          ...team,
          totalKills,
          total: totalKills + (Number(team.placePoints) || 0),
        };
      })
      .filter((team) => Number(team.placePoints) === 10)
      .sort((a, b) => {
        // Sort primarily by placePoints desc (WWCD more likely on top), then total desc
        if (b.placePoints !== a.placePoints) return (b.placePoints || 0) - (a.placePoints || 0);
        return (b.total || 0) - (a.total || 0);
      });
  }, [matchData]);

  const winner = teamsWithTotals[0];

  if (!matchData) {
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
<div className='w-[300px] h-[300px] absolute left-[100px]'>
  <img src={winner?.teamLogo} alt="" className='w-[100%] h-[100%]'/>
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
  <div key={player._id} className='w-[353px] h-[110%] bg-white ml-[20px]'>
  <div
  style={{
    backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
  }}
  className="w-full h-[400px] relative overflow-hidden rounded-lg"
>
  <img
    src={player?.picUrl || "/def_char.png"}
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
   <div
   style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.primaryColor || '#000'
}, #000)`

  }}
    className='w-[99%] h-[70px] m-[2px] bg-black'>
<div className='text-white font-[AGENCYB] flex items-center justify-around h-[83%] text-[3rem] w-[300px]'>
 <div>DAMAGE</div>
 <div>{player?.damage}</div>
</div>

    </div>
      <div
   style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.primaryColor || '#000'
}, #000)`

  }}
    className='w-[99%] h-[70px] m-[2px] bg-black mt-[30px]'>
      <div className='text-white font-[AGENCYB] flex items-center justify-around h-[83%] text-[3rem] w-[300px]'>
 <div>ELIMS</div>
 <div>{player?.killNum}</div>
</div>
    </div>
      <div
   style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.primaryColor || '#000'
}, #000)`

  }}
    className='w-[99%] h-[70px] m-[2px] bg-black mt-[30px]'>
     <div className='text-white font-[AGENCYB] flex items-center justify-around h-[83%] text-[3rem] w-[300px]'>
<div>THORWABLE</div>
<div>{(player?.useSmokeGrenadeNum || 0) + (player?.useFragGrenadeNum || 0) + (player?.useBurnGrenadeNum || 0) + (player?.useFlashGrenadeNum || 0)}</div>
</div>
    </div>
      <div
   style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.primaryColor || '#000'
}, #000)`

  }}
    className='w-[99%] h-[70px] m-[2px] bg-black mt-[30px]'>
      <div className='text-white font-[AGENCYB] flex items-center justify-around h-[83%] text-[3rem] w-[300px]'>
 <div>DAMAGE</div>
 <div>{player?.damage}</div>
</div>
    </div>
  </div>


))}

</div>
</div>

  );
};

export default WwcdStats;
