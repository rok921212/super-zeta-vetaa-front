import React, { useMemo } from 'react';
import { MatchData } from '../../shared/hooks/unsortteams';
// NOTE: SocketManager import removed along with the three effects that
// mirrored matchData into local state and opened/closed a socket to fetch
// the first live tick. PublicThemeRenderer owns the single socket
// connection and passes freshly-merged `matchData` down as a prop —
// this component now just derives topPlayers from that prop directly,
// same pattern as the Theme5 on-screen conversions.

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

interface MatchFragrsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const MatchFragrs: React.FC<MatchFragrsProps> = ({ tournament, round, match, matchData }) => {
  // Get top 5 players by kills, then damage, then assists - recalculated whenever matchData changes
  const topPlayers = useMemo(() => {
    if (!matchData) return [];

    const allPlayers = matchData.teams.flatMap(team => {
      const teamTotalKills = team.players.reduce((sum, p) => sum + (p.killNum || 0), 0);
      return team.players.map(player => ({
        ...player,
        killNum: Number(player.killNum || 0),
        // damage can be string or number coming from backend
        numericDamage: Number((player as any).damage ?? 0) || 0,
        assists: Number((player as any).assists ?? 0) || 0,
        teamTag: team.teamTag,
        teamLogo: team.teamLogo,
        teamName: team.teamName,
        teamPoints: team.placePoints,
        teamTotalKills
      }));
    });

    const sorted = allPlayers.sort((a: any, b: any) => {
      if (b.killNum !== a.killNum) return b.killNum - a.killNum; // priority 1: kills
      if (b.numericDamage !== a.numericDamage) return b.numericDamage - a.numericDamage; // priority 2: damage
      if (b.assists !== a.assists) return b.assists - a.assists; // priority 3: assists
      return 0;
    });

    return sorted.slice(0, 5);
  }, [matchData]);


  if (!matchData) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]"></div>
      </div>
    );
  }

  return (
    <div className='w-[1920px] h-[1080px] '>
      <div
        style={{
          backgroundImage: `linear-gradient(135deg, ${
            tournament.primaryColor || '#000'
          }, #000)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
        className="w-[1800px] h-[250px] text-[142px] font-[agencyb] absolute left-[140px]"
      >
        TOP FRAGGERS
      </div>
      <div
        style={{
          backgroundImage: `linear-gradient(135deg, ${
            tournament.primaryColor || '#000'
          }, #000)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
        className="text-[78px] font-[agencyb] absolute left-[1340px] top-[0px]">
        {round?.roundName}
      </div>
      <div className='text-black w-[480px] h-[200px] text-[78px] font-[agencyb] absolute left-[1320px] top-[70px]'>
        DAY {round?.day} MATCH {match?.matchNo}
      </div>


      <div className='w-[1400px] h-[800px]  absolute left-[520px] top-[180px] flex'>
        {topPlayers.slice(0, 4).map((player, index) => (
          <div key={player._id} className='w-[353px] h-[110%] bg-white ml-[20px]'>
           <div
  style={{
    backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
  }}
  className="w-full h-[400px] overflow-hidden relative rounded-lg"
>
  <img
    src={player?.picUrl || "/def_char.png"}
    alt={player.playerName}
    className="w-full h-full object-cover object-center"
  />
</div>
            <div
              style={{
                backgroundImage: `linear-gradient(135deg, ${
                  tournament.secondaryColor || '#000'
                }, #000)`
              }}
              className='w-[99%] h-[100px] m-[2px] font-[agencyb] flex items-center justify-center'>
              <div className='text-white text-[58px] '>{player?.playerName}</div>
            </div>
            <div
              style={{
                backgroundImage: `linear-gradient(135deg, ${
                  tournament.primaryColor || '#000'
                }, #000)`
              }}
              className='w-[99%] h-[70px] m-[2px] bg-black'>
              <div className='text-white font-[AGENCYB] flex justify-between items-center h-[83%] text-[3rem] px-4'>
                <div>DAMAGE</div>
                <div>{(player as any)?.damage}</div>
              </div>
            </div>
            <div
              style={{
                backgroundImage: `linear-gradient(135deg, ${
                  tournament.primaryColor || '#000'
                }, #000)`
              }}
              className='w-[99%] h-[70px] m-[2px] bg-black mt-[30px]'>
              <div className='text-white font-[AGENCYB] flex justify-between items-center h-[83%] text-[3rem] px-4'>
                <div>ELIMS</div>
                <div>{player?.killNum}</div>
              </div>
            </div>
            <div
              style={{
                backgroundImage: `linear-gradient(135deg, ${
                  tournament.primaryColor || '#000'
                }, #000)`
              }}
              className='w-[99%] h-[70px] m-[2px] bg-black mt-[30px]'>
              <div className='text-white font-[AGENCYB] flex justify-between items-center h-[83%] text-[3rem] px-4'>
                <div>THROWABLE</div>
                <div>{((player as any)?.useSmokeGrenadeNum || 0) + ((player as any)?.useFragGrenadeNum || 0) + ((player as any)?.useBurnGrenadeNum || 0) + ((player as any)?.useFlashGrenadeNum || 0)}</div>
              </div>
            </div>
            <div
              style={{
                backgroundImage: `linear-gradient(135deg, ${
                  tournament.primaryColor || '#000'
                }, #000)`
              }}
              className='w-[99%] h-[70px] m-[2px] bg-black mt-[30px]'>
              <div className='text-white font-[AGENCYB] flex justify-between items-center h-[83%] text-[3rem] px-4'>
                <div>DAMAGE</div>
                <div>{(player as any)?.damage}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


export default MatchFragrs;
