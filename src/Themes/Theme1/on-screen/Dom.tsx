import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchData, Player } from '../../shared/hooks/unsortteams';
import { useKillMilestones, MilestoneType } from '../../shared/hooks/killMilestones';
// NOTE: SocketManager import removed, along with handleSocketUpdate's manual
// patch-shape merging. PublicThemeRenderer owns the single socket
// connection and passes freshly-merged `matchData` down as a prop on every
// 'bulkUpdate' — this component just reacts to that prop changing, same as
// the Theme2 conversion of this file and Alerts.tsx above.

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
  const [displayedPlayer, setDisplayedPlayer] = useState<(Player & { teamTag: string; teamLogo: string; milestone: string }) | null>(null);

  const displayTimerRef = useRef<number | null>(null);

  const showAlert = useCallback((alertData: any) => {
    setDisplayedPlayer(alertData);
    setIsVisible(true);
    if (displayTimerRef.current) clearTimeout(displayTimerRef.current);
    displayTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      setDisplayedPlayer(null);
      displayTimerRef.current = null;
    }, DISPLAY_MS);
  }, []);

  // Shared milestone detection — full set (first blood, 3/5/8 streaks,
  // grenade, vehicle, 500+ damage, airdrop), same as every other theme.
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

  if (!matchData) {
    return (
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }

  if (!isVisible || !displayedPlayer) {
    return null;
  }

  return (
    <div className="w-[1920px] h-[1080px] flex justify-start items-center relative  ">
      <AnimatePresence>
        {isVisible && displayedPlayer && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.5 }}
            className="w-[300px] h-[300px] bg-[#0000009d] absolute top-[340px] left-0"
          >
            {/* Team Logo */}
            <div className="w-[120px] h-[120px]">
              <div
                style={{
                  background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                }}
                className='w-[70%] h-[70%] bg-white relative left-[240px] top-[-30px]'
              >
                <img
                  src={displayedPlayer.teamLogo || "/def_logo.png"}
                  alt={displayedPlayer.teamTag}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Player Image */}
            <div className="w-[300px] h-[290px] relative top-[-110px]">
              <img
                src={displayedPlayer.picUrl || '/def_char.png'}
                alt={displayedPlayer.playerName}
                className="w-full h-full"
              />
            </div>

            {/* Player Info */}
            <div className="flex-1 text-center">
              {/* Kill Streak Message */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                }}
                className="text-4xl font-bold text-yellow-400 p-[10px] w-[300px] tracking-wider font-[Righteous] relative top-[-120px]"
              >
                {displayedPlayer.milestone}
              </div>

              {/* Player Name */}
              <div className="text-2xl font-bold text-black bg-white w-[300px] h-[40px] top-[-133px] relative">
                {displayedPlayer.playerName}
              </div>

              {/* Kill Count */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
                }}
                className="text-4xl font-bold text-white relative top-[-140px]"
              >
                {Math.max(0, displayedPlayer.killNum || 0)} KILLS
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default Dom;
