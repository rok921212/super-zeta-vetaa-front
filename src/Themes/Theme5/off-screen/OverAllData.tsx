import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';

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

const OverAllDataComponent: React.FC<OverAllDataProps> = ({ tournament, round, match, matchData, overallData: propOverallData, matches: propMatches, matchDatas: propMatchDatas }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previousTotals, setPreviousTotals] = useState<Map<string, number>>(new Map());
  const [processedOverallData, setProcessedOverallData] = useState<OverallData | null>(null);

  const overallData = propOverallData;
  const matches = propMatches || [];
  const matchDatas = propMatchDatas || [];

  useEffect(() => {
    if (overallData) {
      // Calculate matches played for each team
      const teamMatchesPlayed = new Map<string, number>();
      // Always count the selected match
      if (matchData) {
        const hasTenPlacePoints = matchData.teams.some((team: any) => team.placePoints === 10);
        if (hasTenPlacePoints) {
          matchData.teams.forEach((team: any) => {
            if (team.players && team.players.length > 0) {
              const teamId = team.teamId;
              teamMatchesPlayed.set(teamId, (teamMatchesPlayed.get(teamId) || 0) + 1);
            }
          });
        }
      }
      // Count other matches
      matchDatas.forEach((matchDataItem) => {
        if (matchData && matchDataItem._id === matchData._id) return; // Skip if it's the selected match
        const hasTenPlacePoints = matchDataItem.teams.some((team: any) => team.placePoints === 10);
        if (hasTenPlacePoints) {
          matchDataItem.teams.forEach((team: any) => {
            if (team.players && team.players.length > 0) {
              const teamId = team.teamId;
              teamMatchesPlayed.set(teamId, (teamMatchesPlayed.get(teamId) || 0) + 1);
            }
          });
        }
      });

      // Update totals and calculate additional fields
      const updatedTeams = overallData.teams.map((team: any) => {
        const totalKills = team.players.reduce((sum: number, p: any) => sum + (p.killNum || 0), 0);
        const total = totalKills + team.placePoints;
        const matchesPlayed = teamMatchesPlayed.get(team.teamId) || 0;
        return {
          ...team,
          totalKills,
          total,
          matchesPlayed,
        };
      });

      // Sort by total descending
      updatedTeams.sort((a: any, b: any) => {
        if (b.total !== a.total) return b.total - a.total;
        if (b.placePoints !== a.placePoints) return b.placePoints - a.placePoints;
          if ((b.wwcd || 0) !== (a.wwcd || 0)) return (b.wwcd || 0) - (a.wwcd || 0); // 3️⃣ tie → higher WWCD first
  return (b.totalKills || 0) - (a.totalKills || 0);
      });

      // Calculate pointsChange and leadOverNext
      const newTotals = new Map<string, number>();
      updatedTeams.forEach((team: any, index: number) => {
        team.rank = index + 1;
        const prevTotal = previousTotals.get(team.teamId) || 0;
        team.pointsChange = team.total - prevTotal;

        // leadOverNext for all teams: difference to next rank
        if (index < updatedTeams.length - 1) {
          const nextTeam = updatedTeams[index + 1];
          team.leadOverNext = team.total - nextTeam.total;
        } else {
          team.leadOverNext = 0; // last place has no next
        }

        newTotals.set(team.teamId, team.total);
      });

      setPreviousTotals(newTotals);
      setProcessedOverallData({ ...overallData, teams: updatedTeams });
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [overallData, previousTotals, matches]);

  // Pagination - Show 2, 3, 4, etc. teams per page
  const [currentPage, setCurrentPage] = useState(0);
  const teamsPerPage = 8;
  const totalPages = processedOverallData && processedOverallData.teams.length > 16 ? 2 : 1;

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPage(prev => (prev + 1) % totalPages);
    }, 25000);
    return () => clearInterval(interval);
  }, [totalPages]);

  const paginatedTeams = useMemo(() => {
    if (!processedOverallData) return [];
    const start = currentPage * teamsPerPage;
    return processedOverallData.teams.slice(start, start + teamsPerPage);
  }, [processedOverallData, currentPage, teamsPerPage]);

  if (loading) return <div></div>;
  if (error || !processedOverallData) return <div>{error || 'No data available'}</div>;

  // Prepare data for the new design
  const formattedData = processedOverallData.teams.map((team: any) => ({
    ColumnA: team.teamname || team.teamName || null,
    ColumnB: team.teamLogo || "/def_logo.avif",
    ColumnC: team.players.reduce((s: number, p: any) => s + (p.killNum || 0), 0),
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
