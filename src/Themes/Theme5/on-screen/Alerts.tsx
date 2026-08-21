import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSortedTeams, MatchData, SortedTeam } from '../../shared/hooks/unsortteams';
// NOTE: SocketManager import removed, along with the six manual socket event
// handlers (handleLiveUpdate, handleMatchDataUpdate, handlePlayerUpdate,
// handleTeamPointsUpdate, handleTeamStatsUpdate, handleBulkTeamUpdate) and
// the localMatchData mirror they all wrote into. PublicThemeRenderer owns
// the single socket connection, listens to 'bulkUpdate', and passes
// freshly-merged `matchData` down as a prop on every change — this
// component now just reacts to that prop, same as the Theme2 conversion.
//
// Player / Team / MatchData / SortedTeam are imported from useSortedTeams
// rather than redeclared locally — duplicate same-named interfaces with
// different shapes are NOT the same type to TypeScript.

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

const ALERT_DISPLAY_MS = 6000;

const Alerts: React.FC<AlertsProps> = ({ tournament, round, match, matchData }) => {
  // Only tracked to detect "match changed" and reset trackers — no longer
  // mirrors matchData into its own state, we read the prop directly via
  // useSortedTeams below.
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);

  const shownTeamsRef = useRef<Set<string>>(new Set());
  // Teams this client has actually observed NOT-all-dead at some earlier
  // tick. A team can only queue an elimination alert if it's in this set —
  // this closes the race where stale/default player data (before a team's
  // first real live-stat write) can look "all dead" on the very first
  // computation, with no genuine alive tick ever having been witnessed.
  const everAliveRef = useRef<Set<string>>(new Set());
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertIdRef = useRef(0);

  const [showAlert, setShowAlert] = useState<boolean>(false);
  const [currentAlertTeam, setCurrentAlertTeam] = useState<SortedTeam | null>(null);
  const [displayedRank, setDisplayedRank] = useState<string>('');
  const [displayedKills, setDisplayedKills] = useState<string>('');
  const [displayedEliminated, setDisplayedEliminated] = useState<string>('');

  // 'live' → placePoints then kills, same in-match ranking this theme
  // always used. teamRank / totalKills / isAllDead come pre-derived from
  // the hook.
  const sortedTeams: SortedTeam[] = useSortedTeams(matchData, null, 'live');

  // ── Reset trackers when the match itself changes ──
  useEffect(() => {
    if (!matchData) return;
    const newId = matchData._id?.toString();
    if (newId !== matchDataIdRef.current) {
      matchDataIdRef.current = newId;
      shownTeamsRef.current.clear();
      everAliveRef.current.clear();
      setCurrentAlertTeam(null);
      setShowAlert(false);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, [matchData]);

  // ── Detect newly-eliminated teams off the (already-sorted, already-
  // derived) sortedTeams list every time it changes, instead of re-walking
  // raw matchData.teams inside six different socket handlers. Only one
  // alert shown at a time, same behavior as the original — the first
  // newly-eliminated team found replaces whatever's currently showing. ──
  useEffect(() => {
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
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => {
          setShowAlert(false);
          setCurrentAlertTeam(null);
          hideTimeoutRef.current = null;
        }, ALERT_DISPLAY_MS);
        break;
      }
    }
  }, [sortedTeams]);

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  }, []);

  // Re-resolve the alerting team against the latest sortedTeams each render
  // so rank/kills shown stay live for as long as the card is on screen,
  // falling back to the queued snapshot if it briefly drops out of the list.
  const alertTeam = useMemo(
    () => (currentAlertTeam ? sortedTeams.find(t => t._id === currentAlertTeam._id) ?? currentAlertTeam : null),
    [currentAlertTeam, sortedTeams]
  );

  // Typing animation effect (unchanged from the original theme5 markup)
  useEffect(() => {
    if (showAlert && alertTeam) {
      const rankText = `#${alertTeam.teamRank}`;
      const killsText = `${alertTeam.totalKills}`;
      const elimText = 'ELIMINATED';

      for (let i = 0; i <= rankText.length; i++) {
        setTimeout(() => setDisplayedRank(rankText.slice(0, i)), i * 100);
      }
      for (let i = 0; i <= killsText.length; i++) {
        setTimeout(() => setDisplayedKills(killsText.slice(0, i)), i * 100);
      }
      for (let i = 0; i <= elimText.length; i++) {
        setTimeout(() => setDisplayedEliminated(elimText.slice(0, i)), i * 100);
      }
    } else {
      setDisplayedRank('');
      setDisplayedKills('');
      setDisplayedEliminated('');
    }
  }, [showAlert, alertTeam]);

  if (!matchData) {
    return null;
  }

  const primaryColor = tournament.primaryColor || "#6b21a8"; // fallback purple
  const secondaryColor = tournament.secondaryColor || "#c084fc"; // fallback light purple

  // Animation variants for staggered effect
  const containerVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.5,
        staggerChildren: 0.15,
        delayChildren: 0.1
      }
    },
    exit: {
      opacity: 0,
      scale: 0.9,
      transition: { duration: 0.4 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30, x: -20 },
    visible: {
      opacity: 1,
      y: 0,
      x: 0,
      transition: {
        type: "spring" as const,
        stiffness: 300,
        damping: 25,
        duration: 0.6
      }
    }
  };

  const textVariants = {
    hidden: { opacity: 0, scale: 0.5 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        type: "spring" as const,
        stiffness: 400,
        damping: 20,
        duration: 0.4
      }
    }
  };

  const eliminationsVariants = {
    hidden: { opacity: 0, y: 50, scale: 0.8 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring" as const,
        stiffness: 350,
        damping: 22,
        duration: 0.5
      }
    }
  };

  return (
    <div className="w-[1920px] h-[1080px] text-white p-8 relative">
      <AnimatePresence mode="wait">
        {showAlert && alertTeam && (
          <motion.div
            key={`alert-${alertIdRef.current}`}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute top-[250px] left-[33%] p-[2px]"
            style={{
              background: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`,
            }}
          >
            <div className="w-[600px] h-[250px] bg-[#000000bb] overflow-hidden">
              {/* Header Bar - First element */}
              <motion.div
                variants={itemVariants}
                style={{
                  background: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`,
                }}
                className="w-full h-[70px] flex items-center justify-center"
              >
                <motion.div
                  variants={textVariants}
                  className="text-[50px] left-[-40px] relative font-[AGENCYB]"
                >
                  #{alertTeam.teamRank} POS
                </motion.div>
                <motion.div
                  variants={textVariants}
                  className="text-[50px] ml-[60px] font-[AGENCYB]"
                >
                  TEAM ELIMINATED
                </motion.div>
              </motion.div>

              {/* Team Logo Box - Second element */}
              <motion.div
                variants={itemVariants}
                className="w-1/3 h-[181px] flex items-center justify-center p-[3px]"
                style={{
                  border: `2px solid ${primaryColor}`,
                }}
              >
                <motion.div
                  variants={textVariants}
                  className="w-full h-full flex items-center justify-center overflow-hidden"
                >
                  {alertTeam.teamLogo ? (
                    <img
                      src={alertTeam.teamLogo}
                      alt={`${alertTeam.teamTag} Logo`}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <img
                      src="https://res.cloudinary.com/dqckienxj/image/upload/v1730785916/default_ryi6uf_edmapm.png"
                      alt="Default Logo"
                      className="max-w-full max-h-full object-contain"
                    />
                  )}
                </motion.div>
              </motion.div>

              {/* Team Tag Box - Third element */}
              <motion.div
                variants={itemVariants}
                className="w-[100%] flex items-center justify-center text-[30px] font-mono text-center"
              >
                <motion.div
                  variants={textVariants}
                  style={{
                    border: `2px solid ${primaryColor}`,
                  }}
                  className="left-[200px] text-green absolute w-[404px] top-[72px] h-[90px] pt-[7px] text-[3rem] font-[AGENCYB]"
                >
                  {alertTeam.teamTag}
                </motion.div>
              </motion.div>
            </div>

            {/* Eliminations Box - Fourth element */}
            <motion.div
              variants={eliminationsVariants}
              style={{
                background: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`,
              }}
              className="absolute w-[230px] left-[374px] top-[160px] h-[94px] font-[AGENCYB]"
            >
              <motion.div
                variants={textVariants}
                className="font-[500] text-4xl relative left-[30px] top-[25px] "
              >
                ELIMINATIONS
              </motion.div>
              <motion.div
                variants={textVariants}
                className="text-white absolute left-[-100px] top-[12px] text-6xl"
              >
                {alertTeam.totalKills}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Alerts;
