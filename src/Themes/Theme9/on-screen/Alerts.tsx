import React, { useEffect, useState, useRef, useCallback, useId, useMemo, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchData, DeadTeamListEntry, toAlertTeam } from '../../shared/hooks/unsortteams';
import { TeamLogo } from '../../shared/components/TeamLogo';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// the freshly-merged matchData + the ordered deadTeamList (from
// sortDeadTeamList) down as props. This component's ONLY job is to notice
// a new teamId appear in deadTeamList and queue one ELIMINATED card for
// it — the exact deadTeamList-driven pattern of Theme3/on-screen/Alerts.tsx.
//
// FOREST "TEAM ELIMINATED" — same family as the forest Lower third / Live Stats.
//   Shape: two wooden faces meeting at a near corner, like a box seen from
//   the front (corner tallest, outer edges receding). Left face: big place
//   number and the team tag. Right face: the kill count. Each face
//   has its own secondary-colour strip (ELIMINATED / ELIMS) following the
//   perspective; the labels stay upright inside the strips.
//   Details: a log post stands at the corner; the team logo sits on a
//   tree-ring medallion crowning it. Plank grooves, top bevel, nails.
//   3D vines run along both top edges, climb the post and wrap the
//   bottom-left corner.
//
// Motion — three steps in, three steps out, all left → right in
// (pace set by SLOW below; currently 40% slower than the original timing):
//   IN   1) THE GROVE: vines grow along the edges, the dark plate opens and
//           the tournament logo blooms in the middle.
//   2) THE CANOPY: a theme-colour panel sweeps across behind a fringe
//           of leaves.
//   3) THE REVEAL: the info card sweeps in behind a second leaf fringe;
//           a few leaves fall, the details settle, the kill count rises.
//   OUT  3 → 2 → 1 in reverse: card sweeps back, canopy sweeps back,
//        then the vines un-grow and the plate closes.
//
// PREVIEW: a "Preview alert" button sits just OUTSIDE the 1920×1080 canvas
// (x ≥ 1940), so a 1920×1080 browser source never shows it. Clicking it
// queues one dummy alert through the same queue as real ones.

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

interface AlertsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  deadTeamList?: DeadTeamListEntry[];
}

/** What the card renders — shape of toAlertTeam()'s result that we use. */
interface AlertView {
  teamName: string;
  teamTag?: string;
  teamLogo?: string;
  teamFlag?: string;
  totalKills: number;
  teamRank: number | string;
  players: { _id?: string; name?: string; playerName?: string; bHasDied?: boolean }[];
}

type QueueItem = { kind: 'real'; entry: DeadTeamListEntry } | { kind: 'demo'; team: AlertView };

/** Global pace: every animation duration and step gap is multiplied by this.
 *  1 = original speed, 1.4 = 40% slower. */
const SLOW = 1.4;
const ms = (n: number) => Math.round(n * SLOW);

// ~8.4s total: ~2.6s three-step intro, ~3.6s info on screen, ~2.1s reverse outro
const ALERT_DISPLAY_MS = 8400;

/* ── dummy alert used by the preview button ── */
const DEMO_TEAM: AlertView = {
  teamName: 'DUMMY ESPORTS',
  teamTag: 'DMY',
  teamLogo: '/def_logo.png',
  totalKills: 7,
  teamRank: 12,
  players: [
    { _id: 'd1', name: 'VIPER', bHasDied: true },
    { _id: 'd2', name: 'SHADOW', bHasDied: true },
    { _id: 'd3', name: 'KRYPTO', bHasDied: true },
    { _id: 'd4', name: 'NEXUS', bHasDied: true },
  ],
};

/* ── type ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry (card-local: x=0 outer edge of the left face, y=0 top of the
      front corner). Two faces meet at a near corner, like a box seen from
      the front: the corner is the tallest edge, outer edges recede. ── */
const FRONT_W = 440; // left face
const SIDE_W = 260; // right face
const CARD_W = FRONT_W + SIDE_W;
const CARD_H = 220; // height of the front corner
/** left face: outer edge top/bottom, strip top at the outer edge */
const LF = { top: 30, bot: 206, stripTop: 166 };
/** right face: outer edge top/bottom, strip top at outer edge and at the corner */
const RF = { top: 34, bot: 204, stripTop: 166, stripTopNear: 170 };
/** the band every strip covers at full height (labels sit inside it, upright) */
const STRIP_BAND = { top: Math.max(LF.stripTop, RF.stripTopNear, RF.stripTop), bot: Math.min(LF.bot, RF.bot) };
const POST_W = 26;
const MEDAL_R = 64;
const MEDAL_CY = -16; // medallion centre, just above the corner
const OX = 34; // card offset inside the alert box (room for vines/leaves)
const TOP = 96; // room above for the medallion
const BOX_W = OX + CARD_W + 44;
const BOX_H = TOP + CARD_H + 36;

const LEFT_FACE = `polygon(0 ${LF.top}px, 100% 0, 100% 100%, 0 ${LF.bot}px)`;
const LEFT_STRIP = `polygon(0 ${LF.stripTop}px, 100% ${RF.stripTopNear}px, 100% 100%, 0 ${LF.bot}px)`;
const RIGHT_FACE = `polygon(0 0, 100% ${RF.top}px, 100% ${RF.bot}px, 0 100%)`;
const RIGHT_STRIP = `polygon(0 ${RF.stripTopNear}px, 100% ${RF.stripTop}px, 100% ${RF.bot}px, 0 100%)`;

/** Whole card silhouette in box coordinates (used by steps 1 and 2). */
const SILHOUETTE = `polygon(${OX}px ${TOP + LF.top}px, ${OX + FRONT_W}px ${TOP}px, ${OX + CARD_W}px ${TOP + RF.top}px, ${OX + CARD_W}px ${
  TOP + RF.bot
}px, ${OX + FRONT_W}px ${TOP + CARD_H}px, ${OX}px ${TOP + LF.bot}px)`;

/* ── colour ── */
type RGB = [number, number, number];
const BLACK: RGB = [8, 10, 6];
const WHITE_RGB: RGB = [255, 255, 255];
const MOSS: RGB = [62, 88, 36];
const BARK: RGB = [78, 54, 34];

function toRgb(hex: string): RGB {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const deepen = (c: RGB, max = 0.2): RGB => (lum(c) <= max ? c : mix(c, BLACK, 1 - max / lum(c)));

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

function forestPalette(primary: string, secondary: string) {
  const p = toRgb(primary);
  const s = toRgb(secondary);
  const dp = deepen(p);
  const vineBase = mix(mix(p, s, 0.5), MOSS, 0.5);
  const leaf = (c: RGB): [string, string, string] => [css(mix(c, WHITE_RGB, 0.42)), css(c), css(mix(c, BLACK, 0.55))];
  return {
    primary,
    secondary,
    front: [css(mix(dp, BLACK, 0.15)), css(mix(dp, BLACK, 0.5))],
    side: [css(mix(dp, BLACK, 0.5)), css(mix(dp, BLACK, 0.78))],
    grove: [css(mix(dp, BLACK, 0.75)), css(mix(dp, BLACK, 0.92))],
    canopy: [css(mix(p, WHITE_RGB, 0.12)), primary, css(mix(p, BLACK, 0.55))],
    strip: [css(mix(s, WHITE_RGB, 0.18)), secondary, css(mix(s, BLACK, 0.2))],
    stripSide: [css(mix(s, BLACK, 0.12)), css(mix(s, BLACK, 0.35))],
    stripInk: inkOn(secondary),
    // corner log + tree-ring medallion
    post: [css(mix(mix(dp, BARK, 0.65), BLACK, 0.55)), css(mix(dp, BARK, 0.65)), css(mix(mix(dp, BARK, 0.65), WHITE_RGB, 0.28))],
    ring: [css(mix(mix(s, BARK, 0.55), WHITE_RGB, 0.15)), css(mix(mix(dp, BARK, 0.6), BLACK, 0.2))],
    label: lum(s) < 0.35 ? css(mix(s, WHITE_RGB, 0.45)) : secondary,
    glow: `rgba(${mix(s, WHITE_RGB, 0.4).join(',')},0.55)`,
    leafP: leaf(mix(p, MOSS, 0.15)),
    leafS: leaf(mix(s, MOSS, 0.15)),
    leafM: leaf(mix(mix(p, s, 0.5), MOSS, 0.4)),
    vineA: { dark: css(mix(vineBase, BLACK, 0.72)), mid: css(mix(vineBase, BLACK, 0.12)), light: css(mix(s, WHITE_RGB, 0.6)) },
    vineB: { dark: css(mix(mix(vineBase, p, 0.3), BLACK, 0.75)), mid: css(mix(mix(vineBase, p, 0.3), BLACK, 0.22)), light: css(mix(p, WHITE_RGB, 0.6)) },
  };
}
type ForestPalette = ReturnType<typeof forestPalette>;
type VineCol = ForestPalette['vineA'];
type Tone = 'P' | 'S' | 'M';

const ForestCtx = createContext<{ pal: ForestPalette; gid: string }>({ pal: forestPalette('#2E7D4A', '#C9A24A'), gid: 'fa' });

const GRAIN =
  'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 4px), ' +
  'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 11px)';

/* kill number counts up 0 → n once the block has landed */
function useCountUp(target: number, delayMs: number, durMs: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delayMs;
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - start) / durMs));
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, delayMs, durMs]);
  return v;
}

const sec = (n: number) => `${(n * SLOW).toFixed(2)}s`;
const KEYFRAMES = `
@keyframes faSlideL { from { transform: translateX(-24px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes faSlideR { from { transform: translateX(30px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes faPop    { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
@keyframes faRise   { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes faDrop   { 0% { transform: translateY(-46px) scale(.9); opacity: 0; } 60% { transform: translateY(4px) scale(1.02); opacity: 1; } 100% { transform: none; opacity: 1; } }
@keyframes faFall   {
  0%   { transform: translate(0,-20px) rotate(0deg); opacity: 0; }
  12%  { opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); opacity: 0; }
}
.fa-tlogo { animation: faPop ${sec(.55)} cubic-bezier(.34,1.56,.64,1) ${sec(.25)} both; }
.fa-plate { animation: faDrop ${sec(.55)} cubic-bezier(.2,.9,.3,1.2) ${sec(.1)} both; }
.fa-rank  { animation: faSlideL ${sec(.4)} cubic-bezier(.2,.8,.2,1) ${sec(.2)} both; }
.fa-name  { animation: faSlideL ${sec(.4)} cubic-bezier(.2,.8,.2,1) ${sec(.28)} both; }
.fa-meta  { animation: faRise ${sec(.35)} cubic-bezier(.2,.8,.2,1) ${sec(.4)} both; }
.fa-kills { animation: faSlideR ${sec(.4)} cubic-bezier(.2,.8,.2,1) ${sec(.15)} both; }
.fa-fall  { animation: faFall ${sec(2.4)} cubic-bezier(.4,.1,.6,1) both; }
@media (prefers-reduced-motion: reduce) {
  .fa-tlogo, .fa-plate, .fa-rank, .fa-name, .fa-meta, .fa-kills, .fa-fall { animation: none; }
}
`;

/* ─────────────────────────────────────────────
   SVG bits: leaves, stems
   ───────────────────────────────────────────── */
const LEAF = 'M0,0 C6,-11 22,-15 40,0 C22,15 6,11 0,0 Z';
const LEAF_TOP = 'M0,0 C6,-11 22,-15 40,0 Z';
const toneOf = (pal: ForestPalette, t: Tone) => (t === 'P' ? pal.leafP : t === 'S' ? pal.leafS : pal.leafM);

const LeafDefs = () => {
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

/** A stem that grows (draws) in when `on`, and un-grows when it turns off. */
const GrowStem = ({ d, w, col, on, delay, dur = ms(700) }: { d: string; w: number; col: VineCol; on: boolean; delay: number; dur?: number }) => {
  const base = { d, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, pathLength: 1 };
  const st: React.CSSProperties = {
    strokeDasharray: 1,
    strokeDashoffset: on ? 0 : 1,
    transition: `stroke-dashoffset ${on ? dur : Math.round(dur * 0.6)}ms cubic-bezier(.45,0,.2,1) ${on ? ms(delay) : 0}ms`,
  };
  return (
    <g>
      <path {...base} stroke={col.dark} strokeWidth={w} style={st} />
      <path {...base} stroke={col.mid} strokeWidth={w * 0.6} transform="translate(-0.5,-0.9)" style={st} />
      <path {...base} stroke={col.light} strokeWidth={Math.max(1, w * 0.2)} strokeOpacity={0.65} transform="translate(-0.9,-1.6)" style={st} />
    </g>
  );
};

/* vines in card-local coordinates — along both top edges (emerging from
   behind the medallion), climbing the corner post, and round the
   bottom-left corner */
const VINES: { d: string; w: number; col: 'A' | 'B'; delay: number }[] = [
  { d: 'M380,12 C340,-4 300,22 260,12 S180,2 140,20 S62,36 22,28 C6,26 -8,38 -4,58', w: 7, col: 'A', delay: 120 },
  { d: 'M500,10 C540,-2 562,26 602,20 S662,22 692,42 C710,52 714,72 706,94', w: 7, col: 'B', delay: 200 },
  { d: 'M440,222 C424,198 458,182 440,158 S424,120 444,100 S454,70 440,52', w: 5.5, col: 'A', delay: 340 },
  { d: 'M-6,152 C-12,178 4,198 30,212 S82,226 112,216', w: 5, col: 'B', delay: 0 },
];
const VINE_LEAVES: { x: number; y: number; r: number; s: number; t: Tone }[] = [
  { x: 340, y: 2, r: -115, s: 0.6, t: 'M' },
  { x: 300, y: 16, r: -70, s: 0.66, t: 'P' },
  { x: 258, y: 10, r: -120, s: 0.6, t: 'S' },
  { x: 200, y: 8, r: -66, s: 0.68, t: 'M' },
  { x: 140, y: 20, r: -116, s: 0.6, t: 'P' },
  { x: 82, y: 30, r: -70, s: 0.64, t: 'S' },
  { x: 22, y: 28, r: -132, s: 0.6, t: 'M' },
  { x: -4, y: 56, r: 172, s: 0.58, t: 'P' },
  { x: 542, y: 2, r: -70, s: 0.62, t: 'S' },
  { x: 602, y: 20, r: -112, s: 0.64, t: 'M' },
  { x: 652, y: 24, r: -62, s: 0.6, t: 'P' },
  { x: 692, y: 42, r: -24, s: 0.62, t: 'S' },
  { x: 708, y: 84, r: 12, s: 0.58, t: 'M' },
  { x: 432, y: 192, r: 205, s: 0.52, t: 'P' },
  { x: 450, y: 160, r: -22, s: 0.52, t: 'S' },
  { x: 430, y: 122, r: 198, s: 0.5, t: 'M' },
  { x: 450, y: 84, r: -18, s: 0.5, t: 'P' },
  { x: -10, y: 172, r: 186, s: 0.56, t: 'S' },
  { x: 40, y: 218, r: 112, s: 0.52, t: 'M' },
  { x: 112, y: 216, r: 66, s: 0.52, t: 'P' },
];
const TENDRIL = 'M0,0 c0,-12 12,-19 19,-12 c6,6 0,14 -6,10 c-4,-3 -2,-8 2,-6';

/** Step-1 vines + leaves; they stay on top while steps 2 and 3 run beneath. */
const VineFrame = ({ on }: { on: boolean }) => {
  const { pal, gid } = useContext(ForestCtx);
  return (
    <svg
      width={BOX_W}
      height={BOX_H}
      viewBox={`0 0 ${BOX_W} ${BOX_H}`}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 10 }}
      aria-hidden
    >
      <g transform={`translate(${OX},${TOP})`} filter={`url(#${gid}-shadow)`}>
        {VINES.map((v, i) => (
          <GrowStem key={i} d={v.d} w={v.w} col={v.col === 'A' ? pal.vineA : pal.vineB} on={on} delay={v.delay} />
        ))}
        {[
          { x: 706, y: 94, r: 100 },
          { x: -4, y: 58, r: 200 },
          { x: 440, y: 52, r: -10 },
        ].map((t, i) => (
          <g key={i} transform={`translate(${t.x},${t.y}) rotate(${t.r})`}>
            <GrowStem d={TENDRIL} w={2.6} col={pal.vineA} on={on} delay={760} dur={ms(360)} />
          </g>
        ))}
        {VINE_LEAVES.map((l, i) => (
          <g key={i} transform={`translate(${l.x},${l.y}) rotate(${l.r}) scale(${l.s})`}>
            <g
              style={{
                transformBox: 'fill-box',
                transformOrigin: '0% 50%',
                transform: on ? 'scale(1)' : 'scale(0)',
                transition: `transform ${ms(on ? 380 : 220)}ms cubic-bezier(.3,1.5,.5,1) ${ms(on ? 300 + i * 28 : (VINE_LEAVES.length - i) * 10)}ms`,
              }}
            >
              <LeafShape tone={l.t} />
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
};

/** Leading edge of a wipe: a short stem with leaves fanning out of it. */
const LeafFringe = ({ height, tone }: { height: number; tone: Tone }) => {
  const { pal, gid } = useContext(ForestCtx);
  const n = Math.round(height / 30);
  return (
    <svg width={44} height={height + 20} viewBox={`-22 -10 44 ${height + 20}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        <path d={`M0,-8 C-6,${height * 0.3} 6,${height * 0.6} 0,${height + 8}`} stroke={pal.vineA.dark} strokeWidth={4} fill="none" strokeLinecap="round" />
        {Array.from({ length: n }, (_, i) => {
          const y = 6 + (i * (height - 12)) / Math.max(1, n - 1);
          const right = i % 2 === 0;
          return (
            <g key={i} transform={`translate(0,${y.toFixed(1)}) rotate(${right ? -25 + (i % 3) * 10 : 205 - (i % 3) * 10}) scale(${0.62 + (i % 3) * 0.08})`}>
              <LeafShape tone={i % 3 === 1 ? 'M' : tone} vein={false} />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

/* ─────────────────────────────────────────────
   The info card (step 3 content)
   ───────────────────────────────────────────── */
const FALLING = [
  { left: 120, dx: '-18px', rot: '-200deg', delay: 0.25, t: 'P' as Tone },
  { left: 300, dx: '14px', rot: '220deg', delay: 0.5, t: 'S' as Tone },
  { left: 520, dx: '-10px', rot: '-180deg', delay: 0.38, t: 'M' as Tone },
  { left: 640, dx: '16px', rot: '190deg', delay: 0.62, t: 'P' as Tone },
];

const LeafMark = ({ color, flip }: { color: string; flip?: boolean }) => (
  <svg width={22} height={13} viewBox="0 -12 40 24" style={{ display: 'block', transform: flip ? 'scaleX(-1)' : undefined }} aria-hidden>
    <path d={LEAF} fill={color} />
  </svg>
);

const EliminatedCard: React.FC<{ team: AlertView }> = ({ team }) => {
  const { pal, gid } = useContext(ForestCtx);
  const kills = useCountUp(Number(team.totalKills) || 0, ms(350), ms(650));
  // team tag (falls back to the name if the feed has no tag)
  const tag = String(team.teamTag || (team as any).tag || team.teamName || '').toUpperCase();
  const tagSize = tag.length <= 4 ? 78 : tag.length <= 6 ? 64 : tag.length <= 9 ? 50 : 38;
  const textShadow = '0 0 1px rgba(0,0,0,.9), 0 3px 4px rgba(0,0,0,.55)';
  const face = (clip: string, left: number, w: number, bg: string): React.CSSProperties => ({
    position: 'absolute',
    left,
    top: 0,
    width: w,
    height: CARD_H,
    clipPath: clip,
    background: bg,
  });

  // plank grooves between the top edge and the strip, following each face's perspective
  const grooves = [0.36, 0.68].flatMap((f) => [
    `M0,${(LF.top + f * (LF.stripTop - LF.top)).toFixed(1)} L${FRONT_W},${(f * RF.stripTopNear).toFixed(1)}`,
    `M${FRONT_W},${(f * RF.stripTopNear).toFixed(1)} L${CARD_W},${(RF.top + f * (RF.stripTop - RF.top)).toFixed(1)}`,
  ]);

  return (
    <div style={{ position: 'absolute', left: OX, top: TOP, width: CARD_W, height: CARD_H, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      {/* ── faces ── */}
      <div
        style={face(
          LEFT_FACE,
          0,
          FRONT_W,
          `${GRAIN}, radial-gradient(ellipse 60% 80% at 26% 24%, ${pal.glow} 0%, rgba(0,0,0,0) 62%), linear-gradient(90deg, ${pal.front[1]} 0%, ${pal.front[0]} 80%, ${pal.front[0]} 100%)`
        )}
      />
      <div style={face(LEFT_STRIP, 0, FRONT_W, `linear-gradient(90deg, ${pal.strip[2]}, ${pal.strip[0]} 70%, ${pal.strip[1]})`)} />
      <div style={face(RIGHT_FACE, FRONT_W, SIDE_W, `${GRAIN}, linear-gradient(90deg, ${pal.side[0]}, ${pal.side[1]})`)} />
      <div style={face(RIGHT_STRIP, FRONT_W, SIDE_W, `linear-gradient(90deg, ${pal.stripSide[0]}, ${pal.stripSide[1]})`)} />

      {/* ── carved details: grooves, bevels, nails ── */}
      <svg width={CARD_W} height={CARD_H} viewBox={`0 0 ${CARD_W} ${CARD_H}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden>
        {grooves.map((d, i) => (
          <g key={i}>
            <path d={d} stroke="rgba(0,0,0,.38)" strokeWidth={1.6} />
            <path d={d} stroke="rgba(255,255,255,.07)" strokeWidth={1} transform="translate(0,1.6)" />
          </g>
        ))}
        {/* top bevel catching light */}
        <polyline points={`0,${LF.top} ${FRONT_W},0 ${CARD_W},${RF.top}`} fill="none" stroke="rgba(255,255,255,.38)" strokeWidth={2.5} />
        <polyline points={`0,${LF.top + 3} ${FRONT_W},3 ${CARD_W},${RF.top + 3}`} fill="none" stroke="rgba(0,0,0,.3)" strokeWidth={1.5} />
        {/* strip top edge + bottom shade */}
        <polyline points={`0,${LF.stripTop} ${FRONT_W},${RF.stripTopNear} ${CARD_W},${RF.stripTop}`} fill="none" stroke="rgba(255,255,255,.5)" strokeWidth={1.5} />
        <polyline points={`0,${LF.bot} ${FRONT_W},${CARD_H} ${CARD_W},${RF.bot}`} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth={3} />
        {/* nails */}
        {[
          [12, LF.top + 14],
          [12, LF.stripTop - 14],
          [CARD_W - 12, RF.top + 14],
          [CARD_W - 12, RF.stripTop - 12],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={4} fill="rgba(0,0,0,.45)" />
            <circle cx={x - 0.6} cy={y - 0.6} r={2.8} fill="#8f8f96" />
            <circle cx={x - 1.3} cy={y - 1.3} r={1} fill="#fff" opacity={0.8} />
          </g>
        ))}
      </svg>

      {/* ── left face content, turned slightly with the face ── */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: FRONT_W,
          height: CARD_H,
          transform: 'perspective(1100px) rotateY(9deg)',
          transformOrigin: '100% 50%',
        }}
      >
        <div className="fa-rank" style={{ position: 'absolute', left: 18, top: 50, width: 150, textAlign: 'center' }}>
          <div style={{ fontSize: 17, letterSpacing: '0.32em', paddingLeft: '0.32em', color: 'rgba(255,255,255,.72)', textShadow }}>PLACE</div>
          <div style={{ fontSize: 88, color: WHITE, marginTop: 2, textShadow, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ fontSize: 52, color: pal.label, verticalAlign: '0.4em', marginRight: 2 }}>#</span>
            {team.teamRank}
          </div>
        </div>

        <div style={{ position: 'absolute', left: 176, top: 48, height: 96, width: 2, background: 'linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.3), rgba(255,255,255,0))' }} />

        <div style={{ position: 'absolute', left: 192, width: 216, top: 46, height: 108, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="fa-meta" style={{ fontSize: 17, letterSpacing: '0.3em', color: pal.label, textShadow }}>
            TEAM
          </div>
          <div className="fa-name" style={{ fontSize: tagSize, color: WHITE, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow }}>
            {tag}
          </div>
        </div>

      </div>

      {/* ── right face content, turned away ── */}
      <div
        style={{
          position: 'absolute',
          left: FRONT_W,
          top: 0,
          width: SIDE_W,
          height: CARD_H,
          transform: 'perspective(700px) rotateY(-22deg)',
          transformOrigin: '0% 50%',
        }}
      >
        <div className="fa-kills" style={{ position: 'absolute', left: 0, right: 0, top: 30, height: RF.stripTopNear - 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 124, color: WHITE, textShadow, fontVariantNumeric: 'tabular-nums' }}>{kills}</span>
        </div>
      </div>

      {/* ── strip labels: upright, inside each strip's full-height band ── */}
      {[
        { left: 0, width: FRONT_W - POST_W / 2, text: 'ELIMINATED', leaves: true },
        { left: FRONT_W + POST_W / 2, width: SIDE_W - POST_W / 2, text: 'ELIMS', leaves: false },
      ].map((st) => (
        <div
          key={st.text}
          style={{
            position: 'absolute',
            left: st.left,
            width: st.width,
            top: STRIP_BAND.top,
            height: STRIP_BAND.bot - STRIP_BAND.top,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            color: pal.stripInk,
            fontSize: 24,
            letterSpacing: '0.3em',
            whiteSpace: 'nowrap',
          }}
        >
          {st.leaves && <LeafMark color={pal.stripInk} flip />}
          <span style={{ paddingLeft: '0.3em' }}>{st.text}</span>
          {st.leaves && <LeafMark color={pal.stripInk} />}
        </div>
      ))}

      {/* ── corner post: a log standing at the front edge ── */}
      <div
        style={{
          position: 'absolute',
          left: FRONT_W - POST_W / 2,
          top: -4,
          width: POST_W,
          height: CARD_H + 10,
          borderRadius: '6px 6px 9px 9px',
          background: `repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0px, rgba(0,0,0,.18) 1px, transparent 1px, transparent 5px),
                       linear-gradient(90deg, ${pal.post[0]} 0%, ${pal.post[1]} 30%, ${pal.post[2]} 48%, ${pal.post[1]} 66%, ${pal.post[0]} 100%)`,
          boxShadow: '0 0 0 1px rgba(0,0,0,.35), 4px 0 10px rgba(0,0,0,.45)',
        }}
      />

      {/* ── logo on a tree-ring medallion crowning the corner ── */}
      <div
        className="fa-plate"
        style={{
          position: 'absolute',
          left: FRONT_W - MEDAL_R,
          top: MEDAL_CY - MEDAL_R,
          width: MEDAL_R * 2,
          height: MEDAL_R * 2,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(0,0,0,0) 62%, rgba(0,0,0,.45) 100%),
                       repeating-radial-gradient(circle, rgba(0,0,0,.2) 0px, rgba(0,0,0,.2) 1px, transparent 1px, transparent 6px),
                       radial-gradient(circle at 40% 35%, ${pal.ring[0]}, ${pal.ring[1]})`,
          boxShadow: `0 0 0 3px ${pal.label}, 0 0 0 6px rgba(0,0,0,.55), 0 10px 18px rgba(0,0,0,.55)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: MEDAL_R * 2 - 34,
            height: MEDAL_R * 2 - 34,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 35%, #FFFFFF 60%, #E4E4EA)',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 14,
            boxSizing: 'border-box',
          }}
        >
          <TeamLogo
            logo={team.teamLogo}
            flag={team.teamFlag}
            alt={team.teamName}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      </div>

      {/* a few leaves drift down across the card, once */}
      {FALLING.map((l, i) => (
        <svg
          key={i}
          className="fa-fall"
          width={26}
          height={16}
          viewBox="0 -12 40 24"
          style={
            {
              position: 'absolute',
              left: l.left,
              top: 20,
              animationDelay: `${(l.delay * SLOW).toFixed(2)}s`,
              '--dx': l.dx,
              '--dy': `${CARD_H - 60}px`,
              '--rot': l.rot,
              pointerEvents: 'none',
            } as React.CSSProperties
          }
          aria-hidden
        >
          <path d={LEAF} fill={`url(#${gid}-leaf${l.t})`} />
        </svg>
      ))}
    </div>
  );
};

/* ─────────────────────────────────────────────
   AlertSequence — three steps in, three steps out
   ───────────────────────────────────────────── */
const WIPE_MS = ms(480);
const WIPE_EASE = 'cubic-bezier(.7,0,.2,1)';
// timeline (ms from mount)
const T_PLATE = 30;
const T_THEME = ms(850);
const T_INFO = ms(1350);
const OUTRO_MS = ms(1500); // info out → canopy out → (logo beat) → grove out

/** A layer whose visible width grows/shrinks from the left. A leaf fringe
 *  rides the leading edge. Content is pinned to full width (revealed, not
 *  squashed). */
const WipeLayer: React.FC<{
  open: boolean;
  fringe?: Tone;
  clip?: string;
  children: React.ReactNode;
}> = ({ open, fringe, clip, children }) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    <div style={{ position: 'absolute', inset: 0, clipPath: clip }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: open ? '100%' : '0%',
          overflow: 'hidden',
          transition: `width ${WIPE_MS}ms ${WIPE_EASE}`,
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, width: BOX_W, height: '100%' }}>{children}</div>
      </div>
    </div>
    {/* fringe sits outside the clip so leaves can poke past the edges */}
    {fringe && (
      <div
        style={{
          position: 'absolute',
          top: TOP,
          height: CARD_H,
          left: open ? BOX_W - 22 : -22, // tracks the wipe's leading edge
          opacity: open ? 1 : 0,
          transition: `left ${WIPE_MS}ms ${WIPE_EASE}, opacity ${ms(140)}ms linear ${open ? 0 : WIPE_MS}ms`,
          zIndex: 5,
        }}
      >
        <LeafFringe height={CARD_H} tone={fringe} />
      </div>
    )}
  </div>
);

const AlertSequence: React.FC<{
  team: AlertView;
  torLogo?: string;
  displayMs: number;
}> = ({ team, torLogo, displayMs }) => {
  const { pal } = useContext(ForestCtx);
  const [o1, setO1] = useState(false); // grove: vines + dark plate + tournament logo
  const [o2, setO2] = useState(false); // canopy: theme-colour sweep
  const [o3, setO3] = useState(false); // reveal: info card
  const [infoMounted, setInfoMounted] = useState(false);
  const [logoMounted, setLogoMounted] = useState(false);
  const [fringeDone, setFringeDone] = useState({ f2: false, f3: false });

  useEffect(() => {
    const close = displayMs - OUTRO_MS - 150;
    const ts = [
      setTimeout(() => {
        setLogoMounted(true);
        setO1(true);
      }, T_PLATE),
      setTimeout(() => setO2(true), T_THEME),
      // once a wipe has landed, its fringe fades so it isn't parked on the edge
      setTimeout(() => setFringeDone((f) => ({ ...f, f2: true })), T_THEME + WIPE_MS + ms(60)),
      setTimeout(() => {
        setInfoMounted(true);
        requestAnimationFrame(() => setO3(true));
      }, T_INFO),
      setTimeout(() => setFringeDone((f) => ({ ...f, f3: true })), T_INFO + WIPE_MS + ms(60)),
      // outro: each fringe re-appears at the edge just before its return sweep
      setTimeout(() => setFringeDone((f) => ({ ...f, f3: false })), close - ms(80)),
      setTimeout(() => setO3(false), close),
      setTimeout(() => setFringeDone((f) => ({ ...f, f2: false })), close + ms(450) - ms(80)),
      setTimeout(() => setO2(false), close + ms(450)),
      setTimeout(() => setO1(false), close + ms(1000)),
    ];
    return () => ts.forEach(clearTimeout);
  }, [displayMs]);

  return (
    <div
      style={{
        position: 'relative',
        width: BOX_W,
        height: BOX_H,
        filter: o1 ? 'drop-shadow(0 18px 30px rgba(0,0,0,0.45))' : 'none',
        transition: `filter ${sec(0.3)} ease`,
      }}
    >
      {/* step 1 — the grove: dark plate with the tournament logo */}
      <WipeLayer open={o1} clip={SILHOUETTE}>
        <div
          style={{
            position: 'absolute',
            left: OX,
            top: TOP,
            width: CARD_W,
            height: CARD_H,
            background: `${GRAIN}, radial-gradient(ellipse 34% 70% at 31% 52%, ${pal.glow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingRight: SIDE_W, // centred on the left face, clear of the corner post vine
            boxSizing: 'border-box',
          }}
        >
          {logoMounted && (
            <img
              className="fa-tlogo"
              src={torLogo || '/def_logo.png'}
              alt=""
              style={{ maxHeight: 130, maxWidth: 300, objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.6))' }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/def_logo.png';
              }}
            />
          )}
        </div>
      </WipeLayer>

      {/* step 2 — the canopy: full theme colour behind a leaf fringe */}
      <WipeLayer open={o2} clip={SILHOUETTE} fringe={fringeDone.f2 ? undefined : 'S'}>
        <div
          style={{
            position: 'absolute',
            left: OX,
            top: TOP,
            width: CARD_W,
            height: CARD_H,
            background: `${GRAIN}, linear-gradient(115deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})`,
          }}
        />
      </WipeLayer>

      {/* step 3 — the reveal: info card behind a second fringe */}
      <WipeLayer open={o3} fringe={fringeDone.f3 ? undefined : 'P'}>
        {infoMounted && <EliminatedCard team={team} />}
      </WipeLayer>

      {/* vines grow with step 1 and stay on top until the very end */}
      <VineFrame on={o1} />
    </div>
  );
};

/* ─────────────────────────────────────────────
   Alerts — queue logic unchanged; demo items share the same queue.
   ───────────────────────────────────────────── */
const Alerts: React.FC<AlertsProps> = ({ tournament, matchData, deadTeamList }) => {
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);
  const shownTeamsRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<QueueItem[]>([]);
  const isShowingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertIdRef = useRef(0);

  const [showAlert, setShowAlert] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<QueueItem | null>(null);

  const processQueue = useCallback(() => {
    if (isShowingRef.current || queueRef.current.length === 0) return;
    const next = queueRef.current.shift();
    if (!next) return;
    isShowingRef.current = true;
    alertIdRef.current += 1;
    setCurrentAlert(next);
    setShowAlert(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShowAlert(false);
      setCurrentAlert(null);
      timeoutRef.current = null;
      isShowingRef.current = false;
      setTimeout(processQueue, 300);
    }, ALERT_DISPLAY_MS);
  }, []);

  // New match → reset trackers and suppress alerts for teams that are
  // ALREADY in deadTeamList when this match's data first arrives.
  useEffect(() => {
    const incomingId = matchData?._id?.toString() ?? null;
    if (incomingId === matchDataIdRef.current) return;
    matchDataIdRef.current = incomingId;
    shownTeamsRef.current.clear();
    queueRef.current = [];
    isShowingRef.current = false;
    setShowAlert(false);
    setCurrentAlert(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    (deadTeamList || []).forEach((t) => shownTeamsRef.current.add(t.teamId));
  }, [matchData?._id, deadTeamList]);

  // The ONLY place that decides "this team just got eliminated" — a new
  // teamId appearing in the ordered deadTeamList prop.
  useEffect(() => {
    if (!deadTeamList || deadTeamList.length === 0) return;
    let queued = false;
    deadTeamList.forEach((t) => {
      if (!shownTeamsRef.current.has(t.teamId)) {
        shownTeamsRef.current.add(t.teamId);
        queueRef.current.push({ kind: 'real', entry: t });
        queued = true;
      }
    });
    if (queued) processQueue();
  }, [deadTeamList, processQueue]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  // Preview button → one dummy alert through the normal queue.
  const triggerDemo = useCallback(() => {
    queueRef.current.push({ kind: 'demo', team: DEMO_TEAM });
    processQueue();
  }, [processQueue]);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fa' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  let alertTeam: AlertView | null = null;
  if (currentAlert?.kind === 'demo') alertTeam = currentAlert.team;
  else if (currentAlert?.kind === 'real' && matchData) {
    const t = toAlertTeam(currentAlert.entry, matchData) as any;
    if (t) alertTeam = { ...t, players: (t.players || []).filter((p: any) => p.bHasDied) };
  }

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible' }}>
        <style>{KEYFRAMES}</style>
        <LeafDefs />

        <AnimatePresence>
          {showAlert && alertTeam && (
            <motion.div
              key={`alert-${alertIdRef.current}`}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                pointerEvents: 'none',
              }}
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 * SLOW }}
            >
              <AlertSequence team={alertTeam} torLogo={tournament.torLogo} displayMs={ALERT_DISPLAY_MS} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── preview control — outside the 1920×1080 canvas ── */}
        <button
          type="button"
          onClick={triggerDemo}
          style={{
            position: 'absolute',
            left: 1940,
            top: 20,
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
          }}
        >
          ▶ PREVIEW ALERT
        </button>
      </div>
    </ForestCtx.Provider>
  );
};

export default Alerts;