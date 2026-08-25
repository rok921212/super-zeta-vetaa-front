import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSortedTeams, MatchData, SortedTeam } from '../../shared/hooks/unsortteams';
// NOTE: SocketManager import removed, along with the six manual socket
// event handlers (handleLiveUpdate, handleMatchDataUpdate, handlePlayerUpdate,
// handleTeamPointsUpdate, handleTeamStatsUpdate, handleBulkTeamUpdate) and the
// localMatchData mirror state they all wrote into. PublicThemeRenderer owns
// the single socket connection, listens to 'bulkUpdate', and passes the
// freshly-merged `matchData` down as a prop on every change — this component
// now just reacts to that prop, same as the Theme2 conversion of this file.
//
// Player / Team / MatchData / SortedTeam come from useSortedTeams instead of
// being redeclared locally — duplicate same-named interfaces with different
// shapes are unrelated types to TypeScript.

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

interface AlertsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const ALERT_DISPLAY_MS = 5000;

const Alerts: React.FC<AlertsProps> = ({ tournament, round, match, matchData }) => {
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);
  const shownTeamsRef = useRef<Set<string>>(new Set());
  // Teams observed NOT-all-dead at some earlier tick. A team can only alert
  // once it's in this set — closes the race where stale/default data (before
  // a team's first real live-stat write) can look "all dead" on the very
  // first tick, with no genuine alive tick ever having been witnessed.
  const everAliveRef = useRef<Set<string>>(new Set());
  const alertIdRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showAlert, setShowAlert] = useState(false);
  const [currentAlertTeam, setCurrentAlertTeam] = useState<SortedTeam | null>(null);

  // 'live' → placePoints then kills, same in-match ranking this theme
  // always used.
  const sortedTeams: SortedTeam[] = useSortedTeams(matchData, null, 'live');

  // Reset trackers when the match itself changes.
  useEffect(() => {
    if (!matchData) return;
    const newId = matchData._id?.toString();
    if (newId !== matchDataIdRef.current) {
      matchDataIdRef.current = newId;
      shownTeamsRef.current.clear();
      everAliveRef.current.clear();
      setCurrentAlertTeam(null);
      setShowAlert(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [matchData]);

  // Detect newly-eliminated teams off the already-sorted/derived
  // sortedTeams list every time it changes, instead of re-walking raw
  // matchData.teams inside six different socket handlers.
  useEffect(() => {
    if (currentAlertTeam) return; // one alert at a time, same as before

    for (const team of sortedTeams) {
      if (!team.isAllDead) {
        everAliveRef.current.add(team._id);
        continue;
      }
      if (everAliveRef.current.has(team._id) && !shownTeamsRef.current.has(team._id)) {
        shownTeamsRef.current.add(team._id);
        alertIdRef.current += 1;
        setCurrentAlertTeam(team);
        setShowAlert(true);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setShowAlert(false);
          setCurrentAlertTeam(null);
          timeoutRef.current = null;
        }, ALERT_DISPLAY_MS);
        break; // only queue one team per tick, matches original behavior
      }
    }
  }, [sortedTeams, currentAlertTeam]);

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  if (!matchData) {
    return (
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }

  const alertTeam = currentAlertTeam
    ? sortedTeams.find(t => t._id === currentAlertTeam._id) ?? currentAlertTeam
    : null;
  const alertPlayers = alertTeam ? alertTeam.players.filter(p => p.bHasDied) : [];

 return (
    <AnimatePresence>
      {showAlert && alertTeam && (
        <motion.div
          key={`alert-${alertIdRef.current}`}
          className="w-[1920px] h-[1080px] flex justify-center items-center relative "
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <style>{`
            @keyframes bannerSlideIn {
              0%   { transform: translateX(-40px); opacity: 0; }
              100% { transform: translateX(0);      opacity: 1; }
            }
            @keyframes cardPopIn {
              0%   { transform: scale(0.92) translateY(10px); opacity: 0; }
              100% { transform: scale(1)    translateY(0);    opacity: 1; }
            }
            @keyframes logoPopIn {
              0%   { transform: scale(0.5);  opacity: 0; }
              70%  { transform: scale(1.08); opacity: 1; }
              100% { transform: scale(1);    opacity: 1; }
            }
            @keyframes killsCountIn {
              0%   { transform: scale(0.6); opacity: 0; }
              60%  { transform: scale(1.12); opacity: 1; }
              100% { transform: scale(1);    opacity: 1; }
            }
            @keyframes playerSlideUp {
              0%   { transform: translateY(40px); opacity: 0; }
              100% { transform: translateY(0);     opacity: 1; }
            }
            @keyframes nameBarSlideIn {
              0%   { transform: translateX(30px); opacity: 0; }
              100% { transform: translateX(0);     opacity: 1; }
            }
          `}</style>

          <div
            style={{
              clipPath: 'polygon(0 0, calc(100% - 40px) 0, 100% 40px, 100% 100%, 0 100%)',
              animation: 'bannerSlideIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
            }}
            className="w-[340px] h-[50px] bg-white absolute top-[400px] left-[590px] font-[relidux] text-[28px] text-left pt-[3px]"
          >
            TEAM ELIMINATED
          </div>

          <div
            style={{
              background: `linear-gradient(
                135deg,
                ${tournament.primaryColor} 0%,
                ${tournament.secondaryColor} 100%
              )`,
              animation: 'cardPopIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both',
            }}
            className="relative w-[740px] h-[200px] overflow-hidden border border-white"
          >
            {/* Lines overlay */}
            <img
              src="/lines.png"
              alt=""
              className="absolute inset-0 z-10 w-full h-full object-cover pointer-events-none scale-[3]"
              style={{
                mixBlendMode: 'overlay',
                opacity: 0.7,
              }}
            />

            {/* Primary color section */}
            <div className="relative h-full w-[27%] overflow-hidden">
              {/* Primary background */}
              <div
                style={{
                  background: tournament.primaryColor,
                }}
                className="absolute inset-0"
              />

              {/* Black overlay */}
              <div className="absolute inset-0 bg-black/70" />

              {/* Team logo — animated wrapper, static img (fixes post-animation blur) */}
              <div
                className="absolute left-[10px] top-[10px] w-[180px] h-[180px] -translate-x-1/2 -translate-y-1/2"
                style={{
                  animation: 'logoPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both',
                }}
              >
                <img
                  src={alertTeam.teamLogo}
                  alt={alertTeam.teamName}
                  className="w-full h-full object-contain"
                  style={{
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                  }}
                />
              </div>
            </div>

            <div
              className="absolute top-3 left-[240px] text-white font-[IMPACT] flex flex-col items-center leading-none"
              style={{
                animation: 'killsCountIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) 0.25s both',
              }}
            >
              <span className="text-[150px]">
                1{alertTeam.totalKills}
              </span>

              <span className="font-[RELIDUX] text-[20px] mt-[-5px] text-left">
                KILLS
              </span>
            </div>

            {/* 4 Players at the right end — animated wrapper, static img (fixes post-animation blur) */}
            <div className="absolute right-0 bottom-0 h-full w-[200px] z-20">
              {alertPlayers.slice(0, 4).map((player, index) => (
                <div
                  key={`${player._id}-${index}`}
                  className="absolute bottom-0 h-[170px] w-[160px]"
                  style={{
                    right: `${index * 65}px`,
                    zIndex: 4 - index,
                    animation: `playerSlideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${0.15 + index * 0.08}s both`,
                  }}
                >
                  <img
                    src={player.picUrl || '/def_char.avif'}
                    alt={player.name || 'Player'}
                    className="h-full w-full"
                    style={{
                      transform: 'translateZ(0)',
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                    }}
                  />
                </div>
              ))}
            </div>

            <div
              style={{ clipPath: 'polygon(50px 0, 100% 0, 100% 100%, 0 100%, 0 50px)' }}
              className="w-[45%] h-[18%] absolute bottom-0 left-[410px] z-30 bg-gradient-to-r from-white via-gray-300 to-white"
            >
              <span
                className="text-black text-[22px] top-[2px] absolute left-[70px] font-[RELIDUX]"
                style={{
                  animation: 'nameBarSlideIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both',
                }}
              >
                #{alertTeam.teamRank} - <span style={{ color: tournament.primaryColor }}>{alertTeam.teamName}</span>
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Alerts;
