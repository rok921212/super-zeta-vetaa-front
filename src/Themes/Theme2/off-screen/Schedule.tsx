import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { isWinningPlacement } from '../../shared/hooks/officialStandings';
// NOTE: the own fetch(...) calls (rounds/:id/matches, selected-match, and
// one matchdata call per match) have been removed. PublicThemeRenderer
// always supplies `matches`/`matchDatas` as props now, so the teams-per-
// match zip is a pure derivation instead of an effect. The "UP NEXT" badge
// (needed a selected-match fetch not reproducible from props alone) has
// been dropped, mirroring the same simplification already made in
// Theme5/off-screen/Schedule.tsx.

interface Tournament {
  _id: string;
  tournamentName: string;
  primaryColor?: string;
  secondaryColor?: string;
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
  players: Player[];
  placePoints: number;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
  time?: string;
  map?: string;
  teams?: Team[];
}

interface ScheduleProps {
  tournament: Tournament;
  round?: Round | null;
  matches?: Match[];
  matchDatas?: any[];
  selectedScheduleMatches?: string[];
}

const getMapImage = (mapName?: string) => {
  switch (mapName?.toLowerCase()) {
    case "erangel":
      return "https://res.cloudinary.com/dqckienxj/image/upload/v1759656542/erag_ijugzi.png";
    case "miramar":
      return "https://res.cloudinary.com/dqckienxj/image/upload/v1759656542/miramar_leezqf.png";
    case "sanhok":
      return "https://res.cloudinary.com/dqckienxj/image/upload/v1759656543/sanhok_kojxj7.png";
    case "rondo":
      return "https://res.cloudinary.com/dqckienxj/image/upload/v1759656543/rondo_huj3bl.png";
   case "bermuda":
    return "https://res.cloudinary.com/dqckienxj/image/upload/v1761378444/brenuda_nr2qop.jpg"
     case "alpine":
    return "https://res.cloudinary.com/dqckienxj/image/upload/v1761361515/alpine_wfchbf.jpg"
     case "nexterra":
    return "https://res.cloudinary.com/dqckienxj/image/upload/v1761361420/nexterra_v0ivox.jpg"
     case "purgatory":
    return "https://res.cloudinary.com/dqckienxj/image/upload/v1761361420/purgatory1_frijhy.jpg"
     case "kalahari":
    return "https://res.cloudinary.com/dqckienxj/image/upload/v1761361420/kalahari_jrhc4o.jpg"
    default:
      return null;
  }
};

const Schedule: React.FC<ScheduleProps> = ({ tournament, round, matches: propMatches, matchDatas: propMatchDatas, selectedScheduleMatches }) => {
  const matches = useMemo<Match[]>(() => {
    if (!propMatches) return [];
    return propMatches.map((match, idx) => ({
      ...match,
      teams: propMatchDatas?.[idx]?.teams || []
    }));
  }, [propMatches, propMatchDatas]);

  const sortedMatches = useMemo(() => {
    // Filter to only selected matches if any are selected
    let filteredMatches = matches;
    if (selectedScheduleMatches && selectedScheduleMatches.length > 0) {
      filteredMatches = matches.filter(match => selectedScheduleMatches.includes(match._id));
    }

    // Remove duplicates by matchNo
    const uniqueMatches = filteredMatches.filter((match, index, self) =>
      index === self.findIndex(m => (m.matchNo || m._matchNo) === (match.matchNo || match._matchNo))
    );
    return uniqueMatches.sort((a, b) => (a.matchNo || a._matchNo || 0) - (b.matchNo || b._matchNo || 0));
  }, [matches, selectedScheduleMatches]);

  if (!round) {
    return (
      <div className="w-[1920px] h-[1080px]  text-white flex items-center justify-center">No round selected</div>
    );
  }

  return (
    <div className="w-[2200px] h-[1080px] relative overflow-hidden ">
      {/* Header */}
      <motion.div
        className="absolute z-10 top-[60px] text-[5rem] font-bebas font-[300] w-full text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <h1 className="text-white font-bold whitespace-pre text-[7rem]">TODAY'S SCHEDULE</h1>
        <motion.p
          className="text-white text-[2rem] font-[Righteous] whitespace-pre p-[10px] mt-[-20px] w-[800px] mx-auto"
          style={{ background: `linear-gradient(45deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})` }}
          animate={{ opacity: [0.9, 1, 0.9] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {tournament.tournamentName} • {round.roundName} • DAY {round.day}
        </motion.p>
      </motion.div>

      {/* Matches list */}
      <div className="absolute top-[220px] left-[0px] w-[2200px]">
    
        <div className="mt-[80px] flex flex-row flex-wrap gap-4 justify-center">
          {sortedMatches.map((m, idx) => (
            <motion.div
              key={m._id}
              className="w-[300px] h-[600px] flex  justify-center text-black font-bold bg-gradient-to-r from-[#cdcdcd] via-[#fbfbfb] to-[#afafaf] px-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.35 }}
            >
              <div className="text-center ">
                <div className="text-[3rem] font-bebas font-[300]  w-[300px] bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700]">
                  {`Match ${m.matchNo || m._matchNo || idx + 1}`}
                </div>
               <div className='w-[20px]'><img src={m.map} alt="" /></div>
                <div className="mb-2 h-[450px] bg-slate-400">

                  {getMapImage(m.map) ? (
                    <div className='w-[100%] h-[100%] relative'>
                        {/* Winner Logo in Middle */}
                        {(() => {
                          const winningTeams = m.teams?.filter(team => isWinningPlacement(team.placePoints, (team.players?.[0] as any)?.rank)) || [];
                          const hasWinner = winningTeams.length > 0;
                          return hasWinner ? (
                            <div className="absolute inset-0 flex items-center justify-center ">
                              
                              <img
                                src={winningTeams[0].teamLogo || "https://res.cloudinary.com/dqckienxj/image/upload/v1727161652/default_nuloh2.png"}
                                alt={winningTeams[0].teamTag}
                                className="w-[200px] h-[200px] z-20"
                              />
                                <div
                          className="absolute h-[350px] w-[300px] left-[0px] top-[100px] "
                          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.99), rgba(0,0,0,0))', pointerEvents: 'none' }}
                        ></div>
                            </div>
                          ) : null;
                        })()}

                        {/* Teams */}
                        <div className="space-y-2 absolute text-white bottom-0 left-0 right-0 p-2 z-30">
                          {m.teams && m.teams.filter(team => isWinningPlacement(team.placePoints, (team.players?.[0] as any)?.rank)).length > 0 ? (
                            m.teams.filter(team => isWinningPlacement(team.placePoints, (team.players?.[0] as any)?.rank)).map((team, teamIdx) => {
                              const totalKills = team.players.reduce((sum, p) => sum + (p.killNum || 0), 0);
                              return (
                                <div key={team.teamId} className="text-center">
                                  <div className="text-[1rem] font-[Righteous] text-white">
                                    <div className='text-[2rem] relative top-[-50px]' > KILLS <span 
                                    
                                    style={{ background: `linear-gradient(45deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})` }}
                                    className='p-[10px]'>{totalKills}</span></div>
                                 
                                   
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-[1.2rem] font-[Righteous] text-gray-300"></div>
                          )}
                        </div>

                      
                        <img
                          src={getMapImage(m.map)!}
                          alt={m.map || 'Map'}
                          className="w-[100%] h-[100%] object-fill z-20"
                        />
                    </div>

                  ) : (
                    <div className="text-[2rem] font-[Righteous]">Map: {m.map || '-'}</div>
                  )}
                </div>

                {(() => {
                  const winningTeams = m.teams?.filter(team => isWinningPlacement(team.placePoints, (team.players?.[0] as any)?.rank)) || [];
                  const hasWinner = winningTeams.length > 0;

                  let displayText = m.time || '-';
                  if (hasWinner) {
                    displayText = `BOOYAH | ${winningTeams[0].teamTag}`;
                  }

                  return (
                    <div
                      style={{ background: `linear-gradient(45deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})` }}
                      className="text-[3rem] font-bebas font-[300] mt-[-10px] text-white text-center h-[80px] pt-[5px]"
                    >
                      {displayText}
                    </div>
                  );
                })()}

              
              </div>
            </motion.div>
          ))}

          {sortedMatches.length === 0 && (
            <div className="w-full h-[200px] flex items-center justify-center text-white font-[Righteous] text-2xl">
              No matches scheduled
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Schedule;
