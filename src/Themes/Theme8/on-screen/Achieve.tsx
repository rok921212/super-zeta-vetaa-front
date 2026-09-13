import React, { useMemo } from 'react';
import { buildFraggerPool, pickLeader } from '../../shared/hooks/fraggerScore';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// matchData / matchDatas as props. The per-category leaderboard is the
// shared buildFraggerPool + pickLeader — no theme-local pool aggregation.

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
  matchDatas?: MatchData[] | null;
}


const MatchFragrs: React.FC<MatchFragrsProps> = ({ tournament, round, match, matchData, matchDatas }) => {
type StatKey =
  | "killNum"
  | "damage"
  | "grenadeKills"
  | "killDistance"
  | "travelDistance";

interface AggregatedPlayer {
  _id: string;
  playerName: string;
  picUrl?: string;
  teamLogo: string;
  teamName: string;
  killNum: number;
  damage: number;
  grenadeKills: number;
  killDistance: number;
  travelDistance: number;
}

// Round-wide leaderboard from the shared fragger pool: kills/damage/
// grenade-kills are summed across every match, kill-distance/travel-distance
// are a running MAX (a player's single best match).
 const topCategories = useMemo(() => {
  const matchesToPool = matchDatas && matchDatas.length ? matchDatas : matchData ? [matchData] : [];
  if (matchesToPool.length === 0) return [];

  const pool = buildFraggerPool(matchesToPool as any);
  const asAgg = (e: ReturnType<typeof buildFraggerPool>[number] | null): AggregatedPlayer | undefined =>
    e
      ? {
          _id: e._id,
          playerName: e.playerName,
          picUrl: e.picUrl,
          teamLogo: e.teamLogo,
          teamName: e.teamName,
          killNum: e.totalKills,
          damage: e.totalDamage,
          grenadeKills: e.totalGrenadeKills,
          killDistance: e.longestKillDistance,
          travelDistance: e.maxTravelDistance,
        }
      : undefined;

  return [
    { label: "GUNSLINGER", player: asAgg(pickLeader(pool, 'totalKills')), valueKey: "killNum" as StatKey },
    { label: "DMG DEALER", player: asAgg(pickLeader(pool, 'totalDamage')), valueKey: "damage" as StatKey },
    { label: "GRENADIER", player: asAgg(pickLeader(pool, 'totalGrenadeKills')), valueKey: "grenadeKills" as StatKey },
    { label: "EAGLE EYE", player: asAgg(pickLeader(pool, 'longestKillDistance')), valueKey: "killDistance" as StatKey },
  ];
}, [matchDatas, matchData]);

  if (!matchDatas?.length && !matchData) {
    return (
     <div></div>
    );
  }

  return (
  <>
    <style>
      {`
        @keyframes playerBoxSlideUp {
          0% {
            opacity: 0;
            transform: translateY(110%);
          }

          70% {
            opacity: 1;
            transform: translateY(-3%);
          }

          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .player-box-animate {
          animation: playerBoxSlideUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}
    </style>

    <div className="w-[1920px] h-[1080px]">

      {/* TITLE */}
      <div
        style={{
          clipPath:
            'polygon(40px 0, 100% 0, 100% calc(100% - 40px), calc(100% - 40px) 100%, 0 100%, 0 40px)',

          backgroundImage: `linear-gradient(
            135deg,
            ${tournament.primaryColor || '#000'},
            #000
          )`,
        }}
        className="w-[500px] h-[110px] text-[77px] font-[tungsten] absolute left-[550px] text-center text-white pt-[0px] top-[50px]"
      >
        PLAYERS TO WATCH
      </div>

      {/* PLAYER CONTAINER */}
      <div className="w-[1900px] h-[800px] absolute left-[70px] top-[180px] flex gap-5 overflow-hidden">

        {topCategories.map((item, index) => {
          const player = item.player;

          if (!player) return null;

          return (
            <div
              key={index}
              style={{
                backgroundImage: `linear-gradient(
                  to left top,
                  ${tournament.primaryColor || '#6b21a8'},
                  ${tournament.secondaryColor || '#c084fc'}
                ),
                url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,

                clipPath:
                  'polygon(40px 0, 100% 0, 100% calc(100% - 40px), calc(100% - 40px) 100%, 0 100%, 0 40px)',

                /* STAGGERED ANIMATION */
                animationDelay: `${index * 0.25}s`,
              }}
              className="player-box-animate w-[340px] h-[100%] bg-white overflow-hidden flex flex-col"
            >

              {/* PLAYER IMAGE SECTION */}
              <div className="w-full h-[780px] relative overflow-hidden">

                {/* BACKGROUND TEAM LOGO */}
                <img
                  src={player.teamLogo || '/def_char.avif'}
                  alt="logo-bg"
                  className="
                    absolute
                    inset-0
                    w-full
                    h-full
                    -rotate-45
                    opacity-[100%]
                    object-contain
                    filter
                    grayscale
                    blur-[1px]
                    scale-[3.5]
                    z-0
                  "
                  style={{
                    mixBlendMode: 'overlay',
                  }}
                />

                {/* PLAYER IMAGE */}
                <img
                  src={player.picUrl || '/def_char.avif'}
                  alt={player.playerName}
                  className="
                    w-full
                    h-full
                    object-cover
                    relative
                    z-10
                  "
                />

                {/* BOTTOM GRADIENT */}
                <div
                  className="
                    absolute
                    bottom-0
                    left-0
                    w-full
                    h-[45%]
                    bg-gradient-to-t
                    from-black/100
                    to-transparent
                    z-20
                  "
                />

                {/* PLAYER STAT */}
                <div
                  className="
                    w-full
                    h-[150px]
                    absolute
                    bottom-0
                    flex
                    flex-col
                    items-center
                    justify-center
                    text-center
                    z-50
                  "
                >

                  {/* CATEGORY LABEL */}
                  <div className="text-white text-[28px] font-[agencyb] mb-[-30px]">
                    {item.label.toUpperCase()}
                  </div>

                  {/* STAT VALUE */}
                  <div
                    style={{
                      color: tournament.primaryColor || '#6b21a8',
                    }}
                    className="text-white text-[90px] font-[tungsten]"
                  >
                    {Math.round(player[item.valueKey])}
                    {item.valueKey === 'killDistance' ? ' m' : ''}
                  </div>

                </div>

              </div>

              {/* PLAYER NAME */}
              <div
                style={{
                  backgroundImage: `linear-gradient(
                    to left top,
                    ${tournament.primaryColor || '#6b21a8'},
                    ${tournament.secondaryColor || '#c084fc'}
                  ),
                  url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
                }}
                className="
                  bg-gradient-to-r
                  from-slate-800
                  to-gray-900
                  text-white
                  text-[40px]
                  font-[agencyb]
                  flex
                  justify-between
                  px-4
                  py-2
                "
              >

                <span>
                  {player.playerName.toUpperCase()}
                </span>

                <img
                  src={player.teamLogo || '/def_char.avif'}
                  alt="team logo"
                  className="w-[60px]"
                />

              </div>

            </div>
          );
        })}

        {/* NO PLAYER DATA */}
        {topCategories.length === 0 && (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-xl">
            No player data available
          </div>
        )}

      </div>
    </div>
  </>
);
};


export default MatchFragrs;
