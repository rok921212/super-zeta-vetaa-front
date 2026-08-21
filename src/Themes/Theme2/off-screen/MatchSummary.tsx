import React, { useMemo } from 'react';
// NOTE: the own fetch(...) call to /matches/:id/matchdata has been removed.
// PublicThemeRenderer already does the one shared fetch and passes
// `matchData` down as a prop for the 'MatchSummary' view.

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
  killNumInVehicle?: number;
  killNumByGrenade?: number;
  headShotNum?: number;
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

interface MatchSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const MatchSummary: React.FC<MatchSummaryProps> = ({ tournament, round, match, matchData }) => {
  const stats = useMemo(() => {
    if (!matchData) return null;

    let totalEliminations = 0;
    let totalAssists = 0;
    let totalKnockouts = 0;
    let totalKillsInVehicle = 0;
    let totalKillsByGrenade = 0;
    let totalHeadshots = 0;

    matchData.teams.forEach(team => {
      team.players.forEach(player => {
        totalEliminations += Number(player.killNum || 0);
        totalAssists += Number(player.assists || 0);
        totalKnockouts += Number(player.knockouts || 0);
        totalKillsInVehicle += Number(player.killNumInVehicle || 0);
        totalKillsByGrenade += Number(player.killNumByGrenade || 0);
        totalHeadshots += Number(player.headShotNum || 0);
      });
    });

    return {
      totalEliminations,
      totalAssists,
      totalKnockouts,
      totalKillsInVehicle,
      totalKillsByGrenade,
      totalHeadshots,
    };
  }, [matchData]);

  if (!matchData || !stats) {
    return (
      <div style={{ width: '1920px', height: '1080px', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'white', fontSize: '24px', fontFamily: 'Righteous' }}>No match data available</div>
      </div>
    );
  }

  return (
    <div style={{ width: '1920px', height: '1080px', position: 'relative',  color: 'white' }}>
      {/* Header */}
      <div className="absolute top-[40px] left-[180px]">
      <span className='font-bebas text-[6rem] relative left-[90px]'>MATCH SUMMARY</span>
        <div 
          style={{
            backgroundImage: `linear-gradient(to left, transparent, ${tournament.primaryColor})`,
            clipPath: "polygon(30px 0%, 100% 0%, 100% 100%, 30px 100%, 0% 50%)",
          }}
          className="text-[2rem] font-[Righteous] pl-[40px] flex items-center h-[70px] mt-[-20px] ml-[50px]">
    {tournament.tournamentName} - {round?.roundName} - MATCH {match?.matchNo ?? match?._matchNo ?? 'N/A'}
        </div>
      </div>

      {/* Stats Display */}
      <div className="absolute top-[300px] left-[50%] transform -translate-x-1/2 w-[1500px] h-[1600px] ">
        <div className="grid grid-cols-3 gap-6">
          {/* Total Eliminations */}
          <div className="flex flex-col items-center">
            <div
              style={{
                background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
              }}
              className="w-full h-[250px] rounded-lg flex flex-col items-center justify-center p-6">
              <div className="text-[5rem] font-bebas text-yellow-300">{stats.totalEliminations}</div>
              <div className="text-[1.5rem] font-[Righteous] text-white mt-2 bg-[#000000a5] w-full flex justify-center p-[10px]">ELIMINATIONS</div>
            </div>
          </div>

          {/* Total Assists */}
          <div className="flex flex-col items-center">
            <div
              style={{
                background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
              }}
              className="w-full h-[250px] rounded-lg flex flex-col items-center justify-center p-6">
              <div className="text-[5rem] font-bebas text-yellow-300">{stats.totalAssists}</div>
              <div className="text-[1.5rem] font-[Righteous] text-white mt-2 bg-[#000000a5] w-full flex justify-center p-[10px]">ASSISTS</div>
            </div>
          </div>

          {/* Total Knockouts */}
          <div className="flex flex-col items-center">
            <div
              style={{
                background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
              }}
              className="w-full h-[250px] rounded-lg flex flex-col items-center justify-center p-6">
              <div className="text-[5rem] font-bebas text-yellow-300">{stats.totalKnockouts}</div>
              <div className="text-[1.5rem] font-[Righteous] text-white mt-2 bg-[#000000a5] w-full flex justify-center p-[10px]">KNOCKOUTS</div>
            </div>
          </div>

          {/* Vehicle Kills */}
          <div className="flex flex-col items-center">
            <div
              style={{
                background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
              }}
              className="w-full h-[250px] rounded-lg flex flex-col items-center justify-center p-6">
              <div className="text-[5rem] font-bebas text-yellow-300">{stats.totalKillsInVehicle}</div>
              <div className="text-[1.5rem] font-[Righteous] text-white mt-2 bg-[#000000a5] w-full flex justify-center p-[10px]">VEHICLE KILLS</div>
            </div>
          </div>

          {/* Grenade Kills */}
          <div className="flex flex-col items-center">
            <div
              style={{
                background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
              }}
              className="w-full h-[250px] rounded-lg flex flex-col items-center justify-center p-6">
              <div className="text-[5rem] font-bebas text-yellow-300">{stats.totalKillsByGrenade}</div>
              <div className="text-[1.5rem] font-[Righteous] text-white mt-2 bg-[#000000a5] w-full flex justify-center p-[10px]">GRENADE KILLS</div>
            </div>
          </div>

          {/* Headshots */}
          <div className="flex flex-col items-center">
            <div
              style={{
                background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
              }}
              className="w-full h-[250px] rounded-lg flex flex-col items-center justify-center p-6">
              <div className="text-[5rem] font-bebas text-yellow-300">{stats.totalHeadshots}</div>
              <div className="text-[1.5rem] font-[Righteous] text-white mt-2 bg-[#000000a5] w-full flex justify-center p-[10px]">HEADSHOTS</div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Info */}
     
    </div>
  );
};

export default MatchSummary;
