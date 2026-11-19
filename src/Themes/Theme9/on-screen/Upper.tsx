import React, { useMemo, memo, useEffect, useLayoutEffect, useRef, useState, useId, createContext, useContext } from 'react';
import { MatchData, useSortedTeams, isPlayerDead, Player } from '../../shared/hooks/unsortteams';
import { useLocalTeamThrowables, ThrowableKind } from '../../shared/hooks/useLocalTeamThrowables';
import { wwcdChance } from '../../shared/hooks/liveDerived';
import { TeamLogo } from '../../shared/components/TeamLogo';
// NOTE: no socket here — PublicThemeRenderer owns the single connection,
// merges 'bulkUpdate' and passes fresh `matchData` down as a prop.
//
// FOREST Upper — the TOP 5 teams that still have someone alive, one card
// each, in a centred row across the top. As a team is wiped, the next alive
// team (by rank) fills in automatically, so whoever is still alive at the
// end is what shows.
//   ┌ head      rank (leaf for 1–3) · logo on the white notched plate ·
//   │           tag + elims · 4 health bars
//   ├ SWAP      every 10 s the middle strip swaps between
//   │           UTILITIES (frag · smoke · molly · stun) and WWCD CHANCE
//   │           (a vine with 10 leaves that fill + a % tab; the favourite
//   │           gets a crown and a secondary-colour tab). The swap is a leaf
//   │           fringe sweeping across, rippling card to card.
//   └ a 3D vine weaves along each card's top edge (in front / behind).
// Motion:
//   enter     card drops in and settles
//   eliminated  the card shakes back and forth, an ELIMINATED stamp lands,
//             it greys out and shrinks away while leaves fall; its slot
//             closes smoothly and the rest glide over (FLIP)
//   pushed out of the top 5 (not eliminated) → a quiet fade
// Data: useSortedTeams 'live', useLocalTeamThrowables (by team slot),
// wwcdChance (shared liveDerived).

// ─────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────
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

interface UpperProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

// ─────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────
const TOP_N = 5; // cards on screen
const SWAP_EVERY_MS = 10000; // utilities ⇄ WWCD
const SWAP_MS = 900; // the leaf sweep
const SWAP_STAGGER_MS = 140; // ripple between cards

// ─────────────────────────────────────────────
// Palette + type
// ─────────────────────────────────────────────
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const DIM_TXT = 'rgba(255,255,255,0.62)';
const ALIVE = '#4CD964';
const LOW = '#F5B83D';
const KNOCK = '#E5484D';
const ZONE = '#3B8BFF';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

// ─────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────
const CARD_W = 300;
const GAP = 18;
const HEAD_H = 64;
const SWAP_H = 58;
const FOOT_H = 5;
const CARD_H = HEAD_H + SWAP_H + FOOT_H; // 127
const RADIUS = 8;
const BAR_W = 8;
const BAR_H = 40;
const LEAVE_MS = 1500;
const MOVE_MS = 560;
const ROW_TOP = 40;

/** White logo plate — traced from Layer_2.png (same as Live Stats / Alerts). */
const PLATE_CUT =
  'polygon(4% 0%, 82.9% 0%, 99.7% 77.7%, 82.6% 53.1%, 92.8% 100%, 10.2% 96%, 0.3% 46.9%, 18.2% 74.1%)';

// ─────────────────────────────────────────────
// Colour
// ─────────────────────────────────────────────
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
    head: [css(mix(dp, BLACK, 0.18)), css(mix(dp, BLACK, 0.45))],
    strip: [css(mix(dp, BLACK, 0.8)), css(mix(dp, BLACK, 0.93))],
    label: lum(s) < 0.35 ? css(mix(s, WHITE_RGB, 0.45)) : secondary,
    favInk: inkOn(secondary),
    leafP: leaf(mix(p, MOSS, 0.15)),
    leafS: leaf(mix(s, MOSS, 0.15)),
    leafM: leaf(mix(mix(p, s, 0.5), MOSS, 0.4)),
    meterOn: leaf(mix(s, WHITE_RGB, 0.08)), // lit WWCD leaves: secondary, bright on the dark strip
    vineA: { dark: css(mix(vineBase, BLACK, 0.72)), mid: css(mix(vineBase, BLACK, 0.12)), light: css(mix(s, WHITE_RGB, 0.6)) },
    vineB: { dark: css(mix(mix(vineBase, p, 0.3), BLACK, 0.75)), mid: css(mix(mix(vineBase, p, 0.3), BLACK, 0.22)), light: css(mix(p, WHITE_RGB, 0.6)) },
  };
}
type ForestPalette = ReturnType<typeof forestPalette>;
type VineCol = ForestPalette['vineA'];
type Tone = 'P' | 'S' | 'M';
const ForestCtx = createContext<{ pal: ForestPalette; gid: string }>({ pal: forestPalette('#2E7D4A', '#C9A24A'), gid: 'fu' });

const GRAIN =
  'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 4px), ' +
  'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 11px)';
const wood = (pair: string[]) => `${GRAIN}, linear-gradient(180deg, ${pair[0]}, ${pair[1]})`;

const KEYFRAMES = `
@keyframes up9In     { from { opacity: 0; transform: translateY(-16px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes up9Pop    { 0% { transform: scale(1.5); } 100% { transform: scale(1); } }
@keyframes up9Reveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes up9Fringe {
  0%   { transform: translateX(-16px); opacity: 1; }
  88%  { opacity: 1; }
  100% { transform: translateX(${CARD_W - 16}px); opacity: 0; }
}
/* eliminated: shake back and forth, then grey out and shrink away */
@keyframes up9Shake {
  0%   { transform: none; filter: none; opacity: 1; }
  8%   { transform: translateX(-18px) rotate(-2.5deg); }
  18%  { transform: translateX(16px) rotate(2.5deg); }
  28%  { transform: translateX(-13px) rotate(-1.8deg); }
  38%  { transform: translateX(10px) rotate(1.2deg); }
  46%  { transform: translateX(-5px) rotate(-.5deg); }
  52%  { transform: none; filter: grayscale(.2); opacity: 1; }
  100% { transform: translateY(22px) scale(.72); filter: grayscale(1) brightness(.7); opacity: 0; }
}
@keyframes up9Collapse { 0%, 55% { width: ${CARD_W}px; margin: 0 ${GAP / 2}px; } 100% { width: 0; margin: 0; } }
@keyframes up9Out      { to { opacity: 0; transform: translateY(-10px); } }
@keyframes up9Stamp    { 0% { opacity: 0; transform: scale(1.8) rotate(-8deg); } 14% { opacity: 1; transform: scale(1) rotate(-4deg); } 100% { opacity: 1; transform: scale(1) rotate(-4deg); } }
@keyframes up9Fall {
  0%   { transform: translate(0,0) rotate(0deg); opacity: 0; }
  12%  { opacity: 1; }
  100% { transform: translate(var(--dx), 120px) rotate(var(--rot)); opacity: 0; }
}
@keyframes up9Fade { from { opacity: 0; } to { opacity: 1; } }
.up9-card   { animation: up9In .55s cubic-bezier(.2,.8,.2,1) both; }
.up9-pop    { display: inline-block; animation: up9Pop .35s cubic-bezier(.2,.8,.2,1); }
.up9-reveal { animation: up9Reveal ${SWAP_MS}ms cubic-bezier(.65,0,.25,1) both; }
.up9-fringe { animation: up9Fringe ${SWAP_MS}ms cubic-bezier(.65,0,.25,1) both; }
.up9-elim   { animation: up9Shake ${LEAVE_MS}ms cubic-bezier(.4,0,.4,1) forwards; }
.up9-slot-out  { animation: up9Collapse ${LEAVE_MS}ms cubic-bezier(.45,0,.2,1) forwards; overflow: visible; }
.up9-slot-fade { animation: up9Collapse ${Math.round(LEAVE_MS * 0.5)}ms cubic-bezier(.45,0,.2,1) forwards; overflow: visible; }
.up9-out    { animation: up9Out ${Math.round(LEAVE_MS * 0.5)}ms ease forwards; }
.up9-stamp  { animation: up9Stamp ${LEAVE_MS}ms cubic-bezier(.2,.9,.3,1.2) both; }
.up9-fall   { animation: up9Fall 1.3s cubic-bezier(.4,.1,.6,1) both; }
.up9-deco   { animation: up9Fade .6s ease-out .3s both; }
@media (prefers-reduced-motion: reduce) {
  .up9-card, .up9-pop, .up9-reveal, .up9-fringe, .up9-elim, .up9-out, .up9-stamp, .up9-fall, .up9-deco, .up9-slot-out, .up9-slot-fade { animation: none; }
}
`;

// ─────────────────────────────────────────────
// Leaves / stems
// ─────────────────────────────────────────────
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
        <linearGradient id={`${gid}-meter`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.meterOn[0]} />
          <stop offset="0.45" stopColor={pal.meterOn[1]} />
          <stop offset="0.55" stopColor={pal.meterOn[2]} />
          <stop offset="1" stopColor={pal.meterOn[2]} />
        </linearGradient>
        <filter id={`${gid}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="1.2" dy="2.4" stdDeviation="1.6" floodColor="#000" floodOpacity="0.55" />
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

const Stem = ({ d, w, col }: { d: string; w: number; col: VineCol }) => {
  const base = { d, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <g>
      <path {...base} stroke={col.dark} strokeWidth={w} />
      <path {...base} stroke={col.mid} strokeWidth={w * 0.6} transform="translate(-0.5,-0.9)" />
      <path {...base} stroke={col.light} strokeWidth={Math.max(1, w * 0.2)} strokeOpacity={0.65} transform="translate(-0.9,-1.6)" />
    </g>
  );
};

// ─────────────────────────────────────────────
// Card-top vine — weaves along the top edge, in front of / behind the card
// (card-local coordinates, y=0 is the card's top edge)
// ─────────────────────────────────────────────
type Pt = [number, number];
const TOP_VINE = (() => {
  const pts: Pt[] = [];
  let inner = false;
  for (let x = 6; x <= CARD_W - 40; x += 36) {
    pts.push([x, inner ? 7 : -8]);
    inner = !inner;
  }
  const f = (n: number) => n.toFixed(1);
  const segs: { d: string; front: boolean }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = (b[0] - a[0]) / 2;
    // each dip below the edge (an inner point + its two segments) alternates front / behind
    const innerIdx = a[1] > 0 ? i : i + 1;
    segs.push({ d: `M${f(a[0])},${f(a[1])} C${f(a[0] + dx)},${f(a[1])} ${f(b[0] - dx)},${f(b[1])} ${f(b[0])},${f(b[1])}`, front: Math.floor(innerIdx / 2) % 2 === 0 });
  }
  const tones: Tone[] = ['M', 'P', 'S'];
  const leaves = pts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p[1] < 0)
    .map(({ p, i }) => ({ x: p[0], y: p[1], r: -90 + ((i * 37) % 60) - 30, s: 0.42 + ((i * 13) % 14) / 100, tone: tones[i % 3] }));
  const end = pts[pts.length - 1];
  return { segs, leaves, end };
})();
const TENDRIL = 'M0,0 c0,-12 12,-19 19,-12 c6,6 0,14 -6,10 c-4,-3 -2,-8 2,-6';

const CardVine = ({ front }: { front: boolean }) => {
  const { pal, gid } = useContext(ForestCtx);
  return (
    <svg
      className="up9-deco"
      width={CARD_W}
      height={30}
      viewBox={`0 -20 ${CARD_W} 30`}
      style={{ position: 'absolute', left: 0, top: -20, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 4 : 0 }}
      aria-hidden
    >
      <g filter={`url(#${gid}-shadow)`}>
        {TOP_VINE.segs
          .filter((s) => s.front === front)
          .map((s, i) => (
            <Stem key={i} d={s.d} w={5} col={pal.vineA} />
          ))}
        {front && (
          <>
            <g transform={`translate(${TOP_VINE.end[0]},${TOP_VINE.end[1]})`}>
              <Stem d={TENDRIL} w={2.4} col={pal.vineA} />
            </g>
            {TOP_VINE.leaves.map((l, i) => (
              <g key={i} transform={`translate(${l.x},${l.y}) rotate(${l.r.toFixed(1)}) scale(${l.s.toFixed(2)})`}>
                <LeafShape tone={l.tone} />
              </g>
            ))}
          </>
        )}
      </g>
    </svg>
  );
};

// ─────────────────────────────────────────────
// Health bar — rounded stem with gloss (same colours as Live Stats)
// ─────────────────────────────────────────────
const PlayerHealthBar = memo(
  ({ player, apiEnabled }: { player: Player; apiEnabled: boolean }) => {
    const isDead = isPlayerDead(player);
    const isKnocked = player.liveState === 4;
    const ratio = isDead ? 0 : apiEnabled ? Math.max(0, Math.min(1, player.health / (player.healthMax || 100))) : 1;
    const color = isKnocked ? KNOCK : ratio < 0.3 ? LOW : ALIVE;
    return (
      <div
        style={{
          position: 'relative',
          width: BAR_W,
          height: BAR_H,
          background: 'rgba(0,0,0,0.42)',
          borderRadius: 3,
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,.6), 0 1px 0 rgba(255,255,255,.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: ratio * BAR_H,
            backgroundColor: isDead ? 'transparent' : color,
            backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.38) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,.28) 100%)',
            borderRadius: 3,
            transition: 'height 300ms ease, background-color 300ms ease',
          }}
        />
      </div>
    );
  },
  (a, b) =>
    a.player.health === b.player.health &&
    a.player.healthMax === b.player.healthMax &&
    a.player.liveState === b.player.liveState &&
    a.player.bHasDied === b.player.bHasDied &&
    a.apiEnabled === b.apiEnabled
);
PlayerHealthBar.displayName = 'PlayerHealthBar';

// ─────────────────────────────────────────────
// Throwable icons (24×24)
// ─────────────────────────────────────────────
type IconProps = { color: string; size?: number };

const FragIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="6.5" cy="5" r="2.2" fill="none" stroke={color} strokeWidth="1.6" />
    <rect x="9" y="4" width="6" height="4" rx="0.8" fill={color} />
    <path d="M14.5 4.2 L19.5 2 L20.6 3.6 L15.4 7.4 Z" fill={color} />
    <ellipse cx="12" cy="15.2" rx="6.6" ry="7.2" fill={color} />
    <path d="M5.6 13 H18.4 M5.6 17.4 H18.4 M9.6 8.4 V22 M14.4 8.4 V22" stroke={INK} strokeWidth="1.1" opacity="0.5" />
  </svg>
);
const SmokeIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="16.5" cy="6.5" r="3" fill={color} opacity="0.6" />
    <circle cx="20" cy="3.6" r="2.2" fill={color} opacity="0.45" />
    <circle cx="13.2" cy="3.4" r="2" fill={color} opacity="0.4" />
    <rect x="5.5" y="8.5" width="9" height="13.5" rx="1.6" fill={color} />
    <rect x="6.5" y="6.4" width="7" height="2.4" rx="0.6" fill={color} />
    <rect x="5.5" y="12" width="9" height="1.4" fill={INK} opacity="0.5" />
    <rect x="5.5" y="17.6" width="9" height="1.4" fill={INK} opacity="0.5" />
  </svg>
);
const MolotovIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 0.4 C15 3.2 15.6 5 13.8 7.2 H10.2 C8.4 5 9.6 2.6 12 0.4 Z" fill={color} />
    <path d="M12 2.6 C13.4 4.2 13.5 5.4 12.6 6.8 H11.4 C10.6 5.4 11 4 12 2.6 Z" fill="#ffe14d" />
    <rect x="10.4" y="7" width="3.2" height="4" fill={color} opacity="0.75" />
    <path d="M7.5 13.2 Q7.5 11 9.7 11 H14.3 Q16.5 11 16.5 13.2 V21.2 Q16.5 22.6 15.1 22.6 H8.9 Q7.5 22.6 7.5 21.2 Z" fill={color} />
    <path d="M7.5 15.6 Q12 14.4 16.5 15.6" fill="none" stroke={INK} strokeWidth="1.1" opacity="0.5" />
  </svg>
);
const StunIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 0.5 V3.6 M4.4 2.6 L6.4 5 M19.6 2.6 L17.6 5 M1.6 8.4 H4.4 M22.4 8.4 H19.6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <rect x="7" y="7.4" width="10" height="15" rx="1.8" fill={color} />
    <rect x="9" y="5.2" width="6" height="2.6" rx="0.6" fill={color} />
    <path d="M12.8 11 L9.8 16.2 H11.8 L11 20 L14.4 14.6 H12.4 L13.4 11 Z" fill={INK} opacity="0.75" />
  </svg>
);

// The game only reports the spectated team's backpack, so a team's numbers
// are from the last time it was watched (useLocalTeamThrowables); a team
// never watched this match shows dashes.
const THROWABLES: { kind: ThrowableKind; label: string; color: string; Icon: React.FC<IconProps> }[] = [
  { kind: 'frag', label: 'FRAG', color: '#4ade80', Icon: FragIcon },
  { kind: 'smoke', label: 'SMOKE', color: '#e5e7eb', Icon: SmokeIcon },
  { kind: 'molotov', label: 'MOLLY', color: '#fb923c', Icon: MolotovIcon },
  { kind: 'stun', label: 'STUN', color: '#facc15', Icon: StunIcon },
];

// ─────────────────────────────────────────────
// Swap strip views
// ─────────────────────────────────────────────
type Mode = 'util' | 'wwcd';

const UtilitiesView = ({ carried }: { carried: Record<ThrowableKind, number> | null }) => (
  <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
    {THROWABLES.map(({ kind, label, color, Icon }, i) => {
      const count = carried ? carried[kind] ?? 0 : null;
      const empty = count === null || count === 0;
      return (
        <div key={kind} title={label} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {i > 0 && <span style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 1, background: 'rgba(255,255,255,0.14)' }} />}
          <span style={{ display: 'flex', opacity: empty ? 0.28 : 1, filter: empty ? 'grayscale(1)' : 'drop-shadow(0 2px 2px rgba(0,0,0,.5))' }}>
            <Icon color={color} size={32} />
          </span>
          <span
            key={String(count)}
            className={empty ? undefined : 'up9-pop'}
            style={{ minWidth: 12, textAlign: 'center', fontSize: 30, color: empty ? 'rgba(255,255,255,0.3)' : WHITE, fontVariantNumeric: 'tabular-nums', textShadow: '0 2px 2px rgba(0,0,0,.5)' }}
          >
            {count === null ? '–' : count}
          </span>
        </div>
      );
    })}
  </div>
);

const Crown = ({ color, size = 14 }: { color: string; size?: number }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
  </svg>
);

/** WWCD as a vine: 10 leaves along a stem, filled up to the chance. */
const METER_W = 150;
const WwcdView = ({ pct, fav }: { pct: number; fav: boolean }) => {
  const { pal, gid } = useContext(ForestCtx);
  const lit = Math.round(pct / 10);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
      <div style={{ flex: 'none', width: 56, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {fav ? <Crown color={pal.label} /> : <span style={{ height: 10 }} />}
        <span style={{ fontSize: 15, letterSpacing: '0.12em', color: fav ? pal.label : DIM_TXT }}>WWCD</span>
      </div>
      <svg width={METER_W} height={44} viewBox={`0 -22 ${METER_W} 44`} style={{ flex: 'none', overflow: 'visible' }} aria-hidden>
        <path d={`M2,0 C${METER_W * 0.25},-6 ${METER_W * 0.5},6 ${METER_W * 0.75},-3 S${METER_W - 6},2 ${METER_W - 2},0`} stroke={pal.vineA.dark} strokeWidth={3.4} fill="none" strokeLinecap="round" />
        <path d={`M2,0 C${METER_W * 0.25},-6 ${METER_W * 0.5},6 ${METER_W * 0.75},-3 S${METER_W - 6},2 ${METER_W - 2},0`} stroke={pal.vineA.mid} strokeWidth={1.8} fill="none" strokeLinecap="round" transform="translate(0,-0.6)" />
        {Array.from({ length: 10 }, (_, i) => {
          const x = 8 + i * ((METER_W - 18) / 9);
          const up = i % 2 === 0;
          return (
            <g key={i} transform={`translate(${x.toFixed(1)},0) rotate(${up ? -58 : 58}) scale(0.44)`}>
              <path d={LEAF} fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.28)" strokeWidth={1.6} />
              <g style={{ opacity: i < lit ? 1 : 0, transition: `opacity 400ms ease ${i * 40}ms` }}>
                <path d={LEAF} fill={`url(#${gid}-meter)`} />
                <path d={LEAF_TOP} fill="#fff" opacity={0.18} />
              </g>
            </g>
          );
        })}
      </svg>
      <div
        style={{
          marginLeft: 'auto',
          alignSelf: 'stretch',
          width: 76,
          flex: 'none',
          background: fav ? `linear-gradient(180deg, ${pal.label}, ${pal.secondary})` : 'rgba(255,255,255,0.08)',
          color: fav ? pal.favInk : WHITE,
          clipPath: 'polygon(12px 0, 100% 0, 100% 100%, 0 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: 8,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span key={pct} className="up9-pop" style={{ fontSize: 30 }}>
          {pct}
        </span>
        <span style={{ fontSize: 15, marginLeft: 1, marginTop: 7, opacity: 0.8 }}>%</span>
      </div>
    </div>
  );
};

/** Leading edge of the swap: a short stem with leaves fanning off it. */
const SwapFringe = () => {
  const { pal, gid } = useContext(ForestCtx);
  return (
    <svg width={32} height={SWAP_H + 12} viewBox={`-16 -6 32 ${SWAP_H + 12}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        <path d={`M0,-4 C-4,${SWAP_H * 0.35} 4,${SWAP_H * 0.65} 0,${SWAP_H + 4}`} stroke={pal.vineA.dark} strokeWidth={3} fill="none" strokeLinecap="round" />
        {[6, 18, 30, 42, 54].map((y, i) => (
          <g key={i} transform={`translate(0,${y}) rotate(${i % 2 ? 200 : -20}) scale(0.5)`}>
            <LeafShape tone={i % 2 ? 'S' : 'P'} vein={false} />
          </g>
        ))}
      </g>
    </svg>
  );
};

/** The middle strip: keeps the previous view underneath and sweeps the new one in. */
const SwapStrip: React.FC<{ mode: Mode; order: number; carried: Record<ThrowableKind, number> | null; pct: number; fav: boolean }> = ({
  mode,
  order,
  carried,
  pct,
  fav,
}) => {
  const { pal } = useContext(ForestCtx);
  const [layers, setLayers] = useState<{ cur: Mode; prev: Mode | null; n: number }>({ cur: mode, prev: null, n: 0 });
  useEffect(() => {
    setLayers((l) => (l.cur === mode ? l : { cur: mode, prev: l.cur, n: l.n + 1 }));
  }, [mode]);
  const view = (m: Mode) => (m === 'util' ? <UtilitiesView carried={carried} /> : <WwcdView pct={pct} fav={fav} />);
  const delay = `${order * SWAP_STAGGER_MS}ms`;
  return (
    <div style={{ position: 'relative', height: SWAP_H, background: wood(pal.strip), overflow: 'hidden', fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: pal.label, opacity: 0.8, zIndex: 3 }} />
      {layers.prev && <div style={{ position: 'absolute', inset: 0 }}>{view(layers.prev)}</div>}
      <div
        key={layers.n}
        className={layers.n ? 'up9-reveal' : undefined}
        style={{ position: 'absolute', inset: 0, background: wood(pal.strip), animationDelay: delay }}
      >
        {view(layers.cur)}
      </div>
      {layers.n > 0 && (
        <div key={`f${layers.n}`} className="up9-fringe" style={{ position: 'absolute', left: 0, top: -6, zIndex: 2, animationDelay: delay }}>
          <SwapFringe />
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// TeamCard
// ─────────────────────────────────────────────
interface TeamCardProps {
  team: any;
  rank: number;
  wwcd: number;
  apiEnabled: boolean;
  carried: Record<ThrowableKind, number> | null;
  order: number;
  fav: boolean;
  mode: Mode;
  leaving: 'elim' | 'out' | null;
}

const RankMark = ({ rank }: { rank: number }) => {
  const { pal, gid } = useContext(ForestCtx);
  const onLeaf = rank <= 3;
  return (
    <div style={{ width: 44, flex: 'none', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.3)' }}>
      {onLeaf && (
        <svg width={44} height={36} viewBox="-2 -15 44 30" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.5))' }} aria-hidden>
          <path d={LEAF} fill={`url(#${gid}-leaf${rank === 1 ? 'S' : 'M'})`} />
          <path d={LEAF_TOP} fill="#fff" opacity={0.15} />
        </svg>
      )}
      <span
        style={{
          position: 'relative',
          fontSize: 26,
          paddingRight: onLeaf ? 4 : 0,
          color: rank === 1 ? pal.favInk : WHITE,
          textShadow: rank === 1 && pal.favInk !== WHITE ? '0 1px 0 rgba(255,255,255,.4)' : '0 0 1px rgba(0,0,0,.9), 0 2px 2px rgba(0,0,0,.6)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rank}
      </span>
    </div>
  );
};

const FALL = [
  { left: '18%', dx: '-16px', rot: '-200deg', delay: 0.55, t: 'P' as Tone },
  { left: '44%', dx: '12px', rot: '220deg', delay: 0.7, t: 'S' as Tone },
  { left: '70%', dx: '-10px', rot: '-180deg', delay: 0.62, t: 'M' as Tone },
  { left: '88%', dx: '14px', rot: '190deg', delay: 0.8, t: 'P' as Tone },
];

const TeamCard: React.FC<TeamCardProps> = ({ team, rank, wwcd, apiEnabled, carried, order, fav, mode, leaving }) => {
  const { pal, gid } = useContext(ForestCtx);
  const players: Player[] = (team.players ?? []).slice(0, 4);
  const outside = !!team.hasOutsideBlueCircle && !leaving;
  const pct = Math.max(0, Math.min(100, Math.round(Number(wwcd) || 0)));
  const textShadow = '0 0 1px rgba(0,0,0,.9), 0 2px 3px rgba(0,0,0,.55)';

  return (
    <div
      className={leaving === 'elim' ? 'up9-elim' : leaving === 'out' ? 'up9-out' : 'up9-card'}
      style={{
        animationDelay: leaving ? '0ms' : `${Math.min(order, 6) * 70}ms`,
        position: 'relative',
        width: CARD_W,
        height: CARD_H,
        fontFamily: FONT,
        fontWeight: 700,
        lineHeight: 1,
        transformOrigin: '50% 30%',
      }}
    >
      <CardVine front={false} />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: CARD_W,
          height: CARD_H,
          borderRadius: RADIUS,
          overflow: 'hidden',
          boxShadow: `0 10px 18px rgba(0,0,0,.4), 0 0 0 1px rgba(0,0,0,.4)${fav ? `, 0 0 0 2px ${pal.label}` : ''}`,
        }}
      >
        {/* ── head ── */}
        <div style={{ position: 'relative', height: HEAD_H, display: 'flex', alignItems: 'stretch', background: wood(pal.head) }}>
          {outside && (
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(59,139,255,.32), rgba(59,139,255,.08) 70%)', boxShadow: `inset 4px 0 0 ${ZONE}`, pointerEvents: 'none' }} />
          )}
          <RankMark rank={rank} />

          {/* logo on the white notched plate */}
          <div style={{ width: 70, height: 44, flex: 'none', alignSelf: 'center', marginLeft: 4, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))' }}>
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
              <TeamLogo logo={team.teamLogo} flag={team.teamFlag} fallback={'/def_logo.avif'} alt={team.teamTag} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          </div>

          {/* tag + elims */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 6 }}>
            <span style={{ fontSize: 30, color: WHITE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow }}>{team.teamTag?.toUpperCase()}</span>
            <span style={{ marginTop: 4, fontSize: 15, letterSpacing: '0.14em', color: DIM_TXT }}>
              <span key={team.totalKills} className="up9-pop" style={{ color: pal.label, fontSize: 18 }}>
                {team.totalKills ?? 0}
              </span>{' '}
              ELIMS
            </span>
          </div>

          {/* health bars */}
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px 0 4px' }}>
            {players.length === 0 ? (
              <span style={{ fontSize: 15, color: DIM_TXT, letterSpacing: '0.12em' }}>MISS</span>
            ) : (
              players.map((p) => <PlayerHealthBar key={p._id} player={p} apiEnabled={apiEnabled} />)
            )}
          </div>
        </div>

        {/* ── swap strip: utilities ⇄ WWCD ── */}
        <SwapStrip mode={mode} order={order} carried={carried} pct={pct} fav={fav} />

        {/* ── foot ── */}
        <div style={{ height: FOOT_H, background: fav ? pal.label : `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} />

        {/* eliminated stamp */}
        {leaving === 'elim' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,6,4,.55)' }}>
            <span
              className="up9-stamp"
              style={{
                fontSize: 26,
                letterSpacing: '0.18em',
                color: WHITE,
                border: `3px solid ${pal.label}`,
                padding: '6px 8px 4px 13px',
                whiteSpace: 'nowrap',
                background: 'rgba(0,0,0,.55)',
                textShadow,
              }}
            >
              ELIMINATED
            </span>
          </div>
        )}
      </div>

      <CardVine front />

      {/* leaves falling off an eliminated card */}
      {leaving === 'elim' &&
        FALL.map((l, i) => (
          <svg
            key={i}
            className="up9-fall"
            width={24}
            height={15}
            viewBox="0 -12 40 24"
            style={{ position: 'absolute', left: l.left, top: -8, zIndex: 7, animationDelay: `${l.delay}s`, '--dx': l.dx, '--rot': l.rot } as React.CSSProperties}
            aria-hidden
          >
            <path d={LEAF} fill={`url(#${gid}-leaf${l.t})`} />
          </svg>
        ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// Upper (main component)
// ─────────────────────────────────────────────
const Upper: React.FC<UpperProps> = ({ tournament, round, matchData }) => {
  // Shared ranking (placePoints then kills) + derived aliveCount / totalKills.
  const sortedTeams = useSortedTeams(matchData, null, 'live');
  const throwables = useLocalTeamThrowables();

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const apiEnabled = round?.apiEnable === true;

  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fu' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  // Every team that still has someone alive (keeping its overall rank) → top 5.
  const aliveTeams = useMemo(
    () =>
      sortedTeams
        .map((team: any, i: number) => ({ team, rank: i + 1 }))
        .filter(({ team }: any) => team.aliveCount > 0)
        .map((x: any) => ({ ...x, wwcd: wwcdChance(x.team, apiEnabled) })),
    [sortedTeams, apiEnabled]
  );
  const shownTeams = useMemo(() => aliveTeams.slice(0, TOP_N), [aliveTeams]);
  // favourite = highest WWCD among ALL alive teams (shown only if it's in the top 5)
  const favId = useMemo(() => {
    let best: any = null;
    for (const x of aliveTeams) if (x.wwcd > 0 && (!best || x.wwcd > best.wwcd)) best = x;
    return best ? String(best.team._id) : null;
  }, [aliveTeams]);
  const byId = useMemo(() => {
    const m = new Map<string, any>();
    sortedTeams.forEach((t: any) => m.set(String(t._id), t));
    return m;
  }, [sortedTeams]);

  // ── utilities ⇄ WWCD every 10 s ──
  const [mode, setMode] = useState<Mode>('util');
  useEffect(() => {
    const t = window.setInterval(() => setMode((m) => (m === 'util' ? 'wwcd' : 'util')), SWAP_EVERY_MS);
    return () => clearInterval(t);
  }, []);

  // ── display list: shown cards + cards that are animating out ──
  type Item = { key: string; data: any; leaving: 'elim' | 'out' | null };
  const [items, setItems] = useState<Item[]>([]);
  const leaveTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setItems((prev) => {
      const next: Item[] = shownTeams.map((x: any) => ({ key: String(x.team._id), data: x, leaving: null }));
      const showing = new Set(next.map((n) => n.key));
      prev.forEach((p, idx) => {
        if (showing.has(p.key)) return;
        // eliminated (nobody alive) vs merely pushed out of the top 5
        const latest = byId.get(p.key);
        const reason: 'elim' | 'out' = p.leaving ?? (!latest || latest.aliveCount <= 0 ? 'elim' : 'out');
        const data = latest ? { ...p.data, team: latest } : p.data;
        next.splice(Math.min(idx, next.length), 0, { key: p.key, data, leaving: reason });
        if (!leaveTimers.current.has(p.key)) {
          leaveTimers.current.set(
            p.key,
            window.setTimeout(() => {
              leaveTimers.current.delete(p.key);
              setItems((cur) => cur.filter((c) => !(c.key === p.key && c.leaving)));
            }, reason === 'elim' ? LEAVE_MS : Math.round(LEAVE_MS * 0.5))
          );
        }
      });
      return next;
    });
  }, [shownTeams, byId]);

  useEffect(() => () => leaveTimers.current.forEach((t) => clearTimeout(t)), []);

  // ── FLIP: glide cards to their new slot whenever the order changes ──
  const nodes = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastRects = useRef<Map<string, DOMRect>>(new Map());
  useLayoutEffect(() => {
    const rects = new Map<string, DOMRect>();
    nodes.current.forEach((el, key) => {
      const r = el.getBoundingClientRect();
      rects.set(key, r);
      const old = lastRects.current.get(key);
      if (old && (Math.abs(old.left - r.left) > 1 || Math.abs(old.top - r.top) > 1)) {
        el.animate?.([{ transform: `translate(${old.left - r.left}px, ${old.top - r.top}px)` }, { transform: 'translate(0, 0)' }], {
          duration: MOVE_MS,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        });
      }
    });
    lastRects.current = rects;
  });

  if (!matchData) {
    return (
      <div style={{ width: 1920, height: 1080, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            right: 30,
            top: 40,
            width: 400,
            height: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: '0.14em',
            background: WHITE,
            color: INK,
            borderLeft: `8px solid ${primary}`,
          }}
        >
          NO MATCH DATA
        </div>
      </div>
    );
  }

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative' }}>
        <style>{KEYFRAMES}</style>
        <ForestDefs />
        <div
          style={{
            position: 'absolute',
            top: ROW_TOP,
            left: 0,
            width: 1920,
            display: 'flex',
            justifyContent: 'center', // the row stays centred as it shrinks
            alignItems: 'flex-start',
          }}
        >
          {items.map(({ key, data, leaving }, order) => {
            const { team, rank, wwcd } = data;
            const slot = Number(team.slot);
            const carried = throwables?.get(slot) as Record<ThrowableKind, number> | undefined;
            return (
              <div
                key={key}
                ref={(el) => {
                  if (el) nodes.current.set(key, el);
                  else nodes.current.delete(key);
                }}
                className={leaving === 'elim' ? 'up9-slot-out' : leaving === 'out' ? 'up9-slot-fade' : undefined}
                style={{ width: CARD_W, margin: `0 ${GAP / 2}px`, flex: 'none' }}
              >
                <TeamCard
                  team={team}
                  rank={rank}
                  wwcd={wwcd}
                  order={order}
                  fav={key === favId && !leaving}
                  mode={mode}
                  apiEnabled={apiEnabled}
                  carried={carried ?? null}
                  leaving={leaving}
                />
              </div>
            );
          })}
        </div>
      </div>
    </ForestCtx.Provider>
  );
};

export default Upper;