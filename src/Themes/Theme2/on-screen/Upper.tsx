import React, { useMemo } from 'react';
import { MatchData, useSortedTeams, isPlayerDead } from '../../shared/hooks/unsortteams';
import { wwcdChance } from '../../shared/hooks/liveDerived';
// NOTE: SocketManager import removed — this component no longer opens its
// own socket subscription. PublicThemeRenderer owns the single socket
// connection, listens to 'bulkUpdate', and passes the freshly-merged
// matchData down as a prop on every change. That prop update is what
// re-renders this component now, same as the Theme2 conversion pattern
// used in Alerts.tsx / Dom.tsx / LiveStats.tsx.
//
// Player / Team / MatchData are imported from useSortedTeams' shared hook
// module rather than redeclared locally — duplicate same-named interfaces
// with different shapes are NOT the same type to TypeScript.

// ─────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────
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
  // Get top 5 teams by alive players - recalculated whenever matchData changes
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
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg ">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }

  // Upper component UI
  return (
    <div className="w-[1920px] h-[1080px] flex justify-center relative ">
      <div

        className='w-[100%] h-[500px] top-[60px] relative rounded-lg p-4 '
      >

        <div className="flex  flex-wrap gap-[50px] justify-center scale-150 ">
          {topTeams.map((team, index) => (
            <div
               style={{
          background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
        }}
            key={team._id} className="flex items-center bg-black/50 p-2 ">


              <div className="w-[40px] h-[40px] mr-3">
                <img src={team.teamLogo} alt={team.teamTag} className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 text-white font-[400] text-[2rem] mr-[10px] font-bebas" >{team.teamTag}</div>
              <div className="flex gap-[2px] w-[50px]   ">
  {team.players.slice(0, 4).map((player) => {
    const isDead = isPlayerDead(player);
    const isAlive = [0, 1, 2, 3].includes(player.liveState);
    const isKnocked = player.liveState === 4;
    const useApiHealth = round?.apiEnable === true;

    let barHeight = 0;
    let barColor = "";

    if (useApiHealth) {
      // API enabled - use full health system
      if (isDead) {
        barHeight = 40;
        barColor = "bg-gray-500";
      } else if (isKnocked) {
        const healthRatio = Math.max(0, Math.min(1, player.health / (player.healthMax || 100)));
        barHeight = healthRatio * 40;
        barColor = "bg-red-500";
      } else if (isAlive) {
        const healthRatio = Math.max(0, Math.min(1, player.health / (player.healthMax || 100)));
        barHeight = healthRatio * 40;
        barColor = "bg-white";
      }
    } else {
      // API disabled - use simple bHasDied system
      if (isDead) {
        barHeight = 40;
        barColor = "bg-gray-500";
      } else if (isKnocked) {
        barHeight = 40;
        barColor = "bg-red-500";
      } else if (isAlive) {
        barHeight = 40;
        barColor = "bg-white";
      }
    }

    return (
      <div key={player._id} className=" w-[10px] h-[40px] bg-gray-600">
        {/* Health bar */}
        <div
          className={`transition-all duration-300 ${barColor}`}
          style={{
            height: `${barHeight}px`
          }}
        />
      </div>
    );
  })}
</div>

              <div className="text-black bg-white w-[190px] h-[30px] font-bold absolute top-[75px] ml-[-10px] text-center text-[0.8rem] font-[Righteous] flex items-center justify-center p-[10px]">WWCD CHANCE- <span className='text-yellow-600'>{team.wwcd}%</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Upper;
