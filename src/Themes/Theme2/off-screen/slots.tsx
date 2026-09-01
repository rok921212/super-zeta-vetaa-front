import React, { useState } from 'react';

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
  const [cols, setCols] = useState(8);
  const [rows, setRows] = useState(8);

  if (!matchData || !matchData.teams) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center bg-black text-white">
        No match data available
      </div>
    );
  }

  const teams = matchData.teams;
  const totalSlots = cols * rows;

  return (
    <div className="w-[1920px] h-[1080px] bg-black p-4">
      <div className="mb-4 flex gap-4">
        <div className="flex items-center gap-2">
          <label className="text-white">Columns:</label>
          <input
            type="number"
            value={cols}
            onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 px-2 py-1 bg-gray-800 text-white rounded"
            min="1"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-white">Rows:</label>
          <input
            type="number"
            value={rows}
            onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 px-2 py-1 bg-gray-800 text-white rounded"
            min="1"
          />
        </div>
      </div>
      <div
        className="grid gap-2 h-full"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {Array.from({ length: totalSlots }, (_, index) => {
          const team = teams[index];
          return (
            <div
              key={index}
              className="flex items-center justify-center bg-gray-800 rounded"
            >
              {team ? (
                <img
                  src={team.teamLogo}
                  alt={team.teamTag}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-white text-xs">Empty</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Slots;