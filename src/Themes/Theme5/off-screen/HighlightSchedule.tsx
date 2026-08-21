import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

interface Tournament {
  _id: string;
  tournamentName: string;
  primaryColor?: string;
  secondaryColor?: string;
}

interface Round {
  _id: string;
  roundName: string;
  day?: string;
}

interface Player {
  _id: string;
  playerName: string;
  killNum: number;
}

interface Team {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  players: Player[];
  placePoints: number;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
  time?: string;
  map?: string;
  teams?: Team[];
}

interface ScheduleProps {
  tournament: Tournament;
  round?: Round | null;
  matches?: Match[];
  matchDatas?: any[];
  selectedScheduleMatches?: string[];
  matchData?: any;
}

interface MatchItemProps {
  match: Match;
  index: number;
  primaryColor?: string;
  secondaryColor?: string;
}

const getMapImage = (mapName?: string) => {
  switch (mapName?.toLowerCase()) {
    case "erangel":
      return "/theme4assets/eragnel.png";
    case "miramar":
      return "/theme4assets/mirmar.png";
    case "sanhok":
      return "/theme4assets/sanhok.png";
    case "rondo":
      return "/theme4assets/rondo.png";
    case "bermuda":
      return "https://res.cloudinary.com/dqckienxj/image/upload/v1761360885/bermuda_axt2w0.jpg";
    case "alpine":
      return "https://res.cloudinary.com/dqckienxj/image/upload/v1761361515/alpine_wfchbf.jpg";
    case "nexterra":
      return "https://res.cloudinary.com/dqckienxj/image/upload/v1761361420/nexterra_v0ivox.jpg";
    case "purgatory":
      return "https://res.cloudinary.com/dqckienxj/image/upload/v1761361420/purgatory1_frijhy.jpg";
    case "kalahari":
      return "https://res.cloudinary.com/dqckienxj/image/upload/v1761361420/kalahari_jrhc4o.jpg";
    default:
      return null;
  }
};

const HighlightSchedule: React.FC<ScheduleProps> = ({ tournament, round, matches: propMatches, matchDatas: propMatchDatas, selectedScheduleMatches }) => {
  // NOTE: the REST fallback fetch (fetch(...rounds/:id/matches),
  // fetch(...selected-match), fetch(...matchdata) per match) has been
  // removed. PublicThemeRenderer always supplies `matches`/`matchDatas`
  // as props now, so this is a pure derivation instead of an effect.
  const matches = useMemo<Match[]>(() => {
    if (!propMatches) return [];
    return propMatches.map((match, idx) => ({
      ...match,
      teams: propMatchDatas?.[idx]?.teams || []
    }));
  }, [propMatches, propMatchDatas]);

  const sortedMatches = useMemo(() => {
    // Filter to only selected matches if any are selected
    let filteredMatches = matches;
    if (selectedScheduleMatches && selectedScheduleMatches.length > 0) {
      filteredMatches = matches.filter(match => selectedScheduleMatches.includes(match._id));
    }

    // Remove duplicates by matchNo
    const uniqueMatches = filteredMatches.filter((match, index, self) =>
      index === self.findIndex(m => (m.matchNo || m._matchNo) === (match.matchNo || match._matchNo))
    );
    return uniqueMatches.sort((a, b) => (a.matchNo || a._matchNo || 0) - (b.matchNo || b._matchNo || 0));
  }, [matches, selectedScheduleMatches]);

  if (!round) {
    return (
      <div className="w-[1920px] h-[1080px]  text-white flex items-center justify-center">No round selected</div>
    );
  }

const MatchItem: React.FC<MatchItemProps> = ({ match, index, primaryColor, secondaryColor }) => {
  const winningTeams = match.teams?.filter(team => team.placePoints === 10) || [];
  const hasWinner = winningTeams.length > 0;
  const total = hasWinner ? winningTeams[0].players.reduce((sum, p) => sum + (p.killNum || 0), 0) + winningTeams[0].placePoints : 0;

  return (
    <div className="relative w-[791px] h-[134px] mb-4 left-[20%] transform -translate-x-1/2 -translate-y-1/2 top-[120px]">
      {/* SVG BACKGROUND — EXACT COPY */}
      <svg
        width="791"
        height="134"
        viewBox="0 0 791 134"
        className="absolute inset-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* TOP LEFT DECOR */}
        <path
          d="M101 74.5C112.6 69.7 122.167 73.5 125.5 76V25.5L123.5 22.5L123 30.5C120.2 29.7 115.5 32.833 113.5 34.5L109 29C109.4 33.4 111.167 38.833 112 41C102.8 47 92.1667 43.5 88 41C77.2 50.2 62.1667 49.167 56 47.5C61.2 61.5 74.8333 71 81 74C91.8 68.4 98.8333 72 101 74.5Z"
          fill="url(#paint0)"
        />

        {/* TOP EDGE SHAPE */}
        <path
          d="M153.769 0C158.569 0 161.769 2 162.769 3C163.435 4 164.769 6.2 164.769 7C164.769 7.8 199.435 7.333 216.769 7C221.569 3.8 225.435 -8.667 226.769 -14.5C221.569 -10.5 210.269 -11.167 205.269 -12C202.069 -7.2 194.602 -6.667 191.269 -7C192.069 -8.6 191.602 -13.333 191.269 -15.5L189.269 -11.5C187.269 -12.7 184.102 -12.333 182.769 -12L181.269 -15.5C179.269 -11.9 179.435 -9.333 179.769 -8.5C172.969 -8.5 167.602 -13.833 165.769 -16.5C154.569 -15.7 148.102 -19.167 146.269 -21C144.669 -11.4 150.602 -3 153.769 0Z"
          fill="url(#paint1)"
        />

        {/* BASE */}
        <rect width="791" height="134" fill="#D9D9D9" />

        {/* MAP IMAGE */}
        {getMapImage(match.map) && (
          <image x="0" y="0" width="791" height="134" href={getMapImage(match.map)!} clip-path="url(#mapClip)" />
        )}

        {/* WINNER LOGO */}
        {hasWinner && (
          <image x="345" y="17" width="100" height="100" href={winningTeams[0].teamLogo || "/def_logo.png"} />
        )}

        {/* RIGHT TOP FADE — EXACT */}
        <rect width="791" height="134" fill="url(#paint2)" />

        {/* LEFT BLOCK */}
        <rect  x="0" y="0" width="218" height="134" fill="url(#paint3)" />

        <defs>
          <linearGradient id="paint0" x1="104" y1="54" x2="65" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0.0355546" stopColor={primaryColor || "#FF9600"} />
            <stop offset="1" stopColor="black" />
          </linearGradient>

          <linearGradient id="paint1" x1="179.269" y1="0" x2="110.269" y2="-9" gradientUnits="userSpaceOnUse">
            <stop stopColor={primaryColor || "#FFA21E"} />
            <stop offset="1" stopColor="black" />
          </linearGradient>

          <linearGradient id="paint2" x1="536" y1="169" x2="697.5" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="black" stopOpacity="0" />
            <stop offset="1" stopColor={primaryColor || "#FFA21E"} />
          </linearGradient>

{/* Left-side fade (mirrored) */}
<linearGradient id="paint3" x1="697.5" y1="0" x2="856" y2="0" gradientUnits="userSpaceOnUse">
  <stop stopColor={primaryColor || "#FFA21E"} />
  <stop offset="1" stopColor="black" stopOpacity="0" />
</linearGradient>

          <clipPath id="mapClip">
            <rect x="0" y="0" width="791" height="134" />
          </clipPath>
        </defs>
      </svg>

      {/* CONTENT */}
       <div className="relative z-10 h-full flex items-center  pl-[140px] pr-6 font-[AGENCYB]">
        <div className=" text-white absolute left-6 top-1/2 transform -translate-y-1/2">
          <h3 className="text-[50px] font-bold">
            MATCH {match.matchNo || index + 1}
          </h3>
          <p className="text-[40px] mt-[-25px]">
            {hasWinner ? (
              <span>
                <img src="/theme4assets/chickenWhite.png" alt="Chicken" className="inline w-[40px] h-[40px] mr-2" />
                <span className='relative top-[10px] left-[-10px]'> {winningTeams[0].teamTag}</span>
               
              </span>
            ) : match.time?.toUpperCase()}
          </p>
        </div>

        <div className="text-[34px]  text-white relative  ml-auto">
{hasWinner ? `${total} PTS` : match.map?.toUpperCase() || "NO MAP"}    </div>
      </div>
    </div>
  );
};


  return (
    <div className="w-[2200px] h-[1080px] relative overflow-hidden ">
      

  
<div className="space-y-4">
  {sortedMatches.map((match, index) => (
    <motion.div
      key={match._id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
     
     <MatchItem
      key={match._id}
      match={match}
      index={index}
      primaryColor={tournament.primaryColor}
      secondaryColor={tournament.secondaryColor}
    />
    </motion.div>
  ))}
  
</div>
    </div>
    
  );
  
};

export default HighlightSchedule;