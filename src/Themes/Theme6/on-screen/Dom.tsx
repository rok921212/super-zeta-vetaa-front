import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useKillMilestones, MilestoneType } from '../../shared/hooks/killMilestones';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// freshly-merged `matchData` down as a prop. Milestone DETECTION (first
// blood, kill streaks, grenade / vehicle / damage / airdrop / 300m kill)
// is the shared useKillMilestones hook — this file only maps the milestone
// type to its label (note this theme's spellings: UNSTOPABLE, VEHICLE
// ELIM, GRENADE ELIM, 600+ DAMAGE, 300m KILL) and renders its own card.
// The .dom-alert-* CSS classes below replace the old framer-motion anim.

// ─── Types ────────────────────────────────────────────────────────────────────

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
  teamName: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;
  health: number;
  healthMax: number;
  liveState: number;
  killNumInVehicle?: number;
  killNumByGrenade?: number;
  gotAirDropNum?: number;
  damage?: number;
  maxKillDistance?: number;
}

interface Team {
  _id: string;
  teamName: string;
  teamTag: string;
  teamId?: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface AlertPlayer extends Player {
  teamTag: string;
  teamLogo: string;
  milestone: string;
}

interface DomProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const DISPLAY_MS   = 6000;
const EXIT_ANIM_MS = 600;

// This theme's label for each shared milestone type (note the spellings).
const LABELS: Record<MilestoneType, string> = {
  firstBlood: 'FIRST BLOOD',
  streak3: 'DOMINATION',
  streak5: 'RAMPAGE',
  streak8: 'UNSTOPABLE',
  grenadeKill: 'GRENADE ELIM',
  vehicleKill: 'VEHICLE ELIM',
  damage: '600+ DAMAGE',
  airdrop: 'AIRDROP LOOTED',
  distanceKill: '300m KILL',
};

const Dom: React.FC<DomProps> = React.memo(({ tournament, match, matchData }) => {
  const [isVisible,      setIsVisible]      = useState(false);
  const [displayedPlayer, setDisplayedPlayer] = useState<AlertPlayer | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show alert banner. isVisible drives the .dom-alert-visible /
  // .dom-alert-hidden CSS classes below instead of framer-motion's
  // initial/animate/exit props.
  const showAlert = useCallback((player: AlertPlayer) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    setDisplayedPlayer(player);
    // Start hidden, then flip to visible a frame later so the browser has
    // committed the "off-screen" transform first — otherwise the browser
    // may coalesce both state changes into one paint and the transition
    // never plays.
    setIsVisible(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setIsVisible(true)));

    timerRef.current = setTimeout(() => {
      setIsVisible(false);
      timerRef.current = setTimeout(() => {
        setDisplayedPlayer(null);
        timerRef.current = null;
      }, EXIT_ANIM_MS + 100);
    }, DISPLAY_MS);
  }, []);

  // Shared milestone detection. damageThreshold 600 and distanceThreshold
  // 30000 (maxKillDistance is in cm; 300m) keep this theme's thresholds.
  // Resets its trackers on match switch.
  const milestone = useKillMilestones(matchData, match, {
    damageThreshold: 600,
    distanceThreshold: 30000,
  });

  useEffect(() => {
    if (!milestone) return;
    showAlert({
      ...(milestone.player as AlertPlayer),
      teamTag: milestone.teamTag,
      teamLogo: milestone.teamLogo,
      milestone: LABELS[milestone.type],
    });
  }, [milestone, showAlert]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (!matchData || !displayedPlayer) return null;

  const primary   = tournament.primaryColor  || '#6b21a8';
  const secondary = tournament.secondaryColor || '#c084fc';

  return (
    <div className="w-[1920px] h-[1080px] text-white relative overflow-hidden">
      <style>{`
        .dom-alert-card {
          transition: transform 0.55s cubic-bezier(0.32, 0, 0.67, 0),
                      opacity 0.55s cubic-bezier(0.32, 0, 0.67, 0);
          will-change: transform, opacity;
        }
        .dom-alert-hidden {
          transform: translateX(-110%);
          opacity: 0;
        }
        .dom-alert-visible {
          transform: translateX(0);
          opacity: 1;
        }
      `}</style>

      <div
        key={displayedPlayer._id + displayedPlayer.milestone}
        className={`dom-alert-card absolute top-[500px] left-[-10px] w-[400px] h-[450px] ${
          isVisible ? 'dom-alert-visible' : 'dom-alert-hidden'
        }`}
      >
        <div className="w-full h-full relative">

          {/* Background gradient */}
          <div
            style={{ backgroundImage: `linear-gradient(to left top, ${primary}, ${secondary})` }}
            className="absolute inset-0 w-full h-full"
          />

          {/* Player + team logo layer */}
          <div className="absolute top-[5px] w-[475px] h-[175px]">

            {/* Small team logo top-right */}
            <img
              src={displayedPlayer.teamLogo}
              alt=""
              className="w-[80px] h-[80px] absolute top-[2px] left-[307px]"
              loading="eager"
              decoding="async"
            />

            {/* Faded background team logo */}
            <img
              src={displayedPlayer.teamLogo}
              alt=""
              className="absolute w-[300px] h-[300px] grayscale opacity-30 left-[50px] top-[20px]"
              loading="eager"
              decoding="async"
            />

            {/* Player image */}
            <img
              src={displayedPlayer.picUrl || '/def_char.avif'}
              alt={displayedPlayer.playerName}
              className="w-full h-full object-contain absolute z-10 scale-[2.2] left-[-30px] top-[-10px]"
              loading="eager"
              decoding="async"
            />

            {/* Info panel */}
            <div
              className="absolute top-[270px] left-[10px] w-[82%] h-full"
              style={{ backgroundImage: `linear-gradient(to bottom right, ${primary}, ${secondary})` }}
            >
              {/* Team name bar */}
              <div
                style={{
                  backgroundImage: `url('/theme3assets/lines.avif')`,
                  backgroundSize: '300px',
                  backgroundRepeat: 'repeat',
                }}
                className="w-full h-[25%] bg-black relative overflow-hidden font-[AGENCYB] text-[30px] text-center"
              >
                {displayedPlayer.teamName.toUpperCase()}
              </div>

              {/* Player name */}
              <div className="font-[TUNGSTEN] text-[70px] text-center relative top-[-10px]">
                {displayedPlayer.playerName.toUpperCase()}
              </div>

              {/* Milestone bar */}
              <div
                style={{
                  backgroundImage: `url('/theme3assets/lines.avif')`,
                  backgroundSize: '300px',
                  backgroundRepeat: 'repeat',
                }}
                className="w-full h-[25%] bg-black absolute top-[133px] font-[AGENCYB] text-[38px] text-center"
              >
                <div className="relative top-[-7px]">
                  {displayedPlayer.milestone.toUpperCase()}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
});

Dom.displayName = 'Dom';
export default Dom;