import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { compareOfficialStandings, getLastMatchPlacePoints } from '../../shared/hooks/officialStandings';
// NOTE: api import and the overall-data REST fetch (with loading/error
// state) removed. PublicThemeRenderer already does the one REST fetch for
// the whole page and passes `overallData` straight down as a prop for the
// 'Champions' view — no more self-fetching here.

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

interface Player {
  _id: string;
  uId: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;
  damage?: string;
  survivalTime?: number;
  assists?: number;

  // Aggregated stats
  health: number;
  healthMax: number;
  liveState: number;
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

interface OverallData {
  tournamentId: string;
  roundId: string;
  userId: string;
  teams: Team[];
  createdAt: string;
}

interface ChampionsProps {
  tournament: Tournament;
  round?: Round | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matchDatas?: MatchData[];
}

const Champions: React.FC<ChampionsProps> = ({ tournament, round, matchData, overallData, matchDatas = [] }) => {
  const [playerPhotos, setPlayerPhotos] = useState<Record<string, string>>({});

  const champion = useMemo(() => {
    if (!overallData) return null;

    const lastMatchPlaceMap = getLastMatchPlacePoints(matchDatas);
    const enriched = overallData.teams.map(team => {
      const totalKills = team.players.reduce((sum, p) => sum + Number(p.killNum || 0), 0);
      const total = Number(team.placePoints || 0) + totalKills;
      const lastMatchPlacePoints = lastMatchPlaceMap.get(team.teamId) || 0;
      return { ...team, total, totalKills, lastMatchPlacePoints } as Team & { total: number; totalKills: number; lastMatchPlacePoints: number };
    });

    enriched.sort((a, b) => compareOfficialStandings(
      { wwcd: a.wwcd || 0, totalPlacePoints: a.placePoints || 0, totalKills: a.totalKills || 0, lastMatchPlacePoints: a.lastMatchPlacePoints || 0 },
      { wwcd: b.wwcd || 0, totalPlacePoints: b.placePoints || 0, totalKills: b.totalKills || 0, lastMatchPlacePoints: b.lastMatchPlacePoints || 0 }
    ));

    if (enriched.length === 0) return null;

    const first = enriched[0];
    const second = enriched[1];
    const leadOverNext = second ? first.total - (second.total as number) : first.total;

    return { ...first, leadOverNext } as (Team & { total: number; totalKills: number; leadOverNext: number });
  }, [overallData]);

  // Extract player photos from match data
  useEffect(() => {
    if (!matchData) {
      console.log('Champions: No matchData available');
      return;
    }

    try {
      console.log('Champions: Processing matchData for player photos', matchData);
      
      // Create a map of player uId to their photo URL from match data
      const photosMap: Record<string, string> = {};
      
      if (!matchData.teams || matchData.teams.length === 0) {
        console.log('Champions: No teams found in matchData');
        setPlayerPhotos({});
        return;
      }
      
      matchData.teams.forEach(team => {
        if (!team.players || team.players.length === 0) {
          console.log(`Champions: No players found in team ${team.teamId}`);
          return;
        }
        
        team.players.forEach(player => {
          if (player.picUrl && player.uId) {
            photosMap[player.uId] = player.picUrl;
            console.log(`Champions: Found photo for player uId ${player.uId}: ${player.picUrl}`);
          } else {
            console.log(`Champions: No picUrl or uId for player ${player._id}`);
          }
        });
      });
      
      console.log('Champions: Player photos map:', photosMap);
      setPlayerPhotos(photosMap);
    } catch (err) {
      console.error('Failed to extract player photos from match data:', err);
      setPlayerPhotos({});
    }
  }, [matchData]);


  

  if (!overallData || !champion) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No overall data available</div>
      </div>
    );
  }

return (
  <div className="w-[1920px] h-[1080px]  text-white relative overflow-hidden font-bebas-neue">

    {/* Background Gradient */}
    <div
      className="absolute inset-0 opacity-30"
    
    />
  <div className="w-full h-[160px] relative overflow-hidden">

<div className='text-white text-[130px] font-[tungsten] absolute top-[-10px]'>CHAMPIONS - {tournament.tournamentName}</div>
  {/* Main gradient */}
  <div
    className="w-full h-full"
    style={{
      background: `linear-gradient(to right, ${tournament.primaryColor}, transparent)`
    }}
  />
  
  {/* Glow streak */}
  <div
    className="absolute top-0 left-0 w-full h-full opacity-20"
    style={{
      background: `linear-gradient(to right, transparent, ${tournament.primaryColor}, transparent)`
    }}
  />

</div>
 
    {/* 🔥 CLIP-PATH MODERN PANEL (FIXED POSITION) */}
    <div className="absolute w-full top-[782px] h-[300px] z-10 overflow-hidden">
      
      <div
        className="w-full h-full"
        style={{
          background: `linear-gradient(135deg, ${tournament.primaryColor} 0%, black 70%)`,
          clipPath: "polygon(0 20%, 100% 0%, 100% 80%, 0% 100%)",
        }}
      />
     
      <div
        className="absolute top-0 left-0 w-full h-full opacity-10"
        style={{
          background: "white",
          clipPath: "polygon(0 0, 40% 0, 20% 100%, 0% 100%)",
        }}
      />

      <div
        className="absolute top-0 right-0 w-[40%] h-full"
        style={{
          background: `linear-gradient(120deg, transparent, ${tournament.primaryColor}, transparent)`,
          opacity: 0.2,
          transform: "skewX(-20deg)",
        }}
      />

      <div
        className="absolute bottom-0 left-0 w-full h-[120px]"
        style={{
          background: "black",
          clipPath: "polygon(0 40%, 100% 0, 100% 100%, 0 100%)",
        }}
      />
    
    </div>
    <div className=''>
<div className='text-white text-[130px] font-[tungsten] absolute top-[800px] z-30 left-[500px] skew-x-[-6deg] rotate-[-2deg] opacity-100 '>
      {champion.teamName}
      </div>
      <div className='w-[300px] h-[300px] bg-[#000000ae] absolute top-[780px] z-40 left-[1640px] border-white border-[2px]'>
<img src={champion.teamLogo} alt="" className='object-contain w-full h-f' />
      </div>
      <div className='text-white text-[60px] absolute top-[980px] z-50 left-[700px] font-[agencyb] skew-x-[-10deg] rotate-[-2deg]'>
      <div> KILLS : {champion.totalKills}</div>
     
      </div>
       <div className='text-white text-[60px] absolute top-[980px] z-50 left-[1000px] font-[agencyb] skew-x-[-10deg] rotate-[-2deg]'>
      <div> PLACE : {champion.placePoints}</div>
     </div>
      <div className='text-white text-[60px] absolute top-[980px] z-50 left-[1280px] font-[agencyb] skew-x-[-10deg] rotate-[-2deg]'>
      <div> TOTAL : {champion.total}</div>
     </div>
      </div>
    {/* 🔥 FLICKERING CHAMPIONS TITLE */}
    <div className="absolute top-[40px] left-[50%] translate-x-[-50%] pointer-events-none">

      {/* Glow */}
      <motion.div
        className="absolute text-[820px] font-[payBack] tracking-widest blur-[10px]"
        style={{ color: tournament.primaryColor }}
        animate={{ opacity: [0.3, 1, 0.4, 0.9, 0.2] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        CHAMPIONS
      </motion.div>

      {/* Main */}
      <motion.div
        className="relative text-[820px] font-[payBack] tracking-widest"
        style={{
          backgroundImage: `linear-gradient(to right, ${tournament.primaryColor}, ${tournament.secondaryColor})`,
          WebkitBackgroundClip: "text",
          color: "transparent",
        }}
        animate={{ opacity: [1, 0.7, 1, 0.85, 1] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      >
        CHAMPIONS
      </motion.div>

      {/* Glitch */}
      <motion.div
        className="absolute text-[120px] font-[payBack] tracking-widest text-white mix-blend-overlay z-10"
        animate={{
          x: [0, -2, 2, -1, 0],
          opacity: [0, 1, 0, 1, 0],
        }}
        transition={{
          duration: 0.4,
          repeat: Infinity,
          repeatDelay: 2,
        }}
      >
        CHAMPIONS
      </motion.div>
    </div>

    {/* LEFT SIDE PLAYERS */}
    <div className="absolute left-0 top-[180px] flex w-full">
      {champion.players.slice(0, 4).map((player) => (
        <motion.div
          key={player._id}
          className="flex items-center w-full relative"
          initial={{ opacity: 0, x: -100 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >

          {/* Player Image */}
          <img
            src={playerPhotos[player.uId] || player.picUrl || '/def_char.avif'}
            className="w-[840px] h-[500px] scale-150 absolute object-contain top-[280px] ml-[40px]"
          />

          {/* Player Info */}
         
        </motion.div>
      ))}
    </div>

   

  </div>
);
};

export default Champions;

