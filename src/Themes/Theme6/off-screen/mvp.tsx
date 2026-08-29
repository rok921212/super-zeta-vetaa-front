// src/components/Mvp.tsx
import React, { useMemo } from 'react';
import Round from 'dashboard/Round.tsx';
import { motion } from 'framer-motion';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
/* -------------------- Interfaces -------------------- */
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
  apiEnable?: boolean;
  day?: string;
}

interface Player {
  _id: string;
  playerName: string;
  killNum?: number;
  damage?: number;
  heal?: number;
  maxKillDistance?: number;
  headShotNum?: number;
  killNumByGrenade?: number;
  knockouts?: number;
  teamLogo?: string;
  teamTag?: string;
  teamName?: string;
  picUrl?: string;
}

interface Team {
  _id: string;
  teamTag: string;
  teamLogo: string;
  teamName: string;
  slot?: number;
  placePoints: number;
  players: Player[];
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchFragrsProps {
  tournament: Tournament;
  round?: Round | null;
  matchData?: MatchData | null;
}

/* -------------------- Stat Box -------------------- */
const StatBox: React.FC<{
  img: string;
  primaryValue: string | number;
  secondaryValue: string | number;
  tournament: Tournament;
}> = React.memo(({ img, primaryValue, secondaryValue, tournament }) => {
  return (
    <div className="flex items-center ml-[20px] font-[AGENCYB]">
      <div className="w-[150px] h-[120px]">
        <img src={img} alt="" className="w-full h-full object-contain" />
      </div>
      <div className="w-full h-full pl-[20px] flex flex-col justify-center items-center">
        <div
          style={{
            backgroundColor: "white",
            boxShadow: `0 0 0 5px ${tournament.primaryColor || "#000"}`,
          }}
          className="w-full h-[45%] flex items-center justify-center text-center"
        >
          <span
            style={{
              backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || "#ff0"}, #000)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
            className="text-[50px] font-bold"
          >
            {primaryValue}
          </span>
        </div>
        <div
          style={{ backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || "#ff0"}, #000)` }}
          className="w-full h-[45%] mt-[15px] flex items-center justify-center text-white text-[62px] border-white border-2 text-center"
        >
          {secondaryValue}
        </div>
      </div>
    </div>
  );
});

/* -------------------- Main Component -------------------- */
const Mvp: React.FC<MatchFragrsProps> = ({ tournament, round, matchData }) => {
  // Renders straight from the `matchData` prop. PublicThemeRenderer owns all
  // live data (HTTP bulk + socket deltas) and never persists it — no
  // localStorage shadow here, because a stale cached roster must never paint.
  // When `matchData` is null (e.g. right after a hard reload, before
  // hydration) the "Loading MVP..." branch below shows until the prop lands.
  const topPlayers = useMemo(() => {
    if (!matchData?.teams) return [];

    // Single-Match Fragger Score: kills 30% + damage 30% + headshots 20% +
    // longest kill 10% + knockouts 10%, each vs. this match's player-pool
    // average. maxKillDistance/headShotNum below are now Fragger-Score
    // load-bearing (they feed the score's longest-kill/headshot terms) as
    // well as still driving the LONGEST ELIM / HEADSHOTS stat boxes.
    const scored = computeFraggerScores(buildFraggerPool([matchData])).sort(compareFraggerScore);

    return scored.slice(0, 10).map(player => ({
      ...(player.latestPlayerRaw as any),
      ...player,
      killNum: player.totalKills,
      numericDamage: player.totalDamage,
      maxKillDistance: player.longestKillDistance,
      headShotNum: player.totalHeadshots,
    }));
  }, [matchData]);

  const topPlayer = topPlayers[0];

  const statBoxes = useMemo(() => topPlayer ? [
    { img: '/theme4assets/total elims.webp', primaryValue: 'TOTAL KILLS', secondaryValue: topPlayer.killNum || 0 },
    { img: '/theme4assets/totaldamages.webp', primaryValue: 'TOTAL DAMAGE', secondaryValue: topPlayer.numericDamage || 0 },
    { img: '/theme4assets/health.webp', primaryValue: 'TOTAL HEALS', secondaryValue: topPlayer.heal || 0 },
    { img: '/theme4assets/longest dist elims.webp', primaryValue: 'LONGEST ELIM', secondaryValue: `${((topPlayer.maxKillDistance || 0)/100).toFixed(1)}m` },
    { img: '/theme4assets/headshot.webp', primaryValue: 'HEADSHOTS', secondaryValue: topPlayer.headShotNum || 0 },
    { img: '/theme4assets/grenade.webp', primaryValue: 'GRENADE KILLS', secondaryValue: topPlayer.killNumByGrenade || 0 },
  ] : [], [topPlayer]);

  return (
    <div className="w-[1920px] h-[1080px] flex flex-col items-center relative ">
      {!topPlayer ? (
        <div className="w-full h-full flex items-center justify-center text-white text-2xl font-[Righteous]">
          Loading MVP...
        </div>
      ) : (
        <>
          {/* Big MVP Stroke Text */}
          <div
            className='font-[tungsten] text-[550px] absolute left-[-50px] top-[100px] rotate-[90deg]'
            style={{
              color: 'transparent',
              WebkitTextStroke: '5px white',
              fontWeight: 200,
            }}
          >
            MVP
          </div>

          {/* Round Name */}
      <motion.div
  initial={{ x: 80, opacity: 0 }}
  animate={{
    x: 0,
    opacity: 1,
    y: [0, -6, 0],
  }}
  transition={{
    duration: 0.8,
    y: {
      repeat: Infinity,
      duration: 3,
      ease: "easeInOut",
    },
  }}
  className="absolute left-[760px] top-0 overflow-hidden"
>
  {/* Glow */}
  <motion.div
    animate={{
      opacity: [0.3, 0.8, 0.3],
      scale: [1, 1.04, 1],
    }}
    transition={{
      duration: 2.5,
      repeat: Infinity,
      ease: "easeInOut",
    }}
    className="absolute inset-0 blur-3xl"
    style={{
      background: tournament.primaryColor,
    }}
  />

  {/* Main Panel */}
  <div
    className="relative overflow-hidden"
    style={{
      width: "1080px",
      height: "230px",
      clipPath:
        "polygon(0 0,96% 0,100% 50%,96% 100%,0 100%,3% 50%)",
      background: `linear-gradient(90deg,
        ${tournament.secondaryColor},
        ${tournament.primaryColor})`,
      border: "3px solid rgba(255,255,255,.18)",
      boxShadow:
        "0 0 60px rgba(255,255,255,.12), inset 0 0 40px rgba(255,255,255,.08)",
    }}
  >
    {/* Moving Shine */}
    <motion.div
      animate={{
        x: [-500, 1200],
      }}
      transition={{
        duration: 2.4,
        repeat: Infinity,
        ease: "linear",
        repeatDelay: 1,
      }}
      className="absolute top-0 h-full w-[180px]"
      style={{
        background:
          "linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent)",
        transform: "skewX(-25deg)",
      }}
    />

    {/* Decorative Lines */}
    <motion.div
      animate={{
        opacity: [0.3, 1, 0.3],
      }}
      transition={{
        repeat: Infinity,
        duration: 2,
      }}
      className="absolute top-0 left-0 h-full w-[6px] bg-white"
    />

    <motion.div
      animate={{
        opacity: [1, 0.2, 1],
      }}
      transition={{
        repeat: Infinity,
        duration: 1.5,
      }}
      className="absolute right-8 top-0 h-full w-[3px] bg-white"
    />

    {/* Large Round Name */}
    <div className="absolute left-12 top-2">
      <div
        className="font-[tungsten] uppercase leading-none tracking-[8px]"
        style={{
          fontSize: "180px",
          color: "#fff",
          textShadow:
            "0 0 25px rgba(255,255,255,.35)",
        }}
      >
        {round?.roundName || "ROUND"}
      </div>

      <motion.div
        animate={{
          letterSpacing: ["6px", "14px", "6px"],
        }}
        transition={{
          repeat: Infinity,
          duration: 2,
        }}
        className="font-[agencyb] text-[40px] uppercase text-white mt-[-30px] pl-[10px]"
      >
        MOST VALUABLE PLAYER
      </motion.div>
    </div>

    {/* Right Accent */}
    <motion.div
      animate={{
        rotate: [0, 360],
      }}
      transition={{
        repeat: Infinity,
        duration: 18,
        ease: "linear",
      }}
      className="absolute right-14 top-1/2 -translate-y-1/2"
    >
      <div
        className="w-28 h-28 rounded-full border-[5px]"
        style={{
          borderColor: "rgba(255,255,255,.2)",
        }}
      >
        <div
          className="absolute inset-3 rounded-full border-2"
          style={{
            borderColor: "rgba(255,255,255,.35)",
          }}
        />
      </div>
    </motion.div>
  </div>
</motion.div>
          {/* MVP Image */}
          <div className='absolute left-[-100px] top-[280px] w-[850px] h-[800px] z-0'>
            <img
              src={topPlayer.picUrl || "/def_char.avif"}
              alt={topPlayer.playerName || "Player"}
              className='w-full h-full object-contain'
            />
          </div>

          {/* Player Name, Team Logo & Tag */}
          <div
            className="absolute left-[-50px] top-[880px] h-[140px] w-[640px] skew-x-[-12deg] z-50"
            style={{ backgroundImage: `linear-gradient(135deg, #000, ${tournament.primaryColor || "#ff0"})` }}
          >
            <div className="flex items-center h-full px-6 skew-x-[12deg]">
              <div className="w-[80px] h-[120px] flex-shrink-0 ml-[60px] mt-[40px]">
                <img src={topPlayer.teamLogo} alt={topPlayer.teamName} className="w-full h-full object-contain" />
              </div>
              <div className="ml-6 text-white text-[80px] font-[AGENCYB] truncate mt-[40px]">
                {topPlayer.playerName} 
              </div>
            </div>
            <div className='bg-white w-[70%] h-[30%] font-[AGENCYB] text-center text-[30px] flex items-center justify-center absolute left-[0%] top-[0%]'>
              {topPlayer.teamName.toUpperCase()}
            </div>
          </div>

          {/* MVP Stat Boxes */}
          <div className="w-[1000px] h-[650px] absolute left-[650px] top-[350px] grid grid-cols-2 grid-rows-3 gap-4 p-2">
            {statBoxes.map((box, idx) => (
              <StatBox
                key={idx}
                img={box.img}
                primaryValue={box.primaryValue}
                secondaryValue={box.secondaryValue}
                tournament={tournament}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Mvp;