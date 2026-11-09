import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
import { TeamLogo } from '../../shared/components/TeamLogo';
// NOTE: no own fetch – PublicThemeRenderer passes overallData / matchDatas down.

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

interface Player {
  _id: string;
  playerName: string;
  killNum?: number;
  damage?: number | string;
  assists?: number;
  knockouts?: number;
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
  wwcd?: number;
  players: Player[];
}

interface OverallData {
  tournamentId: string;
  roundId: string;
  userId: string;
  teams: Team[];
  createdAt: string;
}

interface EventMvpProps {
  tournament: Tournament;
  round?: Round | null;
  overallData?: OverallData | null;
  matches?: any[];
  matchDatas?: any[];
}

/* ------------------------------------------------------------------ */
/* Helpers (same visual language as the other overlays)                */
/* ------------------------------------------------------------------ */

const DEFAULT_CHAR = '/def_char.avif';

const onPicError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_CHAR)) img.src = DEFAULT_CHAR;
};

const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const fmt = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : '0';
};

const CUT_ROW = 'polygon(22px 0, 100% 0, calc(100% - 22px) 100%, 0 100%)';
const CUT_BOLT = 'polygon(0 0, 100% 0, 84% 46%, 96% 46%, 78% 100%, 0 100%)';
const CUT_CHIP = 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)';
const CUT_HEAD = 'polygon(0 0, 100% 0, calc(100% - 40px) 100%, 0 100%)';
const CUT_TAG = 'polygon(26px 0, 100% 0, 100% 100%, 0 100%, 14px 50%)';
const CUT_CARD = 'polygon(0 0, calc(100% - 46px) 0, 100% 46px, 100% 100%, 34px 100%, 0 calc(100% - 34px))';
/* Stage: jagged lightning left edge */
const CUT_STAGE =
  'polygon(14% 0, 100% 0, 100% 100%, 0 100%, 9% 72%, 4% 72%, 12% 44%, 7% 44%, 16% 14%, 11% 14%)';

const Bolt: React.FC<{ size?: number; color: string; className?: string; style?: React.CSSProperties }> = ({
  size = 28,
  color,
  className,
  style,
}) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" className={className} style={style} aria-hidden>
    <path d="M13 0 L2 16 H9 L6 28 L18 10 H11 L15 0 Z" fill={color} />
  </svg>
);

const Crown: React.FC<{ size?: number; color: string }> = ({ size = 40, color }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
    <rect x="6" y="27" width="28" height="3" fill={color} />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const EventMvp: React.FC<EventMvpProps> = ({ tournament, round, matchDatas = [] }) => {
  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

  // MVP selected by the shared Fragger Score, pooled from matchDatas
  // (keyed by player identity, so no duplicate entries).
  const mvp = useMemo(() => {
    if (matchDatas.length === 0) return null;
    const scored = computeFraggerScores(buildFraggerPool(matchDatas)).sort(compareFraggerScore);
    if (scored.length === 0) return null;
    const top: any = scored[0];
    return {
      ...top,
      killNum: top.totalKills,
      numericDamage: top.totalDamage,
      assists: top.totalAssists,
      knockouts: top.totalKnockouts,
    };
  }, [matchDatas]);

  if (matchDatas.length === 0 || !mvp) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div
          className="px-[48px] py-[18px] bg-white text-[#111] text-[2rem] font-bebas tracking-[0.12em]"
          style={{ clipPath: CUT_ROW, borderLeft: `8px solid ${primary}` }}
        >
          NO OVERALL DATA AVAILABLE
        </div>
      </div>
    );
  }

  const subStats = [
    { label: 'DAMAGE', value: fmt(mvp.numericDamage) },
    { label: 'ASSISTS', value: fmt(mvp.assists) },
    { label: 'KNOCKS', value: fmt(mvp.knockouts) },
  ];

  const ease = [0.2, 0.9, 0.25, 1] as const;

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden select-none">
      <style>{`
        @keyframes mvp-sweep {
          0%   { transform: translateX(-200%) skewX(-22deg); }
          55%, 100% { transform: translateX(1200%) skewX(-22deg); }
        }
        @keyframes mvp-glow {
          0%, 100% { filter: drop-shadow(0 0 10px ${withAlpha(primary, 0.5)}); }
          50%      { filter: drop-shadow(0 0 34px ${withAlpha(primary, 0.95)}); }
        }
        @keyframes mvp-line { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes mvp-flicker {
          0%, 86%, 100% { opacity: 1; }
          87% { opacity: .15; } 88% { opacity: 1; }
          90% { opacity: .45; } 91% { opacity: 1; }
        }
        @keyframes mvp-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes mvp-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1);   opacity: .75; }
          50%      { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
        }
        @keyframes mvp-float {
          0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); }
        }
        @keyframes mvp-breathe {
          0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-6px) scale(1.01); }
        }
      `}</style>

      {/* ============================ STAGE (right) ============================ */}
      <motion.div
        className="absolute top-0 bottom-0 right-0 w-[1080px] overflow-hidden"
        style={{ clipPath: CUT_STAGE, background: themeGrad }}
        initial={{ opacity: 0, x: 200 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease }}
      >
        {/* stripes */}
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: 'repeating-linear-gradient(-55deg, #fff 0 2px, transparent 2px 28px)' }}
        />
        {/* dark floor fade */}
        <div
          className="absolute inset-x-0 bottom-0 h-[45%]"
          style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.55), transparent)' }}
        />
        {/* giant MVP watermark */}
        <div
          className="absolute right-[-20px] top-[40px] font-bebas leading-[0.8] text-[30rem] tracking-[-0.02em]"
          style={{ color: 'transparent', WebkitTextStroke: '3px rgba(255,255,255,0.22)' }}
        >
          MVP
        </div>
        {/* rotating rays */}
        <div
          className="absolute left-[56%] top-[46%] w-[1500px] h-[1500px]"
          style={{
            background:
              'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.13) 0deg 6deg, transparent 6deg 22deg)',
            maskImage: 'radial-gradient(circle, #000 0%, transparent 62%)',
            WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 62%)',
            animation: 'mvp-spin 60s linear infinite',
            transform: 'translate(-50%, -50%)',
          }}
        />
        {/* halo */}
        <div
          className="absolute left-[56%] top-[44%] w-[720px] h-[720px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 45%, transparent 70%)',
            animation: 'mvp-pulse 4s ease-in-out infinite',
            transform: 'translate(-50%, -50%)',
          }}
        />
        {/* floating bolts */}
        {[
          { l: '22%', t: '18%', s: 46, d: 0 },
          { l: '86%', t: '30%', s: 34, d: 0.8 },
          { l: '30%', t: '62%', s: 28, d: 1.6 },
        ].map((b, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: b.l, top: b.t, animation: `mvp-float 3.4s ${b.d}s ease-in-out infinite` }}
          >
            <Bolt size={b.s} color="#fff" style={{ opacity: 0.85, animation: `mvp-flicker ${3 + i}s infinite` }} />
          </div>
        ))}
        {/* sweep */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-[140px]"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
            animation: 'mvp-sweep 7s 2s ease-in-out infinite',
          }}
        />
      </motion.div>

      {/* player render */}
      <motion.div
        className="absolute bottom-0 right-[40px] w-[900px] h-[1020px] flex items-end justify-center z-10"
        initial={{ opacity: 0, y: 160, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.35, duration: 0.8, ease }}
      >
        <img
          src={mvp.picUrl?.trim() || DEFAULT_CHAR}
          onError={onPicError}
          alt=""
          className="object-contain object-bottom w-full h-full"
          style={{
            filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.55))',
            animation: 'mvp-breathe 5s 1.2s ease-in-out infinite',
          }}
        />
      </motion.div>

      {/* MVP medal on stage */}
      <motion.div
        className="absolute right-[90px] bottom-[90px] z-20 flex items-stretch"
        style={{ animation: 'mvp-glow 2.8s ease-in-out infinite' }}
        initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: 1.1, duration: 0.5, ease }}
      >
        <div
          className="w-[96px] h-[96px] bg-white flex items-center justify-center"
          style={{ clipPath: CUT_BOLT }}
        >
          <Crown size={48} color={primary} />
        </div>
        <div
          className="-ml-[14px] h-[96px] pl-[34px] pr-[40px] flex flex-col justify-center bg-[#0d0f13] text-white"
          style={{ clipPath: CUT_CHIP }}
        >
          <span className="font-[Righteous] text-[0.95rem] tracking-[0.3em]" style={{ color: primary }}>
            EVENT
          </span>
          <span className="font-bebas text-[3.6rem] leading-[0.85]">MVP</span>
        </div>
      </motion.div>

      {/* ============================ LEFT COLUMN ============================ */}
      <div className="absolute left-[120px] top-[44px] w-[800px] z-20">
        {/* Header */}
        <motion.div
          className="relative flex items-stretch"
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div
            className="w-[150px] h-[150px] flex items-center justify-center"
            style={{ background: themeGrad, clipPath: CUT_BOLT }}
          >
            {tournament.torLogo ? (
              <img src={tournament.torLogo} alt="" className="w-[96px] h-[96px] object-contain -ml-[14px]" />
            ) : (
              <Crown size={70} color="#fff" />
            )}
          </div>
          <div
            className="relative bg-white pl-[34px] pr-[90px] flex flex-col justify-center -ml-[18px]"
            style={{ clipPath: CUT_HEAD }}
          >
            <div className="flex items-center gap-[10px]">
              <Bolt size={18} color={primary} />
              <span className="font-[AGENCYB] text-[1.6rem] tracking-[0.16em] uppercase text-[#5b5f68]">
                {tournament.tournamentName}
              </span>
            </div>
            <div className="font-bebas leading-[0.9] text-[6.6rem] tracking-[0.02em] flex gap-[18px]">
              <span className="text-[#0d0f13]">EVENT</span>
              <span
                style={{
                  background: themeGrad,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                MVP
              </span>
            </div>
            <div
              className="absolute left-[34px] right-[90px] bottom-[14px] h-[5px] origin-left"
              style={{ background: themeGrad, animation: 'mvp-line .9s .3s ease-out both' }}
            />
          </div>
        </motion.div>

        {/* Round tag */}
        <motion.div
          className="mt-[18px] flex items-center gap-[12px]"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: 'easeOut' }}
        >
          <div
            className="h-[52px] pl-[50px] pr-[32px] flex items-center gap-[12px] text-white"
            style={{ background: themeGrad, clipPath: CUT_TAG }}
          >
            <Bolt size={18} color="#fff" />
            <span className="font-[AGENCYB] text-[2rem] tracking-[0.08em] leading-none">
              {round?.roundName || 'No Round'}
            </span>
          </div>
          <div
            className="h-[52px] px-[26px] flex items-center bg-white text-[#0d0f13] font-[Righteous] text-[1.05rem] tracking-[0.22em]"
            style={{ clipPath: CUT_CHIP }}
          >
            MOST VALUABLE PLAYER
          </div>
        </motion.div>

        {/* Identity card */}
        <motion.div
          className="relative mt-[44px]"
          style={{ animation: 'mvp-glow 2.8s 1s ease-in-out infinite' }}
          initial={{ opacity: 0, x: -120, skewX: -10 }}
          animate={{ opacity: 1, x: 0, skewX: 0 }}
          transition={{ delay: 0.35, duration: 0.6, ease }}
        >
          <div
            className="relative h-[200px] flex items-stretch overflow-hidden"
            style={{ clipPath: CUT_CARD, background: 'linear-gradient(90deg, #ffffff 0%, #eef0f3 100%)' }}
          >
            {/* logo plate */}
            <div className="relative w-[200px] flex items-center justify-center" style={{ background: themeGrad }}>
              <div
                className="absolute inset-0 opacity-[0.14]"
                style={{ backgroundImage: 'repeating-linear-gradient(-55deg, #fff 0 2px, transparent 2px 18px)' }}
              />
              <div className="relative w-[130px] h-[130px] bg-white p-[14px] flex items-center justify-center" style={{ clipPath: CUT_CHIP }}>
                <TeamLogo
                  logo={mvp.teamLogo}
                  flag={mvp.teamFlag}
                  alt={mvp.teamTag}
                  className="object-contain max-w-full max-h-full"
                />
              </div>
            </div>

            {/* name */}
            <div className="relative flex-1 min-w-0 flex flex-col justify-center pl-[40px] pr-[60px]">
              <div
                className="absolute left-[22px] top-[44px] bottom-[44px] w-[7px]"
                style={{ background: themeGrad, transform: 'skewX(-18deg)' }}
              />
              <div className="font-[Righteous] text-[1.05rem] tracking-[0.26em] uppercase" style={{ color: primary }}>
                {mvp.teamName}
              </div>
              <div className="font-[AGENCYB] text-[5.4rem] leading-[0.95] text-[#0d0f13] uppercase truncate">
                {mvp.playerName}
              </div>
            </div>

            {/* sweep */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-[120px]"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                mixBlendMode: 'overlay',
                animation: 'mvp-sweep 6s 1.8s ease-in-out infinite',
              }}
            />
          </div>
        </motion.div>

        {/* Kills – hero stat */}
        <motion.div
          className="mt-[26px]"
          initial={{ opacity: 0, x: -120, skewX: -10 }}
          animate={{ opacity: 1, x: 0, skewX: 0 }}
          transition={{ delay: 0.55, duration: 0.6, ease }}
        >
          <div className="h-[150px] flex items-stretch overflow-hidden" style={{ clipPath: CUT_ROW, background: themeGrad }}>
            <div
              className="w-[300px] flex flex-col justify-center pl-[48px] text-white"
              style={{ background: 'rgba(0,0,0,0.3)', clipPath: 'polygon(0 0, 100% 0, 84% 100%, 0 100%)' }}
            >
              <span className="font-[Righteous] text-[1rem] tracking-[0.3em] opacity-80">TOTAL</span>
              <span className="font-[AGENCYB] text-[3.4rem] leading-none tracking-[0.06em]">KILLS</span>
            </div>
            <div className="flex-1 flex items-center justify-end pr-[64px] gap-[18px]">
              <Bolt size={34} color="rgba(255,255,255,0.9)" style={{ animation: 'mvp-flicker 3.5s infinite' }} />
              <span className="font-bebas text-[9rem] leading-none text-white pt-[14px]">{fmt(mvp.killNum)}</span>
            </div>
          </div>
        </motion.div>

        {/* Sub stats */}
        <div className="mt-[18px] grid grid-cols-3 gap-[16px]">
          {subStats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 60, skewX: -10 }}
              animate={{ opacity: 1, y: 0, skewX: 0 }}
              transition={{ delay: 0.75 + i * 0.12, duration: 0.5, ease }}
            >
              <div
                className="relative h-[160px] flex flex-col items-center justify-center overflow-hidden"
                style={{ clipPath: CUT_CARD, background: 'linear-gradient(180deg, #ffffff 0%, #eef0f3 100%)' }}
              >
                <div className="absolute top-0 left-0 right-0 h-[8px]" style={{ background: themeGrad }} />
                <span className="font-bebas text-[5.2rem] leading-none text-[#0d0f13] pt-[16px]">{s.value}</span>
                <span
                  className="mt-[4px] h-[34px] px-[22px] flex items-center font-[AGENCYB] text-[1.5rem] tracking-[0.14em] text-white"
                  style={{ background: '#0d0f13', clipPath: CUT_CHIP }}
                >
                  {s.label}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Bottom accent */}
      <div
        className="absolute left-[120px] w-[800px] bottom-[30px] h-[6px] origin-left z-20"
        style={{ background: themeGrad, clipPath: CUT_ROW, animation: 'mvp-line 1.2s .6s ease-out both' }}
      />
    </div>
  );
};

export default EventMvp;