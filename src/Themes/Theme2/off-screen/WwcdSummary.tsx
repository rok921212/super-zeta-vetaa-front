import React, { useMemo } from 'react';
import { Team, MatchData } from '../../shared/hooks/unsortteams';
import { isWinningPlacement, compareOfficialStandings } from '../../shared/hooks/officialStandings';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
// NOTE: SocketManager import removed — this component no longer opens its
// own socket subscription. PublicThemeRenderer owns the single socket
// connection, listens to 'bulkUpdate', and passes the freshly-merged
// matchData down as a prop on every change. That prop update is what
// re-renders this component now, same as the Theme2 conversion pattern
// used in Alerts.tsx / Dom.tsx / LiveStats.tsx.
//
// Player / Team / MatchData are imported from useSortedTeams' shared hook
// module rather than redeclared locally — duplicate same-named interfaces
// with different shapes are NOT the same type to TypeScript. The unused
// `Teams` dashboard import from the pre-conversion version has also been
// dropped — it was never referenced in this component.

// ─────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────
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
  _matchNo?: number;
}

interface WwcdSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const WwcdSummary: React.FC<WwcdSummaryProps> = ({ tournament, round, match, matchData }) => {
  const teamsWithTotals = useMemo(() => {
    if (!matchData) return [] as Array<Team & { totalKills: number; total: number; totalDamage: number; totalAssists: number }>;
    return matchData.teams
      .map((team: Team) => {
        const totalKills = team.players.reduce((sum, p) => sum + (Number(p.killNum) || 0), 0);
        const totalDamage = team.players.reduce((sum, p) => sum + (Number((p as any).damage) || 0), 0);
        const totalAssists = team.players.reduce((sum, p) => sum + (Number((p as any).assists) || 0), 0);
        const totakKnockouts = team.players.reduce((sum, p) => sum + (Number((p as any).knockouts) || 0), 0);
        return {
          ...team,
          totalKills,
          totalDamage,
          totalAssists,
          totakKnockouts,
          total: totalKills + (Number(team.placePoints) || 0),
        };
      })
      .filter((team) => isWinningPlacement(team.placePoints, team.players?.[0]?.rank))
      .sort((a, b) => compareOfficialStandings(
        {
          wwcd: isWinningPlacement(a.placePoints, a.players?.[0]?.rank) ? 1 : 0,
          totalPlacePoints: a.placePoints || 0,
          totalKills: a.totalKills || 0,
          lastMatchPlacePoints: a.placePoints || 0,
        },
        {
          wwcd: isWinningPlacement(b.placePoints, b.players?.[0]?.rank) ? 1 : 0,
          totalPlacePoints: b.placePoints || 0,
          totalKills: b.totalKills || 0,
          lastMatchPlacePoints: b.placePoints || 0,
        }
      ));
  }, [matchData]);

  const winner = teamsWithTotals[0];

  if (!matchData) {
    return (
      <div className="w-[1920px] h-[1080px] bg-black flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No match data available</div>
      </div>
    );
  }

  // Get top 4 players from the winning team via Fragger Score, scoped to
  // just this one team's roster (a one-match, one-team pool) — kills alone
  // no longer drives the ranking.
  const topPlayers = winner
    ? computeFraggerScores(buildFraggerPool([{ teams: [winner] }]))
        .sort(compareFraggerScore)
        .filter(player => player.picUrl) // Filter players with pictures
        .slice(0, 4) // Get top 4 players
    : undefined;

  return (
  <div className=' w-[1920px] h-[1080px] '>
    <div
     style={{
   backgroundImage: `linear-gradient(135deg, ${
 tournament.secondaryColor || '#000'
}, #000)`,
   WebkitBackgroundClip: 'text',
   WebkitTextFillColor: 'transparent',
 }}
   className='text-white text-[10rem] font-[agencyb] absolute left-[500px] top-[0px]'>
     <div>BOOYAH BOOYAH</div>
     <div>BOOYAH BOOYAH</div>

   </div>

     <div
    style={{
    border: "2px solid",
    borderImage: `linear-gradient(135deg, ${
      tournament.primaryColor || "#000"
    }, #000) 1`,
  }}
      className='bg-white w-[350px] h-[130px] absolute left-[760px] top-[540px] flex '>
        <div

        className='w-full h-[100%]'
           style={{
   backgroundImage: `linear-gradient(135deg, ${
 tournament.secondaryColor || '#000'
}, #000)`,

 }}>
       <img

       src={winner?.teamLogo ||  "/def_logo.png"} alt="" className='w-[150px] h-[100px] object-contain pl-[20px] ' />
       </div>
        <div className='text-black text-[79px] font-[agencyb]  text-center w-full'>{winner.teamTag}</div>
      </div>

   <div
    key={winner?._id || winner?.teamId}
     style={{
  backgroundImage: `linear-gradient(135deg, ${
 tournament.primaryColor || '#000'
}, #000)`

 }}
   className='bg-black w-[900px] h-[130px] absolute left-[500px] top-[680px]'>
<div className="text-white text-[76px] font-[agencyb] flex items-center gap-[100px] w-full ml-[210px]">

 <span>{round?.roundName}</span>
 <span>MATCH {match?.matchNo}</span>

</div>

   </div>


  </div>
  );
};

export default WwcdSummary;
