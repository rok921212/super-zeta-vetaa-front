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

  let leftTeams, leftRankOffset, rightTeams, rightRankOffset;
  if (currentPage === 0) {
    leftTeams = processedOverallData?.teams.slice(0, 8);
    leftRankOffset = 1;
    rightTeams = processedOverallData?.teams.slice(8, 16);
    rightRankOffset = 9;
  } else {
    leftTeams = processedOverallData?.teams.slice(16, 25);
    leftRankOffset = 17;
    rightTeams = processedOverallData?.teams.slice(25, 33);
    rightRankOffset = 26;
  }

  return (
  <div className='w-[1920px] h-[1080px] '>
   <div className=' w-[1600px] h-[250px] absolute top-[40px] left-[60px]  '>
<div 
style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
className='text-[167px] ml-[90px] font-[AGENCYB]  text-white absolute flex'>
  OVERALL RANKINGS

  <div className='relative top-[40px] left-[250px]' >
  <div 
  style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
  className='text-[74px] font-[AGENCYB]   '>
    {round?.roundName}
  </div>
 
  </div>
  
</div>
<div
  style={{ color: "black" }}
  className="text-[74px] font-[AGENCYB] mt-[110px] absolute   left-[1430px] w-[500px] "
>
  DAY {round?.day} MATCH {match?.matchNo}
</div>
</div>

<div
  style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#212121'
}, #000)`
  }}
 className='bg-black w-[820px] h-[50px] absolute top-[250px] left-[160px] flex text-[30px] font-[AGENCYB] text-white items-center 
 '>
<div className='flex left-[470px] relative'>
 <div className='ml-[50px]'>PLACE</div>
  <div className='ml-[50px]'>ELIMS</div>
  <div className='ml-[50px]'>TOTAL</div>
  </div>
  
 </div>
 <div className='w-[500px] absolute left-[157px]  top-[310px]'>
{leftTeams?.map((team, index) => {
  const topPosition = 310 + index * 64; // start from white box top=310px, 64px per row

  return (
    <motion.div
      key={team.teamId}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 1}}
      className=" left-[160px] w-[820px] h-[60px] flex items-center border border-black mb-[10px]"
      style={{ background: 'linear-gradient(to bottom right, #ffffff, #e0e0e0)' }}
    >
      <div 
        style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.primaryColor || '#212121'
}, #000)`
  }}
      className='w-[8%] h-[100%] bg-black text-white font-[AGENCYB] text-[38px] text-center'>
 {index + leftRankOffset}
      </div>
<div className='w-[50px] h-[50px] ml-[20px]'>
<img src={team.teamLogo} alt="" />

</div>
<div className='w-[400px] text-black font-[AGENCYB] text-[38px] text-left absolute left-[150px]'>

 <div className="">
        {team.teamTag}
      </div>
      </div>
      <div className='flex justify-end w-[1000px] absolute left-[-190px] gap-[40px]'>
      {/* WWCD icon */}
   {(team.wwcd || 0) > 0 && (
  <div className="w-[50px] h-full flex items-center justify-center ml-4">
    <img src="/theme4assets/chicken.png" alt="WWCD" className="w-[36px]" />
    <div className="text-[38px] font-[AGENCYB] flex items-center">
      <div className="text-[20px]">x</div>{team.wwcd}
    </div>
  </div>
)}

      {/* PLACE */}
      <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center ml-4">
        {team.placePoints}
      </div>

      {/* ELIMS */}
      <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center ml-4">
        {team.players.reduce((s, p) => s + (p.killNum || 0), 0)}
      </div>

      {/* TOTAL */}
      <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center ml-4">
        {team.total}
      </div>
      </div>
    </motion.div>
  );
})}
</div>
 
<div 
 style={{
   backgroundImage: `linear-gradient(135deg, ${
  tournament.secondaryColor || '#212121'
}, #000)`
  }}
className='bg-black w-[820px] h-[50px] absolute top-[250px] left-[1060px] flex text-[30px] font-[AGENCYB] text-white items-center '>
<div className='flex left-[470px] absolute'>
 <div className='ml-[50px]'>PLACE</div>
  <div className='ml-[50px]'>ELIMS</div>
  <div className='ml-[50px]'>TOTAL</div>
  </div>
  
  </div>
  {/* Second Column */}
<div className='w-[500px] absolute left-[1060px] top-[310px]'>
  {rightTeams?.map((team, index) => (
    <motion.div
      key={team.teamId}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 1 }}
      className="w-[820px] h-[60px] flex items-center border border-black mb-[10px]"
      style={{ background: 'linear-gradient(to bottom right, #ffffff, #e0e0e0)' }}
    >
      {/* Rank */}
      <div 
        style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#212121'}, #000)` }}
        className='w-[8%] h-[100%] bg-black text-white font-[AGENCYB] text-[38px] text-center'
      >
        {index + rightRankOffset}
      </div>

      {/* Team Logo */}
      <div className='w-[50px] h-[50px] ml-[20px]'>
        <img src={team.teamLogo} alt="" />
      </div>

      {/* Team Tag */}
      <div className='w-[400px] text-black font-[AGENCYB] text-[38px] text-left absolute left-[150px]'>
        {team.teamTag}
      </div>

      {/* Stats */}
      <div className='flex justify-end w-[1000px] absolute left-[-190px] gap-[40px]'>
        {(team.wwcd || 0) > 0 && (
          <div className="w-[50px] h-full flex items-center justify-center ml-4">
            <img src="/theme4assets/chicken.png" alt="WWCD" className="w-[36px]" />
            <div className="text-[38px] font-[AGENCYB] flex items-center">
              <div className="text-[20px]">x</div>{team.wwcd}
            </div>
          </div>
        )}

        {/* PLACE */}
        <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center ml-4">
          {team.placePoints}
        </div>

        {/* ELIMS */}
        <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center ml-4">
          {team.players.reduce((s, p) => s + (p.killNum || 0), 0)}
        </div>

        {/* TOTAL */}
        <div className="w-[60px] text-black font-[AGENCYB] text-[38px] text-center ml-4">
          {team.total}
        </div>
      </div>
    </motion.div>
  ))}
</div>

  </div>
 )
};


export default OverAllDataComponent;
