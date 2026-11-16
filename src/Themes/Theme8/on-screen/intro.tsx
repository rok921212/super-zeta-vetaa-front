import React, { useCallback, useEffect, useState } from 'react';

// THEME8 "WHITE LABEL" Intro — a centred TITLE CARD (deliberately unlike the
// lower-third strip). Same palette, cuts and motion as the other theme8 overlays.
//
//            ┌──────────────────────────────────┐   chamfered corners,
//            │            [ LOGO ]              │   primary rail left,
//            │       TOURNAMENT  NAME           │   secondary rail right
//            │   ───────  ▬▬▬ ▬  ───────        │
//            ├───────────┬──────────┬───────────┤
//            │  ROUND    │  DAY     │▌ MATCH    │   spec row; MATCH is the
//            │  FINALS   │  02      │▌   07     │   solid primary block
//            └──────────────────────────────────┘
//
// Motion — the Alerts / Dom sequence, played once on mount, then it holds:
//   1) white card opens, tournament logo pops in the middle
//   2) solid primary panel wipes over it (secondary leading edge)
//   3) the title card wipes over that (ink leading edge); logo, name,
//      divider and spec cells settle in turn; match number counts up
// PREVIEW: a "Replay intro" button sits just OUTSIDE the 1920×1080 canvas.

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

interface MatchData {
  _id: string;
  matchId: string;
  userId: string;
  teams: any[];
}

interface IntroProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const PANEL = '#F1F1F4';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const CARD_W = 760;
const TOP_H = 300; // logo + name + divider
const SPEC_H = 150; // round · day · match
const CARD_H = TOP_H + SPEC_H; // 450
const CHAMFER = 40;
const RAIL = 10;
const NAME_W = CARD_W - 120; // usable width for the tournament name
const cardClip = `polygon(${CHAMFER}px 0, 100% 0, 100% calc(100% - ${CHAMFER}px), calc(100% - ${CHAMFER}px) 100%, 0 100%, 0 ${CHAMFER}px)`;

/* ── motion ── */
const WIPE_MS = 650;
const WIPE_EASE = 'cubic-bezier(.65,0,.25,1)';
const T_PLATE = 60;
const T_THEME = 1200;
const T_INFO = 1850;

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

/* Tournament name → 1 or 2 balanced lines + a font size that fits NAME_W.
   (≈0.47em per glyph for a condensed bold face.) */
function fitName(raw: string): { lines: string[]; size: number } {
  const name = (raw || '').toUpperCase().trim();
  const fit = (len: number, max: number) => Math.max(34, Math.min(max, Math.floor(NAME_W / (0.47 * Math.max(1, len)))));
  const words = name.split(/\s+/).filter(Boolean);
  if (name.length <= 18 || words.length < 2) return { lines: [name], size: fit(name.length, 84) };
  let best = { a: name, b: '', worst: Infinity };
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const worst = Math.max(a.length, b.length);
    if (worst < best.worst) best = { a, b, worst };
  }
  return { lines: [best.a, best.b], size: fit(best.worst, 66) };
}

/* number counts up 0 → n */
function useCountUp(target: number, delayMs: number, durMs: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delayMs;
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - start) / durMs));
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, delayMs, durMs]);
  return v;
}

const KEYFRAMES = `
@keyframes in8Pop   { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
@keyframes in8Up    { from { transform: translateY(18px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes in8Grow  { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes in8Edge  { 0%, 85% { opacity: 1; } 100% { opacity: 0; } }
.in8-tlogo { animation: in8Pop .6s cubic-bezier(.34,1.56,.64,1) .3s both; }
.in8-logo  { animation: in8Pop .55s cubic-bezier(.34,1.56,.64,1) .1s both; }
.in8-name  { animation: in8Up .5s cubic-bezier(.2,.8,.2,1) .25s both; }
.in8-div   { animation: in8Grow .5s cubic-bezier(.2,.8,.2,1) .45s both; }
.in8-c1    { animation: in8Up .45s cubic-bezier(.2,.8,.2,1) .5s both; }
.in8-c2    { animation: in8Up .45s cubic-bezier(.2,.8,.2,1) .6s both; }
.in8-c3    { animation: in8Up .45s cubic-bezier(.2,.8,.2,1) .7s both; }
@media (prefers-reduced-motion: reduce) {
  .in8-tlogo, .in8-logo, .in8-name, .in8-div, .in8-c1, .in8-c2, .in8-c3 { animation: none; }
}
`;

/* ─────────────────────────────────────────────
   Wipe layer — width grows from the left; leading edge rides the wipe
   ───────────────────────────────────────────── */
const WipeLayer: React.FC<{ open: boolean; edge: string; children: React.ReactNode }> = ({ open, edge, children }) => (
  <div style={{ position: 'absolute', inset: 0, clipPath: cardClip }}>
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        height: '100%',
        width: open ? '100%' : '0%',
        overflow: 'hidden',
        transition: `width ${WIPE_MS}ms ${WIPE_EASE}`,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: CARD_W, height: CARD_H }}>{children}</div>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: -20,
            bottom: -20,
            width: 16,
            background: edge,
            transform: 'skewX(-8deg)',
            opacity: 0,
            animation: `in8Edge ${WIPE_MS}ms linear`,
          }}
        />
      )}
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   Spec cell (ROUND / DAY)
   ───────────────────────────────────────────── */
const Spec: React.FC<{ label: string; value: string; className: string; grow: number }> = ({ label, value, className, grow }) => {
  const size = value.length <= 6 ? 54 : value.length <= 11 ? 42 : value.length <= 16 ? 34 : 28;
  return (
    <div
      className={className}
      style={{ flex: grow, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 26px' }}
    >
      <span style={{ fontSize: 18, letterSpacing: '0.3em', color: DIM }}>{label}</span>
      <span
        style={{
          marginTop: 10,
          fontSize: size,
          color: INK,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </span>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Title card
   ───────────────────────────────────────────── */
const TitleCard: React.FC<{
  tournament: Tournament;
  roundName: string;
  day: string;
  matchNo?: number;
  primary: string;
  secondary: string;
}> = ({ tournament, roundName, day, matchNo, primary, secondary }) => {
  const n = useCountUp(Number(matchNo) || 0, 700, 700);
  const { lines, size } = fitName(tournament.tournamentName);
  const onPrimary = inkOn(primary);
  const dayValue = day ? day.toUpperCase().replace(/^DAY\s*/, '') : '';

  return (
    <div style={{ position: 'absolute', inset: 0, background: WHITE, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      {/* rails */}
      <div style={{ position: 'absolute', left: 0, top: CHAMFER, bottom: 0, width: RAIL, background: primary }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: CHAMFER, width: RAIL, background: secondary }} />

      {/* ── top: logo + name + divider ── */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: TOP_H,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          padding: '10px 60px 0',
        }}
      >
        <div className="in8-logo" style={{ width: 120, height: 104, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={tournament.torLogo || '/def_logo.png'}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/def_logo.png';
            }}
          />
        </div>
        <div className="in8-name" style={{ textAlign: 'center', color: INK, fontSize: size, lineHeight: 0.98, letterSpacing: '0.01em' }}>
          {lines.map((l, i) => (
            <div key={i} style={{ whiteSpace: 'nowrap' }}>
              {l}
            </div>
          ))}
        </div>
        {/* divider: grey hairlines with a primary + secondary centre mark */}
        <div className="in8-div" style={{ display: 'flex', alignItems: 'center', gap: 8, width: 360 }}>
          <span style={{ flex: 1, height: 2, background: LINE }} />
          <span style={{ width: 56, height: 5, background: primary }} />
          <span style={{ width: 14, height: 5, background: secondary }} />
          <span style={{ flex: 1, height: 2, background: LINE }} />
        </div>
      </div>

      {/* ── spec row ── */}
      <div
        style={{
          position: 'absolute',
          left: RAIL,
          right: 0,
          bottom: 0,
          height: SPEC_H,
          background: PANEL,
          display: 'flex',
          alignItems: 'stretch',
          boxShadow: `inset 0 3px 0 ${INK}`,
        }}
      >
        <Spec className="in8-c1" label="ROUND" value={roundName || '—'} grow={1.5} />
        {dayValue && (
          <>
            <div style={{ width: 2, background: LINE, margin: '30px 0' }} />
            <Spec className="in8-c2" label="DAY" value={dayValue.padStart(2, '0')} grow={0.8} />
          </>
        )}
        {/* MATCH — solid primary, angled left edge */}
        <div
          className="in8-c3"
          style={{
            flex: 'none',
            width: 230,
            background: primary,
            color: onPrimary,
            clipPath: 'polygon(28px 0, 100% 0, 100% 100%, 0 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingLeft: 14,
            paddingRight: CHAMFER / 2,
          }}
        >
          <span style={{ fontSize: 20, letterSpacing: '0.34em', paddingLeft: '0.34em', opacity: 0.9 }}>MATCH</span>
          <span style={{ fontSize: 96, lineHeight: 0.85, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
            {matchNo != null ? String(n).padStart(2, '0') : '—'}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Intro
   ───────────────────────────────────────────── */
const Intro: React.FC<IntroProps> = ({ tournament, round, match }) => {
  const [run, setRun] = useState(0); // bump to replay
  const [o1, setO1] = useState(false); // white card + tournament logo
  const [o2, setO2] = useState(false); // theme panel
  const [o3, setO3] = useState(false); // title card
  const [infoOn, setInfoOn] = useState(false);

  useEffect(() => {
    setO1(false);
    setO2(false);
    setO3(false);
    setInfoOn(false);
    const ts = [
      setTimeout(() => setO1(true), T_PLATE),
      setTimeout(() => setO2(true), T_THEME),
      setTimeout(() => {
        setInfoOn(true);
        requestAnimationFrame(() => setO3(true));
      }, T_INFO),
    ];
    return () => ts.forEach(clearTimeout);
  }, [run]);

  const replay = useCallback(() => setRun((r) => r + 1), []);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const matchNo = match?.matchNo ?? match?._matchNo;
  const roundName = (round?.roundName || '').toUpperCase();
  const day = round?.day || tournament.day || '';

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <style>{KEYFRAMES}</style>

      <div
        key={run}
        style={{
          position: 'relative',
          width: CARD_W,
          height: CARD_H,
          filter: o1 ? 'drop-shadow(0 26px 50px rgba(0,0,0,0.45))' : 'none',
          transition: 'filter .3s ease',
        }}
      >
        {/* step 1 — white card with tournament logo */}
        <WipeLayer open={o1} edge={INK}>
          <div style={{ position: 'absolute', inset: 0, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', left: 0, top: CHAMFER, bottom: 0, width: RAIL, background: primary }} />
            {o1 && (
              <img
                className="in8-tlogo"
                src={tournament.torLogo || '/def_logo.png'}
                alt=""
                style={{ maxHeight: 220, maxWidth: 420, objectFit: 'contain', display: 'block' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/def_logo.png';
                }}
              />
            )}
          </div>
        </WipeLayer>

        {/* step 2 — full theme colour */}
        <WipeLayer open={o2} edge={secondary}>
          <div style={{ position: 'absolute', inset: 0, background: primary }} />
        </WipeLayer>

        {/* step 3 — title card */}
        <WipeLayer open={o3} edge={INK}>
          {infoOn && (
            <TitleCard
              tournament={tournament}
              roundName={roundName}
              day={day}
              matchNo={matchNo}
              primary={primary}
              secondary={secondary}
            />
          )}
        </WipeLayer>
      </div>

      {/* ── preview control — outside the 1920×1080 canvas ── */}
      <button
        type="button"
        onClick={replay}
        style={{
          position: 'absolute',
          left: 1940,
          top: 132,
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
        ↻ REPLAY INTRO
      </button>
    </div>
  );
};

export default Intro;