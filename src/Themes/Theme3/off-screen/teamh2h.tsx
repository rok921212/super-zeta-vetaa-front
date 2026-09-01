import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
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
  rank?: number;
  assists?: number;
  knockouts?: number;
  damage?: number;
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

interface TeamH2HProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const TeamH2H: React.FC<TeamH2HProps> = ({ tournament, round, match, matchData }) => {
  const topTeams = useMemo(() => {
    const s = computeMatchStandings(matchData);
    return { first: s[0] || null, second: s[1] || null };
  }, [matchData]);

  if (!matchData || !topTeams?.first || !topTeams?.second) {
    return (
      <div style={{ width: '1920px', height: '1080px',  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'white', fontSize: '24px', fontFamily: 'Righteous' }}>Not enough teams</div>
      </div>
    );
  }

  const { first, second } = topTeams;

  return (
    <div style={{ width: '1920px', height: '1080px', position: 'relative', color: 'white' }}>
      {/* Header */}
      <motion.div
        className="absolute z-10 top-[60px] text-[5rem] font-bebas font-[300] w-full text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <h1 className="text-white font-bold whitespace-pre text-[7rem]">TEAM HEAD TO HEAD</h1>
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
        {/* Team 1 */}
        <div className="flex flex-col items-center mt-[100px]">
          <div
            style={{
              background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
            }}
            className="w-[600px] h-[505px] p-8 flex flex-col items-center justify-center ">
        
            <img src={first.teamLogo} alt={first.teamTag} className="w-[200px] h-[200px] object-contain top-[100px] absolute " />
            <div className="text-[3rem] font-bebas text-black mb-[30px] w-[400px] flex justify-center bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700]">{first.teamName}</div>
           
            
            <div className="grid grid-cols-3 gap-0 w-[600px] text-center bg-[#000000b8] h-[200px] pt-[30px] top-[400px] absolute ">
              <div>
                <div className="text-[5rem] font-bebas text-yellow-300">{first.totalKills}</div>
                <div className="text-sm font-[Righteous] o">KILLS</div>
              </div>
              <div>
                <div className="text-[5rem] font-bebas text-yellow-300">{first.placePoints}</div>
                <div className="text-sm font-[Righteous] ">PLACE PTS</div>
              </div>
              <div>
                <div className="text-[5rem] font-bebas text-yellow-300">{first.total}</div>
                <div className="text-sm font-[Righteous] ">TOTAL</div>
              </div>
            </div>
          </div>
        </div>

        {/* VS Badge */}
        <div className="text-[6rem] font-bebas text-yellow-300 relative top-[100px]">VS</div>

      {/* Team 2 */}
{/* Team 2 */}
<div className="flex flex-col items-center mt-[100px]">
  <div
    style={{
      background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
    }}
    className="w-[600px] h-[505px] p-8 flex flex-col items-center justify-center "
  >
    <img
      src={second.teamLogo}
      alt={second.teamTag}
      className="w-[200px] h-[200px] object-contain top-[100px] absolute"
    />
    <div className="text-[3rem] font-bebas text-black mb-[30px] w-[400px] flex justify-center bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700]">
      {second.teamName}
    </div>

    <div className="grid grid-cols-3 gap-0 w-[600px] text-center bg-[#000000b8] h-[200px] pt-[30px] top-[400px] absolute">
      <div>
        <div className="text-[5rem] font-bebas text-yellow-300">
          {second.totalKills}
        </div>
        <div className="text-sm font-[Righteous]">KILLS</div>
      </div>
      <div>
        <div className="text-[5rem] font-bebas text-yellow-300">
          {second.placePoints}
        </div>
        <div className="text-sm font-[Righteous]">PLACE PTS</div>
      </div>
      <div>
        <div className="text-[5rem] font-bebas text-yellow-300">
          {second.total}
        </div>
        <div className="text-sm font-[Righteous]">TOTAL</div>
      </div>
    </div>
  </div>
</div>


      </div>
    </div>
  );
};

export default TeamH2H;
