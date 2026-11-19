import React, { useEffect, useId, useMemo, useRef, useState, createContext, useContext } from 'react';
import { pickStandingTeam } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';

/* FOREST — 2ND RUNNER-UP (same layout + motion as Champions.tsx).
   Featured team: pickStandingTeam(matchDatas, overallData, 2) — the team
   3rd in the overall standings (teamLogo / teamName / teamTag / wwcd /
   placePoints / totalKills / total / players[0..3]). Row 1 (the team
   directly above) gives the "BEHIND 2ND" gap; /chicken.png; the same
   empty-data guard; dummy data for preview.
   Generated from Champions.tsx — keep the two in step when the design changes.

          🌲🌲 🧍     🧍     🧍     🧍 🌲🌲  ← the four players, BIG, with a
                                             small pine forest just behind them
     ┌──────────────────────────────────────────────────────┐  ← the box sits
     │ [logo]  🏆 RUNNER-UP  │   ( donut )    │  🐔 WWCD   4  │    IN FRONT of
     │         DUMMY ESPORTS │  214 TOTAL PTS │  BEHIND -27   │    the players
     └──────────────────────────────────────────────────────┘
   The donut splits the champion's total into placement points (dark) and
   elims (yellow).

   Motion (state + CSS transitions only, so it always plays):
     a flash of light opens the scene and leaves spiral out of it · a big
     2ND RUNNER-UP + trophy slams in, holds, then lifts away · the players rise
     centre-out as dark silhouettes and light up into full colour · when the
     last one lands the scene gives a small punch ·
     a small pine forest grows up row by row behind the players (theme-tinted
     tips, mist between the rows), fireflies drift · the box opens in three steps behind a fringe of
     leaves: 1) grove (logo + 2ND RUNNER-UP) 2) canopy 3) content · the players
     rise behind the box, a burst of leaves flies out, the donut draws, the
     numbers count up, and a heavy fall of leaves keeps drifting down over
     the players.
   PREVIEW: "▶ PREVIEW 2ND RUNNER-UP" sits just BELOW the 1920×1080 canvas. It
   replays the sequence and uses dummy data when there is no overall data. */

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
  playerName: string;
  killNum?: number;
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
}

interface OverallData {
  tournamentId: string;
  roundId: string;
  userId: string;
  teams: Team[];
  createdAt: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface RunnerUpProps {
  tournament: Tournament;
  round?: Round | null;
  overallData?: OverallData | null;
  // PublicThemeRenderer may also pass matchData; only the event-wide
  // standings are needed here.
  matchData?: any;
  matchDatas?: MatchData[];
}

/* standings row as returned by pickStandingTeam (fields we read) */
interface StandingRow {
  teamName?: string;
  teamTag?: string;
  teamLogo?: string;
  teamFlag?: string;
  wwcd?: number;
  placePoints?: number;
  totalKills?: number;
  total?: number;
  leadOverNext?: number;
  players: Player[];
}

const DEF_PLAYER = '/def_char.avif'; /* fallback for missing player photo (not used for team logo) */

/* -------------------- Palette + type -------------------- */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const YELLOW = '#F5C518'; // donut: elims
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";
const SHADOW = '0 0 1px rgba(0,0,0,.9), 0 2px 4px rgba(0,0,0,.6)';

/** White logo plate — traced from Layer_2.png (same as the other overlays). */
const PLATE_CUT =
  'polygon(4% 0%, 82.9% 0%, 99.7% 77.7%, 82.6% 53.1%, 92.8% 100%, 10.2% 96%, 0.3% 46.9%, 18.2% 74.1%)';

/* -------------------- Geometry -------------------- */
const BOX = { x: 210, y: 730, w: 1500, h: 310 }; // the single stats box
const CX = 960; // centre of the scene
const PLAYERS_BOTTOM = BOX.y + 100; // the players stand BEHIND the box, which cuts them at the waist
const PHOTO_W = 440;
const PHOTO_H = 690;
const PHOTO_STEP = 320;
const CONTENT_TOP = 34; // box-local
const CUT = 28;
const chamfer = (c: number) => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

/* -------------------- Timeline (ms) -------------------- */
/** same pace as the other forest overlays (40% slower than the first cuts) */
const SLOW = 1.4;
const S = (ms: number) => Math.round(ms * SLOW);
const STEP_MS = S(620);
const STEP_HOLD = S(300);
const T_FLASH = S(60); // a flash of light opens the scene
const T_SWIRL = S(150); // leaves spiral out of it
const T_FOREST = S(250);
const T_TITLE_IN = S(550); // big 2ND RUNNER-UP slams in …
const T_TITLE_OUT = S(2300); // … and lifts away as the players appear
const BOX_S1 = S(1000);
const BOX_S2 = BOX_S1 + STEP_MS + STEP_HOLD;
const BOX_S3 = BOX_S2 + STEP_MS - S(120);
const T_CONTENT = BOX_S3 + Math.round(STEP_MS * 0.55);
const T_PLAYERS = T_TITLE_OUT + S(150);
const PLAYER_STAGGER = S(220);
const PLAYER_LIGHT = S(500); // silhouette → full colour
const T_BURST = T_PLAYERS + 3 * PLAYER_STAGGER + PLAYER_LIGHT + S(150);
const T_FALL = T_PLAYERS + S(500);
const T_FLIES = S(900);

/* ── dummy data for the preview button ── */
const DEMO_CHAMP: StandingRow = {
  teamName: 'APEX ROGUES',
  teamTag: 'APX',
  teamLogo: '/def_logo.png',
  wwcd: 1,
  placePoints: 79,
  totalKills: 92,
  total: 171,
  players: [
    { _id: 'd1', playerName: 'VIPER', killNum: 41 },
    { _id: 'd2', playerName: 'SHADOW', killNum: 33 },
    { _id: 'd3', playerName: 'KRYPTO', killNum: 19 },
    { _id: 'd4', playerName: 'NEXUS', killNum: 25 },
  ],
};
const DEMO_SECOND: StandingRow = { teamName: 'NOVA GAMING', teamTag: 'NOVA', teamLogo: '/def_logo.png', wwcd: 2, total: 187, players: [] };

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


/* -------------------- Icons -------------------- */
const Trophy = ({ color, size = 30 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ display: 'block', flex: 'none' }}>
    <path
      d="M11 4 H29 V14 C29 20 25 24 20 24 C15 24 11 20 11 14 Z M11 7 H4 V11 C4 16 7 19 11 19.5 V16.5 C8.5 16 7 14 7 11 V10 H11 Z M29 7 H36 V11 C36 16 33 19 29 19.5 V16.5 C31.5 16 33 14 33 11 V10 H29 Z M17.5 24 H22.5 V30 H27 V36 H13 V30 H17.5 Z"
      fill={color}
    />
  </svg>
);


/* -------------------- Forest behind the players -------------------- */
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
    if (sideOnly) x = i < n / 2 ? x0 + ((560 - x0) * (i + 0.5)) / (n / 2) : 1360 + ((x1 - 1360) * (i - n / 2 + 0.5)) / (n / 2);
    const h = hMin + rand(i, layer + 7) * (hMax - hMin);
    return { x, h, d: pinePath(x, FOREST_BASE + layer * 6, h), delay: S(layer * 260 + (Math.abs(x - 960) / 960) * 600) };
  });
const FOREST_LAYERS = [
  forestLayer(18, 330, 1590, 200, 300, 0),
  forestLayer(12, 350, 1570, 290, 410, 1),
  forestLayer(6, 300, 1620, 400, 520, 2, true),
];

const Forest: React.FC<{ run: number }> = ({ run }) => {
  const { pal, gid } = useContext(ForestCtx);
  const on = useAfter(T_FOREST, run);
  const flies = useAfter(T_FLIES, run);
  const ops = [0.6, 0.95, 1];
  // only behind the players: fade out well inside the box's width
  const fade = 'linear-gradient(90deg, transparent 280px, #000 430px, #000 1490px, transparent 1640px)';
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
const FIREFLIES = Array.from({ length: 16 }, (_, i) => ({
  x: 420 + rand(i, 21) * 1080,
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

/* -------------------- Heavy leaf fall over the players -------------------- */
const FALL = Array.from({ length: 46 }, (_, i) => ({
  x: 220 + rand(i, 3) * 1480,
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

/* -------------------- Players (big, standing on the box) -------------------- */
const ChampPhoto: React.FC<{ p: Player; left: number; h: number; z: number; at: number; run: number }> = ({ p, left, h, z, at, run }) => {
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

/* -------------------- Donut: total = placement + elims -------------------- */
const Donut: React.FC<{ place: number; kills: number; total: number; on: boolean }> = ({ place, kills, total, on }) => {
  const { pal } = useContext(ForestCtx);
  const R = 92;
  const SW = 30;
  const C = 2 * Math.PI * R;
  const sum = place + kills || 1;
  const GAP = 0.012;
  const segs = [
    { k: 'PLACEMENT', v: place, frac: place / sum, color: pal.canopy[1] },
    { k: 'ELIMS', v: kills, frac: kills / sum, color: YELLOW },
  ];
  const cTotal = useCountUp(total, on, S(1200));
  let acc = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
      <div style={{ position: 'relative', width: 2 * (R + SW), height: 2 * (R + SW), flex: 'none' }}>
        <svg width={2 * (R + SW)} height={2 * (R + SW)} viewBox={`${-(R + SW)} ${-(R + SW)} ${2 * (R + SW)} ${2 * (R + SW)}`} style={{ display: 'block' }} aria-hidden>
          <circle r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={SW} />
          {[R - SW / 2 - 12, R - SW / 2 - 24, R - SW / 2 - 36].map((rr, k) => (
            <circle key={k} r={rr} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={1.5} />
          ))}
          <g transform="rotate(-90)">
            {segs.map((s, i) => {
              const start = acc;
              acc += s.frac;
              const len = Math.max(0, s.frac - GAP) * C;
              return (
                <circle
                  key={s.k}
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={SW}
                  strokeDasharray={`${on ? len : 0} ${C}`}
                  strokeDashoffset={-start * C}
                  style={{ transition: `stroke-dasharray ${S(800)}ms cubic-bezier(.3,.8,.3,1) ${S(i * 300)}ms`, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))' }}
                />
              );
            })}
          </g>
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 72, lineHeight: 0.85, color: WHITE, fontVariantNumeric: 'tabular-nums', textShadow: SHADOW }}>{Math.round(cTotal)}</span>
          <span style={{ marginTop: 8, fontSize: 15, letterSpacing: '0.26em', paddingLeft: '0.26em', color: pal.label }}>TOTAL PTS</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {segs.map((s, i) => (
          <LegendRow key={s.k} label={s.k} value={s.v} pct={Math.round(s.frac * 100)} color={s.color} on={on} delay={i * 300} />
        ))}
      </div>
    </div>
  );
};

const LegendRow: React.FC<{ label: string; value: number; pct: number; color: string; on: boolean; delay: number }> = ({ label, value, pct, color, on, delay }) => {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!on) return setGo(false);
    const t = window.setTimeout(() => setGo(true), S(delay));
    return () => clearTimeout(t);
  }, [on, delay]);
  const v = useCountUp(value, go, S(900));
  return (
    <div style={{ opacity: go ? 1 : 0.2, transition: `opacity ${S(300)}ms linear` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, letterSpacing: '0.22em', color: 'rgba(255,255,255,.7)' }}>
        <span style={{ width: 14, height: 14, borderRadius: 4, background: color, flex: 'none' }} />
        {label}
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 48, color: WHITE, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>{Math.round(v)}</span>
        <span style={{ fontSize: 20, color: 'rgba(255,255,255,.6)' }}>{pct}%</span>
      </div>
    </div>
  );
};

/* -------------------- The single box -------------------- */
const StatsBox: React.FC<{ champ: StandingRow; lead: number; context: string; run: number; showLead: boolean }> = ({ champ, lead, context, run, showLead }) => {
  const { pal } = useContext(ForestCtx);
  const s1 = useAfter(BOX_S1, run);
  const s2 = useAfter(BOX_S2, run);
  const s3 = useAfter(BOX_S3, run);
  const on = useAfter(T_CONTENT, run);
  const wwcd = num(champ.wwcd);
  const cWwcd = useCountUp(wwcd, on, S(700));
  const cLead = useCountUp(lead, on, S(900));
  const name = (champ.teamName || champ.teamTag || '').toUpperCase();
  // up to two lines; shrink for long names
  const nameSize = name.length <= 9 ? 62 : name.length <= 16 ? 48 : name.length <= 24 ? 40 : 32;

  return (
    <div style={{ position: 'absolute', left: BOX.x, top: BOX.y, width: BOX.w, height: BOX.h, zIndex: 4, filter: 'drop-shadow(0 22px 40px rgba(0,0,0,.5))', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: chamfer(CUT) }}>
        {/* 1 — grove: logo + 2ND RUNNER-UP */}
        <Reveal open={s1} dir="fromLeft" w={BOX.w} h={BOX.h} fringe="M">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 35% 60% at 50% 60%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 40,
              paddingTop: 40,
              boxSizing: 'border-box',
            }}
          >
            <div style={pop(s1, 300)}>
              <LogoPlate p={champ} w={300} h={180} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 64, letterSpacing: '0.14em', color: WHITE, textShadow: SHADOW, ...rise(s1, 450) }}>
              <Trophy color={pal.label} size={60} /> 2ND RUNNER-UP
            </div>
          </div>
        </Reveal>
        {/* 2 — canopy */}
        <Reveal open={s2} dir="fromLeft" w={BOX.w} h={BOX.h} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(115deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})` }} />
        </Reveal>
        {/* 3 — content */}
        <Reveal open={s3} dir="fromLeft" w={BOX.w} h={BOX.h} fringe="P">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 40% 70% at 50% 0%, ${pal.sceneGlow.replace(/[\d.]+\)$/, '0.32)')} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})`,
            }}
          >
            <div style={{ position: 'absolute', left: CUT, right: 0, top: 0, height: 6, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />
            <div style={{ position: 'absolute', left: 50, right: 50, top: CONTENT_TOP, bottom: 30, display: 'flex', alignItems: 'center' }}>
              {/* identity */}
              <div style={{ flex: 1.4, minWidth: 0, display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={pop(on, 0)}>
                  <LogoPlate p={champ} w={170} h={102} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, letterSpacing: '0.3em', color: pal.label, ...rise(on, 100, 8) }}>
                    <Trophy color={pal.label} size={26} /> 2ND RUNNER-UP
                  </div>
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: nameSize,
                      lineHeight: 0.95,
                      color: WHITE,
                      maxHeight: nameSize * 0.95 * 2,
                      overflow: 'hidden',
                      textShadow: '0 4px 12px rgba(0,0,0,.6)',
                      clipPath: on ? 'inset(0 0 -10% 0)' : 'inset(0 100% -10% 0)',
                      transition: `clip-path ${S(750)}ms cubic-bezier(.65,0,.25,1) ${S(150)}ms`,
                    }}
                  >
                    {name}
                  </div>
                  {context && <div style={{ marginTop: 12, fontSize: 17, letterSpacing: '0.2em', color: 'rgba(255,255,255,.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...rise(on, 300, 8) }}>{context}</div>}
                </div>
              </div>
              <div style={{ width: 2, alignSelf: 'stretch', margin: '10px 36px', background: `linear-gradient(180deg, transparent, ${pal.label}, transparent)` }} />
              {/* donut */}
              <div style={{ flex: 'none' }}>
                <Donut place={num(champ.placePoints)} kills={num(champ.totalKills)} total={num(champ.total)} on={on} />
              </div>
              <div style={{ width: 2, alignSelf: 'stretch', margin: '10px 36px', background: `linear-gradient(180deg, transparent, ${pal.label}, transparent)` }} />
              {/* WWCD + lead */}
              <div style={{ flex: 0.75, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 20px',
                    background: 'linear-gradient(180deg, #FFFFFF, #E6E6EC)',
                    clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)',
                    ...rise(on, 400),
                  }}
                >
                  <img src="/chicken.png" alt="" style={{ width: 46, height: 46, maxWidth: 'none', objectFit: 'contain' }} />
                  <span style={{ fontSize: 18, letterSpacing: '0.22em', color: '#55555E' }}>WWCD</span>
                  <span style={{ marginLeft: 'auto', fontSize: 52, color: INK, fontVariantNumeric: 'tabular-nums' }}>{Math.round(cWwcd)}</span>
                </div>
                {showLead && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: '12px 22px 10px',
                      background: `linear-gradient(150deg, ${pal.canopy[0]}, ${pal.canopy[1]} 55%, ${pal.canopy[2]})`,
                      boxShadow: `inset 0 0 0 2px ${pal.label}`,
                      clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)',
                      ...rise(on, 520),
                    }}
                  >
                    <span style={{ fontSize: 15, letterSpacing: '0.2em', color: WHITE, whiteSpace: 'nowrap' }}>BEHIND 2ND</span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 46, lineHeight: 0.9, color: YELLOW, fontVariantNumeric: 'tabular-nums', textShadow: SHADOW }}>
                        {lead > 0 ? '−' : ''}
                        {Math.round(cLead)}
                      </span>
                      <span style={{ fontSize: 16, letterSpacing: '0.16em', color: WHITE }}>PTS</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
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

/** big 2ND RUNNER-UP slam: lands, holds, then lifts away as the players appear */
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
        <Trophy color={pal.label} size={110} />
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 132,
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
        2ND RUNNER-UP
      </div>
    </div>
  );
};

/* -------------------- Scene -------------------- */
const Scene: React.FC<{ champ: StandingRow; second: StandingRow | null; tournament: Tournament; round?: Round | null; run: number }> = ({ champ, second, tournament, round, run }) => {
  const players = (champ.players || []).slice(0, 4);
  const n = Math.max(1, players.length);
  const groupW = PHOTO_W + PHOTO_STEP * (n - 1);
  const x0 = CX - groupW / 2;
  const burst = useAfter(T_BURST, run);
  const fall = useAfter(T_FALL, run);
  const swirl = useAfter(T_SWIRL, run);
  // centre players first, then the outer ones
  const order = players.map((_, i) => i).sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b);
  const punch = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = punch.current;
    if (!burst || !el?.animate) return;
    const a = el.animate([{ transform: 'scale(1.025)' }, { transform: 'scale(.995)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: S(500), easing: 'ease-out' });
    return () => a.cancel();
  }, [burst]);
  const total = num(champ.total);
  // points behind the team directly above (row 1); never negative
  const lead = second ? Math.max(0, num(second.total) - total) : 0;
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
        {players.map((p, i) => {
          const mid = Math.abs(i - (n - 1) / 2);
          return <ChampPhoto key={p._id || i} p={p} left={x0 + i * PHOTO_STEP} h={PHOTO_H - mid * 40} z={10 - Math.round(mid * 2)} at={T_PLAYERS + order.indexOf(i) * PLAYER_STAGGER} run={run} />;
        })}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: FALL_H, overflow: 'hidden', zIndex: 11 }}>
          {FALL.map((d, i) => (
            <FallLeaf key={i} d={d} on={fall} />
          ))}
        </div>
      </div>
      <StatsBox champ={champ} lead={lead} context={context} run={run} showLead={!!second} />
    </div>
  );
};

const RANK = 2; // 3rd in the overall standings

const SecondRunnerUp: React.FC<RunnerUpProps> = ({ tournament, round, overallData, matchDatas = [] }) => {
  // Shared standings pick (Total Score primary). row 2 = 2nd runner-up;
  // carries total / totalKills / placePoints / wwcd plus the roster.
  const champion = useMemo(() => pickStandingTeam(matchDatas as any, overallData as any, RANK), [overallData, matchDatas]);
  // row 1 — the team directly above, for the "BEHIND 2ND" gap
  const second = useMemo(() => (overallData ? pickStandingTeam(matchDatas as any, overallData as any, RANK - 1) : null), [overallData, matchDatas]);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fc' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);

  const hasData = !!(overallData && champion);
  const useDemo = !hasData && demo;

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

  const champ = (useDemo ? DEMO_CHAMP : hasData ? champion : null) as StandingRow | null;
  const s2 = (useDemo ? DEMO_SECOND : second) as StandingRow | null;

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
        <ForestDefs />
        {champ ? (
          <div key={`scene-${run}-${useDemo ? 'demo' : 'live'}`}>
            <Scene champ={champ} second={s2} tournament={tournament} round={round} run={run} />
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, letterSpacing: '0.24em', color: 'rgba(255,255,255,.7)' }}>
            NO OVERALL DATA
          </div>
        )}

        {/* preview — BELOW the 1920×1080 canvas */}
        <button type="button" onClick={preview} style={btn}>
          ▶ PREVIEW 2ND RUNNER-UP
        </button>
      </div>
    </ForestCtx.Provider>
  );
};

export default SecondRunnerUp;