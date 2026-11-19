import React, { useCallback, useEffect, useId, useMemo, useRef, useState, createContext, useContext } from 'react';
import { computeMatchTotals } from '../../shared/hooks/matchTotals';
/* FOREST — Match Summary (totals from computeMatchTotals, as before).

             ════ a 3D branch grows across the top ════
                   ║                          ║   (vine ropes)
                 ┌──────────── MATCH SUMMARY ───────────┐   hanging plank, swings in
                 └───── tournament · round · match ─────┘
     ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
     │ (◎) ELIMINATIONS│ │ (◎) ASSISTS     │ │ (◎) KNOCKOUTS   │
     │            128  │ │             61  │ │            154  │
     │  8.0 PER TEAM   │ │                 │ │                 │
     └─────────────────┘ └─────────────────┘ └─────────────────┘
       ~~~~ a vine weaves between the two rows, in front of / behind the tiles ~~~~
     └ VEHICLE KILLS ┘   └ GRENADE KILLS ┘   └ HEADSHOTS ┘

   Motion (state + CSS transitions only, so it always plays):
     heading: the branch draws itself across and leaves unfurl → the plank
       drops on its vine ropes and swings to rest → context tag slides out
     each tile opens UPWARD in three steps, each behind a fringe of leaves:
       1) grove — the stat icon in a tree-ring medallion
       2) canopy — theme gradient
       3) content — medallion settles left, the number counts up, per-team chip
     then: a vine weaves between the rows, a sprig curls over each tile's
       corner, and a few leaves keep drifting down the screen.
   PREVIEW: a "Preview summary" button OUTSIDE the 1920×1080 canvas replays the
   sequence (dummy totals when there is no data). */

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

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
}

interface Player {
  _id: string;
  playerName: string;
  killNum?: number;
  assists?: number;
  knockouts?: number;
  killNumInVehicle?: number;
  killNumByGrenade?: number;
  headShotNum?: number;
  damage?: number;
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
  players: Player[];
}

interface MatchData {
  _id: string;
  matchId: string;
  userId: string;
  teams: Team[];
}

interface MatchSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

type Totals = {
  totalEliminations: number;
  totalAssists: number;
  totalKnockouts: number;
  totalKillsInVehicle: number;
  totalKillsByGrenade: number;
  totalHeadshots: number;
};
type IconKey = 'elims' | 'assists' | 'knocks' | 'vehicle' | 'grenade' | 'headshot';

/* -------------------- Palette + type -------------------- */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";
const SHADOW = '0 0 1px rgba(0,0,0,.9), 0 2px 4px rgba(0,0,0,.6)';

/* -------------------- Geometry -------------------- */
const COLS = 3;
const TILE_W = 480;
const TILE_H = 270;
const COL_GAP = 30;
const ROW_GAP = 44;
const GRID_W = COLS * TILE_W + (COLS - 1) * COL_GAP;
const GRID_X = (1920 - GRID_W) / 2;
const GRID_TOP = 296;
const MID_Y = GRID_TOP + TILE_H + ROW_GAP / 2; // between the two rows
const CUT = 28;
const tileClip = `polygon(${CUT}px 0, 100% 0, 100% calc(100% - ${CUT}px), calc(100% - ${CUT}px) 100%, 0 100%, 0 ${CUT}px)`;
const BRANCH = { x1: 470, x2: 1450, y: 50 };
const ROPE = 46;
const PLANK_H = 104;

/* -------------------- Timeline (ms) -------------------- */
const STEP_MS = 620;
const T_BRANCH = 80;
const BRANCH_MS = 900;
const T_PLANK = 650;
const T_CONTEXT = 1350;
const T_TILES = 900;
const TILE_STAGGER = 170;
const STEP_HOLD = 320;
const tileTimes = (order: number) => {
  const s1 = T_TILES + order * TILE_STAGGER;
  const s2 = s1 + STEP_MS + STEP_HOLD;
  const s3 = s2 + STEP_MS - 120;
  return { s1, s2, s3, settled: s3 + STEP_MS * 0.55 };
};
const T_LAST = tileTimes(5).settled;
const T_MIDVINE = T_LAST - 300;
const T_SPRIGS = T_LAST + 100;
const T_DRIFT = T_LAST + 600;

const DEMO: Totals = {
  totalEliminations: 128,
  totalAssists: 61,
  totalKnockouts: 154,
  totalKillsInVehicle: 9,
  totalKillsByGrenade: 14,
  totalHeadshots: 37,
};
const DEMO_TEAMS = 16;

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

/* -------------------- Stat icons (24×24, currentColor) -------------------- */
const ICONS: Record<IconKey, React.ReactNode> = {
  // crosshair
  elims: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 1.5 V7 M12 17 V22.5 M1.5 12 H7 M17 12 H22.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </g>
  ),
  // two figures — teamwork
  assists: (
    <g fill="currentColor">
      <circle cx="8" cy="6.5" r="3.2" />
      <path d="M2 21 C2 15.5 4.6 12 8 12 C11.4 12 14 15.5 14 21 Z" />
      <circle cx="16.5" cy="7.5" r="2.7" opacity="0.7" />
      <path d="M12.8 21 C13 16.4 14.6 13 16.5 13 C19.4 13 22 16 22 21 Z" opacity="0.7" />
    </g>
  ),
  // knocked: figure down + arrow
  knocks: (
    <g fill="currentColor">
      <path d="M12 2 V11 M8 7.5 L12 11.5 L16 7.5" stroke="currentColor" strokeWidth="2.4" fill="none" />
      <circle cx="5" cy="17" r="2.6" />
      <path d="M8 15.4 H21 C22 15.4 22.6 16 22.6 17 C22.6 18 22 18.6 21 18.6 H8 Z" />
      <rect x="1.5" y="20.6" width="21" height="1.8" />
    </g>
  ),
  // car
  vehicle: (
    <g fill="currentColor">
      <path d="M5 11 L7.3 6.2 C7.6 5.5 8.3 5 9.1 5 H14.9 C15.7 5 16.4 5.5 16.7 6.2 L19 11 H20.5 C21.3 11 22 11.7 22 12.5 V17 H2 V12.5 C2 11.7 2.7 11 3.5 11 Z" />
      <path d="M7.4 10.6 L8.9 7 H15.1 L16.6 10.6 Z" fill={INK} fillOpacity={0.35} />
      <circle cx="6.5" cy="17.5" r="2.4" />
      <circle cx="17.5" cy="17.5" r="2.4" />
    </g>
  ),
  // grenade
  grenade: (
    <g fill="currentColor">
      <rect x="9" y="4.5" width="6" height="4" />
      <path d="M15 5 L19 3 L20 5 L15.5 7.5 Z" />
      <circle cx="7.5" cy="5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8 C7.2 8 5 11.5 5 15 C5 19 8.2 22 12 22 C15.8 22 19 19 19 15 C19 11.5 16.8 8 12 8 Z" />
    </g>
  ),
  // head in a reticle
  headshot: (
    <g>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 0.5 V4 M12 20 V23.5 M0.5 12 H4 M20 12 H23.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="9.8" r="3.3" fill="currentColor" />
      <path d="M6.6 18.4 C7.4 15.4 9.4 13.8 12 13.8 C14.6 13.8 16.6 15.4 17.4 18.4 Z" fill="currentColor" />
    </g>
  ),
};
const StatIcon = ({ k, size, color }: { k: IconKey; size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ color, display: 'block', flex: 'none' }} aria-hidden>
    {ICONS[k]}
  </svg>
);

/* -------------------- Tree-ring medallion (icon) -------------------- */
const Medallion: React.FC<{ k: IconKey; size: number; spin: boolean }> = ({ k, size, spin }) => {
  const { pal } = useContext(ForestCtx);
  const r = size / 2;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          boxShadow: `0 0 0 4px ${WHITE}, 0 0 0 7px rgba(0,0,0,.45), 0 8px 18px rgba(0,0,0,.5)`,
          background: `radial-gradient(circle at 50% 38%, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 55%),
                       repeating-radial-gradient(circle, rgba(0,0,0,.16) 0px, rgba(0,0,0,.16) 1.5px, transparent 1.5px, transparent ${Math.round(size / 14)}px),
                       radial-gradient(circle, ${pal.canopy[0]} 0%, ${pal.canopy[1]} 55%, ${pal.canopy[2]} 100%)`,
        }}
      />
      {/* turning tick ring */}
      <svg
        width={size}
        height={size}
        viewBox={`${-r} ${-r} ${size} ${size}`}
        style={{ position: 'absolute', inset: 0, transform: spin ? 'rotate(0deg)' : 'rotate(-120deg)', transition: 'transform 1400ms cubic-bezier(.2,.8,.2,1)' }}
        aria-hidden
      >
        <circle r={r - size * 0.09} fill="none" stroke={pal.label} strokeWidth={size * 0.035} strokeDasharray={`${size * 0.02} ${size * 0.06}`} opacity={0.9} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))' }}>
        <StatIcon k={k} size={size * 0.46} color={WHITE} />
      </div>
    </div>
  );
};

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

/* -------------------- Stat tile (three steps, opening upward) -------------------- */
const StatTile: React.FC<{ label: string; icon: IconKey; value: number; perTeam: number | null; order: number; run: number }> = ({
  label,
  icon,
  value,
  perTeam,
  order,
  run,
}) => {
  const { pal } = useContext(ForestCtx);
  const t = tileTimes(order);
  const s1 = useAfter(t.s1, run);
  const s2 = useAfter(t.s2, run);
  const s3 = useAfter(t.s3, run);
  const settled = useAfter(t.settled, run);
  const sprig = useAfter(T_SPRIGS + order * 140, run);
  const v = useCountUp(value, settled, 1100);
  const digits = String(value).length;
  const numSize = digits <= 3 ? 136 : digits === 4 ? 112 : 92;

  return (
    <div style={{ position: 'relative', width: TILE_W, height: TILE_H, flex: 'none', filter: 'drop-shadow(0 16px 30px rgba(0,0,0,.45))' }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: tileClip, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        {/* 1 — grove: the icon in a tree-ring medallion */}
        <Reveal open={s1} dir="up" w={TILE_W} h={TILE_H} fringe="M">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 45% 55% at 50% 45%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 18,
            }}
          >
            <div style={{ transform: s1 ? 'scale(1)' : 'scale(.5)', opacity: s1 ? 1 : 0, transition: `transform 560ms cubic-bezier(.34,1.56,.64,1) ${STEP_MS * 0.5}ms, opacity 200ms linear ${STEP_MS * 0.5}ms` }}>
              <Medallion k={icon} size={130} spin={s1} />
            </div>
            <span style={{ fontSize: 22, letterSpacing: '0.3em', paddingLeft: '0.3em', color: WHITE, textShadow: SHADOW }}>{label}</span>
          </div>
        </Reveal>
        {/* 2 — canopy: theme gradient */}
        <Reveal open={s2} dir="up" w={TILE_W} h={TILE_H} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(125deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})` }} />
        </Reveal>
        {/* 3 — content */}
        <Reveal open={s3} dir="up" w={TILE_W} h={TILE_H} fringe="P">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 60% 70% at 100% 100%, ${pal.sceneGlow.replace(/[\d.]+\)$/, '0.28)')} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})`,
            }}
          >
            {/* theme-gradient rail along the left edge */}
            <div style={{ position: 'absolute', left: 0, top: CUT, bottom: 0, width: 8, background: `linear-gradient(180deg, ${pal.secondary}, ${pal.primary})` }} />
            {/* header: medallion + label */}
            <div
              style={{
                position: 'absolute',
                left: 30,
                right: 24,
                top: 26,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                transform: settled ? 'none' : 'translateX(-16px)',
                opacity: settled ? 1 : 0,
                transition: 'transform 480ms cubic-bezier(.2,.8,.2,1), opacity 250ms linear',
              }}
            >
              <Medallion k={icon} size={64} spin={settled} />
              <div>
                <div style={{ fontSize: 26, letterSpacing: '0.18em', color: WHITE, whiteSpace: 'nowrap' }}>{label}</div>
                <div style={{ marginTop: 6, width: 90, height: 4, background: `linear-gradient(90deg, ${pal.label}, rgba(255,255,255,0))` }} />
              </div>
            </div>
            {/* per-team chip (white) */}
            {perTeam !== null && (
              <div
                style={{
                  position: 'absolute',
                  left: 30,
                  bottom: 30,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  padding: '8px 18px 7px 14px',
                  background: 'linear-gradient(180deg, #FFFFFF, #E6E6EC)',
                  color: INK,
                  clipPath: 'polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)',
                  opacity: settled ? 1 : 0,
                  transform: settled ? 'none' : 'translateY(10px)',
                  transition: 'opacity 250ms linear 500ms, transform 450ms cubic-bezier(.2,.8,.2,1) 500ms',
                }}
              >
                <span style={{ fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>{perTeam.toFixed(1)}</span>
                <span style={{ fontSize: 14, letterSpacing: '0.2em', color: '#55555E' }}>PER TEAM</span>
              </div>
            )}
            {/* big number */}
            <div
              style={{
                position: 'absolute',
                right: 40,
                bottom: 26,
                fontSize: numSize,
                lineHeight: 0.8,
                color: WHITE,
                fontVariantNumeric: 'tabular-nums',
                textShadow: `0 6px 18px rgba(0,0,0,.6), 0 0 ${settled ? 0 : 30}px ${pal.label}`,
                transform: settled ? 'scale(1)' : 'scale(.85)',
                transformOrigin: '100% 100%',
                transition: 'transform 600ms cubic-bezier(.34,1.56,.64,1), text-shadow 900ms ease',
              }}
            >
              {Math.round(v)}
            </div>
          </div>
        </Reveal>
      </div>
      {order < COLS && <Sprig on={sprig} />}
    </div>
  );
};

/* -------------------- Vine weaving between the rows -------------------- */
type Pt = [number, number];
const MID_VINE = (() => {
  const x0 = GRID_X - 60;
  const x1 = GRID_X + GRID_W + 60;
  const N = 16;
  const pts: Pt[] = Array.from({ length: N + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / N, MID_Y + (i % 2 === 0 ? -1 : 1) * (ROW_GAP / 2 + 4)]);
  const f = (n: number) => n.toFixed(1);
  const segs = pts.slice(0, -1).map((_, i) => {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    return {
      d: `M${f(p1[0])},${f(p1[1])} C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`,
      // a dip into a tile goes in front of one row, behind the other
      front: i % 2 === 0,
      i,
    };
  });
  const tones: Tone[] = ['P', 'M', 'S'];
  const leaves = pts
    .slice(1, -1)
    .map((p, k) => ({ p, i: k + 1 }))
    .map(({ p, i }) => ({ x: (p[0] + pts[i - 1][0]) / 2, y: (p[1] + pts[i - 1][1]) / 2, r: i % 4 === 1 ? -55 - (i % 3) * 15 : 125 + (i % 3) * 15, s: 0.6 + (i % 3) * 0.07, tone: tones[i % 3], i }));
  return { segs, leaves };
})();
const MID_SEG_MS = 85;

const MidVine: React.FC<{ on: boolean; front: boolean }> = ({ on, front }) => {
  const { pal, gid } = useContext(ForestCtx);
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 3 : 0 }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        {MID_VINE.segs
          .filter((s) => s.front === front)
          .map((s) => (
            <GrowStem key={s.i} d={s.d} w={9} col={pal.vineA} on={on} delay={s.i * MID_SEG_MS} dur={MID_SEG_MS + 25} ease="linear" />
          ))}
        {front &&
          MID_VINE.leaves.map((l, k) => (
            <g key={k} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r}) scale(${l.s.toFixed(2)})`}>
              <Unfurl on={on} delay={l.i * MID_SEG_MS + 60}>
                <LeafShape tone={l.tone} />
              </Unfurl>
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
              <Unfurl on={branch} delay={l.u * BRANCH_MS + 60}>
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
          transition: 'transform 1300ms cubic-bezier(.3,1.7,.45,1), opacity 200ms linear',
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
              MATCH SUMMARY
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
              transition: 'clip-path 600ms cubic-bezier(.65,0,.25,1)',
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

/* -------------------- Drifting leaves (light, after the intro) -------------------- */
const DRIFT = [
  { x: 120, s: 0.9, dur: 9000, delay: 0, sway: 70, t: 'P' as Tone },
  { x: 1780, s: 0.75, dur: 11000, delay: 1800, sway: -60, t: 'S' as Tone },
  { x: 380, s: 0.6, dur: 12500, delay: 4200, sway: 50, t: 'M' as Tone },
  { x: 1560, s: 0.85, dur: 10000, delay: 6000, sway: -80, t: 'P' as Tone },
  { x: 960, s: 0.55, dur: 13000, delay: 3000, sway: 60, t: 'S' as Tone },
  { x: 1240, s: 0.7, dur: 11500, delay: 8200, sway: -50, t: 'M' as Tone },
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
        { transform: `translate(0px, 1180px) rotate(540deg)`, opacity: 0 },
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

/* -------------------- MatchSummary -------------------- */
const MatchSummary: React.FC<MatchSummaryProps> = ({ tournament, round, match, matchData }) => {
  const realStats = useMemo(() => computeMatchTotals(matchData as any) as Totals | null, [matchData]);
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);
  const usingDemo = !(matchData && realStats) && demo;
  const stats: Totals | null = matchData && realStats ? realStats : demo ? DEMO : null;

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fs' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  const midVine = useAfter(T_MIDVINE, run);
  const drift = useAfter(T_DRIFT, run);

  const matchNo = match?.matchNo ?? match?._matchNo;
  const context = [
    tournament.tournamentName,
    round?.roundName,
    matchNo != null ? `MATCH ${String(matchNo).padStart(2, '0')}` : match?.matchName || '',
  ]
    .filter(Boolean)
    .join('  ·  ')
    .toUpperCase();

  const teamCount = usingDemo ? DEMO_TEAMS : matchData?.teams?.length || 0;
  const tiles: { label: string; icon: IconKey; value: number }[] = stats
    ? [
        { label: 'ELIMINATIONS', icon: 'elims', value: num(stats.totalEliminations) },
        { label: 'ASSISTS', icon: 'assists', value: num(stats.totalAssists) },
        { label: 'KNOCKOUTS', icon: 'knocks', value: num(stats.totalKnockouts) },
        { label: 'VEHICLE KILLS', icon: 'vehicle', value: num(stats.totalKillsInVehicle) },
        { label: 'GRENADE KILLS', icon: 'grenade', value: num(stats.totalKillsByGrenade) },
        { label: 'HEADSHOTS', icon: 'headshot', value: num(stats.totalHeadshots) },
      ]
    : [];

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
        <ForestDefs />
        {stats ? (
          <div key={`run-${run}`}>
            {/* drifting leaves, behind everything */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
              {DRIFT.map((d, i) => (
                <DriftLeaf key={i} d={d} on={drift} />
              ))}
            </div>

            <Heading run={run} context={context} />

            <MidVine on={midVine} front={false} />
            <div
              style={{
                position: 'absolute',
                left: GRID_X,
                top: GRID_TOP,
                width: GRID_W,
                display: 'flex',
                flexWrap: 'wrap',
                columnGap: COL_GAP,
                rowGap: ROW_GAP,
                zIndex: 1,
              }}
            >
              {tiles.map((t, i) => (
                <StatTile key={t.label} label={t.label} icon={t.icon} value={t.value} perTeam={teamCount > 0 ? t.value / teamCount : null} order={i} run={run} />
              ))}
            </div>
            <MidVine on={midVine} front />
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
            top: 412,
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
          ▶ PREVIEW SUMMARY
        </button>
      </div>
    </ForestCtx.Provider>
  );
};

export default MatchSummary;