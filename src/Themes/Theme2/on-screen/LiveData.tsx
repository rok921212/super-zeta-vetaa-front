import SmashPointBar from '../../shared/components/SmashPointBar';
import React, { useEffect, useState, useMemo, useCallback, useRef, memo, createContext, useContext } from 'react';
import { useSortedTeams, isPlayerDead, isRondoMap, Player, MatchData, SortedTeam } from '../../shared/hooks/unsortteams';
import { useRecallEvents, useRecallsUsed, useRecallBanner, RecallEvent } from '../../shared/hooks/recallEvents';
import RecalledOverlay from '../../shared/components/RecalledOverlay';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
// NOTE: Player / Team / MatchData come from useSortedTeams — not redeclared.
// NOTE: no socket here — PublicThemeRenderer owns the single connection,
// merges 'bulkUpdate' and passes fresh `matchData` down as a prop.

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
  map?: string;
}

interface LiveStatsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: any;
}

// ─────────────────────────────────────────────
// Visual language (shared with Champions / WwcdStats)
// ─────────────────────────────────────────────
const INK = '#0d0f13';
const PANEL = 'linear-gradient(90deg, #ffffff 0%, #eef0f3 100%)';
const CUT_HERO = 'polygon(34px 0, 100% 0, 100% 100%, 0 100%, 0 34px)';
const CUT_RANK = 'polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%)';
const CUT_CHIP = 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)';

// Column widths — hero bar, header strip and every list row share these.
const COL = { rank: 54, team: 176, alive: 120, kills: 50 }; // = 400 (no PTS column)


const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const Bolt: React.FC<{ size?: number; color: string }> = ({ size = 16, color }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" aria-hidden>
    <path d="M13 0 L2 16 H9 L6 28 L18 10 H11 L15 0 Z" fill={color} />
  </svg>
);

const Crown: React.FC<{ size?: number; color: string }> = ({ size = 18, color }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
    <rect x="6" y="27" width="28" height="3" fill={color} />
  </svg>
);

// One <style> for the whole overlay instead of one per row.
const LiveStyles: React.FC<{ primary: string }> = ({ primary }) => (
  <style>{`
    @keyframes pulseBlue {
      0%, 100% { box-shadow: inset 0 0 10px rgba(59,130,246,0.4); }
      50%      { box-shadow: inset 0 0 25px rgba(59,130,246,1); }
    }
    /* ── one-shot effects (fired one at a time by the FX director) ── */
    /* health-bolt strike: pop + double flash, then settle */
    @keyframes ls-strike {
      0%   { transform: scale(1); filter: brightness(1); }
      12%  { transform: scale(1.26); filter: brightness(2.3) drop-shadow(0 0 7px rgba(255,255,255,1)); }
      24%  { transform: scale(1.04); filter: brightness(1.2); }
      38%  { transform: scale(1.18); filter: brightness(1.9) drop-shadow(0 0 10px ${withAlpha(primary, 1)}); }
      62%  { transform: scale(1.05); filter: brightness(1.25) drop-shadow(0 0 4px ${withAlpha(primary, 0.7)}); }
      100% { transform: scale(1); filter: brightness(1); }
    }
    @keyframes ls-zap {
      0% { opacity: 0; } 12% { opacity: 1; } 24% { opacity: .1; }
      38% { opacity: .9; } 60% { opacity: 0; } 100% { opacity: 0; }
    }
    @keyframes ls-spark {
      0%   { opacity: 0; transform: translate(0, 0) rotate(var(--r)) scaleY(1); }
      10%  { opacity: 1; }
      75%  { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--r)) scaleY(.3); }
      100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--r)) scaleY(.3); }
    }
    [data-fx="strike"].fx-on            { animation: ls-strike 1.2s ease-out; }
    [data-fx="strike"].fx-on .fx-flash  { animation: ls-zap 1.2s ease-out; }
    [data-fx="strike"].fx-on .fx-spark  { animation: ls-spark 1.2s ease-out; }
    [data-fx="storm"].fx-on             { animation: ls-bolt 1.4s linear; }
    .fx-sheet.fx-on                     { animation: ls-sheet 1.4s linear; }
    .fx-litup.fx-on                     { animation: ls-litup 1.4s linear; }
    [data-fx="sheen"].fx-on             { animation: ls-sheen 1.5s ease-in-out; }

    /* energy stripes flowing upward inside the bolt */
    @keyframes ls-flow { from { transform: translateY(0); } to { transform: translateY(-6px); } }
    /* constant crackling arc */
    @keyframes ls-crackle { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -14; } }
    @keyframes ls-crackle-op {
      0%, 100% { opacity: .85; } 18% { opacity: .2; } 31% { opacity: 1; }
      47% { opacity: .35; } 63% { opacity: .95; } 80% { opacity: .15; }
    }
    /* glowing energy level cap */
    @keyframes ls-cap { 0%, 100% { opacity: .65; } 50% { opacity: 1; } }
    @keyframes ls-hit { 0% { opacity: .95; } 100% { opacity: 0; } }
    /* knocked: broken neon flicker */
    @keyframes ls-neon {
      0%, 100% { opacity: 1; } 6% { opacity: .25; } 8% { opacity: 1; }
      38% { opacity: .9; } 40% { opacity: .2; } 43% { opacity: 1; }
      71% { opacity: .55; } 74% { opacity: 1; }
    }
    /* ── firing: lightning bullet ── */
    @keyframes ls-firejolt { 0% { transform: translateX(0); } 50% { transform: translateX(1.6px); } 100% { transform: translateX(0); } }
    @keyframes ls-fireglow {
      0%, 100% { filter: drop-shadow(0 0 3px #ffe14d) drop-shadow(0 0 8px ${withAlpha(primary, 0.9)}); opacity: 1; }
      30% { filter: drop-shadow(0 0 6px #ffffff) drop-shadow(0 0 14px #ffe14d); opacity: 1; }
      55% { opacity: .7; }
      70% { filter: drop-shadow(0 0 2px #ffe14d) drop-shadow(0 0 6px ${withAlpha(primary, 0.9)}); opacity: 1; }
    }
    @keyframes ls-trail {
      0%   { transform: translateX(6px); opacity: 0; }
      30%  { opacity: 1; }
      100% { transform: translateX(-8px); opacity: 0; }
    }
    @keyframes ls-tipspark { 0% { opacity: 1; } 50% { opacity: .1; } 100% { opacity: 1; } }

    /* ── storm (hero #1 background) ── */
    @keyframes ls-bolt {
      0% { opacity: 0; } 8% { opacity: 1; } 16% { opacity: .15; } 28% { opacity: 1; }
      42% { opacity: .5; } 52% { opacity: .85; } 75% { opacity: 0; } 100% { opacity: 0; }
    }
    @keyframes ls-sheet {
      0% { opacity: 0; } 8% { opacity: .55; } 16% { opacity: .08; } 28% { opacity: .4; }
      52% { opacity: .15; } 80% { opacity: 0; } 100% { opacity: 0; }
    }
    @keyframes ls-litup {
      0%, 100% { filter: brightness(1) drop-shadow(0 8px 14px rgba(0,0,0,.5)); }
      8%  { filter: brightness(1.45) drop-shadow(0 0 14px ${withAlpha(primary, 0.9)}); }
      16% { filter: brightness(1.05) drop-shadow(0 8px 14px rgba(0,0,0,.5)); }
      28% { filter: brightness(1.3) drop-shadow(0 0 10px rgba(255,255,255,.7)); }
      70% { filter: brightness(1) drop-shadow(0 8px 14px rgba(0,0,0,.5)); }
    }
    @keyframes ls-cloud {
      0%, 100% { transform: translate(0, 0) scale(1); opacity: .55; }
      50%      { transform: translate(-30px, 8px) scale(1.15); opacity: .85; }
    }
    /* electric current running along a line */
    @keyframes ls-run  { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    @keyframes ls-runv { from { background-position: 0 -200%; } to { background-position: 0 200%; } }
    /* sheen wave down the rank column */
    @keyframes ls-sheen {
      0%   { transform: translateX(-160%) skewX(-20deg); }
      100% { transform: translateX(260%) skewX(-20deg); }
    }
    @keyframes ls-flicker {
      0%, 88%, 100% { opacity: 1; }
      89% { opacity: .25; } 90% { opacity: 1; }
      92% { opacity: .5; }  93% { opacity: 1; }
    }
  `}</style>
);

// ─────────────────────────────────────────────
// StormBackground — hero #1 card: dark storm sky + branching bolts that
// flicker on their own irregular clocks, with sheet-lightning flashes.
// ─────────────────────────────────────────────
const STORM_BOLTS: { d: string[]; w: number }[] = [
  // main strike (center-right) — drives the sheet flash + player lit-up
  {
    d: [
      'M262 0 L248 34 L259 40 L236 78 L247 84 L222 128 L233 133 L210 190',
      'M247 84 L270 104 L263 112 L286 136',
      'M236 78 L214 92 L219 100 L196 113',
    ],
    w: 1.8,
  },
  // left strike
  {
    d: ['M68 0 L84 28 L73 34 L93 66 L80 72 L99 112 L88 118 L104 160', 'M80 72 L58 90 L65 97 L44 120'],
    w: 1.5,
  },
  // right strike
  {
    d: ['M372 0 L356 30 L367 36 L344 70 L355 75 L330 120', 'M355 75 L382 94 L376 101 L398 118'],
    w: 1.4,
  },
  // cloud-to-cloud crawler across the top
  {
    d: ['M0 24 L40 14 L52 25 L96 10 L110 21 L152 8 L170 16', 'M96 10 L104 -4'],
    w: 1.2,
  },
  // small far-back flicker
  {
    d: ['M170 0 L162 18 L170 22 L158 46'],
    w: 1,
  },
];

const StormBackground: React.FC<{ primary: string; secondary: string }> = memo(({ primary, secondary }) => (
  <div
    className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
    style={{
      clipPath: CUT_HERO,
      background: `radial-gradient(ellipse 70% 90% at 62% -10%, ${withAlpha(primary, 0.75)} 0%, transparent 65%),
                   linear-gradient(165deg, #06070b 0%, ${withAlpha(secondary, 0.95)} 55%, ${primary} 150%)`,
    }}
  >
    {/* drifting storm glow */}
    <div
      className="absolute -top-[60px] left-[120px] w-[300px] h-[200px] rounded-full"
      style={{
        background: `radial-gradient(circle, ${withAlpha(primary, 0.55)} 0%, transparent 70%)`,
        animation: 'ls-cloud 12s ease-in-out infinite',
      }}
    />
    <div
      className="absolute -top-[40px] -left-[40px] w-[220px] h-[160px] rounded-full"
      style={{
        background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)',
        animation: 'ls-cloud 15s 2s ease-in-out infinite reverse',
      }}
    />

    {/* sheet lightning — lights the whole sky with the main strike */}
    <div
      className="absolute inset-0 fx-sheet"
      data-fx-sync="main"
      style={{
        background: `radial-gradient(ellipse at 60% 30%, #ffffff 0%, ${withAlpha(primary, 0.6)} 45%, transparent 80%)`,
        opacity: 0,
      }}
    />

    {/* bolts */}
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 190" preserveAspectRatio="none" aria-hidden>
      <defs>
        <filter id="ls-storm-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      {STORM_BOLTS.map((b, i) => (
        <g key={i} data-fx="storm" data-fx-id={i === 0 ? 'main' : undefined} style={{ opacity: 0 }}>
          {b.d.map((d, j) => (
            <path
              key={`g${j}`}
              d={d}
              fill="none"
              stroke={primary}
              strokeWidth={(j === 0 ? b.w : b.w * 0.6) * 4}
              strokeLinejoin="miter"
              filter="url(#ls-storm-glow)"
            />
          ))}
          {b.d.map((d, j) => (
            <path
              key={`c${j}`}
              d={d}
              fill="none"
              stroke="#ffffff"
              strokeWidth={j === 0 ? b.w : b.w * 0.6}
              strokeLinejoin="miter"
            />
          ))}
        </g>
      ))}
    </svg>

    {/* faint rank mark */}
    <div className="absolute right-[10px] top-[30px] font-bebas text-[7rem] leading-none text-white opacity-[0.1]">
      #1
    </div>

    {/* electric top edge */}
    <div
      className="absolute top-0 left-[34px] right-0 h-[3px]"
      style={{
        backgroundColor: primary,
        backgroundImage: 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
        backgroundSize: '200% 100%',
        animation: 'ls-run 4.5s linear infinite',
        boxShadow: `0 0 10px ${withAlpha(primary, 0.9)}`,
      }}
    />
  </div>
));
StormBackground.displayName = 'StormBackground';

// ─────────────────────────────────────────────
// EliminatedOverlay
// ─────────────────────────────────────────────
interface EliminatedOverlayProps {
  gradientStyle: React.CSSProperties;
  rowHeight: number;
  onDone: () => void;
}

const EliminatedOverlay = memo(({ gradientStyle, rowHeight, onDone }: EliminatedOverlayProps) => {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => setExpanded(true));
    const outTimer = setTimeout(() => setPhase('out'), 2500);
    const doneTimer = setTimeout(() => onDone(), 3300);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(outTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  const isExpanded = phase === 'in' && expanded;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        height: `${rowHeight}px`,
        zIndex: 20,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          ...gradientStyle,
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: isExpanded ? '100%' : '0%',
          clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
          transition:
            phase === 'in'
              ? 'width 1.5s cubic-bezier(0.22, 1, 0.36, 1)'
              : 'width 0.6s cubic-bezier(0.55, 0, 1, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* white leading edge */}
        <div className="absolute right-[10px] top-0 bottom-0 w-[6px] bg-white/80" style={{ transform: 'skewX(-16deg)' }} />
        <span
          className="flex items-center gap-[10px]"
          style={{
            fontFamily: 'AGENCYB, sans-serif',
            fontSize: '1.4rem',
            fontWeight: 'bold',
            color: '#ffffff',
            letterSpacing: '0.25em',
            textShadow: '0 1px 6px rgba(0,0,0,0.6)',
            opacity: isExpanded ? 1 : 0,
            transition: phase === 'in' ? 'opacity 0.4s ease 0.8s' : 'opacity 0.3s ease',
            whiteSpace: 'nowrap',
          }}
        >
          <Bolt size={14} color="#fff" />
          ELIMINATED
          <Bolt size={14} color="#fff" />
        </span>
      </div>
    </div>
  );
});
EliminatedOverlay.displayName = 'EliminatedOverlay';

// ─────────────────────────────────────────────
// PlayerHealthBar — a living lightning bolt
//   • bolt-shaped meter, energy level rises/falls with health
//   • energy stripes constantly flowing upward inside it
//   • crackling arc running through the charge
//   • glowing cap at the energy level
//   • timed STRIKE: pop + double flash + sparks (staggered per team)
//   • damage: white flash + jolt
//   • knocked: red, broken-neon flicker  •  dead: dark, still
// ─────────────────────────────────────────────
interface HealthBarProps {
  player: Player;
  apiEnabled: boolean;
  baseHealthBar: number;
}

// Bolt silhouette in a 16×32 box.
const BOLT_PATH = 'M10 0 H16 L10.5 13 H15 L4 32 L7 17.5 H1.5 Z';
// Crackle arc that zig-zags down through the bolt body.
const ARC_POINTS = '12,1 9,7 11.5,10 7.5,15 10,17 5.5,24 6.5,27 4.5,31';

const PALETTE = {
  alive: { hi: '#b9ffcb', mid: '#1cf55a', lo: '#00872f', glow: 'rgba(28,245,90,0.9)' },
  low: { hi: '#ffe9a3', mid: '#ffb300', lo: '#c25e00', glow: 'rgba(255,179,0,0.9)' },
  knock: { hi: '#ffb3b3', mid: '#ff1f1f', lo: '#8c0000', glow: 'rgba(255,31,31,0.9)' },
};

let boltUid = 0;

const SPARKS = [
  { dx: '-10px', dy: '-6px', r: '-55deg' },
  { dx: '10px', dy: '-9px', r: '40deg' },
  { dx: '-3px', dy: '-14px', r: '-10deg' },
  { dx: '8px', dy: '6px', r: '120deg' },
];

const PlayerHealthBar = memo(
  ({ player, apiEnabled, baseHealthBar }: HealthBarProps) => {
    const isDead = isPlayerDead(player);
    const isKnocked = player.liveState === 4;

    const ratio = isDead
      ? 0
      : apiEnabled
      ? Math.max(0, Math.min(1, player.health / (player.healthMax || 100)))
      : 1;

    const uid = useRef(`hb${++boltUid}`).current;

    // Damage jolt: replay flash + shake whenever health drops.
    const prevRatio = useRef(ratio);
    const [hitKey, setHitKey] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (!isDead && ratio < prevRatio.current - 0.001) {
        setHitKey((k) => k + 1);
        // replay the jolt without remounting (keeps strike timing in sync)
        rootRef.current?.animate?.(
          [
            { transform: 'translate(0,0)' },
            { transform: 'translate(-2px,1px)' },
            { transform: 'translate(2px,-1px)' },
            { transform: 'translate(-1px,0)' },
            { transform: 'translate(1px,1px)' },
            { transform: 'translate(0,0)' },
          ],
          { duration: 350, easing: 'ease-out' }
        );
      }
      prevRatio.current = ratio;
    }, [ratio, isDead]);

    const pal = isKnocked ? PALETTE.knock : ratio < 0.3 ? PALETTE.low : PALETTE.alive;
    const live = !isDead;
    const striking = live && !isKnocked;
    const h = baseHealthBar;
    const w = Math.round(h * 0.54);
    // energy column is a 32-tall block slid down by the missing health
    const drop = (1 - ratio) * 32;

    return (
      <div ref={rootRef} className="relative shrink-0" style={{ width: w, height: h }}>
        <div
          className="absolute inset-0"
          data-fx={striking ? 'strike' : undefined}
          style={{
            transformOrigin: '50% 55%',

            filter: live ? `drop-shadow(0 0 2.5px ${pal.glow})` : undefined,
          }}
        >
          <svg
            width={w}
            height={h}
            viewBox="0 0 16 32"
            preserveAspectRatio="none"
            style={{ overflow: 'visible', display: 'block' }}
            aria-hidden
          >
            <defs>
              <clipPath id={`${uid}c`}>
                <path d={BOLT_PATH} />
              </clipPath>
              <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={pal.hi} />
                <stop offset="22%" stopColor={pal.mid} />
                <stop offset="100%" stopColor={pal.lo} />
              </linearGradient>
            </defs>

            {/* empty shell */}
            <path d={BOLT_PATH} fill={isDead ? '#2a2c31' : 'rgba(13,15,19,0.3)'} />

            {live && (
              <g clipPath={`url(#${uid}c)`}>
                {/* energy column — slides with health */}
                <g
                  style={{
                    transform: `translateY(${drop}px)`,
                    transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  <g style={{ animation: isKnocked ? 'ls-neon 2.8s linear infinite' : undefined }}>
                    <rect x="0" y="0" width="16" height="32" fill={`url(#${uid}g)`} />

                    {/* flowing energy stripes */}
                    <g style={{ animation: `ls-flow ${isKnocked ? 2.6 : ratio < 0.3 ? 1 : 1.6}s linear infinite` }}>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <polygon
                          key={i}
                          points={`0,${i * 6 + 4} 16,${i * 6} 16,${i * 6 + 1.6} 0,${i * 6 + 5.6}`}
                          fill="rgba(255,255,255,0.26)"
                        />
                      ))}
                    </g>

                    {/* crackling arc */}
                    <polyline
                      points={ARC_POINTS}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="1.1"
                      strokeLinejoin="miter"
                      strokeDasharray="5 2 3 4"
                      style={{
                        animation: `ls-crackle 1.3s linear infinite, ls-crackle-op 2.2s steps(1) infinite`,
                      }}
                    />

                    {/* glowing level cap */}
                    {ratio < 1 && (
                      <rect
                        x="0"
                        y="-0.6"
                        width="16"
                        height="1.6"
                        fill="#ffffff"
                        style={{ animation: 'ls-cap 1.6s ease-in-out infinite' }}
                      />
                    )}
                  </g>
                </g>
              </g>
            )}

            {/* crisp outline */}
            <path
              d={BOLT_PATH}
              fill="none"
              stroke={isDead ? 'rgba(13,15,19,0.5)' : 'rgba(13,15,19,0.55)'}
              strokeWidth="0.8"
              strokeLinejoin="miter"
            />

            {/* strike flash — whole bolt goes white for an instant */}
            {striking && (
              <path
                d={BOLT_PATH}
                fill="#ffffff"
                className="fx-flash"
                style={{ opacity: 0 }}
              />
            )}

            {/* damage flash */}
            {hitKey > 0 && (
              <path
                key={hitKey}
                d={BOLT_PATH}
                fill="#ffffff"
                style={{ animation: 'ls-hit 0.45s ease-out forwards' }}
              />
            )}
          </svg>

          {/* sparks */}
          {striking &&
            SPARKS.map((s, i) => (
              <span
                key={i}
                className="absolute pointer-events-none fx-spark"
                style={
                  {
                    left: '50%',
                    top: '45%',
                    width: 2,
                    height: 6,
                    marginLeft: -1,
                    marginTop: -3,
                    borderRadius: 1,
                    background: '#fff',
                    boxShadow: `0 0 4px ${pal.glow}, 0 0 2px #fff`,
                    opacity: 0,
                    '--dx': s.dx,
                    '--dy': s.dy,
                    '--r': s.r,
                  } as React.CSSProperties
                }
              />
            ))}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.player.health === next.player.health &&
    prev.player.healthMax === next.player.healthMax &&
    prev.player.liveState === next.player.liveState &&
    prev.player.bHasDied === next.player.bHasDied &&
    prev.apiEnabled === next.apiEnabled &&
    prev.baseHealthBar === next.baseHealthBar
);
PlayerHealthBar.displayName = 'PlayerHealthBar';

// ─────────────────────────────────────────────
// FiringBullet — lightning-bolt projectile, replaces the rank while firing
//   bolt body (points right) + recoil jitter + flicker glow + speed streaks
// ─────────────────────────────────────────────
const FiringBullet = ({
  size = 44,
  color = '#ffffff',
  glow = '#ffe14d',
}: {
  size?: number;
  color?: string;
  glow?: string;
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 42 20"
    width={size}
    height={size * (20 / 42)}
    style={{ overflow: 'visible', display: 'block' }}
    aria-hidden
  >
    {/* speed streaks behind the bolt */}
    {[4, 10, 16].map((y, i) => (
      <line
        key={y}
        x1="0"
        y1={y}
        x2={i === 1 ? 13 : 9}
        y2={y}
        stroke={glow}
        strokeWidth={i === 1 ? 1.6 : 1.1}
        strokeLinecap="round"
        style={{ animation: `ls-trail 0.7s ${i * 0.2}s linear infinite` }}
      />
    ))}

    {/* bolt body: the theme Bolt glyph rotated to point right */}
    <g style={{ animation: 'ls-firejolt 0.4s steps(2) infinite, ls-fireglow 1.3s linear infinite' }}>
      <g transform="translate(12 20) rotate(-90)">
        <path
          d="M13 0 L2 16 H9 L6 28 L18 10 H11 L15 0 Z"
          fill={color}
          stroke={glow}
          strokeWidth="1.4"
          strokeLinejoin="miter"
        />
        {/* hot core */}
        <path d="M12 3 L5 14 H10 L8 22 L15 11 H10.5 Z" fill={glow} opacity="0.85" />
      </g>
      {/* muzzle spark at the tip */}
      <circle cx="40" cy="14" r="1.6" fill="#ffffff" style={{ animation: 'ls-tipspark 0.6s steps(2) infinite' }} />
    </g>
  </svg>
);

// ─────────────────────────────────────────────
// Recall left (Rondo) — each player can be recalled RECALLS_PER_PLAYER
// times a match. The feed has no "recalls left" field, so a player counts
// as used once we have SEEN them come back (dead → alive) this match.
// Counts come from useRecallsUsed (live recalls + the killfeed), so they survive a reload.
// ─────────────────────────────────────────────
const RECALLS_PER_PLAYER = 1;
const RECALL_BLUE = '#38bdf8';
const recallKey = (p: any): string => String(p?.uId ?? p?._id ?? p?.playerName ?? '');

interface RecallLeftInfo {
  on: boolean;
  used: Record<string, number>;
}
const RecallLeftContext = createContext<RecallLeftInfo>({ on: false, used: {} });

/** Small pip under a health bolt: lit blue = recall still available, hollow = used. */
const RecallPip = ({ left, width }: { left: boolean; width: number }) => (
  <div
    className="shrink-0"
    title={left ? 'Recall available' : 'Recall used'}
    style={{
      width: Math.max(8, width - 2),
      height: 4,
      marginTop: 2,
      borderRadius: 2,
      background: left ? RECALL_BLUE : 'transparent',
      border: left ? 'none' : '1px solid rgba(13,15,19,0.35)',
      boxShadow: left ? `0 0 5px ${RECALL_BLUE}` : undefined,
    }}
  />
);

// ─────────────────────────────────────────────
// TeamCells — the columns, shared by hero bar and list rows
// ─────────────────────────────────────────────
interface TeamCellsProps {
  team: any;
  rank: number;
  rowHeight: number;
  baseHealthBar: number;
  apiEnabled: boolean;
  themeGrad: string;
  primary: string;
  hero?: boolean;
}

const TeamCells = ({
  team,
  rank,
  rowHeight,
  baseHealthBar,
  apiEnabled,
  themeGrad,
  primary,
  hero,
}: TeamCellsProps) => {
  const fontSize = Math.max(16, Math.min(30, Math.round(rowHeight * 0.6)));
  const firing = team.players?.some((p: Player) => p.isFiring);
  const recall = useContext(RecallLeftContext);
  // Leave room under the bolt for the recall pip on Rondo.
  const barHeight = recall.on ? Math.max(12, baseHealthBar - 6) : baseHealthBar;

  return (
    <div
      className="relative w-full h-full flex items-stretch font-[AGENCYB] font-bold leading-none"
      style={{ fontSize }}
    >
      {/* Rank */}
      <div
        className="relative h-full flex items-center justify-center text-white shrink-0 overflow-hidden"
        style={{
          width: COL.rank,
          background: hero ? INK : themeGrad,
          clipPath: CUT_RANK,
          textShadow: '0 0 8px rgba(255,255,255,0.55)',
        }}
      >
        <span
          className="absolute top-0 bottom-0 left-0 w-[22px] pointer-events-none"
          data-fx="sheen"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent)',
            transform: 'translateX(-160%) skewX(-20deg)',
          }}
        />
        {firing ? (
          <span style={{ marginRight: 8 }}>
            <FiringBullet color="#fff" size={Math.min(COL.rank - 6, Math.round(rowHeight * 1.05))} />
          </span>
        ) : hero ? (
          <span className="flex flex-col items-center -mt-[2px]">
            <Crown size={14} color={primary} />
            <span className="-mt-[1px]">{rank}</span>
          </span>
        ) : (
          rank
        )}
      </div>

      {/* Logo + tag */}
      <div
        className="h-full flex items-center gap-[8px] pl-[6px] shrink-0 min-w-0"
        style={{ width: COL.team, color: INK }}
      >
        <div
          className="shrink-0 flex items-center justify-center"
          style={{
            width: Math.round(rowHeight * 0.62),
            height: Math.round(rowHeight * 0.62),
            filter: team.isAllDead ? 'grayscale(1)' : undefined,
          }}
        >
          <TeamLogo
            logo={team.teamLogo}
            flag={team.teamFlag}
            fallback={'/def_logo.avif'}
            alt=""
            className="w-full h-full object-contain"
          />
        </div>
        <span className="truncate">{team.teamTag?.toUpperCase()}</span>
      </div>

      {/* Health / alive */}
      <div
        className="h-full flex items-center justify-center gap-[6px] shrink-0"
        style={{ width: COL.alive }}
      >
        {!team.players || team.players.length === 0 ? (
          <div className="text-[18px] tracking-[0.1em]" style={{ color: primary }}>
            MISS
          </div>
        ) : (
          team.players.map((player: Player) =>
            recall.on ? (
              <div key={player._id} className="flex flex-col items-center shrink-0">
                <PlayerHealthBar player={player} apiEnabled={apiEnabled} baseHealthBar={barHeight} />
                <RecallPip
                  left={(recall.used[recallKey(player)] || 0) < RECALLS_PER_PLAYER}
                  width={Math.round(barHeight * 0.54)}
                />
              </div>
            ) : (
              <PlayerHealthBar
                key={player._id}
                player={player}
                apiEnabled={apiEnabled}
                baseHealthBar={baseHealthBar}
              />
            )
          )
        )}
      </div>

      {/* Kills */}
      <div
        className="relative h-full flex items-center justify-center shrink-0 text-white"
        style={{ width: COL.kills, background: INK, boxShadow: `inset 0 -3px 0 ${primary}` }}
      >
        {team.totalKills}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// AnimatedTeamRow (no memo — index changes must re-render)
// ─────────────────────────────────────────────
interface AnimatedTeamRowProps {
  team: any;
  index: number;
  gradientStyle: React.CSSProperties;
  themeGrad: string;
  primary: string;
  apiEnabled: boolean;
  baseRowHeight: number;
  baseHealthBar: number;
  transitionReady: boolean;
  rankOffset: number;
  recallEvents: RecallEvent[];
}

const AnimatedTeamRow = ({
  team,
  index,
  gradientStyle,
  themeGrad,
  primary,
  apiEnabled,
  baseRowHeight,
  baseHealthBar,
  transitionReady,
  recallEvents,
  rankOffset,
}: AnimatedTeamRowProps) => {
  const wasEliminatedRef = useRef(team.isAllDead);
  const overlayKeyRef = useRef(0);
  const [overlayKey, setOverlayKey] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);

  const handleOverlayDone = useCallback(() => setShowOverlay(false), []);

  useEffect(() => {
    if (team.isAllDead && !wasEliminatedRef.current) {
      overlayKeyRef.current += 1;
      setOverlayKey(overlayKeyRef.current);
      setShowOverlay(true);
    }
    if (!team.isAllDead && wasEliminatedRef.current) {
      setShowOverlay(false);
    }
    wasEliminatedRef.current = team.isAllDead;
  }, [team.isAllDead]);

  // Per-player recall (Rondo) — shared detection, filtered to this team.
  const teamKey = String(team._id ?? team.teamId ?? '');
  const rowRecalls = useMemo(
    () => recallEvents.filter((e) => e.teamId === teamKey),
    [recallEvents, teamKey]
  );
  const { current: currentRecall, onDone: handleRecallDone } = useRecallBanner(rowRecalls);


  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: `${index * baseRowHeight}px`,
        height: `${baseRowHeight}px`,
        transition: transitionReady ? 'top 0.7s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        opacity: team.isAllDead ? 0.62 : 1,
        zIndex: 1,
        background: team.isAllDead
          ? '#d9dce1'
          : `linear-gradient(90deg, ${withAlpha(primary, index % 2 ? 0.16 : 0.22)} 0%, ${
              index % 2 ? '#f4f5f7' : '#ffffff'
            } 38%, ${index % 2 ? '#e9ebef' : '#f1f2f5'} 100%)`,
      }}
    >
      {team.hasOutsideBlueCircle && !team.isAllDead && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(59, 130, 246, 0.15)',
            boxShadow: 'inset 0 0 20px rgba(59,130,246,0.8)',
            animation: 'pulseBlue 1.2s infinite',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      )}

      <TeamCells
        team={team}
        rank={index + rankOffset}
        rowHeight={baseRowHeight}
        baseHealthBar={baseHealthBar}
        apiEnabled={apiEnabled}
        themeGrad={themeGrad}
        primary={primary}
      />

      {showOverlay && (
        <EliminatedOverlay
          key={overlayKey}
          gradientStyle={gradientStyle}
          rowHeight={baseRowHeight}
          onDone={handleOverlayDone}
        />
      )}

      {currentRecall && (
        <RecalledOverlay
          key={currentRecall.bannerKey}
          playerName={currentRecall.playerName}
          rowHeight={baseRowHeight}
          onDone={handleRecallDone}
        />
      )}

      {/* row separator */}
      <div
        style={{
          position: 'absolute',
          left: COL.rank,
          right: 0,
          bottom: 0,
          height: '1px',
          background: 'rgba(13,15,19,0.14)',
          zIndex: 30,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────
// AnimatedTeamList
// ─────────────────────────────────────────────
interface AnimatedTeamListProps {
  teams: any[];
  gradientStyle: React.CSSProperties;
  themeGrad: string;
  primary: string;
  apiEnabled: boolean;
  baseRowHeight: number;
  baseHealthBar: number;
  matchId: string | null;
  recallEvents: RecallEvent[];
  rankOffset?: number;
}

const AnimatedTeamList = ({
  teams,
  rankOffset = 1,
  gradientStyle,
  themeGrad,
  primary,
  apiEnabled,
  baseRowHeight,
  baseHealthBar,
  matchId,
  recallEvents,
}: AnimatedTeamListProps) => {
  const [transitionReady, setTransitionReady] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setTransitionReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{ position: 'relative', height: `${teams.length * baseRowHeight}px`, width: '100%' }}>
      {teams.map((team, index) => (
        <AnimatedTeamRow
          // matchId in the key → every row remounts on match switch, so no
          // ELIMINATED / RECALLED state leaks between matches.
          key={`${matchId ?? 'nomatch'}:${team._id}`}
          team={team}
          index={index}
          gradientStyle={gradientStyle}
          themeGrad={themeGrad}
          primary={primary}
          apiEnabled={apiEnabled}
          baseRowHeight={baseRowHeight}
          baseHealthBar={baseHealthBar}
          transitionReady={transitionReady}
          recallEvents={recallEvents}
          rankOffset={rankOffset}
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// useFxDirector — fires ONE effect at a time, at random, at a calm pace.
//   Targets are any [data-fx] element inside the root:
//     strike → a single health bolt (pop, flash, sparks)
//     storm  → one bolt in the #1 storm sky ('main' also fires sheet + lit-up)
//     sheen  → shine across one rank box
//   Works directly on the DOM (class toggle) so the list never re-renders.
// ─────────────────────────────────────────────
const FX_WEIGHTS: Record<string, number> = { strike: 0.5, storm: 0.32, sheen: 0.18 };
const FX_GAP_MIN = 1600; // ms between effects
const FX_GAP_MAX = 3400;
const FX_HOLD = 1600; // ms an effect keeps its class (longest effect is 1.5s)

const restartFx = (el: Element) => {
  el.classList.remove('fx-on');
  void (el as HTMLElement).getBoundingClientRect(); // reflow → animation can replay
  el.classList.add('fx-on');
  window.setTimeout(() => el.classList.remove('fx-on'), FX_HOLD);
};

const useFxDirector = (rootRef: React.RefObject<HTMLElement | null>) => {
  useEffect(() => {
    let timer: number;
    let lastEl: Element | null = null;

    const pickKind = (available: string[]) => {
      const total = available.reduce((s, k) => s + (FX_WEIGHTS[k] || 0), 0);
      let r = Math.random() * total;
      for (const k of available) {
        r -= FX_WEIGHTS[k] || 0;
        if (r <= 0) return k;
      }
      return available[available.length - 1];
    };

    const tick = () => {
      const root = rootRef.current;
      if (root && !document.hidden) {
        const byKind: Record<string, Element[]> = {};
        root.querySelectorAll('[data-fx]').forEach((el) => {
          const k = (el as HTMLElement).dataset?.fx || el.getAttribute('data-fx') || '';
          if (el === lastEl) return;
          if (!byKind[k]) byKind[k] = [];
          byKind[k].push(el);
        });
        const kinds = Object.keys(byKind).filter((k) => FX_WEIGHTS[k]);
        if (kinds.length) {
          const pool = byKind[pickKind(kinds)];
          const el = pool[Math.floor(Math.random() * pool.length)];
          lastEl = el;
          restartFx(el);
          const id = el.getAttribute('data-fx-id');
          if (id) root.querySelectorAll(`[data-fx-sync="${id}"]`).forEach(restartFx);
        }
      }
      timer = window.setTimeout(tick, FX_GAP_MIN + Math.random() * (FX_GAP_MAX - FX_GAP_MIN));
    };

    timer = window.setTimeout(tick, 1200);
    return () => window.clearTimeout(timer);
  }, [rootRef]);
};

// Hero bar sits between the player images and the header strip (130–172px)
const HERO_BAR_HEIGHT = 42;

// ─────────────────────────────────────────────
// LiveData (main component) — LiveStats look, kills only, no total
// ─────────────────────────────────────────────
const LiveData: React.FC<LiveStatsProps> = ({
  tournament,
  round,
  match,
  matchData: propMatchData,
  overallData: propOverallData,
}) => {
  const matchData = propMatchData ?? null;

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

  // LiveData = this match only, ranked by live kills (no points / total).
  const liveSortedTeams: SortedTeam[] = useSortedTeams(matchData, propOverallData, 'live');
  const sortedTeams: SortedTeam[] = useMemo(
    () => [...liveSortedTeams].sort((a, b) => b.totalKills - a.totalKills),
    [liveSortedTeams]
  );

  // Whole-pixel row heights (no scaleY → no blurry text).
  const { baseRowHeight, baseHealthBar } = useMemo(() => {
    const listTopOffset = 260;
    const legendHeight = 30;
    const canvasHeight = 1080;
    const availableHeight = Math.max(0, canvasHeight - listTopOffset - legendHeight);
    const rowsCount = Math.max(1, sortedTeams.length - 1); // #1 lives in the hero card
    const baseRowHeight = Math.min(50, Math.floor(availableHeight / rowsCount));
    const baseHealthBar = Math.round(baseRowHeight * 0.64);
    return { baseRowHeight, baseHealthBar };
  }, [sortedTeams.length]);

  const gradientStyle = useMemo<React.CSSProperties>(
    () => ({ background: `linear-gradient(135deg, ${primary}, ${secondary})` }),
    [primary, secondary]
  );

  const apiEnabled = round?.apiEnable === true;
  const fxRootRef = useRef<HTMLDivElement>(null);
  useFxDirector(fxRootRef);
  const recallEvents = useRecallEvents(matchData, match);

  // Recall-left (Rondo only): recalls seen live + the game's killfeed, so an
  // overlay opened or refreshed mid-match still knows who was already recalled.
  const isRondo = isRondoMap(match?.map);
  const recallInfo = useRecallsUsed(matchData, match, recallEvents);
  const topTeam: any = sortedTeams[0];
  const listTeams = useMemo(() => sortedTeams.slice(1), [sortedTeams]);

  if (!matchData) {
    return (
      <div className="w-[1920px] h-[1080px] relative">
        <div
          className="absolute right-0 top-[300px] w-[400px] h-[50px] flex items-center justify-center font-[AGENCYB] text-[1.6rem] tracking-[0.14em]"
          style={{ background: PANEL, color: INK, borderLeft: `8px solid ${primary}` }}
        >
          NO MATCH DATA
        </div>
      </div>
    );
  }

  const aliveCount = sortedTeams.filter((t: any) => !t.isAllDead).length;

  return (
    <RecallLeftContext.Provider value={recallInfo}>
    <div ref={fxRootRef} className="w-[1920px] h-[1080px] flex justify-end relative top-[0px] antialiased">
      <LiveStyles primary={primary} />

      {/* ═════════════════════ HERO (rank #1) ═════════════════════ */}
      <div className="w-[400px] h-[190px] top-[70px] right-0 relative">
        <StormBackground primary={primary} secondary={secondary} />

        {/* top-left label chip */}
       

        {/* alive teams chip */}
      

        {/* players */}
        {topTeam?.players.map((player: Player, index: number) => (
          <div
            key={player._id}
            className="absolute top-0 w-[180px] h-[190px]"
            style={{ left: `${-5 + index * 80}px`, zIndex: 1 }}
          >
            <img
              src={playerPhoto(player.picUrl) || '/def_char.avif'}
              alt={player.playerName}
              className="object-cover object-top w-full h-full fx-litup"
              data-fx-sync="main"
              decoding="async"
              style={{ filter: 'drop-shadow(0 8px 14px rgba(0,0,0,.5))' }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/def_char.avif';
              }}
            />
          </div>
        ))}

        {/* fade under players */}
        <div
          className="absolute left-0 right-0 top-[80px] h-[60px] z-10 pointer-events-none"
          style={{ background: `linear-gradient(180deg, transparent, ${withAlpha('#06070b', 0.85)})` }}
        />

        {/* hero info bar — same columns as list rows */}
        {topTeam && (
          <div
            className="absolute left-0 top-[130px] w-full z-20"
            style={{
              height: `${HERO_BAR_HEIGHT}px`,
              background: `linear-gradient(90deg, ${withAlpha(primary, 0.22)} 0%, #ffffff 40%, #eef0f3 100%)`,
              boxShadow: `0 -2px 12px ${withAlpha(primary, 0.55)}`,
            }}
          >
            {topTeam.hasOutsideBlueCircle && !topTeam.isAllDead && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(59, 130, 246, 0.15)',
                  boxShadow: 'inset 0 0 20px rgba(59,130,246,0.8)',
                  animation: 'pulseBlue 1.2s infinite',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              />
            )}
            <TeamCells
              team={topTeam}
              rank={1}
              rowHeight={HERO_BAR_HEIGHT}
              baseHealthBar={Math.min(baseHealthBar, HERO_BAR_HEIGHT - 10)}
              apiEnabled={apiEnabled}
              themeGrad={themeGrad}
              primary={primary}
              hero
            />
          </div>
        )}

        {/* column header strip */}
        <div
          className="absolute top-[172px] right-0 w-[400px] h-[20px] flex items-center z-50 font-[AGENCYB] text-[0.95rem] tracking-[0.14em] text-white"
          style={{ background: INK }}
        >
          <span className="text-center" style={{ width: COL.rank, color: primary }}>#</span>
          <span className="pl-[6px]" style={{ width: COL.team }}>TEAM</span>
          <span className="text-center" style={{ width: COL.alive }}>ALIVE</span>
          <span className="text-center tracking-[0.06em]" style={{ width: COL.kills, color: primary }}>KILLS</span>
          <div
            className="absolute left-0 right-0 bottom-0 h-[2px]"
            style={{
              backgroundColor: withAlpha(primary, 0.6),
              backgroundImage: 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
              backgroundSize: '200% 100%',
              animation: 'ls-run 4s linear infinite',
            }}
          />
        </div>
      </div>

      {/* ═════════════════════ LIST ═════════════════════ */}
      <div className="absolute right-0 top-[260px] w-[400px]">
        <div
          className="absolute -left-[4px] top-0 w-[4px] z-40 pointer-events-none"
          style={{
            height: listTeams.length * baseRowHeight,
            backgroundColor: primary,
            backgroundImage: 'linear-gradient(180deg, transparent 0 42%, #ffffff 50%, transparent 58% 100%)',
            backgroundSize: '100% 200%',
            animation: 'ls-runv 5.5s linear infinite',
            boxShadow: `0 0 10px ${withAlpha(primary, 0.85)}`,
          }}
        />
        <AnimatedTeamList
          teams={listTeams}
          rankOffset={2}
          gradientStyle={gradientStyle}
          themeGrad={themeGrad}
          primary={primary}
          apiEnabled={apiEnabled}
          baseRowHeight={baseRowHeight}
          baseHealthBar={baseHealthBar}
          matchId={matchData?._id ?? null}
          recallEvents={recallEvents}
        />

        {/* legend */}
        <div className="relative w-full h-[30px] flex items-center justify-center font-[AGENCYB] font-bold text-[1.05rem] tracking-[0.12em] text-white" style={{ background: INK, gap: isRondo ? 12 : 22 }}>
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: themeGrad }} />
          <span className="flex items-center gap-[6px]">
            <Bolt size={11} color="#3dff6e" />
            ALIVE
          </span>
          <span className="flex items-center gap-[6px]">
            <Bolt size={11} color="#ff3434" />
            KNOCK
          </span>
          <span className="flex items-center gap-[6px]">
            <Bolt size={11} color="#6b6f78" />
            DEAD
          </span>
          <span className="flex items-center gap-[6px]">
            <Bolt size={11} color="rgba(59,130,246,0.9)" />
            ZONE
          </span>
          {isRondo && (
            <span className="flex items-center gap-[6px]">
              <span className="inline-block w-[12px] h-[4px] rounded-[2px]" style={{ background: RECALL_BLUE, boxShadow: `0 0 5px ${RECALL_BLUE}` }} />
              RECALL
            </span>
          )}
        </div>

        {/* Smash Point: shown only when set for this match */}
        <SmashPointBar match={match} tournament={tournament} height={38} />
      </div>
    </div>
    </RecallLeftContext.Provider>
  );
};

export default LiveData;