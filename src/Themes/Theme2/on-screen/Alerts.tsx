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
const EXIT_ANIM_MS = 450; // keep in sync with the motion.div transition duration below

const Alerts: React.FC<AlertsProps> = ({ tournament, round, match, matchData, deadTeamList }) => {
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);
  const shownTeamsRef = useRef<Set<string>>(new Set());
  const alertQueueRef = useRef<DeadTeamListEntry[]>([]);
  const showingRef = useRef(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertIdRef = useRef(0);

  const [currentAlert, setCurrentAlert] = useState<DeadTeamListEntry | null>(null);
  const [showAlert, setShowAlert] = useState(false);

  // ── Advance the alert queue one at a time (this theme's own two-phase
  // hide/exit timing — presentation, not shared logic) ──
  const showNextAlert = useCallback(() => {
    if (showingRef.current) return; // one at a time
    const next = alertQueueRef.current.shift();
    if (!next) return;

    showingRef.current = true;
    alertIdRef.current += 1;
    setCurrentAlert(next);
    setShowAlert(true);

    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setShowAlert(false);
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = setTimeout(() => {
        showingRef.current = false;
        setCurrentAlert(null);
        hideTimeoutRef.current = null;
        exitTimeoutRef.current = null;
        showNextAlert();
      }, EXIT_ANIM_MS);
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
    if (exitTimeoutRef.current) { clearTimeout(exitTimeoutRef.current); exitTimeoutRef.current = null; }
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