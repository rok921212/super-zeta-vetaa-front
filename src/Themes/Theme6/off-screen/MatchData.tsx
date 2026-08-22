import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { isWinningPlacement, compareOfficialStandings } from '../../shared/hooks/officialStandings';

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
  day:string;
  apiEnable?: boolean;
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
  health: number;
  healthMax: number;
  liveState: number;
}

interface Team {
  _id: string;
  teamName : string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
  wwcd?: number;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchDataProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const MatchDataComponent: React.FC<MatchDataProps> = ({ tournament, round, match, matchData }) => {
  const sortedTeams = useMemo(() => {
  if (!matchData) return [];

  return matchData.teams
    .map(team => {
      const totalKills = team.players.reduce((sum, p) => sum + (p.killNum || 0), 0);
      const total = totalKills + team.placePoints;
      return { ...team, totalKills, total };
    })
    .sort((a, b) => {
      // Official standings tie-break (single-match scope): wwcd is always
      // computed fresh via isWinningPlacement here — this view only ever
      // sees one match, so any stale `wwcd` field on the team object is
      // ignored rather than trusted.
      const toStandingsInput = (t: typeof a) => ({
        wwcd: isWinningPlacement(t.placePoints, t.players?.[0]?.rank) ? 1 : 0,
        totalPlacePoints: t.placePoints || 0,
        totalKills: t.totalKills || 0,
        lastMatchPlacePoints: t.placePoints || 0,
      });
      return compareOfficialStandings(toStandingsInput(a), toStandingsInput(b));
    });
}, [matchData]);

  // Page toggle: show ranks 2–17 first, then the rest; switch every 25s
  const [page, setPage] = useState<'first' | 'second' | 'third'>('first');
  useEffect(() => {
  const interval = setInterval(() => {
    setPage(prev => {
      if (prev === 'first') {
        // check if SECOND page has at least 1 team
        return sortedTeams.slice(16, 25).length > 0 ? 'second' : 'first';
      }

      if (prev === 'second') {
        // check if THIRD page has at least 1 team
        return sortedTeams.slice(25, 34).length > 0 ? 'third' : 'first';
      }

      return 'first';
    });
  }, 25000);

  return () => clearInterval(interval);
}, [sortedTeams]);

  if (!matchData) {
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial', color: 'white' }}>
        No match data available
      </div>
    );
  }

  const topTeam = sortedTeams[0];
  const remainingTeams = sortedTeams.slice(1);
  const lowerTeams = sortedTeams.slice(1, 7); // ranks 2,3,4
const restTeams = page === 'first'
  ? sortedTeams.slice(7, 16)   // starts from rank 8
  : page === 'second'
  ? sortedTeams.slice(16, 25)
  : sortedTeams.slice(25, 34);
// Pagination sets
const firstPageTeams = remainingTeams.slice(0, 10);   // ranks 2–11 (10 teams)
const restPageTeams = remainingTeams.slice(10,22);       // ranks 12+
const pageTeams = page === 'first' ? firstPageTeams : restPageTeams;

// Split current page into 2 equal halves
const pageMid = Math.ceil(pageTeams.length / 2);
const leftTeams = pageTeams.slice(0, pageMid);
const rightTeams = pageTeams.slice(pageMid);


  return (
    <div className="w-[1920px] h-[1080px] relative  ">
      <div className=' w-[1600px] h-[250px] absolute top-[40px] left-[60px]  '>
<div 

className="px-6 py-2 font-[Awaking] tracking-wide text-[140px] absolute top-[20px] left-[90px] font-[700] bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text scale-y-[1.4]">
  MATCH RANKINGS


  
</div>
<div className='text-[44px] font-[AGENCYB] mt-[110px] absolute   left-[1000px] w-[300px] flex  bg-black text-white text-center'>
     
     <div 
     style={{
    borderColor: `${tournament.primaryColor}`
     }}
     className='w-[100%] h-[30%] border-2'>
   {round?.day} DAY  
   </div>
   <div 
    style={{
            backgroundImage: `linear-gradient(to left,  ${tournament.primaryColor}, ${tournament.secondaryColor})`,
          
          }} className='w-[100%] h-[30%]'
   >   {match?.matchNo} MATCH </div>

  </div>
</div>

      <svg 
      
      className="absolute inset-0" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="paint0_linear_2104_2" x1="161.5" y1="319" x2="68.5" y2="327" gradientUnits="userSpaceOnUse">
            <stop stop-color=""/>
            <stop offset="1" stop-color="black"/>
          </linearGradient>
          <linearGradient id="paint1_linear_2104_2" x1="203.5" y1="265" x2="152.5" y2="227.5" gradientUnits="userSpaceOnUse">
            <stop stop-color={tournament.primaryColor}/>
            <stop offset="1" stop-color="black"/>
          </linearGradient>
        </defs>
      </svg>
      <div 
       style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#212121'
}, #000)`,
borderColor: `${tournament.primaryColor}`
  }}      
      className="absolute left-[146.5px] top-[280.5px] w-[891px] h-[202px]  bg-gradient-to-br from-white to-[#ededed] border-2" >
        
        <svg className="absolute inset-0" viewBox="0 0 891 332" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="paint3_linear_2104_2" x1="463" y1="593.5" x2="119" y2="549" gradientUnits="userSpaceOnUse">
              <stop stop-color={tournament.primaryColor}/>
              <stop offset="1" stop-color="black"/>
            </linearGradient>
          </defs>
        </svg>
        {topTeam?.players.map((player, index) => (
          <img key={player._id} src={player.picUrl || "/def_char.avif"} className="absolute " style={{left: `${index * 102.75}px`, top: '-4px', width: '202.75px', height: '202px'}} />
        ))}
        <div>{topTeam?.placePoints === 10 && (
  <img
    src="/theme4assets/chicken.png"
    alt="WWCD"
    className="absolute left-[830px] w-[50px] h-[80px] object-contain"
  />
)}</div>

<div className=' w-[380px] absolute left-[490px] top-[60px] h-[70px]'>
<div className='flex items-center justify-center font-[AGENCYB] text-[38px] text-white  gap-[10px]'>
<img src={topTeam?.teamLogo} alt="" className='w-[70px] items-center '/>
<div>{topTeam?.teamName.toUpperCase()}</div>
</div>
</div>
<div 
 style={{
             
              background: ` ${tournament.primaryColor} `
              
          
            }}
className='text-white w-[350px]  absolute left-[537px] bottom-[0px] font-[AGENCYB] text-[38px]  gap-[90px] flex pl-[55px]'>
  <div>
  {topTeam?.placePoints}
  </div>
  <div>
   {topTeam?.totalKills}
   </div>
   <div>
    {topTeam?.total}
    </div>
</div>
      </div>
      
      <div 
      
      className="absolute left-[146px] top-[488px] w-[891px] h-[30px] border-2 text-black font-[AGENCYB] text-[18px] flex items-center gap-[130px]" style={{background: 'linear-gradient(to bottom right, #ffffff, #e0e0e0)', borderColor: tournament.secondaryColor}}>
   <div className='pl-[25px]'>
    RANK
   </div>
   <div className='pl-[10px]'>
    TEAM
   </div>
 <div className='pl-[225px]'>
    PLACE
   </div>
    <div className='ml-[-40px]'>
    KILLS
   </div>
    <div className='ml-[-45px]'>
    TOTAL
   </div>
        
      </div>
{lowerTeams.map((team, index) => {
  const topPosition = 523 + index * 64; // row spacing
  const rankNumber = index + 2; // 2,3,4

  return (
    <motion.div
      key={team._id}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.3, duration: 1 }} // stagger each row by 0.3s
      className="absolute left-[146px] w-[891px] h-[60px] border-2 border-white flex items-center text-white"
      style={{ top: `${topPosition}px`, background: 'linear-gradient(to bottom right, #0f0f0f, #1f1f1f)' }}
    >
      {/* LEFT COLOR STRIP WITH RANK NUMBER */}
      <div
        className="w-[76px] h-full flex items-center justify-center text-white font-[AGENCYB] text-[38px]"
     >
        #{rankNumber}
      </div>

      {/* TEAM LOGO */}
      <div className="w-[50px] h-[50px] ml-6 flex-shrink-0">
        <img
          src={team.teamLogo || "/def_logo.png"}
          alt={team.teamName}
          className="w-full h-full object-contain"
        />
      </div>

      {/* TEAM NAME */}
      <div className="flex-1 text-white font-[AGENCYB] text-[38px] ml-6">
        {team.teamName.toUpperCase()}
      </div>

    
<div className='flex gap-[40px]'>
    {/* WWCD ICON */}
      {team.placePoints === 10 && (
        <img
          src="/theme4assets/chicken.png"
          alt="WWCD"
          className="w-[45px] h-[45px]"
        />
      )}
      {/* PLACE POINTS */}
      <div className="w-[80px] text-white font-[AGENCYB] text-[38px] text-center">
        {team.placePoints}
      </div>

      {/* KILLS */}
      <div className="w-[80px] text-white font-[AGENCYB] text-[38px] text-center">
        {team.players.reduce((s, p) => s + (p.killNum || 0), 0)}
      </div>

      {/* TOTAL */}
      <div className="w-[80px] text-white font-[AGENCYB] text-[38px] text-center">
        {team.placePoints + team.players.reduce((s, p) => s + (p.killNum || 0), 0)}
      </div>
      </div>
    </motion.div>
  );
})}

    {/* Container for teams #5+ */}
    
<div 
className="absolute left-[1059px] top-[280px] w-[715px]">
  <div 
  style={{background: 'linear-gradient(to bottom right, #ffffff, #e0e0e0)', borderColor: tournament.secondaryColor}}
  className='w-[715px] h-[30px]   text-black font-[AGENCYB] text-[20px] flex items-centee pb-[0px] mb-[55px] border-2'>
     <div className='ml-[10px]'>RANK</div>
    <div className='ml-[100px]'>TEAM</div>
<div className='ml-[310px]'>PLACE</div>
<div className='ml-[50px]'>KILLS</div>
<div className='ml-[35px]'>TOTAL</div>

  </div>
  {restTeams.map((team, index) => {
 const rankNumber = page === 'first'
  ? 8 + index
  : page === 'second'
  ? 17 + index
  : 26 + index;

  return (
    <motion.div
      key={team._id}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.2, duration: 1 }} // stagger effect
      className="left-0 w-full h-[60px] flex items-center border border-white relative mb-[6px] top-[-50px]"
      style={{ background: 'linear-gradient(to bottom right, #0f0f0f, #1f1f1f)' }}
    >
      {/* LEFT COLOR STRIP WITH RANK */}
      <div
        className="w-[59px] h-full flex items-center justify-center text-white font-[AGENCYB] text-[38px]"
    >
        #{rankNumber}
      </div>

      {/* TEAM LOGO */}
      <div className="w-[50px] h-[50px] ml-4 flex-shrink-0">
        <img src={team.teamLogo || "/def_logo.png"} alt={team.teamName} className="w-full h-full object-contain" />
      </div>
 
      {/* TEAM NAME */}
      <div className="flex-1 text-white font-[AGENCYB] text-[38px] ml-4">
        {team.teamName.toUpperCase()}
      </div>
{/* WWCD Icon */}
      {team.placePoints === 10 && (
        <img src="/theme4assets/chicken.png" alt="WWCD" className="w-[36px] mr-[80px]" />
      )}
      {/* PLACE POINTS */}
      <div className="w-[60px] text-white font-[AGENCYB] text-[38px] text-center relative left-[-50px]">
        {team.placePoints}
      </div>

      {/* KILLS */}
      <div className="w-[60px] text-white font-[AGENCYB] text-[38px] text-center relative left-[-20px]">
        {team.players.reduce((s, p) => s + (p.killNum || 0), 0)}
      </div>

      {/* TOTAL */}
      <div className="w-[60px] text-white font-[AGENCYB] text-[38px] text-center">
        {team.placePoints + team.players.reduce((s, p) => s + (p.killNum || 0), 0)}
      </div>

     
    </motion.div>
  );
})}
</div>

    </div>
  );
};

export default MatchDataComponent;
