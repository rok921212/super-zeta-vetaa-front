import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSortedTeams, MatchData, SortedTeam } from '../../shared/hooks/unsortteams';
// NOTE: SocketManager import removed, along with the six manual event
// handlers (handleLiveUpdate, handleMatchDataUpdate, handlePlayerUpdate,
// handleTeamPointsUpdate, handleTeamStatsUpdate, handleBulkTeamUpdate) and
// the localMatchData mirror state they all wrote into. PublicThemeRenderer
// owns the single socket connection, listens to 'bulkUpdate', and passes
// freshly-merged `matchData` down as a prop on every change — this
// component now just reacts to that prop, same as the Theme2 conversion.
//
// Player / Team / MatchData / SortedTeam are imported from useSortedTeams
// rather than redeclared locally — duplicate same-named interfaces with
// different shapes are NOT the same type to TypeScript.

// ─── Types ────────────────────────────────────────────────────────────────────

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
  deadTeamList?: any[];
}

// ─── Component ────────────────────────────────────────────────────────────────

const ALERT_DISPLAY_MS = 6000;

const Alerts: React.FC<AlertsProps> = ({ tournament, round, match, matchData }) => {
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);

  const shownTeamsRef  = useRef<Set<string>>(new Set());
  // Teams this client has actually observed NOT-all-dead at some earlier
  // tick. A team can only queue an elimination alert if it's in this set —
  // this closes the race where stale/default player data (before a team's
  // first real live-stat write) can look "all dead" on the very first
  // computation, with no genuine alive tick ever having been witnessed.
  const everAliveRef   = useRef<Set<string>>(new Set());
  const alertQueueRef  = useRef<SortedTeam[]>([]);
  const currentAlertTeamRef = useRef<SortedTeam | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertIdRef     = useRef(0);

  const [currentAlertTeam, setCurrentAlertTeam] = useState<SortedTeam | null>(null);
  const [showAlert, setShowAlert] = useState(false);

  // 'live' → placePoints then kills, same in-match ranking this theme
  // always used. teamRank / totalKills / isAllDead come pre-derived from
  // the hook.
  const sortedTeams: SortedTeam[] = useSortedTeams(matchData, null, 'live');

  // ── Reset queue when the match itself changes ──
  useEffect(() => {
    if (!matchData) return;
    const newId = matchData._id?.toString();
    if (newId !== matchDataIdRef.current) {
      matchDataIdRef.current = newId;
      shownTeamsRef.current.clear();
      everAliveRef.current.clear();
      alertQueueRef.current = [];
      currentAlertTeamRef.current = null;
      setCurrentAlertTeam(null);
      setShowAlert(false);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, [matchData]);

  // ── Advance the alert queue one at a time ──
  const showNextAlert = useCallback(() => {
    if (currentAlertTeamRef.current) return; // one at a time
    const next = alertQueueRef.current.shift();
    if (!next) return;

    alertIdRef.current += 1;
    currentAlertTeamRef.current = next;
    setCurrentAlertTeam(next);
    setShowAlert(true);

    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setShowAlert(false);
      currentAlertTeamRef.current = null;
      setCurrentAlertTeam(null);
      hideTimeoutRef.current = null;
      showNextAlert();
    }, ALERT_DISPLAY_MS);
  }, []);

  // ── Detect newly-eliminated teams off the (already-sorted, already-
  // derived) sortedTeams list every time it changes, instead of re-walking
  // raw matchData.teams inside six different socket handlers. isAllDead
  // comes from the hook and requires liveState === 5 OR bHasDied === true
  // — health === 0 alone is never treated as death. A team must also have
  // been observed NOT-all-dead at some earlier tick (everAliveRef) before
  // it's eligible to alert at all. ──
  useEffect(() => {
    for (const team of sortedTeams) {
      if (!team.isAllDead) {
        everAliveRef.current.add(team._id);
        continue;
      }
      if (everAliveRef.current.has(team._id) && !shownTeamsRef.current.has(team._id)) {
        shownTeamsRef.current.add(team._id);
        alertQueueRef.current.push(team);
      }
    }
    showNextAlert();
  }, [sortedTeams, showNextAlert]);

  // Re-resolve the alerting team against the latest sortedTeams each render
  // so rank/kills shown stay live for as long as the card is on screen,
  // falling back to the queued snapshot if it briefly drops out of the list.
  const alertTeam = useMemo(
    () => (currentAlertTeam ? sortedTeams.find(t => t._id === currentAlertTeam._id) ?? currentAlertTeam : null),
    [currentAlertTeam, sortedTeams]
  );

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  }, []);

  if (!matchData) return null;

  const primary   = tournament.primaryColor  || '#6b21a8';
  const secondary = tournament.secondaryColor || '#c084fc';

  // ── Render (unchanged from the original markup) ──
return (
  <div className="w-[1920px] h-[1080px] text-white p-8 relative">
    <AnimatePresence>
      {showAlert && alertTeam && (
        <motion.div
          key={`alert-${alertIdRef.current}`}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
          className="w-[600px] h-[180px] bg-black absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]"
        >
          <div className="w-full h-full relative">

            {/* LEFT PANEL */}
            <div
              style={{
                backgroundImage: `linear-gradient(to left top, ${primary}, ${secondary})`,
              }}
              className="w-[30%] h-full"
            />



            {/* Logo + Background Logo */}
            <div className="absolute top-[5px] w-[180px] h-[180px]">

              {/* Background logo */}
              <img
                src={alertTeam.teamLogo}
                alt=""
                className="absolute inset-0 w-full h-full object-contain grayscale opacity-10"
              />

              {/* Main logo */}
              <img
                src={alertTeam.teamLogo}
                alt=""
                className="w-full h-full object-contain relative z-10"
              />
            </div>

            {/* RIGHT PANEL */}
            <div
              className="w-[70%] h-full absolute top-0 left-[180px] text-center"
              style={{
                backgroundImage: `linear-gradient(to bottom right, ${primary}, ${secondary})`,
              }}
            >

              {/* TOP BAR (Team Name) */}
              <div
                style={{
                  backgroundImage: `url('/theme3assets/lines.avif')`,
                  backgroundSize: '300px',
                  backgroundRepeat: 'repeat',
                }}
                className="w-full h-[25%] bg-black relative overflow-hidden font-[AGENCYB] text-[30px]"
              >
                RANK {alertTeam.teamRank} - {alertTeam.totalKills} KILLS
              </div>

              {/* TEAM TAG */}
              <div className="font-[TUNGSTEN] text-[70px]">
               {(alertTeam.teamName || alertTeam.teamTag || '').toUpperCase()}
              </div>

              {/* BOTTOM BAR */}
              <div
                style={{
                  backgroundImage: `url('/theme3assets/lines.avif')`,
                  backgroundSize: '300px',
                  backgroundRepeat: 'repeat',
                }}
                className="w-full h-[25%] bg-black absolute top-[133px] font-[AGENCYB] text-[38px]"
              >
                <div className="relative top-[-7px]">TEAM ELIMINATED</div>
              </div>

              {/* EXTRA INFO */}


            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);
};

export default Alerts;
