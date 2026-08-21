import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchData, Player } from '../../shared/hooks/unsortteams';
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

const Dom: React.FC<DomProps> = React.memo(({ tournament, round, match, matchData }) => {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [displayedPlayer, setDisplayedPlayer] = useState<(Player & { teamTag: string; teamLogo: string; milestone: string }) | null>(null);

  // Refs to remember "previous tick" values per player, so a milestone
  // only fires once when a counter crosses a threshold.
  const prevDataRef = useRef<any[]>([]);
  const prevKillsMap = useRef<{ [key: string]: number }>({});
  const displayTimerRef = useRef<number | null>(null);
  const firstBloodTriggered = useRef(false);

  // Track match id so trackers reset when the match itself changes.
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);

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

  // Milestone detection — runs whenever the matchData PROP changes, instead
  // of inside a socket patch handler. Same detection logic as before, just
  // triggered by prop updates rather than raw socket events.
  useEffect(() => {
    if (!matchData) return;

    const newId = matchData._id?.toString() ?? null;
    if (newId !== matchDataIdRef.current) {
      matchDataIdRef.current = newId;
      prevDataRef.current = [];
      prevKillsMap.current = {};
      firstBloodTriggered.current = false;
    }

    const combinedData = matchData.teams
      .flatMap(team => team.players.map(player => ({ _id: player._id, killNum: player.killNum || 0 })))
      .sort((a, b) => a._id.localeCompare(b._id));

    const prevDataSorted = [...prevDataRef.current].sort((a: any, b: any) => a._id.localeCompare(b._id));

    if (JSON.stringify(combinedData) === JSON.stringify(prevDataSorted)) {
      return; // unchanged, nothing to do
    }

    prevDataRef.current = combinedData;

    let alertData: any = null;
    let triggered = false;

    // First blood
    if (!firstBloodTriggered.current) {
      outer: for (const team of matchData.teams) {
        for (const player of team.players) {
          const currentKills = player.killNum || 0;
          const previousKills = prevKillsMap.current[player.playerName] || 0;
          if (currentKills === 1 && previousKills === 0) {
            alertData = { ...player, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: 'FIRST BLOOD' };
            triggered = true;
            firstBloodTriggered.current = true;
            break outer;
          }
        }
      }
    }

    // Kill streaks (most recent first)
    if (!triggered) {
      outer2: for (let ti = matchData.teams.length - 1; ti >= 0; ti--) {
        const team = matchData.teams[ti];
        for (let pi = team.players.length - 1; pi >= 0; pi--) {
          const player = team.players[pi];
          const currentKills = player.killNum || 0;
          const previousKills = prevKillsMap.current[player.playerName] || 0;
          if (currentKills > previousKills) {
            if (currentKills >= 8 && previousKills < 8) {
              alertData = { ...player, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: 'UNSTOPPABLE' };
            } else if (currentKills >= 5 && previousKills < 5) {
              alertData = { ...player, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: 'RAMPAGE' };
            } else if (currentKills >= 3 && previousKills < 3) {
              alertData = { ...player, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: 'DOMINATION' };
            }
            if (alertData) {
              triggered = true;
              break outer2;
            }
          }
        }
      }
    }

    // Update kills map
    matchData.teams.forEach(team => {
      team.players.forEach(player => {
        prevKillsMap.current[player.playerName] = player.killNum || 0;
      });
    });

    if (triggered && alertData) {
      showAlert(alertData);
    }
  }, [matchData, showAlert]);

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
