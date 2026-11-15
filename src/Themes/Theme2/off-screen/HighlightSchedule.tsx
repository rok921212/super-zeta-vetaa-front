import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { computeMatchStandings } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';

interface Tournament {
  _id: string;
  tournamentName: string;
  primaryColor?: string;
  secondaryColor?: string;
}

interface Round {
  _id: string;
  roundName: string;
  day?: string;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
  time?: string;
  map?: string;
  teams?: any[];
}

interface ScheduleProps {
  tournament: Tournament;
  round?: Round | null;
  matches?: Match[];
  matchDatas?: any[];
  selectedScheduleMatches?: string[];
  /** Force a layout. Leave unset to follow the shared toggle (ScheduleOrientationToggle). */
  orientation?: ScheduleOrientation;
}

/* ------------------------------------------------------------------ */
/* Orientation setting — shared between the overlay and the toggle      */
/*   priority: `orientation` prop › ?scheduleLayout=… URL param ›        */
/*             last toggle value (localStorage) › 'vertical'            */
/*   Syncs live across tabs/windows of the same browser                 */
/*   (BroadcastChannel + storage event).                                */
/* ------------------------------------------------------------------ */
export type ScheduleOrientation = 'vertical' | 'horizontal';

const ORIENT_KEY = 'highlightSchedule.orientation';
const ORIENT_CHANNEL = 'highlight-schedule-orientation';
const isOrientation = (v: unknown): v is ScheduleOrientation => v === 'vertical' || v === 'horizontal';

const readStoredOrientation = (): ScheduleOrientation => {
  if (typeof window === 'undefined') return 'vertical';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('scheduleLayout');
    if (isOrientation(fromUrl)) return fromUrl;
    const stored = window.localStorage.getItem(ORIENT_KEY);
    if (isOrientation(stored)) return stored;
  } catch {
    /* storage can throw in locked-down browser sources */
  }
  return 'vertical';
};

const orientListeners = new Set<(o: ScheduleOrientation) => void>();
let orientChannel: BroadcastChannel | null = null;
const getChannel = () => {
  if (orientChannel || typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return orientChannel;
  orientChannel = new BroadcastChannel(ORIENT_CHANNEL);
  orientChannel.onmessage = (e) => {
    if (isOrientation(e.data)) orientListeners.forEach((l) => l(e.data));
  };
  return orientChannel;
};

export const setScheduleOrientation = (o: ScheduleOrientation) => {
  try {
    window.localStorage.setItem(ORIENT_KEY, o);
  } catch {
    /* ignore */
  }
  getChannel()?.postMessage(o);
  orientListeners.forEach((l) => l(o));
};

export const useScheduleOrientation = (): ScheduleOrientation => {
  const [o, setO] = useState<ScheduleOrientation>(readStoredOrientation);
  useEffect(() => {
    getChannel();
    orientListeners.add(setO);
    const onStorage = (e: StorageEvent) => {
      if (e.key === ORIENT_KEY && isOrientation(e.newValue)) setO(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      orientListeners.delete(setO);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return o;
};

/**
 * Built-in floating switch. Rendered through a portal into <body> (so the
 * canvas clipping/scaling can't hide it), pinned to the browser window's
 * top-right corner. Never shown inside OBS (window.obsstudio) or with
 * ?controls=0 in the URL, so it can't end up on stream.
 */
const showFloatingControls = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if ((window as any).obsstudio) return false;
  try {
    if (new URLSearchParams(window.location.search).get('controls') === '0') return false;
  } catch {
    /* ignore */
  }
  return true;
};

const FloatingLayoutSwitch: React.FC<{ value: ScheduleOrientation; primary: string }> = ({ value, primary }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(showFloatingControls()), []);

  // keyboard shortcut: L flips the layout
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'l' || e.key === 'L') setScheduleOrientation(value === 'horizontal' ? 'vertical' : 'horizontal');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mounted, value]);

  if (!mounted) return null;

  const btn = (o: ScheduleOrientation, label: string) => (
    <button
      type="button"
      onClick={() => setScheduleOrientation(o)}
      style={{
        padding: '8px 14px',
        border: 0,
        borderRadius: 6,
        cursor: 'pointer',
        font: '700 13px system-ui, sans-serif',
        letterSpacing: '0.04em',
        color: '#fff',
        background: value === o ? primary : 'transparent',
        opacity: value === o ? 1 : 0.7,
      }}
    >
      {label}
    </button>
  );

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 2147483647,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: 4,
        background: 'rgba(11,13,18,0.92)',
        border: `1px solid ${withAlpha(primary, 0.6)}`,
        borderRadius: 10,
        boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
      }}
      title="Schedule layout (shortcut: L). Hidden in OBS."
    >
      <span style={{ font: '600 12px system-ui, sans-serif', color: 'rgba(255,255,255,0.6)', padding: '0 8px' }}>
        SCHEDULE
      </span>
      {btn('vertical', '☰ Vertical')}
      {btn('horizontal', '⫼ Horizontal')}
    </div>,
    document.body
  );
};

/**
 * Checkbox for your page / dashboard — render it OUTSIDE the 1920×1080 canvas.
 * Checked = horizontal row, unchecked = vertical stack.
 */
export const ScheduleOrientationToggle: React.FC<{ className?: string; label?: string }> = ({
  className,
  label = 'Horizontal schedule',
}) => {
  const o = useScheduleOrientation();
  return (
    <label
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: '#0b0d12',
        color: '#fff',
        borderRadius: 8,
        font: '600 14px system-ui, sans-serif',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={o === 'horizontal'}
        onChange={(e) => setScheduleOrientation(e.target.checked ? 'horizontal' : 'vertical')}
        style={{ width: 16, height: 16, cursor: 'pointer' }}
      />
      {label}
    </label>
  );
};

interface MatchCardProps {
  match: Match;
  index: number;
  primary: string;
  secondary: string;
  isNext: boolean;
}

// Close to the original 528×284 card, a little wider and shorter so the
// stack of matches fits the 1080 canvas.
const ROW_W = 600;
const ROW_H = 210;
const GAP = 20;
// Past what fits the canvas, the whole group shrinks to keep every match on screen.
const STAGE_W = 1920;
const STAGE_H = 1080;
const EDGE = 40;

/* ------------------------------------------------------------------ */
/* Lightning visual language                                           */
/* ------------------------------------------------------------------ */
const INK = '#0b0d12';
const CUT_CARD = 'polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 22px 100%, 0 calc(100% - 22px))';
const CUT_CHIP = 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)';

const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const Bolt: React.FC<{ size?: number; color: string }> = ({ size = 16, color }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" aria-hidden>
    <path d="M13 0 L2 16 H9 L6 28 L18 10 H11 L15 0 Z" fill={color} />
  </svg>
);

/** Branching bolts that strike across a card on their own (slow, staggered) clock. */
const CardStorm: React.FC<{ id: string; primary: string; strong: boolean; seed: number }> = ({
  id,
  primary,
  strong,
  seed,
}) => {
  const bolts = [
    { d: 'M446 0 L426 34 L442 40 L410 88 L428 94 L398 152 L414 158 L388 210', b: 'M428 94 L462 116 L452 124 L484 148' },
    { d: 'M176 0 L194 28 L178 34 L204 76 L188 82 L212 124', b: 'M188 82 L158 100 L168 108 L138 126' },
  ];
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 600 210" preserveAspectRatio="none" aria-hidden>
      <defs>
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {bolts.map((b, i) => {
        // strong (next-up) cards strike more often
        const dur = (strong ? 3.4 : 7.5) + i * 1.7 + (seed % 3) * 0.9;
        const delay = 1.2 + i * 1.3 + (seed % 4) * 0.7;
        return (
          <g key={i} style={{ opacity: 0, animation: `sch-bolt ${dur}s ${delay}s linear infinite` }}>
            <path d={b.d} fill="none" stroke={primary} strokeWidth="7" filter={`url(#${id})`} />
            <path d={b.b} fill="none" stroke={primary} strokeWidth="4" filter={`url(#${id})`} />
            <path d={b.d} fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="miter" />
            <path d={b.b} fill="none" stroke="#fff" strokeWidth="1.2" strokeLinejoin="miter" />
          </g>
        );
      })}
    </svg>
  );
};

const getMapImage = (mapName?: string) => {
  switch (mapName?.toLowerCase()) {
    case 'erangel':
      return '/schedulePic/erag.avif';
    case 'miramar':
      return '/schedulePic/miramar.avif';
    case 'sanhok':
      return '/schedulePic/sanhok.jpg';
    case 'rondo':
      return '/schedulePic/rondo1.avif';
    case 'bermuda':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761360885/bermuda_axt2w0.jpg';
    case 'alpine':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761361515/alpine_wfchbf.jpg';
    case 'nexterra':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761361420/nexterra_v0ivox.jpg';
    case 'purgatory':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761361420/purgatory1_frijhy.jpg';
    case 'kalahari':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761361420/kalahari_jrhc4o.jpg';
    default:
      return null;
  }
};

const matchNumber = (m: Match) => m.matchNo || m._matchNo;

/** Electric line: theme colour with a white spark running along it. */
const electric = (primary: string, speed: number): React.CSSProperties => ({
  backgroundColor: primary,
  backgroundImage: 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
  backgroundSize: '200% 100%',
  animation: `sch-run ${speed}s linear infinite`,
  boxShadow: `0 0 12px ${withAlpha(primary, 0.9)}, 0 0 4px ${withAlpha(primary, 1)}`,
});

// Module level on purpose: defined inside the view, every data update would
// remount the cards and replay their entrance animations.
const MatchCard: React.FC<MatchCardProps> = ({ match, index, primary, secondary, isNext }) => {
  const winner: any = useMemo(
    () => computeMatchStandings({ teams: match.teams }).find((t: any) => t.wwcd),
    [match.teams]
  );

  const accent = `linear-gradient(120deg, ${primary}, ${secondary})`;
  const mapImage = getMapImage(match.map);
  const mapName = match.map?.toUpperCase() || 'NO MAP';
  const title = `MATCH ${matchNumber(match) || index + 1}`;
  const glowText = `0 0 18px ${withAlpha(primary, 0.85)}, 0 0 3px rgba(255,255,255,0.6)`;

  return (
    <motion.div
      className="relative flex-none"
      style={{
        width: ROW_W,
        height: ROW_H,
        // outer glow lives outside the clip so it isn't cut off
        animation: `sch-glow ${isNext ? 2.2 : 3.6}s ${index * 0.3}s ease-in-out infinite`,
      }}
      initial={{ opacity: 0, x: -120, skewX: -10 }}
      animate={{ opacity: 1, x: 0, skewX: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
    >
      <div className="relative w-full h-full overflow-hidden text-white" style={{ clipPath: CUT_CARD, background: INK }}>
        {mapImage ? (
          <img
            src={mapImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: winner ? 0.3 : 1, filter: winner ? 'grayscale(.4)' : undefined }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${primary}, ${INK} 75%)` }} />
        )}

        {/* storm tint from the top */}
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse 70% 70% at 70% 0%, ${withAlpha(primary, 0.45)} 0%, transparent 70%)` }}
        />

        {winner ? (
          <>
            <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(11,13,18,0.2), rgba(11,13,18,0.88))' }} />

            <CardStorm id={`sch-f-${match._id}`} primary={primary} strong={false} seed={index} />

            {/* Match bar */}
            <div
              className="absolute top-0 left-0 right-0 h-[46px] pl-[18px] pr-[40px] flex items-center justify-between font-bebas z-10"
              style={{ background: 'rgba(11,13,18,0.9)' }}
            >
              <span className="text-[34px] leading-none pt-[3px]" style={{ textShadow: glowText }}>
                {title}
              </span>
              <span className="flex items-center gap-[6px] text-[19px] leading-none font-[Righteous] text-white/80">
                <Bolt size={11} color={primary} />
                {mapName}
              </span>
              <div className="absolute left-0 right-0 bottom-0 h-[3px]" style={electric(primary, 4)} />
            </div>

            {/* Winner logo */}
            <div
              className="absolute left-0 bottom-0 top-[46px] w-[200px] flex items-center pl-[18px] overflow-hidden"
              style={{ background: accent, clipPath: 'polygon(0 0, 100% 0, 82% 100%, 0 100%)' }}
            >
              <div
                className="absolute inset-0 opacity-[0.14]"
                style={{ background: 'repeating-linear-gradient(-60deg, #fff 0 2px, transparent 2px 20px)' }}
              />
              <div
                className="absolute left-[78px] top-1/2 w-[150px] h-[150px] rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, transparent 65%)',
                  animation: `sch-pulse 2.8s ${index * 0.4}s ease-in-out infinite`,
                }}
              />
              <motion.div
                className="relative w-[124px] h-[124px]"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.1 + 0.3, type: 'spring', stiffness: 220, damping: 15 }}
              >
                <TeamLogo
                  logo={winner.teamLogo}
                  flag={winner.teamFlag}
                  fallback="/def_logo.png"
                  alt={winner.teamTag}
                  className="w-full h-full object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.5)]"
                />
              </motion.div>
              {/* electric slanted edge */}
              <div
                className="absolute top-0 bottom-0 right-[16px] w-[4px]"
                style={{ ...electric(primary, 3), transform: 'skewX(-10deg)' }}
              />
            </div>

            {/* Winner details */}
            <div className="absolute left-[200px] right-[22px] top-[46px] bottom-[6px] flex items-center justify-end gap-[18px]">
              <div className="min-w-0 flex flex-col items-end text-right">
                <div
                  className="flex items-center gap-[6px] h-[28px] pl-[10px] pr-[12px] text-[18px] leading-none font-[Righteous]"
                  style={{ background: accent, clipPath: CUT_CHIP, animation: 'sch-flicker 5s 1.5s infinite' }}
                >
                  <img src="/theme4assets/chickenWhite.png" alt="" className="w-[20px] h-[20px] object-contain" />
                  WWCD
                </div>
                <div className="w-full mt-[4px] text-[44px] leading-[0.95] font-bebas truncate">
                  {winner.teamTag || winner.teamName}
                </div>
                <div className="text-[17px] leading-none font-[Righteous] text-white/70 whitespace-nowrap">
                  {winner.totalKills} KILLS · {Number(winner.placePoints) || 0} PLACE
                </div>
              </div>
              <div className="flex flex-col items-center shrink-0 pl-[16px] border-l-2" style={{ borderColor: withAlpha(primary, 0.6) }}>
                <span className="font-bebas text-[76px] leading-[0.85]" style={{ textShadow: glowText }}>
                  {winner.total}
                </span>
                <span className="font-bebas text-[26px] leading-none" style={{ color: primary }}>
                  PTS
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(11,13,18,0.95), rgba(11,13,18,0.1) 70%)' }}
            />

            <CardStorm id={`sch-f-${match._id}`} primary={primary} strong={isNext} seed={index} />

            {/* status chip */}
            <div
              className="absolute top-[14px] left-[16px] h-[32px] pl-[12px] pr-[16px] flex items-center gap-[6px] font-[Righteous] text-[16px] leading-none tracking-[0.14em]"
              style={
                isNext
                  ? { clipPath: CUT_CHIP, color: INK, background: '#fff', animation: 'sch-flicker 4s infinite' }
                  : { clipPath: CUT_CHIP, background: 'rgba(11,13,18,0.8)', color: 'rgba(255,255,255,0.85)' }
              }
            >
              {isNext && <Bolt size={11} color={primary} />}
              {isNext ? 'NEXT UP' : 'UPCOMING'}
            </div>

            {/* time chip */}
            <div
              className="absolute top-[14px] right-[34px] h-[40px] px-[16px] flex items-center gap-[8px] font-bebas text-[30px] leading-none"
              style={{
                background: isNext ? accent : 'rgba(11,13,18,0.85)',
                clipPath: CUT_CHIP,
                boxShadow: `inset 0 0 0 1px ${withAlpha(primary, 0.6)}`,
              }}
            >
              <Bolt size={12} color={isNext ? '#fff' : primary} />
              <span className="pt-[3px] whitespace-nowrap">{match.time ? match.time.toUpperCase() : 'TBA'}</span>
            </div>

            <div className="absolute left-[22px] right-[22px] bottom-[16px]">
              <div className="text-[68px] leading-[0.9] font-bebas" style={{ textShadow: glowText }}>
                {title}
              </div>
              <div className="flex items-center gap-[8px] text-[24px] leading-none font-[Righteous] text-white/80">
                <Bolt size={13} color={primary} />
                {mapName}
                {match.matchName && <span className="text-white/50 truncate">· {match.matchName}</span>}
              </div>
            </div>

            <div className="absolute left-0 right-0 bottom-0 h-[4px]" style={electric(primary, isNext ? 2.2 : 4.5)} />
          </>
        )}

        {/* electric top edge (all cards) */}
        <div className="absolute left-0 right-[26px] top-0 h-[2px] opacity-80 z-20" style={electric(primary, 6)} />

        {/* one pass of light when the card lands */}
        <motion.div
          className="absolute top-0 bottom-0 w-[110px] pointer-events-none z-30"
          style={{ left: -160, skewX: -18, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)' }}
          initial={{ x: 0 }}
          animate={{ x: ROW_W + 320 }}
          transition={{ delay: index * 0.1 + 0.55, duration: 0.9, ease: 'easeInOut' }}
        />
      </div>
    </motion.div>
  );
};

const HighlightSchedule: React.FC<ScheduleProps> = ({
  tournament,
  round,
  matches: propMatches,
  matchDatas: propMatchDatas,
  selectedScheduleMatches,
  orientation: orientationProp,
}) => {
  const sharedOrientation = useScheduleOrientation();
  const orientation = orientationProp ?? sharedOrientation;
  const horizontal = orientation === 'horizontal';

  const sortedMatches = useMemo<Match[]>(() => {
    if (!propMatches) return [];

    // matchDatas leaves out matches with no data, so its positions don't line
    // up with `matches`: pair by id. Position is only for entries without one.
    const datas = propMatchDatas || [];
    const dataById = new Map(datas.filter((d) => d?.matchId != null).map((d) => [String(d.matchId), d]));
    const merged = propMatches.map((match, idx) => {
      const positional = datas[idx]?.matchId == null ? datas[idx] : undefined;
      return { ...match, teams: (dataById.get(String(match._id)) ?? positional)?.teams || [] };
    });

    const selected = selectedScheduleMatches?.length
      ? merged.filter((m) => selectedScheduleMatches.includes(m._id))
      : merged;

    const dedupeKey = (m: Match) => matchNumber(m) || m._id;
    return selected
      .filter((m, i, all) => i === all.findIndex((o) => dedupeKey(o) === dedupeKey(m)))
      .sort((a, b) => (matchNumber(a) || 0) - (matchNumber(b) || 0));
  }, [propMatches, propMatchDatas, selectedScheduleMatches]);

  // First match without a WWCD winner gets the "next up" treatment.
  const nextId = useMemo(() => {
    const next = sortedMatches.find((m) => !computeMatchStandings({ teams: m.teams }).some((t: any) => t.wwcd));
    return next?._id ?? null;
  }, [sortedMatches]);

  if (!round) {
    return (
      <div className="w-[1920px] h-[1080px] text-white flex items-center justify-center">No round selected</div>
    );
  }

  const primary = tournament.primaryColor || '#000';
  const secondary = tournament.secondaryColor || '#333';

  // vertical: Match 1 on top, each next one below.
  // horizontal: Match 1 on the left, each next one to the right.
  // Either way the group shrinks as a whole if it doesn't fit the canvas.
  const n = sortedMatches.length;
  const groupW = horizontal ? n * ROW_W + Math.max(n - 1, 0) * GAP : ROW_W;
  const groupH = horizontal ? ROW_H : n * ROW_H + Math.max(n - 1, 0) * GAP;
  const scale = Math.min(
    1,
    (STAGE_W - EDGE * 2) / Math.max(groupW, 1),
    (STAGE_H - EDGE * 2) / Math.max(groupH, 1)
  );

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden flex items-center justify-center">
      <style>{`
        @keyframes sch-run { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        @keyframes sch-glow {
          0%, 100% { filter: drop-shadow(0 0 6px ${withAlpha(primary, 0.45)}); }
          50%      { filter: drop-shadow(0 0 22px ${withAlpha(primary, 0.9)}); }
        }
        @keyframes sch-pulse { 0%, 100% { opacity: .35; transform: translate(-50%,-50%) scale(.9); } 50% { opacity: .8; transform: translate(-50%,-50%) scale(1.05); } }
        @keyframes sch-flicker {
          0%, 88%, 100% { opacity: 1; }
          89% { opacity: .25; } 90% { opacity: 1; }
          92% { opacity: .5; }  93% { opacity: 1; }
        }
        /* short strike near the start of each cycle, quiet the rest */
        @keyframes sch-bolt {
          0%, 100% { opacity: 0; }
          2% { opacity: 1; } 4% { opacity: .15; } 6.5% { opacity: 1; } 9% { opacity: .4; } 12% { opacity: 0; }
        }
      `}</style>

      {/* keyed on orientation so the cards replay their entrance when it flips */}
      <div
        key={orientation}
        className={`flex flex-none ${horizontal ? 'flex-row' : 'flex-col'}`}
        style={{ width: groupW, height: groupH, gap: GAP, transform: `scale(${scale})` }}
      >
        {sortedMatches.map((match, index) => (
          <MatchCard
            key={match._id}
            match={match}
            index={index}
            primary={primary}
            secondary={secondary}
            isNext={match._id === nextId}
          />
        ))}
      </div>

      {sortedMatches.length === 0 && (
        <div className="text-white font-[Righteous] text-[32px]">No matches scheduled</div>
      )}

      {/* layout switch — only when not forced by the prop */}
      {!orientationProp && <FloatingLayoutSwitch value={orientation} primary={primary} />}
    </div>
  );
};

export default HighlightSchedule;