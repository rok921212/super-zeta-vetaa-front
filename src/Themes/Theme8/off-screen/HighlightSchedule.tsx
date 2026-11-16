import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { isWinningPlacement } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';

// THEME8 "WHITE LABEL" — Highlight Schedule (corner widget, 1920×1080, ≤ 6 matches).
// Made for the highlights screen: no heading, compact cards in the LEFT CORNER.
// Data handling unchanged: matches + matchDatas zipped by index, optional
// selectedScheduleMatches filter, de-duplicated by match number, sorted, and
// the WWCD team per match via isWinningPlacement (total = its kills + place pts).
//
//   card (292 × 152)   ┌──────────────────────────────┐
//                      │▌MATCH 01│   map image   [MAP]│  map band
//                      ├──────────────────────────────┤
//                      │▌[logo] ♛ WWCD          │ 24  │  played → winner + pts
//                      │        NOVA            │ PTS │  next   → NEXT + time
//                      └──────────────────────────────┘  later  → UPCOMING + time
//
// Layouts (toggle with the button BELOW the 1080 line, or the `layout` prop):
//   vertical    a column in the top-left corner
//   horizontal  a row along the bottom-left
// The choice is remembered in this browser (localStorage).
//
// Motion (state + CSS transitions only — always plays, even with OS
// "reduce motion"):
//   1) cards slide in one after another (from the left in the column, from
//      below in the row)
//   2) each card first shows MATCH NO + MAP on the theme colour, then wipes
//      open to the card; logo pops, points count up
// PREVIEW + LAYOUT buttons sit OUTSIDE the canvas (y ≥ 1100), so a 1920×1080
// browser source never shows them. Preview uses 6 dummy matches when there is
// no data.

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

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const PANEL = '#EFEFF2';
const DIM = '#7A7A84';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const MAX_MATCHES = 6;
const CARD_W = 292; // 6 cards in a row still fit inside 1920 (6×292 + 5×14 + 40 = 1862)
const CARD_H = 152;
const MAP_H = 58;
const BODY_H = CARD_H - MAP_H; // 94
const GAP = 14;
const MARGIN = 40; // distance from the canvas edges
const NUM_W = 96;
const PTS_W = 84;
const CUT = 16;
const cardClip = `polygon(${CUT}px 0, 100% 0, 100% calc(100% - ${CUT}px), calc(100% - ${CUT}px) 100%, 0 100%, 0 ${CUT}px)`;

/* ── timeline (ms) ── */
const T_FIRST = 300;
const STAGGER = 200;
const IN_MS = 750;
const FACE_HOLD = 380;
const OPEN_MS = 550;
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
   Map band (image when it loads, otherwise a textured panel)
   ───────────────────────────────────────────── */
const MapBand: React.FC<{ map?: string }> = ({ map }) => {
  const src = getMapImage(map);
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(false), [src]);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: PANEL }}>
      {src && (
        <img
          src={src}
          alt=""
          onLoad={() => setOk(true)}
          onError={() => setOk(false)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            maxWidth: 'none',
            objectFit: 'cover',
            display: 'block',
            opacity: ok ? 1 : 0,
            transition: 'opacity 300ms linear',
          }}
        />
      )}
      {!ok && <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(-60deg, rgba(11,11,14,.07) 0 2px, transparent 2px 10px)' }} />}
      {ok && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(270deg, rgba(11,11,14,.5), rgba(11,11,14,0) 60%)' }} />}
    </div>
  );
};

/* ─────────────────────────────────────────────
   One match card
   ───────────────────────────────────────────── */
const MatchCard: React.FC<{
  v: View;
  order: number;
  isNext: boolean;
  layout: Layout;
  run: number;
  primary: string;
  secondary: string;
}> = ({ v, order, isNext, layout, run, primary, secondary }) => {
  const inAt = T_FIRST + order * STAGGER;
  const shown = useAfter(inAt, run);
  const open = useAfter(inAt + IN_MS + FACE_HOLD, run);
  const settled = useAfter(inAt + IN_MS + FACE_HOLD + OPEN_MS * 0.6, run);
  const pts = useCountUp(v.total ?? 0, settled && !!v.winner, 800);
  const onPrimary = inkOn(primary);
  const played = !!v.winner;
  const noLabel = String(v.no).padStart(2, '0');
  const live = played || isNext;
  const tag = (v.winner?.tag || '').toUpperCase();
  const tagSize = tag.length <= 5 ? 40 : tag.length <= 8 ? 32 : 26;

  // column: slide in from the left edge · row: rise from below
  const hidden = layout === 'vertical' ? `translateX(${-(CARD_W + MARGIN + 40)}px)` : `translateY(${CARD_H + MARGIN + 40}px)`;

  return (
    <div
      style={{
        position: 'relative',
        width: CARD_W,
        height: CARD_H,
        flex: 'none',
        transform: shown ? 'none' : hidden,
        opacity: shown ? 1 : 0,
        transition: `transform ${IN_MS}ms cubic-bezier(.16,1,.3,1), opacity 150ms linear`,
        willChange: 'transform',
        filter: 'drop-shadow(0 10px 22px rgba(0,0,0,0.34))',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, clipPath: cardClip, overflow: 'hidden', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        {/* face 1 — match number + map on the theme colour */}
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
            gap: 8,
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 120,
              background: secondary,
              clipPath: 'polygon(45% 0, 100% 0, 100% 100%, 0 100%)',
              opacity: 0.9,
            }}
          />
          <span style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 20, letterSpacing: '0.3em', opacity: 0.85 }}>MATCH</span>
            <span style={{ fontSize: 68, fontVariantNumeric: 'tabular-nums' }}>{noLabel}</span>
          </span>
          <span style={{ position: 'relative', fontSize: 20, letterSpacing: '0.3em', opacity: 0.9 }}>{(v.map || 'TBD').toUpperCase()}</span>
        </div>

        {/* face 2 — the card, wipes open (down the column / across the row) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: layout === 'vertical' ? (open ? '100%' : '0%') : '100%',
            height: layout === 'horizontal' ? (open ? '100%' : '0%') : '100%',
            overflow: 'hidden',
            transition: `${layout === 'vertical' ? 'width' : 'height'} ${OPEN_MS}ms cubic-bezier(.65,0,.25,1)`,
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, width: CARD_W, height: CARD_H, background: WHITE }}>
            {/* map band */}
            <div style={{ position: 'absolute', left: 0, top: 0, width: CARD_W, height: MAP_H }}>
              <MapBand map={v.map} />
              {/* match number chip */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: NUM_W,
                  background: INK,
                  color: WHITE,
                  clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  paddingLeft: CUT,
                }}
              >
                <span style={{ fontSize: 12, letterSpacing: '0.2em', color: 'rgba(255,255,255,.6)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                  MATCH
                </span>
                <span style={{ fontSize: 40, fontVariantNumeric: 'tabular-nums' }}>{noLabel}</span>
              </div>
              {/* map tag */}
              <div
                style={{
                  position: 'absolute',
                  right: 10,
                  bottom: 8,
                  background: WHITE,
                  color: INK,
                  padding: '4px 9px 3px',
                  fontSize: 16,
                  letterSpacing: '0.18em',
                  boxShadow: `inset 3px 0 0 ${primary}`,
                }}
              >
                {(v.map || 'TBD').toUpperCase()}
              </div>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: live ? primary : '#C9C9CF' }} />
            </div>

            {/* body */}
            <div style={{ position: 'absolute', left: 0, top: MAP_H, width: CARD_W, height: BODY_H, display: 'flex', alignItems: 'stretch' }}>
              <div style={{ width: 6, flex: 'none', background: live ? primary : '#C9C9CF' }} />
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '0 12px 0 12px',
                  opacity: settled ? 1 : 0,
                  transform: settled ? 'none' : 'translateY(8px)',
                  transition: 'opacity 250ms linear, transform 400ms cubic-bezier(.2,.8,.2,1)',
                }}
              >
                {played ? (
                  <>
                    <div
                      style={{
                        width: 58,
                        height: 58,
                        flex: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: settled ? 'scale(1)' : 'scale(.5)',
                        transition: 'transform 450ms cubic-bezier(.34,1.56,.64,1) 100ms',
                      }}
                    >
                      <TeamLogo
                        logo={v.winner!.logo}
                        flag={v.winner!.flag}
                        fallback={'/def_logo.png'}
                        alt={v.winner!.tag}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      />
                    </div>
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, letterSpacing: '0.24em', color: DIM }}>
                        <svg width={16} height={12} viewBox="0 0 40 30" aria-hidden>
                          <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={primary} />
                        </svg>
                        WWCD
                      </span>
                      <span style={{ fontSize: tagSize, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span
                      style={{
                        alignSelf: 'flex-start',
                        background: isNext ? primary : PANEL,
                        color: isNext ? onPrimary : DIM,
                        padding: '4px 10px 3px',
                        fontSize: 15,
                        letterSpacing: '0.24em',
                      }}
                    >
                      {isNext ? 'UP NEXT' : 'UPCOMING'}
                    </span>
                    <span style={{ fontSize: 40, color: isNext ? INK : DIM, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                      {(v.time || 'TBD').toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* right block — points (played) / clock mark (unplayed) */}
              <div
                style={{
                  width: PTS_W,
                  flex: 'none',
                  background: played ? primary : isNext ? INK : PANEL,
                  color: played ? onPrimary : isNext ? WHITE : DIM,
                  clipPath: 'polygon(14px 0, 100% 0, 100% 100%, 0 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingLeft: 10,
                  paddingRight: CUT / 2,
                  boxShadow: played ? `inset 0 -4px 0 ${secondary}` : 'none',
                }}
              >
                {played ? (
                  <>
                    <span style={{ fontSize: 42, fontVariantNumeric: 'tabular-nums' }}>{pts}</span>
                    <span style={{ fontSize: 13, letterSpacing: '0.26em', opacity: 0.85, paddingLeft: '0.26em' }}>PTS</span>
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
          {/* leading edge riding the wipe */}
          <div
            style={{
              position: 'absolute',
              ...(layout === 'vertical' ? { right: 0, top: 0, bottom: 0, width: 8 } : { left: 0, right: 0, bottom: 0, height: 6 }),
              background: INK,
              opacity: open && !settled ? 1 : 0,
              transition: 'opacity 150ms linear',
            }}
          />
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   HighlightSchedule
   ───────────────────────────────────────────── */
const HighlightSchedule: React.FC<ScheduleProps> = ({
  tournament,
  round,
  matches: propMatches,
  matchDatas: propMatchDatas,
  selectedScheduleMatches,
  layout: layoutProp,
}) => {
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
        const winningTeams =
          match.teams?.filter((team) => isWinningPlacement(team.placePoints, (team.players?.[0] as any)?.rank)) || [];
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

  // block position: column → top-left corner · row → bottom-left
  const n = views.length;
  const blockStyle: React.CSSProperties =
    layout === 'vertical'
      ? { position: 'absolute', left: MARGIN, top: MARGIN, display: 'flex', flexDirection: 'column', gap: GAP }
      : { position: 'absolute', left: MARGIN, bottom: MARGIN, display: 'flex', flexDirection: 'row', gap: GAP };

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
      {(round || demo) && n > 0 && (
        <div key={`list-${run}-${layout}`} style={blockStyle}>
          {views.map((v, i) => (
            <MatchCard
              key={v.key}
              v={v}
              order={i}
              isNext={i === nextIndex}
              layout={layout}
              run={run}
              primary={primary}
              secondary={tournament.secondaryColor || primary}
            />
          ))}
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
  );
};

export default HighlightSchedule;