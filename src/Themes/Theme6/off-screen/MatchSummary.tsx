import React, { useMemo } from 'react';
import { computeMatchTotals } from '../../shared/hooks/matchTotals';
// NOTE: SocketManager import removed, along with the localMatchData mirror
// state and its two socket/effect blocks. PublicThemeRenderer owns the
// single socket connection and passes freshly-merged `matchData` down as a
// prop — this component now just reads that prop directly.

/* -------------------- Interfaces -------------------- */

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
  killNum?: number;
  knockouts?: number;
  damage?: number;
  headShotNum?: number;
  gotAirDropNum?: number;
  killNumByGrenade?: number;
  heal?: number;
  rescueTimes?: number;
  maxKillDistance?: number;
  survivalTime?: number;
}

interface Team {
  _id: string;
  teamTag: string;
  teamLogo: string;
  teamName: string;
  slot?: number;
  placePoints: number;
  players: Player[];
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

/* -------------------- Stat Box -------------------- */

const StatBox: React.FC<any> = ({ header, value, image, primaryColor }) => (
  <div className="flex items-center relative">

    {image && (
      <img
        src={image}
        className="w-[90px] h-[90px] object-contain mr-[-20px] z-10 relative left-[-60px]"
      />
    )}

    <div
      className="absolute z-10 text-[25px] font-[AGENCYB] text-white ml-[60px] mt-[140px] w-[230px] flex justify-center items-center border-2 border-white"
      style={{
        backgroundImage: `linear-gradient(135deg, ${primaryColor || '#000'}, #000)`
      }}
    >
      {header}
    </div>

    <div className="relative w-[250px] h-[150px] m-[8px] ml-[-20px]">
      <div className="relative w-full h-full flex items-center justify-center z-10">
        <div className="text-[70px] font-[AGENCYB] text-white">{value}</div>
      </div>

      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(135deg, ${primaryColor || '#000'}, #000)`,
          boxShadow: `0 0 0 2px #fff`
        }}
      />
    </div>
  </div>
);

/* -------------------- Main Component -------------------- */

const MatchSummary: React.FC<MatchSummaryProps> = ({
  tournament,
  round,
  match,
  matchData
}) => {

  const localMatchData = matchData ?? null;

  /* -------------------- Stats -------------------- */

  const stats = useMemo(() => computeMatchTotals(localMatchData), [localMatchData]);
  /* -------------------- Stat Boxes -------------------- */

  const statBoxes = [
  {
    header: 'TOTAL KNOCKS',
    value: stats?.totalKnocks || 0,
    image: '/theme4assets/knoc.png'
  },
  {
    header: 'AIR DROPS LOOTED',
    value: stats?.totalAirdrops || 0,
    image: '/theme4assets/airdrop.webp'
  },
  {
    header: 'TOTAL DAMAGE',
    value: stats?.totalDamage || 0,
    image: '/theme4assets/totaldamages.webp'
  },
  {
    header: 'GRENADE KILLS',
    value: stats?.totalGrenadeKills || 0,
    image: '/theme4assets/grenade.webp'
  },
  {
    header: 'LONGEST DIST. ELIMS',
    value: `${((stats?.longestDistElim || 0)).toFixed(0)}m`,
    image: '/theme4assets/longest dist elims.webp'
  },
  {
    header: 'TOTAL ELIMS',
    value: stats?.totalElims || 0,
    image: '/theme4assets/total elims.webp'
  },
  {
    header: 'HEADSHOTS',
    value: stats?.totalHeadshots || 0,
    image: '/theme4assets/headshot.webp'
  },
  {
    header: 'TOTAL HEALS',
    value: stats?.totalHeals || 0,
    image: '/theme4assets/health.webp'
  }
];
  /* -------------------- UI -------------------- */

  return (
    <div className="w-[1920px] h-[1080px] flex flex-col items-center relative">

      <div className="w-[1500px] h-[250px] absolute top-[100px] flex">

        <div
          style={{
            backgroundImage: `linear-gradient(135deg, ${tournament?.secondaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}
          className="font-[AGENCYB] text-[150px]"
        >
          MATCH SUMMARY
        </div>

        

      </div>

      <div className="mt-[350px] grid grid-cols-4 gap-[80px]">

        {statBoxes.map((stat, i) => (
          <StatBox
            key={i}
            header={stat.header}
            value={stat.value}
            image={stat.image}
            primaryColor={tournament?.primaryColor}
          />
        ))}

      </div>

    </div>
  );
};

export default MatchSummary;