import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { buildOverallStandings } from '../../shared/hooks/officialStandings';

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
  playerName: string;
  killNum: number;
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
  totalKills?: number;
  total?: number;
  rank?: number;
  pointsChange?: number; // points gained this match
  leadOverNext?: number; // only for rank 1: lead over rank 2
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

interface OverAllDataProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matches?: Match[];
  matchDatas?: MatchData[];
}

const HighlightPoints: React.FC<OverAllDataProps> = ({
  tournament,
  round,
  match,
  matchData,
  overallData: propOverallData,
  matches: propMatches,
  matchDatas: propMatchDatas
}) => {
  const overallData = propOverallData;
  const matchDatas = propMatchDatas || [];

  // One shared standings pipeline (Total Score primary + real rankChange
  // from match history, else the overallData snapshot). Rows carry
  // rank / matchesPlayed / leadOverNext plus placePoints|total|wwcd aliases.
  const teams = useMemo(
    () => buildOverallStandings(matchDatas as any, overallData as any),
    [matchDatas, overallData]
  );

  // Pagination
  const teamsPerPage = 12;
  const totalPages = Math.max(1, Math.ceil(teams.length / teamsPerPage));
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (totalPages <= 1) return;
    const interval = setInterval(() => {
      setCurrentPage(prev => (prev + 1) % totalPages);
    }, 25000);
    return () => clearInterval(interval);
  }, [totalPages]);

  const paginatedTeams = useMemo(() => {
    const start = currentPage * teamsPerPage;
    return teams.slice(start, start + teamsPerPage);
  }, [teams, currentPage]);

  const listVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.15 },
    }),
    exit: { opacity: 0, y: 20 }
  };

  if (teams.length === 0) return <div>No data available</div>;

  return (
    <div className=' w-full h-screen p-8 flex flex-col font-[AGENCYB]'>

      {/* Header row */}
      <div className='flex w-full mb-[40px] text-[1.5rem] '>
        <div className='w-1/6 absolute left-[50px]'
          style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.secondaryColor || "#ff0"}, #000)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>RANK</div>
        <div className='w-4/6 absolute left-[180px]'
          style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.secondaryColor || "#ff0"}, #000)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>TEAM</div>
        <div className='w-1/6 absolute left-[475px]'
          style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.secondaryColor || "#ff0"}, #000)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>TOTAL</div>
      </div>

      {/* Content boxes */}
      <div className='flex flex-col w-[500px] gap-2'>
        <AnimatePresence>
          {paginatedTeams.map((team, index) => (
            <motion.div
              key={team.teamId}
              className='flex w-full gap-2 text-[22px]'
              custom={index}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={listVariants}
            >
              {/* Yellow Box - RANK */}
              <div
                style={{ boxShadow: `0 0 0 2px ${"#000"}` }}
                className='bg-white w-1/6 p-2 flex justify-center items-center  shadow'>
                <span className='font-bold text-black'>{currentPage * teamsPerPage + index + 1}</span>
              </div>

              {/* Purple Box - TEAM NAME + TOTAL */}
              <div
                style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || "#ff0"}, #000)` }}
                className='bg-purple-900 w-5/6 p-2 flex justify-between items-center  shadow'>
                <div className='flex items-center gap-3'>
                  <img src={team.teamLogo || "/def_logo.png"} alt={team.teamName} className='w-10 h-10 object-contain' />
                  <span className='font-bold text-white'>{team.teamName}</span>
                </div>
                <span className='text-white font-bold mr-[15px]'>{team.total}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </div>
  );
};

export default HighlightPoints;
