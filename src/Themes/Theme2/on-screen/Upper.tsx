import React, { useMemo } from 'react';
import { MatchData, useSortedTeams, isPlayerDead } from '../../shared/hooks/unsortteams';
import { useLocalTeamThrowables, ThrowableKind } from '../../shared/hooks/useLocalTeamThrowables';
import { TeamLogo } from '../../shared/components/TeamLogo';
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

// Throwables strip, in display order. The game only reports the spectated
// team's backpack, so a team's numbers are from the last time it was watched
// (useLocalTeamThrowables); a team never watched this match shows dashes.
const THROWABLES: { kind: ThrowableKind; label: string; color: string }[] = [
  { kind: 'frag', label: 'FRAG', color: '#4ade80' },
  { kind: 'smoke', label: 'SMOKE', color: '#d1d5db' },
  { kind: 'molotov', label: 'MOLLY', color: '#fb923c' },
  { kind: 'stun', label: 'STUN', color: '#facc15' },
];

const Upper: React.FC<UpperProps> = ({ tournament, round, match, matchData }) => {
  // Shared ranking (placePoints then kills) + derived aliveCount / totalKills.
  const sortedTeams = useSortedTeams(matchData, null, 'live');
  const throwables = useLocalTeamThrowables();

  // Every team that still has someone alive, all at once.
  const aliveTeams = useMemo(
    () => sortedTeams.filter(team => team.aliveCount > 0),
    [sortedTeams]
  );

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

        className='w-[100%] top-[40px] relative rounded-lg px-[30px] '
      >

        <div className="grid grid-cols-6 gap-x-[12px] gap-y-[14px] justify-center">
          {aliveTeams.map((team) => {
            const slot = Number((team as typeof team & { slot?: number }).slot);
            const carried = throwables?.get(slot);
            return (
            <div
               style={{
          background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
        }}
            key={team._id} className="flex flex-col bg-black/50 p-2 w-[300px]">
              <div className="flex items-center">


              <div className="w-[40px] h-[40px] mr-3">
                <TeamLogo logo={team.teamLogo} flag={team.teamFlag} alt={team.teamTag} className="w-full h-full object-contain" />
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

              </div>
              <div className="mt-[6px] -mx-2 -mb-2 bg-white flex justify-between px-[8px] h-[26px] items-center font-[Righteous] text-[0.75rem]">
                {THROWABLES.map(({ kind, label, color }) => (
                  <div key={kind} className="flex items-center gap-[4px]">
                    <span className="w-[8px] h-[8px] rounded-full" style={{ background: color, boxShadow: '0 0 0 1px rgba(0,0,0,0.5)' }} />
                    <span className="text-black">{label}</span>
                    <span className="text-yellow-600 font-bold">{carried ? carried[kind] : '-'}</span>
                  </div>
                ))}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Upper;
