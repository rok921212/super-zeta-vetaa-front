import React from 'react';

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

interface MatchData {
  _id: string;
  matchId: string;
  userId: string;
  teams: any[];
}

interface MapPreviewProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const MapPreview: React.FC<MapPreviewProps> = ({ tournament, round, match, matchData }) => {
  const teams = matchData?.teams || [];

  // Always pick only 20 total teams (10 left + 10 right)
  const visibleTeams = teams.slice(0, 20);
  const leftTeams = visibleTeams.slice(0, 10);
  const rightTeams = visibleTeams.slice(10, 20);

  return (
    <div className="w-[1920px] h-[1080px] flex " >
      
      {/* Left side */}
      <div className="w-[25%] h-full grid grid-rows-10">
        {leftTeams.map((team) => (
             <div
          
          
          key={team.teamId} 
          
          style={{
            background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
          }}
          className="flex flex-col justify-center items-center bg-black text-white  border-white border-solid border-[1px]">
            <div className='absolute left-[415px] rotate-90 w-[110px] bg-white text-black font-bold text-center'>{team.teamTag}</div>
            <div className="flex flex-row justify-center flex-wrap gap-1">
              
              {team.players?.map((player: any) => (
                <img
                  key={player._id}
                  src={player.picUrl || "https://res.cloudinary.com/dqckienxj/image/upload/v1761358753/defplayer_m7qexs.png"}
                  alt={player.playerName}
                  className="object-contain w-[100px] h-[100px] "
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Center area */}
      <div className="w-[50%] h-full border-white border-[10px] border-solid"></div>

      {/* Right side */}
      <div className="w-[25%] h-full grid grid-rows-10">
        {rightTeams.map((team) => (
          <div
          
          
          key={team.teamId} 
          
          style={{
            background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
          }}
          className="flex flex-col justify-center items-center bg-black text-white  border-white border-solid border-[1px]">
            <div className='absolute left-[1365px] rotate-90 w-[110px] bg-white text-black font-bold text-center'>{team.teamTag}</div>
            <div className="flex flex-row justify-center flex-wrap gap-1">
              
              {team.players?.map((player: any) => (
                <img
                  key={player._id}
                  src={player.picUrl || "https://res.cloudinary.com/dqckienxj/image/upload/v1761358753/defplayer_m7qexs.png"}
                  alt={player.playerName}
                  className="object-contain w-[100px] h-[100px] "
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MapPreview;
