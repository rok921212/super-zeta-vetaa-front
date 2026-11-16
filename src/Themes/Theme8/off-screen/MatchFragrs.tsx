import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MatchData } from '../../shared/hooks/unsortteams';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// freshly-merged `matchData` down as a prop. The top-5 list is the shared
// single-match Fragger Score (buildFraggerPool + computeFraggerScores +
// compareFraggerScore), exactly as before.
//
// THEME8 "WHITE LABEL" — Top 5 Fraggers.
//   heading   ink trapezoid "TOP 5 FRAGGERS" + round · day · match tab
//   5 cards   ┌ ink rank bar   (#1 chip in primary, others white) + team tag
//             ├ photo on the theme colour, faint team-logo mark top-right
//             ├ ink name bar   (team logo tile + player name)
//             ├ KILLS · DAMAGE · ASSISTS
//             └ KILL SHARE  —  % of the team's kills, bar fills in primary
//
// Motion (state + CSS transitions only — always plays, even with OS
// "reduce motion"):
//   1) heading drops in
//   2) cards rise from below the screen one after another
//   3) each card shows the TEAM LOGO face, then opens upward to the player;
//      photo rises, numbers count up, kill-share bar fills
// PREVIEW: a "Preview fraggers" button OUTSIDE the 1920×1080 canvas replays
// the sequence (dummy players when there is no data).

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

interface MatchFragrsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

interface Fragger {
  _id: string;
  playerName: string;
  picUrl?: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
  killNum: number;
  numericDamage: number;
  assists: number;
  teamTotalKills: number;
}

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const CARD_W = 330;
const CARD_GAP = 22;
const RANK_H = 60;
const PHOTO_H = 320;
const NAME_H = 70;
const STATS_H = 112;
const SHARE_H = 74;
const CARD_H = RANK_H + PHOTO_H + NAME_H + STATS_H + SHARE_H; // 636
const CARDS_TOP = 240;
const CORNER = 30;
const cardClip = `polygon(${CORNER}px 0, 100% 0, 100% calc(100% - ${CORNER}px), calc(100% - ${CORNER}px) 100%, 0 100%, 0 ${CORNER}px)`;

/* ── timeline (ms) ── */
const T_FIRST = 450;
const STAGGER = 260;
const RISE_MS = 900;
const LOGO_HOLD = 600;
const OPEN_MS = 700;
const RISE_FROM = 1080 - CARDS_TOP + 60;

/* ── dummy players for the preview button ── */
const DEMO: Fragger[] = [
  { _id: 'd1', playerName: 'VIPER', teamTag: 'DMY', teamLogo: '/def_logo.png', killNum: 9, numericDamage: 1432, assists: 2, teamTotalKills: 15 },
  { _id: 'd2', playerName: 'SHADOW', teamTag: 'NOVA', teamLogo: '/def_logo.png', killNum: 7, numericDamage: 1180, assists: 3, teamTotalKills: 12 },
  { _id: 'd3', playerName: 'KRYPTO', teamTag: 'TSM', teamLogo: '/def_logo.png', killNum: 6, numericDamage: 1022, assists: 1, teamTotalKills: 14 },
  { _id: 'd4', playerName: 'NEXUS', teamTag: 'FAZE', teamLogo: '/def_logo.png', killNum: 5, numericDamage: 960, assists: 4, teamTotalKills: 9 },
  { _id: 'd5', playerName: 'ORBIT', teamTag: 'DRX', teamLogo: '/def_logo.png', killNum: 5, numericDamage: 812, assists: 2, teamTotalKills: 11 },
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
   Stat cell
   ───────────────────────────────────────────── */
const Stat: React.FC<{ label: string; value: number; active: boolean; accent?: string; divider?: boolean }> = ({
  label,
  value,
  active,
  accent,
  divider,
}) => {
  const v = useCountUp(value, active, 900);
  const size = String(value).length >= 4 ? 44 : 54;
  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        boxShadow: divider ? `inset 1px 0 0 ${LINE}` : 'none',
      }}
    >
      {accent && <span style={{ position: 'absolute', left: 14, right: 14, top: 0, height: 5, background: accent }} />}
      <span style={{ fontSize: size, color: INK, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
      <span style={{ fontSize: 16, letterSpacing: '0.24em', color: DIM, paddingLeft: '0.24em' }}>{label}</span>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Fragger card
   ───────────────────────────────────────────── */
const FraggerCard: React.FC<{ p: Fragger; rank: number; run: number; primary: string; secondary: string }> = ({
  p,
  rank,
  run,
  primary,
  secondary,
}) => {
  const riseAt = T_FIRST + (rank - 1) * STAGGER;
  const up = useAfter(riseAt, run);
  const logoIn = useAfter(riseAt + RISE_MS * 0.55, run);
  const open = useAfter(riseAt + RISE_MS + LOGO_HOLD, run);
  const settled = useAfter(riseAt + RISE_MS + LOGO_HOLD + OPEN_MS * 0.5, run);
  const onPrimary = inkOn(primary);
  const share = p.teamTotalKills > 0 ? Math.min(100, Math.round((num(p.killNum) / p.teamTotalKills) * 100)) : 0;
  const shareV = useCountUp(share, settled, 900);
  const name = (p.playerName || '').toUpperCase();
  const nameSize = name.length <= 9 ? 34 : name.length <= 13 ? 28 : 23;

  return (
    <div
      style={{
        position: 'relative',
        width: CARD_W,
        height: CARD_H,
        flex: 'none',
        transform: up ? 'translateY(0px)' : `translateY(${RISE_FROM}px)`,
        opacity: up ? 1 : 0,
        transition: `transform ${RISE_MS}ms cubic-bezier(.16,1,.3,1), opacity 150ms linear`,
        willChange: 'transform',
        filter: 'drop-shadow(0 18px 34px rgba(0,0,0,0.38))',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, clipPath: cardClip, overflow: 'hidden', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        {/* ── face 1: team logo ── */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: WHITE,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 26,
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: CORNER, bottom: 0, width: 10, background: primary }} />
          <div
            style={{
              width: 180,
              height: 180,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: logoIn ? 'scale(1)' : 'scale(0.6)',
              opacity: logoIn ? 1 : 0,
              transition: 'transform 500ms cubic-bezier(.34,1.56,.64,1), opacity 250ms linear',
            }}
          >
            <TeamLogo logo={p.teamLogo} flag={p.teamFlag} fallback={'/def_logo.png'} alt={p.teamTag} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              background: INK,
              color: WHITE,
              padding: '8px 16px 7px',
              fontSize: 22,
              letterSpacing: '0.2em',
              opacity: logoIn ? 1 : 0,
              transform: logoIn ? 'none' : 'translateY(10px)',
              transition: 'opacity 300ms linear 150ms, transform 400ms cubic-bezier(.2,.8,.2,1) 150ms',
            }}
          >
            RANK <span style={{ color: primary, fontSize: 30, letterSpacing: 0 }}>#{rank}</span>
          </div>
        </div>

        {/* ── face 2: the player — opens upward ── */}
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
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: CARD_H, background: WHITE }}>
            {/* rank bar */}
            <div
              style={{
                height: RANK_H,
                background: INK,
                color: WHITE,
                display: 'flex',
                alignItems: 'stretch',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: 96,
                  marginLeft: CORNER - 4,
                  background: rank === 1 ? primary : WHITE,
                  color: rank === 1 ? onPrimary : INK,
                  clipPath: 'polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingRight: 8,
                  fontSize: 40,
                }}
              >
                #{rank}
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 20, fontSize: 22, letterSpacing: '0.22em', color: 'rgba(255,255,255,.75)' }}>
                {(p.teamTag || '').toUpperCase()}
              </div>
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: primary }} />
            </div>

            {/* photo panel */}
            <div style={{ position: 'relative', height: PHOTO_H, background: primary, overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: 180,
                  height: 230,
                  background: secondary,
                  clipPath: 'polygon(55% 0, 100% 0, 100% 100%, 0 100%)',
                  opacity: 0.9,
                }}
              />
              <div style={{ position: 'absolute', right: 16, top: 16, width: 76, height: 76 }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderTop: `2px solid ${onPrimary === WHITE ? 'rgba(255,255,255,.4)' : 'rgba(11,11,14,.4)'}`,
                    borderRight: `2px solid ${onPrimary === WHITE ? 'rgba(255,255,255,.4)' : 'rgba(11,11,14,.4)'}`,
                  }}
                />
                <div style={{ position: 'absolute', inset: 11, opacity: 0.35, filter: 'grayscale(1) brightness(2)' }}>
                  <TeamLogo logo={p.teamLogo} flag={p.teamFlag} fallback={'/def_logo.png'} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: 16,
                  top: 18,
                  width: 64,
                  height: 10,
                  background: `repeating-linear-gradient(-60deg, ${onPrimary === WHITE ? 'rgba(255,255,255,.5)' : 'rgba(11,11,14,.5)'} 0 3px, transparent 3px 8px)`,
                }}
              />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
                <img
                  src={playerPhoto(p.picUrl) || '/def_char.avif'}
                  alt={p.playerName}
                  style={{
                    display: 'block',
                    height: PHOTO_H - 14,
                    width: 'auto',
                    maxWidth: CARD_W + 40,
                    objectFit: 'contain',
                    objectPosition: 'bottom center',
                    filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.35))',
                    transform: settled ? 'none' : 'translateY(50px)',
                    opacity: settled ? 1 : 0,
                    transition: 'transform 650ms cubic-bezier(.2,.8,.2,1), opacity 300ms linear',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/def_char.avif';
                  }}
                />
              </div>
            </div>

            {/* name bar */}
            <div style={{ height: NAME_H, background: INK, color: WHITE, display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px 0 12px' }}>
              <div style={{ width: 50, height: 50, flex: 'none', background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, boxSizing: 'border-box' }}>
                <TeamLogo logo={p.teamLogo} flag={p.teamFlag} fallback={'/def_logo.png'} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
              <span style={{ width: 4, alignSelf: 'stretch', margin: '13px 0', background: primary, flex: 'none' }} />
              <span style={{ fontSize: nameSize, letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
            </div>

            {/* stats */}
            <div style={{ height: STATS_H, display: 'flex', alignItems: 'stretch', boxShadow: `inset 0 -1px 0 ${LINE}` }}>
              <Stat label="KILLS" value={num(p.killNum)} active={settled} accent={primary} />
              <Stat label="DAMAGE" value={num(p.numericDamage)} active={settled} divider />
              <Stat label="ASSISTS" value={num(p.assists)} active={settled} divider />
            </div>

            {/* kill share */}
            <div style={{ height: SHARE_H, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: `0 ${CORNER + 8}px 4px 22px` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 16, letterSpacing: '0.24em', color: DIM }}>KILL SHARE</span>
                <span style={{ fontSize: 26, color: INK, fontVariantNumeric: 'tabular-nums' }}>{shareV}%</span>
              </div>
              <div style={{ position: 'relative', height: 8, background: LINE }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: settled ? `${share}%` : '0%',
                    background: primary,
                    transition: 'width 900ms cubic-bezier(.2,.8,.2,1)',
                  }}
                />
              </div>
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: secondary }} />
          </div>
          {/* leading edge riding the top of the opening face */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 8, background: primary, opacity: open && !settled ? 1 : 0, transition: 'opacity 200ms linear' }} />
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Top 5 Fraggers
   ───────────────────────────────────────────── */
const MatchFragrs: React.FC<MatchFragrsProps> = ({ tournament, round, match, matchData }) => {
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);

  // Single-match Fragger Score (kills 30% + damage 30% + headshots 20% +
  // longest kill 10% + knockouts 10%, each vs. this match's pool average).
  const realTop = useMemo<Fragger[]>(() => {
    if (!matchData) return [];
    const scored = computeFraggerScores(buildFraggerPool([matchData] as any)).sort(compareFraggerScore);
    return scored.slice(0, 5).map((player: any) => {
      const teamTotalKills =
        (matchData as any).teams
          .find((t: any) => t.teamTag === player.teamTag)
          ?.players.reduce((sum: number, pl: any) => sum + (pl.killNum || 0), 0) || 0;
      return {
        ...(player.latestPlayerRaw as any),
        ...player,
        killNum: player.totalKills,
        numericDamage: player.totalDamage,
        assists: player.totalAssists,
        teamTotalKills,
      } as Fragger;
    });
  }, [matchData]);

  const players: Fragger[] = realTop.length ? realTop : demo ? DEMO : [];

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  const headIn = useAfter(60, run);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
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
  const rowW = players.length * CARD_W + Math.max(0, players.length - 1) * CARD_GAP;

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
      {players.length > 0 ? (
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
              TOP 5 FRAGGERS
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

          {/* ── cards ── */}
          <div key={`cards-${run}`} style={{ position: 'absolute', left: (1920 - rowW) / 2, top: CARDS_TOP, display: 'flex', gap: CARD_GAP }}>
            {players.map((p, i) => (
              <FraggerCard key={p._id || i} p={p} rank={i + 1} run={run} primary={primary} secondary={secondary} />
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
            NO PLAYER DATA
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
          top: 524,
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
        ▶ PREVIEW FRAGGERS
      </button>
    </div>
  );
};

export default MatchFragrs;