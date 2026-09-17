import React, { useMemo } from 'react';
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
  day?: string;
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
  damage?: string | number;
  survivalTime?: number;
  assists?: number;

  health?: number;
  healthMax?: number;
  liveState?: number;
}

interface Team {
  _id: string;
  teamId?: string;
  teamName?: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
  totalKills?: number;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface WwcdSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const WwcdStats: React.FC<WwcdSummaryProps> = ({
  tournament,
  round,
  match,
  matchData,
}) => {
  const teamsWithTotals = useMemo(
    () =>
      computeMatchStandings(matchData).filter(
        (t) => t.wwcd
      ),
    [matchData]
  );

  if (!matchData) {
    return (
      <div className="w-[1920px] h-[1080px] bg-black flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">
          No match data available
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-[1920px] h-[1080px] relative overflow-hidden"
      style={{
        '--primary': tournament.primaryColor || '#333',
        '--secondary': tournament.secondaryColor || '#666',
      } as React.CSSProperties}
    >

      {/* =========================================================
          CSS ANIMATIONS
      ========================================================= */}

     <style>{`
  /* =========================================================
     WWCD — UNIQUE CARD OPENING SYSTEM
     ---------------------------------------------------------
     Center:
       • Starts as a thin vertical core
       • Expands from center → full black panel
       • HUD corners activate
       • Scanner sweeps through
       • Logo / tag / kill counter deploy

     Players:
       • Left cards open LEFT → RIGHT
       • Right cards open RIGHT → LEFT
       • Each card has a small delay
       • 3D folding + clip reveal
       • Stats follow the card
       • Character/image reveals after shell opens
       • Subtle scanner + edge flash

     Header:
       • NO ANIMATION
     ========================================================= */


  /* =========================================================
     BASE
     ========================================================= */

  .wwcd-animation-root {
    perspective: 1600px;
    transform-style: preserve-3d;
  }

  .wwcd-animation-root * {
    box-sizing: border-box;
  }


  /* =========================================================
     CENTER PANEL
     "CORE ACTIVATION"
     
     Starts:
       width visually = 0
       scaleX = 0
       clip-path = center slit

     Ends:
       full width
       scaleX = 1
       normal perspective
     ========================================================= */

  .wwcd-center-deploy {
    transform-origin: center center;
    transform:
      perspective(1200px)
      rotateY(0deg)
      scaleX(0.015);

    clip-path: inset(0 49.5% 0 49.5%);

    opacity: 0;

    animation:
      wwcdCenterDeploy
      1.05s
      cubic-bezier(0.16, 1, 0.3, 1)
      0.05s
      forwards;

    will-change:
      transform,
      clip-path,
      opacity;
  }

  @keyframes wwcdCenterDeploy {
    0% {
      opacity: 0;
      transform:
        perspective(1200px)
        rotateY(0deg)
        scaleX(0.015);

      clip-path: inset(0 49.5% 0 49.5%);
    }

    15% {
      opacity: 1;
      transform:
        perspective(1200px)
        rotateY(0deg)
        scaleX(0.08);

      clip-path: inset(0 45% 0 45%);
    }

    42% {
      transform:
        perspective(1200px)
        rotateY(0deg)
        scaleX(0.55);

      clip-path: inset(0 22% 0 22%);
    }

    72% {
      transform:
        perspective(1200px)
        rotateY(0deg)
        scaleX(1.035);

      clip-path: inset(0 -1% 0 -1%);
    }

    86% {
      transform:
        perspective(1200px)
        rotateY(0deg)
        scaleX(0.985);
    }

    100% {
      opacity: 1;

      transform:
        perspective(1200px)
        rotateY(0deg)
        scaleX(1);

      clip-path: inset(0 0 0 0);
    }
  }


  /* =========================================================
     CENTER EDGE FLASH
     ========================================================= */

  .wwcd-center-flash {
    position: relative;
    overflow: hidden;
  }

  .wwcd-center-flash::before {
    content: "";
    position: absolute;

    top: 0;
    bottom: 0;

    left: 50%;

    width: 4px;

    transform:
      translateX(-50%)
      scaleY(0);

    transform-origin: center;

    background:
      linear-gradient(
        to bottom,
        transparent,
        rgba(255,255,255,0.95),
        rgba(255,174,0,1),
        rgba(255,255,255,0.95),
        transparent
      );

    box-shadow:
      0 0 10px rgba(255,190,60,0.9),
      0 0 25px rgba(255,150,0,0.75),
      0 0 55px rgba(255,120,0,0.4);

    opacity: 0;

    z-index: 30;

    pointer-events: none;

    animation:
      wwcdCenterFlash
      0.75s
      cubic-bezier(0.22, 1, 0.36, 1)
      0.55s
      forwards;
  }

  @keyframes wwcdCenterFlash {
    0% {
      opacity: 0;
      transform:
        translateX(-50%)
        scaleY(0);
    }

    25% {
      opacity: 1;
      transform:
        translateX(-50%)
        scaleY(0.3);
    }

    55% {
      opacity: 1;
      transform:
        translateX(-50%)
        scaleY(1);
    }

    100% {
      opacity: 0;
      transform:
        translateX(-50%)
        scaleY(1.25);
    }
  }


  /* =========================================================
     CENTER INTERNAL HUD REVEAL
     ========================================================= */

  .wwcd-internal-reveal {
    opacity: 0;

    transform:
      translateY(14px)
      scale(0.96);

    animation:
      wwcdInternalReveal
      0.7s
      cubic-bezier(0.16, 1, 0.3, 1)
      0.75s
      forwards;

    will-change:
      opacity,
      transform;
  }

  @keyframes wwcdInternalReveal {
    0% {
      opacity: 0;

      transform:
        translateY(14px)
        scale(0.96);
    }

    65% {
      opacity: 1;

      transform:
        translateY(-2px)
        scale(1.015);
    }

    100% {
      opacity: 1;

      transform:
        translateY(0)
        scale(1);
    }
  }


  /* =========================================================
     CENTER HUD CORNERS
     ========================================================= */

  .wwcd-hud-corner {
    position: absolute;

    width: 28px;
    height: 28px;

    opacity: 0;

    animation:
      wwcdHudCorner
      0.45s
      cubic-bezier(0.16, 1, 0.3, 1)
      0.72s
      forwards;
  }

  .wwcd-hud-corner::before,
  .wwcd-hud-corner::after {
    content: "";

    position: absolute;

    background: rgba(255,174,0,0.9);

    box-shadow:
      0 0 8px rgba(255,170,0,0.6);
  }

  .wwcd-hud-corner::before {
    width: 100%;
    height: 2px;
    top: 0;
    left: 0;
  }

  .wwcd-hud-corner::after {
    width: 2px;
    height: 100%;
    top: 0;
    left: 0;
  }

  @keyframes wwcdHudCorner {
    0% {
      opacity: 0;
      transform: scale(0.2);
    }

    70% {
      opacity: 1;
      transform: scale(1.15);
    }

    100% {
      opacity: 1;
      transform: scale(1);
    }
  }


  /* =========================================================
     CENTER SCANNER
     ========================================================= */

  .wwcd-scanner {
    position: absolute;

    left: 0;
    right: 0;

    top: -10%;

    height: 2px;

    opacity: 0;

    pointer-events: none;

    z-index: 25;

    background:
      linear-gradient(
        90deg,
        transparent 0%,
        rgba(255,174,0,0.05) 20%,
        rgba(255,255,255,0.9) 50%,
        rgba(255,174,0,0.05) 80%,
        transparent 100%
      );

    box-shadow:
      0 0 8px rgba(255,190,70,0.9),
      0 0 20px rgba(255,150,0,0.6);

    animation:
      wwcdScanner
      1.15s
      cubic-bezier(0.4, 0, 0.2, 1)
      0.95s
      forwards;
  }

  @keyframes wwcdScanner {
    0% {
      top: -5%;
      opacity: 0;
    }

    8% {
      opacity: 1;
    }

    50% {
      opacity: 0.85;
    }

    92% {
      opacity: 0.4;
    }

    100% {
      top: 105%;
      opacity: 0;
    }
  }


  /* =========================================================
     CENTER EDGE PULSE
     ========================================================= */

  .wwcd-edge-pulse {
    animation:
      wwcdEdgePulse
      1.4s
      ease-out
      1.05s
      forwards;
  }

  @keyframes wwcdEdgePulse {
    0% {
      box-shadow:
        0 0 0 rgba(255,170,0,0);
    }

    25% {
      box-shadow:
        0 0 12px rgba(255,180,40,0.75),
        0 0 35px rgba(255,140,0,0.35);
    }

    55% {
      box-shadow:
        0 0 25px rgba(255,180,40,0.35),
        0 0 65px rgba(255,140,0,0.15);
    }

    100% {
      box-shadow:
        0 0 0 rgba(255,170,0,0);
    }
  }


  /* =========================================================
     CENTER LOGO DEPLOY
     ========================================================= */

  .wwcd-logo-deploy {
    opacity: 0;

    transform:
      translateY(-20px)
      scale(0.55)
      rotateX(-25deg);

    filter:
      blur(5px)
      brightness(1.8);

    animation:
      wwcdLogoDeploy
      0.8s
      cubic-bezier(0.16, 1, 0.3, 1)
      0.95s
      forwards;

    will-change:
      transform,
      opacity,
      filter;
  }

  @keyframes wwcdLogoDeploy {
    0% {
      opacity: 0;

      transform:
        translateY(-20px)
        scale(0.55)
        rotateX(-25deg);

      filter:
        blur(5px)
        brightness(1.8);
    }

    60% {
      opacity: 1;

      transform:
        translateY(3px)
        scale(1.06)
        rotateX(0deg);

      filter:
        blur(0)
        brightness(1.35);
    }

    100% {
      opacity: 1;

      transform:
        translateY(0)
        scale(1)
        rotateX(0deg);

      filter:
        blur(0)
        brightness(1);
    }
  }


  /* =========================================================
     CENTER TEAM TAG
     ========================================================= */

  .wwcd-tag-reveal {
    opacity: 0;

    clip-path: inset(0 100% 0 0);

    transform: translateX(-12px);

    animation:
      wwcdTagReveal
      0.65s
      cubic-bezier(0.16, 1, 0.3, 1)
      1.2s
      forwards;
  }

  @keyframes wwcdTagReveal {
    0% {
      opacity: 0;

      clip-path: inset(0 100% 0 0);

      transform: translateX(-12px);
    }

    100% {
      opacity: 1;

      clip-path: inset(0 0 0 0);

      transform: translateX(0);
    }
  }


  /* =========================================================
     TOTAL KILLS
     ========================================================= */

  .wwcd-kill-reveal {
    opacity: 0;

    transform:
      translateY(18px)
      scale(0.8);

    animation:
      wwcdKillReveal
      0.65s
      cubic-bezier(0.16, 1, 0.3, 1)
      1.35s
      forwards;
  }

  @keyframes wwcdKillReveal {
    0% {
      opacity: 0;

      transform:
        translateY(18px)
        scale(0.8);
    }

    65% {
      opacity: 1;

      transform:
        translateY(-3px)
        scale(1.04);
    }

    100% {
      opacity: 1;

      transform:
        translateY(0)
        scale(1);
    }
  }


  /* =========================================================
     CENTER DATA BARS
     ========================================================= */

  .wwcd-data-bars {
    opacity: 0;

    transform:
      scaleX(0);

    transform-origin: center;

    animation:
      wwcdDataBars
      0.7s
      cubic-bezier(0.16, 1, 0.3, 1)
      1.45s
      forwards;
  }

  @keyframes wwcdDataBars {
    0% {
      opacity: 0;
      transform: scaleX(0);
    }

    70% {
      opacity: 1;
      transform: scaleX(1.05);
    }

    100% {
      opacity: 1;
      transform: scaleX(1);
    }
  }


  /* =========================================================
     PLAYER CARD — LEFT
     
     Mechanical "door opening":
       • begins folded toward the left
       • rotates toward viewer
       • slides toward center
       • clip-path reveals content
     ========================================================= */

  .wwcd-player-left {
    transform-origin: left center;

    transform:
      perspective(1500px)
      translateX(-90px)
      rotateY(-82deg)
      rotateZ(-1deg)
      scale(0.92);

    clip-path:
      inset(
        0
        100%
        0
        0
      );

    opacity: 0;

    animation:
      wwcdPlayerLeftOpen
      0.95s
      cubic-bezier(0.16, 1, 0.3, 1)
      var(--wwcd-delay, 0s)
      forwards;

    will-change:
      transform,
      clip-path,
      opacity;

    transform-style: preserve-3d;
  }

  @keyframes wwcdPlayerLeftOpen {
    0% {
      opacity: 0;

      transform:
        perspective(1500px)
        translateX(-90px)
        rotateY(-82deg)
        rotateZ(-1deg)
        scale(0.92);

      clip-path:
        inset(
          0
          100%
          0
          0
        );
    }

    25% {
      opacity: 1;

      transform:
        perspective(1500px)
        translateX(-70px)
        rotateY(-62deg)
        rotateZ(-0.5deg)
        scale(0.94);

      clip-path:
        inset(
          0
          72%
          0
          0
        );
    }

    52% {
      transform:
        perspective(1500px)
        translateX(-28px)
        rotateY(-28deg)
        rotateZ(0deg)
        scale(0.98);

      clip-path:
        inset(
          0
          32%
          0
          0
        );
    }

    78% {
      transform:
        perspective(1500px)
        translateX(8px)
        rotateY(5deg)
        rotateZ(0deg)
        scale(1.015);

      clip-path:
        inset(
          0
          -1%
          0
          0
        );
    }

    90% {
      transform:
        perspective(1500px)
        translateX(-3px)
        rotateY(-2deg)
        scale(1.005);
    }

    100% {
      opacity: 1;

      transform:
        perspective(1500px)
        translateX(0)
        rotateY(0deg)
        rotateZ(0deg)
        scale(1);

      clip-path:
        inset(
          0
          0
          0
          0
        );
    }
  }


  /* =========================================================
     PLAYER CARD — RIGHT
     
     Mirror of LEFT.
     Opens RIGHT → LEFT.
     ========================================================= */

  .wwcd-player-right {
    transform-origin: right center;

    transform:
      perspective(1500px)
      translateX(90px)
      rotateY(82deg)
      rotateZ(1deg)
      scale(0.92);

    clip-path:
      inset(
        0
        0
        0
        100%
      );

    opacity: 0;

    animation:
      wwcdPlayerRightOpen
      0.95s
      cubic-bezier(0.16, 1, 0.3, 1)
      var(--wwcd-delay, 0s)
      forwards;

    will-change:
      transform,
      clip-path,
      opacity;

    transform-style: preserve-3d;
  }

  @keyframes wwcdPlayerRightOpen {
    0% {
      opacity: 0;

      transform:
        perspective(1500px)
        translateX(90px)
        rotateY(82deg)
        rotateZ(1deg)
        scale(0.92);

      clip-path:
        inset(
          0
          0
          0
          100%
        );
    }

    25% {
      opacity: 1;

      transform:
        perspective(1500px)
        translateX(70px)
        rotateY(62deg)
        rotateZ(0.5deg)
        scale(0.94);

      clip-path:
        inset(
          0
          0
          0
          72%
        );
    }

    52% {
      transform:
        perspective(1500px)
        translateX(28px)
        rotateY(28deg)
        rotateZ(0deg)
        scale(0.98);

      clip-path:
        inset(
          0
          0
          0
          32%
        );
    }

    78% {
      transform:
        perspective(1500px)
        translateX(-8px)
        rotateY(-5deg)
        rotateZ(0deg)
        scale(1.015);

      clip-path:
        inset(
          0
          0
          0
          -1%
        );
    }

    90% {
      transform:
        perspective(1500px)
        translateX(3px)
        rotateY(2deg)
        scale(1.005);
    }

    100% {
      opacity: 1;

      transform:
        perspective(1500px)
        translateX(0)
        rotateY(0deg)
        rotateZ(0deg)
        scale(1);

      clip-path:
        inset(
          0
          0
          0
          0
        );
    }
  }


  /* =========================================================
     PLAYER CHARACTER / IMAGE REVEAL
     
     The shell opens first.
     Character arrives shortly after.
     ========================================================= */

  .wwcd-character {
    opacity: 0;

    transform:
      scale(1.12)
      translateX(-18px);

    filter:
      brightness(0.35)
      blur(4px);

    animation:
      wwcdCharacterReveal
      0.75s
      cubic-bezier(0.16, 1, 0.3, 1)
      calc(var(--wwcd-delay, 0s) + 0.42s)
      forwards;

    will-change:
      opacity,
      transform,
      filter;
  }

  @keyframes wwcdCharacterReveal {
    0% {
      opacity: 0;

      transform:
        scale(1.12)
        translateX(-18px);

      filter:
        brightness(0.35)
        blur(4px);
    }

    45% {
      opacity: 0.85;

      transform:
        scale(1.025)
        translateX(3px);

      filter:
        brightness(0.75)
        blur(1px);
    }

    75% {
      opacity: 1;

      transform:
        scale(0.995)
        translateX(-1px);

      filter:
        brightness(1.12)
        blur(0);
    }

    100% {
      opacity: 1;

      transform:
        scale(1)
        translateX(0);

      filter:
        brightness(1)
        blur(0);
    }
  }


  /* =========================================================
     RIGHT CHARACTER MIRROR
     ========================================================= */

  .wwcd-player-right .wwcd-character {
    transform:
      scale(1.12)
      translateX(18px);

    animation-name:
      wwcdCharacterRevealRight;
  }

  @keyframes wwcdCharacterRevealRight {
    0% {
      opacity: 0;

      transform:
        scale(1.12)
        translateX(18px);

      filter:
        brightness(0.35)
        blur(4px);
    }

    45% {
      opacity: 0.85;

      transform:
        scale(1.025)
        translateX(-3px);

      filter:
        brightness(0.75)
        blur(1px);
    }

    75% {
      opacity: 1;

      transform:
        scale(0.995)
        translateX(1px);

      filter:
        brightness(1.12)
        blur(0);
    }

    100% {
      opacity: 1;

      transform:
        scale(1)
        translateX(0);

      filter:
        brightness(1)
        blur(0);
    }
  }


  /* =========================================================
     LEFT PLAYER STATS
     ========================================================= */

  .wwcd-stats-left {
    opacity: 0;

    transform:
      translateX(-35px)
      scaleX(0.92);

    transform-origin: right center;

    animation:
      wwcdStatsReveal
      0.65s
      cubic-bezier(0.16, 1, 0.3, 1)
      calc(var(--wwcd-delay, 0s) + 0.52s)
      forwards;

    will-change:
      opacity,
      transform;
  }

  @keyframes wwcdStatsReveal {
    0% {
      opacity: 0;

      transform:
        translateX(-35px)
        scaleX(0.92);
    }

    65% {
      opacity: 1;

      transform:
        translateX(3px)
        scaleX(1.015);
    }

    100% {
      opacity: 1;

      transform:
        translateX(0)
        scaleX(1);
    }
  }


  /* =========================================================
     RIGHT PLAYER STATS
     ========================================================= */

  .wwcd-stats-right {
    opacity: 0;

    transform:
      translateX(35px)
      scaleX(0.92);

    transform-origin: left center;

    animation:
      wwcdStatsRevealRight
      0.65s
      cubic-bezier(0.16, 1, 0.3, 1)
      calc(var(--wwcd-delay, 0s) + 0.52s)
      forwards;

    will-change:
      opacity,
      transform;
  }

  @keyframes wwcdStatsRevealRight {
    0% {
      opacity: 0;

      transform:
        translateX(35px)
        scaleX(0.92);
    }

    65% {
      opacity: 1;

      transform:
        translateX(-3px)
        scaleX(1.015);
    }

    100% {
      opacity: 1;

      transform:
        translateX(0)
        scaleX(1);
    }
  }


  /* =========================================================
     PLAYER CARD SCANNER
     
     Each player receives a fast horizontal light sweep.
     ========================================================= */

  .wwcd-player-left::after,
  .wwcd-player-right::after {
    content: "";

    position: absolute;

    top: 0;
    bottom: 0;

    width: 70px;

    opacity: 0;

    pointer-events: none;

    z-index: 40;

    background:
      linear-gradient(
        90deg,
        transparent,
        rgba(255,255,255,0.85),
        rgba(255,174,0,0.65),
        transparent
      );

    filter:
      blur(1px);

    animation:
      wwcdPlayerScan
      0.7s
      ease-out
      calc(var(--wwcd-delay, 0s) + 0.48s)
      forwards;
  }

  .wwcd-player-left::after {
    left: -80px;
  }

  .wwcd-player-right::after {
    right: -80px;
    animation-name:
      wwcdPlayerScanRight;
  }

  @keyframes wwcdPlayerScan {
    0% {
      left: -80px;
      opacity: 0;
    }

    15% {
      opacity: 0.9;
    }

    100% {
      left: 110%;
      opacity: 0;
    }
  }

  @keyframes wwcdPlayerScanRight {
    0% {
      right: -80px;
      opacity: 0;
    }

    15% {
      opacity: 0.9;
    }

    100% {
      right: 110%;
      opacity: 0;
    }
  }


  /* =========================================================
     PLAYER EDGE LOCK
     
     Small flash when the card finishes opening.
     ========================================================= */

  .wwcd-player-left::before,
  .wwcd-player-right::before {
    content: "";

    position: absolute;

    top: 0;
    bottom: 0;

    width: 3px;

    opacity: 0;

    z-index: 45;

    background:
      linear-gradient(
        to bottom,
        transparent,
        rgba(255,255,255,0.95),
        rgba(255,174,0,1),
        rgba(255,255,255,0.95),
        transparent
      );

    box-shadow:
      0 0 12px rgba(255,174,0,0.9),
      0 0 30px rgba(255,140,0,0.5);

    pointer-events: none;

    animation:
      wwcdPlayerEdgeLock
      0.4s
      ease-out
      calc(var(--wwcd-delay, 0s) + 0.82s)
      forwards;
  }

  .wwcd-player-left::before {
    right: 0;
  }

  .wwcd-player-right::before {
    left: 0;
  }

  @keyframes wwcdPlayerEdgeLock {
    0% {
      opacity: 0;
      transform: scaleY(0.1);
    }

    35% {
      opacity: 1;
      transform: scaleY(1);
    }

    100% {
      opacity: 0;
      transform: scaleY(1.1);
    }
  }


  /* =========================================================
     OPTIONAL INNER CARD GLOW
     ========================================================= */

  .wwcd-card-glow {
    position: relative;
  }

  .wwcd-card-glow::before {
    content: "";

    position: absolute;

    inset: 0;

    opacity: 0;

    pointer-events: none;

    background:
      linear-gradient(
        90deg,
        transparent 0%,
        rgba(255,174,0,0.05) 35%,
        rgba(255,255,255,0.09) 50%,
        rgba(255,174,0,0.05) 65%,
        transparent 100%
      );

    animation:
      wwcdCardGlow
      0.9s
      ease-out
      calc(var(--wwcd-delay, 0s) + 0.35s)
      forwards;
  }

  @keyframes wwcdCardGlow {
    0% {
      opacity: 0;
      transform: translateX(-100%);
    }

    35% {
      opacity: 1;
    }

    100% {
      opacity: 0;
      transform: translateX(100%);
    }
  }


  /* =========================================================
     DELAY SYSTEM
     
     LEFT:
       Player 1 = 0ms
       Player 2 = 180ms

     RIGHT:
       Player 1 = 100ms
       Player 2 = 280ms

     This creates the staggered:
     
       LEFT 1
            RIGHT 1
                LEFT 2
                     RIGHT 2
     ========================================================= */

  .wwcd-left-player-1 {
    --wwcd-delay: 0ms;
  }

  .wwcd-right-player-1 {
    --wwcd-delay: 100ms;
  }

  .wwcd-left-player-2 {
    --wwcd-delay: 180ms;
  }

  .wwcd-right-player-2 {
    --wwcd-delay: 280ms;
  }


  /* =========================================================
     SMALL DATA TEXT REVEAL
     ========================================================= */

  .wwcd-data-text {
    opacity: 0;

    transform:
      translateY(8px);

    animation:
      wwcdDataText
      0.5s
      cubic-bezier(0.16, 1, 0.3, 1)
      1.55s
      forwards;
  }

  @keyframes wwcdDataText {
    0% {
      opacity: 0;
      transform: translateY(8px);
    }

    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }


  /* =========================================================
     TEAM LOGO IDLE GLOW
     
     After deployment, very subtle.
     ========================================================= */

  .wwcd-logo-idle {
    animation:
      wwcdLogoIdle
      3.5s
      ease-in-out
      1.8s
      infinite;
  }

  @keyframes wwcdLogoIdle {
    0%,
    100% {
      filter:
        brightness(1)
        drop-shadow(0 0 4px rgba(255,174,0,0.15));
    }

    50% {
      filter:
        brightness(1.08)
        drop-shadow(0 0 12px rgba(255,174,0,0.35));
    }
  }


  /* =========================================================
     PREVENT ANIMATION FLASH
     ========================================================= */

  .wwcd-animation-root [class*="wwcd-player-"],
  .wwcd-animation-root .wwcd-center-deploy,
  .wwcd-animation-root .wwcd-logo-deploy,
  .wwcd-animation-root .wwcd-tag-reveal,
  .wwcd-animation-root .wwcd-kill-reveal,
  .wwcd-animation-root .wwcd-data-bars {
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }


  /* =========================================================
     PERFORMANCE
     ========================================================= */

  .wwcd-player-left,
  .wwcd-player-right,
  .wwcd-center-deploy,
  .wwcd-character,
  .wwcd-stats-left,
  .wwcd-stats-right {
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
  }


  /* =========================================================
     REDUCED MOTION
     ========================================================= */

  @media (prefers-reduced-motion: reduce) {

    .wwcd-center-deploy,
    .wwcd-center-flash::before,
    .wwcd-internal-reveal,
    .wwcd-hud-corner,
    .wwcd-scanner,
    .wwcd-edge-pulse,
    .wwcd-logo-deploy,
    .wwcd-tag-reveal,
    .wwcd-kill-reveal,
    .wwcd-data-bars,
    .wwcd-player-left,
    .wwcd-player-right,
    .wwcd-character,
    .wwcd-stats-left,
    .wwcd-stats-right,
    .wwcd-player-left::before,
    .wwcd-player-right::before,
    .wwcd-player-left::after,
    .wwcd-player-right::after,
    .wwcd-card-glow::before,
    .wwcd-data-text,
    .wwcd-logo-idle {
      animation: none !important;

      opacity: 1 !important;

      transform: none !important;

      clip-path: none !important;

      filter: none !important;
    }
  }
`}</style>


      {/* =========================================================
          HEADER
      ========================================================= */}

      <div
        className="
          wwcd-header-animation
          relative
          z-10
          text-center
          left-[600px]
          top-[0px]
          text-[5rem]
          font-bebas
          font-[300]
        "
      >

        <div className="flex items-center justify-between">

          <div className="flex items-center space-x-4">

            <div>

              <h1
                className="
                  font-[Awaking]
                  font-bold
                  whitespace-pre
                  text-[8rem]
                  bg-gradient-to-l
                  from-[#ffa300]
                  to-[#f9df67]
                  text-transparent
                  bg-clip-text
                "
              >
                WWCD TEAM STATS
              </h1>


              {round && match && (
                <p
                  className="
                    text-white
                    text-[50px]
                    font-[AGENCYB]
                    whitespace-pre
                    mt-[-30px]
                    wwcd-live
                  "
                  style={{
                    background: `linear-gradient(
                      45deg,
                      ${tournament.primaryColor || '#000'},
                      ${tournament.secondaryColor || '#333'}
                    )`,
                  }}
                >
                  {`${round.roundName} - DAY${
                    round.day ? ` ${round.day}` : ''
                  } - ${
                    match.matchName
                      ? match.matchName
                      : `Match ${
                          match.matchNo || match._matchNo
                        }`
                  }`}
                </p>
              )}

            </div>

          </div>

        </div>

      </div>


      {/* =========================================================
          TEAM CONTENT
      ========================================================= */}

        <div className="absolute inset-x-0 top-[150px] px-10">

          {teamsWithTotals.length === 0 ? (

            <div className="text-center text-white font-[Righteous] text-3xl">
              No team with placement points 10
            </div>

          ) : (

            teamsWithTotals.map((team, teamIndex) => (

              <div
                key={(team as any)._id || (team as any).teamId}
                className="wwcd-team-animation flex justify-between items-center px-20"
                style={{
                  animationDelay: `${teamIndex * 150}ms`,
                }}
              >

                {/* =====================================================
                    LEFT PLAYERS
                ===================================================== */}

                <div
                  className="
                    flex
                    flex-col
                    gap-2
                    relative
                    left-[400px]
                    top-[100px]
                  "
                >

                  {team.players?.slice(0, 2).map((player, idx) => (

                    <div
                      key={player._id || idx}
                      className="wwcd-player-card relative w-[300px] h-[350px]"
                      style={{
                        animationDelay: `${0.2 + idx * 0.15}s`,
                        background: `linear-gradient(
                          135deg,
                          ${tournament.primaryColor || '#333'},
                          ${tournament.secondaryColor || '#666'}
                        )`,
                      }}
                    >

                      {/* PLAYER IMAGE */}

                      <img
                        src={player.picUrl || '/def_char.avif'}
                        alt={player.playerName}
                        className="
                          wwcd-player-image
                          w-[300px]
                          h-[350px]
                          object-cover
                        "
                      />


                      {/* PLAYER STAT PANEL */}

                      <div
                        className="
                          absolute
                          w-[400px]
                          h-[350px]
                          bg-[#0000008d]
                          left-[-400px]
                          top-0
                          overflow-hidden
                        "
                      >

                        {/* PLAYER NAME */}

                        <div
                          className="
                            w-full
                            h-[25%]
                            bg-gradient-to-r
                            from-[#FFD700]
                            via-[#FFA500]
                            to-[#FFD700]
                            flex
                            items-center
                            justify-center
                          "
                        >

                          <span
                            className="
                              text-[2.5rem]
                              font-bold
                              font-[AGENCYB]
                              whitespace-nowrap
                            "
                          >
                            {player.playerName}
                          </span>

                        </div>


                        {/* DAMAGE */}

                        <div
                          className="
                            w-full
                            font-[AGENCYB]
                            grid
                            grid-cols-2
                            items-center
                            h-[88px]
                            text-white
                            border-b-[2px]
                            border-white/60
                          "
                        >

                          <span className="text-[3rem] ml-[20px]">
                            DAMAGE
                          </span>

                          <span className="text-[3.5rem] text-center">
                            {player.damage ?? 0}
                          </span>

                        </div>


                        {/* KILLS */}

                        <div
                          className="
                            w-full
                            text-white
                            font-[AGENCYB]
                            grid
                            grid-cols-2
                            items-center
                            h-[88px]
                            border-b-[2px]
                            border-white/60
                          "
                        >

                          <span className="text-[3rem] ml-[20px]">
                            KILLS
                          </span>

                          <span className="text-[3.5rem] text-center">
                            {player.killNum ?? 0}
                          </span>

                        </div>


                        {/* ASSISTS */}

                        <div
                          className="
                            w-full
                            text-white
                            font-[AGENCYB]
                            grid
                            grid-cols-2
                            items-center
                            h-[88px]
                            border-b-[2px]
                            border-white/60
                          "
                        >

                          <span className="text-[3rem] ml-[20px]">
                            ASSISTS
                          </span>

                          <span className="text-[3.5rem] text-center">
                            {player.assists ?? 0}
                          </span>

                        </div>

                      </div>

                    </div>

                  ))}

                </div>


                {/* =====================================================
                    CENTER TEAM PANEL
                ===================================================== */}

                <div
                  className="
                    wwcd-team-animation
                    bg-[#00000078]
                    w-[250px]
                    h-[710px]
                    absolute
                    left-[835px]
                    top-[100px]
                    flex
                    items-center
                    flex-col
                    overflow-hidden
                  "
                  style={{
                    animationDelay: `${0.25 + teamIndex * 0.2}s`,
                  }}
                >

                  {/* TOP ACCENT */}

                  <div
                    className="
                      absolute
                      top-0
                      left-0
                      w-full
                      h-[3px]
                      bg-white/80
                      wwcd-accent
                    "
                  />


                  {/* HUD CORNERS */}

                  <div className="absolute top-5 left-5 w-7 h-7 border-l-2 border-t-2 border-white/50" />

                  <div className="absolute top-5 right-5 w-7 h-7 border-r-2 border-t-2 border-white/50" />

                  <div className="absolute bottom-5 left-5 w-7 h-7 border-l-2 border-b-2 border-white/50" />

                  <div className="absolute bottom-5 right-5 w-7 h-7 border-r-2 border-b-2 border-white/50" />


                  {/* =================================================
                      LOGO
                  ================================================= */}

                  <div
                    className="
                      relative
                      mt-[45px]
                      w-[190px]
                      h-[190px]
                      flex
                      items-center
                      justify-center
                    "
                  >

                    {/* GLOW */}

                    <div
                      className="
                        absolute
                        inset-[20px]
                        rounded-full
                        bg-white/10
                        blur-[35px]
                        wwcd-glow
                      "
                    />


                    {/* OUTER RING */}

                    <div
                      className="
                        absolute
                        inset-[5px]
                        rounded-full
                        border
                        border-white/20
                        border-dashed
                        wwcd-ring
                      "
                    />


                    {/* INNER RING */}

                    <div
                      className="
                        absolute
                        inset-[18px]
                        rounded-full
                        border
                        border-white/10
                        wwcd-ring-reverse
                      "
                    />


                    {/* CROSSHAIR */}

                    <div className="absolute w-full h-[1px] bg-white/10" />

                    <div className="absolute h-full w-[1px] bg-white/10" />


                    {/* LOGO */}

                    <img
                      src={team.teamLogo}
                      alt={team.teamTag}
                      className="
                        relative
                        z-10
                        w-full
                        h-full
                        object-contain
                        wwcd-logo-animation
                        wwcd-logo-float
                        drop-shadow-[0_0_22px_rgba(255,255,255,0.4)]
                      "
                    />

                  </div>


                  {/* =================================================
                      TEAM TAG
                  ================================================= */}

                  <div
                    className="
                      relative
                      mt-[5px]
                      text-white
                      text-[3rem]
                      font-[AGENCYB]
                      wwcd-tag
                    "
                    style={{
                      textShadow:
                        '0 0 10px rgba(255,255,255,0.35)',
                    }}
                  >

                    {team.teamTag}

                    <div
                      className="
                        h-[3px]
                        w-[75%]
                        mx-auto
                        mt-[-3px]
                        bg-white/80
                      "
                    />

                  </div>


                  {/* =================================================
                      LIVE STATUS
                  ================================================= */}

                  <div
                    className="
                      mt-[15px]
                      flex
                      items-center
                      gap-2
                      text-white/45
                      text-[11px]
                      tracking-[0.25em]
                      font-[AGENCYB]
                    "
                  >

                  

                  </div>


                  {/* =================================================
                      TOTAL KILLS
                  ================================================= */}

                  <div
                    className="
                      relative
                      mt-[18px]
                      w-[205px]
                      h-[105px]
                      border
                      border-white/15
                      bg-black/30
                      flex
                      flex-col
                      items-center
                      justify-center
                      wwcd-border-pulse
                    "
                  >

                    {/* ANIMATED TOP LINE */}

                    <div
                      className="
                        absolute
                        top-0
                        left-0
                        h-[2px]
                        bg-white
                        wwcd-accent
                      "
                    />


                    <div
                      className="
                        text-white/45
                        text-[11px]
                        tracking-[0.3em]
                        font-[AGENCYB]
                      "
                    >
                      TOTAL KILLS
                    </div>


                    {/* key causes animation to replay when kills change */}

                    <div
                      key={team.totalKills ?? 0}
                      className="
                        wwcd-kill-number
                        text-white
                        text-[3.3rem]
                        leading-none
                        font-[AGENCYB]
                        tracking-wider
                      "
                    >
                      {team.totalKills ?? 0}
                    </div>


                    {/* MICRO DATA */}

                

                  </div>


                  {/* =================================================
                      SCAN LINE
                  ================================================= */}

                  <div
                    className="
                      absolute
                      left-0
                      w-full
                      h-[1px]
                      bg-white/20
                      wwcd-scan
                      pointer-events-none
                    "
                  />


                  {/* =================================================
                      BOTTOM DATA GRAPH
                  ================================================= */}

                  <div
                    className="
                      absolute
                      bottom-[55px]
                      flex
                      gap-[4px]
                      items-end
                    "
                  >

                    {[18, 32, 24, 42, 28, 50, 35, 22, 45, 30].map(
                      (height, i) => (

                        <div
                          key={i}
                          className="
                            w-[4px]
                            bg-white/30
                            wwcd-bars
                          "
                          style={{
                            height: `${height}px`,
                            animationDelay: `${i * 80}ms`,
                          }}
                        />

                      )
                    )}

                  </div>

                </div>


                {/* =====================================================
                    RIGHT PLAYERS
                ===================================================== */}

                <div
                  className="
                    flex
                    flex-col
                    gap-2
                    relative
                    right-[400px]
                    top-[100px]
                  "
                >

                  {team.players?.slice(2, 4).map((player, idx) => (

                    <div
                      key={player._id || idx}
                      className="
                        wwcd-player-card
                        relative
                        w-[300px]
                        h-[350px]
                      "
                      style={{
                        animationDelay: `${0.35 + idx * 0.15}s`,
                        background: `linear-gradient(
                          135deg,
                          ${tournament.primaryColor || '#333'},
                          ${tournament.secondaryColor || '#666'}
                        )`,
                      }}
                    >

                      {/* PLAYER IMAGE */}

                      <img
                        src={player.picUrl || '/def_char.avif'}
                        alt={player.playerName}
                        className="
                          wwcd-player-image
                          w-[300px]
                          h-[350px]
                          object-cover
                        "
                      />


                      {/* PLAYER PANEL */}

                      <div
                        className="
                          absolute
                          w-[400px]
                          h-[350px]
                          bg-[#0000008d]
                          right-[-400px]
                          top-0
                          overflow-hidden
                        "
                      >

                        {/* PLAYER NAME */}

                        <div
                          className="
                            w-full
                            h-[25%]
                            bg-gradient-to-r
                            from-[#FFD700]
                            via-[#FFA500]
                            to-[#FFD700]
                            flex
                            items-center
                            justify-center
                          "
                        >

                          <span
                            className="
                              text-[2.5rem]
                              font-bold
                              font-[AGENCYB]
                              whitespace-nowrap
                            "
                          >
                            {player.playerName}
                          </span>

                        </div>


                        {/* DAMAGE */}

                        <div
                          className="
                            w-full
                            font-[AGENCYB]
                            grid
                            grid-cols-2
                            items-center
                            h-[88px]
                            text-white
                            border-b-[2px]
                            border-white/60
                          "
                        >

                          <span className="text-[3rem] ml-[20px]">
                            DAMAGE
                          </span>

                          <span className="text-[3.5rem] text-center">
                            {player.damage ?? 0}
                          </span>

                        </div>


                        {/* KILLS */}

                        <div
                          className="
                            w-full
                            text-white
                            font-[AGENCYB]
                            grid
                            grid-cols-2
                            items-center
                            h-[88px]
                            border-b-[2px]
                            border-white/60
                          "
                        >

                          <span className="text-[3rem] ml-[20px]">
                            KILLS
                          </span>

                          <span className="text-[3.5rem] text-center">
                            {player.killNum ?? 0}
                          </span>

                        </div>


                        {/* ASSISTS */}

                        <div
                          className="
                            w-full
                            text-white
                            font-[AGENCYB]
                            grid
                            grid-cols-2
                            items-center
                            h-[88px]
                            border-b-[2px]
                            border-white/60
                          "
                        >

                          <span className="text-[3rem] ml-[20px]">
                            ASSISTS
                          </span>

                          <span className="text-[3.5rem] text-center">
                            {player.assists ?? 0}
                          </span>

                        </div>

                      </div>

                    </div>

                  ))}

                </div>

              </div>

            ))

          )}

        </div>

    </div>
  );
};

export default WwcdStats;