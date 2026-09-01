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
  // Map props data to the format used in the new design
  const data = {
    TOR_NAME: tournament.tournamentName || "",
    TOR_LOGO: tournament.torLogo || "",
    ROUND: round?.roundName || "",
    MATCHES: match?.matchNo || 0,
    PRIMARY_COLOR: tournament.primaryColor || "#8B5CF6",
    SECONDARY_COLOR: tournament.secondaryColor || "#6366F1",
  };

  return (
    <div className="w-[1920px] h-[1080px] relative">
      {/* Bottom-left gradient box */}
      <div className="w-[590px] h-[190px] absolute bottom-0 left-0 flex ">
        {/* Custom Gradient Background using PRIMARY_COLOR and SECONDARY_COLOR */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(to bottom right, ${data.PRIMARY_COLOR}, ${data.SECONDARY_COLOR}), url('https://res.cloudinary.com/dqckienxj/image/upload/v1748293303/purple-waves-light-abstract-zg_qfebgm.jpg')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundBlendMode: 'screen',
          }}
        />

        {/* Black Faded Overlay */}
        <div className="absolute inset-0 bg-black opacity-75 pointer-events-none"></div>

        <div className="w-[190px] absolute left-[10px] ">
          {data.TOR_LOGO && (
            <img src={data.TOR_LOGO} alt="Tournament Logo" />
          )}
        </div>

        {/* Content */}
        <div className="relative z-10 w-full flex items-center justify-center text-white">
          <div className="text-center relative left-[100px] top-[-10px]">
            <h2
              className="text-4xl font-[Awaking] w-[340px] border-2 text-white text-center px-2 py-1 "
              style={{
                borderColor: data.PRIMARY_COLOR,
                color: '#ffffff'
              }}
            >
              {data.ROUND}
            </h2>

            <p
              className="mt-4 text-5xl font-[PaybAck] font-light text-white px-4 py-2 rounded-md bg-gradient-to-r"
              style={{
                backgroundImage: `linear-gradient(to right, ${data.PRIMARY_COLOR}, ${data.SECONDARY_COLOR})`
              }}
            >
              MATCH  {data.MATCHES}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Lower;
