import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { MatchData } from '../../shared/hooks/unsortteams';
import { computeMatchStandings } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
// NOTE: no own socket – PublicThemeRenderer owns the single connection,
// listens to 'bulkUpdate' and passes fresh `matchData` down as a prop.

// ─────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────
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

interface WwcdSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

/* ------------------------------------------------------------------ */
/* Helpers (same visual language as Champions)                         */
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
const CUT_PCARD = 'polygon(0 0, calc(100% - 34px) 0, 100% 34px, 100% 100%, 26px 100%, 0 calc(100% - 26px))';

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

const Crosshair: React.FC<{ size?: number; color: string }> = ({ size = 24, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke={color} strokeWidth="2.4">
    <circle cx="12" cy="12" r="7" />
    <path d="M12 1v6M12 17v6M1 12h6M17 12h6" />
  </svg>
);

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const WwcdStats: React.FC<WwcdSummaryProps> = ({ tournament, round, match, matchData }) => {
  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

  // Recalculated whenever matchData changes (prop pushed by PublicThemeRenderer)
  const teamsWithTotals = useMemo(
    () => computeMatchStandings(matchData).filter((t) => t.wwcd),
    [matchData]
  );
  const winner: any = teamsWithTotals[0];

  const players: any[] = useMemo(() => (winner?.players || []).slice(0, 4), [winner]);

  const teamKills = useMemo(() => {
    const fromPlayers = players.reduce((s, p) => s + num(p.killNum), 0);
    return num(winner?.totalKills ?? winner?.killNum ?? winner?.killPoints) || fromPlayers;
  }, [winner, players]);

  const mvpIdx = useMemo(() => {
    let best = -1;
    let bestKills = 0;
    players.forEach((p, i) => {
      const k = num(p.killNum);
      if (k > bestKills) {
        best = i;
        bestKills = k;
      }
    });
    return best;
  }, [players]);

  /* ----------------------------- empty states ----------------------------- */
  if (!matchData || !winner) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div
          className="px-[48px] py-[18px] bg-white text-[#111] text-[2rem] font-bebas tracking-[0.12em]"
          style={{ clipPath: CUT_ROW, borderLeft: `8px solid ${primary}` }}
        >
          {!matchData ? 'NO MATCH DATA AVAILABLE' : 'WAITING FOR WWCD'}
        </div>
      </div>
    );
  }

  const day = round?.day || tournament.day;
  const matchLabel = match
    ? match.matchName || `MATCH ${match.matchNo ?? match._matchNo ?? ''}`.trim()
    : '';

  const placePts = num(winner.placePoints);
  const total = num(winner.total) || placePts + teamKills;

  const stats = [
    { label: 'KILLS', value: teamKills, suffix: '' },
    { label: 'PLACE', value: placePts, suffix: 'PTS' },
    {
      label: 'AVG ELI',
      value: players.length ? (teamKills / players.length).toFixed(1).replace(/\.0$/, '') : 0,
      suffix: '/ PLR',
      text: false,
    },
    { label: 'TOTAL', value: total, suffix: 'PTS', hero: true },
  ];

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden select-none">
      <style>{`
        @keyframes ww-sweep {
          0%   { transform: translateX(-200%) skewX(-22deg); }
          55%, 100% { transform: translateX(900%) skewX(-22deg); }
        }
        @keyframes ww-glow {
          0%, 100% { filter: drop-shadow(0 0 10px ${withAlpha(primary, 0.5)}); }
          50%      { filter: drop-shadow(0 0 34px ${withAlpha(primary, 0.95)}); }
        }
        @keyframes ww-line {
          from { transform: scaleX(0); } to { transform: scaleX(1); }
        }
        @keyframes ww-flicker {
          0%, 88%, 100% { opacity: 1; }
          89% { opacity: .2; } 90% { opacity: 1; }
          92% { opacity: .5; } 93% { opacity: 1; }
        }
        @keyframes ww-beam {
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
              className="font-bebas leading-[0.9] text-[6.6rem] tracking-[0.02em] whitespace-nowrap"
              style={{
                background: themeGrad,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              WWCD TEAM STATS
            </div>
            <div
              className="absolute left-[34px] right-[90px] bottom-[14px] h-[5px] origin-left"
              style={{ background: themeGrad, animation: 'ww-line .9s .3s ease-out both' }}
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-[10px] pb-[8px]">
          <div
            className="h-[58px] pl-[54px] pr-[34px] flex items-center gap-[14px] text-white"
            style={{ background: themeGrad, clipPath: CUT_TAG }}
          >
            <Bolt size={20} color="#fff" />
            <span className="font-[AGENCYB] text-[2.2rem] tracking-[0.08em] leading-none uppercase">
              {round?.roundName || 'No Round'}
            </span>
          </div>
          <div
            className="h-[40px] px-[26px] flex items-center gap-[10px] bg-white font-[Righteous] text-[1.15rem] tracking-[0.2em] uppercase"
            style={{ clipPath: CUT_CHIP, color: primary, animation: 'ww-flicker 4s infinite' }}
          >
            <Crown size={20} color={primary} />
            <span className="text-[#0d0f13]">
              {[day ? `DAY ${day}` : null, matchLabel || null].filter(Boolean).join('  ·  ') || 'WWCD'}
            </span>
          </div>
        </div>
      </motion.div>

      {/* ======================== TEAM IDENTITY ======================== */}
      <motion.div
        className="absolute left-[120px] top-[268px] w-[440px] h-[580px] z-20"
        style={{ animation: 'ww-glow 2.8s ease-in-out infinite' }}
        initial={{ opacity: 0, x: -120, skewX: -10 }}
        animate={{ opacity: 1, x: 0, skewX: 0 }}
        transition={{ delay: 0.25, duration: 0.65, ease: [0.2, 0.9, 0.25, 1] }}
      >
        <div
          className="relative flex flex-col w-full h-full overflow-hidden"
          style={{ clipPath: CUT_CARD, background: 'linear-gradient(180deg, #ffffff 0%, #eef0f3 100%)' }}
        >
          {/* themed top half with logo */}
          <div className="relative h-[320px] flex items-center justify-center overflow-hidden" style={{ background: themeGrad }}>
            <div
              className="absolute inset-0 opacity-[0.14]"
              style={{ backgroundImage: 'repeating-linear-gradient(-55deg, #fff 0 2px, transparent 2px 22px)' }}
            />
            <div className="absolute -left-[6px] -top-[30px] font-bebas text-[13rem] leading-none text-white opacity-[0.12]">
              WWCD
            </div>
            <div
              className="relative w-[220px] h-[220px] bg-white flex items-center justify-center p-[22px]"
              style={{ clipPath: CUT_CARD }}
            >
              <TeamLogo
                logo={winner.teamLogo}
                flag={winner.teamFlag}
                alt=""
                className="object-contain max-w-full max-h-full"
              />
            </div>
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-[120px]"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
                animation: 'ww-sweep 5.5s 1.5s ease-in-out infinite',
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
              <div className="font-[Righteous] text-[1.05rem] tracking-[0.24em] uppercase" style={{ color: primary }}>
                {winner.teamTag || 'WINNER'}
              </div>
              <div className="font-[AGENCYB] text-[3.6rem] leading-[0.95] text-[#0d0f13] uppercase line-clamp-2">
                {winner.teamName}
              </div>
            </div>

            <div
              className="absolute left-[34px] right-[34px] bottom-[42px] h-[52px] flex items-center justify-center gap-[12px] text-white font-[AGENCYB] text-[1.7rem] tracking-[0.14em]"
              style={{ background: '#0d0f13', clipPath: CUT_ROW }}
            >
              <Crown size={26} color={primary} />
              WWCD
            </div>
          </div>
        </div>
      </motion.div>

      {/* ========================= PLAYER CARDS ========================= */}
      <div className="absolute left-[600px] right-[120px] top-[268px] h-[580px] flex gap-[20px] z-10">
        {players.map((p, i) => {
          const kills = num(p.killNum);
          const share = teamKills > 0 ? Math.round((kills / teamKills) * 100) : 0;
          const isMvp = i === mvpIdx;

          return (
            <motion.div
              key={p._id || p.playerId || i}
              className="relative flex-1"
              style={isMvp ? { animation: 'ww-glow 2.8s ease-in-out infinite' } : undefined}
              initial={{ opacity: 0, y: 120 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 + i * 0.15, duration: 0.6, ease: [0.2, 0.9, 0.25, 1] }}
            >
              <div
                className="relative w-full h-full flex flex-col overflow-hidden"
                style={{ clipPath: CUT_PCARD, background: 'linear-gradient(180deg, #ffffff 0%, #eef0f3 100%)' }}
              >
                {/* themed portrait area */}
                <div className="relative h-[360px] overflow-hidden" style={{ background: themeGrad }}>
                  <div
                    className="absolute inset-0 opacity-[0.12]"
                    style={{ backgroundImage: 'repeating-linear-gradient(-55deg, #fff 0 2px, transparent 2px 24px)' }}
                  />
                  <div
                    className="absolute top-0 bottom-0 left-[30%] w-[90px]"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.55), transparent 85%)',
                      transform: 'skewX(-14deg)',
                      animation: `ww-beam 3.2s ${i * 0.4}s ease-in-out infinite`,
                    }}
                  />
                  <div className="absolute right-[14px] top-[4px] font-bebas text-[8rem] leading-none text-white opacity-[0.14]">
                    0{i + 1}
                  </div>
                  <img
                    src={playerPhoto(p.picUrl)?.trim() || DEFAULT_CHAR}
                    onError={onPicError}
                    alt=""
                    className="absolute inset-x-0 bottom-0 w-full h-full object-contain object-bottom"
                    style={{ filter: 'drop-shadow(0 14px 22px rgba(0,0,0,0.5))' }}
                  />

                  {isMvp && (
                    <div
                      className="absolute left-[16px] top-[18px] h-[40px] pl-[18px] pr-[22px] flex items-center gap-[8px] bg-white font-[AGENCYB] text-[1.0rem] tracking-[0.14em]"
                      style={{ clipPath: CUT_CHIP, color: '#0d0f13' }}
                    >
                      <Crosshair size={15} color={primary} />
                      GUNSLINGER
                    </div>
                  )}

                  {/* name bar */}
                  <div
                    className="absolute left-0 right-0 bottom-0 h-[56px] flex items-center justify-center px-[26px] text-white font-[AGENCYB] text-[1.9rem] tracking-[0.06em] uppercase"
                    style={{ background: '#0d0f13' }}
                  >
                    <span className="truncate">{p.playerName}</span>
                  </div>
                </div>

                {/* stats block */}
                <div className="relative flex-1 px-[24px] pt-[14px] flex flex-col">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-[8px] font-[Righteous] text-[1rem] tracking-[0.24em]" style={{ color: primary }}>
                      <Crosshair size={20} color={primary} />
                      ELIMINATIONS
                    </div>
                  </div>

                  <div className="flex items-end gap-[10px] -mt-[4px]">
                    <span
                      className="font-bebas text-[7.4rem] leading-[0.9]"
                      style={
                        isMvp
                          ? {
                              background: themeGrad,
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                              backgroundClip: 'text',
                            }
                          : { color: '#0d0f13' }
                      }
                    >
                      {kills}
                    </span>
                    <span className="font-[AGENCYB] text-[1.5rem] tracking-[0.1em] pb-[16px]" style={{ color: primary }}>
                      KILLS
                    </span>
                  </div>

                  {/* kill share bar */}
                  <div className="mt-auto mb-[34px]">
                    <div className="flex justify-between font-[AGENCYB] text-[1.15rem] tracking-[0.12em] text-[#5b5f68] mb-[6px]">
                      <span>TEAM SHARE</span>
                      <span className="text-[#0d0f13]">{share}%</span>
                    </div>
                    <div className="h-[12px] bg-[#d9dce1] overflow-hidden" style={{ clipPath: CUT_CHIP }}>
                      <motion.div
                        className="h-full origin-left"
                        style={{ background: themeGrad }}
                        initial={{ width: 0 }}
                        animate={{ width: `${share}%` }}
                        transition={{ delay: 1 + i * 0.15, duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ============================ STATS ============================ */}
      <div className="absolute left-[120px] right-[120px] bottom-[60px] h-[124px] flex gap-[18px] z-20">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            className="relative flex-1"
            style={s.hero ? { animation: 'ww-glow 2.8s ease-in-out infinite' } : undefined}
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
                className="w-[40%] flex items-center justify-center font-[AGENCYB] text-[2.5rem] tracking-[0.1em] text-white"
                style={{
                  background: s.hero ? 'rgba(0,0,0,0.28)' : '#0d0f13',
                  clipPath: 'polygon(0 0, 100% 0, 82% 100%, 0 100%)',
                }}
              >
                <span className="-ml-[12px] flex items-center gap-[8px]">
                  {s.label === 'KILLS' && <Crosshair size={26} color={primary} />}
                  {s.label}
                </span>
              </div>
              {/* value */}
              <div className="flex-1 min-w-0 flex items-center justify-center gap-[10px] pr-[20px]">
                <span
                  className={
                    s.text
                      ? 'font-[AGENCYB] text-[2.4rem] leading-none uppercase truncate'
                      : 'font-bebas text-[5rem] leading-none pt-[10px]'
                  }
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
        style={{ background: themeGrad, clipPath: CUT_ROW, animation: 'ww-line 1.2s .6s ease-out both' }}
      />
    </div>
  );
};

export default WwcdStats;