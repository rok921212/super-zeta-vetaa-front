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
        totalScore: t.total || 0,
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
          if (sortedTeams.slice(13, 22).length > 0) return 'second';
          else return 'first';
        }
        if (prev === 'second') {
          if (sortedTeams.slice(22, 31).length > 0) return 'third';
          else return 'first';
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
  const lowerTeams = sortedTeams.slice(1, 4); // ranks 2,3,4
  const restTeams = page === 'first' ? sortedTeams.slice(4, 13) : page === 'second' ? sortedTeams.slice(13, 22) : sortedTeams.slice(22, 31); // 5-13, 14-22, 23-30

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
 style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
className='text-[167px] ml-[90px] font-[AGENCYB]  text-white absolute flex'>
  MATCH RANKINGS

  <div className='relative top-[40px] left-[250px]' >
  <div 
  style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
  className='text-[74px] font-[AGENCYB]  text-white '>
    {round?.roundName}
  </div>
   
  </div>
  
</div>
<div className='text-[74px] font-[AGENCYB] mt-[110px] absolute   left-[1330px] w-[500px]'>
    DAY {round?.day} MATCH {match?.matchNo}
  </div>
</div>

      <svg className="absolute inset-0" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M115.5 346C133.1 341.2 145.5 348 149.5 352H150.5V303L144.5 305C143.7 301.4 139.5 296.833 137.5 295L138 302C134 301.2 129.667 304.667 128 306.5L123.5 302C123.1 306.4 125.667 311.167 127 313C117.8 318.2 106.833 315.167 102.5 313C92.1 323 77.1667 321.5 71 319.5C75.4 334.7 88.5 343.5 94.5 346C105.3 339.6 113 343.333 115.5 346Z" fill="url(#paint0_linear_2104_2)"/>
        <path d="M165 269.5C157.4 263.9 156.5 252.5 157 247.5C159.5 251 167.5 253.5 178 253.5C180 258.3 187.167 260.833 190.5 261.5C190.5 260.3 191.833 255.333 192.5 253C192.5 253.167 192.9 254.5 194.5 258.5C196.578 257.3 199.033 258 200 258.5L202.5 254.5V262.5C210.1 263.3 215 259.5 216.5 257.5C221.7 259.9 232.333 257.833 237 256.5C235.8 267.3 229.833 273.333 227 275C221.8 274.2 217.833 276.667 216.5 278L213.5 282H174L177.853 276.703C177.744 276.488 177.627 276.254 177.5 276C175.1 271.2 168.167 269.667 165 269.5Z" fill="url(#paint1_linear_2104_2)"/>
        <defs>
          <linearGradient id="paint0_linear_2104_2" x1="161.5" y1="319" x2="68.5" y2="327" gradientUnits="userSpaceOnUse">
            <stop stop-color={tournament.primaryColor}/>
            <stop offset="1" stop-color="black"/>
          </linearGradient>
          <linearGradient id="paint1_linear_2104_2" x1="203.5" y1="265" x2="152.5" y2="227.5" gradientUnits="userSpaceOnUse">
            <stop stop-color={tournament.primaryColor}/>
            <stop offset="1" stop-color="black"/>
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute left-[146.5px] top-[280.5px] w-[891px] h-[332px] rounded-[27.5px] bg-gradient-to-br from-white to-[#ededed] border-2" style={{borderColor: tournament.secondaryColor}}>
        <svg className="absolute inset-0" viewBox="0 0 891 332" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M286.5 343.5C215.7 333.9 166.333 307.167 150.5 295C148.5 297.4 147.333 302.667 147 305V588.5C147.8 599.7 160.667 608.167 167 611H1012.5C1020.1 610.2 1025 606.333 1026.5 604.5L1022.5 603.5C938.5 592.3 854.167 554.5 822.5 537C781.7 587.8 675.5 575.5 627.5 563C609.1 566.6 607.833 547.167 609.5 537C627.1 509.4 628.833 464.833 627.5 446C607.9 462.4 592.667 486.167 587.5 496C555.9 465.2 511 460.167 492.5 461.5C498.1 439.9 496.5 410.5 495 398.5C481 409.5 458 447.5 452.5 467.5C448.1 483.5 438 493.167 433.5 496C316.7 448 286.833 374.333 286.5 343.5Z" fill="url(#paint3_linear_2104_2)" fill-opacity="0.70" transform="translate(-146.5, -280.5)"/>
          <defs>
            <linearGradient id="paint3_linear_2104_2" x1="463" y1="593.5" x2="119" y2="549" gradientUnits="userSpaceOnUse">
              <stop stop-color={tournament.primaryColor}/>
              <stop offset="1" stop-color="black"/>
            </linearGradient>
          </defs>
        </svg>
        {topTeam?.players.map((player, index) => (
          <img key={player._id} src={player.picUrl || "/def_char.avif"} className="absolute " style={{left: `${index * 182.75}px`, top: '6px', width: '322.75px', height: '322px'}} />
        ))}
        <div>{topTeam?.placePoints === 10 && (
  <img
    src="/theme4assets/chicken.png"
    alt="WWCD"
    className="absolute left-[780px]"
  />
)}</div>
      </div>
      <div className="absolute left-[146px] top-[614px] w-[891px] h-[60px] border-2" style={{background: `linear-gradient(135deg, ${tournament.primaryColor}, black)`, borderColor: tournament.secondaryColor}}>
        <div className='text-white font-[AGENCYB] text-[41px] absolute left-[85px] top-[-15px] w-[100px] h-[100px]'>
          <img src={topTeam?.teamLogo || "/def_logo.png"} alt=""  className='w-[100%] h-[100%]'/>
        
        </div>
<div className='text-white font-[AGENCYB] text-[41px] absolute left-[195px] top-[-2px]'>
        {topTeam?.teamName}
        </div>
        <div className='text-white font-[AGENCYB] text-[41px] absolute left-[670px] top-[-2px]'>
        {topTeam?.placePoints}
        </div>
        <div className='text-white font-[AGENCYB] text-[41px] absolute left-[758px] top-[-2px]'>
        {topTeam?.totalKills}
        </div>
        <div className='text-white font-[AGENCYB] text-[41px] absolute left-[832px] top-[-2px]'>
        {topTeam?.total}
        </div>
        
      </div>
{lowerTeams.map((team, index) => {
  const topPosition = 684 + index * 64; // row spacing
  const rankNumber = index + 2; // 2,3,4

  return (
    <motion.div
      key={team._id}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.3, duration: 1 }} // stagger each row by 0.3s
      className="absolute left-[146px] w-[891px] h-[60px] border-2 border-black flex items-center"
      style={{ top: `${topPosition}px`, background: 'linear-gradient(to bottom right, #ffffff, #e0e0e0)' }}
    >
      {/* LEFT COLOR STRIP WITH RANK NUMBER */}
      <div
        className="w-[76px] h-full flex items-center justify-center text-white font-[AGENCYB] text-[38px]"
  style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#212121'
}, #000)`
  }}      >
        {rankNumber}
      </div>

      {/* TEAM LOGO */}
      <div className="w-[70px] h-[70px] ml-6 flex-shrink-0">
        <img
          src={team.teamLogo || "/def_logo.png"}
          alt={team.teamName}
          className="w-full h-full object-contain"
        />
      </div>

      {/* TEAM NAME */}
      <div className="flex-1 text-black font-[AGENCYB] text-[38px] ml-6">
        {team.teamName}
      </div>

      {/* WWCD ICON */}
      {team.placePoints === 10 && (
        <img
          src="/theme4assets/chicken.png"
          alt="WWCD"
          className="w-[44px]"
        />
      )}

      {/* PLACE POINTS */}
      <div className="w-[80px] text-black font-[AGENCYB] text-[38px] text-center">
        {team.placePoints}
      </div>

      {/* KILLS */}
      <div className="w-[80px] text-black font-[AGENCYB] text-[38px] text-center">
        {team.players.reduce((s, p) => s + (p.killNum || 0), 0)}
      </div>

      {/* TOTAL */}
      <div className="w-[80px] text-black font-[AGENCYB] text-[38px] text-center">
        {team.placePoints + team.players.reduce((s, p) => s + (p.killNum || 0), 0)}
      </div>
    </motion.div>
  );
})}

    {/* Container for teams #5+ */}
    
<div className="absolute left-[1059px] top-[325px] w-[715px]">
  <div className='w-[715px] h-[100px]  mt-[-90px] text-white font-[AGENCYB] text-[30px] flex items-center justify-end pb-[40px]'>
<div className='ml-[20px]'>PLACE PTS</div>
<div className='ml-[20px]'>ELIMS</div>
<div className='ml-[20px]'>TOTAL</div>

  </div>
  {restTeams.map((team, index) => {
  const rankNumber = page === 'first' ? 5 + index : page === 'second' ? 14 + index : 23 + index;

  return (
    <motion.div
      key={team._id}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.2, duration: 1 }} // stagger effect
      className="left-0 w-full h-[60px] flex items-center border border-black relative mb-[10px] top-[-50px]"
      style={{ background: 'linear-gradient(to bottom right, #ffffff, #e0e0e0)' }}
    >
      {/* LEFT COLOR STRIP WITH RANK */}
      <div
        className="w-[59px] h-full flex items-center justify-center text-white font-[AGENCYB] text-[38px]"
 style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#212121'
}, #000)`
  }}       >
        {rankNumber}
      </div>

      {/* TEAM LOGO */}
      <div className="w-[50px] h-[50px] ml-4 flex-shrink-0">
        <img src={team.teamLogo || "/def_logo.png"} alt={team.teamName} className="w-full h-full object-contain" />
      </div>
 
      {/* TEAM NAME */}
      <div className="flex-1 text-black font-[AGENCYB] text-[38px] ml-4">
        {team.teamName}
      </div>
{/* WWCD Icon */}
      {team.placePoints === 10 && (
        <img src="/theme4assets/chicken.png" alt="WWCD" className="w-[36px] mr-[80px]" />
      )}
      {/* PLACE POINTS */}
      <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center relative left-[-50px]">
        {team.placePoints}
      </div>

      {/* KILLS */}
      <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center relative left-[-20px]">
        {team.players.reduce((s, p) => s + (p.killNum || 0), 0)}
      </div>

      {/* TOTAL */}
      <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center">
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
