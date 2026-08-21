import React, { useMemo } from 'react';
// NOTE: SocketManager import removed, along with the six manual event
// handlers and the localMatchData mirror state they all wrote into.
// PublicThemeRenderer owns the single socket connection, listens to
// 'bulkUpdate', and passes freshly-merged matchData down as a prop on every
// change — this component now just reacts to that prop.

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
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;

  // Live stats fields
  health: number;
  healthMax: number;
  liveState: number; // 0 = knocked, 5 = dead, etc.
}

interface Team {
  _id: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo:string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}


interface UpperProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  backpackInfo?: any | null;
}

const Upper: React.FC<UpperProps> = ({ tournament, round, match, matchData, backpackInfo }) => {
  // Get top 5 teams by alive players — recalculated whenever the matchData
  // prop changes.
  const topTeams = useMemo(() => {
    if (!matchData) return [];

    const useApiHealth = round?.apiEnable === true;

    return matchData.teams
      .map(team => {
        const aliveCount = team.players.filter(p => !p.bHasDied).length;
        let wwcd: number;
        if (useApiHealth) {
          wwcd = Math.round(team.players.reduce((sum, p) => sum + (p.health || 0), 0) / 4);
        } else {
          wwcd = Math.round(aliveCount * 25);
        }
        return {
          ...team,
          totalKills: team.players.reduce((sum, p) => sum + (p.killNum || 0), 0),
          aliveCount,
          wwcd,
        };
      })
      .filter(team => team.aliveCount > 0)
      .sort((a, b) => b.aliveCount - a.aliveCount)
      .slice(0, 5);
  }, [matchData, round?.apiEnable]);


  if (!matchData) {
    return (
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }

 return (
  <svg
    width="1920"
    height="1080"
    viewBox="0 0 1920 1080"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient
        id="paint0_linear_2096_15"
        x1="508.5"
        y1="110"
        x2="356.443"
        y2="-68.2287"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor={tournament.primaryColor || "#FFCC16"} />
        <stop offset="1" />
      </linearGradient>

      <linearGradient
        id="paint1_linear_2096_15"
        x1="301.5"
        y1="83.75"
        x2="561"
        y2="137"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor={tournament.secondaryColor || "#FF6800"} />
        <stop offset="1" stopColor={tournament.primaryColor || "#FFCC16"} />
      </linearGradient>
    </defs>

    {topTeams.slice(0, 4).map((team, index) => {
      const CARD_W = 297;
      const GAP = 30;
      const TOTAL_W = 4 * CARD_W + 3 * GAP;
      const startX = (1920 - TOTAL_W) / 2;
      const baseX = startX + index * (CARD_W + GAP);
      const tx = baseX - 297;

      const useApiHealth = round?.apiEnable === true;
      const primaryColor = tournament.primaryColor || "#fc030f";
      const secondaryColor = tournament.secondaryColor || "#fff600";

      return (
        <g key={team._id} transform={`translate(${tx}, 0)`}>
          {/* Header */}
          <path
            d="M594.699 55.5L594.491 57.6895L589.491 110.189L589.318 112H299.342L299.506 109.848L303.506 57.3477L303.646 55.5H594.699Z"
            fill="url(#paint0_linear_2096_15)"
            stroke="url(#paint1_linear_2096_15)"
            strokeWidth="4"
          />


          <image x="313" y="60" width="50" height="50" href={team.teamLogo} />
          <text
            x="363"
            y="103"
            fontFamily="AGENCYB"
            fontSize="44"
            fill="white"
          >
            {team.teamTag}
          </text>

          {/* PLAYER HEALTH BARS */}
          {team.players.slice(0, 4).map((player, i) => {
            const barX = 513 + i * 13;
            const barY = 62;
            const barW = 10;
            const barH = 45;

            const isDead = player.liveState === 5 || player.bHasDied;
            const isKnocked = player.liveState === 4;
            const isAlive = [0, 1, 2, 3].includes(player.liveState);

            let barHeight = 0;
            let barColor = "";

            if (useApiHealth) {
              if (!isDead) {
                const ratio = Math.max(
                  0,
                  Math.min(1, player.health / (player.healthMax || 100))
                );
                barHeight = ratio * barH;
                barColor = isKnocked
                  ? primaryColor
                  : isAlive
                  ? secondaryColor
                  : "";
              }
            } else {
              if (!isDead) {
                barHeight = barH;
                barColor = isKnocked ? primaryColor : secondaryColor;
              }
            }

            return (
              <g key={player._id}>
                {/* Background */}
                <rect
                  x={barX}
                  y={barY}
                  width={barW}
                  height={barH}
                  fill="#4b5563"

                />

                {/* Health */}
                {barHeight > 0 && (
                  <rect
                    x={barX}
                    y={barY + (barH - barHeight)}
                    width={barW}
                    height={barHeight}
                    fill={barColor}

                    style={{
                      transition: "height 0.3s ease, y 0.3s ease",
                    }}
                  />
                )}
              </g>
            );
          })}

          {/* WWCD Bar */}
          {(() => {
            const WWCD_BOX_WIDTH = 297;
            const WWCD_BOX_HEIGHT = 35;
            const wwcdWidth = Math.max(0, (team.wwcd / 100) * WWCD_BOX_WIDTH);

            let wwcdColor = "#22c55e"; // default green
            if (team.wwcd >= 75) wwcdColor = "#22c55e";
            else if (team.wwcd >= 50) wwcdColor = "#facc15";
            else if (team.wwcd >= 25) wwcdColor = "#f97316";
            else wwcdColor = "#ef4444";

            return (
              <>
                <rect x="300" y="120" width={WWCD_BOX_WIDTH} height={WWCD_BOX_HEIGHT} fill="#000" />
                <rect x="300" y="120" width={wwcdWidth} height={WWCD_BOX_HEIGHT} fill={wwcdColor} />
                <text
                  x={"450"}
                  y={120 + WWCD_BOX_HEIGHT / 2 + 7}
                  fontSize="20"
                  fill="white"
                  textAnchor="middle"
                  fontFamily="AGENCYB"
                >
                  WWCD - {team.wwcd}%
                </text>
              </>
            );
          })()}
        </g>
      );
    })}
  </svg>
);





};

export default Upper;