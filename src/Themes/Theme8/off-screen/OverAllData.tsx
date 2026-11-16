import React, { useEffect, useMemo, useState } from 'react';
import {
  computeRankedStandings,
  compareOfficialStandings,
  RankedTeam,
} from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';

/* THEME8 "WHITE LABEL" — Overall Standings, ONE PAGE (no pager).
   Data preserved: computeRankedStandings(matchDatas), or the overallData
   snapshot fallback sorted by compareOfficialStandings (rankChange null) —
   exactly as before.
   Added: the leader's player photos (from the newest match that has them,
   else the overall snapshot) and the leader's lead over 2nd. Teams are shown
   by their full name.

   Layout (1920×1080):
   ┌ [logo] OVERALL STANDINGS · tournament                       [ ROUND ] ┐
   ├ LEADER BAND ─────────────────────────────────────────────────────────┤
   │ ▌1▐ logo TEAM NAME · LEAD +x       │ photo │ photo │ photo │ photo │
   │     TOTAL │ WWCD │ PLACE │ ELIMS    │       │       │       │       │
   ├ # ▲▼ TEAM  WWCD PLACE ELIMS TOTAL ──┬─ # ▲▼ TEAM  WWCD PLACE ELIMS TOTAL ┤
   │ rows 1 … ⌈n/2⌉                      │ rows ⌈n/2⌉+1 … n                  │
   └─────────────────────────────────────┴───────────────────────────────────┘
   Two columns, at least 10 rows each; with more than 20 teams both columns
   grow downward and the row height shrinks so every team fits.

   Entrance (state + CSS transitions only — no keyframes, no reduced-motion
   kill-switch):
     header plate wipes in, tags slide in
     leader band — three steps: ink panel with "1", theme panel with the team
       logo, then the band opens; player photos rise one by one, numbers count up
     table — each row: a theme sliver, then the white row wipes over it; row
       by row down both columns together; totals count up
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

const DEF_LOGO = 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1730785916/default_ryi6uf_edmapm.png';
const DEF_PLAYER = '/def_char.avif';

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const PANEL = '#EFEFF2';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
const GREY_TXT = '#A6A6B0';
const UP = '#13B24A';
const DOWN = '#E5323B';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const SIDE = 80;
const W = 1920 - SIDE * 2; // 1760
const HEAD_TOP = 36;
const HEAD_H = 104;
const LEAD_TOP = 160;
const LEAD_H = 280;
const RANK_W = 120;
const ID_W = 560;
const COL_GAP = 20;
const COL_W = (W - COL_GAP) / 2; // 870
const COLS_TOP = 462;
const COLS_HEAD_H = 34;
const ROWS_TOP = COLS_TOP + COLS_HEAD_H + 6;
const ROWS_BOTTOM = 1044;
const ROW_GAP = 4;
const MIN_ROWS = 10;

/* table columns */
const C_RANK = 58;
const C_CHG = 52;
const C_WWCD = 74;
const C_PLACE = 84;
const C_ELIMS = 84;
const C_TOTAL = 104;

/* ── motion ── */
const WIPE_MS = 560;
const EASE = 'cubic-bezier(.65,0,.25,1)';
const T_HEAD = 60;
const T_LEAD_INK = 450;
const T_LEAD_THEME = 1300;
const T_LEAD_OPEN = 2150;
const PHOTO_STAGGER = 150;
const T_ROWS = 2500;
const ROW_STAGGER = 70;
const SLIVER_LEAD = 150;

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
    if (!active) return;
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
  transition: `opacity 320ms linear ${delay}ms, transform 540ms cubic-bezier(.16,1,.3,1) ${delay}ms`,
});
const pop = (on: boolean, delay: number): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : 'scale(.55)',
  transition: `opacity 250ms linear ${delay}ms, transform 600ms cubic-bezier(.34,1.56,.64,1) ${delay}ms`,
});

/** left-to-right wipe; content pinned to full width; a coloured edge rides it */
const WipeX: React.FC<{ open: boolean; width: number; edge: string; children: React.ReactNode }> = ({ open, width, edge, children }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: open ? width : 0, overflow: 'hidden', transition: `width ${WIPE_MS + 100}ms ${EASE}` }}>
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
        transition: `opacity 140ms linear ${open ? WIPE_MS : 0}ms`,
      }}
    />
  </div>
);

const Crown = ({ color, size = 18 }: { color: string; size?: number }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block', flex: 'none' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
  </svg>
);

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

/* ─────────────────────────────────────────────
   Header
   ───────────────────────────────────────────── */
const Header: React.FC<{ tournament: Tournament; round?: Round | null; primary: string; secondary: string }> = ({
  tournament,
  round,
  primary,
  secondary,
}) => {
  const onPrimary = inkOn(primary);
  const plate = useAfter(T_HEAD);
  const text = useAfter(T_HEAD + 280);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: SIDE,
          top: HEAD_TOP,
          height: HEAD_H,
          display: 'flex',
          clipPath: plate ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          transition: `clip-path ${WIPE_MS + 150}ms ${EASE}`,
        }}
      >
        <div style={{ width: HEAD_H, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <img src={tournament.torLogo || '/def_logo.png'} alt="" style={{ width: 68, height: 68, maxWidth: 'none', objectFit: 'contain', display: 'block', ...pop(text, 0) }} />
        </div>
        <div style={{ width: 8, background: secondary, flex: 'none' }} />
        <div
          style={{
            background: WHITE,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 64px 0 28px',
            clipPath: 'polygon(0 0, 100% 0, calc(100% - 36px) 100%, 0 100%)',
          }}
        >
          <div style={{ fontSize: 20, letterSpacing: '0.24em', color: DIM, whiteSpace: 'nowrap', ...rise(text, 0, 8) }}>
            {(tournament.tournamentName || '').toUpperCase()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, ...rise(text, 100, 14) }}>
            <span style={{ fontSize: 62, lineHeight: 0.9, color: INK }}>OVERALL</span>
            <span
              style={{
                fontSize: 62,
                lineHeight: 0.9,
                background: primary,
                color: onPrimary,
                padding: '4px 24px 0 18px',
                clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
              }}
            >
              STANDINGS
            </span>
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', right: SIDE, top: HEAD_TOP + 22, display: 'flex', gap: 10 }}>
        {[{ text: (round?.roundName || '').toUpperCase(), bg: INK, fg: WHITE }]
          .filter((t) => t.text)
          .map((t, i) => (
            <div
              key={i}
              style={{
                height: 58,
                display: 'flex',
                alignItems: 'center',
                padding: '0 28px 0 36px',
                background: t.bg,
                color: t.fg,
                fontSize: 32,
                letterSpacing: '0.1em',
                clipPath: 'polygon(18px 0, 100% 0, 100% 100%, 0 100%)',
                opacity: text ? 1 : 0,
                transform: text ? 'none' : 'translateX(60px)',
                transition: `opacity 300ms linear ${i * 110}ms, transform 600ms cubic-bezier(.16,1,.3,1) ${i * 110}ms`,
              }}
            >
              {t.text}
            </div>
          ))}
      </div>
    </>
  );
};

/* ─────────────────────────────────────────────
   Leader band — three steps, then the roster rises
   ───────────────────────────────────────────── */
const LeaderBand: React.FC<{ team: Row; second?: Row; roster: RosterPlayer[]; primary: string; secondary: string }> = ({
  team,
  second,
  roster,
  primary,
  secondary,
}) => {
  const onPrimary = inkOn(primary);
  const s1 = useAfter(T_LEAD_INK);
  const s2 = useAfter(T_LEAD_THEME);
  const s3 = useAfter(T_LEAD_OPEN);
  const live = useAfter(T_LEAD_OPEN + 250);

  const total = useCountUp(num(team.totalScore), live, 1200, 200);
  const wwcd = useCountUp(num(team.wwcd), live, 700, 300);
  const place = useCountUp(num(team.totalPlacePoints), live, 1000, 350);
  const elims = useCountUp(num(team.totalKills), live, 1000, 400);
  const lead = second ? num(team.totalScore) - num(second.totalScore) : 0;

  const name = (team.teamName || team.teamTag || '').toUpperCase();
  // one line while it fits, otherwise up to two lines
  const nameSize = name.length <= 12 ? 60 : name.length <= 17 ? 46 : name.length <= 30 ? 40 : 32;
  const bigNameSize = name.length <= 10 ? 96 : name.length <= 16 ? 72 : name.length <= 22 ? 56 : 44;
  const photoW = (W - RANK_W - ID_W) / Math.max(1, roster.length || 4);

  return (
    <div
      style={{
        position: 'absolute',
        left: SIDE,
        top: LEAD_TOP,
        width: W,
        height: LEAD_H,
        clipPath: 'polygon(0 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 30px 100%, 0 calc(100% - 30px))',
        filter: 'drop-shadow(0 16px 34px rgba(0,0,0,.25))',
      }}
    >
      {/* 1 — ink panel, "1" */}
      <WipeX open={s1} width={W} edge={primary}>
        <div style={{ position: 'absolute', inset: 0, background: INK, color: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
          <Crown color={primary} size={70} />
          <span style={{ fontSize: 150, lineHeight: 0.85, ...pop(s1, 250) }}>1</span>
          <span style={{ fontSize: 40, letterSpacing: '0.3em', color: GREY_TXT, ...rise(s1, 350, 10) }}>OVERALL LEADER</span>
        </div>
      </WipeX>

      {/* 2 — theme panel, team logo */}
      <WipeX open={s2} width={W} edge={secondary}>
        <div style={{ position: 'absolute', inset: 0, background: primary, color: onPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
          <TeamLogo
            logo={team.teamLogo}
            flag={team.teamFlag}
            fallback={DEF_LOGO}
            alt=""
            style={{ width: 190, height: 190, maxWidth: 'none', objectFit: 'contain', display: 'block', ...pop(s2, 250) }}
          />
          <span style={{ fontSize: bigNameSize, lineHeight: 0.9, maxWidth: W - 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...rise(s2, 380, 16) }}>{name}</span>
        </div>
      </WipeX>

      {/* 3 — the band */}
      <WipeX open={s3} width={W} edge={INK}>
        <div style={{ position: 'absolute', inset: 0, background: WHITE, color: INK, display: 'flex' }}>
          {/* rank block */}
          <div
            style={{
              width: RANK_W,
              flex: 'none',
              background: primary,
              color: onPrimary,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <Crown color={onPrimary} size={40} />
            <span style={{ fontSize: 110, lineHeight: 0.85 }}>1</span>
          </div>
          <div style={{ width: 8, flex: 'none', background: secondary }} />

          {/* identity + stats */}
          <div style={{ width: ID_W - 8, flex: 'none', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 150, display: 'flex', alignItems: 'center', gap: 22, padding: '0 26px', boxShadow: `inset 0 -1px 0 ${LINE}` }}>
              <div style={{ width: 110, height: 110, flex: 'none', background: PANEL, display: 'flex', alignItems: 'center', justifyContent: 'center', ...pop(live, 0) }}>
                <TeamLogo logo={team.teamLogo} flag={team.teamFlag} fallback={DEF_LOGO} alt="" style={{ width: 86, height: 86, maxWidth: 'none', objectFit: 'contain', display: 'block' }} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...rise(live, 100, 10) }}>
                  <span style={{ fontSize: 18, letterSpacing: '0.24em', color: primary }}>OVERALL LEADER</span>
                  {lead > 0 && (
                    <span style={{ fontSize: 18, letterSpacing: '0.12em', background: INK, color: WHITE, padding: '5px 9px 3px' }}>LEAD +{lead}</span>
                  )}
                </div>
                <div style={{ fontSize: nameSize, lineHeight: 0.98, marginTop: 10, maxHeight: nameSize * 0.98 * 2, overflow: 'hidden', overflowWrap: 'anywhere', ...rise(live, 160, 14) }}>{name}</div>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex' }}>
              <div
                style={{
                  width: 170,
                  background: INK,
                  color: WHITE,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...rise(live, 250, 20),
                }}
              >
                <span style={{ fontSize: 68, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>{total}</span>
                <span style={{ fontSize: 15, letterSpacing: '0.26em', marginTop: 6, color: GREY_TXT }}>TOTAL</span>
              </div>
              {[
                { k: 'WWCD', v: wwcd },
                { k: 'PLACE', v: place },
                { k: 'ELIMS', v: elims },
              ].map((s, i) => (
                <div
                  key={s.k}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: i ? `inset 1px 0 0 ${LINE}` : 'none',
                    ...rise(live, 320 + i * 80, 20),
                  }}
                >
                  <span style={{ fontSize: 50, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>{s.v}</span>
                  <span style={{ fontSize: 15, letterSpacing: '0.24em', color: DIM, marginTop: 8 }}>{s.k}</span>
                </div>
              ))}
            </div>
          </div>

          {/* roster */}
          <div style={{ flex: 1, display: 'flex', background: PANEL, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: -40, right: -40, top: 120, height: 110, background: primary, transform: 'skewY(-6deg)' }} />
            <div style={{ position: 'absolute', left: -40, right: -40, top: 236, height: 10, background: secondary, transform: 'skewY(-6deg)' }} />
            <div style={{ position: 'absolute', right: 40, top: -8, fontSize: 170, lineHeight: 1, color: INK, opacity: 0.06, whiteSpace: 'nowrap' }}>{(team.teamTag || '').toUpperCase()}</div>
            {roster.map((p, i) => (
              <div
                key={p.key}
                style={{
                  position: 'relative',
                  width: photoW,
                  height: '100%',
                  flex: 'none',
                  opacity: live ? 1 : 0,
                  transform: live ? 'none' : 'translateY(60px)',
                  transition: `opacity 320ms linear ${300 + i * PHOTO_STAGGER}ms, transform 760ms cubic-bezier(.16,1,.3,1) ${300 + i * PHOTO_STAGGER}ms`,
                }}
              >
                {/* fitted by height so the head is never cropped */}
                <img
                  src={playerPhoto(p.pic) || DEF_PLAYER}
                  alt={p.name}
                  style={{
                    position: 'absolute',
                    left: -photoW * 0.2,
                    bottom: 0,
                    width: photoW * 1.4,
                    height: LEAD_H - 8,
                    maxWidth: 'none',
                    objectFit: 'contain',
                    objectPosition: 'center bottom',
                    display: 'block',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </WipeX>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Table — column heads + rows
   ───────────────────────────────────────────── */
const ColumnHead: React.FC<{ left: number; on: boolean }> = ({ left, on }) => (
  <div
    style={{
      position: 'absolute',
      left,
      top: COLS_TOP,
      width: COL_W,
      height: COLS_HEAD_H,
      background: PANEL,
      display: 'flex',
      alignItems: 'center',
      fontSize: 16,
      letterSpacing: '0.22em',
      color: DIM,
      opacity: on ? 1 : 0,
      transition: 'opacity 400ms linear',
    }}
  >
    <span style={{ width: C_RANK, textAlign: 'center', paddingRight: 8, boxSizing: 'border-box' }}>#</span>
    <span style={{ width: C_CHG, textAlign: 'center' }}>▲▼</span>
    <span style={{ flex: 1, paddingLeft: 12 }}>TEAM</span>
    <span style={{ width: C_WWCD, textAlign: 'center' }}>WWCD</span>
    <span style={{ width: C_PLACE, textAlign: 'center' }}>PLACE</span>
    <span style={{ width: C_ELIMS, textAlign: 'center' }}>ELIMS</span>
    <span style={{ width: C_TOTAL, textAlign: 'center', paddingLeft: 12, boxSizing: 'border-box', color: INK }}>TOTAL</span>
  </div>
);

const TableRow: React.FC<{ team: Row; rank: number; at: number; rowH: number; primary: string }> = ({
  team,
  rank,
  at,
  rowH,
  primary,
}) => {
  const onPrimary = inkOn(primary);
  const on = useAfter(at);
  const total = useCountUp(num(team.totalScore), on, 900, 250);
  const top3 = rank <= 3;
  const lead = rank === 1;
  const big = Math.max(20, Math.round(rowH * 0.56));
  const logo = Math.round(rowH * 0.72);
  const chg = team.rankChange;
  const name = (team.teamName || team.teamTag || '').toUpperCase();
  // long names step down so they fit the column
  const nameSize = name.length <= 16 ? big : name.length <= 22 ? Math.round(big * 0.86) : Math.round(big * 0.74);

  return (
    <div style={{ position: 'relative', width: COL_W, height: rowH }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: on ? COL_W : 0, background: primary, transition: `width ${WIPE_MS}ms ${EASE}` }} />
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: on ? COL_W : 0, overflow: 'hidden', transition: `width ${WIPE_MS}ms ${EASE} ${SLIVER_LEAD}ms` }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: COL_W,
            background: lead ? `linear-gradient(90deg, ${primary}22, ${WHITE} 60%)` : WHITE,
            color: INK,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {/* rank chip */}
          <div
            style={{
              width: C_RANK,
              height: '100%',
              flex: 'none',
              background: lead ? primary : top3 ? INK : PANEL,
              color: lead ? onPrimary : top3 ? WHITE : INK,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingRight: 8,
              boxSizing: 'border-box',
              fontSize: big,
              clipPath: 'polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)',
            }}
          >
            {rank}
          </div>
          {/* rank change */}
          <div
            style={{
              width: C_CHG,
              textAlign: 'center',
              fontSize: Math.round(big * 0.6),
              color: chg == null || chg === 0 ? '#B4B4BC' : chg > 0 ? UP : DOWN,
            }}
          >
            {chg == null || chg === 0 ? '–' : chg > 0 ? `▲${chg}` : `▼${Math.abs(chg)}`}
          </div>
          {/* team */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 6 }}>
            <TeamLogo logo={team.teamLogo} flag={team.teamFlag} fallback={DEF_LOGO} alt="" style={{ width: logo, height: logo, maxWidth: 'none', objectFit: 'contain', display: 'block', flex: 'none' }} />
            <div style={{ minWidth: 0, flex: 1, paddingRight: 10, fontSize: nameSize, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name}
            </div>
          </div>
          {/* numbers */}
          <div style={{ width: C_WWCD, textAlign: 'center', fontSize: Math.round(big * 0.82), fontVariantNumeric: 'tabular-nums' }}>
            {num(team.wwcd)}
          </div>
          <div style={{ width: C_PLACE, textAlign: 'center', fontSize: Math.round(big * 0.82), fontVariantNumeric: 'tabular-nums', boxShadow: `inset 1px 0 0 ${LINE}` }}>
            {num(team.totalPlacePoints)}
          </div>
          <div style={{ width: C_ELIMS, textAlign: 'center', fontSize: Math.round(big * 0.82), fontVariantNumeric: 'tabular-nums', boxShadow: `inset 1px 0 0 ${LINE}` }}>
            {num(team.totalKills)}
          </div>
          <div
            style={{
              width: C_TOTAL,
              height: '100%',
              flex: 'none',
              background: lead ? primary : INK,
              color: lead ? onPrimary : WHITE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingLeft: 12,
              boxSizing: 'border-box',
              fontSize: big,
              fontVariantNumeric: 'tabular-nums',
              clipPath: 'polygon(12px 0, 100% 0, 100% 100%, 0 100%)',
            }}
          >
            {total}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Scene (remounted on replay)
   ───────────────────────────────────────────── */
const Scene: React.FC<{
  rows: Row[];
  roster: RosterPlayer[];
  tournament: Tournament;
  round?: Round | null;
  primary: string;
  secondary: string;
}> = ({ rows, roster, tournament, round, primary, secondary }) => {
  const headsOn = useAfter(T_ROWS - 200);
  const perCol = Math.max(MIN_ROWS, Math.ceil(rows.length / 2));
  const rowH = Math.min(52, Math.floor((ROWS_BOTTOM - ROWS_TOP - (perCol - 1) * ROW_GAP) / perCol));
  const left = rows.slice(0, perCol);
  const right = rows.slice(perCol);

  const col = (list: Row[], offset: number, x: number) => (
    <div style={{ position: 'absolute', left: x, top: ROWS_TOP, display: 'flex', flexDirection: 'column', gap: ROW_GAP }}>
      {list.map((team, i) => (
        <TableRow
          key={team.teamId || offset + i}
          team={team}
          rank={num(team.rank) || offset + i + 1}
          at={T_ROWS + i * ROW_STAGGER + (offset ? 35 : 0)}
          rowH={rowH}
          primary={primary}
        />
      ))}
    </div>
  );

  return (
    <>
      <Header tournament={tournament} round={round} primary={primary} secondary={secondary} />
      {rows[0] && <LeaderBand team={rows[0]} second={rows[1]} roster={roster} primary={primary} secondary={secondary} />}
      <ColumnHead left={SIDE} on={headsOn} />
      {right.length > 0 && <ColumnHead left={SIDE + COL_W + COL_GAP} on={headsOn} />}
      {col(left, 0, SIDE)}
      {right.length > 0 && col(right, perCol, SIDE + COL_W + COL_GAP)}
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
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      {rows.length === 0 ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ padding: '18px 48px 16px 40px', background: WHITE, color: INK, fontSize: 30, letterSpacing: '0.12em', boxShadow: `inset 8px 0 0 ${primary}` }}>
            NO OVERALL DATA AVAILABLE
          </div>
        </div>
      ) : (
        <div key={`run-${run}-${useDemo ? 'demo' : 'live'}`} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <Scene rows={rows} roster={shownRoster} tournament={tournament} round={round} primary={primary} secondary={secondary} />
        </div>
      )}

      {/* preview — BELOW the 1920×1080 canvas */}
      <button type="button" onClick={preview} style={btn}>
        ▶ PREVIEW STANDINGS
      </button>
    </div>
  );
};

export default React.memo(OverAllData);