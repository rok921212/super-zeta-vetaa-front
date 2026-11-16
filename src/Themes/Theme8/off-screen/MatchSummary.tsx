import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { computeMatchTotals } from '../../shared/hooks/matchTotals';
// THEME8 "WHITE LABEL" — Match Summary (totals from computeMatchTotals, as before).
//
//   heading   ink trapezoid "MATCH SUMMARY" + tournament · round · match tab
//   grid      3 × 2 stat tiles, centred
//             tile:  ▌[icon] ELIMINATIONS
//                    ▌                 128
//
// Motion (state + CSS transitions only — always plays, even with OS
// "reduce motion"):
//   1) heading drops in
//   2) tiles rise from below the screen one after another
//   3) each tile first shows its ICON on the theme colour, then opens upward
//      to the white stat tile; the number counts up
// PREVIEW: a "Preview summary" button OUTSIDE the 1920×1080 canvas replays the
// sequence (dummy totals when there is no data).

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
  assists?: number;
  knockouts?: number;
  killNumInVehicle?: number;
  killNumByGrenade?: number;
  headShotNum?: number;
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

interface MatchSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

type Totals = {
  totalEliminations: number;
  totalAssists: number;
  totalKnockouts: number;
  totalKillsInVehicle: number;
  totalKillsByGrenade: number;
  totalHeadshots: number;
};
type IconKey = 'elims' | 'assists' | 'knocks' | 'vehicle' | 'grenade' | 'headshot';

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const COLS = 3;
const TILE_W = 480;
const TILE_H = 270;
const COL_GAP = 30;
const ROW_GAP = 30;
const GRID_TOP = 290;
const CUT = 28;
const tileClip = `polygon(${CUT}px 0, 100% 0, 100% calc(100% - ${CUT}px), calc(100% - ${CUT}px) 100%, 0 100%, 0 ${CUT}px)`;

/* ── timeline (ms) ── */
const T_FIRST = 450;
const STAGGER = 220;
const RISE_MS = 850;
const ICON_HOLD = 500;
const OPEN_MS = 650;

const DEMO: Totals = {
  totalEliminations: 128,
  totalAssists: 61,
  totalKnockouts: 154,
  totalKillsInVehicle: 9,
  totalKillsByGrenade: 14,
  totalHeadshots: 37,
};

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
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durMs]);
  return v;
}

/* ─────────────────────────────────────────────
   Stat icons (24×24, currentColor)
   ───────────────────────────────────────────── */
const ICONS: Record<IconKey, React.ReactNode> = {
  // crosshair
  elims: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 1.5 V7 M12 17 V22.5 M1.5 12 H7 M17 12 H22.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </g>
  ),
  // two figures — teamwork
  assists: (
    <g fill="currentColor">
      <circle cx="8" cy="6.5" r="3.2" />
      <path d="M2 21 C2 15.5 4.6 12 8 12 C11.4 12 14 15.5 14 21 Z" />
      <circle cx="16.5" cy="7.5" r="2.7" opacity="0.7" />
      <path d="M12.8 21 C13 16.4 14.6 13 16.5 13 C19.4 13 22 16 22 21 Z" opacity="0.7" />
    </g>
  ),
  // knocked: figure down + arrow
  knocks: (
    <g fill="currentColor">
      <path d="M12 2 V11 M8 7.5 L12 11.5 L16 7.5" stroke="currentColor" strokeWidth="2.4" fill="none" />
      <circle cx="5" cy="17" r="2.6" />
      <path d="M8 15.4 H21 C22 15.4 22.6 16 22.6 17 C22.6 18 22 18.6 21 18.6 H8 Z" />
      <rect x="1.5" y="20.6" width="21" height="1.8" />
    </g>
  ),
  // car
  vehicle: (
    <g fill="currentColor">
      <path d="M5 11 L7.3 6.2 C7.6 5.5 8.3 5 9.1 5 H14.9 C15.7 5 16.4 5.5 16.7 6.2 L19 11 H20.5 C21.3 11 22 11.7 22 12.5 V17 H2 V12.5 C2 11.7 2.7 11 3.5 11 Z" />
      <path d="M7.4 10.6 L8.9 7 H15.1 L16.6 10.6 Z" fill={INK} fillOpacity={0.35} />
      <circle cx="6.5" cy="17.5" r="2.4" />
      <circle cx="17.5" cy="17.5" r="2.4" />
    </g>
  ),
  // grenade
  grenade: (
    <g fill="currentColor">
      <rect x="9" y="4.5" width="6" height="4" />
      <path d="M15 5 L19 3 L20 5 L15.5 7.5 Z" />
      <circle cx="7.5" cy="5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8 C7.2 8 5 11.5 5 15 C5 19 8.2 22 12 22 C15.8 22 19 19 19 15 C19 11.5 16.8 8 12 8 Z" />
    </g>
  ),
  // head in a reticle
  headshot: (
    <g>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 0.5 V4 M12 20 V23.5 M0.5 12 H4 M20 12 H23.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="9.8" r="3.3" fill="currentColor" />
      <path d="M6.6 18.4 C7.4 15.4 9.4 13.8 12 13.8 C14.6 13.8 16.6 15.4 17.4 18.4 Z" fill="currentColor" />
    </g>
  ),
};
const StatIcon = ({ k, size, color }: { k: IconKey; size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ color, display: 'block', flex: 'none' }} aria-hidden>
    {ICONS[k]}
  </svg>
);

/* ─────────────────────────────────────────────
   Stat tile
   ───────────────────────────────────────────── */
const StatTile: React.FC<{
  label: string;
  icon: IconKey;
  value: number;
  order: number;
  run: number;
  primary: string;
  secondary: string;
}> = ({ label, icon, value, order, run, primary, secondary }) => {
  const riseAt = T_FIRST + order * STAGGER;
  const up = useAfter(riseAt, run);
  const iconIn = useAfter(riseAt + RISE_MS * 0.55, run);
  const open = useAfter(riseAt + RISE_MS + ICON_HOLD, run);
  const settled = useAfter(riseAt + RISE_MS + ICON_HOLD + OPEN_MS * 0.5, run);
  const v = useCountUp(value, settled, 1000);
  const onPrimary = inkOn(primary);
  const riseFrom = 1080 - GRID_TOP + 40;

  return (
    <div
      style={{
        position: 'relative',
        width: TILE_W,
        height: TILE_H,
        flex: 'none',
        transform: up ? 'translateY(0px)' : `translateY(${riseFrom}px)`,
        opacity: up ? 1 : 0,
        transition: `transform ${RISE_MS}ms cubic-bezier(.16,1,.3,1), opacity 150ms linear`,
        willChange: 'transform',
        filter: 'drop-shadow(0 16px 30px rgba(0,0,0,0.35))',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, clipPath: tileClip, overflow: 'hidden', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        {/* face 1 — icon on the theme colour */}
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
            gap: 18,
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 170,
              height: '100%',
              background: secondary,
              clipPath: 'polygon(55% 0, 100% 0, 100% 100%, 0 100%)',
              opacity: 0.9,
            }}
          />
          <div
            style={{
              position: 'relative',
              transform: iconIn ? 'scale(1)' : 'scale(.5) rotate(-10deg)',
              opacity: iconIn ? 1 : 0,
              transition: 'transform 500ms cubic-bezier(.34,1.56,.64,1), opacity 200ms linear',
            }}
          >
            <StatIcon k={icon} size={104} color={onPrimary} />
          </div>
          <span style={{ position: 'relative', fontSize: 24, letterSpacing: '0.3em', paddingLeft: '0.3em', opacity: iconIn ? 0.9 : 0, transition: 'opacity 300ms linear 150ms' }}>
            {label}
          </span>
        </div>

        {/* face 2 — white stat tile, opens upward */}
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
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: TILE_H, background: WHITE }}>
            {/* rail */}
            <div style={{ position: 'absolute', left: 0, top: CUT, bottom: 0, width: 10, background: primary }} />
            {/* header: icon chip + label */}
            <div
              style={{
                position: 'absolute',
                left: 34,
                right: 28,
                top: 30,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                transform: settled ? 'none' : 'translateX(-14px)',
                opacity: settled ? 1 : 0,
                transition: 'transform 450ms cubic-bezier(.2,.8,.2,1), opacity 250ms linear',
              }}
            >
              <span
                style={{
                  width: 62,
                  height: 62,
                  flex: 'none',
                  background: INK,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  clipPath: 'polygon(12px 0, 100% 0, 100% 100%, 0 100%, 0 12px)',
                }}
              >
                <StatIcon k={icon} size={36} color={primary} />
              </span>
              <span style={{ fontSize: 28, letterSpacing: '0.2em', color: INK }}>{label}</span>
            </div>
            {/* big number */}
            <div
              style={{
                position: 'absolute',
                right: 38,
                bottom: 30,
                fontSize: 150,
                lineHeight: 0.8,
                color: INK,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {v}
            </div>
            {/* accent marks, bottom-left */}
            <div style={{ position: 'absolute', left: 34, bottom: 40, display: 'flex', gap: 6 }}>
              <span style={{ width: 54, height: 6, background: primary }} />
              <span style={{ width: 14, height: 6, background: secondary }} />
            </div>
            <div style={{ position: 'absolute', left: 34, bottom: 60, width: 120, height: 2, background: LINE }} />
            <div style={{ position: 'absolute', left: 34, bottom: 70, fontSize: 18, letterSpacing: '0.24em', color: DIM }}>TOTAL</div>
          </div>
          {/* leading edge riding the top of the opening face */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 7, background: INK, opacity: open && !settled ? 1 : 0, transition: 'opacity 150ms linear' }} />
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   MatchSummary
   ───────────────────────────────────────────── */
const MatchSummary: React.FC<MatchSummaryProps> = ({ tournament, round, match, matchData }) => {
  const realStats = useMemo(() => computeMatchTotals(matchData as any) as Totals | null, [matchData]);
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);
  const stats: Totals | null = matchData && realStats ? realStats : demo ? DEMO : null;

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const headIn = useAfter(60, run);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const matchNo = match?.matchNo ?? match?._matchNo;
  const context = [
    tournament.tournamentName,
    round?.roundName,
    matchNo != null ? `MATCH ${String(matchNo).padStart(2, '0')}` : match?.matchName || '',
  ]
    .filter(Boolean)
    .join('  ·  ')
    .toUpperCase();

  const tiles: { label: string; icon: IconKey; value: number }[] = stats
    ? [
        { label: 'ELIMINATIONS', icon: 'elims', value: num(stats.totalEliminations) },
        { label: 'ASSISTS', icon: 'assists', value: num(stats.totalAssists) },
        { label: 'KNOCKOUTS', icon: 'knocks', value: num(stats.totalKnockouts) },
        { label: 'VEHICLE KILLS', icon: 'vehicle', value: num(stats.totalKillsInVehicle) },
        { label: 'GRENADE KILLS', icon: 'grenade', value: num(stats.totalKillsByGrenade) },
        { label: 'HEADSHOTS', icon: 'headshot', value: num(stats.totalHeadshots) },
      ]
    : [];
  const gridW = COLS * TILE_W + (COLS - 1) * COL_GAP;

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
      {stats ? (
        <>
          {/* ── heading ── */}
          <div
            key={`head-${run}`}
            style={{
              position: 'absolute',
              left: '50%',
              top: 74,
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
              MATCH SUMMARY
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

          {/* ── stat tiles ── */}
          <div
            key={`grid-${run}`}
            style={{
              position: 'absolute',
              left: (1920 - gridW) / 2,
              top: GRID_TOP,
              width: gridW,
              display: 'flex',
              flexWrap: 'wrap',
              columnGap: COL_GAP,
              rowGap: ROW_GAP,
            }}
          >
            {tiles.map((t, i) => (
              <StatTile key={t.label} label={t.label} icon={t.icon} value={t.value} order={i} run={run} primary={primary} secondary={secondary} />
            ))}
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
          top: 412,
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
        ▶ PREVIEW SUMMARY
      </button>
    </div>
  );
};

export default MatchSummary;