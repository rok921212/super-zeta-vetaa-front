import React, { useMemo } from 'react';
// NOTE: api import and the own-REST fetch of matches/overallData/matchDatas
// removed — PublicThemeRenderer already does the one shared fetch and
// passes overallData, matches, and matchDatas down as props.

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
  overallData?: OverallData | null;
  matches?: Match[];
  matchDatas?: MatchData[];
}

// Module-scope (not inside OverallFrags) since SidePlayerCard, a sibling
// component defined later in this file, also calls it.
const formatSecondsToMMSS = (seconds: number = 0) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const OverallFrags: React.FC<OverallFragsProps> = ({ tournament, round, match, overallData, matchDatas = [] }) => {
  // Get top 5 players by comprehensive score
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
              teamLogo: team.teamLogo,
              teamName: team.teamName,
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
      const score = avgKills > 0 && avgDamage > 0 && avgSurvival > 0
        ? (playerAvgKills / avgKills * 0.45) + (playerAvgDamage / avgDamage * 0.3) + (playerAvgSurvival / avgSurvival * 0.25)
        : 0;

      const playerTeam = overallData.teams.find(t => t.teamTag === player.teamTag);
      const teamTotalKills = playerTeam
        ? playerTeam.players.reduce((sum, p) => sum + (p.killNum || 0), 0)
        : 0;

      return {
        ...player,
        killNum: player.totalKills,
        numericDamage: playerAvgDamage,
        assists: playerAvgAssists,
        teamName: player.teamName,
        matchesPlayed: player.appearances,
        score,
        teamTotalKills,
        avgSurvivalSeconds: playerAvgSurvival
      };
    });

    const sorted = allPlayers.sort((a, b) => {
      if (b.killNum !== a.killNum) return b.killNum - a.killNum;
      if (b.score !== a.score) return b.score - a.score;
      if (b.numericDamage !== a.numericDamage) return b.numericDamage - a.numericDamage;
      return b.assists - a.assists;
    });

    return sorted.slice(0, 5);
  }, [overallData, matchDatas]);

  if (!overallData) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No overall data available</div>
      </div>
    );
  }

  return (
    <div className='w-[1920px] h-[1080px]'>
      <div className='w-[800px] h-[300px] absolute left-[100px] top-[50px]'>
        <div
          className="px-6 py-2 w-[900px] font-[Awaking] text-[160px] absolute top-[-20px] left-[-50px] font-[700] bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text drop-shadow-[0px_7px_10px_rgba(0,0,0,0.3)]">
          ROAD TO MVP
          <div
            style={{
              backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
            className='w-[700px] h-[100px] mt-[-50px] text-[50px] text-center font-[AGENCYB]'>
            {round?.roundName} - MATCH {match?.matchNo || 'N/A'}
          </div>
        </div>
      </div>

      {topPlayers[0] && (
        <div className='w-[600px] h-[650px] absolute top-[320px] left-[110px]'>
          <div className='relative top-[40px]'>
            <div className='w-[250px] h-[90px] absolute top-[100px] left-[350px] font-[AGENCYB] text-white'>
              <div
                style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)` }}
                className='bg-black w-[100%] h-[50%] text-[30px] text-center flex items-center justify-center'>
                {topPlayers[0].killNum}
              </div>
              <div className='bg-black w-[100%] h-[50%] text-[30px] text-center flex items-center justify-center'>ELIMINATION</div>
            </div>
            <div className='w-[250px] h-[90px] absolute top-[210px] left-[350px]'>
              <div
                style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)` }}
                className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>
                {topPlayers[0].numericDamage.toFixed(2)}
              </div>
              <div className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>AVG DAMAGE</div>
            </div>
            <div className='w-[250px] h-[90px] absolute top-[320px] left-[350px]'>
              <div
                style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)` }}
                className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>
                {formatSecondsToMMSS(topPlayers[0].avgSurvivalSeconds)}
              </div>
              <div className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>AVG SURVIVAL</div>
            </div>
          </div>
          <div
            style={{ backgroundImage: `linear-gradient(135deg, ${tournament.secondaryColor || '#000'}, #000)` }}
            className='bg-white w-[120px] h-[120px] absolute top-[530px] left-[485px] font-[AGENCYB] text-white text-[100px] flex justify-center items-center'>
            #1
          </div>
          <div
            style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)` }}
            className='w-[350px] h-[500px] overflow-hidden relative'>
            <div className='bg-white w-[100px] h-[100px] absolute top-[400px] left-[0px] z-10'>
              <img src={topPlayers[0].teamLogo} alt="" className='w-[100%] h-[100%]' />
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
            style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)` }}
            className='bg-black w-[475px] h-[80px] text-white font-[AGENCYB] text-[40px] text-center flex items-center justify-center'>
            {topPlayers[0].teamName}
          </div>
        </div>
      )}

      <div
        style={{ scale: 0.64 }}
        className="absolute top-[-100px] left-[600px] grid grid-cols-2 gap-4">
        {topPlayers.slice(1, 5).map((player, index) => (
          <SidePlayerCard key={player.uId || player._id} player={player} index={index} tournament={tournament} />
        ))}
      </div>
    </div>
  );
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
      <div className='w-[800px] h-[650px] scale-100'>
        <div className='relative top-[40px] left-[50px]'>
          <div className='w-[250px] h-[90px] absolute top-[100px] left-[350px] font-[AGENCYB] text-white'>
            <div
              style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)` }}
              className='bg-black w-[100%] h-[50%] text-[30px] text-center flex items-center justify-center'>
              {player.killNum}
            </div>
            <div className='bg-black w-[100%] h-[50%] text-[30px] text-center flex items-center justify-center'>ELIMINATION</div>
          </div>
          <div className='w-[250px] h-[90px] absolute top-[210px] left-[350px]'>
            <div
              style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)` }}
              className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>
              {player.numericDamage.toFixed(2)}
            </div>
            <div className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>AVG DAMAGE</div>
          </div>
          <div className='w-[250px] h-[90px] absolute top-[320px] left-[350px]'>
            <div
              style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)` }}
              className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>
              {formatSecondsToMMSS(player.avgSurvivalSeconds)}
            </div>
            <div className='bg-black w-[100%] h-[50%] text-white text-[30px] text-center flex items-center justify-center font-[AGENCYB]'>AVG SURVIVAL</div>
          </div>
        </div>
        <div
          style={{ backgroundImage: `linear-gradient(135deg, ${tournament.secondaryColor || '#000'}, #000)` }}
          className='bg-white w-[120px] h-[120px] absolute top-[530px] left-[485px] font-[AGENCYB] text-white text-[100px] flex justify-center items-center'>
          #{index + 2}
        </div>
        <div
          style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)` }}
          className='w-[350px] h-[500px] overflow-hidden relative'>
          <div className='bg-white w-[100px] h-[100px] absolute top-[400px] left-[0px] z-10'>
            <img src={player.teamLogo} alt="" className='w-[100%] h-[100%]' />
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
          style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)` }}
          className='bg-black w-[475px] h-[80px] text-white font-[AGENCYB] text-[40px] text-center flex items-center justify-center'>
          {player.teamName}
        </div>
      </div>
    </div>
  );
};

export default OverallFrags;
