import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { buildOverallStandings } from '../../shared/hooks/officialStandings';

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

interface Player {
  _id: string;
  playerName: string;
  killNum: number;
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
  totalKills?: number;
  total?: number;
  rank?: number;
  pointsChange?: number; // points gained this match
  leadOverNext?: number; // only for rank 1: lead over rank 2
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

interface OverAllDataProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matches?: Match[];
  matchDatas?: MatchData[];
}



// ... all imports and interfaces remain the same

const OverAllDataComponent: React.FC<OverAllDataProps> = ({ tournament, round, match, overallData: propOverallData, matchDatas: propMatchDatas }) => {
  const matchDatas = propMatchDatas || [];

  // One shared standings pipeline (Total Score primary + real rankChange
  // from match history, else the overallData snapshot). Rows carry
  // rank / matchesPlayed / leadOverNext plus placePoints|total|wwcd aliases.
  const teams = useMemo(
    () => buildOverallStandings(matchDatas as any, propOverallData as any),
    [matchDatas, propOverallData]
  );

  const [currentPage, setCurrentPage] = useState(0);
  const totalPages = teams.length > 16 ? 2 : 1;

  useEffect(() => {
    if (totalPages <= 1) return;
    const interval = setInterval(() => {
      setCurrentPage(prev => (prev + 1) % totalPages);
    }, 25000);
    return () => clearInterval(interval);
  }, [totalPages]);

  if (teams.length === 0) return <div>No data available</div>;

  let leftTeams: typeof teams, leftRankOffset: number, rightTeams: typeof teams, rightRankOffset: number;
  if (currentPage === 0) {
    leftTeams = teams.slice(0, 8);
    leftRankOffset = 1;
    rightTeams = teams.slice(8, 16);
    rightRankOffset = 9;
  } else {
    leftTeams = teams.slice(16, 25);
    leftRankOffset = 17;
    rightTeams = teams.slice(25, 33);
    rightRankOffset = 26;
  }

  return (
  <div className='w-[1920px] h-[1080px] '>
   <div className=' w-[1600px] h-[250px] absolute top-[40px] left-[60px]  '>
<div 
style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
className='text-[167px] ml-[90px] font-[AGENCYB]  text-white absolute flex'>
  OVERALL RANKINGS

  <div className='relative top-[40px] left-[250px]' >
  <div 
  style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
  className='text-[74px] font-[AGENCYB]   '>
    {round?.roundName}
  </div>
 
  </div>
  
</div>
<div
  style={{ color: "black" }}
  className="text-[74px] font-[AGENCYB] mt-[110px] absolute   left-[1430px] w-[500px] "
>
  DAY {round?.day} MATCH {match?.matchNo}
</div>
</div>

<div
  style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#212121'
}, #000)`
  }}
 className='bg-black w-[820px] h-[50px] absolute top-[250px] left-[160px] flex text-[30px] font-[AGENCYB] text-white items-center 
 '>
<div className='flex left-[470px] relative'>
 <div className='ml-[50px]'>PLACE</div>
  <div className='ml-[50px]'>ELIMS</div>
  <div className='ml-[50px]'>TOTAL</div>
  </div>
  
 </div>
 <div className='w-[500px] absolute left-[157px]  top-[310px]'>
{leftTeams?.map((team, index) => {
  const topPosition = 310 + index * 64; // start from white box top=310px, 64px per row

  return (
    <motion.div
      key={team.teamId}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 1}}
      className=" left-[160px] w-[820px] h-[60px] flex items-center border border-black mb-[10px]"
      style={{ background: 'linear-gradient(to bottom right, #ffffff, #e0e0e0)' }}
    >
      <div 
        style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.primaryColor || '#212121'
}, #000)`
  }}
      className='w-[8%] h-[100%] bg-black text-white font-[AGENCYB] text-[38px] text-center'>
 {index + leftRankOffset}
      </div>
<div className='w-[50px] h-[50px] ml-[20px]'>
<img src={team.teamLogo} alt="" />

</div>
<div className='w-[400px] text-black font-[AGENCYB] text-[38px] text-left absolute left-[150px]'>

 <div className="">
        {team.teamTag}
      </div>
      </div>
      <div className='flex justify-end w-[1000px] absolute left-[-190px] gap-[40px]'>
      {/* WWCD icon */}
   {(team.wwcd || 0) > 0 && (
  <div className="w-[50px] h-full flex items-center justify-center ml-4">
    <img src="/theme4assets/chicken.png" alt="WWCD" className="w-[36px]" />
    <div className="text-[38px] font-[AGENCYB] flex items-center">
      <div className="text-[20px]">x</div>{team.wwcd}
    </div>
  </div>
)}

      {/* PLACE */}
      <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center ml-4">
        {team.placePoints}
      </div>

      {/* ELIMS */}
      <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center ml-4">
        {team.totalKills}
      </div>

      {/* TOTAL */}
      <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center ml-4">
        {team.total}
      </div>
      </div>
    </motion.div>
  );
})}
</div>
 
<div 
 style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#212121'
}, #000)`
  }}
className='bg-black w-[820px] h-[50px] absolute top-[250px] left-[1060px] flex text-[30px] font-[AGENCYB] text-white items-center '>
<div className='flex left-[470px] absolute'>
 <div className='ml-[50px]'>PLACE</div>
  <div className='ml-[50px]'>ELIMS</div>
  <div className='ml-[50px]'>TOTAL</div>
  </div>
  
  </div>
  {/* Second Column */}
<div className='w-[500px] absolute left-[1060px] top-[310px]'>
  {rightTeams?.map((team, index) => (
    <motion.div
      key={team.teamId}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 1 }}
      className="w-[820px] h-[60px] flex items-center border border-black mb-[10px]"
      style={{ background: 'linear-gradient(to bottom right, #ffffff, #e0e0e0)' }}
    >
      {/* Rank */}
      <div 
        style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#212121'}, #000)` }}
        className='w-[8%] h-[100%] bg-black text-white font-[AGENCYB] text-[38px] text-center'
      >
        {index + rightRankOffset}
      </div>

      {/* Team Logo */}
      <div className='w-[50px] h-[50px] ml-[20px]'>
        <img src={team.teamLogo} alt="" />
      </div>

      {/* Team Tag */}
      <div className='w-[400px] text-black font-[AGENCYB] text-[38px] text-left absolute left-[150px]'>
        {team.teamTag}
      </div>

      {/* Stats */}
      <div className='flex justify-end w-[1000px] absolute left-[-190px] gap-[40px]'>
        {(team.wwcd || 0) > 0 && (
          <div className="w-[50px] h-full flex items-center justify-center ml-4">
            <img src="/theme4assets/chicken.png" alt="WWCD" className="w-[36px]" />
            <div className="text-[38px] font-[AGENCYB] flex items-center">
              <div className="text-[20px]">x</div>{team.wwcd}
            </div>
          </div>
        )}

        {/* PLACE */}
        <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center ml-4">
          {team.placePoints}
        </div>

        {/* ELIMS */}
        <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center ml-4">
          {team.totalKills}
        </div>

        {/* TOTAL */}
        <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center ml-4">
          {team.total}
        </div>
      </div>
    </motion.div>
  ))}
</div>

  </div>
 )
};


export default OverAllDataComponent;
