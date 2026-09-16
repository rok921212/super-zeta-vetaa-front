// src/components/OverallFrags.tsx
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';

// ANIMATION NOTE (ported from MatchFragrs.tsx):
// Per-card motion.div instances are gone. Each card now: (1) rises from
// below fully covered by an opaque team-logo box — nothing underneath is
// ever visible during the rise, (2) holds fully covered for a beat,
// (3) the logo box retreats up and off, and only then (4) does the card's
// entire content (photo, name, stats, logos) fade in together as one
// group, rather than being progressively exposed by the wipe's geometry.
// The outer page-level motion.div fade is left as-is — that's the one
// "minimal" framer-motion instance, same as MatchFragrs.

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
  damage?: string;
  survivalTime?: number;
  assists?: number;
  health: number;
  healthMax: number;
  liveState: number;
  numericDamage?: number; // computed
  knockouts?: number;
}

interface Team {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  slot: number;
  placePoints: number;
  wwcd?: number;
  players: Player[];
  matchesPlayed?: number;
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

interface OverallFragsProps {
  tournament: Tournament;
  round?: Round | null;
  overallData?: OverallData | null;
  matchDatas?: MatchData[];
}

// Same timing model as MatchFragrs.tsx — see that file for the full
// rationale. Kept as separate constants here (rather than a shared
// import) since each component owns its own <style> block.
const SPEED_FACTOR = 0.6; // 60% speed = 40% slower than the 0.6s/0.15s baseline
const ENTER_DURATION = 0.6 / SPEED_FACTOR; // 1.0s
const ENTER_STAGGER = 0.15 / SPEED_FACTOR; // 0.25s

const WIPE_HOLD_DURATION = 0.35; // stays fully covering before retreating
const WIPE_RETREAT_DURATION = 0.5; // time to slide fully off the top
const WIPE_TOTAL_DURATION = WIPE_HOLD_DURATION + WIPE_RETREAT_DURATION;
const WIPE_HOLD_PERCENT = (WIPE_HOLD_DURATION / WIPE_TOTAL_DURATION) * 100;

const OverallFrags: React.FC<OverallFragsProps> = ({ tournament, round, overallData, matchDatas: rawMatchDatas }) => {
  const matchDatas = useMemo(() => rawMatchDatas || [], [rawMatchDatas]);
  // Renders straight from the `overallData` prop. PublicThemeRenderer owns the
  // round-standings stream (HTTP bulk + `overallDataUpdate` socket deltas) and
  // never persists it — no localStorage shadow here, because a stale cached
  // standings frame must never paint. `overallData` null right after a reload
  // just shows the "No data available" branch below until hydration lands.

  // Overall Fragger Score: pool every player-appearance across the round's
  // matchDatas (previously not even accepted as a prop here, so this
  // component ranked off overallData.teams' single-snapshot totals only)
  // instead of the old plain kills→damage→assists sort. KNOCKOUTS is now
  // shown as a per-match average (avgKnockouts), matching how DAMAGE and
  // ASSISTS are already displayed as averages — previously this used
  // totalKnockouts (a running total), which was inconsistent with the
  // other two stat boxes.
  const topPlayers = useMemo(() => {
    if (!overallData || matchDatas.length === 0) return [];

    const scored = computeFraggerScores(buildFraggerPool(matchDatas)).sort(compareFraggerScore);

    return scored.slice(0, 5).map((player) => ({
      ...player,
      killNum: player.totalKills,
      numericDamage: player.avgDamage,
      assists: player.avgAssists,
      knockouts: player.avgKnockouts,
      matchesPlayed: player.appearances,
    }));
  }, [overallData, matchDatas]);

  if (!overallData) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center text-white text-2xl">
        No data available
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
    >
      <style>{`
        @keyframes fragr-card-enter {
          from { opacity: 0; transform: translate3d(0, 550px, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        /* Cover-then-retreat only — the parent .fragr-card's own rise is
           what carries this up into place while it sits at its resting,
           fully-covering position (translate 0). Once landed, holds
           covered for a beat, then slides up and off. The final keyframe
           also drops opacity to 0, so once it's done it's gone for good —
           no dependence on overflow-hidden or exactly matching the card's
           height to its content to keep it from lingering off-box. */
        @keyframes fragr-wipe {
          0% { transform: translate3d(0, 0, 0); opacity: 1; }
          ${WIPE_HOLD_PERCENT}% { transform: translate3d(0, 0, 0); opacity: 1; }
          100% { transform: translate3d(0, -100%, 0); opacity: 0; }
        }

        @keyframes fragr-content-reveal {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .fragr-card {
          opacity: 0;
          animation-name: fragr-card-enter;
          animation-duration: ${ENTER_DURATION}s;
          animation-timing-function: ease-out;
          animation-fill-mode: forwards;
        }

        /* Whole card content stays invisible until the wipe has fully
           retreated, then fades in as one group — never piecemeal
           underneath the wipe as it moves. */
        .fragr-content-reveal {
          opacity: 0;
          animation-name: fragr-content-reveal;
          animation-duration: 0.2s;
          animation-timing-function: ease-out;
          animation-fill-mode: both;
        }

        .fragr-wipe {
          animation-name: fragr-wipe;
          animation-duration: ${WIPE_TOTAL_DURATION}s;
          animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
          animation-fill-mode: both;
          will-change: transform, opacity;
        }
      `}</style>

      <div className="w-[1920px] h-[1080px] flex font-bebas-neue font-[500] ">
        <div
          className="font-[Awaking] text-[140px] leading-[1] absolute top-[30px] left-[270px] font-[700] bg-gradient-to-l from-[#ffa300] to-[#f9df67] text-transparent bg-clip-text drop-shadow-[0px_7px_10px_rgba(0,0,0,0.3)] scale-y-[1.4]"
        >
          OVERALL FRAGGERS
        </div>

        {/* Tournament Header */}
        <div
          style={{
            backgroundImage: `linear-gradient(to left, transparent, ${tournament.primaryColor})`,
            clipPath: "polygon(30px 0%, 100% 0%, 100% 100%, 30px 100%, 0% 50%)",
          }}
          className="w-[1000px] h-[55px] absolute left-[260px] top-[210px] text-white font-bebas-neue font-[700] text-[2.5rem] tracking-wide"
        >
          <div className="relative top-[-5px] left-[50px] font-[agencyb]">
            {tournament.tournamentName} | {round?.roundName}
          </div>
        </div>

        <div className="flex flex-wrap justify-center space-x-4">
          {topPlayers.map((player, index) => {
            const enterDelay = index * ENTER_STAGGER;
            // Wipe starts covering-then-retreating the instant the card
            // finishes rising into place.
            const wipeDelay = enterDelay + ENTER_DURATION;
            // Content only appears once the wipe has fully cleared the card.
            const contentRevealDelay = wipeDelay + WIPE_TOTAL_DURATION;

            return (
              <div
                className="fragr-card flex mb-[20px] relative left-[35px] top-[350px] font-[AGENCYB]"
                key={player.uId || index}
                style={{ animationDelay: `${enterDelay}s` }}
              >
                <div
                  className="bg-[#ffffff] border-solid border-red-800 w-[340px] h-[416px] mr-[20px] border-[2px] scale-95 relative"
                  style={{ borderColor: tournament?.primaryColor }}
                >
                  {/* Everything the card actually shows lives in this one
                      group so it appears together, all at once, only once
                      the wipe has fully retreated. */}
                  <div
                    className="fragr-content-reveal absolute inset-0"
                    style={{ animationDelay: `${contentRevealDelay}s` }}
                  >
                    {/* Player Photo */}
                    <div className="w-[340px] h-[340px] absolute top-[-50px] left-0 overflow-hidden z-20">
                      <img
                        src={player.picUrl || "/def_char.avif"}
                        alt={player.playerName || "player image"}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Rank */}
                    <div className="text-black text-[30px] ml-[10px] absolute z-10">
                      #{index + 1}
                    </div>

                    {/* Team Logo */}
                    {player.teamLogo && (
                      <>
                        <div className="w-[70px] h-[65px] absolute right-[10px] top-[10px] z-0">
                          <img src={player.teamLogo || "/def_logo.avif"} alt="team logo" className="bg-cover" />
                        </div>

                        <div className="h-[65px] absolute left-[10px] top-[80px] z-0">
                          <img
                            src={player.teamLogo || "/def_logo.avif"}
                            alt="team logo"
                            className="bg-cover transform blur-sm saturate-0 opacity-[30%]"
                          />
                        </div>
                      </>
                    )}

                    {/* Player Name */}
                    <div className="w-[100%] bg-black text-white h-[80px] absolute top-[280px] z-50">
                      <div className="text-[50px] text-center" >
                        {player.playerName.toUpperCase()}
                      </div>
                    </div>

                    {/* Stats Box */}
                    <div
                      className="bg-red-800 w-[100%] h-[286px] absolute top-[350px] z-10 flex"
                      style={{
                        backgroundImage: `linear-gradient(to bottom right, ${tournament?.primaryColor}, ${tournament?.secondaryColor}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
                      }}
                    >
                      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-0 p-4 text-white text-[50px] mb-0 mt-0 relative">
                        {/* DAMAGE */}
                        <div className="flex flex-col justify-center items-center">
                          <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[44px]">
                            {Math.floor(player.numericDamage || 0)}
                          </div>
                          <div className="mt-2 text-[30px]">AVG DMG</div>
                        </div>

                        {/* KILLS */}
                        <div className="flex flex-col justify-center items-center">
                          <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[44px]">
                            {player.killNum || 0}
                          </div>
                          <div className="mt-2 text-[30px]">KILLS</div>
                        </div>

                        {/* KNOCKOUTS */}
                        <div className="flex flex-col justify-center items-center">
                          <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[36px]">
                            {Math.floor(player.knockouts || 0)}
                          </div>
                          <div className="mt-2 text-[30px]">AVG KO</div>
                        </div>

                        {/* ASSISTS */}
                        <div className="flex flex-col justify-center items-center">
                          <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[36px]">
                            {Math.floor(player.assists || 0)}
                          </div>
                          <div className="mt-2 text-[30px]">AVG AST</div>
                        </div>

                        <div className="bg-white w-full h-[10%] absolute left-0 bottom-0 text-black text-[20px] text-center">
                          {player.teamName.toUpperCase()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Team-logo wipe: rides up with the card during its rise
                      (fully covering the whole time since it sits at its
                      resting position), holds covered briefly once landed,
                      then retreats up and off — revealing the content
                      group above all at once. z-[60] keeps it above even
                      the name bar (z-50). */}
                  {player.teamLogo && (
                    <div
                      className="fragr-wipe absolute inset-0 z-[60] flex items-center justify-center overflow-hidden"
                      style={{
                        animationDelay: `${wipeDelay}s`,
                        backgroundImage: `linear-gradient(to bottom right, ${tournament?.primaryColor}, ${tournament?.secondaryColor})`,
                      }}
                    >
                      <img
                        src={player.teamLogo || "/def_logo.avif"}
                        alt=""
                        className="w-[220px] h-[220px] object-contain drop-shadow-lg"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export default OverallFrags;