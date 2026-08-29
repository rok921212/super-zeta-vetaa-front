import React, { useMemo } from 'react';
import { buildFraggerPool, pickLeader } from '../../shared/hooks/fraggerScore';
// NOTE: SocketManager import removed, along with the "wait for first
// liveMatchUpdate then disconnect" bootstrap effect and the localMatchData
// mirror it fed. PublicThemeRenderer owns the single socket connection,
// listens to 'bulkUpdate', and passes freshly-merged `matchData` down as a
// prop on every change — this component just reads that prop directly now,
// same as the Theme2 conversion pattern.

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
  day?:string
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
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  maxKillDistance?: number;
  driveDistance?: number;
  marchDistance?: number;
  // Live stats fields
  health?: number;
  healthMax?: number;
  liveState?: number; // 0,1,2,3 = alive, 4 = knocked, 5 = dead
  useSmokeGrenadeNum?: number;
  useFragGrenadeNum?: number;
  useBurnGrenadeNum?: number;
  useFlashGrenadeNum?: number;
}

interface Team {
  _id: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
  teamName: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchFragrsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}


const MatchFragrs: React.FC<MatchFragrsProps> = ({ tournament, round, match, matchData }) => {
type StatKey =
  | "killNum"
  | "damage"
  | "grenadeKills"
  | "killDistance"
  | "travelDistance";


// Per-category single-match leaders from the shared fragger pool.
 const topCategories = useMemo(() => {
  if (!matchData) return [];

  const pool = buildFraggerPool([matchData] as any);
  const view = (e: ReturnType<typeof buildFraggerPool>[number] | null) =>
    e
      ? {
          ...e,
          killNum: e.totalKills,
          damage: e.totalDamage,
          grenadeKills: e.totalGrenadeKills,
          killDistance: e.longestKillDistance,
          travelDistance: e.maxTravelDistance,
        }
      : undefined;

  return [
    { label: "KILLS", player: view(pickLeader(pool, 'totalKills')), valueKey: "killNum" as StatKey },
    { label: "DAMAGE", player: view(pickLeader(pool, 'totalDamage')), valueKey: "damage" as StatKey },
    { label: "GRENADE KILLS", player: view(pickLeader(pool, 'totalGrenadeKills')), valueKey: "grenadeKills" as StatKey },
    { label: "KILL DISTANCE", player: view(pickLeader(pool, 'longestKillDistance')), valueKey: "killDistance" as StatKey },
    { label: "TRAVEL DISTANCE", player: view(pickLeader(pool, 'maxTravelDistance')), valueKey: "travelDistance" as StatKey }
  ];
}, [matchData]);

  if (!matchData) {
    return (
     <div></div>
    );
  }

  return (
    <div className='w-[1920px] h-[1080px] '>
      <div
        style={{
          backgroundImage: `linear-gradient(135deg, ${
            tournament.primaryColor || '#000'
          }, #000)`,

        }}
        className="w-[500px] h-[110px] text-[77px] font-[tungsten] absolute left-[690px] text-center text-white pt-[0px] top-[10px]"
      >
  PLAYERS SUMMARY
      </div>



      <div className='w-[1900px] h-[800px] absolute left-[70px] top-[180px] flex gap-5'>
        {topCategories.map((item, index) => {
  const player = item.player;
  if (!player) return null;

  return (
    <div
        style={{
                      backgroundImage: `linear-gradient(to left top, ${tournament.primaryColor || '#6b21a8'}, ${tournament.secondaryColor || '#c084fc'}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,

    }}
    key={index} className='w-[340px] h-[100%] bg-white overflow-hidden flex flex-col'>

      {/* Player Image */}
     {/* Player Image */}
<div className="w-full h-[780px] relative overflow-hidden">
  {/* Background Logo */}
  <img
    src={player.teamLogo || '/def_char.avif'} // fallback if teamLogo is missing
    alt="logo-bg"
    className="absolute inset-0 w-full h-full -rotate-45 opacity-40 object-contain filter grayscale blur-[1px] scale-[3.5] z-0"
    style={{ mixBlendMode: 'overlay' }}
  />

  {/* Centered Green Stat Box */}
  <div className='w-full h-[150px] absolute bottom-0 flex flex-col items-center justify-center text-center z-50'>
    {/* Category Label */}
    <div className="text-white text-[28px] font-[agencyb] mb-[-30px]">
      {item.label.toUpperCase()}
    </div>

    {/* Stat Value */}
    <div
      style={{
                      color: `${tournament.primaryColor || '#6b21a8'}`,

    }}
    className="text-white text-[90px] font-[tungsten] ">
      {Math.round(player[item.valueKey])}
      {item.valueKey === "killDistance" ? " m" : ""}
    </div>
  </div>

  {/* Player Image */}
  <img
    src={player.picUrl || "/def_char.avif"}
    alt={player.playerName}
    className="w-full h-full object-cover relative z-10"
  />

  {/* Bottom Gradient */}
  <div className="absolute bottom-0 left-0 w-full h-[45%] bg-gradient-to-t from-black/100 to-transparent z-20" />
</div>
      {/* Player Name */}
      <div
          style={{
                      backgroundImage: `linear-gradient(to left top, ${tournament.primaryColor || '#6b21a8'}, ${tournament.secondaryColor || '#c084fc'}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,

    }}
      className='bg-gradient-to-r from-slate-800 to-gray-900 text-white text-[40px] font-[agencyb] flex justify-between px-4 py-2'>
        <span>{player.playerName.toUpperCase()}</span>
        <img src={player.teamLogo} className='w-[60px] ' />
      </div>

    </div>
  );
})}
        {topCategories.length === 0 && (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-xl">
            No player data available
          </div>
        )}
      </div>
    </div>
  );
};


export default MatchFragrs;
