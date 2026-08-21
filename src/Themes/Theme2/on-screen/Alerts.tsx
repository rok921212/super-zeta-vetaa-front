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

// ─────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────
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
const EXIT_ANIM_MS = 450; // keep in sync with the motion.div transition duration below

const Alerts: React.FC<AlertsProps> = ({ tournament, round, match, matchData }) => {
  // Only tracked to detect "match changed" and reset the queue — no longer
  // mirrors matchData into its own state, we read the prop directly.
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);

  const shownTeamsRef = useRef<Set<string>>(new Set());
  // Teams this client has actually observed NOT-all-dead at some earlier
  // tick. A team can only queue an elimination alert if it's in this set —
  // this closes the race where stale/default player data (before a team's
  // first real live-stat write) can look "all dead" on the very first
  // computation, with no genuine alive tick ever having been witnessed.
  const everAliveRef = useRef<Set<string>>(new Set());
  const alertQueueRef = useRef<SortedTeam[]>([]);
  const currentAlertTeamRef = useRef<SortedTeam | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertIdRef = useRef(0);

  const [currentAlertTeam, setCurrentAlertTeam] = useState<SortedTeam | null>(null);
  const [showAlert, setShowAlert] = useState(false);

  // 'live' → placePoints then kills, same in-match ranking this theme
  // always used. teamRank / totalKills / isAllDead come pre-derived from
  // the hook, so the local sortedTeams useMemo that used to live here is
  // gone entirely.
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
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      hideTimeoutRef.current = null;
      exitTimeoutRef.current = null;
    }
  }, [matchData]);

  // ── Advance the alert queue one at a time (unchanged — this theme's own
  // presentation behavior, not shared derivation logic) ──
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
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = setTimeout(() => {
        currentAlertTeamRef.current = null;
        setCurrentAlertTeam(null);
        hideTimeoutRef.current = null;
        exitTimeoutRef.current = null;
        showNextAlert();
      }, EXIT_ANIM_MS);
    }, ALERT_DISPLAY_MS);
  }, []);

  // ── Detect newly-eliminated teams off the (already-sorted, already-
  // derived) sortedTeams list every time it changes, instead of re-walking
  // raw matchData.teams inside six different socket handlers. isAllDead
  // comes from the hook and requires liveState === 5 OR bHasDied === true
  // — health === 0 alone is never treated as death (a player who hasn't
  // received their first live-stat tick yet also sits at default health
  // 0, which is "no data yet," not "dead"). On top of that, a team must
  // have been observed NOT-all-dead at some earlier tick (everAliveRef)
  // before it's eligible to alert at all — this prevents stale/default
  // data from firing an alert the moment a team is first seen, with no
  // genuine alive tick ever witnessed. ──
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

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
  }, []);

  if (!matchData) return null;

  const primary = tournament.primaryColor || '#6b21a8';
  const secondary = tournament.secondaryColor || '#c084fc';

  // ── Render (unchanged from the original theme3 markup) ──
  return (
    <div className="w-[1920px] h-[1080px] text-white p-8 relative">
      <AnimatePresence>
  {showAlert && alertTeam && (
    <motion.div
      key={`alert-${alertIdRef.current}`}
      initial={{ x: -80, opacity: 0, rotateY: -15 }}
      animate={{ x: 0, opacity: 1, rotateY: 0 }}
      exit={{ x: -80, opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{ perspective: 800 }}
      className="w-[620px] h-[190px] absolute top-[60px] left-[60px]"
    >
      {/* depth layers */}
      <div
        style={{ backgroundColor: '#0a0a0d', clipPath: 'polygon(0 0, 92% 0, 100% 100%, 8% 100%)' }}
        className="absolute top-[14px] left-[14px] w-full h-full opacity-35"
      />
      <div
        style={{ backgroundColor: '#16161c', clipPath: 'polygon(0 0, 92% 0, 100% 100%, 8% 100%)' }}
        className="absolute top-[7px] left-[7px] w-full h-full opacity-60"
      />

      {/* main panel */}
      <div
        style={{ backgroundColor: '#101014', clipPath: 'polygon(0 0, 92% 0, 100% 100%, 8% 100%)' }}
        className="relative w-full h-full flex"
      >
        <div
          style={{ backgroundImage: `linear-gradient(180deg, ${primary}, ${secondary})`, clipPath: 'polygon(0 0, 100% 0, 60% 100%, 0 100%)' }}
          className="w-[10px] h-full flex-shrink-0"
        />

        <div className="w-[160px] h-full relative flex-shrink-0 flex items-center justify-center">
          <div
            style={{ backgroundImage: `linear-gradient(135deg, ${primary}, ${secondary})`, clipPath: 'polygon(15% 0, 100% 0, 85% 100%, 0 100%)' }}
            className="absolute w-[120px] h-[120px] shadow-[0_12px_24px_rgba(0,0,0,0.35)] overflow-hidden"
          >
            <img src={alertTeam.teamLogo} alt="" className="w-full h-full object-contain p-4" />
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center py-2 pr-9 pl-2 gap-[10px]">
          <span className="font-[TUNGSTEN] text-[34px] text-white leading-none tracking-wide">
            {(alertTeam.teamName || alertTeam.teamTag || '').toUpperCase()}
          </span>

          <div className="self-start">
            <div
              style={{ backgroundImage: `linear-gradient(90deg, ${primary}, ${secondary})`, clipPath: 'polygon(0 0, 100% 0, 94% 100%, 0 100%)' }}
              className="py-[5px] pl-[14px] pr-[26px]"
            >
              <span className="font-[AGENCYB] text-[13px] tracking-wider text-white">ELIMINATED</span>
            </div>
          </div>

          <div className="flex items-center gap-[22px] mt-[2px]">
            <span className="font-[AGENCYB] text-[15px] text-gray-300">RANK {alertTeam.teamRank}</span>
            <div className="w-px h-4 bg-[#35353d]" />
            <span className="font-[AGENCYB] text-[15px] text-gray-300">{alertTeam.totalKills} KILLS</span>
          </div>
        </div>
      </div>
    </motion.div>
  )}
</AnimatePresence>
    </div>
  );
};

export default Alerts;