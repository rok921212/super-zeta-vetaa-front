import React, { useEffect, useState, useRef, useCallback, useId, useMemo, createContext, useContext } from 'react';
import { MatchData, Player } from '../../shared/hooks/unsortteams';
import { useKillMilestones, MilestoneType } from '../../shared/hooks/killMilestones';
import StolenFromStrip from '../../shared/overlays/StolenFromStrip';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// freshly-merged `matchData` down as a prop. Milestone DETECTION (first
// blood, kill streaks, grenade / vehicle / damage / airdrop) is the shared
// useKillMilestones hook — this file only maps the milestone type to its
// label + icon and renders its own card.
//
// FOREST milestone card — portrait (340 × 470), left side of the screen:
//   ┌ framed scene: canopy glow in the theme colours, light shafts, pine
//   │ silhouettes, a faint milestone mark, the player photo standing in it
//   ├ name plate across the photo's feet: team logo on the white notched
//   │ plate, player name, team tag
//   └ milestone badge: a white leaf-ended pill with the icon in a ring disc
//   The frame is a bevelled secondary-colour border with rounded corners.
//
// Motion — three steps in, three steps out; every wipe GROWS upward
// (bottom → top) behind a fringe of leaves, and closes downward:
//   1) the grove: dark plate with the tournament logo
//   2) the canopy: theme-colour panel
//   3) the card — photo rises, plate / badge settle
//   +) once the card has landed, a 3D VINE GROWS from the bottom-right
//      corner up the right side and across the top, over the player,
//      weaving in front of and behind the frame; leaves unfurl as it passes
//      and a crown of leaves and flowers blooms at the top centre.
//      The card is flush with the left edge of the screen: no vines there.
// Exit: vines retract first, then the three wipes close in reverse.
//
// PREVIEW: a "Preview milestone" button sits just OUTSIDE the 1920×1080
// canvas (x ≥ 1940). Each click shows the next milestone type with dummy
// data, so every icon/label can be checked in place. Works without match data.

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
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
}

interface DomProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

type Shown = {
  key: number;
  type: MilestoneType;
  playerName: string;
  picUrl?: string;
  teamTag: string;
  teamLogo?: string;
  teamFlag?: string;
  demo?: boolean;
};

const DISPLAY_MS = 6000; // time fully on screen (after the intro)
const WIPE_MS = 650; // each wipe (slow, deliberate)
// intro timeline (ms from trigger)
const T_LOGO = 40; //   1) grove + tournament logo
const T_THEME = 1250; // 2) canopy (theme colour)
const T_CARD = 1900; //  3) the milestone card
const T_VINES = T_CARD + WIPE_MS; // vines start growing once the card has landed
// outro offsets (ms after the vines start to retract)
const O_CARD = 650; //   card closes
const O_THEME = O_CARD + 600; // canopy closes
const O_LOGO = O_CARD + 1450; // grove closes (logo holds for a beat first)
const O_DONE = O_LOGO + WIPE_MS + 80;

// This theme's label for each shared milestone type.
const LABELS: Record<MilestoneType, string> = {
  firstBlood: 'FIRST BLOOD',
  streak3: 'DOMINATION',
  streak5: 'RAMPAGE',
  streak8: 'UNSTOPPABLE',
  grenadeKill: 'GRENADE KILL',
  vehicleKill: 'VEHICLE KILL',
  damage: '500+ DAMAGE',
  airdrop: 'AIRDROP LOOTED',
  distanceKill: '300m KILL',
  killSteal: 'KILL STOLEN',
};

/* ── type ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const CARD_LEFT = 0; // attached flush to the left edge of the screen
const CARD_TOP = 300;
const CARD_W = 340;
const PHOTO_H = 362; // framed scene (the plate overlaps its foot)
const PLATE_H = 54;
const BADGE_H = 108;
const CARD_H = PHOTO_H + BADGE_H; // 470
const RADIUS = 18; // right-hand corners only — the left side is flush
const CARD_RADIUS = `0 ${RADIUS}px ${RADIUS}px 0`;
const BORDER = 6;
const VINE_PAD = 44; // vine layers extend this far around the card

/** White logo plate — traced from Layer_2.png, same as Live Stats / Alerts. */
const PLATE_CUT =
  'polygon(4% 0%, 82.9% 0%, 99.7% 77.7%, 82.6% 53.1%, 92.8% 100%, 10.2% 96%, 0.3% 46.9%, 18.2% 74.1%)';

/* ── colour ── */
type RGB = [number, number, number];
const BLACK: RGB = [8, 10, 6];
const WHITE_RGB: RGB = [255, 255, 255];
const MOSS: RGB = [62, 88, 36];

function toRgb(hex: string): RGB {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const deepen = (c: RGB, max = 0.2): RGB => (lum(c) <= max ? c : mix(c, BLACK, 1 - max / lum(c)));

function inkOn(hex: string): string {
  const L = toRgb(hex)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  return L > 0.45 ? INK : WHITE;
}

function forestPalette(primary: string, secondary: string) {
  const p = toRgb(primary);
  const s = toRgb(secondary);
  const dp = deepen(p);
  const vineBase = mix(mix(p, s, 0.5), MOSS, 0.5);
  const leaf = (c: RGB): [string, string, string] => [css(mix(c, WHITE_RGB, 0.42)), css(c), css(mix(c, BLACK, 0.55))];
  return {
    primary,
    secondary,
    onPrimary: inkOn(primary),
    // scene: sunlit canopy (secondary glow) → theme colour → near black
    sceneGlow: rgba(mix(s, WHITE_RGB, 0.35), 0.85),
    sceneMid: css(mix(p, BLACK, 0.15)),
    sceneDeep: css(mix(dp, BLACK, 0.82)),
    pineBack: css(mix(dp, BLACK, 0.62)),
    pineFront: css(mix(dp, BLACK, 0.84)),
    // frame: bevelled secondary
    frame: [css(mix(s, WHITE_RGB, 0.35)), secondary, css(mix(s, BLACK, 0.45))],
    base: [css(mix(dp, BLACK, 0.55)), css(mix(dp, BLACK, 0.85))],
    grove: [css(mix(dp, BLACK, 0.72)), css(mix(dp, BLACK, 0.92))],
    canopy: [css(mix(p, WHITE_RGB, 0.12)), primary, css(mix(p, BLACK, 0.55))],
    label: lum(s) < 0.35 ? css(mix(s, WHITE_RGB, 0.45)) : secondary,
    disc: [css(mix(p, WHITE_RGB, 0.25)), primary, css(mix(p, BLACK, 0.45))],
    leafP: leaf(mix(p, MOSS, 0.15)),
    leafS: leaf(mix(s, MOSS, 0.15)),
    leafM: leaf(mix(mix(p, s, 0.5), MOSS, 0.4)),
    petal: [css(mix(s, WHITE_RGB, 0.7)), secondary],
    vineA: { dark: css(mix(vineBase, BLACK, 0.72)), mid: css(mix(vineBase, BLACK, 0.12)), light: css(mix(s, WHITE_RGB, 0.6)) },
    vineB: { dark: css(mix(mix(vineBase, p, 0.3), BLACK, 0.75)), mid: css(mix(mix(vineBase, p, 0.3), BLACK, 0.22)), light: css(mix(p, WHITE_RGB, 0.6)) },
  };
}
type ForestPalette = ReturnType<typeof forestPalette>;
type VineCol = ForestPalette['vineA'];
type Tone = 'P' | 'S' | 'M';
const ForestCtx = createContext<{ pal: ForestPalette; gid: string }>({ pal: forestPalette('#2E7D4A', '#C9A24A'), gid: 'fd' });

const GRAIN =
  'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 4px), ' +
  'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 11px)';

/* ─────────────────────────────────────────────
   Milestone icons — flat, 24×24, drawn in currentColor
   ───────────────────────────────────────────── */
const Chevrons = ({ n }: { n: number }) => (
  <g>
    {Array.from({ length: n }).map((_, i) => {
      const y = 15 - i * 5 + (n - 1) * 2.5;
      return <path key={i} d={`M4 ${y + 4} L12 ${y - 2} L20 ${y + 4} L20 ${y + 7.5} L12 ${y + 1.5} L4 ${y + 7.5} Z`} />;
    })}
  </g>
);

const ICONS: Record<MilestoneType, React.ReactNode> = {
  firstBlood: (
    <g>
      <path d="M12 2 C12 2 4.5 10.5 4.5 15 A7.5 7.5 0 0 0 19.5 15 C19.5 10.5 12 2 12 2 Z" />
      <path d="M9 14.5 A3.2 3.2 0 0 0 11 18" fill="none" stroke={INK} strokeOpacity={0.35} strokeWidth={1.6} strokeLinecap="round" />
    </g>
  ),
  streak3: <Chevrons n={1} />,
  streak5: <Chevrons n={2} />,
  streak8: <Chevrons n={3} />,
  grenadeKill: (
    <g>
      <rect x="9" y="4.5" width="6" height="4" />
      <path d="M15 5 L19 3 L20 5 L15.5 7.5 Z" />
      <circle cx="7.5" cy="5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8 C7.2 8 5 11.5 5 15 C5 19 8.2 22 12 22 C15.8 22 19 19 19 15 C19 11.5 16.8 8 12 8 Z" />
      <path d="M8 12.5 H16 M8 16.5 H16 M12 9.5 V21" stroke={INK} strokeOpacity={0.3} strokeWidth={1.2} />
    </g>
  ),
  vehicleKill: (
    <g>
      <path d="M5 11 L7.3 6.2 C7.6 5.5 8.3 5 9.1 5 H14.9 C15.7 5 16.4 5.5 16.7 6.2 L19 11 H20.5 C21.3 11 22 11.7 22 12.5 V17 H2 V12.5 C2 11.7 2.7 11 3.5 11 Z" />
      <path d="M7.4 10.6 L8.9 7 H15.1 L16.6 10.6 Z" fill={INK} fillOpacity={0.35} />
      <circle cx="6.5" cy="17.5" r="2.4" />
      <circle cx="17.5" cy="17.5" r="2.4" />
    </g>
  ),
  damage: (
    <polygon points="12,1.5 14.2,8 20.8,4.6 17.2,10.6 23,12.8 16.8,14.6 19.6,21 13.6,17.4 12,23 10.2,17.4 4.4,21 7.2,14.6 1,12.8 6.8,10.6 3.2,4.6 9.8,8" />
  ),
  airdrop: (
    <g>
      <path d="M2.5 9 C2.5 4.5 6.8 2 12 2 C17.2 2 21.5 4.5 21.5 9 C19.8 7.8 18.2 7.8 16.8 9 C15.4 7.8 13.6 7.8 12 9 C10.4 7.8 8.6 7.8 7.2 9 C5.8 7.8 4.2 7.8 2.5 9 Z" />
      <path d="M3 9.2 L9 15 M21 9.2 L15 15 M12 9 V15" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <rect x="8" y="14.5" width="8" height="7.5" />
      <path d="M8 18.2 H16 M12 14.5 V22" stroke={INK} strokeOpacity={0.35} strokeWidth={1.2} />
    </g>
  ),
  distanceKill: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 1.5 V7 M12 17 V22.5 M1.5 12 H7 M17 12 H22.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </g>
  ),
  killSteal: (
    <g>
      <path
        fillRule="evenodd"
        d="M1.5 9.5 C1.5 6.8 3.6 5.6 5.8 6.2 C8 6.8 9.8 7.6 12 7.6 C14.2 7.6 16 6.8 18.2 6.2 C20.4 5.6 22.5 6.8 22.5 9.5 C22.5 13.6 20.2 17.2 16.8 17.2 C14.7 17.2 13.3 15.6 12 14 C10.7 15.6 9.3 17.2 7.2 17.2 C3.8 17.2 1.5 13.6 1.5 9.5 Z
           M4.6 11.2 C4.6 10 5.9 9.3 7.4 9.3 C8.9 9.3 10 10.1 10 11.2 C10 12.3 8.9 13 7.4 13 C5.9 13 4.6 12.4 4.6 11.2 Z
           M14 11.2 C14 10.1 15.1 9.3 16.6 9.3 C18.1 9.3 19.4 10 19.4 11.2 C19.4 12.4 18.1 13 16.6 13 C15.1 13 14 12.3 14 11.2 Z"
      />
      <path d="M1.8 8.4 L0 6.6 L0.4 9.6 Z M22.2 8.4 L24 6.6 L23.6 9.6 Z" />
    </g>
  ),
};

const MilestoneIcon = ({ type, size, color }: { type: MilestoneType; size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ color, display: 'block' }} aria-hidden>
    {ICONS[type]}
  </svg>
);

const KEYFRAMES = `
@keyframes fdRise  { from { transform: translateY(46px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes fdSlideL{ from { transform: translateX(-26px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes fdUp    { from { transform: translateY(20px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes fdPop   { 0% { transform: scale(.4) rotate(-12deg); opacity: 0; } 70% { transform: scale(1.12); opacity: 1; } 100% { transform: none; } }
@keyframes fdMark  { from { transform: scale(1.25); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes fdEdge  { 0%, 85% { opacity: 1; } 100% { opacity: 0; } }
.fd-tlogo { animation: fdPop .6s cubic-bezier(.34,1.56,.64,1) .35s both; }
.fd-photo { animation: fdRise .75s cubic-bezier(.2,.8,.2,1) .2s both; }
.fd-mark  { animation: fdMark .8s cubic-bezier(.2,.8,.2,1) .05s both; }
.fd-plate { animation: fdSlideL .5s cubic-bezier(.2,.8,.2,1) .45s both; }
.fd-badge { animation: fdUp .5s cubic-bezier(.2,.8,.2,1) .55s both; }
.fd-icon  { animation: fdPop .55s cubic-bezier(.34,1.56,.64,1) .75s both; }
@media (prefers-reduced-motion: reduce) {
  .fd-tlogo, .fd-photo, .fd-mark, .fd-plate, .fd-badge, .fd-icon { animation: none; }
}
`;

/* ─────────────────────────────────────────────
   Leaves / stems
   ───────────────────────────────────────────── */
const LEAF = 'M0,0 C6,-11 22,-15 40,0 C22,15 6,11 0,0 Z';
const LEAF_TOP = 'M0,0 C6,-11 22,-15 40,0 Z';
const toneOf = (pal: ForestPalette, t: Tone) => (t === 'P' ? pal.leafP : t === 'S' ? pal.leafS : pal.leafM);

const ForestDefs = () => {
  const { pal, gid } = useContext(ForestCtx);
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {(['P', 'S', 'M'] as const).map((t) => {
          const c = toneOf(pal, t);
          return (
            <linearGradient key={t} id={`${gid}-leaf${t}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c[0]} />
              <stop offset="0.45" stopColor={c[1]} />
              <stop offset="0.55" stopColor={c[2]} />
              <stop offset="1" stopColor={c[2]} />
            </linearGradient>
          );
        })}
        <radialGradient id={`${gid}-petal`} cx="0.5" cy="0.9" r="0.9">
          <stop offset="0" stopColor={pal.petal[0]} />
          <stop offset="1" stopColor={pal.petal[1]} />
        </radialGradient>
        <filter id={`${gid}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="1.5" dy="3" stdDeviation="2" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>
    </svg>
  );
};

const LeafShape = ({ tone, vein = true }: { tone: Tone; vein?: boolean }) => {
  const { pal, gid } = useContext(ForestCtx);
  const c = toneOf(pal, tone);
  return (
    <>
      <path d={LEAF} fill={`url(#${gid}-leaf${tone})`} />
      <path d={LEAF_TOP} fill="#fff" opacity={0.13} />
      {vein && <path d="M1,0 Q20,-1.5 39,0" stroke={c[0]} strokeWidth={1.3} fill="none" opacity={0.85} />}
      <path d={LEAF} fill="none" stroke={c[2]} strokeWidth={0.8} opacity={0.7} />
    </>
  );
};

/** One stem segment that draws itself in / out (3D: core, body, highlight). */
const GrowSeg = ({ d, w, col, on, inDelay, outDelay, dur }: { d: string; w: number; col: VineCol; on: boolean; inDelay: number; outDelay: number; dur: number }) => {
  const base = { d, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, pathLength: 1 };
  const st: React.CSSProperties = {
    strokeDasharray: 1,
    strokeDashoffset: on ? 0 : 1,
    transition: on ? `stroke-dashoffset ${dur}ms linear ${inDelay}ms` : `stroke-dashoffset 200ms linear ${outDelay}ms`,
  };
  return (
    <g>
      <path {...base} stroke={col.dark} strokeWidth={w} style={st} />
      <path {...base} stroke={col.mid} strokeWidth={w * 0.6} transform="translate(-0.5,-0.9)" style={st} />
      <path {...base} stroke={col.light} strokeWidth={Math.max(1, w * 0.2)} strokeOpacity={0.65} transform="translate(-0.9,-1.6)" style={st} />
    </g>
  );
};

/** Something that pops open (leaf, flower) once the vine has reached it. */
const Unfurl = ({ on, inDelay, outDelay, origin = '0% 50%', children }: { on: boolean; inDelay: number; outDelay: number; origin?: string; children: React.ReactNode }) => (
  <g
    style={{
      transformBox: 'fill-box',
      transformOrigin: origin,
      transform: on ? 'scale(1)' : 'scale(0)',
      transition: on ? `transform 420ms cubic-bezier(.3,1.6,.5,1) ${inDelay}ms` : `transform 200ms ease-in ${outDelay}ms`,
    }}
  >
    {children}
  </g>
);

/* ─────────────────────────────────────────────
   Vine geometry — a strand climbing the card's right side and running
   across the top, weaving: each dip inside the frame alternates in front /
   behind. Nothing on the left side (the card is flush with the screen edge).
   Card-local coordinates (0,0 = card top-left).
   ───────────────────────────────────────────── */
type Pt = [number, number];
interface VSeg { d: string; front: boolean; i: number }
interface VLeaf { x: number; y: number; r: number; s: number; tone: Tone; i: number }

const SEG_MS = 95; // growth speed: ms per segment

function buildSide(mirror: boolean, topEnd: number) {
  const pts: Pt[] = [];
  const inner: boolean[] = [];
  const outward: number[] = []; // outward angle (deg) at each point
  let isIn = false;
  for (let y = CARD_H + 8; y > 46; y -= 46) {
    pts.push([isIn ? 12 : -13, y]);
    inner.push(isIn);
    outward.push(180);
    isIn = !isIn;
  }
  pts.push(isIn ? [16, 16] : [-12, -12]); // round the top corner
  inner.push(isIn);
  outward.push(-135);
  isIn = !isIn;
  for (let x = 50; x <= topEnd; x += 42) {
    pts.push([x, isIn ? 11 : -13]);
    inner.push(isIn);
    outward.push(-90);
    isIn = !isIn;
  }
  pts.push([topEnd + 26, -6]); // vine end, short of the far corner
  inner.push(false);
  outward.push(-90);

  const m = (p: Pt): Pt => (mirror ? [CARD_W - p[0], p[1]] : p);
  const P = pts.map(m);
  const f = (n: number) => n.toFixed(1);

  // alternate front / behind for each dip (an inner point + its two segments)
  let innerOrdinal = -1;
  const innerLayer: boolean[] = inner.map((v) => {
    if (!v) return false;
    innerOrdinal += 1;
    return innerOrdinal % 2 === 0;
  });

  const segs: VSeg[] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const k = inner[i] ? i : inner[i + 1] ? i + 1 : -1;
    segs.push({
      d: `M${f(p1[0])},${f(p1[1])} C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`,
      front: k >= 0 ? innerLayer[k] : true,
      i,
    });
  }

  const tones: Tone[] = ['M', 'P', 'S'];
  const leaves: VLeaf[] = [];
  P.forEach((p, i) => {
    if (inner[i] || i === P.length - 1) return;
    const ang = mirror ? 180 - outward[i] : outward[i];
    const jitter = ((i * 37) % 44) - 22;
    leaves.push({ x: p[0], y: p[1], r: ang + jitter, s: 0.6 + ((i * 13) % 18) / 100, tone: tones[(i + (mirror ? 1 : 0)) % 3], i });
    if (i % 2 === 0) leaves.push({ x: p[0], y: p[1], r: ang + jitter + (mirror ? -48 : 48), s: 0.45, tone: tones[(i + 2) % 3], i });
  });
  // segment where the vine passes the top centre (the crown blooms there)
  let centerIdx = 0;
  P.forEach((p, i) => {
    if (Math.abs(p[0] - CARD_W / 2) < Math.abs(P[centerIdx][0] - CARD_W / 2)) centerIdx = i;
  });
  return { segs, leaves, n: P.length - 1, centerIdx };
}

// one strand: climbs the RIGHT side and runs across the top; nothing on the left
const SIDES = [buildSide(true, CARD_W - 84)];
const N_SEGS = SIDES[0].n;
const CROWN_AT = SIDES[0].centerIdx;
const CROWN: { r: number; s: number; tone: Tone }[] = [
  { r: -160, s: 0.7, tone: 'P' },
  { r: -125, s: 0.85, tone: 'M' },
  { r: -90, s: 0.95, tone: 'S' },
  { r: -55, s: 0.85, tone: 'M' },
  { r: -20, s: 0.7, tone: 'P' },
];

/** Vine layer: `front` draws the in-front pieces, leaves, crown; otherwise the behind pieces. */
const VineLayer = ({ on, front }: { on: boolean; front: boolean }) => {
  const { pal, gid } = useContext(ForestCtx);
  const inDelay = (i: number) => i * SEG_MS;
  const outDelay = (i: number) => (N_SEGS - i) * 35;
  const crownIn = CROWN_AT * SEG_MS + 120;
  return (
    <svg
      width={CARD_W + VINE_PAD * 2}
      height={CARD_H + VINE_PAD * 2}
      viewBox={`${-VINE_PAD} ${-VINE_PAD} ${CARD_W + VINE_PAD * 2} ${CARD_H + VINE_PAD * 2}`}
      style={{ position: 'absolute', left: -VINE_PAD, top: -VINE_PAD, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 3 : 0 }}
      aria-hidden
    >
      <g filter={`url(#${gid}-shadow)`}>
        {SIDES.map((side, si) =>
          side.segs
            .filter((s) => s.front === front)
            .map((s) => (
              <GrowSeg
                key={`${si}-${s.i}`}
                d={s.d}
                w={si === 0 ? 8 : 7}
                col={si === 0 ? pal.vineA : pal.vineB}
                on={on}
                inDelay={inDelay(s.i)}
                outDelay={outDelay(s.i)}
                dur={SEG_MS + 30}
              />
            ))
        )}
        {front &&
          SIDES.map((side, si) =>
            side.leaves.map((l, li) => (
              <g key={`l${si}-${li}`} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r.toFixed(1)}) scale(${l.s.toFixed(2)})`}>
                <Unfurl on={on} inDelay={inDelay(l.i) + 60} outDelay={outDelay(l.i)}>
                  <LeafShape tone={l.tone} />
                </Unfurl>
              </g>
            ))
          )}
        {/* crown where the two vines meet: leaves fanning up + two flowers */}
        {front && (
          <g transform={`translate(${CARD_W / 2},-8)`}>
            {CROWN.map((c, i) => (
              <g key={i} transform={`rotate(${c.r}) scale(${c.s})`}>
                <Unfurl on={on} inDelay={crownIn + i * 70} outDelay={0}>
                  <LeafShape tone={c.tone} />
                </Unfurl>
              </g>
            ))}
            {[
              [-16, -6, 0.9],
              [17, -8, 0.75],
            ].map(([x, y, s], i) => (
              <g key={`f${i}`} transform={`translate(${x},${y}) scale(${s})`}>
                <Unfurl on={on} inDelay={crownIn + 380 + i * 120} outDelay={0} origin="50% 50%">
                  {[0, 72, 144, 216, 288].map((a) => (
                    <ellipse key={a} cx={0} cy={-6.5} rx={4.8} ry={7.5} transform={`rotate(${a})`} fill={`url(#${gid}-petal)`} stroke="rgba(0,0,0,.25)" strokeWidth={0.6} />
                  ))}
                  <circle r={3.6} fill={pal.primary} stroke="#fff" strokeWidth={1} />
                </Unfurl>
              </g>
            ))}
          </g>
        )}
      </g>
    </svg>
  );
};

/* ─────────────────────────────────────────────
   Scene details
   ───────────────────────────────────────────── */
const pines = (baseY: number, count: number, minH: number, maxH: number, seed: number) => {
  let d = '';
  const step = CARD_W / count;
  for (let i = 0; i <= count; i++) {
    const r = Math.abs(Math.sin((i + 1) * 12.9898 * seed) * 43758.5453) % 1;
    const h = minH + r * (maxH - minH);
    const w = h * 0.42;
    const x = i * step + (r - 0.5) * step * 0.6;
    d += `M${(x - w / 2).toFixed(1)},${baseY} L${x.toFixed(1)},${(baseY - h).toFixed(1)} L${(x + w / 2).toFixed(1)},${baseY} Z `;
  }
  return d;
};
const PINES_BACK = pines(PHOTO_H, 7, 110, 190, 2.3);
const PINES_FRONT = pines(PHOTO_H, 6, 70, 120, 4.1);

/* ─────────────────────────────────────────────
   The card content
   ───────────────────────────────────────────── */
const MilestoneCard: React.FC<{ data: Shown }> = ({ data }) => {
  const { pal } = useContext(ForestCtx);
  const label = LABELS[data.type];
  const name = (data.playerName || '').toUpperCase();
  const nameSize = name.length <= 9 ? 34 : name.length <= 13 ? 29 : 24;
  // badge text area is ~200px: size by length, long labels wrap to two lines
  const labelSize = label.length <= 9 ? 32 : label.length <= 12 ? 27 : 24;
  const textShadow = '0 0 1px rgba(0,0,0,.9), 0 2px 4px rgba(0,0,0,.6)';

  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      {/* ── base (behind the badge) ── */}
      <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(180deg, ${pal.base[0]}, ${pal.base[1]})` }} />

      {/* ── scene ── */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: CARD_W,
          height: PHOTO_H,
          overflow: 'hidden',
          background: `radial-gradient(ellipse 75% 60% at 50% 34%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%),
                       linear-gradient(180deg, ${pal.sceneMid} 0%, ${pal.sceneDeep} 100%)`,
        }}
      >
        {/* light shafts */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(110deg, transparent 20%, rgba(255,255,255,.10) 26%, transparent 33%, transparent 50%, rgba(255,255,255,.08) 55%, transparent 62%, transparent 72%, rgba(255,255,255,.06) 76%, transparent 82%)',
          }}
        />
        {/* pines */}
        <svg width={CARD_W} height={PHOTO_H} viewBox={`0 0 ${CARD_W} ${PHOTO_H}`} style={{ position: 'absolute', left: 0, top: 0 }} aria-hidden>
          <path d={PINES_BACK} fill={pal.pineBack} opacity={0.5} />
          <path d={PINES_FRONT} fill={pal.pineFront} opacity={0.75} />
        </svg>
        {/* faint milestone mark */}
        <div style={{ position: 'absolute', left: '50%', top: 34, transform: 'translateX(-50%)', opacity: 0.16 }}>
          <div className="fd-mark">
            <MilestoneIcon type={data.type} size={190} color={WHITE} />
          </div>
        </div>
        {/* player */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
          <img
            className="fd-photo"
            src={playerPhoto(data.picUrl) || '/def_char.png'}
            alt={data.playerName}
            style={{
              display: 'block',
              height: PHOTO_H - 22,
              width: 'auto',
              maxWidth: CARD_W + 40,
              objectFit: 'contain',
              objectPosition: 'bottom center',
              filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.5))',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/def_char.png';
            }}
          />
        </div>
        {/* ground shade under the feet */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 90, background: `linear-gradient(180deg, rgba(0,0,0,0), ${pal.sceneDeep})` }} />
      </div>

      {/* ── name plate across the photo's foot ── */}
      <div
        className="fd-plate"
        style={{
          position: 'absolute',
          left: 14,
          right: 14,
          top: PHOTO_H - PLATE_H - 10,
          height: PLATE_H,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px 0 6px',
          boxSizing: 'border-box',
          background: 'linear-gradient(180deg, rgba(8,10,6,.82), rgba(8,10,6,.92))',
          boxShadow: `inset 0 2px 0 ${pal.label}, 0 6px 12px rgba(0,0,0,.45)`,
          borderRadius: 6,
        }}
      >
        <div style={{ width: 70, height: 42, flex: 'none', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))' }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              background: WHITE,
              clipPath: PLATE_CUT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '5px 13px 5px 12px',
              boxSizing: 'border-box',
            }}
          >
            <TeamLogo logo={data.teamLogo} flag={data.teamFlag} fallback={'/def_logo.png'} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
        </div>
        <span style={{ flex: 1, minWidth: 0, color: WHITE, fontSize: nameSize, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow }}>{name}</span>
        <span style={{ flex: 'none', color: pal.label, fontSize: 20, letterSpacing: '0.08em', textShadow }}>{(data.teamTag || '').toUpperCase()}</span>
      </div>

      {/* ── milestone badge: white leaf-ended pill ── */}
      <div
        className="fd-badge"
        style={{
          position: 'absolute',
          left: 18,
          right: 18,
          top: PHOTO_H + 16,
          height: BADGE_H - 32,
          display: 'flex',
          alignItems: 'center',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 55%, #E8E8EE 100%)',
          borderRadius: '38px 8px 38px 8px',
          boxShadow: `0 0 0 3px ${pal.label}, 0 8px 14px rgba(0,0,0,.45)`,
          padding: '0 16px 0 8px',
          boxSizing: 'border-box',
          gap: 12,
        }}
      >
        <div
          className="fd-icon"
          style={{
            width: 60,
            height: 60,
            flex: 'none',
            borderRadius: '50%',
            background: `repeating-radial-gradient(circle, rgba(0,0,0,.12) 0px, rgba(0,0,0,.12) 1px, transparent 1px, transparent 5px), radial-gradient(circle at 38% 32%, ${pal.disc[0]}, ${pal.disc[1]} 55%, ${pal.disc[2]})`,
            boxShadow: `0 0 0 2px ${WHITE}, 0 0 0 4px ${pal.label}, 0 3px 6px rgba(0,0,0,.4)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MilestoneIcon type={data.type} size={34} color={pal.onPrimary} />
        </div>
        <span style={{ flex: 1, minWidth: 0, color: INK, fontSize: labelSize, letterSpacing: '0.04em', lineHeight: 1.02, overflowWrap: 'break-word' }}>{label}</span>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Wipe layer — GROWS from the bottom; a fringe of leaves rides its top edge
   ───────────────────────────────────────────── */
const LeafFringe = ({ tone }: { tone: Tone }) => {
  const { pal, gid } = useContext(ForestCtx);
  const n = 9;
  return (
    <svg width={CARD_W} height={30} viewBox={`0 -15 ${CARD_W} 30`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        <path d={`M-6,0 C${CARD_W * 0.3},-7 ${CARD_W * 0.6},7 ${CARD_W + 6},0`} stroke={pal.vineA.dark} strokeWidth={4} fill="none" strokeLinecap="round" />
        {Array.from({ length: n }, (_, i) => {
          const x = 10 + (i * (CARD_W - 20)) / (n - 1);
          const up = i % 2 === 0;
          return (
            <g key={i} transform={`translate(${x.toFixed(1)},0) rotate(${up ? -70 - (i % 3) * 12 : 110 + (i % 3) * 12}) scale(${0.55 + (i % 3) * 0.08})`}>
              <LeafShape tone={i % 3 === 1 ? 'M' : tone} vein={false} />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

const WipeLayer: React.FC<{ open: boolean; fringe: Tone; children: React.ReactNode }> = ({ open, fringe, children }) => {
  const opened = useRef(false);
  if (open) opened.current = true;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: '100%',
        height: open ? '100%' : '0%',
        transition: `height ${WIPE_MS}ms cubic-bezier(.65,0,.25,1)`,
      }}
    >
      {/* content, revealed (not squashed) as the layer grows */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: CARD_W, height: CARD_H }}>{children}</div>
      </div>
      {/* leading edge rides the top of the growing layer; visible only while it moves */}
      {opened.current && (
        <div
          key={open ? 'in' : 'out'}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: CARD_W,
            transform: 'translateY(-50%)',
            opacity: 0,
            animation: `fdEdge ${WIPE_MS}ms linear`,
            zIndex: 5,
          }}
        >
          <LeafFringe tone={fringe} />
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   Demo data for the preview button
   ───────────────────────────────────────────── */
const DEMO_ORDER: MilestoneType[] = [
  'streak3',
  'firstBlood',
  'streak5',
  'streak8',
  'grenadeKill',
  'vehicleKill',
  'damage',
  'airdrop',
  'distanceKill',
  'killSteal',
];
const DEMO_PLAYER = { playerName: 'VIPER', picUrl: '', teamTag: 'DMY', teamLogo: '/def_logo.png' };

/* ─────────────────────────────────────────────
   Dom
   ───────────────────────────────────────────── */
const Dom: React.FC<DomProps> = React.memo(({ tournament, match, matchData }) => {
  const [shown, setShown] = useState<Shown | null>(null);
  const [o1, setO1] = useState(false); // grove + tournament logo
  const [o2, setO2] = useState(false); // canopy
  const [o3, setO3] = useState(false); // card
  const [cardOn, setCardOn] = useState(false); // card content mounted (from its wipe-in until unmount)
  const [vinesOn, setVinesOn] = useState(false); // vines grown around the card
  const timersRef = useRef<number[]>([]);
  const keyRef = useRef(0);
  const demoIdxRef = useRef(0);

  const clearTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };
  const later = (fn: () => void, ms: number) => timersRef.current.push(window.setTimeout(fn, ms));

  const showAlert = useCallback((data: Omit<Shown, 'key'>) => {
    clearTimers();
    keyRef.current += 1;
    setO1(false);
    setO2(false);
    setO3(false);
    setCardOn(false);
    setVinesOn(false);
    setShown({ ...data, key: keyRef.current });
    // in: grove → canopy → card → vines grow
    later(() => setO1(true), T_LOGO);
    later(() => setO2(true), T_THEME);
    later(() => {
      setCardOn(true);
      setO3(true);
    }, T_CARD);
    later(() => setVinesOn(true), T_VINES);
    // out: vines retract → card → canopy → grove → unmount
    const outAt = T_CARD + WIPE_MS + DISPLAY_MS;
    later(() => setVinesOn(false), outAt);
    later(() => setO3(false), outAt + O_CARD);
    later(() => setO2(false), outAt + O_THEME);
    later(() => setO1(false), outAt + O_LOGO);
    later(() => setShown(null), outAt + O_DONE);
  }, []);

  useEffect(() => () => clearTimers(), []);

  // Shared milestone detection. Resets its trackers on match switch.
  const milestone = useKillMilestones(matchData, match, { damageThreshold: 500 });

  useEffect(() => {
    if (!milestone) return;
    const p = milestone.player as Player & { playerName?: string; picUrl?: string };
    showAlert({
      type: milestone.type,
      playerName: p.playerName || '',
      picUrl: p.picUrl,
      teamTag: milestone.teamTag,
      teamLogo: milestone.teamLogo,
      teamFlag: milestone.teamFlag,
    });
  }, [milestone, showAlert]);

  const triggerDemo = useCallback(() => {
    const type = DEMO_ORDER[demoIdxRef.current % DEMO_ORDER.length];
    demoIdxRef.current += 1;
    showAlert({ ...DEMO_PLAYER, type, demo: true });
  }, [showAlert]);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fd' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible' }}>
        <style>{KEYFRAMES}</style>
        <ForestDefs />

        {/* KILL STOLEN: who made the knock (renders only for that event) */}
        {matchData && !shown?.demo && (
          <StolenFromStrip
            event={milestone}
            visible={o3}
            top={CARD_TOP + CARD_H + 14}
            left={CARD_LEFT}
            width={CARD_W}
            primary={tournament.primaryColor}
            secondary={tournament.secondaryColor}
          />
        )}

        {shown && (
          <div
            key={shown.key}
            style={{ position: 'absolute', left: CARD_LEFT, top: CARD_TOP, width: CARD_W, height: CARD_H, pointerEvents: 'none' }}
          >
            {/* vines behind the card */}
            <VineLayer on={vinesOn} front={false} />

            {/* the card: three growing wipes inside the rounded frame */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 1,
                borderRadius: CARD_RADIUS,
                overflow: 'hidden',
                filter: o1 ? 'drop-shadow(0 16px 26px rgba(0,0,0,.45))' : 'none',
                transition: 'filter .3s ease',
              }}
            >
              {/* step 1 — grove: dark plate with the tournament logo */}
              <WipeLayer open={o1} fringe="M">
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `${GRAIN}, radial-gradient(ellipse 70% 45% at 50% 50%, ${pal.sceneGlow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    className="fd-tlogo"
                    src={tournament.torLogo || '/def_logo.png'}
                    alt=""
                    style={{ maxWidth: 240, maxHeight: 220, objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.6))' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/def_logo.png';
                    }}
                  />
                </div>
              </WipeLayer>
              {/* step 2 — canopy: full theme colour */}
              <WipeLayer open={o2} fringe="S">
                <div style={{ position: 'absolute', inset: 0, background: `${GRAIN}, linear-gradient(160deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})` }} />
              </WipeLayer>
              {/* step 3 — the card */}
              <WipeLayer open={o3} fringe="P">
                {cardOn && <MilestoneCard data={shown} />}
              </WipeLayer>
            </div>

            {/* bevelled frame — grows with the grove, stays to the end */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                borderRadius: CARD_RADIUS,
                padding: `${BORDER}px ${BORDER}px ${BORDER}px 0`, // no border on the flush left side
                background: `linear-gradient(160deg, ${pal.frame[0]}, ${pal.frame[1]} 40%, ${pal.frame[2]})`,
                WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.35)',
                clipPath: o1 ? `inset(0 0 0 0 round ${CARD_RADIUS})` : `inset(100% 0 0 0 round ${CARD_RADIUS})`,
                transition: `clip-path ${WIPE_MS}ms cubic-bezier(.65,0,.25,1)`,
              }}
            />

            {/* vines in front of the card */}
            <VineLayer on={vinesOn} front />
          </div>
        )}

        {/* ── preview control — outside the 1920×1080 canvas ── */}
        <button
          type="button"
          onClick={triggerDemo}
          style={{
            position: 'absolute',
            left: 1940,
            top: 76,
            padding: '10px 16px',
            background: INK,
            color: WHITE,
            border: `2px solid ${primary}`,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: '0.1em',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            pointerEvents: 'auto',
          }}
        >
          ▶ PREVIEW MILESTONE
        </button>
      </div>
    </ForestCtx.Provider>
  );
});

export default Dom;