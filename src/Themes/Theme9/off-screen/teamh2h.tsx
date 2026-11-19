import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { computeMatchStandings } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
// THEME8 "WHITE LABEL" — Team Head to Head (top two of computeMatchStandings,
// exactly as before).
//
//   heading       ink trapezoid "TEAM HEAD TO HEAD" + round · day · match tab
//   ┌──────────┐   ┌────── VS ──────┐   ┌──────────┐
//   │ #1 LOGO  │   │ 12  KILLS   9  │   │ #2 LOGO  │   team cards: logo on the
//   │          │   │ ▬▬▬▬▬|▬▬▬      │   │          │   theme colour + ink name bar
//   │ TEAM NAME│   │ 10 PLACE PTS 6 │   │ TEAM NAME│   centre: three rows, values
//   └──────────┘   │ 22  TOTAL   15 │   └──────────┘   either side, bars grow out
//                  └────────────────┘                  from the middle; the leader
//                                                      of each row is in primary.
// Motion (state + CSS transitions only — always plays, even with OS
// "reduce motion"):
//   1) heading drops in
//   2) both team cards rise from below the screen, one after the other
//   3) each card shows the TEAM LOGO face, then opens upward to the team panel
//   4) VS emblem pops; comparison rows reveal one by one, bars grow, numbers count
// PREVIEW: a "Preview H2H" button OUTSIDE the 1920×1080 canvas replays the
// sequence (dummy teams when there is no data).

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

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
}

interface Player {
  _id: string;
  playerName: string;
  killNum?: number;
  rank?: number;
  assists?: number;
  knockouts?: number;
  damage?: number;
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
  players: Player[];
}

interface MatchData {
  _id: string;
  matchId: string;
  userId: string;
  teams: Team[];
}

interface TeamH2HProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

/** the fields of a standings row this screen shows */
interface H2HTeam {
  teamName: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
  totalKills: number;
  placePoints: number;
  total: number;
}

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const PANEL = '#EFEFF2';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const TEAM_W = 460;
const MID_W = 580;
const GAP = 34;
const ROW_W = TEAM_W * 2 + MID_W + GAP * 2; // 1568
const BLOCK_TOP = 290;
const BLOCK_H = 600;
const LOGO_PANEL_H = 470;
const NAME_H = BLOCK_H - LOGO_PANEL_H; // 130
const CORNER = 34;
const VS = 124;
const STAT_ROW_H = 132;

/* ── timeline (ms) ── */
const T_LEFT = 450;
const T_RIGHT = 750;
const RISE_MS = 900;
const LOGO_HOLD = 650;
const OPEN_MS = 700;
const T_MID = T_RIGHT + RISE_MS + LOGO_HOLD + OPEN_MS * 0.6; // after both cards have opened
const ROW_STAGGER = 220;
const RISE_FROM = 1080 - BLOCK_TOP + 60;

/* ── dummy teams for the preview button ── */
const DEMO: [H2HTeam, H2HTeam] = [
  { teamName: 'DUMMY ESPORTS', teamTag: 'DMY', teamLogo: '/def_logo.png', totalKills: 12, placePoints: 10, total: 22 },
  { teamName: 'NOVA', teamTag: 'NOVA', teamLogo: '/def_logo.png', totalKills: 9, placePoints: 6, total: 15 },
];

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

/* number counts up 0 → n once `active` turns true */
function useCountUp(target: number, active: boolean, durMs = 800) {
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
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durMs]);
  return v;
}

/* ─────────────────────────────────────────────
   Team card — rises, shows logo face, opens to the team panel
   ───────────────────────────────────────────── */
const TeamCard: React.FC<{
  team: H2HTeam;
  rank: number;
  side: 'left' | 'right';
  riseAt: number;
  run: number;
  primary: string;
  secondary: string;
}> = ({ team, rank, side, riseAt, run, primary, secondary }) => {
  const up = useAfter(riseAt, run);
  const logoIn = useAfter(riseAt + RISE_MS * 0.55, run);
  const open = useAfter(riseAt + RISE_MS + LOGO_HOLD, run);
  const settled = useAfter(riseAt + RISE_MS + LOGO_HOLD + OPEN_MS * 0.5, run);
  const onPrimary = inkOn(primary);
  const name = (team.teamName || team.teamTag || '').toUpperCase();
  const nameSize = name.length <= 12 ? 54 : name.length <= 18 ? 42 : name.length <= 24 ? 34 : 28;
  // mirror the cut corner so the two cards frame the centre
  const clip =
    side === 'left'
      ? `polygon(${CORNER}px 0, 100% 0, 100% 100%, 0 100%, 0 ${CORNER}px)`
      : `polygon(0 0, calc(100% - ${CORNER}px) 0, 100% ${CORNER}px, 100% 100%, 0 100%)`;
  const rail = side === 'left' ? { left: 0 } : { right: 0 };

  return (
    <div
      style={{
        position: 'relative',
        width: TEAM_W,
        height: BLOCK_H,
        flex: 'none',
        transform: up ? 'translateY(0px)' : `translateY(${RISE_FROM}px)`,
        opacity: up ? 1 : 0,
        transition: `transform ${RISE_MS}ms cubic-bezier(.16,1,.3,1), opacity 150ms linear`,
        willChange: 'transform',
        filter: 'drop-shadow(0 18px 34px rgba(0,0,0,0.38))',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, clipPath: clip, overflow: 'hidden', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        {/* face 1 — team logo on white */}
        <div style={{ position: 'absolute', inset: 0, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', ...rail, top: 0, bottom: 0, width: 10, background: primary }} />
          <div
            style={{
              width: 240,
              height: 240,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: logoIn ? 'scale(1)' : 'scale(0.6)',
              opacity: logoIn ? 1 : 0,
              transition: 'transform 500ms cubic-bezier(.34,1.56,.64,1), opacity 250ms linear',
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

        {/* face 2 — team panel, opens upward */}
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
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: BLOCK_H }}>
            {/* logo panel on the theme colour */}
            <div style={{ position: 'relative', height: LOGO_PANEL_H, background: primary, overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  [side === 'left' ? 'right' : 'left']: 0,
                  bottom: 0,
                  width: 220,
                  height: 300,
                  background: secondary,
                  clipPath:
                    side === 'left'
                      ? 'polygon(55% 0, 100% 0, 100% 100%, 0 100%)'
                      : 'polygon(0 0, 45% 0, 100% 100%, 0 100%)',
                  opacity: 0.9,
                }}
              />
              {/* rank chip */}
              <div
                style={{
                  position: 'absolute',
                  top: 26,
                  [side === 'left' ? 'left' : 'right']: side === 'left' ? CORNER + 8 : 26,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  background: INK,
                  color: WHITE,
                  padding: '8px 16px 6px',
                  fontSize: 22,
                  letterSpacing: '0.18em',
                }}
              >
                RANK <span style={{ fontSize: 34, letterSpacing: 0, color: primary }}>#{rank}</span>
              </div>
              <div
                style={{
                  position: 'absolute',
                  [side === 'left' ? 'right' : 'left']: 26,
                  top: 32,
                  width: 70,
                  height: 10,
                  background: `repeating-linear-gradient(-60deg, ${onPrimary === WHITE ? 'rgba(255,255,255,.5)' : 'rgba(11,11,14,.5)'} 0 3px, transparent 3px 8px)`,
                }}
              />
              {/* logo in a white tile */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 30 }}>
                <div
                  style={{
                    width: 280,
                    height: 280,
                    background: WHITE,
                    clipPath: 'polygon(28px 0, 100% 0, 100% calc(100% - 28px), calc(100% - 28px) 100%, 0 100%, 0 28px)',
                    boxShadow: `inset 0 -8px 0 ${INK}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 36,
                    boxSizing: 'border-box',
                    transform: settled ? 'none' : 'translateY(40px)',
                    opacity: settled ? 1 : 0,
                    transition: 'transform 600ms cubic-bezier(.2,.8,.2,1), opacity 300ms linear',
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
            </div>
            {/* name bar */}
            <div
              style={{
                height: NAME_H,
                background: INK,
                color: WHITE,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                position: 'relative',
              }}
            >
              <span style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 5, background: primary }} />
              <span style={{ fontSize: nameSize, letterSpacing: '0.03em', maxWidth: TEAM_W - 40, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {name}
              </span>
              <span style={{ fontSize: 22, letterSpacing: '0.3em', color: 'rgba(255,255,255,.6)', paddingLeft: '0.3em' }}>
                {(team.teamTag || '').toUpperCase()}
              </span>
            </div>
          </div>
          {/* leading edge riding the top of the opening face */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 8, background: primary, opacity: open && !settled ? 1 : 0, transition: 'opacity 200ms linear' }} />
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Comparison row — values either side, bars grow out from the middle
   ───────────────────────────────────────────── */
const StatRow: React.FC<{ label: string; a: number; b: number; at: number; run: number; primary: string; last?: boolean }> = ({
  label,
  a,
  b,
  at,
  run,
  primary,
  last,
}) => {
  const on = useAfter(at, run);
  const va = useCountUp(a, on, 800);
  const vb = useCountUp(b, on, 800);
  const max = Math.max(1, a, b);
  const aLead = a > b;
  const bLead = b > a;
  const half = MID_W / 2 - 40;

  return (
    <div
      style={{
        position: 'relative',
        height: STAT_ROW_H,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 30px',
        boxShadow: last ? 'none' : `inset 0 -1px 0 ${LINE}`,
        opacity: on ? 1 : 0,
        transform: on ? 'none' : 'translateY(18px)',
        transition: 'opacity 300ms linear, transform 500ms cubic-bezier(.2,.8,.2,1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 72, color: aLead ? primary : INK, fontVariantNumeric: 'tabular-nums', minWidth: 110 }}>{va}</span>
        <span style={{ fontSize: 22, letterSpacing: '0.3em', color: DIM, paddingLeft: '0.3em' }}>{label}</span>
        <span style={{ fontSize: 72, color: bLead ? primary : INK, fontVariantNumeric: 'tabular-nums', minWidth: 110, textAlign: 'right' }}>{vb}</span>
      </div>
      {/* bars from the centre */}
      <div style={{ position: 'relative', height: 10, marginTop: 14, background: PANEL }}>
        <div
          style={{
            position: 'absolute',
            right: '50%',
            top: 0,
            bottom: 0,
            marginRight: 3,
            width: on ? (a / max) * half : 0,
            background: aLead ? primary : INK,
            transition: 'width 800ms cubic-bezier(.2,.8,.2,1) 120ms',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            marginLeft: 3,
            width: on ? (b / max) * half : 0,
            background: bLead ? primary : INK,
            transition: 'width 800ms cubic-bezier(.2,.8,.2,1) 120ms',
          }}
        />
        <div style={{ position: 'absolute', left: '50%', top: -6, bottom: -6, width: 2, marginLeft: -1, background: INK }} />
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   TeamH2H
   ───────────────────────────────────────────── */
const TeamH2H: React.FC<TeamH2HProps> = ({ tournament, round, match, matchData }) => {
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);

  const topTeams = useMemo(() => {
    const s = computeMatchStandings(matchData as any);
    return { first: (s[0] as unknown as H2HTeam) || null, second: (s[1] as unknown as H2HTeam) || null };
  }, [matchData]);

  const hasReal = !!(matchData && topTeams.first && topTeams.second);
  const pair: [H2HTeam, H2HTeam] | null = hasReal ? [topTeams.first!, topTeams.second!] : demo ? DEMO : null;

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const headIn = useAfter(60, run);
  const vsIn = useAfter(T_MID, run);
  const midIn = useAfter(T_MID - 150, run);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const onPrimary = inkOn(primary);
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
      {pair ? (
        <>
          {/* ── heading ── */}
          <div
            key={`head-${run}`}
            style={{
              position: 'absolute',
              left: '50%',
              top: 70,
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
              TEAM HEAD TO HEAD
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

          {/* ── face-off row ── */}
          <div
            key={`row-${run}`}
            style={{ position: 'absolute', left: (1920 - ROW_W) / 2, top: BLOCK_TOP, width: ROW_W, height: BLOCK_H, display: 'flex', gap: GAP }}
          >
            <TeamCard team={pair[0]} rank={1} side="left" riseAt={T_LEFT} run={run} primary={primary} secondary={secondary} />

            {/* centre comparison */}
            <div style={{ position: 'relative', width: MID_W, height: BLOCK_H, flex: 'none' }}>
              {/* VS emblem */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  width: VS,
                  height: VS,
                  marginLeft: -VS / 2,
                  zIndex: 2,
                  transform: vsIn ? 'scale(1) rotate(0deg)' : 'scale(.4) rotate(-12deg)',
                  opacity: vsIn ? 1 : 0,
                  transition: 'transform 550ms cubic-bezier(.34,1.56,.64,1), opacity 200ms linear',
                  filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.35))',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: primary,
                    color: onPrimary,
                    clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 56,
                    letterSpacing: '0.02em',
                  }}
                >
                  VS
                </div>
              </div>

              {/* white stats panel */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: VS / 2,
                  bottom: 0,
                  background: WHITE,
                  clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%)`,
                  filter: 'drop-shadow(0 18px 34px rgba(0,0,0,0.38))',
                  opacity: midIn ? 1 : 0,
                  transform: midIn ? 'none' : 'translateY(30px)',
                  transition: 'opacity 300ms linear, transform 600ms cubic-bezier(.16,1,.3,1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  paddingTop: VS / 2 - 6,
                  paddingBottom: 6,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 6, background: INK }} />
                <StatRow label="KILLS" a={num(pair[0].totalKills)} b={num(pair[1].totalKills)} at={T_MID + 250} run={run} primary={primary} />
                <StatRow label="PLACE PTS" a={num(pair[0].placePoints)} b={num(pair[1].placePoints)} at={T_MID + 250 + ROW_STAGGER} run={run} primary={primary} />
                <StatRow label="TOTAL" a={num(pair[0].total)} b={num(pair[1].total)} at={T_MID + 250 + ROW_STAGGER * 2} run={run} primary={primary} last />
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, background: secondary }} />
              </div>
            </div>

            <TeamCard team={pair[1]} rank={2} side="right" riseAt={T_RIGHT} run={run} primary={primary} secondary={secondary} />
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
            NOT ENOUGH TEAMS
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
          top: 300,
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
        ▶ PREVIEW H2H
      </button>
    </div>
  );
};

export default TeamH2H;