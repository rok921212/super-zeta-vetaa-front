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
  apiEnable?: boolean;
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
  health: number;
  healthMax: number;
  liveState: number;
}

interface Team {
  _id: string;
  teamId?: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface SlotsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const Slots: React.FC<SlotsProps> = ({ tournament, round, match, matchData }) => {
  const cols = 5;

  if (!matchData || !matchData.teams) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center bg-black text-white">
        No match data available
      </div>
    );
  }

  const teams = matchData.teams;
  const rows = 5;
  const totalSlots = rows * cols;
  const slots = Array.from({ length: totalSlots }, (_, i) => i < teams.length ? teams[i] : null);

 return (
  <div className="w-[1920px] h-[1080px]   flex items-center justify-center">
    <div
      className="grid gap-0"   // <-- no gaps at all
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {slots.map((team, index) => {
        if (!team) return null; // remove empty cells

        return (
          <div
            key={index}
            className="flex items-center justify-center bg-[#000000a5] rounded border-[2px] border-white w-[220px] h-[220px] ml-[20px] mb-[20px] relative top-[100px]"
          >
            <img
              src={team.teamLogo}
              alt={team.teamTag}
              className="w-full h-full object-contain"
            />
          </div>
        );
      })}
    </div>
  </div>
);

};

export default Slots;