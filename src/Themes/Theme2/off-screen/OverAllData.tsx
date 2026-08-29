import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
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
  booyah?: number;
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



// ... all imports and interfaces remain the same

const OverAllDataComponent: React.FC<OverAllDataProps> = ({ tournament, round, overallData: propOverallData, matchDatas: propMatchDatas }) => {
  const overallData = propOverallData;
  const matchDatas = propMatchDatas || [];

  // One shared standings pipeline (Total Score primary + real rankChange
  // from match history, else the overallData snapshot). Rows carry
  // matchesPlayed / leadOverNext plus placePoints|total|booyah aliases.
  const teams = useMemo(
    () => buildOverallStandings(matchDatas as any, overallData as any),
    [matchDatas, overallData]
  );

  const [currentPage, setCurrentPage] = useState(0);
  const teamsPerPage = 8;
  const totalPages = Math.ceil(teams.length / teamsPerPage) || 0;

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

  if (teams.length === 0) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No overall data available</div>
      </div>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px] flex justify-center relative">
      {/* Header */}
      <div className="absolute top-[0px] right-[250px] text-white flex justify-end w-[100%]">
        <div className='text-[6rem] font-bebas relative right-[250px]'>OVERALL STANDINGS</div>
        <div
          style={{
            backgroundImage: `linear-gradient(to left, transparent, ${tournament.primaryColor})`,
            clipPath: "polygon(30px 0%, 100% 0%, 100% 100%, 30px 100%, 0% 50%)",
          }}
          className="w-[900px] h-[60px] absolute left-[1090px] top-[120px] text-white font-bebas-neue"
        >
          <div className="relative left-[50px] font-[Righteous] text-[2rem] top-[4px]">
            {tournament.tournamentName} | {round?.roundName || 'No Round'}
          </div>
        </div>
      </div>

      {/* Teams */}
      <div className="absolute top-[200px] w-[1600px] ">
        <div className="bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] w-[100%] h-[50px] mb-[15px]">
          <div className="flex items-center text-black font-bold text-[1.8rem] font-[Righteous]  pt-[5px]">
            <span className="ml-[0px] w-[80px] text-center absolute">#</span>
            <span className="w-[200px] text-center ml-[150px]">TEAM</span>
            <span className="w-[100px] text-center ml-[300px] relative left-[60px]">MATCHES</span>
            <span className="w-[200px] text-center ml-[120px]">KILLS</span>
            <span className="w-[250px] text-center ml-[0px] relative left-[-10px]">PLACE</span>
            <span className="w-[100px] text-center ml-[50px] left-[-40px] relative ">TOTAL</span>
            <span className="w-[100px] text-center ml-[50px] relative left-[-30px]">BOOYAH</span>
            <span className="w-[200px] text-center relative  left-[0px]">PTS DIFF</span>
          </div>
        </div>

        {paginatedTeams.map((team, index) => (
          <motion.div
            key={team.teamId}
            className="w-full h-[80px] flex items-center text-black font-bold mb-[10px] bg-gradient-to-r from-[#cdcdcd] via-[#fbfbfb] to-[#afafaf]"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.3, duration: 0.6, ease: "easeOut" }}
          >
            {/* Rank */}
            <div
              className="h-full w-[80px] flex items-center justify-center text-white font-[300] text-[3rem] font-bebas"
              style={{
                background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
              }}
            >
              {team.rank}
            </div>

            {/* Logo */}
            <div className="w-[50px] flex items-center justify-center ml-[15px]">
              <img
                src={team.teamLogo || "https://res.cloudinary.com/dqckienxj/image/upload/v1727161652/default_nuloh2.png"}
                alt={team.teamTag}
                className="w-[100%]"
              />
            </div>

            {/* Name */}
            <div className="flex-1 ml-4 font-[300] text-[3rem] flex items-center h-[100%]">
              <div
                style={{
                  background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
                }}
                className='w-[500px] h-[100%] items-center flex pl-[10px] font-bebas text-white'
              >
                {team.teamName}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-6 font-[300] text-[3rem] font-bebas w-[60%] h-[105%] text-center items-center">
              <span>{team.matchesPlayed}</span>
              <span>{team.totalKills}</span>
              <span>{team.placePoints}</span>
              <span>{team.total}</span>
              <span>{team.booyah || 0}</span>
              <span  style={{
    background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text', // for some browsers

  }}>
                {team.rank === 1
                  ? `${team.leadOverNext || 0}`
                  : `${team.leadOverNext || 0}`}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};


export default OverAllDataComponent;
