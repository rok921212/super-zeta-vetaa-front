import React, { useMemo } from 'react';

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
  day?: string;
}

interface Player {
  _id: string;
  uId: string;
  playerName: string;
  killNum?: number;
  damage?: number | string;
  assists?: number;
  knockouts?: number;
  picUrl?: string;
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
  userId: string;
  teams: Team[];
  createdAt: string;
}

interface EventMvpProps {
  tournament: Tournament;
  round?: Round | null;
  overallData?: OverallData | null;
  // Not used by this component's current MVP-derivation logic (which only
  // needs overallData), but PublicThemeRenderer passes these for the
  // 'EventMvp' view — accepted here for interface completeness.
  matches?: any[];
  matchDatas?: any[];
}

const EventMvp: React.FC<EventMvpProps> = ({ tournament, round, overallData }) => {
  // Get top 5 players by kills, then damage, then assists from overall data
  const topPlayers = useMemo(() => {
    if (!overallData) return [];

    // First, aggregate players by uId across all teams to handle duplicates
    const playerMap = new Map<string, any>();

    overallData.teams.forEach(team => {
      team.players.forEach(player => {
        const key = player.uId || player._id; // Use uId if available, fallback to _id
        if (!playerMap.has(key)) {
          playerMap.set(key, {
            ...player,
            killNum: Number(player.killNum || 0),
            numericDamage: Number((player as any).damage ?? 0) || 0,
            assists: Number((player as any).assists ?? 0) || 0,
            knockouts: Number((player as any).knockouts ?? 0) || 0,
            teamTag: team.teamTag,
            teamName: team.teamName,
            teamLogo: team.teamLogo,
            teamPoints: team.placePoints,
            teamTotalKills: 0, // Will calculate after aggregation
            matchesPlayed: team.matchesPlayed || 0,
            kdRatio: '0.00'
          });
        } else {
          // Sum stats for same uId
          const existing = playerMap.get(key);
          existing.killNum += Number(player.killNum || 0);
          existing.numericDamage += Number((player as any).damage ?? 0) || 0;
          existing.assists += Number((player as any).assists ?? 0) || 0;
          existing.knockouts += Number((player as any).knockouts ?? 0) || 0;
          // Update display fields if present
          if (player.playerName) existing.playerName = player.playerName;
          if (player.picUrl) existing.picUrl = player.picUrl;
          // Keep the team with highest placePoints
          if (team.placePoints > existing.teamPoints) {
            existing.teamTag = team.teamTag;
            existing.teamName = team.teamName;
            existing.teamLogo = team.teamLogo;
            existing.teamPoints = team.placePoints;
          }
          existing.matchesPlayed = Math.max(existing.matchesPlayed, team.matchesPlayed || 0);
        }
      });
    });

    // Calculate teamTotalKills and kdRatio for each player
    const allPlayers = Array.from(playerMap.values()).map(player => {
      // For simplicity, teamTotalKills is the sum of kills in the player's team
      const playerTeam = overallData.teams.find(t => t.teamTag === player.teamTag);
      const teamTotalKills = playerTeam ? playerTeam.players.reduce((sum, p) => sum + (p.killNum || 0), 0) : 0;
      player.teamTotalKills = teamTotalKills;
      player.kdRatio = player.matchesPlayed ? (player.killNum / player.matchesPlayed).toFixed(2) : '0.00';
      return player;
    });

    const sorted = allPlayers.sort((a: any, b: any) => {
      if (b.killNum !== a.killNum) return b.killNum - a.killNum; // priority 1: kills
      if (b.numericDamage !== a.numericDamage) return b.numericDamage - a.numericDamage; // priority 2: damage
      if (b.assists !== a.assists) return b.assists - a.assists; // priority 3: assists
      return 0;
    });

    return sorted.slice(0, 5);
  }, [overallData]);

  const mvp = topPlayers[0];

  if (!overallData || !mvp) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No overall data available</div>
      </div>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px] relative  text-white ">
      {/* Header */}
      <div className="absolute top-[80px] left-[80px] flex">
        <div 
          style={{
            backgroundImage: `linear-gradient(to left, transparent, ${tournament.primaryColor})`,
            clipPath: "polygon(30px 0%, 100% 0%, 100% 100%, 30px 100%, 0% 50%)",
          }}
          className="text-[2rem] font-[Righteous] pl-[40px] flex items-center h-[70px] mt-[10px] ml-[50px]">
          <span className='text-yellow-300 pr-[10px]'> EVENT MVP</span> OF {tournament.tournamentName} -  {round?.roundName}
        </div>
      </div>

      {/* Center banner with MVP name and team logo */}
      <div className='absolute top-[750px] left-[70px] flex justify-center w-full h-full z-10'>
        <div
          style={{
            background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
          }}
          className='bg-white w-[700px] h-[120px] skew-x-[20deg]'>
          <div className='bg-white w-[25%] h-full'></div>
        </div>

        <div className='font-bebas font-[300] text-[3rem] absolute top-[-10px] left-[640px] w-[35%]'>
          <img src={mvp.teamLogo} alt={mvp.teamTag} className='w-[20%] h-[20%] object-contain'/>
        </div>
        <div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[840px] text-white'>
          {mvp.playerName}
        </div>
      </div>

      {/* MVP Player Image in Center */}
      <div className="flex justify-center items-center relative top-[150px]">
        <img
          src={mvp.picUrl || 'https://res.cloudinary.com/dqckienxj/image/upload/v1735718663/defult_chach_apsjhc_jydubc.png'}
          alt={mvp.playerName}
          className="h-[900px] object-contain"
        />
      </div>

      {/* Bottom stat bars - 4 boxes */}
      <div className="w-full h-full">
        <div
          style={{
            background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
          }}
          className="w-full h-[20%] absolute top-[900px] z-10">

          <div className='absolute top-[30px] left-[70px]'>
            <div className='bg-white w-[400px] h-[100px] skew-x-[20deg]'>
              <div className='bg-black w-[40%] h-full'></div>
            </div>
            <div className='font-bebas font-[300] text-[3rem] absolute top-[20px] left-[30px]'>KILLS</div>
            <div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[200px] text-black'>{mvp.killNum || 0}</div>
          </div>

          <div className='absolute top-[30px] left-[530px]'>
            <div className='bg-white w-[400px] h-[100px] skew-x-[20deg]'>
              <div className='bg-black w-[40%] h-full'></div>
            </div>
            <div className='font-bebas font-[300] text-[3rem] absolute top-[20px] left-[20px]'>DAMAGE</div>
            <div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[200px] text-black'>{(mvp as any).numericDamage || 0}</div>
          </div>

          <div className='absolute top-[30px] left-[1000px]'>
            <div className='bg-white w-[400px] h-[100px] skew-x-[20deg]'>
              <div className='bg-black w-[40%] h-full'></div>
            </div>
            <div className='font-bebas font-[300] text-[2.5rem] absolute top-[25px] left-[10px]'>KNOCKOUTS</div>
            <div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[200px] text-black'>{(mvp as any).knockouts || 0}</div>
          </div>

          <div className='absolute top-[30px] left-[1450px]'>
            <div className='bg-white w-[400px] h-[100px] skew-x-[20deg]'>
              <div className='bg-black w-[40%] h-full'></div>
            </div>
            <div className='font-bebas font-[300] text-[3rem] absolute top-[20px] left-[20px]'>ASSISTS</div>
            <div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[200px] text-black'>{mvp.assists || 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventMvp;
