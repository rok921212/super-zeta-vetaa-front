import React from "react";
import {
  Surface,
  Rail,
  Label,
  brand,
  slug,
  FONT_DISPLAY,
  FONT_LABEL,
  FONT_MONO,
  TEXT,
  TEXT_DIM,
  HAIRLINE,
  SCRIM_SOLID,
} from "../shell";

/* THEME8 · "DATUM" — Lower third.
   Placement preserved: bottom-left lower-third badge, ~x0-620 / y860-1080.
   Data preserved: tournamentName, primaryColor/secondaryColor, torLogo,
   match.matchNo (|| _matchNo), round.roundName.
   Shell: flat chamfered plate + vertical ticked rail as the left border +
   bracketed logo tile + technical label + mono broadcast slug. No brand-
   gradient fill, no texture overlay. */

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
  const { primary } = brand(tournament.primaryColor, tournament.secondaryColor);
  const matchNo = match?.matchNo ?? match?._matchNo;

  return (
    <div style={{ width: "1920px", height: "1080px", position: "absolute" }}>
      {/* tournament-name strip — same footprint (x0-430 / y860-900) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 860,
          width: 430,
          height: 40,
          background: SCRIM_SOLID,
          borderLeft: `2px solid ${primary}`,
          display: "flex",
          alignItems: "center",
          paddingLeft: 16,
          fontFamily: FONT_LABEL,
          fontSize: 18,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: TEXT,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 100%, 0 100%)",
        }}
      >
        {tournament.tournamentName}
      </div>

      {/* main lower-third plate — bottom-left, ~620x190 */}
      <Surface
        tone="solid"
        edge="left"
        accent={tournament.primaryColor}
        accentSecondary={tournament.secondaryColor}
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: 620,
          height: 190,
          display: "flex",
        }}
      >
        {/* vertical ticked rail as the left border */}
        <div style={{ flex: "none", paddingLeft: 6, display: "flex", alignItems: "center" }}>
          <Rail dir="v" length={190} gap={18} activeIndex={2} accent={tournament.primaryColor} />
        </div>

        {/* identity block */}
        <div style={{ flex: 1, minWidth: 0, padding: "16px 18px 14px 6px" }}>
          <Label glyph="/" size={13} accent={tournament.primaryColor}>
            MATCH {matchNo ?? "—"}
          </Label>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 46,
              lineHeight: 1,
              color: TEXT,
              marginTop: 10,
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {(round?.roundName || "").toUpperCase()}
          </div>
          <div style={{ height: 1, background: HAIRLINE, margin: "12px 0" }} />
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              letterSpacing: "0.18em",
              color: TEXT_DIM,
            }}
          >
            {slug(tournament, round, match)}
          </div>
        </div>

        {/* tournament logo tile */}
        <div
          style={{
            flex: "none",
            width: 150,
            borderLeft: `1px solid ${HAIRLINE}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <img
            src={tournament.torLogo || "/def_logo.png"}
            alt={tournament.tournamentName}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/def_logo.png";
            }}
          />
        </div>
      </Surface>
    </div>
  );
}

export default Lower;
