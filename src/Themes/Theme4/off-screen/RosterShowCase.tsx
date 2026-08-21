import React, { useEffect, useMemo, useState } from 'react';
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
  bHasDied: boolean;
  picUrl?: string;
  health: number;
  healthMax: number;
  liveState: number;
}

interface Team {
  _id: string;
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

const RosterShowCase: React.FC<MatchDataProps> = ({ tournament, round, match, matchData }) => {
  const sortedTeams = useMemo(() => {
  if (!matchData) return [];

  return matchData.teams
    .map(team => {
      const totalKills = team.players.reduce((sum, p) => sum + (p.killNum || 0), 0);
      const total = totalKills + team.placePoints;
      return { ...team, totalKills, total };
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;             // 1️⃣ total
      if (b.placePoints !== a.placePoints) return b.placePoints - a.placePoints; // 2️⃣ place points
      if ((b.wwcd || 0) !== (a.wwcd || 0)) return (b.wwcd || 0) - (a.wwcd || 0); // 3️⃣ WWCD
      return (b.totalKills || 0) - (a.totalKills || 0);              // 4️⃣ kills
    });
}, [matchData]);

  // Page cycling: show 4 teams per page, cycle through all teams
  const [page, setPage] = useState(0);
  const teamsPerPage = 4;
  const totalPages = Math.ceil(sortedTeams.length / teamsPerPage);
  useEffect(() => {
    if (totalPages <= 1) return;
    const interval = setInterval(() => {
      setPage(prev => (prev + 1) % totalPages);
    }, 20000);
    return () => clearInterval(interval);
  }, [totalPages]);

  if (!matchData) {
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial', color: 'white' }}>
        No match data available
      </div>
    );
  }

  const pageTeams = sortedTeams.slice(page * teamsPerPage, (page + 1) * teamsPerPage);


  return (
   <div className='w-[1920px] h-[1080px] flex justify-center'>
    <div className='w-[1500px] h-[200px] absolute top-[60px] left-[200px]'>
      <div 
      
      className='text-[100px] font-[AGENCYB] text-white w-full'>
<span 
 style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
>ROSTER SHOWCASE</span> <div className='absolute top-[20px] left-[700px] text-[65px]'>{round?.roundName}</div>
</div>
    </div>
   <div className='w-[1800px]  h-[850px] absolute top-[200px] flex flex-wrap gap-4 p-4'>
  {pageTeams.map((team, index) => (
   <motion.div
     key={team._id}
     initial={{ y: 100, opacity: 0 }}
     animate={{ y: 0, opacity: 1 }}
     transition={{ delay: index * 0.2, duration: 0.6, ease: "easeOut" }}
     className='w-[400px] h-[300px] bg-white p-2 relative flex flex-col justify-between '
   >
      {/* TEAM HEADER */}
      <div className='flex flex-col justify-center items-center mb-2   '>
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0, duration: 0.6, ease: "easeOut" }}
          className=' w-[250px] absolute top-[10px]'>
        <img src={team.teamLogo || "/def_logo.png"} alt={team.teamTag} className='w-[100%] h-[100%] object-contain' />
        </motion.div>
        <motion.div
         style={{
    backgroundImage: `linear-gradient(135deg, ${
   tournament.primaryColor || '#000'
 }, #000)`
  }}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.6, ease: "easeOut" }}
        className='text-[32px] font-bold top-[255px] absolute w-[100%] h-[15%] flex text-center justify-center text-white font-[AGENCYB] '>{team.teamTag}</motion.div>
      </div>

      {/* PLAYERS */}
      <motion.div className=' justify-between mt-[115px] '>
        {team.players.slice(0, 4).map((player, index) => (
          <motion.div
             style={{
            boxShadow: `0 0 0 2px ${tournament.primaryColor || '#000'}`,

          }}
          key={player._id}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
          className='  items-center text-center bg-white text-black relative top-[180px] w-[400px] left-[-7px] h-[50px]'>
          <div className='w-[40px] absolute h-[40px] '><img src={player.picUrl || "/def_char.png"} alt="" className='w-full h-[100%]' /></div>
            <span className='text-[30px] font-[AGENCYB] '>{player.playerName || ""}</span>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  ))}
</div>

  
   </div>
  );
};

export default RosterShowCase;