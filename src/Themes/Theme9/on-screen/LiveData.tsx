import SmashPointBar from '../../shared/components/SmashPointBar';
import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  memo,
  createContext,
  useContext,
  useId,
} from 'react';
import {
  useSortedTeams,
  isPlayerDead,
  isRondoMap,
  Player,
  MatchData,
  SortedTeam,
} from '../../shared/hooks/unsortteams';
import { useRecallEvents, useRecallsUsed, useRecallBanner, RecallEvent } from '../../shared/hooks/recallEvents';
import RecalledOverlay from '../../shared/components/RecalledOverlay';
import { brand, EASE_STEP, DUR_REORDER } from '../shell';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';

// NOTE: SocketManager import removed — PublicThemeRenderer owns the single
// socket connection and passes fresh matchData / overallData down as props.
// NOTE: Player / Team / MatchData are imported from useSortedTeams.
//
// FOREST Live Data — layout:
//   HERO: the #1 team's players standing on a forest backdrop (theme colour
//         -> black, canopy glow, light shafts, pine silhouettes, team logo
//         blended in), attached to the table by the #1 info bar.
//   TABLE: rank | flag/logo | TEAMS | ALIVE [| RECALL on Rondo] | ELIMS
//          THIS MATCH ONLY — no points column (same as Theme 8 Live Data).
//   LEGEND: ALIVE / KNOCKED / ELIMINATED (+ RECALL on Rondo)
// Teams ranked by live kills (useSortedTeams 'live', then totalKills desc).
//
// Unchanged logic: useRecallEvents + useRecallsUsed + useRecallBanner /
// RecalledOverlay, EliminatedOverlay / PlayerHealthBar / AnimatedTeamRow
// lifecycles and timers, matchId remount key, whole-pixel fit math,
// Smash Point under the legend. Photos via shared playerPhoto(picUrl).
//
// Vines: only around the list — weaving in front of / behind the left edge,
// one short strand under the bottom-left corner. Nothing on the hero / header
// (top) and nothing on the right side. All vines are static SVG.
//
// Motion: one-shot only (row slide-in, number tick, elimination sweep with
// falling leaves, recall pop, hero players rising in). Transform / opacity.

// ─────────────────────────────────────────────
// Palette + type
// ─────────────────────────────────────────────
const CREAM = '#FFFFFF';
const DEAD_TXT = '#8E8E98';
const ALIVE = '#4CD964';
const KNOCK = '#E5484D';
const DEAD_BAR = '#55555C';
const LOW = '#F5B83D';
const ZONE = '#3B8BFF';
const RECALL = '#7DE3FF';
const RECALL_EDGE = '#1B7FA6';

const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

// rank 38 + logo 74 + tag flex + alive 74 [+ recall 62] + elims 54
const COL = { rank: 38, logo: 74, alive: 74, recall: 62, elims: 54 };
const PANEL_W = 440;
const PANEL_RIGHT = 18;
const HEADER_H = 36;
const LEGEND_H = 36;
const LIST_TOP = 260;

// ─────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────
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
const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const deepen = (c: RGB, max = 0.22): RGB => (lum(c) <= max ? c : mix(c, BLACK, 1 - max / lum(c)));

function forestPalette(primary: string, secondary: string) {
  const p = toRgb(primary);
  const s = toRgb(secondary);
  const dp = deepen(p, 0.2); // theme colour, dark enough for white text
  const vineBase = mix(mix(p, s, 0.5), MOSS, 0.5);
  const leaf = (c: RGB): [string, string, string] => [css(mix(c, WHITE_RGB, 0.42)), css(c), css(mix(c, BLACK, 0.55))];
  const GREY: RGB = [60, 60, 66];
  return {
    primary,
    secondary,
    // rows: theme colour sinking into black
    rowA: [css(mix(dp, BLACK, 0.2)), css(mix(dp, BLACK, 0.38))],
    rowB: [css(mix(dp, BLACK, 0.38)), css(mix(dp, BLACK, 0.54))],
    dead: [css(mix(mix(dp, GREY, 0.65), BLACK, 0.55)), css(mix(mix(dp, GREY, 0.65), BLACK, 0.68))],
    // header / legend / plates: black with a hint of the theme colour
    head: [css(mix(dp, BLACK, 0.8)), css(mix(dp, BLACK, 0.94))],
    elim: [css(mix(dp, BLACK, 0.78)), css(mix(dp, BLACK, 0.95))],
    label: lum(s) < 0.35 ? css(mix(s, WHITE_RGB, 0.45)) : secondary,
    // hero backdrop: theme colour -> black, with white-ish canopy glow
    heroTop: css(mix(p, BLACK, 0.35)),
    heroMid: css(mix(dp, BLACK, 0.55)),
    heroBot: css(mix(dp, BLACK, 0.9)),
    heroGlow: `rgba(${mix(s, WHITE_RGB, 0.5).join(',')},0.55)`,
    heroGlowSoft: `rgba(${p.join(',')},0.45)`,
    pineBack: css(mix(dp, BLACK, 0.7)),
    pineFront: css(mix(dp, BLACK, 0.88)),
    leafP: leaf(mix(p, MOSS, 0.2)),
    leafS: leaf(mix(s, MOSS, 0.2)),
    leafM: leaf(mix(mix(p, s, 0.5), MOSS, 0.45)),
    vineA: { dark: css(mix(vineBase, BLACK, 0.72)), mid: css(mix(vineBase, BLACK, 0.12)), light: css(mix(s, WHITE_RGB, 0.6)) },
    vineB: { dark: css(mix(mix(vineBase, p, 0.3), BLACK, 0.75)), mid: css(mix(mix(vineBase, p, 0.3), BLACK, 0.22)), light: css(mix(p, WHITE_RGB, 0.6)) },
  };
}
type ForestPalette = ReturnType<typeof forestPalette>;
type VineCol = ForestPalette['vineA'];

const GRAIN =
  'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 4px), ' +
  'repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 11px)';
const wood = (pair: string[]) => `${GRAIN}, linear-gradient(180deg, ${pair[0]}, ${pair[1]})`;
const LOGO_CELL = '#FFFFFF';
/**
 * White logo plate — traced from the supplied Layer_2.png (374×224):
 * a slanted block with a notch cut into each side. Points are % of the cell,
 * so it scales with the row height.
 */
const LOGO_CUT =
  'polygon(4% 0%, 82.9% 0%, 99.7% 77.7%, 82.6% 53.1%, 92.8% 100%, 10.2% 96%, 0.3% 46.9%, 18.2% 74.1%)';

const KEYFRAMES = `
@keyframes fzRowIn  { from { opacity: 0; transform: translateX(36px); } to { opacity: 1; transform: none; } }
@keyframes fzFade   { from { opacity: 0; } to { opacity: 1; } }
@keyframes fzRise   { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes fzTick   { 0% { transform: translateY(-40%) scale(1.25); opacity: 0; } 100% { transform: none; opacity: 1; } }
@keyframes fzSpent  { 0% { transform: scale(1.35); opacity: .4; } 100% { transform: scale(1); opacity: 1; } }
@keyframes fzFall   {
  0%   { transform: translate(0,-24px) rotate(0deg); opacity: 0; }
  15%  { opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); opacity: 0; }
}
.fz-row   { animation: fzRowIn .45s cubic-bezier(.2,.8,.2,1) both; }
.fz-deco  { animation: fzFade .6s ease-out .3s both; }
.fz-card  { animation: fzRise .5s cubic-bezier(.2,.8,.2,1) both; }
.fz-tick  { display: inline-block; animation: fzTick .32s cubic-bezier(.2,.8,.2,1) both; }
.fz-spent { animation: fzSpent .6s cubic-bezier(.2,.8,.2,1) both; }
.fz-fall  { animation: fzFall 2.2s cubic-bezier(.4,.1,.6,1) both; }
@media (prefers-reduced-motion: reduce) {
  .fz-row, .fz-deco, .fz-card, .fz-tick, .fz-spent, .fz-fall { animation: none; }
}
`;

// ─────────────────────────────────────────────
// Forest context + SVG pieces
// ─────────────────────────────────────────────
interface ForestInfo {
  pal: ForestPalette;
  gid: string;
}
const ForestContext = createContext<ForestInfo>({ pal: forestPalette('#2E7D4A', '#C9A24A'), gid: 'fz' });

type Tone = 'P' | 'S' | 'M';
const LEAF = 'M0,0 C6,-11 22,-15 40,0 C22,15 6,11 0,0 Z';
const LEAF_TOP = 'M0,0 C6,-11 22,-15 40,0 Z';
const toneColors = (pal: ForestPalette, t: Tone) => (t === 'P' ? pal.leafP : t === 'S' ? pal.leafS : pal.leafM);

const SvgLeaf = ({ x, y, r, s, tone }: { x: number; y: number; r: number; s: number; tone: Tone }) => {
  const { pal, gid } = useContext(ForestContext);
  const c = toneColors(pal, tone);
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${r.toFixed(1)}) scale(${s.toFixed(2)})`}>
      <path d={LEAF} fill={`url(#${gid}-leaf${tone})`} />
      <path d={LEAF_TOP} fill="#fff" opacity={0.13} />
      <path d="M1,0 Q20,-1.5 39,0" stroke={c[0]} strokeWidth={1.3} fill="none" opacity={0.85} />
      <path d={LEAF} fill="none" stroke={c[2]} strokeWidth={0.8} opacity={0.7} />
    </g>
  );
};

/** Round, lit stem: dark core → body → specular streak → bark rings. */
const Stem = ({ d, w, col }: { d: string; w: number; col: VineCol }) => {
  const base = { d, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <g>
      <path {...base} stroke={col.dark} strokeWidth={w} />
      <path {...base} stroke={col.mid} strokeWidth={w * 0.6} transform="translate(-0.5,-0.9)" />
      <path {...base} stroke={col.light} strokeWidth={Math.max(1, w * 0.2)} strokeOpacity={0.65} transform="translate(-0.9,-1.6)" />
      <path {...base} stroke={col.dark} strokeWidth={w * 1.02} strokeOpacity={0.4} strokeDasharray="1.5 10" strokeLinecap="butt" />
    </g>
  );
};

const ForestDefs = ({ gid, pal }: { gid: string; pal: ForestPalette }) => (
  <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
    <defs>
      {(['P', 'S', 'M'] as const).map((t) => {
        const c = toneColors(pal, t);
        return (
          <linearGradient key={t} id={`${gid}-leaf${t}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c[0]} />
            <stop offset="0.45" stopColor={c[1]} />
            <stop offset="0.55" stopColor={c[2]} />
            <stop offset="1" stopColor={c[2]} />
          </linearGradient>
        );
      })}
      <radialGradient id={`${gid}-berry`} cx="0.35" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#fff" stopOpacity={0.9} />
        <stop offset="0.35" stopColor={pal.secondary} />
        <stop offset="1" stopColor={css(mix(toRgb(pal.secondary), BLACK, 0.55))} />
      </radialGradient>
      <filter id={`${gid}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="1.5" dy="2.5" stdDeviation="1.8" floodColor="#000" floodOpacity="0.55" />
      </filter>
    </defs>
  </svg>
);

// ─────────────────────────────────────────────
// Wrapping-vine geometry (panel-local coords: x=0 left edge, y=0 header top)
// ─────────────────────────────────────────────
type Pt = [number, number];
interface Seg { d: string; front: boolean; }
interface Tip { p: Pt; out: [number, number]; } // out = outward unit-ish direction

/**
 * A strand that stitches along one edge, alternating between a point just
 * OUTSIDE the panel and one just INSIDE it. Each dip (out → in → out) is
 * drawn either in front of the panel or behind it, alternating, so the vine
 * reads as wrapping around the edge.
 */
function edgeStrand(opts: {
  axis: 'x' | 'y'; // direction of travel
  from: number;
  to: number;
  step: number;
  outer: number; // across-coordinate outside the panel
  inner: number; // across-coordinate inside the panel
  startInner: boolean;
  frontParity: 0 | 1 | 'all';
}): { segs: Seg[]; tips: Tip[] } {
  const { axis, from, to, step, outer, inner, startInner, frontParity } = opts;
  const pts: Pt[] = [];
  for (let i = 0, a = from; a <= to + 0.01; i++, a += step) {
    const isInner = (i % 2 === 0) === startInner;
    const c = isInner ? inner : outer;
    pts.push(axis === 'y' ? [c, a] : [a, c]);
  }
  const segs: Seg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    let d: string;
    if (axis === 'y') {
      const dy = (b[1] - a[1]) / 2;
      d = `M${a[0]},${a[1]} C${a[0]},${a[1] + dy} ${b[0]},${b[1] - dy} ${b[0]},${b[1]}`;
    } else {
      const dx = (b[0] - a[0]) / 2;
      d = `M${a[0]},${a[1]} C${a[0] + dx},${a[1]} ${b[0] - dx},${b[1]} ${b[0]},${b[1]}`;
    }
    const dip = Math.floor((i + (startInner ? 1 : 0)) / 2);
    segs.push({ d, front: frontParity === 'all' ? true : dip % 2 === frontParity });
  }
  const outSign = Math.sign(outer - inner);
  const tips: Tip[] = pts
    .filter((p) => (axis === 'y' ? p[0] : p[1]) === outer)
    .map((p) => ({ p, out: axis === 'y' ? [outSign, 0] : [0, outSign] }));
  return { segs, tips };
}

const TENDRIL = 'M0,0 c0,-12 12,-19 19,-12 c6,6 0,14 -6,10 c-4,-3 -2,-8 2,-6';

interface VineLayout {
  backA: Seg[];
  backB: Seg[];
  frontA: Seg[];
  frontB: Seg[];
  leaves: { x: number; y: number; r: number; s: number; tone: Tone }[];
  berries: Pt[];
  tendrils: { x: number; y: number; r: number }[];
}

function buildVines(height: number): VineLayout {
  const BOTTOM_END = 184; // the bottom vine stays short
  const strands = [
    // left edge — double strand weaving in front / behind (second one thins out lower down)
    { s: edgeStrand({ axis: 'y', from: 8, to: height + 2, step: 40, outer: -11, inner: 5, startInner: false, frontParity: 0 }), c: 'A' },
    { s: edgeStrand({ axis: 'y', from: 8, to: Math.round(height * 0.62), step: 40, outer: -11, inner: 5, startInner: true, frontParity: 1 }), c: 'B' },
    // bottom edge — one short strand wrapping the bottom-left corner
    { s: edgeStrand({ axis: 'x', from: 0, to: BOTTOM_END, step: 46, outer: height + 10, inner: height - 6, startInner: false, frontParity: 0 }), c: 'A' },
  ] as const;

  const out: VineLayout = { backA: [], backB: [], frontA: [], frontB: [], leaves: [], berries: [], tendrils: [] };
  const tones: Tone[] = ['M', 'P', 'S'];
  let li = 0;
  strands.forEach(({ s, c }, si) => {
    s.segs.forEach((seg) => {
      const key = `${seg.front ? 'front' : 'back'}${c}` as 'frontA' | 'frontB' | 'backA' | 'backB';
      out[key].push(seg);
    });
    // small leaves on the outside points only — every other one, so they stay tight
    s.tips.forEach((t, k) => {
      if ((k + si) % 2) return;
      const base = (Math.atan2(t.out[1], t.out[0]) * 180) / Math.PI;
      const jitter = ((li * 37) % 50) - 25;
      out.leaves.push({ x: t.p[0], y: t.p[1], r: base + jitter, s: 0.42 + ((li * 13) % 20) / 100, tone: tones[li % 3] });
      if (li % 4 === 0) out.berries.push([t.p[0] + t.out[0] * 6, t.p[1] + t.out[1] * 6]);
      li++;
    });
  });

  // where the vines start (just under the header) and the bottom-left corner
  ([
    [0, 8, [-165, 160]],
    [0, height, [150, 175]],
  ] as [number, number, number[]][]).forEach(([x, y, angles]) => {
    angles.forEach((r, i) => out.leaves.push({ x, y, r, s: 0.6 - i * 0.06, tone: tones[i % 3] }));
  });
  out.berries.push([-8, height + 6]);
  out.tendrils.push({ x: BOTTOM_END, y: height + 10, r: 180 });
  return out;
}

const Berries = ({ x, y }: { x: number; y: number }) => {
  const { gid } = useContext(ForestContext);
  return (
    <g transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}>
      {[[0, 0, 3.6], [5, 3, 2.9], [-3.5, 4, 3.2]].map(([bx, by, br], k) => (
        <circle key={k} cx={bx} cy={by} r={br} fill={`url(#${gid}-berry)`} />
      ))}
    </g>
  );
};

/** Vine layer. `front` renders the in-front pieces + leaves, otherwise the behind pieces. */
const VineLayer = ({ layout, front, height }: { layout: VineLayout; front: boolean; height: number }) => {
  const { pal, gid } = useContext(ForestContext);
  const a = front ? layout.frontA : layout.backA;
  const b = front ? layout.frontB : layout.backB;
  return (
    <svg
      className="fz-deco"
      width={PANEL_W}
      height={height}
      viewBox={`0 0 ${PANEL_W} ${height}`}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 6 : 0 }}
      aria-hidden
    >
      <g filter={`url(#${gid}-shadow)`}>
        {b.map((s, i) => (
          <Stem key={`b${i}`} d={s.d} w={5} col={pal.vineB} />
        ))}
        {a.map((s, i) => (
          <Stem key={`a${i}`} d={s.d} w={7} col={pal.vineA} />
        ))}
        {front &&
          layout.tendrils.map((t, i) => (
            <g key={`t${i}`} transform={`translate(${t.x},${t.y}) rotate(${t.r})`}>
              <Stem d={TENDRIL} w={2.6} col={pal.vineA} />
            </g>
          ))}
        {front && layout.leaves.map((l, i) => <SvgLeaf key={`l${i}`} {...l} />)}
      </g>
      {front && layout.berries.map(([x, y], i) => <Berries key={`r${i}`} x={x} y={y} />)}
    </svg>
  );
};

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
// Recall left (Rondo) — unchanged logic.
// ─────────────────────────────────────────────
const RECALLS_PER_PLAYER = 1;
const recallKey = (p: any): string => String(p?.uId ?? p?._id ?? p?.playerName ?? '');

interface RecallLeftInfo {
  on: boolean;
  used: Record<string, number>;
}
const RecallLeftContext = createContext<RecallLeftInfo>({ on: false, used: {} });

const BOLT_PATH = 'M7 0 H16 L11.5 12 H16 L4 32 L6.5 17 H0.5 Z';

const RecallBolt = ({ available, width, height }: { available: boolean; width: number; height: number }) => (
  <div
    key={available ? 'a' : 'u'}
    className={available ? undefined : 'fz-spent'}
    style={{ width, height, flex: 'none', filter: available ? 'drop-shadow(0 0 3px rgba(125,227,255,0.7))' : 'none' }}
  >
    <svg width={width} height={height} viewBox="0 0 16 32" preserveAspectRatio="none" style={{ display: 'block' }} aria-hidden>
      <path
        d={BOLT_PATH}
        fill={available ? RECALL : 'rgba(255,255,255,0.06)'}
        stroke={available ? RECALL_EDGE : 'rgba(243,235,211,0.35)'}
        strokeWidth={1.2}
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  </div>
);

// ─────────────────────────────────────────────
// EliminatedOverlay — unchanged lifecycle (rAF + 2500ms / 3300ms timers).
// ─────────────────────────────────────────────
interface EliminatedOverlayProps {
  overlayStyle: React.CSSProperties;
  rowHeight: number;
  onDone: () => void;
}

const FALLING: { left: string; dx: string; rot: string; delay: number; tone: Tone }[] = [
  { left: '14%', dx: '-14px', rot: '-160deg', delay: 0.25, tone: 'P' },
  { left: '36%', dx: '10px', rot: '200deg', delay: 0.5, tone: 'S' },
  { left: '58%', dx: '-8px', rot: '-220deg', delay: 0.35, tone: 'M' },
  { left: '80%', dx: '14px', rot: '180deg', delay: 0.6, tone: 'P' },
];

const EliminatedOverlay = memo(({ overlayStyle, rowHeight, onDone }: EliminatedOverlayProps) => {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [expanded, setExpanded] = useState(false);
  const { gid } = useContext(ForestContext);

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
  const leafW = Math.round(rowHeight * 0.42);

  return (
    <div style={{ position: 'absolute', inset: 0, height: `${rowHeight}px`, zIndex: 20, overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        style={{
          ...overlayStyle,
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: isExpanded ? '100%' : '0%',
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
        <span
          style={{
            fontFamily: FONT,
            fontSize: Math.round(rowHeight * 0.6),
            fontWeight: 700,
            color: CREAM,
            letterSpacing: '0.3em',
            opacity: isExpanded ? 1 : 0,
            transition: phase === 'in' ? 'opacity 0.4s ease 0.8s' : 'opacity 0.3s ease',
            whiteSpace: 'nowrap',
            textShadow: '0 2px 6px rgba(0,0,0,.6)',
          }}
        >
          ELIMINATED
        </span>
      </div>
      {phase === 'in' &&
        FALLING.map((l, i) => (
          <svg
            key={i}
            className="fz-fall"
            width={leafW}
            height={leafW * 0.6}
            viewBox="0 -12 40 24"
            style={
              {
                position: 'absolute',
                top: 0,
                left: l.left,
                animationDelay: `${l.delay}s`,
                '--dx': l.dx,
                '--dy': `${rowHeight + 6}px`,
                '--rot': l.rot,
              } as React.CSSProperties
            }
            aria-hidden
          >
            <path d={LEAF} fill={`url(#${gid}-leaf${l.tone})`} />
          </svg>
        ))}
    </div>
  );
});
EliminatedOverlay.displayName = 'EliminatedOverlay';

// ─────────────────────────────────────────────
// PlayerHealthBar — unchanged fill logic + memo comparator.
// Thin vertical bars like the reference: green / amber / red, grey track.
// ─────────────────────────────────────────────
interface HealthBarProps {
  player: Player;
  apiEnabled: boolean;
  baseHealthBar: number;
  width: number;
}

const PlayerHealthBar = memo(
  ({ player, apiEnabled, baseHealthBar, width }: HealthBarProps) => {
    const isDead = isPlayerDead(player);
    const isKnocked = player.liveState === 4;

    let ratio = 0;
    let barColor = 'transparent';

    if (!isDead) {
      ratio = apiEnabled ? Math.max(0, Math.min(1, player.health / (player.healthMax || 100))) : 1;
      barColor = isKnocked ? KNOCK : ratio < 0.3 ? LOW : ALIVE;
    }

    return (
      <div
        style={{
          position: 'relative',
          width,
          height: `${baseHealthBar}px`,
          background: DEAD_BAR,
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,.5)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: `${ratio * baseHealthBar}px`,
            backgroundColor: barColor,
            backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.35) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,.22) 100%)',
            transition: 'height 300ms ease, background-color 300ms ease',
          }}
        />
      </div>
    );
  },
  (prev, next) =>
    prev.player.health === next.player.health &&
    prev.player.healthMax === next.player.healthMax &&
    prev.player.liveState === next.player.liveState &&
    prev.player.bHasDied === next.player.bHasDied &&
    prev.apiEnabled === next.apiEnabled &&
    prev.baseHealthBar === next.baseHealthBar &&
    prev.width === next.width
);
PlayerHealthBar.displayName = 'PlayerHealthBar';

const FiringIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg viewBox="0 0 40 16" width={size} height={size * 0.4} aria-hidden style={{ display: 'block' }}>
    <rect x="0" y="5" width="6" height="2" fill={color} opacity="0.5" />
    <rect x="0" y="9" width="9" height="2" fill={color} opacity="0.5" />
    <path d="M12 3 H30 C35 3 39 6 40 8 C39 10 35 13 30 13 H12 Z" fill={color} />
  </svg>
);

// ─────────────────────────────────────────────
// TeamCells — the columns, shared by the #1 hero bar and the list rows
//   rank | logo | TEAMS | ALIVE [| RECALL] | ELIMS
// ─────────────────────────────────────────────
interface TeamCellsProps {
  team: any;
  rank: number;
  rowHeight: number;
  baseHealthBar: number;
  apiEnabled: boolean;
  hero?: boolean;
}

const TeamCells = ({ team, rank, rowHeight, baseHealthBar, apiEnabled, hero }: TeamCellsProps) => {
  const recall = useContext(RecallLeftContext);
  const { pal } = useContext(ForestContext);

  const firing = team.players?.some((p: Player) => p.isFiring);
  const dead = !!team.isAllDead;
  const players: Player[] = team.players || [];

  const tagFont = Math.round(rowHeight * 0.64);
  const numFont = Math.round(rowHeight * 0.68);
  const rankFont = Math.round(rowHeight * 0.52);
  const txt = dead ? DEAD_TXT : CREAM;
  // crisp dark edge + soft drop so white text reads on any theme colour
  const shadow = dead ? '0 1px 1px rgba(0,0,0,.6)' : '0 0 1px rgba(0,0,0,.9), 0 2px 2px rgba(0,0,0,.6)';

  const nPlayers = Math.max(1, players.length);
  const barW = Math.max(6, Math.min(11, Math.floor((COL.alive - 14 - (nPlayers - 1) * 4) / nPlayers)));
  const boltW = Math.max(10, Math.min(14, Math.floor((COL.recall - 6 - (nPlayers - 1) * 1) / nPlayers)));
  const cell: React.CSSProperties = { flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'stretch',
        fontFamily: FONT,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {/* rank — darker strip; #1 gets a crown */}
      <div
        style={{
          ...cell,
          width: COL.rank,
          paddingLeft: 6,
          boxSizing: 'border-box',
          background: hero ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.3)',
          color: dead ? DEAD_TXT : rank <= 3 ? pal.label : CREAM,
          fontSize: rankFont,
          fontVariantNumeric: 'tabular-nums',
          textShadow: shadow,
        }}
      >
        {firing ? (
          <FiringIcon size={24} color={KNOCK} />
        ) : hero ? (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Crown size={15} color={pal.label} />
            {rank}
          </span>
        ) : (
          rank
        )}
      </div>

      {/* flag / logo — white notched plate (Layer_2 shape) */}
      <div
        style={{
          ...cell,
          width: COL.logo,
          background: LOGO_CELL,
          clipPath: LOGO_CUT,
          // keep the logo inside the solid middle of the plate, clear of the notches
          padding: `${Math.round(rowHeight * 0.12)}px ${Math.round(COL.logo * 0.18)}px ${Math.round(rowHeight * 0.12)}px ${Math.round(COL.logo * 0.17)}px`,
          boxSizing: 'border-box',
          filter: dead ? 'grayscale(1)' : 'none',
          opacity: dead ? 0.45 : 1,
        }}
      >
        <TeamLogo
          logo={team.teamLogo}
          flag={team.teamFlag}
          fallback={'/def_logo.png'}
          alt=""
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            (e.target as HTMLImageElement).src = '/def_logo.png';
          }}
        />
      </div>

      {/* team tag */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 4px',
          fontSize: tagFont,
          letterSpacing: '0.04em',
          color: txt,
          textShadow: shadow,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {String(team.teamTag ?? '').toUpperCase()}
      </div>

      {/* alive bars */}
      <div style={{ ...cell, width: COL.alive, gap: 4, background: 'rgba(0,0,0,.14)' }}>
        {players.length === 0 ? (
          <span style={{ fontSize: 17, color: DEAD_TXT, letterSpacing: '0.15em' }}>MISS</span>
        ) : (
          players.map((player: Player) => (
            <PlayerHealthBar key={player._id} player={player} apiEnabled={apiEnabled} baseHealthBar={baseHealthBar} width={barW} />
          ))
        )}
      </div>

      {/* recall (Rondo) */}
      {recall.on && (
        <div style={{ ...cell, width: COL.recall, gap: 1, opacity: dead ? 0.4 : 1 }}>
          {players.map((player: Player) => (
            <RecallBolt
              key={player._id}
              available={(recall.used[recallKey(player)] || 0) < RECALLS_PER_PLAYER}
              width={boltW}
              height={baseHealthBar}
            />
          ))}
        </div>
      )}

      {/* ELIMS */}
      <div
        style={{
          ...cell,
          width: COL.elims,
          color: hero && !dead ? pal.label : txt,
          fontSize: numFont,
          fontVariantNumeric: 'tabular-nums',
          background: 'rgba(0,0,0,.18)',
          textShadow: shadow,
          overflow: 'hidden',
        }}
      >
        <span key={team.totalKills} className="fz-tick">{team.totalKills}</span>
      </div>
    </div>
  );
};

const Crown: React.FC<{ size?: number; color: string }> = ({ size = 18, color }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
    <rect x="6" y="27" width="28" height="3" fill={color} />
  </svg>
);

/** Blue wash for a team outside the zone. */
const ZoneWash = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(90deg, rgba(59,139,255,.3), rgba(59,139,255,.08) 60%)',
      boxShadow: `inset 3px 0 0 ${ZONE}`,
      pointerEvents: 'none',
      zIndex: 2,
    }}
  />
);

// ─────────────────────────────────────────────
// AnimatedTeamRow — unchanged elimination-edge refs/effect, recall banner
// via useRecallBanner + RecalledOverlay, EASE_STEP reorder.
// ─────────────────────────────────────────────
interface AnimatedTeamRowProps {
  team: any;
  index: number;
  rankOffset: number;
  overlayStyle: React.CSSProperties;
  apiEnabled: boolean;
  baseRowHeight: number;
  baseHealthBar: number;
  transitionReady: boolean;
  recallEvents: RecallEvent[];
}

const AnimatedTeamRow = ({
  team,
  index,
  rankOffset,
  overlayStyle,
  apiEnabled,
  baseRowHeight,
  baseHealthBar,
  transitionReady,
  recallEvents,
}: AnimatedTeamRowProps) => {
  const wasEliminatedRef = useRef(team.isAllDead);
  const overlayKeyRef = useRef(0);
  const [overlayKey, setOverlayKey] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  const entranceDelay = useRef(Math.min(index, 20) * 35).current;
  const { pal } = useContext(ForestContext);

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
  const rowRecalls = useMemo(() => recallEvents.filter((e) => e.teamId === teamKey), [recallEvents, teamKey]);
  const { current: currentRecall, onDone: handleRecallDone } = useRecallBanner(rowRecalls);

  const dead = !!team.isAllDead;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: `${index * baseRowHeight}px`,
        height: `${baseRowHeight}px`,
        transition: transitionReady ? `top ${DUR_REORDER}ms ${EASE_STEP}` : 'none',
        zIndex: 1,
      }}
    >
      <div
        className="fz-row"
        style={{
          animationDelay: `${entranceDelay}ms`,
          width: '100%',
          height: `${baseRowHeight}px`,
          position: 'relative',
          background: wood(dead ? pal.dead : index % 2 ? pal.rowA : pal.rowB),
          boxShadow: 'inset 0 -1px 0 rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.05)',
        }}
      >
        {team.hasOutsideBlueCircle && !dead && <ZoneWash />}

        <TeamCells
          team={team}
          rank={index + rankOffset}
          rowHeight={baseRowHeight}
          baseHealthBar={baseHealthBar}
          apiEnabled={apiEnabled}
        />

        {showOverlay && (
          <EliminatedOverlay key={overlayKey} overlayStyle={overlayStyle} rowHeight={baseRowHeight} onDone={handleOverlayDone} />
        )}

        {currentRecall && (
          <RecalledOverlay
            key={currentRecall.bannerKey}
            playerName={currentRecall.playerName}
            rowHeight={baseRowHeight}
            onDone={handleRecallDone}
          />
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// AnimatedTeamList — unchanged (transitionReady rAF, composite remount key).
// ─────────────────────────────────────────────
interface AnimatedTeamListProps {
  teams: any[];
  rankOffset?: number;
  overlayStyle: React.CSSProperties;
  apiEnabled: boolean;
  baseRowHeight: number;
  baseHealthBar: number;
  matchId: string | null;
  recallEvents: RecallEvent[];
}

const AnimatedTeamList = ({
  teams,
  rankOffset = 1,
  overlayStyle,
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
          rankOffset={rankOffset}
          overlayStyle={overlayStyle}
          apiEnabled={apiEnabled}
          baseRowHeight={baseRowHeight}
          baseHealthBar={baseHealthBar}
          transitionReady={transitionReady}
          recallEvents={recallEvents}
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// ForestHero — #1 team's players standing on top of the table.
//   Backdrop: theme colour → black, sun glow through the canopy, light
//   shafts, layered pine silhouettes and the team logo blended in.
//   No vines up here. Static, apart from a one-shot player rise.
// ─────────────────────────────────────────────
const HERO_PHOTO_H = 150;
const HERO_BAR_H = 46;
const PLAYER_W = 180;

const pines = (baseY: number, count: number, minH: number, maxH: number, seed: number) => {
  let d = '';
  const step = PANEL_W / count;
  for (let i = 0; i <= count; i++) {
    const r = Math.abs(Math.sin((i + 1) * 12.9898 * seed) * 43758.5453) % 1;
    const h = minH + r * (maxH - minH);
    const w = h * 0.42;
    const x = i * step + (r - 0.5) * step * 0.6;
    d += `M${(x - w / 2).toFixed(1)},${baseY} L${x.toFixed(1)},${(baseY - h).toFixed(1)} L${(x + w / 2).toFixed(1)},${baseY} Z `;
  }
  return d;
};
const PINES_BACK = pines(HERO_PHOTO_H, 9, 60, 105, 1.7);
const PINES_FRONT = pines(HERO_PHOTO_H, 7, 38, 70, 3.1);

const ForestHero = ({ team, apiEnabled, baseHealthBar }: { team: any; apiEnabled: boolean; baseHealthBar: number }) => {
  const { pal } = useContext(ForestContext);
  const players: any[] = (team.players || []).slice(0, 4);
  const n = Math.max(1, players.length);
  const spread = n > 1 ? (PANEL_W - PLAYER_W + 10) / (n - 1) : 0;
  const startX = n > 1 ? -5 : (PANEL_W - PLAYER_W) / 2;
  const dead = !!team.isAllDead;

  return (
    <div style={{ position: 'relative', width: PANEL_W }}>
      {/* backdrop + players */}
      <div style={{ position: 'relative', height: HERO_PHOTO_H }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            clipPath: 'polygon(30px 0, 100% 0, 100% 100%, 0 100%, 0 30px)',
            background: `radial-gradient(ellipse 60% 80% at 62% -8%, ${pal.heroGlow} 0%, rgba(0,0,0,0) 70%),
                         linear-gradient(170deg, ${pal.heroTop} 0%, ${pal.heroMid} 50%, ${pal.heroBot} 100%)`,
          }}
        >
          {/* light shafts */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(105deg, transparent 18%, rgba(255,255,255,.10) 22%, transparent 27%, transparent 46%, rgba(255,255,255,.08) 50%, transparent 56%, transparent 70%, rgba(255,255,255,.07) 73%, transparent 78%)',
            }}
          />
          {/* team logo blended in */}
          <div
            style={{
              position: 'absolute',
              right: -20,
              top: -12,
              width: 190,
              height: 190,
              opacity: 0.22,
              mixBlendMode: 'luminosity',
              filter: 'grayscale(1) contrast(1.2)',
              transform: 'rotate(-8deg)',
            }}
          >
            <TeamLogo logo={team.teamLogo} flag={team.teamFlag} fallback={'/def_logo.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          {/* faint rank mark */}
          <div style={{ position: 'absolute', left: 34, top: 6, fontFamily: FONT, fontWeight: 700, fontSize: 96, lineHeight: 1, color: '#fff', opacity: 0.08 }}>#1</div>
          {/* pine silhouettes */}
          <svg width={PANEL_W} height={HERO_PHOTO_H} viewBox={`0 0 ${PANEL_W} ${HERO_PHOTO_H}`} style={{ position: 'absolute', left: 0, top: 0 }} aria-hidden>
            <path d={PINES_BACK} fill={pal.pineBack} opacity={0.55} />
            <path d={PINES_FRONT} fill={pal.pineFront} opacity={0.85} />
          </svg>
          {/* top edge accent */}
          <div style={{ position: 'absolute', top: 0, left: 30, right: 0, height: 3, background: pal.label }} />
        </div>

        {/* players */}
        {players.map((player: any, i: number) => (
          <div
            key={player._id}
            className="fz-card"
            style={{
              position: 'absolute',
              bottom: 0,
              left: startX + i * spread,
              width: PLAYER_W,
              height: HERO_PHOTO_H + 16,
              zIndex: 1,
              animationDelay: `${0.15 + i * 0.08}s`,
            }}
          >
            <img
              src={playerPhoto(player.picUrl) || '/def_char.avif'}
              alt={player.playerName}
              decoding="async"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/def_char.avif';
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'top',
                filter: dead ? 'grayscale(1) brightness(.6)' : 'drop-shadow(0 8px 14px rgba(0,0,0,.55))',
              }}
            />
          </div>
        ))}

        {/* fade under the players into the bar */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 56,
            zIndex: 2,
            pointerEvents: 'none',
            background: `linear-gradient(180deg, rgba(0,0,0,0), ${pal.heroBot})`,
          }}
        />
      </div>

      {/* #1 info bar — same columns as the list */}
      <div
        style={{
          position: 'relative',
          height: HERO_BAR_H,
          zIndex: 3,
          background: wood(dead ? pal.dead : pal.rowA),
          boxShadow: `inset 0 2px 0 ${pal.label}, 0 -2px 12px ${pal.heroGlowSoft}`,
        }}
      >
        {team.hasOutsideBlueCircle && !dead && <ZoneWash />}
        <TeamCells team={team} rank={1} rowHeight={HERO_BAR_H} baseHealthBar={Math.min(baseHealthBar, HERO_BAR_H - 12)} apiEnabled={apiEnabled} hero />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Legend — ALIVE / KNOCKED / ELIMINATED (one swatch each), RECALL (available + used)
// ─────────────────────────────────────────────
const Swatch = ({ color }: { color: string }) => (
  <span style={{ display: 'inline-block', width: 10, height: 17, background: color, borderRadius: 2 }} />
);
const Key = ({ swatch, label }: { swatch: React.ReactNode; label: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
    {swatch}
    {label}
  </span>
);

// ─────────────────────────────────────────────
// LiveData (main)
// ─────────────────────────────────────────────
const LiveData: React.FC<LiveStatsProps> = ({ tournament, round, match, matchData, overallData }) => {
  const liveSortedTeams: SortedTeam[] = useSortedTeams(matchData, overallData, 'live');
  const sortedTeams: SortedTeam[] = useMemo(
    () => [...liveSortedTeams].sort((a, b) => b.totalKills - a.totalKills),
    [liveSortedTeams]
  );
  const recallEvents = useRecallEvents(matchData, match);

  // ── Layout: #1 lives in the hero; whole-pixel rows for the rest ──
  const { baseRowHeight, baseHealthBar } = useMemo(() => {
    const bottomMargin = 26; // room for the vine under the legend
    const available = Math.max(0, 1080 - LIST_TOP - LEGEND_H - bottomMargin);
    const rowsCount = Math.max(1, sortedTeams.length - 1);
    const baseRowHeight = Math.max(28, Math.min(50, Math.floor(available / rowsCount)));
    const baseHealthBar = Math.round(baseRowHeight * 0.68);
    return { baseRowHeight, baseHealthBar };
  }, [sortedTeams.length]);

  const { primary } = brand(tournament.primaryColor, tournament.secondaryColor);
  const secondary = tournament.secondaryColor || primary;

  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fz' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const forest = useMemo<ForestInfo>(() => ({ pal, gid }), [pal, gid]);

  const overlayStyle = useMemo<React.CSSProperties>(
    () => ({ background: wood(pal.elim), borderLeft: `6px solid ${pal.label}`, boxSizing: 'border-box' }),
    [pal]
  );

  const apiEnabled = round?.apiEnable === true;
  const isRondo = isRondoMap(match?.map);
  const recallInfo = useRecallsUsed(matchData, match, recallEvents);

  const topTeam: any = sortedTeams[0];
  const listTeams = useMemo(() => sortedTeams.slice(1), [sortedTeams]);

  // vines cover the list + legend only (none on the hero / header)
  const vineH = listTeams.length * baseRowHeight + LEGEND_H;
  const vines = useMemo(() => buildVines(vineH), [vineH]);

  if (!matchData) {
    return (
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">
          No match data
        </text>
      </svg>
    );
  }

  const headLabel: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: pal.label,
    textShadow: '0 1px 2px rgba(0,0,0,.8)',
    lineHeight: 1,
    textAlign: 'center',
    flex: 'none',
  };

  return (
    <ForestContext.Provider value={forest}>
      <RecallLeftContext.Provider value={recallInfo}>
        <div style={{ width: 1920, height: 1080, position: 'relative' }}>
          <style>{KEYFRAMES}</style>
          <ForestDefs gid={gid} pal={pal} />

          {/* frame: x=0 panel left edge, y=0 first list row */}
          <div style={{ position: 'absolute', right: PANEL_RIGHT, top: LIST_TOP, width: PANEL_W }}>
            {/* hero (#1 players + bar) and the column header, attached above the list */}
            <div style={{ position: 'absolute', left: 0, bottom: '100%', width: PANEL_W, zIndex: 2, boxShadow: '0 -6px 22px rgba(0,0,0,.35)' }}>
              {topTeam && <ForestHero team={topTeam} apiEnabled={apiEnabled} baseHealthBar={baseHealthBar} />}
              <div
                style={{
                  height: HEADER_H,
                  display: 'flex',
                  alignItems: 'center',
                  background: wood(pal.head),
                  boxShadow: `inset 0 -2px 0 ${pal.label}`,
                  fontFamily: FONT,
                }}
              >
                <span style={{ ...headLabel, width: COL.rank + COL.logo }} />
                <span style={{ ...headLabel, flex: 1 }}>TEAMS</span>
                <span style={{ ...headLabel, width: COL.alive }}>ALIVE</span>
                {isRondo && <span style={{ ...headLabel, width: COL.recall }}>RECALL</span>}
                <span style={{ ...headLabel, width: COL.elims }}>ELIMS</span>
              </div>
            </div>

            <VineLayer layout={vines} front={false} height={vineH} />

            <div style={{ position: 'relative', zIndex: 1, boxShadow: '0 12px 26px rgba(0,0,0,.4)' }}>
              <AnimatedTeamList
                teams={listTeams}
                rankOffset={2}
                overlayStyle={overlayStyle}
                apiEnabled={apiEnabled}
                baseRowHeight={baseRowHeight}
                baseHealthBar={baseHealthBar}
                matchId={matchData?._id ?? null}
                recallEvents={recallEvents}
              />

              {/* legend */}
              <div
                style={{
                  height: LEGEND_H,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: isRondo ? 20 : 30,
                  background: wood(pal.head),
                  boxShadow: `inset 0 2px 0 ${pal.label}`,
                  fontFamily: FONT,
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: CREAM,
                  lineHeight: 1,
                }}
              >
                <Key swatch={<Swatch color={ALIVE} />} label="ALIVE" />
                <Key swatch={<Swatch color={KNOCK} />} label="KNOCKED" />
                <Key swatch={<Swatch color={DEAD_BAR} />} label="ELIMINATED" />
                {isRondo && (
                  <Key
                    swatch={
                      <span style={{ display: 'inline-flex', gap: 2 }}>
                        <RecallBolt available width={8} height={16} />
                        <RecallBolt available={false} width={8} height={16} />
                      </span>
                    }
                    label="RECALL"
                  />
                )}
              </div>
            </div>

            <VineLayer layout={vines} front height={vineH} />

            {/* Smash Point under the legend: shown only when set for this match. */}
            <div style={{ marginTop: 20, marginLeft: PANEL_W - 420, width: 420 }}>
              <SmashPointBar match={match} tournament={tournament} height={38} />
            </div>
          </div>
        </div>
      </RecallLeftContext.Provider>
    </ForestContext.Provider>
  );
};

export default LiveData;