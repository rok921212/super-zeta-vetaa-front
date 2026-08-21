import React, { useState } from 'react';

interface Tournament {
  _id: string;
  tournamentName: string;
  primaryColor?: string;
}

interface Round {
  _id: string;
  roundName: string;
  day?: string;
}

interface Match {
  _id: string;
  matchNo?: number;
}

interface Player {
  _id: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  health: number;
  healthMax: number;
  liveState: number;
}

interface Team {
  _id: string;
  teamTag: string;
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

const Slots: React.FC<SlotsProps> = ({
  tournament,
  round,
  match,
  matchData,
}) => {
  /* ================= CONTROLS ================= */
  const [rows, setRows] = useState(8);
  const [cols, setCols] = useState(8);

  if (!matchData || !matchData.teams) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center bg-black text-white">
        No match data available
      </div>
    );
  }

  /* ================= CONSTANTS ================= */
  const BASE_BOX_W = 200;
  const BASE_BOX_H = 200;

  const GAP_X = 20;
  const GAP_Y = 40;

  const GRID_MAX_WIDTH = 1720; // inside 1920
  const GRID_MAX_HEIGHT = 730;

  /* ================= AUTO SCALE ================= */
  const scaleX =
    (GRID_MAX_WIDTH - GAP_X * (cols - 1)) /
    (BASE_BOX_W * cols);

  const scaleY =
    (GRID_MAX_HEIGHT - GAP_Y * (rows - 1)) /
    (BASE_BOX_H * rows);

  const scale = Math.min(1, scaleX, scaleY);

  const boxW = Math.floor(BASE_BOX_W * scale);
  const boxH = Math.floor(BASE_BOX_H * scale);

  /* ================= DATA ================= */
  const totalSlots = rows * cols;
  const slots = Array.from({ length: totalSlots }, (_, i) =>
    i < matchData.teams.length ? matchData.teams[i] : null
  );

  return (
    <div className="flex flex-col items-center">

      {/* ================= 1920x1080 CANVAS ================= */}
      <div className="w-[1920px] h-[1080px] relative overflow-hidden">

        {/* Title */}
        <div
          className="absolute left-[140px] top-0 text-[142px] font-[agencyb]"
          style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor ?? '#FFF700'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          TEAM PARTICIPATE
        </div>

        <div
          className="absolute left-[1340px] top-[0px] text-[78px] font-[agencyb]"
          style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor ?? '#FFF700'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {round?.roundName}
        </div>

        <div className="absolute left-[1310px] top-[70px] text-black text-[78px] font-[agencyb]">
          DAY {round?.day} MATCH {match?.matchNo}
        </div>

        {/* Grid */}
        <div
          className="grid absolute top-[280px] left-[100px]"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${boxW}px)`,
            gridAutoRows: `${boxH}px`,
            columnGap: GAP_X,
            rowGap: GAP_Y,
          }}
        >
          {slots.map((team, index) =>
            team ? (
              <svg
                key={index}
                width={boxW}
                height={boxH}
                viewBox={`0 0 ${boxW} ${boxH}`}
              >
                <defs>
                  <clipPath id={`clip_${index}`}>
                    <path
                      d={`
                        M ${boxW * 0.125},0
                        Q 0,0 0,${boxH * 0.167}
                        L 0,${boxH}
                        L ${boxW},${boxH}
                        L ${boxW},0 Z
                      `}
                    />
                  </clipPath>

                  <linearGradient
                    id={`grad_${index}`}
                    x1="0"
                    y1="0"
                    x2={boxW}
                    y2={boxH}
                  >
                    <stop offset="0%" stopColor={tournament.primaryColor ?? '#FFF700'} />
                    <stop offset="100%" stopColor="#000" />
                  </linearGradient>
                </defs>

                <rect
                  width={boxW}
                  height={boxH}
                  fill="white"
                  clipPath={`url(#clip_${index})`}
                />

                <rect
                  y={boxH * 0.72}
                  width={boxW}
                  height={boxH * 0.28}
                  fill={`url(#grad_${index})`}
                />

                <image
                  href={team.teamLogo || '/def_logo.png'}
                  x={boxW * 0.1}
                  y={boxH * 0.05}
                  width={boxW * 0.8}
                  height={boxH * 0.65}
                  clipPath={`url(#clip_${index})`}
                />

                <text
                  x={boxW / 2}
                  y={boxH - 10}
                  textAnchor="middle"
                  fill="white"
                  fontSize={Math.max(12, boxW * 0.17)}
                  fontFamily="AGENCYB"
                >
                  {team.teamTag}
                </text>
              </svg>
            ) : null
          )}
        </div>
      </div>

      {/* ================= CONTROLS (BELOW 1920x1080) ================= */}
      <div className="mt-6 flex gap-6 bg-black text-white px-6 py-4 rounded-lg">
        <div>
          <label className="block text-sm">Rows</label>
          <input
            type="number"
            min={1}
            max={12}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
            className="w-[80px] px-2 py-1 text-black"
          />
        </div>

        <div>
          <label className="block text-sm">Columns</label>
          <input
            type="number"
            min={1}
            max={12}
            value={cols}
            onChange={(e) => setCols(Number(e.target.value))}
            className="w-[80px] px-2 py-1 text-black"
          />
        </div>
      </div>
    </div>
  );
};

export default Slots;
