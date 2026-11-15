import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchData, DeadTeamListEntry, toAlertTeam } from '../../shared/hooks/unsortteams';
import { TeamLogo } from '../../shared/components/TeamLogo';
// NOTE: no socket here — PublicThemeRenderer owns the single connection,
// listens to 'bulkUpdate', and passes freshly-merged `matchData` down.
// Types come from the shared hook module, not redeclared locally.

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
const OUT_ANIM_MS = 950; // CSS exit sequence (.el-out) — strike, fold, cracks retract
const EXIT_ANIM_MS = 200; // final motion.div fade after the exit sequence

// ─────────────────────────────────────────────
// Visual language (shared with Dom / LiveStats / Champions)
// ─────────────────────────────────────────────
const INK = '#0d0f13';
const W = 1920;
const H = 1080;
const CX = W / 2;
const CY = H / 2;

const CUT_BAND = 'polygon(40px 0, 100% 0, calc(100% - 40px) 100%, 0 100%)';
const CUT_PLATE = 'polygon(30px 0, 100% 0, calc(100% - 30px) 100%, 0 100%)';
const CUT_CHIP = 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)';
const CUT_HEX = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';

const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const Skull: React.FC<{ size?: number; color: string }> = ({ size = 18, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path
      d="M12 2C6.9 2 3 5.6 3 10.4c0 2.7 1.3 4.6 3 5.8V19a1 1 0 0 0 1 1h2v-2h2v2h2v-2h2v2h2a1 1 0 0 0 1-1v-2.8c1.7-1.2 3-3.1 3-5.8C21 5.6 17.1 2 12 2Zm-3.5 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm7 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"
      fill={color}
    />
  </svg>
);

// ─────────────────────────────────────────────
// Lightning cracks — generated per alert (seeded) so every elimination
// cracks the screen a little differently.
// ─────────────────────────────────────────────
const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

interface Crack {
  points: string;
  main: boolean;
  delay: number; // s
}

const jagged = (
  rng: () => number,
  x: number,
  y: number,
  angle: number,
  length: number,
  segments: number,
  jitter: number
) => {
  const pts: [number, number][] = [[x, y]];
  const step = length / segments;
  let a = angle;
  for (let i = 0; i < segments; i++) {
    a = angle + (rng() - 0.5) * jitter;
    x += Math.cos(a) * step * (0.7 + rng() * 0.6);
    y += Math.sin(a) * step * (0.7 + rng() * 0.6);
    pts.push([Math.round(x), Math.round(y)]);
  }
  return pts;
};

const buildCracks = (seed: number): Crack[] => {
  const rng = mulberry32(seed * 9973 + 17);
  const out: Crack[] = [];
  // Mostly sideways so they run out from behind the card, plus a few steep ones.
  const dirs = [0, 180, -22, 22, 158, 202, -62, 118, 62, 242];
  dirs.forEach((deg, i) => {
    const ang = ((deg + (rng() - 0.5) * 12) * Math.PI) / 180;
    const steep = Math.abs(Math.sin(ang)) > 0.6;
    const len = steep ? 320 + rng() * 160 : 620 + rng() * 380;
    const pts = jagged(rng, CX, CY, ang, len, steep ? 7 : 11, 1.1);
    const d0 = 0.04 * i;
    out.push({ points: pts.map((p) => p.join(',')).join(' '), main: true, delay: d0 });
    // 1–2 branches from somewhere along the crack
    const branches = 1 + Math.round(rng());
    for (let b = 0; b < branches; b++) {
      const at = 3 + Math.floor(rng() * (pts.length - 4));
      const [bx, by] = pts[Math.min(at, pts.length - 1)];
      const bang = ang + (rng() > 0.5 ? 1 : -1) * (0.5 + rng() * 0.6);
      const bpts = jagged(rng, bx, by, bang, 120 + rng() * 170, 5, 1.3);
      out.push({
        points: bpts.map((p) => p.join(',')).join(' '),
        main: false,
        delay: d0 + 0.18 + (at / pts.length) * 0.25,
      });
    }
  });
  return out;
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
const Alerts: React.FC<AlertsProps> = ({ tournament, matchData, deadTeamList }) => {
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);
  const shownTeamsRef = useRef<Set<string>>(new Set());
  const alertQueueRef = useRef<DeadTeamListEntry[]>([]);
  const showingRef = useRef(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertIdRef = useRef(0);

  const [currentAlert, setCurrentAlert] = useState<DeadTeamListEntry | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const outTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Advance the alert queue one at a time ──
  const showNextAlert = useCallback(() => {
    if (showingRef.current) return; // one at a time
    const next = alertQueueRef.current.shift();
    if (!next) return;

    showingRef.current = true;
    alertIdRef.current += 1;
    setCurrentAlert(next);
    setLeaving(false);
    setShowAlert(true);

    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      // 1) play the CSS exit sequence
      setLeaving(true);
      if (outTimeoutRef.current) clearTimeout(outTimeoutRef.current);
      outTimeoutRef.current = setTimeout(() => {
        // 2) unmount through AnimatePresence (short fade)
        setShowAlert(false);
        if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
        exitTimeoutRef.current = setTimeout(() => {
          showingRef.current = false;
          setCurrentAlert(null);
          setLeaving(false);
          hideTimeoutRef.current = null;
          outTimeoutRef.current = null;
          exitTimeoutRef.current = null;
          showNextAlert();
        }, EXIT_ANIM_MS);
      }, OUT_ANIM_MS);
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
    setLeaving(false);
    if (outTimeoutRef.current) { clearTimeout(outTimeoutRef.current); outTimeoutRef.current = null; }
    if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
    if (exitTimeoutRef.current) { clearTimeout(exitTimeoutRef.current); exitTimeoutRef.current = null; }
    (deadTeamList || []).forEach((t) => shownTeamsRef.current.add(t.teamId));
  }, [matchData?._id, deadTeamList]);

  // ── The ONLY elimination trigger — a new teamId in deadTeamList ──
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

  const alertTeam = useMemo(() => toAlertTeam(currentAlert, matchData), [currentAlert, matchData]);

  // New crack pattern for every alert
  const alertId = alertIdRef.current;
  const cracks = useMemo(() => buildCracks(alertId), [alertId]);

  useEffect(
    () => () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      if (outTimeoutRef.current) clearTimeout(outTimeoutRef.current);
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    },
    []
  );

  if (!matchData) return null;

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;
  const name = (alertTeam?.teamName || alertTeam?.teamTag || '').toUpperCase();
  const nameSize = name.length > 22 ? '3rem' : name.length > 16 ? '3.6rem' : '4.4rem';

  // Timeline (seconds): cracks 0 → .6 · card bursts .45 → 1.1 · settle
  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden pointer-events-none">
      <style>{`
        @keyframes el-draw    { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes el-crackin { 0% { opacity: 0; } 4% { opacity: 1; } 100% { opacity: 1; } }
        /* after drawing: cracks dim down and keep crackling faintly */
        @keyframes el-crackidle {
          0%, 100% { opacity: .38; } 7% { opacity: .9; } 9% { opacity: .3; } 11% { opacity: .75; }
          40% { opacity: .45; } 63% { opacity: .32; } 64% { opacity: .85; } 66% { opacity: .38; }
        }
        @keyframes el-flash   { 0% { opacity: 0; } 12% { opacity: .9; } 100% { opacity: 0; } }
        @keyframes el-ring    { from { transform: translate(-50%,-50%) scale(.1); opacity: .9; } to { transform: translate(-50%,-50%) scale(1); opacity: 0; } }
        @keyframes el-vignette{ from { opacity: 0; } to { opacity: 1; } }
        @keyframes el-band    { from { clip-path: inset(0 50% 0 50%); } to { clip-path: inset(0 0 0 0); } }
        @keyframes el-letters { 0% { letter-spacing: .6em; opacity: 0; filter: blur(6px); } 100% { letter-spacing: .08em; opacity: 1; filter: blur(0); } }
        @keyframes el-hex     { 0% { transform: translateX(-50%) scale(1.9) rotate(-8deg); opacity: 0; } 55% { transform: translateX(-50%) scale(.92) rotate(2deg); opacity: 1; } 100% { transform: translateX(-50%) scale(1) rotate(0); opacity: 1; } }
        @keyframes el-strike  {
          0% { opacity: 0; } 8% { opacity: 1; } 16% { opacity: .15; } 28% { opacity: 1; }
          45% { opacity: .4; } 60% { opacity: 0; } 100% { opacity: 0; }
        }
        @keyframes el-logo {
          0%   { filter: grayscale(0) brightness(1); transform: none; }
          18%  { filter: grayscale(0) brightness(2.2); transform: translate(-4px, 1px) rotate(-3deg); }
          26%  { transform: translate(4px, -1px) rotate(3deg); }
          34%  { transform: translate(-2px, 0) rotate(-1deg); }
          42%  { transform: none; }
          100% { filter: grayscale(1) brightness(.85); transform: none; }
        }
        @keyframes el-plate   { from { opacity: 0; transform: translateY(-26px) scaleY(.6); } to { opacity: 1; transform: none; } }
        @keyframes el-up      { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes el-sweep   { from { transform: translateX(-200%) skewX(-22deg); } to { transform: translateX(1400%) skewX(-22deg); } }
        @keyframes el-count   { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        @keyframes el-run     { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        @keyframes el-glow    {
          0%, 100% { filter: drop-shadow(0 0 8px ${withAlpha(primary, 0.55)}); }
          50%      { filter: drop-shadow(0 0 26px ${withAlpha(primary, 0.95)}); }
        }
        /* ── EXIT (.el-out) ── */
        @keyframes el-undraw   { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 1; } } /* tips pull back into the centre */
        @keyframes el-crackflare { 0% { opacity: .4; } 18% { opacity: 1; } 100% { opacity: 1; } }
        @keyframes el-hexout   {
          0%   { transform: translateX(-50%) scale(1) rotate(0); opacity: 1; filter: brightness(1); }
          18%  { transform: translateX(-50%) scale(1.12) rotate(-4deg); opacity: 1; filter: brightness(2.4); }
          100% { transform: translateX(-50%) translateY(150px) scale(0) rotate(30deg); opacity: 0; filter: brightness(1); }
        }
        @keyframes el-plateout { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-40px) scaleY(.2); } }
        @keyframes el-wordout  { from { letter-spacing: .08em; opacity: 1; filter: blur(0); } to { letter-spacing: .5em; opacity: 0; filter: blur(8px); } }
        @keyframes el-bandout  { from { clip-path: inset(0 0 0 0); } to { clip-path: inset(0 50% 0 50%); } }
        @keyframes el-implode  { 0% { transform: translate(-50%,-50%) scale(1); opacity: 0; } 20% { opacity: .9; } 100% { transform: translate(-50%,-50%) scale(.05); opacity: 0; } }
        @keyframes el-pinch    { 0% { opacity: 0; } 40% { opacity: .9; } 100% { opacity: 0; } }
        @keyframes el-fadeout  { from { opacity: 1; } to { opacity: 0; } }

        .el-out .el-hex    { animation: el-hexout .55s cubic-bezier(.5,0,.75,0) both !important; }
        .el-out .el-hexbolt{ animation: el-strike .6s linear both !important; }
        .el-out .el-plate  { animation: el-plateout .35s .08s cubic-bezier(.5,0,.75,0) both !important; }
        .el-out .el-word   { animation: el-wordout .35s .2s ease-in both !important; }
        .el-out .el-band   { animation: el-bandout .3s .38s cubic-bezier(.5,0,.75,0) both !important; }
        .el-out .el-line   { animation: el-bandout .3s .38s cubic-bezier(.5,0,.75,0) both !important; }
        .el-out .el-cracks { animation: el-crackflare .9s ease-out both !important; }
        .el-out .el-crack  { animation: el-undraw .38s calc(.3s + var(--d) * .6) cubic-bezier(.5,0,.75,0) both !important; }
        .el-out .el-implode{ animation: el-implode .45s .5s cubic-bezier(.5,0,.75,0) both !important; }
        .el-out .el-pinch  { animation: el-pinch .35s .62s ease-out both !important; }
        .el-out .el-vig    { animation: el-fadeout .5s .45s ease-in both !important; }

        @keyframes el-shake {
          0%, 100% { transform: translate(-50%, -50%); }
          20% { transform: translate(calc(-50% - 6px), calc(-50% + 3px)); }
          40% { transform: translate(calc(-50% + 5px), calc(-50% - 2px)); }
          60% { transform: translate(calc(-50% - 3px), calc(-50% + 1px)); }
          80% { transform: translate(calc(-50% + 2px), -50%); }
        }
      `}</style>

      <AnimatePresence>
        {showAlert && alertTeam && (
          <motion.div
            key={`alert-${alertId}`}
            className={`absolute inset-0 ${leaving ? 'el-out' : ''}`}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: EXIT_ANIM_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* soft centre vignette so the alert reads over gameplay */}
            <div
              className="absolute inset-0 el-vig"
              style={{
                background: 'radial-gradient(ellipse 55% 45% at 50% 50%, rgba(6,7,11,0.55) 0%, transparent 75%)',
                animation: 'el-vignette .5s ease-out both',
              }}
            />

            {/* ═══════════ LIGHTNING CRACKS ═══════════ */}
            <svg className="absolute inset-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
              <defs>
                <filter id="el-crack-glow" x="-10%" y="-10%" width="120%" height="120%">
                  <feGaussianBlur stdDeviation="5" />
                </filter>
              </defs>
              <g className="el-cracks" style={{ animation: 'el-crackin .1s linear both, el-crackidle 3.2s 1.3s linear infinite' }}>
                {/* glow layer */}
                <g filter="url(#el-crack-glow)">
                  {cracks.map((c, i) => (
                    <polyline
                      key={`g${i}`}
                      points={c.points}
                      pathLength={1}
                      fill="none"
                      stroke={primary}
                      strokeWidth={c.main ? 12 : 7}
                      strokeLinejoin="miter"
                      strokeLinecap="round"
                      strokeDasharray="1"
                      className="el-crack"
                      style={{ strokeDashoffset: 1, animation: `el-draw .42s ${c.delay}s cubic-bezier(.3,.7,.3,1) both`, ['--d' as any]: `${c.delay}s` } as React.CSSProperties}
                    />
                  ))}
                </g>
                {/* white-hot core */}
                {cracks.map((c, i) => (
                  <polyline
                    key={`c${i}`}
                    points={c.points}
                    pathLength={1}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={c.main ? 3 : 1.6}
                    strokeLinejoin="miter"
                    strokeLinecap="round"
                    strokeDasharray="1"
                    className="el-crack"
                    style={{ strokeDashoffset: 1, animation: `el-draw .42s ${c.delay}s cubic-bezier(.3,.7,.3,1) both`, ['--d' as any]: `${c.delay}s` } as React.CSSProperties}
                  />
                ))}
              </g>
            </svg>

            {/* impact flash + shockwave ring */}
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 50% 50%, #ffffff 0%, ${withAlpha(primary, 0.6)} 18%, transparent 45%)`,
                opacity: 0,
                animation: 'el-flash .6s ease-out both',
              }}
            />
            <div
              className="absolute left-1/2 top-1/2 w-[1200px] h-[1200px] rounded-full"
              style={{
                border: `6px solid ${withAlpha(primary, 0.8)}`,
                boxShadow: `0 0 40px ${withAlpha(primary, 0.8)}, inset 0 0 40px ${withAlpha(primary, 0.6)}`,
                opacity: 0,
                animation: 'el-ring .7s .1s ease-out both',
              }}
            />

            {/* exit: ring collapses back into the centre, then a pinch of light */}
            <div
              className="absolute left-1/2 top-1/2 w-[1300px] h-[1300px] rounded-full el-implode"
              style={{
                border: `5px solid ${withAlpha(primary, 0.85)}`,
                boxShadow: `0 0 40px ${withAlpha(primary, 0.8)}, inset 0 0 40px ${withAlpha(primary, 0.6)}`,
                opacity: 0,
                transform: 'translate(-50%,-50%)',
              }}
            />
            <div
              className="absolute inset-0 el-pinch"
              style={{
                background: `radial-gradient(circle at 50% 50%, #ffffff 0%, ${withAlpha(primary, 0.7)} 6%, transparent 16%)`,
                opacity: 0,
              }}
            />

            {/* ═══════════ CENTRE CARD ═══════════ */}
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: 1000,
                height: 380,
                transform: 'translate(-50%, -50%)',
                animation: 'el-shake .4s .45s ease-out both',
              }}
            >
              <div className="relative w-full h-full" style={{ animation: 'el-glow 2.6s 1.2s ease-in-out infinite' }}>
                {/* ── ELIMINATED band ── */}
                <div
                  className="absolute left-0 right-0 top-[186px] h-[108px] overflow-hidden el-band"
                  style={{ background: INK, clipPath: CUT_BAND, animation: 'el-band .45s .45s cubic-bezier(.2,.9,.25,1) both' }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `radial-gradient(ellipse 60% 120% at 50% 100%, ${withAlpha(primary, 0.55)} 0%, transparent 70%)`,
                    }}
                  />
                  <div
                    className="absolute inset-0 opacity-[0.08]"
                    style={{ background: 'repeating-linear-gradient(-60deg, #fff 0 2px, transparent 2px 22px)' }}
                  />
                  <div className="relative h-full flex items-center justify-center gap-[26px]">
                    <Skull size={46} color={primary} />
                    <span
                      className="font-bebas text-[6.6rem] leading-none pt-[10px] text-white el-word"
                      style={{
                        textShadow: `0 0 18px ${withAlpha(primary, 0.9)}, 0 0 4px #fff`,
                        animation: 'el-letters .6s .55s cubic-bezier(.2,.9,.25,1) both',
                      }}
                    >
                      ELIMINATED
                    </span>
                    <Skull size={46} color={primary} />
                  </div>
                  {/* one-shot shine */}
                  <div
                    className="absolute top-0 bottom-0 w-[110px]"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                      transform: 'translateX(-200%) skewX(-22deg)',
                      animation: 'el-sweep 1.2s 1.1s ease-in-out both',
                    }}
                  />
                </div>

                {/* electric line on the band */}
                <div
                  className="absolute left-[40px] right-[40px] top-[180px] h-[5px] el-line"
                  style={{
                    backgroundColor: primary,
                    backgroundImage: 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'el-run 3s linear infinite, el-band .45s .45s cubic-bezier(.2,.9,.25,1) both',
                    boxShadow: `0 0 12px ${withAlpha(primary, 0.9)}`,
                  }}
                />

                {/* ── team plate ── */}
                <div
                  className="absolute left-[70px] right-[70px] top-[286px] h-[94px] overflow-hidden origin-top el-plate"
                  style={{
                    clipPath: CUT_PLATE,
                    background: 'linear-gradient(90deg, #ffffff 0%, #eef0f3 100%)',
                    animation: 'el-plate .45s .75s cubic-bezier(.2,.9,.25,1) both',
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(90deg, ${withAlpha(primary, 0.18)} 0%, transparent 40%)` }}
                  />
                  <div className="relative h-full flex items-center pl-[56px] pr-[50px] gap-[18px]">
                    <div
                      className="font-bebas leading-none pt-[8px] truncate min-w-0 flex-1"
                      style={{ fontSize: nameSize, color: INK }}
                    >
                      {name}
                    </div>
                    <div className="flex items-center gap-[10px] shrink-0" style={{ animation: 'el-up .45s .95s ease-out both' }}>
                      <div
                        className="h-[46px] pl-[16px] pr-[22px] flex items-center gap-[8px] text-white"
                        style={{ background: themeGrad, clipPath: CUT_CHIP }}
                      >
                        <span className="font-[Righteous] text-[0.85rem] tracking-[0.16em] opacity-90">RANK</span>
                        <span className="font-bebas text-[2.6rem] leading-none pt-[5px]">#{alertTeam.teamRank}</span>
                      </div>
                      <div
                        className="h-[46px] pl-[16px] pr-[22px] flex items-center gap-[8px] text-white"
                        style={{ background: INK, clipPath: CUT_CHIP }}
                      >
                        <span className="font-bebas text-[2.6rem] leading-none pt-[5px]">{alertTeam.totalKills}</span>
                        <span className="font-[Righteous] text-[0.85rem] tracking-[0.16em]" style={{ color: primary }}>
                          KILLS
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* countdown bar */}
                  <div
                    className="absolute left-[30px] right-[30px] bottom-0 h-[5px] origin-left"
                    style={{ background: themeGrad, animation: `el-count ${ALERT_DISPLAY_MS}ms linear both` }}
                  />
                </div>

                {/* ── logo hex medallion (stamps in, gets struck, drains grey) ── */}
                <div
                  className="absolute left-1/2 top-[0px] w-[204px] h-[204px] z-10 el-hex"
                  style={{ clipPath: CUT_HEX, background: themeGrad, animation: 'el-hex .55s .55s cubic-bezier(.2,.9,.25,1) both' }}
                >
                  <div
                    className="absolute inset-[7px] overflow-hidden"
                    style={{
                      clipPath: CUT_HEX,
                      background: `radial-gradient(ellipse 80% 70% at 50% 0%, ${withAlpha(primary, 0.8)} 0%, transparent 70%),
                                   linear-gradient(165deg, #06070b 0%, ${withAlpha(secondary, 0.95)} 60%, ${primary} 160%)`,
                    }}
                  >
                    <svg
                      className="absolute inset-0 w-full h-full el-hexbolt"
                      viewBox="0 0 190 190"
                      preserveAspectRatio="none"
                      style={{ opacity: 0, animation: 'el-strike 1.3s .7s linear both' }}
                      aria-hidden
                    >
                      <path d="M120 0 L98 52 L114 58 L82 118 L98 124 L70 190" fill="none" stroke={primary} strokeWidth="8" filter="url(#el-crack-glow)" />
                      <path d="M120 0 L98 52 L114 58 L82 118 L98 124 L70 190" fill="none" stroke="#fff" strokeWidth="2.4" />
                    </svg>
                    <div
                      className="absolute inset-[34px] flex items-center justify-center"
                      style={{ animation: 'el-logo 1.6s .7s ease-out both' }}
                    >
                      <TeamLogo
                        logo={alertTeam.teamLogo}
                        flag={alertTeam.teamFlag}
                        alt=""
                        className="object-contain w-full h-full drop-shadow-[0_8px_14px_rgba(0,0,0,0.55)]"
                      />
                    </div>
                  </div>
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