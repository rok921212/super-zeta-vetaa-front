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
        position: "relative",
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 1080"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g clipPath="url(#clip0)">

          {/* Transparent background */}
          <rect width="1920" height="1080" fill="none" />

          {/* MAIN LOWER SHAPES (scaled from your SVG) */}
          <path
            d="M578.5 891.75H555.8L531.4 974.4L578.5 891.75Z"
            fill="url(#darkGradient)"
          />

          <path
            d="M254.4 938.75L231.8 1015.5L213.8 1080H513L550.7 962.8L509.2 1015.5L531.4 936.7L254.4 938.75Z"
            fill="url(#darkGradient)"
          />

          <path
            d="M50.3 1013.7L24.6 1062.9L13.5 1082.2H32.7L50.3 1013.7Z"
            fill="url(#darkGradient)"
          />

          {/* GOLD STRIP */}
         <path
  d="M550 891.75H81.7L68.6 930H538.9L550 891.75Z"
  fill="url(#goldBarGradient)"
/>
<image
  href="/lines.png"
  x="0"
  y="890"
  width="750"
  height="250"
  preserveAspectRatio="xMidYMid slice"
  clipPath="url(#blackBoxClip)"
  opacity="0.06"
/>


          {/* ACCENT COLOR SHAPE */}
          <path
            d="M254.5 938.75H62.9L39.3 1011.2L79.6 967.7L42.7 1080H235.7L275 964.3L231.8 1015.9L254.5 938.75Z"
            fill="url(#accentGradient)"
          />

          {/* TOURNAMENT LOGO */}
          {tournament.torLogo && (
            <image
              href={tournament.torLogo}
              x="70"
              y="930"
              width="170"
              height="170"
              preserveAspectRatio="xMidYMid meet"
            />
          )}

          {/* TOURNAMENT NAME */}
          <text
  x="315"
  y="914"
  fontFamily="PaybAck"
  fontSize="28"
  fill="#000"
  
  textAnchor="middle"
  dominantBaseline="middle"
>
  {tournament.tournamentName.toUpperCase()}
</text>


          {/* ROUND NAME */}
          <text
            x="390"
            y="990"
            fontFamily="Awaking"
            fontSize="40"
            fill="#FFD000"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {(round?.roundName || "").toUpperCase()}
          </text>
{/* White line just below round name */}
<rect
  x="280"       // adjust width and x-position as needed
  y="1010"      // slightly below the text
  width="220"
  height="1"
  fill="white"
/>

{/* Match Map Name */}
<text
  x="390"
  y="1045"      // slightly below the white line
  fontFamily="Supermolot"
  fontSize="30"
  fontWeight="900"
  fill="white"
  textAnchor="middle"
  dominantBaseline="middle"
>
  M{match?.matchNo || ""} - {match?.map?.toUpperCase() || ""}
</text>

        </g>

        <defs>
          <clipPath id="blackBoxClip">
  <path d="M578.5 891.75H555.8L531.4 974.4L578.5 891.75Z" />
  <path d="M254.4 938.75L231.8 1015.5L213.8 1080H513L550.7 962.8L509.2 1015.5L531.4 936.7L254.4 938.75Z" />
  <path d="M50.3 1013.7L24.6 1062.9L13.5 1082.2H32.7L50.3 1013.7Z" />
</clipPath>

          <linearGradient id="goldBarGradient" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0%" stopColor="#FFD700" />
  <stop offset="50%" stopColor="#FFA500" />
  <stop offset="100%" stopColor="#FFD700" />
</linearGradient>
        <linearGradient
  id="darkGradient"
  x1="0"
  y1="0"
  x2="1"
  y2="0"
  gradientUnits="objectBoundingBox"
  gradientTransform="rotate(45)"
>
  <stop offset="0" stopColor="#2B2B2B" />
  <stop offset="1" stopColor="#000000" />
</linearGradient>

       <linearGradient
  id="accentGradient"
  x1="0"
  y1="0"
  x2="1"
  y2="0"
  gradientUnits="objectBoundingBox"
  gradientTransform="rotate(45)"
>
  <stop stopColor={tournament.primaryColor || "#FF0000"} />
  <stop offset="1" stopColor={tournament.secondaryColor || "#990000"} />
</linearGradient>

          <clipPath id="clip0">
            <rect width="1920" height="1080" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

export default Lower;
