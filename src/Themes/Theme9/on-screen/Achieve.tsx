import React, { useCallback, useEffect, useMemo, useState, useId, createContext, useContext } from 'react';
import { buildFraggerPool, pickLeader } from '../../shared/hooks/fraggerScore';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// matchData / matchDatas as props. The per-category leaderboard is the
// shared buildFraggerPool + pickLeader — unchanged.
//
// FOREST — Players to Watch (new layout).
//
//   ┌────────────┐  ┌──────────────────┐ ┌──────────────────┐
//   │ TITLE      │  │ ╭──╮ GUNSLINGER  │ │ ╭──╮ DMG DEALER  │
//   │ PLAYERS    │  │ │🧍│ KILLS 14    │ │ │🧍│ DAMAGE 2684 │
//   │ TO         │  │ ╰──╯ [logo] NAME │ │ ╰──╯ [logo] NAME │
//   │ WATCH      │  ├──────────────────┤ ├──────────────────┤
//   │ categories │  │   GRENADIER      │ │   EAGLE EYE      │
//   └────────────┘  └──────────────────┘ └──────────────────┘
//   title panel: tall, theme gradient → black, stacked PLAYERS / TO / WATCH,
//     white round · day tab, the four categories listed with their icons.
//   player cards (2 × 2, landscape): black wood body; the player stands in
//     an ARCHED WINDOW (forest scene behind, secondary ring) with a vine
//     growing around the arch; white category tag, big value, white name
//     strip with the team logo on the notched plate.
//   cutouts on every panel: chamfered corners, a notch slot in the top edge,
//     punched holes, half-moon notches in the side.
//
// Motion — every panel (title first, then the cards one by one) runs three
// steps, each sweeping in from the LEFT behind a fringe of leaves:
//   1) the grove: dark plate (team logo / tournament emblem)
//   2) the canopy: theme gradient
//   3) the content — photo rises, value counts up
//   +) then the vines grow (around the arch / down the title's edge).
// All state + CSS transitions, so it always plays.
// PREVIEW: a "Preview" button OUTSIDE the 1920×1080 canvas replays the
// sequence (uses dummy players when there is no data).

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
  bHasDied: boolean;
  picUrl?: string;
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  maxKillDistance?: number;
  driveDistance?: number;
  marchDistance?: number;
  health?: number;
  healthMax?: number;
  liveState?: number;
  useSmokeGrenadeNum?: number;
  useFragGrenadeNum?: number;
  useBurnGrenadeNum?: number;
  useFlashGrenadeNum?: number;
}

interface Team {
  _id: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
  teamFlag?: string;
  teamName: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchFragrsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  matchDatas?: MatchData[] | null;
}

type StatKey = 'killNum' | 'damage' | 'grenadeKills' | 'killDistance' | 'travelDistance';
type Cat = 'kills' | 'damage' | 'grenade' | 'eagle';

interface AggregatedPlayer {
  _id: string;
  playerName: string;
  picUrl?: string;
  teamLogo: string;
  teamFlag?: string;
  teamName: string;
  killNum: number;
  damage: number;
  grenadeKills: number;
  killDistance: number;
  travelDistance: number;
}

interface Category {
  label: string;
  unit: string;
  cat: Cat;
  player?: AggregatedPlayer;
  valueKey: StatKey;
}

/* ── type ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const DIM = '#6E6E78';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const TITLE = { x: 70, y: 150, w: 470, h: 790 };
const CARD_W = 600;
const CARD_H = 378;
const GAP = 34;
const GRID_X = 1920 - 70 - (CARD_W * 2 + GAP);
const GRID_Y = 150;
const CHAMFER = 34;
const WIN = { x: 24, y: 24, w: 236, h: CARD_H - 48 }; // the arched player window
const WIN_R = WIN.w / 2;

/** White logo plate — traced from Layer_2.png (same as the other overlays). */
const PLATE_CUT =
  'polygon(4% 0%, 82.9% 0%, 99.7% 77.7%, 82.6% 53.1%, 92.8% 100%, 10.2% 96%, 0.3% 46.9%, 18.2% 74.1%)';

/* card outline: chamfered top-left + bottom-right, a notch slot in the top edge */
const CARD_SHAPE = `polygon(${CHAMFER}px 0, 360px 0, 372px 12px, 436px 12px, 448px 0, 100% 0, 100% calc(100% - ${CHAMFER}px), calc(100% - ${CHAMFER}px) 100%, 0 100%, 0 ${CHAMFER}px)`;
/* punched holes (top-right) + half-moon notch (left edge), as an intersected mask */
const CARD_HOLES = [
  `radial-gradient(circle at 0 50%, transparent 15px, #000 16px)`,
  `radial-gradient(circle at calc(100% - 26px) 22px, transparent 5px, #000 6px)`,
  `radial-gradient(circle at calc(100% - 44px) 22px, transparent 5px, #000 6px)`,
  `radial-gradient(circle at calc(100% - 62px) 22px, transparent 5px, #000 6px)`,
];
const TITLE_SHAPE = `polygon(0 0, calc(100% - ${CHAMFER}px) 0, 100% ${CHAMFER}px, 100% 100%, ${CHAMFER}px 100%, 0 calc(100% - ${CHAMFER}px))`;
const TITLE_HOLES = [
  `radial-gradient(circle at 100% 34%, transparent 15px, #000 16px)`,
  `radial-gradient(circle at 100% 66%, transparent 15px, #000 16px)`,
  `radial-gradient(circle at calc(100% - 62px) calc(100% - 26px), transparent 5px, #000 6px)`,
  `radial-gradient(circle at calc(100% - 80px) calc(100% - 26px), transparent 5px, #000 6px)`,
  `radial-gradient(circle at calc(100% - 98px) calc(100% - 26px), transparent 5px, #000 6px)`,
];
const masked = (layers: string[]): React.CSSProperties => ({
  WebkitMaskImage: layers.join(', '),
  maskImage: layers.join(', '),
  WebkitMaskComposite: layers.map(() => 'source-in').join(', '),
  maskComposite: 'intersect',
});

/* ── timeline (ms) ── */
const STEP_MS = 650; // each sweep
const HOLD_1 = 450; // the grove holds before the canopy
const T_CANOPY = STEP_MS + HOLD_1; // relative to a panel's start
const T_CONTENT = T_CANOPY + STEP_MS - 100;
const T_SETTLE = T_CONTENT + STEP_MS * 0.6;
const T_VINES = T_CONTENT + STEP_MS;
const T_TITLE = 150; // title panel starts
const T_CARDS = 700; // first card starts
const STAGGER = 330; // between cards

/* ── dummy data for the preview button ── */
const DEMO: AggregatedPlayer[] = [
  { _id: 'd1', playerName: 'VIPER', teamName: 'DUMMY ESPORTS', teamLogo: '/def_logo.png', killNum: 14, damage: 2210, grenadeKills: 2, killDistance: 212, travelDistance: 0 },
  { _id: 'd2', playerName: 'SHADOW', teamName: 'NOVA', teamLogo: '/def_logo.png', killNum: 11, damage: 2684, grenadeKills: 1, killDistance: 180, travelDistance: 0 },
  { _id: 'd3', playerName: 'KRYPTO', teamName: 'TSM', teamLogo: '/def_logo.png', killNum: 7, damage: 1401, grenadeKills: 4, killDistance: 96, travelDistance: 0 },
  { _id: 'd4', playerName: 'NEXUS', teamName: 'FAZE', teamLogo: '/def_logo.png', killNum: 6, damage: 1220, grenadeKills: 0, killDistance: 341, travelDistance: 0 },
];

/* ── colour ── */
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
function inkOn(hex: string): string {
  const L = toRgb(hex)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  return L > 0.45 ? INK : WHITE;
}

function forestPalette(primary: string, secondary: string) {
  const p = toRgb(primary);
  const s = toRgb(secondary);
  const dp = deepen(p);
  const vineBase = mix(mix(p, s, 0.5), MOSS, 0.5);
  const leaf = (c: RGB): [string, string, string] => [css(mix(c, WHITE_RGB, 0.42)), css(c), css(mix(c, BLACK, 0.55))];
  return {
    primary,
    secondary,
    black: [css(mix(dp, BLACK, 0.78)), css(mix(dp, BLACK, 0.93))],
    grove: [css(mix(dp, BLACK, 0.7)), css(mix(dp, BLACK, 0.92))],
    canopy: [css(mix(p, WHITE_RGB, 0.15)), primary, css(mix(p, BLACK, 0.55))],
    sceneGlow: rgba(mix(s, WHITE_RGB, 0.35), 0.85),
    cardGlow: rgba(mix(p, WHITE_RGB, 0.2), 0.45),
    sceneMid: css(mix(p, BLACK, 0.12)),
    sceneDeep: css(mix(dp, BLACK, 0.82)),
    pineBack: css(mix(dp, BLACK, 0.6)),
    pineFront: css(mix(dp, BLACK, 0.84)),
    frame: [css(mix(s, WHITE_RGB, 0.35)), secondary, css(mix(s, BLACK, 0.45))],
    label: lum(s) < 0.35 ? css(mix(s, WHITE_RGB, 0.45)) : secondary,
    disc: [css(mix(s, WHITE_RGB, 0.25)), secondary, css(mix(s, BLACK, 0.45))],
    discInk: inkOn(secondary),
    leafP: leaf(mix(p, MOSS, 0.15)),
    leafS: leaf(mix(s, MOSS, 0.15)),
    leafM: leaf(mix(mix(p, s, 0.5), MOSS, 0.4)),
    vineA: { dark: css(mix(vineBase, BLACK, 0.72)), mid: css(mix(vineBase, BLACK, 0.12)), light: css(mix(s, WHITE_RGB, 0.6)) },
  };
}
type ForestPalette = ReturnType<typeof forestPalette>;
type VineCol = ForestPalette['vineA'];
type Tone = 'P' | 'S' | 'M';
const ForestCtx = createContext<{ pal: ForestPalette; gid: string }>({ pal: forestPalette('#2E7D4A', '#C9A24A'), gid: 'fm' });

const GRAIN =
  'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 4px), ' +
  'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 11px)';

/* number counts up 0 → n once `active` turns true */
function useCountUp(target: number, active: boolean, durMs = 800) {
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
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durMs]);
  return v;
}

/* flip `on` to true after `ms` (two frames later, so the start state paints first) */
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

/* ─────────────────────────────────────────────
   Category icons (24×24, currentColor)
   ───────────────────────────────────────────── */
const ICONS: Record<Cat, React.ReactNode> = {
  kills: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 1.5 V7 M12 17 V22.5 M1.5 12 H7 M17 12 H22.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </g>
  ),
  damage: (
    <polygon
      fill="currentColor"
      points="12,1.5 14.2,8 20.8,4.6 17.2,10.6 23,12.8 16.8,14.6 19.6,21 13.6,17.4 12,23 10.2,17.4 4.4,21 7.2,14.6 1,12.8 6.8,10.6 3.2,4.6 9.8,8"
    />
  ),
  grenade: (
    <g fill="currentColor">
      <rect x="9" y="4.5" width="6" height="4" />
      <path d="M15 5 L19 3 L20 5 L15.5 7.5 Z" />
      <circle cx="7.5" cy="5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8 C7.2 8 5 11.5 5 15 C5 19 8.2 22 12 22 C15.8 22 19 19 19 15 C19 11.5 16.8 8 12 8 Z" />
    </g>
  ),
  eagle: (
    <g fill="currentColor">
      <path d="M2 9 L9 7 L12 3 L15 7 L22 9 L16 11 L18 17 L12 13.5 L6 17 L8 11 Z" />
      <circle cx="12" cy="9" r="1.4" fill={INK} />
    </g>
  ),
};
const CatIcon = ({ cat, size, color }: { cat: Cat; size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ color, display: 'block', flex: 'none' }} aria-hidden>
    {ICONS[cat]}
  </svg>
);

/* ─────────────────────────────────────────────
   Leaves / stems
   ───────────────────────────────────────────── */
const LEAF = 'M0,0 C6,-11 22,-15 40,0 C22,15 6,11 0,0 Z';
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
      <path d={LEAF} fill={`url(#${gid}-leaf${tone})`} />
      <path d={LEAF_TOP} fill="#fff" opacity={0.13} />
      {vein && <path d="M1,0 Q20,-1.5 39,0" stroke={c[0]} strokeWidth={1.3} fill="none" opacity={0.85} />}
      <path d={LEAF} fill="none" stroke={c[2]} strokeWidth={0.8} opacity={0.7} />
    </>
  );
};

/** Stem segment that draws itself in (3D: core, body, highlight). */
const GrowSeg = ({ d, w, col, on, delay, dur }: { d: string; w: number; col: VineCol; on: boolean; delay: number; dur: number }) => {
  const base = { d, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, pathLength: 1 };
  const st: React.CSSProperties = {
    strokeDasharray: 1,
    strokeDashoffset: on ? 0 : 1,
    transition: on ? `stroke-dashoffset ${dur}ms linear ${delay}ms` : 'none',
  };
  return (
    <g>
      <path {...base} stroke={col.dark} strokeWidth={w} style={st} />
      <path {...base} stroke={col.mid} strokeWidth={w * 0.6} transform="translate(-0.5,-0.9)" style={st} />
      <path {...base} stroke={col.light} strokeWidth={Math.max(1, w * 0.2)} strokeOpacity={0.65} transform="translate(-0.9,-1.6)" style={st} />
    </g>
  );
};

const Unfurl = ({ on, delay, children }: { on: boolean; delay: number; children: React.ReactNode }) => (
  <g
    style={{
      transformBox: 'fill-box',
      transformOrigin: '0% 50%',
      transform: on ? 'scale(1)' : 'scale(0)',
      transition: on ? `transform 420ms cubic-bezier(.3,1.6,.5,1) ${delay}ms` : 'none',
    }}
  >
    {children}
  </g>
);

/* ─────────────────────────────────────────────
   Sweep from the LEFT; a vertical leaf fringe rides the edge while it moves
   ───────────────────────────────────────────── */
const LeafFringeV = ({ h, tone }: { h: number; tone: Tone }) => {
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

const Sweep: React.FC<{ open: boolean; h: number; fringe: Tone; children: React.ReactNode }> = ({ open, h, fringe, children }) => {
  const ease = 'cubic-bezier(.65,0,.25,1)';
  const fringeRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) fringeRef.current?.animate?.([{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: STEP_MS, easing: 'linear' });
  }, [open]);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: open ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          transition: `clip-path ${STEP_MS}ms ${ease}`,
        }}
      >
        {children}
      </div>
      <div
        ref={fringeRef}
        style={{
          position: 'absolute',
          top: 0,
          left: open ? '100%' : '0%',
          transform: 'translateX(-50%)',
          transition: `left ${STEP_MS}ms ${ease}`,
          opacity: 0,
          zIndex: 8,
          pointerEvents: 'none',
        }}
      >
        <LeafFringeV h={h} tone={fringe} />
      </div>
    </>
  );
};

/* ─────────────────────────────────────────────
   Vines
   ───────────────────────────────────────────── */
type Pt = [number, number];
const SEG_MS = 70;
const smooth = (pts: Pt[], i: number) => {
  const f = (n: number) => n.toFixed(1);
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(pts.length - 1, i + 2)];
  return `M${f(p1[0])},${f(p1[1])} C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(
    p2[1] - (p3[1] - p1[1]) / 6
  )} ${f(p2[0])},${f(p2[1])}`;
};

/** Build a weaving strand from a list of { point, outward angle, inner? }. */
function weave(nodes: { p: Pt; ang: number; inner: boolean }[]) {
  let ord = -1;
  const layer = nodes.map((n) => {
    if (!n.inner) return false;
    ord += 1;
    return ord % 2 === 0;
  });
  const pts = nodes.map((n) => n.p);
  const segs = nodes.slice(0, -1).map((_, i) => {
    const k = nodes[i].inner ? i : nodes[i + 1].inner ? i + 1 : -1;
    return { d: smooth(pts, i), front: k >= 0 ? layer[k] : true, i };
  });
  const tones: Tone[] = ['M', 'P', 'S'];
  const leaves: { x: number; y: number; r: number; s: number; tone: Tone; i: number }[] = [];
  nodes.forEach((n, i) => {
    if (n.inner) return;
    const jitter = ((i * 37) % 40) - 20;
    leaves.push({ x: n.p[0], y: n.p[1], r: n.ang + jitter, s: 0.46 + ((i * 13) % 14) / 100, tone: tones[i % 3], i });
  });
  return { segs, leaves, n: nodes.length - 1 };
}

/* around the arched player window: up the left, over the arch, down the right */
const ARCH_VINE = (() => {
  const nodes: { p: Pt; ang: number; inner: boolean }[] = [];
  const cx = WIN.x + WIN_R;
  const cy = WIN.y + WIN_R;
  let inner = false;
  const push = (x: number, y: number, ang: number) => {
    nodes.push({ p: [x, y], ang, inner });
    inner = !inner;
  };
  for (let y = WIN.y + WIN.h - 16; y > cy; y -= 42) push(WIN.x + (inner ? 6 : -8), y, 180);
  for (let a = 180; a <= 360; a += 22.5) {
    const r = WIN_R + (inner ? -6 : 8);
    const rad = (a * Math.PI) / 180;
    push(cx + r * Math.cos(rad), cy + r * Math.sin(rad), a);
  }
  for (let y = cy + 30; y < WIN.y + WIN.h - 10; y += 42) push(WIN.x + WIN.w + (inner ? -6 : 8), y, 0);
  return weave(nodes);
})();

/* down the title panel's right edge */
const TITLE_VINE = (() => {
  const nodes: { p: Pt; ang: number; inner: boolean }[] = [];
  let inner = false;
  for (let y = CHAMFER + 10; y < TITLE.h - 20; y += 46) {
    nodes.push({ p: [TITLE.w + (inner ? -10 : 12), y], ang: 0, inner });
    inner = !inner;
  }
  return weave(nodes);
})();

type Strand = ReturnType<typeof weave>;
const StrandSvg = ({ strand, on, front, w, h }: { strand: Strand; on: boolean; front: boolean; w: number; h: number }) => {
  const { pal, gid } = useContext(ForestCtx);
  const PAD = 40;
  return (
    <svg
      width={w + PAD * 2}
      height={h + PAD * 2}
      viewBox={`${-PAD} ${-PAD} ${w + PAD * 2} ${h + PAD * 2}`}
      style={{ position: 'absolute', left: -PAD, top: -PAD, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 6 : 0 }}
      aria-hidden
    >
      <g filter={`url(#${gid}-shadow)`}>
        {strand.segs
          .filter((s) => s.front === front)
          .map((s) => (
            <GrowSeg key={s.i} d={s.d} w={6} col={pal.vineA} on={on} delay={s.i * SEG_MS} dur={SEG_MS + 30} />
          ))}
        {front &&
          strand.leaves.map((l, k) => (
            <g key={k} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r.toFixed(1)}) scale(${l.s.toFixed(2)})`}>
              <Unfurl on={on} delay={l.i * SEG_MS + 60}>
                <LeafShape tone={l.tone} />
              </Unfurl>
            </g>
          ))}
      </g>
    </svg>
  );
};

/* ─────────────────────────────────────────────
   Small pieces
   ───────────────────────────────────────────── */
const pines = (width: number, baseY: number, count: number, minH: number, maxH: number, seed: number) => {
  let d = '';
  const step = width / count;
  for (let i = 0; i <= count; i++) {
    const r = Math.abs(Math.sin((i + 1) * 12.9898 * seed) * 43758.5453) % 1;
    const h = minH + r * (maxH - minH);
    const w = h * 0.42;
    const x = i * step + (r - 0.5) * step * 0.6;
    d += `M${(x - w / 2).toFixed(1)},${baseY} L${x.toFixed(1)},${(baseY - h).toFixed(1)} L${(x + w / 2).toFixed(1)},${baseY} Z `;
  }
  return d;
};
const WIN_PINES_BACK = pines(WIN.w, WIN.h, 5, 110, 190, 2.3);
const WIN_PINES_FRONT = pines(WIN.w, WIN.h, 4, 60, 110, 4.1);

const LogoPlate = ({ p, w, h }: { p: AggregatedPlayer; w: number; h: number }) => (
  <div style={{ width: w, height: h, flex: 'none', filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.45))' }}>
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
      <TeamLogo logo={p.teamLogo} flag={p.teamFlag} fallback={'/def_logo.png'} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
    </div>
  </div>
);

const Disc = ({ cat, size }: { cat: Cat; size: number }) => {
  const { pal } = useContext(ForestCtx);
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        background: `repeating-radial-gradient(circle, rgba(0,0,0,.12) 0px, rgba(0,0,0,.12) 1px, transparent 1px, transparent 5px), radial-gradient(circle at 38% 32%, ${pal.disc[0]}, ${pal.disc[1]} 55%, ${pal.disc[2]})`,
        boxShadow: '0 0 0 2px rgba(255,255,255,.85), 0 3px 6px rgba(0,0,0,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CatIcon cat={cat} size={Math.round(size * 0.58)} color={pal.discInk} />
    </div>
  );
};

const SHADOW = '0 0 1px rgba(0,0,0,.9), 0 2px 4px rgba(0,0,0,.6)';

/* ─────────────────────────────────────────────
   Player card (landscape, arched window)
   ───────────────────────────────────────────── */
const PlayerCard: React.FC<{ item: Category; index: number; run: number; left: number; top: number }> = ({ item, index, run, left, top }) => {
  const { pal } = useContext(ForestCtx);
  const p = item.player!;
  const at = T_CARDS + index * STAGGER;
  const s1 = useAfter(at, run);
  const s2 = useAfter(at + T_CANOPY, run);
  const s3 = useAfter(at + T_CONTENT, run);
  const settled = useAfter(at + T_SETTLE, run);
  const vines = useAfter(at + T_VINES, run);

  const raw = Number(p[item.valueKey]) || 0;
  const value = useCountUp(Math.round(raw), settled, 900);
  const digits = String(Math.round(raw)).length + (item.valueKey === 'killDistance' ? 1 : 0);
  const valueSize = digits <= 2 ? 112 : digits === 3 ? 96 : 80;
  const name = (p.playerName || '').toUpperCase();
  const nameSize = name.length <= 9 ? 32 : name.length <= 13 ? 27 : 22;
  const RX = WIN.x + WIN.w + 28; // right column start

  return (
    <div style={{ position: 'absolute', left, top, width: CARD_W, height: CARD_H, filter: s1 ? 'drop-shadow(0 16px 26px rgba(0,0,0,.42))' : 'none', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: CARD_SHAPE, ...masked(CARD_HOLES) }}>
        {/* 1) grove — team logo */}
        <Sweep open={s1} h={CARD_H} fringe="M">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 45% 60% at 50% 50%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 26,
            }}
          >
            <div style={{ transform: s1 ? 'scale(1)' : 'scale(.6)', opacity: s1 ? 1 : 0, transition: `transform 520ms cubic-bezier(.34,1.56,.64,1) ${STEP_MS * 0.5}ms, opacity 250ms linear ${STEP_MS * 0.5}ms` }}>
              <LogoPlate p={p} w={220} h={132} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: WHITE, opacity: s1 ? 1 : 0, transition: `opacity 300ms linear ${STEP_MS * 0.7}ms` }}>
              <Disc cat={item.cat} size={44} />
              <span style={{ fontSize: 30, letterSpacing: '0.16em', textShadow: SHADOW }}>{item.label}</span>
            </div>
          </div>
        </Sweep>

        {/* 2) canopy — theme gradient */}
        <Sweep open={s2} h={CARD_H} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(115deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})` }} />
        </Sweep>

        {/* 3) the card */}
        <Sweep open={s3} h={CARD_H} fringe="P">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 40% 70% at 22% 45%, ${pal.cardGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(160deg, ${pal.black[0]}, ${pal.black[1]})`,
            }}
          >
            {/* theme rail down the left */}
            <div style={{ position: 'absolute', left: 0, top: CHAMFER, bottom: 0, width: 6, background: `linear-gradient(180deg, ${pal.primary}, ${pal.secondary})` }} />

            {/* arched window with the player */}
            <div
              style={{
                position: 'absolute',
                left: WIN.x,
                top: WIN.y,
                width: WIN.w,
                height: WIN.h,
                borderRadius: `${WIN_R}px ${WIN_R}px 12px 12px`,
                overflow: 'hidden',
                background: `radial-gradient(ellipse 80% 55% at 50% 30%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.sceneMid}, ${pal.sceneDeep})`,
              }}
            >
              <svg width={WIN.w} height={WIN.h} viewBox={`0 0 ${WIN.w} ${WIN.h}`} style={{ position: 'absolute', left: 0, top: 0 }} aria-hidden>
                <path d={WIN_PINES_BACK} fill={pal.pineBack} opacity={0.5} />
                <path d={WIN_PINES_FRONT} fill={pal.pineFront} opacity={0.75} />
              </svg>
              <div style={{ position: 'absolute', left: '50%', top: 24, width: 150, height: 150, transform: 'translateX(-50%)', opacity: 0.16, mixBlendMode: 'luminosity', filter: 'grayscale(1) contrast(1.2)' }}>
                <TeamLogo logo={p.teamLogo} flag={p.teamFlag} fallback={'/def_logo.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
                <img
                  src={playerPhoto(p.picUrl) || '/def_char.avif'}
                  alt={p.playerName}
                  style={{
                    display: 'block',
                    height: WIN.h - 20,
                    width: 'auto',
                    maxWidth: WIN.w + 60,
                    objectFit: 'contain',
                    objectPosition: 'bottom center',
                    filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.5))',
                    transform: settled ? 'none' : 'translateY(46px)',
                    opacity: settled ? 1 : 0,
                    transition: 'transform 650ms cubic-bezier(.2,.8,.2,1), opacity 300ms linear',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/def_char.avif';
                  }}
                />
              </div>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 60, background: `linear-gradient(180deg, rgba(0,0,0,0), ${pal.sceneDeep})` }} />
            </div>

            <StrandSvg strand={ARCH_VINE} on={vines} front={false} w={CARD_W} h={CARD_H} />
            {/* window ring */}
            <div
              style={{
                position: 'absolute',
                left: WIN.x,
                top: WIN.y,
                width: WIN.w,
                height: WIN.h,
                boxSizing: 'border-box',
                borderRadius: `${WIN_R}px ${WIN_R}px 12px 12px`,
                border: `4px solid ${pal.label}`,
                boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.35), 0 6px 14px rgba(0,0,0,.45)',
                zIndex: 3,
              }}
            />
            <StrandSvg strand={ARCH_VINE} on={vines} front w={CARD_W} h={CARD_H} />

            {/* category tag — white */}
            <div
              style={{
                position: 'absolute',
                left: RX,
                top: 34,
                height: 46,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '0 26px 0 6px',
                background: WHITE,
                color: INK,
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)',
                fontSize: 25,
                letterSpacing: '0.12em',
              }}
            >
              <Disc cat={item.cat} size={34} />
              {item.label}
            </div>

            {/* the value */}
            <div style={{ position: 'absolute', left: RX, right: 26, top: 98 }}>
              <div style={{ fontSize: 18, letterSpacing: '0.24em', color: pal.label, textShadow: SHADOW }}>{item.unit}</div>
              <div style={{ fontSize: valueSize, color: WHITE, marginTop: 6, fontVariantNumeric: 'tabular-nums', lineHeight: 0.86, whiteSpace: 'nowrap', textShadow: SHADOW }}>
                {value}
                {item.valueKey === 'killDistance' && <span style={{ fontSize: Math.round(valueSize * 0.4), marginLeft: 4 }}>M</span>}
              </div>
              <svg width={120} height={14} viewBox="0 -7 120 14" style={{ display: 'block', marginTop: 10 }} aria-hidden>
                <path d="M0,0 H120" stroke="rgba(255,255,255,.22)" strokeWidth={1.5} />
                <g transform="translate(0,0) scale(0.5)">
                  <path d={LEAF} fill={pal.primary} />
                </g>
                <g transform="translate(22,0) scale(0.36)">
                  <path d={LEAF} fill={pal.secondary} />
                </g>
              </svg>
            </div>

            {/* name strip — white, slanted left edge */}
            <div
              style={{
                position: 'absolute',
                left: RX - 14,
                right: 0,
                top: CARD_H - CHAMFER - 74,
                height: 74,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '0 36px 0 24px',
                background: 'linear-gradient(180deg, #FFFFFF, #E9E9EE)',
                clipPath: 'polygon(14px 0, 100% 0, 100% 100%, 0 100%)',
                boxShadow: 'inset 0 -3px 0 rgba(0,0,0,.08)',
              }}
            >
              <LogoPlate p={p} w={76} h={46} />
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: nameSize, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                <span style={{ fontSize: 14, letterSpacing: '0.18em', color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(p.teamName || '').toUpperCase()}
                </span>
              </div>
            </div>
            {/* gradient line under the strip, along the bottom */}
            <div style={{ position: 'absolute', left: RX - 14, right: CHAMFER, bottom: 0, height: CHAMFER - 14, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})`, clipPath: 'polygon(0 0, 100% 0, 100% 100%, 14px 100%)', opacity: 0.9 }} />
          </div>
        </Sweep>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Title panel
   ───────────────────────────────────────────── */
const TitlePanel: React.FC<{ run: number; context: string; torLogo?: string; cats: Category[] }> = ({ run, context, torLogo, cats }) => {
  const { pal } = useContext(ForestCtx);
  const s1 = useAfter(T_TITLE, run);
  const s2 = useAfter(T_TITLE + T_CANOPY, run);
  const s3 = useAfter(T_TITLE + T_CONTENT, run);
  const vines = useAfter(T_TITLE + T_VINES, run);

  return (
    <div style={{ position: 'absolute', left: TITLE.x, top: TITLE.y, width: TITLE.w, height: TITLE.h, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <StrandSvg strand={TITLE_VINE} on={vines} front={false} w={TITLE.w} h={TITLE.h} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, filter: s1 ? 'drop-shadow(0 18px 30px rgba(0,0,0,.42))' : 'none' }}>
        <div style={{ position: 'absolute', inset: 0, clipPath: TITLE_SHAPE, ...masked(TITLE_HOLES) }}>
          {/* 1) grove — tournament emblem */}
          <Sweep open={s1} h={TITLE.h} fringe="M">
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `${GRAIN}, radial-gradient(ellipse 60% 35% at 50% 45%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {torLogo ? (
                <img src={torLogo} alt="" style={{ maxWidth: 300, maxHeight: 260, objectFit: 'contain', filter: 'drop-shadow(0 6px 12px rgba(0,0,0,.6))', transform: s1 ? 'scale(1)' : 'scale(.6)', opacity: s1 ? 1 : 0, transition: `transform 520ms cubic-bezier(.34,1.56,.64,1) ${STEP_MS * 0.5}ms, opacity 250ms linear ${STEP_MS * 0.5}ms` }} />
              ) : (
                <svg width={180} height={110} viewBox="0 -12 40 24" aria-hidden>
                  <path d={LEAF} fill={pal.label} />
                </svg>
              )}
            </div>
          </Sweep>

          {/* 2) canopy */}
          <Sweep open={s2} h={TITLE.h} fringe="S">
            <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(160deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})` }} />
          </Sweep>

          {/* 3) the title */}
          <Sweep open={s3} h={TITLE.h} fringe="P">
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `${GRAIN}, radial-gradient(ellipse 80% 40% at 30% 0%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.sceneMid} 0%, ${pal.black[1]} 62%)`,
                padding: '48px 44px 0 44px',
                boxSizing: 'border-box',
              }}
            >
              {/* big faint leaf watermark */}
              <svg width={420} height={252} viewBox="0 -12 40 24" style={{ position: 'absolute', right: -130, top: 250, opacity: 0.08, transform: 'rotate(-35deg)' }} aria-hidden>
                <path d={LEAF} fill="#fff" />
              </svg>

              {context && (
                <div
                  style={{
                    display: 'inline-block',
                    background: WHITE,
                    color: INK,
                    padding: '8px 26px 7px 14px',
                    fontSize: 22,
                    letterSpacing: '0.2em',
                    clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
                  }}
                >
                  {context}
                </div>
              )}

              <div style={{ marginTop: 26, color: WHITE, textShadow: SHADOW }}>
                <div style={{ fontSize: 88, letterSpacing: '0.02em', lineHeight: 0.95, whiteSpace: 'nowrap' }}>PLAYERS</div>
                <div style={{ fontSize: 108, lineHeight: 0.95, color: 'transparent', WebkitTextStroke: `3px ${pal.label}`, textShadow: 'none' }}>TO</div>
                <div style={{ fontSize: 88, letterSpacing: '0.02em', lineHeight: 0.95, whiteSpace: 'nowrap' }}>WATCH</div>
              </div>
              <div style={{ marginTop: 20, width: 220, height: 8, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />
              <div style={{ marginTop: 18, fontSize: 18, letterSpacing: '0.26em', color: 'rgba(255,255,255,.7)' }}>TOP PERFORMERS</div>

              {/* the categories on show */}
              <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column' }}>
                {cats.map((c) => (
                  <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,.12)' }}>
                    <Disc cat={c.cat} size={38} />
                    <span style={{ flex: 1, fontSize: 24, letterSpacing: '0.1em', color: WHITE, whiteSpace: 'nowrap' }}>{c.label}</span>
                    <span style={{ fontSize: 13, letterSpacing: '0.14em', color: pal.label, whiteSpace: 'nowrap' }}>{c.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          </Sweep>
        </div>
      </div>
      <StrandSvg strand={TITLE_VINE} on={vines} front w={TITLE.w} h={TITLE.h} />
    </div>
  );
};

/* ─────────────────────────────────────────────
   MatchFragrs
   ───────────────────────────────────────────── */
const MatchFragrs: React.FC<MatchFragrsProps> = ({ tournament, round, matchData, matchDatas }) => {
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);

  // Round-wide leaderboard from the shared fragger pool: kills / damage /
  // grenade-kills summed across every match; kill-distance is a running MAX.
  const realCats = useMemo<Category[]>(() => {
    const matchesToPool = matchDatas && matchDatas.length ? matchDatas : matchData ? [matchData] : [];
    if (matchesToPool.length === 0) return [];
    const pool = buildFraggerPool(matchesToPool as any);
    const asAgg = (e: ReturnType<typeof buildFraggerPool>[number] | null): AggregatedPlayer | undefined =>
      e
        ? {
            _id: e._id,
            playerName: e.playerName,
            picUrl: e.picUrl,
            teamLogo: e.teamLogo,
            teamFlag: e.teamFlag,
            teamName: e.teamName,
            killNum: e.totalKills,
            damage: e.totalDamage,
            grenadeKills: e.totalGrenadeKills,
            killDistance: e.longestKillDistance,
            travelDistance: e.maxTravelDistance,
          }
        : undefined;
    return [
      { label: 'GUNSLINGER', unit: 'KILLS', cat: 'kills', player: asAgg(pickLeader(pool, 'totalKills')), valueKey: 'killNum' },
      { label: 'DMG DEALER', unit: 'DAMAGE', cat: 'damage', player: asAgg(pickLeader(pool, 'totalDamage')), valueKey: 'damage' },
      { label: 'GRENADIER', unit: 'GRENADE KILLS', cat: 'grenade', player: asAgg(pickLeader(pool, 'totalGrenadeKills')), valueKey: 'grenadeKills' },
      { label: 'EAGLE EYE', unit: 'LONGEST KILL', cat: 'eagle', player: asAgg(pickLeader(pool, 'longestKillDistance')), valueKey: 'killDistance' },
    ];
  }, [matchDatas, matchData]);

  const demoCats: Category[] = [
    { label: 'GUNSLINGER', unit: 'KILLS', cat: 'kills', player: DEMO[0], valueKey: 'killNum' },
    { label: 'DMG DEALER', unit: 'DAMAGE', cat: 'damage', player: DEMO[1], valueKey: 'damage' },
    { label: 'GRENADIER', unit: 'GRENADE KILLS', cat: 'grenade', player: DEMO[2], valueKey: 'grenadeKills' },
    { label: 'EAGLE EYE', unit: 'LONGEST KILL', cat: 'eagle', player: DEMO[3], valueKey: 'killDistance' },
  ];

  const hasReal = realCats.some((c) => c.player);
  const cats = (hasReal ? realCats : demo ? demoCats : []).filter((c) => c.player);

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fm' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  const day = round?.day || tournament.day || '';
  const context = [round?.roundName, day ? (/^day/i.test(day) ? day : `DAY ${day}`) : ''].filter(Boolean).join('  ·  ').toUpperCase();

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
        <ForestDefs />
        {cats.length > 0 && (
          <div key={`run-${run}`}>
            <TitlePanel run={run} context={context} torLogo={tournament.torLogo} cats={cats} />
            {cats.map((item, i) => (
              <PlayerCard
                key={item.label}
                item={item}
                index={i}
                run={run}
                left={GRID_X + (i % 2) * (CARD_W + GAP)}
                top={GRID_Y + Math.floor(i / 2) * (CARD_H + GAP)}
              />
            ))}
          </div>
        )}

        {/* ── preview control — outside the 1920×1080 canvas ── */}
        <button
          type="button"
          onClick={preview}
          style={{
            position: 'absolute',
            left: 1940,
            top: 244,
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
          ▶ PREVIEW PLAYERS
        </button>
      </div>
    </ForestCtx.Provider>
  );
};

export default MatchFragrs;