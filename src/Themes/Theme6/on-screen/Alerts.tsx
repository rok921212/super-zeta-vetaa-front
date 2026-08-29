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
  deadTeamList?: DeadTeamListEntry[];
}

// ─── Component ────────────────────────────────────────────────────────────────

const ALERT_DISPLAY_MS = 6000;

const Alerts: React.FC<AlertsProps> = ({ tournament, round, match, matchData, deadTeamList }) => {
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);
  const shownTeamsRef  = useRef<Set<string>>(new Set());
  const alertQueueRef  = useRef<DeadTeamListEntry[]>([]);
  const showingRef     = useRef(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertIdRef     = useRef(0);

  const [currentAlert, setCurrentAlert] = useState<DeadTeamListEntry | null>(null);
  const [showAlert, setShowAlert] = useState(false);

  // ── Advance the queue one at a time ──
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
