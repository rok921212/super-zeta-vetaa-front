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
  totalMatches: number;
}

function Lower({ tournament, round, match, totalMatches }: LowerProps) {
  return (
    <div style={{ position: 'relative', width: '1920px', height: '1080px' }}>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g clipPath="url(#clip0_2051_4)">
          <rect x="188" y="921" width="314" height="159" fill="black"/>
          <path d="M353.5 861.5C353.5 861.5 362.5 912.053 373.5 915C384.5 917.947 374.5 920.5 374.5 920.5L389.5 926L452 938.5H496L501 937C504.6 934.2 509.5 933.833 511.5 934C521.5 919.2 536.333 918.833 542.5 920.5C565.3 897.7 567.667 875.333 566 867C552 881.4 523.833 879.667 511.5 877C504.7 889.4 486.667 891.833 478.5 891.5V883.5L475 872.5L470.5 877V883.5C464.5 877.1 456.667 880.833 453.5 883.5L449.5 871L447 878.5V891.5C429 893.9 415.167 881.5 410.5 875C410.5 875 357.333 868.5 353.5 861.5Z" fill="url(#paint0_linear_2051_4)"/>
          <path d="M183.5 922H-2V1085.5H183.5V922Z" fill="url(#paint1_linear_2051_4)"/>
          <path d="M500 922H182V1085H500V922Z" fill="url(#paint2_linear_2051_4)"/>
          <path d="M169 955C171.8 959.4 178.833 959.167 182 958.5V977.5C172.8 973.1 169.5 960.667 169 955Z" fill="url(#paint3_linear_2051_4)"/>
          <rect x="188" y="958" width="312" height="1" fill="black"/>
          <path d="M88 1073L95.5 1080.5H181.5V1015.5L170.5 1029.5L159 1020.5L161.5 1028C156.3 1030.8 152.667 1035.17 151.5 1037L145 1033L152.5 1046C142.5 1055.6 129.667 1055.67 124.5 1054.5C110.5 1072.9 94.3333 1074.5 88 1073Z" fill="url(#paint4_linear_2051_4)"/>
<polygon
  points="
    14 0
    10 9
    0 10
    9 14
    7 24
    14 18
    21 24
    19 14
    28 10
    18 9
  "
  fill="url(#paint5_linear_2051_4)"
  transform="translate(200 928)"
/>

          <path d="M0 922V950H3.5C3.5 950 37.3333 924.667 48.5 922H0Z" fill={tournament.primaryColor || '#FFD000'}/>
        </g>
        <defs>
          <linearGradient id="paint0_linear_2051_4" x1="421.5" y1="859" x2="459.962" y2="938.5" gradientUnits="userSpaceOnUse">
            <stop stopColor={tournament.primaryColor || '#D09802'}/>
            <stop offset="1" stopColor={ '#1f1f1f'}/>
          </linearGradient>
          <linearGradient id="paint1_linear_2051_4" x1="90.75" y1="922" x2="302" y2="1327" gradientUnits="userSpaceOnUse">
            <stop stopColor="white"/>
            <stop offset="1" stopColor="#999999"/>
          </linearGradient>
          <linearGradient id="paint2_linear_2051_4" x1="341" y1="922" x2="483.671" y2="1392.34" gradientUnits="userSpaceOnUse">
            <stop stopColor="white"/>
            <stop offset="1" stopColor="#999999"/>
          </linearGradient>
          <linearGradient id="paint3_linear_2051_4" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="userSpaceOnUse">
            <stop stopColor={tournament.primaryColor || '#FFD000FF'}/>
            <stop offset="1" stopColor={tournament.secondaryColor || 'transparent'}/>
          </linearGradient>
          <linearGradient id="paint4_linear_2051_4" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="userSpaceOnUse">
            <stop stopColor={tournament.primaryColor || '#FFD000FF'}/>
            <stop offset="1" stopColor={tournament.secondaryColor || '#150F00'}/>
          </linearGradient>
          <linearGradient id="paint5_linear_2051_4" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="userSpaceOnUse">
            <stop stopColor={tournament.primaryColor || '#F6B60B'}/>
            <stop offset="1" stopColor={tournament.secondaryColor || 'transparent'}/>
          </linearGradient>
          <clipPath id="clip0_2051_4">
            <rect width="1920" height="1080" fill="white"/>
          </clipPath>
        </defs>
      </svg>
<div>
    {tournament.tournamentName && (
      <div className="text-black text-[26px] font-[AGENCYB] absolute top-[921px] left-[230px]">{tournament.tournamentName}</div>
      )}
</div>
    <div
  className="w-[180px] h-[90px] relative top-[-130px] left-[200px] text-black font-[AGENCYB] text-[60px] font-bold"
>
  {round?.roundName.toUpperCase()}
</div>
    <div
  className=" h-[90px] relative top-[-170px] left-[210px] text-black font-[AGENCYB] text-[60px] font-bold"
>
MATCH {match?.matchNo} / {totalMatches}
</div>

      {tournament.torLogo && (
        <img
          src={tournament.torLogo}
          alt="Tournament Logo"
          style={{
            position: 'absolute',
            top: '921px',
            left: '-70px',
            width: '300px',
            height: '150px',
            objectFit: 'contain'
          }}
        />
      )}
      
    </div>
    
  )
}

export default Lower;

