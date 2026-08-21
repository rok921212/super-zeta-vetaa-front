import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
// NOTE: the REST fallback fetch (fetch(...matchdata)) removed —
// PublicThemeRenderer always supplies `matchData` as a prop now.

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
  killNum?: number;
  assists?: number;
  knockouts?: number;
  damage?: number;
  headShotNum?: number;
  picUrl?: string;
}

interface Team {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  slot: number;
  placePoints: number;
  players: Player[];
}

interface MatchData {
  _id: string;
  matchId: string;
  userId: string;
  teams: Team[];
}

interface PlayerH2HProps {
   tournament: Tournament;
   round?: Round | null;
   match?: Match | null;
   matchData?: MatchData | null;
 }

const PlayerH2H: React.FC<PlayerH2HProps> = ({ tournament, round, match, matchData }) => {
  const topPlayers = useMemo(() => {
    if (!matchData) return null;

    const allPlayers = matchData.teams.flatMap(team =>
      team.players.map(p => ({
        ...p,
        killNum: Number(p.killNum || 0),
        damage: Number(p.damage || 0),
        assists: Number(p.assists || 0),
        knockouts: Number(p.knockouts || 0),
        headShotNum: Number(p.headShotNum || 0),
        teamTag: team.teamTag,
        teamName: team.teamName,
        teamLogo: team.teamLogo,
      }))
    );

    allPlayers.sort((a, b) => {
      if (b.killNum !== a.killNum) return b.killNum - a.killNum;
      if (b.damage !== a.damage) return b.damage - a.damage;
      return 0;
    });

    return {
      first: allPlayers[0] || null,
      second: allPlayers[1] || null,
    };
  }, [matchData]);

  if (!matchData || !topPlayers?.first || !topPlayers?.second) {
    return (
      <div style={{ width: '1920px', height: '1080px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'white', fontSize: '24px', fontFamily: 'Righteous' }}>Not enough players</div>
      </div>
    );
  }

  const { first, second } = topPlayers;

  return (
    <div style={{ width: '1920px', height: '1080px', position: 'relative', color: 'white' }}>
      {/* Header */}
      <motion.div
        className="absolute z-10 top-[60px] text-[5rem] font-bebas font-[300] w-full text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <h1 className="text-white font-bold whitespace-pre text-[7rem]">PLAYER HEAD TO HEAD</h1>
        <motion.p
          className="text-white text-[2rem] font-[Righteous] whitespace-pre p-[10px] mt-[-20px] w-[800px] mx-auto mb-[20px] "
          style={{ background: `linear-gradient(45deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})` }}
          animate={{ opacity: [0.9, 1, 0.9] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {round?.roundName || '-'}  • DAY  {round?.day || '-'} • MATCH {match?.matchNo}
        </motion.p>
      </motion.div>

      {/* VS Section */}
      <div className="absolute top-[50%] left-[50%] transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-16">
        {/* Player 1 */}
        <div className="flex flex-col items-center mt-[100px]">
          <div
            style={{
              background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
            }}
            className="w-[600px] h-[505px] p-8 flex flex-col items-center justify-center ">
        
            <img 
              src={first.picUrl || 'https://res.cloudinary.com/dqckienxj/image/upload/v1735718663/defult_chach_apsjhc_jydubc.png'} 
              alt={first.playerName} 
              className="w-[200px] h-[200px] object-cover  top-[100px] absolute " 
            />
            <div className="text-[3rem] font-bebas text-black mb-[30px] w-[400px] flex justify-center bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700]">{first.playerName}</div>
           
            
            <div className="grid grid-cols-4 gap-0 w-[600px] text-center bg-[#000000b8] h-[200px] pt-[30px] top-[400px] absolute ">
              <div>
                <div className="text-[5rem] font-bebas text-yellow-300">{first.killNum}</div>
                <div className="text-sm font-[Righteous]">KILLS</div>
              </div>
              <div>
                <div className="text-[5rem] font-bebas text-yellow-300">{first.damage}</div>
                <div className="text-sm font-[Righteous]">DAMAGE</div>
              </div>
              <div>
                <div className="text-[5rem] font-bebas text-yellow-300">{first.knockouts}</div>
                <div className="text-sm font-[Righteous]">KNOCKOUTS</div>
              </div>
              <div>
                <div className="text-[5rem] font-bebas text-yellow-300">{first.assists}</div>
                <div className="text-sm font-[Righteous]">ASSISTS</div>
              </div>
            </div>
          </div>
        </div>

        {/* VS Badge */}
        <div className="text-[6rem] font-bebas text-yellow-300 relative top-[100px]">VS</div>

        {/* Player 2 */}
        <div className="flex flex-col items-center mt-[100px]">
          <div
            style={{
              background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
            }}
            className="w-[600px] h-[505px] p-8 flex flex-col items-center justify-center "
          >
            <img
              src={second.picUrl || 'https://res.cloudinary.com/dqckienxj/image/upload/v1735718663/defult_chach_apsjhc_jydubc.png'}
              alt={second.playerName}
              className="w-[200px] h-[200px] object-cover  top-[100px] absolute"
            />
            <div className="text-[3rem] font-bebas text-black mb-[30px] w-[400px] flex justify-center bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700]">
              {second.playerName}
            </div>

            <div className="grid grid-cols-4 gap-0 w-[600px] text-center bg-[#000000b8] h-[200px] pt-[30px] top-[400px] absolute">
              <div>
                <div className="text-[5rem] font-bebas text-yellow-300">
                  {second.killNum}
                </div>
                <div className="text-sm font-[Righteous]">KILLS</div>
              </div>
              <div>
                <div className="text-[5rem] font-bebas text-yellow-300">
                  {second.damage}
                </div>
                <div className="text-sm font-[Righteous]">DAMAGE</div>
              </div>
              <div>
                <div className="text-[5rem] font-bebas text-yellow-300">
                  {second.knockouts}
                </div>
                <div className="text-sm font-[Righteous]">KNOCKOUTS</div>
              </div>
              <div>
                <div className="text-[5rem] font-bebas text-yellow-300">
                  {second.assists}
                </div>
                <div className="text-sm font-[Righteous]">ASSISTS</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerH2H;
