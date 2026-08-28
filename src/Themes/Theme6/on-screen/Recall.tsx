import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MatchData, Player, isPlayerDead, isRondoMap } from '../../shared/hooks/unsortteams';
// NOTE: Data flow is unchanged from the existing Dom.tsx — no socket
// subscription here. PublicThemeRenderer owns the single socket
// connection, listens to 'bulkUpdate', and passes the freshly-merged
// `matchData` down as a prop on every change, same as Upper.tsx and
// LiveData.tsx. This component only reacts to that prop changing.
//
// Player / MatchData are imported from useSortedTeams rather than
// redeclared locally, same reason as the other converted theme files:
// two same-named-but-different-shaped interfaces are unrelated types to
// TypeScript.
//
// WHAT CHANGED FROM THE PREVIOUS Dom.tsx:
// The milestone detection block previously tracked first blood, kill
// streaks, grenade/vehicle kills, 500+ damage, and airdrop pickups. All
// of that has been removed. This version tracks exactly one thing per
// player: a transition from dead (isPlayerDead — liveState === 5 || bHasDied)
// back to alive — i.e. the player was eliminated and has since been recalled/
// revived. When that transition is detected, the same alert card (same SVG/
// HTML structure, same show/hide timing) is shown with the milestone label
// "RECALLED". Only active on recall-capable maps (isRondoMap).

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
  map?: string;
}

interface DomProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const DISPLAY_MS = 6000;
const EXIT_ANIM_MS = 500; // keep in sync with .dom-card transition duration below
const RECALL_MILESTONE = 'RECALLED';

const Recall: React.FC<DomProps> = React.memo(({ tournament, round, match, matchData }) => {
  const [isVisible, setIsVisible] = useState(false); // drives CSS transition, not framer-motion
  const [displayedPlayer, setDisplayedPlayer] = useState<
    (Player & { teamTag: string; teamLogo: string; milestone: string }) | null
  >(null);

  const displayTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  // Per-player "was dead last tick" tracker — keyed by the STABLE identity
  // (uId; a recalled player gets a fresh subdoc _id from the backend, which
  // would orphan the entry). A key that isn't present yet means "first
  // sight" → record only, never fire. So a recall fires exactly once per
  // genuine dead->alive transition from a confirmed-dead prior state.
  const wasDeadMap = useRef<{ [key: string]: boolean | undefined }>({});

  // Track match id so trackers reset when the match itself changes, same
  // as the queue-reset behavior in the previous Dom.tsx.
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);

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

  // ── Recall detection — runs whenever the matchData PROP changes. ──
  useEffect(() => {
    if (!matchData) return;

    const newId = matchData._id?.toString() ?? null;
    if (newId !== matchDataIdRef.current) {
      // Match changed — reset the tracker so a previous match's dead
      // players can't be mistaken for a recall in the new match.
      matchDataIdRef.current = newId;
      wasDeadMap.current = {};
    }

    // Recall only exists on maps whose mode can revive a dead player (Rondo).
    // Bail before the tracker is populated so a later dead->alive on a
    // non-recall map can never fire a banner.
    if (!isRondoMap(match?.map)) return;

    let alertData: any = null;

    // Walk teams/players most-recent-first (same iteration order the
    // previous milestone loops used), so if more than one recall happens
    // in the same tick, the alert shown matches the last one processed.
    for (let ti = matchData.teams.length - 1; ti >= 0; ti--) {
      const team = matchData.teams[ti];
      for (let pi = team.players.length - 1; pi >= 0; pi--) {
        const player = team.players[pi];
        const key = String((player as any).uId ?? player._id ?? player.playerName);

        const isDeadNow = isPlayerDead(player);
        const wasDead = wasDeadMap.current[key];

        // First sight of this player — record only, never fire.
        if (wasDead === undefined) {
          wasDeadMap.current[key] = isDeadNow;
          continue;
        }

        if (wasDead && !isDeadNow) {
          alertData = { ...player, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: RECALL_MILESTONE };
        }

        wasDeadMap.current[key] = isDeadNow;
      }
    }

    if (alertData) {
      showAlert(alertData);
    }
  }, [matchData, match?.map, showAlert]);

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

export default Recall;