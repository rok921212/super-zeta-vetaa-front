import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
// NOTE: api import and the three REST calls it drove (matches list,
// per-match matchdata, overall data) removed. PublicThemeRenderer already
// does one REST fetch for the whole page and passes `overallData`,
// `matches`, and `matchDatas` straight down as props for the 'EventMvp'
// view — the matchesPlayed-per-team enrichment that used to run after the
// fetch is now a useMemo derived from those props instead.

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

const TopFragger: React.FC<TopFraggerProps> = ({
  tournament,
  round,
  overallData: rawOverallData,
  matches = [],
  matchDatas = [],
}) => {
  const [playerPhotos, setPlayerPhotos] = useState<Record<string, string>>({});

  // Same matchesPlayed-per-team enrichment the old fetch used to compute
  // after loading matchDatas — now derived straight from props.
  const overallData = useMemo(() => {
    if (!rawOverallData) return null;

    const teamMatchesCount = new Map<string, number>();
    matchDatas.forEach(matchData => {
      matchData?.teams.forEach(team => {
        const count = teamMatchesCount.get(team.teamId) || 0;
        teamMatchesCount.set(team.teamId, count + 1);
      });
    });

    const updatedTeams = rawOverallData.teams.map(team => ({
      ...team,
      matchesPlayed: teamMatchesCount.get(team.teamId) || 0,
    }));

    return { ...rawOverallData, teams: updatedTeams };
  }, [rawOverallData, matchDatas]);

  // Top players by the shared Fragger Score, pooled from matchDatas. K/D
  // ratio and average survival time aren't tracked by the shared pool, so
  // they're computed here as separate supplementary stats to keep the
  // existing stat boxes ("K/D RATIO", "AVG SURVIVAL") working — only WHO
  // gets ranked/selected changes, not these display-only calculations.
  const topPlayers = useMemo(() => {
    if (!overallData || matchDatas.length === 0) return [];

    const scored = computeFraggerScores(buildFraggerPool(matchDatas)).sort(compareFraggerScore);

    const survivalByKey = new Map<string, number>();
    matchDatas.forEach(matchData => {
      matchData.teams.forEach(team => {
        team.players.forEach(player => {
          const key = String(player.uId || player._id);
          survivalByKey.set(key, (survivalByKey.get(key) || 0) + (player.survivalTime || 0));
        });
      });
    });

    return scored.slice(0, 5).map(player => {
      const playerTeam = overallData.teams.find(t => t.teamTag === player.teamTag);
      const teamTotalKills = playerTeam ? playerTeam.players.reduce((sum, p) => sum + (p.killNum || 0), 0) : 0;

      // Calculate K/D ratio
      const deaths = player.appearances - ((player.latestPlayerRaw as any)?.bHasDied ? 0 : 1);
      const kdRatio = player.totalKills / (deaths > 0 ? deaths : 1);
      const avgSurvivalSeconds = player.appearances > 0 ? (survivalByKey.get(player.key) || 0) / player.appearances : 0;

      return {
        ...player,
        killNum: player.totalKills,
        numericDamage: player.avgDamage,
        assists: player.avgAssists,
        matchesPlayed: player.appearances,
        teamTotalKills,
        avgSurvivalSeconds,
        kdRatio: kdRatio.toFixed(2)
      };
    });
  }, [overallData, matchDatas]);

  // Extract player photos from match data
  useEffect(() => {
    if (!matchDatas || matchDatas.length === 0) {
      console.log('EventMvp: No matchDatas available');
      return;
    }

    try {
      console.log('EventMvp: Processing matchDatas for player photos', matchDatas);
      
      // Create a map of player uId to their photo URL from match data
      const photosMap: Record<string, string> = {};
      
      matchDatas.forEach(matchData => {
        if (!matchData.teams || matchData.teams.length === 0) {
          console.log('EventMvp: No teams found in matchData');
          return;
        }
        
        matchData.teams.forEach(team => {
          if (!team.players || team.players.length === 0) {
            console.log(`EventMvp: No players found in team ${team.teamId}`);
            return;
          }
          
          team.players.forEach(player => {
            if (player.picUrl && player.uId) {
              photosMap[player.uId] = player.picUrl;
              console.log(`EventMvp: Found photo for player uId ${player.uId}: ${player.picUrl}`);
            } else {
              console.log(`EventMvp: No picUrl or uId for player ${player._id}`);
            }
          });
        });
      });
      
      console.log('EventMvp: Player photos map:', photosMap);
      setPlayerPhotos(photosMap);
    } catch (err) {
      console.error('Failed to extract player photos from match data:', err);
      setPlayerPhotos({});
    }
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
              src={playerPhotos[String(topPlayers[0].uId || topPlayers[0]._id)] || topPlayers[0].picUrl || "/def_char.avif"}
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

export default TopFragger;