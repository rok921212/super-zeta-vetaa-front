import React from "react";
import { brand, FONT_DISPLAY, FONT_LABEL } from "../shell";

/* THEME8 · "DATUM" — Lower third · "WHITE LABEL"
   Placement: flush to the bottom-left corner of the 1920x1080 canvas (x0 / y888-1080), no padding.
   Width grows with the round name: 720px min, 1000px max (then ellipsis).
   Data preserved: tournamentName, primaryColor/secondaryColor, torLogo,
   match.matchNo (|| _matchNo), round.roundName.

   Flat, cut-paper construction. Every diagonal shares one angle (SLANT over
   the plate height) so the pieces read as a single system:
     · black tab with tournament name, a primary underline and a notch cut
     · light-grey logo panel cut on the same angle as the plate
     · white field with the round name in heavy black
     · thin secondary sliver, then a solid primary block for the match number
   No gradients, no glows — colour comes from solid blocks only. */

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

/* ── palette ── */
const INK = "#0B0B0E";
const WHITE = "#FFFFFF";
const PANEL = "#EFEFF2"; // logo panel, a step off white

/* ── colour helpers ── */
function toRgb(hex: string): [number, number, number] {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* black or white — whichever reads better on the given colour */
function inkOn(hex: string): string {
  const L = toRgb(hex)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  return L > 0.45 ? INK : WHITE;
}

/* ── geometry ── */
const LEFT = 0;
const BOTTOM = 0;
const PLATE_MIN_W = 720;
const PLATE_MAX_W = 1000;
const PLATE_H = 150;
const TAB_H = 42;
const SLANT = 28; // horizontal run of every diagonal across PLATE_H
const TAB_SLANT = Math.round((SLANT * TAB_H) / PLATE_H) + 6; // same angle family on the tab
const SLIVER = 7; // secondary stripe thickness
const GAP = 5; // white gap between cuts

/* parallelogram leaning right (top edge longer on the right) */
const lean = (s: number) => `polygon(${s}px 0, 100% 0, calc(100% - ${s}px) 100%, 0 100%)`;

function Lower({ tournament, round, match }: LowerProps) {
  const { primary } = brand(tournament.primaryColor, tournament.secondaryColor);
  const secondary = tournament.secondaryColor || primary;
  const onPrimary = inkOn(primary);
  const matchNo = match?.matchNo ?? match?._matchNo;
  const matchLabel = matchNo != null ? String(matchNo).padStart(2, "0") : "—";
  const roundName = (round?.roundName || "").toUpperCase();

  return (
    <div style={{ width: "1920px", height: "1080px", position: "absolute" }}>
      <div
        style={{
          position: "absolute",
          left: LEFT,
          bottom: BOTTOM,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          filter: "drop-shadow(0 -2px 14px rgba(0,0,0,0.28))",
        }}
      >
        {/* ── black tab: tournament name ── */}
        <div
          style={{
            position: "relative",
            flex: "none",
            height: TAB_H,
            maxWidth: 560,
            background: INK,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: `0 ${TAB_SLANT + 26}px 0 22px`,
            boxSizing: "border-box",
            // right edge cut on the plate's angle, plus a small notch top-left
            clipPath: `polygon(10px 0, calc(100% - ${TAB_SLANT}px) 0, 100% 100%, 0 100%, 0 10px)`,
          }}
        >
          {/* square brand mark */}
          <span style={{ flex: "none", width: 10, height: 10, background: primary }} />
          <span
            style={{
              fontFamily: FONT_LABEL,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: WHITE,
              lineHeight: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {tournament.tournamentName}
          </span>
          {/* primary underline running along the tab's base */}
          <span
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 3,
              background: primary,
            }}
          />
        </div>

        {/* ── white main plate ── */}
        <div
          style={{
            position: "relative",
            minWidth: PLATE_MIN_W,
            maxWidth: PLATE_MAX_W,
            height: PLATE_H,
            background: WHITE,
            clipPath: `polygon(0 0, 100% 0, calc(100% - ${SLANT}px) 100%, 0 100%)`,
            display: "flex",
            alignItems: "stretch",
          }}
        >
          {/* logo panel — grey, cut on the plate angle */}
          <div
            style={{
              flex: "none",
              width: 176,
              background: PANEL,
              clipPath: `polygon(0 0, 100% 0, calc(100% - ${SLANT}px) 100%, 0 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: `0 ${SLANT + 10}px 0 24px`,
              boxSizing: "border-box",
              position: "relative",
            }}
          >
            {/* solid primary edge on the far left */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, background: primary }} />
            <img
              src={tournament.torLogo || "/def_logo.png"}
              alt={tournament.tournamentName}
              style={{ maxWidth: "100%", maxHeight: 100, objectFit: "contain", display: "block" }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/def_logo.png";
              }}
            />
          </div>

          {/* round name */}
          <div
            style={{
              flex: "1 1 auto",
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              padding: "0 36px 0 22px",
            }}
          >
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                // big by default; steps down for long names so they still fit the plate
                fontSize:
                  roundName.length <= 14 ? 92 : roundName.length <= 19 ? 76 : roundName.length <= 25 ? 58 : 48,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: "0.005em",
                color: INK,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                paddingTop: 6, // optical centring for caps-only text
              }}
            >
              {roundName}
            </div>
          </div>

          {/* secondary sliver — a thin cut before the match block */}
          <div
            style={{
              flex: "none",
              width: SLANT + SLIVER,
              background: secondary,
              clipPath: lean(SLANT),
            }}
          />

          {/* match-number block — solid primary */}
          <div
            style={{
              flex: "none",
              width: 176,
              marginLeft: -SLANT + GAP,
              background: primary,
              clipPath: lean(SLANT),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: onPrimary,
              position: "relative",
            }}
          >
            <span
              style={{
                fontFamily: FONT_LABEL,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.3em",
                lineHeight: 1,
                paddingLeft: "0.3em",
                opacity: 0.9,
              }}
            >
              MATCH
            </span>
            <span
              style={{
                display: "block",
                fontFamily: FONT_DISPLAY,
                fontSize: 82,
                fontWeight: 800,
                lineHeight: 0.88,
                marginTop: 8,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {matchLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Lower;