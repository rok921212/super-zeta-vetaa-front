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
  killNum?: number;
  assists?: number;
  knockouts?: number;
  damage?: number;
  picUrl?: string;
}

interface Team {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  slot: number;
  placePoints: number;
  players: Player[];
}

interface MatchData {
  _id: string;
  matchId: string;
  userId: string;
  teams: Team[];
}

interface TeamH2HProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData: MatchData | null;
}

const TeamH2H: React.FC<TeamH2HProps> = ({ tournament, round, match, matchData }) => {

  const topTeams = useMemo(() => {
    if (!matchData) return null;

    const enriched = matchData.teams.map(team => {
            const knockouts = team.players.reduce((sum, p) => sum + Number(p.knockouts || 0), 0);

      const totalKills = team.players.reduce((sum, p) => sum + Number(p.killNum || 0), 0);
      const totalDamage = team.players.reduce((sum, p) => sum + Number(p.damage || 0), 0);
      const total = Number(team.placePoints || 0) + totalKills;
      return { ...team, total, totalKills, totalDamage,knockouts };
    });

    enriched.sort((a, b) => b.total - a.total);

    return {
      first: enriched[0] || null,
      second: enriched[1] || null,
    };
  }, [matchData]);

  if (!matchData || !topTeams?.first || !topTeams?.second) {
    return (
      <div style={{ width: '1920px', height: '1080px',  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'white', fontSize: '24px', fontFamily: 'Righteous' }}>Not enough teams</div>
      </div>
    );
  }

  const { first, second } = topTeams;

return (
  <div className='w-[1920px] h-[1080px] flex justify-center'>

    <div className='w-[1500px] h-[300px]  absolute top-[40px] font-[AGENCYB]'>

      <div
          style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
      className='text-[170px] w-full h-[200px]'>TEAM HEAD 2 HEAD</div>
      <div
      className='text-[80px] absolute top-[20px] left-[80%]'
      style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
      >{round?.roundName}</div>
         <div
      className='text-[80px] absolute top-[100px] left-[80%] w-[500px]'
      style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
      >DAY {round?.day} MATCH {match?.matchNo}</div>
    </div>

<div className=' w-[1920px] h-[300px%] absolute top-[250px] left-[200px] flex justify-center  '>
<div

className='font-[AGENCYB] text-[30px] bg-white'>
  <div 
   style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
  className='bg-white w-[200px] h-[185px] border-2 border-black flex items-center justify-center flex-col'>
    TOTAL ELIMS
          <span className='text-[4rem] mt-[-20px]'>{first.totalKills}</span>

  </div>

  <div 
   style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
  className='bg-white w-[200px] h-[185px] border-2 border-black flex items-center justify-center flex-col'>
    TOTAL DAMAGE
      <span className='text-[4rem] mt-[-20px]'>{first.totalDamage}</span>
  </div>

  <div 
   style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
  className='bg-white w-[200px] h-[185px] border-2 border-black flex items-center justify-center flex-col'>
    TOTAL HEALS
      <span className='text-[4rem] mt-[-20px]'>{first.totalDamage}</span>
  </div>

  <div
   style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
  className='bg-white w-[200px] h-[185px] border-2 border-black flex items-center justify-center flex-col'>
    TOTAL KNOCKS
          <span className='text-[4rem] mt-[-20px]'>{first.knockouts}</span>

  </div>
</div>

<div
   style={{
      backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
    }}
className='w-[590px] h-[100%] absolute left-[0%] flex items-end '>

<img src={first.teamLogo} alt="" className='absolute top-[0px]'/>
  <div
    style={{
      backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
    }}
  className='w-[100%] h-[20%] border-[2px] border-solid border-white font-[AGENCYB] text-white text-[80px] text-center'>

    {first.teamName}
  </div>
</div>
  <div
    className='w-[15%] h-[738px] flex flex-col justify-between gap-2 p-2 items-center'
    style={{
      backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
    }}
  >
<img
  src="/theme4assets/total elims.png"
  className="w-[70%] h-[22%] object-contain filter brightness-0 invert"
/>
<img
  src="/theme4assets/totaldamages.png"
  className="w-[70%]  h-[22%] object-contain filter brightness-0 invert"
/> 
<img
  src="/theme4assets/health.png"
  className="w-[70%]  h-[22%] object-contain filter brightness-0 invert"
/>  
<img
  src="/theme4assets/knoc.png"
  className="w-[70%]  h-[22%] object-contain filter brightness-0 invert"
/>  </div>
<div 
  
className='font-[AGENCYB] text-[30px] bg-white'>
  <div 
   style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
  className='bg-white w-[200px] h-[185px] border-2 border-black flex items-center justify-center flex-col'>
    TOTAL ELIMS
          <span className='text-[4rem] mt-[-20px]'>{second.totalKills}</span>

  </div>

  <div 
   style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
  className='bg-white w-[200px] h-[185px] border-2 border-black flex items-center justify-center flex-col'>
    TOTAL DAMAGE
      <span className='text-[4rem] mt-[-20px]'>{second.totalDamage}</span>
  </div>

  <div 
   style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
  className='bg-white w-[200px] h-[185px] border-2 border-black flex items-center justify-center flex-col'>
    TOTAL HEALS
      <span className='text-[4rem] mt-[-20px]'>{second.totalDamage}</span>
  </div>

  <div
   style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
  className='bg-white w-[200px] h-[185px] border-2 border-black flex items-center justify-center flex-col'>
    TOTAL KNOCKS
          <span className='text-[4rem] mt-[-20px]'>{second.knockouts}</span>

  </div>
</div>
<div 
  style={{
      backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
    }}
className='bg-slate-400 w-[600px] h-[100%] absolute right-[0%] flex items-end '>

<img src={second.teamLogo} alt="" className='absolute top-[0px]'/>
  <div 
    style={{
      backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
    }}
  className='bg-white w-[100%] h-[20%] border-[2px] border-solid border-white font-[AGENCYB] text-white text-[80px] text-center'>

    {second.teamName}
  </div>
</div>
</div>

      
  </div>
)
};

export default TeamH2H;

