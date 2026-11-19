import React, { useCallback, useEffect, useId, useMemo, useRef, useState, createContext, useContext } from 'react';
import { isWinningPlacement } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';

/* FOREST — Highlight Schedule (corner widget, 1920×1080, ≤ 6 matches).
   Data handling unchanged: matches + matchDatas zipped by index, optional
   selectedScheduleMatches filter, de-duplicated by match number, sorted, and
   the WWCD team per match via isWinningPlacement (total = its kills + place pts).

   card (292 × 152) — a plain, sharp-cornered rectangle (no cuts, no border)
     ┌──────────────────────────────┐
     │ 01 MATCH │  map image   MAP │  map band
     ├──────────────────────────────┤
     │ [logo] ♛ WWCD          │ 24  │  played → winner + pts
     │        NOVA            │ PTS │  next   → UP NEXT + time
     └──────────────────────────────┘  later  → UPCOMING + time

   Layouts (toggle with the button BELOW the 1080 line, or the `layout` prop):
     vertical    a column in the top-left corner
     horizontal  a row along the bottom-left
   Either way every card sits inside ONE sharp-edged box, and the vine runs
   INSIDE the box — down a channel on its right (column) or along a channel
   at its top (row) — clipped so it never leaves the box.
   The choice is remembered in this browser (localStorage).

   Motion (state + CSS transitions only, so it always plays):
     each card opens in three steps behind a fringe of leaves (from the left
     in the column, upward in the row): 1) grove — MATCH number + map
     2) canopy — theme gradient 3) the card: logo pops, points count up.
     The box wipes open first; the vine grows through its channel alongside
     the cards, leaves unfurling.
   PREVIEW + LAYOUT buttons sit OUTSIDE the canvas (y ≥ 1100). Preview uses
   6 dummy matches when there is no data. */

interface Tournament {
  _id: string;
  tournamentName: string;
  primaryColor?: string;
  secondaryColor?: string;
  day?: string;
}

interface Round {
  _id: string;
  roundName: string;
  day?: string;
}

interface Player {
  _id: string;
  playerName: string;
  killNum: number;
}

interface Team {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
  players: Player[];
  placePoints: number;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
  time?: string;
  map?: string;
  teams?: Team[];
}

type Layout = 'vertical' | 'horizontal';

interface ScheduleProps {
  tournament: Tournament;
  round?: Round | null;
  matches?: Match[];
  matchDatas?: any[];
  selectedScheduleMatches?: string[];
  matchData?: any;
  /** optional fixed layout; otherwise the remembered toggle (default vertical) */
  layout?: Layout;
}

const getMapImage = (mapName?: string) => {
  switch (mapName?.toLowerCase()) {
    case 'erangel':
      return '/theme4assets/eragnel.png';
    case 'miramar':
      return '/theme4assets/mirmar.png';
    case 'sanhok':
      return '/theme4assets/sanhok.png';
    case 'rondo':
      return '/theme4assets/rondo.png';
    case 'bermuda':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761360885/bermuda_axt2w0.jpg';
    case 'alpine':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761361515/alpine_wfchbf.jpg';
    case 'nexterra':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761361420/nexterra_v0ivox.jpg';
    case 'purgatory':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761361420/purgatory1_frijhy.jpg';
    case 'kalahari':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761361420/kalahari_jrhc4o.jpg';
    default:
      return null;
  }
};

/* -------------------- Palette + type -------------------- */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";
const SHADOW = '0 0 1px rgba(0,0,0,.9), 0 2px 4px rgba(0,0,0,.6)';

/** White logo plate — traced from Layer_2.png (same as the other overlays). */
const PLATE_CUT =
  'polygon(4% 0%, 82.9% 0%, 99.7% 77.7%, 82.6% 53.1%, 92.8% 100%, 10.2% 96%, 0.3% 46.9%, 18.2% 74.1%)';

/* -------------------- Geometry -------------------- */
const MAX_MATCHES = 6;
const CARD_W = 292;
const CARD_H = 152;
const MAP_H = 58;
const BODY_H = CARD_H - MAP_H;
const GAP = 14;
const MARGIN = 40;
const NUM_W = 96;
const PTS_W = 84;

/* -------------------- Timeline (ms) -------------------- */
/** same pace as the other forest overlays (40% slower than the first cuts) */
const SLOW = 1.4;
const S = (ms: number) => Math.round(ms * SLOW);
const STEP_MS = S(460);
const STEP_GAP = STEP_MS + S(160);
const T_FIRST = S(250);
const STAGGER = S(170);
const cardT = (i: number) => {
  const s1 = T_FIRST + i * STAGGER;
  return [s1, s1 + STEP_GAP, s1 + STEP_GAP * 2] as const;
};
const STORE_KEY = 'theme8.highlightSchedule.layout';

/* ── dummy matches for the preview button ── */
type View = {
  key: string;
  no: number;
  map?: string;
  time?: string;
  winner?: { tag: string; logo?: string; flag?: string };
  total?: number;
};
const DEMO: View[] = [
  { key: 'd1', no: 1, map: 'Erangel', time: '2:00 PM', winner: { tag: 'NOVA', logo: '/def_logo.png' }, total: 24 },
  { key: 'd2', no: 2, map: 'Miramar', time: '2:45 PM', winner: { tag: 'DMY', logo: '/def_logo.png' }, total: 19 },
  { key: 'd3', no: 3, map: 'Sanhok', time: '3:30 PM', winner: { tag: 'TSM', logo: '/def_logo.png' }, total: 21 },
  { key: 'd4', no: 4, map: 'Rondo', time: '4:15 PM' },
  { key: 'd5', no: 5, map: 'Erangel', time: '5:00 PM' },
  { key: 'd6', no: 6, map: 'Miramar', time: '5:45 PM' },
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

/* -------------------- Map band -------------------- */
const MapBand: React.FC<{ map?: string }> = ({ map }) => {
  const { pal } = useContext(ForestCtx);
  const src = getMapImage(map);
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(false), [src]);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: `linear-gradient(135deg, ${pal.canopy[2]}, ${pal.black[1]})` }}>
      {src && (
        <img
          src={src}
          alt=""
          onLoad={() => setOk(true)}
          onError={() => setOk(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', maxWidth: 'none', objectFit: 'cover', display: 'block', opacity: ok ? 1 : 0, transition: 'opacity 300ms linear' }}
        />
      )}
      {!ok && <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(-60deg, rgba(255,255,255,.06) 0 2px, transparent 2px 10px)' }} />}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${pal.black[1]} 0%, rgba(0,0,0,.35) 45%, rgba(0,0,0,.55) 100%)` }} />
    </div>
  );
};

/* -------------------- One match card (a plain rectangle) -------------------- */
const MatchCard: React.FC<{ v: View; order: number; isNext: boolean; layout: Layout; run: number }> = ({ v, order, isNext, layout, run }) => {
  const { pal } = useContext(ForestCtx);
  const t = cardT(order);
  const s1 = useAfter(t[0], run);
  const s2 = useAfter(t[1], run);
  const s3 = useAfter(t[2], run);
  const live = useAfter(t[2] + Math.round(STEP_MS * 0.6), run);
  const pts = useCountUp(v.total ?? 0, live && !!v.winner, S(800));
  const played = !!v.winner;
  const active = played || isNext;
  const noLabel = String(v.no).padStart(2, '0');
  const tag = (v.winner?.tag || '').toUpperCase();
  const tagSize = tag.length <= 4 ? 38 : tag.length <= 6 ? 30 : tag.length <= 8 ? 25 : 21;
  const dir: Dir = layout === 'vertical' ? 'fromLeft' : 'up';

  return (
    <div style={{ position: 'relative', width: CARD_W, height: CARD_H, flex: 'none', filter: 'drop-shadow(0 10px 22px rgba(0,0,0,.42))', zIndex: 2 }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        {/* 1 — grove: match number + map */}
        <Reveal open={s1} dir={dir} w={CARD_W} h={CARD_H} fringe="M">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `${GRAIN}, radial-gradient(ellipse 50% 60% at 50% 50%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 18, letterSpacing: '0.3em', color: pal.label }}>MATCH</span>
              <span style={{ fontSize: 66, color: WHITE, textShadow: SHADOW, fontVariantNumeric: 'tabular-nums', transform: s1 ? 'scale(1)' : 'scale(.5)', opacity: s1 ? 1 : 0, transition: `transform ${S(450)}ms cubic-bezier(.34,1.56,.64,1) ${S(150)}ms, opacity ${S(200)}ms linear ${S(150)}ms`, display: 'inline-block' }}>
                {noLabel}
              </span>
            </span>
            <span style={{ fontSize: 18, letterSpacing: '0.3em', color: 'rgba(255,255,255,.8)' }}>{(v.map || 'TBD').toUpperCase()}</span>
          </div>
        </Reveal>
        {/* 2 — canopy */}
        <Reveal open={s2} dir={dir} w={CARD_W} h={CARD_H} fringe="S">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(125deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})` }} />
        </Reveal>
        {/* 3 — the card */}
        <Reveal open={s3} dir={dir} w={CARD_W} h={CARD_H} fringe="P">
          <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})` }}>
            {/* map band */}
            <div style={{ position: 'absolute', left: 0, top: 0, width: CARD_W, height: MAP_H }}>
              <MapBand map={v.map} />
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: NUM_W, background: active ? `linear-gradient(150deg, ${pal.canopy[0]}, ${pal.canopy[1]})` : 'rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, letterSpacing: '0.14em', color: active ? pal.label : 'rgba(255,255,255,.55)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>MATCH</span>
                <span style={{ fontSize: 40, color: WHITE, fontVariantNumeric: 'tabular-nums', textShadow: SHADOW }}>{noLabel}</span>
              </div>
              <div style={{ position: 'absolute', right: 10, bottom: 8, background: WHITE, color: INK, padding: '4px 9px 3px', fontSize: 16, letterSpacing: '0.18em' }}>{(v.map || 'TBD').toUpperCase()}</div>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: active ? `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` : 'rgba(255,255,255,.18)' }} />
            </div>

            {/* body */}
            <div style={{ position: 'absolute', left: 0, top: MAP_H, width: CARD_W, height: BODY_H, display: 'flex', alignItems: 'stretch' }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0 10px 0 10px',
                  opacity: live ? 1 : 0,
                  transform: live ? 'none' : 'translateY(8px)',
                  transition: `opacity ${S(250)}ms linear, transform ${S(400)}ms cubic-bezier(.2,.8,.2,1)`,
                }}
              >
                {played ? (
                  <>
                    <div style={{ transform: live ? 'scale(1)' : 'scale(.5)', transition: `transform ${S(450)}ms cubic-bezier(.34,1.56,.64,1) ${S(100)}ms` }}>
                      <LogoPlate p={{ teamLogo: v.winner!.logo, teamFlag: v.winner!.flag, teamName: v.winner!.tag }} w={70} h={44} />
                    </div>
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, letterSpacing: '0.24em', color: pal.label }}>
                        <Crown color={pal.label} size={16} />
                        WWCD
                      </span>
                      <span style={{ fontSize: tagSize, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ alignSelf: 'flex-start', background: isNext ? WHITE : 'rgba(255,255,255,.1)', color: isNext ? INK : 'rgba(255,255,255,.65)', padding: '4px 10px 3px', fontSize: 15, letterSpacing: '0.24em' }}>
                      {isNext ? 'UP NEXT' : 'UPCOMING'}
                    </span>
                    <span style={{ fontSize: 40, color: isNext ? WHITE : 'rgba(255,255,255,.6)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{(v.time || 'TBD').toUpperCase()}</span>
                  </div>
                )}
              </div>
              {/* right block — points (played) / clock (unplayed) */}
              <div
                style={{
                  width: PTS_W,
                  flex: 'none',
                  background: played ? `linear-gradient(160deg, ${pal.canopy[0]}, ${pal.canopy[1]} 60%, ${pal.canopy[2]})` : isNext ? WHITE : 'rgba(255,255,255,.06)',
                  color: played ? WHITE : isNext ? INK : 'rgba(255,255,255,.55)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                {played ? (
                  <>
                    <span style={{ fontSize: 42, fontVariantNumeric: 'tabular-nums', textShadow: SHADOW }}>{Math.round(pts)}</span>
                    <span style={{ fontSize: 13, letterSpacing: '0.26em', paddingLeft: '0.26em', color: pal.label }}>PTS</span>
                  </>
                ) : (
                  <svg width={30} height={30} viewBox="0 0 24 24" aria-hidden style={{ color: 'currentColor' }}>
                    <circle cx={12} cy={12} r={9} fill="none" stroke="currentColor" strokeWidth={2.4} />
                    <path d="M12 7 V12 L15.5 14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="square" />
                  </svg>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
};

/* -------------------- The box + the vine running inside it -------------------- */
/* One sharp-edged rectangle holds every card. A channel inside it carries the
   vine: down the right side in the column, along the top in the row. The vine
   is clipped to the box, so it never leaves it. */
const PAD = 12; // box padding round the cards
const CH = 38; // vine channel width (inside the box)
const boxSize = (layout: Layout, n: number) => {
  const run = n * (layout === 'vertical' ? CARD_H : CARD_W) + Math.max(0, n - 1) * GAP;
  return layout === 'vertical' ? { w: PAD + CARD_W + CH + PAD / 2, h: PAD * 2 + run } : { w: PAD * 2 + run, h: PAD / 2 + CH + CARD_H + PAD };
};

type Pt = [number, number];
const innerVine = (layout: Layout, n: number) => {
  const { w, h } = boxSize(layout, n);
  const len = layout === 'vertical' ? h : w;
  const N = Math.max(6, Math.round(len / 46));
  const pts: Pt[] = Array.from({ length: N + 1 }, (_, i) => {
    const u = i / N;
    const off = i % 2 === 0 ? 8 : -8;
    return layout === 'vertical' ? [PAD + CARD_W + CH / 2 + off, -10 + (h + 20) * u] : [-10 + (w + 20) * u, PAD / 2 + CH / 2 + off];
  });
  const f = (x: number) => x.toFixed(1);
  const segs = pts.slice(0, -1).map((_, i) => {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    return {
      d: `M${f(p1[0])},${f(p1[1])} C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`,
      i,
    };
  });
  const tones: Tone[] = ['P', 'M', 'S'];
  // a pair of small leaves at every bend, kept inside the channel
  const leaves = pts.slice(1, -1).flatMap((p, k) => {
    const i = k + 1;
    const flip = i % 2 === 0;
    const along = layout === 'vertical' ? 90 : 0;
    return [
      { x: p[0], y: p[1], r: along + (flip ? -55 : 55) + (layout === 'vertical' ? 0 : 180) * 0, s: 0.4, tone: tones[i % 3], u: i / N },
      { x: p[0], y: p[1], r: along + 180 + (flip ? 50 : -50), s: 0.34, tone: tones[(i + 1) % 3], u: i / N },
    ];
  });
  return { segs, leaves, n: N, w, h };
};

const InnerVine: React.FC<{ layout: Layout; count: number; run: number }> = ({ layout, count, run }) => {
  const { pal, gid } = useContext(ForestCtx);
  const on = useAfter(T_FIRST + S(200), run);
  const v = useMemo(() => innerVine(layout, count), [layout, count]);
  const total = cardT(count - 1)[2] - T_FIRST; // grows alongside the cards
  const seg = total / v.n;
  return (
    <svg width={v.w} height={v.h} viewBox={`0 0 ${v.w} ${v.h}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        {v.segs.map((s) => (
          <GrowStem key={s.i} d={s.d} w={7} col={pal.vineA} on={on} delay={Math.round(s.i * seg)} dur={Math.round(seg) + 30} ease="linear" />
        ))}
        {v.leaves.map((l, k) => (
          <g key={k} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r}) scale(${l.s.toFixed(2)})`}>
            <Unfurl on={on} delay={Math.round(l.u * total) + S(40)}>
              <LeafShape tone={l.tone} />
            </Unfurl>
          </g>
        ))}
      </g>
    </svg>
  );
};

/** the box: a plain sharp rectangle that wipes open before the cards */
const ScheduleBox: React.FC<{ layout: Layout; count: number; run: number; children: React.ReactNode }> = ({ layout, count, run, children }) => {
  const { pal } = useContext(ForestCtx);
  const open = useAfter(S(40), run);
  const { w, h } = boxSize(layout, count);
  const pos: React.CSSProperties = layout === 'vertical' ? { left: MARGIN, top: MARGIN } : { left: MARGIN, bottom: MARGIN };
  return (
    <div
      style={{
        position: 'absolute',
        ...pos,
        width: w,
        height: h,
        zIndex: 2,
        filter: 'drop-shadow(0 14px 30px rgba(0,0,0,.45))',
        clipPath: open ? 'inset(0 0 0 0)' : layout === 'vertical' ? 'inset(0 0 100% 0)' : 'inset(0 100% 0 0)',
        transition: `clip-path ${S(550)}ms cubic-bezier(.65,0,.25,1)`,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: `${GRAIN}, linear-gradient(180deg, ${pal.black[0]}, ${pal.black[1]})` }}>
        {/* the vine channel: a slightly lighter strip in the theme tone */}
        <div
          style={{
            position: 'absolute',
            ...(layout === 'vertical' ? { left: PAD + CARD_W, top: 0, bottom: 0, width: CH + PAD / 2 } : { left: 0, right: 0, top: 0, height: PAD / 2 + CH }),
            background: `linear-gradient(${layout === 'vertical' ? 90 : 180}deg, ${pal.canopy[2]}, ${pal.black[1]})`,
            opacity: 0.55,
          }}
        />
        <InnerVine layout={layout} count={count} run={run} />
        <div
          style={{
            position: 'absolute',
            left: PAD,
            top: layout === 'vertical' ? PAD : PAD / 2 + CH,
            display: 'flex',
            flexDirection: layout === 'vertical' ? 'column' : 'row',
            gap: GAP,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

/* -------------------- HighlightSchedule -------------------- */
const HighlightSchedule: React.FC<ScheduleProps> = ({ tournament, round, matches: propMatches, matchDatas: propMatchDatas, selectedScheduleMatches, layout: layoutProp }) => {
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);
  const [layoutState, setLayoutState] = useState<Layout>(() => {
    try {
      const saved = window.localStorage.getItem(STORE_KEY);
      return saved === 'horizontal' ? 'horizontal' : 'vertical';
    } catch {
      return 'vertical';
    }
  });
  const layout: Layout = layoutProp ?? layoutState;

  // matches + matchDatas zipped by index (prop-only, as before)
  const matches: Match[] = useMemo(() => {
    if (!propMatches || !propMatchDatas) return [];
    return propMatches.map((match, idx) => ({
      ...match,
      teams: propMatchDatas[idx]?.teams || [],
    }));
  }, [propMatches, propMatchDatas]);

  const sortedMatches = useMemo(() => {
    // Filter to only selected matches if any are selected
    let filteredMatches = matches;
    if (selectedScheduleMatches && selectedScheduleMatches.length > 0) {
      filteredMatches = matches.filter((match) => selectedScheduleMatches.includes(match._id));
    }
    // Remove duplicates by matchNo
    const uniqueMatches = filteredMatches.filter(
      (match, index, self) => index === self.findIndex((m) => (m.matchNo || m._matchNo) === (match.matchNo || match._matchNo))
    );
    return uniqueMatches.sort((a, b) => (a.matchNo || a._matchNo || 0) - (b.matchNo || b._matchNo || 0));
  }, [matches, selectedScheduleMatches]);

  const realViews: View[] = useMemo(
    () =>
      sortedMatches.slice(0, MAX_MATCHES).map((match, index) => {
        const winningTeams = match.teams?.filter((team) => isWinningPlacement(team.placePoints, (team.players?.[0] as any)?.rank)) || [];
        const w = winningTeams[0];
        const total = w ? w.players.reduce((sum, p) => sum + (p.killNum || 0), 0) + w.placePoints : undefined;
        return {
          key: match._id,
          no: Number(match.matchNo || match._matchNo || index + 1),
          map: match.map,
          time: match.time,
          winner: w ? { tag: w.teamTag, logo: w.teamLogo, flag: w.teamFlag } : undefined,
          total,
        };
      }),
    [sortedMatches]
  );

  const views: View[] = realViews.length ? realViews : demo ? DEMO : [];
  const nextIndex = views.findIndex((v) => !v.winner);

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const toggleLayout = useCallback(() => {
    setLayoutState((cur) => {
      const next: Layout = cur === 'vertical' ? 'horizontal' : 'vertical';
      try {
        window.localStorage.setItem(STORE_KEY, next);
      } catch {
        /* storage unavailable — keep it for this session only */
      }
      return next;
    });
    setRun((r) => r + 1); // replay in the new arrangement
  }, []);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fh' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  const n = views.length;

  const btn: React.CSSProperties = {
    position: 'absolute',
    top: 1100,
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
        {(round || demo) && n > 0 && (
          <div key={`list-${run}-${layout}`}>
            <ScheduleBox layout={layout} count={n} run={run}>
              {views.map((v, i) => (
                <MatchCard key={v.key} v={v} order={i} isNext={i === nextIndex} layout={layout} run={run} />
              ))}
            </ScheduleBox>
          </div>
        )}

        {/* ── controls — BELOW the 1920×1080 canvas ── */}
        <button type="button" onClick={preview} style={{ ...btn, left: 20 }}>
          ▶ PREVIEW SCHEDULE
        </button>
        {!layoutProp && (
          <button type="button" onClick={toggleLayout} style={{ ...btn, left: 260 }}>
            LAYOUT: {layout === 'vertical' ? 'VERTICAL ▸ SWITCH TO HORIZONTAL' : 'HORIZONTAL ▸ SWITCH TO VERTICAL'}
          </button>
        )}
      </div>
    </ForestCtx.Provider>
  );
};

export default HighlightSchedule;