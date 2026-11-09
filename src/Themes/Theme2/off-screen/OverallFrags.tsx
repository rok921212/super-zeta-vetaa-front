import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
import { TeamLogo } from '../../shared/components/TeamLogo';

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

/* ------------------------------------------------------------------ */
/* Helpers (same visual language as OverAllData)                       */
/* ------------------------------------------------------------------ */

const DEFAULT_CHAR = '/def_char.avif';

const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const formatSecondsToMMSS = (seconds: number = 0) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/* Lightning-style clip paths */
const CUT_ROW = 'polygon(22px 0, 100% 0, calc(100% - 22px) 100%, 0 100%)';
const CUT_BOLT = 'polygon(0 0, 100% 0, 84% 46%, 96% 46%, 78% 100%, 0 100%)';
const CUT_CHIP = 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)';
const CUT_HEAD = 'polygon(0 0, 100% 0, calc(100% - 40px) 100%, 0 100%)';
const CUT_TAG = 'polygon(26px 0, 100% 0, 100% 100%, 0 100%, 14px 50%)';
/* Card: notched top-right + angled bottom-left */
const CUT_CARD = 'polygon(0 0, calc(100% - 46px) 0, 100% 46px, 100% 100%, 34px 100%, 0 calc(100% - 34px))';
/* Photo panel: zig-zag lightning bottom edge */
const CUT_PHOTO =
  'polygon(0 0, 100% 0, 100% 86%, 62% 92%, 70% 86%, 30% 100%, 38% 92%, 0 96%)';

const Bolt: React.FC<{ size?: number; color: string; className?: string }> = ({
  size = 28,
  color,
  className,
}) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" className={className} aria-hidden>
    <path d="M13 0 L2 16 H9 L6 28 L18 10 H11 L15 0 Z" fill={color} />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const OverallFrags: React.FC<OverallFragsProps> = ({
  tournament,
  round,
  match,
  overallData,
  matchDatas = [],
}) => {
  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

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

  if (!overallData) {
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

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden select-none">
      <style>{`
        @keyframes mvp-sweep {
          0%   { transform: translateX(-200%) skewX(-22deg); }
          55%, 100% { transform: translateX(600%) skewX(-22deg); }
        }
        @keyframes mvp-glow {
          0%, 100% { filter: drop-shadow(0 0 8px ${withAlpha(primary, 0.55)}); }
          50%      { filter: drop-shadow(0 0 28px ${withAlpha(primary, 0.95)}); }
        }
        @keyframes mvp-line {
          from { transform: scaleX(0); } to { transform: scaleX(1); }
        }
        @keyframes mvp-flicker {
          0%, 88%, 100% { opacity: 1; }
          89% { opacity: .2; } 90% { opacity: 1; }
          92% { opacity: .5; } 93% { opacity: 1; }
        }
      `}</style>

      {/* ============================ HEADER ============================ */}
      <motion.div
        className="absolute left-[120px] right-[120px] top-[44px] flex items-end justify-between"
        initial={{ opacity: 0, x: -60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="relative flex items-stretch">
          {/* Logo plate */}
          <div
            className="w-[150px] h-[150px] flex items-center justify-center"
            style={{ background: themeGrad, clipPath: CUT_BOLT }}
          >
            {tournament.torLogo ? (
              <img src={tournament.torLogo} alt="" className="w-[96px] h-[96px] object-contain -ml-[14px]" />
            ) : (
              <Bolt size={58} color="#fff" className="-ml-[14px]" />
            )}
          </div>

          <div
            className="relative bg-white pl-[34px] pr-[90px] flex flex-col justify-center -ml-[18px]"
            style={{ clipPath: CUT_HEAD }}
          >
            <div className="flex items-center gap-[10px]">
              <Bolt size={18} color={primary} />
              <span className="font-[Righteous] text-[1.35rem] tracking-[0.18em] uppercase text-[#5b5f68]">
                {tournament.tournamentName}
              </span>
            </div>
            <div className="font-bebas leading-[0.9] text-[6.2rem] tracking-[0.02em] flex gap-[18px]">
              <span className="text-[#0d0f13]">ROAD TO</span>
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
        </div>

        {/* Round / match tag */}
        <div className="flex flex-col items-end gap-[10px] pb-[8px]">
          <div
            className="h-[58px] pl-[54px] pr-[34px] flex items-center gap-[14px] text-white"
            style={{ background: themeGrad, clipPath: CUT_TAG }}
          >
            <Bolt size={20} color="#fff" />
            <span className="font-bebas text-[2.4rem] tracking-[0.08em] leading-none pt-[4px]">
              {round?.roundName || 'No Round'}
            </span>
          </div>
          <div
            className="h-[40px] px-[26px] flex items-center bg-white text-[#0d0f13] font-[Righteous] text-[1.2rem] tracking-[0.18em]"
            style={{ clipPath: CUT_CHIP }}
          >
            AFTER MATCH&nbsp;<span style={{ color: primary }}>{match?.matchNo ?? 'N/A'}</span>
          </div>
        </div>
      </motion.div>

      {/* ============================ CARDS ============================ */}
      <div className="absolute left-[120px] right-[120px] top-[262px] bottom-[60px] flex gap-[26px] items-end">
        {topPlayers.length === 0 && (
          <div className="flex items-center justify-center w-full h-full">
            <div
              className="px-[48px] py-[18px] bg-white text-[#111] text-[2rem] font-bebas tracking-[0.12em]"
              style={{ clipPath: CUT_ROW, borderLeft: `8px solid ${primary}` }}
            >
              NO PLAYER STATS YET
            </div>
          </div>
        )}

        {topPlayers.map((player: any, index: number) => (
          <PlayerCard
            key={player.uId || player._id || player.key || index}
            player={player}
            index={index}
            primary={primary}
            themeGrad={themeGrad}
          />
        ))}
      </div>

      {/* Bottom accent */}
      <div
        className="absolute left-[120px] right-[120px] bottom-[30px] h-[6px] origin-left"
        style={{ background: themeGrad, clipPath: CUT_ROW, animation: 'mvp-line 1.2s .6s ease-out both' }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Player card                                                         */
/* ------------------------------------------------------------------ */

const PlayerCard: React.FC<{
  player: any;
  index: number;
  primary: string;
  themeGrad: string;
}> = ({ player, index, primary, themeGrad }) => {
  const isMvp = index === 0;
  const rankLabel = String(index + 1).padStart(2, '0');

  const stats = [
    { label: 'ELIMS', value: player.killNum ?? 0 },
    { label: 'AVG DMG', value: Number(player.numericDamage ?? 0).toFixed(2) },
    { label: 'AVG SURV', value: formatSecondsToMMSS(player.avgSurvivalSeconds) },
  ];

  return (
    <motion.div
      className="relative flex-1 min-w-0"
      style={{
        height: isMvp ? '100%' : '92%',
        animation: isMvp ? 'mvp-glow 2.6s ease-in-out infinite' : undefined,
      }}
      initial={{ opacity: 0, y: 140, skewX: -8 }}
      animate={{ opacity: 1, y: 0, skewX: 0 }}
      transition={{ delay: 0.3 + index * 0.15, duration: 0.6, ease: [0.2, 0.9, 0.25, 1] }}
    >
      <div
        className="relative flex flex-col w-full h-full overflow-hidden"
        style={{
          clipPath: CUT_CARD,
          background: 'linear-gradient(180deg, #ffffff 0%, #f1f2f5 100%)',
        }}
      >
        {/* ---------- Photo panel ---------- */}
        <div
          className="relative flex-1 min-h-0 overflow-hidden"
          style={{
            clipPath: CUT_PHOTO,
            background: isMvp
              ? themeGrad
              : `linear-gradient(160deg, #1b1e25 0%, #0d0f13 60%, ${withAlpha(primary, 0.85)} 100%)`,
          }}
        >
          {/* diagonal hazard stripes */}
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(-55deg, #fff 0 2px, transparent 2px 22px)',
            }}
          />

          {/* giant rank watermark */}
          <div
            className="absolute -left-[10px] top-[-30px] font-bebas text-[17rem] leading-none text-white"
            style={{ opacity: 0.14 }}
          >
            {rankLabel}
          </div>

          {/* player render */}
          <img
            src={player.picUrl || DEFAULT_CHAR}
            alt=""
            className="absolute inset-x-0 bottom-0 w-full h-[96%] object-cover object-top"
          />

          {/* shimmer */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-[120px]"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
              animation: `mvp-sweep 6s ${1.6 + index * 0.35}s ease-in-out infinite`,
            }}
          />

          {/* rank badge – lightning block */}
          <div
            className="absolute left-0 top-[26px] w-[118px] h-[78px] flex items-center pl-[18px] font-bebas text-[4rem] leading-none"
            style={{
              background: isMvp ? '#ffffff' : themeGrad,
              color: isMvp ? primary : '#ffffff',
              clipPath: CUT_BOLT,
            }}
          >
            <span className="pt-[8px]">#{index + 1}</span>
          </div>

          {/* MVP chip */}
          {isMvp && (
            <div
              className="absolute right-[56px] top-[30px] h-[38px] px-[20px] flex items-center gap-[8px] bg-white font-[Righteous] text-[1.1rem] tracking-[0.2em]"
              style={{ clipPath: CUT_CHIP, color: primary, animation: 'mvp-flicker 4s infinite' }}
            >
              <Bolt size={13} color={primary} />
              MVP
            </div>
          )}

          {/* team logo */}
          <div
            className="absolute right-[18px] bottom-[60px] w-[82px] h-[82px] bg-white flex items-center justify-center p-[8px]"
            style={{ clipPath: CUT_CHIP }}
          >
            <TeamLogo
              logo={player.teamLogo}
              flag={player.teamFlag}
              alt=""
              className="object-contain max-w-full max-h-full"
            />
          </div>
        </div>

        {/* ---------- Identity ---------- */}
        <div className="relative px-[22px] pt-[6px]">
          <div
            className="absolute left-[22px] top-[14px] bottom-[6px] w-[6px]"
            style={{ background: themeGrad, transform: 'skewX(-18deg)' }}
          />
          <div className="pl-[18px]">
            <div className="font-bebas text-[3.4rem] leading-[0.95] text-[#0d0f13] truncate">
              {player.playerName}
            </div>
            <div
              className="font-[Righteous] text-[1.05rem] tracking-[0.2em] uppercase truncate"
              style={{ color: primary }}
            >
              {player.teamName}
            </div>
          </div>
        </div>

        {/* ---------- Stats ---------- */}
        <div className="px-[16px] pt-[14px] pb-[30px]">
          {/* Elims – hero stat */}
          <div
            className="h-[74px] flex items-center justify-between px-[26px] text-white mb-[10px]"
            style={{ background: themeGrad, clipPath: CUT_ROW }}
          >
            <span className="font-[Righteous] text-[1.15rem] tracking-[0.2em]">{stats[0].label}</span>
            <span className="font-bebas text-[3.6rem] leading-none pt-[8px]">{stats[0].value}</span>
          </div>

          <div className="grid grid-cols-2 gap-[10px]">
            {stats.slice(1).map((s) => (
              <div
                key={s.label}
                className="h-[72px] flex flex-col items-center justify-center bg-[#0d0f13] text-white"
                style={{ clipPath: CUT_CHIP }}
              >
                <span className="font-bebas text-[2.4rem] leading-none pt-[6px]">{s.value}</span>
                <span
                  className="font-[Righteous] text-[0.8rem] tracking-[0.18em]"
                  style={{ color: withAlpha(primary, 1) }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default OverallFrags;