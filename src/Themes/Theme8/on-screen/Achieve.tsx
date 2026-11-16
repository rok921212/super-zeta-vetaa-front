import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { buildFraggerPool, pickLeader } from '../../shared/hooks/fraggerScore';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// matchData / matchDatas as props. The per-category leaderboard is the
// shared buildFraggerPool + pickLeader — unchanged.
//
// THEME8 "WHITE LABEL" — Players to Watch.
//   heading   ink trapezoid "PLAYERS TO WATCH" + round · day under it
//   4 cards   ┌ ink category bar (icon + GUNSLINGER / DMG DEALER / …)
//             ├ photo on the theme colour, faint team-logo mark top-right
//             ├ white stat block — big value + unit
//             └ ink name bar — team logo tile + player name
//
// Motion (all state + CSS transitions — no keyframes — so it always plays,
// even where the OS "reduce motion" setting suppresses CSS animations):
//   1) each card rises from below the screen, one after another
//   2) inside the landed card: the TEAM LOGO face shows first, then the card
//      opens upward (primary leading edge) to reveal the player + stats;
//      photo rises, value counts up.
// PREVIEW: a "Preview" button OUTSIDE the 1920×1080 canvas replays the
// sequence (uses dummy players when there is no data).

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
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  maxKillDistance?: number;
  driveDistance?: number;
  marchDistance?: number;
  health?: number;
  healthMax?: number;
  liveState?: number;
  useSmokeGrenadeNum?: number;
  useFragGrenadeNum?: number;
  useBurnGrenadeNum?: number;
  useFlashGrenadeNum?: number;
}

interface Team {
  _id: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
  teamFlag?: string;
  teamName: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchFragrsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  matchDatas?: MatchData[] | null;
}

type StatKey = 'killNum' | 'damage' | 'grenadeKills' | 'killDistance' | 'travelDistance';
type Cat = 'kills' | 'damage' | 'grenade' | 'eagle';

interface AggregatedPlayer {
  _id: string;
  playerName: string;
  picUrl?: string;
  teamLogo: string;
  teamFlag?: string;
  teamName: string;
  killNum: number;
  damage: number;
  grenadeKills: number;
  killDistance: number;
  travelDistance: number;
}

interface Category {
  label: string;
  unit: string;
  cat: Cat;
  player?: AggregatedPlayer;
  valueKey: StatKey;
}

/* ── palette + type (shared with the other theme8 overlays) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const CARD_W = 380;
const CARD_GAP = 28;
const CAT_H = 64;
const PHOTO_H = 360;
const STAT_H = 150;
const NAME_H = 76;
const CARD_H = CAT_H + PHOTO_H + STAT_H + NAME_H; // 650
const CARDS_TOP = 236;
const CORNER = 32;
const cardClip = `polygon(${CORNER}px 0, 100% 0, 100% calc(100% - ${CORNER}px), calc(100% - ${CORNER}px) 100%, 0 100%, 0 ${CORNER}px)`;

/* ── timeline (ms) ── */
const T_FIRST = 450; // first card starts rising
const STAGGER = 300; // between cards
const RISE_MS = 900; // card rise
const LOGO_HOLD = 650; // team-logo face holds after landing
const OPEN_MS = 700; // card opens upward to the stats
const RISE_FROM = 1080 - CARDS_TOP + 60; // start fully below the canvas

/* ── dummy data for the preview button ── */
const DEMO: AggregatedPlayer[] = [
  { _id: 'd1', playerName: 'VIPER', teamName: 'DUMMY ESPORTS', teamLogo: '/def_logo.png', killNum: 14, damage: 2210, grenadeKills: 2, killDistance: 212, travelDistance: 0 },
  { _id: 'd2', playerName: 'SHADOW', teamName: 'NOVA', teamLogo: '/def_logo.png', killNum: 11, damage: 2684, grenadeKills: 1, killDistance: 180, travelDistance: 0 },
  { _id: 'd3', playerName: 'KRYPTO', teamName: 'TSM', teamLogo: '/def_logo.png', killNum: 7, damage: 1401, grenadeKills: 4, killDistance: 96, travelDistance: 0 },
  { _id: 'd4', playerName: 'NEXUS', teamName: 'FAZE', teamLogo: '/def_logo.png', killNum: 6, damage: 1220, grenadeKills: 0, killDistance: 341, travelDistance: 0 },
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

/* flip `on` to true after `ms` (two frames later, so the start state paints first) */
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
   Category icons (24×24, currentColor)
   ───────────────────────────────────────────── */
const ICONS: Record<Cat, React.ReactNode> = {
  kills: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 1.5 V7 M12 17 V22.5 M1.5 12 H7 M17 12 H22.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </g>
  ),
  damage: (
    <polygon
      fill="currentColor"
      points="12,1.5 14.2,8 20.8,4.6 17.2,10.6 23,12.8 16.8,14.6 19.6,21 13.6,17.4 12,23 10.2,17.4 4.4,21 7.2,14.6 1,12.8 6.8,10.6 3.2,4.6 9.8,8"
    />
  ),
  grenade: (
    <g fill="currentColor">
      <rect x="9" y="4.5" width="6" height="4" />
      <path d="M15 5 L19 3 L20 5 L15.5 7.5 Z" />
      <circle cx="7.5" cy="5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8 C7.2 8 5 11.5 5 15 C5 19 8.2 22 12 22 C15.8 22 19 19 19 15 C19 11.5 16.8 8 12 8 Z" />
    </g>
  ),
  eagle: (
    <g fill="currentColor">
      <path d="M2 9 L9 7 L12 3 L15 7 L22 9 L16 11 L18 17 L12 13.5 L6 17 L8 11 Z" />
      <circle cx="12" cy="9" r="1.4" fill={INK} />
    </g>
  ),
};
const CatIcon = ({ cat, size, color }: { cat: Cat; size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ color, display: 'block', flex: 'none' }} aria-hidden>
    {ICONS[cat]}
  </svg>
);

/* ─────────────────────────────────────────────
   Player card
   ───────────────────────────────────────────── */
const PlayerCard: React.FC<{ item: Category; index: number; run: number; primary: string; secondary: string }> = ({
  item,
  index,
  run,
  primary,
  secondary,
}) => {
  const p = item.player!;
  const riseAt = T_FIRST + index * STAGGER;
  const up = useAfter(riseAt, run); // 1) card rises
  const logoIn = useAfter(riseAt + RISE_MS * 0.55, run); // team logo pops while landing
  const open = useAfter(riseAt + RISE_MS + LOGO_HOLD, run); // 2) opens to stats
  const settled = useAfter(riseAt + RISE_MS + LOGO_HOLD + OPEN_MS * 0.5, run);

  const raw = Number(p[item.valueKey]) || 0;
  const value = useCountUp(Math.round(raw), settled, 900);
  const onPrimary = inkOn(primary);
  const name = (p.playerName || '').toUpperCase();
  const nameSize = name.length <= 10 ? 38 : name.length <= 14 ? 31 : 26;

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
              width: 200,
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: logoIn ? 'scale(1)' : 'scale(0.6)',
              opacity: logoIn ? 1 : 0,
              transition: 'transform 500ms cubic-bezier(.34,1.56,.64,1), opacity 250ms linear',
            }}
          >
            <TeamLogo
              logo={p.teamLogo}
              flag={p.teamFlag}
              fallback={'/def_logo.png'}
              alt={p.teamName}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: INK,
              color: WHITE,
              padding: '8px 16px 7px',
              fontSize: 24,
              letterSpacing: '0.2em',
              opacity: logoIn ? 1 : 0,
              transform: logoIn ? 'none' : 'translateY(10px)',
              transition: 'opacity 300ms linear 150ms, transform 400ms cubic-bezier(.2,.8,.2,1) 150ms',
            }}
          >
            <CatIcon cat={item.cat} size={22} color={primary} />
            {item.label}
          </div>
        </div>

        {/* ── face 2: the player — opens upward over the logo face ── */}
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
          {/* content pinned to the full card so it is revealed, not squashed */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: CARD_H, background: WHITE }}>
            {/* category bar */}
            <div
              style={{
                height: CAT_H,
                background: INK,
                color: WHITE,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: `0 20px 0 ${CORNER + 6}px`,
                fontSize: 30,
                letterSpacing: '0.14em',
                position: 'relative',
              }}
            >
              <CatIcon cat={item.cat} size={30} color={primary} />
              {item.label}
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: primary }} />
            </div>

            {/* photo panel */}
            <div style={{ position: 'relative', height: PHOTO_H, background: primary, overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: 200,
                  height: 250,
                  background: secondary,
                  clipPath: 'polygon(55% 0, 100% 0, 100% 100%, 0 100%)',
                  opacity: 0.9,
                }}
              />
              {/* faint team-logo mark, top-right, in a corner bracket */}
              <div style={{ position: 'absolute', right: 18, top: 18, width: 84, height: 84 }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderTop: `2px solid ${onPrimary === WHITE ? 'rgba(255,255,255,.4)' : 'rgba(11,11,14,.4)'}`,
                    borderRight: `2px solid ${onPrimary === WHITE ? 'rgba(255,255,255,.4)' : 'rgba(11,11,14,.4)'}`,
                  }}
                />
                <div style={{ position: 'absolute', inset: 12, opacity: 0.35, filter: 'grayscale(1) brightness(2)' }}>
                  <TeamLogo
                    logo={p.teamLogo}
                    flag={p.teamFlag}
                    fallback={'/def_logo.png'}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: 18,
                  top: 20,
                  width: 70,
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
                    height: PHOTO_H - 16,
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

            {/* stat block */}
            <div
              style={{
                height: STAT_H,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 30px 0 32px',
                boxShadow: `inset 0 -1px 0 ${LINE}`,
              }}
            >
              <span style={{ position: 'absolute', left: 0, top: 28, bottom: 28, width: 8, background: primary }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 20, letterSpacing: '0.28em', color: DIM }}>{item.unit}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <span style={{ width: 44, height: 5, background: primary }} />
                  <span style={{ width: 12, height: 5, background: secondary }} />
                </span>
              </div>
              <span style={{ fontSize: 112, color: INK, fontVariantNumeric: 'tabular-nums', lineHeight: 0.85 }}>
                {value}
                {item.valueKey === 'killDistance' && <span style={{ fontSize: 44, marginLeft: 4 }}>M</span>}
              </span>
            </div>

            {/* name bar */}
            <div
              style={{
                height: NAME_H,
                background: INK,
                color: WHITE,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: `0 ${CORNER + 6}px 0 14px`,
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  flex: 'none',
                  background: WHITE,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 7,
                  boxSizing: 'border-box',
                }}
              >
                <TeamLogo
                  logo={p.teamLogo}
                  flag={p.teamFlag}
                  fallback={'/def_logo.png'}
                  alt=""
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>
              <span style={{ width: 4, alignSelf: 'stretch', margin: '14px 0', background: primary, flex: 'none' }} />
              <span style={{ fontSize: nameSize, letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {name}
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
   MatchFragrs
   ───────────────────────────────────────────── */
const MatchFragrs: React.FC<MatchFragrsProps> = ({ tournament, round, matchData, matchDatas }) => {
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);

  // Round-wide leaderboard from the shared fragger pool: kills / damage /
  // grenade-kills summed across every match; kill-distance is a running MAX.
  const realCats = useMemo<Category[]>(() => {
    const matchesToPool = matchDatas && matchDatas.length ? matchDatas : matchData ? [matchData] : [];
    if (matchesToPool.length === 0) return [];
    const pool = buildFraggerPool(matchesToPool as any);
    const asAgg = (e: ReturnType<typeof buildFraggerPool>[number] | null): AggregatedPlayer | undefined =>
      e
        ? {
            _id: e._id,
            playerName: e.playerName,
            picUrl: e.picUrl,
            teamLogo: e.teamLogo,
            teamFlag: e.teamFlag,
            teamName: e.teamName,
            killNum: e.totalKills,
            damage: e.totalDamage,
            grenadeKills: e.totalGrenadeKills,
            killDistance: e.longestKillDistance,
            travelDistance: e.maxTravelDistance,
          }
        : undefined;
    return [
      { label: 'GUNSLINGER', unit: 'KILLS', cat: 'kills', player: asAgg(pickLeader(pool, 'totalKills')), valueKey: 'killNum' },
      { label: 'DMG DEALER', unit: 'DAMAGE', cat: 'damage', player: asAgg(pickLeader(pool, 'totalDamage')), valueKey: 'damage' },
      { label: 'GRENADIER', unit: 'GRENADE KILLS', cat: 'grenade', player: asAgg(pickLeader(pool, 'totalGrenadeKills')), valueKey: 'grenadeKills' },
      { label: 'EAGLE EYE', unit: 'LONGEST KILL', cat: 'eagle', player: asAgg(pickLeader(pool, 'longestKillDistance')), valueKey: 'killDistance' },
    ];
  }, [matchDatas, matchData]);

  const demoCats: Category[] = [
    { label: 'GUNSLINGER', unit: 'KILLS', cat: 'kills', player: DEMO[0], valueKey: 'killNum' },
    { label: 'DMG DEALER', unit: 'DAMAGE', cat: 'damage', player: DEMO[1], valueKey: 'damage' },
    { label: 'GRENADIER', unit: 'GRENADE KILLS', cat: 'grenade', player: DEMO[2], valueKey: 'grenadeKills' },
    { label: 'EAGLE EYE', unit: 'LONGEST KILL', cat: 'eagle', player: DEMO[3], valueKey: 'killDistance' },
  ];

  const hasReal = realCats.some((c) => c.player);
  const cats = (hasReal ? realCats : demo ? demoCats : []).filter((c) => c.player);

  const preview = useCallback(() => {
    setDemo(true);
    setRun((r) => r + 1);
  }, []);

  // heading in
  const headIn = useAfter(60, run);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const day = round?.day || tournament.day || '';
  const context = [round?.roundName, day ? (/^day/i.test(day) ? day : `DAY ${day}`) : ''].filter(Boolean).join('  ·  ').toUpperCase();
  const rowW = cats.length * CARD_W + Math.max(0, cats.length - 1) * CARD_GAP;

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
      {cats.length > 0 && (
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
                height: 92,
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                padding: '0 70px 6px',
                background: INK,
                color: WHITE,
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 30px) 100%, 30px 100%)',
                fontSize: 64,
                letterSpacing: '0.08em',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ width: 16, height: 16, background: primary, flex: 'none' }} />
              PLAYERS TO WATCH
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
                }}
              >
                {context}
              </div>
            )}
          </div>

          {/* ── cards ── */}
          <div
            key={`cards-${run}`}
            style={{ position: 'absolute', left: (1920 - rowW) / 2, top: CARDS_TOP, display: 'flex', gap: CARD_GAP }}
          >
            {cats.map((item, i) => (
              <PlayerCard key={item.label} item={item} index={i} run={run} primary={primary} secondary={secondary} />
            ))}
          </div>
        </>
      )}

      {/* ── preview control — outside the 1920×1080 canvas ── */}
      <button
        type="button"
        onClick={preview}
        style={{
          position: 'absolute',
          left: 1940,
          top: 244,
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
        ▶ PREVIEW PLAYERS
      </button>
    </div>
  );
};

export default MatchFragrs;