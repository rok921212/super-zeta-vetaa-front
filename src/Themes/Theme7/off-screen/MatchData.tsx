import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { isWinningPlacement, computeMatchStandings } from '../../shared/hooks/officialStandings';

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
  rank?: number;
  bHasDied: boolean;
  picUrl?: string;
  health: number;
  healthMax: number;
  liveState: number;
}

interface Team {
  _id: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
  wwcd?: number;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchDataProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

// How many ranking rows live on a single page of the ticker (5 per column x 2 columns)
const ROWS_PER_PAGE = 10;
// How long each page of the ranking ticker stays on screen
const PAGE_DURATION_MS = 10000;

const MatchDataComponent: React.FC<MatchDataProps> = ({ tournament, round, match, matchData }) => {
  const sortedTeams = useMemo(() => computeMatchStandings(matchData), [matchData]);

  const accentA = tournament.primaryColor || '#FFB020';
  const accentB = tournament.secondaryColor || '#FF3B5C';

  const topTeam = sortedTeams[0];
  const remainingTeams = sortedTeams.slice(1);

  // Chunk remaining teams into pages of ROWS_PER_PAGE so the ticker scales
  // with however many teams are actually in the lobby (not hardcoded to 20).
  const pages = useMemo(() => {
    const chunks: Team[][] = [];
    for (let i = 0; i < remainingTeams.length; i += ROWS_PER_PAGE) {
      chunks.push(remainingTeams.slice(i, i + ROWS_PER_PAGE));
    }
    return chunks.length ? chunks : [[]];
  }, [remainingTeams]);

  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    if (pages.length <= 1) return;
    const interval = setInterval(() => {
      setPageIndex(prev => (prev + 1) % pages.length);
    }, PAGE_DURATION_MS);
    return () => clearInterval(interval);
  }, [pages.length]);

  // Keep the visible page in range if the roster shrinks (e.g. team eliminated mid-match)
  useEffect(() => {
    if (pageIndex >= pages.length) setPageIndex(0);
  }, [pages.length, pageIndex]);

  const pageTeams = pages[pageIndex] || [];
  const pageMid = Math.ceil(pageTeams.length / 2);
  const leftTeams = pageTeams.slice(0, pageMid);
  const rightTeams = pageTeams.slice(pageMid);

  const chassisStyle: React.CSSProperties = {
    background:
      'radial-gradient(120% 140% at 15% 0%, #1a212c 0%, #0a0d12 45%, #05070a 100%)',
  };

  const gradientAccent = `linear-gradient(120deg, ${accentA}, ${accentB})`;

  if (!matchData) {
    return (
      <div
        className="w-[1920px] h-[1080px] flex items-center justify-center font-bebas text-[3rem] text-white tracking-[0.2em] uppercase"
        style={chassisStyle}
      >
        <span className="opacity-40">Awaiting Match Data</span>
      </div>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden" style={chassisStyle}>
      {/* Ambient hazard-stripe watermark, bottom-left, pure texture */}
      <div
        className="absolute left-0 bottom-0 w-[520px] h-[260px] opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(-45deg, ${accentA} 0px, ${accentA} 14px, transparent 14px, transparent 28px)`,
        }}
      />

      {/* ---------------- HEADER ---------------- */}
      <div className="absolute top-0 left-0 w-full h-[128px] flex items-stretch">
        {/* Angled title chip */}
        <div
          className="relative flex items-center pl-[36px] pr-[70px] h-full"
          style={{
            background: gradientAccent,
            clipPath: 'polygon(0 0, 100% 0, calc(100% - 46px) 100%, 0 100%)',
          }}
        >
          <span className="font-bebas text-white text-[54px] leading-none tracking-[0.04em] drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
            MATCH STANDINGS
          </span>
        </div>

        {/* Meta readout: tournament / round / match */}
        <div
          className="relative flex-1 flex items-center justify-between ml-[-30px] pl-[70px] pr-[48px] h-full"
          style={{
            background: 'linear-gradient(90deg, #10151c 0%, #0c1015 100%)',
            borderBottom: `2px solid ${accentA}55`,
          }}
        >
          <div className="flex items-center gap-[18px]">
            {tournament.torLogo && (
              <img src={tournament.torLogo} alt="" className="h-[54px] w-auto object-contain" />
            )}
            <div className="flex flex-col leading-none">
              <span className="font-bebas text-white text-[28px] tracking-[0.03em]">
                {tournament.tournamentName}
              </span>
              <span className="font-mono text-[15px] tracking-[0.25em] uppercase text-white/40 mt-[4px]">
                {round ? round.roundName : 'NO ROUND'}
                {tournament.day ? ` \u2022 ${tournament.day}` : ''}
              </span>
            </div>
          </div>

          <div
            className="font-mono text-[20px] tracking-[0.2em] uppercase px-[22px] py-[8px] text-white"
            style={{
              border: `1px solid ${accentA}66`,
              clipPath: 'polygon(12px 0, 100% 0, 100% 100%, 0 100%, 0 12px)',
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            {match ? (match.matchName ? match.matchName : `MATCH ${match.matchNo || match._matchNo}`) : 'NO MATCH'}
          </div>
        </div>
      </div>

      {/* ---------------- #1 TEAM SPOTLIGHT ---------------- */}
      {topTeam && (
        <motion.div
          key={topTeam._id}
          className="absolute left-[36px] top-[160px] w-[1848px] h-[220px]"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div
            className="relative w-full h-full flex items-stretch"
            style={{
              background: 'linear-gradient(90deg, #12161d 0%, #0d1117 100%)',
              border: `1px solid ${accentA}40`,
              clipPath: 'polygon(0 0, 100% 0, 100% 100%, 34px 100%, 0 calc(100% - 34px))',
            }}
          >
            {/* Leader stripe */}
            <div className="w-[14px] h-full" style={{ background: gradientAccent }} />

            {/* Rank hex + label */}
            <div className="flex flex-col items-center justify-center w-[150px] shrink-0">
              <div
                className="w-[92px] h-[92px] flex items-center justify-center relative"
                style={{
                  background: gradientAccent,
                  clipPath:
                    'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                }}
              >
                <span className="font-bebas text-[46px] text-[#0a0d12] leading-none">1</span>
              </div>
              <span className="font-mono text-[13px] tracking-[0.3em] text-white/40 mt-[10px]">RANK</span>
            </div>

            {/* Player photo strip */}
            <div className="flex items-center gap-[10px] py-[16px] shrink-0">
              {topTeam.players.slice(0, 4).map(player => (
                <div
                  key={player._id}
                  className="relative w-[150px] h-[188px] overflow-hidden"
                  style={{
                    clipPath: 'polygon(0 0, 100% 0, 100% 88%, 88% 100%, 0 100%)',
                    border: `1px solid ${accentA}33`,
                    opacity: player.bHasDied ? 0.35 : 1,
                  }}
                >
                  <img
                    src={player.picUrl ? player.picUrl : '/def_char.avif'}
                    alt={player.playerName}
                    className="w-full h-full object-cover"
                  />
                  <div
                    className="absolute bottom-0 left-0 right-0 py-[4px] px-[8px] font-mono text-[13px] tracking-[0.05em] text-white/90 truncate"
                    style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.85), transparent)' }}
                  >
                    {player.playerName}
                  </div>
                </div>
              ))}
            </div>

            {/* Team identity */}
            <div className="flex items-center gap-[18px] px-[36px] border-l border-white/10 shrink-0">
              <div className="w-[76px] h-[76px] flex items-center justify-center bg-white/5 p-[6px]">
                <img
                  src={topTeam.teamLogo || '/def_logo.png'}
                  alt={topTeam.teamTag}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex flex-col leading-none gap-[10px]">
                <span className="font-bebas text-white text-[46px] tracking-[0.02em]">{topTeam.teamTag}</span>
                {topTeam.placePoints === 10 && (
                  <div className="flex items-center gap-[8px]">
                    <img src="/chicken.avif" alt="" className="w-[26px] filter invert brightness-[3]" />
                    <span
                      className="font-mono text-[14px] tracking-[0.2em] uppercase"
                      style={{ color: accentA }}
                    >
                      Chicken Dinner
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Stat readout */}
            <div className="flex items-stretch flex-1 justify-end pr-[48px]">
              {[
                { label: 'KILL PTS', value: topTeam.totalKills },
                { label: 'PLACE PTS', value: topTeam.placePoints },
                { label: 'TOTAL PTS', value: topTeam.total },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className={`flex flex-col items-center justify-center px-[42px] ${i !== 0 ? 'border-l border-white/10' : ''}`}
                >
                  <span
                    className="font-bebas text-[64px] leading-none"
                    style={{ color: i === 2 ? accentA : '#ffffff' }}
                  >
                    {stat.value}
                  </span>
                  <span className="font-mono text-[14px] tracking-[0.25em] text-white/40 mt-[6px]">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ---------------- RANKING TICKER ---------------- */}
      <div className="absolute left-[36px] top-[408px] w-[1848px]">
        <div className="grid grid-cols-2 gap-x-[24px]">
          {[leftTeams, rightTeams].map((column, colIdx) => (
            <div key={colIdx} className="flex flex-col">
              {/* Column header */}
              <div
                className="h-[38px] flex items-center px-[18px] mb-[10px] font-mono text-[14px] tracking-[0.2em] uppercase text-[#0a0d12]"
                style={{ background: gradientAccent }}
              >
                <span className="w-[64px]">#</span>
                <span className="flex-1 pl-[54px]">Team</span>
                <div className="grid grid-cols-3 w-[300px] text-center gap-x-[4px]">
                  <span>Kills</span>
                  <span>Place</span>
                  <span>Total</span>
                </div>
              </div>

              <AnimatePresence mode="popLayout">
                {column.map((team, index) => {
                  const rank = remainingTeams.findIndex(t => t._id === team._id) + 2;
                  const won = isWinningPlacement(team.placePoints, (team.players?.[0] as any)?.rank);
                  return (
                    <motion.div
                      key={`${pageIndex}-${team._id}`}
                      className="relative w-full h-[62px] flex items-center mb-[8px]"
                      style={{ background: 'linear-gradient(90deg, #171c24 0%, #12161c 100%)' }}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: index * 0.06, duration: 0.35 }}
                    >
                      {/* Rank block */}
                      <div
                        className="h-full w-[64px] flex items-center justify-center font-bebas text-white text-[28px] shrink-0"
                        style={{ background: 'rgba(255,255,255,0.04)', borderRight: `2px solid ${accentA}55` }}
                      >
                        {rank}
                      </div>

                      {/* Logo */}
                      <div className="w-[42px] h-[42px] flex items-center justify-center ml-[14px] shrink-0">
                        <img
                          src={team.teamLogo || '/def_logo.avif'}
                          alt={team.teamTag}
                          className="w-full h-full object-contain"
                        />
                      </div>

                      {/* Tag */}
                      <div className="flex items-center gap-[8px] pl-[14px] flex-1 min-w-0">
                        <span className="font-bebas text-white text-[26px] tracking-[0.02em] truncate">
                          {team.teamTag}
                        </span>
                        {won && (
                          <img src="/chicken.avif" alt="" className="w-[20px] shrink-0 filter invert brightness-[3]" />
                        )}
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 w-[300px] text-center font-mono text-[22px] text-white/90 shrink-0">
                        <span>{team.totalKills}</span>
                        <span>{team.placePoints}</span>
                        <span style={{ color: accentA }}>{team.total}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------- FOOTER / PAGE INDICATOR ---------------- */}
      {pages.length > 1 && (
        <div className="absolute bottom-[26px] right-[48px] flex items-center gap-[8px]">
          {pages.map((_, i) => (
            <div
              key={i}
              className="h-[6px] transition-all duration-300"
              style={{
                width: i === pageIndex ? '32px' : '14px',
                background: i === pageIndex ? gradientAccent : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MatchDataComponent;