import React, { useMemo, useState } from 'react';
// NOTE: SocketManager and the api import removed. This component used to
// open its own socket connection purely to get the FIRST live update as a
// one-shot data fetch (then disconnected). PublicThemeRenderer now owns the
// single socket connection and passes freshly-merged `matchData` /
// `backpackInfo` down as props — this component just reacts to those.

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
    day?: string
}

interface Match {
    _id: string;
    matchName?: string;
    matchNo?: number;
    _matchNo?: number;
}

interface Player {
    _id: string;
    playerName: string;
    killNum: number;
    bHasDied: boolean;
    picUrl?: string;
    damage?: string | number;
    survivalTime?: number;
    assists?: number;
    playerKey?: string;
    // Extended player properties
    teamLogo?: string;
    teamTag?: string;
    teamName?: string;
    numericDamage?: number;
    teamPoints?: number;
    heals?: number;
    // Live stats fields
    health?: number;
    knockouts?: number;
    healthMax?: number;
    liveState?: number; // 0,1,2,3 = alive, 4 = knocked, 5 = dead
    useSmokeGrenadeNum?: number;
    useFragGrenadeNum?: number;
    useBurnGrenadeNum?: number;
    useFlashGrenadeNum?: number;
}

interface Team {
    _id: string;
    teamTag: string;
    slot?: number;
    placePoints: number;
    players: Player[];
    teamLogo: string;
    teamName: string;
}

interface MatchData {
    _id: string;
    teams: Team[];
}

interface BackpackInfo {
  userId: string;
  tournamentId: string;
  roundId: string;
  matchId: string;
  matchDataId: string;
  teambackpackinfo: {
    TeamBackPackList: any[];
  };
}

interface MatchFragrsProps {
    tournament: Tournament;
    round?: Round | null;
    match?: Match | null;
    matchData?: MatchData | null;
    backpackInfo?: BackpackInfo | null;
}

interface StatBoxData {
  img: string;
  primaryValue: string ;
  secondaryValue: number;
}

interface StatBoxProps extends StatBoxData {
  tournament: Tournament;
}

const Mvp: React.FC<MatchFragrsProps> = ({ tournament, round, match, matchData, backpackInfo }) => {
  const [selectedView, setSelectedView] = useState<'fragers' | 'teams'>('fragers');

const teamStats = useMemo(() => {
  if (!matchData) return [];

  // Example: map teams into an array of objects for the stat boxes
  return matchData.teams.map(team => ({
    teamTag: team.teamTag,
    totalElims: team.players.reduce((sum, p) => sum + (p.killNum || 0), 0),
    totalDamage: team.players.reduce((sum, p) => sum + Number(p.damage || 0), 0),
    knocks: team.players.reduce((sum, p) => sum + (p.assists || 0), 0),
    heals: team.players.reduce((sum, p) => sum + (p.health || 0), 0),
    logo: team.teamLogo,
  }));
}, [matchData]);

    const calculatePlayerHeals = (playerKey: string | number) => {
  if (!backpackInfo?.teambackpackinfo?.TeamBackPackList) return 0;

  // Find the player's backpack data
  const playerBackpack = backpackInfo.teambackpackinfo.TeamBackPackList.find(
    (p: any) => p && String(p.PlayerKey) === String(playerKey)
  );

  if (!playerBackpack) return 0;

  // Sum up all heal items (601001-601006)
  let totalHeals = 0;
  const healIds = [601001, 601002, 601003, 601004, 601005, 601006];

  healIds.forEach(id => {
    if (playerBackpack[id]) {
      const match = String(playerBackpack[id]).match(/Num:(\d+)/);
      if (match) {
        totalHeals += parseInt(match[1], 10);
      }
    }
  });

  return totalHeals;
};

const topPlayers = useMemo(() => {
  if (!matchData?.teams) return [];

  // Flatten all players from all teams and add team info
  const allPlayers = matchData.teams.flatMap(team =>
    team.players.map(player => {
      const playerKey = player.playerKey || (player as any).PlayerKey || player._id;
      return {
        ...player,
        playerKey, // Ensure playerKey is set
        teamLogo: team.teamLogo,
        teamTag: team.teamTag,
        teamName: team.teamName,
        // Calculate numeric damage if it's a string
        numericDamage: typeof player.damage === 'string' ?
          parseFloat(player.damage) :
          player.damage || 0,
        // Add team points for sorting
        teamPoints: team.placePoints || 0,
        // Calculate heals for this player
        heals: calculatePlayerHeals(playerKey)
      };
    })
  );

  // Sort by kills (descending), then damage (descending), then assists (descending)
  const sortedPlayers = [...allPlayers].sort((a, b) => {
    if (b.killNum !== a.killNum) return (b.killNum || 0) - (a.killNum || 0);
    if (b.numericDamage !== a.numericDamage) return b.numericDamage - a.numericDamage;
    if ((b.assists || 0) !== (a.assists || 0)) return (b.assists || 0) - (a.assists || 0);
    return 0;
  });

  return sortedPlayers.slice(0, 10); // Get top 10 players
}, [matchData, backpackInfo]);


    const topPlayer = topPlayers[0]; // first player after sorting

    // Calculate heals for the top player
    const mvpHeals = useMemo(() => {
        return topPlayer?.heals || 0;
    }, [topPlayer]);

    const statBoxes: StatBoxData[] = [
      {
        img: "/theme4assets/total elims.png",
        primaryValue: "TOTAL ELIMS",
        secondaryValue: topPlayer?.killNum || 0,
      },
      {
        img: "/theme4assets/totaldamages.png",
        primaryValue: "TOTAL DAMAGE",
        secondaryValue: topPlayer?.numericDamage || 0,
      },
      {
        img: "/theme4assets/health.png",
        primaryValue: "TOTAL HEALS",
        secondaryValue: mvpHeals,
      },
      {
        img: "/theme4assets/knoc.png",
        primaryValue: "TOTAL KNOCKS",
        secondaryValue: topPlayer?.knockouts || 0,
      },
    ];

    const StatBox: React.FC<StatBoxProps> = ({
      img,
      primaryValue,
      secondaryValue,
      tournament,
    }) => {
      return (
        <div className="flex items-center ml-[20px] font-[AGENCYB]">

          {/* IMAGE */}
          <div className="w-[150px] h-[120px]">
            <img
              src={img}
              alt=""
              className="w-full h-full object-contain"
            />
          </div>

          {/* DATA BOXES */}
          <div className="w-full h-full pl-[20px] flex flex-col justify-center items-center">

            {/* PRIMARY */}
           <div
      style={{
        backgroundColor: "white", // visible div background
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

            {/* SECONDARY */}
            <div
              style={{
                boxShadow: `0 0 0 5px ${tournament.secondaryColor || "#000"}`,
              }}
              className="w-full h-[45%] mt-[15px] flex items-center justify-center text-black text-[62px] bg-white text-center"
            >
              {secondaryValue}
            </div>

          </div>

        </div>
      );
    };

    return (
      <>
        {!matchData ? (
          <div className="w-[1920px] h-[1080px] flex items-center justify-center">
            <div className="text-white text-2xl font-[Righteous]"></div>
          </div>
        ) : (
          <div className='w-[1920px] h-[1080px] '>
            <div className='flex justify-end  w-[1300px] h-[190px] relative top-[40px] '>
              <div className='w-[750px] h-[150px] absolute '>
                <img src="/theme4assets/textMVP.png" alt="" className='w-[100%] h-[100%]' />
              </div>
              <div className='mr-[-20px]'>
                <div
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${tournament.primaryColor || '#000'
                      }, #000)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                  className='text-white text-[80px] font-[AGENCYB] absolute top-[-20px]'>

                  {round?.roundName}
                </div>
                <div className='text-black text-[80px] font-[AGENCYB] absolute top-[50px] w-[500px]'>
                  DAY {round?.day} MATCH {match?.matchNo}
                </div>
              </div>
            </div>
            <div
              className="absolute left-[-160px] top-[280px]"
              style={{ width: "1000px", height: "800px" }}
            >
              <img
                src={topPlayer?.picUrl || "/def_char.png"}
                alt={topPlayer?.playerName || "Player"}
                style={{ width: "850px", height: "800px"}}
              />
            </div>
            <div className='w-[90%] h-[130px] flex justify-end font-[AGENCYB]'>
              <div
                style={{
                  boxShadow: `0 0 0 5px ${tournament.secondaryColor || '#000'}`,
                }}
                className="relative bg-white w-[66%] skew-x-[-7deg]"
              >
                {/* INNER CONTENT (un-skewed) */}
                <div className="absolute inset-0 flex  skew-x-[7deg]">
                  <div className="flex items-center gap-4 text-white text-[70px] absolute left-[80px]">
                    <div className="w-[120px] h-[120px]  relative top-[5px] ">
                      <img
                        src={topPlayers[0].teamLogo}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span>{topPlayers[0].teamTag}</span>
                  </div>
                  <div className='text-black absolute left-[550px] text-[70px] top-[10px]'>
                    {topPlayers[0].playerName}
                  </div>
                </div>

                {/* LEFT GRADIENT BAR */}
                <div
                  className="w-[45%] h-full"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${
                      tournament.primaryColor || '#000'
                    }, #000)`,
                  }}
                />
              </div>
            </div>
            <div className='w-[100%] h-[100%] flex justify-center '>
              <div className="w-[1100px] h-[600px] absolute left-[600px] top-[350px]">
                <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-2 p-2">
                  {statBoxes.map((box, index) => (
                    <StatBox
                      key={index}
                      img={box.img}
                      primaryValue={box.primaryValue}
                      secondaryValue={box.secondaryValue}
                      tournament={tournament}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
};


export default Mvp;
