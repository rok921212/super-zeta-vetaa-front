// src/components/OverAllDataComponent.tsx
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { compareOfficialStandings, getLastMatchPlacePoints } from '../../shared/hooks/officialStandings';

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
  uId: string; // Unique identifier for player (e.g., "player1", "player2")
  picUrl?: string;
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
  totalKills?: number;
  total?: number;
  rank?: number;
  pointsChange?: number;
  leadOverNext?: number;
}

interface OverallData {
  tournamentId: string;
  roundId: string;
  userId: string;
  teams: Team[];
  createdAt: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface OverAllDataProps {
  tournament: Tournament;
  round?: Round | null;
  overallData?: OverallData | null;
  matchDatas?: MatchData[];
}

const OverAllDataComponent: React.FC<OverAllDataProps> = ({
  tournament,
  round,
  overallData: propOverallData,
  matchDatas: propMatchDatas,
}) => {
  // ✅ Hooks at the top
  const [loading, setLoading] = useState(true);
const previousTotalsRef = useRef<Map<string, number>>(new Map());
  const matchDatas = propMatchDatas || [];
  const [processedOverallData, setProcessedOverallData] = useState<OverallData | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const teamsPerPage = 8;

  // Pagination logic
  const totalPages = processedOverallData
  ? Math.ceil(processedOverallData.teams.length / teamsPerPage)
  : 1;

  useEffect(() => {
    if (totalPages <= 1) return;
    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, 25000);
    return () => clearInterval(interval);
  }, [totalPages]);

  // Process overall data
  useEffect(() => {
    if (!propOverallData) {
      setLoading(false);
      return;
    }

    const lastMatchPlaceMap = getLastMatchPlacePoints(matchDatas);
    const updatedTeams = propOverallData.teams.map((team) => {
      const totalKills = team.players.reduce((sum, p) => sum + (p.killNum || 0), 0);
      const total = totalKills + team.placePoints;
      const lastMatchPlacePoints = lastMatchPlaceMap.get(team.teamId) || 0;
      return { ...team, totalKills, total, lastMatchPlacePoints };
    });

    // Official standings tie-break: most chicken dinners -> highest
    // placement points -> highest kill points -> better placement in the
    // most recent match. This replaces "total" (kills+placePoints fused)
    // as the primary sort key.
    updatedTeams.sort((a: any, b: any) => compareOfficialStandings(
      { wwcd: a.wwcd || 0, totalPlacePoints: a.placePoints || 0, totalKills: a.totalKills || 0, lastMatchPlacePoints: a.lastMatchPlacePoints || 0 },
      { wwcd: b.wwcd || 0, totalPlacePoints: b.placePoints || 0, totalKills: b.totalKills || 0, lastMatchPlacePoints: b.lastMatchPlacePoints || 0 }
    ));

    // Ranking + pointsChange + leadOverNext
    updatedTeams.forEach((team, index) => {
      team.rank = index + 1;
      const prevTotal = previousTotalsRef.current.get(team.teamId) || 0;
      team.pointsChange = team.total - prevTotal;
      team.leadOverNext =
        index < updatedTeams.length - 1
          ? team.total - updatedTeams[index + 1].total
          : 0;
    });

    setProcessedOverallData({ ...propOverallData, teams: updatedTeams });
    setLoading(false);
  }, [propOverallData]);

// Update previousTotals after processing data
  useEffect(() => {
    if (processedOverallData) {
      processedOverallData.teams.forEach((team) => {
previousTotalsRef.current.set(team.teamId, team.total ?? 0);      });
    }
  }, [processedOverallData]);

  const paginatedTeams = useMemo(() => {
    if (!processedOverallData) return [];
    const start = currentPage * teamsPerPage;
    return processedOverallData.teams.slice(start, start + teamsPerPage);
  }, [processedOverallData, currentPage]);

  if (loading) return <div></div>;
  if (!processedOverallData) return <div>No data available</div>;

  // ✅ JSX unchanged
  return (
    <div className="w-[1920px] h-[1080px] text-white p-8 ">
      {/* TITLE */}
      <div className="w-full h-[30%]">
        <div className="px-6 py-2 font-[Awaking] tracking-wide text-[160px] absolute top-[30px] left-[190px] font-[700] bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text scale-y-[1.4]">
          OVERALL STANDINGS
        </div>

        <div
          style={{
            backgroundImage: `linear-gradient(to left, transparent, ${tournament.primaryColor})`,
            clipPath: 'polygon(30px 0%, 100% 0%, 100% 100%, 30px 100%, 0% 50%)',
          }}
          className="w-[1000px] h-[50px] absolute left-[200px] top-[280px] text-white font-[AGENCYB] text-[2.5rem]"
        >
          <div className="relative top-[-5px] left-[50px]">
            {tournament.tournamentName} - {round?.roundName}
          </div>
        </div>
      </div>

      {/* HEADER */}
      <div className="flex">
        {[0, 1].map((col) => (
          <div
            key={col}
            className={`w-[850px] text-black text-[1.8rem] bg-white h-[40px] relative mb-[0px] font-[Agencyb] pl-[30PX] font-[900] top-[300px] ${
              col === 1 ? 'left-[60px]' : 'left-[30px]'
            }`}
          >
            <div className="absolute top-[-1px] w-[800px] flex gap-[80px]">
              <div>#</div>
              <div className="">TEAM</div>
              <div className="ml-[110px]">WWCD</div>
              <div className="ml-[-10px]">PLACE</div>
              <div className="ml-[-5px]">KILLS</div>
              <div className="ml-[-7px]">TOTAL</div>
            </div>
          </div>
        ))}
      </div>

      {/* TOP TEAM */}
      {processedOverallData.teams.length > 0 && (
        <div
          style={{
            background: `linear-gradient(90deg, ${tournament.primaryColor} 0%, #000000 50%, ${tournament.secondaryColor} 100%)`,
          }}
          className="grid grid-cols-7 bg-[#000000c1] w-[1730px] h-[240px] ml-[30px] mt-[10px] mb-[60px]"
        >
          <div className="font-[AGENCYB] text-[60px] relative left-[30px] top-[20px]">
            #1
          </div>
       <div className="flex relative top-[-26px] left-[0px]">
  {processedOverallData.teams[0].players
    // Filter to keep only the first occurrence of each unique uId
    .filter((player, index, self) => {
      return index === self.findIndex(p => p.uId === player.uId);
    })
    // Sort by kills descending
    .sort((a, b) => b.killNum - a.killNum)
    // Take top 4 unique uId players
    .slice(0, 4)
    .map((player, idx) => (
      <img
        key={idx}
        src={player.picUrl || '/def_char.png'}
        className="w-[500px] h-[266px] object-cover ml-[-80px] relative left-[-60px]"
      />
    ))}
</div>
          <div className="flex relative top-[-86px] left-[0px]">
            <div className="text-[55px] absolute left-[490px] top-[190px] font-[AGENCYB]">
              {processedOverallData.teams[0].teamTag}
            </div>

            <img
              src={processedOverallData.teams[0].teamLogo}
              className="w-[90px] h-[90px] absolute left-[369px] top-[180px]"
            />
          </div>
          <div className="flex gap-[70px] relative left-[400px] top-[70px] text-center font-[supermolot] font-[900]">
            <div>
              <div className="text-[20px] mb-[-10px]">WWCD</div>
              <div className="text-[70px] font-[Agencyb]">
                {processedOverallData.teams[0].wwcd}
              </div>
            </div>
            <div>
              <div className="text-[20px] mb-[-10px]">PLACE</div>
              <div className="text-[70px] font-[Agencyb]">
                {processedOverallData.teams[0].placePoints}
              </div>
            </div>
            <div>
              <div className="text-[20px] mb-[-10px]">KILLS</div>
              <div className="text-[70px] font-[Agencyb]">
                {processedOverallData.teams[0].totalKills}
              </div>
            </div>
            <div>
              <div className="text-[20px] mb-[-10px]">TOTAL</div>
              <div className="text-[70px] font-[Agencyb]">
                {processedOverallData.teams[0].total}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIST */}
      <div className="flex gap-[30px] relative left-[30px] font-[AGENCYB]">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-[10px] relative left-[0px]">
          {paginatedTeams.slice(0, 4).map((team, index) => (
            <motion.div
              key={team.teamId}
              className={`w-[850px] h-[80px] flex items-center text-[30px] relative bg-[#000000c1] ${
                team.rank === 1 ? 'border-2 bg-[#400000c1] border-red-500' : ''
              }`}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              {team.rank === 1 && (
                <motion.div
                  className="absolute inset-0 rounded-lg pointer-events-none"
                  initial={{ boxShadow: '0 0 10px rgba(255,0,0,0.5)' }}
                  animate={{
                    boxShadow: [
                      '0 0 10px rgba(255,0,0,0.5)',
                      '0 0 20px rgba(255,0,0,0.8)',
                      '0 0 10px rgba(255,0,0,0.5)',
                    ],
                  }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                />
              )}
              <div className="w-[5%] text-center pl-[20px]">#{team.rank}</div>
              <div className="w-[25%] text-center">{team.teamTag.toUpperCase()}</div>
              <div className="w-[10%] text-center">
                <img src={team.teamLogo} className="w-12 h-12 mx-auto" />
              </div>
              <div className="w-[15%] text-center">{team.wwcd || 0}</div>
              <div className="w-[15%] text-center">{team.placePoints}</div>
              <div className="w-[15%] text-center">{team.totalKills}</div>
              <div className="w-[15%] text-center">{team.total}</div>
            </motion.div>
          ))}
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-[10px]">
          {paginatedTeams.slice(4, 8).map((team) => {
            const isGlowing = team.rank && team.rank >= 21 && team.rank <= 24;
            return (
              <motion.div
                key={team.teamId}
                className={`w-[850px] h-[80px] flex items-center text-[30px] relative bg-[#000000c1] ${
                  isGlowing ? 'border-2 bg-[#400000c1] border-red-500' : ''
                }`}
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                {isGlowing && (
                  <motion.div
                    className="absolute inset-0 rounded-lg pointer-events-none"
                    initial={{ boxShadow: '0 0 10px rgba(255,0,0,0.5)' }}
                    animate={{
                      boxShadow: [
                        '0 0 10px rgba(255,0,0,0.5)',
                        '0 0 20px rgba(255,0,0,0.8)',
                        '0 0 10px rgba(255,0,0,0.5)',
                      ],
                    }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                  />
                )}
                <div className="w-[5%] text-center pl-[20px]">#{team.rank ?? 0}</div>
                <div className="w-[25%] text-center">{team.teamTag.toUpperCase()}</div>
                <div className="w-[10%] text-center">
                  <img src={team.teamLogo} className="w-12 h-12 mx-auto" />
                </div>
                <div className="w-[15%] text-center">{team.wwcd || 0}</div>
                <div className="w-[15%] text-center">{team.placePoints}</div>
                <div className="w-[15%] text-center">{team.totalKills}</div>
                <div className="w-[15%] text-center">{team.total}</div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OverAllDataComponent;