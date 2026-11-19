// src/pages/lower/Lower.tsx
// NOTE: the own useParams-driven fetch (selected-match, the msgpack
// lowerData/:t/:r/:m endpoint, rounds/:id/matches) and its dashboard/
// cache.tsx localStorage cache have been removed. PublicThemeRenderer
// already does the one shared fetch — and now has its own global cache,
// see publicCache.ts — and passes `tournament`/`round`/`match`/
// `totalMatches` down as props for the 'Lower' view.
//
// "ENCHANTED GROVE" lower third — bottom-centre layout:
//   [ MATCH wing ]──( tree-ring medallion with logo )──[ MAP wing ]
//                         └─ hanging round-name plaque ─┘
// Vines coil in a double helix around each wing tip (passing in front of and
// behind it), weave in and out of the wing edges, wreath the medallion and
// hold up the plaque. Every colour derives from primaryColor / secondaryColor.
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
const FALLBACK_PRIMARY: RGB = [46, 125, 74];
const FALLBACK_SECONDARY: RGB = [201, 162, 74];
const BLACK: RGB = [8, 10, 6];
const WHITE: RGB = [255, 255, 255];
const BARK: RGB = [74, 50, 30];
const MOSS: RGB = [70, 92, 40];
const SAP: RGB = [176, 128, 78];

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
/** Darkens a colour just enough for white text to stay readable on it. */
const deepen = (c: RGB, max = 0.3): RGB => (lum(c) <= max ? c : mix(c, BLACK, 1 - max / lum(c)));

function usePalette(primary?: string, secondary?: string) {
  return useMemo(() => {
    const p = toRgb(primary, FALLBACK_PRIMARY);
    const s = toRgb(secondary, FALLBACK_SECONDARY);
    const m = mix(p, s, 0.5);
    const vine = (c: RGB) => {
      const b = mix(c, MOSS, 0.35);
      return { dark: css(mix(b, BLACK, 0.7)), mid: css(mix(b, BLACK, 0.28)), light: css(mix(c, WHITE, 0.55)) };
    };
    const leaf = (c: RGB) => [css(mix(c, WHITE, 0.42)), css(c), css(mix(c, BLACK, 0.45)), css(mix(c, BLACK, 0.68))];
    const woodOut = mix(mix(p, BARK, 0.55), BLACK, 0.25);
    return {
      p: css(p), s: css(s),
      pLight: css(mix(p, WHITE, 0.42)), sLight: css(mix(s, WHITE, 0.42)), mLight: css(mix(m, WHITE, 0.45)),
      vines: [vine(p), vine(s), vine(m)],
      leaves: [leaf(p), leaf(s), leaf(m)],
      wingL: [css(mix(deepen(p), BLACK, 0.6)), css(deepen(p))],
      wingR: [css(deepen(s)), css(mix(deepen(s), BLACK, 0.6))],
      labelL: css(mix(s, WHITE, 0.55)),
      labelR: css(mix(p, WHITE, 0.55)),
      barkIn: css(mix(mix(p, BARK, 0.6), BLACK, 0.35)),
      barkOut: css(mix(mix(p, BARK, 0.6), BLACK, 0.7)),
      barkLine: css(mix(mix(p, BARK, 0.6), BLACK, 0.85)),
      woodIn: css(mix(mix(s, SAP, 0.5), WHITE, 0.12)),
      woodOut: css(woodOut),
      ringLine: css(mix(woodOut, BLACK, 0.45)),
      ringBand: css(mix(woodOut, BLACK, 0.6)),
      arcText: css(mix(s, WHITE, 0.75)),
      discIn: css(mix(deepen(p, 0.25), BLACK, 0.2)),
      discOut: css(mix(p, BLACK, 0.88)),
      plateTop: css(mix(mix(s, BARK, 0.45), BLACK, 0.3)),
      plateBot: css(mix(mix(s, BARK, 0.45), BLACK, 0.7)),
      plateText: css(mix(s, WHITE, 0.7)),
      petalIn: css(mix(s, WHITE, 0.8)),
      petalOut: css(mix(s, BLACK, 0.25)),
      berryHi: css(mix(p, WHITE, 0.7)),
      berryDark: css(mix(p, BLACK, 0.55)),
      firefly: css(mix(s, WHITE, 0.65)),
    };
  }, [primary, secondary]);
}
type Palette = ReturnType<typeof usePalette>;

const fit = (text: string, base: number, maxChars: number) =>
  text.length > maxChars ? Math.max((base * maxChars) / text.length, base * 0.5) : base;
const pad2 = (v: number | string) => (typeof v === "number" ? String(v).padStart(2, "0") : v);

/* ================================================================== */
/* Geometry — local 1300 x 340 box, centred along the bottom           */
/* ================================================================== */
type Pt = [number, number];
const BOX_W = 1300;
const BOX_H = 340;
const CX = 650;
const CY = 150;
const R = 114; // medallion radius
const WING_TOP = 95;
const WING_BOT = 205;

const f = (n: number) => n.toFixed(1);
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const mirror = (p: Pt): Pt => [BOX_W - p[0], p[1]];

const WING_L = "M650,95 L215,95 C150,95 110,120 70,150 C110,180 150,205 215,205 L650,205 Z";
const WING_R = "M650,95 L1085,95 C1150,95 1190,120 1230,150 C1190,180 1150,205 1085,205 L650,205 Z";
const WING_L_INSET = "M650,103 L217,103 C158,103 122,126 88,150 C122,174 158,197 217,197 L650,197";
const WING_R_INSET = "M650,103 L1083,103 C1142,103 1178,126 1212,150 C1178,174 1142,197 1083,197 L650,197";
const PLAQUE = { x: 505, y: 278, w: 290, h: 44 };

const halfH = (x: number) => (x >= 215 ? 55 : 55 * Math.pow(Math.max(0, (x - 70) / 145), 0.6));
const sCurve = (a: Pt, b: Pt) => {
  const dx = (b[0] - a[0]) / 2;
  return `M${f(a[0])},${f(a[1])} C${f(a[0] + dx)},${f(a[1])} ${f(b[0] - dx)},${f(b[1])} ${f(b[0])},${f(b[1])}`;
};
function closedSmooth(pts: Pt[]) {
  const n = pts.length;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + " Z";
}
const ring = (r: number, wob: (t: number) => number, steps = 56) =>
  closedSmooth(
    Array.from({ length: steps }, (_, i) => {
      const t = (i / steps) * Math.PI * 2;
      const rr = r + wob(t);
      return [CX + rr * Math.cos(t), CY + rr * Math.sin(t)] as Pt;
    })
  );

type VSeg = { d: string; delay: number; strand: number; front: boolean };
type LeafSpec = { x: number; y: number; r: number; s: number; v: number; shape: number; delay: number };

/** One strand on the left wing: a helix around the tip, then a stitch that
 *  weaves in and out of the top (strand 0) or bottom (strand 1) edge. */
function buildStrand(strand: 0 | 1) {
  const segs: { a: Pt; b: Pt; front: boolean }[] = [];
  const tips: { p: Pt; up: boolean }[] = [];
  const hx = [92, 116, 140, 164, 188, 212, 236];
  const helix: Pt[] = hx.map((x, i) => {
    const top = (i % 2 === 0) === (strand === 0);
    const h = halfH(x) + 12;
    return [x, top ? CY - h : CY + h];
  });
  for (let i = 0; i < helix.length - 1; i++) {
    // descending crossings sit in front of the wing, ascending ones behind it
    segs.push({ a: helix[i], b: helix[i + 1], front: helix[i][1] < helix[i + 1][1] });
  }
  helix.forEach((p) => tips.push({ p, up: p[1] < CY }));

  const top = strand === 0;
  const outerY = top ? WING_TOP - 13 : WING_BOT + 13;
  const innerY = top ? WING_TOP + 12 : WING_BOT - 12;
  let prev = helix[helix.length - 1];
  for (let x = 236, k = 0; x + 54 <= 566; x += 54, k++) {
    const mid: Pt = [x + 27, innerY];
    const end: Pt = [x + 54, outerY];
    const front = (k + strand) % 2 === 0;
    segs.push({ a: prev, b: mid, front }, { a: mid, b: end, front });
    tips.push({ p: end, up: top });
    prev = end;
  }
  return { segs, tips };
}

function leafAt(p: Pt, up: boolean, i: number, out: LeafSpec[]) {
  const r = (up ? -100 : 100) + (rnd(i) - 0.5) * 60;
  const delay = 1.5 + (Math.abs(p[0] - CX) / 580) * 1.3;
  const v = Math.floor(rnd(i + 3) * 3);
  out.push({ x: p[0], y: p[1], r, s: 0.75 + rnd(i + 7) * 0.4, v, shape: rnd(i + 11) > 0.55 ? 1 : 0, delay });
  if (i % 2 === 0) {
    out.push({
      x: p[0], y: p[1],
      r: r + (up ? -55 : 55) * (rnd(i + 5) > 0.5 ? 1 : -1),
      s: 0.55 + rnd(i + 9) * 0.2, v: (v + 1) % 3, shape: 0, delay: delay + 0.1,
    });
  }
}

const GEO = (() => {
  const back: VSeg[] = [];
  const front: VSeg[] = [];
  const leaves: LeafSpec[] = [];
  let li = 0;
  ([0, 1] as const).forEach((strand) => {
    const { segs, tips } = buildStrand(strand);
    segs.forEach(({ a, b, front: isFront }) => {
      const dist = Math.abs((a[0] + b[0]) / 2 - CX);
      const delay = 1.0 + (dist / 580) * 1.3;
      const list = isFront ? front : back;
      list.push({ d: sCurve(a, b), delay, strand, front: isFront });
      list.push({ d: sCurve(mirror(b), mirror(a)), delay, strand, front: isFront });
    });
    tips.forEach(({ p, up }) => {
      const before = leaves.length;
      leafAt(p, up, li++, leaves);
      // mirror the leaves just added onto the right wing
      leaves.slice(before).forEach((l) => leaves.push({ ...l, x: BOX_W - l.x, r: 180 - l.r, v: (l.v + 1) % 3 }));
    });
  });

  // wreath + its leaves
  const wreath = ring(121, (t) => 4 * Math.sin(6 * t));
  const wreathAngles = [-155, -128, -104, -76, -52, -26, 24, 48, 74, 106, 132, 156];
  wreathAngles.forEach((deg, i) => {
    const t = (deg * Math.PI) / 180;
    leaves.push({
      x: CX + 122 * Math.cos(t), y: CY + 122 * Math.sin(t),
      r: deg + (i % 2 ? 38 : -38), s: 0.7 + rnd(i + 40) * 0.25,
      v: i % 3, shape: i % 3 === 0 ? 1 : 0, delay: 1.2 + i * 0.04,
    });
  });
  // hanger leaves
  leaves.push({ x: 524, y: 238, r: 170, s: 0.6, v: 1, shape: 1, delay: 1.5 });
  leaves.push({ x: 776, y: 238, r: 10, s: 0.6, v: 0, shape: 1, delay: 1.5 });

  const rings = [79, 84, 88.5, 93, 97].map((r, i) =>
    ring(r, (t) => 1.1 * Math.sin(3 * t + i) + 0.7 * Math.sin(7 * t + i * 2))
  );
  const barkLines = Array.from({ length: 90 }, (_, i) => {
    const a = ((i * 4 + rnd(i + 90) * 3) * Math.PI) / 180;
    const r1 = 101.5;
    const r2 = R - rnd(i + 200) * 4;
    return { d: `M${f(CX + r1 * Math.cos(a))},${f(CY + r1 * Math.sin(a))} L${f(CX + r2 * Math.cos(a))},${f(CY + r2 * Math.sin(a))}`, light: i % 3 === 0 };
  });
  const flowers: { x: number; y: number; s: number }[] = [
    ...[-90, -38, -142, 62, 118].map((deg, i) => {
      const t = (deg * Math.PI) / 180;
      return { x: CX + 124 * Math.cos(t), y: CY + 124 * Math.sin(t), s: i === 0 ? 1.15 : 0.85 };
    }),
    { x: 512, y: 284, s: 0.8 },
    { x: 788, y: 284, s: 0.8 },
  ];
  const berries: Pt[] = [[150, 214], [1150, 86], [318, 82], [982, 218]];
  const fireflies = Array.from({ length: 14 }, (_, i) => ({
    x: 80 + rnd(i + 300) * 1140,
    y: 220 + rnd(i + 400) * 100,
    dur: 6 + rnd(i + 500) * 4,
    delay: rnd(i + 600) * 8,
  }));
  return { back, front, leaves, wreath, rings, barkLines, flowers, berries, fireflies };
})();

const HANGER_L = "M528,207 C516,234 550,250 536,282";
const HANGER_R = "M772,207 C784,234 750,250 764,282";
const LEAF = "M0,0 C6,-11 22,-15 40,0 C22,15 6,11 0,0 Z";
const LEAF_TOP = "M0,0 C6,-11 22,-15 40,0 Z";
const IVY =
  "M0,0 C4,-6 10,-9 14,-16 C18,-11 24,-12 30,-14 C27,-8 30,-3 38,0 C30,3 27,8 30,14 C24,12 18,11 14,16 C10,9 4,6 0,0 Z";
const IVY_TOP = "M0,0 C4,-6 10,-9 14,-16 C18,-11 24,-12 30,-14 C27,-8 30,-3 38,0 Z";

const CSS = `
.fl-medal{transform-box:fill-box;transform-origin:50% 50%;animation:fl-medal .85s cubic-bezier(.3,1.45,.5,1) both}
@keyframes fl-medal{from{transform:scale(0) rotate(-120deg);opacity:0}to{transform:none;opacity:1}}
.fl-wingL{transform-box:fill-box;transform-origin:100% 50%;animation:fl-wing .7s cubic-bezier(.2,.8,.2,1) .35s both}
.fl-wingR{transform-box:fill-box;transform-origin:0% 50%;animation:fl-wing .7s cubic-bezier(.2,.8,.2,1) .35s both}
@keyframes fl-wing{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.fl-plaque{animation:fl-plaque .75s cubic-bezier(.3,1.4,.5,1) 1.1s both}
@keyframes fl-plaque{from{opacity:0;transform:translateY(-40px)}to{opacity:1;transform:none}}
.fl-text{opacity:0;animation:fl-fade .6s ease-out 1s forwards}
.fl-fade{opacity:0;animation:fl-fade .7s ease-out forwards}
@keyframes fl-fade{to{opacity:1}}
.fl-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:fl-draw .45s linear forwards}
@keyframes fl-draw{to{stroke-dashoffset:0}}
.fl-pop{transform-box:fill-box;transform-origin:0% 50%;transform:scale(0);animation:fl-pop .55s cubic-bezier(.3,1.6,.5,1) forwards}
@keyframes fl-pop{to{transform:scale(1)}}
.fl-bloom{transform-box:fill-box;transform-origin:50% 50%;transform:scale(0) rotate(-90deg);animation:fl-bloom .8s cubic-bezier(.3,1.5,.5,1) forwards}
@keyframes fl-bloom{to{transform:none}}
.fl-sway{transform-box:fill-box;transform-origin:0% 50%;animation:fl-sway 4s ease-in-out infinite alternate}
@keyframes fl-sway{from{transform:rotate(-6deg)}to{transform:rotate(7deg)}}
.fl-spin{transform-box:view-box;transform-origin:${CX}px ${CY}px;animation:fl-spin 14s linear infinite}
@keyframes fl-spin{to{transform:rotate(360deg)}}
.fl-rise{animation:fl-rise 7s ease-in-out infinite}
@keyframes fl-rise{0%{transform:translate(0,0);opacity:0}15%{opacity:1}100%{transform:translate(14px,-150px);opacity:0}}
.fl-shimmer{animation:fl-shimmer 7s ease-in-out infinite}
@keyframes fl-shimmer{0%{transform:translateX(0)}55%,100%{transform:translateX(1500px)}}
`;

/* ================================================================== */
/* 3D building blocks                                                  */
/* ================================================================== */
type VineCol = { dark: string; mid: string; light: string };

/** Round, lit stem: shadow core → body → specular streak → bark rings. */
function Stem({ d, w, delay, col, dur }: { d: string; w: number; delay: number; col: VineCol; dur?: number }) {
  const base = { d, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const st: React.CSSProperties = { animationDelay: `${delay}s`, ...(dur ? { animationDuration: `${dur}s` } : {}) };
  return (
    <g>
      <path {...base} stroke={col.dark} strokeWidth={w} pathLength={1} className="fl-draw" style={st} />
      <path {...base} stroke={col.mid} strokeWidth={w * 0.6} transform="translate(-0.6,-1)" pathLength={1} className="fl-draw" style={st} />
      <path {...base} stroke={col.light} strokeWidth={Math.max(1, w * 0.2)} strokeOpacity={0.7} transform="translate(-1.1,-2)" pathLength={1} className="fl-draw" style={st} />
      <path {...base} stroke={col.dark} strokeWidth={w * 1.02} strokeOpacity={0.4} strokeDasharray="1.5 12" strokeLinecap="butt" className="fl-fade" style={{ animationDelay: `${delay + (dur ?? 0.45)}s` }} />
    </g>
  );
}

function Leaf({ l, i, uid, pal }: { l: LeafSpec; i: number; uid: string; pal: Palette }) {
  const [light, , dark] = pal.leaves[l.v];
  const ivy = l.shape === 1;
  return (
    <g transform={`translate(${f(l.x)},${f(l.y)}) rotate(${f(l.r)}) scale(${f(l.s)})`}>
      <g className="fl-pop" style={{ animationDelay: `${l.delay}s` }}>
        <g className="fl-sway" style={{ animationDuration: `${3.2 + (i % 5) * 0.7}s`, animationDelay: `${-(i % 7) * 0.6}s` }}>
          <path d={ivy ? IVY : LEAF} fill={`url(#${uid}-leaf${l.v})`} />
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
      </g>
    </g>
  );
}

function Flower({ x, y, s, i, uid, pal }: { x: number; y: number; s: number; i: number; uid: string; pal: Palette }) {
  return (
    <g transform={`translate(${f(x)},${f(y)}) scale(${s}) rotate(${i * 23})`}>
      <g className="fl-bloom" style={{ animationDelay: `${1.9 + i * 0.12}s` }}>
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx={0} cy={-7} rx={5.2} ry={8} transform={`rotate(${a})`} fill={`url(#${uid}-petal)`} stroke={pal.petalOut} strokeWidth={0.6} strokeOpacity={0.6} />
        ))}
        <circle r={4} fill={`url(#${uid}-berry)`} />
        <circle cx={-1.2} cy={-1.4} r={1.1} fill="#fff" opacity={0.85} />
      </g>
    </g>
  );
}

function Berries({ x, y, i, uid }: { x: number; y: number; i: number; uid: string }) {
  return (
    <g transform={`translate(${x},${y})`} className="fl-fade" style={{ animationDelay: `${2 + i * 0.15}s` }}>
      {[[0, 0, 5], [7, 4, 4], [-5, 6, 4.5]].map(([bx, by, br], k) => (
        <g key={k}>
          <circle cx={bx} cy={by} r={br} fill={`url(#${uid}-berry)`} />
          <circle cx={bx - br * 0.35} cy={by - br * 0.4} r={br * 0.25} fill="#fff" opacity={0.8} />
        </g>
      ))}
    </g>
  );
}

function Stop({ offset, a, b, dur }: { offset: string; a: string; b: string; dur: number }) {
  return (
    <stop offset={offset} stopColor={a}>
      <animate attributeName="stop-color" values={`${a};${b};${a}`} dur={`${dur}s`} repeatCount="indefinite" />
    </stop>
  );
}

/* ================================================================== */
/* Component                                                           */
/* ================================================================== */
export default function Lower({ tournament, round, match, totalMatches = 0 }: LowerProps) {
  const matchNumber = match?.matchNo ?? match?._matchNo ?? "N/A";
  const pal = usePalette(tournament.primaryColor, tournament.secondaryColor);
  const uid = "fl" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const numText = String(pad2(matchNumber));
  const totalText = String(pad2(totalMatches));
  const mapText = match?.map?.toUpperCase() || "—";
  const roundText = round?.roundName?.toUpperCase() ?? "";
  const dayText = round?.day?.toUpperCase() ?? "";
  const nameText = tournament.tournamentName?.toUpperCase() ?? "";

  const shadow = "0 3px 0 rgba(0,0,0,.35), 0 0 18px rgba(0,0,0,.45)";
  const leafAnim: [string, string, string, string][] = [
    [pal.leaves[0][0], pal.mLight, pal.leaves[0][1], pal.leaves[2][1]],
    [pal.leaves[1][0], pal.mLight, pal.leaves[1][1], pal.leaves[2][1]],
    [pal.pLight, pal.sLight, pal.p, pal.s],
  ];

  return (
    <div style={{ position: "relative", width: "1920px", height: "1080px" }} className="font-[AGENCYB]">
      <style>{CSS}</style>

      <div style={{ position: "absolute", left: (1920 - BOX_W) / 2, bottom: 18, width: BOX_W, height: BOX_H }}>
        {/* ===================== BACK LAYER ===================== */}
        <svg width={BOX_W} height={BOX_H} viewBox={`0 0 ${BOX_W} ${BOX_H}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <defs>
            <linearGradient id={`${uid}-wingL`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={pal.wingL[0]} />
              <stop offset="1" stopColor={pal.wingL[1]} />
            </linearGradient>
            <linearGradient id={`${uid}-wingR`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={pal.wingR[0]} />
              <stop offset="1" stopColor={pal.wingR[1]} />
            </linearGradient>
            <linearGradient id={`${uid}-bevel`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity={0.3} />
              <stop offset="0.18" stopColor="#fff" stopOpacity={0.06} />
              <stop offset="0.7" stopColor="#000" stopOpacity={0} />
              <stop offset="1" stopColor="#000" stopOpacity={0.45} />
            </linearGradient>
            <linearGradient id={`${uid}-shimmer`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity={0} />
              <stop offset="0.5" stopColor="#fff" stopOpacity={0.35} />
              <stop offset="1" stopColor="#fff" stopOpacity={0} />
            </linearGradient>
            <radialGradient id={`${uid}-bark`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.85" stopColor={pal.barkIn} />
              <stop offset="1" stopColor={pal.barkOut} />
            </radialGradient>
            <radialGradient id={`${uid}-wood`} cx="0.45" cy="0.42" r="0.6">
              <stop offset="0" stopColor={pal.woodIn} />
              <stop offset="1" stopColor={pal.woodOut} />
            </radialGradient>
            <radialGradient id={`${uid}-disc`} cx="0.5" cy="0.45" r="0.55">
              <stop offset="0" stopColor={pal.discIn} />
              <stop offset="1" stopColor={pal.discOut} />
            </radialGradient>
            <linearGradient id={`${uid}-dome`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity={0.22} />
              <stop offset="0.5" stopColor="#fff" stopOpacity={0} />
              <stop offset="1" stopColor="#000" stopOpacity={0.35} />
            </linearGradient>
            <linearGradient id={`${uid}-plaque`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={pal.plateTop} />
              <stop offset="1" stopColor={pal.plateBot} />
            </linearGradient>
            {leafAnim.map(([l1, l2, b1, b2], v) => (
              <linearGradient key={v} id={`${uid}-leaf${v}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" a={l1} b={l2} dur={9 + v * 2} />
                <Stop offset="0.45" a={b1} b={b2} dur={9 + v * 2} />
                <stop offset="0.55" stopColor={pal.leaves[v][2]} />
                <stop offset="1" stopColor={pal.leaves[v][3]} />
              </linearGradient>
            ))}
            <radialGradient id={`${uid}-petal`} cx="0.5" cy="0.9" r="0.9">
              <stop offset="0" stopColor={pal.petalIn} />
              <Stop offset="0.65" a={pal.s} b={pal.p} dur={8} />
              <stop offset="1" stopColor={pal.petalOut} />
            </radialGradient>
            <radialGradient id={`${uid}-berry`} cx="0.35" cy="0.35" r="0.7">
              <stop offset="0" stopColor={pal.berryHi} />
              <stop offset="0.4" stopColor={pal.p} />
              <stop offset="1" stopColor={pal.berryDark} />
            </radialGradient>
            <radialGradient id={`${uid}-fly`}>
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.25" stopColor={pal.firefly} />
              <stop offset="1" stopColor={pal.firefly} stopOpacity={0} />
            </radialGradient>

            <filter id={`${uid}-shadow`} x="-20%" y="-30%" width="140%" height="170%">
              <feDropShadow dx="2" dy="5" stdDeviation="3.5" floodColor="#000" floodOpacity="0.55" />
            </filter>
            <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="28" />
            </filter>
            <filter id={`${uid}-grain`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.01 0.3" numOctaves={3} seed={11} />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <clipPath id={`${uid}-wings`}><path d={WING_L} /><path d={WING_R} /></clipPath>
            <path id={`${uid}-arcTop`} d={`M${CX - 81},${CY} A81,81 0 0 1 ${CX + 81},${CY}`} />
            <path id={`${uid}-arcBot`} d={`M${CX - 93},${CY} A93,93 0 0 0 ${CX + 93},${CY}`} />
          </defs>

          {/* aura that drifts between the two tournament colours */}
          <ellipse cx={CX} cy={170} rx={620} ry={140} fill={pal.p} opacity={0.32} filter={`url(#${uid}-blur)`}>
            <animate attributeName="fill" values={`${pal.p};${pal.s};${pal.p}`} dur="10s" repeatCount="indefinite" />
          </ellipse>

          {/* vine sections that pass BEHIND the wings */}
          <g filter={`url(#${uid}-shadow)`}>
            {GEO.back.map((s, i) => (
              <Stem key={i} d={s.d} w={s.strand ? 7 : 9} delay={s.delay} col={pal.vines[s.strand]} />
            ))}
          </g>

          {/* wings */}
          <g filter={`url(#${uid}-shadow)`}>
            <g className="fl-wingL">
              <path d={WING_L} fill={`url(#${uid}-wingL)`} />
              <path d={WING_L} fill={`url(#${uid}-bevel)`} />
              <path d={WING_L_INSET} fill="none" stroke={pal.labelL} strokeOpacity={0.35} strokeWidth={1.5} />
            </g>
            <g className="fl-wingR">
              <path d={WING_R} fill={`url(#${uid}-wingR)`} />
              <path d={WING_R} fill={`url(#${uid}-bevel)`} />
              <path d={WING_R_INSET} fill="none" stroke={pal.labelR} strokeOpacity={0.35} strokeWidth={1.5} />
            </g>
          </g>
          <g clipPath={`url(#${uid}-wings)`} className="fl-fade" style={{ animationDelay: "1s" }}>
            <rect width={BOX_W} height={BOX_H} filter={`url(#${uid}-grain)`} opacity={0.3} style={{ mixBlendMode: "overlay" }} />
            <polygon className="fl-shimmer" points="-200,95 -110,95 -150,205 -240,205" fill={`url(#${uid}-shimmer)`} />
          </g>

          {/* hanging plaque (round name) */}
          <g className="fl-plaque" filter={`url(#${uid}-shadow)`}>
            <rect x={PLAQUE.x} y={PLAQUE.y} width={PLAQUE.w} height={PLAQUE.h} rx={22} fill={`url(#${uid}-plaque)`} />
            <rect x={PLAQUE.x} y={PLAQUE.y} width={PLAQUE.w} height={PLAQUE.h} rx={22} fill={`url(#${uid}-bevel)`} />
            <rect x={PLAQUE.x + 6} y={PLAQUE.y + 5} width={PLAQUE.w - 12} height={PLAQUE.h - 10} rx={17} fill="none" stroke={pal.plateText} strokeOpacity={0.3} />
          </g>

          {/* tree-ring medallion */}
          <g className="fl-medal" filter={`url(#${uid}-shadow)`}>
            <circle cx={CX} cy={CY} r={R} fill={`url(#${uid}-bark)`} />
            {GEO.barkLines.map((b, i) => (
              <path key={i} d={b.d} stroke={b.light ? "#fff" : pal.barkLine} strokeOpacity={b.light ? 0.12 : 0.6} strokeWidth={b.light ? 1 : 1.6} />
            ))}
            <circle cx={CX} cy={CY} r={101} fill={`url(#${uid}-wood)`} />
            {GEO.rings.map((d, i) => (
              <path key={i} d={d} fill="none" stroke={pal.ringLine} strokeOpacity={0.45} strokeWidth={i % 2 ? 1 : 1.6} />
            ))}
            <circle cx={CX} cy={CY} r={87.5} fill="none" stroke={pal.ringBand} strokeOpacity={0.4} strokeWidth={27} />
            <circle cx={CX} cy={CY} r={74} fill={`url(#${uid}-disc)`} />
            <circle cx={CX} cy={CY} r={72} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={4} />
            <circle cx={CX} cy={CY} r={75} fill="none" stroke={pal.arcText} strokeOpacity={0.4} strokeWidth={1.2} />
            <circle cx={CX} cy={CY} r={R} fill={`url(#${uid}-dome)`} />
            <g className="fl-spin">
              <path d={`M${CX - 95},${CY - 59} A112,112 0 0 1 ${CX + 20},${CY - 110}`} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={3} strokeLinecap="round" />
            </g>
            <text fontFamily="AGENCYB" fontSize={fit(nameText, 17, 26)} letterSpacing={2} fill={pal.arcText} stroke={pal.discOut} strokeWidth={3} style={{ paintOrder: "stroke" }}>
              <textPath href={`#${uid}-arcTop`} startOffset="50%" textAnchor="middle">{nameText}</textPath>
            </text>
            {dayText && (
              <text fontFamily="AGENCYB" fontSize={15} letterSpacing={3} fill={pal.arcText} stroke={pal.discOut} strokeWidth={3} style={{ paintOrder: "stroke" }}>
                <textPath href={`#${uid}-arcBot`} startOffset="50%" textAnchor="middle">{dayText}</textPath>
              </text>
            )}
          </g>
        </svg>

        {/* ===================== TEXT + LOGO ===================== */}
        <div style={{ position: "absolute", inset: 0 }}>
          {/* MATCH wing — right-aligned toward the medallion */}
          <div className="flex items-center justify-end gap-4 fl-text" style={{ position: "absolute", left: 230, top: 95, width: 282, height: 110 }}>
            <div className="flex flex-col items-end leading-none">
              <span style={{ fontSize: 22, letterSpacing: "0.32em", color: pal.labelL, textShadow: shadow }}>MATCH</span>
              <span className="text-white" style={{ fontSize: 26, letterSpacing: "0.12em", marginTop: 6, opacity: 0.85, textShadow: shadow }}>
                OF {totalText}
              </span>
            </div>
            <span className="leading-none text-white" style={{ fontSize: fit(numText, 104, 3), textShadow: shadow }}>{numText}</span>
          </div>

          {/* MAP wing — left-aligned away from the medallion */}
          <div className="flex flex-col items-start justify-center leading-none fl-text" style={{ position: "absolute", left: 788, top: 95, width: 282, height: 110 }}>
            <span style={{ fontSize: 22, letterSpacing: "0.32em", color: pal.labelR, textShadow: shadow }}>MAP</span>
            <span className="text-white whitespace-nowrap" style={{ fontSize: fit(mapText, 68, 8), marginTop: 6, textShadow: shadow }}>{mapText}</span>
          </div>

          {/* logo in the heart of the tree */}
          <div className="flex items-center justify-center fl-medal" style={{ position: "absolute", left: CX - 58, top: CY - 58, width: 116, height: 116 }}>
            {tournament.torLogo && (
              <img src={tournament.torLogo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: "drop-shadow(0 4px 8px rgba(0,0,0,.7))" }} />
            )}
          </div>

          {/* round name on the hanging plaque */}
          <div className="flex items-center justify-center fl-plaque" style={{ position: "absolute", left: PLAQUE.x, top: PLAQUE.y, width: PLAQUE.w, height: PLAQUE.h }}>
            <span className="whitespace-nowrap" style={{ fontSize: fit(roundText, 28, 18), letterSpacing: "0.14em", color: pal.plateText, textShadow: "0 2px 4px rgba(0,0,0,.6)" }}>
              {roundText}
            </span>
          </div>
        </div>

        {/* ===================== FRONT LAYER ===================== */}
        <svg width={BOX_W} height={BOX_H} viewBox={`0 0 ${BOX_W} ${BOX_H}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
          {/* vine sections that pass IN FRONT of the wings, wreath and plaque hangers */}
          <g filter={`url(#${uid}-shadow)`}>
            {GEO.front.map((s, i) => (
              <Stem key={i} d={s.d} w={s.strand ? 7 : 9} delay={s.delay} col={pal.vines[s.strand]} />
            ))}
            <Stem d={GEO.wreath} w={8} delay={0.9} dur={1.6} col={pal.vines[2]} />
            <Stem d={HANGER_L} w={6} delay={1.1} dur={0.6} col={pal.vines[0]} />
            <Stem d={HANGER_R} w={6} delay={1.1} dur={0.6} col={pal.vines[1]} />
          </g>

          <g filter={`url(#${uid}-shadow)`}>
            {GEO.leaves.map((l, i) => (
              <Leaf key={i} l={l} i={i} uid={uid} pal={pal} />
            ))}
          </g>

          {GEO.berries.map(([x, y], i) => (
            <Berries key={i} x={x} y={y} i={i} uid={uid} />
          ))}
          <g filter={`url(#${uid}-shadow)`}>
            {GEO.flowers.map((fl, i) => (
              <Flower key={i} {...fl} i={i} uid={uid} pal={pal} />
            ))}
          </g>

          {GEO.fireflies.map((ff, i) => (
            <g key={i} transform={`translate(${f(ff.x)},${f(ff.y)})`}>
              <g className="fl-rise" style={{ animationDuration: `${ff.dur}s`, animationDelay: `${-ff.delay}s` }}>
                <circle r={8} fill={`url(#${uid}-fly)`} />
                <circle r={1.6} fill="#fff" />
              </g>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}