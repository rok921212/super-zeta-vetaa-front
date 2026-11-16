import React, { useEffect, useMemo, useState } from 'react';
import { pickStandingTeam } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';

/* THEME8 "WHITE LABEL" — 1ST RUNNER-UP.
   Same template as Champions.tsx (card wipes, info card, podium, rising
   roster cards, preview button) — only the featured team changes:
   pickStandingTeam(matchDatas, overallData, 1) is the 1ST RUNNER-UP.
   The podium still lists rows 0/1/2 with the featured row highlighted, and
   the header shows the gap to the team directly above (1ST).
   PREVIEW: "▶ PREVIEW 1ST RUNNER-UP" sits just BELOW the 1920×1080 canvas. */

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

const DEF_PLAYER =
  '/def_char.avif'; /* fallback for missing player photo (not used for team logo) */

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const PANEL = '#EFEFF2';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
/* ── featured standings row (0 = champion) ── */
const RANK = 1;
const TITLE = '1ST RUNNER-UP';
const PLACE_LABEL = '2ND PLACE';
const ABOVE_LABEL = '1ST';

const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const TOP = 100;
const LEFT = 80;
const BLOCK_H = 880;
const CARD_BLOCK_W = 760; // champion card
const ROSTER_X = LEFT + CARD_BLOCK_W + 40; // 880
const ROSTER_W = 1840 - ROSTER_X; // 960
const P_GAP = 16;
const P_W = (ROSTER_W - P_GAP * 3) / 4; // 228
const P_PHOTO_H = 500;
const P_NAME_H = 70;
const CUT = 28; // corner chamfer

const STRIP_H = 64;
const ID_H = 290;
const PTS_H = 170;
const SPLIT_H = 96;
const POD_HEAD_H = 46;
const POD_ROW_H = (BLOCK_H - STRIP_H - ID_H - PTS_H - SPLIT_H - POD_HEAD_H) / 3; // 71.33 → floor below
const POD_ROW = Math.floor(POD_ROW_H);

const cardClip = `polygon(0 0, calc(100% - ${CUT}px) 0, 100% ${CUT}px, 100% 100%, ${CUT}px 100%, 0 calc(100% - ${CUT}px))`;

/* ── motion ── */
const WIPE_MS = 650;
const WIPE_EASE = 'cubic-bezier(.65,0,.25,1)';
const T_PLATE = 60;
const T_THEME = 1250;
const T_INFO = 2350;
const T_ROSTER = 3300;
const R_STAGGER = 260;
const R_RISE_MS = 900;
const R_OPEN_AFTER = R_RISE_MS + 450; // face holds, then the card opens
const RISE_FROM = 1080 - TOP + 60; // start fully below the bottom of the canvas

/* ── dummy data for the preview button ── */
const DEMO_PLAYERS: Player[] = [
  { _id: 'd1', playerName: 'VIPER', killNum: 41 },
  { _id: 'd2', playerName: 'SHADOW', killNum: 33 },
  { _id: 'd3', playerName: 'KRYPTO', killNum: 19 },
  { _id: 'd4', playerName: 'NEXUS', killNum: 25 },
];
const DEMO_ROWS: StandingRow[] = [
  { teamName: 'APEX ROYALS', teamTag: 'APX', teamLogo: '/def_logo.png', wwcd: 4, placePoints: 112, totalKills: 129, total: 241, players: DEMO_PLAYERS },
  { teamName: 'DUMMY ESPORTS', teamTag: 'DMY', teamLogo: '/def_logo.png', wwcd: 3, placePoints: 96, totalKills: 118, total: 214, players: DEMO_PLAYERS },
  { teamName: 'TEAM STORM', teamTag: 'STRM', teamLogo: '/def_logo.png', wwcd: 1, placePoints: 84, totalKills: 88, total: 172, players: DEMO_PLAYERS },
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
const num = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};

/* balanced 1–2 line split for long team names */
function fitName(raw: string): { lines: string[]; size: number } {
  const name = (raw || '').toUpperCase().trim();
  if (name.length <= 12) return { lines: [name], size: 76 };
  if (name.length <= 16) return { lines: [name], size: 62 };
  const words = name.split(/\s+/);
  if (words.length > 1) {
    let best = [name, ''];
    let bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const d = Math.abs(a.length - b.length);
      if (d < bestDiff) {
        bestDiff = d;
        best = [a, b];
      }
    }
    const longest = Math.max(best[0].length, best[1].length);
    return { lines: best, size: longest <= 12 ? 58 : longest <= 16 ? 48 : 40 };
  }
  return { lines: [name], size: name.length <= 22 ? 46 : 36 };
}

/* flips true after `ms` (double rAF so the "before" state is painted first) */
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

/* number counts up 0 → target once `active` */
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

/* staggered rise used for rows inside the info card */
const rise = (on: boolean, delay: number, dist = 16): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : `translateY(${dist}px)`,
  transition: `opacity 350ms linear ${delay}ms, transform 520ms cubic-bezier(.16,1,.3,1) ${delay}ms`,
});
const slideIn = (on: boolean, delay: number): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : 'translateX(-36px)',
  transition: `opacity 300ms linear ${delay}ms, transform 560ms cubic-bezier(.16,1,.3,1) ${delay}ms`,
});
const pop = (on: boolean, delay: number): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : 'scale(.6)',
  transition: `opacity 250ms linear ${delay}ms, transform 600ms cubic-bezier(.34,1.56,.64,1) ${delay}ms`,
});

/* ─────────────────────────────────────────────
   Left-to-right wipe layer. Content is pinned to full width so it is
   revealed, not squashed; a coloured leading edge rides the wipe.
   ───────────────────────────────────────────── */
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
const Trophy = ({ color, size = 30 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ display: 'block', flex: 'none' }}>
    <path
      d="M11 4 H29 V14 C29 20 25 24 20 24 C15 24 11 20 11 14 Z M11 7 H4 V11 C4 16 7 19 11 19.5 V16.5 C8.5 16 7 14 7 11 V10 H11 Z M29 7 H36 V11 C36 16 33 19 29 19.5 V16.5 C31.5 16 33 14 33 11 V10 H29 Z M17.5 24 H22.5 V30 H27 V36 H13 V30 H17.5 Z"
      fill={color}
    />
  </svg>
);
const Crown = ({ color, size = 18 }: { color: string; size?: number }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block', flex: 'none' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
  </svg>
);

/* ─────────────────────────────────────────────
   Info card (step-3 layer)
   ───────────────────────────────────────────── */
const InfoCard: React.FC<{
  champ: StandingRow;
  podiumRows: Array<StandingRow | null>;
  tournament: Tournament;
  round?: Round | null;
  primary: string;
  secondary: string;
  on: boolean;
}> = ({ champ, podiumRows, tournament, round, primary, secondary, on }) => {
  const onPrimary = inkOn(primary);
  const total = num(champ.total);
  const place = num(champ.placePoints);
  const kills = num(champ.totalKills);
  const wwcd = num(champ.wwcd);
  const above = podiumRows[RANK - 1] || null;
  const lead = above ? Math.max(0, num(above.total) - total) : 0; // points behind the team above

  const cTotal = useCountUp(total, on, 1300, 450);
  const cWwcd = useCountUp(wwcd, on, 700, 650);
  const cPlace = useCountUp(place, on, 1000, 700);
  const cKills = useCountUp(kills, on, 1000, 750);
  const cLead = useCountUp(lead, on, 900, 1100);

  const splitSum = place + kills || 1;
  const placePct = Math.round((place / splitSum) * 100);
  const killPct = 100 - placePct;

  const { lines, size } = fitName(champ.teamName || champ.teamTag || '');
  const roundName = (round?.roundName || '').toUpperCase();
  const tourName = (tournament.tournamentName || '').toUpperCase();

  const leaderTotal = num(podiumRows[0]?.total);
  const podium: Array<{ rank: number; row: StandingRow; gap: number | null }> = podiumRows
    .map((row, i) => (row ? { rank: i + 1, row, gap: i === 0 ? null : num(row.total) - leaderTotal } : null))
    .filter((p): p is { rank: number; row: StandingRow; gap: number | null } => !!p);

  const label: React.CSSProperties = { fontSize: 20, letterSpacing: '0.26em', color: DIM };

  return (
    <div style={{ position: 'absolute', inset: 0, background: WHITE, color: INK, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      {/* A — ink strip */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: STRIP_H,
          background: INK,
          color: WHITE,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...rise(on, 150, 10) }}>
          <Trophy color={primary} size={34} />
          <span style={{ fontSize: 36, letterSpacing: '0.24em' }}>{TITLE}</span>
        </div>
        {roundName && (
          <div
            style={{
              marginLeft: 'auto',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              padding: '0 40px 0 48px',
              background: primary,
              color: onPrimary,
              fontSize: 26,
              letterSpacing: '0.16em',
              clipPath: 'polygon(22px 0, 100% 0, 100% 100%, 0 100%)',
              maxWidth: 360,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              ...rise(on, 250, 10),
            }}
          >
            {roundName}
          </div>
        )}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: STRIP_H, height: 6, background: secondary }} />

      {/* B — identity */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: STRIP_H + 6,
          height: ID_H - 6,
          display: 'flex',
          alignItems: 'center',
          padding: '0 30px',
          gap: 32,
          boxShadow: `inset 0 -1px 0 ${LINE}`,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 228,
            height: 228,
            flex: 'none',
            background: PANEL,
            clipPath: `polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...pop(on, 250),
          }}
        >
          <span style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 8, background: primary }} />
          <TeamLogo
            logo={champ.teamLogo}
            flag={champ.teamFlag}
            fallback={'/def_logo.png'}
            alt=""
            style={{ width: 176, height: 176, maxWidth: 'none', objectFit: 'contain', display: 'block' }}
          />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...rise(on, 350) }}>
            <span style={{ background: INK, color: WHITE, fontSize: 24, letterSpacing: '0.12em', padding: '7px 12px 6px' }}>
              {(champ.teamTag || '').toUpperCase()}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, letterSpacing: '0.24em', color: primary }}>
              <Crown color={primary} size={22} /> {PLACE_LABEL}
            </span>
          </div>
          <div style={{ marginTop: 14, ...rise(on, 450) }}>
            {lines.map((l, i) => (
              <div
                key={i}
                style={{
                  fontSize: size,
                  lineHeight: 0.98,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '0.01em',
                }}
              >
                {l}
              </div>
            ))}
          </div>
          {tourName && (
            <div
              style={{
                marginTop: 16,
                fontSize: 20,
                letterSpacing: '0.2em',
                color: DIM,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                ...rise(on, 550),
              }}
            >
              {tourName}
            </div>
          )}
        </div>
      </div>

      {/* C — points: TOTAL (primary) + WWCD / PLACE / ELIMS */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: STRIP_H + ID_H,
          height: PTS_H,
          display: 'flex',
          boxShadow: `inset 0 -1px 0 ${LINE}`,
        }}
      >
        <div
          style={{
            width: 270,
            flex: 'none',
            background: primary,
            color: onPrimary,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingLeft: 30,
            clipPath: 'polygon(0 0, 100% 0, calc(100% - 26px) 100%, 0 100%)',
            ...slideIn(on, 400),
          }}
        >
          <span style={{ fontSize: 22, letterSpacing: '0.28em', opacity: 0.85 }}>TOTAL PTS</span>
          <span style={{ fontSize: 112, lineHeight: 0.9, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{cTotal}</span>
        </div>
        {[
          {
            k: 'WWCD',
            v: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <img src="/chicken.png" alt="" style={{ width: 44, height: 44, maxWidth: 'none', objectFit: 'contain' }} />
                {cWwcd}
              </span>
            ),
          },
          { k: 'PLACE', v: cPlace },
          { k: 'ELIMS', v: cKills },
        ].map((s, i) => (
          <div
            key={s.k}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              boxShadow: i ? `inset 1px 0 0 ${LINE}` : 'none',
              ...rise(on, 550 + i * 110),
            }}
          >
            <span style={{ fontSize: 68, fontVariantNumeric: 'tabular-nums' }}>{s.v}</span>
            <span style={{ ...label, marginTop: 12 }}>{s.k}</span>
          </div>
        ))}
      </div>

      {/* D — points split */}
      <div
        style={{
          position: 'absolute',
          left: 30,
          right: 30,
          top: STRIP_H + ID_H + PTS_H,
          height: SPLIT_H,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          ...rise(on, 900),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ ...label, fontSize: 19 }}>
            PLACEMENT <span style={{ color: INK, fontSize: 24, letterSpacing: '0.04em', marginLeft: 6 }}>{placePct}%</span>
          </span>
          <span style={{ ...label, fontSize: 19 }}>
            <span style={{ color: INK, fontSize: 24, letterSpacing: '0.04em', marginRight: 6 }}>{killPct}%</span> ELIMS
          </span>
        </div>
        <div style={{ position: 'relative', height: 18, marginTop: 12, background: PANEL, overflow: 'hidden' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: on ? `${placePct}%` : '0%',
              background: INK,
              transition: `width 1000ms cubic-bezier(.16,1,.3,1) 1000ms`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: on ? `calc(${killPct}% - 4px)` : '0%',
              background: primary,
              transition: `width 1000ms cubic-bezier(.16,1,.3,1) 1000ms`,
            }}
          />
        </div>
      </div>

      {/* E — podium */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: STRIP_H + ID_H + PTS_H + SPLIT_H,
          height: POD_HEAD_H,
          background: PANEL,
          display: 'flex',
          alignItems: 'center',
          padding: '0 30px',
          ...rise(on, 1050, 8),
        }}
      >
        <span style={{ ...label, color: INK }}>FINAL PODIUM</span>
        {lead > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 20, letterSpacing: '0.18em', color: DIM }}>
            BEHIND {ABOVE_LABEL} <span style={{ color: primary, fontSize: 28, letterSpacing: '0.02em', marginLeft: 8 }}>-{cLead}</span>
          </span>
        )}
      </div>
      {podium.map((p, i) => {
        const first = p.rank === RANK + 1; // featured team
        return (
          <div
            key={p.rank}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: STRIP_H + ID_H + PTS_H + SPLIT_H + POD_HEAD_H + i * POD_ROW,
              height: POD_ROW,
              display: 'flex',
              alignItems: 'center',
              boxShadow: i < podium.length - 1 ? `inset 0 -1px 0 ${LINE}` : 'none',
              background: first ? `linear-gradient(90deg, ${primary}1F, transparent 70%)` : 'transparent',
              ...slideIn(on, 1200 + i * 150),
            }}
          >
            <div
              style={{
                width: 74,
                height: '100%',
                flex: 'none',
                background: first ? primary : INK,
                color: first ? onPrimary : WHITE,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 38,
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)',
                paddingRight: 10,
              }}
            >
              {p.rank}
            </div>
            <div style={{ width: 52, height: 52, flex: 'none', marginLeft: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TeamLogo
                logo={p.row.teamLogo}
                flag={p.row.teamFlag}
                fallback={'/def_logo.png'}
                alt=""
                style={{ width: 52, height: 52, maxWidth: 'none', objectFit: 'contain', display: 'block' }}
              />
            </div>
            <div style={{ marginLeft: 16, minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <span style={{ fontSize: 34, whiteSpace: 'nowrap' }}>{(p.row.teamTag || '').toUpperCase()}</span>
              <span
                style={{
                  fontSize: 20,
                  letterSpacing: '0.12em',
                  color: DIM,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {(p.row.teamName || '').toUpperCase()}
              </span>
            </div>
            {num(p.row.wwcd) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 24, color: DIM, marginRight: 20 }}>
                <Crown color={first ? primary : DIM} size={20} />
                {num(p.row.wwcd)}
              </div>
            )}
            <div style={{ width: 92, textAlign: 'right', fontSize: 40, fontVariantNumeric: 'tabular-nums' }}>{num(p.row.total)}</div>
            <div
              style={{
                width: 84,
                marginRight: 24,
                textAlign: 'right',
                fontSize: 24,
                color: first ? primary : DIM,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {p.gap == null ? 'PTS' : p.gap}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ─────────────────────────────────────────────
   Champion card — three stacked wipe layers
   ───────────────────────────────────────────── */
const ChampionCard: React.FC<{
  champ: StandingRow;
  podiumRows: Array<StandingRow | null>;
  tournament: Tournament;
  round?: Round | null;
  primary: string;
  secondary: string;
}> = (props) => {
  const { champ, tournament, primary, secondary } = props;
  const onPrimary = inkOn(primary);
  const s1 = useAfter(T_PLATE);
  const s2 = useAfter(T_THEME);
  const s3 = useAfter(T_INFO);
  // contents of the info card animate once its wipe has mostly landed
  const infoOn = useAfter(T_INFO + 250);

  return (
    <div
      style={{
        position: 'absolute',
        left: LEFT,
        top: TOP,
        width: CARD_BLOCK_W,
        height: BLOCK_H,
        clipPath: cardClip,
        filter: 'drop-shadow(0 18px 40px rgba(0,0,0,.25))',
      }}
    >
      {/* 1 — white plate + tournament logo */}
      <WipeX open={s1} width={CARD_BLOCK_W} edge={INK}>
        <div style={{ position: 'absolute', inset: 0, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={tournament.torLogo || '/def_logo.png'}
            alt=""
            style={{ width: 300, height: 300, maxWidth: 'none', objectFit: 'contain', ...pop(s1, 250) }}
          />
        </div>
      </WipeX>

      {/* 2 — theme panel + champion logo */}
      <WipeX open={s2} width={CARD_BLOCK_W} edge={secondary}>
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
            fontFamily: FONT,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 220,
              background: `repeating-linear-gradient(135deg, transparent 0 22px, ${onPrimary === WHITE ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)'} 22px 44px)`,
            }}
          />
          <TeamLogo
            logo={champ.teamLogo}
            flag={champ.teamFlag}
            fallback={'/def_logo.png'}
            alt=""
            style={{ width: 300, height: 300, maxWidth: 'none', objectFit: 'contain', display: 'block', ...pop(s2, 250) }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 34, ...rise(s2, 450) }}>
            <Trophy color={onPrimary} size={52} />
            <span style={{ fontSize: 74, letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>{TITLE}</span>
          </div>
        </div>
      </WipeX>

      {/* 3 — info */}
      <WipeX open={s3} width={CARD_BLOCK_W} edge={primary}>
        <InfoCard {...props} on={infoOn} />
      </WipeX>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Roster card — rises from below, team-logo face, opens upward
   ───────────────────────────────────────────── */
const RosterCard: React.FC<{
  player: Player;
  index: number;
  teamKills: number;
  top: boolean;
  champ: StandingRow;
  primary: string;
  secondary: string;
}> = ({ player, index, teamKills, top, champ, primary, secondary }) => {
  const onPrimary = inkOn(primary);
  const start = T_ROSTER + index * R_STAGGER;
  const up = useAfter(start);
  const open = useAfter(start + R_OPEN_AFTER);
  const kills = num(player.killNum);
  const share = teamKills > 0 ? Math.round((kills / teamKills) * 100) : 0;
  const cKills = useCountUp(kills, open, 900, 350);
  const cShare = useCountUp(share, open, 900, 500);
  const name = (player.playerName || '').toUpperCase();
  const nameSize = name.length <= 9 ? 38 : name.length <= 12 ? 32 : name.length <= 15 ? 26 : 22;
  const tag = (champ.teamTag || '').toUpperCase();

  return (
    <div
      style={{
        position: 'relative',
        width: P_W,
        height: BLOCK_H,
        flex: 'none',
        transform: up ? 'none' : `translateY(${RISE_FROM}px)`,
        transition: `transform ${R_RISE_MS}ms cubic-bezier(.16,1,.3,1)`,
        filter: 'drop-shadow(0 18px 34px rgba(0,0,0,.25))',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: `polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px))`,
          fontFamily: FONT,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {/* face — team logo on the theme colour */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: index % 2 ? INK : primary,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 26,
            color: index % 2 ? WHITE : onPrimary,
          }}
        >
          <TeamLogo
            logo={champ.teamLogo}
            flag={champ.teamFlag}
            fallback={'/def_logo.png'}
            alt=""
            style={{ width: 150, height: 150, maxWidth: 'none', objectFit: 'contain', display: 'block' }}
          />
          <span style={{ fontSize: 30, letterSpacing: '0.24em', paddingLeft: '0.24em' }}>{tag}</span>
        </div>

        {/* info — opens upward from the bottom */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: open ? BLOCK_H : 0,
            overflow: 'hidden',
            transition: `height ${WIPE_MS + 100}ms ${WIPE_EASE}`,
          }}
        >
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: BLOCK_H, background: WHITE, color: INK }}>
            {/* photo */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: P_PHOTO_H, background: PANEL, overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  left: -40,
                  right: -40,
                  top: 140,
                  height: 170,
                  background: primary,
                  transform: 'skewY(-14deg)',
                  opacity: 0.95,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: -40,
                  right: -40,
                  top: 318,
                  height: 14,
                  background: secondary,
                  transform: 'skewY(-14deg)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 14,
                  top: 18,
                  fontSize: 96,
                  letterSpacing: '0.02em',
                  color: INK,
                  opacity: 0.07,
                  whiteSpace: 'nowrap',
                }}
              >
                {tag}
              </div>
              <img
                src={playerPhoto(player.picUrl) || DEF_PLAYER}
                alt={player.playerName}
                style={{
                  position: 'absolute',
                  left: 0,
                  bottom: 0,
                  width: P_W,
                  height: P_PHOTO_H - 30,
                  maxWidth: 'none',
                  objectFit: 'cover',
                  objectPosition: 'center top',
                  display: 'block',
                  opacity: open ? 1 : 0,
                  transform: open ? 'none' : 'translateY(40px)',
                  transition: 'opacity 300ms linear 250ms, transform 700ms cubic-bezier(.16,1,.3,1) 250ms',
                }}
              />
              {top && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: INK,
                    color: WHITE,
                    fontSize: 18,
                    letterSpacing: '0.18em',
                    padding: '9px 18px 8px 12px',
                    clipPath: 'polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)',
                    ...pop(open, 700),
                    transformOrigin: 'left top',
                  }}
                >
                  <Crown color={primary} size={20} /> TOP FRAGGER
                </div>
              )}
            </div>

            {/* name bar */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: P_PHOTO_H,
                height: P_NAME_H,
                background: INK,
                color: WHITE,
                display: 'flex',
                alignItems: 'center',
                padding: '0 18px',
              }}
            >
              <span style={{ fontSize: nameSize, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
            </div>
            <div style={{ position: 'absolute', left: 0, top: P_PHOTO_H + P_NAME_H, height: 6, width: '100%', background: primary }} />

            {/* kills */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: P_PHOTO_H + P_NAME_H + 6,
                height: 160,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                boxShadow: `inset 0 -1px 0 ${LINE}`,
              }}
            >
              <span style={{ fontSize: 22, letterSpacing: '0.26em', color: DIM }}>ELIMS</span>
              <span style={{ fontSize: 96, fontVariantNumeric: 'tabular-nums' }}>{cKills}</span>
            </div>

            {/* kill share */}
            <div
              style={{
                position: 'absolute',
                left: 20,
                right: 20,
                top: P_PHOTO_H + P_NAME_H + 6 + 160,
                bottom: 22,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 19, letterSpacing: '0.22em', color: DIM }}>KILL SHARE</span>
                <span style={{ fontSize: 36, fontVariantNumeric: 'tabular-nums' }}>{cShare}%</span>
              </div>
              <div style={{ position: 'relative', height: 14, marginTop: 14, background: PANEL, overflow: 'hidden' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: open ? `${share}%` : '0%',
                    background: top ? primary : INK,
                    transition: 'width 900ms cubic-bezier(.16,1,.3,1) 500ms',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Scene — remounted on every replay so all timers restart cleanly
   ───────────────────────────────────────────── */
const Scene: React.FC<{
  champ: StandingRow;
  podiumRows: Array<StandingRow | null>;
  tournament: Tournament;
  round?: Round | null;
  primary: string;
  secondary: string;
}> = (props) => {
  const { champ, primary, secondary } = props;
  const players = (champ.players || []).slice(0, 4);
  const teamKills = num(champ.totalKills) || players.reduce((s, p) => s + num(p.killNum), 0);
  const topKills = players.reduce((m, p) => Math.max(m, num(p.killNum)), 0);
  const topIdx = topKills > 0 ? players.findIndex((p) => num(p.killNum) === topKills) : -1;

  return (
    <>
      <ChampionCard {...props} />
      <div
        style={{
          position: 'absolute',
          left: ROSTER_X,
          top: TOP,
          width: ROSTER_W,
          height: BLOCK_H,
          display: 'flex',
          gap: P_GAP,
        }}
      >
        {players.map((p, i) => (
          <RosterCard
            key={p._id || i}
            player={p}
            index={i}
            teamKills={teamKills}
            top={i === topIdx}
            champ={champ}
            primary={primary}
            secondary={secondary}
          />
        ))}
      </div>
    </>
  );
};

const FirstRunnerUp: React.FC<RunnerUpProps> = ({ tournament, round, overallData, matchDatas = [] }) => {
  // Shared standings pick (Total Score primary). row 1 = 1st runner-up;
  // rows 0..2 fill the podium.
  const podium = useMemo(
    () =>
      overallData
        ? [0, 1, 2].map((i) => pickStandingTeam(matchDatas as any, overallData as any, i) as StandingRow | null)
        : [null, null, null],
    [overallData, matchDatas]
  );
  const featured = podium[RANK];

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;

  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);

  const hasData = !!(overallData && featured);
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

  const champ = (useDemo ? DEMO_ROWS[RANK] : hasData ? featured : null) as StandingRow | null;
  const rows = useDemo ? DEMO_ROWS : podium;

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
      {champ ? (
        <Scene
          key={`scene-${run}-${useDemo ? 'demo' : 'live'}`}
          champ={champ}
          podiumRows={rows}
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
          NO OVERALL DATA
        </div>
      )}

      {/* preview — BELOW the 1920×1080 canvas */}
      <button type="button" onClick={preview} style={btn}>
        ▶ PREVIEW 1ST RUNNER-UP
      </button>
    </div>
  );
};

export default FirstRunnerUp;