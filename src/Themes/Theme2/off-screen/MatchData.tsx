import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rankingPageCount, useRankingPager } from '../../shared/hooks/rankingPager';
import { isWinningPlacement, computeMatchStandings } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';

// Match Standings in the lightning style (LiveStats / Upper / BattleBar / map).
// White label: every colour comes from the tournament's primary / secondary
// colours on clean white panels, so it fits any brand. Data, paging and the
// winning-placement rule are unchanged.

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

interface Player {
  _id: string;
  playerName: string;
  killNum: number;
  rank?: number;
  bHasDied: boolean;
  picUrl?: string;
  health: number;
  healthMax: number;
  liveState: number;
}

interface Team {
  _id: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
  teamFlag?: string;
  wwcd?: number;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchDataProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

// ─────────────────────────────────────────────
// Visual language
// ─────────────────────────────────────────────
const INK = '#0d0f13';
const DEFAULT_PRIMARY = '#E10600';
const DEFAULT_SECONDARY = '#111318';
const CUT_HERO = 'polygon(40px 0, 100% 0, 100% calc(100% - 40px), calc(100% - 40px) 100%, 0 100%, 0 40px)';
const CUT_RANK = 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)';
const CUT_CHIP = 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)';
const CUT_TILE = 'polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)';
const CUT_BOLT = 'polygon(0 0, 100% 0, 84% 46%, 96% 46%, 78% 100%, 0 100%)';
const CUT_HEAD = 'polygon(0 0, 100% 0, calc(100% - 36px) 100%, 0 100%)';
const CUT_TAG = 'polygon(24px 0, 100% 0, 100% 100%, 0 100%, 13px 50%)';

const HERO = { left: 110, top: 190, w: 1700, h: 230 };
const TABLE = { left: 110, top: 445, w: 1700, gap: 24 };
const ROW_H = 84;
const ROW_GAP = 8;
// column widths inside one table column (838 px)
const COL = { rank: 84, logo: 74, elims: 112, place: 112, total: 132 };

const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// This is a broadcast overlay, so it does NOT follow the computer's
// "reduce motion" setting (Windows "Animation effects: off" turns that on and
// used to freeze every animation here). To switch motion off on purpose, add
// ?motion=off to the overlay URL.
const reducedMotion = () => {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('motion') === 'off';
  } catch {
    return false;
  }
};

const Bolt: React.FC<{ size?: number; color: string }> = ({ size = 16, color }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" aria-hidden style={{ display: 'block', flexShrink: 0 }}>
    <path d="M13 0 L2 16 H9 L6 28 L18 10 H11 L15 0 Z" fill={color} />
  </svg>
);

const Crown: React.FC<{ size?: number; color: string }> = ({ size = 18, color }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
    <rect x="6" y="27" width="28" height="3" fill={color} />
  </svg>
);

// ─────────────────────────────────────────────
// Keyframes. Constant motion is slow and small (electric edges, drifting
// storm glow); the flashy effects come one at a time from useFxDirector.
// ─────────────────────────────────────────────
const Styles: React.FC<{ primary: string }> = ({ primary }) => (
  <style>{`
    @keyframes ms-run  { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    @keyframes ms-cloud {
      0%, 100% { transform: translate(0, 0) scale(1); opacity: .55; }
      50%      { transform: translate(-40px, 10px) scale(1.15); opacity: .85; }
    }
    /* hero: wipe in, flash once */
    @keyframes ms-hero-in {
      0%   { clip-path: polygon(0 0, 0 0, 0 100%, 0 100%); }
      100% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
    }
    @keyframes ms-hero-flash { 0% { opacity: 0; } 8% { opacity: .9; } 18% { opacity: .1; } 26% { opacity: .7; } 100% { opacity: 0; } }
    @keyframes ms-rise { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }
    @keyframes ms-pop  { 0% { opacity: 0; transform: scale(.6); } 70% { opacity: 1; transform: scale(1.06); } 100% { opacity: 1; transform: none; } }
    @keyframes ms-drop { from { opacity: 0; transform: translateY(-24px); } to { opacity: 1; transform: none; } }
    /* rows: reveal behind a white leading edge */
    @keyframes ms-reveal-l { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
    @keyframes ms-reveal-r { from { clip-path: inset(0 0 0 100%); } to { clip-path: inset(0 0 0 0); } }
    @keyframes ms-edge-l { 0% { left: -4%; opacity: 1; } 85% { opacity: 1; } 100% { left: 100%; opacity: 0; } }
    @keyframes ms-edge-r { 0% { left: 100%; opacity: 1; } 85% { opacity: 1; } 100% { left: -4%; opacity: 0; } }
    @keyframes ms-title-in { from { opacity: 0; letter-spacing: .4em; filter: blur(6px); } to { opacity: 1; letter-spacing: .04em; filter: none; } }
    @keyframes ms-chip-in { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
    /* header */
    @keyframes ms-line { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @keyframes ms-slide-l { from { opacity: 0; transform: translateX(-60px); } to { opacity: 1; transform: none; } }
    @keyframes ms-slide-r { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: none; } }
    @keyframes ms-flicker {
      0%, 88%, 100% { opacity: 1; }
      89% { opacity: .25; } 90% { opacity: 1; }
      92% { opacity: .5; }  93% { opacity: 1; }
    }
    /* #1 card breathes */
    @keyframes ms-draw   { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
    @keyframes ms-glow {
      0%, 100% { filter: drop-shadow(0 0 8px ${withAlpha(primary, 0.4)}); }
      50%      { filter: drop-shadow(0 0 26px ${withAlpha(primary, 0.85)}); }
    }
    /* table */
    @keyframes ms-grow-y { from { transform: scaleY(0); } to { transform: scaleY(1); } }
    @keyframes ms-runv   { from { background-position: 0 -200%; } to { background-position: 0 200%; } }
    @keyframes ms-crackle {
      0%, 100% { opacity: .55; } 8% { opacity: 1; } 10% { opacity: .3; } 12% { opacity: .9; }
      48% { opacity: .5; } 70% { opacity: .4; } 71% { opacity: 1; } 73% { opacity: .5; }
    }
    /* page change — old rows flash + wipe out, lightning cracks across, new rows draw in */
    @keyframes ms-row-out-l {
      0%   { clip-path: inset(0 0 0 0); filter: brightness(1); }
      25%  { filter: brightness(1.8); }
      100% { clip-path: inset(0 0 0 100%); filter: brightness(1); }
    }
    @keyframes ms-row-out-r {
      0%   { clip-path: inset(0 0 0 0); filter: brightness(1); }
      25%  { filter: brightness(1.8); }
      100% { clip-path: inset(0 100% 0 0); filter: brightness(1); }
    }
    .ms-out [data-fx-row][data-side="l"] { animation: ms-row-out-l .42s calc(var(--o) * 28ms) both cubic-bezier(.6,0,.4,1) !important; }
    .ms-out [data-fx-row][data-side="r"] { animation: ms-row-out-r .42s calc(var(--o) * 28ms) both cubic-bezier(.6,0,.4,1) !important; }
    @keyframes ms-pbolt {
      0% { opacity: 1; } 18% { opacity: .2; } 30% { opacity: 1; } 48% { opacity: .45; }
      62% { opacity: .95; } 100% { opacity: 0; }
    }
    @keyframes ms-pflash { 0% { opacity: 0; } 14% { opacity: .55; } 26% { opacity: .08; } 38% { opacity: .35; } 100% { opacity: 0; } }
    @keyframes ms-winglow { 0%, 100% { box-shadow: inset 0 0 0 2px ${withAlpha(primary, 0.5)}, inset 0 0 14px ${withAlpha(primary, 0.25)}; } 50% { box-shadow: inset 0 0 0 2px ${withAlpha(primary, 0.95)}, inset 0 0 26px ${withAlpha(primary, 0.45)}; } }
    .ms-still .ms-anim { animation: none !important; clip-path: none !important; }
    .ms-glow-text { text-shadow: 0 0 18px ${withAlpha(primary, 0.55)}, 0 2px 0 rgba(0,0,0,.35); }
  `}</style>
);

// ─────────────────────────────────────────────
// CountUp — rolls a number up from 0 (or from its last value).
// Writes straight to the DOM; React never re-renders per frame.
// ─────────────────────────────────────────────
const CountUp: React.FC<{ value: number; delay?: number; duration?: number }> = ({ value, delay = 0, duration = 900 }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const to = Number(value) || 0;
    const from = prev.current;
    prev.current = to;
    if (from === to || reducedMotion()) {
      el.textContent = String(to);
      return;
    }
    el.textContent = String(from);
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const k = clamp((now - start) / duration, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = String(to);
    };
  }, [value, delay, duration]);
  return <span ref={ref} />;
};

// ─────────────────────────────────────────────
// FX director — one flashy effect at a time, at random:
//   • storm:  a bolt cracks across the #1 card (the big one lights the whole
//             sky and the player photos)
//   • strike: a row's rank block double-flashes, a surge runs along the row
//   • sheen:  a shine sweeps across one TOTAL cell
// Web Animations API straight on the DOM: no re-renders. Never the same
// element twice in a row; never two effects at once.
// ─────────────────────────────────────────────
const FX_START_DELAY = 2600; // let the entrance finish first
const FX_GAP_MIN = 1600;
const FX_GAP_MAX = 3400;
const FX_WEIGHTS = { storm: 0.4, strike: 0.35, sheen: 0.25 };
type FxKind = keyof typeof FX_WEIGHTS;

function useFxDirector(rootRef: React.RefObject<HTMLElement | null>, primary: string, resetKey: string) {
  const primaryRef = useRef(primary);
  primaryRef.current = primary;

  useEffect(() => {
    if (reducedMotion()) return;
    let timer: number | undefined;
    let cancelled = false;
    let last: Element | null = null;
    const running = new Set<Animation>();
    const track = (a: Animation | undefined) => {
      if (!a) return;
      running.add(a);
      a.onfinish = a.oncancel = () => running.delete(a);
    };
    const pickKind = (avail: FxKind[]): FxKind | null => {
      const total = avail.reduce((s, k) => s + FX_WEIGHTS[k], 0);
      if (total <= 0) return null;
      let r = Math.random() * total;
      for (const k of avail) {
        r -= FX_WEIGHTS[k];
        if (r <= 0) return k;
      }
      return avail[avail.length - 1];
    };
    const pickEl = <T extends Element>(list: T[]): T | null => {
      const pool = list.length > 1 ? list.filter((e) => e !== last) : list;
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    };

    const playStorm = (bolt: Element, root: Element) => {
      const ms = 900;
      track(
        bolt.animate?.(
          [
            { offset: 0, opacity: 0 },
            { offset: 0.08, opacity: 1 },
            { offset: 0.2, opacity: 0.15 },
            { offset: 0.34, opacity: 1 },
            { offset: 0.5, opacity: 0.5 },
            { offset: 1, opacity: 0 },
          ],
          { duration: ms }
        )
      );
      if (bolt.getAttribute('data-main') === '1') {
        const sheet = root.querySelector('[data-fx="sheet"]');
        track(
          sheet?.animate?.(
            [
              { offset: 0, opacity: 0 },
              { offset: 0.08, opacity: 0.55 },
              { offset: 0.2, opacity: 0.08 },
              { offset: 0.34, opacity: 0.4 },
              { offset: 1, opacity: 0 },
            ],
            { duration: ms + 300 }
          )
        );
        const glow = primaryRef.current;
        root.querySelectorAll('[data-fx="photo"]').forEach((p) =>
          track(
            p.animate?.(
              [
                { offset: 0, filter: 'brightness(1)' },
                { offset: 0.08, filter: `brightness(1.45) drop-shadow(0 0 14px ${glow})` },
                { offset: 0.2, filter: 'brightness(1.05)' },
                { offset: 0.34, filter: 'brightness(1.3) drop-shadow(0 0 10px rgba(255,255,255,.7))' },
                { offset: 1, filter: 'brightness(1)' },
              ],
              { duration: ms + 300 }
            )
          )
        );
        return ms + 300;
      }
      return ms;
    };

    const playStrike = (row: Element) => {
      const ms = 1100;
      track(
        row.querySelector('[data-fx="rankflash"]')?.animate?.(
          [
            { offset: 0, opacity: 0 },
            { offset: 0.07, opacity: 0.95 },
            { offset: 0.22, opacity: 0.1 },
            { offset: 0.38, opacity: 0.85 },
            { offset: 0.65, opacity: 0 },
            { offset: 1, opacity: 0 },
          ],
          { duration: ms }
        )
      );
      track(
        row.querySelector('[data-fx="surge"]')?.animate?.(
          [
            { offset: 0, left: '-20%', opacity: 0 },
            { offset: 0.1, opacity: 1 },
            { offset: 0.75, left: '105%', opacity: 1 },
            { offset: 1, left: '105%', opacity: 0 },
          ],
          { duration: ms, easing: 'ease-in' }
        )
      );
      track(
        row.querySelector('[data-fx="rankbolt"]')?.animate?.(
          [
            { offset: 0, transform: 'scale(1)', filter: 'brightness(1)' },
            { offset: 0.07, transform: 'scale(1.25)', filter: 'brightness(2) drop-shadow(0 0 8px #fff)' },
            { offset: 0.3, transform: 'scale(1.04)', filter: 'brightness(1.2)' },
            { offset: 0.42, transform: 'scale(1.14)', filter: `brightness(1.7) drop-shadow(0 0 10px ${primaryRef.current})` },
            { offset: 1, transform: 'scale(1)', filter: 'brightness(1)' },
          ],
          { duration: ms, easing: 'ease-out' }
        )
      );
      return ms;
    };

    const playSheen = (el: Element) => {
      const ms = 1400;
      track(
        el.animate?.(
          [{ transform: 'translateX(-160%) skewX(-20deg)' }, { transform: 'translateX(700%) skewX(-20deg)' }],
          { duration: ms, easing: 'ease-in-out' }
        )
      );
      return ms;
    };

    const tick = () => {
      if (cancelled) return;
      const root = rootRef.current;
      let dur = 0;
      if (root && !document.hidden) {
        const bolts = Array.from(root.querySelectorAll('[data-fx-storm]'));
        const rows = Array.from(root.querySelectorAll('[data-fx-row]'));
        const sheens = Array.from(root.querySelectorAll('[data-fx-sheen]'));
        const avail: FxKind[] = [];
        if (bolts.length) avail.push('storm');
        if (rows.length) avail.push('strike');
        if (sheens.length) avail.push('sheen');
        const kind = pickKind(avail);
        const el =
          kind === 'storm' ? pickEl(bolts) : kind === 'strike' ? pickEl(rows) : kind === 'sheen' ? pickEl(sheens) : null;
        if (el) {
          last = el;
          dur = kind === 'storm' ? playStorm(el, root) : kind === 'strike' ? playStrike(el) : playSheen(el);
        }
      }
      const gap = FX_GAP_MIN + Math.random() * (FX_GAP_MAX - FX_GAP_MIN);
      timer = window.setTimeout(tick, Math.max(gap, dur + 150));
    };

    timer = window.setTimeout(tick, FX_START_DELAY);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      running.forEach((a) => a.cancel());
      running.clear();
    };
  }, [rootRef, resetKey]);
}

// ─────────────────────────────────────────────
// Storm sky behind the #1 card (bolts are played by useFxDirector)
// ─────────────────────────────────────────────
const STORM_BOLTS: { d: string[]; w: number; main?: boolean }[] = [
  {
    main: true,
    w: 2.4,
    d: [
      'M1130 0 L1108 40 L1124 48 L1090 98 L1106 106 L1070 160 L1086 168 L1052 230',
      'M1106 106 L1146 128 L1134 138 L1172 166',
      'M1090 98 L1052 116 L1060 126 L1022 144',
    ],
  },
  { w: 1.8, d: ['M420 0 L444 36 L428 44 L460 86 L442 94 L470 150 L454 158 L478 214', 'M442 94 L408 118 L418 128 L384 156'] },
  { w: 1.6, d: ['M1560 0 L1536 38 L1552 46 L1518 92 L1536 100 L1500 160', 'M1536 100 L1576 124 L1566 134 L1602 156'] },
  { w: 1.3, d: ['M700 26 L760 12 L780 28 L846 8 L866 24 L930 6 L960 18', 'M846 8 L858 -6'] },
  { w: 1.1, d: ['M250 0 L238 24 L250 30 L232 64'] },
];

const StormSky: React.FC<{ primary: string; secondary: string }> = ({ primary, secondary }) => (
  <div
    className="absolute inset-0 pointer-events-none overflow-hidden"
    style={{
      clipPath: CUT_HERO,
      background: `radial-gradient(ellipse 50% 110% at 66% -10%, ${withAlpha(primary, 0.75)} 0%, transparent 65%),
                   linear-gradient(160deg, #06070b 0%, ${withAlpha(secondary, 0.95)} 55%, ${primary} 160%)`,
    }}
  >
    <div
      className="absolute -top-[90px] left-[900px] w-[520px] h-[260px] rounded-full ms-anim"
      style={{
        background: `radial-gradient(circle, ${withAlpha(primary, 0.5)} 0%, transparent 70%)`,
        animation: 'ms-cloud 9s ease-in-out infinite',
      }}
    />
    <div
      className="absolute -top-[60px] left-[200px] w-[420px] h-[220px] rounded-full ms-anim"
      style={{
        background: 'radial-gradient(circle, rgba(255,255,255,0.14) 0%, transparent 70%)',
        animation: 'ms-cloud 12s 2s ease-in-out infinite reverse',
      }}
    />
    {/* sheet lightning */}
    <div
      data-fx="sheet"
      className="absolute inset-0"
      style={{
        background: `radial-gradient(ellipse at 64% 30%, #ffffff 0%, ${withAlpha(primary, 0.6)} 40%, transparent 80%)`,
        opacity: 0,
      }}
    />
    <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${HERO.w} ${HERO.h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <filter id="ms-storm-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      {STORM_BOLTS.map((b, i) => (
        <g key={i} data-fx-storm data-main={b.main ? '1' : '0'} style={{ opacity: 0 }}>
          {b.d.map((d, j) => (
            <path key={`g${j}`} d={d} fill="none" stroke={primary} strokeWidth={(j ? b.w * 0.6 : b.w) * 5} filter="url(#ms-storm-glow)" />
          ))}
          {b.d.map((d, j) => (
            <path key={`c${j}`} d={d} fill="none" stroke="#ffffff" strokeWidth={j ? b.w * 0.6 : b.w} />
          ))}
        </g>
      ))}
    </svg>
    {/* big faint rank mark */}
    <div className="absolute right-[600px] -top-[30px] font-bebas text-[18rem] leading-none text-white opacity-[0.06] select-none">#1</div>
  </div>
);

// ─────────────────────────────────────────────
// Stat tile on the #1 card
// ─────────────────────────────────────────────
const StatTile: React.FC<{ label: string; value: number; delay: number; strong?: boolean; themeGrad: string; primary: string }> = ({
  label,
  value,
  delay,
  strong,
  themeGrad,
  primary,
}) => (
  <div
    className="relative w-[170px] h-[150px] flex flex-col items-center justify-center overflow-hidden ms-anim"
    style={{
      clipPath: CUT_TILE,
      background: strong ? themeGrad : 'linear-gradient(160deg, #ffffff 0%, #eef0f3 100%)',
      color: strong ? '#ffffff' : INK,
      animation: `ms-pop .6s ${delay}s both cubic-bezier(.22,1,.36,1)`,
    }}
  >
    {strong && <span data-fx-sheen className="absolute top-0 bottom-0 left-0 w-[30px]" style={sheenStyle} />}
    <div className="relative font-[AGENCYB] font-bold text-[5.2rem] leading-none" style={strong ? { textShadow: '0 0 16px rgba(255,255,255,.5)' } : undefined}>
      <CountUp value={value} delay={delay * 1000 + 150} />
    </div>
    <div
      className="relative mt-[6px] font-[AGENCYB] font-bold text-[1.25rem] tracking-[0.22em]"
      style={{ color: strong ? 'rgba(255,255,255,.85)' : withAlpha(INK, 0.6) }}
    >
      {label}
    </div>
    <div className="absolute left-0 right-0 bottom-0 h-[4px]" style={{ background: strong ? '#ffffff' : primary }} />
  </div>
);

const electric = (primary: string, speed: number, vertical = false): React.CSSProperties => ({
  backgroundColor: primary,
  backgroundImage: vertical
    ? 'linear-gradient(180deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)'
    : 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
  backgroundSize: vertical ? '100% 200%' : '200% 100%',
  animation: `${vertical ? 'ms-runv' : 'ms-run'} ${speed}s linear infinite`,
  boxShadow: `0 0 10px ${withAlpha(primary, 0.85)}`,
});

const sheenStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)',
  transform: 'translateX(-160%) skewX(-20deg)',
  pointerEvents: 'none',
};

// ─────────────────────────────────────────────
// Table row
// ─────────────────────────────────────────────
interface RowProps {
  team: any;
  rank: number;
  order: number; // entrance order on the page
  side: 'l' | 'r';
  primary: string;
  themeGrad: string;
  base: number; // entrance start (s): later on first load, quick after a page change
}

const StandingRow: React.FC<RowProps> = ({ team, rank, order, side, primary, themeGrad, base }) => {
  const delay = base + order * 0.07;
  const winner = isWinningPlacement(team.placePoints, team.players?.[0]?.rank);
  return (
    <div
      data-fx-row
      data-side={side}
      className="relative flex items-stretch overflow-hidden ms-anim"
      style={{
        ['--o' as any]: order,
        height: ROW_H,
        background: `linear-gradient(90deg, ${withAlpha(primary, order % 2 ? 0.16 : 0.24)} 0%, ${order % 2 ? '#f4f5f7' : '#ffffff'} 36%, ${order % 2 ? '#e9ebef' : '#f1f2f5'} 100%)`,
        animation: `ms-reveal-${side} .7s ${delay}s both cubic-bezier(.22,1,.36,1)`,
      }}
    >
      {/* white leading edge that draws the row in */}
      <span
        className="absolute top-0 bottom-0 w-[4%] z-30 pointer-events-none ms-anim"
        style={{
          background: `linear-gradient(90deg, transparent, #ffffff, ${withAlpha(primary, 0.9)})`,
          transform: side === 'l' ? 'skewX(-16deg)' : 'skewX(16deg) scaleX(-1)',
          boxShadow: `0 0 18px ${withAlpha(primary, 0.8)}`,
          opacity: 0,
          animation: `ms-edge-${side} .7s ${delay}s both cubic-bezier(.22,1,.36,1)`,
        }}
      />
      {/* surge — played by useFxDirector */}
      <span
        data-fx="surge"
        className="absolute top-0 bottom-0 w-[18%] z-20 pointer-events-none"
        style={{
          left: '-20%',
          opacity: 0,
          background: `linear-gradient(90deg, transparent, ${withAlpha(primary, 0.35)}, rgba(255,255,255,0.9), transparent)`,
          transform: 'skewX(-18deg)',
        }}
      />

      {/* Rank */}
      <div
        className="relative shrink-0 flex items-center justify-center text-white font-[AGENCYB] font-bold text-[3.4rem] leading-none"
        style={{ width: COL.rank, background: themeGrad, clipPath: CUT_RANK, textShadow: '0 0 10px rgba(255,255,255,.5)' }}
      >
        <span data-fx="rankflash" className="absolute inset-0 bg-white" style={{ opacity: 0 }} />
        <span data-fx="rankbolt" className="relative pr-[10px]" style={{ display: 'inline-block' }}>
          {rank}
        </span>
      </div>

      {/* Logo */}
      <div className="shrink-0 flex items-center justify-center" style={{ width: COL.logo }}>
        <div className="w-[56px] h-[56px]">
          <TeamLogo logo={team.teamLogo} flag={team.teamFlag} fallback="/def_logo.avif" alt={team.teamTag} className="w-full h-full object-contain" />
        </div>
      </div>

      {/* Tag + winner badge */}
      <div className="flex-1 min-w-0 flex items-center gap-[12px] pl-[4px]">
        <span className="truncate font-bebas text-[3.1rem] leading-none" style={{ color: INK }}>
          {team.teamTag}
        </span>
        {winner && (
          <span
            className="shrink-0 flex items-center gap-[6px] h-[30px] pl-[10px] pr-[12px] font-[AGENCYB] font-bold text-[1rem] tracking-[0.16em] text-white"
            style={{ background: themeGrad, clipPath: CUT_CHIP }}
          >
            <Crown size={18} color="#ffffff" />
            WWCD
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="shrink-0 flex items-center justify-center font-[AGENCYB] font-bold text-[2.8rem]" style={{ width: COL.elims, color: INK }}>
        <CountUp value={team.totalKills ?? 0} delay={(delay + 0.3) * 1000} duration={700} />
      </div>
      <div
        className="shrink-0 flex items-center justify-center font-[AGENCYB] font-bold text-[2.8rem]"
        style={{ width: COL.place, color: INK, background: 'rgba(13,15,19,0.05)' }}
      >
        <CountUp value={team.placePoints ?? 0} delay={(delay + 0.3) * 1000} duration={700} />
      </div>
      <div
        className="relative shrink-0 flex items-center justify-center overflow-hidden font-[AGENCYB] font-bold text-[3.2rem] text-white"
        style={{ width: COL.total, background: INK, boxShadow: `inset 0 -4px 0 ${primary}` }}
      >
        <span data-fx-sheen className="absolute top-0 bottom-0 left-0 w-[24px]" style={sheenStyle} />
        <span className="relative" style={{ textShadow: `0 0 12px ${withAlpha(primary, 0.6)}` }}>
          <CountUp value={team.total ?? 0} delay={(delay + 0.3) * 1000} duration={900} />
        </span>
      </div>

      {/* separator */}
      <div className="absolute left-[84px] right-0 bottom-0 h-px" style={{ background: 'rgba(13,15,19,0.12)' }} />
      {/* WWCD rows keep a soft electric outline */}
      {winner && (
        <div
          className="absolute inset-0 pointer-events-none ms-anim"
          style={{ animation: `ms-winglow 2.4s ${delay + 0.8}s ease-in-out infinite` }}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// Page-change lightning: jagged bolts crack across the table (new shapes
// every switch) with a flash. Mounted fresh on each page change.
// ─────────────────────────────────────────────
const PAGE_OUT_MS = 520; // old rows wipe out, then the new page draws in

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

const PageLightning: React.FC<{ seed: number; width: number; height: number; primary: string; delay?: number }> = ({
  seed,
  width,
  height,
  primary,
  delay = 0,
}) => {
  const bolts = useMemo(() => {
    const rnd = seeded(seed * 7919 + 13);
    const rowsY = Array.from({ length: 5 }, (_, k) => 52 + k * (ROW_H + ROW_GAP) + ROW_H / 2);
    const picks = [rowsY[0] + 30, rowsY[2], rowsY[4] - 20].map((y) => y + (rnd() - 0.5) * 40);
    return picks.map((y0, i) => {
      const pts: string[] = [];
      let x = -20;
      let y = y0;
      while (x < width + 20) {
        pts.push(`${Math.round(x)},${Math.round(y)}`);
        x += 50 + rnd() * 70;
        y = y0 + (rnd() - 0.5) * 46;
      }
      pts.push(`${width + 20},${Math.round(y0)}`);
      // one branch off each bolt
      const at = 3 + Math.floor(rnd() * (pts.length - 6));
      const [bx, by] = pts[at].split(',').map(Number);
      const dir = rnd() > 0.5 ? 1 : -1;
      const branch = [
        `${bx},${by}`,
        `${bx + 30 + rnd() * 30},${by + dir * (20 + rnd() * 20)}`,
        `${bx + 50 + rnd() * 30},${by + dir * (14 + rnd() * 16)}`,
        `${bx + 90 + rnd() * 40},${by + dir * (40 + rnd() * 30)}`,
      ].join(' ');
      return { main: pts.join(' '), branch, delay: i * 0.07 };
    });
  }, [seed, width]);

  return (
    <div className="absolute pointer-events-none z-40" style={{ left: 0, top: 0, width, height }}>
      <div
        className="absolute -inset-[20px] ms-anim"
        style={{
          background: `radial-gradient(ellipse 60% 70% at 50% 50%, #ffffff 0%, ${withAlpha(primary, 0.45)} 40%, transparent 75%)`,
          opacity: 0,
          animation: `ms-pflash .9s ${delay + 0.12}s both ease-out`,
        }}
      />
      <svg className="absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }} aria-hidden>
        {bolts.map((b, i) => (
          <g key={i} className="ms-anim" style={{ animation: `ms-pbolt 1s ${delay + 0.1 + b.delay}s both linear` }}>
            {[b.main, b.branch].map((pts, j) => (
              <polyline
                key={`g${j}`}
                points={pts}
                fill="none"
                stroke={primary}
                strokeWidth={j ? 7 : 14}
                filter="url(#ms-storm-glow)"
                pathLength={1}
                strokeDasharray="1"
                className="ms-anim"
                style={{ strokeDashoffset: 1, animation: `ms-draw .3s ${delay + 0.1 + b.delay + j * 0.12}s ease-out both` }}
              />
            ))}
            {[b.main, b.branch].map((pts, j) => (
              <polyline
                key={`c${j}`}
                points={pts}
                fill="none"
                stroke="#ffffff"
                strokeWidth={j ? 1.6 : 3.2}
                strokeLinejoin="miter"
                pathLength={1}
                strokeDasharray="1"
                className="ms-anim"
                style={{ strokeDashoffset: 1, animation: `ms-draw .3s ${delay + 0.1 + b.delay + j * 0.12}s ease-out both` }}
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
};

// Column header strip
const TableHeader: React.FC<{ primary: string; delay: number }> = ({ primary, delay }) => (
  <div
    className="relative flex items-center h-[42px] mb-[10px] font-[AGENCYB] font-bold text-[1.3rem] tracking-[0.2em] text-white ms-anim"
    style={{ background: INK, animation: `ms-drop .5s ${delay}s both ease-out` }}
  >
    <span className="text-center" style={{ width: COL.rank, color: primary }}>#</span>
    <span style={{ width: COL.logo }} />
    <span className="flex-1 pl-[4px]">TEAM</span>
    <span className="text-center" style={{ width: COL.elims }}>ELIMS</span>
    <span className="text-center" style={{ width: COL.place }}>PLACE</span>
    <span className="text-center" style={{ width: COL.total, color: primary }}>TOTAL</span>
    <div
      className="absolute left-0 right-0 bottom-0 h-[3px] ms-anim"
      style={{
        backgroundColor: primary,
        backgroundImage: 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
        backgroundSize: '200% 100%',
        animation: 'ms-run 5s linear infinite',
        boxShadow: `0 0 10px ${withAlpha(primary, 0.85)}`,
      }}
    />
  </div>
);

// ─────────────────────────────────────────────
// MatchDataComponent
// ─────────────────────────────────────────────
const MatchDataComponent: React.FC<MatchDataProps> = ({ tournament, round, match, matchData }) => {
  const sortedTeams = useMemo(() => computeMatchStandings(matchData), [matchData]);

  // Ranks 2–11 first, then the rest; switches every 25s or from DisplayHud.
  const pageCount = rankingPageCount('Theme2', 'MatchData', sortedTeams.length);
  const pageIndex = useRankingPager('MatchData', pageCount, 25000);
  const page: 'first' | 'rest' = pageIndex === 0 ? 'first' : 'rest';

  const primary = tournament.primaryColor || DEFAULT_PRIMARY;
  const secondary = tournament.secondaryColor || DEFAULT_SECONDARY;
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

  // Page switch: keep showing the old page while its rows wipe out and the
  // lightning cracks, then swap to the new page (which draws in quickly).
  const [shownPage, setShownPage] = useState<'first' | 'rest'>(page);
  const [leaving, setLeaving] = useState(false);
  const [boltSeed, setBoltSeed] = useState(0); // 0 = no page change yet (first load)
  useEffect(() => {
    if (page === shownPage) {
      setLeaving(false); // flipped back before the swap finished
      return;
    }
    setLeaving(true);
    setBoltSeed((s) => s + 1);
    const t = window.setTimeout(() => {
      setShownPage(page);
      setLeaving(false);
    }, reducedMotion() ? 0 : PAGE_OUT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const rootRef = useRef<HTMLDivElement>(null);
  useFxDirector(rootRef, primary, shownPage);

  if (!matchData) {
    return (
      <div className="w-[1920px] h-[1080px] relative">
        <div
          className="absolute left-[110px] top-[190px] w-[520px] h-[64px] flex items-center justify-center gap-[12px] font-[AGENCYB] font-bold text-[1.8rem] tracking-[0.16em]"
          style={{ background: '#ffffff', color: INK, clipPath: CUT_CHIP, borderLeft: `10px solid ${primary}` }}
        >
          <Bolt size={16} color={primary} />
          NO MATCH DATA
        </div>
      </div>
    );
  }

  const topTeam: any = sortedTeams[0];
  const remainingTeams = sortedTeams.slice(1);
  // Pagination sets
  const firstPageTeams = remainingTeams.slice(0, 10); // ranks 2–11 (10 teams)
  const restPageTeams = remainingTeams.slice(10, 22); // ranks 12+
  const pageTeams = shownPage === 'first' ? firstPageTeams : restPageTeams;
  // first load waits for the header + #1 card; page changes come straight in
  const rowBase = boltSeed === 0 ? 0.9 : 0.12;
  const headBase = boltSeed === 0 ? 0.7 : 0.02;

  // Split current page into 2 equal halves
  const pageMid = Math.ceil(pageTeams.length / 2);
  const leftTeams = pageTeams.slice(0, pageMid);
  const rightTeams = pageTeams.slice(pageMid);

  const matchLabel = match ? (match.matchName ? match.matchName : `Match ${match.matchNo || match._matchNo}`) : 'No Match';
  const colW = (TABLE.w - TABLE.gap) / 2;
  const topWinner = topTeam && isWinningPlacement(topTeam.placePoints, topTeam.players?.[0]?.rank);

  return (
    <div ref={rootRef} className={`w-[1920px] h-[1080px] relative antialiased ${reducedMotion() ? 'ms-still' : ''}`}>
      <Styles primary={primary} />

      {/* ═════════════ Header (same as Champions / Fraggers / H2H) ═════════════ */}
      <div className="absolute flex items-stretch ms-anim" style={{ left: HERO.left, top: 30, animation: 'ms-slide-l .6s both ease-out' }}>
        <div className="w-[130px] h-[130px] flex items-center justify-center" style={{ background: themeGrad, clipPath: CUT_BOLT }}>
          {tournament.torLogo ? (
            <img src={tournament.torLogo} alt="" className="w-[84px] h-[84px] object-contain -ml-[12px]" />
          ) : (
            <span className="-ml-[12px]">
              <Bolt size={48} color="#ffffff" />
            </span>
          )}
        </div>
        <div className="relative bg-white pl-[30px] pr-[80px] flex flex-col justify-center -ml-[16px]" style={{ clipPath: CUT_HEAD }}>
          <div className="flex items-center gap-[10px]">
            <Bolt size={14} color={primary} />
            <span className="font-[AGENCYB] font-bold text-[1.35rem] tracking-[0.16em] uppercase whitespace-nowrap" style={{ color: '#5b5f68' }}>
              {tournament.tournamentName}
            </span>
          </div>
          <div className="font-bebas leading-[0.9] text-[5.4rem] tracking-[0.02em] flex gap-[16px] whitespace-nowrap">
            <span
              className="ms-anim"
              style={{
                background: themeGrad,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'ms-title-in .9s .1s both cubic-bezier(.22,1,.36,1)',
              }}
            >
              MATCH
            </span>
            <span className="ms-anim" style={{ color: INK, animation: 'ms-title-in .9s .2s both cubic-bezier(.22,1,.36,1)' }}>
              STANDINGS
            </span>
          </div>
          <div
            className="absolute left-[30px] right-[80px] bottom-[12px] h-[4px] origin-left ms-anim"
            style={{ background: themeGrad, animation: 'ms-line .9s .35s ease-out both' }}
          />
        </div>
      </div>

      {/* round tag + match chip */}
      <div
        className="absolute flex flex-col items-end gap-[10px] ms-anim"
        style={{ right: 110, top: 52, animation: 'ms-slide-r .6s .15s both ease-out' }}
      >
        <div className="h-[54px] pl-[50px] pr-[30px] flex items-center gap-[12px] text-white" style={{ background: themeGrad, clipPath: CUT_TAG }}>
          <Bolt size={18} color="#ffffff" />
          <span className="font-[AGENCYB] font-bold text-[2rem] tracking-[0.08em] leading-none uppercase whitespace-nowrap">
            {round ? round.roundName : 'No Round'}
          </span>
        </div>
        <div
          className="h-[38px] px-[24px] flex items-center gap-[10px] bg-white font-[AGENCYB] font-bold text-[1.2rem] tracking-[0.2em] uppercase ms-anim"
          style={{ clipPath: CUT_CHIP, color: INK, animation: 'ms-flicker 6s 2s infinite' }}
        >
          <Bolt size={11} color={primary} />
          {matchLabel}
        </div>
      </div>

      {/* ═════════════ #1 card ═════════════ */}
      {topTeam && (
        <div className="absolute" style={{ left: HERO.left, top: HERO.top, width: HERO.w, height: HERO.h }}>
          <div className="absolute inset-0 ms-anim" style={{ animation: 'ms-glow 3.2s 1.6s ease-in-out infinite' }}>
            <div className="absolute inset-0 ms-anim" style={{ animation: 'ms-hero-in .9s .1s both cubic-bezier(.22,1,.36,1)' }}>
              <StormSky primary={primary} secondary={secondary} />
              {/* entrance flash */}
              <div className="absolute inset-0 bg-white pointer-events-none ms-anim" style={{ clipPath: CUT_HERO, opacity: 0, animation: 'ms-hero-flash .9s .75s both' }} />
              {/* electric top + bottom edges */}
              <div className="absolute left-[40px] right-0 top-0 h-[3px]" style={electric(primary, 4.5)} />
              <div className="absolute left-0 right-[40px] bottom-0 h-[3px]" style={electric(primary, 5.5)} />
            </div>
          </div>

          {/* player photos, standing out of the card */}
          {topTeam.players.slice(0, 4).map((player: Player, index: number) => (
            <div
              key={player._id}
              className="absolute bottom-0 w-[226px] h-[262px] ms-anim"
              style={{ left: 30 + index * 150, zIndex: 2, animation: `ms-rise .7s ${0.55 + index * 0.1}s both cubic-bezier(.22,1,.36,1)` }}
            >
              <img
                data-fx="photo"
                src={playerPhoto(player.picUrl) || '/def_char.avif'}
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.src.endsWith('/def_char.avif')) img.src = '/def_char.avif';
                }}
                alt={player.playerName}
                className="w-full h-full object-cover object-top"
                style={{ filter: 'drop-shadow(0 10px 16px rgba(0,0,0,.55))' }}
              />
            </div>
          ))}
          {/* fade the photos into the card's lower edge */}
          <div
            className="absolute left-0 right-0 bottom-0 h-[80px] z-[3] pointer-events-none"
            style={{
              clipPath: CUT_HERO,
              background: 'linear-gradient(180deg, transparent, rgba(6,7,11,.55))',
              WebkitMaskImage: 'linear-gradient(90deg, #000 0%, #000 38%, transparent 55%)',
              maskImage: 'linear-gradient(90deg, #000 0%, #000 38%, transparent 55%)',
            }}
          />

          {/* rank badge */}
          <div
            className="absolute z-10 flex flex-col items-center justify-center w-[92px] h-[110px] text-white ms-anim"
            style={{ left: 0, top: -12, background: INK, clipPath: CUT_TILE, animation: 'ms-pop .6s .5s both' }}
          >
            <Crown size={30} color={primary} />
            <span className="font-[AGENCYB] font-bold text-[3.6rem] leading-none mt-[2px]">1</span>
          </div>

          {/* team */}
          <div
            className="absolute z-10 flex items-center gap-[22px] ms-anim"
            style={{ left: 700, top: 0, bottom: 0, animation: 'ms-rise .7s .7s both cubic-bezier(.22,1,.36,1)' }}
          >
            <div className="w-[130px] h-[130px] flex items-center justify-center" style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.55))' }}>
              <TeamLogo logo={topTeam.teamLogo} flag={topTeam.teamFlag} fallback="/def_logo.avif" alt={topTeam.teamTag} className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="font-[AGENCYB] font-bold text-[1.2rem] tracking-[0.3em]" style={{ color: withAlpha('#ffffff', 0.7) }}>
                MATCH LEADER
              </span>
              <span className="font-bebas text-[5.2rem] leading-[0.9] text-white ms-glow-text max-w-[300px] truncate">{topTeam.teamTag}</span>
              {topWinner && (
                <span
                  className="mt-[8px] self-start flex items-center gap-[8px] h-[34px] pl-[12px] pr-[16px] font-[AGENCYB] font-bold text-[1.15rem] tracking-[0.18em]"
                  style={{ background: '#ffffff', color: INK, clipPath: CUT_CHIP }}
                >
                  <Crown size={20} color={primary} />
                  WINNER WINNER
                </span>
              )}
            </div>
          </div>

          {/* stat tiles */}
          <div className="absolute z-10 flex gap-[14px]" style={{ right: 28, top: (HERO.h - 150) / 2 }}>
            <StatTile label="PLACE" value={topTeam.placePoints ?? 0} delay={0.85} themeGrad={themeGrad} primary={primary} />
            <StatTile label="ELIMS" value={topTeam.totalKills ?? 0} delay={0.95} themeGrad={themeGrad} primary={primary} />
            <StatTile label="TOTAL" value={topTeam.total ?? 0} delay={1.05} strong themeGrad={themeGrad} primary={primary} />
          </div>
        </div>
      )}

      {/* ═════════════ Table (ranks 2+) ═════════════ */}
      {/* page dots */}
      {pageCount > 1 && (
        <div className="absolute flex items-center gap-[8px] z-10" style={{ right: HERO.left, top: HERO.top + HERO.h + 6 }}>
          {Array.from({ length: pageCount }).map((_, i) => (
            <div
              key={i}
              className="h-[7px] transition-all duration-500"
              style={{
                width: i === (shownPage === 'first' ? 0 : 1) ? 40 : 16,
                background: i === (shownPage === 'first' ? 0 : 1) ? primary : 'rgba(255,255,255,0.55)',
                clipPath: CUT_CHIP,
                boxShadow: i === (shownPage === 'first' ? 0 : 1) ? `0 0 8px ${primary}` : undefined,
              }}
            />
          ))}
        </div>
      )}
      {/* table lightning: on first appearance (as the rows draw in) and on every page change */}
      {!reducedMotion() && (
        <div className="absolute" style={{ left: TABLE.left, top: TABLE.top }}>
          <PageLightning
            key={boltSeed}
            seed={boltSeed + 101}
            width={TABLE.w}
            height={52 + 5 * (ROW_H + ROW_GAP)}
            primary={primary}
            delay={boltSeed === 0 ? 0.75 : 0}
          />
        </div>
      )}

      {/* key={shownPage}: the new page draws in fresh; .ms-out wipes the old one */}
      <div
        key={shownPage}
        className={`absolute grid grid-cols-2 ${leaving ? 'ms-out' : ''}`}
        style={{ left: TABLE.left, top: TABLE.top, width: TABLE.w, columnGap: TABLE.gap }}
      >
        {/* crackling divider between the two columns */}
        <div
          className="absolute top-[52px] bottom-0 w-[4px] origin-top ms-anim"
          style={{ left: colW + TABLE.gap / 2 - 2, animation: `ms-grow-y .7s ${headBase + 0.1}s both cubic-bezier(.22,1,.36,1)` }}
        >
          <div className="w-full h-full ms-anim" style={{ ...electric(primary, 2.8, true), animation: 'ms-runv 2.8s linear infinite, ms-crackle 3.4s 1.6s linear infinite' }} />
        </div>

        {[leftTeams, rightTeams].map((teams, ci) => (
          <div key={ci} className="flex flex-col" style={{ width: colW, gap: ROW_GAP }}>
            <TableHeader primary={primary} delay={headBase + ci * 0.1} />
            {teams.map((team: any, index: number) => (
              <StandingRow
                key={team._id}
                team={team}
                rank={remainingTeams.findIndex((t: any) => t._id === team._id) + 2}
                order={ci === 0 ? index * 2 : index * 2 + 1}
                side={ci === 0 ? 'l' : 'r'}
                primary={primary}
                themeGrad={themeGrad}
                base={rowBase}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MatchDataComponent;