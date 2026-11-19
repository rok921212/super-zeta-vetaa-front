// src/pages/lower/Lower.tsx
// NOTE: the own useParams-driven fetch (selected-match, the msgpack
// lowerData/:t/:r/:m endpoint, rounds/:id/matches) and its dashboard/
// cache.tsx localStorage cache have been removed. PublicThemeRenderer
// already does the one shared fetch — and now has its own global cache,
// see publicCache.ts — and passes `tournament`/`round`/`match`/
// `totalMatches` down as props for the 'Lower' view.
//
// FOREST LOWER THIRD — static (no animation), bottom-left corner.
//   ┌──────────┬─────────────────────────────────┐
//   │          │ TOURNAMENT NAME                  │
//   │   LOGO   │ MATCH 03 / 05                    │
//   │          │ ROUND · DAY · MAP                │
//   └──────────┴─────────────────────────────────┘
// 3D vines wrap the top, right edge, left edge and base; ferns grow from
// behind; mushrooms sit at the corner. Colours come from primary/secondary.
import React, { useId, useMemo } from "react";

interface Tournament {
  _id: string;
  tournamentName: string;
  torLogo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  overlayBg?: string;
}
interface Round { _id: string; roundName: string; day?: string; }
interface Match { _id: string; matchName?: string; matchNo?: number; _matchNo?: number; map?: string; }

interface LowerProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  totalMatches?: number;
}

/* ================================================================== */
/* Colour                                                              */
/* ================================================================== */
type RGB = [number, number, number];
const FALLBACK_PRIMARY: RGB = [74, 26, 140];
const FALLBACK_SECONDARY: RGB = [250, 226, 40];
const BLACK: RGB = [8, 10, 6];
const WHITE: RGB = [255, 255, 255];
const MOSS: RGB = [62, 88, 36];
const BARK: RGB = [74, 50, 30];

function toRgb(c: string | undefined, fb: RGB): RGB {
  if (!c) return fb;
  const s = c.trim();
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((x) => x + x).join("");
    if (h.length < 6) return fb;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const p = rgb[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
    if (p.length === 3 && p.every((n) => !isNaN(n))) return p as RGB;
  }
  return fb;
}
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
/** Darken just enough for white text to stay readable. */
const deepen = (c: RGB, max = 0.28): RGB => (lum(c) <= max ? c : mix(c, BLACK, 1 - max / lum(c)));

function usePalette(primary?: string, secondary?: string) {
  return useMemo(() => {
    const p = toRgb(primary, FALLBACK_PRIMARY);
    const s = toRgb(secondary, FALLBACK_SECONDARY);
    const m = mix(p, s, 0.5);
    const dp = deepen(p);
    const vine = (c: RGB) => {
      const b = mix(c, MOSS, 0.45);
      return { dark: css(mix(b, BLACK, 0.72)), mid: css(mix(b, BLACK, 0.3)), light: css(mix(c, WHITE, 0.55)) };
    };
    const leaf = (c: RGB) => [css(mix(c, WHITE, 0.42)), css(c), css(mix(c, BLACK, 0.45)), css(mix(c, BLACK, 0.7))];
    const fernBase = mix(mix(p, MOSS, 0.55), BLACK, 0.25);
    return {
      s: css(s),
      vines: [vine(p), vine(s), vine(m)],
      leaves: [leaf(mix(p, MOSS, 0.15)), leaf(mix(s, MOSS, 0.15)), leaf(mix(m, MOSS, 0.3))],
      fern: leaf(fernBase),
      logoTop: css(mix(dp, WHITE, 0.08)),
      logoBot: css(mix(dp, BLACK, 0.55)),
      bodyTop: css(mix(dp, BLACK, 0.45)),
      bodyBot: css(mix(dp, BLACK, 0.8)),
      rowTop: css(mix(mix(dp, BARK, 0.4), BLACK, 0.35)),
      rowBot: css(mix(mix(dp, BARK, 0.4), BLACK, 0.65)),
      stripA: css(mix(s, WHITE, 0.12)),
      stripB: css(mix(s, BLACK, 0.12)),
      stripInk: lum(s) > 0.5 ? css(mix(dp, BLACK, 0.4)) : "#ffffff",
      accent: css(lum(s) < 0.35 ? mix(s, WHITE, 0.45) : s),
      soft: css(mix(s, WHITE, 0.6)),
      capHi: css(mix(s, WHITE, 0.55)),
      capDark: css(mix(mix(s, BARK, 0.4), BLACK, 0.45)),
      stem: css(mix(s, WHITE, 0.82)),
      glow: css(mix(s, WHITE, 0.6)),
    };
  }, [primary, secondary]);
}
type Palette = ReturnType<typeof usePalette>;

const fit = (text: string, base: number, maxChars: number) =>
  text.length > maxChars ? Math.max((base * maxChars) / text.length, base * 0.5) : base;
const pad2 = (v: number | string) => (typeof v === "number" ? String(v).padStart(2, "0") : v);
const f = (n: number) => n.toFixed(1);

/* ================================================================== */
/* Geometry — local 720 x 290 box anchored bottom-left                 */
/* ================================================================== */
const BOX_W = 720;
const BOX_H = 290;

const LOGO_BLOCK = "M30,60 H210 V250 H30 Z";
const PANEL = "M210,60 H640 L670,250 H210 Z";
const STRIP = "M210,60 H640 L646.3,100 H210 Z";
const ROW = "M210,200 H662.1 L670,250 H210 Z";

const VINE_TOP =
  "M30,64 C40,40 90,60 140,48 S240,40 300,54 S420,66 480,50 S600,40 640,58 C660,70 652,110 662,140 S674,180 668,198";
const TENDRIL = "M0,0 c0,-14 14,-22 22,-14 c7,7 0,16 -7,12 c-5,-3 -2,-9 2,-7";

const LEAF = "M0,0 C6,-11 22,-15 40,0 C22,15 6,11 0,0 Z";
const LEAF_TOP = "M0,0 C6,-11 22,-15 40,0 Z";
const IVY =
  "M0,0 C4,-6 10,-9 14,-16 C18,-11 24,-12 30,-14 C27,-8 30,-3 38,0 C30,3 27,8 30,14 C24,12 18,11 14,16 C10,9 4,6 0,0 Z";
const IVY_TOP = "M0,0 C4,-6 10,-9 14,-16 C18,-11 24,-12 30,-14 C27,-8 30,-3 38,0 Z";

// [x, y, rotation, scale, palette, shape(0 leaf / 1 ivy)]
type L = [number, number, number, number, number, number];
const LEAVES: L[] = [
  // top vine
  [44, 52, -120, 0.9, 0, 0], [68, 52, -70, 1, 1, 1], [110, 52, -115, 0.85, 2, 0], [140, 48, -60, 1, 0, 0],
  [180, 40, -110, 0.9, 1, 1], [216, 41, -70, 1, 2, 0], [260, 44, -120, 0.85, 0, 0], [300, 54, -65, 0.95, 1, 1],
  [345, 60, -115, 0.85, 2, 0], [390, 62, -70, 1, 0, 0], [435, 58, -110, 0.9, 1, 1], [480, 50, -65, 1, 2, 0],
  [525, 40, -115, 0.9, 0, 0], [568, 41, -70, 1, 1, 1], [610, 46, -110, 0.85, 2, 0],
  // right edge
  [640, 58, -40, 1, 0, 1], [655, 95, -10, 0.9, 1, 0], [662, 140, 15, 0.9, 2, 1], [668, 196, 20, 0.95, 0, 0],
];
// [x, y, rotation, flipX]
const TENDRILS: [number, number, number, number][] = [
  [216, 41, 0, 1], [480, 50, 0, -1], [662, 140, 70, 1],
];
const BERRIES: [number, number][] = [[160, 44], [415, 60], [596, 44], [668, 168]];

/** Fern frond: leaflets along a quadratic curve, shrinking toward the tip. */
function fern(base: [number, number], ctrl: [number, number], tip: [number, number], maxLen: number) {
  const pt = (t: number) => [
    (1 - t) ** 2 * base[0] + 2 * (1 - t) * t * ctrl[0] + t * t * tip[0],
    (1 - t) ** 2 * base[1] + 2 * (1 - t) * t * ctrl[1] + t * t * tip[1],
  ];
  const tan = (t: number) => [
    2 * (1 - t) * (ctrl[0] - base[0]) + 2 * t * (tip[0] - ctrl[0]),
    2 * (1 - t) * (ctrl[1] - base[1]) + 2 * t * (tip[1] - ctrl[1]),
  ];
  const leaflets: { x: number; y: number; r: number; s: number }[] = [];
  for (let t = 0.1; t < 0.97; t += 0.075) {
    const [x, y] = pt(t);
    const [dx, dy] = tan(t);
    const a = (Math.atan2(dy, dx) * 180) / Math.PI;
    const len = maxLen * Math.pow(1 - t, 0.7) * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.6)));
    leaflets.push({ x, y, r: a - 62, s: len / 40 }, { x, y, r: a + 62, s: len / 40 });
  }
  return { stem: `M${base[0]},${base[1]} Q${ctrl[0]},${ctrl[1]} ${tip[0]},${tip[1]}`, leaflets };
}
const FERNS = [
  fern([150, 70], [120, 10], [62, -12], 30),
  fern([100, 70], [90, 25], [52, -6], 24),
  fern([600, 66], [640, 10], [712, 0], 28),
  fern([660, 120], [700, 90], [730, 50], 20),
];

/* ================================================================== */
/* 3D pieces (static)                                                  */
/* ================================================================== */
type VineCol = { dark: string; mid: string; light: string };

function Stem({ d, w, col }: { d: string; w: number; col: VineCol }) {
  const base = { d, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g>
      <path {...base} stroke={col.dark} strokeWidth={w} />
      <path {...base} stroke={col.mid} strokeWidth={w * 0.6} transform="translate(-0.6,-1)" />
      <path {...base} stroke={col.light} strokeWidth={Math.max(1, w * 0.2)} strokeOpacity={0.7} transform="translate(-1.1,-2)" />
      <path {...base} stroke={col.dark} strokeWidth={w * 1.02} strokeOpacity={0.4} strokeDasharray="1.5 12" strokeLinecap="butt" />
    </g>
  );
}

function Leaf({ x, y, r, s, v, shape, uid, pal }: { x: number; y: number; r: number; s: number; v: number; shape: number; uid: string; pal: Palette }) {
  const [light, , dark] = pal.leaves[v];
  const ivy = shape === 1;
  return (
    <g transform={`translate(${f(x)},${f(y)}) rotate(${f(r)}) scale(${f(s)})`}>
      <path d={ivy ? IVY : LEAF} fill={`url(#${uid}-leaf${v})`} />
      <path d={ivy ? IVY_TOP : LEAF_TOP} fill="#fff" opacity={0.13} />
      {ivy ? (
        <path d="M2,0 L35,0 M5,0 L14,-13 M5,0 L14,13 M16,0 L27,-10 M16,0 L27,10" stroke={light} strokeWidth={1.1} opacity={0.75} fill="none" />
      ) : (
        <>
          <path d="M1,0 Q20,-1.5 39,0" stroke={light} strokeWidth={1.3} fill="none" opacity={0.85} />
          <path d="M12,-1 L18,-7 M20,-1 L27,-7 M12,1 L18,6 M20,1 L27,6" stroke={dark} strokeWidth={0.8} opacity={0.6} fill="none" />
        </>
      )}
      <path d={ivy ? IVY : LEAF} fill="none" stroke={dark} strokeWidth={0.8} opacity={0.6} />
    </g>
  );
}

function Berries({ x, y, uid }: { x: number; y: number; uid: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {[[0, 0, 4.5], [6, 4, 3.6], [-4.5, 5, 4]].map(([bx, by, br], k) => (
        <g key={k}>
          <circle cx={bx} cy={by} r={br} fill={`url(#${uid}-berry)`} />
          <circle cx={bx - br * 0.35} cy={by - br * 0.4} r={br * 0.25} fill="#fff" opacity={0.8} />
        </g>
      ))}
    </g>
  );
}

/** Small leaf glyph used as a separator in the info row. */
function LeafDot({ color }: { color: string }) {
  return (
    <svg width={16} height={12} viewBox="0 0 40 24" style={{ margin: "0 12px", flexShrink: 0 }}>
      <path d="M0,12 C6,1 22,-3 40,12 C22,27 6,23 0,12 Z" fill={color} />
    </svg>
  );
}

/* ================================================================== */
/* Component                                                           */
/* ================================================================== */
export default function Lower({ tournament, round, match, totalMatches = 0 }: LowerProps) {
  const matchNumber = match?.matchNo ?? match?._matchNo ?? "N/A";
  const pal = usePalette(tournament.primaryColor, tournament.secondaryColor);
  const uid = "fl" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const nameText = tournament.tournamentName?.toUpperCase() ?? "";
  const numText = String(pad2(matchNumber));
  const totalText = String(pad2(totalMatches));
  const roundText = round?.roundName?.toUpperCase() ?? "";
  // day accepts "2", 2 or "Day 2"; 0 / empty hides the day and its separator
  const dayValue = String(round?.day ?? "").trim().replace(/^day\s*/i, "");
  const dayNum = Number(dayValue);
  const dayText = dayValue !== "" && (isNaN(dayNum) || dayNum > 0) ? `DAY ${dayValue.toUpperCase()}` : "";
  const mapText = match?.map?.toUpperCase() ?? "";

  const infoSize = fit(roundText + dayText + mapText, 24, 20);
  const shadow = "0 3px 0 rgba(0,0,0,.35), 0 0 16px rgba(0,0,0,.4)";
  const abs = (l: number, t: number, w: number, h: number): React.CSSProperties => ({ position: "absolute", left: l, top: t, width: w, height: h });

  return (
    <div style={{ position: "relative", width: "1920px", height: "1080px", fontFamily: "AGENCYB" }} className="font-[AGENCYB]">
      <div style={{ position: "absolute", left: -30, bottom: 30, width: BOX_W, height: BOX_H }}>
        {/* ===================== BACK: ferns + box ===================== */}
        <svg width={BOX_W} height={BOX_H} viewBox={`0 0 ${BOX_W} ${BOX_H}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <defs>
            <linearGradient id={`${uid}-logo`} x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0" stopColor={pal.logoTop} />
              <stop offset="1" stopColor={pal.logoBot} />
            </linearGradient>
            <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={pal.bodyTop} />
              <stop offset="1" stopColor={pal.bodyBot} />
            </linearGradient>
            <linearGradient id={`${uid}-row`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={pal.rowTop} />
              <stop offset="1" stopColor={pal.rowBot} />
            </linearGradient>
            <linearGradient id={`${uid}-strip`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={pal.stripA} />
              <stop offset="1" stopColor={pal.stripB} />
            </linearGradient>
            <linearGradient id={`${uid}-bevel`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity={0.28} />
              <stop offset="0.25" stopColor="#fff" stopOpacity={0.04} />
              <stop offset="0.75" stopColor="#000" stopOpacity={0} />
              <stop offset="1" stopColor="#000" stopOpacity={0.35} />
            </linearGradient>
            <radialGradient id={`${uid}-logoGlow`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor={pal.glow} stopOpacity={0.35} />
              <stop offset="1" stopColor={pal.glow} stopOpacity={0} />
            </radialGradient>
            {pal.leaves.map((c, v) => (
              <linearGradient key={v} id={`${uid}-leaf${v}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={c[0]} />
                <stop offset="0.45" stopColor={c[1]} />
                <stop offset="0.55" stopColor={c[2]} />
                <stop offset="1" stopColor={c[3]} />
              </linearGradient>
            ))}
            <linearGradient id={`${uid}-fern`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={pal.fern[0]} />
              <stop offset="0.5" stopColor={pal.fern[1]} />
              <stop offset="1" stopColor={pal.fern[3]} />
            </linearGradient>
            <radialGradient id={`${uid}-cap`} cx="0.4" cy="0.3" r="0.8">
              <stop offset="0" stopColor={pal.capHi} />
              <stop offset="0.45" stopColor={pal.s} />
              <stop offset="1" stopColor={pal.capDark} />
            </radialGradient>
            <radialGradient id={`${uid}-berry`} cx="0.35" cy="0.35" r="0.7">
              <stop offset="0" stopColor={pal.capHi} />
              <stop offset="0.4" stopColor={pal.s} />
              <stop offset="1" stopColor={pal.capDark} />
            </radialGradient>
            <radialGradient id={`${uid}-spore`}>
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.3" stopColor={pal.glow} stopOpacity={0.8} />
              <stop offset="1" stopColor={pal.glow} stopOpacity={0} />
            </radialGradient>
            <filter id={`${uid}-shadow`} x="-20%" y="-30%" width="140%" height="170%">
              <feDropShadow dx="2" dy="5" stdDeviation="3.5" floodColor="#000" floodOpacity="0.55" />
            </filter>
            <filter id={`${uid}-grain`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.3 0.012" numOctaves={3} seed={5} />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <clipPath id={`${uid}-logoClip`}><path d={LOGO_BLOCK} /></clipPath>
            <clipPath id={`${uid}-panelClip`}><path d={PANEL} /></clipPath>
          </defs>

          {/* ferns growing from behind the box */}
          <g filter={`url(#${uid}-shadow)`} opacity={0.95}>
            {FERNS.map((fr, i) => (
              <g key={i}>
                <path d={fr.stem} fill="none" stroke={pal.fern[3]} strokeWidth={3} strokeLinecap="round" />
                {fr.leaflets.map((l, k) => (
                  <g key={k} transform={`translate(${f(l.x)},${f(l.y)}) rotate(${f(l.r)}) scale(${f(l.s)})`}>
                    <path d={LEAF} fill={`url(#${uid}-fern)`} />
                    <path d="M1,0 Q20,-1 39,0" stroke={pal.fern[0]} strokeWidth={1.5} opacity={0.6} fill="none" />
                  </g>
                ))}
              </g>
            ))}
          </g>

          {/* box */}
          <g filter={`url(#${uid}-shadow)`}>
            <path d={PANEL} fill={`url(#${uid}-body)`} />
            <path d={LOGO_BLOCK} fill={`url(#${uid}-logo)`} />
          </g>
          {/* bark grain */}
          <rect width={BOX_W} height={BOX_H} filter={`url(#${uid}-grain)`} clipPath={`url(#${uid}-logoClip)`} opacity={0.3} style={{ mixBlendMode: "overlay" }} />
          <rect width={BOX_W} height={BOX_H} filter={`url(#${uid}-grain)`} clipPath={`url(#${uid}-panelClip)`} opacity={0.14} style={{ mixBlendMode: "overlay" }} />
          <ellipse cx={120} cy={155} rx={92} ry={86} fill={`url(#${uid}-logoGlow)`} />
          <path d={LOGO_BLOCK} fill={`url(#${uid}-bevel)`} />
          <path d="M30,70 H200 V240 H30" fill="none" stroke={pal.accent} strokeOpacity={0.35} strokeWidth={1.5} />

          <path d={ROW} fill={`url(#${uid}-row)`} />
          <path d="M210,200 H662.1" stroke={pal.accent} strokeOpacity={0.55} strokeWidth={1.5} />
          <path d={STRIP} fill={`url(#${uid}-strip)`} />
          <path d={PANEL} fill={`url(#${uid}-bevel)`} />
          <path d="M210,100 H646.3" stroke="#000" strokeOpacity={0.35} strokeWidth={2} />
          {/* accent seam between logo block and panel */}
          <path d="M210,60 V250" stroke={pal.accent} strokeWidth={4} />
          <path d="M208.5,60 V250" stroke="#fff" strokeOpacity={0.35} strokeWidth={1} />
        </svg>

        {/* ===================== TEXT + LOGO ===================== */}
        <div style={{ position: "absolute", inset: 0 }}>
          <div style={{ ...abs(50, 75, 140, 160), display: "flex", alignItems: "center", justifyContent: "center" }}>
            {tournament.torLogo && (
              <img src={tournament.torLogo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: "drop-shadow(0 4px 8px rgba(0,0,0,.6))" }} />
            )}
          </div>

          {/* tournament name strip */}
          <div style={{ ...abs(232, 60, 400, 40), display: "flex", alignItems: "center" }}>
            <span style={{ color: pal.stripInk, fontSize: fit(nameText, 24, 30), letterSpacing: "0.16em", whiteSpace: "nowrap", lineHeight: 1 }}>
              {nameText}
            </span>
          </div>

          {/* MATCH 03 / 05 */}
          <div style={{ ...abs(232, 100, 420, 100), display: "flex", alignItems: "baseline", whiteSpace: "nowrap", lineHeight: 1, paddingTop: 8 }}>
            <span style={{ color: "#fff", fontSize: 52, letterSpacing: "0.06em", textShadow: shadow }}>MATCH</span>
            <span style={{ color: "#fff", fontSize: fit(numText, 88, 3), marginLeft: 16, textShadow: shadow }}>{numText}</span>
            <span style={{ color: pal.accent, fontSize: 48, marginLeft: 8, textShadow: shadow }}>/{totalText}</span>
          </div>

          {/* info row: round · day · map */}
          <div style={{ ...abs(232, 200, 420, 50), display: "flex", alignItems: "center", whiteSpace: "nowrap", lineHeight: 1, fontSize: infoSize, letterSpacing: "0.1em", textShadow: "0 2px 4px rgba(0,0,0,.6)" }}>
            {roundText && <span style={{ color: "#fff" }}>{roundText}</span>}
            {dayText && (
              <>
                {roundText && <LeafDot color={pal.accent} />}
                <span style={{ color: pal.soft }}>{dayText}</span>
              </>
            )}
            {mapText && (
              <>
                {(roundText || dayText) && <LeafDot color={pal.accent} />}
                <span style={{ color: pal.soft, fontSize: infoSize * 0.75, marginRight: 8 }}>MAP</span>
                <span style={{ color: pal.accent }}>{mapText}</span>
              </>
            )}
          </div>
        </div>

        {/* ===================== FRONT: vines, leaves, mushrooms ===================== */}
        <svg width={BOX_W} height={BOX_H} viewBox={`0 0 ${BOX_W} ${BOX_H}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
          <g filter={`url(#${uid}-shadow)`}>
            <Stem d={VINE_TOP} w={11} col={pal.vines[0]} />
            {TENDRILS.map(([x, y, r, fx], i) => (
              <g key={i} transform={`translate(${x},${y}) rotate(${r}) scale(${fx},1)`}>
                <Stem d={TENDRIL} w={3} col={pal.vines[i % 3]} />
              </g>
            ))}
          </g>
          <g filter={`url(#${uid}-shadow)`}>
            {LEAVES.map(([x, y, r, s, v, shape], i) => (
              <Leaf key={i} x={x} y={y} r={r} s={s} v={v} shape={shape} uid={uid} pal={pal} />
            ))}
          </g>
          {BERRIES.map(([x, y], i) => (
            <Berries key={i} x={x} y={y} uid={uid} />
          ))}
          {/* glowing spores (static) */}
          {[[120, 28, 6], [380, 30, 5], [560, 18, 6], [700, 110, 5]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={`url(#${uid}-spore)`} />
          ))}
        </svg>
      </div>
    </div>
  );
}