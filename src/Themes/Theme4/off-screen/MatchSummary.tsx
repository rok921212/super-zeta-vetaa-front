import React, { useMemo } from 'react';
import { computeMatchTotals } from '../../shared/hooks/matchTotals';
import { isWinningPlacement } from '../../shared/hooks/officialStandings';
// NOTE: api import and the own-REST matchData fallback removed —
// PublicThemeRenderer always supplies `matchData` as a prop for this view.
// `backpackInfo` is NOT passed for the 'MatchSummary' view (see the switch
// in PublicThemeRenderer.tsx), so the backpack-item-based heals total is
// replaced with the heals total already available per-player on matchData
// (stats.totalHeals below).

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
  heal?: number;
  airDropsLooted?: number;
  revives?: number;
  longestDistElim?: number;
  maxKillDistance?: number;
  matchDuration?: number;
  gotAirDropNum?: number;
  rescueTimes?: number;
  survivalTime?: number;
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

const StatBox: React.FC<{ header: string; value: string | number; color?: string; image?: string; secondaryColor?: string }> = ({
  header,
  value,
  color = '#ffffff',
  image,
  secondaryColor
}) => {
  return (
    <div className="flex items-center">
      {image && (
        <img
          src={image}
          alt={header}
          className="w-[90px] h-[90px] object-contain mr-[-20px] z-10 relative left-[-60px]"
        />
      )}
      <div className={`relative w-[250px] h-[150px] m-[8px] ${image ? 'ml-[-20px]' : ''}`}>
        <div className="relative w-full h-full flex flex-col items-center justify-center p-2">
          <div

          style={{
   backgroundImage: `linear-gradient(135deg, ${
  secondaryColor || '#000'
}, #000)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
          className="relative z-10 text-[25px] font-[AGENCYB] text-black mb-[-25px] w-[300px] flex justify-center items-center">{header}</div>
          <div className="relative z-10 text-[70px] font-[AGENCYB] text-black">{value}</div>
        </div>
        <div
          className="absolute inset-0 -z-0 transform -skew-x-[6deg] origin-left"
          style={{
            backgroundColor: color,
            boxShadow: `0 0 0 2px ${secondaryColor || '#000'}`,

          }}
        >
          <div className="w-full h-full bg-white"></div>
        </div>
      </div>
    </div>
  );
};


const MatchSummary: React.FC<MatchSummaryProps> = ({ tournament, round, match, matchData }) => {
const topTeams = useMemo(() => {
  if (!matchData) return [];

  return matchData.teams.filter(team => isWinningPlacement(team.placePoints, (team.players?.[0] as any)?.rank)).slice(0, 1); // Only the first winner
}, [matchData]);
const TopTeamsBox: React.FC<{ teams: Team[], secondaryColor?: string }> = ({ teams, secondaryColor }) => {
  return (
    <div className="flex items-center">
      <div className="relative w-[250px] h-[150px] ml-[-20px]">
        <div className="relative w-full h-full p-2">
          <div className="relative z-10 space-y-[4px]">
            {teams.map((team, index) => (
              <div
                key={team.teamId}
                className="flex items-center justify-between"
              >
                <div className="flex items-center justify-center w-[250px] h-[150px]">
                  <img
                    src={team.teamLogo}
                    alt={team.teamTag}
                    className="w-[140px] h-[140px] object-contain absolute left-[-140px] top-0"
                  />
                  <span className="text-[70px] font-bold font-[AGENCYB]">
                    {team.teamTag}
                  </span>
                </div>

              </div>
            ))}
          </div>
        </div>
        <div
          className="absolute inset-0 -z-0 transform -skew-x-[6deg] origin-left"
          style={{
            boxShadow: `0 0 0 2px ${secondaryColor || '#000'}`,

          }}
        >
          <div className="w-full h-full bg-white"></div>
        </div>
      </div>
    </div>
  );
};
  // Helper function to convert seconds to minutes with 1 decimal place
  const formatToMinutes = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const stats = useMemo(() => {
    const t = computeMatchTotals(matchData);
    return t ? { ...t, matchDuration: formatToMinutes(t.matchDurationSeconds) } : null;
  }, [matchData]);

  if (!matchData || !stats) return null;

  // First row: logo, heal, knocks
  // Second row: airdrop, damage, revives
  // Third row: longest elims, total elims, match duration
  const statBoxes = [
    // First row
    { header: 'TOTAL HEAL', value: stats.totalHeals, image: '/theme4assets/health.png' },
    { header: 'TOTAL KNOCKS', value: stats.totalKnocks, image: '/theme4assets/knoc.png' },

    // Second row
    { header: 'AIR DROPS LOOTED', value: stats.totalAirdrops, image: '/theme4assets/airdrop.png' },
    { header: 'TOTAL DAMAGE', value: stats.totalDamage, image: '/theme4assets/totaldamages.png' },
    { header: 'TOTAL REVIVES', value: stats.totalRevives, image: '/theme4assets/total revives.png' },

    // Third row
    { header: 'LONGEST DIST. ELIMS', value: stats.longestDistElim, image: '/theme4assets/longest dist elims.png' },
    { header: 'TOTAL ELIMS', value: stats.totalElims, image: '/theme4assets/total elims.png' },
    { header: 'TOTAL MATCH DURATION', value: stats.matchDuration, image: '/theme4assets/totalmatchdur.png' },
  ];

  return (
    <div className="w-[1920px] h-[1080px] flex flex-col items-center relative">
      {/* Titles */}
      <div className="w-[1500px] h-[250px] absolute top-[100px] flex">
        <div
          style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.secondaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
          className="font-[AGENCYB] text-[150px]"
        >
          GAME SUMMARY
        </div>
        <div
          style={{
            backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
          className="font-[AGENCYB] text-[100px] absolute left-[1000px]"
        >
          {round?.roundName}
        </div>
        <div className="text-black font-[AGENCYB] text-[80px] absolute left-[1020px] top-[100px] w-[600px]">
          DAY {round?.day} - MATCH {match?.matchNo}
        </div>
      </div>
<div className="mt-[400px] w-full px-20">
  {/* First Row */}
  <div className="flex justify-center gap-[100px] mb-10">
    <TopTeamsBox teams={topTeams} secondaryColor={tournament.secondaryColor} />
    <StatBox
      header="TOTAL HEAL"
      value={statBoxes[0].value}
      color="#ffffff"
      image={statBoxes[0].image}
      secondaryColor={tournament.secondaryColor}
    />
    <StatBox
      header="TOTAL KNOCKS"
      value={statBoxes[1].value}
      color="#ffffff"
      image={statBoxes[1].image}
      secondaryColor={tournament.secondaryColor}
    />
  </div>

  {/* Second Row */}
  <div className="flex justify-center gap-[100px] mb-10">
    <StatBox
      header="AIR DROPS LOOTED"
      value={statBoxes[2].value}
      color="#ffffff"
      image={statBoxes[2].image}
      secondaryColor={tournament.secondaryColor}
    />
    <StatBox
      header="TOTAL DAMAGE"
      value={statBoxes[3].value}
      color="#ffffff"
      image={statBoxes[3].image}
      secondaryColor={tournament.secondaryColor}
    />
    <StatBox
      header="TOTAL REVIVES"
      value={statBoxes[4].value}
      color="#ffffff"
      image={statBoxes[4].image}
      secondaryColor={tournament.secondaryColor}
    />
  </div>

  {/* Third Row */}
  <div className="flex justify-center gap-[100px]">
    <StatBox
      header="LONGEST DIST. ELIMS"
      value={`${(Number(statBoxes[5].value) / 100).toFixed(1)}m`}
      color="#ffffff"
      image={statBoxes[5].image}
      secondaryColor={tournament.secondaryColor}
    />
    <StatBox
      header="TOTAL ELIMS"
      value={statBoxes[6].value}
      color="#ffffff"
      image={statBoxes[6].image}
      secondaryColor={tournament.secondaryColor}
    />
    <StatBox
      header="TOTAL MATCH DURATION"
      value={statBoxes[7].value}
      color="#ffffff"
      image={statBoxes[7].image}
      secondaryColor={tournament.secondaryColor}
    />
  </div>
</div>


    </div>
  );
};

export default MatchSummary;
