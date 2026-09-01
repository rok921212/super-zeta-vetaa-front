import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { pickStandingTeam } from '../../shared/hooks/officialStandings';
// NOTE: api import and the overall-data REST fetch (with loading/error
// state) removed. PublicThemeRenderer already does the one REST fetch for
// the whole page and passes `overallData` straight down as a prop for the
// '1stRunnerUp' view — no more self-fetching here.

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

interface secondPlacesProps {
  tournament: Tournament;
  round?: Round | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matchDatas?: MatchData[];
}

const FirstRunnerUp: React.FC<secondPlacesProps> = ({ tournament, round, matchData, overallData, matchDatas = [] }) => {
  const [playerPhotos, setPlayerPhotos] = useState<Record<string, string>>({});

  // Shared standings pick (Total Score primary). row 1 = 1st runner-up;
  // carries wwcd / totalKills / placePoints / total / leadOverNext plus
  // the re-attached roster.
  const secondPlace = useMemo(
    () => pickStandingTeam(matchDatas as any, overallData as any, 1),
    [overallData, matchDatas]
  );

  // Extract player photos from match data
  useEffect(() => {
    console.log('FirstRunnerUp: Photo extraction useEffect triggered');
    console.log('FirstRunnerUp: matchData available:', !!matchData);
    console.log('FirstRunnerUp: matchData teams count:', matchData?.teams?.length || 0);
    
    if (!matchData) {
      console.log('FirstRunnerUp: No matchData available - this is the issue!');
      setPlayerPhotos({});
      return;
    }

    try {
      console.log('FirstRunnerUp: Processing matchData for player photos');
      
      // Create a map of player uId to their photo URL from match data
      const photosMap: Record<string, string> = {};
      
      if (!matchData.teams || matchData.teams.length === 0) {
        console.log('FirstRunnerUp: No teams found in matchData');
        setPlayerPhotos({});
        return;
      }
      
      let totalPlayersProcessed = 0;
      let playersWithValidData = 0;
      
      matchData.teams.forEach((team, teamIndex) => {
        console.log(`FirstRunnerUp: Processing team ${teamIndex}:`, {
          teamId: team.teamId,
          teamName: team.teamName,
          playersCount: team.players?.length || 0
        });
        
        if (!team.players || team.players.length === 0) {
          console.log(`FirstRunnerUp: No players found in team ${team.teamId}`);
          return;
        }
        
        team.players.forEach((player, playerIndex) => {
          totalPlayersProcessed++;
          
          // Debug player data structure
          if (playerIndex < 2) { // Only log first 2 players per team to avoid spam
            console.log(`FirstRunnerUp: Player ${playerIndex} data:`, {
              _id: player._id,
              uId: player.uId,
              picUrl: player.picUrl,
              playerName: player.playerName,
              hasPicUrl: !!player.picUrl,
              hasUId: !!player.uId
            });
          }
          
          // Check for valid photo data
          if (player.picUrl && player.uId) {
            photosMap[player.uId] = player.picUrl;
            playersWithValidData++;
            console.log(`FirstRunnerUp: Added photo mapping - uId: ${player.uId} -> picUrl: ${player.picUrl}`);
          } else {
            console.log(`FirstRunnerUp: Skipping player ${player._id} - missing data:`, {
              picUrl: player.picUrl || 'MISSING',
              uId: player.uId || 'MISSING'
            });
          }
        });
      });
      
      console.log('FirstRunnerUp: Summary:', {
        totalPlayersProcessed,
        playersWithValidData,
        photosMapEntries: Object.keys(photosMap).length,
        photosMap
      });
      
      setPlayerPhotos(photosMap);
    } catch (err) {
      console.error('Failed to extract player photos from match data:', err);
      setPlayerPhotos({});
    }
  }, [matchData]);



  if (!overallData || !secondPlace) {
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
  
  <div className='text-white text-[130px] font-[tungsten] absolute top-[-10px]'>1ST RUNNER UP - {tournament.tournamentName}</div>
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
  <div className='text-white text-[150px] font-[tungsten] absolute top-[780px] z-30 left-[800px] skew-x-[-6deg] rotate-[-2deg] opacity-100 '>
        {secondPlace.teamName}
        </div>
        <div className='w-[300px] h-[300px] bg-[#000000ae] absolute top-[780px] z-40 left-[1640px] border-white border-[2px]'>
  <img src={secondPlace.teamLogo} alt="" className='object-contain w-full h-f' />
        </div>
        <div className='text-white text-[60px] absolute top-[980px] z-50 left-[700px] font-[agencyb] skew-x-[-10deg] rotate-[-2deg]'>
        <div> KILLS : {secondPlace.totalKills}</div>
       
        </div>
         <div className='text-white text-[60px] absolute top-[980px] z-50 left-[1000px] font-[agencyb] skew-x-[-10deg] rotate-[-2deg]'>
        <div> PLACE : {secondPlace.placePoints}</div>
       </div>
        <div className='text-white text-[60px] absolute top-[980px] z-50 left-[1280px] font-[agencyb] skew-x-[-10deg] rotate-[-2deg]'>
        <div> TOTAL : {secondPlace.total}</div>
       </div>
        </div>
      {/* 🔥 FLICKERING secondPlaceS TITLE */}
      <div className="absolute top-[40px] left-[50%] translate-x-[-50%] pointer-events-none">
  
        {/* Glow */}
        <motion.div
          className="absolute text-[820px] font-[payBack] tracking-widest blur-[10px]"
          style={{ color: tournament.primaryColor }}
          animate={{ opacity: [0.3, 1, 0.4, 0.9, 0.2] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          RUNNER UP
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
          RUNNER UP
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
          1ST RUNNER UP
        </motion.div>
      </div>
  
      {/* LEFT SIDE PLAYERS */}
      <div className="absolute left-0 top-[180px] flex w-full">
        {secondPlace.players.slice(0, 4).map((player) => (
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

export default FirstRunnerUp;
