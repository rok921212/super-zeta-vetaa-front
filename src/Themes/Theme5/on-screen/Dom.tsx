import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchData, Player } from '../../shared/hooks/unsortteams';
import { useKillMilestones, MilestoneType } from '../../shared/hooks/killMilestones';
// NOTE: SocketManager import removed, along with handleSocketUpdate's
// manual patch-shape merging and the localMatchData mirror it wrote into.
// PublicThemeRenderer owns the single socket connection and passes
// freshly-merged `matchData` down as a prop on every 'bulkUpdate' — this
// component just reacts to that prop changing now, same as the Theme2
// conversion.
//
// Player / MatchData are imported from useSortedTeams rather than
// redeclared locally — two same-named-but-different-shaped interfaces are
// unrelated types to TypeScript.

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

interface DomProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const DISPLAY_MS = 6000;
const EXIT_ANIM_MS = 600; // keep in sync with the motion.div transition below

// This theme's label for each shared milestone type.
const LABELS: Record<MilestoneType, string> = {
  firstBlood: 'FIRST BLOOD',
  streak3: 'DOMINATION',
  streak5: 'RAMPAGE',
  streak8: 'UNSTOPPABLE',
  grenadeKill: 'GRENADE KILL',
  vehicleKill: 'VEHICLE KILL',
  damage: '500+ DAMAGE',
  airdrop: 'AIRDROP LOOTED',
  distanceKill: '300m KILL',
};

const Dom: React.FC<DomProps> = React.memo(({ tournament, round, match, matchData }) => {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [displayedPlayer, setDisplayedPlayer] = useState<
    (Player & { teamTag: string; teamLogo: string; milestone: string }) | null
  >(null);

  const displayTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  const showAlert = useCallback((alertData: Player & { teamTag: string; teamLogo: string; milestone: string }) => {
    setDisplayedPlayer(alertData);
    setIsVisible(true);
    if (displayTimerRef.current) clearTimeout(displayTimerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    displayTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      exitTimerRef.current = window.setTimeout(() => {
        setDisplayedPlayer(null);
        displayTimerRef.current = null;
        exitTimerRef.current = null;
      }, EXIT_ANIM_MS);
    }, DISPLAY_MS);
  }, []);

  // Shared milestone detection — full set, same as every other theme.
  // Resets its trackers on match switch.
  const milestone = useKillMilestones(matchData, match, { damageThreshold: 500 });

  useEffect(() => {
    if (!milestone) return;
    showAlert({
      ...milestone.player,
      teamTag: milestone.teamTag,
      teamLogo: milestone.teamLogo,
      milestone: LABELS[milestone.type],
    });
  }, [milestone, showAlert]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (displayTimerRef.current) clearTimeout(displayTimerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
  }, []);

  if (!matchData) {
    return null;
  }

  if (!isVisible || !displayedPlayer) {
    return null;
  }

  return (
    <div className="w-[1920px] h-[1080px] text-white p-8 relative">
      <AnimatePresence>
        {isVisible && displayedPlayer && (
          <motion.div
            key={displayedPlayer._id}
            initial={{ x: -600, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -600, opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              clipPath: "polygon(0 0, 94% 0, 100% 20%, 100% 100%, 0% 100%)",
            }}
            className="w-[600px] h-[150px] bg-black absolute top-[500px] left-[-10px]"
          >
            <div className="w-full h-full relative">
              <div className="w-[30%] h-full bg-gradient-to-br from-[#ffffff] to-[#a5a5a5]" />
              <img
                src={displayedPlayer.picUrl || "/def_char.avif"}
                alt="Player or Team Logo"
                className="w-[200px] h-[200px] object-contain absolute top-0"
              />
              <div
                className="w-[70%] h-[70%] absolute top-0 left-[180px] text-center"
                style={{
                  backgroundImage: `linear-gradient(to bottom right, ${tournament.primaryColor || '#6b21a8'}, ${tournament.secondaryColor || '#c084fc'}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundBlendMode: "screen",
                }}
              >
                <div
                  className="font-[Awaking] mt-0 text-[4.4rem]"
                  style={{ textShadow: "2px 2px 0px rgba(0,0,0,0.6)" }}
                >
                  {displayedPlayer.milestone}
                </div>
              </div>
              <div className="w-[440px] top-[100px] absolute pl-[10px] left-[180px] text-center h-[60px] bg-gradient-to-l from-[#ffa300] to-[#f9df67]">
                <img src={displayedPlayer.teamLogo || "/def_logo.avif"} alt="" className='w-[50px] h-[60px] bg-[#040404bd] absolute left-[0px] top-1/2 transform -translate-y-1/2'/>
                <div className="font-[AGENCYB] text-[2.3rem] text-black">{displayedPlayer.playerName}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default Dom;
