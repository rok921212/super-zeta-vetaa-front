import React, { useCallback, useEffect, useMemo, useState, useRef, useId, createContext, useContext } from 'react';
import { computeMatchStandings } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// freshly-merged `matchData` down as a prop — the winner is derived from it
// with computeMatchStandings(...).filter(t => t.wwcd), exactly as before.
//
// FOREST WWCD — a forest stage, restructured:
//
//              ╭────────────────────────╮
//             ╱   the 4 players stand    ╲
//            │    together in the arch    │
//          (ELIMS)  (forest, team logo)  (DAMAGE)   ← tree-ring medallions
//        ┌[LOGO]─ WINNER WINNER CHICKEN DINNER ─ round·day ┐  against the arch
//        │        TEAM NAME                        match   │  black band
//        └─────────────────────────────────────────────────┘
//          [▬ name ▬|6 K 812 D 2 A] × 4                     slim player bars,
//                                                          MVP crown leaf
//
// Motion — every block runs THREE STEPS behind a fringe of leaves:
//   1) the grove: dark plate (team logo)   2) the canopy: theme gradient
//   3) the content.
//   arch   grows upward; the players then rise in; a 3D vine grows around
//          the dome, weaving in front of / behind the frame
//   medals the two tree-ring medallions beside the arch grow up in place,
//          totals count up
//   band   opens from the centre outward; logo plate drops, name rises
//   bars   slim player bars rise from below one after another, count up
// Everything is state + CSS transitions, so it always plays.
// PREVIEW: a "Preview WWCD" button sits just OUTSIDE the 1920×1080 canvas.
// It replays the sequence; if there is no real winner yet it uses dummy data.

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
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  health?: number;
  healthMax?: number;
  liveState?: number;
}

interface Team {
  _id: string;
  teamId?: string;
  teamName?: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
  teamFlag?: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface WwcdSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

/* ── type ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const DIM = '#6E6E78';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";
const SHADOW = '0 0 1px rgba(0,0,0,.9), 0 2px 4px rgba(0,0,0,.6)';

/* ── geometry (1920 × 1080) ── */
const ARCH = { w: 1100, h: 540, top: 110, domeRy: 300 };
const ARCH_X = (1920 - ARCH.w) / 2;
const BAND = { w: 1360, h: 124, top: ARCH.top + ARCH.h };
const MEDAL = 196; // tree-ring medallions holding the team totals
const MEDAL_CY = ARCH.top + ARCH.h - 150; // against the arch's sides, clear of the band
const MEDAL_OUT = 40; // how far the medallion's centre sits outside the arch
const TILE = { w: 316, h: 84, gap: 18, top: BAND.top + BAND.h + 28 }; // slim player bars
const CHAMFER = 30;
const ARCH_RADIUS = `${ARCH.w / 2}px ${ARCH.w / 2}px 0 0 / ${ARCH.domeRy}px ${ARCH.domeRy}px 0 0`;

/** White logo plate — traced from Layer_2.png (same as the other overlays). */
const PLATE_CUT =
  'polygon(4% 0%, 82.9% 0%, 99.7% 77.7%, 82.6% 53.1%, 92.8% 100%, 10.2% 96%, 0.3% 46.9%, 18.2% 74.1%)';

const masked = (layers: string[]): React.CSSProperties => ({
  WebkitMaskImage: layers.join(', '),
  maskImage: layers.join(', '),
  WebkitMaskComposite: layers.map(() => 'source-in').join(', '),
  maskComposite: 'intersect',
});

/* ── motion (ms) ── */
const STEP_MS = 650;
const HOLD = 400; // the grove holds before the canopy
const steps = (at: number) => ({ s1: at, s2: at + STEP_MS + HOLD, s3: at + STEP_MS * 2 + HOLD - 100 });
const T_ARCH = 60;
const T_PLAYERS = steps(T_ARCH).s3 + 350;
const T_VINES = steps(T_ARCH).s3 + STEP_MS + 150;
const T_BAND = steps(T_ARCH).s3 + 250;
const T_MEDALS = steps(T_ARCH).s3 - 200;
const T_TILES = T_BAND + 700;
const TILE_STAGGER = 180;
const TILE_RISE_MS = 800;

/* ── dummy winner for the preview button ── */
const DEMO_TEAM: Team = {
  _id: 'demo',
  teamName: 'DUMMY ESPORTS',
  teamTag: 'DMY',
  placePoints: 10,
  teamLogo: '/def_logo.png',
  players: [
    { _id: 'd1', playerName: 'VIPER', killNum: 6, damage: 812, assists: 2, bHasDied: false },
    { _id: 'd2', playerName: 'SHADOW', killNum: 4, damage: 655, assists: 3, bHasDied: false },
    { _id: 'd3', playerName: 'KRYPTO', killNum: 2, damage: 401, assists: 5, bHasDied: true },
    { _id: 'd4', playerName: 'NEXUS', killNum: 3, damage: 520, assists: 1, bHasDied: false },
  ],
};

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
const num = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};

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
    side: [css(mix(p, WHITE_RGB, 0.05)), css(mix(dp, BLACK, 0.35)), css(mix(dp, BLACK, 0.88))],
    sceneGlow: rgba(mix(s, WHITE_RGB, 0.35), 0.85),
    sceneMid: css(mix(p, BLACK, 0.12)),
    sceneDeep: css(mix(dp, BLACK, 0.85)),
    pineBack: css(mix(dp, BLACK, 0.6)),
    pineFront: css(mix(dp, BLACK, 0.84)),
    frame: [css(mix(s, WHITE_RGB, 0.35)), secondary, css(mix(s, BLACK, 0.45))],
    label: lum(s) < 0.35 ? css(mix(s, WHITE_RGB, 0.45)) : secondary,
    labelInk: inkOn(secondary),
    leafP: leaf(mix(p, MOSS, 0.15)),
    leafS: leaf(mix(s, MOSS, 0.15)),
    leafM: leaf(mix(mix(p, s, 0.5), MOSS, 0.4)),
    vineA: { dark: css(mix(vineBase, BLACK, 0.72)), mid: css(mix(vineBase, BLACK, 0.12)), light: css(mix(s, WHITE_RGB, 0.6)) },
  };
}
type ForestPalette = ReturnType<typeof forestPalette>;
type VineCol = ForestPalette['vineA'];
type Tone = 'P' | 'S' | 'M';
const ForestCtx = createContext<{ pal: ForestPalette; gid: string }>({ pal: forestPalette('#2E7D4A', '#C9A24A'), gid: 'fw' });

const GRAIN =
  'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 4px), ' +
  'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 11px)';
const wood = (pair: string[]) => `${GRAIN}, linear-gradient(180deg, ${pair[0]}, ${pair[1]})`;

/* ── hooks ── */
/** flip `on` to true after `ms` (two frames later, so the start state paints first); resets on `key` */
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

/** number counts up 0 → n once `active` turns true */
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

const Unfurl = ({ on, delay, origin = '0% 50%', children }: { on: boolean; delay: number; origin?: string; children: React.ReactNode }) => (
  <g
    style={{
      transformBox: 'fill-box',
      transformOrigin: origin,
      transform: on ? 'scale(1)' : 'scale(0)',
      transition: on ? `transform 420ms cubic-bezier(.3,1.6,.5,1) ${delay}ms` : 'none',
    }}
  >
    {children}
  </g>
);

/* ─────────────────────────────────────────────
   Reveal — one step of a three-step sequence. Direction decides where it
   grows from; a fringe of leaves rides the moving edge(s).
   ───────────────────────────────────────────── */
type Dir = 'up' | 'fromLeft' | 'fromRight' | 'center';
const CLOSED: Record<Dir, string> = {
  up: 'inset(100% 0 0 0)',
  fromLeft: 'inset(0 100% 0 0)',
  fromRight: 'inset(0 0 0 100%)',
  center: 'inset(0 50% 0 50%)',
};

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

const Reveal: React.FC<{ open: boolean; dir: Dir; w: number; h: number; fringe: Tone; children: React.ReactNode }> = ({ open, dir, w, h, fringe, children }) => {
  const ease = 'cubic-bezier(.65,0,.25,1)';
  const refs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  useEffect(() => {
    if (!open) return;
    refs.forEach((r) => r.current?.animate?.([{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: STEP_MS, easing: 'linear' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const tr = (prop: string) => `${prop} ${STEP_MS}ms ${ease}`;
  const fringeBase: React.CSSProperties = { position: 'absolute', opacity: 0, zIndex: 8, pointerEvents: 'none' };
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, clipPath: open ? 'inset(0 0 0 0)' : CLOSED[dir], transition: tr('clip-path') }}>{children}</div>
      {dir === 'up' && (
        <div ref={refs[0]} style={{ ...fringeBase, left: 0, top: open ? '0%' : '100%', transform: 'translateY(-50%)', transition: tr('top') }}>
          <FringeH w={w} tone={fringe} />
        </div>
      )}
      {(dir === 'fromLeft' || dir === 'fromRight') && (
        <div
          ref={refs[0]}
          style={{
            ...fringeBase,
            top: 0,
            left: dir === 'fromLeft' ? (open ? '100%' : '0%') : open ? '0%' : '100%',
            transform: 'translateX(-50%)',
            transition: tr('left'),
          }}
        >
          <FringeV h={h} tone={fringe} />
        </div>
      )}
      {dir === 'center' &&
        [0, 1].map((k) => (
          <div key={k} ref={refs[k]} style={{ ...fringeBase, top: 0, left: open ? (k ? '100%' : '0%') : '50%', transform: 'translateX(-50%)', transition: tr('left') }}>
            <FringeV h={h} tone={fringe} />
          </div>
        ))}
    </>
  );
};

/** Steps 1 and 2 (grove + canopy) shared by every block; step 3 is the block's own content. */
const ThreeSteps: React.FC<{
  at: number;
  run: unknown;
  dir: Dir;
  w: number;
  h: number;
  groveContent?: (on: boolean) => React.ReactNode;
  children: (on: boolean) => React.ReactNode;
}> = ({ at, run, dir, w, h, groveContent, children }) => {
  const { pal } = useContext(ForestCtx);
  const t = steps(at);
  const s1 = useAfter(t.s1, run);
  const s2 = useAfter(t.s2, run);
  const s3 = useAfter(t.s3, run);
  return (
    <>
      <Reveal open={s1} dir={dir} w={w} h={h} fringe="M">
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `${GRAIN}, radial-gradient(ellipse 50% 50% at 50% 50%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {groveContent?.(s1)}
        </div>
      </Reveal>
      <Reveal open={s2} dir={dir} w={w} h={h} fringe="S">
        <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(150deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})` }} />
      </Reveal>
      <Reveal open={s3} dir={dir} w={w} h={h} fringe="P">
        {children(s3)}
      </Reveal>
    </>
  );
};

/* ─────────────────────────────────────────────
   Small pieces
   ───────────────────────────────────────────── */
const LogoPlate = ({ team, w, h }: { team: Team; w: number; h: number }) => (
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
      <TeamLogo logo={team.teamLogo} flag={team.teamFlag} fallback={'/def_logo.png'} alt={team.teamTag} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
    </div>
  </div>
);

const Crown = ({ color, size = 18 }: { color: string; size?: number }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
    <rect x="6" y="27" width="28" height="3" fill={color} />
  </svg>
);

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
const ARCH_PINES_BACK = pines(ARCH.w, ARCH.h, 11, 160, 290, 2.3);
const ARCH_PINES_FRONT = pines(ARCH.w, ARCH.h, 9, 90, 170, 4.1);

/* ─────────────────────────────────────────────
   Vine around the dome: up the left side, over the arch, down the right.
   Each dip inside the frame alternates in front / behind.
   ───────────────────────────────────────────── */
type Pt = [number, number];
const SEG_MS = 55;
const ARCH_VINE = (() => {
  const nodes: { p: Pt; ang: number; inner: boolean }[] = [];
  const cx = ARCH.w / 2;
  const cy = ARCH.domeRy;
  const rx = ARCH.w / 2;
  const ry = ARCH.domeRy;
  let inner = false;
  const push = (x: number, y: number, ang: number) => {
    nodes.push({ p: [x, y], ang, inner });
    inner = !inner;
  };
  for (let y = ARCH.h - 30; y > cy; y -= 48) push(inner ? 10 : -12, y, 180);
  for (let a = 180; a <= 360.01; a += 9) {
    const rad = (a * Math.PI) / 180;
    const off = inner ? -10 : 12;
    push(cx + (rx + off) * Math.cos(rad), cy + (ry + off) * Math.sin(rad), a);
  }
  for (let y = cy + 40; y < ARCH.h - 20; y += 48) push(ARCH.w + (inner ? -10 : 12), y, 0);

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
    .map(({ n, i }) => ({ x: n.p[0], y: n.p[1], r: n.ang + ((i * 37) % 44) - 22, s: 0.55 + ((i * 13) % 16) / 100, tone: tones[i % 3], i }));
  // crown at the top of the dome
  const topIdx = nodes.reduce((best, n, i) => (n.p[1] < nodes[best].p[1] ? i : best), 0);
  return { segs, leaves, topIdx };
})();

const ArchVine = ({ on, front }: { on: boolean; front: boolean }) => {
  const { pal, gid } = useContext(ForestCtx);
  const PAD = 60;
  // grow from both bottoms toward the top: delay by distance (in segments) from the nearer end
  const n = ARCH_VINE.segs.length;
  const delayOf = (i: number) => Math.min(i, n - 1 - i) * SEG_MS;
  return (
    <svg
      width={ARCH.w + PAD * 2}
      height={ARCH.h + PAD * 2}
      viewBox={`${-PAD} ${-PAD} ${ARCH.w + PAD * 2} ${ARCH.h + PAD * 2}`}
      style={{ position: 'absolute', left: -PAD, top: -PAD, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 6 : 0 }}
      aria-hidden
    >
      <g filter={`url(#${gid}-shadow)`}>
        {ARCH_VINE.segs
          .filter((s) => s.front === front)
          .map((s) => (
            <GrowSeg key={s.i} d={s.d} w={8} col={pal.vineA} on={on} delay={delayOf(s.i)} dur={SEG_MS + 25} />
          ))}
        {front &&
          ARCH_VINE.leaves.map((l, k) => (
            <g key={k} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r.toFixed(1)}) scale(${l.s.toFixed(2)})`}>
              <Unfurl on={on} delay={delayOf(Math.min(l.i, n - 1)) + 60}>
                <LeafShape tone={l.tone} />
              </Unfurl>
            </g>
          ))}
        {front && (
          <g transform={`translate(${ARCH.w / 2},-14)`}>
            {[-150, -115, -90, -65, -30].map((r, i) => (
              <g key={i} transform={`rotate(${r}) scale(${i === 2 ? 1 : 0.8})`}>
                <Unfurl on={on} delay={(n / 2) * SEG_MS + i * 70}>
                  <LeafShape tone={(['P', 'M', 'S', 'M', 'P'] as Tone[])[i]} />
                </Unfurl>
              </g>
            ))}
          </g>
        )}
      </g>
    </svg>
  );
};

/* ─────────────────────────────────────────────
   Blocks
   ───────────────────────────────────────────── */
const ArchStage: React.FC<{ team: Team; players: Player[]; mvpId: string | null; run: unknown }> = ({ team, players, mvpId, run }) => {
  const { pal } = useContext(ForestCtx);
  const up = useAfter(T_PLAYERS, run);
  const vines = useAfter(T_VINES, run);
  const n = players.length;
  const spacing = 230;
  const photoW = 320;

  return (
    <div style={{ position: 'absolute', left: ARCH_X, top: ARCH.top, width: ARCH.w, height: ARCH.h }}>
      <ArchVine on={vines} front={false} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, filter: 'drop-shadow(0 20px 36px rgba(0,0,0,.45))' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: ARCH_RADIUS, overflow: 'hidden' }}>
          <ThreeSteps
            at={T_ARCH}
            run={run}
            dir="up"
            w={ARCH.w}
            h={ARCH.h}
            groveContent={(on) => (
              <div style={{ transform: on ? 'scale(1)' : 'scale(.6)', opacity: on ? 1 : 0, transition: `transform 520ms cubic-bezier(.34,1.56,.64,1) ${STEP_MS * 0.5}ms, opacity 250ms linear ${STEP_MS * 0.5}ms` }}>
                <LogoPlate team={team} w={300} h={180} />
              </div>
            )}
          >
            {() => (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(ellipse 55% 60% at 50% 30%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.sceneMid} 0%, ${pal.sceneDeep} 100%)`,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(105deg, transparent 18%, rgba(255,255,255,.10) 23%, transparent 29%, transparent 46%, rgba(255,255,255,.08) 51%, transparent 57%, transparent 70%, rgba(255,255,255,.07) 74%, transparent 80%)',
                  }}
                />
                <svg width={ARCH.w} height={ARCH.h} viewBox={`0 0 ${ARCH.w} ${ARCH.h}`} style={{ position: 'absolute', left: 0, top: 0 }} aria-hidden>
                  <path d={ARCH_PINES_BACK} fill={pal.pineBack} opacity={0.5} />
                  <path d={ARCH_PINES_FRONT} fill={pal.pineFront} opacity={0.75} />
                </svg>
                {/* team logo blended into the canopy */}
                <div style={{ position: 'absolute', left: '50%', top: 36, width: 280, height: 280, transform: 'translateX(-50%)', opacity: 0.16, mixBlendMode: 'luminosity', filter: 'grayscale(1) contrast(1.2)' }}>
                  <TeamLogo logo={team.teamLogo} flag={team.teamFlag} fallback={'/def_logo.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                {/* the squad, standing together; the MVP a step forward */}
                {players.map((p, i) => {
                  const mvp = p._id === mvpId;
                  const cx = ARCH.w / 2 + (i - (n - 1) / 2) * spacing;
                  return (
                    <img
                      key={p._id || i}
                      src={playerPhoto(p.picUrl) || '/def_char.avif'}
                      alt={p.playerName}
                      style={{
                        position: 'absolute',
                        left: cx - photoW / 2,
                        bottom: 0,
                        width: photoW,
                        height: ARCH.h - (mvp ? 70 : 100),
                        objectFit: 'contain',
                        objectPosition: 'bottom center',
                        zIndex: mvp ? 3 : 1 + (i % 2),
                        filter: `drop-shadow(0 8px 16px rgba(0,0,0,.55))${mvp ? ` drop-shadow(0 0 18px ${pal.sceneGlow})` : ''}`,
                        transform: up ? 'none' : 'translateY(70px)',
                        opacity: up ? 1 : 0,
                        transition: `transform 700ms cubic-bezier(.2,.8,.2,1) ${i * 120}ms, opacity 300ms linear ${i * 120}ms`,
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/def_char.avif';
                      }}
                    />
                  );
                })}
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 90, zIndex: 4, background: `linear-gradient(180deg, rgba(0,0,0,0), ${pal.sceneDeep})` }} />
              </div>
            )}
          </ThreeSteps>
        </div>
        {/* bevelled dome frame */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: ARCH_RADIUS,
            padding: 6,
            background: `linear-gradient(160deg, ${pal.frame[0]}, ${pal.frame[1]} 40%, ${pal.frame[2]})`,
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            pointerEvents: 'none',
          }}
        />
      </div>
      <ArchVine on={vines} front />
    </div>
  );
};

/** Team total on a tree-ring medallion; grows up in three steps. */
const Medallion: React.FC<{ side: 'left' | 'right'; label: string; value: number; run: unknown }> = ({ side, label, value, run }) => {
  const { pal } = useContext(ForestCtx);
  const cx = side === 'left' ? ARCH_X - MEDAL_OUT : ARCH_X + ARCH.w + MEDAL_OUT;
  const t = steps(T_MEDALS);
  const settled = useAfter(t.s3 + 250, run);
  const v = useCountUp(value, settled, 900);
  const digits = String(value).length;
  const size = digits <= 2 ? 78 : digits === 3 ? 64 : 52;
  return (
    <div
      style={{
        position: 'absolute',
        left: cx - MEDAL / 2,
        top: MEDAL_CY - MEDAL / 2,
        width: MEDAL,
        height: MEDAL,
        zIndex: 7,
        filter: 'drop-shadow(0 12px 22px rgba(0,0,0,.5))',
        fontFamily: FONT,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden' }}>
        <ThreeSteps at={T_MEDALS} run={run} dir="up" w={MEDAL} h={MEDAL}>
          {() => (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `repeating-radial-gradient(circle, rgba(0,0,0,.16) 0px, rgba(0,0,0,.16) 1px, transparent 1px, transparent 7px),
                             radial-gradient(circle at 40% 32%, ${pal.side[0]} 0%, ${pal.side[1]} 55%, ${pal.side[2]} 100%)`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: WHITE,
                textShadow: SHADOW,
              }}
            >
              <span style={{ background: WHITE, color: INK, padding: '5px 12px 4px', fontSize: 17, letterSpacing: '0.22em', textShadow: 'none', clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}>
                {label}
              </span>
              <span style={{ fontSize: size, marginTop: 8, fontVariantNumeric: 'tabular-nums', lineHeight: 0.9 }}>{v}</span>
              <span style={{ marginTop: 6, fontSize: 12, letterSpacing: '0.28em', color: pal.label }}>TEAM TOTAL</span>
            </div>
          )}
        </ThreeSteps>
      </div>
      {/* bevelled ring */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          padding: 6,
          background: `linear-gradient(160deg, ${pal.frame[0]}, ${pal.frame[1]} 40%, ${pal.frame[2]})`,
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.4)',
          pointerEvents: 'none',
        }}
      />
      {/* two leaves tucked under the medallion */}
      <svg width={MEDAL} height={MEDAL} viewBox={`0 0 ${MEDAL} ${MEDAL}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} aria-hidden>
        {[side === 'left' ? 150 : 30, side === 'left' ? 120 : 60].map((r, i) => (
          <g key={i} transform={`translate(${MEDAL / 2 + Math.cos((r * Math.PI) / 180) * (MEDAL / 2 - 6)},${MEDAL / 2 + Math.sin((r * Math.PI) / 180) * (MEDAL / 2 - 6)}) rotate(${r}) scale(${i ? 0.55 : 0.7})`}>
            <Unfurl on={settled} delay={150 + i * 100}>
              <LeafShape tone={i ? 'S' : 'P'} />
            </Unfurl>
          </g>
        ))}
      </svg>
    </div>
  );
};

const WinnerBand: React.FC<{ team: Team; context: string; run: unknown }> = ({ team, context, run }) => {
  const { pal } = useContext(ForestCtx);
  const s1 = useAfter(T_BAND, run);
  const s2 = useAfter(T_BAND + 260, run);
  const s3 = useAfter(T_BAND + 520, run);
  const name = (team.teamName || team.teamTag || '').toUpperCase();
  const nameSize = name.length <= 14 ? 66 : name.length <= 20 ? 54 : name.length <= 26 ? 44 : 36;
  const shape = `polygon(${CHAMFER}px 0, calc(100% - ${CHAMFER}px) 0, 100% ${CHAMFER}px, 100% 100%, 0 100%, 0 ${CHAMFER}px)`;
  const holes = [
    `radial-gradient(circle at 0 70%, transparent 14px, #000 15px)`,
    `radial-gradient(circle at 100% 70%, transparent 14px, #000 15px)`,
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: (1920 - BAND.w) / 2,
        top: BAND.top,
        width: BAND.w,
        height: BAND.h,
        zIndex: 5,
        filter: 'drop-shadow(0 14px 26px rgba(0,0,0,.45))',
        fontFamily: FONT,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, clipPath: shape, ...masked(holes) }}>
        <Reveal open={s1} dir="center" w={BAND.w} h={BAND.h} fringe="M">
          <div style={{ position: 'absolute', inset: 0, background: wood(pal.grove) }} />
        </Reveal>
        <Reveal open={s2} dir="center" w={BAND.w} h={BAND.h} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(90deg, ${pal.canopy[2]}, ${pal.canopy[1]} 50%, ${pal.canopy[2]})` }} />
        </Reveal>
        <Reveal open={s3} dir="center" w={BAND.w} h={BAND.h} fringe="P">
          <div style={{ position: 'absolute', inset: 0, background: wood(pal.black) }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary}, ${pal.primary})` }} />
            {/* centre: eyebrow + team name */}
            <div style={{ position: 'absolute', left: 270, right: 340, top: 0, bottom: 6, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 20, letterSpacing: '0.3em', color: pal.label, transform: s3 ? 'none' : 'translateY(10px)', opacity: s3 ? 1 : 0, transition: 'all 400ms ease 250ms' }}>
                WINNER WINNER CHICKEN DINNER
              </div>
              <div
                style={{
                  fontSize: nameSize,
                  color: WHITE,
                  marginTop: 8,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textShadow: SHADOW,
                  transform: s3 ? 'none' : 'translateY(14px)',
                  opacity: s3 ? 1 : 0,
                  transition: 'all 450ms cubic-bezier(.2,.8,.2,1) 350ms',
                }}
              >
                {name}
              </div>
            </div>
            {/* right: context, white tab */}
            {context && (
              <div
                style={{
                  position: 'absolute',
                  right: 48,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  maxWidth: 290,
                  background: WHITE,
                  color: INK,
                  padding: '9px 20px 8px 24px',
                  fontSize: 19,
                  letterSpacing: '0.16em',
                  lineHeight: 1.3,
                  textAlign: 'right',
                  whiteSpace: 'pre-line',
                  clipPath: 'polygon(14px 0, 100% 0, 100% 100%, 0 100%)',
                }}
              >
                {context}
              </div>
            )}
          </div>
        </Reveal>
      </div>
      {/* team logo on the white plate, breaking out of the band's top-left */}
      <div
        style={{
          position: 'absolute',
          left: 44,
          top: -40,
          zIndex: 9,
          transform: s3 ? 'none' : 'translateY(-40px) scale(.7)',
          opacity: s3 ? 1 : 0,
          transition: 'transform 560ms cubic-bezier(.34,1.56,.64,1) 200ms, opacity 250ms linear 200ms',
        }}
      >
        <LogoPlate team={team} w={200} h={120} />
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; on: boolean; delay: number; strong?: boolean }> = ({ label, value, on, delay, strong }) => {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!on) return setGo(false);
    const t = window.setTimeout(() => setGo(true), delay);
    return () => clearTimeout(t);
  }, [on, delay]);
  const v = useCountUp(value, go, 700);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ fontSize: strong ? 30 : 26, color: INK, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
      <span style={{ fontSize: 13, letterSpacing: '0.16em', color: DIM }}>{label}</span>
    </span>
  );
};

/** Slim two-line bar: black name strip over a white stats line. */
const PlayerTile: React.FC<{ player: Player; mvp: boolean; index: number; left: number; run: unknown }> = ({ player, mvp, index, left, run }) => {
  const { pal, gid } = useContext(ForestCtx);
  const at = T_TILES + index * TILE_STAGGER;
  const up = useAfter(at, run);
  const landed = useAfter(at + TILE_RISE_MS - 150, run);
  const name = (player.playerName || '').toUpperCase();
  const nameSize = name.length <= 10 ? 24 : name.length <= 14 ? 21 : 18;
  const NAME_H = 36;
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: TILE.top,
        width: TILE.w,
        height: TILE.h,
        transform: up ? 'none' : `translateY(${1080 - TILE.top + 40}px)`,
        transition: `transform ${TILE_RISE_MS}ms cubic-bezier(.16,1,.3,1)`,
        filter: 'drop-shadow(0 10px 18px rgba(0,0,0,.4))',
        fontFamily: FONT,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, clipPath: `polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px))` }}>
        {/* name strip — black */}
        <div style={{ height: NAME_H, background: wood(pal.black), display: 'flex', alignItems: 'center', gap: 10, padding: '0 26px 0 16px' }}>
          {mvp && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: pal.label, color: pal.labelInk, padding: '3px 7px 2px', fontSize: 13, letterSpacing: '0.12em', flex: 'none' }}>
              <Crown color={pal.labelInk} size={13} />
              MVP
            </span>
          )}
          <span style={{ fontSize: nameSize, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: SHADOW }}>{name}</span>
        </div>
        {/* stats line — white */}
        <div
          style={{
            height: TILE.h - NAME_H,
            background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 60%, #ECECF0 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 22px 0 18px',
            position: 'relative',
          }}
        >
          <Stat label="KILLS" value={num(player.killNum)} on={landed} delay={0} strong />
          <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,.14)' }} />
          <Stat label="DMG" value={num(player.damage)} on={landed} delay={120} />
          <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,.14)' }} />
          <Stat label="AST" value={num(player.assists)} on={landed} delay={240} />
        </div>
        {/* theme-gradient edge */}
        <div style={{ position: 'absolute', left: 0, top: NAME_H, bottom: 0, width: 5, background: `linear-gradient(180deg, ${pal.primary}, ${pal.secondary})` }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: NAME_H, height: 3, background: mvp ? pal.label : `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />
      </div>
      {/* crown leaf on the MVP's bar */}
      {mvp && (
        <svg width={60} height={30} viewBox="-30 -24 60 30" style={{ position: 'absolute', right: 30, top: -18, overflow: 'visible' }} aria-hidden>
          <g filter={`url(#${gid}-shadow)`}>
            {[-150, -90, -30].map((r, i) => (
              <g key={i} transform={`rotate(${r}) scale(${i === 1 ? 0.6 : 0.48})`}>
                <Unfurl on={landed} delay={200 + i * 80}>
                  <LeafShape tone={i === 1 ? 'S' : 'P'} />
                </Unfurl>
              </g>
            ))}
          </g>
        </svg>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   WwcdStats
   ───────────────────────────────────────────── */
const WwcdStats: React.FC<WwcdSummaryProps> = ({ tournament, round, match, matchData }) => {
  const teamsWithTotals = useMemo(() => computeMatchStandings(matchData as any).filter((t: any) => t.wwcd), [matchData]);
  const realWinner = teamsWithTotals[0] as unknown as Team | undefined;

  const [run, setRun] = useState(0); // bump to replay
  const [demo, setDemo] = useState(false);

  const winner: Team | undefined = realWinner ?? (demo ? DEMO_TEAM : undefined);
  const winnerId = winner ? String(winner._id ?? winner.teamId ?? '') : '';
  const playKey = `${run}-${winnerId}`; // a new winner or a Preview replays everything

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fw' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  const players = (winner?.players ?? []).slice(0, 4);
  const totalKills = players.reduce((s, p) => s + num(p.killNum), 0);
  const totalDamage = players.reduce((s, p) => s + num(p.damage), 0);
  const mvpId = useMemo(() => {
    let best: Player | null = null;
    for (const p of players)
      if (!best || num(p.killNum) > num(best.killNum) || (num(p.killNum) === num(best.killNum) && num(p.damage) > num(best.damage))) best = p;
    return best && num(best.killNum) > 0 ? best._id : null;
  }, [players]);

  const day = round?.day || tournament.day || '';
  const matchLabel = match ? match.matchName || `MATCH ${String(match.matchNo ?? match._matchNo ?? '').padStart(2, '0')}` : '';
  // two clean lines for the band's white tab: "ROUND · DAY" over "MATCH"
  const context = [
    [round?.roundName, day ? (/^day/i.test(day) ? day : `DAY ${day}`) : ''].filter(Boolean).join('  ·  '),
    matchLabel,
  ]
    .filter(Boolean)
    .join('\n')
    .toUpperCase();

  const rowW = players.length * TILE.w + Math.max(0, players.length - 1) * TILE.gap;

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible' }}>
        <ForestDefs />

        {winner ? (
          <div key={playKey}>
            <ArchStage team={winner} players={players} mvpId={mvpId} run={playKey} />
            <WinnerBand team={winner} context={context} run={playKey} />
            <Medallion side="left" label="ELIMS" value={totalKills} run={playKey} />
            <Medallion side="right" label="DAMAGE" value={totalDamage} run={playKey} />
            {players.map((p, i) => (
              <PlayerTile key={p._id || i} player={p} mvp={p._id === mvpId} index={i} left={(1920 - rowW) / 2 + i * (TILE.w + TILE.gap)} run={playKey} />
            ))}
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
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: '0.14em',
                color: INK,
              }}
            >
              NO WWCD TEAM YET
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
            top: 188,
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
          ▶ PREVIEW WWCD
        </button>
      </div>
    </ForestCtx.Provider>
  );
};

export default WwcdStats;