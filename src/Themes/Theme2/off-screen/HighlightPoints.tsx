import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { buildOverallStandings } from '../../shared/hooks/officialStandings';
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
  pointsChange?: number; // points gained this match
  leadOverNext?: number; // only for rank 1: lead over rank 2
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
/* Layout                                                              */
/* ------------------------------------------------------------------ */
const PANEL_W = 520;
const HERO_H = 210;
const ROW_GAP = 6;
const LIST_MAX_H = 610; // room for up to 10 rows
const ROW_MAX_H = 58;
const PAGE_MS = 25000;
const FACE_ZOOM = 1.3;
const DEFAULT_CHAR = '/def_char.avif';

/**
 * Even pages, never a lopsided last page:
 *   ≤10 teams → 1 page
 *   11–20     → 2 pages, split evenly (16 → 8+8, 20 → 10+10, 18 → 9+9)
 *   >20       → pages of at most 8, split evenly (24 → 8+8+8, 32 → 8×4, 25 → 7+6+6+6)
 */
const splitPages = <T,>(list: T[]): T[][] => {
  const n = list.length;
  if (n === 0) return [];
  const pageCount = n <= 10 ? 1 : n <= 20 ? 2 : Math.ceil(n / 8);
  const base = Math.floor(n / pageCount);
  const extra = n % pageCount; // first `extra` pages get one more row
  const pages: T[][] = [];
  let at = 0;
  for (let p = 0; p < pageCount; p++) {
    const size = base + (p < extra ? 1 : 0);
    pages.push(list.slice(at, at + size));
    at += size;
  }
  return pages;
};

/* ------------------------------------------------------------------ */
/* Visual language (white label + lightning)                            */
/* ------------------------------------------------------------------ */
const INK = '#0d0f13';
const CUT_PANEL = 'polygon(0 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 24px 100%, 0 calc(100% - 24px))';
const CUT_ROW = 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)';
const CUT_RANK = 'polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)';
const CUT_CHIP = 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)';
const CUT_PCARD = 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)';

const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const Bolt: React.FC<{ size?: number; color: string }> = ({ size = 14, color }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" aria-hidden>
    <path d="M13 0 L2 16 H9 L6 28 L18 10 H11 L15 0 Z" fill={color} />
  </svg>
);

const Crown: React.FC<{ size?: number; color: string }> = ({ size = 18, color }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
    <rect x="6" y="27" width="28" height="3" fill={color} />
  </svg>
);

const electric = (primary: string, speed: number): React.CSSProperties => ({
  backgroundColor: primary,
  backgroundImage: 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
  backgroundSize: '200% 100%',
  animation: `hp-run ${speed}s linear infinite`,
  boxShadow: `0 0 10px ${withAlpha(primary, 0.85)}`,
});

const onPicError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_CHAR)) img.src = DEFAULT_CHAR;
};

const STORM = [
  { d: 'M372 0 L352 40 L366 46 L338 98 L354 104 L326 160', b: 'M354 104 L384 124 L376 132 L404 152', dur: 4.6, delay: 0.9 },
  { d: 'M120 0 L138 30 L122 36 L148 82 L132 88 L156 136', b: 'M132 88 L104 106 L112 114 L84 132', dur: 6.2, delay: 2.8 },
  { d: 'M250 0 L238 22 L248 26 L232 54', b: '', dur: 3.3, delay: 1.7 },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const HighlightPoints: React.FC<OverAllDataProps> = ({
  tournament,
  round,
  overallData: propOverallData,
  matchDatas: propMatchDatas,
}) => {
  const overallData = propOverallData;
  const matchDatas = propMatchDatas || [];

  // One shared standings pipeline (Total Score primary + real rankChange
  // from match history, else the overallData snapshot).
  const teams = useMemo(
    () => buildOverallStandings(matchDatas as any, overallData as any),
    [matchDatas, overallData]
  );

  // #1 team's roster for the photo banner: overallData snapshot first, else
  // the latest match that has this team's players; photo gaps filled from
  // any match that carries one.
  const leader: any = teams[0];
  const leaderPlayers = useMemo<Player[]>(() => {
    if (!leader) return [];
    const fromMatches = [...matchDatas]
      .reverse()
      .map((m) => m.teams?.find((t) => t.teamId === leader.teamId))
      .filter((t): t is Team => !!t && (t.players?.length ?? 0) > 0);
    const snap = overallData?.teams?.find((t) => t.teamId === leader.teamId);
    const base: Player[] = snap?.players?.length ? snap.players : fromMatches[0]?.players || leader.players || [];
    const pic = (p: Player) => {
      if (p.picUrl?.trim()) return p.picUrl.trim();
      for (const t of fromMatches) {
        const hit = t.players.find((q) => (q._id && q._id === p._id) || q.playerName === p.playerName);
        if (hit?.picUrl?.trim()) return hit.picUrl.trim();
      }
      return '';
    };
    return base
      .slice(0, 4)
      .map((p) => ({ ...p, picUrl: pic(p) }))
      .sort((a, b) => (b.killNum || 0) - (a.killNum || 0));
  }, [leader, matchDatas, overallData]);

  // Even pagination
  const pages = useMemo(() => splitPages(teams as any[]), [teams]);
  const totalPages = Math.max(1, pages.length);
  const perPage = pages[0]?.length || 1;
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (currentPage >= totalPages) setCurrentPage(0);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (totalPages <= 1) return;
    const interval = setInterval(() => setCurrentPage((p) => (p + 1) % totalPages), PAGE_MS);
    return () => clearInterval(interval);
  }, [totalPages]);

  const pageTeams: any[] = pages[Math.min(currentPage, totalPages - 1)] || [];
  const pageStart = pages.slice(0, Math.min(currentPage, totalPages - 1)).reduce((s, p) => s + p.length, 0);

  // Row height sized for the biggest page so every page uses the same rhythm.
  const rowH = Math.min(ROW_MAX_H, Math.floor((LIST_MAX_H - (perPage - 1) * ROW_GAP) / perPage));
  const listH = perPage * rowH + (perPage - 1) * ROW_GAP;

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

  if (teams.length === 0) {
    return (
      <div className="w-[1920px] h-[1080px] relative">
        <div
          className="absolute left-[40px] top-[40px] px-[40px] py-[14px] bg-white text-[1.6rem] font-bebas tracking-[0.12em]"
          style={{ clipPath: CUT_ROW, borderLeft: `8px solid ${primary}`, color: INK }}
        >
          NO STANDINGS YET
        </div>
      </div>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden select-none">
      <style>{`
        @keyframes hp-run { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        @keyframes hp-bolt {
          0%, 100% { opacity: 0; }
          2% { opacity: 1; } 4% { opacity: .15; } 6.5% { opacity: 1; } 9% { opacity: .4; } 12% { opacity: 0; }
        }
        @keyframes hp-sheet {
          0%, 100% { opacity: 0; } 2% { opacity: .45; } 4% { opacity: .05; } 6.5% { opacity: .3; } 12% { opacity: 0; }
        }
        @keyframes hp-glow {
          0%, 100% { filter: drop-shadow(0 0 6px ${withAlpha(primary, 0.45)}); }
          50%      { filter: drop-shadow(0 0 20px ${withAlpha(primary, 0.9)}); }
        }
        @keyframes hp-flicker {
          0%, 88%, 100% { opacity: 1; }
          89% { opacity: .25; } 90% { opacity: 1; }
          92% { opacity: .5; }  93% { opacity: 1; }
        }
        @keyframes hp-sweep { from { transform: translateX(-200%) skewX(-22deg); } to { transform: translateX(700%) skewX(-22deg); } }
      `}</style>

      <motion.div
        className="absolute left-[40px] top-[40px]"
        style={{ width: PANEL_W, animation: 'hp-glow 3.4s ease-in-out infinite' }}
        initial={{ opacity: 0, x: -80, skewX: -8 }}
        animate={{ opacity: 1, x: 0, skewX: 0 }}
        transition={{ duration: 0.6, ease: [0.2, 0.9, 0.25, 1] }}
      >
        <div
          className="relative w-full overflow-hidden"
          style={{ clipPath: CUT_PANEL, background: 'linear-gradient(180deg, #ffffff 0%, #eef0f3 100%)' }}
        >
          {/* ═════════════ HERO: #1 team photos in a storm ═════════════ */}
          <div
            className="relative overflow-hidden"
            style={{
              height: HERO_H,
              background: `radial-gradient(ellipse 70% 90% at 62% -10%, ${withAlpha(primary, 0.75)} 0%, transparent 65%),
                           linear-gradient(165deg, #06070b 0%, ${withAlpha(secondary, 0.95)} 55%, ${primary} 150%)`,
            }}
          >
            {/* sheet lightning */}
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(ellipse at 70% 20%, #fff 0%, ${withAlpha(primary, 0.5)} 40%, transparent 75%)`,
                opacity: 0,
                animation: `hp-sheet ${STORM[0].dur}s ${STORM[0].delay}s infinite`,
              }}
            />
            {/* bolts */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 520 210" preserveAspectRatio="none" aria-hidden>
              <defs>
                <filter id="hp-storm-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" />
                </filter>
              </defs>
              {STORM.map((s, i) => (
                <g key={i} style={{ opacity: 0, animation: `hp-bolt ${s.dur}s ${s.delay}s linear infinite` }}>
                  {[s.d, s.b].filter(Boolean).map((d, j) => (
                    <path key={`g${j}`} d={d} fill="none" stroke={primary} strokeWidth={j ? 5 : 8} filter="url(#hp-storm-glow)" />
                  ))}
                  {[s.d, s.b].filter(Boolean).map((d, j) => (
                    <path key={`c${j}`} d={d} fill="none" stroke="#fff" strokeWidth={j ? 1.3 : 2.2} strokeLinejoin="miter" />
                  ))}
                </g>
              ))}
            </svg>
            <div className="absolute right-[14px] -top-[10px] font-bebas text-[8rem] leading-none text-white opacity-[0.1]">#1</div>

            {/* player photos — face-framed cards, all faces visible */}
            <div className="absolute left-[14px] right-[14px] top-[44px] bottom-[10px] flex gap-[8px]">
              {(leaderPlayers.length ? leaderPlayers : [{ _id: 'ph', playerName: '', killNum: 0 } as Player]).map((p, i) => {
                const isTop = i === 0 && (p.killNum || 0) > 0;
                return (
                  <motion.div
                    key={(p._id || p.playerName) + i}
                    className="relative flex-1 min-w-0 overflow-hidden"
                    style={{
                      clipPath: CUT_PCARD,
                      background: `linear-gradient(180deg, ${withAlpha(primary, 0.35)} 0%, rgba(6,7,11,0.6) 100%)`,
                    }}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
                  >
                    <img
                      src={p.picUrl?.trim() || DEFAULT_CHAR}
                      onError={onPicError}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{
                        objectPosition: '50% 0%',
                        transform: `scale(${FACE_ZOOM})`,
                        transformOrigin: '50% 0%',
                        filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.5))',
                      }}
                    />
                    <div
                      className="absolute left-0 right-0 bottom-0 h-[50%]"
                      style={{ background: 'linear-gradient(180deg, transparent, rgba(6,7,11,0.92))' }}
                    />
                    {isTop && (
                      <div className="absolute left-[10px] top-[6px]" style={{ animation: 'hp-flicker 5s infinite' }}>
                        <Crown size={20} color="#fff" />
                      </div>
                    )}
                    <div className="absolute left-[12px] right-[8px] bottom-[6px]">
                      <div className="font-bebas text-[1.35rem] leading-none text-white truncate">{p.playerName}</div>
                      <div className="font-[Righteous] text-[0.7rem] tracking-[0.12em]" style={{ color: isTop ? '#fff' : withAlpha('#ffffff', 0.7) }}>
                        {p.killNum || 0} KILLS
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* leader chip */}
            <div
              className="absolute left-0 top-[10px] h-[28px] pl-[14px] pr-[22px] flex items-center gap-[8px] bg-white z-10"
              style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)' }}
            >
              <Bolt size={10} color={primary} />
              <span className="font-[AGENCYB] font-bold text-[1rem] tracking-[0.16em] leading-none" style={{ color: INK }}>
                LEADER · {(leader?.teamTag || leader?.teamName || '').toUpperCase()}
              </span>
            </div>
            <div
              className="absolute right-[34px] top-[10px] h-[28px] px-[14px] flex items-center gap-[6px] text-white z-10"
              style={{ background: INK, clipPath: CUT_CHIP }}
            >
              <span className="font-bebas text-[1.5rem] leading-none pt-[3px]">{leader?.total ?? 0}</span>
              <span className="font-[Righteous] text-[0.7rem] tracking-[0.14em]" style={{ color: primary }}>PTS</span>
            </div>

            {/* electric divider */}
            <div className="absolute left-0 right-0 bottom-0 h-[3px]" style={electric(primary, 3.5)} />
          </div>

          {/* ═════════════ TITLE ═════════════ */}
          <div className="relative flex items-center justify-between px-[18px] h-[54px]">
            <div className="flex items-baseline gap-[10px] min-w-0 overflow-hidden mr-[10px]">
              <span
                className="font-bebas text-[2.3rem] leading-none pt-[6px] whitespace-nowrap"
                style={{
                  background: themeGrad,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                OVERALL
              </span>
              <span className="font-bebas text-[2.3rem] leading-none pt-[6px] whitespace-nowrap" style={{ color: INK }}>
                STANDINGS
              </span>
            </div>
            <div
              className="h-[28px] px-[14px] flex items-center text-white font-[AGENCYB] font-bold text-[1rem] tracking-[0.1em] uppercase shrink-0 max-w-[170px]"
              style={{ background: themeGrad, clipPath: CUT_CHIP }}
            >
              <span className="truncate">{round?.roundName || 'STANDINGS'}</span>
            </div>
          </div>

          {/* ═════════════ COLUMN HEADER ═════════════ */}
          <div
            className="mx-[12px] h-[26px] flex items-center font-[AGENCYB] font-bold text-[0.95rem] tracking-[0.14em] text-white"
            style={{ background: INK, clipPath: CUT_ROW }}
          >
            <span className="w-[64px] text-center" style={{ color: primary }}>#</span>
            <span className="flex-1 pl-[56px]">TEAM</span>
            <span className="w-[64px] text-center">KILLS</span>
            <span className="w-[96px] text-center" style={{ color: primary }}>TOTAL</span>
          </div>

          {/* ═════════════ ROWS ═════════════ */}
          <div className="relative mx-[12px] mt-[8px]" style={{ height: listH }}>
            <AnimatePresence mode="wait">
              <motion.div key={currentPage} className="absolute inset-0 flex flex-col" style={{ gap: ROW_GAP }}>
                {pageTeams.map((team, index) => {
                  const rank = team.rank ?? pageStart + index + 1;
                  const podium = rank <= 3;
                  return (
                    <motion.div
                      key={team.teamId}
                      className="relative shrink-0"
                      style={{ height: rowH }}
                      initial={{ opacity: 0, x: -60, skewX: -10 }}
                      animate={{ opacity: 1, x: 0, skewX: 0 }}
                      exit={{ opacity: 0, x: 60, transition: { duration: 0.25, delay: index * 0.03 } }}
                      transition={{ delay: 0.15 + index * 0.06, duration: 0.45, ease: [0.2, 0.9, 0.25, 1] }}
                    >
                      <div
                        className="relative w-full h-full flex items-stretch overflow-hidden"
                        style={{
                          clipPath: CUT_ROW,
                          background:
                            rank === 1
                              ? `linear-gradient(90deg, ${withAlpha(primary, 0.22)} 0%, #ffffff 45%, #f1f2f5 100%)`
                              : `linear-gradient(90deg, ${withAlpha(primary, 0.08)} 0%, #ffffff 35%, ${index % 2 ? '#eceef2' : '#f4f5f7'} 100%)`,
                        }}
                      >
                        {/* rank */}
                        <div
                          className="w-[64px] shrink-0 flex items-center justify-center text-white font-bebas leading-none"
                          style={{
                            background: podium ? themeGrad : INK,
                            clipPath: CUT_RANK,
                            fontSize: Math.round(rowH * 0.62),
                            textShadow: podium ? '0 0 8px rgba(255,255,255,0.5)' : undefined,
                          }}
                        >
                          <span className="pt-[4px] -ml-[4px]">{rank}</span>
                        </div>

                        {/* logo + name */}
                        <div className="flex-1 min-w-0 flex items-center gap-[10px] pl-[10px]">
                          <div
                            className="shrink-0 flex items-center justify-center"
                            style={{ width: Math.round(rowH * 0.72), height: Math.round(rowH * 0.72) }}
                          >
                            <TeamLogo
                              logo={team.teamLogo}
                              flag={team.teamFlag}
                              fallback="/def_logo.png"
                              alt={team.teamName}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <span
                            className="font-bebas leading-none pt-[4px] truncate"
                            style={{ fontSize: Math.round(rowH * 0.56), color: INK }}
                          >
                            {team.teamName}
                          </span>
                          {rank === 1 && <Crown size={18} color={primary} />}
                        </div>

                        {/* kills */}
                        <div
                          className="w-[64px] shrink-0 flex items-center justify-center font-bebas leading-none pt-[3px]"
                          style={{ fontSize: Math.round(rowH * 0.5), color: '#3a3e47', background: 'rgba(13,15,19,0.05)' }}
                        >
                          {team.totalKills ?? 0}
                        </div>

                        {/* total */}
                        <div
                          className="w-[96px] shrink-0 flex items-center justify-center text-white font-bebas leading-none"
                          style={{
                            background: podium ? themeGrad : INK,
                            fontSize: Math.round(rowH * 0.62),
                            boxShadow: `inset 0 -3px 0 ${primary}`,
                          }}
                        >
                          <span className="pt-[4px] -mr-[8px]">{team.total ?? 0}</span>
                        </div>

                        {/* one pass of light */}
                        <div
                          className="absolute top-0 bottom-0 w-[80px] pointer-events-none"
                          style={{
                            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)',
                            transform: 'translateX(-200%) skewX(-22deg)',
                            animation: `hp-sweep 1s ${0.6 + index * 0.06}s ease-in-out both`,
                            mixBlendMode: 'overlay',
                          }}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ═════════════ FOOTER: page dots ═════════════ */}
          <div className="relative h-[34px] flex items-center justify-between px-[18px]">
            <span className="font-[Righteous] text-[0.75rem] tracking-[0.18em] text-[#5b5f68] uppercase truncate">
              {tournament.tournamentName}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-[6px] shrink-0">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[7px] transition-all duration-500"
                    style={{
                      width: i === currentPage ? 34 : 14,
                      background: i === currentPage ? primary : '#c9ccd3',
                      clipPath: CUT_CHIP,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* electric bottom edge */}
          <div className="absolute left-[24px] right-0 bottom-0 h-[3px]" style={electric(primary, 4.5)} />
        </div>
      </motion.div>
    </div>
  );
};

export default HighlightPoints;