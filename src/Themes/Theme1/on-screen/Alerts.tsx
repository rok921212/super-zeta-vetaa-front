import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchData, DeadTeamListEntry, toAlertTeam } from '../../shared/hooks/unsortteams';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// the freshly-merged matchData + the ordered deadTeamList (from
// sortDeadTeamList) down as props. This component's ONLY job is to notice
// a new teamId appear in deadTeamList and queue one ELIMINATED card for
// it — the exact deadTeamList-driven pattern of Theme3/on-screen/Alerts.tsx.

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

const ALERT_DISPLAY_MS = 5000;

const Alerts: React.FC<AlertsProps> = ({ tournament, round, match, matchData, deadTeamList }) => {
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);
  const shownTeamsRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<DeadTeamListEntry[]>([]);
  const isShowingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertIdRef = useRef(0);

  const [showAlert, setShowAlert] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<DeadTeamListEntry | null>(null);

  const processQueue = useCallback(() => {
    if (isShowingRef.current || queueRef.current.length === 0) return;
    const next = queueRef.current.shift();
    if (!next) return;
    isShowingRef.current = true;
    alertIdRef.current += 1;
    setCurrentAlert(next);
    setShowAlert(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShowAlert(false);
      setCurrentAlert(null);
      timeoutRef.current = null;
      isShowingRef.current = false;
      setTimeout(processQueue, 300);
    }, ALERT_DISPLAY_MS);
  }, []);

  // New match → reset trackers and suppress alerts for teams that are
  // ALREADY in deadTeamList when this match's data first arrives.
  useEffect(() => {
    const incomingId = matchData?._id?.toString() ?? null;
    if (incomingId === matchDataIdRef.current) return;
    matchDataIdRef.current = incomingId;
    shownTeamsRef.current.clear();
    queueRef.current = [];
    isShowingRef.current = false;
    setShowAlert(false);
    setCurrentAlert(null);
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    (deadTeamList || []).forEach((t) => shownTeamsRef.current.add(t.teamId));
  }, [matchData?._id, deadTeamList]);

  // The ONLY place that decides "this team just got eliminated" — a new
  // teamId appearing in the ordered deadTeamList prop.
  useEffect(() => {
    if (!deadTeamList || deadTeamList.length === 0) return;
    let queued = false;
    deadTeamList.forEach((t) => {
      if (!shownTeamsRef.current.has(t.teamId)) {
        shownTeamsRef.current.add(t.teamId);
        queueRef.current.push(t);
        queued = true;
      }
    });
    if (queued) processQueue();
  }, [deadTeamList, processQueue]);

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

  const alertTeam = toAlertTeam(currentAlert, matchData);
  const alertPlayers = alertTeam ? alertTeam.players.filter(p => p.bHasDied) : [];

  return (
    <AnimatePresence>
      {showAlert && alertTeam && (
        <motion.div
          key={`alert-${alertIdRef.current}`}
          className="w-[1920px] h-[1080px] flex justify-center items-center relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0 }}
        >
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="paint0_linear_39_2" x1="959.5" y1="374" x2="959.5" y2="413" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFD700"/>
            <stop offset="0.211538" stopColor="#FFA500"/>
            <stop offset="0.418269" stopColor="#FFC300"/>
            <stop offset="0.721154" stopColor="#FFA500"/>
            <stop offset="1" stopColor="#FFD700"/>
          </linearGradient>
          <linearGradient id="paint1_linear_39_2" x1="959.5" y1="100" x2="959.5" y2="168" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFD700"/>
            <stop offset="0.211538" stopColor="#FFA500"/>
            <stop offset="0.418269" stopColor="#FFC300"/>
            <stop offset="0.721154" stopColor="#FFA500"/>
            <stop offset="1" stopColor="#FFD700"/>
          </linearGradient>
          <linearGradient id="dynamicGradient" x1="959.5" y1="202" x2="959.5" y2="374" gradientUnits="userSpaceOnUse">
            <stop stopColor={tournament.primaryColor || '#FF0000'}/>
            <stop offset="1" stopColor={tournament.secondaryColor || '#CC0000'}/>
          </linearGradient>
        </defs>
        {alertPlayers.map((player, index) => {
          const xPositions = [612, 791, 970, 1149];
          const x = xPositions[index];
          return (
            <motion.g key={`${player._id}-${index}`} initial={{ y: 172, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 172, opacity: 0 }} transition={{ duration: 0 }}>
              <path d={index === 0 ? "M612 245.212L634.054 202H697.992L770 202L767.31 374H612V245.212Z" :
                      index === 1 ? "M791 245.212L813.054 202H876.992L949 202L946.31 374H791V245.212Z" :
                      index === 2 ? "M970 245.212L992.054 202H1055.99L1128 202L1125.31 374H970V245.212Z" :
                      "M1149 245.212L1171.05 202H1234.99L1307 202L1304.31 374H1149V245.212Z"} fill="url(#dynamicGradient)"/>
              <image
                x={x + 10}
                y={212}
                width={138}
                height={162}
                xlinkHref={player.picUrl || "/def_char.png"}
                preserveAspectRatio="xMidYMid slice"
              />

            </motion.g>
          );
        })}
        <motion.rect x="612" y="374" height="39" fill="url(#paint0_linear_39_2)" initial={{ width: 0 }} animate={{ width: 695 }} exit={{ width: 0 }} transition={{ duration: 0 }} />
        {alertTeam && (
          <text
            x="720"
            y="395"
            textAnchor="start"
            dominantBaseline="middle"
            fontFamily="Righteous"
            fontSize="20"
            fontWeight="bold"
            fill="black"
          >
            <tspan>Team :</tspan>
            <tspan dx="15">{alertTeam.teamTag}</tspan>
            <tspan dx="30">Rank :</tspan>
            <tspan dx="10">{alertTeam.teamRank || 0}</tspan>
            <tspan dx="30">Kills :</tspan>
            <tspan dx="10">{alertTeam.totalKills}</tspan>
            <tspan dx="30">Points:</tspan>
            <tspan dx="10">{alertTeam.placePoints}</tspan>
          </text>
        )}
        <motion.rect x="791" y="100" width="337" height="68" fill="url(#paint1_linear_39_2)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }} />
        {alertTeam && (
          <motion.image xlinkHref={alertTeam.teamLogo || "/def_logo.png"} x={800 + 10} y={90 + 10} width={68} height={68} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0 }} />
        )}
        <motion.text
          x="990"
          y="140"
          fontFamily="Righteous"
          fontSize="40"
          fill="black"
          textAnchor="middle"
          dominantBaseline="middle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0 }}
        >

          ELIMINATED
        </motion.text>
      </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Alerts;
