import React, { useEffect, useMemo, useState } from 'react';
// NOTE: api import and the own-REST fetch of matches/overallData/matchDatas
// removed — PublicThemeRenderer already does the one shared fetch and
// passes overallData, matches, and matchDatas down as props for the
// 'EventMvp' view. (This file's internal component was historically named
// TopFragger — renamed to EventMvp to match the file/view it's actually
// wired to; component-file matching is by filename, not export name, see
// resolveComponent() in PublicThemeRenderer.tsx.)

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

interface EventMvpProps {
  tournament: Tournament;
  round?: Round | null;
  overallData?: OverallData | null;
  matches?: Match[];
  matchDatas?: MatchData[];
}

interface StatBoxData {
  img: string;
  primaryValue: string ;
  secondaryValue: number | string;
}

interface StatBoxProps extends StatBoxData {
  tournament: Tournament;
}

const formatSecondsToMMSS = (seconds: number = 0) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const EventMvp: React.FC<EventMvpProps> = ({ tournament, round, overallData, matches = [], matchDatas = [] }) => {
  const [playerPhotos, setPlayerPhotos] = useState<Record<string, string>>({});

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

  // Extract player photos from match data
  useEffect(() => {
    if (!matchDatas || matchDatas.length === 0) {
      setPlayerPhotos({});
      return;
    }

    const photosMap: Record<string, string> = {};
    matchDatas.forEach(matchData => {
      matchData.teams?.forEach(team => {
        team.players?.forEach(player => {
          if (player.picUrl && player.uId) {
            photosMap[player.uId] = player.picUrl;
          }
        });
      });
    });
    setPlayerPhotos(photosMap);
  }, [matchDatas]);

  const topPlayer = topPlayers[0]; // first player after sorting

  const statBoxes: StatBoxData[] = [
    {
      img: "/theme4assets/total elims.png",
      primaryValue: "TOTAL ELIMS",
      secondaryValue: topPlayer?.killNum || 0,
    },
    {
      img: "/theme4assets/totaldamages.png",
      primaryValue: "AVG DAMAGE",
secondaryValue: topPlayer?.numericDamage?.toFixed(2) || "0.00",
    },
    {
      img: "/theme4assets/total elims.png",
      primaryValue: "K/D RATIO",
      secondaryValue: parseFloat(topPlayer?.kdRatio || "0"),
    },
    {
      img: "/theme4assets/knoc.png",
      primaryValue: "AVG SURVIVAL",
      secondaryValue: topPlayer?.avgSurvivalSeconds ? formatSecondsToMMSS(topPlayer?.avgSurvivalSeconds) : "00:00",
    },
  ];

  const StatBox: React.FC<StatBoxProps> = ({
    img,
    primaryValue,
    secondaryValue,
    tournament,
  }) => {
    return (
      <div className="flex items-center ml-[20px] font-[AGENCYB]">

        {/* IMAGE */}
        <div className="w-[150px] h-[120px]">
          <img
            src={img}
            alt=""
            className="w-full h-full object-contain"
          />
        </div>

        {/* DATA BOXES */}
        <div className="w-full h-full pl-[20px] flex flex-col justify-center items-center">

          {/* PRIMARY */}
         <div
    style={{
      backgroundColor: "white", // visible div background
      boxShadow: `0 0 0 5px ${tournament.primaryColor || "#000"}`,
    }}
    className="w-full h-[45%] flex items-center justify-center text-center"
  >
    <span
      style={{
        backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || "#ff0"}, #000)`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}
      className="text-[50px] font-bold"
    >
      {primaryValue}
    </span>
  </div>

          {/* SECONDARY */}
          <div
            style={{
              boxShadow: `0 0 0 5px ${tournament.secondaryColor || "#000"}`,
            }}
            className="w-full h-[45%] mt-[15px] flex items-center justify-center text-black text-[62px] bg-white text-center"
          >
            {secondaryValue}
          </div>

        </div>

      </div>
    );
  };

  if (!overallData) {
    return (
      <div className="w-[1920px] h-[1080px]  flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No overall data available</div>
      </div>
    );
  }

  return (
    <div className='w-[1920px] h-[1080px] '>
      <div className='flex justify-end  w-[1300px] h-[190px] relative top-[40px] '>
        <div className='w-[750px] h-[150px] absolute top-[-90px]  '>
          <div
              style={{
              backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'
                }, #000)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          className='text-black font-[AGENCYB] text-[180px]'>
            EVENT MVP
          </div>
        </div>
        <div className='mr-[-20px]'>
          <div
            style={{
              backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'
                }, #000)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
            className='text-white text-[80px] font-[AGENCYB] absolute top-[-20px]'>

            {round?.roundName}
          </div>
          <div className='text-white text-[80px] font-[AGENCYB] absolute top-[50px] w-[500px]'>
            DAY {round?.day} MATCH {matches.length}
          </div>
        </div>
      </div>
      {topPlayers[0] && (
        <>
          <div
            className="absolute left-[-160px] top-[280px]"
            style={{ width: "1000px", height: "800px" }}>
            <img
              src={playerPhotos[topPlayers[0].uId] || topPlayers[0].picUrl || "/def_char.png"}
              alt={topPlayers[0].playerName || "Player"}
              style={{ width: "850px", height: "800px"}} />
          </div>
          <div className='w-[90%] h-[130px] flex justify-end font-[AGENCYB]'>
            <div
              style={{
                boxShadow: `0 0 0 5px ${tournament.secondaryColor || '#000'}`,
              }}
              className="relative bg-white w-[66%] skew-x-[-7deg]">
              {/* INNER CONTENT (un-skewed) */}
              <div className="absolute inset-0 flex  skew-x-[7deg]">
                <div className="flex items-center gap-4 text-white text-[70px] absolute left-[80px]">
                  <div className="w-[120px] h-[120px]  relative top-[5px] ">
                    <img
                      src={topPlayers[0].teamLogo}
                      alt=""
                      className="w-full h-full object-contain" />
                  </div>
                  <span>{topPlayers[0].teamTag}</span>
                </div>
                <div className='text-black absolute left-[550px] text-[70px] top-[10px]'>
                  {topPlayers[0].playerName}
                </div>
              </div>

              {/* LEFT GRADIENT BAR */}
              <div
                className="w-[45%] h-full"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${
                    tournament.primaryColor || '#000'
                  }, #000)`,
                }} />
            </div>
          </div>
          <div className='w-[100%] h-[100%] flex justify-center '>
            <div className="w-[1100px] h-[600px] absolute left-[600px] top-[350px]">
              <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-2 p-2">
                {statBoxes.map((box, index) => (
                  <StatBox
                    key={index}
                    img={box.img}
                    primaryValue={box.primaryValue}
                    secondaryValue={box.secondaryValue}
                    tournament={tournament}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
};

export default EventMvp;
