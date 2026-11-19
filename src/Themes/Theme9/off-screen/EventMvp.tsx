import React, { useEffect, useId, useMemo, useRef, useState, createContext, useContext } from 'react';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';

/* FOREST — Event MVP.
   Data preserved: MVP = top of computeFraggerScores(buildFraggerPool(matchDatas))
   sorted by compareFraggerScore; top 5 kept; event-cumulative totals
   (totalKills / totalDamage / totalAssists / totalKnockouts); per-match
   averages use the matches each player appears in; same empty guard; dummy
   players for the preview.

        🌲🌲   🧍 the MVP, BIG   🌲🌲         ┌ PERFORMANCE        12 MATCHES ┐
        (small pine forest behind,          │            47                  │
         fireflies, heavy leaf fall)        │   3.9      KILLS     52        │
   ┌───────────────────────────────────┐    │        \  🍃  ★  🍃 /           │
   │ [logo] ★ EVENT MVP                │    │          leaf petals           │
   │        VIPER          DMY · TEAM  │    │   14                 9,120     │
   └───────────────────────────────────┘    │  🍃 MVP  ┄ TOP 5 AVG  ○ BEST   │
                                            └────────────────────────────────┘
   One diagram: six leaf-shaped petals (kills, knocks, damage, avg damage,
   assists, avg kills). Petal length = the MVP's value against the best of
   the event's top 5 (outer circle = best); the dashed petal inside each one
   is the top-5 average.

   Motion (state + CSS transitions only, so it always plays) — the same intro
   as the Champions screen:
     a flash of light opens the scene and leaves spiral out of it · a big
     EVENT MVP + star slams in, holds, then lifts away · the forest grows up
     row by row · the identity box opens from the left and the performance
     panel from the right, each in three steps behind a fringe of leaves ·
     the MVP rises as a dark silhouette and lights up into full colour, the
     scene gives a small punch and a burst of leaves flies out · the outer
     circle draws itself, the six petals grow out of the centre one after
     another (with a little spring), their numbers pop and count up, and the
     dashed top-5 averages fade in · a heavy fall
     of leaves keeps drifting down over the MVP.
   PREVIEW: "▶ PREVIEW EVENT MVP" sits just BELOW the 1920×1080 canvas; it
   replays the sequence and uses dummy players when there is no data. */

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
  day?: string;
}

interface Player {
  _id: string;
  uId: string;
  playerName: string;
  killNum?: number;
  damage?: number | string;
  assists?: number;
  knockouts?: number;
  picUrl?: string;
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
  userId: string;
  teams: Team[];
  createdAt: string;
}

interface EventMvpProps {
  tournament: Tournament;
  round?: Round | null;
  overallData?: OverallData | null;
  // Not used by the MVP derivation (which pools matchDatas), but
  // PublicThemeRenderer passes these for the 'EventMvp' view.
  matches?: any[];
  matchDatas?: any[];
}

/* the fields read from a scored pool entry */
interface MvpRow {
  _id?: string;
  uId?: string;
  playerName: string;
  picUrl?: string;
  teamName?: string;
  teamTag?: string;
  teamLogo?: string;
  teamFlag?: string;
  killNum?: number;
  numericDamage?: number;
  assists?: number;
  knockouts?: number;
  matches?: number; // matches this player appears in (counted from matchDatas)
}

const DEF_PLAYER =
  'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1735718663/defult_chach_apsjhc_jydubc.png';

/* -------------------- Palette + type -------------------- */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const YELLOW = '#F5C518'; // the MVP's radar outline
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";
const SHADOW = '0 0 1px rgba(0,0,0,.9), 0 2px 4px rgba(0,0,0,.6)';

/** White logo plate — traced from Layer_2.png (same as the other overlays). */
const PLATE_CUT =
  'polygon(4% 0%, 82.9% 0%, 99.7% 77.7%, 82.6% 53.1%, 92.8% 100%, 10.2% 96%, 0.3% 46.9%, 18.2% 74.1%)';

/* -------------------- Geometry -------------------- */
const BOX = { x: 60, y: 800, w: 1000, h: 240 }; // identity box (left, below the MVP)
const CX = 560; // centre of the MVP scene
const PLAYERS_BOTTOM = BOX.y + 110; // the MVP stands BEHIND the box
const PHOTO_W = 720;
const PHOTO_H = 860;
const RP = { x: 1110, y: 50, w: 760, h: 990 }; // performance panel (right)
const CUT = 28;
const chamfer = (c: number) => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

/* -------------------- Timeline (ms) -------------------- */
/** same pace as the other forest overlays (40% slower than the first cuts) */
const SLOW = 1.4;
const S = (ms: number) => Math.round(ms * SLOW);
const STEP_MS = S(620);
const STEP_HOLD = S(300);
const steps = (s1: number) => {
  const s2 = s1 + STEP_MS + STEP_HOLD;
  const s3 = s2 + STEP_MS - S(120);
  return { s1, s2, s3, settled: s3 + Math.round(STEP_MS * 0.55) };
};
const T_FLASH = S(60); // a flash of light opens the scene
const T_SWIRL = S(150); // leaves spiral out of it
const T_FOREST = S(250);
const T_TITLE_IN = S(550); // big EVENT MVP slams in …
const T_TITLE_OUT = S(2300); // … and lifts away as the MVP appears
const BOX_T = steps(S(1000));
const PANEL_T = steps(S(1150));
const T_PLAYERS = T_TITLE_OUT + S(150);
const PLAYER_LIGHT = S(500); // silhouette → full colour
const T_BURST = T_PLAYERS + PLAYER_LIGHT + S(200);
const T_FALL = T_PLAYERS + S(500);
const T_FLIES = S(900);
const T_HEX = Math.max(PANEL_T.settled, T_BURST - S(300)); // charts draw once the panel is open

const num = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
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

/* ── dummy data for the preview button ── */
const DEMO: MvpRow[] = [
  { _id: 'd1', playerName: 'VIPER', teamName: 'DUMMY ESPORTS', teamTag: 'DMY', teamLogo: '/def_logo.png', killNum: 47, numericDamage: 9120, knockouts: 52, assists: 14, matches: 12 },
  { _id: 'd2', playerName: 'SHADOW', teamName: 'NOVA GAMING', teamTag: 'NOVA', teamLogo: '/def_logo.png', killNum: 41, numericDamage: 8475, knockouts: 44, assists: 19, matches: 12 },
  { _id: 'd3', playerName: 'KRYPTO', teamName: 'TEAM STORM', teamTag: 'STRM', teamLogo: '/def_logo.png', killNum: 38, numericDamage: 9302, knockouts: 40, assists: 11, matches: 11 },
  { _id: 'd4', playerName: 'NEXUS', teamName: 'ALPHA SEVEN', teamTag: 'A7', teamLogo: '/def_logo.png', killNum: 35, numericDamage: 7110, knockouts: 39, assists: 16, matches: 12 },
  { _id: 'd5', playerName: 'BLAZE', teamName: 'RED WOLVES', teamTag: 'RW', teamLogo: '/def_logo.png', killNum: 33, numericDamage: 6890, knockouts: 35, assists: 9, matches: 10 },
];

/* matches a player appears in — used only for the per-match averages */
function countMatches(p: any, matchDatas: any[]): number {
  if (num(p.matchesPlayed) > 0) return num(p.matchesPlayed);
  let n = 0;
  for (const md of matchDatas || []) {
    const found = (md?.teams || []).some((t: any) =>
      (t?.players || []).some(
        (q: any) =>
          (p.uId && q.uId === p.uId) || (p._id && q._id === p._id) || (!p.uId && !p._id && q.playerName === p.playerName)
      )
    );
    if (found) n++;
  }
  return n;
}

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


/* -------------------- Forest behind the MVP -------------------- */
const FOREST_BASE = BOX.y + 70; // tree line sits behind the box's top edge
type Tree = { x: number; h: number; d: string; delay: number };
const pinePath = (x: number, base: number, h: number) => {
  const f = (n: number) => n.toFixed(1);
  let d = '';
  for (let i = 0; i < 4; i++) {
    const top = base - h + i * h * 0.19;
    const bottom = top + h * 0.34;
    const hw = h * 0.2 * (0.5 + 0.22 * i);
    d += `M${f(x)},${f(top)} L${f(x + hw)},${f(bottom)} L${f(x + hw * 0.32)},${f(bottom - h * 0.035)} L${f(x - hw * 0.32)},${f(bottom - h * 0.035)} L${f(x - hw)},${f(bottom)} Z `;
  }
  d += `M${f(x - h * 0.028)},${f(base - h * 0.14)} h${f(h * 0.056)} V${f(base)} h${f(-h * 0.056)} Z`;
  return d;
};
const rand = (i: number, k: number) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const forestLayer = (n: number, x0: number, x1: number, hMin: number, hMax: number, layer: number, sideOnly = false): Tree[] =>
  Array.from({ length: n }, (_, i) => {
    let x = x0 + ((x1 - x0) * (i + 0.5)) / n + (rand(i, layer) - 0.5) * ((x1 - x0) / n) * 0.8;
    if (sideOnly) x = i < n / 2 ? x0 + ((CX - 260 - x0) * (i + 0.5)) / (n / 2) : CX + 260 + ((x1 - CX - 260) * (i - n / 2 + 0.5)) / (n / 2);
    const h = hMin + rand(i, layer + 7) * (hMax - hMin);
    return { x, h, d: pinePath(x, FOREST_BASE + layer * 6, h), delay: S(layer * 260 + (Math.abs(x - CX) / 500) * 600) };
  });
const FOREST_LAYERS = [
  forestLayer(11, CX - 430, CX + 430, 230, 330, 0),
  forestLayer(8, CX - 410, CX + 410, 320, 440, 1),
  forestLayer(4, CX - 460, CX + 460, 440, 560, 2, true),
];

const Forest: React.FC<{ run: number }> = ({ run }) => {
  const { pal, gid } = useContext(ForestCtx);
  const on = useAfter(T_FOREST, run);
  const flies = useAfter(T_FLIES, run);
  const ops = [0.6, 0.95, 1];
  // only behind the players: fade out well inside the box's width
  const fade = `linear-gradient(90deg, transparent ${CX - 470}px, #000 ${CX - 330}px, #000 ${CX + 330}px, transparent ${CX + 470}px)`;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 1920,
        height: FOREST_BASE + 20,
        zIndex: 1,
        pointerEvents: 'none',
        WebkitMaskImage: `${fade}, linear-gradient(180deg, #000 82%, transparent 100%)`,
        maskImage: `${fade}, linear-gradient(180deg, #000 82%, transparent 100%)`,
        WebkitMaskComposite: 'source-in',
        maskComposite: 'intersect',
      }}
    >
      <svg width={1920} height={FOREST_BASE + 20} viewBox={`0 0 1920 ${FOREST_BASE + 20}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden>
        <defs>
          {/* each row of trees: theme-tinted at the tips, near-black at the roots */}
          {[
            [pal.canopy[1], pal.pineBack],
            [pal.canopy[2], pal.pineFront],
            [pal.pineBack, pal.black[1]],
          ].map(([top, bottom], li) => (
            <linearGradient key={li} id={`${gid}-tree${li}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={top} />
              <stop offset="1" stopColor={bottom} />
            </linearGradient>
          ))}
          <linearGradient id={`${gid}-mist`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={0} />
            <stop offset="0.6" stopColor="#fff" stopOpacity={0.12} />
            <stop offset="1" stopColor="#fff" stopOpacity={0} />
          </linearGradient>
        </defs>
        {FOREST_LAYERS.map((layer, li) => (
          <g key={li} fill={`url(#${gid}-tree${li})`} opacity={ops[li]}>
            {layer.map((t, k) => (
              <path
                key={k}
                d={t.d}
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: '50% 100%',
                  transform: on ? 'scale(1,1)' : 'scale(1,0)',
                  transition: `transform ${S(800)}ms cubic-bezier(.2,1.25,.4,1) ${t.delay}ms`,
                }}
              />
            ))}
            {/* a band of mist in front of each row */}
            <rect
              x={0}
              y={FOREST_BASE - 260 + li * 70}
              width={1920}
              height={200}
              fill={`url(#${gid}-mist)`}
              style={{ opacity: on ? 1 : 0, transition: `opacity ${S(1200)}ms ease ${S(600 + li * 250)}ms` }}
            />
          </g>
        ))}

      </svg>
      {/* fireflies */}
      {FIREFLIES.map((f, i) => (
        <Firefly key={i} f={f} on={flies} />
      ))}
    </div>
  );
};

/* fireflies drifting in the forest */
const FIREFLIES = Array.from({ length: 12 }, (_, i) => ({
  x: CX - 360 + rand(i, 21) * 720,
  y: FOREST_BASE - 480 + rand(i, 22) * 360,
  dx: (rand(i, 23) - 0.5) * 120,
  dy: (rand(i, 24) - 0.5) * 80,
  dur: 4200 + rand(i, 25) * 3600,
  delay: Math.round(rand(i, 26) * 3000),
  size: 5 + rand(i, 27) * 5,
}));
const Firefly: React.FC<{ f: (typeof FIREFLIES)[number]; on: boolean }> = ({ f, on }) => {
  const { pal } = useContext(ForestCtx);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el?.animate) return;
    const a = el.animate(
      [
        { transform: 'translate(0px,0px)', opacity: 0 },
        { transform: `translate(${f.dx * 0.5}px,${f.dy}px)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${f.dx}px,${f.dy * 0.3}px)`, opacity: 0.3, offset: 0.6 },
        { transform: `translate(${f.dx * 0.4}px,${-f.dy * 0.5}px)`, opacity: 1, offset: 0.8 },
        { transform: 'translate(0px,0px)', opacity: 0 },
      ],
      { duration: f.dur, delay: f.delay, iterations: Infinity, easing: 'ease-in-out', fill: 'both' }
    );
    return () => a.cancel();
  }, [on, f]);
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: f.x,
        top: f.y,
        width: f.size,
        height: f.size,
        borderRadius: '50%',
        opacity: 0,
        background: '#fff',
        boxShadow: `0 0 ${f.size * 1.6}px ${f.size * 0.6}px ${pal.label}`,
      }}
    />
  );
};

/* -------------------- Heavy leaf fall over the MVP -------------------- */
const FALL = Array.from({ length: 38 }, (_, i) => ({
  x: CX - 480 + rand(i, 3) * 960,
  s: 0.55 + rand(i, 4) * 0.6,
  dur: 5200 + rand(i, 5) * 4200,
  delay: Math.round(rand(i, 6) * 6000),
  sway: (rand(i, 8) - 0.5) * 180,
  spin: (rand(i, 9) > 0.5 ? 1 : -1) * (300 + rand(i, 10) * 420),
  t: (['P', 'S', 'M'] as Tone[])[i % 3],
}));
const FALL_H = BOX.y + 10;
const FallLeaf: React.FC<{ d: (typeof FALL)[number]; on: boolean }> = ({ d, on }) => {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el?.animate) return;
    const a = el.animate(
      [
        { transform: 'translate(0px, -60px) rotate(0deg)', opacity: 0 },
        { transform: `translate(${d.sway * 0.6}px, ${FALL_H * 0.2}px) rotate(${d.spin * 0.25}deg)`, opacity: 0.95, offset: 0.12 },
        { transform: `translate(${-d.sway * 0.4}px, ${FALL_H * 0.55}px) rotate(${d.spin * 0.6}deg)`, opacity: 0.95, offset: 0.55 },
        { transform: `translate(${d.sway}px, ${FALL_H * 0.92}px) rotate(${d.spin * 0.9}deg)`, opacity: 0.85, offset: 0.9 },
        { transform: `translate(${d.sway * 0.8}px, ${FALL_H + 20}px) rotate(${d.spin}deg)`, opacity: 0 },
      ],
      { duration: d.dur, delay: d.delay, iterations: Infinity, easing: 'linear', fill: 'both' }
    );
    return () => a.cancel();
  }, [on, d]);
  return (
    <svg ref={ref} width={44 * d.s} height={30 * d.s} viewBox="-2 -15 44 30" style={{ position: 'absolute', left: d.x, top: 0, opacity: 0, overflow: 'visible', filter: 'drop-shadow(0 3px 3px rgba(0,0,0,.45))' }} aria-hidden>
      <LeafShape tone={d.t} />
    </svg>
  );
};

/* a burst of leaves flying out from behind the team when the last player lands */
const BURST = Array.from({ length: 18 }, (_, i) => {
  const a = -170 + (i * 160) / 17 + ((i * 37) % 9) - 4; // a fan over the top
  const d = 300 + ((i * 53) % 220);
  return { a, d, s: 0.7 + ((i * 7) % 5) * 0.1, spin: (i % 2 ? 1 : -1) * (200 + ((i * 41) % 260)), t: (['P', 'S', 'M'] as Tone[])[i % 3] };
});
const BurstLeaf: React.FC<{ b: (typeof BURST)[number]; on: boolean; delay: number }> = ({ b, on, delay }) => {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el?.animate) return;
    const rad = (b.a * Math.PI) / 180;
    const dx = Math.cos(rad) * b.d;
    const dy = Math.sin(rad) * b.d;
    const a = el.animate(
      [
        { transform: 'translate(0px,0px) rotate(0deg) scale(.3)', opacity: 0 },
        { transform: `translate(${dx * 0.55}px,${dy * 0.55}px) rotate(${b.spin * 0.4}deg) scale(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${dx}px,${dy + 140}px) rotate(${b.spin}deg) scale(.9)`, opacity: 0 },
      ],
      { duration: S(1600), delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' }
    );
    return () => a.cancel();
  }, [on, b, delay]);
  return (
    <svg ref={ref} width={44 * b.s} height={30 * b.s} viewBox="-2 -15 44 30" style={{ position: 'absolute', left: CX - 20, top: BOX.y - 120, opacity: 0, overflow: 'visible' }} aria-hidden>
      <LeafShape tone={b.t} />
    </svg>
  );
};

/* -------------------- The MVP (big, behind the identity box) -------------------- */
const MvpPhoto: React.FC<{ p: { playerName: string; picUrl?: string }; left: number; h: number; z: number; at: number; run: number }> = ({ p, left, h, z, at, run }) => {
  const { pal } = useContext(ForestCtx);
  const on = useAfter(at, run);
  const lit = useAfter(at + PLAYER_LIGHT, run);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: PLAYERS_BOTTOM - h,
        width: PHOTO_W,
        height: h,
        zIndex: z,
        transform: on ? 'none' : 'translateY(160px) scale(.94)',
        transformOrigin: '50% 100%',
        opacity: on ? 1 : 0,
        transition: `transform ${S(900)}ms cubic-bezier(.16,1,.3,1), opacity ${S(300)}ms linear, filter ${S(700)}ms ease`,
        filter: lit ? 'drop-shadow(0 18px 28px rgba(0,0,0,.55))' : `drop-shadow(0 0 26px ${pal.sceneGlow})`,
      }}
    >
      <img
        src={playerPhoto(p.picUrl) || DEF_PLAYER}
        alt={p.playerName}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'contain',
          objectPosition: 'bottom center',
          filter: lit ? 'brightness(1) saturate(1)' : 'brightness(0) saturate(0)',
          transition: `filter ${S(650)}ms ease`,
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).src = DEF_PLAYER;
        }}
      />
    </div>
  );
};

/* -------------------- Intro: flash, leaf swirl, big title -------------------- */
const IntroFlash: React.FC<{ run: number }> = ({ run }) => {
  const { pal } = useContext(ForestCtx);
  const ref = useRef<HTMLDivElement>(null);
  const on = useAfter(T_FLASH, run);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el?.animate) return;
    const a = el.animate(
      [
        { transform: 'scale(.05)', opacity: 0 },
        { transform: 'scale(.6)', opacity: 1, offset: 0.25 },
        { transform: 'scale(2.6)', opacity: 0 },
      ],
      { duration: S(1300), easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' }
    );
    return () => a.cancel();
  }, [on]);
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: CX - 500,
        top: FOREST_BASE - 760,
        width: 1000,
        height: 1000,
        borderRadius: '50%',
        opacity: 0,
        zIndex: 2,
        pointerEvents: 'none',
        background: `radial-gradient(circle, #FFFFFF 0%, ${pal.sceneGlow} 18%, rgba(0,0,0,0) 62%)`,
      }}
    />
  );
};

/** leaves spiralling out from the centre as the scene opens */
const SWIRL = Array.from({ length: 28 }, (_, i) => {
  const a0 = (i / 28) * 360;
  return { a0, r: 520 + rand(i, 31) * 520, s: 0.7 + rand(i, 32) * 0.7, spin: 540 + rand(i, 33) * 360, t: (['P', 'S', 'M'] as Tone[])[i % 3], delay: Math.round(rand(i, 34) * S(250)) };
});
const SwirlLeaf: React.FC<{ w: (typeof SWIRL)[number]; on: boolean }> = ({ w, on }) => {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el?.animate) return;
    const pt = (deg: number, r: number) => {
      const rad = (deg * Math.PI) / 180;
      return `${(Math.cos(rad) * r).toFixed(1)}px, ${(Math.sin(rad) * r * 0.7).toFixed(1)}px`;
    };
    const a = el.animate(
      [
        { transform: `translate(${pt(w.a0, 10)}) rotate(0deg) scale(.2)`, opacity: 0 },
        { transform: `translate(${pt(w.a0 + 70, w.r * 0.3)}) rotate(${w.spin * 0.3}deg) scale(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${pt(w.a0 + 140, w.r * 0.7)}) rotate(${w.spin * 0.7}deg) scale(1)`, opacity: 0.9, offset: 0.7 },
        { transform: `translate(${pt(w.a0 + 180, w.r)}) rotate(${w.spin}deg) scale(.8)`, opacity: 0 },
      ],
      { duration: S(1700), delay: w.delay, easing: 'cubic-bezier(.25,.6,.35,1)', fill: 'both' }
    );
    return () => a.cancel();
  }, [on, w]);
  return (
    <svg ref={ref} width={44 * w.s} height={30 * w.s} viewBox="-2 -15 44 30" style={{ position: 'absolute', left: CX - 20, top: FOREST_BASE - 300, opacity: 0, overflow: 'visible', filter: 'drop-shadow(0 3px 3px rgba(0,0,0,.4))' }} aria-hidden>
      <LeafShape tone={w.t} />
    </svg>
  );
};

/** big EVENT MVP slam: lands, holds, then lifts away as the players appear */
const BigTitle: React.FC<{ run: number }> = ({ run }) => {
  const { pal } = useContext(ForestCtx);
  const on = useAfter(T_TITLE_IN, run);
  const out = useAfter(T_TITLE_OUT, run);
  const state = !on ? 'pre' : out ? 'out' : 'in';
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 250,
        zIndex: 9,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pointerEvents: 'none',
        fontFamily: FONT,
        fontWeight: 700,
        lineHeight: 1,
        opacity: state === 'in' ? 1 : 0,
        transform: state === 'pre' ? 'scale(1.9)' : state === 'out' ? 'translateY(-90px) scale(.8)' : 'scale(1)',
        filter: state === 'pre' ? 'blur(14px)' : state === 'out' ? 'blur(8px)' : 'blur(0px)',
        transition:
          state === 'out'
            ? `opacity ${S(500)}ms ease, transform ${S(600)}ms cubic-bezier(.5,0,.75,0), filter ${S(500)}ms ease`
            : `opacity ${S(250)}ms linear, transform ${S(650)}ms cubic-bezier(.2,1.3,.4,1), filter ${S(450)}ms ease`,
      }}
    >
      <div style={{ filter: `drop-shadow(0 0 24px ${pal.sceneGlow}) drop-shadow(0 4px 6px rgba(0,0,0,.6))`, transform: state === 'in' ? 'none' : 'translateY(-30px)', transition: `transform ${S(700)}ms cubic-bezier(.2,1.4,.4,1) ${S(150)}ms` }}>
        <Star color={pal.label} size={110} />
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 150,
          letterSpacing: state === 'in' ? '0.1em' : '0.5em',
          paddingLeft: state === 'in' ? '0.1em' : '0.5em',
          transition: `letter-spacing ${S(900)}ms cubic-bezier(.2,.8,.2,1), padding ${S(900)}ms cubic-bezier(.2,.8,.2,1)`,
          background: `linear-gradient(180deg, #FFFFFF 35%, ${pal.label})`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.7))',
          whiteSpace: 'nowrap',
        }}
      >
        EVENT MVP
      </div>
    </div>
  );
};

/* -------------------- Icons -------------------- */
const Star = ({ color, size = 30 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ display: 'block', flex: 'none' }}>
    <path d="M20 2 L25 14.5 L38.5 15.2 L28 23.8 L31.5 37 L20 29.6 L8.5 37 L12 23.8 L1.5 15.2 L15 14.5 Z" fill={color} />
  </svg>
);

/* -------------------- Identity box (left, three steps) -------------------- */
const IdentityBox: React.FC<{ mvp: MvpRow; context: string; run: number }> = ({ mvp, context, run }) => {
  const { pal } = useContext(ForestCtx);
  const s1 = useAfter(BOX_T.s1, run);
  const s2 = useAfter(BOX_T.s2, run);
  const s3 = useAfter(BOX_T.s3, run);
  const on = useAfter(BOX_T.settled, run);
  const name = (mvp.playerName || '').toUpperCase();
  const size = name.length <= 8 ? 104 : name.length <= 11 ? 86 : name.length <= 14 ? 70 : name.length <= 18 ? 58 : 46;
  const tag = (mvp.teamTag || '').toUpperCase();
  return (
    <div style={{ position: 'absolute', left: BOX.x, top: BOX.y, width: BOX.w, height: BOX.h, zIndex: 4, filter: 'drop-shadow(0 22px 40px rgba(0,0,0,.5))', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: chamfer(CUT) }}>
        <Reveal open={s1} dir="fromLeft" w={BOX.w} h={BOX.h} fringe="M">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 35% 60% at 50% 55%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 36,
            }}
          >
            <div style={pop(s1, 300)}>
              <LogoPlate p={mvp} w={250} h={150} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 60, letterSpacing: '0.14em', color: WHITE, textShadow: SHADOW, ...rise(s1, 450) }}>
              <Star color={pal.label} size={54} /> EVENT MVP
            </div>
          </div>
        </Reveal>
        <Reveal open={s2} dir="fromLeft" w={BOX.w} h={BOX.h} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(115deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})` }} />
        </Reveal>
        <Reveal open={s3} dir="fromLeft" w={BOX.w} h={BOX.h} fringe="P">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 40% 70% at 30% 0%, ${pal.sceneGlow.replace(/[\d.]+\)$/, '0.32)')} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})`,
              display: 'flex',
              alignItems: 'center',
              gap: 30,
              padding: '10px 44px 0',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ position: 'absolute', left: CUT, right: 0, top: 0, height: 6, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />
            <div style={pop(on, 0)}>
              <LogoPlate p={mvp} w={200} h={120} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 24, letterSpacing: '0.3em', color: pal.label, ...rise(on, 100, 8) }}>
                <Star color={pal.label} size={26} /> EVENT MVP
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: size,
                  lineHeight: 0.92,
                  color: WHITE,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textShadow: '0 4px 12px rgba(0,0,0,.6)',
                  clipPath: on ? 'inset(0 0 -10% 0)' : 'inset(0 100% -10% 0)',
                  transition: `clip-path ${S(750)}ms cubic-bezier(.65,0,.25,1) ${S(150)}ms`,
                }}
              >
                {name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, minWidth: 0, ...rise(on, 350, 8) }}>
                {tag && <span style={{ background: 'linear-gradient(180deg, #FFFFFF, #E6E6EC)', color: INK, fontSize: 20, letterSpacing: '0.12em', padding: '5px 10px 4px', flex: 'none' }}>{tag}</span>}
                <span style={{ fontSize: 18, letterSpacing: '0.18em', color: 'rgba(255,255,255,.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[(mvp.teamName || '').toUpperCase(), context].filter(Boolean).join('  ·  ')}
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
};

/* -------------------- Performance panel (right, three steps) -------------------- */
/* One diagram: a flower of six leaf-shaped petals. Each petal's length is the
   MVP's value against the best of the event's top 5 (outer circle = best);
   the dashed petal inside it is the top-5 average. */
const FL = { cx: 380, cy: 522, r: 290 }; // centre + outer circle (box-local)
const PETAL_W = 0.34; // petal half-width as a share of its length

/* panel silhouette: a stepped tab on top, recessed notches on both sides,
   chamfered corners, and a few punched holes */
const PANEL_SHAPE = `polygon(${CUT}px 0, calc(100% - 250px) 0, calc(100% - 226px) 24px, 100% 24px, 100% 38%, calc(100% - 14px) calc(38% + 14px), calc(100% - 14px) calc(62% - 14px), 100% 62%, 100% calc(100% - ${CUT}px), calc(100% - ${CUT}px) 100%, 0 100%, 0 76%, 14px calc(76% - 14px), 14px calc(32% + 14px), 0 32%)`;
const PANEL_HOLES: React.CSSProperties = (() => {
  const layers = [
    'radial-gradient(circle at 34px calc(100% - 30px), transparent 6px, #000 7px)',
    'radial-gradient(circle at 56px calc(100% - 30px), transparent 6px, #000 7px)',
    'radial-gradient(circle at 78px calc(100% - 30px), transparent 6px, #000 7px)',
    'radial-gradient(circle at calc(100% - 238px) 24px, transparent 9px, #000 10px)',
  ];
  return {
    WebkitMaskImage: layers.join(', '),
    maskImage: layers.join(', '),
    WebkitMaskComposite: layers.map(() => 'source-in').join(', '),
    maskComposite: 'intersect',
  } as React.CSSProperties;
})();

interface Petal {
  key: string;
  label: string;
  value: number;
  best: number;
  avg: number;
  decimals?: number;
}

const petalPath = (L: number) => {
  const W = Math.min(74, L * PETAL_W);
  const f = (n: number) => n.toFixed(1);
  return `M0,0 C${f(L * 0.22)},${f(-W)} ${f(L * 0.72)},${f(-W)} ${f(L)},0 C${f(L * 0.72)},${f(W)} ${f(L * 0.22)},${f(W)} 0,0 Z`;
};

const PetalShape: React.FC<{ p: Petal; i: number; angle: number; on: boolean; avgOn: boolean }> = ({ p, i, angle, on, avgOn }) => {
  const { gid } = useContext(ForestCtx);
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!on) return setGo(false);
    const t = window.setTimeout(() => setGo(true), S(i * 140));
    return () => clearTimeout(t);
  }, [on, i]);
  const grow = useCountUp(1000, go, S(900)) / 1000;
  const fr = p.best > 0 ? Math.max(0.14, Math.min(1, p.value / p.best)) : 0.14;
  const ar = p.best > 0 ? Math.max(0.1, Math.min(1, p.avg / p.best)) : 0.1;
  const ease = 1 - Math.pow(1 - grow, 3);
  const L = FL.r * fr * (ease + Math.sin(ease * Math.PI) * 0.08); // a little overshoot
  return (
    <g transform={`translate(${FL.cx},${FL.cy}) rotate(${angle})`}>
      <path d={petalPath(Math.max(0.1, L))} fill={`url(#${gid}-petal)`} stroke={YELLOW} strokeWidth={3} strokeLinejoin="round" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.45))' }} />
      <path d={`M6,0 L${Math.max(6, L - 10).toFixed(1)},0`} stroke="rgba(255,255,255,.55)" strokeWidth={1.6} strokeLinecap="round" />
      <g style={{ opacity: avgOn ? 1 : 0, transition: `opacity ${S(500)}ms linear ${S(i * 80)}ms` }}>
        <path d={petalPath(FL.r * ar)} fill="rgba(255,255,255,.22)" stroke="#FFFFFF" strokeWidth={2.6} strokeDasharray="9 6" strokeLinejoin="round" />
        <circle cx={FL.r * ar} cy={0} r={5} fill="#FFFFFF" />
      </g>
    </g>
  );
};

const PetalLabel: React.FC<{ p: Petal; i: number; angle: number; on: boolean; avgOn: boolean }> = ({ p, i, angle, on, avgOn }) => {
  const { pal } = useContext(ForestCtx);
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!on) return setGo(false);
    const t = window.setTimeout(() => setGo(true), S(i * 140 + 450));
    return () => clearTimeout(t);
  }, [on, i]);
  const scale = Math.pow(10, p.decimals || 0);
  const v = useCountUp(Math.round(p.value * scale), go, S(900)) / scale;
  const rad = (angle * Math.PI) / 180;
  const R = FL.r + (Math.abs(Math.cos(rad)) > 0.5 ? 56 : 62);
  const x = FL.cx + Math.cos(rad) * R;
  const y = FL.cy + Math.sin(rad) * R;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%,-50%) scale(${go ? 1 : 0.6})`,
        opacity: go ? 1 : 0,
        transition: `opacity ${S(250)}ms linear, transform ${S(500)}ms cubic-bezier(.34,1.56,.64,1)`,
        textAlign: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ fontSize: 46, lineHeight: 0.85, color: WHITE, fontVariantNumeric: 'tabular-nums', textShadow: SHADOW }}>{p.decimals ? v.toFixed(p.decimals) : Math.round(v).toLocaleString('en-US')}</div>
      <div style={{ marginTop: 6, fontSize: 14, letterSpacing: '0.22em', paddingLeft: '0.22em', color: pal.label }}>{p.label}</div>
      <div style={{ marginTop: 5, fontSize: 14, letterSpacing: '0.1em', color: 'rgba(255,255,255,.75)', opacity: avgOn ? 1 : 0, transition: `opacity ${S(400)}ms linear` }}>
        AVG {p.decimals || (p.avg < 10 && p.avg % 1) ? p.avg.toFixed(1) : Math.round(p.avg).toLocaleString('en-US')}
      </div>
    </div>
  );
};

const StatsPanel: React.FC<{ players: MvpRow[]; run: number }> = ({ players, run }) => {
  const { pal, gid } = useContext(ForestCtx);
  const s1 = useAfter(PANEL_T.s1, run);
  const s2 = useAfter(PANEL_T.s2, run);
  const s3 = useAfter(PANEL_T.s3, run);
  const head = useAfter(PANEL_T.settled, run);
  const grid = useAfter(T_HEX, run);
  const petalsOn = useAfter(T_HEX + S(400), run);
  const avgOn = useAfter(T_HEX + S(400) + 6 * S(140) + S(700), run);
  const mvp = players[0];
  const matches = num(mvp.matches);

  // six petals; per-match averages use each player's own matches played
  const petals: Petal[] = useMemo(() => {
    const per = (p: MvpRow, k: 'killNum' | 'numericDamage') => (num(p.matches) > 0 ? Number(p[k] || 0) / num(p.matches) : 0);
    const defs: Array<{ key: string; label: string; get: (p: MvpRow) => number; decimals?: number }> = [
      { key: 'kills', label: 'KILLS', get: (p) => num(p.killNum) },
      { key: 'knock', label: 'KNOCKS', get: (p) => num(p.knockouts) },
      { key: 'dmg', label: 'DAMAGE', get: (p) => num(p.numericDamage) },
      { key: 'adm', label: 'AVG DMG', get: (p) => per(p, 'numericDamage') },
      { key: 'ast', label: 'ASSISTS', get: (p) => num(p.assists) },
      { key: 'akl', label: 'AVG KILLS', get: (p) => per(p, 'killNum'), decimals: 1 },
    ];
    return defs.map((d) => {
      const vals = players.map(d.get);
      return { key: d.key, label: d.label, value: d.get(mvp), best: Math.max(0, ...vals), avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0, decimals: d.decimals };
    });
  }, [players, mvp]);
  const angleOf = (i: number) => -90 + i * 60;
  const circ = 2 * Math.PI * FL.r;

  return (
    <div style={{ position: 'absolute', left: RP.x, top: RP.y, width: RP.w, height: RP.h, zIndex: 4, filter: 'drop-shadow(0 22px 40px rgba(0,0,0,.5))', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: PANEL_SHAPE, ...PANEL_HOLES }}>
        {/* 1 — grove: a big tree-ring medallion with the star */}
        <Reveal open={s1} dir="fromRight" w={RP.w} h={RP.h} fringe="M">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 50% 32% at 50% 48%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 30,
            }}
          >
            <div
              style={{
                width: 250,
                height: 250,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `repeating-radial-gradient(circle, rgba(0,0,0,.14) 0px, rgba(0,0,0,.14) 1.5px, transparent 1.5px, transparent 12px), radial-gradient(circle, ${pal.canopy[0]} 0%, ${pal.canopy[1]} 60%, ${pal.canopy[2]} 100%)`,
                boxShadow: `0 0 0 6px ${pal.label}, 0 0 0 10px rgba(0,0,0,.45), 0 12px 24px rgba(0,0,0,.5)`,
                ...pop(s1, 300),
              }}
            >
              <Star color={WHITE} size={120} />
            </div>
            <div style={{ fontSize: 40, letterSpacing: '0.3em', paddingLeft: '0.3em', color: WHITE, textShadow: SHADOW, ...rise(s1, 450) }}>PERFORMANCE</div>
          </div>
        </Reveal>
        {/* 2 — canopy */}
        <Reveal open={s2} dir="fromRight" w={RP.w} h={RP.h} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(200deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})` }} />
        </Reveal>
        {/* 3 — the flower */}
        <Reveal open={s3} dir="fromRight" w={RP.w} h={RP.h} fringe="P">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(circle, rgba(255,255,255,.07) 1.2px, transparent 1.6px) 0 0 / 18px 18px, ${GRAIN}, radial-gradient(circle at ${FL.cx}px ${FL.cy}px, ${pal.sceneGlow.replace(/[\d.]+\)$/, '0.25)')} 0%, rgba(0,0,0,0) 42%), linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})`,
            }}
          >
            {/* diagonal theme bands, bottom-left and top-right */}
            <div style={{ position: 'absolute', left: -60, bottom: 70, width: 420, height: 46, transform: 'rotate(-32deg)', transformOrigin: '0 100%', background: `linear-gradient(90deg, ${pal.primary}, rgba(0,0,0,0))`, opacity: 0.35 }} />
            <div style={{ position: 'absolute', left: -60, bottom: 30, width: 300, height: 10, transform: 'rotate(-32deg)', transformOrigin: '0 100%', background: YELLOW, opacity: 0.35 }} />
            <div style={{ position: 'absolute', right: -80, top: 150, width: 380, height: 38, transform: 'rotate(-32deg)', transformOrigin: '100% 0', background: `linear-gradient(270deg, ${pal.primary}, rgba(0,0,0,0))`, opacity: 0.3 }} />
            <div
              style={{
                position: 'absolute',
                right: 36,
                bottom: 70,
                width: 120,
                height: 12,
                background: `repeating-linear-gradient(-55deg, ${pal.label} 0 4px, transparent 4px 10px)`,
                opacity: 0.6,
              }}
            />
            {/* corner brackets */}
            {[
              { left: 30, top: 118, b: '3px 0 0 3px' },
              { right: 30, top: 118, b: '3px 3px 0 0' },
              { left: 30, bottom: 104, b: '0 0 3px 3px' },
              { right: 30, bottom: 104, b: '0 3px 3px 0' },
            ].map((c, k) => {
              const [bt, br, bb, bl] = c.b.split(' ');
              return (
                <span
                  key={k}
                  style={{
                    position: 'absolute',
                    left: c.left,
                    right: c.right,
                    top: c.top,
                    bottom: c.bottom,
                    width: 34,
                    height: 34,
                    borderStyle: 'solid',
                    borderColor: pal.label,
                    borderTopWidth: bt,
                    borderRightWidth: br,
                    borderBottomWidth: bb,
                    borderLeftWidth: bl,
                    opacity: 0.8,
                  }}
                />
              );
            })}
            {/* header — minimal */}
            <div style={{ position: 'absolute', left: 36, right: 36, top: 40, display: 'flex', alignItems: 'baseline', gap: 16, ...rise(head, 0, 8) }}>
              <span style={{ fontSize: 30, letterSpacing: '0.22em', color: WHITE }}>PERFORMANCE</span>
              {matches > 0 && <span style={{ marginLeft: 'auto', fontSize: 17, letterSpacing: '0.2em', color: 'rgba(255,255,255,.6)' }}>{matches} MATCHES</span>}
            </div>
            <div style={{ position: 'absolute', left: 0, right: CUT, top: 92, height: 5, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})`, ...rise(head, 100, 0) }} />

            <svg width={RP.w} height={RP.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden>
              <defs>
                <linearGradient id={`${gid}-petal`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor={pal.canopy[2]} />
                  <stop offset="0.45" stopColor={pal.primary} />
                  <stop offset="1" stopColor={YELLOW} />
                </linearGradient>
              </defs>
              {/* outer circle = best of the event's top 5, plus faint tree rings */}
              {[1, 0.66, 0.33].map((k, j) => (
                <circle
                  key={j}
                  cx={FL.cx}
                  cy={FL.cy}
                  r={FL.r * k}
                  fill="none"
                  stroke={j === 0 ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.08)'}
                  strokeWidth={j === 0 ? 2 : 1.5}
                  strokeDasharray={j === 0 ? `${circ}` : undefined}
                  strokeDashoffset={j === 0 ? (grid ? 0 : circ) : undefined}
                  style={j === 0 ? { transition: `stroke-dashoffset ${S(900)}ms cubic-bezier(.65,0,.25,1)` } : { opacity: grid ? 1 : 0, transition: `opacity ${S(600)}ms linear ${S(300)}ms` }}
                />
              ))}
              {/* spokes */}
              {petals.map((_, i) => {
                const rad = (angleOf(i) * Math.PI) / 180;
                return (
                  <line
                    key={i}
                    x1={FL.cx}
                    y1={FL.cy}
                    x2={FL.cx + Math.cos(rad) * FL.r}
                    y2={FL.cy + Math.sin(rad) * FL.r}
                    stroke="rgba(255,255,255,.1)"
                    strokeWidth={1.5}
                    style={{ opacity: grid ? 1 : 0, transition: `opacity ${S(400)}ms linear ${S(200 + i * 40)}ms` }}
                  />
                );
              })}
              {petals.map((p, i) => (
                <PetalShape key={p.key} p={p} i={i} angle={angleOf(i)} on={petalsOn} avgOn={avgOn} />
              ))}
              {/* the centre: a seed with the star */}
              <circle cx={FL.cx} cy={FL.cy} r={30} fill={pal.black[1]} stroke={YELLOW} strokeWidth={3} style={{ opacity: grid ? 1 : 0, transition: `opacity ${S(300)}ms linear` }} />
            </svg>
            <div style={{ position: 'absolute', left: FL.cx - 18, top: FL.cy - 18, ...pop(grid, 200) }}>
              <Star color={YELLOW} size={36} />
            </div>

            {petals.map((p, i) => (
              <PetalLabel key={p.key} p={p} i={i} angle={angleOf(i)} on={petalsOn} avgOn={avgOn} />
            ))}

            {/* key — minimal */}
            <div style={{ position: 'absolute', left: 110, right: 110, bottom: 22, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 34, fontSize: 15, letterSpacing: '0.2em', color: 'rgba(255,255,255,.7)', whiteSpace: 'nowrap', ...rise(avgOn, 0, 8) }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width={34} height={16} viewBox="0 -9 40 18" aria-hidden>
                  <path d={petalPath(40)} fill={`url(#${gid}-petal)`} stroke={YELLOW} strokeWidth={2} />
                </svg>
                MVP
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width={34} height={16} viewBox="0 -9 40 18" aria-hidden>
                  <path d={petalPath(40)} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth={2} strokeDasharray="5 4" />
                </svg>
                TOP 5 AVG
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(255,255,255,.35)', boxSizing: 'border-box' }} />
                TOP 5 BEST
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
};

/* -------------------- Vine wrapping the performance panel -------------------- */
const PV_SEG_MS = S(55);
const PANEL_VINE = (() => {
  const L = RP.x;
  const T = RP.y;
  const R = RP.x + RP.w;
  const B = RP.y + RP.h;
  // up the left edge, across the top, down the right edge
  const legs: { a: [number, number]; b: [number, number]; n: [number, number] }[] = [
    { a: [L, B - 70], b: [L, T], n: [-1, 0] },
    { a: [L, T], b: [R, T], n: [0, -1] },
    { a: [R, T], b: [R, T + RP.h * 0.62], n: [1, 0] },
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
    const off = out ? 17 : -15;
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
      front: i % 2 === 1, // the dip onto the panel goes in front, the swing outside goes behind
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

const PanelVine: React.FC<{ on: boolean; front: boolean }> = ({ on, front }) => {
  const { pal, gid } = useContext(ForestCtx);
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 5 : 3 }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        {PANEL_VINE.segs
          .filter((s) => s.front === front)
          .map((s) => (
            <GrowStem key={s.i} d={s.d} w={10} col={pal.vineA} on={on} delay={s.i * PV_SEG_MS} dur={PV_SEG_MS + 30} ease="linear" />
          ))}
        {!front &&
          PANEL_VINE.leaves.map((l, k) => (
            <g key={k} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r.toFixed(1)}) scale(${l.s.toFixed(2)})`}>
              <Unfurl on={on} delay={l.i * PV_SEG_MS + S(60)}>
                <LeafShape tone={l.tone} />
              </Unfurl>
            </g>
          ))}
      </g>
    </svg>
  );
};

/* -------------------- Scene -------------------- */
const Scene: React.FC<{ players: MvpRow[]; tournament: Tournament; round?: Round | null; run: number }> = ({ players, tournament, round, run }) => {
  const mvp = players[0];
  const burst = useAfter(T_BURST, run);
  const fall = useAfter(T_FALL, run);
  const swirl = useAfter(T_SWIRL, run);
  const vine = useAfter(PANEL_T.settled + S(150), run);
  const punch = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = punch.current;
    if (!burst || !el?.animate) return;
    const a = el.animate([{ transform: 'scale(1.025)' }, { transform: 'scale(.995)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: S(500), easing: 'ease-out' });
    return () => a.cancel();
  }, [burst]);
  const context = [tournament.tournamentName, round?.roundName].filter(Boolean).join('  ·  ').toUpperCase();

  return (
    <div ref={punch} style={{ position: 'absolute', inset: 0, transformOrigin: '50% 70%' }}>
      <Forest run={run} />
      <IntroFlash run={run} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 8, overflow: 'hidden' }}>
        {SWIRL.map((w, i) => (
          <SwirlLeaf key={i} w={w} on={swirl} />
        ))}
      </div>
      <BigTitle run={run} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
        {BURST.map((b, i) => (
          <BurstLeaf key={i} b={b} on={burst} delay={(i % 6) * 40} />
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
        <MvpPhoto p={mvp} left={CX - PHOTO_W / 2} h={PHOTO_H} z={10} at={T_PLAYERS} run={run} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: FALL_H, overflow: 'hidden', zIndex: 11 }}>
          {FALL.map((d, i) => (
            <FallLeaf key={i} d={d} on={fall} />
          ))}
        </div>
      </div>
      <IdentityBox mvp={mvp} context={context} run={run} />
      <PanelVine on={vine} front={false} />
      <StatsPanel players={players} run={run} />
      <PanelVine on={vine} front />
    </div>
  );
};

const EventMvp: React.FC<EventMvpProps> = ({ tournament, round, matchDatas = [] }) => {
  // MVP is selected by the shared Fragger Score, pooled from matchDatas
  // rather than overallData.teams — overallData's maxKillDistance is a
  // running SUM across matches on the backend, not a max, so it can't
  // supply "longest single kill of the event" correctly. Stats show
  // event-cumulative totals (plus per-match averages).
  const topPlayers = useMemo(() => {
    if (matchDatas.length === 0) return [];

    const scored = computeFraggerScores(buildFraggerPool(matchDatas)).sort(compareFraggerScore);

    return scored.slice(0, 5).map((player: any) => ({
      ...player,
      killNum: player.totalKills,
      numericDamage: player.totalDamage,
      assists: player.totalAssists,
      knockouts: player.totalKnockouts,
      matches: countMatches(player, matchDatas),
    }));
  }, [matchDatas]);

  const mvp = topPlayers[0];
  const hasData = matchDatas.length > 0 && !!mvp;

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fe' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);
  const useDemo = !hasData && demo;
  const players = (useDemo ? DEMO : hasData ? topPlayers : []) as MvpRow[];

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

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
        <ForestDefs />
        {players.length > 0 ? (
          <div key={`scene-${run}-${useDemo ? 'demo' : 'live'}`}>
            <Scene players={players} tournament={tournament} round={round} run={run} />
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, letterSpacing: '0.24em', color: 'rgba(255,255,255,.7)' }}>
            NO OVERALL DATA AVAILABLE
          </div>
        )}

        {/* preview — BELOW the 1920×1080 canvas */}
        <button type="button" onClick={preview} style={btn}>
          ▶ PREVIEW EVENT MVP
        </button>
      </div>
    </ForestCtx.Provider>
  );
};

export default EventMvp;