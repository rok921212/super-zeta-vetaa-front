import React from 'react';

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

interface MatchData {
  _id: string;
  matchId: string;
  userId: string;
  teams: any[];
}

interface IntroProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const Intro: React.FC<IntroProps> = ({ tournament, round, match, matchData }) => {
  return (
    <div
    className='flex justify-center items-center'
    style={{ width: '1920px', height: '1080px' }}>
   <div
   style={{ background: `linear-gradient(45deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})` }}
   className="w-[600px] h-[200px] ">




<div className='w-[300px] h-[80px] absolute left-[915px] mt-[20px] border-white border-solid border-[1px] text-white font-[Righteous] text-center pt-[0px] text-[2.3rem] flex items-center justify-center'>

{round?.roundName}
</div>
<div className='w-[360px] h-[0px] absolute left-[885px] mt-[115px] border-white border-solid border-[1px] text-white font-[Righteous] text-center pt-[0px] text-[3rem]'>


</div>
<div className='text-white absolute left-[990px] text-[4rem] font-bebas mt-[115px] font-[500] text-center'>
MATCH {match?.matchNo}

</div>
<div 
className='w-[35%] h-[100%] bg-white'


>


<img src={tournament.torLogo} alt="" className='w-[100%] h-[100%] object-contain'/>

</div>


<div className='w-[100%] h-[20%] bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700]  flex items-center justify-center font-[Righteous] font-[400] text-[2rem]'>
{tournament.tournamentName}

</div>

     </div>
    </div>
  );
};

export default Intro;