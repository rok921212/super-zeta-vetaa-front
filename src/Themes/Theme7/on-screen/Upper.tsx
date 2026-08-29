import React, { useMemo } from 'react';
import { MatchData, useSortedTeams, isPlayerDead } from '../../shared/hooks/unsortteams';
import { wwcdChance } from '../../shared/hooks/liveDerived';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// freshly-merged `matchData` down as a prop. Team ranking + aliveCount +
// totalKills come from the shared useSortedTeams (placePoints then kills) —
// no theme-local alive-count sort. The WWCD gauge is the shared wwcdChance.

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

interface UpperProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const Upper: React.FC<UpperProps> = ({ tournament, round, match, matchData }) => {
  // Shared ranking (placePoints then kills) + derived aliveCount / totalKills.
  const sortedTeams = useSortedTeams(matchData, null, 'live');

  // Top 5 teams that still have someone alive, with the shared WWCD gauge.
  const topTeams = useMemo(() => {
    const apiEnable = round?.apiEnable === true;
    return sortedTeams
      .filter(team => team.aliveCount > 0)
      .slice(0, 5)
      .map(team => ({ ...team, wwcd: wwcdChance(team, apiEnable) }));
  }, [sortedTeams, round?.apiEnable]);

  if (!matchData) {
    return (
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }

  // Upper component UI
return (
  <div className="w-[1920px] h-[1080px] relative ">
    {/* Horizontal Team Cards */}
    {topTeams.map((team, index) => {
      const CARD_W = 330;
      const CARD_H = 90;
      const GAP = 30;
      const TOTAL_W = topTeams.length * CARD_W + (topTeams.length - 1) * GAP;
      const startX = (1920 - TOTAL_W) / 2;
      const baseX = startX + index * (CARD_W + GAP);
      const baseY = 40;

      const BAR_W = 14;
      const BAR_MAX = 60;

      const WWCD_BOX_WIDTH = 330;
      const WWCD_BOX_HEIGHT = 35;
      const wwcdWidth = Math.max(0, (team.wwcd / 100) * WWCD_BOX_WIDTH);

      let wwcdColor = "#22c55e"; // default green
      if (team.wwcd >= 75) wwcdColor = "#22c55e";
      else if (team.wwcd >= 50) wwcdColor = "#facc15";
      else if (team.wwcd >= 25) wwcdColor = "#f97316";
      else wwcdColor = "#ef4444";

      return (
        <div
          key={team._id}
          className="absolute"
          style={{
            left: baseX,
            top: baseY,
            width: CARD_W,
            height: CARD_H + WWCD_BOX_HEIGHT + 20, // extra space for WWCD
          }}
        >
          {/* Main Card */}
          <div
            style={{
              width: CARD_W,
              height: CARD_H,
              background: `linear-gradient(135deg, ${tournament.primaryColor || "#000"}, ${
                tournament.secondaryColor || "#333"
              })`,
              position: "relative",
            }}
          >
            {/* Left white strip */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 7,
                height: CARD_H,
                backgroundColor: "#fff",
              }}
            />
            {/* Right fade */}
            <div
              style={{
                position: "absolute",
                left: CARD_W * 0.55 + 16,
                top: 0,
                width: CARD_W * 0.4,
                height: CARD_H,
                background: "linear-gradient(to right, #383838, #000)",
              }}
            />
            {/* Team Logo */}
            <img
              src={team.teamLogo}
              alt={team.teamTag}
              style={{
                position: "absolute",
                left: 12,
                top: 15,
                width: 60,
                height: 60,
                objectFit: "cover",
              }}
            />
            {/* Team Tag */}
            <span
              style={{
                position: "absolute",
                left: 85,
                top: 58 - 32, // adjust text vertical
                fontSize: 32,
                fontWeight: 900,
                fontFamily: "Supermolot, sans-serif",
                color: "white",
              }}
            >
              {team.teamTag}
            </span>

            {/* Player health bars */}
             {team.players.slice(0, 4).map((player, i) => {
  const barX = 230 + i * (BAR_W + 6);
  const barY = 15;

  const isDead = isPlayerDead(player);
  const isAlive = [0, 1, 2, 3].includes(player.liveState);
  const isKnocked = player.liveState === 4;
  const useApiHealth = round?.apiEnable === true;

  let height = 0;
  let color = "transparent";

  if (useApiHealth) {
    if (isDead) {
      height = 0;
      color = "transparent";
    } else if (isKnocked) {
      const healthRatio = Math.max(0, Math.min(1, player.health / (player.healthMax || 100)));
      height = healthRatio * BAR_MAX;
      color = "#ef4444"; // red — same as LiveStats
    } else if (isAlive) {
      const healthRatio = Math.max(0, Math.min(1, player.health / (player.healthMax || 100)));
      height = healthRatio * BAR_MAX;
      color = "#07e63f"; // green — same as LiveStats
    }
  } else {
    if (isDead) {
      height = 0;
      color = "transparent";
    } else if (isKnocked) {
      height = BAR_MAX;
      color = "#ef4444";
    } else if (isAlive) {
      height = BAR_MAX;
      color = "#07e63f";
    }
  }

  return (
    <div key={player._id}>
      {/* Background bar */}
      <div
        style={{
          position: "absolute",
          left: barX,
          top: barY,
          width: BAR_W,
          height: BAR_MAX,
          backgroundColor: "#4b5563",
        }}
      />
      {/* Foreground health bar */}
      <div
        style={{
          position: "absolute",
          left: barX,
          top: barY + (BAR_MAX - height),
          width: BAR_W,
          height: height,
          backgroundColor: color,
        }}
      />
    </div>
  );
})}

            {/* WWCD bar */}
            <div
              style={{
                position: "absolute",
                top: CARD_H + 10,
                left: 0,
                width: WWCD_BOX_WIDTH,
                height: WWCD_BOX_HEIGHT,
                backgroundColor: "#000",
              }}
            >
              <div
                style={{
                  width: wwcdWidth,
                  height: "100%",
                  backgroundColor: wwcdColor,
                }}
              />
              <span
                style={{
                  position: "absolute",
                  width: "100%",
                  textAlign: "center",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "white",
                  fontSize: 20,
                  fontFamily: "payBack, sans-serif",
                }}
              >
                WWCD - {team.wwcd}%
              </span>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);




};

export default Upper;
