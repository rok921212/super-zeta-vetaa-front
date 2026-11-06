// src/pages/lower/Lower.tsx
// NOTE: the own useParams-driven fetch (selected-match, the msgpack
// lowerData/:t/:r/:m endpoint, rounds/:id/matches) and its dashboard/
// cache.tsx localStorage cache have been removed. PublicThemeRenderer
// already does the one shared fetch — and now has its own global cache,
// see publicCache.ts — and passes `tournament`/`round`/`match`/
// `totalMatches` down as props for the 'Lower' view.
import React from "react";

interface Tournament {
  _id: string;
  tournamentName: string;
  torLogo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  overlayBg?: string;
}
interface Round { _id: string; roundName: string; day?: string; }
interface Match { _id: string; matchName?: string; matchNo?: number; _matchNo?: number; map?: string; }

interface LowerProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;                        
  totalMatches?: number;
}

export default function Lower({ tournament, round, match, totalMatches = 0 }: LowerProps) {                                                   
  const matchNumber = match?.matchNo ?? match?._matchNo ?? "N/A";

  return (
    <div style={{ position: "relative", width: "1920px", height: "1080px" }} className=" font-[AGENCYB]">

<div 
 
  className="w-[750px] h-[250px] absolute bottom-0 left-[-70px] bg-white skew-x-[30deg]">
    <div className="w-[100%] bg-yellow-300 h-[25%] absolute flex">
      <div 
      
      style={{        background: `linear-gradient(135deg, ${tournament.primaryColor}, ${tournament.secondaryColor})`,}}
      className="w-[55%] h-[100%] z-10  flex items-center justify-center">
<div className="text-white font-[AGENCYB] text-[40px] -skew-x-[30deg] relative left-[20px]">MATCH {matchNumber} / {totalMatches}</div>
        
      </div>
       <div 
      
      style={{        background: `linear-gradient(135deg, ${tournament.secondaryColor}, ${tournament.primaryColor})`,}}
      className="w-[45%] h-[100%] z-0">
        <div className="text-white font-[AGENCYB] text-[40px] -skew-x-[30deg] relative left-[30px]">{round?.roundName?.toUpperCase()}</div>
      </div>
    </div>
<div className="bg-[#171717] w-[55%] h-[100%]">

  <div className=" -skew-x-[30deg] w-[340px] h-[160px] absolute top-[70px] left-[60px] ">
    <img src={tournament.torLogo} alt=""  className=" w-[50%] h-[100%]"/>
    
  </div>
 
</div>
 <div className=" w-[45%] h-[70%] absolute bottom-0 left-[412px]">
<div className="text-black -skew-x-[30deg]  text-[70px] relative top-[30px] left-[50px]">
  {match?.map?.toUpperCase()}
  </div>
 </div>
  </div>
      {/*} 
      {tournament.tournamentName && (
        <div className="text-black text-[26px] font-[AGENCYB] absolute top-[921px] left-[230px]">
        
        </div>
      )}

      <div className="w-[180px] h-[90px] relative top-[-130px] left-[200px] text-black font-[AGENCYB] text-[60px] font-bold">
        {round?.roundName?.toUpperCase()}
      </div>

      <div className="h-[90px] relative top-[-170px] left-[210px] text-black font-[AGENCYB] text-[60px] font-bold">
        
      </div>

      {tournament.torLogo && (
        <img
          src={tournament.torLogo}
          alt="Tournament Logo"
          style={{
            position: "absolute",
            top: "921px",
            left: "-70px",
            width: "300px",
            height: "150px",
            objectFit: "contain",
          }}
        />
      )}*/}
    </div>
  );
}