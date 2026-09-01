import React from 'react';

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
  map?: string;
}

interface MatchData {
  _id: string;
  matchId: string;
  userId: string;
  teams: any[];
}

interface IntroProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

const Intro: React.FC<IntroProps> = ({ tournament, round, match }) => {
  // Generate a single gradient ID for all bats
  const gradientId = React.useRef(`batGradient-${Math.random().toString(36).substr(2, 9)}`);

return (
  <div
    className="flex justify-center items-center "
    style={{ width: '1920px', height: '1080px' }}
  >
    <svg
      width="1920"
      height="1080"
      viewBox="0 0 1920 1080"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      key={tournament._id}
    >
       {/* Bats with dynamic gradient */}
   <g transform={`translate(0, 10)`}>
  <path
    d="M702.5 118.5C695.7 114.9 693.667 99 693.5 91.5C697.5 97.5 712.5 99 719.5 99C721.5 103.4 731.333 106.833 736 108V102L738 99L740 103.5C743.6 101.9 746.5 103.5 747.5 104.5L750 100L751 104.5L750 109.5C759.6 109.5 765.333 105.5 767 103.5C778.6 106.7 789.167 103.5 793 101.5C791.5 118 780.5 125 780.5 124C780.5 123.2 738.167 123.667 717 124C713.8 118.4 706 118 702.5 118.5Z"
    fill={`url(#${gradientId.current})`}
  />
</g>
        <path
        d="M641 212C659 206.8 674.5 213.5 680 217.5H681.5V159.5L676.5 161.5L668.5 149V158.5C663.7 157.7 658.167 161.167 656 163L651.5 157V164.5L654.5 172C642.1 177.2 630.333 174.167 626 172C609.6 184.4 592.5 182.167 586 179.5C591.6 199.1 608 209.333 615.5 212C627.9 204.8 637.667 209 641 212Z"
        fill={`url(#${gradientId.current})`}
      />
       {/* MAIN CARD RECT WITH IMAGE COVER */}
      <image
        href="/theme4assets/introBG.png"
        x="681"
        y="134"
        width="396"
        height="218"
        preserveAspectRatio="xMidYMid slice"
      />
      
     
    
      <path
        d="M1037.5 323C1052.3 325 1056 332.5 1056 336V337H1121.5L1119 356.5H1130C1135.2 348.1 1147.83 350 1153.5 352C1170.7 341.6 1177.67 324.333 1179 317C1163 322.2 1144.67 317.833 1137.5 315C1129.5 322.2 1116.5 322 1111 321L1113.5 313L1111 306L1106 311.5C1102.8 306.7 1098 308.833 1096 310.5L1094 302L1089.5 307.5V315C1078.3 314.2 1068.83 303.333 1065.5 298C1045.5 296.8 1033.5 286.833 1030 282C1025.2 304 1033 318.5 1037.5 323Z"
        fill={`url(#${gradientId.current})`}
      />
      {/* Base */}
      <path
        d="M655 336.5L644 429.5L1110.5 430L1121.5 336.5H655Z"
        fill="white"
      />

     

    <text
        x="880"
        y="412"
        textAnchor="middle"
fill="url(#mapname)"
        fontSize="75"
        fontFamily="AGENCYB"
      >
     MATCH STARTED
      </text>

      <text
        x="967"
        y="187"
        textAnchor="middle"
        fill="url(#mapname)"
        fontSize="48"
        fontFamily="AGENCYB"
      >
        {match?.map?.toUpperCase()}
        
      </text>
        <text
        x="800"
        y="187"
        textAnchor="middle"
fill="url(#paint5_linear_2051_4)"
        fontSize="48"
        fontFamily="AGENCYB"
      >
     MATCH {match?.matchNo} |   
      </text>

      {/* LOGO */}
      {tournament.torLogo && (
        <image
          href={tournament.torLogo}
          x="815"
          y="210"
          width="118"
          height="118"
          preserveAspectRatio="xMidYMid meet"
        />
      )}

      <defs>
        {/* Single gradient for all bats */}
        <linearGradient
          id={gradientId.current}
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop stopColor={tournament.primaryColor || '#FFB600'} />
          <stop offset="1" stopColor={'#000'} />
        </linearGradient>
       <linearGradient
  id="paint5_linear_2051_4"
  x1="90%"
  y1="100%"   // top-left
  x2="90%"
  y2="90%" // bottom-right
  gradientUnits="userSpaceOnUse"
>
  <stop stopColor="#000" />  {/* black at top-left */}
  <stop offset="1" stopColor={tournament.primaryColor || '#F6B60B'} />  {/* bright color at bottom-right */}
</linearGradient>

<linearGradient
  id="mapname"
  x1="`60%"
  y1="0%"   // top-left
  x2="100%"
  y2="1000%" // bottom-right
  gradientUnits="userSpaceOnUse"
>
  <stop stopColor={tournament.secondaryColor || '#F6B60B'} />  {/* black at top-left */}
  <stop offset="1" stopColor="#000" />  {/* bright color at bottom-right */}
</linearGradient>

      </defs>
    </svg>
  </div>
);
}

export default Intro;