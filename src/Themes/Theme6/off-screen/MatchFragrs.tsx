import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
// NOTE: SocketManager import removed, along with the localMatchData mirror
// state and its two socket effects. PublicThemeRenderer owns the single
// socket connection and passes freshly-merged `matchData` down as a prop —
// this component now just reads that prop directly.
//
// ANIMATION NOTE:
// framer-motion is now only used on the outer container for a single,
// cheap opacity fade. Every per-card animation (entrance + the team-logo
// wipe reveal) runs on the GPU-accelerated `transform`/`opacity` CSS
// properties via keyframes, staggered with inline `animationDelay`. This
// avoids framer-motion recalculating a spring/tween per card per frame,
// which is what was making things feel sluggish with 5 cards animating
// at once.

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
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  knockouts?: number;
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

// Entrance timing: baseline is a 0.6s rise with a 0.15s stagger between
// cards. "Reduce speed by 40%" means the animation runs at 60% of that
// speed, i.e. takes 1 / 0.6 as long — so both duration and stagger are
// divided by 0.6, making the rise-from-below noticeably slower/heavier.
const SPEED_FACTOR = 0.6; // 60% speed = 40% slower
const ENTER_DURATION = 0.6 / SPEED_FACTOR; // 1.0s
const ENTER_STAGGER = 0.15 / SPEED_FACTOR; // 0.25s

// The wipe starts the instant each card finishes rising into place (so the
// only thing visible during the rise is the opaque logo box, not the
// photo/name/stats underneath). It then holds fully covered for a beat,
// and finally retreats upward and off — at which point the ENTIRE card's
// content (photo, name, stats, logos) fades in together in one go, rather
// than being progressively exposed by the wipe's own geometry.
const WIPE_HOLD_DURATION = 0.35; // stays fully covering before retreating
const WIPE_RETREAT_DURATION = 0.5; // time to slide fully off the top
const WIPE_TOTAL_DURATION = WIPE_HOLD_DURATION + WIPE_RETREAT_DURATION;
const WIPE_HOLD_PERCENT = (WIPE_HOLD_DURATION / WIPE_TOTAL_DURATION) * 100;

// The card's actual content stack (image + name + stats grid) reaches
// top:350 + height:286 = 636px, taller than the div's old fixed 416px.
// The card is sized to this so its border/background actually contain
// everything, and the wipe overlay (which fills the card via inset-0)
// stays inside the card's own box instead of spilling past it.
const CARD_VISUAL_HEIGHT = 636;

const MatchFragrs: React.FC<MatchFragrsProps> = ({ tournament, round, match, matchData }) => {
  const localMatchData = matchData ?? null;

  // Single-Match Fragger Score: same weighted formula as the Overall score,
  // fed just this match via buildFraggerPool([localMatchData]).
  // latestPlayerRaw is spread back in first so any live-only fields the
  // card reads survive into the final object.
  const topPlayers = useMemo(() => {
    if (!localMatchData) return [];

    const scored = computeFraggerScores(buildFraggerPool([localMatchData])).sort(compareFraggerScore);

    return scored.slice(0, 5).map(player => ({
      ...(player.latestPlayerRaw as any),
      ...player,
      killNum: player.totalKills,
      numericDamage: player.totalDamage,
      assists: player.totalAssists,
      knockouts: player.totalKnockouts,
    }));
  }, [localMatchData]);

  if (!localMatchData) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[AGENCYB]">No match data available</div>
      </div>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px] relative ">
      {/* Keyframes for the per-card entrance + team-logo wipe reveal.
          Rendered once here so class names stay stable across re-renders. */}
      <style>{`
        @keyframes fragr-card-enter {
          from { opacity: 0; transform: translate3d(0, 50px, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        /* The wipe no longer rises on its own — the parent .fragr-card's
           rise already carries it up into place while it's sitting at its
           resting position (fully covering, translate 0). Once the card
           has landed, this animation holds it covered a beat, then slides
           it up and fully off the top. */
        @keyframes fragr-wipe {
          0% { transform: translate3d(0, 0, 0); }
          ${WIPE_HOLD_PERCENT}% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(0, -100%, 0); }
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

        /* The whole card's content (photo, name, stats, logos) stays
           invisible the entire time it's covered and only fades in as one
           group once the wipe has fully retreated — so nothing is ever
           visible "underneath" the wipe as it moves. */
        .fragr-content-reveal {
          opacity: 0;
          animation-name: fragr-content-reveal;
          animation-duration: 0.2s;
          animation-timing-function: ease-out;
          animation-fill-mode: both;
        }

        .fragr-wipe {
          /* fill-mode "both" holds the 0% keyframe (fully covering) for
             the entire animation-delay too — so it's already sitting
             covered, rising along with the card, before its own retreat
             animation even starts. */
          animation-name: fragr-wipe;
          animation-duration: ${WIPE_TOTAL_DURATION}s;
          animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
          animation-fill-mode: both;
          will-change: transform;
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          color: `${tournament.primaryColor} `,
        }}
        className="w-[800px] text-[100px] font-[tungsten] absolute top-[60px] text-center bg-white h-[100px] flex items-center justify-center left-[550px]"
      >
        TOP FRAGGERS - MATCH {match?.matchNo}
      </div>

      {/* Round */}
      <div className="text-[58px] font-[agencyb] absolute  top-[150px] text-white w-[100%] flex items-center justify-center flex-col">
        <div
          style={{
            backgroundImage: `linear-gradient(to bottom right, ${tournament.primaryColor}, ${tournament.secondaryColor}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
          }}
          className='w-[400px] text-center absolute top-[10px]'
        >
          {round?.roundName.toUpperCase()}
        </div>
      </div>

      {/* Player Cards — outer motion.div kept minimal: just a container fade,
          no per-child motion instances. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap justify-center absolute top-[280px] left-[0px] w-full  font-[AGENCYB]"
      >
        {topPlayers.map((player, index) => {
          const enterDelay = index * ENTER_STAGGER;
          // Wipe starts covering-then-retreating the instant the card
          // finishes rising into place.
          const wipeDelay = enterDelay + ENTER_DURATION;
          // Content only appears once the wipe has fully cleared the card.
          const contentRevealDelay = wipeDelay + WIPE_TOTAL_DURATION;

          return (
            <div
              key={player._id}
              className="fragr-card relative w-[340px] bg-white m-4 border-2 border-gray-400 overflow-hidden"
              style={{ animationDelay: `${enterDelay}s`, height: `${CARD_VISUAL_HEIGHT}px` }}
            >
              {/* Everything the card actually shows lives in this one
                  group so it appears together, all at once, only once the
                  wipe has fully retreated — never piecemeal underneath it. */}
              <div
                className="fragr-content-reveal absolute inset-0"
                style={{ animationDelay: `${contentRevealDelay}s` }}
              >
                {/* Player Image */}
                <div className="w-full h-[340px] overflow-hidden absolute z-10">
                  <img
                    src={player.picUrl || '/def_char.avif'}
                    alt={player.playerName}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Rank */}
                <div className="absolute text-black text-[30px] ml-2 mt-2 z-30">#{index + 1}</div>

                {/* Team Logo (corner badge) */}
                {player.teamLogo && (
                  <div className="w-[70px] h-[65px] absolute right-[10px] top-[10px] z-30">
                    <img src={player.teamLogo} alt="team logo" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Team Logo Blurred Background */}
                {player.teamLogo && (
                  <div className="h-[205px] w-[100px] absolute left-[120px] top-[120px] z-0 scale-[2.5]">
                    <img
                      src={player.teamLogo}
                      alt="team logo"
                      className="w-full h-full object-contain blur-[1px] saturate-0 opacity-30"
                    />
                  </div>
                )}

                {/* Player Name */}
                <div className="w-full bg-black h-[80px] text-white absolute top-[280px] flex items-center justify-center z-20">
                  <div className="text-[50px]">{player.playerName.toUpperCase()}</div>
                </div>

                {/* Stats Grid */}
                <div
                  className="bg-red-800 w-full h-[286px] absolute top-[350px] flex z-10"
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, ${tournament.primaryColor}, ${tournament.secondaryColor}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
                  }}
                >
                  <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-0 p-4 text-white text-[50px]">
                    {/* DAMAGE */}
                    <div className="flex flex-col justify-center items-center">
                      <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[44px]">
                        {Math.floor(player.numericDamage) || '0'}
                      </div>
                      <div className="mt-2 text-[30px]">DAMAGE</div>
                    </div>

                    {/* KILLS */}
                    <div className="flex flex-col justify-center items-center">
                      <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[44px]">
                        {player.killNum || '0'}
                      </div>
                      <div className="mt-2 text-[30px]">KILLS</div>
                    </div>

                    {/* KNOCKOUTS */}
                    <div className="flex flex-col justify-center items-center">
                      <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[36px]">
                        {player.knockouts || '0'}
                      </div>
                      <div className="mt-2 text-[30px]">KNOCKOUTS</div>
                    </div>

                    {/* ASSISTS */}
                    <div className="flex flex-col justify-center items-center">
                      <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[36px]">
                        {player.assists || '0'}
                      </div>
                      <div className="mt-2 text-[30px]">ASSISTS</div>
                    </div>

                    {/* Team Name Bottom Bar */}
                    <div className="bg-white w-full h-[10%] absolute left-0 bottom-0 text-black text-[20px] text-center flex items-center justify-center">
                      {player.teamName.toUpperCase()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Team-logo wipe: rides up with the card during its rise
                  (fully covering the whole time), holds covered briefly
                  once landed, then retreats up and off — revealing the
                  content group above all at once. Sits above everything
                  (z-40) until it moves out of the way. */}
              {player.teamLogo && (
                <div
                  className="fragr-wipe absolute inset-0 z-40 flex items-center justify-center overflow-hidden"
                  style={{
                    animationDelay: `${wipeDelay}s`,
                    backgroundImage: `linear-gradient(to bottom right, ${tournament.primaryColor}, ${tournament.secondaryColor})`,
                  }}
                >
                  <img
                    src={player.teamLogo}
                    alt=""
                    className="w-[220px] h-[220px] object-contain drop-shadow-lg"
                  />
                </div>
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
};

export default MatchFragrs;