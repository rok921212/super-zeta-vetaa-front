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
      players: team.players.filter(p => p.picUrl && p.picUrl.trim() !== '' && p.picUrl !== '/def_char.png'),
    }))
    .filter(team => team.players.length > 0);

  if (validTeams.length < 2) return;

  // Collect all valid players with their teams
  const allPlayers: Array<{ player: Player; team: Team }> = [];
  validTeams.forEach(team => {
    team.players.forEach(player => {
      allPlayers.push({ player, team });
    });
  });

  // Shuffle players using Fisher-Yates algorithm
  for (let i = allPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPlayers[i], allPlayers[j]] = [allPlayers[j], allPlayers[i]];
  }

  // Create pairs with alternating positions
  const pairs: Array<{ left: { player: Player; team: Team }, right: { player: Player; team: Team } }> = [];
  const playerPositionHistory: Map<string, 'left' | 'right'> = new Map();

  for (let i = 0; i < allPlayers.length - 1; i += 2) {
    const player1 = allPlayers[i];
    const player2 = allPlayers[i + 1];
    
    if (!player2) break;

    const player1PrevPos = playerPositionHistory.get(player1.player.uId);
    const player2PrevPos = playerPositionHistory.get(player2.player.uId);

    let leftPlayer = player1;
    let rightPlayer = player2;

    // Alternate positions based on history
    if (player1PrevPos === 'left') {
      // Player 1 was on left before, put on right
      leftPlayer = player2;
      rightPlayer = player1;
    } else if (player1PrevPos === 'right') {
      // Player 1 was on right before, put on left
      leftPlayer = player1;
      rightPlayer = player2;
    } else if (player2PrevPos === 'left') {
      // Player 2 was on left before, put on right
      leftPlayer = player1;
      rightPlayer = player2;
    } else if (player2PrevPos === 'right') {
      // Player 2 was on right before, put on left
      leftPlayer = player2;
      rightPlayer = player1;
    }

    // Record positions
    playerPositionHistory.set(leftPlayer.player.uId, 'left');
    playerPositionHistory.set(rightPlayer.player.uId, 'right');

    pairs.push({
      left: leftPlayer,
      right: rightPlayer,
    });
  }

  // Shuffle the pairs order as well
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }

  setPlayerPairs(pairs);
  setCurrentPairIndex(0);
}, [matchData]);

  const handleImageError = (playerId: string) => {
    setImageErrors(prev => ({ ...prev, [playerId]: true }));
  };

  const getPlayerImage = (player: Player): string | undefined => {
    if (imageErrors[player.uId]) {
      return undefined;
    }
    // Skip default player image
    if (!player.picUrl || player.picUrl === '/def_char.png') {
      return undefined;
    }
    return player.picUrl;
  };

  // Filter out pairs where either player has a failed image
  const validPairs = playerPairs.filter(pair => 
    getPlayerImage(pair.left.player) && getPlayerImage(pair.right.player)
  );

  // Auto-cycle through pairs every 5 seconds
  useEffect(() => {
    if (validPairs.length === 0) return;

    const interval = setInterval(() => {
      setCurrentPairIndex(prev => (prev + 1) % validPairs.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [validPairs]);

  // Auto-advance if current pair is no longer valid
  useEffect(() => {
    if (validPairs.length === 0) return;
    
    const currentPair = playerPairs[currentPairIndex];
    const leftImage = currentPair ? getPlayerImage(currentPair.left.player) : undefined;
    const rightImage = currentPair ? getPlayerImage(currentPair.right.player) : undefined;
    
    if (currentPair && (!leftImage || !rightImage)) {
      // Find next valid pair index
      const nextValidIndex = playerPairs.findIndex((pair, idx) => 
        idx > currentPairIndex && getPlayerImage(pair.left.player) && getPlayerImage(pair.right.player)
      );
      setCurrentPairIndex(nextValidIndex >= 0 ? nextValidIndex : 0);
    }
  }, [imageErrors, playerPairs, currentPairIndex]);

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

  if (validPairs.length === 0) {
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

  const currentPair = validPairs[currentPairIndex % validPairs.length];

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
            className='absolute right-[200px] top-[100px]'
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
        
        {/* Player Info Overlay */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(to top, rgba(0, 0, 0, 1), transparent)',
          padding: '60px',
          color: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          </div>
        </div>
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
            className='absolute left-[200px] top-[100px]'
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
        
        {/* Player Info Overlay */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
          padding: '60px',
          color: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', justifyContent: 'flex-end' }}>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerSwitch;