import React from 'react';
import { useSortedTeams, isPlayerDead, Player, MatchData, SortedTeam } from '../../shared/hooks/unsortteams';
import { useRecallEvents } from '../../shared/hooks/recallEvents';
import TeamRecallOverlay from '../../shared/components/TeamRecallOverlay';
// NOTE: SocketManager import removed, along with the six manual event
// handlers and the localMatchData mirror state they all wrote into.
// PublicThemeRenderer owns the single socket connection, listens to
// 'bulkUpdate', and passes freshly-merged matchData / overallData down as
// props on every change — this component now just reacts to those props,
// same as the Theme2 LiveStats conversion. useSortedTeams (shared hook)
// replaces the local sortedTeams useMemo + overallMap state/effect: 'live'
// sortBy reproduces this file's original placePoints+kills-vs-overall
// ranking (matchNo === 1 skipped overall contribution, which the hook
// achieves via its own prior-baseline math keyed off deadTeamList/overall).

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
  // Matches the old behavior: matchNo 1 (first match of the round) never
  // folded in overall standings, only live in-match points/kills.
  // 'liveUntilDead': ranked by THIS match's live placePoints (kills
  // tiebreak) while a team is still alive; once eliminated, ranked by
  // cumulative event standings instead, so its row locks into its true
  // tournament position rather than continuing to shift in-match.
  // overallData is passed unconditionally now — the shared hook's
  // prior-baseline math already handles match 1 (nothing to fold in yet).
  const sortedTeams: SortedTeam[] = useSortedTeams(matchData, overallData, 'liveUntilDead');
  // Shared per-player recall detection — isRondoMap-gated internally.
  const recallEvents = useRecallEvents(matchData, match);

  const ROW_HEIGHT = 100;
  const START_Y = 50;
  const TOTAL_HEIGHT = 2160;
  const AVAILABLE_HEIGHT = TOTAL_HEIGHT - START_Y;
  const contentHeight = sortedTeams.length * ROW_HEIGHT;
  const scale = contentHeight > AVAILABLE_HEIGHT ? AVAILABLE_HEIGHT / contentHeight : 1;

  const baseHealthBar = 36; // original health bar height

  if (!matchData) {
    return (
      <svg width="1920" height="1200" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }

  return (
    <div style={{ position: 'relative', width: '1920px', height: '1080px', backgroundColor: '' }}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1607" y="247" width="48" height="41" fill="white"/>
        <rect x="1607" y="247" width="48" height="41" fill="white"/>
       <rect x="1655" y="247" width="263" height="41" fill="white" />

<path
  d="M1686 247H1655V288H1733.5V287L1729 282C1717 282.8 1708.33 274.667 1705.5 270.5C1709.1 268.9 1712.33 262.833 1713.5 260L1706.5 262C1706.9 258 1702 255 1699.5 254L1703 247H1698.5L1690.5 253.5C1688.1 252.7 1686.5 248.833 1686 247Z"
  fill="url(#paint0_linear_2051_4)"
/>

<path
  d="M1802 252.5C1799.6 250.5 1794.33 248.333 1792 247.5V247H1918V288H1904C1888 273.6 1869 272 1861.5 273L1884.5 260.5L1847.5 270C1830 254.5 1815 249.5 1811.5 249.5C1808.7 249.5 1804 251.5 1802 252.5Z"
  fill="url(#paint1_linear_2051_4)"
/>

{/* TEXT LAYER */}
<text
  x="1670"
  y="273"
  fill="#000"
  fontSize="15"
  fontWeight="bold"
  fontFamily="AGENCYB"
>
  TEAM
</text>

<text
  x="1805"
  y="273"
  fill="#000"
  fontSize="16"
  fontWeight="bold"
  fontFamily="AGENCYB"
>
  ALIVE
</text>

<text
  x="1853"
  y="273"
  fill="#000"
  fontSize="16"
  fontWeight="bold"
  fontFamily="AGENCYB"
>
  ELIMS
</text>

<text
  x="1889"
  y="273"
  fill="#000"
  fontSize="16"
  fontWeight="bold"
  fontFamily="AGENCYB"
>
  PTS
</text>

              <g clipPath="url(#clip0_2051_4)">
          <path d="M1628.26 262.424L1627.79 266.503C1626.83 266.363 1624.29 266.136 1620.71 266.887C1618.8 267.263 1617.15 268.165 1616.21 268.761L1616.41 265.831C1620.06 261.802 1626.64 262.245 1628.26 262.424ZM1616.14 269.736C1616.82 269.26 1618.69 268.074 1620.87 267.646C1625.21 266.735 1628.02 267.325 1628.05 267.332L1628.46 267.422L1629.11 261.765L1628.75 261.706C1628.44 261.657 1622.15 260.69 1617.62 263.766C1618.26 263.069 1619.15 262.278 1620.34 261.62C1620.6 261.476 1620.9 261.352 1621.22 261.246C1621.38 261.195 1621.54 261.148 1621.71 261.105C1624.81 260.31 1629.75 260.821 1630.33 260.886L1635.58 263.208C1635.53 264.095 1635.36 266.974 1635.33 269.078C1635.32 269.852 1635.15 270.387 1634.84 270.625C1634.7 270.731 1634.54 270.765 1634.42 270.771C1627.42 266.445 1620.44 267.704 1616.57 270.122C1616.39 270.233 1616.23 270.353 1616.09 270.478L1616.14 269.736ZM1615.98 272.057C1616.08 271.556 1616.4 271.136 1616.97 270.78C1617.73 270.308 1624.09 266.619 1631.99 270.332C1629.88 270.008 1626.41 269.678 1622.44 270.088C1619.84 270.357 1618.02 271.162 1617.05 272.481C1616.69 272.973 1616.5 273.464 1616.4 273.888C1616.17 273.489 1615.97 273.001 1615.94 272.505L1615.98 272.057ZM1624.53 279.706C1624.52 279.718 1624.29 280.946 1624.03 281.894C1623.89 282.397 1623.53 282.444 1622.04 282.423C1621.81 282.42 1621.58 282.417 1621.32 282.417C1619.67 282.417 1618.55 281.114 1617.55 279.78C1617.32 279.476 1617.26 279.183 1617.37 278.883C1617.53 278.43 1618.34 277.275 1622.38 276.321C1623.16 276.136 1624.11 276.023 1625.15 275.961L1624.53 279.706ZM1636.85 275.755C1636 275.648 1626.66 274.515 1622.21 275.567C1619.8 276.135 1618.12 276.873 1617.24 277.734L1617.11 275.028L1617.11 274.973C1617.1 274.963 1616.92 273.961 1617.67 272.942C1618.51 271.805 1620.14 271.104 1622.52 270.858C1628.89 270.202 1633.92 271.485 1633.96 271.495C1633.97 271.498 1634.06 271.521 1634.19 271.535C1634.19 271.537 1634.19 271.539 1634.2 271.541L1634.2 271.537C1634.46 271.563 1634.89 271.547 1635.29 271.253C1635.81 270.863 1636.09 270.135 1636.1 269.088C1636.14 266.605 1636.37 263.023 1636.37 262.988L1636.39 262.717L1630.58 260.153L1630.47 260.123C1630.23 260.094 1625.6 259.556 1622.2 260.207C1622.37 259.916 1622.53 259.642 1622.66 259.436C1623.71 258.979 1629.83 256.609 1637.48 259.822C1641.75 261.616 1642.96 262.223 1643.3 262.417L1643.27 265.518C1643.27 265.529 1643.26 265.562 1643.24 265.572C1643.21 265.59 1643.11 265.606 1642.92 265.55C1642.13 265.319 1639.51 264.485 1639.48 264.476L1639.02 264.328L1638.56 270.798C1638.47 270.957 1638.44 271.23 1638.4 271.729C1638.3 272.881 1638.07 275.564 1636.85 275.755ZM1643.88 273.644C1641.68 272.584 1639.81 271.25 1639.33 270.843L1639.4 269.886C1640.46 270.877 1642.57 272.609 1644.38 272.609C1644.38 272.609 1644.39 272.609 1644.4 272.609C1646.27 272.591 1648.51 271.859 1649.45 271.519L1649.56 272.227C1648.76 272.741 1645.74 274.537 1643.88 273.644ZM1649.32 270.739C1648.52 271.032 1646.23 271.817 1644.39 271.835C1644.39 271.835 1644.38 271.835 1644.37 271.835C1642.54 271.835 1640.14 269.555 1639.47 268.877L1639.72 265.363C1640.51 265.615 1642.11 266.118 1642.71 266.294C1643.11 266.411 1643.44 266.381 1643.69 266.204C1643.93 266.032 1644.03 265.757 1644.04 265.556L1644.07 262.443L1644.07 262.193C1644.05 261.91 1644.04 261.739 1637.77 259.108C1631.17 256.332 1625.76 257.519 1623.41 258.315C1624.91 256.329 1629.67 251.271 1638 253.161C1640.05 253.627 1645.02 255.261 1646.78 260.354C1647.86 263.472 1648.28 264.848 1648.44 265.436L1646.38 265.511L1648.3 269.864L1649.18 269.821L1649.32 270.739ZM1649.06 269.052L1648.79 269.065L1647.55 266.243L1648.6 266.205L1649.38 266.177L1649.77 266.162L1650.76 268.968L1649.83 269.014L1649.06 269.052Z" fill="black"/>
        </g>
        <defs>
          <linearGradient id="paint0_linear_2051_4" x1="0%" y1="0%" x2="100%" y2="0%" gradientUnits="objectBoundingBox">
            <stop stopColor={tournament?.primaryColor || "#F7BC1F"}/>
            <stop offset="1" stopColor={"#000000"}/>
          </linearGradient>
          <linearGradient id="paint1_linear_2051_4" x1="0%" y1="0%" x2="100%" y2="0%" gradientUnits="objectBoundingBox">
            <stop stopColor={tournament?.primaryColor || "#EDB31A"}/>
            <stop offset="1" stopColor={"##0000"}/>
          </linearGradient>
          <clipPath id="clip0_2051_4">
            <rect width="37" height="41" fill="white" transform="translate(1615 249)"/>
          </clipPath>
        </defs>
      </svg>
      {sortedTeams.map((team, index) => (
        <div key={team._id} style={{
          position: 'absolute',
          top: `${288 + index * 40}px`,
          left: '1607px',
          width: '311px',
          height: '40px',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          fontSize: '27px',
          fontFamily: 'AGENCYB'
        }}>
          <TeamRecallOverlay recallEvents={recallEvents} teamId={String(team._id ?? (team as any).teamId ?? '')} rowHeight={40} />

          <span
           style={{
                  
        filter: (team as any).isAllDead
  ? 'grayscale(100%) brightness(0.7)'
  : 'none',
        }}
          className='absolute w-[20px] left-[14px] text-center text-[26px]'>{index + 1}</span>
         
           <span 

           style={{
                  

background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, #000)`
        }}
           className=' w-[131px] h-[100%] absolute left-[48px] pl-[37px] text-[26px] z-10'>
             <div  className='w-[30px] h-[30px] absolute left-[4px] top-[5px] '>
         <img 
         
         style={{
                  filter: (team as any).isAllDead
  ? 'grayscale(100%) brightness(0.7)'
  : 'none',
         }}
         src={team.teamLogo} alt="" className='w-[100%] h-[100%]' />
         </div>
            <span
            
            style={{
              filter: (team as any).isAllDead
  ? 'grayscale(100%) brightness(0.7)'
  : 'none',
            }}>
            {team.teamTag}
            </span>
            </span>
       <div className="w-[580px] h-full relative left-[116px] flex items-center justify-center text-center">
        <div className="flex gap-[3px] w-[50px] items-center justify-center relative left-[-10px] mt-[4px]" style={{ height: `${baseHealthBar}px` }}>
  {team.players.length === 0 ? (
  <div className="text-white text-[20px] font-bold">MISS</div>
) : (
  team.players.map((player: Player) => {
    const isDead = isPlayerDead(player);
    const isAlive = [0, 1, 2, 3].includes(player.liveState);
    const isKnocked = player.liveState === 4;
    const useApiHealth = round?.apiEnable === true;

    const primaryColor = tournament.primaryColor || '#fc030f';
    const secondaryColor = tournament.secondaryColor || '#fff600';

    let barHeight = 0;
    let barColor = '';

    if (useApiHealth) {
      if (isDead) {
        barHeight = 0;
        barColor = '';
      } 
      else if (isKnocked) {
        const healthRatio = Math.max(
          0,
          Math.min(1, player.health / (player.healthMax || 100))
        );
        barHeight = healthRatio * baseHealthBar;
        barColor = primaryColor; // 🔥 Knocked → PRIMARY
      } 
      else if (isAlive) {
        const healthRatio = Math.max(
          0,
          Math.min(1, player.health / (player.healthMax || 100))
        );
        barHeight = healthRatio * baseHealthBar;
        barColor = secondaryColor; // ❤️ Alive → SECONDARY
      }
    } 
    else {
      if (isDead) {
        barHeight = 0;
        barColor = '';
      } 
      else if (isKnocked) {
        barHeight = baseHealthBar;
        barColor = primaryColor; // 🔥 Knocked → PRIMARY
      } 
      else if (isAlive) {
        barHeight = baseHealthBar;
        barColor = secondaryColor; // ❤️ Alive → SECONDARY
      }
    }

    return (
      <div
        key={player._id}
        className="relative w-[10px] bg-gray-600"
        style={{ height: `${baseHealthBar}px` }}
      >
        {/* Health bar */}
        <div
          className="absolute bottom-0 w-full transition-all duration-300"
          style={{
            height: `${barHeight}px`,
            backgroundColor: barColor
          }}
        />
      </div>
    );
  })
)}

  </div>
<div className='w-[90px] flex'>
  <div 
  style={{
            filter: (team as any).isAllDead
  ? 'grayscale(100%) brightness(0.7)'
  : 'none',
  }}
  className="w-[0px] text-center text-[21px]">
    {team.totalKills}
  </div>

  <div 
  style={{        filter: (team as any).isAllDead
  ? 'grayscale(100%) brightness(0.7)'
  : 'none',}}
  className="w-[80px] text-center ml-[px] text-[21px]">
    {team.totalPoints}
  </div>
  </div>
</div>

</div>
))}
{/* White box after last team */}
<div 
className='pl-[20px]'
style={{
position: 'absolute',
top: `${288 + sortedTeams.length * 40}px`,
left: '1607px',
width: '311px',
height: '20px',
backgroundColor: 'white',

display: 'flex',
alignItems: 'center',
justifyContent: 'start',
fontSize: '18px',
fontWeight: 'bold',
color: 'black'
}}>
  <div className='flex items-center'>
<div 

style={{backgroundColor : tournament.secondaryColor}}
className='w-[15px] h-[15px] bg-[#fc030f]'></div>
<div className='ml-[3px] font-[AGENCYB]'> ALIVE</div>
</div>
<div

className='flex items-center ml-[20px]'>
<div 
style={{backgroundColor : tournament.primaryColor}}

className='w-[15px] h-[15px] bg-[#fff600]'></div>
<div className='ml-[3px] font-[AGENCYB]'> KNOCKED</div>
</div>
<div className='flex items-center ml-[20px]'>
<div className='w-[15px] h-[15px] bg-gray-600'></div>
<div className='ml-[3px] font-[AGENCYB]'> ELIMINATED</div>
</div>
</div>
</div>
  );
};

export default LiveStats;


