import React, { useCallback, useEffect, useId, useMemo, useRef, useState, createContext, useContext } from 'react';
import { isWinningPlacement, computeMatchStandings } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
/* FOREST — Match Standings, ALL teams in one piece (no paging).
   Standings come from computeMatchStandings exactly as before; rows show the
   TEAM TAG. The match leader gets the whole left side with its players; every
   other team is a slab on the right, in two columns sized so ~26 teams fit.

   ┌──────── MATCH LEADER ────────┐   ┌──────── MATCH STANDINGS ─────────────┐
   │ (01)👑  TAG   WWCD   [logo]  │ ⌇ │ tournament · round · match            │
   │                              │ ⌇ ├───────────────────┬───────────────────┤
   │   🧍 🧍 🧍 🧍  the team's     │ ⌇ │ 02 [logo] TAG  K P (22)│ 13 [logo] TAG … │
   │   players on the canopy,     │ ⌇ │ 03 [logo] TAG  K P (19)│ 14 …            │
   │   light rays + tree rings    │ ⌇ │ 04 …                   │ …               │
   │  NAME·5  NAME·4  NAME·3 …    │ ⌇ │                        │                 │
   │ [KILLS] [PLACE] [ TOTAL ]    │ ⌇ │                        │                 │
   │  LEAD OVER #2  +2 PTS        │ ⌇ │                        │                 │
   └──────────────────────────────┘   └───────────────────────────────────────┘

   Motion (state + CSS transitions only, so it always plays):
     the leader panel opens UPWARD and the standings header opens FROM THE
     RIGHT, each in three steps behind a fringe of leaves:
       1) grove (leader: logo plate + RANK 01 · header: team count)
       2) canopy   3) content
     then the leader's players rise one after another, stats count up, a
     vine weaves down the leader panel's edge; the other teams' slabs slide
     in from the right one by one with a leaf riding each; light rays turn
     slowly behind the players and a few leaves drift down.
   PREVIEW: a "Preview standings" button OUTSIDE the 1920×1080 canvas replays
   the sequence (22 dummy teams when there is no data). */

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

interface Player {
  _id: string;
  playerName: string;
  killNum: number;
  rank?: number;
  bHasDied: boolean;
  picUrl?: string;
  health: number;
  healthMax: number;
  liveState: number;
}

interface Team {
  _id: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
  teamFlag?: string;
  wwcd?: number;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchDataProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

/** the standings-row fields this screen uses */
interface Row {
  _id: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
  totalKills: number;
  placePoints: number;
  total: number;
  players?: { rank?: number }[];
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
const LEAD = { x: 50, y: 50, w: 760, h: 980 }; // the match leader, left
const LEAD_HEAD = 160; // rank + tag band
const SCENE_H = 530; // players
const BOARD = { x: 860, y: 50, w: 1010 }; // everyone else, right
const BOARD_HEAD = 130;
const LIST_TOP = BOARD.y + BOARD_HEAD + 20;
const LIST_BOTTOM = 1030;
const LIST_GAP = 22; // between the two columns
const LIST_LABEL_H = 30;
const SLAB_GAP = 7;
const CUT = 22;
const chamfer = (c: number) => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;
const SC = { rank: 50, logo: 74, kills: 62, place: 62, total: 74 };

/* -------------------- Timeline (ms) -------------------- */
/** same pace as the Top 5 Fraggers (40% slower than the first cuts) */
const SLOW = 1.4;
const S = (ms: number) => Math.round(ms * SLOW);
const STEP_MS = S(620);
const STEP_HOLD = S(260);
const steps = (s1: number) => {
  const s2 = s1 + STEP_MS + STEP_HOLD;
  const s3 = s2 + STEP_MS - S(120);
  return { s1, s2, s3, settled: s3 + Math.round(STEP_MS * 0.55) };
};
const T_LEAD = S(250);
const T_BOARD = S(500);
const LEAD_T = steps(T_LEAD);
const BOARD_T = steps(T_BOARD);
const T_PLAYERS = LEAD_T.settled;
const PLAYER_STAGGER = S(170);
const T_STATS = T_PLAYERS + S(500);
const T_SLABS = BOARD_T.settled;
const SLAB_STAGGER = S(45);
const SLAB_MS = S(480);
const T_VINE = LEAD_T.settled + S(200);
const VINE_SEG_MS = S(70);
const T_DRIFT = T_SLABS + S(1600);

/* ── dummy standings for the preview button ── */
const DEMO_TAGS = ['NOVA', 'TSM', 'FAZE', 'DRX', 'BTR', 'STE', 'IHC', 'GEN', 'T1', 'DPLUS', 'RRQ', '4AM', 'ALTER EGO', 'VAMOS', 'HORAA', 'NIGMA', 'FLC', 'WBG', 'KINGS', 'DMY', 'ACE', 'ZETA'];
const DEMO: Row[] = DEMO_TAGS.map((t, i) => {
  const place = [10, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][i];
  const kills = Math.max(0, 14 - i + ((i * 7) % 4));
  return { _id: `d${i}`, teamTag: t, teamLogo: '/def_logo.png', totalKills: kills, placePoints: place, total: kills + place, players: [{ rank: i + 1 }] };
}).sort((a, b) => b.total - a.total);
const DEMO_PLAYERS = [
  { playerName: 'VIPER', killNum: 5, picUrl: '' },
  { playerName: 'SHADOW', killNum: 4, picUrl: '' },
  { playerName: 'KRYPTO', killNum: 3, picUrl: '' },
  { playerName: 'ORBIT', killNum: 2, picUrl: '' },
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
const Crown = ({ color, size = 26 }: { color: string; size?: number }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block', flex: 'none' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
    <rect x="6" y="27" width="28" height="3" fill={color} />
  </svg>
);

/* -------------------- Small pieces -------------------- */
const Plate: React.FC<{ logo: string; flag?: string; alt: string; w: number; h: number }> = ({ logo, flag, alt, w, h }) => (
  <div style={{ width: w, height: h, flex: 'none', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.45))' }}>
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
      <TeamLogo logo={logo} flag={flag} fallback={'/def_logo.png'} alt={alt} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
    </div>
  </div>
);

const WwcdTag: React.FC<{ size: number }> = ({ size }) => {
  const { pal } = useContext(ForestCtx);
  return (
    <span
      style={{
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.35,
        background: 'linear-gradient(180deg, #FFFFFF, #E6E6EC)',
        color: INK,
        padding: `${size * 0.25}px ${size * 0.7}px ${size * 0.2}px ${size * 0.5}px`,
        fontSize: size,
        letterSpacing: '0.16em',
        clipPath: 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
      }}
    >
      <Crown color={pal.primary} size={size * 1.15} />
      WWCD
    </span>
  );
};

/** slow-turning light rays behind the players */
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
        top: '58%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        opacity: on ? 0.5 : 0,
        transition: `opacity ${S(1000)}ms ease`,
        pointerEvents: 'none',
        WebkitMaskImage: 'radial-gradient(circle, #000 12%, transparent 66%)',
        maskImage: 'radial-gradient(circle, #000 12%, transparent 66%)',
      }}
    >
      <div ref={ref} style={{ position: 'absolute', inset: 0, background: `repeating-conic-gradient(from 0deg, ${pal.sceneGlow} 0deg 6deg, transparent 6deg 20deg)` }} />
    </div>
  );
};

/* -------------------- Leader stat chip -------------------- */
const LeadStat: React.FC<{ label: string; value: number; at: number; run: number; hero?: boolean; flex?: number }> = ({ label, value, at, run, hero, flex = 1 }) => {
  const { pal } = useContext(ForestCtx);
  const on = useAfter(at, run);
  const v = useCountUp(value, on, S(900));
  return (
    <div
      style={{
        flex,
        height: 176,
        clipPath: chamfer(16),
        background: hero ? `${GRAIN}, linear-gradient(150deg, ${pal.canopy[0]}, ${pal.canopy[1]} 55%, ${pal.canopy[2]})` : 'linear-gradient(180deg, #FFFFFF, #E6E6EC)',
        boxShadow: hero ? `inset 0 0 0 2px ${pal.label}` : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        opacity: on ? 1 : 0,
        transform: on ? 'none' : 'translateY(24px) scale(.94)',
        transition: `opacity ${S(260)}ms linear, transform ${S(520)}ms cubic-bezier(.34,1.4,.64,1)`,
      }}
    >
      <span style={{ fontSize: hero ? 96 : 76, lineHeight: 0.85, color: hero ? WHITE : INK, fontVariantNumeric: 'tabular-nums', textShadow: hero ? SHADOW : 'none' }}>{Math.round(v)}</span>
      <span style={{ fontSize: 18, letterSpacing: '0.26em', paddingLeft: '0.26em', color: hero ? pal.label : '#55555E' }}>{label}</span>
    </div>
  );
};

/* -------------------- The match leader (left) -------------------- */
interface LeadPlayer {
  playerName: string;
  killNum: number;
  picUrl?: string;
}

const Leader: React.FC<{ team: Row; players: LeadPlayer[]; lead: number | null; run: number }> = ({ team, players, lead, run }) => {
  const { pal } = useContext(ForestCtx);
  const s1 = useAfter(LEAD_T.s1, run);
  const s2 = useAfter(LEAD_T.s2, run);
  const s3 = useAfter(LEAD_T.s3, run);
  const settled = useAfter(LEAD_T.settled, run);
  const statsOn = useAfter(T_STATS, run);
  const winner = isWinningPlacement(team.placePoints, (team.players?.[0] as any)?.rank);
  const tag = (team.teamTag || '').toUpperCase();
  const tagSize = tag.length <= 5 ? 92 : tag.length <= 8 ? 74 : 58;
  const n = Math.max(1, players.length);
  const PW = 300; // each player image
  const step = n === 1 ? 0 : Math.min(190, (LEAD.w - 80 - PW) / (n - 1));
  const groupW = PW + step * (n - 1);
  // centre players stand a little taller and in front
  const order = players.map((p, i) => ({ p, i, mid: Math.abs(i - (n - 1) / 2) }));

  return (
    <div style={{ position: 'absolute', left: LEAD.x, top: LEAD.y, width: LEAD.w, height: LEAD.h, zIndex: 1, filter: 'drop-shadow(0 22px 40px rgba(0,0,0,.5))', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: chamfer(CUT + 8) }}>
        {/* 1 — grove: logo plate + RANK 01 */}
        <Reveal open={s1} dir="up" w={LEAD.w} h={LEAD.h} fringe="M">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 50% 30% at 50% 45%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 34,
            }}
          >
            <div style={{ transform: s1 ? 'scale(1)' : 'scale(.55)', opacity: s1 ? 1 : 0, transition: `transform ${S(560)}ms cubic-bezier(.34,1.56,.64,1) ${Math.round(STEP_MS * 0.5)}ms, opacity ${S(200)}ms linear ${Math.round(STEP_MS * 0.5)}ms` }}>
              <Plate logo={team.teamLogo} flag={team.teamFlag} alt={tag} w={380} h={230} />
            </div>
            <div style={{ fontSize: 40, letterSpacing: '0.3em', paddingLeft: '0.3em', color: WHITE, textShadow: SHADOW }}>
              RANK <span style={{ color: pal.label, fontSize: 60, letterSpacing: 0 }}>01</span>
            </div>
          </div>
        </Reveal>
        {/* 2 — canopy */}
        <Reveal open={s2} dir="up" w={LEAD.w} h={LEAD.h} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(160deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})` }} />
        </Reveal>
        {/* 3 — content */}
        <Reveal open={s3} dir="up" w={LEAD.w} h={LEAD.h} fringe="P">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})` }}>
            {/* head band: rank · tag · WWCD · logo */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: LEAD_HEAD, display: 'flex', alignItems: 'center', gap: 22, padding: '22px 36px 0 40px', boxSizing: 'border-box' }}>
              <div style={{ position: 'relative', flex: 'none' }}>
                <div style={{ position: 'absolute', left: '50%', top: -30, transform: 'translateX(-50%)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.6))' }}>
                  <Crown color={pal.label} size={44} />
                </div>
                <div
                  style={{
                    width: 92,
                    height: 92,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 50,
                    paddingTop: 4,
                    boxSizing: 'border-box',
                    color: INK,
                    background: `repeating-radial-gradient(circle, rgba(0,0,0,.12) 0px, rgba(0,0,0,.12) 1.5px, transparent 1.5px, transparent 7px), radial-gradient(circle, #FFFFFF 0%, ${pal.label} 100%)`,
                    boxShadow: '0 0 0 4px rgba(0,0,0,.45), 0 6px 14px rgba(0,0,0,.5)',
                    transform: settled ? 'scale(1) rotate(0deg)' : 'scale(.4) rotate(-90deg)',
                    transition: `transform ${S(600)}ms cubic-bezier(.34,1.56,.64,1)`,
                  }}
                >
                  01
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, letterSpacing: '0.34em', color: pal.label }}>MATCH LEADER</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
                  <span
                    style={{
                      fontSize: tagSize,
                      color: WHITE,
                      lineHeight: 0.9,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      textShadow: '0 4px 12px rgba(0,0,0,.6)',
                      clipPath: settled ? 'inset(0 0 -10% 0)' : 'inset(0 100% -10% 0)',
                      transition: `clip-path ${S(700)}ms cubic-bezier(.65,0,.25,1)`,
                    }}
                  >
                    {tag}
                  </span>
                  {winner && <WwcdTag size={18} />}
                </div>
              </div>
              <Plate logo={team.teamLogo} flag={team.teamFlag} alt={tag} w={150} h={92} />
            </div>

            {/* the players, on the canopy */}
            <div
              style={{
                position: 'absolute',
                left: 24,
                right: 24,
                top: LEAD_HEAD,
                height: SCENE_H,
                overflow: 'hidden',
                clipPath: chamfer(18),
                background: `repeating-radial-gradient(circle at 50% 70%, rgba(255,255,255,.07) 0px, rgba(255,255,255,.07) 2px, transparent 2px, transparent 18px),
                             radial-gradient(ellipse 60% 55% at 50% 65%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%),
                             linear-gradient(180deg, ${pal.canopy[2]}, ${pal.canopy[1]} 70%, ${pal.canopy[0]})`,
              }}
            >
              <Rays on={settled} size={1100} />
              <div style={{ position: 'absolute', left: '50%', top: 40, width: 420, height: 420, transform: 'translateX(-50%)', opacity: 0.12, filter: 'grayscale(1) brightness(2.2)' }}>
                <TeamLogo logo={team.teamLogo} flag={team.teamFlag} fallback={'/def_logo.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              {order.map(({ p, i, mid }) => (
                <LeadPhoto key={i} p={p} left={(LEAD.w - 48 - groupW) / 2 + i * step} w={PW} h={SCENE_H - 70 - mid * 26} z={10 - Math.round(mid * 2)} at={T_PLAYERS + i * PLAYER_STAGGER} run={run} />
              ))}
              {/* fade to the floor + name tags */}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, background: `linear-gradient(180deg, rgba(0,0,0,0), ${pal.black[0]})`, zIndex: 12 }} />
              <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, display: 'flex', justifyContent: 'center', gap: 10, zIndex: 13 }}>
                {players.map((p, i) => (
                  <NameTag key={i} p={p} at={T_PLAYERS + i * PLAYER_STAGGER + S(350)} run={run} />
                ))}
              </div>
            </div>

            {/* stats */}
            <div style={{ position: 'absolute', left: 24, right: 24, top: LEAD_HEAD + SCENE_H + 22, display: 'flex', gap: 14 }}>
              <LeadStat label="KILLS" value={num(team.totalKills)} at={T_STATS} run={run} />
              <LeadStat label="PLACE" value={num(team.placePoints)} at={T_STATS + S(120)} run={run} />
              <LeadStat label="TOTAL PTS" value={num(team.total)} at={T_STATS + S(240)} run={run} hero flex={1.3} />
            </div>
            {/* lead over #2 */}
            {lead !== null && (
              <div
                style={{
                  position: 'absolute',
                  left: 24,
                  right: 24,
                  bottom: 34,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  opacity: statsOn ? 1 : 0,
                  transition: `opacity ${S(400)}ms linear ${S(500)}ms`,
                }}
              >
                <svg width={26} height={16} viewBox="0 -12 40 24" aria-hidden>
                  <path d={LEAF_SHAPE} fill={pal.label} />
                </svg>
                <span style={{ fontSize: 20, letterSpacing: '0.26em', color: 'rgba(255,255,255,.75)' }}>LEAD OVER #2</span>
                <span style={{ flex: 1, height: 2, background: `linear-gradient(90deg, ${pal.label}, rgba(255,255,255,0))` }} />
                <span style={{ fontSize: 40, color: WHITE, fontVariantNumeric: 'tabular-nums' }}>
                  {lead > 0 ? '+' : ''}
                  {lead}
                  <span style={{ fontSize: 20, letterSpacing: '0.16em', color: pal.label, marginLeft: 8 }}>PTS</span>
                </span>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </div>
  );
};

const LeadPhoto: React.FC<{ p: LeadPlayer; left: number; w: number; h: number; z: number; at: number; run: number }> = ({ p, left, w, h, z, at, run }) => {
  const on = useAfter(at, run);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        bottom: 40,
        width: w,
        height: h,
        zIndex: z,
        transform: on ? 'none' : 'translateY(90px)',
        opacity: on ? 1 : 0,
        transition: `transform ${S(800)}ms cubic-bezier(.16,1,.3,1), opacity ${S(300)}ms linear`,
        filter: 'drop-shadow(0 10px 18px rgba(0,0,0,.5))',
      }}
    >
      <img
        src={playerPhoto(p.picUrl) || '/def_char.avif'}
        alt={p.playerName}
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', objectPosition: 'bottom center' }}
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/def_char.avif';
        }}
      />
    </div>
  );
};

const NameTag: React.FC<{ p: LeadPlayer; at: number; run: number }> = ({ p, at, run }) => {
  const { pal } = useContext(ForestCtx);
  const on = useAfter(at, run);
  const name = (p.playerName || '').toUpperCase();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        minWidth: 0,
        maxWidth: 170,
        clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
        opacity: on ? 1 : 0,
        transform: on ? 'none' : 'translateY(10px)',
        transition: `opacity ${S(250)}ms linear, transform ${S(400)}ms cubic-bezier(.2,.8,.2,1)`,
      }}
    >
      <span style={{ background: 'linear-gradient(180deg, #FFFFFF, #E6E6EC)', color: INK, padding: '7px 10px 6px 14px', fontSize: 19, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{name}</span>
      <span style={{ background: `linear-gradient(180deg, ${pal.canopy[0]}, ${pal.canopy[1]})`, color: WHITE, padding: '7px 14px 6px 8px', fontSize: 19, display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
        {num(p.killNum)}
        <span style={{ fontSize: 11, letterSpacing: '0.12em', color: pal.label }}>K</span>
      </span>
    </div>
  );
};

/* -------------------- Board header (right) -------------------- */
const BoardHead: React.FC<{ run: number; context: string; teams: number }> = ({ run, context, teams }) => {
  const { pal } = useContext(ForestCtx);
  const s1 = useAfter(BOARD_T.s1, run);
  const s2 = useAfter(BOARD_T.s2, run);
  const s3 = useAfter(BOARD_T.s3, run);
  const settled = useAfter(BOARD_T.settled, run);
  return (
    <div style={{ position: 'absolute', left: BOARD.x, top: BOARD.y, width: BOARD.w, height: BOARD_HEAD, zIndex: 1, filter: 'drop-shadow(0 16px 30px rgba(0,0,0,.45))', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: chamfer(CUT) }}>
        <Reveal open={s1} dir="fromRight" w={BOARD.w} h={BOARD_HEAD} fringe="M">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 30% 60% at 50% 50%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              fontSize: 44,
              color: WHITE,
              letterSpacing: '0.14em',
              textShadow: SHADOW,
            }}
          >
            <span style={{ color: pal.label, fontSize: 64, letterSpacing: 0 }}>{teams}</span> TEAMS
          </div>
        </Reveal>
        <Reveal open={s2} dir="fromRight" w={BOARD.w} h={BOARD_HEAD} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(245deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})` }} />
        </Reveal>
        <Reveal open={s3} dir="fromRight" w={BOARD.w} h={BOARD_HEAD} fringe="P">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 40% 80% at 0% 0%, ${pal.sceneGlow.replace(/[\d.]+\)$/, '0.3)')} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 36px 0 40px',
              gap: 20,
            }}
          >
            <div
              style={{
                fontSize: 54,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                background: `linear-gradient(180deg, #FFFFFF 40%, ${pal.label})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.6))',
                clipPath: settled ? 'inset(0 0 -10% 0)' : 'inset(0 100% -10% 0)',
                transition: `clip-path ${S(700)}ms cubic-bezier(.65,0,.25,1)`,
              }}
            >
              MATCH STANDINGS
            </div>
            {context && (
              <div
                style={{
                  flex: 'none',
                  background: 'linear-gradient(180deg, #FFFFFF, #E6E6EC)',
                  color: INK,
                  padding: '8px 18px 7px 22px',
                  fontSize: 15,
                  letterSpacing: '0.1em',
                  whiteSpace: 'nowrap',
                  clipPath: 'polygon(12px 0, 100% 0, 100% 100%, 0 100%)',
                  opacity: settled ? 1 : 0,
                  transform: settled ? 'none' : 'translateX(20px)',
                  transition: `opacity ${S(300)}ms linear ${S(300)}ms, transform ${S(500)}ms cubic-bezier(.2,.8,.2,1) ${S(300)}ms`,
                }}
              >
                {context}
              </div>
            )}
            <div style={{ position: 'absolute', left: CUT, right: 0, bottom: 0, height: 6, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />
          </div>
        </Reveal>
      </div>
    </div>
  );
};

/* -------------------- One team slab (right) -------------------- */
const Slab: React.FC<{ team: Row; rank: number; h: number; at: number; run: number }> = ({ team, rank, h, at, run }) => {
  const { pal } = useContext(ForestCtx);
  const on = useAfter(at, run);
  const podium = rank <= 3;
  const winner = isWinningPlacement(team.placePoints, (team.players?.[0] as any)?.rank);
  const tag = (team.teamTag || '').toUpperCase();
  const tagFont = Math.round(h * (tag.length <= 6 ? 0.56 : tag.length <= 9 ? 0.46 : 0.4));
  const numFont = Math.round(h * 0.52);
  const fg = podium ? INK : WHITE;
  const plateH = Math.round(h * 0.82);
  return (
    <div style={{ position: 'relative', height: h }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          clipPath: 'polygon(14px 0, 100% 0, 100% 100%, 14px 100%, 0 50%)',
          background: podium ? 'linear-gradient(180deg, #FFFFFF, #E4E4EA)' : `${GRAIN}, linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})`,
          boxShadow: podium ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,.08)',
          transform: on ? 'none' : 'translateX(110%)',
          opacity: on ? 1 : 0,
          transition: `transform ${SLAB_MS}ms cubic-bezier(.16,1,.3,1), opacity ${S(150)}ms linear`,
          fontFamily: FONT,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        <div style={{ width: SC.rank, flex: 'none', textAlign: 'center', paddingLeft: 8, fontSize: Math.round(h * 0.48), color: podium ? INK : pal.label, fontVariantNumeric: 'tabular-nums' }}>{String(rank).padStart(2, '0')}</div>
        <div style={{ width: SC.logo, flex: 'none', display: 'flex', justifyContent: 'center' }}>
          {podium ? (
            <div style={{ width: plateH, height: plateH, display: 'flex', alignItems: 'center', justifyContent: 'center', background: INK, borderRadius: 8, padding: Math.round(plateH * 0.14), boxSizing: 'border-box' }}>
              <TeamLogo logo={team.teamLogo} flag={team.teamFlag} fallback={'/def_logo.png'} alt={tag} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          ) : (
            <Plate logo={team.teamLogo} flag={team.teamFlag} alt={tag} w={Math.round(plateH * 1.55)} h={plateH} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 10 }}>
          <span style={{ fontSize: tagFont, color: fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag}</span>
          {winner && <WwcdTag size={12} />}
        </div>
        <div style={{ width: SC.kills, flex: 'none', textAlign: 'center', fontSize: numFont, color: fg, fontVariantNumeric: 'tabular-nums' }}>{num(team.totalKills)}</div>
        <div style={{ width: SC.place, flex: 'none', textAlign: 'center', fontSize: numFont, color: podium ? '#55555E' : 'rgba(255,255,255,.7)', fontVariantNumeric: 'tabular-nums' }}>{num(team.placePoints)}</div>
        <div
          style={{
            width: SC.total,
            alignSelf: 'stretch',
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.round(h * 0.6),
            color: WHITE,
            fontVariantNumeric: 'tabular-nums',
            background: `linear-gradient(160deg, ${pal.canopy[0]}, ${pal.canopy[1]} 60%, ${pal.canopy[2]})`,
            clipPath: 'polygon(10px 0, 100% 0, 100% 100%, 0 100%)',
            textShadow: SHADOW,
          }}
        >
          {num(team.total)}
        </div>
      </div>
      {/* a leaf riding in with the slab */}
      <svg
        width={26}
        height={17}
        viewBox="0 -14 40 28"
        style={{
          position: 'absolute',
          top: '50%',
          marginTop: -8,
          left: on ? -10 : '105%',
          opacity: on ? 0 : 1,
          transition: `left ${SLAB_MS}ms cubic-bezier(.16,1,.3,1), opacity ${S(250)}ms linear ${Math.round(SLAB_MS * 0.6)}ms`,
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 2,
        }}
        aria-hidden
      >
        <g transform={`rotate(${rank % 2 ? 160 : 200})`}>
          <LeafShape tone={rank % 3 === 0 ? 'S' : rank % 3 === 1 ? 'P' : 'M'} />
        </g>
      </svg>
    </div>
  );
};

const ListLabels: React.FC<{ on: boolean }> = ({ on }) => {
  const { pal } = useContext(ForestCtx);
  const l: React.CSSProperties = { fontSize: 13, letterSpacing: '0.08em', color: 'rgba(255,255,255,.85)', textAlign: 'center', textShadow: SHADOW };
  return (
    <div style={{ height: LIST_LABEL_H, display: 'flex', alignItems: 'center', opacity: on ? 1 : 0, transition: `opacity ${S(400)}ms linear`, fontFamily: FONT, fontWeight: 700 }}>
      <span style={{ ...l, width: SC.rank, paddingLeft: 8 }}>#</span>
      <span style={{ ...l, flex: 1, textAlign: 'left', paddingLeft: SC.logo + 10 }}>TEAM</span>
      <span style={{ ...l, width: SC.kills }}>KILLS</span>
      <span style={{ ...l, width: SC.place }}>PLACE</span>
      <span style={{ ...l, width: SC.total, color: pal.label }}>TOTAL</span>
    </div>
  );
};

/* -------------------- Vine down the leader panel's right edge -------------------- */
type Pt = [number, number];
const EDGE_VINE = (() => {
  const x = LEAD.x + LEAD.w;
  const top = LEAD.y + 40;
  const bottom = LEAD.y + LEAD.h - 20;
  const N = 14;
  const pts: Pt[] = Array.from({ length: N + 1 }, (_, i) => [x + (i % 2 === 0 ? -14 : 16), top + ((bottom - top) * i) / N]);
  const f = (n: number) => n.toFixed(1);
  const segs = pts.slice(0, -1).map((_, i) => {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    return {
      d: `M${f(p1[0])},${f(p1[1])} C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`,
      front: i % 2 === 0,
      i,
    };
  });
  const tones: Tone[] = ['P', 'M', 'S'];
  const leaves = pts.slice(1).map((p, k) => {
    const prev = pts[k];
    const right = p[0] > prev[0];
    return { x: (p[0] + prev[0]) / 2, y: (p[1] + prev[1]) / 2, r: right ? -20 + (k % 3) * 14 : 200 - (k % 3) * 14, s: 0.6 + (k % 3) * 0.07, tone: tones[k % 3], i: k };
  });
  return { segs, leaves };
})();

const EdgeVine: React.FC<{ on: boolean; front: boolean }> = ({ on, front }) => {
  const { pal, gid } = useContext(ForestCtx);
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 3 : 0 }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        {EDGE_VINE.segs
          .filter((s) => s.front === front)
          .map((s) => (
            <GrowStem key={s.i} d={s.d} w={10} col={pal.vineA} on={on} delay={s.i * VINE_SEG_MS} dur={VINE_SEG_MS + 30} ease="linear" />
          ))}
        {front &&
          EDGE_VINE.leaves.map((l, k) => (
            <g key={k} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r}) scale(${l.s.toFixed(2)})`}>
              <Unfurl on={on} delay={l.i * VINE_SEG_MS + 80}>
                <LeafShape tone={l.tone} />
              </Unfurl>
            </g>
          ))}
      </g>
    </svg>
  );
};

/* -------------------- Drifting leaves -------------------- */
const DRIFT = [
  { x: 840, s: 0.8, dur: 10000, delay: 0, sway: 50, t: 'P' as Tone },
  { x: 1890, s: 0.7, dur: 12000, delay: 2600, sway: -50, t: 'S' as Tone },
  { x: 20, s: 0.65, dur: 11000, delay: 5200, sway: 40, t: 'M' as Tone },
  { x: 1400, s: 0.6, dur: 13000, delay: 7800, sway: -60, t: 'P' as Tone },
];
const DriftLeaf: React.FC<{ d: (typeof DRIFT)[number]; on: boolean }> = ({ d, on }) => {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el?.animate) return;
    const a = el.animate(
      [
        { transform: 'translate(0px, -80px) rotate(0deg)', opacity: 0 },
        { transform: `translate(${d.sway}px, 200px) rotate(140deg)`, opacity: 0.85, offset: 0.15 },
        { transform: `translate(${-d.sway}px, 600px) rotate(320deg)`, opacity: 0.85, offset: 0.55 },
        { transform: `translate(${d.sway * 0.6}px, 1000px) rotate(470deg)`, opacity: 0.7, offset: 0.9 },
        { transform: 'translate(0px, 1180px) rotate(540deg)', opacity: 0 },
      ],
      { duration: d.dur, delay: d.delay, iterations: Infinity, easing: 'linear', fill: 'both' }
    );
    return () => a.cancel();
  }, [on, d]);
  return (
    <svg ref={ref} width={44 * d.s} height={30 * d.s} viewBox="-2 -15 44 30" style={{ position: 'absolute', left: d.x, top: 0, opacity: 0, overflow: 'visible' }} aria-hidden>
      <LeafShape tone={d.t} />
    </svg>
  );
};

/* -------------------- MatchData (Match Standings) -------------------- */
const MatchDataComponent: React.FC<MatchDataProps> = ({ tournament, round, match, matchData }) => {
  const realRows = useMemo(() => computeMatchStandings(matchData as any) as unknown as Row[], [matchData]);
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);
  const usingDemo = !(matchData && realRows.length) && demo;
  const rows: Row[] = matchData && realRows.length ? realRows : demo ? DEMO : [];

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fm' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  const leader = rows[0];
  // the leader's players (photos + kills), best fragger first
  const leaderPlayers: LeadPlayer[] = useMemo(() => {
    if (!leader) return [];
    if (usingDemo) return DEMO_PLAYERS;
    const team = matchData?.teams?.find((t) => t._id === leader._id || t.teamTag === leader.teamTag);
    const list = (team?.players ?? (leader.players as any[]) ?? []) as any[];
    return list
      .filter((p) => p && (p.playerName || p.picUrl))
      .map((p) => ({ playerName: p.playerName || '', killNum: num(p.killNum), picUrl: p.picUrl }))
      .sort((a, b) => b.killNum - a.killNum)
      .slice(0, 4);
  }, [leader, usingDemo, matchData]);
  const lead = rows.length > 1 ? num(rows[0].total) - num(rows[1].total) : null;

  // everyone else: two columns on the right, sized so every team fits
  const rest = rows.slice(1);
  const perCol = Math.max(1, Math.ceil(rest.length / 2));
  const colA = rest.slice(0, perCol);
  const colB = rest.slice(perCol);
  const slabH = Math.max(34, Math.min(66, Math.floor((LIST_BOTTOM - LIST_TOP - LIST_LABEL_H - SLAB_GAP * (perCol - 1)) / perCol)));
  const colW = colB.length ? (BOARD.w - LIST_GAP) / 2 : BOARD.w;

  const labelsOn = useAfter(T_SLABS, run);
  const vine = useAfter(T_VINE, run);
  const drift = useAfter(T_DRIFT, run);

  const matchNo = match?.matchNo ?? match?._matchNo;
  const context = [
    tournament.tournamentName,
    round?.roundName,
    match?.matchName || (matchNo != null ? `MATCH ${String(matchNo).padStart(2, '0')}` : ''),
  ]
    .filter(Boolean)
    .join('  ·  ')
    .toUpperCase();

  const column = (list: Row[], firstRank: number, startIndex: number) => (
    <div style={{ width: colW, flex: 'none', display: 'flex', flexDirection: 'column', gap: SLAB_GAP }}>
      <ListLabels on={labelsOn} />
      {list.map((t, i) => (
        <Slab key={t._id} team={t} rank={firstRank + i} h={slabH} at={T_SLABS + (startIndex + i) * SLAB_STAGGER} run={run} />
      ))}
    </div>
  );

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
        <ForestDefs />
        {leader ? (
          <div key={`run-${run}`}>
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
              {DRIFT.map((d, i) => (
                <DriftLeaf key={i} d={d} on={drift} />
              ))}
            </div>
            <EdgeVine on={vine} front={false} />
            <Leader team={leader} players={leaderPlayers} lead={lead} run={run} />
            <EdgeVine on={vine} front />
            <BoardHead run={run} context={context} teams={rows.length} />
            {rest.length > 0 && (
              <div style={{ position: 'absolute', left: BOARD.x, top: LIST_TOP - LIST_LABEL_H + 6, width: BOARD.w, display: 'flex', gap: LIST_GAP, zIndex: 1, overflow: 'hidden', paddingLeft: 2 }}>
                {column(colA, 2, 0)}
                {colB.length > 0 && column(colB, 2 + perCol, colA.length)}
              </div>
            )}
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
              NO MATCH DATA
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
            top: 468,
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
          ▶ PREVIEW STANDINGS
        </button>
      </div>
    </ForestCtx.Provider>
  );
};

export default MatchDataComponent;