import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { computeMatchStandings } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// freshly-merged `matchData` down as a prop — the winner is derived from it
// with computeMatchStandings(...).filter(t => t.wwcd), exactly as before.
//
// THEME8 "WHITE LABEL" WWCD stats.
//   ┌ WINNER BANNER (top, centred, symmetric — not a lower-third strip):
//   │        ┌──────┐            team-logo emblem breaking out of the top
//   │   ┌────┤ LOGO ├─────────┐
//   │   │ 15 │ WINNER WINNER  │2388│  ink ELIMS block · white centre · primary
//   │   │ELIMS│  TEAM NAME    │DMG │  DAMAGE block, trapezoid outline
//   │   └────┴───────────────┴────┘
//   │        [ round · day · match ]   ink tab hanging underneath
//   └ PLAYER CARDS (4 in a row) — photo on the theme colour, ink name bar,
//       KILLS / DAMAGE / ASSISTS rows; the top fragger gets an MVP badge.
//
// Motion:
//   winner banner — three steps, each opening OUTWARD FROM THE CENTRE, with
//     the TEAM logo (not the tournament's):
//     1) white bar opens, team logo pops   2) primary bar opens over it
//     3) banner opens over that; emblem drops in, numbers count up, the
//        context tab slides down
//   player cards — once the banner has landed, each card slides UP from
//     below the bottom of the screen, one after another, then counts up.
// No prefers-reduced-motion kill-switch: this is broadcast graphics, and the
// card rise is state + transition driven so it always plays.
// PREVIEW: a "Preview WWCD" button sits just OUTSIDE the 1920×1080 canvas.
// It replays the sequence; if there is no real winner yet it uses dummy data.

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
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  health?: number;
  healthMax?: number;
  liveState?: number;
}

interface Team {
  _id: string;
  teamId?: string;
  teamName?: string;
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

interface WwcdSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const BAR_W = 1160;
const BAR_H = 180;
const BAR_TOP = 130;
const SIDE_W = 290; // ELIMS / DAMAGE blocks
const TRAP = 34; // outer trapezoid inset at the bottom corners
const INNER = 26; // inner slant of the side blocks
const EMB = 132; // logo emblem
const EMB_TOP = BAR_TOP - (EMB - 34); // overlaps the banner by 34px
const PILL_H = 44;
const barClip = `polygon(0 0, 100% 0, calc(100% - ${TRAP}px) 100%, ${TRAP}px 100%)`;

const CARD_W = 380;
const CARD_GAP = 24;
const PHOTO_H = 320;
const NAME_H = 58;
const STAT_H = 66;
const CARD_H = PHOTO_H + NAME_H + STAT_H * 3; // 576
const CARDS_TOP = BAR_TOP + BAR_H + PILL_H + 36; // 390
const CORNER = 30;

/* ── motion ── */
const WIPE_MS = 650;
const WIPE_EASE = 'cubic-bezier(.65,0,.25,1)';
const T_PLATE = 60;
const T_THEME = 1250;
const T_INFO = 1900;
const T_CARDS = 2900; // first player card
const CARD_STAGGER = 320; // gap between cards rising
const CARD_RISE_MS = 900;
const RISE_FROM = 1080 - CARDS_TOP + 60; // start fully below the bottom edge of the canvas

/* ── dummy winner for the preview button ── */
const DEMO_TEAM: Team = {
  _id: 'demo',
  teamName: 'DUMMY ESPORTS',
  teamTag: 'DMY',
  placePoints: 10,
  teamLogo: '/def_logo.png',
  players: [
    { _id: 'd1', playerName: 'VIPER', killNum: 6, damage: 812, assists: 2, bHasDied: false },
    { _id: 'd2', playerName: 'SHADOW', killNum: 4, damage: 655, assists: 3, bHasDied: false },
    { _id: 'd3', playerName: 'KRYPTO', killNum: 2, damage: 401, assists: 5, bHasDied: true },
    { _id: 'd4', playerName: 'NEXUS', killNum: 3, damage: 520, assists: 1, bHasDied: false },
  ],
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
@keyframes ww8Pop    { 0% { transform: scale(.55); opacity: 0; } 70% { transform: scale(1.07); opacity: 1; } 100% { transform: scale(1); } }
@keyframes ww8SlideL { from { transform: translateX(-30px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes ww8SlideR { from { transform: translateX(46px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes ww8Rise   { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes ww8Drop  { 0% { transform: translateY(-40px) scale(.7); opacity: 0; } 70% { transform: translateY(4px) scale(1.04); opacity: 1; } 100% { transform: none; opacity: 1; } }
@keyframes ww8Pill  { from { transform: translateY(-100%); } to { transform: none; } }
@keyframes ww8EdgeO { 0%, 85% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ww8Photo  { from { transform: translateY(46px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes ww8Badge  { 0% { transform: scale(.4) rotate(-10deg); opacity: 0; } 70% { transform: scale(1.12); opacity: 1; } 100% { transform: none; } }
.ww8-tlogo { animation: ww8Pop .6s cubic-bezier(.34,1.56,.64,1) .3s both; }
.ww8-emb   { animation: ww8Drop .6s cubic-bezier(.34,1.56,.64,1) .2s both; }
.ww8-eyebr { animation: ww8Rise .4s cubic-bezier(.2,.8,.2,1) .35s both; }
.ww8-name  { animation: ww8Rise .5s cubic-bezier(.2,.8,.2,1) .45s both; }
.ww8-left  { animation: ww8SlideL .5s cubic-bezier(.2,.8,.2,1) .1s both; }
.ww8-right { animation: ww8SlideR .5s cubic-bezier(.2,.8,.2,1) .1s both; }
.ww8-pill  { animation: ww8Pill .45s cubic-bezier(.2,.8,.2,1) .6s both; }
.ww8-photo { animation: ww8Photo .6s cubic-bezier(.2,.8,.2,1) both; }
.ww8-badge { animation: ww8Badge .5s cubic-bezier(.34,1.56,.64,1) both; }
`;

/* ─────────────────────────────────────────────
   Centre-out layer — opens from the middle toward both ends; content is
   pinned to full width so it is revealed, not squashed. Two leading edges
   ride outward with it.
   ───────────────────────────────────────────── */
const CenterOpen: React.FC<{ open: boolean; edge: string; children: React.ReactNode }> = ({ open, edge, children }) => (
  <div style={{ position: 'absolute', inset: 0, clipPath: barClip }}>
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '50%',
        width: open ? '100%' : '0%',
        transform: 'translateX(-50%)',
        overflow: 'hidden',
        transition: `width ${WIPE_MS}ms ${WIPE_EASE}`,
      }}
    >
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: BAR_W, marginLeft: -BAR_W / 2 }}>{children}</div>
      {open &&
        (['left', 'right'] as const).map((side) => (
          <div
            key={side}
            style={{
              position: 'absolute',
              [side]: 0,
              top: 0,
              bottom: 0,
              width: 12,
              background: edge,
              opacity: 0,
              animation: `ww8EdgeO ${WIPE_MS}ms linear`,
            }}
          />
        ))}
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   Winner banner (the step-3 layer) — side blocks + white centre
   ───────────────────────────────────────────── */
const WinnerBanner: React.FC<{
  team: Team;
  kills: number;
  damage: number;
  primary: string;
  secondary: string;
}> = ({ team, kills, damage, primary, secondary }) => {
  const k = useCountUp(kills, 300, 700);
  const d = useCountUp(damage, 450, 900);
  const name = (team.teamName || team.teamTag || '').toUpperCase();
  const nameSize = name.length <= 14 ? 74 : name.length <= 20 ? 58 : name.length <= 26 ? 46 : 38;
  const onPrimary = inkOn(primary);

  const sideLabel: React.CSSProperties = { fontSize: 22, letterSpacing: '0.32em', opacity: 0.85 };
  const sideNum: React.CSSProperties = { fontSize: 104, lineHeight: 0.85, fontVariantNumeric: 'tabular-nums', marginBottom: 12 };

  return (
    <div style={{ position: 'absolute', inset: 0, background: WHITE, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      {/* left — ELIMS (ink), inner edge slanted */}
      <div
        className="ww8-left"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: SIDE_W,
          background: INK,
          color: WHITE,
          clipPath: `polygon(0 0, 100% 0, calc(100% - ${INNER}px) 100%, 0 100%)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: TRAP / 2,
          paddingRight: INNER / 2,
          boxSizing: 'border-box',
        }}
      >
        <span style={sideNum}>{k}</span>
        <span style={sideLabel}>ELIMS</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: SIDE_W - INNER + 6,
          top: 0,
          bottom: 0,
          width: INNER + 8,
          background: primary,
          clipPath: `polygon(${INNER}px 0, 100% 0, ${8}px 100%, 0 100%)`,
        }}
      />

      {/* right — DAMAGE (primary), inner edge slanted */}
      <div
        className="ww8-right"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: SIDE_W,
          background: primary,
          color: onPrimary,
          clipPath: `polygon(0 0, 100% 0, 100% 100%, ${INNER}px 100%)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingRight: TRAP / 2,
          paddingLeft: INNER / 2,
          boxSizing: 'border-box',
        }}
      >
        <span style={sideNum}>{d}</span>
        <span style={sideLabel}>DAMAGE</span>
      </div>
      <div
        style={{
          position: 'absolute',
          right: SIDE_W - INNER + 6,
          top: 0,
          bottom: 0,
          width: INNER + 8,
          background: secondary,
          clipPath: `polygon(0 0, calc(100% - ${INNER}px) 0, 100% 100%, calc(100% - 8px) 100%)`,
        }}
      />

      {/* centre — eyebrow + team name (room left at the top for the emblem) */}
      <div
        style={{
          position: 'absolute',
          left: SIDE_W + 14,
          right: SIDE_W + 14,
          top: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 22,
          textAlign: 'center',
        }}
      >
        <div className="ww8-eyebr" style={{ fontSize: 19, letterSpacing: '0.3em', color: DIM, paddingLeft: '0.3em' }}>
          WINNER WINNER CHICKEN DINNER
        </div>
        <div
          className="ww8-name"
          style={{ fontSize: nameSize, color: INK, marginTop: 10, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {name}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Player card
   ───────────────────────────────────────────── */
const Crown = ({ color, size = 18 }: { color: string; size?: number }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
  </svg>
);

const StatRow: React.FC<{ label: string; value: number; delay: number; accent?: string; last?: boolean }> = ({
  label,
  value,
  delay,
  accent,
  last,
}) => {
  const v = useCountUp(value, delay, 700);
  return (
    <div
      style={{
        position: 'relative',
        height: STAT_H,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 26px 0 28px',
        boxShadow: last ? 'none' : `inset 0 -1px 0 ${LINE}`,
      }}
    >
      {accent && <span style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 6, background: accent }} />}
      <span style={{ fontSize: 22, letterSpacing: '0.24em', color: DIM }}>{label}</span>
      <span style={{ fontSize: 46, color: INK, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );
};

const PlayerCard: React.FC<{ player: Player; mvp: boolean; delay: number; primary: string; secondary: string }> = ({
  player,
  mvp,
  delay,
  primary,
  secondary,
}) => {
  const onPrimary = inkOn(primary);
  const name = (player.playerName || '').toUpperCase();
  const nameSize = name.length <= 10 ? 36 : name.length <= 14 ? 30 : 24;
  const statDelay = delay + CARD_RISE_MS; // count once the card has landed

  // Rise from below the screen. Driven by state + a CSS transition so it runs
  // even where keyframe animations are suppressed (e.g. OS "reduce motion").
  const [up, setUp] = useState(false);
  useEffect(() => {
    let r1 = 0;
    let r2 = 0;
    const t = window.setTimeout(() => {
      // two frames so the off-screen start position is painted first
      r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setUp(true));
      });
    }, delay);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [delay]);

  return (
    <div
      style={{
        position: 'relative',
        width: CARD_W,
        height: CARD_H,
        flex: 'none',
        transform: up ? 'translateY(0px)' : `translateY(${RISE_FROM}px)`,
        opacity: up ? 1 : 0,
        transition: `transform ${CARD_RISE_MS}ms cubic-bezier(.16,1,.3,1), opacity 150ms linear`,
        willChange: 'transform',
        filter: 'drop-shadow(0 18px 34px rgba(0,0,0,0.38))',
      }}
    >
      {/* inner layer carries the cut corner (the outer one's clip-path is animated) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: WHITE,
          fontFamily: FONT,
          fontWeight: 700,
          lineHeight: 1,
          clipPath: `polygon(0 0, calc(100% - ${CORNER}px) 0, 100% ${CORNER}px, 100% 100%, 0 100%)`,
        }}
      >
      {/* photo panel */}
      <div style={{ position: 'relative', height: PHOTO_H, background: primary, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 190,
            height: 230,
            background: secondary,
            clipPath: 'polygon(55% 0, 100% 0, 100% 100%, 0 100%)',
            opacity: 0.9,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 18,
            top: 18,
            width: 70,
            height: 10,
            background: `repeating-linear-gradient(-60deg, ${onPrimary === WHITE ? 'rgba(255,255,255,.5)' : 'rgba(11,11,14,.5)'} 0 3px, transparent 3px 8px)`,
          }}
        />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
          <img
            className={up ? 'ww8-photo' : undefined}
            src={playerPhoto(player.picUrl) || '/def_char.avif'}
            alt={player.playerName}
            style={{
              animationDelay: `${CARD_RISE_MS - 250}ms`,
              display: 'block',
              height: PHOTO_H - 12,
              width: 'auto',
              maxWidth: CARD_W + 40,
              objectFit: 'contain',
              objectPosition: 'bottom center',
              filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.35))',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/def_char.avif';
            }}
          />
        </div>
        
      </div>

      {/* name bar */}
      <div
        style={{
          height: NAME_H,
          background: INK,
          color: WHITE,
          display: 'flex',
          alignItems: 'center',
          padding: '0 22px 0 28px',
          position: 'relative',
          fontSize: nameSize,
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: primary }} />
        {name}
      </div>

      {/* stats */}
      <StatRow label="KILLS" value={num(player.killNum)} delay={statDelay} accent={primary} />
      <StatRow label="DAMAGE" value={num(player.damage)} delay={statDelay + 120} />
      <StatRow label="ASSISTS" value={num(player.assists)} delay={statDelay + 240} last />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: secondary }} />
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   WwcdStats
   ───────────────────────────────────────────── */
const WwcdStats: React.FC<WwcdSummaryProps> = ({ tournament, round, match, matchData }) => {
  const teamsWithTotals = useMemo(() => computeMatchStandings(matchData as any).filter((t: any) => t.wwcd), [matchData]);
  const realWinner = teamsWithTotals[0] as unknown as Team | undefined;

  const [run, setRun] = useState(0); // bump to replay
  const [demo, setDemo] = useState(false);
  const [o1, setO1] = useState(false); // white plate + team logo
  const [o2, setO2] = useState(false); // theme panel
  const [o3, setO3] = useState(false); // winner card
  const [infoOn, setInfoOn] = useState(false);
  const [cardsOn, setCardsOn] = useState(false);

  const winner: Team | undefined = realWinner ?? (demo ? DEMO_TEAM : undefined);
  const winnerId = winner ? String(winner._id ?? winner.teamId ?? '') : '';

  // (re)play the sequence whenever a winner appears / changes, or on Preview
  useEffect(() => {
    setO1(false);
    setO2(false);
    setO3(false);
    setInfoOn(false);
    setCardsOn(false);
    if (!winnerId) return;
    const ts = [
      setTimeout(() => setO1(true), T_PLATE),
      setTimeout(() => setO2(true), T_THEME),
      setTimeout(() => {
        setInfoOn(true);
        requestAnimationFrame(() => setO3(true));
      }, T_INFO),
      setTimeout(() => setCardsOn(true), T_CARDS),
    ];
    return () => ts.forEach(clearTimeout);
  }, [winnerId, run]);

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;

  const players = (winner?.players ?? []).slice(0, 4);
  const totalKills = players.reduce((s, p) => s + num(p.killNum), 0);
  const totalDamage = players.reduce((s, p) => s + num(p.damage), 0);
  const mvpId = useMemo(() => {
    let best: Player | null = null;
    for (const p of players)
      if (!best || num(p.killNum) > num(best.killNum) || (num(p.killNum) === num(best.killNum) && num(p.damage) > num(best.damage))) best = p;
    return best && num(best.killNum) > 0 ? best._id : null;
  }, [players]);

  const day = round?.day || tournament.day || '';
  const matchLabel = match ? match.matchName || `MATCH ${String(match.matchNo ?? match._matchNo ?? '').padStart(2, '0')}` : '';
  const context = [round?.roundName, day ? (/^day/i.test(day) ? day : `DAY ${day}`) : '', matchLabel]
    .filter(Boolean)
    .join('  ·  ')
    .toUpperCase();

  const rowW = players.length * CARD_W + Math.max(0, players.length - 1) * CARD_GAP;

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible' }}>
      <style>{KEYFRAMES}</style>

      {winner ? (
        <>
          {/* ── winner banner ── */}
          <div
            key={`hero-${run}-${winnerId}`}
            style={{
              position: 'absolute',
              left: (1920 - BAR_W) / 2,
              top: BAR_TOP,
              width: BAR_W,
              height: BAR_H,
              filter: o1 ? 'drop-shadow(0 22px 44px rgba(0,0,0,0.42))' : 'none',
              transition: 'filter .3s ease',
            }}
          >
            {/* context tab hanging under the banner (behind it, slides down) */}
            {infoOn && (
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: BAR_H,
                  transform: 'translateX(-50%)',
                  height: PILL_H,
                  overflow: 'hidden',
                }}
              >
                <div
                  className="ww8-pill"
                  style={{
                    height: PILL_H,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '0 40px 2px',
                    background: INK,
                    color: WHITE,
                    clipPath: 'polygon(0 0, 100% 0, calc(100% - 18px) 100%, 18px 100%)',
                    fontFamily: FONT,
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: '0.18em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ width: 10, height: 10, background: primary, flex: 'none' }} />
                  {context}
                  <span style={{ width: 10, height: 10, background: secondary, flex: 'none' }} />
                </div>
              </div>
            )}

            {/* step 1 — white bar with the TEAM logo */}
            <CenterOpen open={o1} edge={INK}>
              <div style={{ position: 'absolute', inset: 0, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {o1 && (
                  <div className="ww8-tlogo" style={{ width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TeamLogo
                      logo={winner.teamLogo}
                      flag={winner.teamFlag}
                      fallback={'/def_logo.png'}
                      alt={winner.teamTag}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  </div>
                )}
              </div>
            </CenterOpen>

            {/* step 2 — full theme colour */}
            <CenterOpen open={o2} edge={secondary}>
              <div style={{ position: 'absolute', inset: 0, background: primary }} />
            </CenterOpen>

            {/* step 3 — the banner */}
            <CenterOpen open={o3} edge={INK}>
              {infoOn && <WinnerBanner team={winner} kills={totalKills} damage={totalDamage} primary={primary} secondary={secondary} />}
            </CenterOpen>

            {/* emblem — team logo breaking out of the top edge */}
            {infoOn && (
              <div
                className="ww8-emb"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: EMB_TOP - BAR_TOP,
                  width: EMB,
                  height: EMB,
                  marginLeft: -EMB / 2,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: WHITE,
                    clipPath: 'polygon(20px 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%, 0 20px)',
                    boxShadow: `inset 0 -6px 0 ${primary}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '14px 14px 20px',
                    boxSizing: 'border-box',
                  }}
                >
                  <TeamLogo
                    logo={winner.teamLogo}
                    flag={winner.teamFlag}
                    fallback={'/def_logo.png'}
                    alt={winner.teamTag}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── player cards — swipe up from below, one after another ── */}
          {cardsOn && (
            <div
              key={`cards-${run}-${winnerId}`}
              style={{
                position: 'absolute',
                left: (1920 - rowW) / 2,
                top: CARDS_TOP,
                display: 'flex',
                gap: CARD_GAP,
              }}
            >
              {players.map((p, i) => (
                <PlayerCard key={p._id || i} player={p} mvp={p._id === mvpId} delay={i * CARD_STAGGER} primary={primary} secondary={secondary} />
              ))}
            </div>
          )}
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
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 30,
              letterSpacing: '0.14em',
              color: INK,
            }}
          >
            NO WWCD TEAM YET
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
          top: 188,
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
        ▶ PREVIEW WWCD
      </button>
    </div>
  );
};

export default WwcdStats;