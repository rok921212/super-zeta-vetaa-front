import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSortedTeams } from '../../shared/hooks/unsortteams';
import { wwcdChance } from '../../shared/hooks/liveDerived';
// NOTE: SocketManager import removed, along with the six manual socket
// event handlers and the localMatchData mirror they wrote into.
// PublicThemeRenderer owns the single socket connection, listens to
// 'bulkUpdate', and passes freshly-merged `matchData` down as a prop on
// every change — this component now derives everything straight off that
// prop via useMemo, same as the Theme2 conversion.

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

  // Live stats fields
  health: number;
  healthMax: number;
  liveState: number; // 0 = knocked, 5 = dead, etc.
}

interface Team {
  _id: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo:string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}


interface UpperProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  backpackInfo?: any | null;
}

const Upper: React.FC<UpperProps> = ({ tournament, round, match, matchData, backpackInfo }) => {
  // Get top 5 teams by alive players — recalculated whenever the matchData
  // prop changes.
  // Shared ranking (placePoints then kills) + derived aliveCount / totalKills.
  const sortedTeams = useSortedTeams(matchData, null, 'live');

  // Top 5 teams that still have someone alive, with the shared WWCD gauge.
  const topTeams = useMemo(() => {
    const apiEnable = round?.apiEnable === true;
    return sortedTeams
      .filter(team => team.aliveCount > 0)
      .slice(0, 5)
      .map(team => ({ ...team, wwcd: wwcdChance(team, apiEnable) }));
  }, [sortedTeams, round?.apiEnable]);


  if (!matchData) {
    return (
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }

 return (
  <div className="w-[1920px] h-[1080px] absolute flex">
    <motion.div
      initial={{ opacity: 0, x: 500 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 1, delay: 1 }}
      className="w-[210px] h-[800px] relative top-[0px]"
    >
      <div className="mt-[5px] flex flex-row">
        {topTeams.map((team, index) => {
          const hasLiveState5 =
            team.players.length > 0 &&
            team.players.every((p: any) => parseInt(p.liveState, 10) === 5);

          return (
            <div
              key={team._id}
              style={{ marginLeft: index === 0 ? 0 : "299px" }}
              className={`flex text-white text-[1.7rem] border-b font-bebas-neue relative team-container justify-center scale-150 top-[30px] left-[60px]`}
            >
              <div className="z-10">
                {team.teamLogo && (
                  <img
                    src={team.teamLogo}
                    alt={`${team.teamTag} logo`}
                    className="absolute left-[0px] w-9 h-9"
                    style={{ opacity: hasLiveState5 ? 0.5 : 1 }}
                  />
                )}
              </div>

              <div
                style={{ opacity: hasLiveState5 ? 0.7 : 1 }}
                className="w-[130px] z-0 absolute left-[0px] bg-gradient-to-br from-[#ffffff] to-[#a5a5a5] text-black pl-[40px] text-left font-[payBack]"
              >
                {team.teamTag}
              </div>

              <div className="bg-[#00000086] pl-[7px] w-[80px] relative left-[130px]">
                {team.aliveCount === 0 ? (
                  <div className="w-[60px] flex justify-start gap-1 left-[10px] relative top-[2px] text-white font-[300]">
                    ELIM
                  </div>
                ) : (
                  <div className="w-[60px] flex justify-start gap-1 left-[10px] relative top-[-2px]">
                    {team.players.map((p: any, idx: number) => {
                      const health = parseInt(p.health || "0", 10);
                      const healthMax = parseInt(p.healthMax || "100", 10);
                      const liveState = parseInt(p.liveState, 10);
                      const maxHeight = 36;

                      let barColor = "";
                      if ([0, 1, 2, 3].includes(liveState)) {
                        barColor =
                          health === healthMax
                            ? "bg-gradient-to-r from-[#ffffff] to-[#c2c2c2]"
                            : "bg-yellow-400";
                      } else if (liveState === 4) {
                        barColor = "bg-red-600";
                      } else if (liveState === 5) {
                        barColor = "bg-gray-700";
                      } else {
                        barColor = "bg-transparent";
                      }

                      const barHeight =
                        liveState === 5 ? maxHeight : (health / healthMax) * maxHeight;

                      return (
                        <div
                          key={p._id}
                          className="mt-[4px]"
                          style={{
                            width: "10px",
                            height: `${maxHeight}px`,
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            className={barColor}
                            style={{
                              opacity: hasLiveState5 ? 0.8 : 1,
                              width: "100%",
                              height: `${barHeight}px`,
                              position: "absolute",
                              bottom: 0,
                              transition: "height 0.3s ease",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div
                  style={{
                    background: `linear-gradient(to right, ${tournament.primaryColor || '#6b21a8'}, ${tournament.secondaryColor || '#c084fc'})`,
                  }}
                  className="bg-black w-[210px] h-[40px] absolute right-[0px] mt-[5px] flex items-center"
                >
                  <img
                    className="w-[12%] absolute ml-[10px]"
                    src="https://res.cloudinary.com/dqckienxj/image/upload/v1753647336/bullet_lpm2no.png"
                    alt=""
                  />
                  <div className="ml-[30px] w-[1000px] left-[0px] text-white relative top-[0px] font-[payBack] flex text-[22px]">
                    TOTAL KILLS
                    <span className="font-[payBack] relative bg-white text-black w-[20%] text-center ml-[10px]">
                      {team.totalKills}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  </div>
 );
};

export default Upper;
