import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// NOTE: SocketManager import removed — this component no longer opens its
// own socket subscription. PublicThemeRenderer owns the single socket
// connection, listens to 'bulkUpdate', and passes the freshly-merged
// matchData / deadTeamList down as props on every change. That prop update
// is what re-renders this component now.
//
// NOTE: this component no longer computes "who just died" itself. The
// backend's updateDeadTeamList() already decides that and attaches the
// result at matchData.deadTeamList (see Bulkpublic.controller.js) —
// PublicThemeRenderer just forwards it as the `deadTeamList` prop. Each
// entry already carries teamTag / teamLogo / rank / totalKills, so there's
// no need to re-derive anything from matchData.teams like the old
// mergeMatchPatch-based version did — this component's only job is to
// notice when a *new* teamId shows up in that list and queue an alert for
// it.

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

interface MatchData {
  _id: string;
  teams: any[];
}

// Shape of each entry in matchData.deadTeamList, as computed by the backend.
interface DeadTeamListEntry {
  teamId: string;
  teamTag: string;
  teamName: string;
  teamLogo: string;
  placePoints: number;
  rank: number;
  totalKills: number;
  deadAt: string;
}

interface AlertsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  deadTeamList?: DeadTeamListEntry[];
}

const Alerts: React.FC<AlertsProps> = ({ tournament, matchData, deadTeamList }) => {
  const [showAlert, setShowAlert] = useState<boolean>(false);
  const [currentAlertTeam, setCurrentAlertTeam] = useState<DeadTeamListEntry | null>(null);

  // Tracks the matchData._id we last saw, so a new match (as opposed to a
  // routine live update to the same match) can be told apart.
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() || null);
  // teamIds that have already triggered (or been suppressed from
  // triggering, e.g. because they were already in deadTeamList when this
  // match's data first arrived) an alert.
  const shownTeamsRef = useRef<Set<string>>(new Set());
  // Pending teams waiting to have their alert shown (handles multiple
  // simultaneous eliminations landing in one bulk update).
  const queueRef = useRef<DeadTeamListEntry[]>([]);
  const isShowingRef = useRef<boolean>(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertIdRef = useRef<number>(0);

  // ── Show the next queued elimination, if any, once the current one clears ──
  const processQueue = useCallback(() => {
    if (isShowingRef.current || queueRef.current.length === 0) return;
    const nextTeam = queueRef.current.shift();
    if (!nextTeam) return;

    isShowingRef.current = true;
    alertIdRef.current += 1;
    setCurrentAlertTeam(nextTeam);
    setShowAlert(true);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShowAlert(false);
      setCurrentAlertTeam(null);
      timeoutRef.current = null;
      isShowingRef.current = false;
      // small gap before the next one so exit/enter animations don't collide
      setTimeout(processQueue, 300);
    }, 5000);
  }, []);

  // ── New match detection ──────────────────────────────────────────────
  // When matchData._id changes, reset all tracking and suppress alerts for
  // teams that are ALREADY in deadTeamList at that point — only teamIds
  // that newly appear in the list *after* this should pop an alert.
  useEffect(() => {
    const incomingId = matchData?._id?.toString() || null;
    if (incomingId === matchDataIdRef.current) return;

    matchDataIdRef.current = incomingId;
    shownTeamsRef.current.clear();
    queueRef.current = [];
    isShowingRef.current = false;
    setShowAlert(false);
    setCurrentAlertTeam(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    (deadTeamList || []).forEach((team) => {
      shownTeamsRef.current.add(team.teamId);
    });
  }, [matchData?._id, deadTeamList]);

  // ── The ONLY place that decides "this team just got eliminated" ──
  // Driven purely by the deadTeamList prop PublicThemeRenderer pushes on
  // every 'bulkUpdate' — any teamId in the list that hasn't been shown yet
  // gets queued. Runs after the new-match effect above (same render order),
  // so a fresh match's already-dead teams are seeded into shownTeamsRef
  // before this ever sees them.
  useEffect(() => {
    if (!deadTeamList || deadTeamList.length === 0) return;
    let queued = false;
    deadTeamList.forEach((team) => {
      if (!shownTeamsRef.current.has(team.teamId)) {
        shownTeamsRef.current.add(team.teamId);
        queueRef.current.push(team);
        queued = true;
      }
    });
    if (queued) processQueue();
  }, [deadTeamList, processQueue]);

  if (!matchData) return null;

  return (
    <AnimatePresence mode="wait">
      {showAlert && currentAlertTeam && (
        <motion.div
          key={`alert-${alertIdRef.current}`}
          className="w-[1920px] h-[1080px] flex justify-center items-center relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <svg
            width="1920"
            height="1080"
            viewBox="0 0 3840 2160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            xmlnsXlink="http://www.w3.org/1999/xlink"
          >
            <defs>
              <linearGradient id="paint1_linear_2006_2" x1="1646" y1="570" x2="2395" y2="588">
                <stop stopColor={tournament.primaryColor || '#E01515'} />
                <stop offset="1" stopColor={tournament.secondaryColor || '#620505'} />
              </linearGradient>
            </defs>

            {/* STEP 1 — BLACK BOX */}
            <motion.rect
              x="1304"
              y="461"
              width="1187"
              height="275"
              fill="#000"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ scaleX: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              style={{ originX: 0.5 }}
            />

            {/* TEAM LOGO */}
            <image x="1016" y="460" width="896" height="275" xlinkHref={currentAlertTeam.teamLogo} />

            {/* STEP 2 — PURPLE BOX */}
            <motion.g
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: 0.4 }}
            >
              <path
                d="M1593 461L2491 461L2482 702.5L2452.5 736H1593V461Z"
                fill="url(#paint1_linear_2006_2)"
              />
              <text x="2015" y="668" fill="white" fontFamily="Bebas" fontSize="200" fontWeight="500">
                {currentAlertTeam.teamTag}
              </text>
            </motion.g>

            {/* STEP 3 — GOLD BOX */}
            <motion.g
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 200, opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: 0.9 }}
            >
              <path
                d="M2491 461V367L1632.5 371L1595 406L1595 461H2491Z"
                fill="#FFD000"
              />
              <text x="1725" y="443" fill="black" fontFamily="payBack" fontSize="84">
                {currentAlertTeam.totalKills} ELIMINATIONS
              </text>
            </motion.g>

            {/* RANK TEXT */}
            <text x="1675" y="668" fill="white" fontFamily="Bebas" fontSize="200" fontWeight="500">
              #{currentAlertTeam.rank}
            </text>
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Alerts;