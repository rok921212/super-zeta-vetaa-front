import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Player {
  uId: string;
  playerName: string;
  picUrl?: string;
  killNum?: number;
}

interface Team {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  players: Player[];
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
  teams: Team[];
}

interface PlayerSwitchProps {
  match: Match | null;
  matchData: MatchData | null;
  loading: boolean;
  error: string | null;
}

const PlayerSwitch: React.FC<PlayerSwitchProps> = ({ match, matchData, loading, error }) => {
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const [playerPairs, setPlayerPairs] = useState<Array<{ left: { player: Player; team: Team }, right: { player: Player; team: Team } }>>([]);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

 useEffect(() => {
  if (!matchData?.teams) return;

  const validTeams = matchData.teams
  .map(team => ({
    ...team,
    players: team.players.filter((p) => {
      const img = p.picUrl?.toLowerCase().trim() || "";

      return (
        img &&
        !img.includes("def_char") &&
        !img.includes("default") &&
        !imageErrors[p.uId]
      );
    }),
  }))
  .filter(team => team.players.length > 0);

  if (validTeams.length < 2) return;

  const pairs = [];
  const teamCount = validTeams.length;

  let teamIndex = 0;
  let playerIndex = 0;

  while (true) {
    const leftTeam = validTeams[teamIndex % teamCount];
    const rightTeam = validTeams[(teamIndex + 1) % teamCount];

    const leftPlayer = leftTeam.players[playerIndex % leftTeam.players.length];
    const rightPlayer = rightTeam.players[playerIndex % rightTeam.players.length];

    if (!leftPlayer || !rightPlayer) break;

    pairs.push({
      left: { player: leftPlayer, team: leftTeam },
      right: { player: rightPlayer, team: rightTeam },
    });

    teamIndex++;
    if (teamIndex % teamCount === 0) playerIndex++;

    if (playerIndex > 50) break; // safety cap
  }

  setPlayerPairs(pairs);
  setCurrentPairIndex(0);
}, [matchData, imageErrors]);

  // Auto-cycle through pairs every 5 seconds
  useEffect(() => {
    if (playerPairs.length === 0) return;

    const interval = setInterval(() => {
      setCurrentPairIndex(prev => (prev + 1) % playerPairs.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [playerPairs]);

const handleImageError = (playerId: string) => {
  setImageErrors(prev => ({
    ...prev,
    [playerId]: true,
  }));
};

 const getPlayerImage = (player: Player) => player.picUrl!;

  if (loading) {
    return (
      <div style={{
        width: '1920px',
        height: '1080px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        color: '#fff',
        background: '#000'
      }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        width: '1920px',
        height: '1080px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        color: '#fff',
        background: '#000'
      }}>
        {error}
      </div>
    );
  }

  if (playerPairs.length === 0) {
    return (
      <div style={{
        width: '1920px',
        height: '1080px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        color: '#fff',
      }}>
        No player images available
      </div>
    );
  }

  const currentPair = playerPairs[currentPairIndex];

  return (
    <div 
      
      style={{
        width: '1920px',
        height: '1080px',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Left Player */}
      <div style={{
        width: '50%',
        height: '100%',
        position: 'relative',
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`left-${currentPairIndex}`}
            initial={{ y: 1080, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 1080, opacity: 0 }}
            transition={{
              duration: 0.8,
              ease: [0.6, 0.05, 0.01, 0.9]
            }}
     className='absolute right-[-260px] top-[100px]  flex justify-center items-center'
            style={{ 
              width: '900px', 
              height: '100%', 
            }}
          >
            <img 
              src={getPlayerImage(currentPair.left.player)} 
              alt={currentPair.left.player.playerName}
              onError={() => handleImageError(currentPair.left.player.uId)}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain' 
              }} 
            />
          </motion.div>
        </AnimatePresence>
        
        
      </div>

      {/* Right Player */}
      <div style={{
        width: '50%',
        height: '100%',
        position: 'relative'
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`right-${currentPairIndex}`}
            initial={{ y: 1080, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 1080, opacity: 0 }}
            transition={{
              duration: 0.8,
              ease: [0.6, 0.05, 0.01, 0.9]
            }}
            className='absolute left-[-100px] top-[100px]  flex justify-center items-center'
            style={{ 
              width: '900px', 
              height: '100%', 
            }}
          >
            <img 
              src={getPlayerImage(currentPair.right.player)} 
              alt={currentPair.right.player.playerName}
              onError={() => handleImageError(currentPair.right.player.uId)}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain' 
              }} 
            />
          </motion.div>
        </AnimatePresence>
        
       
      </div>
    </div>
  );
};

export default PlayerSwitch;