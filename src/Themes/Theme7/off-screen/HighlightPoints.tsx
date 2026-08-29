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
  const processedOverallData = teams.length ? { teams } : null;

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

  if (!processedOverallData) return <div>No data available</div>;

  return (
  <div className="w-full h-screen flex items-center ">
    <div className="ml-12 w-[650px]">

      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: -25 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1
          className="text-[44px] font-[AGENCYB] tracking-[6px]"
          style={{
            background: `linear-gradient(90deg,${
              tournament.secondaryColor || "#FFD84A"
            },white)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          OVERALL STANDINGS
        </h1>

        <div
          className="h-[3px] rounded-full mt-2"
          style={{
            background: `linear-gradient(to right,${
              tournament.primaryColor || "#8B5CF6"
            },transparent)`
          }}
        />
      </motion.div>

      {/* TABLE HEADER */}
      <div
        className="h-12 rounded-xl flex items-center px-5 mb-3 backdrop-blur-md"
        style={{
          background: "rgba(255,255,255,.08)",
          border: "1px solid rgba(255,255,255,.15)"
        }}
      >
        <div className="w-20 text-white/70 text-lg tracking-wider">RANK</div>
        <div className="flex-1 text-white/70 text-lg tracking-wider">
          TEAM
        </div>
        <div className="w-24 text-center text-white/70 text-lg tracking-wider">
          PTS
        </div>
      </div>

      {/* TEAM LIST */}
      <AnimatePresence mode="wait">
        <div className="flex flex-col gap-3">
          {paginatedTeams.map((team, index) => {
            const rank = currentPage * teamsPerPage + index + 1;

            return (
              <motion.div
                key={team.teamId}
                layout
                custom={index}
                initial={{ opacity: 0, x: -80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 80 }}
                transition={{
                  duration: .45,
                  delay: index * .05
                }}
                className="relative overflow-hidden rounded-2xl"
              >
                {/* Background */}
                <div
                  className="absolute inset-0 bg-[#000000cc]"
                  style={{
                   
                    backdropFilter: "blur(20px)"
                  }}
                />

                {/* Left Accent */}
                <div
                  className="absolute left-0 top-0 h-full w-2"
                  style={{
                    background:
                      rank === 1
                        ? "#FFD84A"
                        : rank === 2
                        ? "#D7D7D7"
                        : rank === 3
                        ? "#D68E42"
                        : tournament.primaryColor
                  }}
                />

                <div className="relative h-[74px] flex items-center px-4">

                  {/* Rank */}
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold mr-5
                    ${
                      rank === 1
                        ? "bg-yellow-400 text-black"
                        : rank === 2
                        ? "bg-gray-300 text-black"
                        : rank === 3
                        ? "bg-orange-500 text-white"
                        : "bg-white/10 text-white"
                    }`}
                  >
                    {rank}
                  </div>

                  {/* Logo */}
                  <div className="relative mr-4">
                    <div
                      className="absolute inset-0 rounded-full blur-xl opacity-50"
                      style={{
                        background: tournament.primaryColor || "#7c3aed"
                      }}
                    />

                    <img
                      src={team.teamLogo || "/def_logo.png"}
                      className="relative w-14 h-14 object-contain"
                    />
                  </div>

                  {/* Team */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3">

                      <span className="text-white text-[28px] font-[AGENCYB] tracking-wide">
                        {team.teamTag || team.teamName}
                      </span>

                    
                    </div>

                    <div className="text-white/55 text-sm tracking-widest uppercase">
                      {team.teamName}
                    </div>

                    {/* Progress */}
                    <div className="mt-2 w-[220px] h-1 rounded-full bg-white/10 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${
                            ((team.total || 0) /
                              (processedOverallData.teams[0].total || 1)) *
                            100
                          }%`
                        }}
                        transition={{ duration: 1 }}
                        className="h-full rounded-full"
                        style={{
                          background: tournament.secondaryColor || "#FFD84A"
                        }}
                      />
                    </div>
                  </div>

                 

                  {/* Total */}
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    className="w-24 h-14 rounded-xl flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg,${
                        tournament.primaryColor || "#7c3aed"
                      },#1F1B2E)`,
                      boxShadow:
                        "0 0 20px rgba(124,58,237,.35)"
                    }}
                  >
                    <span className="text-white text-[30px] font-[AGENCYB]">
                      {team.total}
                    </span>
                  </motion.div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </AnimatePresence>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex justify-between mt-6 text-white/50 text-sm"
      >
        <span>
          PAGE {currentPage + 1} / {totalPages}
        </span>

        <span>
          MATCH {match?.matchNo || "-"} COMPLETE
        </span>
      </motion.div>
    </div>
  </div>
);
};

export default HighlightPoints;
