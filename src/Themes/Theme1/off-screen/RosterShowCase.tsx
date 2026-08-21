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
      if (b.total !== a.total) return b.total - a.total;             // 1️⃣ total
      if (b.placePoints !== a.placePoints) return b.placePoints - a.placePoints; // 2️⃣ place points
      if ((b.wwcd || 0) !== (a.wwcd || 0)) return (b.wwcd || 0) - (a.wwcd || 0); // 3️⃣ WWCD
      return (b.totalKills || 0) - (a.totalKills || 0);              // 4️⃣ kills
    });
}, [matchData]);

  // Page toggle: show ranks 2–17 first, then the rest; switch every 10s
  const [page, setPage] = useState<'first' | 'rest'>('first');
  useEffect(() => {
    const interval = setInterval(() => {
      setPage(prev => (prev === 'first' ? 'rest' : 'first'));
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  if (!matchData) {
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial', color: 'white' }}>
        No match data available
      </div>
    );
  }

  const topTeam = sortedTeams[0];
  const remainingTeams = sortedTeams.slice(1);
// Pagination sets
const firstPageTeams = remainingTeams.slice(0, 10);   // ranks 2–11 (10 teams)
const restPageTeams = remainingTeams.slice(10,22);       // ranks 12+
const pageTeams = page === 'first' ? firstPageTeams : restPageTeams;

// Split current page into 2 equal halves
const pageMid = Math.ceil(pageTeams.length / 2);
const leftTeams = pageTeams.slice(0, pageMid);
const rightTeams = pageTeams.slice(pageMid);


  return (
    <div className="w-[1920px] h-[1080px] flex justify-center relative top-[0px] ">
      {/* Tournament and Round Info */}
      <div className="absolute top-[0px] right-[250px] text-white  flex justify-end w-[100%]">
        <div className='text-[6rem] font-bebas relative right-[250px]'>MATCH STANDINGS</div>
         <div
          style={{
            backgroundImage: `linear-gradient(to left, transparent, ${tournament.primaryColor})`,
            clipPath: "polygon(30px 0%, 100% 0%, 100% 100%, 30px 100%, 0% 50%)",
          }}
          className="w-[900px] h-[60px] absolute left-[1090px] top-[120px] text-white font-bebas-neue font-[100] text-[px] tracking-wide"
        >
          <div className="relative  left-[50px] font-[Righteous] text-[2rem] top-[4px]">
           {tournament.tournamentName} | {round ? round.roundName : 'No Round'} | {match ? (match.matchName ? match.matchName : `Match ${match.matchNo || match._matchNo}`) : 'No Match'}
          </div>
        </div>
      </div>

      {/* Top Team Section */}
      {topTeam && (
        <motion.div
          className="w-[1700px] h-[200px] top-[200px] right-0 relative"
          style={{
            background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
          }}
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className='absolute text-[4rem] font-bebas ml-[10px] mt-[50px] text-yellow-300 font-[500]'>#1</div>
          {/* Top team player photos - 4 players */}
          {topTeam.players.slice(0, 4).map((player, index) => (
            <div
              key={player._id}
              className="absolute w-[300px] h-[300px]"
              style={{
                left: `${20 + index * 160}px`,
                top: '25%',
                transform: 'translateY(-50%)',
                zIndex: 1,
              }}
            >
              <img
                src={
                  player.picUrl
                    ? player.picUrl
                    : '/def_char.png'
                }
                alt={player.playerName}
                className="w-full h-full object-cover rounded"
              />
            </div>
          ))}
          
          {/* Top team info */}
          <div className=' w-[100%] h-[50px] top-[250px] z-20 font-[righteous] text-[1.5rem] '>
            <div className='text-white text-center'>
              <div className='absolute flex flex-col items-center  w-[100%]   '>
               <div className='w-[150px] '>
                 <img
                   src={topTeam.teamLogo || '/def_logo.png'}
                   alt={topTeam.teamTag}
                 />
               </div>
              <span className='text-3xl font-[300]'> {topTeam.teamTag}</span>
        </div>
        {/* Team Name */}
<div className="w-[100%] absolute  flex justify-center">
 
  {topTeam.placePoints === 10 && (   // 👈 show only if placePoints is 10
    <img
      src="https://res.cloudinary.com/dqckienxj/image/upload/v1753019880/roast-chicken_oyt00t.png"
      alt="Chicken Icon"
      className="w-[8%] relative left-[180px] top-[30px]"
    />
  )}
</div>

        <div className='font-bebas  w-[100%] justify-end flex  items-center absolute right-[40px] text-[4rem] gap-[50px] top-[30px] font-[500]'>
<div className=''>
          <div className='mb-[-20px] text-yellow-300'>{topTeam.placePoints}</div>
              <div className='text-[3rem] '>PLACE PTS</div>
              </div>
              <div className=''>
          <div className='mb-[-20px] text-yellow-300'>{topTeam.totalKills}</div>
              <div className='text-[3rem]'>KILL PTS</div>
              </div>
              <div className=''>
          <div className='mb-[-20px] text-yellow-300'>{topTeam.total}</div>
              <div className='text-[3rem]'>TOTAL PTS</div>
              </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

  {/* Remaining Teams Section */}
<div className="absolute right-[140px] top-[410px] w-[1650px] " key={page}>
 <div className="grid grid-cols-2 gap-x-4">
  {/* Left Column */}
  <div className="flex flex-col">
   <div className="bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] w-[100%] h-[40px] mb-[10px]">
  <div className="flex items-center text-black font-bold text-[1.5rem]">
    <span className="ml-[20px] w-[80px] text-center">#</span>
    <span className="w-[250px] text-center">TEAM</span>
    <div className="grid grid-cols-3 w-[50%] text-center ml-[60px]">
      <span>KILLS</span>
      <span>PLACE</span>
      <span>TOTAL</span>
    </div>
  </div>
</div>

    {leftTeams.map((team, index) => (
      <motion.div
        key={team._id}
        className="w-full h-[100px] flex items-center text-black font-bold mb-[10px] bg-gradient-to-r from-[#cdcdcd] via-[#fbfbfb] to-[#afafaf]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1, duration: 0.5 }}
      >
        {/* Rank */}
        <div
          className="h-full w-[80px] flex items-center justify-center text-white text-[3rem] font-bebas"
          style={{
            background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
          }}
        >
          {remainingTeams.findIndex(t => t._id === team._id) + 2}
        </div>

        {/* Team Logo */}
        <div className="w-[50px] flex items-center justify-center ml-[15px]">
          <img
            src={team.teamLogo || "/def_logo.png"}
            alt={team.teamTag}
            className="w-[100%]"
          />
        </div>
        

        {/* Team Name + Chicken */}
        <div className="flex-1 ml-4 text-[3rem] flex items-center h-[100%]">
          <div 
          
        style={{
            background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
          }}
          className='w-[250px] h-[100%] items-center flex pl-[10px] font-bebas text-white'>
          {team.teamTag}
            {team.placePoints === 10 && (
            <img
              src="https://res.cloudinary.com/dqckienxj/image/upload/v1753019880/roast-chicken_oyt00t.png"
              alt="Chicken Icon"
              className="w-[50px]  ml-[50px]"
            />
          )}
          </div>
        
        </div>

       {/* Stats */}
<div className="grid grid-cols-3 text-[3rem] font-bebas w-[50%] h-[105%] text-center items-center">
  <span>{team.totalKills}</span>
  <span>{team.placePoints}</span>
  <span>{team.total}</span>
</div>

      </motion.div>
    ))}
  </div>

  {/* Right Column */}
  <div className="flex flex-col">
   <div className="bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] w-[100%] h-[40px] mb-[10px]">
  <div className="flex items-center text-black font-bold text-[1.5rem]">
    <span className="ml-[20px] w-[80px] text-center">#</span>
    <span className="w-[250px] text-center">TEAM</span>
    <div className="grid grid-cols-3 w-[50%] text-center ml-[60px]">
      <span>KILLS</span>
      <span>PLACE</span>
      <span>TOTAL</span>
    </div>
  </div>
</div>

    {rightTeams.map((team, index) => (
      <motion.div
        key={team._id}
        className="w-full h-[100px] flex items-center text-black mb-[10px] font-bold bg-gradient-to-r from-[#cdcdcd] via-[#fbfbfb] to-[#afafaf]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: (pageMid + index) * 0.1, duration: 0.5 }}
      >
        {/* Rank */}
        <div
        className="h-full w-[80px] flex items-center justify-center text-white text-[3rem] font-bebas"
          style={{
            background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
          }}
        >
          {remainingTeams.findIndex(t => t._id === team._id) + 2}
        </div>

        {/* Team Logo */}
         <div className="w-[50px] flex items-center justify-center ml-[15px]">
          <img
            src={team.teamLogo || "/def_logo.png"}
            alt={team.teamTag}
            className="w-[100%]"
          />
        </div>

        {/* Team Name + Chicken */}
          <div className="flex-1 ml-4 text-[3rem] flex items-center h-[100%]">
          <div 
          
        style={{
            background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
          }}
          className='w-[250px] h-[100%] items-center flex pl-[10px] font-bebas text-white'>
          {team.teamTag}
            {team.placePoints === 10 && (
            <img
              src="https://res.cloudinary.com/dqckienxj/image/upload/v1753019880/roast-chicken_oyt00t.png"
              alt="Chicken Icon"
              className="w-[50px]  ml-[50px]"
            />
          )}
          </div>
        
        </div>


      {/* Stats */}
<div className="grid grid-cols-3 text-[3rem] font-bebas w-[50%] h-[105%] text-center items-center">
  <span>{team.totalKills}</span>
  <span>{team.placePoints}</span>
  <span>{team.total}</span>
</div>
      </motion.div>
   
    ))}
  </div>
</div>

</div>



    </div>
  );
};

export default MatchDataComponent;