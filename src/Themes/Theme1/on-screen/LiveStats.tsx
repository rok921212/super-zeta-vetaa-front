import React from 'react';
import { useSortedTeams, isPlayerDead, Player, MatchData, SortedTeam } from '../../shared/hooks/unsortteams';
import { useRecallEvents } from '../../shared/hooks/recallEvents';
import TeamRecallOverlay from '../../shared/components/TeamRecallOverlay';
// NOTE: SocketManager import removed, along with the localMatchData mirror
// state, six manual socket event handlers, and the overallData socket
// listener. PublicThemeRenderer owns the single socket connection, listens
// to 'bulkUpdate', and passes freshly-merged `matchData` / `overallData`
// down as props on every change — this component now reacts to those props
// directly instead of maintaining its own copy.
//
// NOTE: Player / Team / MatchData are imported from useSortedTeams, NOT
// redeclared here — two same-named-but-different-shaped interfaces are
// unrelated types to TypeScript even with an identical name. See
// Theme2/on-screen/LiveStats.tsx for the same pattern.

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

interface LiveStatsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: any;
}

const LiveStats: React.FC<LiveStatsProps> = ({ tournament, round, match, matchData, overallData }) => {
  // Purely derived from props now — no local mirror state, no socket
  // subscription. matchData/overallData come straight from
  // PublicThemeRenderer's 'bulkUpdate' merge.
  const localMatchData = matchData || null;

  // 'liveUntilDead' sortBy: while a team is still alive, ranked by THIS
  // match's live placePoints (kills tiebreak); once eliminated, ranked by
  // cumulative event standings instead — its row locks into its true
  // tournament position rather than continuing to shift in-match.
  const sortedTeams: SortedTeam[] = useSortedTeams(localMatchData, overallData, 'liveUntilDead');
  // Shared per-player recall detection — isRondoMap-gated internally.
  const recallEvents = useRecallEvents(matchData, match);

  if (!localMatchData) {
    return (
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }



  const topTeam = sortedTeams[0];
  const remainingTeams = sortedTeams.slice(1);
  // Scale rows to fit without scrolling while keeping designed dimensions
  const listTopOffset = 250; // matches the rows container top (rows start at top-250px)
  const canvasHeight = 1080;
  const availableHeight = Math.max(0, canvasHeight - listTopOffset);
  const rowsCount = Math.max(1, remainingTeams.length);
  const baseRowHeight = 50; // original row height
  const baseHealthBar = 40; // original health bar height
  const totalNeeded = rowsCount * baseRowHeight;
  const rowHeight = rowsCount > 0 ? Math.min(baseRowHeight, Math.floor(availableHeight / rowsCount)) : baseRowHeight;
  const healthBarHeight = Math.max(8, Math.floor((baseHealthBar * rowHeight) / baseRowHeight));
  const scaleY = totalNeeded > 0 ? Math.min(1, availableHeight / totalNeeded) : 1;

  return (
    <div className="w-[1920px] h-[1080px]  flex justify-end relative   top-[0px]">
      
      {/* Debug Status Overlay */}
 
      {/* Black Box with Player Photos */}
    <div
  className="w-[400px] h-[220px] top-[0px] right-0 relative"
  style={{
    background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
  
  }}
>
  {/* Players behind */}
  {topTeam && topTeam.players.map((player: Player, index: number) => (
    <div
      key={player._id}
      className="absolute w-[200px] h-[200px]"
      style={{
        left: `${-25 + index * 85}px`,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 1, // players behind
      }}
    >
      <img
        src={
          player.picUrl ||
        "/def_char.png"
        }
        alt={player.playerName}
        className="w-full h-full"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.src = '/def_char.png';
        }}
      />
    </div>
  ))}

  {/* Gradient overlay */}
  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/70 to-black z-10 h-[100px] top-[120px]" />

  {/* Top team info box */}
  {topTeam && (
    <div className='absolute w-[100%] h-[40px] top-[180px] z-20 font-[righteous] text-[1.5rem] flex items-center'>
      {/* Rank */}
      <div className='text-white relative left-[20px] w-[30px]'>1</div>
      
      {/* Team Logo */}
      <div className='w-[40px]  relative left-[20px]'>
        <img src={topTeam.teamLogo || "/def_logo.png"} alt={topTeam.teamTag} className="w-full h-full " />
      </div>
      <div className='w-[1px] h-[90%] bg-white relative left-[22px]'></div>
      {/* Team Tag */}
      <div className=' relative left-[30px] flex-1 text-white'>{topTeam.teamTag}</div>
      
      {/* Health bars */}
      <div className="flex gap-[2px] w-[40px] items-center justify-center relative left-[-10px]">
        {topTeam.players.length === 0 ? (
          <div className="text-white text-[100px] font-bold">MISS</div>
        ) : (
          topTeam.players.map((player: Player) => {
            const isDead = isPlayerDead(player);
            const isAlive = [0, 1, 2, 3].includes(player.liveState);
            const isKnocked = player.liveState === 4;
            const useApiHealth = round?.apiEnable === true;

            let barHeight = 0;
            let barColor = "";

            if (useApiHealth) {
              // API enabled - use full health system
              if (isDead) {
                barHeight = 0;
                barColor = "";
              } else if (isKnocked) {
                const healthRatio = Math.max(0, Math.min(1, player.health / (player.healthMax || 100)));
                barHeight = healthRatio * 30;
                barColor = "bg-red-500";
              } else if (isAlive) {
                const healthRatio = Math.max(0, Math.min(1, player.health / (player.healthMax || 100)));
                barHeight = healthRatio * 30;
                barColor = "bg-white";
              }
            } else {
              // API disabled - use simple bHasDied system
              if (isDead) {
                barHeight = 0;
                barColor = "";
              } else if (isKnocked) {
                barHeight = 30;
                barColor = "bg-red-500";
              } else if (isAlive) {
                barHeight = 30;
                barColor = "bg-white";
              }
            }

            return (
              <div key={player._id} className="relative w-[8px] h-[30px] bg-gray-600">
                <div
                  className={`absolute bottom-0 w-full transition-all duration-300 ${barColor}`}
                  style={{ height: `${barHeight}px` }}
                />
              </div>
            );
          })
        )}
      </div>
      
      {/* Points */}
      <div className='text-white relative left-[-2px] w-[40px] text-center'>{(topTeam as any).totalPoints}</div>
      
      {/* Kills */}
      <div className='text-white relative left-[12px] w-[40px] text-center mr-[20px]'>{topTeam.totalKills}</div>
    </div>
  )}
</div>


      {/* Golden Bar with Column Labels */}
      <div className="absolute top-[220px] right-0 w-[400px] h-[30px] text-[1.1rem] font-[Righteous]
                      bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] 
                      flex items-center justify-between px-4 font-bold text-black text-sm">
        <span>#</span>
        <span>TEAM NAME</span>
        <span className="relative left-[50px]">ALIVE</span>
        <span className="relative left-[28px]">PTS</span>
        <span className='relative left-[4px]'>KILLS</span>
      </div>

     {/* Team Rows */}
<div className="absolute right-0 top-[250px]  w-[400px] ">
  
  <div style={{ transform: `scaleY(${scaleY})`, transformOrigin: 'top right' }}>
    
  {remainingTeams.map((team, index) => (
    
    <div key={team._id} className="w-full relative flex items-center text-black font-bold border-b-[#000000] border-b-[1px] overflow-visible " style={{ height: `${baseRowHeight}px`, opacity: team.isAllDead ? 0.7 : 1 }}>
      <TeamRecallOverlay recallEvents={recallEvents} teamId={String(team._id ?? team.teamId ?? '')} rowHeight={baseRowHeight} />
      {/* Rank box */}
      
      <div
        className="absolute w-[40px] flex items-center justify-center text-white text-[1.5rem]"
        style={{
          height: `${baseRowHeight}px`,
          background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
        }}
      >
        {index + 2}
      </div>

<div className='w-[80px] relative left-[4px] h-[100%] ml-[40px]  bg-white '>

  <img src={team.teamLogo || "/def_logo.png"} alt="" className="w-full h-full object-contain" />
</div>





      {/* Team name box */}
      <div
        className="h-full w-[260px] flex items-center relative left-[0px] text-black text-[1.5rem] pl-[10px] bg-white"
      >
        {team.teamTag}
      </div>

      {/* Alive */}
      {/* Stats (Alive, Points, Kills) */}
<div
  className="h-full flex text-white "
  style={{
    background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`
  }}
>
  {/* Health Bars */}
  <div className="flex gap-[2px] w-[50px] items-center justify-center relative left-[10px] mt-[4px]" style={{ height: `${baseHealthBar}px` }}>
    {team.players.length === 0 ? (
      <div className="text-white text-[20px] font-bold">MISS</div>
    ) : (
      team.players.map((player: Player) => {
        const isDead = isPlayerDead(player);
        const isAlive = [0, 1, 2, 3].includes(player.liveState);
        const isKnocked = player.liveState === 4;
        const useApiHealth = round?.apiEnable === true;

        let barHeight = 0;
        let barColor = "";

        if (useApiHealth) {
          // API enabled - use full health system
          if (isDead) {
            barHeight = 0;
            barColor = "";
          } else if (isKnocked) {
            const healthRatio = Math.max(0, Math.min(1, player.health / (player.healthMax || 100)));
            barHeight = healthRatio * baseHealthBar;
            barColor = "bg-red-500";
          } else if (isAlive) {
            const healthRatio = Math.max(0, Math.min(1, player.health / (player.healthMax || 100)));
            barHeight = healthRatio * baseHealthBar;
            barColor = "bg-white";
          }
        } else {
          // API disabled - use simple bHasDied system
          if (isDead) {
            barHeight = 0;
            barColor = "";
          } else if (isKnocked) {
            barHeight = baseHealthBar;
            barColor = "bg-red-500";
          } else if (isAlive) {
            barHeight = baseHealthBar;
            barColor = "bg-white";
          }
        }

        return (
          <div key={player._id} className="relative w-[10px] bg-gray-600" style={{ height: `${baseHealthBar}px` }}>
            {/* Health bar */}
            <div
              className={`absolute bottom-0 w-full transition-all duration-300 ${barColor}`}
              style={{
                height: `${barHeight}px`
              }}
            />
          </div>
        );
      })
    )}
  </div>





  {/* Points */}
  <div className="w-[60px] flex items-center justify-center text-[1.5rem] relative left-[7px]">
    {(team as any).totalPoints}
  </div>

  {/* Kills */}
  <div className="w-[60px] flex items-center justify-center text-[1.5rem] text-yellow-200">
    {team.totalKills}
  </div>
</div>

    </div>
    
    
  ))}

  {/* Legend below the last team */}
  <div className="w-full h-[30px] font-[Righteous] bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] flex justify-center items-center text-black font-bold">
    ALIVE <span className='bg-white w-[20px] h-[20px] ml-[5px] border border-black'></span>
    <div className='flex items-center ml-[20px]'>
      KNOCK <span className='bg-red-500 w-[20px] h-[20px] ml-[5px] border border-black'></span>
    </div>
    <div className='flex items-center ml-[20px]'>
      DEAD <span className='bg-[#282828] w-[20px] h-[20px] ml-[5px] border border-black'></span>
    </div>
  </div>

  </div>

</div>

    </div>
    
  );
};

export default LiveStats;
