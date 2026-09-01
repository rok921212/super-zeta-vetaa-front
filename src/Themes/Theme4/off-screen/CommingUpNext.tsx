import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
// NOTE: the self-fetch of round matches is gone — PublicThemeRenderer
// already loads the full `matches` list and passes it down as a prop; the
// "next match" is just derived from it.

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

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
  time?: string;
  map?: string;
}

interface CommingUpNextProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null; // currently selected match
  matches?: Match[];
}

const CommingUpNext: React.FC<CommingUpNextProps> = ({ tournament, round, match, matches = [] }) => {
  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => (a.matchNo || a._matchNo || 0) - (b.matchNo || b._matchNo || 0));
  }, [matches]);

  const nextMatch = useMemo(() => {
    if (!match) return sortedMatches[0];
    const currentIdx = sortedMatches.findIndex(m => m._id === match._id);
    if (currentIdx === -1) return sortedMatches[0];
    return sortedMatches[currentIdx + 1] || null;
  }, [sortedMatches, match]);

  if (!round) {
    return (
      <div className="w-[1920px] h-[1080px]  text-white flex items-center justify-center">No round selected</div>
    );
  }

  if (!nextMatch) {
    return (
      <div className="w-[1920px] h-[1080px]  text-white flex flex-col items-center justify-center">
        <div className="text-[6rem] font-bebas">COMING UP NEXT</div>
        <div className="text-[2rem] font-[Righteous]">No upcoming match</div>
      </div>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden ">
      {/* Header */}
      <motion.div
        className="absolute z-10 left-[450px] top-[100px] text-[5rem] font-bebas font-[300]"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <h1 className="text-white font-bold whitespace-pre text-[8rem]">COMING UP NEXT</h1>

      </motion.div>

      {/* Next match card */}
      <motion.div
       style={{
        border: "3px solid",
        borderImage: `linear-gradient(45deg, ${tournament.primaryColor || "#000"}, ${tournament.secondaryColor || "#333"}) 1`,
      }}

        className="absolute top-[300px] left-[300px] w-[1320px] h-[540px] bg-[#111111c4] border border-[#333] rounded-md"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex h-full text-white">
          <div className="flex-1 p-6 flex flex-col justify-center items-center mt-[-40px]">
          <div className=" text-[4rem] font-bebas">{tournament.tournamentName || '-'}</div>
          <div
  style={{
    background: `linear-gradient(
      to right,
      transparent,
      ${tournament.primaryColor || "#000"},
      ${tournament.secondaryColor || "#333"},
      transparent
    )`,
  }}
  className="text-[5rem] font-bebas w-[400px] flex justify-center text-white"
>
  {(nextMatch.matchName && nextMatch.matchName) || `Match ${nextMatch.matchNo || nextMatch._matchNo}`}
</div>


            <div className=" text-[3rem] font-[Righteous]">Map : {nextMatch.map || '-'}</div>
            <div

                     style={{
                       background: `linear-gradient(
                         to right,
                         transparent,
                         ${tournament.primaryColor || "#000"},
                         ${tournament.secondaryColor || "#333"},
                         transparent
                       )`,
                     }}
            className=" text-[3rem] font-[Righteous] w-[700px] flex justify-center">ROUND : {round.roundName || '-'}</div>

          </div>
          <div
  className="w-[520px] h-full flex items-center justify-center text-black text-[3rem] font-bebas"
  style={{
    background: `linear-gradient(45deg, ${
      tournament.primaryColor || "#000"
    }, ${tournament.secondaryColor || "#333"})`,
  }}
>
  {(() => {
    switch (nextMatch.map?.toLowerCase()) {
      case "erangel":
        return <img src="https://res.cloudinary.com/dqckienxj/image/upload/v1759656542/erag_ijugzi.png" alt="Erangel" className="h-full object-contain" />;
      case "miramar":
        return <img src="https://res.cloudinary.com/dqckienxj/image/upload/v1759656542/miramar_leezqf.png" alt="Miramar" className="h-full object-contain" />;
      case "sanhok":
        return <img src="https://res.cloudinary.com/dqckienxj/image/upload/v1759656543/sanhok_kojxj7.png" alt="Sanhok" className="h-full object-contain" />;
      case "rondo":
        return <img src="https://res.cloudinary.com/dqckienxj/image/upload/v1759656543/rondo_huj3bl.png" alt="Rondo" className="h-full object-contain" />;
      case "bermuda":
        return <img src="https://res.cloudinary.com/dqckienxj/image/upload/v1761360885/bermuda_axt2w0.jpg" alt="Bermuda" className="h-full object-contain" />;
      case "alpine":
        return <img src="https://res.cloudinary.com/dqckienxj/image/upload/v1761361515/alpine_wfchbf.jpg" alt="Alpine" className="h-full object-contain" />;
      case "nexterra":
        return <img src="https://res.cloudinary.com/dqckienxj/image/upload/v1761361420/nexterra_v0ivox.jpg" alt="Nexterra" className="h-full object-contain" />;
      case "purgatory":
        return <img src="https://res.cloudinary.com/dqckienxj/image/upload/v1761361420/purgatory1_frijhy.jpg" alt="Purgatory" className="h-full object-contain" />;
      case "kalahari":
        return <img src="https://res.cloudinary.com/dqckienxj/image/upload/v1761361420/kalahari_jrhc4o.jpg" alt="Kalahari" className="h-full object-contain" />;
      default:
        return <span>No map selected</span>;
    }
  })()}
</div>


        </div>
      </motion.div>
    </div>
  );
};

export default CommingUpNext;
