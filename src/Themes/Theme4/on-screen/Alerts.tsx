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
const TYPE_STEP_MS = 100;

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
  const alertIdRef = useRef(0);
  const typingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [currentAlertTeam, setCurrentAlertTeam] = useState<SortedTeam | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [displayedRank, setDisplayedRank] = useState<string>('');
  const [displayedKills, setDisplayedKills] = useState<string>('');
  const [displayedEliminated, setDisplayedEliminated] = useState<string>('');

  // 'live' → placePoints then kills, same in-match ranking this theme
  // always used. teamRank / totalKills / isAllDead come pre-derived from
  // the hook, so the local sortedTeams useMemo that used to live here is
  // gone entirely.
  const sortedTeams: SortedTeam[] = useSortedTeams(matchData, null, 'live');

  const clearTypingTimeouts = () => {
    typingTimeoutsRef.current.forEach(t => clearTimeout(t));
    typingTimeoutsRef.current = [];
  };

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
      clearTypingTimeouts();
      setDisplayedRank('');
      setDisplayedKills('');
      setDisplayedEliminated('');
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

  // Typing animation — same visual behavior as before, just driven off the
  // resolved alertTeam instead of a socket-fed piece of state.
  useEffect(() => {
    clearTypingTimeouts();
    if (showAlert && alertTeam) {
      const rankText = `#${alertTeam.teamRank}`;
      const killsText = `${alertTeam.totalKills}`;
      const elimText = 'ELIMINATED';

      for (let i = 0; i <= rankText.length; i++) {
        typingTimeoutsRef.current.push(setTimeout(() => setDisplayedRank(rankText.slice(0, i)), i * TYPE_STEP_MS));
      }
      for (let i = 0; i <= killsText.length; i++) {
        typingTimeoutsRef.current.push(setTimeout(() => setDisplayedKills(killsText.slice(0, i)), i * TYPE_STEP_MS));
      }
      for (let i = 0; i <= elimText.length; i++) {
        typingTimeoutsRef.current.push(setTimeout(() => setDisplayedEliminated(elimText.slice(0, i)), i * TYPE_STEP_MS));
      }
    } else {
      setDisplayedRank('');
      setDisplayedKills('');
      setDisplayedEliminated('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAlert, currentAlertTeam]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    clearTypingTimeouts();
  }, []);

  if (!matchData) return null;

  return (
    <AnimatePresence mode="wait">
      {showAlert && (
        <motion.div
          key={`alert-${alertIdRef.current}`}
          className="w-[1920px] h-[1080px] flex justify-center items-center relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="alertGradient" x1="0" y1="0" x2="1920" y2="0">
                <stop stopColor={tournament.primaryColor || '#E01515'} />
                <stop offset="1" stopColor={tournament.secondaryColor || '#620505'} />
              </linearGradient>
            </defs>
            <path d="M689 236H1176C1206.38 236 1231 260.624 1231 291V475H689V236Z" fill="#f0f0f0"/>
            <rect x="697" y="354" width="515" height="3" fill="black"/>
            <image href={alertTeam?.teamLogo} width="150" height="150" x="857" y="220"/>

            <text fontFamily='AGENCYB' x="717" y="350" fill='url(#alertGradient)' fontSize={118}>{displayedRank}</text>
            <text fontFamily='AGENCYB' x="995" y="350" fill='black' fontSize={118}>{displayedKills}</text>
            <text fontFamily='AGENCYB' x="1080" y="350" fill='black' fontSize={68}>ELIMS</text>
            <text fontFamily='AGENCYB' x="727" y="460" fill='url(#alertGradient)' fontSize={118}>{displayedEliminated}</text>
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Alerts;
