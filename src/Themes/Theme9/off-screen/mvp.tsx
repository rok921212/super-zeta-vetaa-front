// src/components/Mvp.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState, useId, createContext, useContext } from 'react';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
import {
  aggregateWeaponStats,
  formatDuration,
  PlayerWeaponDetailEntry,
} from '../../shared/hooks/Weapondetailstats ';
import { useLocalWeaponDetails } from '../../shared/hooks/useLocalWeaponDetails';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { isPlayerDead } from '../../shared/hooks/unsortteams';
import { playerPhoto } from '../../shared/playerPhoto.ts';

/* FOREST — MVP (redesign: player left, everything else in one box).
   Data pipeline unchanged: top fragger by the single-match Fragger Score,
   hit-location split from the weapon-detail feed (dominant room only),
   alive-MVP survival floor, demo numbers off an overlay route.

      ( tree-ring halo )  ┌──────────────────────────────────────────────┐
        with a vine       │  MVP 👑        │ PLAYER NAME     round · day │
         🧍 the MVP  ─────│  MOST VALUABLE │ [logo] TEAM                 │
        standing on the   │──────────────────────────────────────────────│
        left, in front    │ DAMAGE SPLIT     │ MVP VS CONTENDERS          │
        of the box        │   (donut)        │ ELIMS   ███████ ███ ██      │
                          │  head/body/limbs │ DAMAGE  ███████ █████ ███   │
                          │                  │ KNOCKS  … HEADSHOTS …      │
                          │──────────────────────────────────────────────│
                          │ [ELIMS] [DAMAGE] [KNOCKS] [HS] [SURV] [LONG]  │
                          └──────────────────────────────────────────────┘
   The comparison graph puts the MVP's numbers next to the match's next two
   best fraggers (same Fragger-Score ranking), each metric scaled to the
   highest of the three.

   Motion (state + CSS transitions only, so it always plays):
     0) the tree-ring halo grows out of a glowing point, its rings turning;
        a 3D vine draws itself round it, leaves unfurl
     1-3) the box opens from behind the player in three steps, each behind a
        fringe of leaves: grove (team logo) → canopy (theme gradient) → content
     the player rises in front of the box during step 2
     then: title + name wipe in, the donut draws segment by segment, the
     comparison bars grow metric by metric, stat chips pop and count up.
   PREVIEW: a "Preview MVP" button OUTSIDE the 1920×1080 canvas replays the
   sequence (dummy MVP + contenders when there is no data). */

/* -------------------- Interfaces -------------------- */
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
  uId?: string | number;
  playerName: string;
  killNum?: number;
  damage?: number;
  heal?: number;
  maxKillDistance?: number;
  headShotNum?: number;
  killNumByGrenade?: number;
  knockouts?: number;
  survivalTime?: number;
  liveState?: number;
  bHasDied?: boolean;
  teamLogo?: string;
  teamFlag?: string;
  teamTag?: string;
  teamName?: string;
  picUrl?: string;
}

interface Team {
  _id: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
  teamName: string;
  slot?: number;
  placePoints: number;
  players: Player[];
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchFragrsProps {
  tournament: Tournament;
  round?: Round | null;
  matchData?: MatchData | null;
  weaponDetails?: PlayerWeaponDetailEntry[];
}

/* -------------------- Type -------------------- */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const DIM = '#6E6E78';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";
const SHADOW = '0 0 1px rgba(0,0,0,.9), 0 2px 4px rgba(0,0,0,.6)';

/* -------------------- Geometry -------------------- */
const BOX = { x: 500, y: 110, w: 1360, h: 860 };
const PHOTO = { cx: 400, w: 780, h: 920, bottom: 1010 }; // the player, left, in front of the box
const HALO = { cx: 400, cy: 470, r: 330 }; // tree-ring halo behind the player
const CX = 340; // box-local x where the box's content starts (clear of the player)
const CHAMFER = 34;

/** White logo plate — traced from Layer_2.png (same as the other overlays). */
const PLATE_CUT =
  'polygon(4% 0%, 82.9% 0%, 99.7% 77.7%, 82.6% 53.1%, 92.8% 100%, 10.2% 96%, 0.3% 46.9%, 18.2% 74.1%)';

const masked = (layers: string[]): React.CSSProperties => ({
  WebkitMaskImage: layers.join(', '),
  maskImage: layers.join(', '),
  WebkitMaskComposite: layers.map(() => 'source-in').join(', '),
  maskComposite: 'intersect',
});

/* -------------------- Timeline (ms) -------------------- */
const STEP_MS = 650;
const T_HALO = 80; // halo grows
const T_HALO_VINE = 750; // vine draws round it
const T_BOX = 420; // box step 1
const BOX_HOLD = 300;
const BOX_S2 = T_BOX + STEP_MS + BOX_HOLD;
const BOX_S3 = BOX_S2 + STEP_MS - 100;
const T_PLAYER = BOX_S2 - 150;
const T_TITLE = BOX_S3 + 200;
const T_DONUT = BOX_S3 + 550;
const T_BARS = BOX_S3 + 700;
const BAR_STAGGER = 150;
const T_CHIPS = BOX_S3 + 1250;
const CHIP_STAGGER = 110;

/* -------------------- Fallback demo numbers -------------------- */
// Only off an overlay route (home simulator / previews). A live overlay shows
// the real numbers, zeros included.
const DEMO_STATS = { elims: 10, damage: 1297, knockouts: 8, survSeconds: 27 * 60 + 47, headshots: 4, longestElim: 210 };
const DEMO_DISTRIBUTION = { headPct: 9, bodyPct: 45, limbsPct: 46 };
const DEMO_PLAYER = {
  _id: 'demo',
  playerName: 'VIPER',
  teamTag: 'DMY',
  teamName: 'DUMMY ESPORTS',
  teamLogo: '/def_logo.png',
  picUrl: '',
  killNum: DEMO_STATS.elims,
  numericDamage: DEMO_STATS.damage,
  knockouts: DEMO_STATS.knockouts,
  survivalTime: DEMO_STATS.survSeconds,
  headShotNum: DEMO_STATS.headshots,
  maxKillDistance: DEMO_STATS.longestElim * 100,
  bHasDied: true,
};
const DEMO_CONTENDERS = [
  { playerName: 'SHADOW', killNum: 7, numericDamage: 1104, knockouts: 6, headShotNum: 3 },
  { playerName: 'KRYPTO', killNum: 6, numericDamage: 948, knockouts: 7, headShotNum: 1 },
];

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
      transition: on ? `transform 450ms cubic-bezier(.3,1.6,.5,1) ${delay}ms` : 'none',
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

/* -------------------- Tree-ring halo + vine (left, behind the player) -------------------- */
type Pt = [number, number];
const HALO_VINE = (() => {
  const nodes: { p: Pt; ang: number; inner: boolean }[] = [];
  let inner = false;
  // round most of the circle: from the lower-left (225°), over the top, to the lower-right (-45°)
  for (let a = 225; a >= -45; a -= 13) {
    const rad = (a * Math.PI) / 180;
    const r = HALO.r + (inner ? -12 : 14);
    nodes.push({ p: [HALO.r + r * Math.cos(rad), HALO.r - r * Math.sin(rad)], ang: -a, inner });
    inner = !inner;
  }
  const f = (n: number) => n.toFixed(1);
  const pts = nodes.map((n) => n.p);
  let ord = -1;
  const layer = nodes.map((n) => {
    if (!n.inner) return false;
    ord += 1;
    return ord % 2 === 0;
  });
  const segs = nodes.slice(0, -1).map((_, i) => {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const k = nodes[i].inner ? i : nodes[i + 1].inner ? i + 1 : -1;
    return {
      d: `M${f(p1[0])},${f(p1[1])} C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`,
      front: k >= 0 ? layer[k] : true,
      i,
    };
  });
  const tones: Tone[] = ['M', 'P', 'S'];
  const leaves = nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => !n.inner)
    .map(({ n, i }) => ({ x: n.p[0], y: n.p[1], r: n.ang + ((i * 37) % 40) - 20, s: 0.62 + ((i * 13) % 16) / 100, tone: tones[i % 3], i }));
  return { segs, leaves, n: nodes.length - 1 };
})();
const VINE_SEG_MS = 60;

const HaloVine = ({ on, front }: { on: boolean; front: boolean }) => {
  const { pal, gid } = useContext(ForestCtx);
  const S = HALO.r * 2;
  const PAD = 60;
  return (
    <svg
      width={S + PAD * 2}
      height={S + PAD * 2}
      viewBox={`${-PAD} ${-PAD} ${S + PAD * 2} ${S + PAD * 2}`}
      style={{ position: 'absolute', left: -PAD, top: -PAD, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 3 : 0 }}
      aria-hidden
    >
      <g filter={`url(#${gid}-shadow)`}>
        {HALO_VINE.segs
          .filter((sg) => sg.front === front)
          .map((sg) => (
            <GrowStem key={sg.i} d={sg.d} w={9} col={pal.vineA} on={on} delay={sg.i * VINE_SEG_MS} dur={VINE_SEG_MS + 30} ease="linear" />
          ))}
        {front &&
          HALO_VINE.leaves.map((l, k) => (
            <g key={k} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r.toFixed(1)}) scale(${l.s.toFixed(2)})`}>
              <Unfurl on={on} delay={l.i * VINE_SEG_MS + 80}>
                <LeafShape tone={l.tone} />
              </Unfurl>
            </g>
          ))}
      </g>
    </svg>
  );
};

const Halo: React.FC<{ player: any; run: unknown }> = ({ player, run }) => {
  const { pal } = useContext(ForestCtx);
  const grow = useAfter(T_HALO, run);
  const vine = useAfter(T_HALO_VINE, run);
  const S = HALO.r * 2;
  return (
    <div style={{ position: 'absolute', left: HALO.cx - HALO.r, top: HALO.cy - HALO.r, width: S, height: S, zIndex: 2 }}>
      <HaloVine on={vine} front={false} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          overflow: 'hidden',
          zIndex: 1,
          transform: grow ? 'scale(1) rotate(0deg)' : 'scale(0.05) rotate(-120deg)',
          opacity: grow ? 1 : 0,
          transition: 'transform 1000ms cubic-bezier(.2,.9,.25,1.05), opacity 300ms linear',
          boxShadow: `0 0 0 8px ${pal.label}, 0 0 0 12px rgba(0,0,0,.45), 0 0 80px ${pal.sceneGlow}`,
          background: `radial-gradient(circle at 50% 40%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 55%),
                       repeating-radial-gradient(circle, rgba(255,255,255,.07) 0px, rgba(255,255,255,.07) 2px, transparent 2px, transparent 16px),
                       radial-gradient(circle, ${pal.canopy[1]} 0%, ${pal.canopy[2]} 70%, ${pal.black[1]} 100%)`,
        }}
      >
        {/* team logo blended into the rings */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 380, height: 380, transform: 'translate(-50%,-56%)', opacity: 0.16, mixBlendMode: 'luminosity', filter: 'grayscale(1) contrast(1.2)' }}>
          <TeamLogo logo={player.teamLogo} flag={player.teamFlag} alt="" fallback={'/def_logo.png'} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      </div>
      <HaloVine on={vine} front />
    </div>
  );
};

/* -------------------- The box (three steps, opening from behind the player) -------------------- */
const Box: React.FC<{ run: unknown; player: any; children: React.ReactNode }> = ({ run, player, children }) => {
  const { pal } = useContext(ForestCtx);
  const s1 = useAfter(T_BOX, run);
  const s2 = useAfter(BOX_S2, run);
  const s3 = useAfter(BOX_S3, run);
  const shape = `polygon(0 0, calc(100% - ${CHAMFER}px) 0, 100% ${CHAMFER}px, 100% 100%, ${CHAMFER}px 100%, 0 calc(100% - ${CHAMFER}px))`;
  const holes = [
    `radial-gradient(circle at 100% 50%, transparent 16px, #000 17px)`,
    `radial-gradient(circle at calc(100% - 30px) calc(100% - 24px), transparent 5px, #000 6px)`,
    `radial-gradient(circle at calc(100% - 48px) calc(100% - 24px), transparent 5px, #000 6px)`,
    `radial-gradient(circle at calc(100% - 66px) calc(100% - 24px), transparent 5px, #000 6px)`,
  ];
  return (
    <div style={{ position: 'absolute', left: BOX.x, top: BOX.y, width: BOX.w, height: BOX.h, zIndex: 1, filter: 'drop-shadow(0 22px 40px rgba(0,0,0,.5))', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: shape, ...masked(holes) }}>
        <Reveal open={s1} dir="fromLeft" w={BOX.w} h={BOX.h} fringe="M">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 30% 40% at 62% 50%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingLeft: CX,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ transform: s1 ? 'scale(1)' : 'scale(.6)', opacity: s1 ? 1 : 0, transition: `transform 550ms cubic-bezier(.34,1.56,.64,1) ${STEP_MS * 0.6}ms, opacity 250ms linear ${STEP_MS * 0.6}ms` }}>
              <LogoPlate p={player} w={320} h={192} />
            </div>
          </div>
        </Reveal>
        <Reveal open={s2} dir="fromLeft" w={BOX.w} h={BOX.h} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(115deg, ${pal.canopy[0]}, ${pal.canopy[1]} 40%, ${pal.canopy[2]})` }} />
        </Reveal>
        <Reveal open={s3} dir="fromLeft" w={BOX.w} h={BOX.h} fringe="P">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 50% 35% at 35% 0%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})`,
            }}
          >
            {/* theme-gradient edge along the top */}
            <div style={{ position: 'absolute', left: 0, right: CHAMFER, top: 0, height: 6, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />
            {children}
          </div>
        </Reveal>
      </div>
    </div>
  );
};

/* -------------------- Damage split: donut -------------------- */
interface DamageRow {
  label: string;
  pct: number | null; // null = no weapon detail for this player yet
  color: string;
}

const Donut: React.FC<{ rows: DamageRow[]; on: boolean }> = ({ rows, on }) => {
  const { pal } = useContext(ForestCtx);
  const R = 96;
  const SW = 36;
  const C = 2 * Math.PI * R;
  const total = rows.reduce((s, r) => s + (r.pct ?? 0), 0);
  const has = total > 0;
  const GAP = 0.012; // gap between segments, as a fraction of the circle
  let acc = 0;
  const segs = rows.map((r, i) => {
    const frac = has ? (r.pct ?? 0) / total : 0;
    const start = acc;
    acc += frac;
    return { r, i, start, frac: Math.max(0, frac - GAP) };
  });
  const top = rows.reduce((best, r) => ((r.pct ?? -1) > (best.pct ?? -1) ? r : best), rows[0]);
  const topV = useCountUp(top?.pct ?? 0, on, 900);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 34 }}>
      <div style={{ position: 'relative', width: 2 * (R + SW), height: 2 * (R + SW), flex: 'none' }}>
        <svg width={2 * (R + SW)} height={2 * (R + SW)} viewBox={`${-(R + SW)} ${-(R + SW)} ${2 * (R + SW)} ${2 * (R + SW)}`} style={{ display: 'block' }} aria-hidden>
          {/* track: faint tree rings */}
          <circle r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={SW} />
          {[R - SW / 2 - 14, R - SW / 2 - 28, R - SW / 2 - 42].map((rr, k) => (
            <circle key={k} r={rr} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={1.5} />
          ))}
          <g transform="rotate(-90)">
            {segs.map(({ r, i, start, frac }) => (
              <circle
                key={r.label}
                r={R}
                fill="none"
                stroke={r.color}
                strokeWidth={SW}
                strokeDasharray={`${on ? frac * C : 0} ${C}`}
                strokeDashoffset={-start * C}
                style={{ transition: `stroke-dasharray 700ms cubic-bezier(.3,.8,.3,1) ${i * 260}ms`, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))' }}
              />
            ))}
          </g>
        </svg>
        {/* centre: the dominant zone */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 50, color: WHITE, fontVariantNumeric: 'tabular-nums', textShadow: SHADOW }}>
            {has ? Math.round(topV) : '--'}
            {has && <span style={{ fontSize: 22 }}>%</span>}
          </span>
          <span style={{ marginTop: 4, fontSize: 15, letterSpacing: '0.24em', color: pal.label }}>{has ? top.label : 'NO DATA'}</span>
        </div>
      </div>
      {/* legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {rows.map((r, i) => (
          <LegendRow key={r.label} row={r} on={on} delay={i * 260} />
        ))}
      </div>
    </div>
  );
};

const LegendRow: React.FC<{ row: DamageRow; on: boolean; delay: number }> = ({ row, on, delay }) => {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!on) return setGo(false);
    const t = window.setTimeout(() => setGo(true), delay);
    return () => clearTimeout(t);
  }, [on, delay]);
  const v = useCountUp(row.pct ?? 0, go, 700);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: go ? 1 : 0.2, transition: 'opacity 300ms linear' }}>
      <span style={{ width: 16, height: 16, borderRadius: 4, background: row.color, flex: 'none', boxShadow: '0 2px 3px rgba(0,0,0,.4)' }} />
      <span style={{ width: 74, fontSize: 19, letterSpacing: '0.2em', color: 'rgba(255,255,255,.75)' }}>{row.label}</span>
      <span style={{ fontSize: 36, color: WHITE, fontVariantNumeric: 'tabular-nums', textShadow: SHADOW }}>
        {row.pct === null ? '--' : Math.round(v)}
        {row.pct !== null && <span style={{ fontSize: 17 }}>%</span>}
      </span>
    </div>
  );
};

/* -------------------- MVP vs contenders: grouped bar graph -------------------- */
interface Contender {
  name: string;
  values: number[]; // same order as METRICS
  mvp?: boolean;
}
const METRICS = ['ELIMS', 'DAMAGE', 'KNOCKS', 'HEADSHOTS'];

const BarGraph: React.FC<{ people: Contender[]; run: unknown }> = ({ people, run }) => {
  const { pal } = useContext(ForestCtx);
  const barColor = (k: number) => (k === 0 ? `linear-gradient(90deg, ${pal.primary}, ${pal.label})` : k === 1 ? 'rgba(255,255,255,.62)' : 'rgba(255,255,255,.32)');
  return (
    <div>
      {/* legend */}
      <div style={{ display: 'flex', gap: 22, marginBottom: 18 }}>
        {people.map((p, k) => (
          <span key={p.name + k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, letterSpacing: '0.12em', color: k === 0 ? WHITE : 'rgba(255,255,255,.7)', whiteSpace: 'nowrap' }}>
            <span style={{ width: 22, height: 10, borderRadius: 3, background: barColor(k) }} />
            {k === 0 && <span style={{ color: pal.label }}>MVP</span>}
            {p.name.toUpperCase()}
          </span>
        ))}
      </div>
      {METRICS.map((m, mi) => (
        <MetricRow key={m} label={m} index={mi} people={people} barColor={barColor} run={run} />
      ))}
    </div>
  );
};

const MetricRow: React.FC<{ label: string; index: number; people: Contender[]; barColor: (k: number) => string; run: unknown }> = ({ label, index, people, barColor, run }) => {
  const on = useAfter(T_BARS + index * BAR_STAGGER, run);
  const max = Math.max(1, ...people.map((p) => p.values[index] || 0));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 74, borderTop: index ? '1px solid rgba(255,255,255,.08)' : 'none' }}>
      <span style={{ width: 132, flex: 'none', fontSize: 17, letterSpacing: '0.14em', color: 'rgba(255,255,255,.75)', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {people.map((p, k) => (
          <Bar key={k} value={p.values[index] || 0} max={max} on={on} delay={k * 90} color={barColor(k)} strong={k === 0} />
        ))}
      </div>
    </div>
  );
};

const Bar: React.FC<{ value: number; max: number; on: boolean; delay: number; color: string; strong: boolean }> = ({ value, max, on, delay, color, strong }) => {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!on) return setGo(false);
    const t = window.setTimeout(() => setGo(true), delay);
    return () => clearTimeout(t);
  }, [on, delay]);
  const v = useCountUp(value, go, 800);
  const pct = (value / max) * 82; // leave room for the value label
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: strong ? 20 : 14 }}>
      <div
        style={{
          height: '100%',
          width: go ? `${Math.max(pct, 1.5)}%` : '0%',
          background: color,
          borderRadius: '0 6px 6px 0',
          boxShadow: strong ? '0 2px 6px rgba(0,0,0,.45)' : 'none',
          transition: 'width 800ms cubic-bezier(.2,.8,.2,1)',
        }}
      />
      <span style={{ fontSize: strong ? 22 : 16, color: strong ? WHITE : 'rgba(255,255,255,.65)', fontVariantNumeric: 'tabular-nums', opacity: go ? 1 : 0, transition: 'opacity 300ms linear 300ms' }}>
        {Math.round(v)}
      </span>
    </div>
  );
};

/* -------------------- Stat chips (bottom row) -------------------- */
interface StatCell {
  key: string;
  value: string | number;
  label: string;
}

const Chip: React.FC<{ cell: StatCell; at: number; run: unknown; hero?: boolean }> = ({ cell, at, run, hero }) => {
  const { pal } = useContext(ForestCtx);
  const on = useAfter(at, run);
  const isNum = typeof cell.value === 'number';
  const v = useCountUp(isNum ? (cell.value as number) : 0, on && isNum, 900);
  return (
    <div
      style={{
        position: 'relative',
        height: 112,
        background: hero ? `linear-gradient(150deg, ${pal.canopy[0]}, ${pal.canopy[1]} 55%, ${pal.canopy[2]})` : 'linear-gradient(180deg, #FFFFFF, #E9E9EE)',
        boxShadow: hero ? `inset 0 0 0 2px ${pal.label}` : 'none',
        clipPath: 'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        opacity: on ? 1 : 0,
        transform: on ? 'none' : 'translateY(18px) scale(.94)',
        transition: 'opacity 260ms linear, transform 520ms cubic-bezier(.34,1.4,.64,1)',
      }}
    >
      <div style={{ fontSize: (String(cell.value).length > 5 ? 0.72 : String(cell.value).length > 4 ? 0.86 : 1) * (hero ? 56 : 46), color: hero ? WHITE : INK, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textShadow: hero ? SHADOW : 'none' }}>
        {isNum ? Math.round(v) : cell.value}
      </div>
      <div style={{ fontSize: 14, letterSpacing: '0.16em', color: hero ? pal.label : DIM, whiteSpace: 'nowrap' }}>{cell.label}</div>
    </div>
  );
};

/* -------------------- Main Component -------------------- */
const Mvp: React.FC<MatchFragrsProps> = ({ tournament, round, matchData, weaponDetails }) => {
  const [run, setRun] = useState(0);
  const [preview, setPreview] = useState(false);

  const topPlayers = useMemo(() => {
    if (!matchData?.teams) return [];
    const scored = computeFraggerScores(buildFraggerPool([matchData] as any)).sort(compareFraggerScore);
    return scored.slice(0, 10).map((player: any) => ({
      ...(player.latestPlayerRaw as any),
      ...player,
      killNum: player.totalKills,
      numericDamage: player.totalDamage,
      maxKillDistance: player.longestKillDistance,
      headShotNum: player.totalHeadshots,
    }));
  }, [matchData]);

  const realTop: any = topPlayers[0];
  const usingDummy = !realTop && preview;
  const topPlayer: any = realTop ?? (preview ? DEMO_PLAYER : undefined);

  // The feed may only stamp survivalTime once a player dies, so an alive MVP
  // reads 0. Anyone still alive has survived at least as long as the
  // longest-surviving player in the match, so use that as the floor.
  const matchSurvivalSeconds = useMemo(() => {
    let max = 0;
    matchData?.teams?.forEach((t) =>
      t.players?.forEach((p) => {
        max = Math.max(max, Number(p.survivalTime) || 0);
      })
    );
    return max;
  }, [matchData]);

  // The prop wins (tests / callers that already have the feed); otherwise the
  // local relay. null = no relay here (simulator), so demo numbers are used.
  const localWeaponDetails = useLocalWeaponDetails(!weaponDetails);
  const details = weaponDetails ?? localWeaponDetails;
  const demo = details === null || usingDummy;

  // The weapon feed only lands when a player dies / the match ends, so it is
  // used for the hit-location split alone; every stat below is live matchData.
  // Entries outside the feed's dominant room are dropped so a previous match
  // can't bleed in.
  const weaponStats = useMemo(() => {
    if (!details?.length) return aggregateWeaponStats(details as any, null);
    const roomCounts = new Map<string, number>();
    details.forEach((e: any) => {
      const room = String(e.RoomID ?? '');
      roomCounts.set(room, (roomCounts.get(room) || 0) + 1);
    });
    let room = '';
    let best = -1;
    roomCounts.forEach((count, id) => {
      if (count > best) {
        best = count;
        room = id;
      }
    });
    const current = details.filter((e: any) => String(e.RoomID ?? '') === room);
    return aggregateWeaponStats(current, realTop?.uId ?? realTop?._id);
  }, [details, realTop]);

  const primary = tournament.primaryColor || '#E8192C';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fv' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  const distributionRows: DamageRow[] = useMemo(() => {
    const dist = weaponStats.distribution;
    const has = !usingDummy && dist.total > 0;
    const pick = (live: number, fallback: number) => (has ? live : demo ? fallback : null);
    return [
      { label: 'HEAD', pct: pick(dist.headPct, DEMO_DISTRIBUTION.headPct), color: pal.head },
      { label: 'BODY', pct: pick(dist.bodyPct, DEMO_DISTRIBUTION.bodyPct), color: pal.body },
      { label: 'LIMBS', pct: pick(dist.limbsPct, DEMO_DISTRIBUTION.limbsPct), color: pal.limbs },
    ];
  }, [weaponStats, demo, usingDummy, pal]);

  // the MVP's numbers (demo fallbacks only off an overlay route)
  const mvpNums = useMemo(() => {
    if (!topPlayer) return null;
    const or = (value: number | undefined | null, fallback: number): number => (demo ? value || fallback : value ?? 0);
    const alive = !isPlayerDead(topPlayer);
    const ownSurvival = Number(topPlayer.survivalTime) || 0;
    return {
      elims: or(topPlayer.killNum, DEMO_STATS.elims),
      damage: Math.round(or(topPlayer.numericDamage, DEMO_STATS.damage)),
      knockouts: or(topPlayer.knockouts, DEMO_STATS.knockouts),
      survSeconds: or(alive ? Math.max(ownSurvival, matchSurvivalSeconds) : ownSurvival, DEMO_STATS.survSeconds),
      headshots: or(topPlayer.headShotNum, DEMO_STATS.headshots),
      // maxKillDistance is in cm.
      longestElim: or(topPlayer.maxKillDistance, DEMO_STATS.longestElim * 100) / 100,
    };
  }, [topPlayer, demo, matchSurvivalSeconds]);

  const statCells: StatCell[] = useMemo(() => {
    if (!mvpNums) return [];
    return [
      { key: 'elims', value: mvpNums.elims, label: 'ELIMS' },
      { key: 'damage', value: mvpNums.damage, label: 'DAMAGE' },
      { key: 'knockouts', value: mvpNums.knockouts, label: 'KNOCKOUTS' },
      { key: 'headshots', value: mvpNums.headshots, label: 'HEADSHOTS' },
      { key: 'surv', value: formatDuration(mvpNums.survSeconds), label: 'SURV. TIME' },
      { key: 'longest', value: `${mvpNums.longestElim.toFixed(1)}m`, label: 'LONGEST ELIM' },
    ];
  }, [mvpNums]);

  // MVP vs the match's next two best fraggers (same ranking)
  const contenders: Contender[] = useMemo(() => {
    if (!mvpNums || !topPlayer) return [];
    const mvp: Contender = { name: topPlayer.playerName || 'MVP', values: [mvpNums.elims, mvpNums.damage, mvpNums.knockouts, mvpNums.headshots], mvp: true };
    const others = (usingDummy || (!realTop && preview) ? DEMO_CONTENDERS : topPlayers.slice(1, 3)).map((p: any) => ({
      name: p.playerName || '',
      values: [Number(p.killNum) || 0, Math.round(Number(p.numericDamage) || 0), Number(p.knockouts) || 0, Number(p.headShotNum) || 0],
    }));
    return [mvp, ...others];
  }, [mvpNums, topPlayer, topPlayers, usingDummy, realTop, preview]);

  const doPreview = useCallback(() => {
    setPreview(true);
    setRun((r) => r + 1);
  }, []);

  const playerUp = useAfter(T_PLAYER, run);
  const titleIn = useAfter(T_TITLE, run);
  const donutOn = useAfter(T_DONUT, run);

  const day = round?.day || tournament.day || '';
  const context = [round?.roundName, day ? (/^day/i.test(day) ? day : `DAY ${day}`) : ''].filter(Boolean).join('  ·  ').toUpperCase();
  const name = (topPlayer?.playerName || '').toUpperCase();
  const nameSize = name.length <= 8 ? 92 : name.length <= 12 ? 76 : name.length <= 16 ? 62 : 50;
  const teamLabel = (topPlayer?.teamName || topPlayer?.teamTag || '').toUpperCase();
  const section = (txt: string, right?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, letterSpacing: '0.2em', color: WHITE, marginBottom: 20 }}>
      <svg width={24} height={15} viewBox="0 -12 40 24" aria-hidden>
        <path d={LEAF_SHAPE} fill={pal.label} />
      </svg>
      {txt}
      {right && <span style={{ marginLeft: 'auto', fontSize: 14, letterSpacing: '0.2em', color: pal.label }}>{right}</span>}
    </div>
  );

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
        <ForestDefs />
        {topPlayer && mvpNums ? (
          <div key={`run-${run}`}>
            <Halo player={topPlayer} run={run} />

            <Box run={run} player={topPlayer}>
              {/* ── round · day, top-right corner ── */}
              {context && (
                <div
                  style={{
                    position: 'absolute',
                    right: 60,
                    top: 26,
                    background: WHITE,
                    color: INK,
                    padding: '7px 18px 6px 24px',
                    fontSize: 17,
                    letterSpacing: '0.18em',
                    clipPath: 'polygon(14px 0, 100% 0, 100% 100%, 0 100%)',
                    whiteSpace: 'nowrap',
                    opacity: titleIn ? 1 : 0,
                    transition: 'opacity 300ms linear 300ms',
                  }}
                >
                  {context}
                </div>
              )}

              {/* ── header: MVP · name · team ── */}
              <div style={{ position: 'absolute', left: CX, right: 50, top: 56, height: 180, display: 'flex', alignItems: 'center', gap: 34 }}>
                <div
                  style={{
                    flex: 'none',
                    opacity: titleIn ? 1 : 0,
                    transform: titleIn ? 'none' : 'translateY(24px)',
                    transition: 'opacity 300ms linear, transform 600ms cubic-bezier(.2,.8,.2,1)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span
                      style={{
                        fontSize: 140,
                        lineHeight: 0.8,
                        letterSpacing: '0.04em',
                        background: `linear-gradient(180deg, #FFFFFF 30%, ${pal.label})`,
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.6))',
                      }}
                    >
                      MVP
                    </span>
                    <Crown color={pal.label} size={42} />
                  </div>
                  <div style={{ marginTop: 14, fontSize: 17, letterSpacing: '0.3em', color: pal.label }}>MOST VALUABLE PLAYER</div>
                </div>
                <div style={{ width: 2, alignSelf: 'stretch', margin: '14px 0', background: `linear-gradient(180deg, transparent, ${pal.label}, transparent)` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: nameSize,
                      color: WHITE,
                      lineHeight: 0.9,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      textShadow: '0 4px 14px rgba(0,0,0,.6)',
                      clipPath: titleIn ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
                      transition: 'clip-path 750ms cubic-bezier(.65,0,.25,1) 150ms',
                    }}
                  >
                    {name}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      marginTop: 16,
                      opacity: titleIn ? 1 : 0,
                      transform: titleIn ? 'none' : 'translateY(12px)',
                      transition: 'opacity 300ms linear 450ms, transform 500ms cubic-bezier(.2,.8,.2,1) 450ms',
                    }}
                  >
                    <LogoPlate p={topPlayer} w={92} h={56} />
                    <div
                      style={{
                        background: 'linear-gradient(180deg, #FFFFFF, #E9E9EE)',
                        color: INK,
                        padding: '10px 26px 9px 16px',
                        fontSize: 24,
                        letterSpacing: '0.16em',
                        clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
                        whiteSpace: 'nowrap',
                        maxWidth: 380,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {teamLabel}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ position: 'absolute', left: CX, right: 50, top: 250, height: 1, background: 'rgba(255,255,255,.12)' }} />

              {/* ── damage split (donut) ── */}
              <div style={{ position: 'absolute', left: CX, top: 284, width: 440 }}>
                {section('DAMAGE SPLIT', 'HIT LOCATION')}
                <Donut rows={distributionRows} on={donutOn} />
              </div>

              {/* ── MVP vs contenders (bar graph) ── */}
              <div style={{ position: 'absolute', left: CX + 490, right: 50, top: 284 }}>
                {section('MVP VS CONTENDERS', 'THIS MATCH')}
                <BarGraph people={contenders} run={run} />
              </div>

              {/* ── stat chips ── */}
              <div
                style={{
                  position: 'absolute',
                  left: CX,
                  right: 50,
                  bottom: 46,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: 12,
                }}
              >
                {statCells.map((c, i) => (
                  <Chip key={c.key} cell={c} at={T_CHIPS + i * CHIP_STAGGER} run={run} hero={i < 2} />
                ))}
              </div>
            </Box>

            {/* ── the player, standing in front of the halo and the box ── */}
            <div
              style={{
                position: 'absolute',
                left: PHOTO.cx - PHOTO.w / 2,
                top: PHOTO.bottom - PHOTO.h,
                width: PHOTO.w,
                height: PHOTO.h,
                zIndex: 4,
                transform: `translateY(${playerUp ? 0 : 120}px)`,
                opacity: playerUp ? 1 : 0,
                transition: 'transform 1000ms cubic-bezier(.16,1,.3,1), opacity 400ms linear',
                filter: 'drop-shadow(0 24px 40px rgba(0,0,0,.55))',
              }}
            >
              <img
                src={playerPhoto(topPlayer.picUrl) || '/def_char.avif'}
                alt={topPlayer.playerName || 'Player'}
                style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', objectPosition: 'bottom center' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/def_char.avif';
                }}
              />
            </div>
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
              LOADING MVP…
            </div>
          )
        )}

        {/* ── preview control — outside the 1920×1080 canvas ── */}
        <button
          type="button"
          onClick={doPreview}
          style={{
            position: 'absolute',
            left: 1940,
            top: 580,
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
          ▶ PREVIEW MVP
        </button>
      </div>
    </ForestCtx.Provider>
  );
};

export default Mvp;