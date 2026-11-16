import React, { useEffect, useMemo, useState } from 'react';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';

/* THEME8 "WHITE LABEL" — Overall Fraggers ("ROAD TO MVP").
   Data preserved: top 4 by the shared Fragger Score pooled from matchDatas
   (computeFraggerScores(buildFraggerPool(matchDatas)).sort(compareFraggerScore)),
   killNum = totalKills, numericDamage = avgDamage, avgSurvivalSeconds computed
   from matchDatas as before; same empty-data guards.

   Layout (1920×1080):
   ┌ [logo] TOURNAMENT NAME            ┐            [ ROUND NAME ]
   │        ROAD TO ▐MVP▌              │            [ AFTER MATCH 6 ]
   ├──────────┬──────────┬──────────┬──────────┐
   │ #1  MVP  │ #2       │ #3       │ #4       │  photo on a grey stage,
   │  photo   │  photo   │  photo   │  photo   │  theme stripe, rank watermark,
   │     logo │     logo │     logo │     logo │  team logo tile
   │ NAME     │ NAME     │ NAME     │ NAME     │  ink name bar
   │ ELIMS 41 │ ...      │          │          │  theme ELIMS row
   │ DMG│SURV │          │          │          │  AVG DMG · AVG SURV tiles
   └──────────┴──────────┴──────────┴──────────┘

   Entrance — three steps per card, each layer rising from the bottom, the
   cards one after another (MVP first):
     1) ink panel with the big rank number
     2) theme panel with the team logo + team name
     3) the player card — photo rises in, stats count up, MVP chip pops
   The header plate wipes in first; the tags slide in from the right.
   State + CSS transitions only — no keyframes, no reduced-motion kill-switch.
   PREVIEW: "▶ PREVIEW ROAD TO MVP" sits just BELOW the 1920×1080 canvas; it
   replays the entrance and uses dummy players when there is no data. */

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

interface Player {
  _id: string;
  uId: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  health: number;
  healthMax: number;
  liveState: number;
  teamIdfromApi?: string;
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
}

interface OverallData {
  tournamentId: string;
  roundId: string;
  matchId?: string;
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

interface OverallFragsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matches?: Match[];
  matchDatas?: MatchData[];
}

/* the fields a card reads */
interface FraggerRow {
  _id?: string;
  uId?: string;
  key?: string;
  playerName: string;
  picUrl?: string;
  teamName?: string;
  teamTag?: string;
  teamLogo?: string;
  teamFlag?: string;
  killNum?: number;
  numericDamage?: number;
  avgSurvivalSeconds?: number;
}

const DEFAULT_CHAR = '/def_char.avif';

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const PANEL = '#EFEFF2';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
const GREY_TXT = '#A6A6B0';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const SIDE = 120;
const GAP = 24;
const CARD_W = (1920 - SIDE * 2 - GAP * 3) / 4; // 402
const CARDS_TOP = 250;
const CARD_H = 1020 - CARDS_TOP; // 770
const PHOTO_H = 430;
const NAME_H = 86;
const ELIMS_TOP = PHOTO_H + NAME_H + 16;
const ELIMS_H = 94;
const TILES_TOP = ELIMS_TOP + ELIMS_H + 12;
const TILES_H = 100;
const CUT = 30;
const cardClip = `polygon(0 0, calc(100% - ${CUT}px) 0, 100% ${CUT}px, 100% 100%, ${CUT}px 100%, 0 calc(100% - ${CUT}px))`;

/* ── motion ── */
const RISE_MS = 620; // each layer's upward wipe
const EASE = 'cubic-bezier(.65,0,.25,1)';
const T_HEAD = 60;
const T_CARD0 = 650; // first card's step 1
const CARD_STAGGER = 200;
const STEP2_AFTER = 850;
const STEP3_AFTER = 1750;

/* ── dummy players for the preview button ── */
const DEMO: FraggerRow[] = [
  { _id: 'd1', playerName: 'VIPER', teamName: 'DUMMY ESPORTS', teamLogo: '/def_logo.png', killNum: 47, numericDamage: 612.4, avgSurvivalSeconds: 1288 },
  { _id: 'd2', playerName: 'SHADOW', teamName: 'NOVA GAMING', teamLogo: '/def_logo.png', killNum: 41, numericDamage: 574.9, avgSurvivalSeconds: 1172 },
  { _id: 'd3', playerName: 'KRYPTO', teamName: 'TEAM STORM', teamLogo: '/def_logo.png', killNum: 38, numericDamage: 598.1, avgSurvivalSeconds: 1034 },
  { _id: 'd4', playerName: 'NEXUS', teamName: 'ALPHA SEVEN', teamLogo: '/def_logo.png', killNum: 35, numericDamage: 521.7, avgSurvivalSeconds: 1250 },
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

const formatSecondsToMMSS = (seconds: number = 0) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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

/** counts 0 → target (float) once active */
function useCountUp(target: number, active: boolean, durMs = 1000, delayMs = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now() + delayMs;
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - start) / durMs));
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durMs, delayMs]);
  return v;
}

const rise = (on: boolean, delay: number, dist = 18): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : `translateY(${dist}px)`,
  transition: `opacity 320ms linear ${delay}ms, transform 560ms cubic-bezier(.16,1,.3,1) ${delay}ms`,
});
const pop = (on: boolean, delay: number): React.CSSProperties => ({
  opacity: on ? 1 : 0,
  transform: on ? 'none' : 'scale(.55)',
  transition: `opacity 250ms linear ${delay}ms, transform 600ms cubic-bezier(.34,1.56,.64,1) ${delay}ms`,
});

/* Upward wipe: the layer grows from the bottom; content pinned to full height. */
const RiseLayer: React.FC<{ open: boolean; edge: string; children: React.ReactNode }> = ({ open, edge, children }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: open ? CARD_H : 0,
      overflow: 'hidden',
      transition: `height ${RISE_MS}ms ${EASE}`,
    }}
  >
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: CARD_H }}>{children}</div>
    {/* leading edge riding the top of the wipe */}
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: 12,
        background: edge,
        opacity: open ? 0 : 1,
        transition: `opacity 140ms linear ${open ? RISE_MS - 80 : 0}ms`,
      }}
    />
  </div>
);

const Crown = ({ color, size = 18 }: { color: string; size?: number }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block', flex: 'none' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
  </svg>
);

/* ─────────────────────────────────────────────
   Header — white title plate + round / match tags
   ───────────────────────────────────────────── */
const Header: React.FC<{ tournament: Tournament; round?: Round | null; match?: Match | null; primary: string; secondary: string }> = ({
  tournament,
  round,
  match,
  primary,
  secondary,
}) => {
  const onPrimary = inkOn(primary);
  const plate = useAfter(T_HEAD);
  const text = useAfter(T_HEAD + 300);
  const tags = useAfter(T_HEAD + 450);
  const PLATE_H = 150;

  return (
    <>
      {/* title plate */}
      <div
        style={{
          position: 'absolute',
          left: SIDE,
          top: 54,
          height: PLATE_H,
          display: 'flex',
          clipPath: plate ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          transition: `clip-path ${RISE_MS + 100}ms ${EASE}`,
        }}
      >
        {/* logo tile — ink */}
        <div style={{ width: PLATE_H, height: PLATE_H, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <img
            src={tournament.torLogo || '/def_logo.png'}
            alt=""
            style={{ width: 96, height: 96, maxWidth: 'none', objectFit: 'contain', display: 'block', ...pop(text, 0) }}
          />
        </div>
        <div style={{ width: 8, background: secondary, flex: 'none' }} />
        <div
          style={{
            background: WHITE,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 70px 0 34px',
            clipPath: 'polygon(0 0, 100% 0, calc(100% - 44px) 100%, 0 100%)',
          }}
        >
          <div style={{ fontSize: 24, letterSpacing: '0.22em', color: DIM, whiteSpace: 'nowrap', ...rise(text, 0, 10) }}>
            {(tournament.tournamentName || '').toUpperCase()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 10, ...rise(text, 120, 20) }}>
            <span style={{ fontSize: 96, lineHeight: 0.9, color: INK, letterSpacing: '0.02em' }}>ROAD TO</span>
            <span
              style={{
                fontSize: 96,
                lineHeight: 0.9,
                color: onPrimary,
                background: primary,
                padding: '6px 34px 0 26px',
                clipPath: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
              }}
            >
              MVP
            </span>
          </div>
        </div>
      </div>

      {/* round / match tags */}
      <div style={{ position: 'absolute', right: SIDE, top: 70, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
        <div
          style={{
            height: 62,
            display: 'flex',
            alignItems: 'center',
            padding: '0 34px 0 46px',
            background: INK,
            color: WHITE,
            fontSize: 38,
            letterSpacing: '0.1em',
            clipPath: 'polygon(22px 0, 100% 0, 100% 100%, 0 100%)',
            opacity: tags ? 1 : 0,
            transform: tags ? 'none' : 'translateX(60px)',
            transition: 'opacity 300ms linear, transform 600ms cubic-bezier(.16,1,.3,1)',
          }}
        >
          {(round?.roundName || 'No Round').toUpperCase()}
        </div>
        <div
          style={{
            height: 46,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 26px 0 36px',
            background: WHITE,
            color: INK,
            fontSize: 24,
            letterSpacing: '0.18em',
            clipPath: 'polygon(16px 0, 100% 0, 100% 100%, 0 100%)',
            opacity: tags ? 1 : 0,
            transform: tags ? 'none' : 'translateX(60px)',
            transition: 'opacity 300ms linear 120ms, transform 600ms cubic-bezier(.16,1,.3,1) 120ms',
          }}
        >
          AFTER MATCH
          <span style={{ background: primary, color: onPrimary, padding: '4px 10px 2px', letterSpacing: '0.04em' }}>
            {match?.matchNo ?? 'N/A'}
          </span>
        </div>
      </div>
    </>
  );
};

/* ─────────────────────────────────────────────
   Player card — three stacked rising layers
   ───────────────────────────────────────────── */
const PlayerCard: React.FC<{ player: FraggerRow; index: number; primary: string; secondary: string }> = ({
  player,
  index,
  primary,
  secondary,
}) => {
  const onPrimary = inkOn(primary);
  const isMvp = index === 0;
  const rankLabel = String(index + 1).padStart(2, '0');
  const start = T_CARD0 + index * CARD_STAGGER;
  const s1 = useAfter(start);
  const s2 = useAfter(start + STEP2_AFTER);
  const s3 = useAfter(start + STEP3_AFTER);
  const live = useAfter(start + STEP3_AFTER + 250); // contents of the open card

  const elims = useCountUp(Number(player.killNum ?? 0), live, 1000, 200);
  const dmg = useCountUp(Number(player.numericDamage ?? 0), live, 1100, 320);
  const surv = useCountUp(Number(player.avgSurvivalSeconds ?? 0), live, 1100, 420);

  const name = (player.playerName || '').toUpperCase();
  const nameSize = name.length <= 9 ? 50 : name.length <= 12 ? 42 : name.length <= 15 ? 34 : 28;
  const team = (player.teamName || player.teamTag || '').toUpperCase();

  return (
    <div style={{ position: 'relative', width: CARD_W, height: CARD_H, flex: 'none', filter: 'drop-shadow(0 18px 36px rgba(0,0,0,.28))' }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: cardClip, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
        {/* 1 — ink panel, big rank */}
        <RiseLayer open={s1} edge={primary}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: INK,
              color: WHITE,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 22, letterSpacing: '0.34em', color: GREY_TXT, paddingLeft: '0.34em', ...rise(s1, 250, 10) }}>RANK</span>
            <span style={{ fontSize: 230, lineHeight: 0.85, marginTop: 10, ...pop(s1, 300) }}>{rankLabel}</span>
            <span style={{ width: 70, height: 6, background: primary, marginTop: 22, ...rise(s1, 450, 10) }} />
          </div>
        </RiseLayer>

        {/* 2 — theme panel, team logo */}
        <RiseLayer open={s2} edge={secondary}>
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
              gap: 26,
            }}
          >
            <TeamLogo
              logo={player.teamLogo}
              flag={player.teamFlag}
              fallback="/def_logo.png"
              alt=""
              style={{ width: 200, height: 200, maxWidth: 'none', objectFit: 'contain', display: 'block', ...pop(s2, 250) }}
            />
            <span
              style={{
                fontSize: 30,
                letterSpacing: '0.16em',
                maxWidth: CARD_W - 60,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                ...rise(s2, 400, 12),
              }}
            >
              {team}
            </span>
          </div>
        </RiseLayer>

        {/* 3 — the player card */}
        <RiseLayer open={s3} edge={isMvp ? primary : INK}>
          <div style={{ position: 'absolute', inset: 0, background: WHITE, color: INK }}>
            {/* photo stage */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: PHOTO_H, background: PANEL, overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  left: -60,
                  right: -60,
                  top: 170,
                  height: 170,
                  background: isMvp ? primary : INK,
                  transform: 'skewY(-14deg)',
                }}
              />
              <div style={{ position: 'absolute', left: -60, right: -60, top: 350, height: 12, background: isMvp ? secondary : primary, transform: 'skewY(-14deg)' }} />
              {/* rank watermark */}
              <div style={{ position: 'absolute', right: 10, top: 0, fontSize: 210, lineHeight: 0.85, color: INK, opacity: 0.07 }}>{rankLabel}</div>
              {/* player — fitted by height so the head is never cropped */}
              <img
                src={playerPhoto(player.picUrl) || DEFAULT_CHAR}
                alt=""
                style={{
                  position: 'absolute',
                  left: -CARD_W * 0.2,
                  bottom: 0,
                  width: CARD_W * 1.4,
                  height: PHOTO_H - 14,
                  maxWidth: 'none',
                  objectFit: 'contain',
                  objectPosition: 'center bottom',
                  display: 'block',
                  opacity: live ? 1 : 0,
                  transform: live ? 'none' : 'translateY(60px)',
                  transition: 'opacity 320ms linear, transform 800ms cubic-bezier(.16,1,.3,1)',
                }}
              />
              {/* rank chip */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: 74,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 30px 0 20px',
                  background: isMvp ? primary : INK,
                  color: isMvp ? onPrimary : WHITE,
                  fontSize: 54,
                  clipPath: 'polygon(0 0, 100% 0, calc(100% - 20px) 100%, 0 100%)',
                  opacity: live ? 1 : 0,
                  transform: live ? 'none' : 'translateX(-40px)',
                  transition: 'opacity 250ms linear 150ms, transform 520ms cubic-bezier(.16,1,.3,1) 150ms',
                }}
              >
                #{index + 1}
              </div>
              {/* MVP chip */}
              {isMvp && (
                <div
                  style={{
                    position: 'absolute',
                    right: CUT + 8,
                    top: 20,
                    height: 40,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 16px 0 14px',
                    background: INK,
                    color: WHITE,
                    fontSize: 22,
                    letterSpacing: '0.2em',
                    ...pop(live, 500),
                  }}
                >
                  <Crown color={primary} size={22} /> MVP
                </div>
              )}
              {/* team logo tile */}
              <div
                style={{
                  position: 'absolute',
                  right: 16,
                  bottom: 16,
                  width: 80,
                  height: 80,
                  background: WHITE,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)',
                  ...pop(live, 380),
                }}
              >
                <TeamLogo
                  logo={player.teamLogo}
                  flag={player.teamFlag}
                  fallback="/def_logo.png"
                  alt=""
                  style={{ width: 60, height: 60, maxWidth: 'none', objectFit: 'contain', display: 'block' }}
                />
              </div>
            </div>

            {/* name bar */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: PHOTO_H,
                height: NAME_H,
                background: INK,
                color: WHITE,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '0 22px 0 30px',
              }}
            >
              <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: primary }} />
              <span style={{ fontSize: nameSize, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...rise(live, 120, 14) }}>{name}</span>
              <span style={{ fontSize: 17, letterSpacing: '0.2em', color: GREY_TXT, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...rise(live, 200, 10) }}>
                {team}
              </span>
            </div>

            {/* ELIMS — hero stat */}
            <div
              style={{
                position: 'absolute',
                left: 16,
                right: 16,
                top: ELIMS_TOP,
                height: ELIMS_H,
                background: primary,
                color: onPrimary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 30px 0 26px',
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 18px) 100%, 0 100%)',
                ...rise(live, 250, 24),
              }}
            >
              <span style={{ fontSize: 24, letterSpacing: '0.24em', opacity: 0.9 }}>ELIMS</span>
              <span style={{ fontSize: 76, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>{Math.round(elims)}</span>
            </div>

            {/* AVG DMG · AVG SURV */}
            <div style={{ position: 'absolute', left: 16, right: 16, top: TILES_TOP, height: TILES_H, display: 'flex', gap: 12 }}>
              {[
                { label: 'AVG DMG', value: dmg.toFixed(1) },
                { label: 'AVG SURV', value: formatSecondsToMMSS(surv) },
              ].map((s, i) => (
                <div
                  key={s.label}
                  style={{
                    flex: 1,
                    background: PANEL,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `inset 0 -5px 0 ${i === 0 ? INK : LINE}`,
                    ...rise(live, 340 + i * 90, 24),
                  }}
                >
                  <span style={{ fontSize: 50, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
                  <span style={{ fontSize: 16, letterSpacing: '0.22em', color: DIM, marginTop: 8 }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </RiseLayer>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */
const OverallFrags: React.FC<OverallFragsProps> = ({ tournament, round, match, overallData, matchDatas = [] }) => {
  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;

  // Top 4 players by the shared Fragger Score, pooled from matchDatas.
  // AVG SURVIVAL isn't tracked by the shared pool, so it's computed here.
  const topPlayers = useMemo(() => {
    if (!overallData || matchDatas.length === 0) return [];

    const scored = computeFraggerScores(buildFraggerPool(matchDatas as any)).sort(compareFraggerScore);

    const survivalByKey = new Map<string, number>();
    matchDatas.forEach((md) => {
      md.teams.forEach((team) => {
        team.players.forEach((player) => {
          const key = String(player.uId || player._id);
          survivalByKey.set(key, (survivalByKey.get(key) || 0) + (player.survivalTime || 0));
        });
      });
    });

    return scored.slice(0, 4).map((player: any) => ({
      ...player,
      killNum: player.totalKills,
      numericDamage: player.avgDamage,
      avgSurvivalSeconds:
        player.appearances > 0 ? (survivalByKey.get(player.key) || 0) / player.appearances : 0,
    }));
  }, [overallData, matchDatas]);

  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);
  const hasData = !!overallData && topPlayers.length > 0;
  const useDemo = !hasData && demo;
  const players = (useDemo ? DEMO : topPlayers) as FraggerRow[];

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

  const notice = (text: string) => (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          padding: '18px 48px 16px 40px',
          background: WHITE,
          color: INK,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 32,
          letterSpacing: '0.12em',
          boxShadow: `inset 8px 0 0 ${primary}`,
        }}
      >
        {text}
      </div>
    </div>
  );

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      {!overallData && !useDemo ? (
        notice('NO OVERALL DATA AVAILABLE')
      ) : (
        <div key={`run-${run}-${useDemo ? 'demo' : 'live'}`} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <Header tournament={tournament} round={round} match={match} primary={primary} secondary={secondary} />
          {players.length === 0 ? (
            notice('NO PLAYER STATS YET')
          ) : (
            <div style={{ position: 'absolute', left: SIDE, top: CARDS_TOP, display: 'flex', gap: GAP }}>
              {players.map((p, i) => (
                <PlayerCard key={p.uId || p._id || p.key || i} player={p} index={i} primary={primary} secondary={secondary} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* preview — BELOW the 1920×1080 canvas */}
      <button type="button" onClick={preview} style={btn}>
        ▶ PREVIEW ROAD TO MVP
      </button>
    </div>
  );
};

export default OverallFrags;