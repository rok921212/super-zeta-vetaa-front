import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchData, DeadTeamListEntry, toAlertTeam } from '../../shared/hooks/unsortteams';
import { TeamLogo } from '../../shared/components/TeamLogo';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// the freshly-merged matchData + the ordered deadTeamList (from
// sortDeadTeamList) down as props. This component's ONLY job is to notice
// a new teamId appear in deadTeamList and queue one ELIMINATED card for
// it — the exact deadTeamList-driven pattern of Theme3/on-screen/Alerts.tsx.
//
// THEME8 "WHITE LABEL" — same family as the Lower third / Live Stats:
//   ink tab ("TEAM ELIMINATED") → white plate (grey logo panel, rank + team
//   name in heavy ink, fallen player names) → secondary sliver → solid
//   primary block with the kill count. Flat colour, one shared cut angle.
//   Player photos removed.
//
// Motion — layered wipes, all left → right in, right → left out:
//   IN   1) white plate opens, tournament logo pops in the middle
//        2) solid primary panel wipes over it (secondary leading edge)
//        3) info card wipes over that (ink leading edge), details settle
//   OUT  3 → 2 → 1 retract in reverse order, then the alert unmounts.
//
// PREVIEW: a "Preview alert" button sits just OUTSIDE the 1920×1080 canvas
// (x ≥ 1940), so a 1920×1080 browser source never shows it. Clicking it
// queues one dummy alert through the same queue as real ones, so you see
// the exact placement and timing. Works with or without live match data.

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

/** What the card renders — shape of toAlertTeam()'s result that we use. */
interface AlertView {
  teamName: string;
  teamLogo?: string;
  teamFlag?: string;
  totalKills: number;
  teamRank: number | string;
  players: { _id?: string; name?: string; playerName?: string; bHasDied?: boolean }[];
}

type QueueItem = { kind: 'real'; entry: DeadTeamListEntry } | { kind: 'demo'; team: AlertView };

// 6.5s total: ~1.8s two-step intro, ~3.4s info on screen, ~1.3s reverse outro
const ALERT_DISPLAY_MS = 6500;

/* ── dummy alert used by the preview button ── */
const DEMO_TEAM: AlertView = {
  teamName: 'DUMMY ESPORTS',
  teamLogo: '/def_logo.png',
  totalKills: 7,
  teamRank: 12,
  players: [
    { _id: 'd1', name: 'VIPER', bHasDied: true },
    { _id: 'd2', name: 'SHADOW', bHasDied: true },
    { _id: 'd3', name: 'KRYPTO', bHasDied: true },
    { _id: 'd4', name: 'NEXUS', bHasDied: true },
  ],
};

/* ── palette + type (shared with Lower third / Live Stats) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const PANEL = '#EFEFF2';
const DIM = '#8A8A93';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const PLATE_W = 860;
const PLATE_H = 160;
const TAB_H = 44;
const SLANT = 30; // every diagonal shares this run over PLATE_H
const SLIVER = 8;
const GAP = 5;
const lean = (s: number) => `polygon(${s}px 0, 100% 0, calc(100% - ${s}px) 100%, 0 100%)`;

function toRgb(hex: string): [number, number, number] {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* black or white — whichever reads better on the given colour */
function inkOn(hex: string): string {
  const L = toRgb(hex)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  return L > 0.45 ? INK : WHITE;
}

/* kill number counts up 0 → n once the block has landed */
function useCountUp(target: number, delayMs: number, durMs: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delayMs;
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - start) / durMs));
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, delayMs, durMs]);
  return v;
}

const KEYFRAMES = `
@keyframes al8SlideL  { from { transform: translateX(-24px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes al8SlideR  { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes al8Pop     { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
@keyframes al8Rise    { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
.al8-tlogo { animation: al8Pop .5s cubic-bezier(.34,1.56,.64,1) .2s both; }
.al8-logo  { animation: al8Pop .45s cubic-bezier(.34,1.56,.64,1) .15s both; }
.al8-name  { animation: al8SlideL .4s cubic-bezier(.2,.8,.2,1) .2s both; }
.al8-meta  { animation: al8Rise .35s cubic-bezier(.2,.8,.2,1) .35s both; }
.al8-kills { animation: al8SlideR .4s cubic-bezier(.2,.8,.2,1) .1s both; }
@media (prefers-reduced-motion: reduce) {
  .al8-tlogo, .al8-logo, .al8-name, .al8-meta, .al8-kills { animation: none; }
}
`;

/* ─────────────────────────────────────────────
   The card
   ───────────────────────────────────────────── */
const EliminatedCard: React.FC<{ team: AlertView; primary: string; secondary: string }> = ({
  team,
  primary,
  secondary,
}) => {
  const kills = useCountUp(Number(team.totalKills) || 0, 300, 600);
  const onPrimary = inkOn(primary);
  const fallen = team.players
    .filter((p) => p.bHasDied !== false)
    .map((p) => (p.name || p.playerName || '').toUpperCase())
    .filter(Boolean)
    .slice(0, 4);
  const name = (team.teamName || '').toUpperCase();
  const nameSize = name.length <= 10 ? 76 : name.length <= 15 ? 64 : name.length <= 20 ? 52 : 42;

  return (
    <div style={{ position: 'relative', width: PLATE_W }}>
      {/* ── ink tab ── */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 14,
          height: TAB_H,
          padding: `0 ${SLANT + 26}px 3px 22px`,
          boxSizing: 'border-box',
          background: INK,
          position: 'relative',
          clipPath: `polygon(10px 0, calc(100% - 14px) 0, 100% 100%, 0 100%, 0 10px)`,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: '0.14em',
          color: WHITE,
          lineHeight: 1,
        }}
      >
        <span style={{ width: 11, height: 11, background: primary, flex: 'none' }} />
        TEAM ELIMINATED
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: primary }} />
      </div>

      {/* ── white plate ── */}
      <div
        style={{
          position: 'relative',
          height: PLATE_H,
          background: WHITE,
          clipPath: `polygon(0 0, 100% 0, calc(100% - ${SLANT}px) 100%, 0 100%)`,
          display: 'flex',
          alignItems: 'stretch',
          fontFamily: FONT,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {/* logo panel */}
        <div
          style={{
            flex: 'none',
            width: 190,
            background: PANEL,
            clipPath: `polygon(0 0, 100% 0, calc(100% - ${SLANT}px) 100%, 0 100%)`,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `0 ${SLANT + 12}px 0 26px`,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: primary }} />
          <div className="al8-logo" style={{ width: 112, height: 112, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TeamLogo
              logo={team.teamLogo}
              flag={team.teamFlag}
              alt={team.teamName}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'grayscale(0.15)' }}
            />
          </div>
        </div>

        {/* rank + name + fallen players */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 28px 0 18px',
          }}
        >
          <div className="al8-meta" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                background: INK,
                color: WHITE,
                fontSize: 22,
                padding: '4px 10px 3px',
                letterSpacing: '0.06em',
              }}
            >
              #{team.teamRank}
            </span>
            <span style={{ fontSize: 20, letterSpacing: '0.2em', color: DIM }}>PLACE</span>
          </div>

          <div
            className="al8-name"
            style={{
              fontSize: nameSize,
              color: INK,
              marginTop: 10,
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </div>

          {fallen.length > 0 && (
            <div
              className="al8-meta"
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 19,
                letterSpacing: '0.08em',
                color: DIM,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              {fallen.map((n, i) => (
                <React.Fragment key={n + i}>
                  {i > 0 && <span style={{ width: 4, height: 4, background: primary, flex: 'none' }} />}
                  <span style={{ textDecoration: 'line-through', textDecorationThickness: 2 }}>{n}</span>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* secondary sliver */}
        <div style={{ flex: 'none', width: SLANT + SLIVER, background: secondary, clipPath: lean(SLANT) }} />

        {/* kills block */}
        <div
          className="al8-kills"
          style={{
            flex: 'none',
            width: 190,
            marginLeft: -SLANT + GAP,
            background: primary,
            clipPath: lean(SLANT),
            color: onPrimary,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingRight: SLANT / 2,
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontSize: 104, lineHeight: 0.85, fontVariantNumeric: 'tabular-nums' }}>{kills}</span>
          <span style={{ fontSize: 20, letterSpacing: '0.3em', marginTop: 8, paddingLeft: '0.3em', opacity: 0.9 }}>
            ELIMS
          </span>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   AlertSequence — the two-step layered wipe around the card
   ───────────────────────────────────────────── */
const WIPE_MS = 450;
const WIPE_EASE = 'cubic-bezier(.7,0,.2,1)';
const EDGE_SKEW = `skewX(${-Math.atan(SLANT / PLATE_H) * (180 / Math.PI)}deg)`; // matches the plate cut
// timeline (ms from mount)
const T_PLATE = 30;
const T_THEME = 850;
const T_INFO = 1350;
const OUTRO_MS = 1500; // info out → theme out → (logo beat) → plate out

/** A layer whose visible width grows/shrinks from the left, with an optional
 *  leading-edge bar that rides the wipe. Content is pinned to full width so
 *  it is revealed, not squashed. */
const WipeLayer: React.FC<{
  open: boolean;
  edge?: string;
  top?: number;
  height: number;
  clip?: string;
  children: React.ReactNode;
}> = ({ open, edge, top = 0, height, clip, children }) => (
  <div style={{ position: 'absolute', left: 0, top, width: PLATE_W, height, clipPath: clip }}>
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        height: '100%',
        width: open ? '100%' : '0%',
        overflow: 'hidden',
        transition: `width ${WIPE_MS}ms ${WIPE_EASE}`,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: PLATE_W, height: '100%' }}>{children}</div>
      {edge && (
        <div
          style={{
            opacity: open ? 1 : 0,
            // appear at once when opening; vanish only after the wipe has closed
            transition: `opacity 120ms linear ${open ? 0 : WIPE_MS}ms`,
            position: 'absolute',
            right: 0,
            top: -10,
            bottom: -10,
            width: 12,
            background: edge,
            transform: EDGE_SKEW,
            transformOrigin: 'center',
          }}
        />
      )}
    </div>
  </div>
);

const AlertSequence: React.FC<{
  team: AlertView;
  primary: string;
  secondary: string;
  torLogo?: string;
  displayMs: number;
}> = ({ team, primary, secondary, torLogo, displayMs }) => {
  const [o1, setO1] = useState(false); // white plate + tournament logo
  const [o2, setO2] = useState(false); // theme panel
  const [o3, setO3] = useState(false); // info card
  const [infoMounted, setInfoMounted] = useState(false);
  const [logoMounted, setLogoMounted] = useState(false); // stays mounted through the outro

  useEffect(() => {
    const close = displayMs - OUTRO_MS - 150;
    const ts = [
      setTimeout(() => {
        setLogoMounted(true);
        setO1(true);
      }, T_PLATE),
      setTimeout(() => setO2(true), T_THEME),
      setTimeout(() => {
        setInfoMounted(true);
        requestAnimationFrame(() => setO3(true));
      }, T_INFO),
      setTimeout(() => setO3(false), close),
      setTimeout(() => setO2(false), close + 450),
      setTimeout(() => setO1(false), close + 1000),
    ];
    return () => ts.forEach(clearTimeout);
  }, [displayMs]);

  const plateClip = `polygon(0 0, 100% 0, calc(100% - ${SLANT}px) 100%, 0 100%)`;

  return (
    <div
      style={{
        position: 'relative',
        width: PLATE_W,
        height: TAB_H + PLATE_H,
        filter: o1 ? 'drop-shadow(0 18px 36px rgba(0,0,0,0.4))' : 'none',
        transition: 'filter .3s ease',
      }}
    >
      {/* step 1 — white plate with tournament logo */}
      <WipeLayer open={o1} top={TAB_H} height={PLATE_H} clip={plateClip} edge={INK}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: WHITE,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingRight: SLANT,
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: primary }} />
          {logoMounted && (
            <img
              className="al8-tlogo"
              src={torLogo || '/def_logo.png'}
              alt=""
              style={{ maxHeight: 118, maxWidth: 260, objectFit: 'contain', display: 'block' }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/def_logo.png';
              }}
            />
          )}
        </div>
      </WipeLayer>

      {/* step 2 — full theme colour */}
      <WipeLayer open={o2} top={TAB_H} height={PLATE_H} clip={plateClip} edge={secondary}>
        <div style={{ position: 'absolute', inset: 0, background: primary }} />
      </WipeLayer>

      {/* step 3 — the info card (tab + plate) */}
      <WipeLayer open={o3} height={TAB_H + PLATE_H} edge={INK}>
        {infoMounted && <EliminatedCard team={team} primary={primary} secondary={secondary} />}
      </WipeLayer>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Alerts — queue logic unchanged; demo items share the same queue.
   ───────────────────────────────────────────── */
const Alerts: React.FC<AlertsProps> = ({ tournament, matchData, deadTeamList }) => {
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);
  const shownTeamsRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<QueueItem[]>([]);
  const isShowingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertIdRef = useRef(0);

  const [showAlert, setShowAlert] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<QueueItem | null>(null);

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
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
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
        queueRef.current.push({ kind: 'real', entry: t });
        queued = true;
      }
    });
    if (queued) processQueue();
  }, [deadTeamList, processQueue]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  // Preview button → one dummy alert through the normal queue.
  const triggerDemo = useCallback(() => {
    queueRef.current.push({ kind: 'demo', team: DEMO_TEAM });
    processQueue();
  }, [processQueue]);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;

  let alertTeam: AlertView | null = null;
  if (currentAlert?.kind === 'demo') alertTeam = currentAlert.team;
  else if (currentAlert?.kind === 'real' && matchData) {
    const t = toAlertTeam(currentAlert.entry, matchData) as any;
    if (t) alertTeam = { ...t, players: (t.players || []).filter((p: any) => p.bHasDied) };
  }

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible' }}>
      <style>{KEYFRAMES}</style>

      <AnimatePresence>
        {showAlert && alertTeam && (
          <motion.div
            key={`alert-${alertIdRef.current}`}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <AlertSequence
              team={alertTeam}
              primary={primary}
              secondary={secondary}
              torLogo={tournament.torLogo}
              displayMs={ALERT_DISPLAY_MS}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── preview control — outside the 1920×1080 canvas ── */}
      <button
        type="button"
        onClick={triggerDemo}
        style={{
          position: 'absolute',
          left: 1940,
          top: 20,
          padding: '10px 16px',
          background: INK,
          color: WHITE,
          border: `2px solid ${primary}`,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: '0.1em',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        ▶ PREVIEW ALERT
      </button>
    </div>
  );
};

export default Alerts;