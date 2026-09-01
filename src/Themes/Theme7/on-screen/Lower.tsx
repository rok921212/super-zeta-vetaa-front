import React from "react";

interface Tournament {
  _id: string;
  tournamentName: string;
  torLogo?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

interface Round {
  _id: string;
  roundName: string;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
  map?: string;
}

interface LowerProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
}

function Lower({ tournament, round, match }: LowerProps) {
  return (
    <div
      style={{
        width: "1920px",
        height: "1080px",
       
        position: "absolute",
      }}
    >

      <div 
      
      style={{      background: `linear-gradient(
            335deg,
            ${tournament.primaryColor} 0%,
            #000000 100%
          )`,   clipPath: "polygon(0 0, 86% 0, 100% 100%, 100% 100%, 0 100%)",
}}
      className="w-[430px] h-[40px] bg-white absolute top-[860px] text-white font-[RELIDUX] pt-[3px] text-left text-[25px]">{tournament.tournamentName}</div>
      <div  className="w-[600px] h-[180px] flex justify-between "  style={{
        clipPath: "polygon(0 0, 96% 0, 100% 15%, 100% 100%, 0 100%)",
          position: "absolute",
          bottom: "0",
          left: "0",
          background: "white",
        }}>       
       <div style={{ background: `linear-gradient(
            135deg,
            ${tournament.primaryColor} 0%,
            #000000 100%
          )`,
        }} className="w-[30%] h-[100%]"></div>
      <div
  className="relative w-[45%] overflow-hidden flex justify-center"
  style={{
    background: "linear-gradient(50deg, #ffffff 0%, #9ca3af 100%)",
  }}
>
  {/* Blended lines */}
  <img
    src="/lines.png"
    alt=""
    className="absolute inset-0 h-full w-full object-cover opacity-80 mix-blend-overlay scale-[3]"
  />

  {/* Content */}
  <span 
  style={{color: tournament.primaryColor}}
  className="absolute z-10 font-[impact] text-[50px] text-[#000000] top-[10px] text-center">
   MATCH {match?.matchNo}
  </span>
  <div className="w-[100%] h-[2px] bg-black absolute top-[90px]"></div>
  <span className="absolute z-10 font-[relidux] text-[30px] text-[#000000] top-[105px] w-[260px] text-center">{round?.roundName}</span>
</div>
          <div style={{ background: `linear-gradient(
            135deg,
            ${tournament.primaryColor} 0%,
            #000000 100%
          )`,
         
        }} className="w-[30%] h-[100%]"><img src={tournament.torLogo} alt={tournament.tournamentName} className="w-[100%] h-[100%]" /></div>
      </div>

    </div>
  );
}

export default Lower;
