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
  const totalPages = processedOverallData ? Math.ceil(processedOverallData.teams.length / teamsPerPage) : 0;

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

  if (loading) return <div>Loading...</div>;
  if (error || !processedOverallData) return <div>{error || 'No data available'}</div>;

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
            <span className="w-[100px] text-center ml-[50px] relative left-[-30px]">WWCD</span>
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
                src={team.teamLogo || "/def_logo.png"}
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
              <span>{team.wwcd || 0}</span>
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
