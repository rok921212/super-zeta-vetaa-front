import React, { useMemo } from 'react';
// NOTE: api import and the REST fetch-on-mount effect removed.
// PublicThemeRenderer always supplies overallData (and matchData) as props
// for this view now.

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

interface Player {
  _id: string;
  playerName: string;
  killNum?: number;
  picUrl?: string;
}

interface Team {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  slot: number;
  placePoints: number;
  wwcd?: number;
  players: Player[];
}

interface OverallData {
  tournamentId: string;
  roundId: string;
  userId: string;
  teams: Team[];
  createdAt: string;
}

interface ChampionsProps {
  tournament: Tournament;
  round?: Round | null;
  matchData?: any;
  overallData?: OverallData | null;
}

const Champions: React.FC<ChampionsProps> = ({ tournament, round, overallData }) => {
  const champion = useMemo(() => {
    if (!overallData) return null;

    const enriched = overallData.teams.map(team => {
      const totalKills = team.players.reduce((sum, p) => sum + Number(p.killNum || 0), 0);
      const total = Number(team.placePoints || 0) + totalKills;
      return { ...team, total, totalKills } as Team & { total: number; totalKills: number };
    });

    enriched.sort((a, b) => b.total - a.total);

    if (enriched.length === 0) return null;

    const first = enriched[0];
    const second = enriched[1];
    const leadOverNext = second ? first.total - (second.total as number) : first.total;

    return { ...first, leadOverNext } as (Team & { total: number; totalKills: number; leadOverNext: number });
  }, [overallData]);

  if (!overallData || !champion) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[Righteous]">No overall data available</div>
      </div>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px] relative  text-white ">
      {/* Header */}
      <div className="absolute top-[80px] left-[80px] flex">
      
        <div 
         style={{
            
            backgroundImage: `linear-gradient(to left, transparent, ${tournament.primaryColor})`,
            clipPath: "polygon(30px 0%, 100% 0%, 100% 100%, 30px 100%, 0% 50%)",
          }}
        className="text-[2rem] font-[Righteous] pl-[40px] flex items-center h-[70px] mt-[10px] ml-[50px]">
        <span className='text-yellow-300 pr-[10px]'> CHAMPIONS</span> OF {tournament.tournamentName} -  {round?.roundName}
        </div>
      </div>

      <div 
      
      className='absolute top-[750px] left-[70px] flex justify-center w-full h-full z-10'>
<div
 style={{

    background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
    
    
    }}
className='bg-white w-[700px] h-[120px] skew-x-[20deg]'>
<div className='bg-white w-[25%] h-full'>
</div>

</div>
<div className='font-bebas font-[300] text-[3rem] absolute top-[-10px] left-[640px] w-[100%] h-[100%]' >
    
    <img src={champion.teamLogo} alt="" className='w-[130px] h-[130px] object-contain'/>
    
    </div>
<div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[840px] text-white ' > 
   {champion.teamName}
    </div>
</div>
 {/* Players Grid */}
 <div className="">
          
 <div

 className="grid grid-cols-4 w-full h-full" style={{ maxWidth: 'calc(4 * 25%)' }}>
 <div  style={{

background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,


}} className="w-full h-[20%] absolute top-[900px] z-10" >


<div className='absolute top-[30px] left-[70px]'>
<div className='bg-white w-[400px] h-[100px] skew-x-[20deg]'>
<div className='bg-black w-[40%] h-full'>
</div>

</div>
<div className='font-bebas font-[300] text-[3rem] absolute top-[20px] left-[30px]' >WWCD</div>
<div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[200px] text-black ' > 
    <div className='flex items-center'>
    
    <img src="/chicken.png" alt="" className='w-[70px] h-[70px] mr-[10px] mb-[10px]'/> x {champion.wwcd || 0}</div>
    </div>
</div>
<div className='absolute top-[30px] left-[530px]'>
<div className='bg-white w-[400px] h-[100px] skew-x-[20deg]'>
<div className='bg-black w-[40%] h-full'>
</div>

</div>
<div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[20px]' >PLACE</div>
<div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[200px] text-black ' >{champion.placePoints || 0} PTS </div>
</div>
<div className='absolute top-[30px] left-[1000px]'>
<div className='bg-white w-[400px] h-[100px] skew-x-[20deg]'>
<div className='bg-black w-[40%] h-full'>
</div>

</div>



<div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[30px]' >KILLS</div>
<div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[200px] text-black ' >{champion.totalKills || 0} PTS </div>
</div>
<div className='absolute top-[30px] left-[1450px]  '>
<div className='bg-white w-[400px] h-[100px] skew-x-[20deg] '>
<div className='bg-black w-[40%] h-full'>
</div>

</div>
<div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[30px]' >TOTAL</div>
<div className='font-bebas font-[300] text-[4rem] absolute top-[10px] left-[200px] text-black ' >{champion.total || 0} PTS </div>

</div>
</div>
  {champion.players.slice(0, 4).map((p) => (
    <div key={p._id} className="flex flex-col items-center m-[-150px] relative top-[420px]">
    <div 
  
    className='w-full absolute h-full top-[0px] '></div>
      <img
        src={
          p.picUrl ||
           '/def_char.avif'
        }
        alt={p.playerName}
        className="w-full h-full object-cover m-0 p-0"
      />
    </div>
  ))}
</div>

            </div>
     
    </div>
  );
};

export default Champions;
