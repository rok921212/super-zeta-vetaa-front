import React, { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { buildFraggerPool, pickLeader } from '../../shared/hooks/fraggerScore';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
// NOTE: no socket here — PublicThemeRenderer owns the single connection,
// listens to 'bulkUpdate' and passes freshly-merged `matchData` down.

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
}

type StatKey = 'killNum' | 'damage' | 'grenadeKills' | 'killDistance' | 'travelDistance';

// ─────────────────────────────────────────────
// Layout + timing
// ─────────────────────────────────────────────
const CARD_W = 316;
const CARD_H = 664;
const CARD_GAP = 20;
const PHOTO_H = 400;
const STAGGER = 0.28;
const OPEN_AT = 1.25; // s after a card's start: capsule splits open
const DEFAULT_CHAR = '/def_char.avif';

// ─────────────────────────────────────────────
// Visual language (same as Top Fraggers / Champions / H2H)
// ─────────────────────────────────────────────
const INK = '#0d0f13';
const CUT_BOLT = 'polygon(0 0, 100% 0, 84% 46%, 96% 46%, 78% 100%, 0 100%)';
const CUT_CHIP = 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)';
const CUT_HEAD = 'polygon(0 0, 100% 0, calc(100% - 40px) 100%, 0 100%)';
const CUT_TAG = 'polygon(26px 0, 100% 0, 100% 100%, 0 100%, 14px 50%)';
const CUT_ROW = 'polygon(22px 0, 100% 0, calc(100% - 22px) 100%, 0 100%)';
const CUT_CARD = 'polygon(0 0, calc(100% - 34px) 0, 100% 34px, 100% 100%, 26px 100%, 0 calc(100% - 26px))';
const CUT_HEX = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';

const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const Bolt: React.FC<{ size?: number; color: string; className?: string }> = ({ size = 18, color, className }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" className={className} aria-hidden style={{ flexShrink: 0 }}>
    <path d="M13 0 L2 16 H9 L6 28 L18 10 H11 L15 0 Z" fill={color} />
  </svg>
);

const Crown: React.FC<{ size?: number; color: string }> = ({ size = 20, color }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
    <rect x="6" y="27" width="28" height="3" fill={color} />
  </svg>
);

const electric = (primary: string, speed: number): React.CSSProperties => ({
  backgroundColor: primary,
  backgroundImage: 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
  backgroundSize: '200% 100%',
  animation: `ps-run ${speed}s linear infinite`,
  boxShadow: `0 0 10px ${withAlpha(primary, 0.85)}`,
});

const onPicError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_CHAR)) img.src = DEFAULT_CHAR;
};

/** Rolls a number up from 0 (or its last value), straight on the DOM. */
const CountUp: React.FC<{ value: number; delay: number; duration?: number }> = ({ value, delay, duration = 1000 }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const to = Math.round(Number(value) || 0);
    const from = prev.current;
    prev.current = to;
    if (from === to) {
      el.textContent = to.toLocaleString();
      return;
    }
    el.textContent = from.toLocaleString();
    let raf = 0;
    const start = performance.now() + delay * 1000;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / duration));
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))).toLocaleString();
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = to.toLocaleString();
    };
  }, [value, delay, duration]);
  return <span ref={ref}>0</span>;
};

// ─────────────────────────────────────────────
// Category card — two-step: storm capsule strike → opens to the leader
// ─────────────────────────────────────────────
interface CategoryCardProps {
  title: string; // MOST KILLS …
  short: string; // KILLS …
  unit: string;
  value: number;
  player: any;
  index: number;
  primary: string;
  secondary: string;
  themeGrad: string;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ title, short, unit, value, player, index, primary, secondary, themeGrad }) => {
  const d = 0.45 + index * STAGGER;
  const open = d + OPEN_AT;
  const featured = index === 0;
  const boltPts = '170,0 148,70 168,78 134,160 156,168 130,250 150,258 158,300';
  // shrink long numbers ("4,821 M") so they always fit the card
  const valueChars = Math.round(value).toLocaleString().length + (unit ? 1 : 0);
  const branchPts = '148,70 118,104 126,112 96,150';

  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: CARD_W, height: CARD_H, animation: `ps-glow ${featured ? 2.4 : 3.4}s ${open + 0.6}s ease-in-out infinite` }}
      initial={{ opacity: 0, y: 120 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: d, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative w-full h-full overflow-hidden" style={{ clipPath: CUT_CARD, background: 'linear-gradient(180deg, #ffffff 0%, #eef0f3 100%)' }}>
        {/* ═════════════ CONTENT ═════════════ */}
        <div
          className="absolute left-0 right-0 top-0 overflow-hidden"
          style={{
            height: PHOTO_H,
            background: `radial-gradient(ellipse 80% 70% at 50% 0%, ${withAlpha(primary, 0.75)} 0%, transparent 70%),
                         linear-gradient(165deg, #06070b 0%, ${withAlpha(secondary, 0.95)} 55%, ${primary} 150%)`,
          }}
        >
          <div className="absolute inset-0 opacity-[0.1]" style={{ background: 'repeating-linear-gradient(-60deg, #fff 0 2px, transparent 2px 22px)' }} />
          {/* faded team logo behind the player */}
          <div className="absolute left-1/2 top-[50px] w-[240px] h-[240px] -translate-x-1/2 opacity-[0.16]">
            <TeamLogo logo={player.teamLogo} flag={player.teamFlag} alt="" className="w-full h-full object-contain" />
          </div>
          {/* occasional strike behind the player */}
          <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${CARD_W} ${PHOTO_H}`} preserveAspectRatio="none" aria-hidden>
            <g style={{ opacity: 0, animation: `ps-bolt ${4.4 + index * 0.9}s ${open + 1.6 + index * 0.7}s linear infinite` }}>
              <path d="M226 0 L206 56 L222 62 L190 132 L208 138 L176 226" fill="none" stroke={primary} strokeWidth="9" filter="url(#ps-glow-f)" />
              <path d="M226 0 L206 56 L222 62 L190 132 L208 138 L176 226" fill="none" stroke="#fff" strokeWidth="2.2" />
            </g>
          </svg>
          <img
            src={playerPhoto(player.picUrl) || DEFAULT_CHAR}
            onError={onPicError}
            alt={player.playerName}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: '50% 0%', transform: 'scale(1.12)', transformOrigin: '50% 0%', filter: 'drop-shadow(0 10px 16px rgba(0,0,0,0.55))' }}
          />
          <div className="absolute left-0 right-0 bottom-0 h-[38%]" style={{ background: 'linear-gradient(180deg, transparent, rgba(6,7,11,0.9))' }} />

          {/* category chip */}
          <div
            className="absolute left-0 top-[14px] h-[38px] pl-[14px] pr-[22px] flex items-center gap-[8px] bg-white"
            style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)', color: INK }}
          >
            {featured ? <Crown size={18} color={primary} /> : <Bolt size={11} color={primary} />}
            <span className="font-[AGENCYB] font-bold text-[1.05rem] tracking-[0.16em] leading-none whitespace-nowrap">{title}</span>
          </div>
          {/* team logo chip */}
          <div className="absolute right-[38px] top-[60px] w-[52px] h-[52px] flex items-center justify-center p-[7px] bg-white" style={{ clipPath: CUT_HEX }}>
            <TeamLogo logo={player.teamLogo} flag={player.teamFlag} alt="" className="w-full h-full object-contain" />
          </div>
          {/* player name over the photo */}
          <div className="absolute left-[18px] right-[18px] bottom-[14px]" style={{ animation: `ps-up .45s ${open + 0.25}s ease-out both` }}>
            <div className="font-bebas text-[2.6rem] leading-[0.95] text-white truncate" style={{ textShadow: `0 0 14px ${withAlpha(primary, 0.7)}` }}>
              {player.playerName}
            </div>
            <div className="flex items-center gap-[6px] font-[Righteous] text-[0.85rem] tracking-[0.14em] truncate text-white/75">
              <Bolt size={9} color={primary} />
              {(player.teamTag || '').toUpperCase()}
              {player.teamName ? <span className="truncate">· {player.teamName}</span> : null}
            </div>
          </div>
          <div className="absolute left-0 right-0 bottom-0 h-[4px]" style={electric(primary, 3.2)} />
        </div>

        {/* value hero */}
        <div
          className="absolute left-0 right-0 bottom-0 flex flex-col items-center justify-center"
          style={{ top: PHOTO_H + 4, background: featured ? themeGrad : undefined, animation: `ps-up .5s ${open + 0.35}s ease-out both` }}
        >
          {!featured && (
            <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${withAlpha(primary, 0.12)} 0%, transparent 55%)` }} />
          )}
          <div
            className="relative font-bebas leading-[0.85] pt-[8px] whitespace-nowrap"
            style={{
              fontSize: valueChars >= 6 ? '4.8rem' : valueChars >= 5 ? '5.6rem' : '6.6rem',
              ...(featured
                ? { color: '#fff', textShadow: '0 0 18px rgba(255,255,255,0.45)' }
                : {
                    background: themeGrad,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: `drop-shadow(0 0 10px ${withAlpha(primary, 0.4)})`,
                  }),
            }}
          >
            <CountUp value={value} delay={open + 0.5} />
            {unit && (
              <span className="text-[2.8rem] ml-[6px]" style={featured ? { color: 'rgba(255,255,255,0.85)' } : undefined}>
                {unit}
              </span>
            )}
          </div>
          <div
            className="relative mt-[10px] h-[34px] pl-[16px] pr-[20px] flex items-center gap-[8px] font-[AGENCYB] font-bold text-[1.2rem] tracking-[0.18em] whitespace-nowrap"
            style={{ background: featured ? 'rgba(255,255,255,0.95)' : INK, color: featured ? INK : '#fff', clipPath: CUT_CHIP }}
          >
            <Bolt size={11} color={primary} />
            {short}
          </div>
          <div
            className="absolute top-0 bottom-0 w-[90px] pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)',
              transform: 'translateX(-200%) skewX(-22deg)',
              animation: `ps-sweep 1s ${open + 0.7}s ease-in-out both`,
              mixBlendMode: featured ? 'overlay' : 'normal',
            }}
          />
        </div>

        <div className="absolute left-[26px] right-0 bottom-0 h-[4px]" style={electric(primary, 4.5)} />

        {/* ═════════════ CAPSULE (step 1: strike, step 2: split open) ═════════════ */}
        {(['top', 'bottom'] as const).map((half) => (
          <div
            key={half}
            className="absolute left-0 right-0 overflow-hidden z-20"
            style={{
              top: half === 'top' ? 0 : '50%',
              height: '50%',
              animation: `${half === 'top' ? 'ps-shut-up' : 'ps-shut-down'} .6s ${open}s cubic-bezier(.6,0,.3,1) both`,
            }}
          >
            <div
              className="absolute left-0 right-0"
              style={{
                top: half === 'top' ? 0 : '-100%',
                height: '200%',
                background: `radial-gradient(ellipse 80% 45% at 50% 50%, ${withAlpha(primary, 0.7)} 0%, transparent 70%),
                             linear-gradient(170deg, #06070b 0%, ${withAlpha(secondary, 0.98)} 55%, #06070b 100%)`,
              }}
            >
              <div className="absolute inset-0 opacity-[0.08]" style={{ background: 'repeating-linear-gradient(-60deg, #fff 0 2px, transparent 2px 22px)' }} />
            </div>
            <div
              className={`absolute left-0 right-0 h-[3px] ${half === 'top' ? 'bottom-0' : 'top-0'}`}
              style={{ ...electric(primary, 1.2), opacity: 0, animation: `ps-seam .5s ${open - 0.15}s ease-out both, ps-run 1.2s linear infinite` }}
            />
          </div>
        ))}

        {/* strike */}
        <svg
          className="absolute inset-0 w-full h-full z-30 pointer-events-none"
          viewBox={`0 0 ${CARD_W} ${CARD_H}`}
          preserveAspectRatio="none"
          style={{ animation: `ps-hide .25s ${open}s ease-out both` }}
          aria-hidden
        >
          {[boltPts, branchPts].map((pts, j) => (
            <g key={j}>
              <polyline
                points={pts}
                fill="none"
                stroke={primary}
                strokeWidth={j ? 6 : 12}
                filter="url(#ps-glow-f)"
                pathLength={1}
                strokeDasharray="1"
                style={{ strokeDashoffset: 1, animation: `ps-draw .3s ${d + 0.3 + j * 0.08}s ease-out both, ps-zap .7s ${d + 0.6}s linear both` }}
              />
              <polyline
                points={pts}
                fill="none"
                stroke="#fff"
                strokeWidth={j ? 1.6 : 3}
                strokeLinejoin="miter"
                pathLength={1}
                strokeDasharray="1"
                style={{ strokeDashoffset: 1, animation: `ps-draw .3s ${d + 0.3 + j * 0.08}s ease-out both, ps-zap .7s ${d + 0.6}s linear both` }}
              />
            </g>
          ))}
        </svg>
        <div
          className="absolute inset-0 z-30 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 50%, #fff 0%, ${withAlpha(primary, 0.6)} 30%, transparent 65%)`,
            opacity: 0,
            animation: `ps-flash .55s ${d + 0.58}s ease-out both`,
          }}
        />

        {/* category title in the capsule — struck, glows, then pulls away */}
        <div
          className="absolute left-1/2 top-1/2 w-[260px] z-30 flex flex-col items-center text-center"
          style={{ animation: `ps-title ${OPEN_AT + 0.5}s ${d}s cubic-bezier(.2,.9,.25,1) both` }}
        >
          <div className="w-[96px] h-[96px] p-[5px] mb-[12px]" style={{ clipPath: CUT_HEX, background: themeGrad }}>
            <div className="w-full h-full flex items-center justify-center" style={{ clipPath: CUT_HEX, background: INK }}>
              {featured ? <Crown size={44} color="#fff" /> : <Bolt size={34} color="#fff" />}
            </div>
          </div>
          <div className="font-bebas text-[3rem] leading-[0.95] text-white" style={{ textShadow: `0 0 16px ${withAlpha(primary, 0.95)}` }}>
            {title}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
const MatchFragrs: React.FC<MatchFragrsProps> = ({ tournament, round, match, matchData }) => {
  // Per-category single-match leaders from the shared fragger pool.
  const topCategories = useMemo(() => {
    if (!matchData) return [];

    const pool = buildFraggerPool([matchData] as any);
    const view = (e: ReturnType<typeof buildFraggerPool>[number] | null) =>
      e
        ? {
            ...(e as any).latestPlayerRaw,
            ...e,
            killNum: (e as any).totalKills,
            damage: (e as any).totalDamage,
            grenadeKills: (e as any).totalGrenadeKills,
            killDistance: (e as any).longestKillDistance,
            travelDistance: (e as any).maxTravelDistance,
          }
        : undefined;

    return [
      { title: 'MOST KILLS', short: 'KILLS', unit: '', player: view(pickLeader(pool, 'totalKills')), valueKey: 'killNum' as StatKey },
      { title: 'MOST DAMAGE', short: 'DAMAGE', unit: '', player: view(pickLeader(pool, 'totalDamage')), valueKey: 'damage' as StatKey },
      { title: 'GRENADE MASTER', short: 'GRENADE KILLS', unit: '', player: view(pickLeader(pool, 'totalGrenadeKills')), valueKey: 'grenadeKills' as StatKey },
      { title: 'LONGEST KILL', short: 'KILL DISTANCE', unit: 'M', player: view(pickLeader(pool, 'longestKillDistance')), valueKey: 'killDistance' as StatKey },
      { title: 'FARTHEST TRAVEL', short: 'TRAVEL DISTANCE', unit: 'M', player: view(pickLeader(pool, 'maxTravelDistance')), valueKey: 'travelDistance' as StatKey },
    ];
  }, [matchData]);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

  if (!matchData) return <div />;

  const shown = topCategories.filter((c) => c.player);
  const matchNo = match?.matchNo || match?._matchNo;
  const rowW = shown.length * CARD_W + Math.max(shown.length - 1, 0) * CARD_GAP;

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden select-none">
      <style>{`
        @keyframes ps-run   { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        @keyframes ps-line  { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes ps-glow  {
          0%, 100% { filter: drop-shadow(0 0 8px ${withAlpha(primary, 0.45)}); }
          50%      { filter: drop-shadow(0 0 24px ${withAlpha(primary, 0.9)}); }
        }
        @keyframes ps-flicker {
          0%, 88%, 100% { opacity: 1; }
          89% { opacity: .25; } 90% { opacity: 1; }
          92% { opacity: .5; }  93% { opacity: 1; }
        }
        @keyframes ps-bolt {
          0%, 100% { opacity: 0; }
          2% { opacity: 1; } 4% { opacity: .15; } 6.5% { opacity: 1; } 9% { opacity: .4; } 12% { opacity: 0; }
        }
        /* step 1 — strike */
        @keyframes ps-draw  { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes ps-zap   { 0% { opacity: 1; } 15% { opacity: .15; } 30% { opacity: 1; } 55% { opacity: .4; } 75% { opacity: .9; } 100% { opacity: 0; } }
        @keyframes ps-flash { 0% { opacity: 0; } 15% { opacity: .9; } 100% { opacity: 0; } }
        @keyframes ps-title {
          0%   { transform: translate(-50%,-50%) scale(.3); opacity: 0; filter: brightness(1); }
          30%  { transform: translate(-50%,-50%) scale(.3); opacity: 0; }
          42%  { transform: translate(-50%,-50%) scale(1.15); opacity: 1; filter: brightness(2) drop-shadow(0 0 24px ${withAlpha(primary, 1)}); }
          55%  { transform: translate(-50%,-50%) scale(1); filter: brightness(1) drop-shadow(0 0 14px ${withAlpha(primary, 0.8)}); }
          78%  { transform: translate(-50%,-50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(.2) rotate(14deg); opacity: 0; }
        }
        /* step 2 — open */
        @keyframes ps-seam  { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 1; } }
        @keyframes ps-shut-up   { from { transform: translateY(0); } to { transform: translateY(-104%); } }
        @keyframes ps-shut-down { from { transform: translateY(0); } to { transform: translateY(104%); } }
        @keyframes ps-hide  { from { opacity: 1; } to { opacity: 0; } }
        @keyframes ps-up    { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @keyframes ps-sweep { from { transform: translateX(-200%) skewX(-22deg); } to { transform: translateX(700%) skewX(-22deg); } }
      `}</style>

      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <filter id="ps-glow-f" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
      </svg>

      {/* ============================ HEADER ============================ */}
      <motion.div
        className="absolute left-[120px] right-[120px] top-[44px] flex items-end justify-between z-30"
        initial={{ opacity: 0, x: -60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="relative flex items-stretch">
          <div className="w-[150px] h-[150px] flex items-center justify-center" style={{ background: themeGrad, clipPath: CUT_BOLT }}>
            {tournament.torLogo ? (
              <img src={tournament.torLogo} alt="" className="w-[96px] h-[96px] object-contain -ml-[14px]" />
            ) : (
              <Bolt size={58} color="#fff" className="-ml-[14px]" />
            )}
          </div>
          <div className="relative bg-white pl-[34px] pr-[90px] flex flex-col justify-center -ml-[18px]" style={{ clipPath: CUT_HEAD }}>
            <div className="flex items-center gap-[10px]">
              <Bolt size={18} color={primary} />
              <span className="font-[AGENCYB] text-[1.6rem] tracking-[0.16em] uppercase text-[#5b5f68] whitespace-nowrap">{tournament.tournamentName}</span>
            </div>
            <div className="font-bebas leading-[0.9] text-[6.2rem] tracking-[0.02em] flex gap-[18px] whitespace-nowrap">
              <span
                style={{
                  background: themeGrad,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                PLAYERS
              </span>
              <span style={{ color: INK }}>SUMMARY</span>
            </div>
            <div className="absolute left-[34px] right-[90px] bottom-[14px] h-[5px] origin-left" style={{ background: themeGrad, animation: 'ps-line .9s .3s ease-out both' }} />
          </div>
        </div>

        <div className="flex flex-col items-end gap-[10px] pb-[8px]">
          <div className="h-[58px] pl-[54px] pr-[34px] flex items-center gap-[14px] text-white" style={{ background: themeGrad, clipPath: CUT_TAG }}>
            <Bolt size={20} color="#fff" />
            <span className="font-[AGENCYB] text-[2.2rem] tracking-[0.08em] leading-none uppercase whitespace-nowrap">{round?.roundName || 'MATCH'}</span>
          </div>
          <div
            className="h-[40px] px-[26px] flex items-center gap-[10px] bg-white font-[Righteous] text-[1.15rem] tracking-[0.2em] uppercase"
            style={{ clipPath: CUT_CHIP, color: INK, animation: 'ps-flicker 6s 2s infinite' }}
          >
            <Bolt size={11} color={primary} />
            {matchNo ? `MATCH ${matchNo}` : match?.matchName || 'THIS MATCH'}
          </div>
        </div>
      </motion.div>

      {/* ============================ CARDS ============================ */}
      {shown.length > 0 ? (
        <div className="absolute flex" style={{ top: 252, left: (1920 - rowW) / 2, gap: CARD_GAP }}>
          {shown.map((c, index) => (
            <CategoryCard
              key={c.title}
              title={c.title}
              short={c.short}
              unit={c.unit}
              value={Number((c.player as any)[c.valueKey]) || 0}
              player={c.player}
              index={index}
              primary={primary}
              secondary={secondary}
              themeGrad={themeGrad}
            />
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="px-[48px] py-[18px] bg-white text-[#111] text-[2rem] font-bebas tracking-[0.12em]" style={{ clipPath: CUT_ROW, borderLeft: `8px solid ${primary}` }}>
            NO PLAYER DATA AVAILABLE
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchFragrs;