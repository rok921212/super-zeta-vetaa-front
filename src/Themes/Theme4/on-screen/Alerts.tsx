import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchData, DeadTeamListEntry, toAlertTeam } from '../../shared/hooks/unsortteams';
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
  deadTeamList?: DeadTeamListEntry[];
}

const ALERT_DISPLAY_MS = 6000;
const TYPE_STEP_MS = 100;

const Alerts: React.FC<AlertsProps> = ({ tournament, round, match, matchData, deadTeamList }) => {
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);
  const shownTeamsRef = useRef<Set<string>>(new Set());
  const alertQueueRef = useRef<DeadTeamListEntry[]>([]);
  const showingRef = useRef(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertIdRef = useRef(0);
  const typingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [currentAlert, setCurrentAlert] = useState<DeadTeamListEntry | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [displayedRank, setDisplayedRank] = useState<string>('');
  const [displayedKills, setDisplayedKills] = useState<string>('');
  const [displayedEliminated, setDisplayedEliminated] = useState<string>('');

  const clearTypingTimeouts = () => {
    typingTimeoutsRef.current.forEach(t => clearTimeout(t));
    typingTimeoutsRef.current = [];
  };

  // ── Advance the queue one at a time (this theme's own timing) ──
  const showNextAlert = useCallback(() => {
    if (showingRef.current) return;
    const next = alertQueueRef.current.shift();
    if (!next) return;

    showingRef.current = true;
    alertIdRef.current += 1;
    setCurrentAlert(next);
    setShowAlert(true);

    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setShowAlert(false);
      showingRef.current = false;
      setCurrentAlert(null);
      hideTimeoutRef.current = null;
      showNextAlert();
    }, ALERT_DISPLAY_MS);
  }, []);

  // ── New match → reset + suppress teams already in deadTeamList ──
  useEffect(() => {
    const incomingId = matchData?._id?.toString() ?? null;
    if (incomingId === matchDataIdRef.current) return;
    matchDataIdRef.current = incomingId;
    shownTeamsRef.current.clear();
    alertQueueRef.current = [];
    showingRef.current = false;
    setCurrentAlert(null);
    setShowAlert(false);
    if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
    clearTypingTimeouts();
    setDisplayedRank(''); setDisplayedKills(''); setDisplayedEliminated('');
    (deadTeamList || []).forEach((t) => shownTeamsRef.current.add(t.teamId));
  }, [matchData?._id, deadTeamList]);

  // ── The ONLY elimination trigger — a new teamId in the ordered
  // deadTeamList prop (append-only snapshot from sortDeadTeamList). ──
  useEffect(() => {
    if (!deadTeamList || deadTeamList.length === 0) return;
    let queued = false;
    deadTeamList.forEach((t) => {
      if (!shownTeamsRef.current.has(t.teamId)) {
        shownTeamsRef.current.add(t.teamId);
        alertQueueRef.current.push(t);
        queued = true;
      }
    });
    if (queued) showNextAlert();
  }, [deadTeamList, showNextAlert]);

  const alertTeam = useMemo(
    () => toAlertTeam(currentAlert, matchData),
    [currentAlert, matchData]
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
  }, [showAlert, currentAlert]);

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
