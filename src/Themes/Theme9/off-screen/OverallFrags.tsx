import React, { useEffect, useId, useMemo, useRef, useState, createContext, useContext } from 'react';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';

/* FOREST — Overall Fraggers ("ROAD TO MVP"), top 5.
   Data preserved: the shared Fragger Score pooled from matchDatas
   (computeFraggerScores(buildFraggerPool(matchDatas)).sort(compareFraggerScore)),
   killNum = totalKills, numericDamage = avgDamage, avgSurvivalSeconds computed
   from matchDatas as before; same empty-data guards. Now the top FIVE.

   (logo) ROAD TO MVP · tournament                       [ ROUND ] [ AFTER MATCH 6 ]
   ┌~~~~~~~~ vine wraps the hero ~~~~~~~┐  ┌──── #2 ────────┐ ┌──── #3 ────────┐
   │ (1)👑        1        ★ MVP         │  │ 🧍 │ NAME       │ │ 🧍 │ NAME       │
   │     🧍 the leader, big, on a        │  │    │ ELIMS  41  │ │    │ ELIMS  38  │
   │     tree-ring stage with rays       │  │    │ DMG · SURV │ │    │ DMG · SURV │
   │ NAME                [logo] TEAM     │  ├──── #4 ────────┤ ├──── #5 ────────┤
   │ [ ELIMS 47 ] [AVG DMG] [AVG SURV]   │  │ …               │ │ …               │
   └─────────────────────────────────────┘  └─────────────────┘ └─────────────────┘

   Motion (state + CSS transitions only, so it always plays):
     the header wipes in · the hero opens from the left and each card opens
     upward, in three steps behind a fringe of leaves: 1) grove (the rank)
     2) canopy (team logo plate + team) 3) the player — photo rises as a
     silhouette and lights up, numbers count up · then a 3D vine grows all
     round the hero and a sprig curls over each card's corner.
   PREVIEW: "▶ PREVIEW ROAD TO MVP" sits just BELOW the 1920×1080 canvas; it
   replays the entrance and uses dummy players when there is no data. */

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

interface Player {
  _id: string;
  uId: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  health: number;
  healthMax: number;
  liveState: number;
  teamIdfromApi?: string;
}

interface Team {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
  slot: number;
  placePoints: number;
  wwcd?: number;
  players: Player[];
  matchesPlayed?: number;
}

interface OverallData {
  tournamentId: string;
  roundId: string;
  matchId?: string;
  userId: string;
  teams: Team[];
  createdAt: string;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface OverallFragsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matches?: Match[];
  matchDatas?: MatchData[];
}

/* the fields a card reads */
interface FraggerRow {
  _id?: string;
  uId?: string;
  key?: string;
  playerName: string;
  picUrl?: string;
  teamName?: string;
  teamTag?: string;
  teamLogo?: string;
  teamFlag?: string;
  killNum?: number;
  numericDamage?: number;
  avgSurvivalSeconds?: number;
}

const DEFAULT_CHAR = '/def_char.avif';

/* -------------------- Palette + type -------------------- */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const YELLOW = '#F5C518';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";
const SHADOW = '0 0 1px rgba(0,0,0,.9), 0 2px 4px rgba(0,0,0,.6)';

/** White logo plate — traced from Layer_2.png (same as the other overlays). */
const PLATE_CUT =
  'polygon(4% 0%, 82.9% 0%, 99.7% 77.7%, 82.6% 53.1%, 92.8% 100%, 10.2% 96%, 0.3% 46.9%, 18.2% 74.1%)';

/* -------------------- Geometry -------------------- */
const HERO = { x: 70, y: 196, w: 700, h: 844 };
const HERO_STAGE = 500; // hero-local: photo stage height
const GRID = { x: 820, y: 196, w: 1040, h: 844 };
const CARD_GAP = 24;
const CARD_W = (GRID.w - CARD_GAP) / 2; // 508
const CARD_H = (GRID.h - CARD_GAP) / 2; // 410
const CARD_PHOTO_W = 210;
const CUT = 26;
const chamfer = (c: number) => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

/* -------------------- Timeline (ms) -------------------- */
/** same pace as the other forest overlays (40% slower than the first cuts) */
const SLOW = 1.4;
const S = (ms: number) => Math.round(ms * SLOW);
const STEP_MS = S(600);
const STEP_GAP = STEP_MS + S(260);
const steps3 = (s1: number) => [s1, s1 + STEP_GAP, s1 + STEP_GAP * 2] as const;
const T_HEAD = S(60);
const HERO_T = steps3(S(350));
const cardT = (i: number) => steps3(S(650) + i * S(180)); // i = 0..3 for #2..#5
const LIVE_AFTER = Math.round(STEP_MS * 0.6);
const LIGHT_MS = S(450); // silhouette → colour
const T_VINES = cardT(3)[2] + LIVE_AFTER + S(300);
const VINE_SEG_MS = S(50);

/* ── dummy players for the preview button ── */
const DEMO: FraggerRow[] = [
  { _id: 'd1', playerName: 'VIPER', teamName: 'DUMMY ESPORTS', teamLogo: '/def_logo.png', killNum: 47, numericDamage: 612.4, avgSurvivalSeconds: 1288 },
  { _id: 'd2', playerName: 'SHADOW', teamName: 'NOVA GAMING', teamLogo: '/def_logo.png', killNum: 41, numericDamage: 574.9, avgSurvivalSeconds: 1172 },
  { _id: 'd3', playerName: 'KRYPTO', teamName: 'TEAM STORM', teamLogo: '/def_logo.png', killNum: 38, numericDamage: 598.1, avgSurvivalSeconds: 1034 },
  { _id: 'd4', playerName: 'NEXUS', teamName: 'ALPHA SEVEN', teamLogo: '/def_logo.png', killNum: 35, numericDamage: 521.7, avgSurvivalSeconds: 1250 },
  { _id: 'd5', playerName: 'BLAZE', teamName: 'RED WOLVES', teamLogo: '/def_logo.png', killNum: 33, numericDamage: 498.2, avgSurvivalSeconds: 1105 },
];

const formatSecondsToMMSS = (seconds: number = 0) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
const pop = (on: boolean, delay: number): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : 'scale(.6)',
  transition: `opacity ${S(250)}ms linear ${S(delay)}ms, transform ${S(600)}ms cubic-bezier(.34,1.56,.64,1) ${S(delay)}ms`,
});
const rise = (on: boolean, delay: number, dist = 16): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : `translateY(${dist}px)`,
  transition: `opacity ${S(350)}ms linear ${S(delay)}ms, transform ${S(520)}ms cubic-bezier(.16,1,.3,1) ${S(delay)}ms`,
});

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

/* -------------------- Sprig curling over a tile's top-right corner -------------------- */
const SPRIG = 'M0,60 C6,40 4,22 18,10 C30,0 50,2 64,-4 C76,-9 86,-2 96,6';
const SPRIG_LEAVES = [
  { x: 4, y: 40, r: -150, s: 0.62, t: 'P' as Tone },
  { x: 20, y: 9, r: -60, s: 0.7, t: 'M' as Tone },
  { x: 48, y: 1, r: 160, s: 0.6, t: 'S' as Tone },
  { x: 72, y: -6, r: -40, s: 0.66, t: 'P' as Tone },
];
const Sprig: React.FC<{ on: boolean }> = ({ on }) => {
  const delay = 0;
  const { pal, gid } = useContext(ForestCtx);
  return (
    <svg
      width={120}
      height={90}
      viewBox="-10 -20 120 90"
      style={{
        position: 'absolute',
        top: -26,
        right: -26,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 5,
      }}
      aria-hidden
    >
      <g filter={`url(#${gid}-shadow)`}>
        <GrowStem d={SPRIG} w={6} col={pal.vineA} on={on} delay={delay} dur={650} />
        {SPRIG_LEAVES.map((l, i) => (
          <g key={i} transform={`translate(${l.x},${l.y}) rotate(${l.r}) scale(${l.s})`}>
            <Unfurl on={on} delay={delay + 180 + i * 120}>
              <LeafShape tone={l.t} />
            </Unfurl>
          </g>
        ))}
      </g>
    </svg>
  );
};

/* -------------------- Shared bits -------------------- */
const useSteps = (t: readonly number[], run: unknown) => [useAfter(t[0], run), useAfter(t[1], run), useAfter(t[2], run)] as const;
const groveBg = (pal: ForestPalette) =>
  `${GRAIN}, radial-gradient(ellipse 50% 40% at 50% 50%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`;
const canopyBg = (pal: ForestPalette, deg = 160) => `${GRAIN}, linear-gradient(${deg}deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})`;

const Rays: React.FC<{ on: boolean; size: number }> = ({ on, size }) => {
  const { pal } = useContext(ForestCtx);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el?.animate) return;
    const a = el.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 70000, iterations: Infinity, easing: 'linear' });
    return () => a.cancel();
  }, [on]);
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '62%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        opacity: on ? 0.5 : 0,
        transition: `opacity ${S(900)}ms ease`,
        pointerEvents: 'none',
        WebkitMaskImage: 'radial-gradient(circle, #000 12%, transparent 66%)',
        maskImage: 'radial-gradient(circle, #000 12%, transparent 66%)',
      }}
    >
      <div ref={ref} style={{ position: 'absolute', inset: 0, background: `repeating-conic-gradient(from 0deg, ${pal.sceneGlow} 0deg 6deg, transparent 6deg 20deg)` }} />
    </div>
  );
};

/** a player photo that rises as a dark silhouette, then lights up */
const Photo: React.FC<{ p: FraggerRow; on: boolean; lit: boolean; style: React.CSSProperties }> = ({ p, on, lit, style }) => {
  const { pal } = useContext(ForestCtx);
  return (
    <div
      style={{
        position: 'absolute',
        ...style,
        transform: on ? 'none' : 'translateY(80px)',
        opacity: on ? 1 : 0,
        transition: `transform ${S(850)}ms cubic-bezier(.16,1,.3,1), opacity ${S(300)}ms linear, filter ${S(700)}ms ease`,
        filter: lit ? 'drop-shadow(0 10px 18px rgba(0,0,0,.5))' : `drop-shadow(0 0 20px ${pal.sceneGlow})`,
      }}
    >
      <img
        src={playerPhoto(p.picUrl) || DEFAULT_CHAR}
        alt={p.playerName}
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', objectPosition: 'bottom center', filter: lit ? 'brightness(1)' : 'brightness(0)', transition: `filter ${S(600)}ms ease` }}
        onError={(e) => {
          (e.target as HTMLImageElement).src = DEFAULT_CHAR;
        }}
      />
    </div>
  );
};

const StatTile: React.FC<{ label: string; value: string; hero?: boolean; size: number; on: boolean; delay: number; flex?: number }> = ({ label, value, hero, size, on, delay, flex = 1 }) => {
  const { pal } = useContext(ForestCtx);
  return (
    <div
      style={{
        flex,
        clipPath: chamfer(12),
        background: hero ? canopyBg(pal, 150) : 'linear-gradient(180deg, #FFFFFF, #E6E6EC)',
        boxShadow: hero ? `inset 0 0 0 2px ${pal.label}` : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...rise(on, delay, 18),
      }}
    >
      <span style={{ fontSize: size, lineHeight: 0.85, color: hero ? WHITE : INK, fontVariantNumeric: 'tabular-nums', textShadow: hero ? SHADOW : 'none', whiteSpace: 'nowrap' }}>{value}</span>
      <span style={{ fontSize: Math.max(13, Math.round(size * 0.25)), letterSpacing: '0.22em', paddingLeft: '0.22em', color: hero ? pal.label : '#55555E', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
};

/* -------------------- Header -------------------- */
const Header: React.FC<{ tournament: Tournament; round?: Round | null; match?: Match | null; run: number }> = ({ tournament, round, match, run }) => {
  const { pal } = useContext(ForestCtx);
  const on = useAfter(T_HEAD, run);
  const tags = useAfter(T_HEAD + S(400), run);
  return (
    <>
      <div style={{ position: 'absolute', left: HERO.x, top: 40, height: 120, display: 'flex', alignItems: 'center', gap: 24, zIndex: 3, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: '50%',
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `repeating-radial-gradient(circle, rgba(0,0,0,.07) 0px, rgba(0,0,0,.07) 1.5px, transparent 1.5px, transparent 9px), radial-gradient(circle, #FFFFFF 0%, #E2E2E8 100%)`,
            boxShadow: `0 0 0 5px ${pal.label}, 0 0 0 9px rgba(0,0,0,.45), 0 10px 20px rgba(0,0,0,.5)`,
            ...pop(on, 0),
          }}
        >
          <img src={tournament.torLogo || '/def_logo.png'} alt="" style={{ width: 76, height: 76, maxWidth: 'none', objectFit: 'contain' }} />
        </div>
        <div style={{ clipPath: on ? 'inset(-10% 0 -20% 0)' : 'inset(-10% 100% -20% 0)', transition: `clip-path ${S(800)}ms cubic-bezier(.65,0,.25,1) ${S(150)}ms` }}>
          <div style={{ fontSize: 22, letterSpacing: '0.26em', color: 'rgba(255,255,255,.8)', textShadow: SHADOW, whiteSpace: 'nowrap' }}>{(tournament.tournamentName || '').toUpperCase()}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 86, lineHeight: 0.9, color: WHITE, textShadow: '0 4px 12px rgba(0,0,0,.6)' }}>ROAD TO</span>
            <span
              style={{
                fontSize: 86,
                lineHeight: 0.9,
                background: `linear-gradient(180deg, #FFFFFF 30%, ${pal.label})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.6))',
              }}
            >
              MVP
            </span>
            <svg width={44} height={26} viewBox="0 -12 40 24" aria-hidden>
              <path d={LEAF_SHAPE} fill={pal.label} />
            </svg>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', right: 1920 - GRID.x - GRID.w, top: 62, display: 'flex', gap: 12, zIndex: 3, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        <div
          style={{
            height: 60,
            display: 'flex',
            alignItems: 'center',
            padding: '0 30px 0 40px',
            background: `${GRAIN}, linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})`,
            color: WHITE,
            fontSize: 32,
            letterSpacing: '0.1em',
            clipPath: 'polygon(20px 0, 100% 0, 100% 100%, 0 100%)',
            boxShadow: `inset 0 -4px 0 ${pal.label}`,
            opacity: tags ? 1 : 0,
            transform: tags ? 'none' : 'translateX(60px)',
            transition: `opacity ${S(300)}ms linear, transform ${S(600)}ms cubic-bezier(.16,1,.3,1)`,
          }}
        >
          {(round?.roundName || 'No Round').toUpperCase()}
        </div>
        <div
          style={{
            height: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 24px 0 34px',
            background: 'linear-gradient(180deg, #FFFFFF, #E6E6EC)',
            color: INK,
            fontSize: 22,
            letterSpacing: '0.16em',
            clipPath: 'polygon(16px 0, 100% 0, 100% 100%, 0 100%)',
            opacity: tags ? 1 : 0,
            transform: tags ? 'none' : 'translateX(60px)',
            transition: `opacity ${S(300)}ms linear ${S(120)}ms, transform ${S(600)}ms cubic-bezier(.16,1,.3,1) ${S(120)}ms`,
          }}
        >
          AFTER MATCH
          <span style={{ background: canopyBg(pal, 150), color: WHITE, padding: '5px 12px 3px', fontSize: 26 }}>{match?.matchNo ?? 'N/A'}</span>
        </div>
      </div>
    </>
  );
};

/* -------------------- #1 — the hero -------------------- */
const HeroCard: React.FC<{ p: FraggerRow; run: number }> = ({ p, run }) => {
  const { pal } = useContext(ForestCtx);
  const st = useSteps(HERO_T, run);
  const live = useAfter(HERO_T[2] + LIVE_AFTER, run);
  const lit = useAfter(HERO_T[2] + LIVE_AFTER + LIGHT_MS, run);
  const elims = useCountUp(Number(p.killNum ?? 0), live, S(1100));
  const dmg = useCountUp(Number(p.numericDamage ?? 0), live, S(1100));
  const surv = useCountUp(Number(p.avgSurvivalSeconds ?? 0), live, S(1100));
  const name = (p.playerName || '').toUpperCase();
  const nameSize = name.length <= 8 ? 84 : name.length <= 11 ? 70 : name.length <= 15 ? 56 : 44;
  const team = (p.teamName || p.teamTag || '').toUpperCase();
  const W = HERO.w;
  const H = HERO.h;

  return (
    <div style={{ position: 'absolute', left: HERO.x, top: HERO.y, width: W, height: H, zIndex: 2, filter: 'drop-shadow(0 22px 40px rgba(0,0,0,.5))', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: chamfer(CUT + 6) }}>
        {/* 1 — grove: the rank */}
        <Reveal open={st[0]} dir="fromLeft" w={W} h={H} fringe="M">
          <div style={{ position: 'absolute', inset: 0, background: groveBg(pal), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={pop(st[0], 200)}>
              <Crown color={pal.label} size={90} />
            </div>
            <span style={{ fontSize: 300, lineHeight: 0.8, color: WHITE, textShadow: '0 10px 30px rgba(0,0,0,.6)', ...pop(st[0], 300) }}>1</span>
            <span style={{ fontSize: 30, letterSpacing: '0.4em', paddingLeft: '0.4em', color: pal.label, ...rise(st[0], 450) }}>RANK</span>
          </div>
        </Reveal>
        {/* 2 — canopy: team logo plate + team */}
        <Reveal open={st[1]} dir="fromLeft" w={W} h={H} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: canopyBg(pal), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
            <div style={pop(st[1], 250)}>
              <LogoPlate p={p} w={360} h={216} />
            </div>
            <span style={{ fontSize: 40, letterSpacing: '0.16em', color: WHITE, textShadow: SHADOW, maxWidth: W - 80, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...rise(st[1], 400) }}>{team}</span>
          </div>
        </Reveal>
        {/* 3 — the player */}
        <Reveal open={st[2]} dir="fromLeft" w={W} h={H} fringe="P">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})` }}>
            {/* stage */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: HERO_STAGE,
                overflow: 'hidden',
                background: `repeating-radial-gradient(circle at 50% 78%, rgba(255,255,255,.07) 0px, rgba(255,255,255,.07) 2px, transparent 2px, transparent 18px),
                             radial-gradient(ellipse 60% 60% at 50% 70%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%),
                             linear-gradient(180deg, ${pal.canopy[2]}, ${pal.canopy[1]} 70%, ${pal.canopy[0]})`,
              }}
            >
              <Rays on={live} size={1000} />
              {/* huge outlined 1 behind the player */}
              <div style={{ position: 'absolute', left: '50%', top: -30, transform: 'translateX(-50%)', fontSize: 560, lineHeight: 0.85, color: 'transparent', WebkitTextStroke: `4px ${pal.label}`, opacity: live ? 0.35 : 0, transition: `opacity ${S(700)}ms ease` }}>1</div>
              <Photo p={p} on={live} lit={lit} style={{ left: (W - 520) / 2, bottom: 0, width: 520, height: HERO_STAGE - 30 }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 90, background: `linear-gradient(180deg, rgba(0,0,0,0), ${pal.black[0]})` }} />
              {/* rank medallion + MVP tag */}
              <div style={{ position: 'absolute', left: 30, top: 44, ...pop(live, 100) }}>
                <div style={{ position: 'absolute', left: '50%', top: -28, transform: 'translateX(-50%)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.6))' }}>
                  <Crown color={pal.label} size={40} />
                </div>
                <div
                  style={{
                    width: 92,
                    height: 92,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 58,
                    paddingTop: 4,
                    boxSizing: 'border-box',
                    color: INK,
                    background: `repeating-radial-gradient(circle, rgba(0,0,0,.12) 0px, rgba(0,0,0,.12) 1.5px, transparent 1.5px, transparent 7px), radial-gradient(circle, #FFFFFF 0%, ${pal.label} 100%)`,
                    boxShadow: '0 0 0 4px rgba(0,0,0,.45), 0 6px 14px rgba(0,0,0,.5)',
                  }}
                >
                  1
                </div>
              </div>
              <div
                style={{
                  position: 'absolute',
                  right: 30,
                  top: 30,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 18px 7px 14px',
                  background: YELLOW,
                  color: INK,
                  fontSize: 28,
                  letterSpacing: '0.2em',
                  clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
                  ...pop(live, 300),
                }}
              >
                <Crown color={INK} size={28} /> MVP
              </div>
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, top: HERO_STAGE - 3, height: 6, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />
            {/* name + team */}
            <div style={{ position: 'absolute', left: 36, right: 36, top: HERO_STAGE + 26, display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, letterSpacing: '0.3em', color: pal.label, ...rise(live, 150, 8) }}>ROAD TO MVP · LEADER</div>
                <div style={{ marginTop: 8, fontSize: nameSize, lineHeight: 0.92, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 4px 12px rgba(0,0,0,.6)', clipPath: live ? 'inset(0 0 -10% 0)' : 'inset(0 100% -10% 0)', transition: `clip-path ${S(750)}ms cubic-bezier(.65,0,.25,1) ${S(200)}ms` }}>
                  {name}
                </div>
                <div style={{ marginTop: 8, fontSize: 18, letterSpacing: '0.18em', color: 'rgba(255,255,255,.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...rise(live, 300, 8) }}>{team}</div>
              </div>
              <div style={pop(live, 250)}>
                <LogoPlate p={p} w={150} h={90} />
              </div>
            </div>
            {/* stats */}
            <div style={{ position: 'absolute', left: 30, right: 30, bottom: 32, height: 134, display: 'flex', gap: 12 }}>
              <StatTile label="ELIMS" value={String(Math.round(elims))} hero size={88} on={live} delay={350} flex={1.25} />
              <StatTile label="AVG DMG" value={dmg.toFixed(1)} size={54} on={live} delay={450} />
              <StatTile label="AVG SURV" value={formatSecondsToMMSS(surv)} size={54} on={live} delay={550} />
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
};

/* -------------------- #2–#5 — landscape cards -------------------- */
const SmallCard: React.FC<{ p: FraggerRow; rank: number; i: number; run: number }> = ({ p, rank, i, run }) => {
  const { pal } = useContext(ForestCtx);
  const t = cardT(i);
  const st = useSteps(t, run);
  const live = useAfter(t[2] + LIVE_AFTER, run);
  const lit = useAfter(t[2] + LIVE_AFTER + LIGHT_MS, run);
  const sprig = useAfter(T_VINES + i * S(160), run);
  const elims = useCountUp(Number(p.killNum ?? 0), live, S(1000));
  const dmg = useCountUp(Number(p.numericDamage ?? 0), live, S(1000));
  const surv = useCountUp(Number(p.avgSurvivalSeconds ?? 0), live, S(1000));
  const name = (p.playerName || '').toUpperCase();
  const nameSize = name.length <= 8 ? 50 : name.length <= 11 ? 42 : name.length <= 15 ? 34 : 28;
  const team = (p.teamName || p.teamTag || '').toUpperCase();
  const col = i % 2;
  const row = Math.floor(i / 2);

  return (
    <div style={{ position: 'absolute', left: GRID.x + col * (CARD_W + CARD_GAP), top: GRID.y + row * (CARD_H + CARD_GAP), width: CARD_W, height: CARD_H, zIndex: 2, filter: 'drop-shadow(0 18px 32px rgba(0,0,0,.45))', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: chamfer(CUT) }}>
        <Reveal open={st[0]} dir="up" w={CARD_W} h={CARD_H} fringe="M">
          <div style={{ position: 'absolute', inset: 0, background: groveBg(pal), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            <span style={{ fontSize: 26, letterSpacing: '0.34em', color: pal.label, ...rise(st[0], 250, 8) }}>RANK</span>
            <span style={{ fontSize: 190, lineHeight: 0.8, color: WHITE, textShadow: '0 8px 20px rgba(0,0,0,.6)', ...pop(st[0], 300) }}>{String(rank).padStart(2, '0')}</span>
          </div>
        </Reveal>
        <Reveal open={st[1]} dir="up" w={CARD_W} h={CARD_H} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: canopyBg(pal, 125), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={pop(st[1], 250)}>
              <LogoPlate p={p} w={230} h={138} />
            </div>
            <span style={{ fontSize: 26, letterSpacing: '0.16em', color: WHITE, textShadow: SHADOW, maxWidth: CARD_W - 60, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...rise(st[1], 400) }}>{team}</span>
          </div>
        </Reveal>
        <Reveal open={st[2]} dir="up" w={CARD_W} h={CARD_H} fringe="P">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})` }}>
            {/* photo side */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: CARD_PHOTO_W,
                overflow: 'hidden',
                background: `repeating-radial-gradient(circle at 50% 85%, rgba(255,255,255,.07) 0px, rgba(255,255,255,.07) 2px, transparent 2px, transparent 14px),
                             radial-gradient(ellipse 80% 50% at 50% 80%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%),
                             linear-gradient(180deg, ${pal.canopy[2]}, ${pal.canopy[1]})`,
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 26px) 100%, 0 100%)',
              }}
            >
              <div style={{ position: 'absolute', left: 8, top: -6, fontSize: 150, lineHeight: 0.85, color: 'transparent', WebkitTextStroke: `2px ${pal.label}`, opacity: live ? 0.4 : 0, transition: `opacity ${S(600)}ms ease` }}>{rank}</div>
              <Photo p={p} on={live} lit={lit} style={{ left: -60, bottom: 0, width: CARD_PHOTO_W + 120, height: CARD_H - 40 }} />
            </div>
            {/* info side */}
            <div style={{ position: 'absolute', left: CARD_PHOTO_W + 8, right: 26, top: 26, bottom: 24, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...rise(live, 100, 8) }}>
                <span
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: '50%',
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 32,
                    paddingTop: 3,
                    boxSizing: 'border-box',
                    color: INK,
                    background: 'repeating-radial-gradient(circle, rgba(0,0,0,.08) 0px, rgba(0,0,0,.08) 1px, transparent 1px, transparent 5px), radial-gradient(circle, #FFFFFF 0%, #D6D6DC 100%)',
                    boxShadow: '0 2px 5px rgba(0,0,0,.5)',
                  }}
                >
                  {rank}
                </span>
                <LogoPlate p={p} w={86} h={52} />
              </div>
              <div style={{ marginTop: 14, fontSize: nameSize, lineHeight: 0.92, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', clipPath: live ? 'inset(0 0 -10% 0)' : 'inset(0 100% -10% 0)', transition: `clip-path ${S(700)}ms cubic-bezier(.65,0,.25,1) ${S(150)}ms` }}>{name}</div>
              <div style={{ marginTop: 6, fontSize: 15, letterSpacing: '0.16em', color: 'rgba(255,255,255,.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...rise(live, 250, 6) }}>{team}</div>
              <div style={{ flex: 1 }} />
              <div style={{ height: 94, display: 'flex', ...rise(live, 300, 14) }}>
                <StatTile label="ELIMS" value={String(Math.round(elims))} hero size={62} on={live} delay={300} />
              </div>
              <div style={{ height: 86, display: 'flex', gap: 10, marginTop: 10 }}>
                <StatTile label="AVG DMG" value={dmg.toFixed(1)} size={36} on={live} delay={400} />
                <StatTile label="AVG SURV" value={formatSecondsToMMSS(surv)} size={36} on={live} delay={480} />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
      <Sprig on={sprig} />
    </div>
  );
};

/* -------------------- Vine wrapping the hero -------------------- */
const HERO_VINE = (() => {
  const L = HERO.x;
  const T = HERO.y;
  const R = HERO.x + HERO.w;
  const B = HERO.y + HERO.h;
  // up the left edge, across the top, down the right edge
  const legs: { a: [number, number]; b: [number, number]; n: [number, number] }[] = [
    { a: [L, B - 60], b: [L, T], n: [-1, 0] },
    { a: [L, T], b: [R, T], n: [0, -1] },
    { a: [R, T], b: [R, B - 60], n: [1, 0] },
  ];
  const lens = legs.map((g) => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]));
  const total = lens.reduce((s, v) => s + v, 0);
  const STEP = 62;
  const pts: { p: [number, number]; out: boolean; n: [number, number] }[] = [];
  for (let d = 0, k = 0; d <= total; d += STEP, k++) {
    let rest = d;
    let li = 0;
    while (li < legs.length - 1 && rest > lens[li]) {
      rest -= lens[li];
      li++;
    }
    const g = legs[li];
    const u = Math.min(1, rest / lens[li]);
    const out = k % 2 === 0;
    const off = out ? 16 : -14;
    pts.push({ p: [g.a[0] + (g.b[0] - g.a[0]) * u + g.n[0] * off, g.a[1] + (g.b[1] - g.a[1]) * u + g.n[1] * off], out, n: g.n });
  }
  const f = (n: number) => n.toFixed(1);
  const P = pts.map((q) => q.p);
  const segs = P.slice(0, -1).map((_, i) => {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    return {
      d: `M${f(p1[0])},${f(p1[1])} C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`,
      front: i % 2 === 1,
      i,
    };
  });
  const tones: Tone[] = ['P', 'M', 'S'];
  const leaves = pts
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.out)
    .flatMap(({ q, i }) => {
      const base = (Math.atan2(q.n[1], q.n[0]) * 180) / Math.PI;
      return [
        { x: q.p[0], y: q.p[1], r: base - 40 + ((i * 17) % 20), s: 0.62 + ((i * 7) % 4) * 0.06, tone: tones[i % 3], i },
        { x: q.p[0], y: q.p[1], r: base + 45 - ((i * 13) % 20), s: 0.5 + ((i * 5) % 4) * 0.05, tone: tones[(i + 1) % 3], i },
      ];
    });
  return { segs, leaves };
})();

const HeroVine: React.FC<{ on: boolean; front: boolean }> = ({ on, front }) => {
  const { pal, gid } = useContext(ForestCtx);
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 4 : 1 }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        {HERO_VINE.segs
          .filter((s) => s.front === front)
          .map((s) => (
            <GrowStem key={s.i} d={s.d} w={10} col={pal.vineA} on={on} delay={s.i * VINE_SEG_MS} dur={VINE_SEG_MS + 30} ease="linear" />
          ))}
        {!front &&
          HERO_VINE.leaves.map((l, k) => (
            <g key={k} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r.toFixed(1)}) scale(${l.s.toFixed(2)})`}>
              <Unfurl on={on} delay={l.i * VINE_SEG_MS + S(60)}>
                <LeafShape tone={l.tone} />
              </Unfurl>
            </g>
          ))}
      </g>
    </svg>
  );
};

/* -------------------- Component -------------------- */
const OverallFrags: React.FC<OverallFragsProps> = ({ tournament, round, match, overallData, matchDatas = [] }) => {
  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fr' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  // Top 5 players by the shared Fragger Score, pooled from matchDatas.
  // AVG SURVIVAL isn't tracked by the shared pool, so it's computed here.
  const topPlayers = useMemo(() => {
    if (!overallData || matchDatas.length === 0) return [];

    const scored = computeFraggerScores(buildFraggerPool(matchDatas as any)).sort(compareFraggerScore);

    const survivalByKey = new Map<string, number>();
    matchDatas.forEach((md) => {
      md.teams.forEach((team) => {
        team.players.forEach((player) => {
          const key = String(player.uId || player._id);
          survivalByKey.set(key, (survivalByKey.get(key) || 0) + (player.survivalTime || 0));
        });
      });
    });

    return scored.slice(0, 5).map((player: any) => ({
      ...player,
      killNum: player.totalKills,
      numericDamage: player.avgDamage,
      avgSurvivalSeconds: player.appearances > 0 ? (survivalByKey.get(player.key) || 0) / player.appearances : 0,
    }));
  }, [overallData, matchDatas]);

  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);
  const hasData = !!overallData && topPlayers.length > 0;
  const useDemo = !hasData && demo;
  const players = (useDemo ? DEMO : topPlayers) as FraggerRow[];
  const vines = useAfter(T_VINES - S(300), run);

  const preview = () => {
    if (!hasData) setDemo(true);
    setRun((r) => r + 1);
  };

  const btn: React.CSSProperties = {
    position: 'absolute',
    top: 1100,
    left: 20,
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
  };

  const notice = (text: string) => (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ padding: '18px 48px 16px 40px', background: WHITE, color: INK, fontFamily: FONT, fontWeight: 700, fontSize: 32, letterSpacing: '0.12em', boxShadow: `inset 8px 0 0 ${primary}` }}>{text}</div>
    </div>
  );

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        <ForestDefs />
        {!overallData && !useDemo ? (
          notice('NO OVERALL DATA AVAILABLE')
        ) : (
          <div key={`run-${run}-${useDemo ? 'demo' : 'live'}`} style={{ position: 'absolute', inset: 0 }}>
            <Header tournament={tournament} round={round} match={match} run={run} />
            {players.length === 0 ? (
              notice('NO PLAYER STATS YET')
            ) : (
              <>
                <HeroVine on={vines} front={false} />
                <HeroCard p={players[0]} run={run} />
                <HeroVine on={vines} front />
                {players.slice(1, 5).map((p, i) => (
                  <SmallCard key={p.uId || p._id || p.key || i} p={p} rank={i + 2} i={i} run={run} />
                ))}
              </>
            )}
          </div>
        )}

        {/* preview — BELOW the 1920×1080 canvas */}
        <button type="button" onClick={preview} style={btn}>
          ▶ PREVIEW ROAD TO MVP
        </button>
      </div>
    </ForestCtx.Provider>
  );
};

export default OverallFrags;