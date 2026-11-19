import React, { useCallback, useEffect, useId, useMemo, useRef, useState, createContext, useContext } from 'react';
import { TeamLogo } from '../../shared/components/TeamLogo';
/* FOREST — Team Slots.
   Same data and layout rules as before: matchData.teams (20 dummy teams for
   the preview), at most 5 × 5, five columns, centred; a partial last row
   stays centred; the tile height adapts to the number of rows.

             ════ a 3D branch grows across the top ════
                 ┌──────────── TEAM SLOTS ────────────┐   wooden plank on vine ropes
                 └────── round · day · match ─────────┘
     ~~~~~~~~ a vine grows along each row, weaving in front of / behind ~~~~~~~~
     ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
     │[logo] (07) │ │[logo] (08) │ │ …          │ │            │ │            │
     │       TAG  │ │       TAG  │ │            │ │            │ │            │
     └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘

   Motion (state + CSS transitions only, so it always plays):
     the branch draws itself across, the plank drops on its ropes and swings
     to rest · then, row by row, a vine grows left → right along the row;
     as it reaches each tile the tile opens upward in three steps behind a
     fringe of leaves: 1) grove — the slot number  2) canopy — the logo
     plate  3) the finished tile (logo pops, slot ring spins in, tag wipes in).
   PREVIEW: a "Preview slots" button OUTSIDE the 1920×1080 canvas replays the
   sequence (20 dummy teams when there is no data). */

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
  health: number;
  healthMax: number;
  liveState: number;
}

interface Team {
  _id: string;
  teamId?: string;
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

interface SlotsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
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
const COLS = 5;
const MAX_ROWS = 5;
const TILE_W = 306;
const COL_GAP = 20;
const ROW_GAP = 26; // room for the row vines
const GRID_TOP = 286;
const GRID_BOTTOM = 1046;
const CUT = 18;
const tileShape = `polygon(${CUT}px 0, 100% 0, 100% calc(100% - ${CUT}px), calc(100% - ${CUT}px) 100%, 0 100%, 0 ${CUT}px)`;
const BRANCH = { x1: 470, x2: 1450, y: 46 };
const ROPE = 40;
const PLANK_H = 100;

/* -------------------- Timeline (ms) -------------------- */
/** same pace as the other forest overlays (40% slower than the first cuts) */
const SLOW = 1.4;
const S = (ms: number) => Math.round(ms * SLOW);
const STEP_MS = S(440);
const STEP_GAP = STEP_MS + S(110);
const T_BRANCH = S(80);
const BRANCH_MS = S(900);
const T_PLANK = S(650);
const T_CONTEXT = S(1350);
const T_ROWS = S(1000); // first row's vine starts
const ROW_STAGGER = S(380); // between rows
const ROW_VINE_MS = S(1000); // a row's vine grows across in this long
const tileT = (row: number, col: number, cols: number) => {
  // the tile opens as the vine reaches it
  const s1 = T_ROWS + row * ROW_STAGGER + Math.round(((col + 0.4) / Math.max(1, cols)) * ROW_VINE_MS);
  return [s1, s1 + STEP_GAP, s1 + STEP_GAP * 2] as const;
};

/* ── dummy teams for the preview button ── */
const DEMO_TAGS = ['NOVA', 'TSM', 'FAZE', 'DRX', 'BTR', 'STE', 'IHC', 'GEN', 'T1', 'DPLUS', 'RRQ', '4AM', 'ALTER EGO', 'VAMOS', 'HORAA', 'NIGMA', 'FLC', 'WBG', 'KINGS', 'DMY'];
const DEMO: Team[] = DEMO_TAGS.map((t, i) => ({ _id: `d${i}`, teamTag: t, slot: i + 1, placePoints: 0, players: [], teamLogo: '/def_logo.png' }));

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
              <Unfurl on={branch} delay={l.u * BRANCH_MS + 84}>
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
          transition: 'transform 1820ms cubic-bezier(.3,1.7,.45,1), opacity 280ms linear',
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
              TEAM SLOTS
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
              transition: 'clip-path 840ms cubic-bezier(.65,0,.25,1)',
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

/* -------------------- Slot tile (three steps) -------------------- */
const SlotTile: React.FC<{ team: Team; slotNo: number; row: number; col: number; cols: number; tileH: number; run: number }> = ({ team, slotNo, row, col, cols, tileH, run }) => {
  const { pal } = useContext(ForestCtx);
  const t = tileT(row, col, cols);
  const s1 = useAfter(t[0], run);
  const s2 = useAfter(t[1], run);
  const s3 = useAfter(t[2], run);
  const live = useAfter(t[2] + Math.round(STEP_MS * 0.55), run);
  const slotLabel = String(slotNo).padStart(2, '0');
  const tag = (team.teamTag || '').toUpperCase();
  const tagSize = Math.min(Math.round(tileH * 0.34), tag.length <= 3 ? 50 : tag.length <= 4 ? 44 : tag.length <= 5 ? 38 : tag.length <= 7 ? 30 : tag.length <= 9 ? 22 : 19);
  const plateH = Math.round(tileH * 0.5);
  const plateW = Math.round(plateH * 1.5);
  const ring = Math.round(tileH * 0.34);

  return (
    <div style={{ position: 'relative', width: TILE_W, height: tileH, flex: 'none', filter: 'drop-shadow(0 12px 22px rgba(0,0,0,.42))', zIndex: 2 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: tileShape, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        {/* 1 — grove: the slot number */}
        <Reveal open={s1} dir="up" w={TILE_W} h={tileH} fringe="M">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 50% 60% at 50% 55%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 18, letterSpacing: '0.32em', color: pal.label }}>SLOT</span>
            <span style={{ fontSize: Math.round(tileH * 0.6), color: WHITE, textShadow: SHADOW, fontVariantNumeric: 'tabular-nums', transform: s1 ? 'scale(1)' : 'scale(.5)', opacity: s1 ? 1 : 0, transition: `transform ${S(450)}ms cubic-bezier(.34,1.56,.64,1) ${S(150)}ms, opacity ${S(200)}ms linear ${S(150)}ms` }}>
              {slotLabel}
            </span>
          </div>
        </Reveal>
        {/* 2 — canopy: the logo plate */}
        <Reveal open={s2} dir="up" w={TILE_W} h={tileH} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(125deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ transform: s2 ? 'scale(1)' : 'scale(.5)', opacity: s2 ? 1 : 0, transition: `transform ${S(450)}ms cubic-bezier(.34,1.56,.64,1) ${S(150)}ms, opacity ${S(200)}ms linear ${S(150)}ms` }}>
              <LogoPlate p={team} w={Math.round(plateW * 1.15)} h={Math.round(plateH * 1.15)} />
            </div>
          </div>
        </Reveal>
        {/* 3 — the tile */}
        <Reveal open={s3} dir="up" w={TILE_W} h={tileH} fringe="P">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 50% 90% at 20% 50%, ${pal.sceneGlow.replace(/[\d.]+\)$/, '0.22)')} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})`,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div style={{ position: 'absolute', left: 0, top: CUT, bottom: 0, width: 6, background: `linear-gradient(180deg, ${pal.secondary}, ${pal.primary})` }} />
            {/* logo plate */}
            <div style={{ width: plateW + 18, flex: 'none', display: 'flex', justifyContent: 'center', paddingLeft: 8, transform: live ? 'scale(1)' : 'scale(.6)', opacity: live ? 1 : 0, transition: `transform ${S(450)}ms cubic-bezier(.34,1.56,.64,1), opacity ${S(200)}ms linear` }}>
              <LogoPlate p={team} w={plateW} h={plateH} />
            </div>
            {/* slot ring + tag */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: Math.round(tileH * 0.07), paddingRight: 14, paddingLeft: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, letterSpacing: '0.26em', color: 'rgba(255,255,255,.65)' }}>SLOT</span>
                <span
                  style={{
                    width: ring,
                    height: ring,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: Math.round(ring * 0.5),
                    color: INK,
                    paddingTop: 2,
                    boxSizing: 'border-box',
                    background: `repeating-radial-gradient(circle, rgba(0,0,0,.1) 0px, rgba(0,0,0,.1) 1px, transparent 1px, transparent 4px), radial-gradient(circle, #FFFFFF 0%, ${pal.label} 100%)`,
                    boxShadow: '0 2px 4px rgba(0,0,0,.5)',
                    transform: live ? 'rotate(0deg) scale(1)' : 'rotate(-180deg) scale(.4)',
                    transition: `transform ${S(600)}ms cubic-bezier(.34,1.4,.64,1) ${S(80)}ms`,
                  }}
                >
                  {slotLabel}
                </span>
              </div>
              <span
                style={{
                  fontSize: tagSize,
                  color: WHITE,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textShadow: '0 3px 8px rgba(0,0,0,.6)',
                  clipPath: live ? 'inset(0 0 -10% 0)' : 'inset(0 100% -10% 0)',
                  transition: `clip-path ${S(500)}ms cubic-bezier(.65,0,.25,1) ${S(150)}ms`,
                }}
              >
                {tag}
              </span>
            </div>
            <div style={{ position: 'absolute', left: 6, right: CUT, bottom: 0, height: 4, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />
          </div>
        </Reveal>
      </div>
    </div>
  );
};

/* -------------------- A vine along the top of each row -------------------- */
type Pt = [number, number];
const rowVine = (x0: number, x1: number, y: number) => {
  const N = Math.max(6, Math.round((x1 - x0) / 56));
  const pts: Pt[] = Array.from({ length: N + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / N, y + (i % 2 === 0 ? -12 : 10)]);
  const f = (n: number) => n.toFixed(1);
  const segs = pts.slice(0, -1).map((_, i) => {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    return {
      d: `M${f(p1[0])},${f(p1[1])} C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`,
      front: i % 2 === 1, // dips onto the tiles in front, swings above them behind
      u: i / N,
      i,
    };
  });
  const tones: Tone[] = ['P', 'M', 'S'];
  const leaves = pts
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % 2 === 0 && i > 0 && i < N)
    .map(({ p, i }) => ({ x: p[0], y: p[1], r: i % 4 === 0 ? -50 - (i % 3) * 14 : -130 + (i % 3) * 14, s: 0.55 + (i % 3) * 0.07, tone: tones[i % 3], u: i / N }));
  return { segs, leaves, n: N };
};

const RowVine: React.FC<{ x0: number; x1: number; y: number; at: number; run: number; front: boolean }> = ({ x0, x1, y, at, run, front }) => {
  const { pal, gid } = useContext(ForestCtx);
  const on = useAfter(at, run);
  const v = useMemo(() => rowVine(x0, x1, y), [x0, x1, y]);
  const seg = ROW_VINE_MS / v.n;
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 3 : 1 }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        {v.segs
          .filter((s) => s.front === front)
          .map((s) => (
            <GrowStem key={s.i} d={s.d} w={8} col={pal.vineA} on={on} delay={Math.round(s.i * seg)} dur={Math.round(seg) + 30} ease="linear" />
          ))}
        {!front &&
          v.leaves.map((l, k) => (
            <g key={k} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r}) scale(${l.s.toFixed(2)})`}>
              <Unfurl on={on} delay={Math.round(l.u * ROW_VINE_MS) + S(40)}>
                <LeafShape tone={l.tone} />
              </Unfurl>
            </g>
          ))}
      </g>
    </svg>
  );
};

/* -------------------- Slots -------------------- */
const Slots: React.FC<SlotsProps> = ({ tournament, round, match, matchData }) => {
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);

  const realTeams = matchData?.teams ?? [];
  const teams = (realTeams.length ? realTeams : demo ? DEMO : []).slice(0, COLS * MAX_ROWS);

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fs' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  const rows = Math.max(1, Math.ceil(teams.length / COLS));
  const tileH = Math.max(110, Math.min(160, Math.floor((GRID_BOTTOM - GRID_TOP - (rows - 1) * ROW_GAP) / rows)));
  const gridH = rows * tileH + (rows - 1) * ROW_GAP;
  const gridTop = GRID_TOP + Math.max(0, Math.floor((GRID_BOTTOM - GRID_TOP - gridH) / 2));

  const day = round?.day || tournament.day || '';
  const matchNo = match?.matchNo ?? match?._matchNo;
  const context = [
    round?.roundName,
    day ? (/^day/i.test(day) ? day : `DAY ${day}`) : '',
    matchNo != null ? `MATCH ${String(matchNo).padStart(2, '0')}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ')
    .toUpperCase();

  // rows of tiles; a partial last row stays centred
  const rowList = Array.from({ length: rows }, (_, r) => teams.slice(r * COLS, r * COLS + COLS));

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
        <ForestDefs />
        {teams.length > 0 ? (
          <div key={`run-${run}`}>
            <Heading run={run} context={context} />
            {rowList.map((list, r) => {
              const rowW = list.length * TILE_W + (list.length - 1) * COL_GAP;
              const x0 = (1920 - rowW) / 2;
              const y = gridTop + r * (tileH + ROW_GAP);
              const at = T_ROWS + r * ROW_STAGGER;
              return (
                <React.Fragment key={r}>
                  <RowVine x0={x0 - 30} x1={x0 + rowW + 30} y={y} at={at} run={run} front={false} />
                  <div style={{ position: 'absolute', left: x0, top: y, display: 'flex', gap: COL_GAP }}>
                    {list.map((team, c) => (
                      <SlotTile key={String(team._id ?? team.teamId ?? r * COLS + c)} team={team} slotNo={Number(team.slot) || r * COLS + c + 1} row={r} col={c} cols={list.length} tileH={tileH} run={run} />
                    ))}
                  </div>
                  <RowVine x0={x0 - 30} x1={x0 + rowW + 30} y={y} at={at} run={run} front />
                </React.Fragment>
              );
            })}
          </div>
        ) : (
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
        )}

        {/* ── preview control — outside the 1920×1080 canvas ── */}
        <button
          type="button"
          onClick={preview}
          style={{
            position: 'absolute',
            left: 1940,
            top: 356,
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
          ▶ PREVIEW SLOTS
        </button>
      </div>
    </ForestCtx.Provider>
  );
};

export default Slots;