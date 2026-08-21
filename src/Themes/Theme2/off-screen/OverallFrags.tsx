import React, { useMemo } from 'react';
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
  day?: string;
}

interface Player {
  _id: string;
  uId: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  health: number;
  healthMax: number;
  liveState: number;
  teamIdfromApi?: string;
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

interface OverallData {
  tournamentId: string;
  roundId: string;
  matchId?: string;
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

interface OverallFragsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matches?: Match[];
  matchDatas?: MatchData[];
}

const OverallFrags: React.FC<OverallFragsProps> = ({ 
  tournament, 
  round, 
  match,
  overallData,
}) => {
  const formatSecondsToMMSS = (seconds: number = 0) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get top 5 players by kills from overallData (already aggregated by backend)
  const topPlayers = useMemo(() => {
    if (!overallData || !overallData.teams || overallData.teams.length === 0) return [];

    const allPlayers: any[] = [];

    overallData.teams.forEach(team => {
      team.players.forEach(player => {
        allPlayers.push({
          ...player,
          teamName: team.teamName,
          teamTag: team.teamTag,
          teamLogo: team.teamLogo,
          teamPoints: team.placePoints,
          numericDamage: Number(player.damage || 0),
          avgSurvivalSeconds: player.survivalTime || 0,
        });
      });
    });

    // Sort by kills, then by damage, then by survival time
    const sorted = allPlayers.sort((a, b) => {
      // 1. Sort by kills
      if (b.killNum !== a.killNum) return b.killNum - a.killNum;

      // 2. Then by damage
      const aDamage = Number(a.damage || 0);
      const bDamage = Number(b.damage || 0);
      if (bDamage !== aDamage) return bDamage - aDamage;

      // 3. Then by survival time
      return (b.survivalTime || 0) - (a.survivalTime || 0);
    });

    return sorted.slice(0, 5);
  }, [overallData]);

  if (!overallData) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No overall data available</div>
      </div>
    );
  }

  return (
    <div className='w-[1920px] h-[1080px] '>  
      <div className=' w-[800px] h-[300px] absolute left-[100px] top-[50px]'>
        <div
         
          className="px-6 py-2 w-[900px] font-[Awaking] text-[160px]  absolute top-[-20px] left-[-50px] font-[700] bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text drop-shadow-[0px_7px_10px_rgba(0,0,0,0.3)]  ">
          ROAD TO MVP
           
          <div 
            style={{
              backgroundImage: `linear-gradient(135deg, ${
                tournament.primaryColor || '#000'
              }, #000)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
            className='w-[700px] h-[100px]  mt-[-50px] text-[50px] text-center font-[AGENCYB]'>
            {round?.roundName} - MATCH {match?.matchNo || 'N/A'} 
          </div>
        </div>
      </div>
      {topPlayers[0] && (
        <div className='w-[600px] h-[650px]  absolute top-[320px] left-[110px]'>
          <div className='relative top-[40px]'>
            <div className=' w-[250px] h-[90px] absolute top-[100px] left-[350px] font-[AGENCYB] text-white'>
              <div 
                style={{
                  backgroundImage: `linear-gradient(135deg, ${
                    tournament.primaryColor || '#000'
                  }, #000)`
                }}
                className='bg-black w-[100%] h-[50%] text-[30px] text-center flex items-center justify-center'>
                {topPlayers[0].killNum}
              </div>
              <div className='bg-black w-[100%] h-[50%] text-[30px] text-center flex items-center justify-center '>ELIMINATION</div>
            </div>
            <div className=' w-[250px] h-[90px] absolute top-[210px] left-[350px]'>
              <div 
                style={{
                  backgroundImage: `linear-gradient(135deg, ${
                    tournament.primaryColor || '#000'
                  }, #000)`
                }}
                className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]' >{topPlayers[0].numericDamage.toFixed(2)}
              </div>
              <div className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>AVG DAMAGE</div>
            </div>
            <div className=' w-[250px] h-[90px] absolute top-[320px] left-[350px]'>
              <div
                style={{
                  backgroundImage: `linear-gradient(135deg, ${
                    tournament.primaryColor || '#000'
                  }, #000)`
                }}
                className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>{formatSecondsToMMSS(topPlayers[0].avgSurvivalSeconds)}</div>
              <div className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>AVG SURVIVAL</div>
            </div>
          </div>
          <div 
            style={{
              backgroundImage: `linear-gradient(135deg, ${
                tournament.secondaryColor || '#000'
              }, #000)`
            }}
            className='bg-white w-[120px] h-[120px] absolute top-[530px] left-[485px] font-[AGENCYB] text-white text-[100px] flex justify-center items-center '>
            #1
          </div>
          <div
            style={{
              backgroundImage: `linear-gradient(135deg, ${
                tournament.primaryColor || '#000'
              }, #000)`
            }}
            className='w-[350px] h-[500px] overflow-hidden relative '
          >
            <div className='bg-white w-[100px] h-[100px] absolute top-[400px] left-[0px] z-10'>
              <img src={topPlayers[0].teamLogo} alt="" className='w-[100%] h-[100%]'/>
            </div>
            <img
              src={topPlayers[0].picUrl || "/def_char.png"}
              alt=""
              className='w-full h-full object-cover scale-125 translate-y-[30px] z-0'
            />
          </div>
          <div className='bg-black w-[475px] h-[80px] text-white font-[AGENCYB] text-[50px] flex items-center justify-center'>
            {topPlayers[0].playerName}
          </div>
          <div 
            style={{
              backgroundImage: `linear-gradient(135deg, ${
                tournament.primaryColor || '#000'
              }, #000)`
            }}
            className='bg-black w-[475px] h-[80px] text-white font-[AGENCYB] text-[40px] text-center flex items-center justify-center'>
            {topPlayers[0].teamName}
          </div>
        </div>
      )}

      <div 
        style={{ scale: 0.64 }}
        className="absolute top-[-100px] left-[600px] grid grid-cols-2 gap-4 ">
        {topPlayers.slice(1, 5).map((player, index) => (
          <SidePlayerCard key={player.uId || player._id} player={player} index={index} tournament={tournament} />
        ))}
      </div>
    </div>
  );
};

const formatSecondsToMMSS = (seconds: number = 0) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const SidePlayerCard = ({
  player,
  index,
  tournament,
}: {
  player: any;
  index: number;
  tournament: Tournament;
}) => {
  return (
    <div>
      <div className='w-[800px] h-[650px]   scale-100'>
        <div className='relative top-[40px] left-[50px]'>
          <div className=' w-[250px] h-[90px] absolute top-[100px] left-[350px] font-[AGENCYB] text-white'>
            <div 
              style={{
                backgroundImage: `linear-gradient(135deg, ${
                  tournament.primaryColor || '#000'
                }, #000)`
              }}
              className='bg-black w-[100%] h-[50%] text-[30px] text-center flex items-center justify-center'>
              {player.killNum}
            </div>
            <div className='bg-black w-[100%] h-[50%] text-[30px] text-center flex items-center justify-center '>ELIMINATION</div>
          </div>
          <div className=' w-[250px] h-[90px] absolute top-[210px] left-[350px]'>
            <div 
              style={{
                backgroundImage: `linear-gradient(135deg, ${
                  tournament.primaryColor || '#000'
                }, #000)`
              }}
              className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]' >{player.numericDamage.toFixed(2)}
            </div>
            <div className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>AVG DAMAGE</div>
          </div>
          <div className=' w-[250px] h-[90px] absolute top-[320px] left-[350px]'>
            <div
              style={{
                backgroundImage: `linear-gradient(135deg, ${
                  tournament.primaryColor || '#000'
                }, #000)`
              }}
              className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>{formatSecondsToMMSS(player.avgSurvivalSeconds)}</div>
            <div className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>AVG SURVIVAL</div>
          </div>
        </div>
        <div 
          style={{
            backgroundImage: `linear-gradient(135deg, ${
              tournament.secondaryColor || '#000'
            }, #000)`
          }}
          className='bg-white w-[120px] h-[120px] absolute top-[530px] left-[485px] font-[AGENCYB] text-white text-[100px] flex justify-center items-center '>
          #{index + 2}
        </div>
        <div
          style={{
            backgroundImage: `linear-gradient(135deg, ${
              tournament.primaryColor || '#000'
            }, #000)`
          }}
          className='w-[350px] h-[500px] overflow-hidden relative '
        >
          <div className='bg-white w-[100px] h-[100px] absolute top-[400px] left-[0px] z-10'>
            <img src={player.teamLogo} alt="" className='w-[100%] h-[100%]'/>
          </div>
          <img
            src={player.picUrl || "/def_char.png"}
            alt=""
            className='w-full h-full object-cover scale-125 translate-y-[30px] z-0'
          />
        </div>
        <div className='bg-black w-[475px] h-[80px] text-white font-[AGENCYB] text-[50px] flex items-center justify-center'>
          {player.playerName}
        </div>
        <div 
          style={{
            backgroundImage: `linear-gradient(135deg, ${
              tournament.primaryColor || '#000'
            }, #000)`
          }}
          className='bg-black w-[475px] h-[80px] text-white font-[AGENCYB] text-[40px] text-center flex items-center justify-center'>
          {player.teamName}
        </div>
      </div>
    </div>
  );
};

export default OverallFrags;
