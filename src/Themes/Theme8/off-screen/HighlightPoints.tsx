import React, { useEffect, useMemo, useState } from 'react';
import { buildOverallStandings } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';

/* THEME8 "WHITE LABEL" — Highlight Points (overall standings, left corner).
   Data preserved: buildOverallStandings(matchDatas, overallData) → rows with
   rank / total / totalKills / wwcd / pointsChange / leadOverNext; pages rotate
   every 25s; MATCH n COMPLETE footer.

   Layout (left corner, 650 wide, centred vertically):
   ┌ ink strip: OVERALL STANDINGS · round ─────────┐
   │ LEADER CARD — the #1 team's player photos on   │
   │ the theme stripe; rank / logo / tag / TOTAL    │
   ├ # · TEAM · WWCD · ELIMS · PTS ─────────────────┤
   │ rows (10 per page up to 20 teams, 8 per page   │
   │ above 20) — rank chip, logo, tag + name + bar, │
   │ +points this match, total in the theme colour  │
   └ page segments (fill with the page timer) · MATCH n COMPLETE

   Motion (state + CSS transitions only — reduce-motion cannot switch it off):
     intro — strip wipes in; leader card shows the team logo on the theme
       colour, then opens and the player photos rise one after another;
       each row is a theme-coloured sliver that the white row wipes over,
       one after another; totals count up.
     page change — rows wipe shut in reverse (white, then the sliver),
       bottom-up; the next page wipes in top-down and counts up.
   PREVIEW: buttons BELOW the 1920×1080 canvas — "▶ PREVIEW POINTS" (dummy
   22 teams when there is no data) and "NEXT PAGE ▸". */

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
  killNum: number;
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
  totalKills?: number;
  total?: number;
  rank?: number;
  pointsChange?: number; // points gained this match
  leadOverNext?: number; // only for rank 1: lead over rank 2
}

/* a row from buildOverallStandings — no slot / roster on it; the leader's
   roster is re-attached from overallData / matchDatas (see attachRoster) */
type StandingTeam = Omit<Team, 'slot' | 'players'> & { slot?: number; players?: Player[] };

interface OverallData {
  tournamentId: string;
  roundId: string;
  userId: string;
  teams: Team[];
  createdAt: string;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
}

interface MatchData {
  _id: string;
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

const DEF_PLAYER =
  '/def_char.avif'; /* fallback for missing player photo (not used for team logo) */

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const PANEL = '#EFEFF2';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
const UP = '#13B24A';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const LEFT = 48;
const W = 650;
const HEAD_H = 56;
const LEAD_PHOTO_H = 176;
const LEAD_BAR_H = 70;
const LEAD_H = LEAD_PHOTO_H + LEAD_BAR_H; // 246
const GAP = 12;
const COLS_H = 36;
const ROW_H = 56;
const ROW_GAP = 4;
const FOOT_H = 34;
const CHIP_W = 58;
const C_WWCD = 64;
const C_ELIMS = 70;
const C_PTS = 104;

/* ── motion ── */
const PAGE_MS = 25000; // same rotation as before
const WIPE_MS = 520;
const WIPE_EASE = 'cubic-bezier(.65,0,.25,1)';
const T_HEAD = 60;
const T_LEAD_FACE = 300;
const T_LEAD_OPEN = 1250;
const PHOTO_STAGGER = 140;
const T_ROWS = 1500; // first row on the intro
const T_ROWS_PAGE = 120; // first row after a page change
const ROW_STAGGER = 70;
const SLIVER_LEAD = 170; // sliver runs ahead of the white row
const OUT_STAGGER = 45;

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

/* Re-attach a team's roster: standings rows have no players, so look the team
   up (teamId, then tag / name) in overallData and in every match — newest
   first — and take the first non-empty roster. Photos are filled per player
   from any source that has one (match data usually carries picUrl). */
function attachRoster(team: StandingTeam, overallData?: OverallData | null, matchDatas: MatchData[] = []): StandingTeam {
  const same = (t: any) =>
    !!t &&
    ((team.teamId && t.teamId === team.teamId) ||
      (!!team.teamTag && t.teamTag === team.teamTag) ||
      (!!team.teamName && t.teamName === team.teamName));
  const sources: Player[][] = [];
  if (team.players?.length) sources.push(team.players);
  const ot = overallData?.teams?.find(same);
  if (ot?.players?.length) sources.push(ot.players);
  for (let i = matchDatas.length - 1; i >= 0; i--) {
    const mt = matchDatas[i]?.teams?.find(same);
    if (mt?.players?.length) sources.push(mt.players);
  }
  if (!sources.length) return team;
  const key = (p: any) => String(p?.uId || p?._id || p?.playerName || '');
  const pics = new Map<string, string>();
  const picsByName = new Map<string, string>();
  for (const list of sources)
    for (const p of list as any[]) {
      if (!p?.picUrl) continue;
      if (!pics.has(key(p))) pics.set(key(p), p.picUrl);
      if (p.playerName && !picsByName.has(p.playerName)) picsByName.set(p.playerName, p.picUrl);
    }
  const roster = sources[0].map((p: any) => ({
    ...p,
    picUrl: p.picUrl || pics.get(key(p)) || picsByName.get(p.playerName) || undefined,
  }));
  return { ...team, players: roster };
}

/* 10 per page up to 20 teams, 8 per page above 20 */
const perPageFor = (n: number) => (n > 20 ? 8 : 10);

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

const Crown = ({ color, size = 18 }: { color: string; size?: number }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block', flex: 'none' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
  </svg>
);

/* ── dummy standings for the preview button ── */
const DEMO_TAGS = ['DMY', 'NOVA', 'STRM', 'A7', 'RW', 'GG', 'TSM', 'FAZE', 'BLD', 'HYD', 'ORB', 'VLT', 'IGN', 'KOI', 'ZEN', 'APX', 'RVN', 'SKY', 'ION', 'MTX', 'NEO', 'PYR'];
const DEMO_NAMES = ['VIPER', 'SHADOW', 'KRYPTO', 'NEXUS'];
const DEMO: StandingTeam[] = DEMO_TAGS.map((tag, i) => {
  const total = Math.max(12, 214 - i * 9 - (i % 3) * 2);
  const kills = Math.round(total * 0.55);
  return {
    teamId: `demo-${i}`,
    teamName: `${tag} ESPORTS`,
    teamTag: tag,
    teamLogo: '/def_logo.png',
    slot: i + 1,
    placePoints: total - kills,
    wwcd: Math.max(0, 4 - Math.floor(i / 2)),
    totalKills: kills,
    total,
    rank: i + 1,
    pointsChange: [18, 6, 11, 0, 3, 9, 1, 14, 0, 4][i % 10],
    leadOverNext: i === 0 ? 9 : undefined,
    players: DEMO_NAMES.map((n, j) => ({ _id: `p${i}-${j}`, playerName: n, killNum: 10 - j })),
  };
});

/* ─────────────────────────────────────────────
   Leader card — logo face on the theme colour, then opens to the roster
   ───────────────────────────────────────────── */
const LeaderCard: React.FC<{ team: StandingTeam; primary: string; secondary: string }> = ({ team, primary, secondary }) => {
  const onPrimary = inkOn(primary);
  const face = useAfter(T_LEAD_FACE);
  const open = useAfter(T_LEAD_OPEN);
  const total = useCountUp(num(team.total), open, 1100, 300);
  const lead = num(team.leadOverNext);
  const players = (team.players || []).slice(0, 4);
  const pw = W / Math.max(1, players.length);
  const tag = (team.teamTag || team.teamName || '').toUpperCase();

  return (
    <div style={{ position: 'relative', width: W, height: LEAD_H, overflow: 'hidden', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 22px 100%, 0 calc(100% - 22px))' }}>
      {/* face */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: face ? W : 0,
          overflow: 'hidden',
          transition: `width ${WIPE_MS + 100}ms ${WIPE_EASE}`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: W,
            background: primary,
            color: onPrimary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 22,
          }}
        >
          <TeamLogo
            logo={team.teamLogo}
            flag={team.teamFlag}
            fallback="/def_logo.png"
            alt=""
            style={{
              width: 130,
              height: 130,
              maxWidth: 'none',
              objectFit: 'contain',
              display: 'block',
              opacity: face ? 1 : 0,
              transform: face ? 'none' : 'scale(.6)',
              transition: 'opacity 250ms linear 250ms, transform 600ms cubic-bezier(.34,1.56,.64,1) 250ms',
            }}
          />
          <div style={{ opacity: face ? 1 : 0, transform: face ? 'none' : 'translateY(14px)', transition: 'all 500ms cubic-bezier(.16,1,.3,1) 400ms' }}>
            <div style={{ fontSize: 22, letterSpacing: '0.3em', opacity: 0.85 }}>LEADING</div>
            <div style={{ fontSize: 76, lineHeight: 0.95, marginTop: 6 }}>{tag}</div>
          </div>
        </div>
      </div>

      {/* open — wipes over the face */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: open ? W : 0,
          overflow: 'hidden',
          transition: `width ${WIPE_MS + 150}ms ${WIPE_EASE}`,
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: W, background: WHITE }}>
          {/* photo stage */}
          <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: LEAD_PHOTO_H, background: PANEL, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: -40, right: -40, top: 70, height: 90, background: primary, transform: 'skewY(-8deg)' }} />
            <div style={{ position: 'absolute', left: -40, right: -40, top: 164, height: 10, background: secondary, transform: 'skewY(-8deg)' }} />
            <div style={{ position: 'absolute', right: 14, top: 6, fontSize: 120, lineHeight: 1, color: INK, opacity: 0.06, whiteSpace: 'nowrap' }}>{tag}</div>
            {players.length === 0 && (
              <TeamLogo
                logo={team.teamLogo}
                flag={team.teamFlag}
                fallback="/def_logo.png"
                alt=""
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 14,
                  width: 148,
                  height: 148,
                  marginLeft: -74,
                  maxWidth: 'none',
                  objectFit: 'contain',
                  display: 'block',
                  opacity: open ? 1 : 0,
                  transform: open ? 'none' : 'translateY(40px)',
                  transition: 'opacity 300ms linear 400ms, transform 700ms cubic-bezier(.16,1,.3,1) 400ms',
                }}
              />
            )}
            {players.map((p, i) => (
              <div
                key={p._id || i}
                style={{
                  position: 'absolute',
                  left: i * pw,
                  bottom: 0,
                  width: pw,
                  height: LEAD_PHOTO_H - 6,
                  opacity: open ? 1 : 0,
                  transform: open ? 'none' : 'translateY(60px)',
                  transition: `opacity 300ms linear ${400 + i * PHOTO_STAGGER}ms, transform 700ms cubic-bezier(.16,1,.3,1) ${400 + i * PHOTO_STAGGER}ms`,
                }}
              >
                <img
                  src={playerPhoto(p.picUrl) || DEF_PLAYER}
                  alt={p.playerName}
                  style={{ width: pw, height: LEAD_PHOTO_H - 6, maxWidth: 'none', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
                />
                
              </div>
            ))}
          </div>

          {/* identity bar */}
          <div style={{ position: 'absolute', left: 0, top: LEAD_PHOTO_H, width: W, height: LEAD_BAR_H, background: INK, color: WHITE, display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                width: CHIP_W + 10,
                height: '100%',
                background: primary,
                color: onPrimary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
                paddingRight: 10,
                boxSizing: 'border-box',
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)',
              }}
            >
              1
            </div>
            <TeamLogo
              logo={team.teamLogo}
              flag={team.teamFlag}
              fallback="/def_logo.png"
              alt=""
              style={{ width: 48, height: 48, maxWidth: 'none', objectFit: 'contain', display: 'block', marginLeft: 14, flex: 'none' }}
            />
            <div style={{ marginLeft: 14, minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 34, lineHeight: 1 }}>{tag}</div>
              <div style={{ fontSize: 16, letterSpacing: '0.18em', color: '#A6A6B0', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {(team.teamName || '').toUpperCase()}
              </div>
            </div>
            {lead > 0 && (
              <div style={{ textAlign: 'right', marginRight: 16 }}>
                <div style={{ fontSize: 15, letterSpacing: '0.2em', color: '#A6A6B0' }}>LEAD</div>
                <div style={{ fontSize: 28, color: WHITE, marginTop: 2 }}>+{lead}</div>
              </div>
            )}
            <div
              style={{
                width: C_PTS + 24,
                height: '100%',
                background: primary,
                color: onPrimary,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                paddingLeft: 16,
                boxSizing: 'border-box',
                clipPath: 'polygon(16px 0, 100% 0, 100% 100%, 0 100%)',
              }}
            >
              <span style={{ fontSize: 44, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>{total}</span>
              <span style={{ fontSize: 13, letterSpacing: '0.28em', marginTop: 4, opacity: 0.85 }}>PTS</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Standings row — theme sliver first, white row wipes over it
   ───────────────────────────────────────────── */
const Row: React.FC<{
  team: StandingTeam;
  rank: number;
  index: number;
  count: number;
  start: number;
  leaving: boolean;
  maxTotal: number;
  primary: string;
}> = ({ team, rank, index, count, start, leaving, maxTotal, primary }) => {
  const onPrimary = inkOn(primary);
  const arrived = useAfter(start + index * ROW_STAGGER);
  const on = arrived && !leaving;
  const total = num(team.total);
  const t = useCountUp(total, arrived, 900, 250);
  const gain = num(team.pointsChange);
  const top3 = rank <= 3;

  // in: sliver, then white row. out: white row, then sliver — bottom row first.
  const outDelay = (count - 1 - index) * OUT_STAGGER;
  const sliverDelay = on ? 0 : outDelay + 140;
  const rowDelay = on ? SLIVER_LEAD : outDelay;

  return (
    <div style={{ position: 'relative', width: W, height: ROW_H }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: on ? W : 0,
          background: primary,
          transition: `width ${WIPE_MS}ms ${WIPE_EASE} ${sliverDelay}ms`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: on ? W : 0,
          overflow: 'hidden',
          transition: `width ${WIPE_MS}ms ${WIPE_EASE} ${rowDelay}ms`,
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: W, background: WHITE, display: 'flex', alignItems: 'center', color: INK }}>
          {/* rank */}
          <div
            style={{
              width: CHIP_W,
              height: '100%',
              flex: 'none',
              background: rank === 1 ? primary : top3 ? INK : PANEL,
              color: rank === 1 ? onPrimary : top3 ? WHITE : INK,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              paddingRight: 10,
              boxSizing: 'border-box',
              clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
            }}
          >
            {rank}
          </div>
          <TeamLogo
            logo={team.teamLogo}
            flag={team.teamFlag}
            fallback="/def_logo.png"
            alt=""
            style={{ width: 40, height: 40, maxWidth: 'none', objectFit: 'contain', display: 'block', marginLeft: 12, flex: 'none' }}
          />
          {/* tag · name · bar vs leader */}
          <div style={{ marginLeft: 14, minWidth: 0, flex: 1, paddingRight: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 28, lineHeight: 1, whiteSpace: 'nowrap' }}>{(team.teamTag || team.teamName || '').toUpperCase()}</span>
              <span style={{ fontSize: 14, letterSpacing: '0.16em', color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {(team.teamName || '').toUpperCase()}
              </span>
            </div>
            <div style={{ position: 'relative', height: 4, marginTop: 6, background: PANEL, overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: arrived ? `${maxTotal > 0 ? (total / maxTotal) * 100 : 0}%` : '0%',
                  background: rank === 1 ? primary : INK,
                  transition: 'width 900ms cubic-bezier(.16,1,.3,1) 350ms',
                }}
              />
            </div>
          </div>
          {/* wwcd */}
          <div style={{ width: C_WWCD, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 24, color: num(team.wwcd) ? INK : '#B4B4BC' }}>
            <Crown color={num(team.wwcd) ? primary : '#C9C9D0'} size={18} />
            {num(team.wwcd)}
          </div>
          {/* elims */}
          <div style={{ width: C_ELIMS, textAlign: 'center', fontSize: 26, fontVariantNumeric: 'tabular-nums', boxShadow: `inset 1px 0 0 ${LINE}` }}>
            {num(team.totalKills)}
          </div>
          {/* total + gain this match */}
          <div
            style={{
              position: 'relative',
              width: C_PTS,
              height: '100%',
              flex: 'none',
              background: rank === 1 ? primary : INK,
              color: rank === 1 ? onPrimary : WHITE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingLeft: 12,
              boxSizing: 'border-box',
              clipPath: 'polygon(14px 0, 100% 0, 100% 100%, 0 100%)',
            }}
          >
            <span style={{ fontSize: 34, fontVariantNumeric: 'tabular-nums' }}>{t}</span>
          </div>
          {gain > 0 && (
            <span
              style={{
                position: 'absolute',
                right: C_PTS + C_ELIMS + C_WWCD + 6,
                top: 6,
                fontSize: 15,
                letterSpacing: '0.06em',
                color: UP,
                opacity: arrived ? 1 : 0,
                transition: 'opacity 300ms linear 900ms',
              }}
            >
              +{gain}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Board — one run of the widget (remounted on replay)
   ───────────────────────────────────────────── */
const Board: React.FC<{
  teams: StandingTeam[];
  round?: Round | null;
  match?: Match | null;
  primary: string;
  secondary: string;
  nextSignal: number;
}> = ({ teams, round, match, primary, secondary, nextSignal }) => {
  const onPrimary = inkOn(primary);
  const perPage = perPageFor(teams.length);
  const totalPages = Math.max(1, Math.ceil(teams.length / perPage));
  const [page, setPage] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [pageRun, setPageRun] = useState(0); // remounts rows for the entrance
  const head = useAfter(T_HEAD);
  const [timerOn, setTimerOn] = useState(false);

  const outMs = perPage * OUT_STAGGER + WIPE_MS + 220;
  const goNext = React.useCallback(() => {
    setLeaving(true);
    setTimerOn(false);
    window.setTimeout(() => {
      setPage((p) => (p + 1) % totalPages);
      setPageRun((r) => r + 1);
      setLeaving(false);
    }, outMs);
  }, [outMs, totalPages]);

  // automatic rotation — same 25s interval as before
  useEffect(() => {
    if (totalPages <= 1) return;
    const id = window.setInterval(goNext, PAGE_MS);
    return () => clearInterval(id);
  }, [goNext, totalPages]);

  // manual "next page" from the preview button
  useEffect(() => {
    if (nextSignal > 0 && totalPages > 1) goNext();
  }, [nextSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // page-timer segment restarts on every page
  useEffect(() => {
    setTimerOn(false);
    let r1 = 0;
    let r2 = 0;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setTimerOn(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [pageRun]);

  const pageTeams = teams.slice(page * perPage, page * perPage + perPage);
  const maxTotal = num(teams[0]?.total);
  const rowsH = perPage * ROW_H + (perPage - 1) * ROW_GAP;
  const totalH = HEAD_H + GAP + LEAD_H + GAP + COLS_H + ROW_GAP + rowsH + GAP + FOOT_H;
  const top = Math.max(20, Math.round((1080 - totalH) / 2));
  const roundName = (round?.roundName || '').toUpperCase();
  const startAt = pageRun === 0 ? T_ROWS : T_ROWS_PAGE;

  return (
    <div style={{ position: 'absolute', left: LEFT, top, width: W, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      {/* ink strip */}
      <div style={{ position: 'relative', width: W, height: HEAD_H, overflow: 'hidden', clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: head ? W : 0, overflow: 'hidden', transition: `width ${WIPE_MS + 100}ms ${WIPE_EASE}` }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: W, background: INK, color: WHITE, display: 'flex', alignItems: 'center' }}>
            <span style={{ width: 6, height: 26, background: primary, marginLeft: 22 }} />
            <span style={{ fontSize: 32, letterSpacing: '0.2em', marginLeft: 14 }}>OVERALL STANDINGS</span>
            {roundName && (
              <span
                style={{
                  marginLeft: 'auto',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 34px 0 36px',
                  background: primary,
                  color: onPrimary,
                  fontSize: 22,
                  letterSpacing: '0.14em',
                  clipPath: 'polygon(18px 0, 100% 0, 100% 100%, 0 100%)',
                  maxWidth: 230,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {roundName}
              </span>
            )}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: secondary }} />
          </div>
        </div>
      </div>

      <div style={{ height: GAP }} />
      {teams[0] && <LeaderCard team={teams[0]} primary={primary} secondary={secondary} />}
      <div style={{ height: GAP }} />

      {/* column heads */}
      <div
        style={{
          width: W,
          height: COLS_H,
          background: PANEL,
          display: 'flex',
          alignItems: 'center',
          fontSize: 16,
          letterSpacing: '0.22em',
          color: DIM,
          opacity: head ? 1 : 0,
          transition: 'opacity 400ms linear 1300ms',
        }}
      >
        <span style={{ width: CHIP_W, textAlign: 'center', paddingRight: 10, boxSizing: 'border-box' }}>#</span>
        <span style={{ marginLeft: 12, flex: 1 }}>TEAM</span>
        <span style={{ width: C_WWCD, textAlign: 'center' }}>WWCD</span>
        <span style={{ width: C_ELIMS, textAlign: 'center' }}>ELIMS</span>
        <span style={{ width: C_PTS, textAlign: 'center', paddingLeft: 12, boxSizing: 'border-box', color: INK }}>PTS</span>
      </div>
      <div style={{ height: ROW_GAP }} />

      {/* rows — fixed-height area so the widget never jumps between pages */}
      <div key={`page-${pageRun}`} style={{ height: rowsH, display: 'flex', flexDirection: 'column', gap: ROW_GAP }}>
        {pageTeams.map((team, i) => (
          <Row
            key={team.teamId || i}
            team={team}
            rank={num(team.rank) || page * perPage + i + 1}
            index={i}
            count={pageTeams.length}
            start={startAt}
            leaving={leaving}
            maxTotal={maxTotal}
            primary={primary}
          />
        ))}
      </div>

      <div style={{ height: GAP }} />
      {/* footer — page segments + match */}
      <div
        style={{
          width: W,
          height: FOOT_H,
          background: INK,
          color: WHITE,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 8,
          boxSizing: 'border-box',
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 16px 100%, 0 calc(100% - 16px))',
          opacity: head ? 1 : 0,
          transition: 'opacity 400ms linear 1400ms',
        }}
      >
        {Array.from({ length: totalPages }, (_, i) => (
          <span key={i} style={{ position: 'relative', width: 46, height: 6, background: 'rgba(255,255,255,.18)', overflow: 'hidden' }}>
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                background: primary,
                width: i < page ? '100%' : i > page ? '0%' : totalPages > 1 && timerOn && !leaving ? '100%' : i === page && totalPages === 1 ? '100%' : '0%',
                transition: i === page && timerOn && totalPages > 1 ? `width ${PAGE_MS}ms linear` : 'none',
              }}
            />
          </span>
        ))}
        <span style={{ fontSize: 16, letterSpacing: '0.2em', color: '#A6A6B0', marginLeft: 8 }}>
          PAGE {page + 1}/{totalPages}
        </span>
        
      </div>
    </div>
  );
};

const HighlightPoints: React.FC<OverAllDataProps> = ({
  tournament,
  round,
  match,
  overallData: propOverallData,
  matchDatas: propMatchDatas,
}) => {
  const overallData = propOverallData;
  const matchDatas = propMatchDatas || [];

  // One shared standings pipeline (Total Score primary + real rankChange
  // from match history, else the overallData snapshot). Rows carry
  // rank / matchesPlayed / leadOverNext plus placePoints|total|wwcd aliases.
  const teams = useMemo(
    () => buildOverallStandings(matchDatas as any, overallData as any) as unknown as StandingTeam[],
    [matchDatas, overallData]
  );

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;

  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);
  const [nextSignal, setNextSignal] = useState(0);
  const hasData = teams.length > 0;
  const useDemo = !hasData && demo;
  // leader's roster re-attached so the photos at the top have something to show
  const live = useMemo(
    () => (teams.length ? [attachRoster(teams[0], overallData, matchDatas), ...teams.slice(1)] : teams),
    [teams, overallData, matchDatas]
  );
  const shown = useDemo ? DEMO : live;

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
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
      {shown.length > 0 ? (
        <Board
          key={`board-${run}-${useDemo ? 'demo' : 'live'}`}
          teams={shown}
          round={round}
          match={match}
          primary={primary}
          secondary={secondary}
          nextSignal={nextSignal}
        />
      ) : (
        <div style={{ position: 'absolute', left: LEFT, top: 520, fontSize: 22, letterSpacing: '0.24em', color: DIM }}>NO DATA AVAILABLE</div>
      )}

      {/* controls — BELOW the 1920×1080 canvas */}
      <button
        type="button"
        onClick={() => {
          if (!hasData) setDemo(true);
          setNextSignal(0);
          setRun((r) => r + 1);
        }}
        style={{ ...btn, left: 20 }}
      >
        ▶ PREVIEW POINTS
      </button>
      <button type="button" onClick={() => setNextSignal((n) => n + 1)} style={{ ...btn, left: 240 }}>
        NEXT PAGE ▸
      </button>
    </div>
  );
};

export default HighlightPoints;