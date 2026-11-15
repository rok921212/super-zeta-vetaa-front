import React, { useEffect, useMemo, useRef, useState, memo } from 'react';
import { MatchData, useSortedTeams, isPlayerDead, Player } from '../../shared/hooks/unsortteams';
import { useLocalTeamThrowables, ThrowableKind } from '../../shared/hooks/useLocalTeamThrowables';
import { TeamLogo } from '../../shared/components/TeamLogo';
// NOTE: no socket here — PublicThemeRenderer owns the single connection,
// merges 'bulkUpdate' and passes fresh `matchData` down as a prop.

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
// Visual language (shared with LiveStats)
// ─────────────────────────────────────────────
const INK = '#0d0f13';
const CUT_CARD = 'polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px)';
const CUT_RANK = 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)';

const CARD_W = 300;
const HEAD_H = 60;
const STRIP_H = 34;
const BAR_H = 36;

const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// ─────────────────────────────────────────────
// FX director — one flashy effect at a time, picked at random.
//   • strike: one living player's bolt pops + double-flashes + throws sparks
//   • sheen:  a shine sweeps slowly across one rank box
// Effects are played with the Web Animations API directly on the DOM, so
// they never cause a React re-render. The same element is never picked
// twice in a row, and an effect always finishes before the next starts.
// ─────────────────────────────────────────────
const FX_GAP_MIN = 1600; // ms between effect starts (min)
const FX_GAP_MAX = 3400; // ms between effect starts (max)
const FX_WEIGHTS = { strike: 0.6, sheen: 0.4 }; // relative odds per type
const STRIKE_MS = 1200;
const SHEEN_MS = 1600;

type FxKind = keyof typeof FX_WEIGHTS;

function useFxDirector(rootRef: React.RefObject<HTMLElement | null>, primary: string) {
  const primaryRef = useRef(primary);
  primaryRef.current = primary;

  useEffect(() => {
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

    const playStrike = (bolt: HTMLElement) => {
      const glow = primaryRef.current;
      const wrap = bolt.querySelector<HTMLElement>('[data-fx="strike"]');
      if (wrap?.animate) {
        const baseFilter = getComputedStyle(wrap).filter;
        const rest = baseFilter && baseFilter !== 'none' ? baseFilter : 'brightness(1)';
        track(
          wrap.animate(
            [
              { offset: 0, transform: 'scale(1)', filter: rest },
              { offset: 0.06, transform: 'scale(1.24)', filter: 'brightness(2.3) drop-shadow(0 0 7px #ffffff)' },
              { offset: 0.24, transform: 'scale(1.04)', filter: 'brightness(1.2)' },
              { offset: 0.4, transform: 'scale(1.16)', filter: `brightness(1.9) drop-shadow(0 0 10px ${glow})` },
              { offset: 1, transform: 'scale(1)', filter: rest },
            ],
            { duration: STRIKE_MS, easing: 'ease-out' }
          )
        );
      }
      const zap = bolt.querySelector<SVGElement>('[data-fx="zap"]');
      track(
        zap?.animate?.(
          [
            { offset: 0, opacity: 0 },
            { offset: 0.06, opacity: 1 },
            { offset: 0.24, opacity: 0.1 },
            { offset: 0.4, opacity: 1 },
            { offset: 0.65, opacity: 0 },
            { offset: 1, opacity: 0 },
          ],
          { duration: STRIKE_MS }
        )
      );
      bolt.querySelectorAll<HTMLElement>('[data-fx="spark"]').forEach((s) => {
        const { dx = '0px', dy = '0px', r = '0deg' } = s.dataset;
        const from = `translate(0, 0) rotate(${r}) scaleY(1)`;
        const to = `translate(${dx}, ${dy}) rotate(${r}) scaleY(.3)`;
        track(
          s.animate?.(
            [
              { offset: 0, opacity: 0, transform: from },
              { offset: 0.05, opacity: 1, transform: from },
              { offset: 0.55, opacity: 0, transform: to },
              { offset: 1, opacity: 0, transform: to },
            ],
            { duration: STRIKE_MS, easing: 'ease-out' }
          )
        );
      });
      return STRIKE_MS;
    };

    const playSheen = (el: HTMLElement) => {
      track(
        el.animate?.(
          [
            { transform: 'translateX(-160%) skewX(-20deg)' },
            { transform: 'translateX(260%) skewX(-20deg)' },
          ],
          { duration: SHEEN_MS, easing: 'ease-in-out' }
        )
      );
      return SHEEN_MS;
    };

    const tick = () => {
      if (cancelled) return;
      const root = rootRef.current;
      let dur = 0;

      if (root && !document.hidden) {
        const bolts = Array.from(root.querySelectorAll<HTMLElement>('[data-fx-bolt="live"]'));
        const sheens = Array.from(root.querySelectorAll<HTMLElement>('[data-fx-sheen]'));
        const avail: FxKind[] = [];
        if (bolts.length) avail.push('strike');
        if (sheens.length) avail.push('sheen');

        const kind = pickKind(avail);
        const el = kind === 'strike' ? pickEl(bolts) : kind === 'sheen' ? pickEl(sheens) : null;
        if (el) {
          last = el;
          dur = kind === 'strike' ? playStrike(el) : playSheen(el);
        }
      }

      const gap = FX_GAP_MIN + Math.random() * (FX_GAP_MAX - FX_GAP_MIN);
      // never overlap: wait for the current effect to finish first
      timer = window.setTimeout(tick, Math.max(gap, dur + 150));
    };

    timer = window.setTimeout(tick, FX_GAP_MIN);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      running.forEach((a) => a.cancel());
      running.clear();
    };
  }, [rootRef]);
}

// ─────────────────────────────────────────────
// Keyframes — constant motion only (names match LiveStats; durations are
// set inline, so both overlays can share a page). Flashy effects are
// driven by useFxDirector instead.
// ─────────────────────────────────────────────
const UpperStyles: React.FC = () => (
  <style>{`
    @keyframes pulseBlue {
      0%, 100% { box-shadow: inset 0 0 10px rgba(59,130,246,0.4); }
      50%      { box-shadow: inset 0 0 25px rgba(59,130,246,1); }
    }
    @keyframes ls-flow { from { transform: translateY(0); } to { transform: translateY(-6px); } }
    @keyframes ls-crackle { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -14; } }
    @keyframes ls-crackle-op {
      0%, 100% { opacity: .85; } 18% { opacity: .2; } 31% { opacity: 1; }
      47% { opacity: .35; } 63% { opacity: .95; } 80% { opacity: .15; }
    }
    @keyframes ls-cap { 0%, 100% { opacity: .65; } 50% { opacity: 1; } }
    @keyframes ls-hit { 0% { opacity: .95; } 100% { opacity: 0; } }
    @keyframes ls-neon {
      0%, 100% { opacity: 1; } 6% { opacity: .25; } 8% { opacity: 1; }
      38% { opacity: .9; } 40% { opacity: .2; } 43% { opacity: 1; }
      71% { opacity: .55; } 74% { opacity: 1; }
    }
    @keyframes ls-run { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    @keyframes up-in {
      from { opacity: 0; transform: translateY(-10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes up-pop { 0% { transform: scale(1.5); color: #ffffff; } 100% { transform: scale(1); } }
  `}</style>
);

// ─────────────────────────────────────────────
// PlayerHealthBar — same living lightning bolt as LiveStats.
// Strike is played by useFxDirector; damage flash is still immediate.
// ─────────────────────────────────────────────
interface HealthBarProps {
  player: Player;
  apiEnabled: boolean;
  baseHealthBar: number;
}

const BOLT_PATH = 'M10 0 H16 L10.5 13 H15 L4 32 L7 17.5 H1.5 Z';
const ARC_POINTS = '12,1 9,7 11.5,10 7.5,15 10,17 5.5,24 6.5,27 4.5,31';

const PALETTE = {
  alive: { hi: '#b9ffcb', mid: '#1cf55a', lo: '#00872f', glow: 'rgba(28,245,90,0.9)' },
  low: { hi: '#ffe9a3', mid: '#ffb300', lo: '#c25e00', glow: 'rgba(255,179,0,0.9)' },
  knock: { hi: '#ffb3b3', mid: '#ff1f1f', lo: '#8c0000', glow: 'rgba(255,31,31,0.9)' },
};

let boltUid = 0;

const SPARKS = [
  { dx: '-10px', dy: '-6px', r: '-55deg' },
  { dx: '10px', dy: '-9px', r: '40deg' },
  { dx: '-3px', dy: '-14px', r: '-10deg' },
  { dx: '8px', dy: '6px', r: '120deg' },
];

const PlayerHealthBar = memo(
  ({ player, apiEnabled, baseHealthBar }: HealthBarProps) => {
    const isDead = isPlayerDead(player);
    const isKnocked = player.liveState === 4;

    const ratio = isDead
      ? 0
      : apiEnabled
      ? Math.max(0, Math.min(1, player.health / (player.healthMax || 100)))
      : 1;

    const uid = useRef(`uhb${++boltUid}`).current;

    // Damage jolt: replay flash + shake whenever health drops.
    const prevRatio = useRef(ratio);
    const [hitKey, setHitKey] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (!isDead && ratio < prevRatio.current - 0.001) {
        setHitKey((k) => k + 1);
        rootRef.current?.animate?.(
          [
            { transform: 'translate(0,0)' },
            { transform: 'translate(-2px,1px)' },
            { transform: 'translate(2px,-1px)' },
            { transform: 'translate(-1px,0)' },
            { transform: 'translate(1px,1px)' },
            { transform: 'translate(0,0)' },
          ],
          { duration: 350, easing: 'ease-out' }
        );
      }
      prevRatio.current = ratio;
    }, [ratio, isDead]);

    const pal = isKnocked ? PALETTE.knock : ratio < 0.3 ? PALETTE.low : PALETTE.alive;
    const live = !isDead;
    const striking = live && !isKnocked; // only these can be picked by the director
    const h = baseHealthBar;
    const w = Math.round(h * 0.54);
    const drop = (1 - ratio) * 32;
    const flowDur = isKnocked ? 2.8 : ratio < 0.3 ? 1.0 : 1.6;

    return (
      <div
        ref={rootRef}
        className="relative shrink-0"
        style={{ width: w, height: h }}
        data-fx-bolt={striking ? 'live' : 'off'}
      >
        <div
          data-fx="strike"
          className="absolute inset-0"
          style={{
            transformOrigin: '50% 55%',
            filter: live ? `drop-shadow(0 0 2.5px ${pal.glow})` : undefined,
          }}
        >
          <svg
            width={w}
            height={h}
            viewBox="0 0 16 32"
            preserveAspectRatio="none"
            style={{ overflow: 'visible', display: 'block' }}
            aria-hidden
          >
            <defs>
              <clipPath id={`${uid}c`}>
                <path d={BOLT_PATH} />
              </clipPath>
              <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={pal.hi} />
                <stop offset="22%" stopColor={pal.mid} />
                <stop offset="100%" stopColor={pal.lo} />
              </linearGradient>
            </defs>

            <path d={BOLT_PATH} fill={isDead ? '#2a2c31' : 'rgba(13,15,19,0.3)'} />

            {live && (
              <g clipPath={`url(#${uid}c)`}>
                <g
                  style={{
                    transform: `translateY(${drop}px)`,
                    transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  <g style={{ animation: isKnocked ? 'ls-neon 3.2s linear infinite' : undefined }}>
                    <rect x="0" y="0" width="16" height="32" fill={`url(#${uid}g)`} />
                    <g style={{ animation: `ls-flow ${flowDur}s linear infinite` }}>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <polygon
                          key={i}
                          points={`0,${i * 6 + 4} 16,${i * 6} 16,${i * 6 + 1.6} 0,${i * 6 + 5.6}`}
                          fill="rgba(255,255,255,0.26)"
                        />
                      ))}
                    </g>
                    <polyline
                      points={ARC_POINTS}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="1.1"
                      strokeLinejoin="miter"
                      strokeDasharray="5 2 3 4"
                      style={{ animation: 'ls-crackle 1.2s linear infinite, ls-crackle-op 2s steps(1) infinite' }}
                    />
                    {ratio < 1 && (
                      <rect
                        x="0"
                        y="-0.6"
                        width="16"
                        height="1.6"
                        fill="#ffffff"
                        style={{ animation: 'ls-cap 1.4s ease-in-out infinite' }}
                      />
                    )}
                  </g>
                </g>
              </g>
            )}

            <path
              d={BOLT_PATH}
              fill="none"
              stroke={isDead ? 'rgba(255,255,255,0.18)' : 'rgba(13,15,19,0.55)'}
              strokeWidth="0.8"
              strokeLinejoin="miter"
            />

            {/* strike flash — played by useFxDirector */}
            {striking && <path data-fx="zap" d={BOLT_PATH} fill="#ffffff" style={{ opacity: 0 }} />}

            {/* damage flash — immediate */}
            {hitKey > 0 && (
              <path key={hitKey} d={BOLT_PATH} fill="#ffffff" style={{ animation: 'ls-hit 0.45s ease-out forwards' }} />
            )}
          </svg>

          {/* sparks — played by useFxDirector */}
          {striking &&
            SPARKS.map((s, i) => (
              <span
                key={i}
                data-fx="spark"
                data-dx={s.dx}
                data-dy={s.dy}
                data-r={s.r}
                className="absolute pointer-events-none"
                style={{
                  left: '50%',
                  top: '45%',
                  width: 2,
                  height: 6,
                  marginLeft: -1,
                  marginTop: -3,
                  borderRadius: 1,
                  background: '#fff',
                  boxShadow: `0 0 4px ${pal.glow}, 0 0 2px #fff`,
                  opacity: 0,
                  transform: `rotate(${s.r})`,
                }}
              />
            ))}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.player.health === next.player.health &&
    prev.player.healthMax === next.player.healthMax &&
    prev.player.liveState === next.player.liveState &&
    prev.player.bHasDied === next.player.bHasDied &&
    prev.apiEnabled === next.apiEnabled &&
    prev.baseHealthBar === next.baseHealthBar
);
PlayerHealthBar.displayName = 'PlayerHealthBar';

// ─────────────────────────────────────────────
// Throwable icons (24×24, drawn on the dark strip — details in INK)
// ─────────────────────────────────────────────
type IconProps = { color: string; size?: number };

const FragIcon: React.FC<IconProps> = ({ color, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="6.5" cy="5" r="2.2" fill="none" stroke={color} strokeWidth="1.4" />
    <rect x="9" y="4" width="6" height="4" rx="0.8" fill={color} />
    <path d="M14.5 4.2 L19.5 2 L20.6 3.6 L15.4 7.4 Z" fill={color} />
    <ellipse cx="12" cy="15.2" rx="6.6" ry="7.2" fill={color} />
    <path d="M5.6 13 H18.4 M5.6 17.4 H18.4 M9.6 8.4 V22 M14.4 8.4 V22" stroke={INK} strokeWidth="1.1" opacity="0.55" />
    <ellipse cx="9.4" cy="12" rx="1.4" ry="2" fill="#ffffff" opacity="0.45" />
  </svg>
);

const SmokeIcon: React.FC<IconProps> = ({ color, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="16.5" cy="6.5" r="3" fill={color} opacity="0.55" />
    <circle cx="20" cy="3.6" r="2.2" fill={color} opacity="0.4" />
    <circle cx="13.2" cy="3.4" r="2" fill={color} opacity="0.35" />
    <rect x="5.5" y="8.5" width="9" height="13.5" rx="1.6" fill={color} />
    <rect x="6.5" y="6.4" width="7" height="2.4" rx="0.6" fill={color} />
    <rect x="5.5" y="12" width="9" height="1.4" fill={INK} opacity="0.5" />
    <rect x="5.5" y="17.6" width="9" height="1.4" fill={INK} opacity="0.5" />
    <rect x="7.2" y="9.6" width="1.4" height="11" rx="0.7" fill="#ffffff" opacity="0.45" />
  </svg>
);

const MolotovIcon: React.FC<IconProps> = ({ color, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 0.4 C15 3.2 15.6 5 13.8 7.2 H10.2 C8.4 5 9.6 2.6 12 0.4 Z" fill={color} />
    <path d="M12 2.6 C13.4 4.2 13.5 5.4 12.6 6.8 H11.4 C10.6 5.4 11 4 12 2.6 Z" fill="#ffe14d" />
    <rect x="10.4" y="7" width="3.2" height="4" fill={color} opacity="0.75" />
    <path d="M7.5 13.2 Q7.5 11 9.7 11 H14.3 Q16.5 11 16.5 13.2 V21.2 Q16.5 22.6 15.1 22.6 H8.9 Q7.5 22.6 7.5 21.2 Z" fill={color} />
    <path d="M7.5 15.6 Q12 14.4 16.5 15.6" fill="none" stroke={INK} strokeWidth="1.1" opacity="0.5" />
    <rect x="9" y="12.6" width="1.3" height="8.4" rx="0.65" fill="#ffffff" opacity="0.45" />
  </svg>
);

const StunIcon: React.FC<IconProps> = ({ color, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path
      d="M12 0.5 V3.6 M4.4 2.6 L6.4 5 M19.6 2.6 L17.6 5 M1.6 8.4 H4.4 M22.4 8.4 H19.6"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <rect x="7" y="7.4" width="10" height="15" rx="1.8" fill={color} />
    <rect x="9" y="5.2" width="6" height="2.6" rx="0.6" fill={color} />
    <circle cx="9.6" cy="10.6" r="0.9" fill={INK} opacity="0.6" />
    <circle cx="12" cy="10.6" r="0.9" fill={INK} opacity="0.6" />
    <circle cx="14.4" cy="10.6" r="0.9" fill={INK} opacity="0.6" />
    <path d="M12.8 13 L9.8 17.6 H11.8 L11 21 L14.4 16.2 H12.4 L13.4 13 Z" fill={INK} opacity="0.75" />
  </svg>
);

// Throwables strip, in display order. The game only reports the spectated
// team's backpack, so a team's numbers are from the last time it was watched
// (useLocalTeamThrowables); a team never watched this match shows dashes.
const THROWABLES: { kind: ThrowableKind; label: string; color: string; Icon: React.FC<IconProps> }[] = [
  { kind: 'frag', label: 'FRAG', color: '#4ade80', Icon: FragIcon },
  { kind: 'smoke', label: 'SMOKE', color: '#d1d5db', Icon: SmokeIcon },
  { kind: 'molotov', label: 'MOLLY', color: '#fb923c', Icon: MolotovIcon },
  { kind: 'stun', label: 'STUN', color: '#facc15', Icon: StunIcon },
];

// Count that pops when it changes.
const PopCount: React.FC<{ value: number | string; dim: boolean }> = ({ value, dim }) => (
  <span
    key={String(value)}
    className="inline-block min-w-[14px] text-center"
    style={{
      color: dim ? 'rgba(255,255,255,0.3)' : '#ffffff',
      animation: dim ? undefined : 'up-pop 0.4s ease-out',
    }}
  >
    {value}
  </span>
);

// ─────────────────────────────────────────────
// TeamCard
// ─────────────────────────────────────────────
interface TeamCardProps {
  team: any;
  rank: number;
  primary: string;
  themeGrad: string;
  apiEnabled: boolean;
  carried?: Record<ThrowableKind, number> | null;
  order: number;
}

const TeamCard: React.FC<TeamCardProps> = ({ team, rank, primary, themeGrad, apiEnabled, carried, order }) => {
  const players: Player[] = (team.players ?? []).slice(0, 4);
  const inZone = team.hasOutsideBlueCircle;

  return (
    <div
      className="relative flex flex-col"
      style={{
        width: CARD_W,
        height: HEAD_H + STRIP_H,
        clipPath: CUT_CARD,
        animation: `up-in 0.6s ${Math.min(order, 12) * 0.05}s both cubic-bezier(0.22,1,0.36,1)`,
      }}
    >
      {/* ── head ── */}
      <div
        className="relative flex items-stretch overflow-hidden"
        style={{
          height: HEAD_H,
          background: `linear-gradient(90deg, ${withAlpha(primary, 0.24)} 0%, #ffffff 42%, #eef0f3 100%)`,
        }}
      >
        {inZone && (
          <div
            className="absolute inset-0 pointer-events-none z-[2]"
            style={{
              background: 'rgba(59,130,246,0.15)',
              boxShadow: 'inset 0 0 20px rgba(59,130,246,0.8)',
              animation: 'pulseBlue 1.2s infinite',
            }}
          />
        )}

        {/* rank */}
        <div
          className="relative shrink-0 flex items-center justify-center text-white font-[AGENCYB] font-bold text-[1.7rem] leading-none overflow-hidden"
          style={{
            width: 40,
            background: themeGrad,
            clipPath: CUT_RANK,
            textShadow: '0 0 8px rgba(255,255,255,0.55)',
          }}
        >
          {/* shine — swept by useFxDirector */}
          <span
            data-fx-sheen
            className="absolute top-0 bottom-0 left-0 w-[18px] pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent)',
              transform: 'translateX(-160%) skewX(-20deg)',
            }}
          />
          <span className="relative pl-[4px] pr-[6px]">{rank}</span>
        </div>

        {/* logo */}
        <div className="shrink-0 flex items-center justify-center pl-[8px]" style={{ width: 52 }}>
          <div className="w-[42px] h-[42px]">
            <TeamLogo
              logo={team.teamLogo}
              flag={team.teamFlag}
              fallback={'/def_logo.avif'}
              alt={team.teamTag}
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* tag + sub-line */}
        <div className="flex-1 min-w-0 flex flex-col justify-center pl-[8px] leading-none">
          <span className="truncate font-[AGENCYB] font-bold text-[1.75rem]" style={{ color: INK }}>
            {team.teamTag?.toUpperCase()}
          </span>
          <span className="mt-[3px] font-[AGENCYB] text-[0.85rem] tracking-[0.14em]" style={{ color: withAlpha(INK, 0.6) }}>
            <span style={{ color: primary }}>{team.totalKills ?? 0}</span> ELIMS
          </span>
        </div>

        {/* health bolts */}
        <div className="shrink-0 flex items-center justify-center gap-[5px] pr-[12px] pl-[4px]">
          {players.length === 0 ? (
            <span className="font-[AGENCYB] text-[1rem] tracking-[0.1em]" style={{ color: primary }}>
              MISS
            </span>
          ) : (
            players.map((player) => (
              <PlayerHealthBar key={player._id} player={player} apiEnabled={apiEnabled} baseHealthBar={BAR_H} />
            ))
          )}
        </div>

        {/* electric top edge (slowed) */}
        <div
          className="absolute top-0 left-0 right-0 h-[3px] z-[3]"
          style={{
            backgroundColor: primary,
            backgroundImage: 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
            backgroundSize: '200% 100%',
            animation: `ls-run 5s ${((order * 0.37) % 5).toFixed(2)}s linear infinite`,
            boxShadow: `0 0 8px ${withAlpha(primary, 0.9)}`,
          }}
        />
      </div>

      {/* ── utilities strip ── */}
      <div
        className="relative grid grid-cols-4"
        style={{ height: STRIP_H, background: INK, boxShadow: `inset 0 2px 0 ${withAlpha(primary, 0.7)}` }}
      >
        {THROWABLES.map(({ kind, label, color, Icon }, i) => {
          const count = carried ? carried[kind] ?? 0 : null;
          const empty = count === null || count === 0;
          return (
            <div
              key={kind}
              className="relative flex items-center justify-center gap-[5px] font-[AGENCYB] font-bold leading-none"
              title={label}
            >
              {i > 0 && <span className="absolute left-0 top-[8px] bottom-[8px] w-px bg-white/10" />}
              <span
                style={{
                  opacity: empty ? 0.35 : 1,
                  filter: empty ? 'grayscale(1)' : `drop-shadow(0 0 3px ${withAlpha(color, 0.7)})`,
                  display: 'flex',
                }}
              >
                <Icon color={color} size={20} />
              </span>
              <span className="text-[1.15rem]">
                <PopCount value={count === null ? '-' : count} dim={empty} />
              </span>
            </div>
          );
        })}
      </div>
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
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;
  const apiEnabled = round?.apiEnable === true;

  const fxRootRef = useRef<HTMLDivElement>(null);
  useFxDirector(fxRootRef, primary);

  // Every team that still has someone alive, keeping its overall rank.
  const aliveTeams = useMemo(
    () =>
      sortedTeams
        .map((team, i) => ({ team, rank: i + 1 }))
        .filter(({ team }) => team.aliveCount > 0),
    [sortedTeams]
  );

  if (!matchData) {
    return (
      <div className="w-[1920px] h-[1080px] relative">
        <div
          className="absolute right-[30px] top-[40px] w-[400px] h-[50px] flex items-center justify-center font-[AGENCYB] text-[1.6rem] tracking-[0.14em]"
          style={{ background: 'linear-gradient(90deg, #ffffff 0%, #eef0f3 100%)', color: INK, borderLeft: `8px solid ${primary}` }}
        >
          NO MATCH DATA
        </div>
      </div>
    );
  }

  return (
    <div ref={fxRootRef} className="w-[1920px] h-[1080px] flex justify-center relative antialiased">
      <UpperStyles />
      <div className="w-full top-[40px] relative px-[30px]">
        <div className="grid grid-cols-6 gap-x-[12px] gap-y-[14px] justify-center">
          {aliveTeams.map(({ team, rank }, order) => {
            const slot = Number((team as typeof team & { slot?: number }).slot);
            const carried = throwables?.get(slot) as Record<ThrowableKind, number> | undefined;
            return (
              <TeamCard
                key={team._id}
                team={team}
                rank={rank}
                order={order}
                primary={primary}
                themeGrad={themeGrad}
                apiEnabled={apiEnabled}
                carried={carried ?? null}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Upper;