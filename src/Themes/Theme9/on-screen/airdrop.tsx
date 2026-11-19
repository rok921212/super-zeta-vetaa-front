// Theme9 Airdrop Info — this theme's own copy (view key 'AirdropInfo');
// restyle freely, other themes are not affected.
//
// FOREST airdrop panel. When a crate lands, the panel opens from the LEFT
// edge of the screen in three steps, stays POP_MS, then closes back to the
// LEFT in three steps. Nothing is on screen between drops.
//
//   IN  (all left → right, each behind a fringe of leaves)
//     1) the grove: dark plate, glowing parachute, "AIRDROP INCOMING"
//     2) the canopy: theme-colour sweep
//     3) the crate panel itself; its lines settle one by one, then a 3D vine
//        grows up the right side and along the top (weaving in front of /
//        behind the panel) with leaves unfurling
//   OUT (all right → left, back into the screen edge)
//     vine retracts → 3) panel → 2) canopy → 1) grove
//
// The panel reads top to bottom:
//   [ (chute) AIRDROP          #05 ]   crate number on a secondary-colour tab
//   gun icon  GUN NAME                 the gun, large, with its ammo
//             ×60 7.62MM
//   ─ scope / attachments / meds / outfit, one line each
//   ─ LEVEL 3 GEAR  vest helmet backpack
//
// While there is no real crate (loading, relay not reached yet, before the
// match's first drop, dashboard previews) a DEMO SESSION plays: demo crates
// land one by one on a loop. The first real crate replaces it. The DEMO
// button (off-canvas, right of 1920) turns the demo off: then the overlay
// shows nothing until real drop data arrives.
//
// Data: useLocalAirdrops (relay /local/airdrops, local only).

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useId, createContext, useContext } from 'react';
import { useLocalAirdrops, AIRDROP_DEMO_CRATES, type AirdropCrate } from '../../shared/hooks/useLocalAirdrops.ts';
import { airdropItem, CATEGORY_ORDER } from '../../shared/airdropItems.ts';
import AirdropIcon, { readableOn, isNearWhite } from '../../shared/overlays/AirdropIcons';
import { isOverlayRoute } from '../../../login/api.tsx';
import { SIM_AIRDROP_EVENT } from '../../../overlayClient/detectors.ts';

const POP_MS = 12_000;
/** Demo session: a crate lands every DEMO_STEP_MS, its panel stays DEMO_POP_MS. */
export const DEMO_STEP_MS = 10_000;
export const DEMO_POP_MS = 6_000;
const FONT = 'AGENCYB, "Arial Narrow", Arial, sans-serif';
const PANEL_W = 500;
const PANEL_TOP = 250;
const RADIUS = 10; // right-hand corners; the left side is flush with the screen

/* ── three-step timing ── */
const WIPE_MS = 600;
const T_GROVE = 30;
const T_CANOPY = 650;
const T_PANEL = 1200;
const T_VINES = T_PANEL + WIPE_MS;
// outro, from the moment the crate stops showing
const O_PANEL = 520; // after the vine has started retracting
const O_CANOPY = O_PANEL + 500;
const O_GROVE = O_CANOPY + 500;
const O_DONE = O_GROVE + WIPE_MS + 60;

interface Props {
  tournament: { primaryColor?: string; secondaryColor?: string } | any;
  /** Unused today; kept so every theme view gets the same props. */
  matchData?: unknown;
}

/** Items of a crate, gun first, armour last. */
function sortItems(items: AirdropCrate['items']) {
  return [...items].sort(
    (a, b) => CATEGORY_ORDER.indexOf(airdropItem(a.id).category) - CATEGORY_ORDER.indexOf(airdropItem(b.id).category),
  );
}

/** The demo session's position: which demo crate is current, and whether its panel is up. */
function useDemoClock(on: boolean): { index: number; popping: boolean } {
  const [t, setT] = useState(0);
  const started = useRef(0);
  useEffect(() => {
    if (!on) return undefined;
    started.current = Date.now();
    setT(0);
    const timer = window.setInterval(() => setT(Date.now() - started.current), 500);
    // The home simulator's AIRDROP button: the next demo crate lands now.
    const drop = () => {
      const cycle = DEMO_STEP_MS * AIRDROP_DEMO_CRATES.length;
      const now = Date.now();
      const index = Math.floor(((now - started.current) % cycle) / DEMO_STEP_MS);
      started.current = now - ((index + 1) % AIRDROP_DEMO_CRATES.length) * DEMO_STEP_MS;
      setT(now - started.current);
    };
    window.addEventListener(SIM_AIRDROP_EVENT, drop);
    return () => { window.clearInterval(timer); window.removeEventListener(SIM_AIRDROP_EVENT, drop); };
  }, [on]);
  const inCycle = t % (DEMO_STEP_MS * AIRDROP_DEMO_CRATES.length);
  return { index: Math.floor(inCycle / DEMO_STEP_MS), popping: inCycle % DEMO_STEP_MS < DEMO_POP_MS };
}

/** Remembered per browser source (each OBS source has its own storage). */
const DEMO_PREF_KEY = 'airdropDemo';

function readDemoPref(): boolean {
  try {
    return window.localStorage.getItem(DEMO_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeDemoPref(on: boolean) {
  try {
    window.localStorage.setItem(DEMO_PREF_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the choice just lasts until the page reloads.
  }
}

/* ─────────────────────────────────────────────
   Colour
   ───────────────────────────────────────────── */
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

function forestPalette(primary: string, secondary: string) {
  const p = toRgb(primary);
  const s = toRgb(secondary);
  const dp = deepen(p);
  const vineBase = mix(mix(p, s, 0.5), MOSS, 0.5);
  const leaf = (c: RGB): [string, string, string] => [css(mix(c, WHITE_RGB, 0.42)), css(c), css(mix(c, BLACK, 0.55))];
  // the crate-number tab: secondary, or ink if the secondary is near white
  const tab = isNearWhite(secondary) ? '#0c0c0e' : secondary;
  return {
    primary,
    secondary,
    head: [css(mix(dp, BLACK, 0.72)), css(mix(dp, BLACK, 0.9))],
    gun: [css(mix(dp, BLACK, 0.1)), css(mix(dp, BLACK, 0.42))],
    rowA: [css(mix(dp, BLACK, 0.38)), css(mix(dp, BLACK, 0.52))],
    rowB: [css(mix(dp, BLACK, 0.5)), css(mix(dp, BLACK, 0.64))],
    grove: [css(mix(dp, BLACK, 0.72)), css(mix(dp, BLACK, 0.92))],
    canopy: [css(mix(p, WHITE_RGB, 0.12)), primary, css(mix(p, BLACK, 0.55))],
    glow: rgba(mix(s, WHITE_RGB, 0.35), 0.55),
    label: lum(s) < 0.35 ? css(mix(s, WHITE_RGB, 0.45)) : secondary,
    tab,
    tabInk: isNearWhite(secondary) ? '#fff' : readableOn(secondary),
    disc: [css(mix(s, WHITE_RGB, 0.25)), secondary, css(mix(s, BLACK, 0.45))],
    discInk: readableOn(secondary),
    leafP: leaf(mix(p, MOSS, 0.15)),
    leafS: leaf(mix(s, MOSS, 0.15)),
    leafM: leaf(mix(mix(p, s, 0.5), MOSS, 0.4)),
    vineA: { dark: css(mix(vineBase, BLACK, 0.72)), mid: css(mix(vineBase, BLACK, 0.12)), light: css(mix(s, WHITE_RGB, 0.6)) },
  };
}
type ForestPalette = ReturnType<typeof forestPalette>;
type VineCol = ForestPalette['vineA'];
type Tone = 'P' | 'S' | 'M';
const ForestCtx = createContext<{ pal: ForestPalette; gid: string }>({ pal: forestPalette('#2E7D4A', '#C9A24A'), gid: 'fa' });

const GRAIN =
  'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 4px), ' +
  'repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 11px)';
const wood = (pair: string[]) => `${GRAIN}, linear-gradient(180deg, ${pair[0]}, ${pair[1]})`;

const KEYFRAMES = `
@keyframes adLine { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
@keyframes adPop  { 0% { transform: scale(.5) rotate(-10deg); opacity: 0; } 70% { transform: scale(1.1); opacity: 1; } 100% { transform: none; } }
@keyframes adBase { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes adEdge { 0%, 85% { opacity: 1; } 100% { opacity: 0; } }
@keyframes adGlow { from { opacity: .45; transform: scale(.94); } to { opacity: 1; transform: scale(1.04); } }
.ad-line { animation: adLine .38s cubic-bezier(.22,1,.36,1) both; }
.ad-pop  { animation: adPop .5s cubic-bezier(.34,1.56,.64,1) both; }
.ad-base { animation: adBase .5s cubic-bezier(.22,1,.36,1) both; transform-origin: left; }
.ad-glow { animation: adGlow 1.2s ease-in-out infinite alternate; }
@media (prefers-reduced-motion: reduce) { .ad-line, .ad-pop, .ad-base, .ad-glow { animation: none; } }
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

/** Stem segment that draws itself in / out (3D: core, body, highlight). */
const GrowSeg = ({ d, w, col, on, inDelay, outDelay, dur }: { d: string; w: number; col: VineCol; on: boolean; inDelay: number; outDelay: number; dur: number }) => {
  const base = { d, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, pathLength: 1 };
  const st: React.CSSProperties = {
    strokeDasharray: 1,
    strokeDashoffset: on ? 0 : 1,
    transition: on ? `stroke-dashoffset ${dur}ms linear ${inDelay}ms` : `stroke-dashoffset 180ms linear ${outDelay}ms`,
  };
  return (
    <g>
      <path {...base} stroke={col.dark} strokeWidth={w} style={st} />
      <path {...base} stroke={col.mid} strokeWidth={w * 0.6} transform="translate(-0.5,-0.9)" style={st} />
      <path {...base} stroke={col.light} strokeWidth={Math.max(1, w * 0.2)} strokeOpacity={0.65} transform="translate(-0.9,-1.6)" style={st} />
    </g>
  );
};

const Unfurl = ({ on, inDelay, outDelay, children }: { on: boolean; inDelay: number; outDelay: number; children: React.ReactNode }) => (
  <g
    style={{
      transformBox: 'fill-box',
      transformOrigin: '0% 50%',
      transform: on ? 'scale(1)' : 'scale(0)',
      transition: on ? `transform 400ms cubic-bezier(.3,1.6,.5,1) ${inDelay}ms` : `transform 180ms ease-in ${outDelay}ms`,
    }}
  >
    {children}
  </g>
);

/* ─────────────────────────────────────────────
   Vine: up the RIGHT side from the bottom, round the corner, along the top
   towards the left edge. Each dip into the panel alternates front / behind.
   ───────────────────────────────────────────── */
type Pt = [number, number];
const SEG_MS = 85;

function buildVine(h: number) {
  const W = PANEL_W;
  const pts: Pt[] = [];
  const inner: boolean[] = [];
  const outAng: number[] = [];
  let isIn = false;
  for (let y = h + 6; y > 40; y -= 44) {
    pts.push([isIn ? W - 11 : W + 13, y]);
    inner.push(isIn);
    outAng.push(0);
    isIn = !isIn;
  }
  pts.push(isIn ? [W - 16, 14] : [W + 12, -12]);
  inner.push(isIn);
  outAng.push(-45);
  isIn = !isIn;
  for (let x = W - 50; x >= 70; x -= 44) {
    pts.push([x, isIn ? 10 : -13]);
    inner.push(isIn);
    outAng.push(-90);
    isIn = !isIn;
  }
  pts.push([50, -6]);
  inner.push(false);
  outAng.push(-90);

  const f = (n: number) => n.toFixed(1);
  let ord = -1;
  const layer = inner.map((v) => {
    if (!v) return false;
    ord += 1;
    return ord % 2 === 0;
  });
  const segs: { d: string; front: boolean; i: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const k = inner[i] ? i : inner[i + 1] ? i + 1 : -1;
    segs.push({ d: `M${f(p1[0])},${f(p1[1])} C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`, front: k >= 0 ? layer[k] : true, i });
  }
  const tones: Tone[] = ['M', 'P', 'S'];
  const leaves: { x: number; y: number; r: number; s: number; tone: Tone; i: number }[] = [];
  pts.forEach((p, i) => {
    if (inner[i]) return;
    const jitter = ((i * 37) % 44) - 22;
    leaves.push({ x: p[0], y: p[1], r: outAng[i] + jitter, s: 0.55 + ((i * 13) % 16) / 100, tone: tones[i % 3], i });
    if (i % 2 === 0) leaves.push({ x: p[0], y: p[1], r: outAng[i] + jitter - 50, s: 0.42, tone: tones[(i + 2) % 3], i });
  });
  return { segs, leaves, n: pts.length - 1, end: pts[pts.length - 1] };
}

const TENDRIL = 'M0,0 c0,-12 12,-19 19,-12 c6,6 0,14 -6,10 c-4,-3 -2,-8 2,-6';

const VineLayer = ({ h, on, front }: { h: number; on: boolean; front: boolean }) => {
  const { pal, gid } = useContext(ForestCtx);
  const vine = useMemo(() => buildVine(h), [h]);
  const inD = (i: number) => i * SEG_MS;
  const outD = (i: number) => (vine.n - i) * 22;
  const PAD = 50;
  return (
    <svg
      width={PANEL_W + PAD * 2}
      height={h + PAD * 2}
      viewBox={`${-PAD} ${-PAD} ${PANEL_W + PAD * 2} ${h + PAD * 2}`}
      style={{ position: 'absolute', left: -PAD, top: -PAD, overflow: 'visible', pointerEvents: 'none', zIndex: front ? 6 : 0 }}
      aria-hidden
    >
      <g filter={`url(#${gid}-shadow)`}>
        {vine.segs
          .filter((s) => s.front === front)
          .map((s) => (
            <GrowSeg key={s.i} d={s.d} w={7} col={pal.vineA} on={on} inDelay={inD(s.i)} outDelay={outD(s.i)} dur={SEG_MS + 30} />
          ))}
        {front && (
          <>
            <g transform={`translate(${vine.end[0]},${vine.end[1]}) rotate(200)`}>
              <GrowSeg d={TENDRIL} w={2.6} col={pal.vineA} on={on} inDelay={vine.n * SEG_MS} outDelay={0} dur={260} />
            </g>
            {vine.leaves.map((l, k) => (
              <g key={k} transform={`translate(${l.x.toFixed(1)},${l.y.toFixed(1)}) rotate(${l.r.toFixed(1)}) scale(${l.s.toFixed(2)})`}>
                <Unfurl on={on} inDelay={inD(l.i) + 60} outDelay={outD(l.i)}>
                  <LeafShape tone={l.tone} />
                </Unfurl>
              </g>
            ))}
          </>
        )}
      </g>
    </svg>
  );
};

/** Leading edge of a wipe: a vertical stem with leaves fanning off it. */
const LeafFringe = ({ h, tone }: { h: number; tone: Tone }) => {
  const { pal, gid } = useContext(ForestCtx);
  const n = Math.max(3, Math.round(h / 30));
  return (
    <svg width={40} height={h + 16} viewBox={`-20 -8 40 ${h + 16}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <g filter={`url(#${gid}-shadow)`}>
        <path d={`M0,-6 C-6,${h * 0.3} 6,${h * 0.6} 0,${h + 6}`} stroke={pal.vineA.dark} strokeWidth={4} fill="none" strokeLinecap="round" />
        {Array.from({ length: n }, (_, i) => {
          const y = 6 + (i * (h - 12)) / Math.max(1, n - 1);
          const right = i % 2 === 0;
          return (
            <g key={i} transform={`translate(0,${y.toFixed(1)}) rotate(${right ? -25 + (i % 3) * 10 : 205 - (i % 3) * 10}) scale(${0.58 + (i % 3) * 0.08})`}>
              <LeafShape tone={i % 3 === 1 ? 'M' : tone} vein={false} />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

/* ─────────────────────────────────────────────
   Wipe: reveals left → right, closes right → left (back to the edge).
   A leaf fringe rides the edge while it moves.
   ───────────────────────────────────────────── */
const Wipe: React.FC<{ open: boolean; h: number; fringe: Tone; z: number; flow?: boolean; children: React.ReactNode }> = ({ open, h, fringe, z, flow, children }) => {
  const opened = useRef(false);
  if (open) opened.current = true;
  const ease = 'cubic-bezier(.65,0,.25,1)';
  return (
    <>
      <div
        style={{
          position: flow ? 'relative' : 'absolute',
          inset: flow ? undefined : 0,
          zIndex: z,
          clipPath: open ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          transition: `clip-path ${WIPE_MS}ms ${ease}`,
        }}
      >
        {children}
      </div>
      {opened.current && h > 0 && (
        <div
          key={open ? 'in' : 'out'}
          style={{
            position: 'absolute',
            top: 0,
            left: open ? '100%' : '0%',
            transform: 'translateX(-50%)',
            transition: `left ${WIPE_MS}ms ${ease}`,
            zIndex: z,
            opacity: 0,
            animation: `adEdge ${WIPE_MS}ms linear`,
            pointerEvents: 'none',
          }}
        >
          <LeafFringe h={h} tone={fringe} />
        </div>
      )}
    </>
  );
};

/* ─────────────────────────────────────────────
   Main
   ───────────────────────────────────────────── */
const AirdropInfo: React.FC<Props> = ({ tournament }) => {
  const primary = tournament?.primaryColor || '#E7A801';
  const secondary = tournament?.secondaryColor || primary;
  const { crates: realCrates, matchSeq, loaded } = useLocalAirdrops();

  // Demo ON: the demo session plays until real drop data arrives.
  // Demo OFF: nothing on screen until the first real drop.
  // Off an overlay route (home simulator, previews) the demo is the only data: always on.
  const [demoOn, setDemoOn] = useState(() => !isOverlayRoute() || readDemoPref());
  const toggleDemo = () => setDemoOn((on) => { writeDemoPref(!on); return !on; });

  const demo = demoOn && realCrates.length === 0;
  const demoClock = useDemoClock(demo);

  // ── Show a real crate when it arrives (not one already there on load) ────
  const realNewest = realCrates[realCrates.length - 1];
  const realNewestKey = realNewest ? `${matchSeq}:${realNewest.id}` : '';
  const [popKey, setPopKey] = useState('');
  const seenKey = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded) return undefined;
    if (seenKey.current === null) {
      seenKey.current = realNewestKey; // first relay answer: nothing new yet
      return undefined;
    }
    if (!realNewestKey || realNewestKey === seenKey.current) return undefined;
    seenKey.current = realNewestKey;
    setPopKey(realNewestKey);
    const t = window.setTimeout(() => setPopKey(''), POP_MS);
    return () => window.clearTimeout(t);
  }, [loaded, realNewestKey]);

  const shown = demo
    ? (demoClock.popping ? AIRDROP_DEMO_CRATES[demoClock.index] : undefined)
    : (popKey && popKey === realNewestKey ? realNewest : undefined);
  const shownKey = shown ? `${demo ? 'demo' : matchSeq}-${shown.id}` : '';

  const waiting = realCrates.length === 0;

  const pal = useMemo(() => forestPalette(primary, secondary), [primary, secondary]);
  const gid = 'fa' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ctx = useMemo(() => ({ pal, gid }), [pal, gid]);

  return (
    <ForestCtx.Provider value={ctx}>
      <div style={{ width: 1920, height: 1080, position: 'relative', pointerEvents: 'none', fontFamily: FONT, color: '#fff' }}>
        <style>{KEYFRAMES}</style>
        <ForestDefs />
        {/* Demo switch — outside the 1920×1080 canvas, so OBS never shows it. */}
        <button
          type="button"
          onClick={toggleDemo}
          aria-pressed={demoOn}
          style={{
            position: 'absolute', left: 1940, top: 20, pointerEvents: 'auto',
            padding: '10px 16px', background: '#0c0c0e', color: '#fff',
            border: `2px solid ${demoOn ? primary : 'rgba(255,255,255,0.35)'}`,
            fontFamily: FONT, fontSize: 18, letterSpacing: '0.1em', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          DEMO {demoOn ? 'ON' : 'OFF'}
        </button>
        <div style={{ position: 'absolute', left: 1940, top: 70, fontSize: 15, letterSpacing: '0.05em', opacity: 0.75, whiteSpace: 'nowrap' }}>
          {waiting ? (demoOn ? 'Demo running until drop data comes' : 'Waiting for drop data') : 'Live drop data'}
        </div>
        <AirdropStage crate={shown} crateKey={shownKey} />
      </div>
    </ForestCtx.Provider>
  );
};

/**
 * Runs the three-step intro when a crate appears and the three-step outro
 * when it goes away, keeping the last crate on screen until the outro ends.
 */
const AirdropStage: React.FC<{ crate?: AirdropCrate; crateKey: string }> = ({ crate, crateKey }) => {
  const [held, setHeld] = useState<{ crate: AirdropCrate; key: string } | null>(null);
  const [stage, setStage] = useState(0); // 0 closed · 1 grove · 2 canopy · 3 panel
  const [vines, setVines] = useState(false);
  const timers = useRef<number[]>([]);
  const clear = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  useEffect(() => {
    if (crate && crateKey) {
      if (held?.key === crateKey) return;
      clear();
      setHeld({ crate, key: crateKey });
      setStage(0);
      setVines(false);
      later(() => setStage(1), T_GROVE);
      later(() => setStage(2), T_CANOPY);
      later(() => setStage(3), T_PANEL);
      later(() => setVines(true), T_VINES);
    } else if (held) {
      clear();
      setVines(false);
      later(() => setStage(2), O_PANEL);
      later(() => setStage(1), O_CANOPY);
      later(() => setStage(0), O_GROVE);
      later(() => setHeld(null), O_DONE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crateKey]);

  useEffect(() => () => clear(), []);

  if (!held) return null;
  return (
    <div style={{ position: 'absolute', left: 0, top: PANEL_TOP, width: PANEL_W }}>
      <AirdropSequence key={held.key} crate={held.crate} stage={stage} vines={vines} />
    </div>
  );
};

const AirdropSequence: React.FC<{ crate: AirdropCrate; stage: number; vines: boolean }> = ({ crate, stage, vines }) => {
  const { pal } = useContext(ForestCtx);
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setH(Math.round(el.getBoundingClientRect().height));
    measure();
    const RO = (window as any).ResizeObserver;
    if (!RO) return undefined;
    const ro = new RO(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{ position: 'relative', width: PANEL_W }}>
      {h > 0 && <VineLayer h={h} on={vines} front={false} />}

      <div
        ref={ref}
        style={{
          position: 'relative',
          zIndex: 1,
          width: PANEL_W,
          borderRadius: `0 ${RADIUS}px ${RADIUS}px 0`,
          filter: stage > 0 ? 'drop-shadow(0 14px 24px rgba(0,0,0,.45))' : 'none',
          transition: 'filter .3s ease',
        }}
      >
        {/* step 1 — the grove */}
        <Wipe open={stage >= 1} h={h} fringe="M" z={1}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: `0 ${RADIUS}px ${RADIUS}px 0`,
              background: `${GRAIN}, radial-gradient(ellipse 55% 45% at 50% 46%, ${pal.glow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.grove[0]}, ${pal.grove[1]})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
            }}
          >
            {stage >= 1 && (
              <>
                <div className="ad-pop" style={{ animationDelay: '.2s' }}>
                  <div className="ad-glow">
                    <Chute color={pal.label} size={96} />
                  </div>
                </div>
                <div className="ad-line" style={{ animationDelay: '.35s', fontSize: 30, letterSpacing: 8, paddingLeft: 8, color: '#fff' }}>
                  AIRDROP INCOMING
                </div>
              </>
            )}
          </div>
        </Wipe>

        {/* step 2 — the canopy */}
        <Wipe open={stage >= 2} h={h} fringe="S" z={2}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: `0 ${RADIUS}px ${RADIUS}px 0`,
              background: `${GRAIN}, linear-gradient(115deg, ${pal.canopy[0]}, ${pal.canopy[1]} 45%, ${pal.canopy[2]})`,
            }}
          />
        </Wipe>

        {/* step 3 — the panel (in flow: it sets the height everything else uses) */}
        <Wipe open={stage >= 3} h={h} fringe="P" z={3} flow>
          <AirdropPanel crate={crate} live={stage >= 3} />
        </Wipe>
      </div>

      {h > 0 && <VineLayer h={h} on={vines} front />}
    </div>
  );
};

/** A small parachute: the airdrop mark. */
const Chute: React.FC<{ color: string; size?: number }> = ({ color, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: 'block' }}>
    <path d="M2 11 Q12 -1 22 11 Q19 9 17 11 Q14.5 9 12 11 Q9.5 9 7 11 Q5 9 2 11 Z" fill={color} />
    <path d="M2.5 11 L10.5 18 M21.5 11 L13.5 18 M12 11 L12 18" stroke={color} strokeWidth={1.2} />
    <rect x={9.5} y={18} width={5} height={4.5} fill={color} />
  </svg>
);

/** One line of the panel; settles in (staggered) once the panel is revealed. */
const Line: React.FC<{ i: number; live: boolean; children: React.ReactNode; style?: React.CSSProperties }> = ({ i, live, children, style }) => (
  <div className={live ? 'ad-line' : undefined} style={{ ...style, animationDelay: `${0.3 + i * 0.08}s` }}>
    {children}
  </div>
);

const Count: React.FC<{ n: number }> = ({ n }) => (
  <span style={{ background: '#fff', color: '#0c0c0e', fontSize: 18, padding: '2px 8px 1px', borderRadius: '8px 2px 8px 2px', boxShadow: '0 2px 3px rgba(0,0,0,.4)' }}>×{n}</span>
);

/** What's in the crate. Exported for previews/tests. */
export const AirdropPanel: React.FC<{ crate: AirdropCrate; primary?: string; live?: boolean }> = ({ crate, primary, live = true }) => {
  // Inside the overlay the palette comes from context; standalone (previews /
  // tests) it falls back to the `primary` prop.
  const ctx = useContext(ForestCtx);
  const standalone = useMemo(() => (primary ? forestPalette(primary, primary) : null), [primary]);
  const pal = ctx.gid === 'fa' && standalone ? standalone : ctx.pal;
  const items = sortItems(crate.items);
  const gun = items.find((i) => airdropItem(i.id).category === 'gun');
  const ammo = items.find((i) => airdropItem(i.id).category === 'ammo');
  const armor = items.filter((i) => airdropItem(i.id).category === 'armor');
  const rest = items.filter((i) => i !== gun && i !== ammo && !armor.includes(i));
  const accent = pal.label;
  const shadow = '0 0 1px rgba(0,0,0,.9), 0 2px 3px rgba(0,0,0,.55)';
  let line = 0;
  let row = 0;
  const rowBg = () => wood(row++ % 2 ? pal.rowB : pal.rowA);

  return (
    <div style={{ width: PANEL_W, color: '#fff', fontFamily: FONT, borderRadius: `0 ${RADIUS}px ${RADIUS}px 0`, overflow: 'hidden' }}>
      {/* header: chute disc · AIRDROP · crate number tab */}
      <div style={{ display: 'flex', alignItems: 'stretch', height: 56, background: wood(pal.head), boxShadow: `inset 0 -2px 0 ${accent}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 18, flex: 1 }}>
          <div
            className={live ? 'ad-pop' : undefined}
            style={{
              animationDelay: '.15s',
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: `repeating-radial-gradient(circle, rgba(0,0,0,.12) 0px, rgba(0,0,0,.12) 1px, transparent 1px, transparent 5px), radial-gradient(circle at 38% 32%, ${pal.disc[0]}, ${pal.disc[1]} 55%, ${pal.disc[2]})`,
              boxShadow: '0 0 0 2px rgba(255,255,255,.85), 0 3px 6px rgba(0,0,0,.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Chute color={pal.discInk} size={24} />
          </div>
          <span style={{ fontSize: 32, letterSpacing: 7, textShadow: shadow }}>AIRDROP</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '0 22px 0 30px',
            background: pal.tab,
            color: pal.tabInk,
            clipPath: 'polygon(18px 0, 100% 0, 100% 100%, 0 100%)',
            fontSize: 36,
            letterSpacing: 2,
          }}
        >
          <span style={{ fontSize: 22, opacity: 0.7, marginTop: 4 }}>#</span>
          {String(crate.id).padStart(2, '0')}
        </div>
      </div>

      {/* the gun */}
      {gun && (
        <Line
          i={line++}
          live={live}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '18px 24px 16px 20px',
            background: `${GRAIN}, radial-gradient(ellipse 40% 90% at 14% 50%, ${pal.glow} 0%, rgba(0,0,0,0) 70%), linear-gradient(180deg, ${pal.gun[0]}, ${pal.gun[1]})`,
          }}
        >
          <div style={{ flex: 'none', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.5))' }}>
            <AirdropIcon id={gun.id} size={80} accent={accent} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, letterSpacing: 4, color: accent, textShadow: shadow }}>WEAPON</div>
            <div style={{ fontSize: 50, lineHeight: 0.95, letterSpacing: 1, marginTop: 4, textShadow: shadow, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {airdropItem(gun.id).name.toUpperCase()}
            </div>
            {ammo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Count n={ammo.count} />
                <span style={{ fontSize: 20, opacity: 0.85, letterSpacing: 1, textShadow: shadow }}>{airdropItem(ammo.id).name.toUpperCase()}</span>
              </div>
            )}
          </div>
        </Line>
      )}

      {/* everything else, one line each */}
      {rest.map((it, k) => (
        <Line
          key={`${it.id}-${k}`}
          i={line++}
          live={live}
          style={{ display: 'flex', alignItems: 'center', gap: 14, background: rowBg(), padding: '7px 24px 7px 20px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06), inset 0 -1px 0 rgba(0,0,0,.35)' }}
        >
          <span style={{ display: 'flex', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))' }}>
            <AirdropIcon id={it.id} size={40} accent={accent} hideBadge />
          </span>
          <span style={{ flex: 1, fontSize: airdropItem(it.id).name.length > 24 ? 19 : 23, letterSpacing: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: shadow }}>
            {airdropItem(it.id).name.toUpperCase()}
          </span>
          {it.count > 1 && <Count n={it.count} />}
        </Line>
      ))}

      {/* Lv.3 vest / helmet / backpack on one line */}
      {armor.length > 0 && (
        <Line
          i={line++}
          live={live}
          style={{ display: 'flex', alignItems: 'center', gap: 12, background: wood(pal.head), padding: '7px 24px 7px 20px', boxShadow: `inset 0 2px 0 ${accent}` }}
        >
          <span style={{ flex: 1, fontSize: 24, letterSpacing: 1, textShadow: shadow }}>
            <span style={{ color: accent }}>LEVEL {Math.max(...armor.map((a) => airdropItem(a.id).level || 0)) || ''}</span> GEAR
          </span>
          {armor.map((a, k) => (
            <span key={`${a.id}-${k}`} title={airdropItem(a.id).name} aria-label={airdropItem(a.id).name} style={{ display: 'flex', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))' }}>
              <AirdropIcon id={a.id} size={42} accent={accent} hideBadge />
            </span>
          ))}
        </Line>
      )}

      {/* theme-colour base line that draws in last */}
      <div
        className={live ? 'ad-base' : undefined}
        style={{ height: 5, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})`, animationDelay: `${0.3 + line * 0.08}s` }}
      />
    </div>
  );
};

export default AirdropInfo;