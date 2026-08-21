import React from "react";

// NOTE: This component was already props-driven — it never opened its own
// socket connection. PublicThemeRenderer owns the single socket connection
// for the page and, on the initial bulk fetch / each 'bulkUpdate', passes
// { tournament, round, match, totalMatches: matches.length, matches } down
// as props, exactly the same way it feeds Upper.tsx, LiveData.tsx, and
// Dom.tsx. This file just reacts to those props changing — no changes were
// needed to the data-flow shape itself, only cleanup below.

interface Tournament {
  _id: string;
  tournamentName: string;
  torLogo?: string;
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
  map?: string;
  _matchNo?: number;
}

interface LowerProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  totalMatches: number;
  matches?: Array<any>;
}

export default function Lower({ tournament, round, match, totalMatches, matches }: LowerProps) {
  const matchNumber = match?.matchNo ?? match?._matchNo ?? 0;
  const currentIndex = matches?.findIndex(m => m.matchNo === matchNumber || m._matchNo === matchNumber) ?? -1;

  const currentMatch = matches?.[currentIndex];

  // Use dynamic groupNames from parent enrichment
  const groupNames = currentMatch?.groupNames || [];
  const legacyGroupName = currentMatch?.groupName;

  const groupName = groupNames.length > 0 ? groupNames.join(' VS ') : (legacyGroupName || `Maç ${matchNumber}`);

  return (
   <div className="w-[1920px] h-[1080px]  items-end flex">
   <div className="w-[600px] h-[270px] bg-[#191919] flex flex-col">

  <div

  className="w-full h-[400px] flex">
    <div

    className="bg-[#1a1a1a] w-1/2 h-[130px] broder-3 border-white border-b ">

<img src={tournament.torLogo} alt="" className="w-[323px] h-[130px] " />

    </div>
    <div
    style={{
                      backgroundImage: `linear-gradient(to left top, ${tournament.primaryColor || '#6b21a8'}, ${tournament.secondaryColor || '#c084fc'}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,

    }}
    className="bg-yellow-300 w-1/2 h-[130px] broder-3 text-white border-white border-b font-[AGENCYB]">
<div className="  text-[65px] relative left-[20px] skew-x-[-10deg]">
      {match?.map?.toUpperCase()}
      </div>
      <div className="text-[35px] relative left-[20px] top-[-24px] ">
      MATCH {match?.matchNo}
      </div>
    </div>
  </div>
<div className="relative top-[20px] scale-125">
  <div className="text-white font-[AGENCYB] text-[40px] w-full h-1/3 flex justify-center items-center">
  {round?.roundName?.toUpperCase()}
  </div>

  <div className="text-white font-[AGENCYB] text-[40px] w-full h-1/3 flex justify-center items-center skew-x-[-10deg]">
  MATCH {match?.matchNo} / {totalMatches}  - DAY {round?.day}
  </div>
</div>
</div>
   </div>
  );
}