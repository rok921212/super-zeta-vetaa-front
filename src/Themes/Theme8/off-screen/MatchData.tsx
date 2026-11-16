import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { isWinningPlacement, computeMatchStandings } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
// THEME8 "WHITE LABEL" — Match Standings, ALL teams in one piece (no paging).
// Standings come from computeMatchStandings exactly as before; rows show the
// TEAM TAG. The table is split into two columns (ranks 1…⌈n/2⌉ left, the rest
// right) and the row height is computed so up to ~26 teams always fit.
//
//   heading     ink trapezoid "MATCH STANDINGS" + tournament · round · match tab
//   each column ink header  #  TEAM ............ KILLS  PLACE  TOTAL
//               rows        ▌rank│logo│TAG [WWCD]   12     10  ▌22▐
//                           rank chip: #1 primary, #2–3 ink, rest grey;
//                           TOTAL is a solid primary column.
//
// Motion (state + CSS transitions only — always plays, even with OS
// "reduce motion"):
//   1) heading drops in
//   2) the two column panels rise from below the screen, left then right
//   3) rows wipe in left → right one after another, top to bottom
// PREVIEW: a "Preview standings" button OUTSIDE the 1920×1080 canvas replays
// the sequence (22 dummy teams when there is no data).

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
  health: number;
  healthMax: number;
  liveState: number;
}

interface Team {
  _id: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
  teamFlag?: string;
  wwcd?: number;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchDataProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

/** the standings-row fields this screen uses */
interface Row {
  _id: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
  totalKills: number;
  placePoints: number;
  total: number;
  players?: { rank?: number }[];
}

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const ROW_ALT = '#F4F4F6';
const PANEL = '#E9E9ED';
const LINE = '#DEDEE4';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const COL_W = 860;
const COL_GAP = 40;
const TABLE_TOP = 262;
const TABLE_BOTTOM = 1040;
const HEAD_H = 44;
const CUT = 16;
const C = { rail: 6, rank: 64, logo: 58, kills: 104, place: 104, total: 120 };

/* ── timeline (ms) ── */
const T_LEFT = 400;
const T_RIGHT = 650;
const RISE_MS = 850;
const T_ROWS = T_RIGHT + RISE_MS - 150; // rows start once both panels have (almost) landed
const ROW_STAGGER = 55;
const ROW_WIPE_MS = 450;
const RISE_FROM = 1080 - TABLE_TOP + 60;

/* ── dummy standings for the preview button ── */
const DEMO_TAGS = ['NOVA', 'TSM', 'FAZE', 'DRX', 'BTR', 'STE', 'IHC', 'GEN', 'T1', 'DPLUS', 'RRQ', '4AM', 'ALTER EGO', 'VAMOS', 'HORAA', 'NIGMA', 'FLC', 'WBG', 'KINGS', 'DMY', 'ACE', 'ZETA'];
const DEMO: Row[] = DEMO_TAGS.map((t, i) => {
  const place = [10, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0][i];
  const kills = Math.max(0, 14 - i + ((i * 7) % 4));
  return { _id: `d${i}`, teamTag: t, teamLogo: '/def_logo.png', totalKills: kills, placePoints: place, total: kills + place, players: [{ rank: i + 1 }] };
}).sort((a, b) => b.total - a.total);

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

/* ─────────────────────────────────────────────
   One standings row
   ───────────────────────────────────────────── */
const StandingRow: React.FC<{
  team: Row;
  rank: number;
  rowH: number;
  alt: boolean;
  at: number;
  run: number;
  primary: string;
  secondary: string;
}> = ({ team, rank, rowH, alt, at, run, primary, secondary }) => {
  const on = useAfter(at, run);
  const onPrimary = inkOn(primary);
  const chipBg = rank === 1 ? primary : rank <= 3 ? INK : PANEL;
  const chipFg = rank === 1 ? onPrimary : rank <= 3 ? WHITE : INK;
  const winner = isWinningPlacement(team.placePoints, (team.players?.[0] as any)?.rank);
  const tag = (team.teamTag || '').toUpperCase();
  const tagFont = Math.round(rowH * (tag.length <= 6 ? 0.6 : tag.length <= 9 ? 0.52 : 0.44));
  const numFont = Math.round(rowH * 0.6);

  return (
    <div style={{ position: 'relative', height: rowH, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: on ? '100%' : '0%',
          overflow: 'hidden',
          transition: `width ${ROW_WIPE_MS}ms cubic-bezier(.65,0,.25,1)`,
        }}
      >
        <div
          style={{
            width: COL_W,
            height: rowH,
            display: 'flex',
            alignItems: 'stretch',
            background: winner ? '#FFF8E6' : alt ? ROW_ALT : WHITE,
            boxShadow: `inset 0 -1px 0 ${LINE}`,
            fontFamily: FONT,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {/* rail */}
          <div style={{ width: C.rail, flex: 'none', background: primary }} />
          {/* rank chip */}
          <div
            style={{
              width: C.rank,
              flex: 'none',
              background: chipBg,
              color: chipFg,
              clipPath: 'polygon(0 0, 100% 0, calc(100% - 9px) 100%, 0 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingRight: 6,
              fontSize: Math.round(rowH * 0.52),
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {String(rank).padStart(2, '0')}
          </div>
          {/* logo */}
          <div
            style={{
              width: C.logo,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: Math.round(rowH * 0.13),
              boxSizing: 'border-box',
            }}
          >
            <TeamLogo
              logo={team.teamLogo}
              flag={team.teamFlag}
              fallback={'/def_logo.png'}
              alt={team.teamTag}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </div>
          {/* tag + WWCD marker */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 4 }}>
            <span style={{ fontSize: tagFont, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag}</span>
            {winner && (
              <span
                style={{
                  flex: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: INK,
                  color: WHITE,
                  padding: '4px 9px 3px',
                  fontSize: Math.max(13, Math.round(rowH * 0.28)),
                  letterSpacing: '0.16em',
                }}
              >
                <svg width={14} height={11} viewBox="0 0 40 30" aria-hidden>
                  <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={primary} />
                </svg>
                WWCD
              </span>
            )}
          </div>
          {/* kills / place */}
          <div style={{ width: C.kills, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: numFont, color: INK, fontVariantNumeric: 'tabular-nums' }}>
            {num(team.totalKills)}
          </div>
          <div style={{ width: C.place, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: numFont, color: INK, fontVariantNumeric: 'tabular-nums' }}>
            {num(team.placePoints)}
          </div>
          {/* secondary sliver + total */}
          <div style={{ width: 4, flex: 'none', marginLeft: 3, background: secondary }} />
          <div
            style={{
              width: C.total,
              flex: 'none',
              background: primary,
              color: onPrimary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: Math.round(rowH * 0.66),
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {num(team.total)}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   One column panel (header + rows), rises from below
   ───────────────────────────────────────────── */
const ColumnPanel: React.FC<{
  rows: Row[];
  firstRank: number;
  rowH: number;
  riseAt: number;
  rowStartIndex: number;
  run: number;
  primary: string;
  secondary: string;
}> = ({ rows, firstRank, rowH, riseAt, rowStartIndex, run, primary, secondary }) => {
  const up = useAfter(riseAt, run);
  const label: React.CSSProperties = { fontSize: 18, letterSpacing: '0.18em', color: 'rgba(255,255,255,.7)', textAlign: 'center' };

  return (
    <div
      style={{
        width: COL_W,
        flex: 'none',
        transform: up ? 'translateY(0px)' : `translateY(${RISE_FROM}px)`,
        opacity: up ? 1 : 0,
        transition: `transform ${RISE_MS}ms cubic-bezier(.16,1,.3,1), opacity 150ms linear`,
        willChange: 'transform',
        filter: 'drop-shadow(0 16px 30px rgba(0,0,0,0.32))',
        fontFamily: FONT,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {/* header */}
      <div
        style={{
          position: 'relative',
          height: HEAD_H,
          background: INK,
          clipPath: `polygon(${CUT}px 0, 100% 0, 100% 100%, 0 100%, 0 ${CUT}px)`,
          display: 'flex',
          alignItems: 'center',
          paddingBottom: 3,
          boxSizing: 'border-box',
        }}
      >
        <span style={{ ...label, width: C.rail + C.rank, color: WHITE, fontSize: 22 }}>#</span>
        <span style={{ ...label, flex: 1, textAlign: 'left', paddingLeft: C.logo + 4 }}>TEAM</span>
        <span style={{ ...label, width: C.kills }}>KILLS</span>
        <span style={{ ...label, width: C.place }}>PLACE</span>
        <span style={{ ...label, width: C.total + 7, paddingLeft: 7, color: WHITE }}>TOTAL</span>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: primary }} />
        <div style={{ position: 'absolute', right: 0, bottom: 0, width: C.total, height: 3, background: secondary }} />
      </div>
      {/* rows */}
      {rows.map((team, i) => (
        <StandingRow
          key={team._id}
          team={team}
          rank={firstRank + i}
          rowH={rowH}
          alt={i % 2 === 1}
          at={T_ROWS + (rowStartIndex + i) * ROW_STAGGER}
          run={run}
          primary={primary}
          secondary={secondary}
        />
      ))}
      {/* closing edge */}
      <div style={{ height: 5, background: INK, clipPath: `polygon(0 0, 100% 0, calc(100% - ${CUT}px) 100%, 0 100%)` }} />
    </div>
  );
};

/* ─────────────────────────────────────────────
   MatchData (Match Standings)
   ───────────────────────────────────────────── */
const MatchDataComponent: React.FC<MatchDataProps> = ({ tournament, round, match, matchData }) => {
  const realRows = useMemo(() => computeMatchStandings(matchData as any) as unknown as Row[], [matchData]);
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);
  const rows: Row[] = matchData && realRows.length ? realRows : demo ? DEMO : [];

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const headIn = useAfter(60, run);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;

  // split into two columns; size rows so every team fits
  const perCol = Math.max(1, Math.ceil(rows.length / 2));
  const left = rows.slice(0, perCol);
  const right = rows.slice(perCol);
  const rowH = Math.max(40, Math.min(72, Math.floor((TABLE_BOTTOM - TABLE_TOP - HEAD_H - 5) / perCol)));
  const twoCols = right.length > 0;
  const tableW = twoCols ? COL_W * 2 + COL_GAP : COL_W;

  const matchNo = match?.matchNo ?? match?._matchNo;
  const context = [
    tournament.tournamentName,
    round?.roundName,
    match?.matchName || (matchNo != null ? `MATCH ${String(matchNo).padStart(2, '0')}` : ''),
  ]
    .filter(Boolean)
    .join('  ·  ')
    .toUpperCase();

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
      {rows.length > 0 ? (
        <>
          {/* ── heading ── */}
          <div
            key={`head-${run}`}
            style={{
              position: 'absolute',
              left: '50%',
              top: 50,
              transform: `translateX(-50%) translateY(${headIn ? 0 : -24}px)`,
              opacity: headIn ? 1 : 0,
              transition: 'transform 600ms cubic-bezier(.2,.8,.2,1), opacity 300ms linear',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              filter: 'drop-shadow(0 14px 28px rgba(0,0,0,0.35))',
            }}
          >
            <div
              style={{
                position: 'relative',
                height: 96,
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                padding: '0 74px 6px',
                background: INK,
                color: WHITE,
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 30px) 100%, 30px 100%)',
                fontSize: 68,
                letterSpacing: '0.08em',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ width: 16, height: 16, background: primary, flex: 'none' }} />
              MATCH STANDINGS
              <span style={{ width: 16, height: 16, background: secondary, flex: 'none' }} />
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, background: primary }} />
            </div>
            {context && (
              <div
                style={{
                  marginTop: -1,
                  background: WHITE,
                  color: INK,
                  padding: '8px 26px 7px',
                  fontSize: 24,
                  letterSpacing: '0.22em',
                  clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 14px 100%)',
                  whiteSpace: 'nowrap',
                }}
              >
                {context}
              </div>
            )}
          </div>

          {/* ── the table: one piece, two columns ── */}
          <div
            key={`table-${run}`}
            style={{
              position: 'absolute',
              left: (1920 - tableW) / 2,
              top: TABLE_TOP,
              display: 'flex',
              alignItems: 'flex-start',
              gap: COL_GAP,
            }}
          >
            <ColumnPanel rows={left} firstRank={1} rowH={rowH} riseAt={T_LEFT} rowStartIndex={0} run={run} primary={primary} secondary={secondary} />
            {twoCols && (
              <ColumnPanel
                rows={right}
                firstRank={perCol + 1}
                rowH={rowH}
                riseAt={T_RIGHT}
                rowStartIndex={left.length}
                run={run}
                primary={primary}
                secondary={secondary}
              />
            )}
          </div>
        </>
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
          top: 468,
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
        ▶ PREVIEW STANDINGS
      </button>
    </div>
  );
};

export default MatchDataComponent;