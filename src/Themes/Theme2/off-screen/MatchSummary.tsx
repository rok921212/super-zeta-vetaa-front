import React, { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { computeMatchTotals } from '../../shared/hooks/matchTotals';
// NOTE: no socket here — PublicThemeRenderer owns the single connection and
// passes freshly-merged `matchData` down as a prop.

/* -------------------- Interfaces -------------------- */

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
}

interface Player {
  _id: string;
  playerName: string;
  killNum?: number;
  knockouts?: number;
  damage?: number;
  headShotNum?: number;
  gotAirDropNum?: number;
  killNumByGrenade?: number;
  heal?: number;
  rescueTimes?: number;
  maxKillDistance?: number;
  survivalTime?: number;
}

interface Team {
  _id: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
  teamName: string;
  slot?: number;
  placePoints: number;
  players: Player[];
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

/* -------------------- Visual language -------------------- */

const INK = '#0d0f13';
const TILE_W = 399;
const TILE_H = 330;
const BAND_H = 150;
const GAP_X = 28;
const GAP_Y = 32;
const TILE_STAGGER = 0.14; // s between tiles

const CUT_BOLT = 'polygon(0 0, 100% 0, 84% 46%, 96% 46%, 78% 100%, 0 100%)';
const CUT_CHIP = 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)';
const CUT_HEAD = 'polygon(0 0, 100% 0, calc(100% - 40px) 100%, 0 100%)';
const CUT_TAG = 'polygon(26px 0, 100% 0, 100% 100%, 0 100%, 14px 50%)';
const CUT_ROW = 'polygon(22px 0, 100% 0, calc(100% - 22px) 100%, 0 100%)';
const CUT_TILE = 'polygon(0 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 24px 100%, 0 calc(100% - 24px))';

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

const electric = (primary: string, speed: number): React.CSSProperties => ({
  backgroundColor: primary,
  backgroundImage: 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
  backgroundSize: '200% 100%',
  animation: `msum-run ${speed}s linear infinite`,
  boxShadow: `0 0 10px ${withAlpha(primary, 0.85)}`,
});

/** Rolls a number up from 0 (or from its last value), straight on the DOM. */
const CountUp: React.FC<{ value: number; delay: number; duration?: number }> = ({ value, delay, duration = 1100 }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const to = Number(value) || 0;
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
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString();
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

/* -------------------- Stat tile -------------------- */

interface TileProps {
  header: string;
  value: number;
  suffix?: string;
  image?: string;
  index: number;
  featured?: boolean;
  primary: string;
  secondary: string;
  themeGrad: string;
}

const StatTile: React.FC<TileProps> = ({ header, value, suffix, image, index, featured, primary, secondary, themeGrad }) => {
  const d = 0.55 + index * TILE_STAGGER; // tile start
  const open = d + 0.35; // after the strike lands
  const boltPath = 'M232 -10 L214 30 L230 36 L200 84 L218 90 L192 142';

  return (
    <motion.div
      className="relative"
      style={{
        width: TILE_W,
        height: TILE_H,
        animation: `msum-glow ${featured ? 2.6 : 3.8}s ${open + 1 + index * 0.2}s ease-in-out infinite`,
      }}
      initial={{ opacity: 0, y: 60, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: d, duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
    >
      <div className="relative w-full h-full overflow-hidden" style={{ clipPath: CUT_TILE, background: 'linear-gradient(180deg, #ffffff 0%, #eef0f3 100%)' }}>
        {/* ═══ storm band with icon ═══ */}
        <div
          className="absolute left-0 right-0 top-0 overflow-hidden"
          style={{
            height: BAND_H,
            background: `radial-gradient(ellipse 70% 100% at 60% -10%, ${withAlpha(primary, 0.75)} 0%, transparent 65%),
                         linear-gradient(165deg, #06070b 0%, ${withAlpha(secondary, 0.95)} 55%, ${primary} 150%)`,
          }}
        >
          <div className="absolute inset-0 opacity-[0.1]" style={{ background: 'repeating-linear-gradient(-60deg, #fff 0 2px, transparent 2px 20px)' }} />

          {/* entrance strike */}
          <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${TILE_W} ${BAND_H}`} preserveAspectRatio="none" aria-hidden>
            <g style={{ opacity: 0, animation: `msum-strike .8s ${d + 0.05}s both linear` }}>
              <path d={boltPath} fill="none" stroke={primary} strokeWidth="11" filter="url(#msum-glow-f)" pathLength={1} strokeDasharray="1" style={{ strokeDashoffset: 1, animation: `msum-draw .25s ${d + 0.05}s ease-out both` }} />
              <path d={boltPath} fill="none" stroke="#fff" strokeWidth="2.8" strokeLinejoin="miter" pathLength={1} strokeDasharray="1" style={{ strokeDashoffset: 1, animation: `msum-draw .25s ${d + 0.05}s ease-out both` }} />
            </g>
            {/* later: the occasional strike, each tile on its own slow clock */}
            <g style={{ opacity: 0, animation: `msum-bolt ${6 + (index % 4) * 1.3}s ${open + 2.5 + index * 0.9}s linear infinite` }}>
              <path d="M320 -10 L302 26 L316 32 L292 76 L308 82 L286 124" fill="none" stroke={primary} strokeWidth="9" filter="url(#msum-glow-f)" />
              <path d="M320 -10 L302 26 L316 32 L292 76 L308 82 L286 124" fill="none" stroke="#fff" strokeWidth="2.2" />
            </g>
          </svg>
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 55% 55%, #fff 0%, ${withAlpha(primary, 0.55)} 30%, transparent 65%)`,
              opacity: 0,
              animation: `msum-flash .5s ${d + 0.25}s ease-out both`,
            }}
          />

          {/* icon — struck, then settles with a soft glow pulse */}
          {image && (
            <div
              className="absolute left-1/2 top-1/2 w-[118px] h-[118px]"
              style={{ animation: `msum-icon .6s ${d + 0.25}s cubic-bezier(.2,.9,.25,1) both` }}
            >
              <img
                src={image}
                alt=""
                className="w-full h-full object-contain"
                style={{ animation: `msum-iconglow 3.2s ${open + 0.6 + index * 0.25}s ease-in-out infinite` }}
              />
            </div>
          )}

          {/* index mark */}
          <div className="absolute left-[16px] top-[10px] font-bebas text-[1.6rem] leading-none text-white/40">
            {String(index + 1).padStart(2, '0')}
          </div>

          <div className="absolute left-0 right-0 bottom-0 h-[4px]" style={electric(primary, 3.4 + (index % 3) * 0.6)} />
        </div>

        {/* ═══ body: label + value (wipes in after the strike) ═══ */}
        <div
          className="absolute left-0 right-0 bottom-0 flex flex-col items-center justify-center"
          style={{
            top: BAND_H + 4,
            background: featured ? themeGrad : undefined,
            animation: `msum-wipe .5s ${open}s cubic-bezier(.2,.9,.25,1) both`,
          }}
        >
          {!featured && (
            <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${withAlpha(primary, 0.12)} 0%, transparent 55%)` }} />
          )}
          <div
            className="relative font-bebas leading-[0.85] pt-[8px]"
            style={{
              fontSize: '6.2rem',
              color: featured ? '#fff' : INK,
              textShadow: featured ? '0 0 18px rgba(255,255,255,0.45)' : undefined,
            }}
          >
            <CountUp value={value} delay={open + 0.15} />
            {suffix && <span className="text-[3.4rem] ml-[4px]" style={{ color: featured ? 'rgba(255,255,255,0.85)' : primary }}>{suffix}</span>}
          </div>
          <div
            className="relative mt-[8px] h-[34px] pl-[16px] pr-[20px] flex items-center gap-[8px] font-[AGENCYB] font-bold text-[1.25rem] tracking-[0.16em] whitespace-nowrap"
            style={{
              background: featured ? 'rgba(255,255,255,0.95)' : INK,
              color: featured ? INK : '#fff',
              clipPath: CUT_CHIP,
            }}
          >
            <Bolt size={11} color={primary} />
            {header}
          </div>

          {/* one pass of light */}
          <div
            className="absolute top-0 bottom-0 w-[90px] pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)',
              transform: 'translateX(-200%) skewX(-22deg)',
              animation: `msum-sweep 1s ${open + 0.5}s ease-in-out both`,
              mixBlendMode: featured ? 'overlay' : 'normal',
            }}
          />
        </div>

        <div className="absolute left-[24px] right-0 bottom-0 h-[4px]" style={electric(primary, 5 + (index % 2))} />
      </div>
    </motion.div>
  );
};

/* -------------------- Main Component -------------------- */

const MatchSummary: React.FC<MatchSummaryProps> = ({ tournament, round, match, matchData }) => {
  const localMatchData = matchData ?? null;

  const stats = useMemo(() => computeMatchTotals(localMatchData), [localMatchData]);

  const statBoxes: { header: string; value: number; suffix?: string; image: string; featured?: boolean }[] = [
    { header: 'TOTAL ELIMS', value: Number(stats?.totalElims) || 0, image: '/theme4assets/total elims.webp', featured: true },
    { header: 'TOTAL KNOCKS', value: Number(stats?.totalKnocks) || 0, image: '/theme4assets/knoc.png' },
    { header: 'HEADSHOTS', value: Number(stats?.totalHeadshots) || 0, image: '/theme4assets/headshot.webp' },
    { header: 'GRENADE KILLS', value: Number(stats?.totalGrenadeKills) || 0, image: '/theme4assets/grenade.webp' },
    { header: 'TOTAL DAMAGE', value: Math.round(Number(stats?.totalDamage) || 0), image: '/theme4assets/totaldamages.webp', featured: true },
    { header: 'LONGEST ELIM', value: Math.round(Number(stats?.longestDistElim) || 0), suffix: 'M', image: '/theme4assets/longest dist elims.webp' },
    { header: 'AIRDROPS LOOTED', value: Number(stats?.totalAirdrops) || 0, image: '/theme4assets/airdrop.webp' },
    { header: 'TOTAL HEALS', value: Math.round(Number(stats?.totalHeals) || 0), image: '/theme4assets/health.webp' },
  ];

  const primary = tournament?.primaryColor || '#E10600';
  const secondary = tournament?.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

  const gridW = 4 * TILE_W + 3 * GAP_X;

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden select-none">
      <style>{`
        @keyframes msum-run   { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        @keyframes msum-line  { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes msum-glow  {
          0%, 100% { filter: drop-shadow(0 0 6px ${withAlpha(primary, 0.4)}); }
          50%      { filter: drop-shadow(0 0 22px ${withAlpha(primary, 0.85)}); }
        }
        @keyframes msum-draw   { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes msum-strike { 0% { opacity: 1; } 22% { opacity: .2; } 36% { opacity: 1; } 60% { opacity: .45; } 100% { opacity: 0; } }
        @keyframes msum-flash  { 0% { opacity: 0; } 18% { opacity: .9; } 100% { opacity: 0; } }
        @keyframes msum-icon   {
          0%   { transform: translate(-50%,-50%) scale(.3) rotate(-14deg); opacity: 0; filter: brightness(2.4); }
          60%  { transform: translate(-50%,-50%) scale(1.14) rotate(3deg); opacity: 1; filter: brightness(1.6); }
          100% { transform: translate(-50%,-50%) scale(1) rotate(0); opacity: 1; filter: brightness(1); }
        }
        @keyframes msum-iconglow {
          0%, 100% { filter: drop-shadow(0 6px 10px rgba(0,0,0,.5)); }
          50%      { filter: drop-shadow(0 0 16px ${withAlpha(primary, 0.95)}) drop-shadow(0 0 4px #fff); }
        }
        @keyframes msum-wipe  { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
        @keyframes msum-sweep { from { transform: translateX(-200%) skewX(-22deg); } to { transform: translateX(700%) skewX(-22deg); } }
        @keyframes msum-bolt  {
          0%, 100% { opacity: 0; }
          2% { opacity: 1; } 4% { opacity: .15; } 6.5% { opacity: 1; } 9% { opacity: .4; } 12% { opacity: 0; }
        }
        @keyframes msum-flicker {
          0%, 88%, 100% { opacity: 1; }
          89% { opacity: .25; } 90% { opacity: 1; }
          92% { opacity: .5; }  93% { opacity: 1; }
        }
      `}</style>

      {/* shared glow filter */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <filter id="msum-glow-f" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
      </svg>

      {/* ============================ HEADER ============================ */}
      <motion.div
        className="absolute left-[120px] right-[120px] top-[44px] flex items-end justify-between z-20"
        initial={{ opacity: 0, x: -60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="relative flex items-stretch">
          <div className="w-[150px] h-[150px] flex items-center justify-center" style={{ background: themeGrad, clipPath: CUT_BOLT }}>
            {tournament?.torLogo ? (
              <img src={tournament.torLogo} alt="" className="w-[96px] h-[96px] object-contain -ml-[14px]" />
            ) : (
              <Bolt size={58} color="#fff" className="-ml-[14px]" />
            )}
          </div>
          <div className="relative bg-white pl-[34px] pr-[90px] flex flex-col justify-center -ml-[18px]" style={{ clipPath: CUT_HEAD }}>
            <div className="flex items-center gap-[10px]">
              <Bolt size={18} color={primary} />
              <span className="font-[AGENCYB] text-[1.6rem] tracking-[0.16em] uppercase text-[#5b5f68] whitespace-nowrap">
                {tournament?.tournamentName}
              </span>
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
                MATCH
              </span>
              <span style={{ color: INK }}>SUMMARY</span>
            </div>
            <div
              className="absolute left-[34px] right-[90px] bottom-[14px] h-[5px] origin-left"
              style={{ background: themeGrad, animation: 'msum-line .9s .3s ease-out both' }}
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-[10px] pb-[8px]">
          <div className="h-[58px] pl-[54px] pr-[34px] flex items-center gap-[14px] text-white" style={{ background: themeGrad, clipPath: CUT_TAG }}>
            <Bolt size={20} color="#fff" />
            <span className="font-[AGENCYB] text-[2.2rem] tracking-[0.08em] leading-none uppercase whitespace-nowrap">
              {round?.roundName || 'MATCH'}
            </span>
          </div>
          <div
            className="h-[40px] px-[26px] flex items-center gap-[10px] bg-white font-[Righteous] text-[1.15rem] tracking-[0.2em] uppercase"
            style={{ clipPath: CUT_CHIP, color: INK, animation: 'msum-flicker 6s 2s infinite' }}
          >
            <Bolt size={11} color={primary} />
            {match?.matchNo ? `MATCH ${match.matchNo}` : match?.matchName || 'THIS MATCH'}
          </div>
        </div>
      </motion.div>

      {/* ============================ TILES ============================ */}
      {localMatchData ? (
        <div
          className="absolute grid grid-cols-4"
          style={{ top: 268, left: (1920 - gridW) / 2, width: gridW, columnGap: GAP_X, rowGap: GAP_Y }}
        >
          {statBoxes.map((s, i) => (
            <StatTile
              key={s.header}
              header={s.header}
              value={s.value}
              suffix={s.suffix}
              image={s.image}
              index={i}
              featured={s.featured}
              primary={primary}
              secondary={secondary}
              themeGrad={themeGrad}
            />
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="px-[48px] py-[18px] bg-white text-[#111] text-[2rem] font-bebas tracking-[0.12em]"
            style={{ clipPath: CUT_ROW, borderLeft: `8px solid ${primary}` }}
          >
            NO MATCH DATA
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchSummary;