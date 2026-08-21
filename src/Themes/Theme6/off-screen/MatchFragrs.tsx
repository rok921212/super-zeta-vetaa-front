import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
// NOTE: SocketManager import removed, along with the localMatchData mirror
// state and its two socket effects. PublicThemeRenderer owns the single
// socket connection and passes freshly-merged `matchData` down as a prop —
// this component now just reads that prop directly.

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
  knockouts?: number;
  health?: number;
  healthMax?: number;
  liveState?: number;
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
  const localMatchData = matchData ?? null;

  // Top 5 players
  const topPlayers = useMemo(() => {
    if (!localMatchData) return [];

    const allPlayers = localMatchData.teams.flatMap(team =>
      team.players.map(player => ({
        ...player,
        killNum: Number(player.killNum || 0),
        numericDamage: Number(player.damage ?? 0),
        assists: Number(player.assists ?? 0),
        knockouts: Number(player.knockouts ?? 0),
        teamTag: team.teamTag,
        teamLogo: team.teamLogo,
        teamName: team.teamName,
        teamPoints: team.placePoints,
      }))
    );

    return allPlayers
      .sort((a, b) => b.killNum - a.killNum || b.numericDamage - a.numericDamage || b.assists - a.assists)
      .slice(0, 5);
  }, [localMatchData]);

  if (!localMatchData) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[AGENCYB]">No match data available</div>
      </div>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px] relative ">
      {/* Header */}
      <div
        style={{
          color:  `${tournament.primaryColor} `,
        
        }}
        className="w-[800px] text-[100px] font-[tungsten] absolute top-[60px] text-center bg-white h-[100px] flex items-center justify-center left-[550px]"
      >
        TOP FRAGGERS - MATCH {match?.matchNo}
      </div>

      {/* Round */}
      <div
      
        className="text-[58px] font-[agencyb] absolute  top-[150px] text-white w-[100%] flex items-center justify-center flex-col"
      >
        <div
           style={{
                backgroundImage: `linear-gradient(to bottom right, ${tournament.primaryColor}, ${tournament.secondaryColor}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
              }} className='w-[400px] text-center absolute top-[10px]'
        >
        {round?.roundName.toUpperCase()}
        </div>
      </div>


      {/* Player Cards */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1 }}
        className="flex flex-wrap justify-center absolute top-[280px] left-[0px] w-full  font-[AGENCYB]"
      >
        {topPlayers.map((player, index) => (
          <motion.div
            key={player._id}
            className="relative w-[340px] h-[416px] bg-white m-4 border-2 border-gray-400"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.15 }}
          >
            {/* Player Image */}
            <div className="w-full h-[340px] overflow-hidden absolute z-10">
              <img
                src={player.picUrl || '/def_char.avif'}
                alt={player.playerName}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Rank */}
            <div className="absolute text-black text-[30px] ml-2 mt-2">#{index + 1}</div>

            {/* Team Logo */}
            {player.teamLogo && (
              <div className="w-[70px] h-[65px] absolute right-[10px] top-[10px] z-0">
                <img src={player.teamLogo} alt="team logo" className="w-full h-full object-cover" />
              </div>
            )}

            {/* Team Logo Blurred Background */}
            {player.teamLogo && (
              <div className="h-[205px] w-[100px] absolute left-[120px] top-[120px] z-0 scale-[2.5]">
                <img
                  src={player.teamLogo}
                  alt="team logo"
                  className="w-full h-full object-contain blur-[1px] saturate-0 opacity-30"
                />
              </div>
            )}

            {/* Player Name */}
            <div className="w-full bg-black h-[80px] text-white absolute top-[280px] flex items-center justify-center z-20">
              <div className="text-[50px]" >
                {player.playerName.toUpperCase()}
              </div>
            </div>

            {/* Stats Grid */}
            <div
              className="bg-red-800 w-full h-[286px] absolute top-[350px] flex"
              style={{
                backgroundImage: `linear-gradient(to bottom right, ${tournament.primaryColor}, ${tournament.secondaryColor}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
              }}
            >
              <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-0 p-4 text-white text-[50px]">
                {/* DAMAGE */}
                <div className="flex flex-col justify-center items-center">
                  <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[44px]">
                    {Math.floor(player.numericDamage) || '0'}
                  </div>
                  <div className="mt-2 text-[30px]">DAMAGE</div>
                </div>

                {/* KILLS */}
                <div className="flex flex-col justify-center items-center">
                  <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[44px]">
                    {player.killNum || '0'}
                  </div>
                  <div className="mt-2 text-[30px]">KILLS</div>
                </div>

                {/* KNOCKOUTS */}
                <div className="flex flex-col justify-center items-center">
                  <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[36px]">
                    {player.knockouts || '0'}
                  </div>
                  <div className="mt-2 text-[30px]">KNOCKOUTS</div>
                </div>

                {/* ASSISTS */}
                <div className="flex flex-col justify-center items-center">
                  <div className="bg-black min-w-[90px] px-4 h-[60px] flex items-center justify-center text-[36px]">
                    {player.assists || '0'}
                  </div>
                  <div className="mt-2 text-[30px]">ASSISTS</div>
                </div>

                {/* Team Name Bottom Bar */}
                <div className="bg-white w-full h-[10%] absolute left-0 bottom-0 text-black text-[20px] text-center flex items-center justify-center">
                  {player.teamName.toUpperCase()}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default MatchFragrs;