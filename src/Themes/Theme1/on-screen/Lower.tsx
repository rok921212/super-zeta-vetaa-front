import React from "react";

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

interface LowerProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
}

function lower({ tournament, round, match }: LowerProps) {

  return (
    <div style={{
      width: '1920px',
      height: '1080px',
      position: 'relative',
     
    }}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 1080"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
      >
        <g clipPath="url(#clip0_1_4)">

       
          <rect y="947" width="135" height="134"     fill="url(#whiteGradient)"  /> <image
  href={tournament.torLogo}
  x="8"
  y="950"
  
  width="120"
  height="120"
  preserveAspectRatio="xMidYMid meet"
/>
          <path
            d="M158 947V1081H427V973.097L400.756 947H158Z"
            fill="url(#paint1_linear_1_4)"
          />
        
        <rect x="135" y="947" width="25" height="134" fill="url(#paint2_linear_1_4)" />

<text
  x={135 + 12.5}   // center x of rect (x + width/2)
  y={947 + 134 / 2} // center y of rect
  fontFamily="Righteous"
 fontWeight="700"   // <-- use this for bold
letterSpacing={1} // <-- adjust letter spacing as needed
  fontSize={Math.min(20, 134 / tournament.tournamentName.length)} // auto size
  fill="black"
  textAnchor="middle"
  dominantBaseline="middle"
  transform={`rotate(-90 ${135 + 12.5} ${947 + 134 / 2})`} // rotate around center
>
  {tournament.tournamentName}
</text>

          <rect x="127" y="953" width="333" height="187" fill="url(#pattern0_1_4)" />

          {/* Tournament Information - Expanded JSON Data */}
          <text
            x="190"
            y="1000"
            fontFamily="Anton"
            fontSize="34"
            fontWeight="normal"
            fill="#FFD700"
            textAnchor="start"
          >
       DAY {round?.day} - MATCH {match?.matchNo ?? match?._matchNo ?? 'N/A'}
          </text>

      <rect  x="178" y="1008" width="236" height="1" fill="white"/>
<image
  x={100}   // position from left
  y={940}   // position from top
  width={400}
  height={200}
  preserveAspectRatio="xMidYMid meet"
  href="/grunge.png"
/>

        

 <text
  x={300}
  y={1040}
  fontWeight={"300"}
  fontFamily="Anton"
  fontSize={Math.min(40, 300 / (round?.roundName?.length || 1))} // auto-size
  fill="black"
  textAnchor="middle"
  dominantBaseline="middle"
>
  {(round?.roundName || "").toUpperCase()}
</text>

          

         

          <path d="M427 971L403 947H427V971Z" fill="url(#paint3_linear_1_4)" />
        </g>
        <defs>
          <pattern
            id="pattern0_1_4"
            patternContentUnits="objectBoundingBox"
            width="1"
            height="1"
          >
            <use
              xlinkHref="#image0_1_4"
              transform="matrix(0.000244141 0 0 0.000434753 0 -0.00105294)"
            />
          </pattern>
     <linearGradient id="whiteGradient" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stopColor="white" stopOpacity="1" />
  <stop offset="100%" stopColor="#808080" stopOpacity="1" />
</linearGradient>
          <linearGradient
            id="paint0_linear_1_4"
            x1="20"
            y1="935"
            x2="125"
            y2="1106.5"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="white" />
            <stop offset="1" stopColor="#B8B8B8" />
          </linearGradient>
          <linearGradient
            id="paint1_linear_1_4"
            x1="283.668"
            y1="986.648"
            x2="337.251"
            y2="1067.73"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={tournament.primaryColor} />
            <stop offset="1" stopColor={tournament.secondaryColor}/>
          </linearGradient>
          <linearGradient
            id="paint2_linear_1_4"
            x1="147.5"
            y1="947"
            x2="147.5"
            y2="1081"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FFD700" />
            <stop offset="0.211538" stopColor="#FFA500" />
            <stop offset="0.418269" stopColor="#FFC300" />
            <stop offset="0.721154" stopColor="#FFA500" />
            <stop offset="1" stopColor="#FFD700" />
          </linearGradient>
          <linearGradient
            id="paint3_linear_1_4"
            x1="415"
            y1="947"
            x2="415"
            y2="971"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={tournament.primaryColor} />
            <stop offset="1" stopColor={tournament.secondaryColor} />
          </linearGradient>
          <clipPath id="clip0_1_4">
            <rect width="1920" height="1080" fill="white" />
          </clipPath>
         
        </defs>
      </svg>
    </div>
  );
}

export default lower;
