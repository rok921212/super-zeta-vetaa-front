import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { pickStandingTeam } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
// NOTE: no own fetch – PublicThemeRenderer passes `overallData` down.

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

interface MatchData {
  _id: string;
  teams: Team[];
}

interface ChampionsProps {
  tournament: Tournament;
  round?: Round | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matchDatas?: MatchData[];
}

/* ------------------------------------------------------------------ */
/* Helpers (same visual language as OverAllData / OverallFrags)        */
/* ------------------------------------------------------------------ */

const DEFAULT_CHAR = '/def_char.avif';

/** Swap a broken / empty player pic for the default render (once). */
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

const CUT_ROW = 'polygon(22px 0, 100% 0, calc(100% - 22px) 100%, 0 100%)';
const CUT_BOLT = 'polygon(0 0, 100% 0, 84% 46%, 96% 46%, 78% 100%, 0 100%)';
const CUT_CHIP = 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)';
const CUT_HEAD = 'polygon(0 0, 100% 0, calc(100% - 40px) 100%, 0 100%)';
const CUT_TAG = 'polygon(26px 0, 100% 0, 100% 100%, 0 100%, 14px 50%)';
const CUT_CARD = 'polygon(0 0, calc(100% - 46px) 0, 100% 46px, 100% 100%, 34px 100%, 0 calc(100% - 34px))';
const CUT_STAGE =
  'polygon(0 6%, 40% 0, 46% 7%, 58% 2%, 100% 0, 100% 100%, 0 100%)';

const Bolt: React.FC<{ size?: number; color: string; className?: string }> = ({
  size = 28,
  color,
  className,
}) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" className={className} aria-hidden>
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

const Champions: React.FC<ChampionsProps> = ({ tournament, round, overallData, matchDatas = [] }) => {
  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

  // Shared standings pick (Total Score primary). row 0 = champion.
  const champion: any = useMemo(
    () => pickStandingTeam(matchDatas as any, overallData as any, 0),
    [overallData, matchDatas]
  );

  if (!overallData || !champion) {
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

  const players: Player[] = (champion.players || []).slice(0, 4);

  const stats = [
    { label: 'WWCD', value: champion.wwcd || 0, suffix: '' },
    { label: 'PLACE', value: champion.placePoints || 0, suffix: 'PTS' },
    { label: 'KILLS', value: champion.totalKills || 0, suffix: 'PTS' },
    { label: 'TOTAL', value: champion.total || 0, suffix: 'PTS', hero: true },
  ];

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden select-none">
      <style>{`
        @keyframes ch-sweep {
          0%   { transform: translateX(-200%) skewX(-22deg); }
          55%, 100% { transform: translateX(900%) skewX(-22deg); }
        }
        @keyframes ch-glow {
          0%, 100% { filter: drop-shadow(0 0 10px ${withAlpha(primary, 0.5)}); }
          50%      { filter: drop-shadow(0 0 34px ${withAlpha(primary, 0.95)}); }
        }
        @keyframes ch-line {
          from { transform: scaleX(0); } to { transform: scaleX(1); }
        }
        @keyframes ch-flicker {
          0%, 88%, 100% { opacity: 1; }
          89% { opacity: .2; } 90% { opacity: 1; }
          92% { opacity: .5; } 93% { opacity: 1; }
        }
        @keyframes ch-beam {
          0%, 100% { opacity: .35; } 50% { opacity: .7; }
        }
      `}</style>

      {/* ============================ HEADER ============================ */}
      <motion.div
        className="absolute left-[120px] right-[120px] top-[44px] flex items-end justify-between z-20"
        initial={{ opacity: 0, x: -60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="relative flex items-stretch">
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
            <div
              className="font-bebas leading-[0.9] text-[6.6rem] tracking-[0.02em]"
              style={{
                background: themeGrad,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              CHAMPIONS
            </div>
            <div
              className="absolute left-[34px] right-[90px] bottom-[14px] h-[5px] origin-left"
              style={{ background: themeGrad, animation: 'ch-line .9s .3s ease-out both' }}
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-[10px] pb-[8px]">
          <div
            className="h-[58px] pl-[54px] pr-[34px] flex items-center gap-[14px] text-white"
            style={{ background: themeGrad, clipPath: CUT_TAG }}
          >
            <Bolt size={20} color="#fff" />
            <span className="font-[AGENCYB] text-[2.2rem] tracking-[0.08em] leading-none">
              {round?.roundName || 'No Round'}
            </span>
          </div>
          <div
            className="h-[40px] px-[26px] flex items-center gap-[10px] bg-white font-[Righteous] text-[1.15rem] tracking-[0.2em]"
            style={{ clipPath: CUT_CHIP, color: primary, animation: 'ch-flicker 4s infinite' }}
          >
            <Crown size={20} color={primary} />
            <span className="text-[#0d0f13]">WINNERS</span>
          </div>
        </div>
      </motion.div>

      {/* ======================== TEAM IDENTITY ======================== */}
      <motion.div
        className="absolute left-[120px] top-[268px] w-[500px] h-[560px] z-20"
        style={{ animation: 'ch-glow 2.8s ease-in-out infinite' }}
        initial={{ opacity: 0, x: -120, skewX: -10 }}
        animate={{ opacity: 1, x: 0, skewX: 0 }}
        transition={{ delay: 0.25, duration: 0.65, ease: [0.2, 0.9, 0.25, 1] }}
      >
        <div
          className="relative flex flex-col w-full h-full overflow-hidden"
          style={{ clipPath: CUT_CARD, background: 'linear-gradient(180deg, #ffffff 0%, #eef0f3 100%)' }}
        >
          {/* themed top half with logo */}
          <div className="relative h-[330px] flex items-center justify-center overflow-hidden" style={{ background: themeGrad }}>
            <div
              className="absolute inset-0 opacity-[0.14]"
              style={{ backgroundImage: 'repeating-linear-gradient(-55deg, #fff 0 2px, transparent 2px 22px)' }}
            />
            <div className="absolute -left-[10px] -top-[40px] font-bebas text-[18rem] leading-none text-white opacity-[0.12]">
              #1
            </div>
            <div
              className="relative w-[230px] h-[230px] bg-white flex items-center justify-center p-[22px]"
              style={{ clipPath: CUT_CARD }}
            >
              <TeamLogo
                logo={champion.teamLogo}
                flag={champion.teamFlag}
                alt=""
                className="object-contain max-w-full max-h-full"
              />
            </div>
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-[120px]"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
                animation: 'ch-sweep 5.5s 1.5s ease-in-out infinite',
              }}
            />
          </div>

          {/* name block */}
          <div className="relative flex-1 px-[34px] pt-[26px]">
            <div
              className="absolute left-[34px] top-[34px] h-[86px] w-[7px]"
              style={{ background: themeGrad, transform: 'skewX(-18deg)' }}
            />
            <div className="pl-[22px]">
              <div className="font-[Righteous] text-[1.05rem] tracking-[0.24em]" style={{ color: primary }}>
                {champion.teamTag || 'CHAMPION'}
              </div>
              <div className="font-[AGENCYB] text-[4rem] leading-[0.95] text-[#0d0f13] uppercase line-clamp-2">
                {champion.teamName}
              </div>
            </div>

            <div
              className="absolute left-[34px] right-[34px] bottom-[42px] h-[52px] flex items-center justify-center gap-[12px] text-white font-[AGENCYB] text-[1.7rem] tracking-[0.14em]"
              style={{ background: '#0d0f13', clipPath: CUT_ROW }}
            >
              <Crown size={26} color={primary} />
              CHAMPIONS
            </div>
          </div>
        </div>
      </motion.div>

      {/* ============================ STAGE ============================ */}
      <div className="absolute left-[660px] right-[120px] top-[196px] h-[694px]">
        {/* themed stage backdrop */}
        <motion.div
          className="absolute inset-x-0 bottom-0 h-[500px] overflow-hidden"
          style={{ clipPath: CUT_STAGE, background: themeGrad }}
          initial={{ opacity: 0, scaleY: 0.4 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ delay: 0.15, duration: 0.6, ease: 'easeOut' }}
        >
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{ backgroundImage: 'repeating-linear-gradient(-55deg, #fff 0 2px, transparent 2px 26px)' }}
          />
          {/* light beams */}
          {[18, 42, 66, 88].map((left, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-[90px]"
              style={{
                left: `${left}%`,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.55), transparent 85%)',
                transform: 'skewX(-14deg)',
                animation: `ch-beam 3.2s ${i * 0.4}s ease-in-out infinite`,
              }}
            />
          ))}
          <div className="absolute right-[24px] top-[30px] font-bebas text-[12rem] leading-none text-white opacity-[0.12]">
            CHAMPS
          </div>
        </motion.div>

        {/* players */}
        <div className="absolute inset-0 flex items-end justify-center">
          {players.map((p, i) => (
            <motion.div
              key={p._id || i}
              className="relative flex flex-col items-center justify-end h-full"
              style={{ width: 350, marginLeft: i === 0 ? 0 : -64, zIndex: i === 1 || i === 2 ? 3 : 2 }}
              initial={{ opacity: 0, y: 120 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.15, duration: 0.6, ease: [0.2, 0.9, 0.25, 1] }}
            >
              <img
                src={p.picUrl?.trim() || DEFAULT_CHAR}
                onError={onPicError}
                alt=""
                className="object-contain object-bottom w-full"
                style={{
                  height: i === 1 || i === 2 ? '100%' : '93%',
                  filter: `drop-shadow(0 14px 22px rgba(0,0,0,0.5))`,
                }}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* ============================ STATS ============================ */}
      <div className="absolute left-[120px] right-[120px] bottom-[60px] h-[124px] flex gap-[18px] z-20">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            className="relative flex-1"
            style={s.hero ? { animation: 'ch-glow 2.8s ease-in-out infinite' } : undefined}
            initial={{ opacity: 0, y: 60, skewX: -10 }}
            animate={{ opacity: 1, y: 0, skewX: 0 }}
            transition={{ delay: 0.9 + i * 0.12, duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
          >
            <div
              className="flex items-stretch w-full h-full overflow-hidden"
              style={{
                clipPath: CUT_ROW,
                background: s.hero ? themeGrad : 'linear-gradient(90deg, #ffffff 0%, #eef0f3 100%)',
              }}
            >
              {/* label block */}
              <div
                className="w-[44%] flex items-center justify-center font-[AGENCYB] text-[2.5rem] tracking-[0.1em] text-white"
                style={{
                  background: s.hero ? 'rgba(0,0,0,0.28)' : '#0d0f13',
                  clipPath: 'polygon(0 0, 100% 0, 82% 100%, 0 100%)',
                }}
              >
                <span className="-ml-[12px] flex items-center gap-[8px]">
                  {s.label === 'WWCD' && <Crown size={26} color={primary} />}
                  {s.label}
                </span>
              </div>
              {/* value */}
              <div className="flex-1 flex items-center justify-center gap-[10px] pr-[20px]">
                <span
                  className="font-bebas text-[5rem] leading-none pt-[10px]"
                  style={{ color: s.hero ? '#fff' : '#0d0f13' }}
                >
                  {s.value}
                </span>
                {s.suffix && (
                  <span
                    className="font-[AGENCYB] text-[1.6rem] tracking-[0.1em] self-end pb-[26px]"
                    style={{ color: s.hero ? 'rgba(255,255,255,0.85)' : primary }}
                  >
                    {s.suffix}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Bottom accent */}
      <div
        className="absolute left-[120px] right-[120px] bottom-[30px] h-[6px] origin-left"
        style={{ background: themeGrad, clipPath: CUT_ROW, animation: 'ch-line 1.2s .6s ease-out both' }}
      />
    </div>
  );
};

export default Champions;