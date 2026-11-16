import React, { useEffect, useMemo, useState } from 'react';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';

/* THEME8 "WHITE LABEL" — Event MVP.
   Data preserved: MVP = top of computeFraggerScores(buildFraggerPool(matchDatas))
   sorted by compareFraggerScore; top 5 kept; event-cumulative totals
   (totalKills / totalDamage / totalAssists / totalKnockouts); same empty guard.

   Layout (1920×1080):
   ┌ PHOTO CARD (left) ┐ ┌ ink strip: ★ EVENT MVP · tournament · round ─────┐
   │ photo rises over  │ │ team logo │ PLAYER NAME · tag · team name         │
   │ the theme stripe, │ │ PERFORMANCE hexagon — six axes with the number   │
   │ #1 chip, team bar │ │ at every corner: KILLS · KNOCKOUTS · DAMAGE ·    │
   └───────────────────┘ │ AVG DAMAGE · ASSISTS · AVG KILLS                 │
                         └──────────────────────────────────────────────────┘
   Hexagon scale: each axis is measured against the best of the event's top 5
   (outer ring = best). The dashed outline is the top-5 average. Averages = total ÷ matches the player appears
   in (counted from matchDatas, or matchesPlayed if the pool provides it).

   Motion (state + CSS transitions only — reduce-motion cannot switch it off):
     1) white plate wipes open with the tournament logo
     2) theme panel wipes over it — team logo pops, "EVENT MVP"
     3) the photo card wipes over that and the player rises into it
     the right column follows: strip wipes in, name rises, the hexagon panel
     opens, rings and spokes draw themselves, the MVP shape grows out from the
     centre, the top-5 average fades in and the corner numbers pop and count
     up one after another, clockwise.
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

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const PANEL = '#EFEFF2';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const TOP = 100;
const BOTTOM = 980;
const PH_X = 80;
const PH_W = 640;
const PH_H = BOTTOM - TOP; // 880
const COL_X = PH_X + PH_W + 40; // 760
const COL_W = 1840 - COL_X; // 1080
const STRIP_H = 64;
const ID_H = 210;
const HEX_TOP = STRIP_H + 6 + ID_H + 20; // panel top, relative to the column
const HEX_H = PH_H - HEX_TOP; // 584
const HEX_HEAD_H = 50;
const HEX_CX = COL_W / 2;
const HEX_CY = HEX_HEAD_H + (HEX_H - HEX_HEAD_H) / 2 - 4; // 313
const HEX_R = 205;
const HEX_RINGS = 4;
const CUT = 28;
const chamfer = (c: number) =>
  `polygon(0 0, calc(100% - ${c}px) 0, 100% ${c}px, 100% 100%, ${c}px 100%, 0 calc(100% - ${c}px))`;

/* ── motion ── */
const WIPE_MS = 650;
const WIPE_EASE = 'cubic-bezier(.65,0,.25,1)';
const T_PLATE = 60;
const T_THEME = 1250;
const T_PHOTO = 2350;
const T_COL = 2700; // right column strip
const T_HEX = 3250; // hexagon panel opens
const HEX_GROW_MS = 1200; // MVP shape grows out from the centre
const LABEL_STAGGER = 120; // corner numbers pop one after another

/* ── dummy data for the preview button ── */
const DEMO: MvpRow[] = [
  { _id: 'd1', playerName: 'VIPER', teamName: 'DUMMY ESPORTS', teamTag: 'DMY', teamLogo: '/def_logo.png', killNum: 47, numericDamage: 9120, knockouts: 52, assists: 14, matches: 12 },
  { _id: 'd2', playerName: 'SHADOW', teamName: 'NOVA GAMING', teamTag: 'NOVA', teamLogo: '/def_logo.png', killNum: 41, numericDamage: 8475, knockouts: 44, assists: 19, matches: 12 },
  { _id: 'd3', playerName: 'KRYPTO', teamName: 'TEAM STORM', teamTag: 'STRM', teamLogo: '/def_logo.png', killNum: 38, numericDamage: 9302, knockouts: 40, assists: 11, matches: 11 },
  { _id: 'd4', playerName: 'NEXUS', teamName: 'ALPHA SEVEN', teamTag: 'A7', teamLogo: '/def_logo.png', killNum: 35, numericDamage: 7110, knockouts: 39, assists: 16, matches: 12 },
  { _id: 'd5', playerName: 'BLAZE', teamName: 'RED WOLVES', teamTag: 'RW', teamLogo: '/def_logo.png', killNum: 33, numericDamage: 6890, knockouts: 35, assists: 9, matches: 10 },
];

/* ── helpers ── */
function toRgb(hex: string): [number, number, number] {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function inkOn(hex: string): string {
  const L = toRgb(hex)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  return L > 0.45 ? INK : WHITE;
}
function alphaHex(hex: string, a: number) {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
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
const num = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};

function useAfter(ms: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
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
  }, [ms]);
  return on;
}

function useCountUp(target: number, active: boolean, durMs = 900, delayMs = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) {
      setV(0);
      return;
    }
    let raf = 0;
    const start = performance.now() + delayMs;
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - start) / durMs));
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durMs, delayMs]);
  return v;
}

const rise = (on: boolean, delay: number, dist = 16): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : `translateY(${dist}px)`,
  transition: `opacity 350ms linear ${delay}ms, transform 560ms cubic-bezier(.16,1,.3,1) ${delay}ms`,
});
const slideIn = (on: boolean, delay = 0): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : 'translateX(-40px)',
  transition: `opacity 300ms linear ${delay}ms, transform 560ms cubic-bezier(.16,1,.3,1) ${delay}ms`,
});
const pop = (on: boolean, delay: number): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : 'scale(.6)',
  transition: `opacity 250ms linear ${delay}ms, transform 600ms cubic-bezier(.34,1.56,.64,1) ${delay}ms`,
});

/* left-to-right wipe; content pinned to full width, leading edge rides it */
const WipeX: React.FC<{ open: boolean; width: number; edge: string; children: React.ReactNode }> = ({
  open,
  width,
  edge,
  children,
}) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: open ? width : 0,
      overflow: 'hidden',
      transition: `width ${WIPE_MS}ms ${WIPE_EASE}`,
    }}
  >
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width }}>{children}</div>
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 14,
        background: edge,
        opacity: open ? 0 : 1,
        transition: `opacity 120ms linear ${open ? WIPE_MS - 60 : 0}ms`,
      }}
    />
  </div>
);

/* ── icons ── */
const Star = ({ color, size = 30 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ display: 'block', flex: 'none' }}>
    <path d="M20 2 L25 14.5 L38.5 15.2 L28 23.8 L31.5 37 L20 29.6 L8.5 37 L12 23.8 L1.5 15.2 L15 14.5 Z" fill={color} />
  </svg>
);

/* fit a player name into the identity block */
const nameSize = (n: string) => (n.length <= 8 ? 120 : n.length <= 11 ? 104 : n.length <= 14 ? 86 : n.length <= 18 ? 70 : 56);

/* ─────────────────────────────────────────────
   Photo card — three stacked wipe layers
   ───────────────────────────────────────────── */
const PhotoCard: React.FC<{ mvp: MvpRow; torLogo?: string; primary: string; secondary: string }> = ({
  mvp,
  torLogo,
  primary,
  secondary,
}) => {
  const onPrimary = inkOn(primary);
  const s1 = useAfter(T_PLATE);
  const s2 = useAfter(T_THEME);
  const s3 = useAfter(T_PHOTO);
  const photoOn = useAfter(T_PHOTO + 300);
  const tag = (mvp.teamTag || '').toUpperCase();

  return (
    <div
      style={{
        position: 'absolute',
        left: PH_X,
        top: TOP,
        width: PH_W,
        height: PH_H,
        clipPath: chamfer(CUT),
        fontFamily: FONT,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {/* 1 — white plate + tournament logo */}
      <WipeX open={s1} width={PH_W} edge={INK}>
        <div style={{ position: 'absolute', inset: 0, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={torLogo || '/def_logo.png'} alt="" style={{ width: 300, height: 300, maxWidth: 'none', objectFit: 'contain', ...pop(s1, 250) }} />
        </div>
      </WipeX>

      {/* 2 — theme panel + team logo + EVENT MVP */}
      <WipeX open={s2} width={PH_W} edge={secondary}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: primary,
            color: onPrimary,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TeamLogo
            logo={mvp.teamLogo}
            flag={mvp.teamFlag}
            fallback={'/def_logo.png'}
            alt=""
            style={{ width: 280, height: 280, maxWidth: 'none', objectFit: 'contain', display: 'block', ...pop(s2, 250) }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 34, ...rise(s2, 450) }}>
            <Star color={onPrimary} size={50} />
            <span style={{ fontSize: 92, letterSpacing: '0.12em' }}>EVENT MVP</span>
          </div>
        </div>
      </WipeX>

      {/* 3 — photo */}
      <WipeX open={s3} width={PH_W} edge={primary}>
        <div style={{ position: 'absolute', inset: 0, background: PANEL, overflow: 'hidden' }}>
          {/* team-tag watermark, vertical */}
          <div
            style={{
              position: 'absolute',
              left: 6,
              top: 30,
              fontSize: 210,
              lineHeight: 0.8,
              color: INK,
              opacity: 0.06,
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              whiteSpace: 'nowrap',
            }}
          >
            {tag}
          </div>
          {/* slanted theme stripes */}
          <div
            style={{
              position: 'absolute',
              left: -80,
              right: -80,
              top: 300,
              height: 300,
              background: primary,
              transform: 'skewY(-18deg)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: -80,
              right: -80,
              top: 612,
              height: 20,
              background: secondary,
              transform: 'skewY(-18deg)',
            }}
          />
          <img
            src={playerPhoto(mvp.picUrl) || DEF_PLAYER}
            alt={mvp.playerName}
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: PH_W,
              height: PH_H - 60,
              maxWidth: 'none',
              objectFit: 'contain',
              objectPosition: 'center bottom',
              display: 'block',
              opacity: photoOn ? 1 : 0,
              transform: photoOn ? 'none' : 'translateY(70px)',
              transition: 'opacity 350ms linear, transform 900ms cubic-bezier(.16,1,.3,1)',
            }}
          />
          {/* #1 chip */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: 76,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '0 34px 0 26px',
              background: INK,
              color: WHITE,
              clipPath: 'polygon(0 0, 100% 0, calc(100% - 22px) 100%, 0 100%)',
              ...slideIn(photoOn, 400),
            }}
          >
            <Star color={primary} size={30} />
            <span style={{ fontSize: 48 }}>#1</span>
          </div>
          {/* team strip along the bottom */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 70,
              background: INK,
              color: WHITE,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '0 26px',
              ...rise(photoOn, 550, 70),
            }}
          >
            <TeamLogo
              logo={mvp.teamLogo}
              flag={mvp.teamFlag}
              fallback={'/def_logo.png'}
              alt=""
              style={{ width: 46, height: 46, maxWidth: 'none', objectFit: 'contain', display: 'block' }}
            />
            <span style={{ fontSize: 34, letterSpacing: '0.06em' }}>{tag}</span>
            <span
              style={{
                fontSize: 20,
                letterSpacing: '0.18em',
                color: '#A6A6B0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {(mvp.teamName || '').toUpperCase()}
            </span>
          </div>
        </div>
      </WipeX>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Hexagon (radar) panel — six axes, each scaled against the best of the
   event's top 5 so the outer ring = "best of the top 5".
   ───────────────────────────────────────────── */
interface Axis {
  key: string;
  label: string;
  value: number; // MVP's value
  best: number; // best of the top 5
  avg: number; // top-5 average
  decimals?: number;
}

const angleOf = (i: number) => ((-120 + i * 60) * Math.PI) / 180; // flat-top, clockwise from the top-left corner
const pt = (i: number, r: number) => [HEX_CX + r * Math.cos(angleOf(i)), HEX_CY + r * Math.sin(angleOf(i))] as const;
const ringPath = (r: number) =>
  Array.from({ length: 6 }, (_, i) => pt(i, r))
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ') + ' Z';
const shapePath = (fr: number[]) =>
  fr
    .map((f, i) => pt(i, HEX_R * Math.max(0.04, Math.min(1, f))))
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ') + ' Z';

const fmt = (v: number, decimals = 0) => (decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-US'));

const CornerLabel: React.FC<{ axis: Axis; index: number; on: boolean; avgShown: boolean }> = ({ axis, index, on, avgShown }) => {
  const scale = Math.pow(10, axis.decimals || 0);
  const v = useCountUp(Math.round(axis.value * scale), on, 1000, 150) / scale;
  // 0 = top-left, 1 = top-right, 2 = right, 3 = bottom-right, 4 = bottom-left, 5 = left
  const right = index >= 1 && index <= 3;
  const [x, y] = pt(index, HEX_R + (index === 2 || index === 5 ? 30 : 18));
  const anchor: React.CSSProperties = right
    ? { left: x + (index === 2 ? 0 : 14), top: y, transform: 'translate(0, -50%)', alignItems: 'flex-start' }
    : { left: x - (index === 5 ? 0 : 14), top: y, transform: 'translate(-100%, -50%)', alignItems: 'flex-end' };

  return (
    <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', ...anchor }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: anchor.alignItems,
          opacity: on ? 1 : 0,
          transform: on ? 'none' : 'scale(.6)',
          transition: 'opacity 250ms linear, transform 550ms cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: right ? 'row' : 'row-reverse' }}>
          <span style={{ fontSize: 58, lineHeight: 0.9, color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmt(v, axis.decimals)}</span>
        </div>
        <span style={{ fontSize: 19, letterSpacing: '0.24em', color: DIM, marginTop: 8 }}>{axis.label}</span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexDirection: right ? 'row' : 'row-reverse',
            marginTop: 8,
            fontSize: 18,
            letterSpacing: '0.14em',
            color: INK,
            opacity: avgShown ? 0.75 : 0,
            transition: 'opacity 400ms linear',
          }}
        >
          <span style={{ width: 22, height: 0, borderTop: `3px dashed ${INK}` }} />
          TOP 5 AVG {fmt(axis.avg, axis.decimals || (axis.avg < 10 && axis.avg % 1 ? 1 : 0))}
        </span>
      </div>
    </div>
  );
};

const HexPanel: React.FC<{ axes: Axis[]; matches: number; primary: string; secondary: string }> = ({ axes, matches, primary, secondary }) => {
  const open = useAfter(T_HEX);
  const grid = useAfter(T_HEX + 350);
  const grow = useCountUp(1000, grid, HEX_GROW_MS, 450) / 1000;
  const avgOn = useAfter(T_HEX + 350 + 450 + HEX_GROW_MS - 200);
  const labelsAt = T_HEX + 350 + 600;

  const mvpFr = axes.map((a) => (a.best > 0 ? a.value / a.best : 0) * grow);
  const avgFr = axes.map((a) => (a.best > 0 ? a.avg / a.best : 0));
  const ringLen = 6 * HEX_R + 10;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: HEX_TOP,
        width: COL_W,
        height: HEX_H,
        background: WHITE,
        clipPath: open ? `polygon(0 0, 100% 0, 100% 100%, 22px 100%, 0 calc(100% - 22px))` : 'polygon(0 0, 0 0, 0 100%, 0 100%, 0 100%)',
        transition: `clip-path ${WIPE_MS}ms ${WIPE_EASE}`,
        color: INK,
      }}
    >
      {/* header bar: title · matches · legend */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: HEX_HEAD_H,
          background: PANEL,
          display: 'flex',
          alignItems: 'center',
          padding: '0 30px',
          gap: 18,
          fontSize: 19,
          letterSpacing: '0.22em',
          color: DIM,
          ...rise(grid, 0, 8),
        }}
      >
        <span style={{ width: 6, height: 24, background: primary }} />
        <span style={{ color: INK, fontSize: 22 }}>PERFORMANCE</span>
        <span>{matches > 0 ? `${matches} MATCHES · ` : ''}VS EVENT TOP 5</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 28, height: 14, background: alphaHex(primary, 0.35), border: `3px solid ${primary}`, boxSizing: 'border-box' }} />
          MVP
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 14 }}>
          <span style={{ width: 28, height: 0, borderTop: `3px dashed ${INK}` }} />
          TOP 5 AVG
        </span>
      </div>

      <svg width={COL_W} height={HEX_H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden>
        {/* rings — outer first, each draws itself in */}
        {Array.from({ length: HEX_RINGS }, (_, k) => {
          const r = (HEX_R * (HEX_RINGS - k)) / HEX_RINGS;
          return (
            <path
              key={k}
              d={ringPath(r)}
              fill={k === 0 ? PANEL : 'none'}
              stroke={k === 0 ? '#CFCFD6' : LINE}
              strokeWidth={k === 0 ? 3 : 2}
              strokeDasharray={ringLen}
              strokeDashoffset={grid ? 0 : ringLen}
              style={{ transition: `stroke-dashoffset 800ms cubic-bezier(.65,0,.25,1) ${k * 90}ms, fill-opacity 400ms linear`, fillOpacity: grid ? 1 : 0 }}
            />
          );
        })}
        {/* spokes */}
        {Array.from({ length: 6 }, (_, i) => {
          const [x, y] = pt(i, HEX_R);
          return (
            <line
              key={i}
              x1={HEX_CX}
              y1={HEX_CY}
              x2={x}
              y2={y}
              stroke={LINE}
              strokeWidth={2}
              strokeDasharray={HEX_R}
              strokeDashoffset={grid ? 0 : HEX_R}
              style={{ transition: `stroke-dashoffset 600ms cubic-bezier(.16,1,.3,1) ${200 + i * 50}ms` }}
            />
          );
        })}
        {/* MVP shape */}
        <path d={shapePath(mvpFr)} fill={alphaHex(primary, 0.32)} stroke={primary} strokeWidth={5} strokeLinejoin="miter" />
        {mvpFr.map((f, i) => {
          const [x, y] = pt(i, HEX_R * Math.max(0.04, Math.min(1, f)));
          return <rect key={i} x={x - 8} y={y - 8} width={16} height={16} fill={WHITE} stroke={primary} strokeWidth={4} transform={`rotate(45 ${x} ${y})`} style={{ opacity: grow > 0.05 ? 1 : 0 }} />;
        })}
        {/* top-5 average — drawn ON TOP of the MVP shape so it is never hidden */}
        <g style={{ opacity: avgOn ? 1 : 0, transition: 'opacity 500ms linear' }}>
          <path d={shapePath(avgFr)} fill="none" stroke={INK} strokeWidth={3} strokeDasharray="12 8" strokeLinejoin="round" />
          {avgFr.map((f, i) => {
            const [x, y] = pt(i, HEX_R * Math.max(0.04, Math.min(1, f)));
            return <circle key={i} cx={x} cy={y} r={5} fill={INK} />;
          })}
        </g>
        {/* centre pip */}
        <circle cx={HEX_CX} cy={HEX_CY} r={6} fill={secondary} style={{ opacity: grid ? 1 : 0, transition: 'opacity 300ms linear' }} />
      </svg>

      {axes.map((a, i) => (
        <CornerLabelAt key={a.key} at={labelsAt + i * LABEL_STAGGER} axis={a} index={i} avgShown={avgOn} />
      ))}
    </div>
  );
};

const CornerLabelAt: React.FC<{ at: number; axis: Axis; index: number; avgShown: boolean }> = ({ at, ...rest }) => {
  const on = useAfter(at);
  return <CornerLabel {...rest} on={on} />;
};

/* ─────────────────────────────────────────────
   Right column
   ───────────────────────────────────────────── */
const InfoColumn: React.FC<{
  mvp: MvpRow;
  all: MvpRow[];
  tournament: Tournament;
  round?: Round | null;
  primary: string;
  secondary: string;
}> = ({ mvp, all, tournament, round, primary, secondary }) => {
  const onPrimary = inkOn(primary);
  const strip = useAfter(T_COL);
  const idOn = useAfter(T_COL + 350);
  const name = (mvp.playerName || '').toUpperCase();
  const tour = (tournament.tournamentName || '').toUpperCase();
  const roundName = (round?.roundName || '').toUpperCase();

  // six axes; per-match averages use each player's own matches played
  const per = (p: MvpRow, k: 'killNum' | 'numericDamage') => (num(p.matches) > 0 ? Number(p[k] || 0) / num(p.matches) : 0);
  const defs: Array<{ key: string; label: string; get: (p: MvpRow) => number; decimals?: number }> = [
    { key: 'kills', label: 'KILLS', get: (p) => num(p.killNum) },
    { key: 'knock', label: 'KNOCKOUTS', get: (p) => num(p.knockouts) },
    { key: 'dmg', label: 'DAMAGE', get: (p) => num(p.numericDamage) },
    { key: 'adm', label: 'AVG DAMAGE', get: (p) => per(p, 'numericDamage') },
    { key: 'ast', label: 'ASSISTS', get: (p) => num(p.assists) },
    { key: 'akl', label: 'AVG KILLS', get: (p) => per(p, 'killNum'), decimals: 1 },
  ];
  const axes: Axis[] = defs.map((d) => {
    const vals = all.map(d.get);
    return {
      key: d.key,
      label: d.label,
      value: d.get(mvp),
      best: Math.max(0, ...vals),
      avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0,
      decimals: d.decimals,
    };
  });

  return (
    <div style={{ position: 'absolute', left: COL_X, top: TOP, width: COL_W, height: PH_H, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      {/* ink strip */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: COL_W, height: STRIP_H + 6, clipPath: 'polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%)' }}>
        <WipeX open={strip} width={COL_W} edge={primary}>
          <div style={{ position: 'absolute', inset: 0, background: INK, color: WHITE, display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 28 }}>
              <Star color={primary} size={32} />
              <span style={{ fontSize: 36, letterSpacing: '0.24em' }}>EVENT MVP</span>
            </div>
            <span
              style={{
                marginLeft: 28,
                fontSize: 22,
                letterSpacing: '0.2em',
                color: '#A6A6B0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
                flex: 1,
              }}
            >
              {tour}
            </span>
            {roundName && (
              <div
                style={{
                  height: STRIP_H,
                  alignSelf: 'flex-start',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 44px 0 48px',
                  background: primary,
                  color: onPrimary,
                  fontSize: 26,
                  letterSpacing: '0.16em',
                  clipPath: 'polygon(22px 0, 100% 0, 100% 100%, 0 100%)',
                  whiteSpace: 'nowrap',
                  flex: 'none',
                }}
              >
                {roundName}
              </div>
            )}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, background: secondary }} />
          </div>
        </WipeX>
      </div>

      {/* identity */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: STRIP_H + 6,
          width: COL_W,
          height: ID_H,
          background: WHITE,
          color: INK,
          display: 'flex',
          alignItems: 'center',
          gap: 30,
          padding: '0 30px',
          boxSizing: 'border-box',
          clipPath: idOn ? 'inset(0 0 0 0)' : 'inset(0 0 100% 0)',
          transition: `clip-path 600ms ${WIPE_EASE}`,
        }}
      >
        <div
          style={{
            width: 150,
            height: 150,
            flex: 'none',
            background: PANEL,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%)',
            ...pop(idOn, 250),
          }}
        >
          <span style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 7, background: primary }} />
          <TeamLogo
            logo={mvp.teamLogo}
            flag={mvp.teamFlag}
            fallback={'/def_logo.png'}
            alt=""
            style={{ width: 112, height: 112, maxWidth: 'none', objectFit: 'contain', display: 'block' }}
          />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...rise(idOn, 300) }}>
            <span style={{ background: INK, color: WHITE, fontSize: 24, letterSpacing: '0.12em', padding: '7px 12px 6px' }}>
              {(mvp.teamTag || '').toUpperCase()}
            </span>
            <span style={{ fontSize: 21, letterSpacing: '0.22em', color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {(mvp.teamName || '').toUpperCase()}
            </span>
          </div>
          <div
            style={{
              fontSize: nameSize(name),
              lineHeight: 0.92,
              marginTop: 14,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              ...rise(idOn, 420, 24),
            }}
          >
            {name}
          </div>
        </div>
      </div>

      <HexPanel axes={axes} matches={num(mvp.matches)} primary={primary} secondary={secondary} />
    </div>
  );
};

/* remounted on every replay so all timers restart cleanly */
const Scene: React.FC<{ players: MvpRow[]; tournament: Tournament; round?: Round | null; primary: string; secondary: string }> = ({
  players,
  tournament,
  round,
  primary,
  secondary,
}) => {
  const mvp = players[0];
  return (
    <>
      <PhotoCard mvp={mvp} torLogo={tournament.torLogo} primary={primary} secondary={secondary} />
      <InfoColumn
        mvp={mvp}
        all={players}
        tournament={tournament}
        round={round}
        primary={primary}
        secondary={secondary}
      />
    </>
  );
};

const EventMvp: React.FC<EventMvpProps> = ({ tournament, round, matchDatas = [] }) => {
  // MVP is selected by the shared Fragger Score, pooled from matchDatas
  // rather than overallData.teams — overallData's maxKillDistance is a
  // running SUM across matches on the backend, not a max, so it can't
  // supply "longest single kill of the event" correctly. Stat boxes show
  // event-cumulative totals (not per-match averages).
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
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
      {players.length > 0 ? (
        <Scene
          key={`scene-${run}-${useDemo ? 'demo' : 'live'}`}
          players={players}
          tournament={tournament}
          round={round}
          primary={primary}
          secondary={secondary}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            letterSpacing: '0.24em',
            color: DIM,
          }}
        >
          NO OVERALL DATA AVAILABLE
        </div>
      )}

      {/* preview — BELOW the 1920×1080 canvas */}
      <button type="button" onClick={preview} style={btn}>
        ▶ PREVIEW EVENT MVP
      </button>
    </div>
  );
};

export default EventMvp;