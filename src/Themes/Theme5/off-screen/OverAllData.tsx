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
  const matchDatas = propMatchDatas || [];

  // One shared standings pipeline (Total Score primary + real rankChange
  // from match history, else the overallData snapshot). Rows carry
  // rank / matchesPlayed / leadOverNext plus placePoints|total|wwcd aliases.
  const teams = useMemo(
    () => buildOverallStandings(matchDatas as any, propOverallData as any),
    [matchDatas, propOverallData]
  );

  const [currentPage, setCurrentPage] = useState(0);
  const totalPages = teams.length > 16 ? 2 : 1;

  useEffect(() => {
    if (totalPages <= 1) return;
    const interval = setInterval(() => {
      setCurrentPage(prev => (prev + 1) % totalPages);
    }, 25000);
    return () => clearInterval(interval);
  }, [totalPages]);

  if (teams.length === 0) return <div>No data available</div>;

  // Prepare data for the new design
  const formattedData = teams.map((team) => ({
    ColumnA: team.teamName || null,
    ColumnB: team.teamLogo || "/def_logo.avif",
    ColumnC: team.totalKills || 0,
    ColumnD: team.placePoints || 0,
    ColumnE: team.wwcd || 0,
    ColumnF: team.total || 0,
  }));

  const top20 = [formattedData.slice(0, 11), formattedData.slice(11, 22)];

  return (
    <div className="w-[1920px] h-[1080px] text-black">
      {/* Title */}
      <div
        className="px-6 py-2 font-[Awaking] text-[160px] leading-[1] absolute top-[0px] left-[400px] font-[700] w-[1300px] text-center text-white tracking-wider"
        style={{
          backgroundImage: `linear-gradient(to right, ${tournament.primaryColor || '#6b21a8'}, ${tournament.secondaryColor || '#c084fc'})`,
          clipPath: "polygon(40px 0%, 100% 0%, calc(100% - 40px) 100%, 0% 100%)",
        }}
      >
        OVERALL STANDINGS
      </div>

      {/* Info Strip */}
      <div
        className="w-[2000px] h-[60px] absolute left-[0px] top-[240px] text-white font-[tungsten] font-[100] text-[3rem] tracking-wide flex justify-center"
      >
        <div className="relative top-[-60px] left-[0px] text-[5rem]">
          <span style={{ color: tournament.primaryColor || '#6b21a8' }}>{tournament.tournamentName}</span>
        </div>
      </div>

      {/* Tables */}
      <div className="flex gap-10 absolute top-[330px] left-[120px]">
        {top20.map((tableData, tableIndex) => (
          <div key={tableIndex}>
            {/* Header */}
            <div
              style={{
                backgroundImage: `linear-gradient(to left, ${tournament.secondaryColor || '#c084fc'}, ${tournament.primaryColor || '#6b21a8'})`,
              }}
              className="w-[840px] h-[40px] bg-white text-white flex text-[24px] font-[supermolot] mb-2 px-9 items-center">
              <div className="w-[50px]">#</div>
              <div className="w-[250px]">TEAM NAME</div>
              <div className="w-[100px] text-center ml-[30px]">PLACE</div>
              <div className="w-[100px] text-center">KILLS</div>
              <div className="w-[100px] text-center">TOTAL</div>
              <div className="w-[100px] text-center">WWCD</div>
            </div>

            {/* Rows */}
            {tableData.map((row, i) => {
              const globalIndex = tableIndex * 11 + i;
              const bgColor = globalIndex % 2 === 0 ? "#3a3a3a" : "#2e2e2e";

              return (
                <motion.div
                  key={`team-${globalIndex}`}
                  className="w-[840px] h-[60px] mb-2"
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                >
                  <div
                    className="flex items-center h-full px-4 font-[AGENCYB] text-white"
                    style={{ backgroundColor: bgColor }}
                  >
                    <div className="w-[50px] text-[26px] font-[AGENCYB] text-center">
                      {globalIndex + 1}
                    </div>

                    <img
                      src={row.ColumnB}
                      alt="logo"
                      className="h-[40px] w-[40px] object-contain ml-1"
                    />

                    <div
                      className="w-[250px] h-[40px] ml-2 flex items-center pl-2 text-[26px] bg-white text-black "
                    >
                      {row.ColumnA}
                    </div>

                    <div className="w-[100px] text-center text-[26px] font-[AGENCYB]">{row.ColumnD}</div>
                    <div className="w-[100px] text-center text-[26px] font-[AGENCYB]">{row.ColumnC}</div>
                    <div className="w-[100px] text-center text-[26px] font-[AGENCYB]">{row.ColumnF}</div>
                    <div className="w-[100px] text-center text-[26px] font-[AGENCYB] flex items-center justify-center gap-1">
                      <img
                        src="/chicken.avif"
                        className="w-[30px] h-[30px] invert"
                        alt="chicken"
                      />
                      x {row.ColumnE}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};


export default OverAllDataComponent;
