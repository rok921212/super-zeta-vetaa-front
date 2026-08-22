import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { compareOfficialStandings, getLastMatchPlacePoints } from '../../shared/hooks/officialStandings';
// NOTE: api import and the fetchOverall REST effect removed.
// PublicThemeRenderer already does the overall-data fetch once and passes
// the result down as the `overallData` prop.

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

interface SecondRunnerUpProps {
  tournament: Tournament;
  round?: Round | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matchDatas?: MatchData[];
}

const SecondRunnerUp: React.FC<SecondRunnerUpProps> = ({ tournament, round, matchData, overallData, matchDatas = [] }) => {
  const [playerPhotos, setPlayerPhotos] = useState<Record<string, string>>({});

  const thirdPlace = useMemo(() => {
    if (!overallData) return null;

    const lastMatchPlaceMap = getLastMatchPlacePoints(matchDatas);
    const enriched = overallData.teams.map(team => {
      const totalKills = team.players.reduce((sum, p) => sum + Number(p.killNum || 0), 0);
      const total = Number(team.placePoints || 0) + totalKills;
      const lastMatchPlacePoints = lastMatchPlaceMap.get(team.teamId) || 0;
      return { ...team, total, totalKills, lastMatchPlacePoints } as Team & { total: number; totalKills: number; lastMatchPlacePoints: number };
    });

    enriched.sort((a, b) => compareOfficialStandings(
      { wwcd: a.wwcd || 0, totalPlacePoints: a.placePoints || 0, totalKills: a.totalKills || 0, lastMatchPlacePoints: a.lastMatchPlacePoints || 0 },
      { wwcd: b.wwcd || 0, totalPlacePoints: b.placePoints || 0, totalKills: b.totalKills || 0, lastMatchPlacePoints: b.lastMatchPlacePoints || 0 }
    ));

    if (enriched.length < 3) return null;

    const third = enriched[2];
    const second = enriched[1];
    const leadOverNext = second ? (second.total as number) - third.total : third.total;

    return { ...third, leadOverNext } as (Team & { total: number; totalKills: number; leadOverNext: number });
  }, [overallData]);

  // Extract player photos from match data
  useEffect(() => {
    if (!matchData) {
      console.log('SecondRunnerUp: No matchData available');
      return;
    }

    try {
      console.log('SecondRunnerUp: Processing matchData for player photos', matchData);
      
      // Create a map of player uId to their photo URL from match data
      const photosMap: Record<string, string> = {};
      
      if (!matchData.teams || matchData.teams.length === 0) {
        console.log('SecondRunnerUp: No teams found in matchData');
        setPlayerPhotos({});
        return;
      }
      
      matchData.teams.forEach(team => {
        if (!team.players || team.players.length === 0) {
          console.log(`SecondRunnerUp: No players found in team ${team.teamId}`);
          return;
        }
        
        team.players.forEach(player => {
          if (player.picUrl && player.uId) {
            photosMap[player.uId] = player.picUrl;
            console.log(`SecondRunnerUp: Found photo for player uId ${player.uId}: ${player.picUrl}`);
          } else {
            console.log(`SecondRunnerUp: No picUrl or uId for player ${player._id}`);
          }
        });
      });
      
      console.log('SecondRunnerUp: Player photos map:', photosMap);
      setPlayerPhotos(photosMap);
    } catch (err) {
      console.error('Failed to extract player photos from match data:', err);
      setPlayerPhotos({});
    }
  }, [matchData]);



  if (!overallData || !thirdPlace) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No overall data available</div>
      </div>
    );
  }

  return (
    <div
      className="w-[1920px] h-[1080px] text-white relative font-bebas-neue"
    >
      {/* Champions Title */}
      <div
        className="text-[140px] absolute top-[0px]  left-[370px]  font-[payBack]"
        style={{
          backgroundImage: `linear-gradient(to right, ${tournament.primaryColor}, ${tournament.secondaryColor})`,
          WebkitBackgroundClip: "text",
          color: "transparent",
        }}
      >
        2ND RUNNER-UP
      </div>

      {/* Third Place Team Info */}
      <div
      style={{
          backgroundImage: `linear-gradient(to right, ${tournament.primaryColor}, ${"#000000"})`,
              }}
      className="top-[180px] flex justify-center items-center absolute left-[700px] font-[200] bg-white text-white pr-[25px]">
        <img
          src={thirdPlace.teamLogo || '/def_logo.png'}
          alt="Team Logo"
          className="w-[120px] h-[120px] object-contain relative top-[-6px] mr-6"
        />
        <div className="text-[64px] font-[AGENCYB]  ">{thirdPlace.teamName}</div>
      </div>

      <div
        style={{
          backgroundImage: `linear-gradient(to right, ${tournament.primaryColor}, ${"#000000"})`,
        }}
        className="text-[52px] text-white relative top-[950px] w-[900px] text-center left-[500px]  font-[AGENCYB]"
      >
     WWCD {thirdPlace.wwcd} -- KILLS {thirdPlace.totalKills}  -- {thirdPlace.placePoints} PLACE --  {thirdPlace.total} TOTAL
      </div>

      {/* Player Cards */}
      <motion.div
        className="absolute top-[390px] left-[200px] grid grid-cols-4 gap-[60px]"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: {
              staggerChildren: 0.4,
            },
          },
          hidden: {},
        }}
      >
       {thirdPlace.players.slice(0, 4).map((player: Player) => (

         <motion.div
         key={player._id}
            className="flex flex-col items-center bg-[#1a1a1a94]   rounded-2xl shadow-lg w-[340px]"
            variants={{
              hidden: { opacity: 0, y: 100 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.6 }}
          >
            <img
              src={playerPhotos[player.uId] || player.picUrl || '/def_char.png'}
              alt={player.playerName}
              className="w-[620px] h-[420px] object-cover    top-[16px] "
            />
            <div
              style={{
          backgroundImage: `linear-gradient(to right, ${tournament.secondaryColor}, ${"#000000"})`,
              }}
              className="text-[44px] text-center w-[338px] font-[AGENCYB]"
            >
              {player.playerName}
            </div>
           
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default SecondRunnerUp;
