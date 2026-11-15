import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { computeMatchStandings } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';
// NOTE: no own fetch — PublicThemeRenderer does the shared fetch and passes
// `matchData` down as a prop for the 'TeamH2H' view.

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
  day?: string;
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
  killNum?: number;
  rank?: number;
  assists?: number;
  knockouts?: number;
  damage?: number;
  picUrl?: string;
}

interface Team {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
  slot: number;
  placePoints: number;
  players: Player[];
}

interface MatchData {
  _id: string;
  matchId: string;
  userId: string;
  teams: Team[];
}

interface TeamH2HProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

/* ------------------------------------------------------------------ */
/* Visual language (shared with Champions / LiveStats / OverAllData)   */
/* ------------------------------------------------------------------ */
const INK = '#0d0f13';
const DEFAULT_CHAR = '/def_char.avif';
const FACE_ZOOM = 1.3;

const PANEL_W = 700;
const PANEL_H = 720;
const STORM_H = 300;

const CUT_BOLT = 'polygon(0 0, 100% 0, 84% 46%, 96% 46%, 78% 100%, 0 100%)';
const CUT_CHIP = 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)';
const CUT_HEAD = 'polygon(0 0, 100% 0, calc(100% - 40px) 100%, 0 100%)';
const CUT_TAG = 'polygon(26px 0, 100% 0, 100% 100%, 0 100%, 14px 50%)';
const CUT_ROW = 'polygon(22px 0, 100% 0, calc(100% - 22px) 100%, 0 100%)';
const CUT_HEX = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';
const CUT_PCARD = 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)';
// panels are mirror images: the cut corners face the outside edges
const CUT_PANEL_L = 'polygon(0 40px, 40px 0, 100% 0, 100% 100%, 30px 100%, 0 calc(100% - 30px))';
const CUT_PANEL_R = 'polygon(0 0, calc(100% - 40px) 0, 100% 40px, 100% calc(100% - 30px), calc(100% - 30px) 100%, 0 100%)';

const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const Bolt: React.FC<{ size?: number; color: string; className?: string }> = ({ size = 18, color, className }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" className={className} aria-hidden>
    <path d="M13 0 L2 16 H9 L6 28 L18 10 H11 L15 0 Z" fill={color} />
  </svg>
);

const Crown: React.FC<{ size?: number; color: string }> = ({ size = 20, color }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
    <rect x="6" y="27" width="28" height="3" fill={color} />
  </svg>
);

const electric = (primary: string, speed: number, vertical = false): React.CSSProperties => ({
  backgroundColor: primary,
  backgroundImage: vertical
    ? 'linear-gradient(180deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)'
    : 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
  backgroundSize: vertical ? '100% 200%' : '200% 100%',
  animation: `${vertical ? 'h2h-runv' : 'h2h-run'} ${speed}s linear infinite`,
  boxShadow: `0 0 12px ${withAlpha(primary, 0.9)}`,
});

const onPicError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_CHAR)) img.src = DEFAULT_CHAR;
};

/** Animated count-up for the stat numbers. */
const useCountUp = (target: number, delayMs: number, durationMs = 900) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const t = window.setTimeout(() => {
      const step = (ts: number) => {
        if (!start) start = ts;
        const p = Math.min(1, (ts - start) / durationMs);
        setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delayMs);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [target, delayMs, durationMs]);
  return v;
};

/* ------------------------------------------------------------------ */
/* Stat row with comparison bar                                        */
/* ------------------------------------------------------------------ */
const StatRow: React.FC<{
  label: string;
  value: number;
  other: number;
  side: 'left' | 'right';
  delay: number;
  primary: string;
  themeGrad: string;
  hero?: boolean;
}> = ({ label, value, other, side, delay, primary, themeGrad, hero }) => {
  const shown = useCountUp(value, delay * 1000);
  const max = Math.max(value, other, 1);
  const leads = value > other;
  const tie = value === other;
  const right = side === 'right';

  return (
    <div className={`relative flex items-center gap-[18px] ${right ? 'flex-row-reverse text-right' : ''}`}>
      <div className={`flex flex-col ${right ? 'items-end' : 'items-start'} w-[150px] shrink-0`}>
        <span
          className="font-bebas leading-[0.85]"
          style={{
            fontSize: hero ? '5.2rem' : '4.2rem',
            color: leads ? undefined : INK,
            ...(leads
              ? {
                  background: themeGrad,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: `drop-shadow(0 0 10px ${withAlpha(primary, 0.55)})`,
                }
              : {}),
          }}
        >
          {shown}
        </span>
        <span className="font-[Righteous] text-[0.85rem] tracking-[0.22em] text-[#5b5f68]">{label}</span>
      </div>

      {/* bar */}
      <div className="relative flex-1 h-[22px]" style={{ background: 'rgba(13,15,19,0.08)', clipPath: CUT_CHIP }}>
        <motion.div
          className={`absolute top-0 bottom-0 ${right ? 'right-0' : 'left-0'} overflow-hidden`}
          style={{ background: leads || tie ? themeGrad : INK, clipPath: CUT_CHIP }}
          initial={{ width: '0%' }}
          animate={{ width: `${(value / max) * 100}%` }}
          transition={{ delay, duration: 0.9, ease: [0.2, 0.9, 0.25, 1] }}
        >
          {leads && (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `linear-gradient(${right ? 270 : 90}deg, transparent 0 40%, rgba(255,255,255,0.85) 50%, transparent 60% 100%)`,
                backgroundSize: '200% 100%',
                animation: `${right ? 'h2h-runr' : 'h2h-run'} 2.2s linear infinite`,
              }}
            />
          )}
        </motion.div>
      </div>

      {leads && (
        <motion.div
          className="shrink-0"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: delay + 0.8, type: 'spring', stiffness: 300, damping: 14 }}
          style={{ filter: `drop-shadow(0 0 6px ${withAlpha(primary, 0.9)})` }}
        >
          <Bolt size={18} color={primary} />
        </motion.div>
      )}
      {!leads && <div className="w-[18px] shrink-0" />}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Team panel (mirrored for the right side)                            */
/* ------------------------------------------------------------------ */
const TeamPanel: React.FC<{
  team: any;
  other: any;
  place: 1 | 2;
  side: 'left' | 'right';
  primary: string;
  secondary: string;
  themeGrad: string;
}> = ({ team, other, place, side, primary, secondary, themeGrad }) => {
  const right = side === 'right';
  const players: Player[] = useMemo(
    () => [...(team.players || [])].sort((a, b) => (b.killNum || 0) - (a.killNum || 0)).slice(0, 4),
    [team.players]
  );
  const base = 0.55;

  return (
    <motion.div
      className="absolute"
      style={{
        width: PANEL_W,
        height: PANEL_H,
        top: 236,
        [right ? 'right' : 'left']: 120,
        animation: place === 1 ? 'h2h-glow 2.8s ease-in-out infinite' : 'h2h-glow 3.6s .6s ease-in-out infinite',
      }}
      initial={{ opacity: 0, x: right ? 260 : -260, skewX: right ? 12 : -12 }}
      animate={{ opacity: 1, x: 0, skewX: 0 }}
      transition={{ delay: 0.2, duration: 0.6, ease: [0.2, 0.9, 0.25, 1] }}
    >
      <div
        className="relative w-full h-full overflow-hidden"
        style={{ clipPath: right ? CUT_PANEL_R : CUT_PANEL_L, background: 'linear-gradient(180deg, #ffffff 0%, #eef0f3 100%)' }}
      >
        {/* ═══ storm banner with player photos ═══ */}
        <div
          className="absolute left-0 right-0 top-0 overflow-hidden"
          style={{
            height: STORM_H,
            background: `radial-gradient(ellipse 70% 90% at ${right ? 35 : 65}% -10%, ${withAlpha(primary, 0.75)} 0%, transparent 65%),
                         linear-gradient(165deg, #06070b 0%, ${withAlpha(secondary, 0.95)} 55%, ${primary} 150%)`,
          }}
        >
          {/* sheet flash + strike */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at ${right ? 30 : 70}% 20%, #fff 0%, ${withAlpha(primary, 0.5)} 40%, transparent 75%)`,
              opacity: 0,
              animation: `h2h-sheet ${place === 1 ? 4.4 : 5.3}s ${place === 1 ? 1.4 : 2.9}s infinite`,
            }}
          />
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 700 300" preserveAspectRatio="none" aria-hidden>
            {[
              { d: right ? 'M180 0 L204 46 L186 54 L218 116 L198 124 L230 196' : 'M520 0 L496 46 L514 54 L482 116 L502 124 L470 196', dur: place === 1 ? 4.4 : 5.3, delay: place === 1 ? 1.4 : 2.9 },
              { d: right ? 'M560 0 L544 32 L558 38 L536 84' : 'M140 0 L156 32 L142 38 L164 84', dur: 3.1, delay: place === 1 ? 2.2 : 0.8 },
            ].map((b, i) => (
              <g key={i} style={{ opacity: 0, animation: `h2h-bolt ${b.dur}s ${b.delay}s linear infinite` }}>
                <path d={b.d} fill="none" stroke={primary} strokeWidth="9" filter="url(#h2h-glow-f)" />
                <path d={b.d} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="miter" />
              </g>
            ))}
          </svg>
          <div
            className={`absolute -top-[30px] font-bebas text-[15rem] leading-none text-white opacity-[0.1] ${right ? 'left-[20px]' : 'right-[20px]'}`}
          >
            #{place}
          </div>

          {/* player cards */}
          <div className="absolute left-[24px] right-[24px] top-[56px] bottom-[14px] flex gap-[10px]">
            {(players.length ? players : [{ _id: 'ph', playerName: '', killNum: 0 } as Player]).map((p, i) => (
              <motion.div
                key={(p._id || p.playerName) + i}
                className="relative flex-1 min-w-0 overflow-hidden"
                style={{
                  clipPath: CUT_PCARD,
                  background: `linear-gradient(180deg, ${withAlpha(primary, 0.35)} 0%, rgba(6,7,11,0.6) 100%)`,
                }}
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: base + 0.1 + i * 0.08, duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
              >
                <img
                  src={p.picUrl?.trim() || DEFAULT_CHAR}
                  onError={onPicError}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    objectPosition: '50% 0%',
                    transform: `scale(${FACE_ZOOM})`,
                    transformOrigin: '50% 0%',
                    filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.5))',
                  }}
                />
                <div className="absolute left-0 right-0 bottom-0 h-[50%]" style={{ background: 'linear-gradient(180deg, transparent, rgba(6,7,11,0.92))' }} />
                <div className="absolute left-[14px] right-[8px] bottom-[8px]">
                  <div className="font-bebas text-[1.6rem] leading-none text-white truncate">{p.playerName}</div>
                  <div className="font-[Righteous] text-[0.75rem] tracking-[0.12em] text-white/75">{p.killNum || 0} KILLS</div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* place chip */}
          <div
            className={`absolute top-[14px] h-[32px] pl-[14px] pr-[20px] flex items-center gap-[8px] bg-white z-10 ${right ? 'right-[40px]' : 'left-[40px]'}`}
            style={{ clipPath: CUT_CHIP, color: INK }}
          >
            {place === 1 ? <Crown size={18} color={primary} /> : <Bolt size={11} color={primary} />}
            <span className="font-[AGENCYB] font-bold text-[1.1rem] tracking-[0.18em] leading-none">
              {place === 1 ? 'MATCH LEADER' : 'CHALLENGER'}
            </span>
          </div>

          <div className="absolute left-0 right-0 bottom-0 h-[4px] z-10" style={electric(primary, 3.4)} />
        </div>

        {/* ═══ name plate ═══ */}
        <div
          className={`absolute left-0 right-0 flex items-center ${right ? 'flex-row-reverse text-right pr-[200px] pl-[34px]' : 'pl-[200px] pr-[34px]'}`}
          style={{ top: STORM_H + 4, height: 116 }}
        >
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(${right ? 270 : 90}deg, ${withAlpha(primary, 0.18)} 0%, transparent 55%)` }}
          />
          <div className="relative min-w-0">
            <div className="font-[Righteous] text-[1rem] tracking-[0.24em]" style={{ color: primary }}>
              {(team.teamTag || '').toUpperCase()}
            </div>
            <div className="font-bebas text-[3.6rem] leading-[0.92] truncate" style={{ color: INK }}>
              {team.teamName}
            </div>
          </div>
        </div>

        {/* ═══ stats ═══ */}
        <div
          className="absolute left-[34px] right-[34px] flex flex-col justify-center gap-[14px]"
          style={{ top: STORM_H + 132, bottom: 30 }}
        >
          <StatRow label="KILLS" value={Number(team.totalKills) || 0} other={Number(other.totalKills) || 0} side={side} delay={base + 0.5} primary={primary} themeGrad={themeGrad} />
          <StatRow label="PLACE PTS" value={Number(team.placePoints) || 0} other={Number(other.placePoints) || 0} side={side} delay={base + 0.65} primary={primary} themeGrad={themeGrad} />
          <StatRow label="TOTAL" value={Number(team.total) || 0} other={Number(other.total) || 0} side={side} delay={base + 0.8} primary={primary} themeGrad={themeGrad} hero />
        </div>

        <div className={`absolute bottom-0 h-[4px] ${right ? 'left-0 right-[30px]' : 'left-[30px] right-0'}`} style={electric(primary, 4.5)} />
      </div>

      {/* hex logo badge, overlapping banner + plate (outside the clip) */}
      <motion.div
        className={`absolute w-[136px] h-[136px] z-20 ${right ? 'right-[34px]' : 'left-[34px]'}`}
        style={{ top: STORM_H - 18, clipPath: CUT_HEX, background: themeGrad }}
        initial={{ scale: 1.8, opacity: 0, rotate: right ? 10 : -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ delay: base + 0.25, duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
      >
        <div className="absolute inset-[6px] bg-white flex items-center justify-center p-[22px]" style={{ clipPath: CUT_HEX }}>
          <TeamLogo logo={team.teamLogo} flag={team.teamFlag} alt={team.teamTag} className="w-full h-full object-contain" />
        </div>
      </motion.div>
    </motion.div>
  );
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
const TeamH2H: React.FC<TeamH2HProps> = ({ tournament, round, match, matchData }) => {
  const topTeams = useMemo(() => {
    const s = computeMatchStandings(matchData);
    return { first: s[0] || null, second: s[1] || null };
  }, [matchData]);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

  if (!matchData || !topTeams?.first || !topTeams?.second) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div
          className="px-[48px] py-[18px] bg-white text-[#111] text-[2rem] font-bebas tracking-[0.12em]"
          style={{ clipPath: CUT_ROW, borderLeft: `8px solid ${primary}` }}
        >
          NOT ENOUGH TEAMS
        </div>
      </div>
    );
  }

  const { first, second } = topTeams as any;
  const matchNo = match?.matchNo ?? match?._matchNo;
  const day = round?.day || tournament.day;

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden select-none">
      <style>{`
        @keyframes h2h-run  { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        @keyframes h2h-runr { from { background-position: -200% 0; } to { background-position: 200% 0; } }
        @keyframes h2h-runv { from { background-position: 0 -200%; } to { background-position: 0 200%; } }
        @keyframes h2h-line { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes h2h-glow {
          0%, 100% { filter: drop-shadow(0 0 8px ${withAlpha(primary, 0.45)}); }
          50%      { filter: drop-shadow(0 0 26px ${withAlpha(primary, 0.9)}); }
        }
        @keyframes h2h-bolt {
          0%, 100% { opacity: 0; }
          2% { opacity: 1; } 4% { opacity: .15; } 6.5% { opacity: 1; } 9% { opacity: .4; } 12% { opacity: 0; }
        }
        @keyframes h2h-sheet {
          0%, 100% { opacity: 0; } 2% { opacity: .45; } 4% { opacity: .05; } 6.5% { opacity: .3; } 12% { opacity: 0; }
        }
        /* centre bolt: three shapes swap rapidly so it looks alive */
        @keyframes h2h-crackA { 0%, 100% { opacity: 1; } 33% { opacity: .1; } 34%, 66% { opacity: 0; } 67% { opacity: .9; } }
        @keyframes h2h-crackB { 0%, 32% { opacity: 0; } 33% { opacity: 1; } 50% { opacity: .3; } 66% { opacity: .9; } 67%, 100% { opacity: 0; } }
        @keyframes h2h-crackC { 0%, 65% { opacity: 0; } 66% { opacity: 1; } 85% { opacity: .2; } 100% { opacity: .8; } }
        @keyframes h2h-draw  { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes h2h-flash { 0% { opacity: 0; } 12% { opacity: .85; } 100% { opacity: 0; } }
        @keyframes h2h-ring  { from { transform: translate(-50%,-50%) scale(.1); opacity: .9; } to { transform: translate(-50%,-50%) scale(1); opacity: 0; } }
        @keyframes h2h-vs    { 0% { transform: translate(-50%,-50%) scale(2.2) rotate(-12deg); opacity: 0; } 55% { transform: translate(-50%,-50%) scale(.9) rotate(3deg); opacity: 1; } 100% { transform: translate(-50%,-50%) scale(1) rotate(0); opacity: 1; } }
        @keyframes h2h-vspulse {
          0%, 100% { filter: drop-shadow(0 0 12px ${withAlpha(primary, 0.7)}); }
          50%      { filter: drop-shadow(0 0 34px ${withAlpha(primary, 1)}) drop-shadow(0 0 8px #fff); }
        }
        @keyframes h2h-spark {
          0%, 70% { opacity: 0; transform: translate(0,0) rotate(var(--r)) scaleY(1); }
          74% { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--r)) scaleY(.3); }
        }
      `}</style>

      {/* shared glow filter for all bolts */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <filter id="h2h-glow-f" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
      </svg>

      {/* ============================ HEADER ============================ */}
      <motion.div
        className="absolute left-[120px] right-[120px] top-[44px] flex items-end justify-between z-30"
        initial={{ opacity: 0, y: -40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="relative flex items-stretch">
          <div className="w-[150px] h-[150px] flex items-center justify-center" style={{ background: themeGrad, clipPath: CUT_BOLT }}>
            {tournament.torLogo ? (
              <img src={tournament.torLogo} alt="" className="w-[96px] h-[96px] object-contain -ml-[14px]" />
            ) : (
              <Bolt size={58} color="#fff" className="-ml-[14px]" />
            )}
          </div>
          <div className="relative bg-white pl-[34px] pr-[90px] flex flex-col justify-center -ml-[18px]" style={{ clipPath: CUT_HEAD }}>
            <div className="flex items-center gap-[10px]">
              <Bolt size={18} color={primary} />
              <span className="font-[AGENCYB] text-[1.6rem] tracking-[0.16em] uppercase text-[#5b5f68]">{tournament.tournamentName}</span>
            </div>
            <div className="font-bebas leading-[0.9] text-[5.8rem] tracking-[0.02em] flex gap-[18px] whitespace-nowrap">
              <span style={{ color: INK }}>TEAM</span>
              <span
                style={{
                  background: themeGrad,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                HEAD TO HEAD
              </span>
            </div>
            <div
              className="absolute left-[34px] right-[90px] bottom-[14px] h-[5px] origin-left"
              style={{ background: themeGrad, animation: 'h2h-line .9s .3s ease-out both' }}
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-[10px] pb-[8px]">
          <div className="h-[58px] pl-[54px] pr-[34px] flex items-center gap-[14px] text-white" style={{ background: themeGrad, clipPath: CUT_TAG }}>
            <Bolt size={20} color="#fff" />
            <span className="font-[AGENCYB] text-[2.2rem] tracking-[0.08em] leading-none uppercase whitespace-nowrap">{round?.roundName || '-'}</span>
          </div>
          <div
            className="h-[40px] px-[26px] flex items-center gap-[10px] bg-white font-[Righteous] text-[1.15rem] tracking-[0.2em] uppercase"
            style={{ clipPath: CUT_CHIP, color: INK }}
          >
            {[day ? `DAY ${day}` : null, matchNo ? `MATCH ${matchNo}` : match?.matchName || null].filter(Boolean).join('  ·  ') || 'TOP 2'}
          </div>
        </div>
      </motion.div>

      {/* ============================ PANELS ============================ */}
      <TeamPanel team={first} other={second} place={1} side="left" primary={primary} secondary={secondary} themeGrad={themeGrad} />
      <TeamPanel team={second} other={first} place={2} side="right" primary={primary} secondary={secondary} themeGrad={themeGrad} />

      {/* ============================ CENTRE: VS ============================ */}
      {/* living lightning between the panels */}
      <svg className="absolute left-[820px] top-[236px] z-10" width="280" height={PANEL_H} viewBox={`0 0 280 ${PANEL_H}`} aria-hidden>
        {[
          { pts: '150,0 126,90 158,104 118,214 154,232 108,360 160,378 116,512 150,526 124,640 140,720', anim: 'h2h-crackA' },
          { pts: '134,0 160,96 120,112 162,222 124,240 170,360 112,384 160,506 120,532 156,640 136,720', anim: 'h2h-crackB' },
          { pts: '142,0 114,100 150,118 128,218 168,236 118,360 150,370 110,500 162,520 128,640 146,720', anim: 'h2h-crackC' },
        ].map((c, i) => (
          <g key={i} style={{ animation: `${c.anim} .45s ${0.5 + i * 0.05}s steps(1) infinite`, opacity: 0 }}>
            <polyline points={c.pts} fill="none" stroke={primary} strokeWidth="12" filter="url(#h2h-glow-f)" pathLength={1} strokeDasharray="1" style={{ strokeDashoffset: 1, animation: 'h2h-draw .5s .5s ease-out both' }} />
            <polyline points={c.pts} fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="miter" pathLength={1} strokeDasharray="1" style={{ strokeDashoffset: 1, animation: 'h2h-draw .5s .5s ease-out both' }} />
          </g>
        ))}
      </svg>

      {/* electric beams from VS to each panel */}
      <div className="absolute top-[596px] left-[820px] w-[80px] h-[4px] z-10" style={{ ...electric(primary, 1.6), animation: 'h2h-runr 1.6s linear infinite' }} />
      <div className="absolute top-[596px] left-[1020px] w-[80px] h-[4px] z-10" style={electric(primary, 1.6)} />

      {/* impact flash + shockwave when VS lands */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 55%, #fff 0%, ${withAlpha(primary, 0.55)} 14%, transparent 34%)`,
          opacity: 0,
          animation: 'h2h-flash .7s .75s ease-out both',
        }}
      />
      <div
        className="absolute left-1/2 top-[598px] w-[900px] h-[900px] rounded-full z-10 pointer-events-none"
        style={{
          border: `5px solid ${withAlpha(primary, 0.85)}`,
          boxShadow: `0 0 40px ${withAlpha(primary, 0.8)}, inset 0 0 40px ${withAlpha(primary, 0.6)}`,
          opacity: 0,
          animation: 'h2h-ring .75s .8s ease-out both',
        }}
      />

      {/* VS badge */}
      <div
        className="absolute left-1/2 top-[598px] w-[190px] h-[190px] z-20"
        style={{ animation: 'h2h-vs .55s .75s cubic-bezier(.2,.9,.25,1) both' }}
      >
        <div className="w-full h-full" style={{ animation: 'h2h-vspulse 2.4s 1.4s ease-in-out infinite' }}>
          <div className="relative w-full h-full" style={{ clipPath: CUT_HEX, background: themeGrad }}>
            <div className="absolute inset-[8px] flex items-center justify-center" style={{ clipPath: CUT_HEX, background: INK }}>
              <div
                className="absolute inset-0"
                style={{ background: `radial-gradient(circle at 50% 30%, ${withAlpha(primary, 0.55)} 0%, transparent 65%)` }}
              />
              <span
                className="relative font-bebas text-[6.2rem] leading-none pt-[10px] text-white"
                style={{ textShadow: `0 0 18px ${withAlpha(primary, 0.95)}, 0 0 4px #fff` }}
              >
                VS
              </span>
            </div>
          </div>
        </div>
        {/* sparks thrown off the badge every couple of seconds */}
        {[
          { dx: '-90px', dy: '-60px', r: '-55deg' },
          { dx: '90px', dy: '-70px', r: '50deg' },
          { dx: '-80px', dy: '70px', r: '-130deg' },
          { dx: '95px', dy: '60px', r: '125deg' },
          { dx: '0px', dy: '-110px', r: '0deg' },
        ].map((s, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 w-[3px] h-[14px] -ml-[1.5px] -mt-[7px] rounded-[2px] bg-white"
            style={
              {
                boxShadow: `0 0 8px ${primary}, 0 0 3px #fff`,
                opacity: 0,
                '--dx': s.dx,
                '--dy': s.dy,
                '--r': s.r,
                animation: `h2h-spark 2.6s ${1.4 + i * 0.07}s ease-out infinite`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Bottom accent */}
      <div
        className="absolute left-[120px] right-[120px] bottom-[34px] h-[6px] origin-left"
        style={{ background: themeGrad, clipPath: CUT_ROW, animation: 'h2h-line 1.2s .6s ease-out both' }}
      />
    </div>
  );
};

export default TeamH2H;