import React, { useMemo } from 'react';
import { rankingPageCount, useRankingPager } from '../../shared/hooks/rankingPager';
import { motion } from 'framer-motion';
import { buildOverallStandings } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';

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
  killNum: number;
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
  matchesPlayed?: number;
  totalKills?: number;
  total?: number;
  rank?: number;
  rankChange?: number | null; // position change vs. previous match
  pointsChange?: number;
  leadOverNext?: number;
}

interface OverallData {
  tournamentId: string;
  roundId: string;
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

interface OverAllDataProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: OverallData | null;
  matches?: Match[];
  matchDatas?: MatchData[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_LOGO = '/def_logo.png';
const DEFAULT_CHAR = '/def_char.avif';

const onPicError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_CHAR)) img.src = DEFAULT_CHAR;
};

/** Hex (#rgb / #rrggbb) -> rgba(). Falls back to the raw colour if it isn't hex. */
const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** Shared column template so the header and every row line up exactly. */
const GRID = '78px 92px 76px minmax(0,1fr) 96px 106px 106px 132px 104px';

/* Lightning-style clip paths */
const CUT_ROW = 'polygon(22px 0, 100% 0, calc(100% - 22px) 100%, 0 100%)';
const CUT_BOLT = 'polygon(0 0, 100% 0, 84% 46%, 96% 46%, 78% 100%, 0 100%)';
const CUT_CHIP = 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)';
const CUT_HEAD = 'polygon(0 0, 100% 0, calc(100% - 40px) 100%, 0 100%)';
const CUT_TAG = 'polygon(26px 0, 100% 0, 100% 100%, 0 100%, 14px 50%)';
const CUT_PCARD =
  'polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 20px 100%, 0 calc(100% - 20px))';

/** How far player photos are zoomed into the head/shoulders (1 = whole image). */
const FACE_ZOOM = 1.35;

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

const OverAllDataComponent: React.FC<OverAllDataProps> = ({
  tournament,
  round,
  overallData: propOverallData,
  matchDatas: propMatchDatas,
}) => {
  const overallData = propOverallData;
  const matchDatas = propMatchDatas || [];

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

  // Shared standings pipeline (Total Score primary + rankChange from match
  // history, else the overallData snapshot).
  const teams = useMemo(
    () => buildOverallStandings(matchDatas as any, overallData as any),
    [matchDatas, overallData]
  );

  // #1 team's roster for the hero panel: overallData snapshot first, else
  // the latest match that has this team's players. picUrl gaps on the
  // snapshot are filled from any match that carries a photo.
  const leader = teams[0];
  const leaderPlayers = useMemo<Player[]>(() => {
    if (!leader) return [];
    const fromMatches = [...matchDatas]
      .reverse()
      .map((m) => m.teams?.find((t) => t.teamId === leader.teamId))
      .filter((t): t is Team => !!t && (t.players?.length ?? 0) > 0);
    const snap = overallData?.teams?.find((t) => t.teamId === leader.teamId);
    const base: Player[] = snap?.players?.length ? snap.players : fromMatches[0]?.players || [];
    const pic = (p: Player) => {
      if (p.picUrl?.trim()) return p.picUrl.trim();
      for (const t of fromMatches) {
        const hit = t.players.find(
          (q) => (q._id && q._id === p._id) || q.playerName === p.playerName
        );
        if (hit?.picUrl?.trim()) return hit.picUrl.trim();
      }
      return '';
    };
    return base.slice(0, 4).map((p) => ({ ...p, picUrl: pic(p) }));
  }, [leader, matchDatas, overallData]);

  const teamsPerPage = 8;
  const pageCount = rankingPageCount('Theme1', 'OverAllData', teams.length);
  const currentPage = useRankingPager('OverAllData', pageCount, 25000);

  const paginatedTeams = useMemo(() => {
    const start = currentPage * teamsPerPage;
    return teams.slice(start, start + teamsPerPage);
  }, [teams, currentPage]);

  if (teams.length === 0) {
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
        @keyframes ovs-sweep {
          0%   { transform: translateX(-150%) skewX(-22deg); }
          55%, 100% { transform: translateX(650%) skewX(-22deg); }
        }
        @keyframes ovs-flicker {
          0%, 90%, 100% { opacity: 1; }
          91% { opacity: .25; } 92% { opacity: 1; }
          94% { opacity: .45; } 95% { opacity: 1; }
        }
        @keyframes ovs-glow {
          0%, 100% { filter: drop-shadow(0 0 6px ${withAlpha(primary, 0.55)}); }
          50%      { filter: drop-shadow(0 0 22px ${withAlpha(primary, 0.95)}); }
        }
        @keyframes ovs-line {
          from { transform: scaleX(0); } to { transform: scaleX(1); }
        }
      `}</style>

      {/* ============================ HEADER ============================ */}
      <motion.div
        className="absolute left-[120px] right-[120px] top-[44px] flex items-end justify-between"
        initial={{ opacity: 0, x: -60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        {/* Title block */}
        <div className="relative flex items-stretch">
          {/* Logo plate */}
          <div
            className="w-[150px] h-[150px] flex items-center justify-center"
            style={{ background: themeGrad, clipPath: CUT_BOLT }}
          >
            {tournament.torLogo ? (
              <img
                src={tournament.torLogo}
                alt=""
                className="w-[96px] h-[96px] object-contain -ml-[14px]"
              />
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
              <span
                className="font-[Righteous] text-[1.35rem] tracking-[0.18em] uppercase text-[#5b5f68]"
              >
                {tournament.tournamentName}
              </span>
            </div>
            <div className="font-bebas leading-[0.9] text-[6.2rem] tracking-[0.02em] flex gap-[18px]">
              <span
                style={{
                  background: themeGrad,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                OVERALL
              </span>
              <span className="text-[#0d0f13]">STANDINGS</span>
            </div>
            {/* animated underline */}
            <div
              className="absolute left-[34px] right-[90px] bottom-[14px] h-[5px] origin-left"
              style={{ background: themeGrad, animation: 'ovs-line .9s .3s ease-out both' }}
            />
          </div>
        </div>

        {/* Round tag + pager */}
        <div className="flex flex-col items-end gap-[12px] pb-[8px]">
          <div
            className="h-[58px] pl-[54px] pr-[34px] flex items-center gap-[14px] text-white"
            style={{ background: themeGrad, clipPath: CUT_TAG }}
          >
            <Bolt size={20} color="#fff" className="ovs-bolt" />
            <span className="font-bebas text-[2.4rem] tracking-[0.08em] leading-none pt-[4px]">
              {round?.roundName || 'No Round'}
            </span>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center gap-[8px]">
              {Array.from({ length: pageCount }).map((_, i) => (
                <div
                  key={i}
                  className="h-[8px] transition-all duration-500"
                  style={{
                    width: i === currentPage ? 46 : 18,
                    background: i === currentPage ? primary : 'rgba(255,255,255,0.55)',
                    clipPath: CUT_CHIP,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* ============================ TABLE ============================ */}
      {/* ========================= #1 HERO PANEL ======================= */}
      {leader && (
        <motion.div
          className="absolute left-[120px] top-[236px] w-[540px] h-[790px]"
          style={{ animation: 'ovs-glow 2.6s ease-in-out infinite' }}
          initial={{ opacity: 0, x: -140 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, delay: 0.15, ease: [0.2, 0.9, 0.25, 1] }}
        >
          {/* Backplate */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              background: themeGrad,
              clipPath:
                'polygon(0 0, 100% 0, 100% calc(100% - 46px), calc(100% - 46px) 100%, 0 100%)',
            }}
          >
            <div
              className="absolute inset-0 opacity-[0.14]"
              style={{ background: 'repeating-linear-gradient(-60deg, #fff 0 2px, transparent 2px 26px)' }}
            />
            <div className="absolute -right-[10px] -top-[40px] font-bebas text-[26rem] leading-none text-white opacity-[0.16]">
              #1
            </div>
            <div className="absolute left-[30px] top-[70px] w-[300px] h-[300px] opacity-[0.12]">
              <TeamLogo
                logo={leader.teamLogo}
                flag={leader.teamFlag}
                fallback={DEFAULT_LOGO}
                alt=""
                className="object-contain w-full h-full"
              />
            </div>
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-[200px]"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                animation: 'ovs-sweep 7s 1.2s ease-in-out infinite',
              }}
            />
          </div>

          {/* Label chip */}
          <div
            className="absolute left-0 top-[22px] h-[48px] pl-[22px] pr-[40px] flex items-center gap-[10px] bg-white z-10"
            style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 22px) 100%, 0 100%)' }}
          >
            <Bolt size={16} color={primary} />
            <span className="font-bebas text-[2rem] tracking-[0.1em] leading-none pt-[4px] text-[#0d0f13]">
              LEADING THE PACK
            </span>
          </div>

          {/* Player cards: 2×2 grid, every face big and unobstructed */}
          <div className="absolute left-[18px] right-[18px] top-[84px] h-[476px] z-10">
            {(() => {
              const ranked = [...leaderPlayers].sort((a, b) => (b.killNum || 0) - (a.killNum || 0));
              const shown = ranked.length
                ? ranked.slice(0, 4)
                : [{ _id: 'placeholder', playerName: '', killNum: 0 } as Player];
              const topKills = ranked[0]?.killNum || 0;
              const cols = shown.length === 1 ? 1 : 2;
              const rows = Math.ceil(shown.length / cols);
              return (
                <div
                  className="grid w-full h-full gap-[12px]"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                  }}
                >
                  {shown.map((p, i) => {
                    const isTop = i === 0 && topKills > 0;
                    // a 3-player squad: let the last card span both columns
                    const span = shown.length === 3 && i === 2;
                    return (
                      <motion.div
                        key={(p._id || p.playerName || 'p') + '-' + i}
                        className="relative min-h-0"
                        style={{
                          gridColumn: span ? '1 / -1' : undefined,
                          animation: isTop ? 'ovs-glow 2.6s ease-in-out infinite' : undefined,
                        }}
                        initial={{ opacity: 0, y: 40, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.6 + i * 0.12, duration: 0.55, ease: [0.2, 0.9, 0.25, 1] }}
                      >
                        <div
                          className="relative w-full h-full overflow-hidden"
                          style={{
                            clipPath: CUT_PCARD,
                            background: `linear-gradient(160deg, #0d0f13 0%, ${withAlpha(secondary, 0.95)} 55%, ${withAlpha(primary, 0.9)} 130%)`,
                          }}
                        >
                          {/* backdrop texture + glow behind the head */}
                          <div
                            className="absolute inset-0 opacity-[0.1]"
                            style={{ background: 'repeating-linear-gradient(-60deg, #fff 0 2px, transparent 2px 20px)' }}
                          />
                          <div
                            className="absolute left-1/2 top-[8%] w-[80%] aspect-square -translate-x-1/2 rounded-full"
                            style={{ background: `radial-gradient(circle, ${withAlpha(primary, 0.65)} 0%, transparent 68%)` }}
                          />

                          {/* face-framed photo: fills the card, anchored to the head */}
                          <img
                            src={playerPhoto(p.picUrl)?.trim() || DEFAULT_CHAR}
                            onError={onPicError}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                            style={{
                              objectPosition: '50% 0%',
                              transform: `scale(${FACE_ZOOM})`,
                              transformOrigin: '50% 0%',
                              filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.55))',
                            }}
                          />

                          {/* bottom fade so the name always reads */}
                          <div
                            className="absolute left-0 right-0 bottom-0 h-[45%]"
                            style={{ background: 'linear-gradient(180deg, transparent, rgba(13,15,19,0.92))' }}
                          />

                          {/* shimmer */}
                          <div
                            className="pointer-events-none absolute top-0 bottom-0 w-[90px]"
                            style={{
                              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                              transform: 'translateX(-150%) skewX(-22deg)',
                              animation: `ovs-sweep 7s ${1.6 + i * 0.5}s ease-in-out infinite`,
                            }}
                          />

                          {/* kills badge */}
                          <div
                            className="absolute right-[10px] top-[10px] h-[40px] pl-[16px] pr-[18px] flex items-center gap-[6px] text-white"
                            style={{ background: isTop ? themeGrad : 'rgba(13,15,19,0.85)', clipPath: CUT_CHIP }}
                          >
                            <span className="font-bebas text-[2rem] leading-none pt-[4px]">{p.killNum || 0}</span>
                            <span className="font-[Righteous] text-[0.75rem] tracking-[0.14em] opacity-90">KILLS</span>
                          </div>

                          
                         

                          {/* name bar */}
                          <div className="absolute left-[12px] right-[12px] bottom-[12px] flex items-center gap-[8px]">
                            <div className="w-[5px] h-[30px] shrink-0" style={{ background: themeGrad, transform: 'skewX(-18deg)' }} />
                            <span className="font-bebas text-[2.1rem] leading-none pt-[4px] text-white truncate">
                              {p.playerName}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Team plate */}
          <div
            className="absolute left-[18px] right-[18px] top-[572px] h-[100px] bg-white flex items-center gap-[16px] pl-[18px] pr-[26px] z-10"
            style={{ clipPath: CUT_ROW }}
          >
            <div
              className="w-[92px] h-full flex items-center justify-center text-white font-bebas text-[4.4rem] leading-none shrink-0"
              style={{ background: '#0d0f13', clipPath: CUT_BOLT }}
            >
              <span className="-ml-[12px] pt-[8px]">1</span>
            </div>
            <div className="w-[78px] h-[78px] flex items-center justify-center shrink-0">
              <TeamLogo
                logo={leader.teamLogo}
                flag={leader.teamFlag}
                fallback={DEFAULT_LOGO}
                alt={leader.teamTag}
                className="object-contain max-w-full max-h-full"
              />
            </div>
            <div className="min-w-0">
              <div className="font-bebas text-[3rem] leading-[0.95] text-[#0d0f13] truncate">
                {leader.teamTag}
              </div>
              {leader.leadOverNext > 0 && (
                <div
                  className="font-[Righteous] text-[1rem] tracking-[0.14em] uppercase"
                  style={{ color: primary }}
                >
                  +{leader.leadOverNext} pts lead
                </div>
              )}
            </div>
          </div>

          {/* Stat tiles */}
          <div className="absolute left-[18px] right-[46px] top-[684px] h-[92px] grid grid-cols-4 gap-[10px] z-10">
            {[
              { label: 'TOTAL', value: leader.total ?? 0, hero: true },
              { label: 'KILLS', value: leader.totalKills ?? 0 },
              { label: 'PLACE', value: leader.placePoints ?? 0 },
              { label: 'WWCD', value: leader.wwcd ?? 0 },
            ].map((s) => (
              <div
                key={s.label}
                className="flex flex-col items-center justify-center"
                style={{ background: s.hero ? '#0d0f13' : 'rgba(255,255,255,0.94)', clipPath: CUT_CHIP }}
              >
                <span
                  className="font-bebas text-[2.9rem] leading-none pt-[6px]"
                  style={{ color: s.hero ? '#fff' : '#0d0f13' }}
                >
                  {s.value}
                </span>
                <span
                  className="font-[Righteous] text-[0.9rem] tracking-[0.16em]"
                  style={{ color: s.hero ? primary : '#5b5f68' }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <div className="absolute left-[684px] right-[120px] top-[236px]">
        {/* Column header */}
        <motion.div
          className="grid items-center h-[54px] mb-[14px] text-white font-[Righteous] text-[1.05rem] tracking-[0.1em]"
          style={{
            gridTemplateColumns: GRID,
            background: `linear-gradient(90deg, #0d0f13 0%, #1b1e25 70%, ${withAlpha(primary, 0.9)} 100%)`,
            clipPath: CUT_ROW,
          }}
          initial={{ opacity: 0, scaleX: 0.6 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <span className="text-center text-[0.9rem] tracking-[0.05em] pl-[14px]">▲/▼</span>
          <span className="text-center" style={{ color: primary }}>#</span>
          <span />
          <span className="pl-[18px]">TEAM NAME</span>
          <span className="text-center">MATCH</span>
          <span className="text-center">KILLS</span>
          <span className="text-center">PLACE</span>
          <span className="text-center">TOTAL</span>
          <span className="text-center">WWCD</span>
        </motion.div>

        {/* Rows */}
        {paginatedTeams.map((team, index) => {
          const isLeader = team.rank === 1;
          const isPodium = (team.rank ?? 99) <= 3;
          const change = team.rankChange ?? 0;
          const wwcd = team.wwcd || 0;

          return (
            <motion.div
              key={team.teamId}
              className="relative mb-[10px]"
              initial={{ opacity: 0, x: -120, skewX: -12 }}
              animate={{ opacity: 1, x: 0, skewX: 0 }}
              transition={{ delay: 0.25 + index * 0.12, duration: 0.55, ease: [0.2, 0.9, 0.25, 1] }}
            >
              <div
                className="relative grid items-center h-[84px] overflow-hidden"
                style={{
                  gridTemplateColumns: GRID,
                  clipPath: CUT_ROW,
                  background: isLeader
                    ? `linear-gradient(90deg, #ffffff 0%, #ffffff 55%, ${withAlpha(primary, 0.18)} 100%)`
                    : 'linear-gradient(90deg, #ffffff 0%, #f4f5f7 60%, #e7e9ed 100%)',
                }}
              >
                {/* Shimmer sweep */}
                <div
                  className="pointer-events-none absolute top-0 bottom-0 w-[160px]"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
                    animation: `ovs-sweep 6s ${1.4 + index * 0.25}s ease-in-out infinite`,
                    mixBlendMode: 'overlay',
                  }}
                />

                {/* Rank change (before the rank box) */}
                <div className="h-full flex items-center justify-center pl-[14px] font-bebas text-[2rem] leading-none">
                  {change === 0 && <span className="text-[#9aa0aa] pt-[4px]">–</span>}
                  {change > 0 && (
                    <span
                      className="flex items-center gap-[2px] px-[12px] h-[36px] text-white"
                      style={{ background: '#16a34a', clipPath: CUT_CHIP }}
                    >
                      <span className="text-[1.1rem]">▲</span>
                      <span className="pt-[4px]">{change}</span>
                    </span>
                  )}
                  {change < 0 && (
                    <span
                      className="flex items-center gap-[2px] px-[12px] h-[36px] text-white"
                      style={{ background: '#dc2626', clipPath: CUT_CHIP }}
                    >
                      <span className="text-[1.1rem]">▼</span>
                      <span className="pt-[4px]">{Math.abs(change)}</span>
                    </span>
                  )}
                </div>

                {/* Rank – lightning cut block */}
                <div
                  className="h-full flex items-center justify-center text-white font-bebas text-[3.2rem] leading-none"
                  style={{
                    background: isPodium ? themeGrad : '#0d0f13',
                    clipPath: CUT_BOLT,
                  }}
                >
                  <span className="-ml-[14px] pt-[6px]">{team.rank}</span>
                </div>

                {/* Logo */}
                <div className="flex items-center justify-center h-full">
                  <div className="w-[56px] h-[56px] flex items-center justify-center">
                    <TeamLogo
                      logo={team.teamLogo}
                      flag={team.teamFlag}
                      fallback={DEFAULT_LOGO}
                      alt={team.teamTag}
                      className="object-contain max-w-full max-h-full"
                    />
                  </div>
                </div>

                {/* Name */}
                <div className="h-full flex items-center pl-[18px] min-w-0 relative">
                  <div
                    className="absolute left-0 top-[16px] bottom-[16px] w-[5px]"
                    style={{ background: themeGrad, transform: 'skewX(-18deg)' }}
                  />
                  <div className="min-w-0">
                    <div className="font-bebas text-[2.5rem] leading-[0.95] text-[#0d0f13] truncate">
                      {team.teamName}
                    </div>
                   
                  </div>
                 
                </div>

                {/* Stats */}
                {[team.matchesPlayed, team.totalKills, team.placePoints].map((v, i) => (
                  <div
                    key={i}
                    className="h-full flex items-center justify-center font-bebas text-[2.6rem] text-[#1a1d23] relative"
                  >
                    <div className="absolute left-0 top-[22px] bottom-[22px] w-[2px] bg-[#d3d6dc] skew-x-[-18deg]" />
                    <span className="pt-[4px]">{v ?? 0}</span>
                  </div>
                ))}

                {/* Total – themed emphasised chip */}
                <div className="h-full flex items-center justify-center px-[10px]">
                  <div
                    className="w-full h-[58px] flex items-center justify-center font-bebas text-[2.9rem] text-white leading-none"
                    style={{ background: themeGrad, clipPath: CUT_CHIP }}
                  >
                    <span className="pt-[6px]">{team.total ?? 0}</span>
                  </div>
                </div>

                {/* WWCD */}
                <div className="h-full flex items-center justify-center gap-[6px] font-bebas text-[2.6rem] text-[#1a1d23] pr-[22px]">
                  <span className="pt-[4px]">{wwcd}</span>
                  {wwcd > 0 && <Bolt size={14} color={primary} />}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom accent */}
      <div
        className="absolute left-[120px] right-[120px] bottom-[34px] h-[6px] origin-left"
        style={{ background: themeGrad, clipPath: CUT_ROW, animation: 'ovs-line 1.2s .6s ease-out both' }}
      />
    </div>
  );
};

export default OverAllDataComponent;