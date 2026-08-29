import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MatchData, Player } from '../../shared/hooks/unsortteams';
import { useKillMilestones, MilestoneType } from '../../shared/hooks/killMilestones';
// NOTE: SocketManager import removed, along with handleSocketUpdate's
// manual patch-shape merging. PublicThemeRenderer owns the single socket
// connection and passes freshly-merged `matchData` down as a prop on every
// 'bulkUpdate' — this component just reacts to that prop changing, same as
// Theme2/on-screen/Dom.tsx and this theme's own Alerts.tsx/LiveStats.tsx.
//
// Player / MatchData are imported from useSortedTeams rather than
// redeclared locally, same reason as the other converted theme files: two
// same-named-but-different-shaped interfaces are unrelated types to
// TypeScript. The shared Player interface has a `[key: string]: any`
// fallback, so the extra fields this file reads (killNumByGrenade,
// killNumInVehicle, damage, gotAirDropNum) still work without needing to
// be declared on the shared type.

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
const EXIT_ANIM_MS = 500; // keep in sync with .dom-card transition duration below

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
  const [isVisible, setIsVisible] = useState(false); // drives CSS transition, not framer-motion
  const [displayedPlayer, setDisplayedPlayer] = useState<
    (Player & { teamTag: string; teamLogo: string; milestone: string }) | null
  >(null);

  const displayTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  const showAlert = useCallback((alertData: any) => {
    setDisplayedPlayer(alertData);
    if (displayTimerRef.current) clearTimeout(displayTimerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);

    // Flip to visible next frame so the CSS transition actually plays
    setIsVisible(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setIsVisible(true)));

    displayTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      exitTimerRef.current = window.setTimeout(() => {
        setDisplayedPlayer(null);
        displayTimerRef.current = null;
        exitTimerRef.current = null;
      }, EXIT_ANIM_MS);
    }, DISPLAY_MS);
  }, []);

  // Shared milestone detection (first blood, 3/5/8 streaks, grenade,
  // vehicle, 500+ damage, airdrop). Resets its trackers on match switch.
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

  if (!matchData) return null;
  if (!displayedPlayer) return null;

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden pointer-events-none">
      <style>{`
        .dom-card {
          transition: transform 0.5s cubic-bezier(0.22,1,0.36,1),
                      opacity 0.5s cubic-bezier(0.22,1,0.36,1);
        }
        .dom-card.dom-hidden {
          transform: translateX(-500px);
          opacity: 0;
        }
        .dom-card.dom-visible {
          transform: translateX(0);
          opacity: 1;
        }
      `}</style>

      <div
        key={displayedPlayer._id}
        className={`dom-card absolute left-0 top-0 w-full h-full ${isVisible ? 'dom-visible' : 'dom-hidden'}`}
        style={{ willChange: 'transform, opacity' }}
      >
        <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M400 341.5C404.142 341.5 407.5 344.858 407.5 349V480.5H175.5V341.5H400Z" fill="url(#paint0_linear_2087_24)" stroke="url(#paint1_linear_2087_24)"/>
          <path d="M178 333.544L0 317V505L178 488.456V333.544Z" fill="url(#paint2_linear_2087_24)"/>
          <path d="M18 404C14.8 400.8 4.66667 397.333 0 396V317L29.5 320C3.1 351.6 10.8333 389.167 18 404Z" fill="url(#paint3_linear_2087_24)"/>
          <path d="M103.585 477.472L81.8658 497.328L177.307 488.463L177.687 431.465L164.193 422.375L169.123 435.908C158.256 439.435 153.152 446.968 151.959 450.294L139.462 442.21C141.005 451.821 148.048 459.601 151.377 462.29L151.35 466.29C129.55 483.345 110.423 480.851 103.585 477.472Z" fill="url(#paint4_linear_2087_24)"/>
          <path d="M190 425H178V480.5H407V398C395.4 393.2 392.833 378.333 393 371.5C378.5 392 377 405.5 376 415.5C375.2 423.5 385.333 434.167 390.5 438.5C392.5 440.5 393 449.667 393 454C395.8 456 395.5 457.833 395 458.5C382.6 462.9 350.833 455.667 336.5 451.5C324.5 466.7 298.167 468.167 286.5 467C282.9 466.6 282 463.833 282 462.5C285.6 448.9 283.5 439.833 282 437C280 439.8 276.167 447.833 274.5 451.5C267.7 444.3 254.333 445.167 248.5 446.5L246 430.5C240 437.5 238 450 238 453C238 455.4 235.333 457.333 234 458C197.6 452.8 189.5 433.833 190 425Z" fill="url(#paint5_linear_2087_24)" fillOpacity="0.22"/>
          <rect x="194" y="422" width="76" height="3" fill="black"/>
          <rect x="315" y="422" width="76" height="3" fill="black"/>

          <image clipPath="url(#playerClip)" x="-10" y="323" width="190" height="190" href={displayedPlayer.picUrl || '/def_char.png'} />
          <image x="267" y="391" width="50" height="50" href={displayedPlayer.teamLogo || '/def_logo.png'} />

          <text x="297" y="469" textAnchor="middle" fill="black" fontSize="30" fontFamily="AGENCYB" fontWeight="bold">{displayedPlayer.playerName}</text>
          <text x="300" y="400" textAnchor="middle" fill="black" fontSize="40" fontFamily="AGENCYB">{displayedPlayer.milestone}</text>

          <defs>
            <clipPath id="playerClip">
              <path d="M178 333.544L0 317V505L178 488.456V333.544Z" />
            </clipPath>
            <linearGradient id="paint0_linear_2087_24" x1="306.443" y1="397.471" x2="423.5" y2="648.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="white"/>
              <stop offset="1" stopColor="#737373"/>
            </linearGradient>
            <linearGradient id="paint1_linear_2087_24" x1="291.5" y1="342" x2="344.5" y2="519" gradientUnits="userSpaceOnUse">
              <stop stopColor={tournament.primaryColor || '#E7A801'}/>
              <stop offset="1"/>
            </linearGradient>
            <linearGradient id="paint2_linear_2087_24" x1="185.521" y1="302.461" x2="-29.0338" y2="669.465" gradientUnits="userSpaceOnUse">
              <stop stopColor="white"/>
              <stop offset="1" stopColor="#999999"/>
            </linearGradient>
            <linearGradient id="paint3_linear_2087_24" x1="14.75" y1="317" x2="-28.5" y2="501" gradientUnits="userSpaceOnUse">
              <stop stopColor={tournament.primaryColor || '#F6B300'}/>
              <stop offset="1"/>
            </linearGradient>
            <linearGradient id="paint4_linear_2087_24" x1="130.057" y1="422.147" x2="129.79" y2="537.148" gradientUnits="userSpaceOnUse">
              <stop stopColor={tournament.primaryColor || '#F2B001'}/>
              <stop offset="1"/>
            </linearGradient>
            <linearGradient id="paint5_linear_2087_24" x1="303" y1="405" x2="250.5" y2="648" gradientUnits="userSpaceOnUse">
              <stop stopColor={tournament.primaryColor || '#E9A901'}/>
              <stop offset="1" stopColor="#737373"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
});

export default Dom;
