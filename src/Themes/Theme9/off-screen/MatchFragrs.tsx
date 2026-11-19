import React, { useCallback, useEffect, useId, useMemo, useRef, useState, createContext, useContext } from 'react';
import { MatchData } from '../../shared/hooks/unsortteams';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// freshly-merged `matchData` down as a prop. The top-5 list is the shared
// single-match Fragger Score (buildFraggerPool + computeFraggerScores +
// compareFraggerScore), exactly as before.
/* FOREST — Top 5 Fraggers.

                        TOP 5 FRAGGERS   (a vine underline grows beneath)
                     round · day · match
            ~~~~~~ a vine garland drapes from card tip to card tip ~~~~~~
                              /\
         /\      /\          /  \          /\      /\
        /#4\    /#2\        / #1 \        /#3\    /#5\      pointed, leaf-tipped cards;
        |   |   |   |       | HERO|       |   |   |   |     #1 is bigger, taller, in the
        |   |   |   |       |     |       |   |   |   |     centre, with a crown and a
        └───┘   └───┘       └─────┘       └───┘   └───┘     slow light-ray glow behind it
   card:  player on the theme canopy (tree rings + faint team logo)
          (#n) tree-ring rank medallion · NAME · team tag
          KILLS (theme tile) · DAMAGE · ASSISTS
          KILL SHARE bar with a leaf riding its tip

   Motion (state + CSS transitions only, so it always plays):
     heading wipes in, its vine underline draws itself
     each card opens UPWARD in three steps behind a fringe of leaves —
       1) grove: white team-logo plate + rank   2) canopy   3) the player
     order ripples from the centre: #1, then #2/#3, then #4/#5
     then the player rises, numbers count up, the share bar fills,
     and the garland grows outward from the hero across every tip.
   PREVIEW: a "Preview fraggers" button OUTSIDE the 1920×1080 canvas replays
   the sequence (dummy players when there is no data). */

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
  day?: string;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
}

interface MatchFragrsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

interface Fragger {
  _id: string;
  playerName: string;
  picUrl?: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
  teamName?: string;
  killNum: number;
  numericDamage: number;
  assists: number;
  teamTotalKills: number;
}

/* -------------------- Palette + type -------------------- */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";
const SHADOW = '0 0 1px rgba(0,0,0,.9), 0 2px 4px rgba(0,0,0,.6)';

/** White logo plate — traced from Layer_2.png (same as the other overlays). */
const PLATE_CUT =
  'polygon(4% 0%, 82.9% 0%, 99.7% 77.7%, 82.6% 53.1%, 92.8% 100%, 10.2% 96%, 0.3% 46.9%, 18.2% 74.1%)';

/* -------------------- Geometry -------------------- */
interface Dims {
  w: number;
  h: number;
  tip: number; // height of the pointed top
  photo: number; // photo area (from the very top, incl. the tip)
  name: number;
  stats: number;
  medal: number;
  scale: number; // type scale
}
const SMALL: Dims = { w: 300, h: 600, tip: 46, photo: 320, name: 78, stats: 108, medal: 72, scale: 1 };
const HERO: Dims = { w: 400, h: 730, tip: 60, photo: 400, name: 92, stats: 132, medal: 92, scale: 1.2 };
const CARD_GAP = 26;
const CARDS_BOTTOM = 1030;
const CHAMF = 24;
const cardClip = (d: Dims) =>
  `polygon(0 ${d.tip}px, 50% 0, 100% ${d.tip}px, 100% calc(100% - ${CHAMF}px), calc(100% - ${CHAMF}px) 100%, ${CHAMF}px 100%, 0 calc(100% - ${CHAMF}px))`;
/** left → right slots hold ranks 4, 2, 1, 3, 5 (hero in the centre) */
const SLOT_RANKS = [4, 2, 1, 3, 5];
const dimsOf = (rank: number) => (rank === 1 ? HERO : SMALL);
const ROW_W = SLOT_RANKS.reduce((s, r) => s + dimsOf(r).w, 0) + CARD_GAP * (SLOT_RANKS.length - 1);
const ROW_X = (1920 - ROW_W) / 2;
const SLOT_X = SLOT_RANKS.map((_, i) => ROW_X + SLOT_RANKS.slice(0, i).reduce((s, r) => s + dimsOf(r).w + CARD_GAP, 0));
/** tip of each slot's card, in canvas coordinates */
const TIPS: [number, number][] = SLOT_RANKS.map((r, i) => [SLOT_X[i] + dimsOf(r).w / 2, CARDS_BOTTOM - dimsOf(r).h]);

/* -------------------- Timeline (ms) -------------------- */
/** everything runs 40% slower than the first cut */
const SLOW = 1.4;
const STEP_MS = Math.round(620 * SLOW);
const STEP_HOLD = Math.round(300 * SLOW);
const T_BRANCH = Math.round(80 * SLOW);
const BRANCH_MS = Math.round(900 * SLOW);
const T_PLANK = Math.round(650 * SLOW);
const T_CONTEXT = Math.round(1350 * SLOW);
const BRANCH = { x1: 470, x2: 1450, y: 46 };
const ROPE = 40;
const PLANK_H = 100;
const T_CARDS = Math.round(450 * SLOW);
const WAVE = Math.round(230 * SLOW); // between ripple waves (#1 → #2/#3 → #4/#5)
const waveOf = (rank: number) => (rank === 1 ? 0 : rank <= 3 ? 1 : 2);
const cardTimes = (rank: number) => {
  const s1 = T_CARDS + waveOf(rank) * WAVE + (rank === 3 || rank === 5 ? Math.round(60 * SLOW) : 0);
  const s2 = s1 + STEP_MS + STEP_HOLD;
  const s3 = s2 + STEP_MS - Math.round(120 * SLOW);
  return { s1, s2, s3, settled: s3 + Math.round(STEP_MS * 0.55) };
};
const T_GARLAND = cardTimes(5).settled + Math.round(100 * SLOW);
const GARLAND_SPAN_MS = Math.round(420 * SLOW);

/* ── dummy players for the preview button ── */
const DEMO: Fragger[] = [
  { _id: 'd1', playerName: 'VIPER', teamTag: 'DMY', teamLogo: '/def_logo.png', killNum: 9, numericDamage: 1432, assists: 2, teamTotalKills: 15 },
  { _id: 'd2', playerName: 'SHADOW', teamTag: 'NOVA', teamLogo: '/def_logo.png', killNum: 7, numericDamage: 1180, assists: 3, teamTotalKills: 12 },
  { _id: 'd3', playerName: 'KRYPTO', teamTag: 'TSM', teamLogo: '/def_logo.png', killNum: 6, numericDamage: 1022, assists: 1, teamTotalKills: 14 },
  { _id: 'd4', playerName: 'NEXUS', teamTag: 'FAZE', teamLogo: '/def_logo.png', killNum: 5, numericDamage: 960, assists: 4, teamTotalKills: 9 },
  { _id: 'd5', playerName: 'ORBIT', teamTag: 'DRX', teamLogo: '/def_logo.png', killNum: 5, numericDamage: 812, assists: 2, teamTotalKills: 11 },
];

const num = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};

/* -------------------- Colour -------------------- */
type RGB = [number, number, number];
const BLACK: RGB = [8, 10, 6];
const WHITE_RGB: RGB = [255, 255, 255];
const MOSS: RGB = [62, 88, 36];

function toRgb(hex: string): RGB {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const deepen = (c: RGB, max = 0.2): RGB => (lum(c) <= max ? c : mix(c, BLACK, 1 - max / lum(c)));

function forestPalette(primary: string, secondary: string) {
  const p = toRgb(primary);
  const s = toRgb(secondary);
  const dp = deepen(p);
  const vineBase = mix(mix(p, s, 0.5), MOSS, 0.5);
  const leaf = (c: RGB): [string, string, string] => [css(mix(c, WHITE_RGB, 0.42)), css(c), css(mix(c, BLACK, 0.55))];
  return {
    primary,
    secondary,
    black: [css(mix(dp, BLACK, 0.76)), css(mix(dp, BLACK, 0.93))],
    grove: [css(mix(dp, BLACK, 0.7)), css(mix(dp, BLACK, 0.92))],
    canopy: [css(mix(p, WHITE_RGB, 0.15)), primary, css(mix(p, BLACK, 0.55))],
    sceneGlow: rgba(mix(s, WHITE_RGB, 0.35), 0.85),
    sceneMid: css(mix(p, BLACK, 0.1)),
    sceneDeep: css(mix(dp, BLACK, 0.85)),
    pineBack: css(mix(dp, BLACK, 0.6)),
    pineFront: css(mix(dp, BLACK, 0.84)),
    label: lum(s) < 0.35 ? css(mix(s, WHITE_RGB, 0.45)) : secondary,
    head: lum(s) < 0.35 ? css(mix(s, WHITE_RGB, 0.45)) : secondary,
    body: css(mix(p, WHITE_RGB, 0.25)),
    limbs: 'rgba(255,255,255,0.7)',
    leafP: leaf(mix(p, MOSS, 0.15)),
    leafS: leaf(mix(s, MOSS, 0.15)),
    leafM: leaf(mix(mix(p, s, 0.5), MOSS, 0.4)),
    vineA: { dark: css(mix(vineBase, BLACK, 0.72)), mid: css(mix(vineBase, BLACK, 0.12)), light: css(mix(s, WHITE_RGB, 0.6)) },
  };
}
type ForestPalette = ReturnType<typeof forestPalette>;
type VineCol = ForestPalette['vineA'];
type Tone = 'P' | 'S' | 'M';
const ForestCtx = createContext<{ pal: ForestPalette; gid: string }>({ pal: forestPalette('#2E7D4A', '#C9A24A'), gid: 'fv' });

const GRAIN =
  'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 4px), ' +
  'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 11px)';

/* -------------------- Hooks -------------------- */
/* flip to true after `ms` (two frames later, so the start state paints first) */
function useAfter(ms: number, key: unknown) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(false);
    let r1 = 0;
    let r2 = 0;
    const t = window.setTimeout(() => {
      r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setOn(true));
      });
    }, ms);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [ms, key]);
  return on;
}

/* number counts up 0 → n once `active` turns true */
function useCountUp(target: number, active: boolean, durMs = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) {
      setV(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - start) / durMs));
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durMs]);
  return v;
}

/* -------------------- Leaves / stems -------------------- */
const LEAF_SHAPE = 'M0,0 C6,-11 22,-15 40,0 C22,15 6,11 0,0 Z';
const LEAF_TOP = 'M0,0 C6,-11 22,-15 40,0 Z';
const toneOf = (pal: ForestPalette, t: Tone) => (t === 'P' ? pal.leafP : t === 'S' ? pal.leafS : pal.leafM);

const ForestDefs = () => {
  const { pal, gid } = useContext(ForestCtx);
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {(['P', 'S', 'M'] as const).map((t) => {
          const c = toneOf(pal, t);
          return (
            <linearGradient key={t} id={`${gid}-leaf${t}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c[0]} />
              <stop offset="0.45" stopColor={c[1]} />
              <stop offset="0.55" stopColor={c[2]} />
              <stop offset="1" stopColor={c[2]} />
            </linearGradient>
          );
        })}
        <radialGradient id={`${gid}-seed`}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.3" stopColor={pal.label} />
          <stop offset="1" stopColor={pal.label} stopOpacity={0} />
        </radialGradient>
        <filter id={`${gid}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="1.5" dy="3" stdDeviation="2" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>
    </svg>
  );
};

const LeafShape = ({ tone, vein = true }: { tone: Tone; vein?: boolean }) => {
  const { pal, gid } = useContext(ForestCtx);
  const c = toneOf(pal, tone);
  return (
    <>
      <path d={LEAF_SHAPE} fill={`url(#${gid}-leaf${tone})`} />
      <path d={LEAF_TOP} fill="#fff" opacity={0.13} />
      {vein && <path d="M1,0 Q20,-1.5 39,0" stroke={c[0]} strokeWidth={1.3} fill="none" opacity={0.85} />}
      <path d={LEAF_SHAPE} fill="none" stroke={c[2]} strokeWidth={0.8} opacity={0.7} />
    </>
  );
};

/** A 3D stem that draws itself in (core, body, highlight). */
const GrowStem = ({ d, w, col, on, delay, dur, ease = 'cubic-bezier(.45,0,.2,1)' }: { d: string; w: number; col: VineCol; on: boolean; delay: number; dur: number; ease?: string }) => {
  const base = { d, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, pathLength: 1 };
  const st: React.CSSProperties = {
    strokeDasharray: 1,
    strokeDashoffset: on ? 0 : 1,
    transition: on ? `stroke-dashoffset ${dur}ms ${ease} ${delay}ms` : 'none',
  };
  return (
    <g>
      <path {...base} stroke={col.dark} strokeWidth={w} style={st} />
      <path {...base} stroke={col.mid} strokeWidth={w * 0.6} transform="translate(-0.6,-1)" style={st} />
      <path {...base} stroke={col.light} strokeWidth={Math.max(1, w * 0.2)} strokeOpacity={0.65} transform="translate(-1.1,-1.9)" style={st} />
    </g>
  );
};

const Unfurl = ({ on, delay, children }: { on: boolean; delay: number; children: React.ReactNode }) => (
  <g
    style={{
      transformBox: 'fill-box',
      transformOrigin: '0% 50%',
      transform: on ? 'scale(1)' : 'scale(0)',
      transition: on ? `transform 630ms cubic-bezier(.3,1.6,.5,1) ${delay}ms` : 'none',
    }}
  >
    {children}
  </g>
);

/* -------------------- Reveal (one step) -------------------- */
type Dir = 'up' | 'fromLeft' | 'fromRight';
const CLOSED: Record<Dir, string> = { up: 'inset(100% 0 0 0)', fromLeft: 'inset(0 100% 0 0)', fromRight: 'inset(0 0 0 100%)' };

const FringeH = ({ w, tone }: { w: number; tone: Tone }) => {
  const { pal, gid } = useContext(ForestCtx);
  const n = Math.max(4, Math.round(w / 40));
  return (
    <svg width={w} height={30} viewBox={`0 -15 ${w} 30`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        <path d={`M-6,0 C${w * 0.3},-7 ${w * 0.6},7 ${w + 6},0`} stroke={pal.vineA.dark} strokeWidth={4} fill="none" strokeLinecap="round" />
        {Array.from({ length: n }, (_, i) => {
          const x = 10 + (i * (w - 20)) / (n - 1);
          const up = i % 2 === 0;
          return (
            <g key={i} transform={`translate(${x.toFixed(1)},0) rotate(${up ? -70 - (i % 3) * 12 : 110 + (i % 3) * 12}) scale(${0.55 + (i % 3) * 0.08})`}>
              <LeafShape tone={i % 3 === 1 ? 'M' : tone} vein={false} />
            </g>
          );
        })}
      </g>
    </svg>
  );
};
const FringeV = ({ h, tone }: { h: number; tone: Tone }) => {
  const { pal, gid } = useContext(ForestCtx);
  const n = Math.max(3, Math.round(h / 32));
  return (
    <svg width={40} height={h + 16} viewBox={`-20 -8 40 ${h + 16}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        <path d={`M0,-6 C-6,${h * 0.3} 6,${h * 0.6} 0,${h + 6}`} stroke={pal.vineA.dark} strokeWidth={4} fill="none" strokeLinecap="round" />
        {Array.from({ length: n }, (_, i) => {
          const y = 6 + (i * (h - 12)) / Math.max(1, n - 1);
          const right = i % 2 === 0;
          return (
            <g key={i} transform={`translate(0,${y.toFixed(1)}) rotate(${right ? -25 + (i % 3) * 10 : 205 - (i % 3) * 10}) scale(${0.58 + (i % 3) * 0.08})`}>
              <LeafShape tone={i % 3 === 1 ? 'M' : tone} vein={false} />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

const Reveal: React.FC<{ open: boolean; dir: Dir; w: number; h: number; fringe: Tone; ms?: number; children: React.ReactNode }> = ({ open, dir, w, h, fringe, ms = STEP_MS, children }) => {
  const ease = 'cubic-bezier(.65,0,.25,1)';
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.animate?.([{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: ms, easing: 'linear' });
  }, [open, ms]);
  const tr = (prop: string) => `${prop} ${ms}ms ${ease}`;
  const fr: React.CSSProperties = { position: 'absolute', opacity: 0, zIndex: 8, pointerEvents: 'none' };
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, clipPath: open ? 'inset(0 0 0 0)' : CLOSED[dir], transition: tr('clip-path') }}>{children}</div>
      {dir === 'up' ? (
        <div ref={ref} style={{ ...fr, left: 0, top: open ? '0%' : '100%', transform: 'translateY(-50%)', transition: tr('top') }}>
          <FringeH w={w} tone={fringe} />
        </div>
      ) : (
        <div
          ref={ref}
          style={{ ...fr, top: 0, left: dir === 'fromLeft' ? (open ? '100%' : '0%') : open ? '0%' : '100%', transform: 'translateX(-50%)', transition: tr('left') }}
        >
          <FringeV h={h} tone={fringe} />
        </div>
      )}
    </>
  );
};

/* -------------------- Small pieces -------------------- */
const LogoPlate = ({ p, w, h }: { p: any; w: number; h: number }) => (
  <div style={{ width: w, height: h, flex: 'none', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.5))' }}>
    <div
      style={{
        width: '100%',
        height: '100%',
        background: WHITE,
        clipPath: PLATE_CUT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${Math.round(h * 0.12)}px ${Math.round(w * 0.19)}px ${Math.round(h * 0.12)}px ${Math.round(w * 0.18)}px`,
        boxSizing: 'border-box',
      }}
    >
      <TeamLogo logo={p.teamLogo} flag={p.teamFlag} alt={p.teamName} fallback={'/def_logo.png'} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
    </div>
  </div>
);

const Crown = ({ color, size = 26 }: { color: string; size?: number }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block', flex: 'none' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
    <rect x="6" y="27" width="28" height="3" fill={color} />
  </svg>
);

/* -------------------- Rank medallion (tree rings) -------------------- */
const RankMedal: React.FC<{ rank: number; size: number; on: boolean }> = ({ rank, size, on }) => {
  const { pal } = useContext(ForestCtx);
  const hero = rank === 1;
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        transform: on ? 'scale(1) rotate(0deg)' : 'scale(.3) rotate(-90deg)',
        opacity: on ? 1 : 0,
        transition: 'transform 840ms cubic-bezier(.34,1.56,.64,1), opacity 280ms linear',
      }}
    >
      {hero && (
        <div style={{ position: 'absolute', left: '50%', top: -size * 0.36, transform: 'translateX(-50%)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.6))' }}>
          <Crown color={pal.label} size={size * 0.5} />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          boxShadow: `0 0 0 ${hero ? 5 : 4}px ${hero ? pal.label : WHITE}, 0 0 0 ${hero ? 8 : 7}px rgba(0,0,0,.5), 0 8px 16px rgba(0,0,0,.5)`,
          background: hero
            ? `repeating-radial-gradient(circle, rgba(0,0,0,.14) 0px, rgba(0,0,0,.14) 1.5px, transparent 1.5px, transparent 7px), radial-gradient(circle, ${pal.canopy[0]} 0%, ${pal.canopy[1]} 60%, ${pal.canopy[2]} 100%)`
            : `repeating-radial-gradient(circle, rgba(0,0,0,.08) 0px, rgba(0,0,0,.08) 1.5px, transparent 1.5px, transparent 6px), radial-gradient(circle, #FFFFFF 0%, #E4E4EA 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.5,
          color: hero ? WHITE : INK,
          textShadow: hero ? SHADOW : 'none',
          paddingTop: size * 0.04,
          boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: size * 0.26, marginRight: 1, opacity: 0.8 }}>#</span>
        {rank}
      </div>
    </div>
  );
};

/* -------------------- Stat cell -------------------- */
const Stat: React.FC<{ label: string; value: number; on: boolean; d: Dims; hero?: boolean }> = ({ label, value, on, d, hero }) => {
  const { pal } = useContext(ForestCtx);
  const v = useCountUp(value, on, 1260);
  const len = String(value).length;
  const base = (len >= 4 ? 32 : len === 3 ? 38 : 44) * d.scale;
  return (
    <div
      style={{
        flex: hero ? 0.9 : 1,
        minWidth: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: hero ? `linear-gradient(150deg, ${pal.canopy[0]}, ${pal.canopy[1]} 55%, ${pal.canopy[2]})` : 'transparent',
        boxShadow: hero ? `inset 0 0 0 2px ${pal.label}` : 'inset 1px 0 0 rgba(255,255,255,.1)',
      }}
    >
      <span style={{ fontSize: base * (hero ? 1.1 : 1), color: WHITE, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums', textShadow: hero ? SHADOW : 'none' }}>{Math.round(v)}</span>
      <span style={{ fontSize: 13 * d.scale, letterSpacing: '0.16em', paddingLeft: '0.16em', color: hero ? pal.label : 'rgba(255,255,255,.62)' }}>{label}</span>
    </div>
  );
};

/* -------------------- Hero light rays (slow turn) -------------------- */
const Rays: React.FC<{ on: boolean; size: number }> = ({ on, size }) => {
  const { pal } = useContext(ForestCtx);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el?.animate) return;
    const a = el.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 60000, iterations: Infinity, easing: 'linear' });
    return () => a.cancel();
  }, [on]);
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '42%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        opacity: on ? 0.55 : 0,
        transition: 'opacity 1680ms ease',
        pointerEvents: 'none',
        WebkitMaskImage: 'radial-gradient(circle, #000 15%, transparent 68%)',
        maskImage: 'radial-gradient(circle, #000 15%, transparent 68%)',
      }}
    >
      <div
        ref={ref}
        style={{
          position: 'absolute',
          inset: 0,
          background: `repeating-conic-gradient(from 0deg, ${pal.sceneGlow} 0deg 6deg, transparent 6deg 20deg)`,
        }}
      />
    </div>
  );
};

/* -------------------- Fragger card -------------------- */
const FraggerCard: React.FC<{ p: Fragger; rank: number; run: number }> = ({ p, rank, run }) => {
  const { pal } = useContext(ForestCtx);
  const d = dimsOf(rank);
  const hero = rank === 1;
  const t = cardTimes(rank);
  const s1 = useAfter(t.s1, run);
  const s2 = useAfter(t.s2, run);
  const s3 = useAfter(t.s3, run);
  const settled = useAfter(t.settled, run);
  const share = p.teamTotalKills > 0 ? Math.min(100, Math.round((num(p.killNum) / p.teamTotalKills) * 100)) : 0;
  const shareV = useCountUp(share, settled, 1260);
  const name = (p.playerName || '').toUpperCase();
  const nameSize = (name.length <= 8 ? 36 : name.length <= 12 ? 29 : 23) * d.scale;
  const tag = (p.teamTag || '').toUpperCase();
  const shareTop = d.photo + d.name + d.stats;
  const nameLeft = 18 + d.medal + 14;

  return (
    <div style={{ position: 'relative', width: d.w, height: d.h, flex: 'none', filter: 'drop-shadow(0 18px 34px rgba(0,0,0,.45))' }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: cardClip(d), fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        {/* 1 — grove: white team-logo plate + rank */}
        <Reveal open={s1} dir="up" w={d.w} h={d.h} fringe="M">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 60% 40% at 50% 42%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 30,
            }}
          >
            <div style={{ transform: s1 ? 'scale(1)' : 'scale(.55)', opacity: s1 ? 1 : 0, transition: `transform 784ms cubic-bezier(.34,1.56,.64,1) ${STEP_MS * 0.5}ms, opacity 280ms linear ${STEP_MS * 0.5}ms` }}>
              <LogoPlate p={p} w={Math.round(d.w * 0.66)} h={Math.round(d.w * 0.4)} />
            </div>
            <div style={{ fontSize: 26 * d.scale, letterSpacing: '0.22em', color: WHITE, textShadow: SHADOW }}>
              RANK <span style={{ color: pal.label, fontSize: 36 * d.scale, letterSpacing: 0 }}>#{rank}</span>
            </div>
          </div>
        </Reveal>

        {/* 2 — canopy */}
        <Reveal open={s2} dir="up" w={d.w} h={d.h} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(160deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})` }} />
        </Reveal>

        {/* 3 — the player */}
        <Reveal open={s3} dir="up" w={d.w} h={d.h} fringe="P">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})` }}>
            {/* photo area on the canopy, with tree rings + faint team logo */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: d.photo,
                overflow: 'hidden',
                background: `radial-gradient(circle at 50% 62%, rgba(255,255,255,0) 0px, rgba(255,255,255,0) 40px, transparent 40px),
                             repeating-radial-gradient(circle at 50% 62%, rgba(255,255,255,.07) 0px, rgba(255,255,255,.07) 2px, transparent 2px, transparent ${Math.round(16 * d.scale)}px),
                             radial-gradient(ellipse 70% 60% at 50% 60%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%),
                             linear-gradient(180deg, ${pal.canopy[2]}, ${pal.canopy[1]} 70%, ${pal.canopy[0]})`,
              }}
            >
              {hero && <Rays on={settled} size={d.w * 1.8} />}
              <div style={{ position: 'absolute', left: '50%', top: d.tip + 10, width: d.w * 0.7, height: d.w * 0.7, transform: 'translateX(-50%)', opacity: 0.14, filter: 'grayscale(1) brightness(2.2)' }}>
                <TeamLogo logo={p.teamLogo} flag={p.teamFlag} fallback={'/def_logo.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
                <img
                  src={playerPhoto(p.picUrl) || '/def_char.avif'}
                  alt={p.playerName}
                  style={{
                    display: 'block',
                    height: d.photo - d.tip * 0.6,
                    width: 'auto',
                    maxWidth: d.w + 40,
                    objectFit: 'contain',
                    objectPosition: 'bottom center',
                    filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.45))',
                    transform: settled ? 'none' : 'translateY(60px)',
                    opacity: settled ? 1 : 0,
                    transition: 'transform 980ms cubic-bezier(.2,.8,.2,1), opacity 420ms linear',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/def_char.avif';
                  }}
                />
              </div>
              {/* fade into the black base */}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 60, background: `linear-gradient(180deg, rgba(0,0,0,0), ${pal.black[0]})` }} />
            </div>
            {/* theme-gradient seam under the photo */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: d.photo - 3, height: 5, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />

            {/* name band */}
            <div
              style={{
                position: 'absolute',
                left: nameLeft,
                right: 16,
                top: d.photo,
                height: d.name,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 7,
                opacity: settled ? 1 : 0,
                transform: settled ? 'none' : 'translateX(-12px)',
                transition: 'opacity 350ms linear 210ms, transform 630ms cubic-bezier(.2,.8,.2,1) 210ms',
              }}
            >
              <span style={{ fontSize: nameSize, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 0.95 }}>{name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    background: 'linear-gradient(180deg, #FFFFFF, #E6E6EC)',
                    color: INK,
                    padding: `${4 * d.scale}px ${12 * d.scale}px ${3 * d.scale}px ${8 * d.scale}px`,
                    fontSize: 15 * d.scale,
                    letterSpacing: '0.16em',
                    clipPath: 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag}
                </span>
              </span>
            </div>

            {/* stats */}
            <div style={{ position: 'absolute', left: 16, right: 16, top: d.photo + d.name + 4, height: d.stats - 16, display: 'flex', gap: 4, opacity: settled ? 1 : 0, transition: 'opacity 420ms linear 350ms' }}>
              <Stat label="KILLS" value={num(p.killNum)} on={settled} d={d} hero />
              <Stat label="DAMAGE" value={num(p.numericDamage)} on={settled} d={d} />
              <Stat label="ASSISTS" value={num(p.assists)} on={settled} d={d} />
            </div>

            {/* kill share */}
            <div style={{ position: 'absolute', left: 22, right: 30, top: shareTop, bottom: CHAMF, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14 * d.scale, letterSpacing: '0.22em', color: 'rgba(255,255,255,.62)' }}>KILL SHARE</span>
                <span style={{ fontSize: 26 * d.scale, color: WHITE, fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(shareV)}
                  <span style={{ fontSize: 15 * d.scale }}>%</span>
                </span>
              </div>
              <div style={{ position: 'relative', height: 8 * d.scale, background: 'rgba(255,255,255,.12)', borderRadius: 6 }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: settled ? `${share}%` : '0%',
                    background: `linear-gradient(90deg, ${pal.primary}, ${pal.label})`,
                    borderRadius: 6,
                    transition: 'width 1260ms cubic-bezier(.2,.8,.2,1)',
                  }}
                >
                  {/* a leaf riding the tip of the bar */}
                  <svg width={30 * d.scale} height={20 * d.scale} viewBox="0 -14 40 28" style={{ position: 'absolute', right: -16 * d.scale, top: '50%', marginTop: -10 * d.scale, overflow: 'visible' }} aria-hidden>
                    <g transform="rotate(-30)">
                      <LeafShape tone="S" />
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* rank medallion, straddling the photo / name seam (outside the clip so it never gets cut) */}
      <div style={{ position: 'absolute', left: 18, top: d.photo + d.name / 2 - d.medal / 2, zIndex: 6 }}>
        <RankMedal rank={rank} size={d.medal} on={settled} />
      </div>
    </div>
  );
};

/* -------------------- Garland draped from tip to tip -------------------- */
const GARLAND = (() => {
  const f = (n: number) => n.toFixed(1);
  const heroIdx = SLOT_RANKS.indexOf(1);
  const span = (a: [number, number], b: [number, number], sag: number) => {
    const mx = (a[0] + b[0]) / 2;
    const my = Math.max(a[1], b[1]) + sag;
    return { d: `M${f(a[0])},${f(a[1])} Q${f(mx)},${f(my)} ${f(b[0])},${f(b[1])}`, a, b, c: [mx, my] as [number, number] };
  };
  // two halves, each growing outward from the hero tip; plus a short tail off each end
  const right: ReturnType<typeof span>[] = [];
  const left: ReturnType<typeof span>[] = [];
  for (let i = heroIdx; i < TIPS.length - 1; i++) right.push(span(TIPS[i], TIPS[i + 1], 44));
  for (let i = heroIdx; i > 0; i--) left.push(span(TIPS[i], TIPS[i - 1], 44));
  const spans = [...right.map((s, k) => ({ ...s, k })), ...left.map((s, k) => ({ ...s, k }))];
  const tones: Tone[] = ['P', 'M', 'S'];
  const leaves = spans.flatMap((s, si) =>
    [0.25, 0.5, 0.75].map((u, j) => {
      const x = (1 - u) * (1 - u) * s.a[0] + 2 * u * (1 - u) * s.c[0] + u * u * s.b[0];
      const y = (1 - u) * (1 - u) * s.a[1] + 2 * u * (1 - u) * s.c[1] + u * u * s.b[1];
      const down = (si + j) % 2 === 0;
      return { x, y, r: down ? 70 + j * 18 : -110 - j * 16, s: 0.6 + ((si + j) % 3) * 0.08, tone: tones[(si + j) % 3], delay: s.k * GARLAND_SPAN_MS + u * GARLAND_SPAN_MS };
    })
  );
  return { spans, leaves };
})();

const Garland: React.FC<{ on: boolean }> = ({ on }) => {
  const { pal, gid } = useContext(ForestCtx);
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 4 }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        {GARLAND.spans.map((s, i) => (
          <GrowStem key={i} d={s.d} w={9} col={pal.vineA} on={on} delay={s.k * GARLAND_SPAN_MS} dur={GARLAND_SPAN_MS} ease="linear" />
        ))}
        {GARLAND.leaves.map((l, i) => (
          <g key={i} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r}) scale(${l.s.toFixed(2)})`}>
            <Unfurl on={on} delay={l.delay + 84}>
              <LeafShape tone={l.tone} />
            </Unfurl>
          </g>
        ))}
        {/* a knot of leaves on each card tip */}
        {TIPS.map((tp, i) => (
          <g key={`k${i}`} transform={`translate(${tp[0]},${tp[1]})`}>
            {[-140, -40, -90].map((r, j) => (
              <g key={j} transform={`rotate(${r}) scale(${0.62 + j * 0.06})`}>
                <Unfurl on={on} delay={Math.abs(i - SLOT_RANKS.indexOf(1)) * GARLAND_SPAN_MS + j * 126}>
                  <LeafShape tone={(['S', 'P', 'M'] as Tone[])[j]} />
                </Unfurl>
              </g>
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
};

/* -------------------- Heading: branch + hanging plank -------------------- */
const BRANCH_D = `M${BRANCH.x1},${BRANCH.y + 10} C${BRANCH.x1 + 240},${BRANCH.y - 14} ${BRANCH.x2 - 380},${BRANCH.y + 18} ${BRANCH.x2},${BRANCH.y - 4}`;
const BRANCH_LEAVES = Array.from({ length: 14 }, (_, i) => {
  const u = 0.04 + (i * 0.92) / 13;
  const x = BRANCH.x1 + (BRANCH.x2 - BRANCH.x1) * u;
  const y = BRANCH.y + 4 + Math.sin(u * Math.PI * 2) * 6;
  const up = i % 2 === 0;
  return { x, y, u, r: up ? -60 - (i % 3) * 18 : 115 + (i % 3) * 16, s: 0.62 + (i % 3) * 0.08, t: (['P', 'M', 'S'] as Tone[])[i % 3] };
});

const Heading: React.FC<{ run: number; context: string }> = ({ run, context }) => {
  const { pal, gid } = useContext(ForestCtx);
  const branch = useAfter(T_BRANCH, run);
  const plank = useAfter(T_PLANK, run);
  const ctxIn = useAfter(T_CONTEXT, run);
  return (
    <>
      <svg width={1920} height={140} viewBox="0 0 1920 140" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 3 }} aria-hidden>
        <g filter={`url(#${gid}-shadow)`}>
          <GrowStem d={BRANCH_D} w={14} col={pal.vineA} on={branch} delay={0} dur={BRANCH_MS} />
          {BRANCH_LEAVES.map((l, i) => (
            <g key={i} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r}) scale(${l.s.toFixed(2)})`}>
              <Unfurl on={branch} delay={l.u * BRANCH_MS + 84}>
                <LeafShape tone={l.t} />
              </Unfurl>
            </g>
          ))}
        </g>
      </svg>
      {/* plank on two vine ropes — drops and swings to rest */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: BRANCH.y + 4,
          zIndex: 2,
          transformOrigin: '50% 0',
          transform: `translateX(-50%) translateY(${plank ? 0 : -150}px) rotate(${plank ? 0 : -7}deg)`,
          opacity: plank ? 1 : 0,
          transition: 'transform 1820ms cubic-bezier(.3,1.7,.45,1), opacity 280ms linear',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          filter: 'drop-shadow(0 16px 26px rgba(0,0,0,.45))',
        }}
      >
        {/* ropes */}
        <div style={{ position: 'relative', width: '100%', height: ROPE }}>
          {[70, -70].map((off, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                ...(off > 0 ? { left: off } : { right: -off }),
                width: 7,
                height: ROPE + 8,
                borderRadius: 4,
                background: `linear-gradient(90deg, ${pal.vineA.dark}, ${pal.vineA.mid} 45%, ${pal.vineA.dark})`,
              }}
            />
          ))}
        </div>
        <div style={{ position: 'relative', height: PLANK_H, clipPath: 'polygon(0 0, 100% 0, calc(100% - 30px) 100%, 30px 100%)' }}>
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 22,
              padding: '0 84px 8px',
              background: `${GRAIN}, radial-gradient(ellipse 50% 80% at 50% 0%, ${pal.sceneGlow.replace(/[\d.]+\)$/, '0.35)')} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})`,
              whiteSpace: 'nowrap',
              fontSize: 72,
              letterSpacing: '0.08em',
              lineHeight: 1,
              boxSizing: 'border-box',
            }}
          >
            <svg width={30} height={18} viewBox="0 -12 40 24" aria-hidden style={{ transform: 'scaleX(-1)' }}>
              <path d={LEAF_SHAPE} fill={pal.label} />
            </svg>
            <span
              style={{
                background: `linear-gradient(180deg, #FFFFFF 40%, ${pal.label})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              TOP 5 FRAGGERS
            </span>
            <svg width={30} height={18} viewBox="0 -12 40 24" aria-hidden>
              <path d={LEAF_SHAPE} fill={pal.label} />
            </svg>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 7, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />
        </div>
        {context && (
          <div
            style={{
              marginTop: -1,
              background: 'linear-gradient(180deg, #FFFFFF, #E6E6EC)',
              color: INK,
              padding: '8px 28px 7px',
              fontSize: 23,
              letterSpacing: '0.22em',
              clipPath: ctxIn ? 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 14px 100%)' : 'polygon(50% 0, 50% 0, 50% 100%, 50% 100%)',
              transition: 'clip-path 840ms cubic-bezier(.65,0,.25,1)',
              whiteSpace: 'nowrap',
            }}
          >
            {context}
          </div>
        )}
      </div>
    </>
  );
};

/* -------------------- Top 5 Fraggers -------------------- */
const MatchFragrs: React.FC<MatchFragrsProps> = ({ tournament, round, match, matchData }) => {
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);

  // Single-match Fragger Score (kills 30% + damage 30% + headshots 20% +
  // longest kill 10% + knockouts 10%, each vs. this match's pool average).
  const realTop = useMemo<Fragger[]>(() => {
    if (!matchData) return [];
    const scored = computeFraggerScores(buildFraggerPool([matchData] as any)).sort(compareFraggerScore);
    return scored.slice(0, 5).map((player: any) => {
      const teamTotalKills =
        (matchData as any).teams
          .find((t: any) => t.teamTag === player.teamTag)
          ?.players.reduce((sum: number, pl: any) => sum + (pl.killNum || 0), 0) || 0;
      return {
        ...(player.latestPlayerRaw as any),
        ...player,
        killNum: player.totalKills,
        numericDamage: player.totalDamage,
        assists: player.totalAssists,
        teamTotalKills,
      } as Fragger;
    });
  }, [matchData]);

  const players: Fragger[] = realTop.length ? realTop : demo ? DEMO : [];

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'ff' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);
  const garland = useAfter(T_GARLAND, run);

  const day = round?.day || tournament.day || '';
  const matchNo = match?.matchNo ?? match?._matchNo;
  const context = [
    round?.roundName,
    day ? (/^day/i.test(day) ? day : `DAY ${day}`) : '',
    matchNo != null ? `MATCH ${String(matchNo).padStart(2, '0')}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ')
    .toUpperCase();

  // fewer than 5 players: keep the hero centred and drop the empty slots
  const slots = SLOT_RANKS.map((rank, i) => ({ rank, i, p: players[rank - 1] })).filter((s) => s.p);

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
        <ForestDefs />
        {players.length > 0 ? (
          <div key={`run-${run}`}>
            <Heading run={run} context={context} />
            {slots.map(({ rank, i, p }) => (
              <div key={p._id || rank} style={{ position: 'absolute', left: SLOT_X[i], top: CARDS_BOTTOM - dimsOf(rank).h, zIndex: rank === 1 ? 2 : 1 }}>
                <FraggerCard p={p} rank={rank} run={run} />
              </div>
            ))}
            {players.length >= 5 && <Garland on={garland} />}
          </div>
        ) : (
          matchData && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 120,
                transform: 'translateX(-50%)',
                background: WHITE,
                borderLeft: `10px solid ${primary}`,
                padding: '16px 28px',
                fontSize: 30,
                letterSpacing: '0.14em',
                color: INK,
              }}
            >
              NO PLAYER DATA
            </div>
          )
        )}

        {/* ── preview control — outside the 1920×1080 canvas ── */}
        <button
          type="button"
          onClick={preview}
          style={{
            position: 'absolute',
            left: 1940,
            top: 524,
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
          ▶ PREVIEW FRAGGERS
        </button>
      </div>
    </ForestCtx.Provider>
  );
};

export default MatchFragrs;