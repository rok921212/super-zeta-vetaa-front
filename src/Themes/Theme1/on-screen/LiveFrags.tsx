import React, { useEffect, useState, useMemo } from 'react';
// NOTE: SocketManager import removed, along with the localMatchData mirror
// state and six manual socket event handlers. PublicThemeRenderer owns the
// single socket connection, listens to 'bulkUpdate', and passes the
// freshly-merged matchData down as a prop on every change — this component
// now reacts to that prop directly.

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
  
  // Live stats fields
  health: number;
  healthMax: number;
  liveState: number; // 0,1,2,3 = alive, 4 = knocked, 5 = dead
  damage:string
}

interface Team {
  _id: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface LiveFragsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const LiveFrags: React.FC<LiveFragsProps> = ({ tournament, round, match, matchData }) => {
  // Purely derived from the matchData prop now — no local mirror state,
  // no socket subscription.
  const localMatchData = matchData || null;
  const [showKills, setShowKills] = useState<boolean>(true);

  // Toggle between kills and damage every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setShowKills(prev => !prev);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Get top 5 players by kills - recalculated whenever matchData changes
  const topPlayers = useMemo(() => {
    if (!localMatchData) return [];

    const allPlayers = localMatchData.teams.flatMap(team => {
      const isTeamAllDead = team.players.every(player => player.bHasDied || player.liveState === 5);
      return team.players.map(player => ({ ...player, teamTag: team.teamTag, teamLogo: team.teamLogo, isTeamAllDead }));
    });

    return allPlayers
      .sort((a, b) => b.killNum - a.killNum)
      .slice(0, 5);
  }, [localMatchData]);

  if (!localMatchData) {
    return (
      <div className="w-[1920px] h-[1080px] bg-black flex items-center justify-center">
        <text className="text-white text-2xl">No match data</text>
      </div>
    );
  }


  return (
    <div className="w-[1920px] h-[1080px] bg-transparent flex justify-end items-center relative ">

     
      {/* Top 5 Players Display */}
      <div className="w-[500px] h-[200px] ">
     
<div className='text-black text-[1.5rem] font-[Righteous] bg-white  w-[250px] p-[2px] mb-[10px] relative left-[250px] text-center'>
  MATCH FRAGGERS
</div>
        <div className="space-y-4 w-[500px] ]">
          {topPlayers.map((player, index) => {
            // Calculate health percentage based on API enable
            let healthPercentage = 100;
            if (round?.apiEnable) {
              healthPercentage = player.healthMax > 0 ? Math.max(0, Math.min(100, (player.health / player.healthMax) * 100)) : 0;
            } else {
              healthPercentage = player.bHasDied ? 0 : 100;
            }

            // Check player status
            const isAlive = [0, 1, 2, 3].includes(player.liveState);
            const isKnocked = player.liveState === 4;
            const isDead = player.bHasDied || player.liveState === 5;

            // Determine bar color and status
            let barColor = 'bg-gray-500';
            let statusText = 'Dead';

            if (isDead) {
              barColor = 'bg-gray-500';
              statusText = 'Dead';
            } else if (isKnocked) {
              barColor = 'bg-red-500';
              statusText = 'Knocked';
            } else if (isAlive) {
              if (healthPercentage > 75) barColor = 'bg-green-500';
              else if (healthPercentage > 50) barColor = 'bg-yellow-500';
              else if (healthPercentage > 25) barColor = 'bg-orange-500';
              else barColor = 'bg-red-500';
              statusText = `${Math.round(healthPercentage)}%`;
            }

            return (
              <div
                key={player._id}
                className="  flex items-center "
                style={{
                  background: `linear-gradient(135deg, ${tournament.primaryColor || '#333'}, ${tournament.secondaryColor || '#666'})`,
                  opacity: player.isTeamAllDead ? 0.5 : 1
                }}
              >
                {/* Rank */}
                <div className="text-yellow-400 text-2xl font-bold  mr-[-10px] pl-[10px] font-[Righteous]">
                  #{index + 1}
                </div>

                {/* Player Avatar */}
                <div className="w-[100px] h-[100px] ">
                  <img
                    src={player.picUrl || '/def_char.png'}
                    alt={player.playerName}
                    className="w-full h-full "
                  />
                </div>

                {/* Player Info */}
                <div className="flex-1">
                  <div className="text-white text-[1.5rem]  font-bold font-[Righteous]">{player.playerName}</div>
                  <div className="text-white text-[1rem] font-[Righteous] font-bold">{player.teamTag}</div>

                  {/* Health Bar */}
                  <div className="w-[150px] bg-gray-700 rounded-full h-4 mt-2">
                    <div
                      className={`h-4 rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${isDead ? 0 : isKnocked ? 100 : healthPercentage}%` }}
                    />
                  </div>

                  
                </div>
<div className='w-[80px] absolute left-[1710px]'>

<img src={player.teamLogo} alt="" className='w-[100%] h-[100%] object-contain' />
</div>
                {/* Kills/Damage Toggle */}
                <div className='flex text-white text-2xl font-bold mr-4 flex-col font-[Righteous]'>
                  <div className='absolute left-[1860px] text-yellow-400 '>
                    {Math.max(0, (showKills ? player.killNum : player.damage) || 0)}
                  </div>
                  <div className='relative top-[25px]'>
                    {showKills ? 'KILLS' : 'DAMAGE'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LiveFrags;
