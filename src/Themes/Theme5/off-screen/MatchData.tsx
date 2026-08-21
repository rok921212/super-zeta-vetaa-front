import React, { useEffect, useMemo, useState } from 'react';
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
  day:string;
  apiEnable?: boolean;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
}

interface Player {
  _id: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;
  health: number;
  healthMax: number;
  liveState: number;
}

interface Team {
  _id: string;
  teamName : string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
  wwcd?: number;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchDataProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const MatchDataComponent: React.FC<MatchDataProps> = ({ tournament, round, match, matchData }) => {
  const sortedTeams = useMemo(() => {
  if (!matchData) return [];

  return matchData.teams
    .map(team => {
      const totalKills = team.players.reduce((sum, p) => sum + (p.killNum || 0), 0);
      const total = totalKills + team.placePoints;
      return { ...team, totalKills, total };
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;             // 1️⃣ total
      if (b.placePoints !== a.placePoints) return b.placePoints - a.placePoints; // 2️⃣ place points
      if ((b.wwcd || 0) !== (a.wwcd || 0)) return (b.wwcd || 0) - (a.wwcd || 0); // 3️⃣ WWCD
      return (b.totalKills || 0) - (a.totalKills || 0);              // 4️⃣ kills
    });
}, [matchData]);

  // Page toggle: show ranks 2–17 first, then the rest; switch every 25s
  const [page, setPage] = useState(1);
  const pageSize = 11;
  const totalPages = Math.ceil(sortedTeams.length / pageSize);

  useEffect(() => {
    const interval = setInterval(() => {
      setPage((prev) => (prev % totalPages) + 1);
    }, 20000);
    return () => clearInterval(interval);
  }, [sortedTeams, totalPages]);

  if (!matchData) {
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial', color: 'white' }}>
        No match data available
      </div>
    );
  }

  const topTeam = sortedTeams[0];
  const startIndex = (page - 1) * pageSize;
  const visibleData = sortedTeams.slice(startIndex, startIndex + pageSize);

  return (
    <div className="w-[1920px] h-[1080px] text-white p-8 ">
      <div className="w-full h-[30%]">
        <div
          className="px-6 py-2 font-[Awaking] tracking-wider text-[160px] leading-[1] absolute top-[50px] left-[190px] font-[700] bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text drop-shadow-[0px_7px_10px_rgba(0,0,0,0.3)] scale-y-[1.4]">
          MATCH STANDINGS
        </div>

        <div
          style={{
            backgroundImage: `linear-gradient(to left, transparent, ${tournament.primaryColor})`,
            clipPath: "polygon(30px 0%, 100% 0%, 100% 100%, 30px 100%, 0% 50%)",
          }}
          className="w-[1000px] h-[50px] absolute left-[240px] top-[260px] text-white font-[AGENCYB] font-[100] text-[2.5rem] tracking-wide"
        >
          <div className="relative top-[-5px] left-[50px]">
            {tournament.tournamentName} - {round?.roundName} - POST MATCH - {match?.matchNo}
          </div>
        </div>
      </div>

      <div className="w-full text-sm">
        {/* Header */}
        <div className="flex">
          <div className="w-[800px] text-black text-[1.8rem] bg-white h-[40px] relative mb-[10px] left-[30px] font-[supermolot] pl-[30PX] font-[700]">
            <div className="absolute top-[10px]">#</div>
            <div className="absolute top-[10px] left-[130px]">TEAM</div>
            <div className="absolute top-[10px] left-[370px]">WWCD</div>
            <div className="absolute top-[10px] left-[480px]">PLACE</div>
            <div className="absolute top-[10px] left-[600px]">KILLS</div>
            <div className="absolute top-[10px] left-[720px]">TOTAL</div>
          </div>
          <div className="w-[800px] text-black text-[1.8rem] bg-white h-[40px] relative mb-[10px] left-[160px] font-[supermolot] pl-[30PX] font-[700]">
            <div className="absolute top-[10px]">#</div>
            <div className="absolute top-[10px] left-[130px]">TEAM</div>
            <div className="absolute top-[10px] left-[370px]">WWCD</div>
            <div className="absolute top-[10px] left-[480px]">PLACE</div>
            <div className="absolute top-[10px] left-[600px]">KILLS</div>
            <div className="absolute top-[10px] left-[720px]">TOTAL</div>
          </div>
        </div>

        {/* 🥇 Top 1 Team Highlighted */}
        {sortedTeams.length > 0 && (
          <div className="grid grid-cols-7 text-center bg-[#000000c1] w-[1600px] h-[180px] left-[100px] ml-[100px] font-bold shadow-lg scale-[1.01] mb-2 mt-[10px] font-[AGENCYB]">
            <div className="flex relative top-[-86px] left-[60px]">
              {topTeam?.players.map((player, idx) => (
                <img
                  key={idx}
                  src={player.picUrl || "/def_char.avif"}
                  alt={player.playerName}
                  className="w-[200px] h-[200px] object-cover top-[65px] relative ml-[-60px]"
                />
              ))}

              <div className="text-white text-[55px] absolute left-[670px] top-[220px] font-russo">{topTeam?.teamTag}</div>
              {topTeam?.teamLogo ? (
                <img
                  src={topTeam.teamLogo}
                  alt={topTeam.teamName}
                  className="w-[150px] h-[150px] object-contain absolute left-[629px] top-[66px]"
                />
              ) : (
                <span className="text-gray-500">N/A</span>
              )}
              <div className="w-[100%] text-center">
                <div className="w-[80%] h-[2px] bg-white absolute left-[615px] top-[200px]"></div>
              </div>
            </div>

            <div className="flex flex-row gap-[70px] relative left-[700px] top-[50px] font-russo">
              <div className="text-[30px]">
                <div className="mb-[30px] flex gap-1">
                  {Number(topTeam?.placePoints) === 10 ? (
                    <img src="/chicken.avif" alt="WWCD" className="w-8 h-8 object-contain invert" />
                  ) : (
                    <span className='text-green-500'>wwcd</span>
                  )}
                </div>
          
              </div>
              <div className="text-[30px] ">
                <div className="mb-[30px] text-[50px]">{topTeam?.placePoints}</div>
                <div className="w-[110px] h-[2px] bg-white absolute left-[50px] top-[40px]"></div>
                <div className="ml-[7px]">PLACE</div>
              </div>
              <div className="text-[30px]">
                <div className="mb-[30px] text-[50px]">{topTeam?.totalKills}</div>
                <div className="w-[110px] h-[2px] bg-white absolute left-[200px] top-[40px]"></div>
                <div className="ml-[10px]">KILLS</div>
              </div>
              <div className="text-[30px]">
                <div className="mb-[30px] text-[50px]">{topTeam?.total}</div>
                <div className="w-[110px] h-[2px] bg-white absolute left-[330px] top-[40px]"></div>
                <div className="ml-[12px]">TOTAL</div>
              </div>
            </div>
          </div>
        )}

        {/* 🏅 Teams #2 and onward in grid-cols-2 layout */}
        <div className="grid grid-cols-2 gap-x-[-195px] gap-y-[10px] w-[100%] h-[100%] relative left-[30px] font-[AGENCYB]">
          {visibleData.slice(1).map((team, index) => (
            <motion.div
              key={`${page}-${index}`}
              className="w-[800px] h-[80px] flex items-center font-[AGENCYB] bg-[#000000c1] gap-x-1 p-2 text-[30px]"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                ease: "easeOut",
                delay: index * 0.2,
              }}
            >
              <div className="w-[5%] text-center pl-[20px] font-[AGENCYB]">{(page - 1) * pageSize + index + 2}</div>
              <div className="w-[25%] text-center pl-[20px] font-[AGENCYB]">{team.teamTag}</div>
              <div className="w-[10%] text-center pl-[20px]">
                {team.teamLogo ? (
                  <img
                    src={team.teamLogo}
                    alt={team.teamName}
                   
                    className="w-12 h-12 mx-auto object-contain"
                  />
                ) : (
                  <span className="text-gray-500">N/A</span>
                )}
              </div>
              <div className="w-[15%] text-center pl-[26px] flex justify-center">
                {Number(team.placePoints) === 10 ? (
                  <img src="/chicken.avif" alt="WWCD" className="w-6 h-6 object-contain" />
                ) : (
                  <span></span>
                )}
              </div>
              <div className="w-[15%] text-center pl-[20px]">{team.placePoints}</div>
              <div className="w-[15%] text-center pl-[20px]">{team.totalKills}</div>
              <div className="w-[15%] text-center pl-[20px]">{team.total}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MatchDataComponent;
