import React, { useEffect, useId, useMemo, useRef, useState, createContext, useContext } from 'react';
import {
  computeRankedStandings,
  compareOfficialStandings,
  RankedTeam,
} from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';

/* FOREST — Overall Standings.
   Data preserved: computeRankedStandings(matchDatas), or the overallData
   snapshot fallback sorted by compareOfficialStandings (rankChange null) —
   exactly as before. The leader's player photos come from the newest match
   that lists them (else the overall snapshot), kills summed across matches.

   ┌ LEADER BAND ───────────────────────────────────────────────────────────┐
   │ (1)👑 OVERALL LEADER  LEAD +27        🌲  🧍  🧍  🧍  🧍  🌲  ← players  │
   │ [logo] TEAM NAME                         (pop out above the band)      │
   │ [TOTAL 236] [WWCD 5] [PLACE 106] [ELIMS 130]                           │
   └~~~~~~~~~~~~~~~~~~ a vine weaves along the band's bottom ~~~~~~~~~~~~~~~┘
     OVERALL STANDINGS            tournament · round              ● ○  1/2
   ┌ # ▲▼ TEAM        WWCD PLACE ELIMS TOTAL ┐ ┌ # ▲▼ TEAM   …        TOTAL ┐
   │ 01 [logo] TEAM NAME   5   106   130 ▌236▐│ │ 11 …                       │
   │ …  (10 rows; 8 when there are pages)    │ │ …                          │
   └─────────────────────────────────────────┘ └────────────────────────────┘
   Paging: up to 20 teams → one page, 10 + 10. More than 20 → pages of 8 + 8
   that switch automatically.

   Motion (state + CSS transitions only, so it always plays) — three steps:
     the leader band and both table columns open in three steps, each behind
     a fringe of leaves: 1) grove (tournament logo) 2) canopy (theme
     gradient + leader logo / rank range) 3) content.
     Then the leader's players rise one by one, the band's numbers count up,
     a vine weaves along the band, and the rows wipe in one after another
     with a leaf riding each wipe. On a page switch (40% slower than the
     first cut) a vine snakes down through each column, the current rows wipe
     out one by one, the next page's rows wipe in behind the vine, and the
     vine fades away. Paging runs on one steady timer, so live data updates
     never hold a page.
   PREVIEW: "▶ PREVIEW STANDINGS" sits just BELOW the 1920×1080 canvas;
   replays the entrance (dummy 22 teams when there is no data). */

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
}

interface Player {
  _id: string;
  uId: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;
  damage?: string;
  survivalTime?: number;
  assists?: number;
  health: number;
  healthMax: number;
  liveState: number;
  rank?: number;
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
  totalKills?: number;
  totalScore?: number;
  rank?: number;
  rankChange?: number | null;
  totalPlacePoints?: number;
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
  matchNo?: number;
  teams: Team[];
}

interface OverAllDataProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matches?: Match[];
  matchDatas?: MatchData[];
}

/* a standings row as drawn */
interface Row {
  teamId: string;
  teamName?: string;
  teamTag?: string;
  teamLogo?: string;
  teamFlag?: string;
  totalKills?: number;
  totalPlacePoints?: number;
  totalScore?: number;
  wwcd?: number;
  rankChange?: number | null;
  rank?: number;
}

interface RosterPlayer {
  key: string;
  name: string;
  pic?: string;
  kills: number;
}

const DEF_PLAYER = '/def_char.avif';

/* -------------------- Palette + type -------------------- */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const UP = '#2BD46A';
const DOWN = '#FF4D57';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";
const SHADOW = '0 0 1px rgba(0,0,0,.9), 0 2px 4px rgba(0,0,0,.6)';

/** White logo plate — traced from Layer_2.png (same as the other overlays). */
const PLATE_CUT =
  'polygon(4% 0%, 82.9% 0%, 99.7% 77.7%, 82.6% 53.1%, 92.8% 100%, 10.2% 96%, 0.3% 46.9%, 18.2% 74.1%)';

/* -------------------- Geometry -------------------- */
const BAND = { x: 60, y: 70, w: 1800, h: 320 }; // leader band
const INFO_W = 900; // band-local: identity + chips on the left; players on the right
const STRIP_Y = 414; // OVERALL STANDINGS strip
const STRIP_H = 50;
const COLS_Y = 474;
const COLS_BOTTOM = 1046;
const COL_GAP = 20;
const COL_W = (BAND.w - COL_GAP) / 2; // 890
const COL_HEAD_H = 34;
const ROW_GAP = 6;
const CUT = 24;
const chamfer = (c: number) => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;
/* table columns */
const C = { rank: 72, chg: 58, logo: 86, wwcd: 74, place: 86, elims: 86, total: 116 };

/* -------------------- Timeline (ms) -------------------- */
/** same pace as the other forest overlays (40% slower than the first cuts) */
const SLOW = 1.4;
const S = (ms: number) => Math.round(ms * SLOW);
const STEP_MS = S(560);
const STEP_GAP = STEP_MS + S(200); // between the three steps
const steps3 = (s1: number) => [s1, s1 + STEP_GAP, s1 + STEP_GAP * 2] as const;
const BAND_T = steps3(S(150));
const COLL_T = steps3(S(450));
const COLR_T = steps3(S(560));
const T_BAND_LIVE = BAND_T[2] + Math.round(STEP_MS * 0.6);
const PHOTO_STAGGER = S(170);
const T_ROWS = COLR_T[2] + Math.round(STEP_MS * 0.6);
const ROW_STAGGER = S(55);
const ROW_WIPE_MS = S(460);
const T_VINE = T_BAND_LIVE + S(200);
const VINE_SEG_MS = S(55);
const PAGE_HOLD_MS = 20000; // how long each page HOLDS once all its rows are in (auto paging)
/* page change — 40% slower than the first cut:
   vine starts → old rows wipe out one by one → new rows wipe in → vine fades */
const PAGE_SLOW = 1.4;
const P = (ms: number) => Math.round(S(ms) * PAGE_SLOW);
const PAGE_VINE_MS = P(1100); // the vine that snakes through the table
const EXIT_STAGGER = P(45); // old rows leave one after another
const EXIT_MS = P(420); // each old row's wipe out
const SWAP_AFTER = EXIT_MS + 8 * EXIT_STAGGER; // then the new page mounts
const PAGE_ROWS_AFTER = P(150); // new rows start wiping in (after the swap)
const PAGE_ROW_STAGGER = P(55);
const PAGE_ROW_WIPE_MS = P(460);
const PAGE_VINE_FADE_AT = SWAP_AFTER + PAGE_ROWS_AFTER + 8 * PAGE_ROW_STAGGER + PAGE_ROW_WIPE_MS;
/* a page change takes this long from start until the new page is fully in;
   the hold only starts counting after that */
const PAGE_CHANGE_MS = PAGE_VINE_FADE_AT;
const PAGE_CYCLE_MS = PAGE_CHANGE_MS + PAGE_HOLD_MS;

/* ── dummy standings for the preview button ── */
const DEMO_TAGS = ['DMY', 'NOVA', 'STRM', 'A7', 'RW', 'GG', 'TSM', 'FAZE', 'BLD', 'HYD', 'ORB', 'VLT', 'IGN', 'KOI', 'ZEN', 'APX', 'RVN', 'SKY', 'ION', 'MTX', 'NEO', 'PYR'];
const DEMO_ROWS: Row[] = DEMO_TAGS.map((tag, i) => {
  const total = Math.max(14, 236 - i * 9 - (i % 3) * 3);
  const kills = Math.round(total * 0.55);
  return {
    teamId: `demo-${i}`,
    teamTag: tag,
    teamName: `${tag} ESPORTS`,
    teamLogo: '/def_logo.png',
    totalScore: total,
    totalKills: kills,
    totalPlacePoints: total - kills,
    wwcd: Math.max(0, 5 - Math.floor(i / 2)),
    rankChange: [0, 2, -1, 3, null, -2, 1, 0, -3, 4][i % 10],
    rank: i + 1,
  };
});
const DEMO_ROSTER: RosterPlayer[] = [
  { key: 'd1', name: 'VIPER', kills: 41 },
  { key: 'd2', name: 'SHADOW', kills: 33 },
  { key: 'd3', name: 'KRYPTO', kills: 25 },
  { key: 'd4', name: 'NEXUS', kills: 31 },
];

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

/* The leader's roster: newest match that lists the team (photos + names),
   else the overall snapshot; event kills summed per player across matches. */
function leaderRoster(teamId: string, matchDatas: MatchData[], overallData?: OverallData | null): RosterPlayer[] {
  const pk = (p: Player) => String(p.uId || p._id || p.playerName);
  const kills = new Map<string, number>();
  const pics = new Map<string, string>();
  let roster: Player[] = [];
  for (const md of matchDatas) {
    const t = md.teams?.find((x) => String(x.teamId) === String(teamId));
    if (!t?.players?.length) continue;
    roster = t.players; // ends on the newest match that lists them
    for (const p of t.players) {
      kills.set(pk(p), (kills.get(pk(p)) || 0) + (p.killNum || 0));
      if (p.picUrl) pics.set(pk(p), p.picUrl);
    }
  }
  if (!roster.length) {
    const t = overallData?.teams?.find((x) => String(x.teamId) === String(teamId));
    roster = t?.players || [];
    for (const p of roster) kills.set(pk(p), p.killNum || 0);
  }
  return roster.slice(0, 4).map((p) => ({
    key: pk(p),
    name: p.playerName,
    pic: p.picUrl || pics.get(pk(p)),
    kills: kills.get(pk(p)) || 0,
  }));
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

const Crown = ({ color, size = 26 }: { color: string; size?: number }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block', flex: 'none' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
    <rect x="6" y="27" width="28" height="3" fill={color} />
  </svg>
);

/* -------------------- Three-step reveal -------------------- */
const FRINGES: Tone[] = ['M', 'S', 'P'];
const Reveal3: React.FC<{ open: readonly boolean[]; dir: Dir; w: number; h: number; faces: React.ReactNode[] }> = ({ open, dir, w, h, faces }) => (
  <>
    {faces.map((f, i) => (
      <Reveal key={i} open={open[i]} dir={dir} w={w} h={h} fringe={FRINGES[i]}>
        {f}
      </Reveal>
    ))}
  </>
);
const useSteps = (t: readonly number[], run: unknown) => [useAfter(t[0], run), useAfter(t[1], run), useAfter(t[2], run)] as const;

const groveBg = (pal: ForestPalette) =>
  `${GRAIN}, radial-gradient(ellipse 40% 60% at 50% 50%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`;
const canopyBg = (pal: ForestPalette, deg = 115) => `${GRAIN}, linear-gradient(${deg}deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})`;
const blackBg = (pal: ForestPalette) => `${GRAIN}, linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})`;

/* small pine silhouettes for the band's player area */
const pine = (x: number, base: number, h: number) => {
  let d = '';
  for (let i = 0; i < 4; i++) {
    const top = base - h + i * h * 0.19;
    const bottom = top + h * 0.34;
    const hw = h * 0.2 * (0.5 + 0.22 * i);
    d += `M${x},${top} L${x + hw},${bottom} L${x + hw * 0.32},${bottom - h * 0.035} L${x - hw * 0.32},${bottom - h * 0.035} L${x - hw},${bottom} Z `;
  }
  return d;
};

/* -------------------- Leader band -------------------- */
const LeaderBand: React.FC<{ team: Row; second?: Row; tournament: Tournament; run: number }> = ({ team, second, tournament, run }) => {
  const { pal } = useContext(ForestCtx);
  const st = useSteps(BAND_T, run);
  const live = useAfter(T_BAND_LIVE, run);
  const total = useCountUp(num(team.totalScore), live, S(1200));
  const wwcd = useCountUp(num(team.wwcd), live, S(700));
  const place = useCountUp(num(team.totalPlacePoints), live, S(1000));
  const elims = useCountUp(num(team.totalKills), live, S(1000));
  const lead = second ? num(team.totalScore) - num(second.totalScore) : 0;
  const name = (team.teamName || team.teamTag || '').toUpperCase();
  const nameSize = name.length <= 12 ? 68 : name.length <= 17 ? 54 : name.length <= 24 ? 44 : 36;
  const W = BAND.w;
  const H = BAND.h;

  const faces = [
    // 1 — grove: tournament logo
    <div key="g" style={{ position: 'absolute', inset: 0, background: groveBg(pal), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
      <img src={tournament.torLogo || '/def_logo.png'} alt="" style={{ width: 170, height: 170, maxWidth: 'none', objectFit: 'contain', ...pop(st[0], 250) }} />
      <span style={{ fontSize: 76, letterSpacing: '0.12em', color: WHITE, textShadow: SHADOW, ...rise(st[0], 350) }}>OVERALL STANDINGS</span>
    </div>,
    // 2 — canopy: the leader's logo plate
    <div key="c" style={{ position: 'absolute', inset: 0, background: canopyBg(pal), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={pop(st[1], 250)}>
        <LogoPlate p={team} w={360} h={216} />
      </div>
    </div>,
    // 3 — content
    <div key="x" style={{ position: 'absolute', inset: 0, background: `${GRAIN}, radial-gradient(ellipse 30% 90% at 75% 100%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})` }}>
      <div style={{ position: 'absolute', left: CUT, right: 0, top: 0, height: 6, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />
      {/* forest behind the players */}
      <svg width={W - INFO_W} height={H} viewBox={`0 0 ${W - INFO_W} ${H}`} style={{ position: 'absolute', left: INFO_W, top: 0, opacity: live ? 1 : 0, transition: `opacity ${S(800)}ms ease` }} aria-hidden>
        <defs>
          <linearGradient id="osPineBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={pal.canopy[1]} />
            <stop offset="1" stopColor={pal.black[1]} />
          </linearGradient>
        </defs>
        <g fill="url(#osPineBack)" opacity={0.55}>
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d={pine(30 + i * 78 + (i % 2) * 20, H + 10, 170 + ((i * 37) % 90))} />
          ))}
        </g>
        <g fill={pal.pineFront} opacity={0.95}>
          {[60, 180, 760, 880].map((x, i) => (
            <path key={i} d={pine(x, H + 10, 250 + (i % 2) * 40)} />
          ))}
        </g>
      </svg>
      <div style={{ position: 'absolute', left: INFO_W, top: 0, width: 3, bottom: 0, background: `linear-gradient(180deg, transparent, ${pal.label}, transparent)`, opacity: 0.6 }} />

      {/* identity */}
      <div style={{ position: 'absolute', left: 40, top: 30, width: INFO_W - 80, display: 'flex', alignItems: 'center', gap: 22 }}>
        <div style={{ position: 'relative', flex: 'none', ...pop(live, 0) }}>
          <div style={{ position: 'absolute', left: '50%', top: -26, transform: 'translateX(-50%)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.6))' }}>
            <Crown color={pal.label} size={38} />
          </div>
          <div
            style={{
              width: 86,
              height: 86,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 54,
              color: INK,
              paddingTop: 4,
              boxSizing: 'border-box',
              background: `repeating-radial-gradient(circle, rgba(0,0,0,.12) 0px, rgba(0,0,0,.12) 1.5px, transparent 1.5px, transparent 7px), radial-gradient(circle, #FFFFFF 0%, ${pal.label} 100%)`,
              boxShadow: '0 0 0 4px rgba(0,0,0,.45), 0 6px 14px rgba(0,0,0,.5)',
            }}
          >
            1
          </div>
        </div>
        <div style={pop(live, 100)}>
          <LogoPlate p={team} w={150} h={90} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...rise(live, 150, 8) }}>
            <span style={{ fontSize: 20, letterSpacing: '0.28em', color: pal.label }}>OVERALL LEADER</span>
            {lead > 0 && <span style={{ fontSize: 18, letterSpacing: '0.12em', background: 'linear-gradient(180deg, #FFFFFF, #E6E6EC)', color: INK, padding: '5px 10px 3px' }}>LEAD +{lead}</span>}
          </div>
          <div style={{ marginTop: 8, fontSize: nameSize, lineHeight: 0.95, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 4px 12px rgba(0,0,0,.6)', clipPath: live ? 'inset(0 0 -10% 0)' : 'inset(0 100% -10% 0)', transition: `clip-path ${S(750)}ms cubic-bezier(.65,0,.25,1) ${S(200)}ms` }}>
            {name}
          </div>
        </div>
      </div>
      {/* chips */}
      <div style={{ position: 'absolute', left: 40, top: 168, width: INFO_W - 80, height: 120, display: 'flex', gap: 12 }}>
        {[
          { k: 'TOTAL', v: total, hero: true },
          { k: 'WWCD', v: wwcd },
          { k: 'PLACE', v: place },
          { k: 'ELIMS', v: elims },
        ].map((c, i) => (
          <div
            key={c.k}
            style={{
              flex: c.hero ? 1.3 : 1,
              clipPath: chamfer(14),
              background: c.hero ? canopyBg(pal, 150) : 'linear-gradient(180deg, #FFFFFF, #E6E6EC)',
              boxShadow: c.hero ? `inset 0 0 0 2px ${pal.label}` : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              ...rise(live, 300 + i * 100, 18),
            }}
          >
            <span style={{ fontSize: c.hero ? 74 : 60, lineHeight: 0.85, color: c.hero ? WHITE : INK, fontVariantNumeric: 'tabular-nums', textShadow: c.hero ? SHADOW : 'none' }}>{Math.round(c.v)}</span>
            <span style={{ fontSize: 16, letterSpacing: '0.26em', paddingLeft: '0.26em', color: c.hero ? pal.label : '#55555E' }}>{c.k}</span>
          </div>
        ))}
      </div>
    </div>,
  ];

  return (
    <div style={{ position: 'absolute', left: BAND.x, top: BAND.y, width: W, height: H, zIndex: 2, filter: 'drop-shadow(0 20px 36px rgba(0,0,0,.45))', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: chamfer(CUT + 6) }}>
        <Reveal3 open={st} dir="fromLeft" w={W} h={H} faces={faces} />
      </div>
    </div>
  );
};

/* the leader's players: big, standing on the band's bottom edge, popping out above it */
const LeaderPhotos: React.FC<{ roster: RosterPlayer[]; run: number }> = ({ roster, run }) => {
  const { pal } = useContext(ForestCtx);
  const n = Math.max(1, roster.length);
  const PW = 330;
  const PH = 420;
  const step = n > 1 ? Math.min(210, (BAND.w - INFO_W - PW - 20) / (n - 1)) : 0;
  const groupW = PW + step * (n - 1);
  const x0 = BAND.x + INFO_W + (BAND.w - INFO_W - groupW) / 2;
  const order = roster.map((_, i) => i).sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: BAND.y + BAND.h, zIndex: 3, pointerEvents: 'none', overflow: 'hidden' }}>
      {roster.map((p, i) => {
        const mid = Math.abs(i - (n - 1) / 2);
        return <BandPhoto key={p.key} p={p} left={x0 + i * step} w={PW} h={PH - mid * 26} z={10 - Math.round(mid * 2)} at={T_BAND_LIVE + order.indexOf(i) * PHOTO_STAGGER} run={run} glow={pal.sceneGlow} />;
      })}
    </div>
  );
};
const BandPhoto: React.FC<{ p: RosterPlayer; left: number; w: number; h: number; z: number; at: number; run: number; glow: string }> = ({ p, left, w, h, z, at, run, glow }) => {
  const on = useAfter(at, run);
  const lit = useAfter(at + S(450), run);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: BAND.y + BAND.h - h,
        width: w,
        height: h,
        zIndex: z,
        transform: on ? 'none' : 'translateY(120px)',
        opacity: on ? 1 : 0,
        transition: `transform ${S(850)}ms cubic-bezier(.16,1,.3,1), opacity ${S(300)}ms linear, filter ${S(700)}ms ease`,
        filter: lit ? 'drop-shadow(0 12px 20px rgba(0,0,0,.55))' : `drop-shadow(0 0 22px ${glow})`,
      }}
    >
      <img
        src={playerPhoto(p.pic) || DEF_PLAYER}
        alt={p.name}
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', objectPosition: 'bottom center', filter: lit ? 'brightness(1)' : 'brightness(0)', transition: `filter ${S(600)}ms ease` }}
        onError={(e) => {
          (e.target as HTMLImageElement).src = DEF_PLAYER;
        }}
      />
    </div>
  );
};

/* -------------------- Vine along the band's bottom edge -------------------- */
type Pt = [number, number];
const BAND_VINE = (() => {
  const y = BAND.y + BAND.h;
  const x0 = BAND.x + 30;
  const x1 = BAND.x + BAND.w - 10;
  const N = 26;
  const pts: Pt[] = Array.from({ length: N + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / N, y + (i % 2 === 0 ? 9 : -14)]);
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
  const leaves = pts
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % 2 === 0 && i > 0 && i < N)
    .map(({ p, i }) => ({ x: p[0], y: p[1] - 4, r: i % 4 === 0 ? -35 - (i % 3) * 12 : -145 + (i % 3) * 12, s: 0.6 + (i % 3) * 0.08, tone: tones[i % 3], i }));
  return { segs, leaves };
})();
const BandVine: React.FC<{ on: boolean; front: boolean }> = ({ on, front }) => {
  const { pal, gid } = useContext(ForestCtx);
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 4 : 1 }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        {BAND_VINE.segs
          .filter((s) => s.front === front)
          .map((s) => (
            <GrowStem key={s.i} d={s.d} w={9} col={pal.vineA} on={on} delay={s.i * VINE_SEG_MS} dur={VINE_SEG_MS + 30} ease="linear" />
          ))}
        {front &&
          BAND_VINE.leaves.map((l, k) => (
            <g key={k} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r}) scale(${l.s.toFixed(2)})`}>
              <Unfurl on={on} delay={l.i * VINE_SEG_MS + S(60)}>
                <LeafShape tone={l.tone} />
              </Unfurl>
            </g>
          ))}
      </g>
    </svg>
  );
};

/* -------------------- Title strip -------------------- */
const Strip: React.FC<{ tournament: Tournament; round?: Round | null; page: number; pages: number; run: number }> = ({ tournament, round, page, pages, run }) => {
  const { pal } = useContext(ForestCtx);
  const on = useAfter(COLL_T[2], run);
  const context = [tournament.tournamentName, round?.roundName].filter(Boolean).join('  ·  ').toUpperCase();
  return (
    <div style={{ position: 'absolute', left: BAND.x, top: STRIP_Y, width: BAND.w, height: STRIP_H, display: 'flex', alignItems: 'center', gap: 22, fontFamily: FONT, fontWeight: 700, lineHeight: 1, zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, clipPath: on ? 'inset(0 0 -10% 0)' : 'inset(0 100% -10% 0)', transition: `clip-path ${S(700)}ms cubic-bezier(.65,0,.25,1)` }}>
        <svg width={34} height={20} viewBox="0 -12 40 24" aria-hidden>
          <path d={LEAF_SHAPE} fill={pal.label} />
        </svg>
        <span style={{ fontSize: 46, letterSpacing: '0.08em', color: WHITE, textShadow: '0 3px 8px rgba(0,0,0,.6)' }}>OVERALL STANDINGS</span>
      </div>
      {context && (
        <span
          style={{
            background: 'linear-gradient(180deg, #FFFFFF, #E6E6EC)',
            color: INK,
            padding: '7px 20px 6px',
            fontSize: 20,
            letterSpacing: '0.18em',
            clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
            whiteSpace: 'nowrap',
            ...rise(on, 200, 8),
          }}
        >
          {context}
        </span>
      )}
      {pages > 1 && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, ...rise(on, 300, 8) }}>
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} style={{ width: i === page ? 34 : 12, height: 12, borderRadius: 6, background: i === page ? pal.label : 'rgba(255,255,255,.35)', transition: `width ${S(400)}ms ease, background ${S(400)}ms ease` }} />
          ))}
          <span style={{ marginLeft: 8, fontSize: 20, letterSpacing: '0.18em', color: WHITE, textShadow: SHADOW }}>
            PAGE {page + 1}/{pages}
          </span>
        </div>
      )}
    </div>
  );
};

/* -------------------- Table -------------------- */
const RankBadge: React.FC<{ rank: number; size: number }> = ({ rank, size }) => {
  const { pal } = useContext(ForestCtx);
  const top = rank <= 3;
  if (!top) return <span style={{ fontSize: size * 0.62, color: pal.label, fontVariantNumeric: 'tabular-nums' }}>{String(rank).padStart(2, '0')}</span>;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.56,
        color: INK,
        paddingTop: size * 0.05,
        boxSizing: 'border-box',
        background:
          rank === 1
            ? `repeating-radial-gradient(circle, rgba(0,0,0,.12) 0px, rgba(0,0,0,.12) 1px, transparent 1px, transparent 5px), radial-gradient(circle, #FFFFFF 0%, ${pal.label} 100%)`
            : 'repeating-radial-gradient(circle, rgba(0,0,0,.08) 0px, rgba(0,0,0,.08) 1px, transparent 1px, transparent 5px), radial-gradient(circle, #FFFFFF 0%, #D6D6DC 100%)',
        boxShadow: '0 2px 5px rgba(0,0,0,.5)',
      }}
    >
      {rank}
    </div>
  );
};

const StandRow: React.FC<{ team: Row; rank: number; h: number; at: number; runKey: string; wipeMs: number; exiting: boolean; exitDelay: number }> = ({
  team,
  rank,
  h,
  at,
  runKey,
  wipeMs,
  exiting,
  exitDelay,
}) => {
  const { pal } = useContext(ForestCtx);
  const on = useAfter(at, runKey);
  const settled = useAfter(at + wipeMs, runKey);
  const total = useCountUp(num(team.totalScore), on, S(900));
  const first = rank === 1;
  const chg = team.rankChange;
  const name = (team.teamName || team.teamTag || '').toUpperCase();
  const big = Math.round(h * 0.6);
  const nameSize = name.length <= 14 ? big : name.length <= 20 ? Math.round(big * 0.85) : Math.round(big * 0.72);
  const plateH = Math.round(h * 0.82);
  const numStyle: React.CSSProperties = { textAlign: 'center', fontSize: Math.round(h * 0.56), color: WHITE, fontVariantNumeric: 'tabular-nums', flex: 'none' };
  return (
    <div style={{ position: 'relative', height: h }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: exiting ? 'inset(0 0 0 100%)' : on ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          transition: exiting ? `clip-path ${EXIT_MS}ms cubic-bezier(.65,0,.25,1) ${exitDelay}ms` : `clip-path ${wipeMs}ms cubic-bezier(.65,0,.25,1)`,
          display: 'flex',
          alignItems: 'center',
          background: first ? `linear-gradient(90deg, ${pal.canopy[1]}, ${pal.canopy[2]} 75%)` : rank % 2 ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.025)',
          boxShadow: first ? `inset 4px 0 0 ${pal.label}` : 'inset 0 -1px 0 rgba(255,255,255,.06)',
        }}
      >
        <div style={{ width: C.rank, flex: 'none', display: 'flex', justifyContent: 'center' }}>
          <RankBadge rank={rank} size={Math.round(h * 0.82)} />
        </div>
        <div style={{ width: C.chg, flex: 'none', textAlign: 'center', fontSize: Math.round(h * 0.36), color: chg == null || chg === 0 ? 'rgba(255,255,255,.35)' : chg > 0 ? UP : DOWN }}>
          {chg == null || chg === 0 ? '–' : chg > 0 ? `▲${chg}` : `▼${Math.abs(chg)}`}
        </div>
        <div style={{ width: C.logo, flex: 'none', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: Math.round(plateH * 1.6), height: plateH, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))' }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                background: WHITE,
                clipPath: PLATE_CUT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: `${Math.round(plateH * 0.12)}px ${Math.round(plateH * 0.3)}px`,
                boxSizing: 'border-box',
              }}
            >
              <TeamLogo logo={team.teamLogo} flag={team.teamFlag} fallback={'/def_logo.png'} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingLeft: 12, paddingRight: 8, fontSize: nameSize, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: first ? SHADOW : 'none' }}>{name}</div>
        <div style={{ ...numStyle, width: C.wwcd }}>{num(team.wwcd)}</div>
        <div style={{ ...numStyle, width: C.place, color: 'rgba(255,255,255,.8)' }}>{num(team.totalPlacePoints)}</div>
        <div style={{ ...numStyle, width: C.elims, color: 'rgba(255,255,255,.8)' }}>{num(team.totalKills)}</div>
        <div
          style={{
            width: C.total,
            alignSelf: 'stretch',
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.round(h * 0.7),
            fontVariantNumeric: 'tabular-nums',
            color: first ? INK : WHITE,
            background: first ? `linear-gradient(180deg, #FFFFFF, ${pal.label})` : `linear-gradient(160deg, ${pal.canopy[0]}, ${pal.canopy[1]} 60%, ${pal.canopy[2]})`,
            clipPath: 'polygon(12px 0, 100% 0, 100% 100%, 0 100%)',
            transform: settled ? 'scale(1)' : 'scale(.7)',
            transition: `transform ${S(420)}ms cubic-bezier(.34,1.56,.64,1)`,
          }}
        >
          {Math.round(total)}
        </div>
      </div>
      {/* a leaf riding the wipe */}
      <svg
        width={30}
        height={20}
        viewBox="0 -14 40 28"
        style={{
          position: 'absolute',
          top: '50%',
          marginTop: -10,
          left: on ? '100%' : '0%',
          marginLeft: -15,
          opacity: on && !settled ? 1 : 0,
          transition: `left ${wipeMs}ms cubic-bezier(.65,0,.25,1), opacity ${S(160)}ms linear`,
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 2,
        }}
        aria-hidden
      >
        <g transform={`rotate(${rank % 2 ? -20 : 20})`}>
          <LeafShape tone={rank % 3 === 0 ? 'S' : rank % 3 === 1 ? 'P' : 'M'} />
        </g>
      </svg>
    </div>
  );
};

const ColumnPanel: React.FC<{
  side: 'left' | 'right';
  rows: Row[];
  firstRank: number;
  perCol: number;
  rowH: number;
  page: number;
  flips: number; // page changes already shown
  vineFlips: number; // page changes started (the vine runs from here)
  exiting: boolean;
  run: number;
  tournament: Tournament;
}> = ({ side, rows, firstRank, perCol, rowH, page, flips, vineFlips, exiting, run, tournament }) => {
  const { pal } = useContext(ForestCtx);
  const t = side === 'left' ? COLL_T : COLR_T;
  const st = useSteps(t, run);
  const x = side === 'left' ? BAND.x : BAND.x + COL_W + COL_GAP;
  const H = COLS_BOTTOM - COLS_Y;
  const lbl: React.CSSProperties = { fontSize: 15, letterSpacing: '0.16em', color: 'rgba(255,255,255,.7)', textAlign: 'center', flex: 'none' };
  const runKey = `${run}-${page}-${flips}`;
  const base = flips === 0 ? T_ROWS : PAGE_ROWS_AFTER;
  const lastRank = firstRank + perCol - 1;

  const faces = [
    <div key="g" style={{ position: 'absolute', inset: 0, background: groveBg(pal), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={tournament.torLogo || '/def_logo.png'} alt="" style={{ width: 200, height: 200, maxWidth: 'none', objectFit: 'contain', ...pop(st[0], 250) }} />
    </div>,
    <div key="c" style={{ position: 'absolute', inset: 0, background: canopyBg(pal, side === 'left' ? 115 : 245), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 30, letterSpacing: '0.4em', paddingLeft: '0.4em', color: pal.label, ...rise(st[1], 200) }}>RANKS</span>
        <span style={{ fontSize: 130, lineHeight: 0.8, color: WHITE, textShadow: SHADOW, fontVariantNumeric: 'tabular-nums', ...pop(st[1], 280) }}>
          {String(firstRank).padStart(2, '0')}
          <span style={{ color: pal.label, margin: '0 18px' }}>–</span>
          {String(lastRank).padStart(2, '0')}
        </span>
      </div>
    </div>,
    <div key="x" style={{ position: 'absolute', inset: 0, background: blackBg(pal) }}>
      <div style={{ height: COL_HEAD_H, display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,.07)', position: 'relative' }}>
        <span style={{ ...lbl, width: C.rank, color: WHITE, fontSize: 18 }}>#</span>
        <span style={{ ...lbl, width: C.chg }}>▲▼</span>
        <span style={{ ...lbl, flex: 1, textAlign: 'left', paddingLeft: C.logo + 12 }}>TEAM</span>
        <span style={{ ...lbl, width: C.wwcd }}>WWCD</span>
        <span style={{ ...lbl, width: C.place }}>PLACE</span>
        <span style={{ ...lbl, width: C.elims }}>ELIMS</span>
        <span style={{ ...lbl, width: C.total, color: pal.label }}>TOTAL</span>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />
      </div>
      <div key={runKey} style={{ display: 'flex', flexDirection: 'column', gap: ROW_GAP, marginTop: 8 }}>
        {rows.map((team, i) => (
          <StandRow
            key={team.teamId || firstRank + i}
            team={team}
            rank={num(team.rank) || firstRank + i}
            h={rowH}
            at={base + (i + (side === 'right' ? 0.5 : 0)) * (flips === 0 ? ROW_STAGGER : PAGE_ROW_STAGGER)}
            runKey={runKey}
            wipeMs={flips === 0 ? ROW_WIPE_MS : PAGE_ROW_WIPE_MS}
            exiting={exiting}
            exitDelay={Math.round((i + (side === 'right' ? 0.5 : 0)) * EXIT_STAGGER)}
          />
        ))}
      </div>
    </div>,
  ];

  return (
    <div style={{ position: 'absolute', left: x, top: COLS_Y, width: COL_W, height: H, zIndex: 2, filter: 'drop-shadow(0 18px 32px rgba(0,0,0,.45))', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: chamfer(CUT) }}>
        <Reveal3 open={st} dir={side === 'left' ? 'fromLeft' : 'fromRight'} w={COL_W} h={H} faces={faces} />
      </div>
      {vineFlips > 0 && <PageVine key={vineFlips} h={H} mirror={side === 'right'} />}
    </div>
  );
};

/* -------------------- Page-change vine -------------------- */
/* On every page change a vine snakes down through the column — back and
   forth across the rows — while the new page's rows wipe in behind it; then
   it fades away. */
const PageVine: React.FC<{ h: number; mirror: boolean }> = ({ h, mirror }) => {
  const { pal, gid } = useContext(ForestCtx);
  const grow = useAfter(20, 'grow');
  const fade = useAfter(Math.max(PAGE_VINE_MS, PAGE_VINE_FADE_AT) + P(200), 'fade');
  const { d, leaves } = useMemo(() => {
    const top = COL_HEAD_H + 16;
    const bottom = h - 20;
    const passes = 5;
    const xL = 36;
    const xR = COL_W - 36;
    const f = (n: number) => n.toFixed(1);
    let path = `M${f(mirror ? xR : xL)},${f(top)}`;
    const lv: { x: number; y: number; r: number; u: number; tone: Tone }[] = [];
    for (let k = 0; k < passes; k++) {
      const y0 = top + ((bottom - top) * k) / passes;
      const y1 = top + ((bottom - top) * (k + 1)) / passes;
      const goRight = (k % 2 === 0) !== mirror;
      const xa = goRight ? xL : xR;
      const xb = goRight ? xR : xL;
      path += ` C${f(xa + (xb - xa) * 0.45)},${f(y0 - 18)} ${f(xa + (xb - xa) * 0.55)},${f(y1 + 18)} ${f(xb)},${f(y1)}`;
      [0.2, 0.42, 0.64, 0.86].forEach((t, j) => {
        lv.push({
          x: xa + (xb - xa) * t,
          y: y0 + (y1 - y0) * t + (j % 2 ? -10 : 10),
          r: (goRight ? 0 : 180) + (j % 2 ? -60 : 60),
          u: (k + t) / passes,
          tone: (['P', 'M', 'S'] as Tone[])[(k + j) % 3],
        });
      });
    }
    return { d: path, leaves: lv };
  }, [h, mirror]);
  return (
    <svg
      width={COL_W}
      height={h}
      viewBox={`0 0 ${COL_W} ${h}`}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 5, opacity: fade ? 0 : 1, transition: `opacity ${P(500)}ms ease` }}
      aria-hidden
    >
      <g filter={`url(#${gid}-shadow)`}>
        <GrowStem d={d} w={11} col={pal.vineA} on={grow} delay={0} dur={PAGE_VINE_MS} ease="cubic-bezier(.4,0,.3,1)" />
        {leaves.map((l, k) => (
          <g key={k} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r}) scale(.7)`}>
            <Unfurl on={grow} delay={Math.round(l.u * PAGE_VINE_MS)}>
              <LeafShape tone={l.tone} />
            </Unfurl>
          </g>
        ))}
      </g>
    </svg>
  );
};

/* -------------------- Scene -------------------- */
const Scene: React.FC<{ rows: Row[]; roster: RosterPlayer[]; tournament: Tournament; round?: Round | null; run: number }> = ({ rows, roster, tournament, round, run }) => {
  // ≤ 20 teams: one page of 10 + 10. More than 20: pages of 8 + 8.
  const pageSize = rows.length <= 20 ? 20 : 16;
  const perCol = pageSize / 2;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const [flips, setFlips] = useState(0); // how many page changes so far
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  useEffect(() => {
    setFlips(0);
    let iv = 0;
    const t = window.setTimeout(() => {
      const tick = () => {
        if (pagesRef.current > 1) setFlips((f) => f + 1);
      };
      tick();
      iv = window.setInterval(tick, PAGE_CYCLE_MS);
    }, T_ROWS + 10 * ROW_STAGGER + ROW_WIPE_MS + PAGE_HOLD_MS);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [run]);
  const [shown, setShown] = useState(0); // page changes whose rows are on screen
  useEffect(() => {
    if (flips === 0) return setShown(0);
    if (shown === flips) return;
    const t = window.setTimeout(() => setShown(flips), SWAP_AFTER);
    return () => clearTimeout(t);
  }, [flips, shown]);
  const exiting = shown !== flips;
  const page = pages > 1 ? shown % pages : 0;
  const slice = rows.slice(page * pageSize, page * pageSize + pageSize);
  // a short last page is split evenly across both columns
  const split = slice.length < pageSize ? Math.ceil(slice.length / 2) : perCol;
  const left = slice.slice(0, split);
  const right = slice.slice(split);
  const rowH = Math.min(64, Math.floor((COLS_BOTTOM - COLS_Y - COL_HEAD_H - 14 - (perCol - 1) * ROW_GAP) / perCol));
  const vine = useAfter(T_VINE, run);

  return (
    <>
      <BandVine on={vine} front={false} />
      {rows[0] && <LeaderBand team={rows[0]} second={rows[1]} tournament={tournament} run={run} />}
      <LeaderPhotos roster={roster} run={run} />
      <BandVine on={vine} front />
      <Strip tournament={tournament} round={round} page={page} pages={pages} run={run} />
      <ColumnPanel side="left" rows={left} firstRank={page * pageSize + 1} perCol={perCol} rowH={rowH} page={page} flips={shown} vineFlips={flips} exiting={exiting} run={run} tournament={tournament} />
      <ColumnPanel side="right" rows={right} firstRank={page * pageSize + split + 1} perCol={perCol} rowH={rowH} page={page} flips={shown} vineFlips={flips} exiting={exiting} run={run} tournament={tournament} />
    </>
  );
};

const OverAllData: React.FC<OverAllDataProps> = ({ tournament, round, overallData, matchDatas = [] }) => {
  // Calculate team rankings with rank change (memoized — only recomputes
  // when the underlying match/overall data actually changes).
  const teamRankings: RankedTeam[] = useMemo(() => {
    if (matchDatas.length === 0 && !overallData) return [];

    if (matchDatas.length > 0) {
      return computeRankedStandings(matchDatas);
    }

    // Fallback: only a single overall snapshot, no match-by-match history —
    // there is genuinely nothing to diff against, so rankChange is null
    // rather than a misleading 0.
    if (overallData?.teams) {
      const teams = overallData.teams.map((team) => {
        const totalKills = team.players?.reduce((sum, p) => sum + (p.killNum || 0), 0) || 0;
        const totalPlacePoints = team.placePoints || 0;
        return {
          teamId: team.teamId,
          teamName: team.teamName,
          teamTag: team.teamTag,
          teamLogo: team.teamLogo,
          teamFlag: team.teamFlag,
          totalKills,
          totalPlacePoints,
          totalScore: totalKills + totalPlacePoints,
          wwcd: team.wwcd || 0,
          rankChange: null as number | null,
        };
      });

      // No match-by-match history here, so there's no "most recent match"
      // to break ties with — lastMatchPlacePoints is 0 for everyone.
      const sorted = teams.sort((a, b) => compareOfficialStandings(
        { totalScore: a.totalScore, wwcd: a.wwcd, totalPlacePoints: a.totalPlacePoints, totalKills: a.totalKills, lastMatchPlacePoints: 0 },
        { totalScore: b.totalScore, wwcd: b.wwcd, totalPlacePoints: b.totalPlacePoints, totalKills: b.totalKills, lastMatchPlacePoints: 0 }
      ));

      return sorted.map((team, index) => ({ ...team, rank: index + 1 }));
    }

    return [];
  }, [overallData, matchDatas]);

  // The leader's roster with event kills (photos from the match data).
  const roster = useMemo(
    () => (teamRankings[0] ? leaderRoster(String(teamRankings[0].teamId), matchDatas, overallData) : []),
    [teamRankings, matchDatas, overallData]
  );

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fo' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);
  const hasData = teamRankings.length > 0;
  const useDemo = !hasData && demo;
  const rows = (useDemo ? DEMO_ROWS : teamRankings) as unknown as Row[];
  const shownRoster = useDemo ? DEMO_ROSTER : roster;

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
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        <ForestDefs />
        {rows.length === 0 ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ padding: '18px 48px 16px 40px', background: WHITE, color: INK, fontSize: 30, letterSpacing: '0.12em', boxShadow: `inset 8px 0 0 ${primary}` }}>NO OVERALL DATA AVAILABLE</div>
          </div>
        ) : (
          <div key={`run-${run}-${useDemo ? 'demo' : 'live'}`} style={{ position: 'absolute', inset: 0 }}>
            <Scene rows={rows} roster={shownRoster} tournament={tournament} round={round} run={run} />
          </div>
        )}

        {/* preview — BELOW the 1920×1080 canvas */}
        <button type="button" onClick={preview} style={btn}>
          ▶ PREVIEW STANDINGS
        </button>
      </div>
    </ForestCtx.Provider>
  );
};

export default React.memo(OverAllData);