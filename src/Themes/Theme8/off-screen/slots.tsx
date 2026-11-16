import React, { useCallback, useEffect, useState } from 'react';
import { TeamLogo } from '../../shared/components/TeamLogo';
// THEME8 "WHITE LABEL" — Team Slots.
//
//   heading   ink trapezoid "TEAM SLOTS" + round · day · match tab
//   grid      5 columns, centred; partial last row stays centred
//             tile:  ▌[ LOGO ] │ SLOT 07
//                    ▌         │ TEAM TAG
//
// Motion (state + CSS transitions only — always plays, even with OS
// "reduce motion"):
//   1) heading drops in
//   2) tiles rise from below the screen in a quick wave (row by row, left → right)
//   3) each tile first shows its SLOT NUMBER on the theme colour, then opens
//      upward to the white team tile (logo pops, tag slides in)
// PREVIEW: a "Preview slots" button OUTSIDE the 1920×1080 canvas replays the
// sequence (20 dummy teams when there is no data).

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

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const PANEL = '#EFEFF2';
const DIM = '#7A7A84';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const COLS = 5;
const MAX_ROWS = 5;
const TILE_W = 306;
const COL_GAP = 18;
const ROW_GAP = 16;
const GRID_TOP = 250;
const GRID_BOTTOM = 1040;
const CUT = 18;
const tileClip = `polygon(${CUT}px 0, 100% 0, 100% calc(100% - ${CUT}px), calc(100% - ${CUT}px) 100%, 0 100%, 0 ${CUT}px)`;

/* ── timeline (ms) ── */
const T_FIRST = 450;
const STAGGER = 70; // between tiles (row-major)
const RISE_MS = 800;
const NUM_HOLD = 380; // slot-number face holds after landing
const OPEN_MS = 550;

/* ── dummy teams for the preview button ── */
const DEMO_TAGS = ['NOVA', 'TSM', 'FAZE', 'DRX', 'BTR', 'STE', 'IHC', 'GEN', 'T1', 'DPLUS', 'RRQ', '4AM', 'ALTER EGO', 'VAMOS', 'HORAA', 'NIGMA', 'FLC', 'WBG', 'KINGS', 'DMY'];
const DEMO: Team[] = DEMO_TAGS.map((t, i) => ({ _id: `d${i}`, teamTag: t, slot: i + 1, placePoints: 0, players: [], teamLogo: '/def_logo.png' }));

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
   Slot tile
   ───────────────────────────────────────────── */
const SlotTile: React.FC<{
  team: Team;
  slotNo: number;
  order: number;
  tileH: number;
  run: number;
  primary: string;
  secondary: string;
}> = ({ team, slotNo, order, tileH, run, primary, secondary }) => {
  const riseAt = T_FIRST + order * STAGGER;
  const up = useAfter(riseAt, run);
  const open = useAfter(riseAt + RISE_MS + NUM_HOLD, run);
  const settled = useAfter(riseAt + RISE_MS + NUM_HOLD + OPEN_MS * 0.5, run);
  const onPrimary = inkOn(primary);
  const slotLabel = String(slotNo).padStart(2, '0');
  const tag = (team.teamTag || '').toUpperCase();
  const tagSize = Math.min(Math.round(tileH * 0.34), tag.length <= 3 ? 52 : tag.length <= 5 ? 44 : tag.length <= 7 ? 36 : tag.length <= 9 ? 30 : 25);
  const logoBox = Math.round(tileH * 0.72);
  const logoPanelW = Math.round(tileH * 0.9);
  const riseFrom = 1080 - GRID_TOP + 40;

  return (
    <div
      style={{
        position: 'relative',
        width: TILE_W,
        height: tileH,
        flex: 'none',
        transform: up ? 'translateY(0px)' : `translateY(${riseFrom}px)`,
        opacity: up ? 1 : 0,
        transition: `transform ${RISE_MS}ms cubic-bezier(.16,1,.3,1), opacity 150ms linear`,
        willChange: 'transform',
        filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.32))',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, clipPath: tileClip, overflow: 'hidden', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        {/* face 1 — slot number on the theme colour */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: primary,
            color: onPrimary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 110,
              height: '100%',
              background: secondary,
              clipPath: 'polygon(45% 0, 100% 0, 100% 100%, 0 100%)',
              opacity: 0.9,
            }}
          />
          <span style={{ position: 'relative', fontSize: 20, letterSpacing: '0.3em', opacity: 0.85 }}>SLOT</span>
          <span style={{ position: 'relative', fontSize: Math.round(tileH * 0.56), fontVariantNumeric: 'tabular-nums' }}>{slotLabel}</span>
        </div>

        {/* face 2 — white team tile, opens upward */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: open ? '100%' : '0%',
            overflow: 'hidden',
            transition: `height ${OPEN_MS}ms cubic-bezier(.65,0,.25,1)`,
          }}
        >
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: tileH, background: WHITE, display: 'flex', alignItems: 'stretch' }}>
            {/* rail */}
            <div style={{ width: 7, flex: 'none', background: primary }} />
            {/* logo */}
            <div
              style={{
                width: logoPanelW,
                flex: 'none',
                background: PANEL,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
              }}
            >
              <div
                style={{
                  width: logoBox,
                  height: logoBox,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingRight: 10,
                  transform: settled ? 'scale(1)' : 'scale(.6)',
                  opacity: settled ? 1 : 0,
                  transition: 'transform 450ms cubic-bezier(.34,1.56,.64,1), opacity 200ms linear',
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
            </div>
            {/* slot + tag */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '0 18px 0 14px',
                transform: settled ? 'none' : 'translateX(-14px)',
                opacity: settled ? 1 : 0,
                transition: 'transform 450ms cubic-bezier(.2,.8,.2,1) 80ms, opacity 250ms linear 80ms',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, letterSpacing: '0.24em', color: DIM }}>
                SLOT
                <span style={{ background: INK, color: WHITE, padding: '3px 7px 2px', letterSpacing: '0.04em', fontSize: 19 }}>{slotLabel}</span>
              </span>
              <span
                style={{
                  marginTop: Math.round(tileH * 0.08),
                  fontSize: tagSize,
                  color: INK,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {tag}
              </span>
            </div>
            {/* base line */}
            <div style={{ position: 'absolute', left: 7, right: 0, bottom: 0, height: 4, background: secondary }} />
          </div>
          {/* leading edge riding the top of the opening face */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 6, background: INK, opacity: open && !settled ? 1 : 0, transition: 'opacity 150ms linear' }} />
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Slots
   ───────────────────────────────────────────── */
const Slots: React.FC<SlotsProps> = ({ tournament, round, match, matchData }) => {
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);

  const realTeams = matchData?.teams ?? [];
  const teams = (realTeams.length ? realTeams : demo ? DEMO : []).slice(0, COLS * MAX_ROWS);

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const headIn = useAfter(60, run);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const rows = Math.max(1, Math.ceil(teams.length / COLS));
  const tileH = Math.max(110, Math.min(160, Math.floor((GRID_BOTTOM - GRID_TOP - (rows - 1) * ROW_GAP) / rows)));
  const gridW = COLS * TILE_W + (COLS - 1) * COL_GAP;

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

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
      {teams.length > 0 ? (
        <>
          {/* ── heading ── */}
          <div
            key={`head-${run}`}
            style={{
              position: 'absolute',
              left: '50%',
              top: 66,
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
              TEAM SLOTS
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

          {/* ── grid — centred; a partial last row stays centred ── */}
          <div
            key={`grid-${run}`}
            style={{
              position: 'absolute',
              left: (1920 - gridW) / 2,
              top: GRID_TOP,
              width: gridW,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              columnGap: COL_GAP,
              rowGap: ROW_GAP,
            }}
          >
            {teams.map((team, i) => (
              <SlotTile
                key={String(team._id ?? team.teamId ?? i)}
                team={team}
                slotNo={Number(team.slot) || i + 1}
                order={i}
                tileH={tileH}
                run={run}
                primary={primary}
                secondary={secondary}
              />
            ))}
          </div>
        </>
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
  );
};

export default Slots;