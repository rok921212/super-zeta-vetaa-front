import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import api from '../../../login/api.tsx';

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

interface OverallData {
  tournamentId: string;
  roundId: string;
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

interface TopFraggerProps {
  tournament: Tournament;
  round?: Round | null;
}

const formatSecondsToMMSS = (seconds: number = 0) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const TopFragger: React.FC<TopFraggerProps> = ({ tournament, round }) => {
  const [overallData, setOverallData] = useState<OverallData | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchDatas, setMatchDatas] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!round) return;

      try {
        setLoading(true);

        // Initialize empty overall data structure
        const data: OverallData = {
          tournamentId: tournament._id,
          roundId: round._id,
          userId: '',
          teams: [],
          createdAt: new Date().toISOString()
        };

        const matchesUrl = `/public/rounds/${round._id}/matches`;
        const matchesResponse = await api.get(matchesUrl);
        const matchesList: Match[] = matchesResponse.data;
        setMatches(matchesList);

        const matchDataPromises = matchesList.map(match => {
          const url = `/public/matches/${match._id}/matchdata`;
          return api.get(url)
            .then(res => res.data)
            .catch(() => null);
        });

        // Try to get overall data, but don't fail if it doesn't exist
        try {
          const overallUrl = `/public/tournaments/${tournament._id}/rounds/${round._id}/overall`;
          const overallResponse = await api.get(overallUrl);
          Object.assign(data, overallResponse.data);
        } catch (overallError) {
          console.log('Overall data not available, using calculated data from matches');
        }
        const matchDatas: (MatchData | null)[] = await Promise.all(matchDataPromises);
        setMatchDatas(matchDatas.filter(m => m !== null) as MatchData[]);

        const teamMatchesCount = new Map<string, number>();
        matchDatas.forEach(matchData => {
          matchData?.teams.forEach(team => {
            const count = teamMatchesCount.get(team.teamId) || 0;
            teamMatchesCount.set(team.teamId, count + 1);
          });
        });

        // Update teams with matchesPlayed
        const updatedTeams = data.teams.map(team => ({
          ...team,
          matchesPlayed: teamMatchesCount.get(team.teamId) || 0,
        }));

        setOverallData({ ...data, teams: updatedTeams });
      } catch (err) {
        console.error('Error fetching overall data:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    if (tournament._id && round?._id) {
      fetchData();
    }
  }, [tournament._id, round?._id]);

  // Get top players by kills
  const topPlayers = useMemo(() => {
    if (!overallData || matchDatas.length === 0) return [];

    const playerMap = new Map<string, any>();

    matchDatas.forEach(matchData => {
      matchData.teams.forEach(team => {
        team.players.forEach(player => {
          const key = player.uId || player._id;
          if (!playerMap.has(key)) {
            playerMap.set(key, {
              ...player,
              totalKills: Number(player.killNum || 0),
              totalDamage: Number((player as any).damage ?? 0) || 0,
              totalAssists: Number((player as any).assists ?? 0) || 0,
              totalSurvival: player.survivalTime || 0,
              appearances: 1,
              teamTag: team.teamTag,
              teamName: team.teamName,
              teamLogo: team.teamLogo,
              teamPoints: team.placePoints,
              teamTotalKills: 0
            });
          } else {
            const existing = playerMap.get(key);
            existing.totalKills += Number(player.killNum || 0);
            existing.totalDamage += Number((player as any).damage ?? 0) || 0;
            existing.totalAssists += Number((player as any).assists ?? 0) || 0;
            existing.totalSurvival += player.survivalTime || 0;
            existing.appearances += 1;
            if (player.playerName) existing.playerName = player.playerName;
            if (player.picUrl) existing.picUrl = player.picUrl;
            if (team.placePoints > existing.teamPoints) {
              existing.teamName = team.teamName;
              existing.teamTag = team.teamTag;
              existing.teamLogo = team.teamLogo;
              existing.teamPoints = team.placePoints;
            }
          }
        });
      });
    });

    let totalKillsAll = 0;
    let totalDamageAll = 0;
    let totalAssistsAll = 0;
    let totalSurvivalAll = 0;
    let totalAppearances = 0;
    playerMap.forEach(player => {
      totalKillsAll += player.totalKills;
      totalDamageAll += player.totalDamage;
      totalAssistsAll += player.totalAssists;
      totalSurvivalAll += player.totalSurvival;
      totalAppearances += player.appearances;
    });

    const avgKills = totalAppearances > 0 ? totalKillsAll / totalAppearances : 0;
    const avgDamage = totalAppearances > 0 ? totalDamageAll / totalAppearances : 0;
    const avgAssists = totalAppearances > 0 ? totalAssistsAll / totalAppearances : 0;
    const avgSurvival = totalAppearances > 0 ? totalSurvivalAll / totalAppearances : 0;

    const allPlayers = Array.from(playerMap.values()).map(player => {
      const playerAvgKills = player.appearances > 0 ? player.totalKills / player.appearances : 0;
      const playerAvgDamage = player.appearances > 0 ? player.totalDamage / player.appearances : 0;
      const playerAvgAssists = player.appearances > 0 ? player.totalAssists / player.appearances : 0;
      const playerAvgSurvival = player.appearances > 0 ? player.totalSurvival / player.appearances : 0;
      const score = avgKills > 0 && avgDamage > 0 && avgSurvival > 0 ?
        (playerAvgKills / avgKills * 0.45) + (playerAvgDamage / avgDamage * 0.3) + (playerAvgSurvival / avgSurvival * 0.25) : 0;

      const playerTeam = overallData.teams.find(t => t.teamTag === player.teamTag);
      const teamTotalKills = playerTeam ? playerTeam.players.reduce((sum, p) => sum + (p.killNum || 0), 0) : 0;

      // Calculate K/D ratio
      const deaths = player.appearances - (player.bHasDied ? 0 : 1);
      const kdRatio = player.totalKills / (deaths > 0 ? deaths : 1);

      return {
        ...player,
        killNum: player.totalKills,
        numericDamage: playerAvgDamage,
        assists: playerAvgAssists,
        matchesPlayed: player.appearances,
        score,
        teamTotalKills,
        avgSurvivalSeconds: playerAvgSurvival,
        kdRatio: kdRatio.toFixed(2)
      };
    });

    const sorted = allPlayers.sort((a, b) => {
      // 1. Sort by kills
      if (b.killNum !== a.killNum) return b.killNum - a.killNum;

      // 2. Then by K/D ratio
      if (b.kdRatio !== a.kdRatio) return parseFloat(b.kdRatio) - parseFloat(a.kdRatio);

      // 3. Then by average damage
      if (b.numericDamage !== a.numericDamage) return b.numericDamage - a.numericDamage;

      // 4. Then by average assists
      return b.assists - a.assists;
    });

    return sorted.slice(0, 5);
  }, [overallData, matchDatas]);

  if (loading) {
    return (
      <div className="w-[1920px] h-[1080px]  flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]"></div>
      </div>
    );
  }

  if (error || !overallData) {
    return (
      <div className="w-[1920px] h-[1080px]  flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">{error || 'No overall data available'}</div>
      </div>
    );
  }

  return (
    <div className='w-[1920px] h-[1080px] '>
    <div className=' w-[700px] h-[300px] absolute left-[100px] top-[50px]'>
<div
style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
className='text-white text-[150px] font-[AGENCYB]'>
  TOP FRAGGER
  <div 
  style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.primaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
  className='w-[700px] h-[100px]  mt-[-50px] text-[50px] text-center'>
    {round?.roundName} - MATCH {matches.length} 
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
className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]' >{topPlayers[0].kdRatio}
</div>
 <div className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>K/D RATIO</div>
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
  )
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
className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]' >{player.kdRatio}
</div>
 <div className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>K/D RATIO</div>
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
 
                 #{index+2}
                </div>
 
   <div
  style={{
    backgroundImage: `linear-gradient(135deg, ${
      tournament.primaryColor || '#000'
    }, #000)`
  }}
  className='w-[400px] h-[500px] overflow-hidden relative '
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

export default TopFragger;