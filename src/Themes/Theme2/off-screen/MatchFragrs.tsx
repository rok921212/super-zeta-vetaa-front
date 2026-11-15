import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Team, MatchData } from '../../shared/hooks/unsortteams';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
// NOTE: no socket here — PublicThemeRenderer owns the single connection,
// listens to 'bulkUpdate' and passes freshly-merged `matchData` down.
// Player / Team / MatchData come from the shared hook module.

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
  day?: string;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
}

interface MatchFragrsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

// ─────────────────────────────────────────────
// Layout + timing
// ─────────────────────────────────────────────
const CARD_W = 316;
const CARD_H = 652;
const CARD_GAP = 20;
const PHOTO_H = 360;
const STAGGER = 0.28; // s between cards
const OPEN_AT = 1.25; // s after a card's start: capsule splits open
const DEFAULT_CHAR = '/def_char.avif';

// ─────────────────────────────────────────────
// Visual language (shared with Champions / LiveStats / H2H)
// ─────────────────────────────────────────────
const INK = '#0d0f13';
const CUT_BOLT = 'polygon(0 0, 100% 0, 84% 46%, 96% 46%, 78% 100%, 0 100%)';
const CUT_CHIP = 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)';
const CUT_HEAD = 'polygon(0 0, 100% 0, calc(100% - 40px) 100%, 0 100%)';
const CUT_TAG = 'polygon(26px 0, 100% 0, 100% 100%, 0 100%, 14px 50%)';
const CUT_ROW = 'polygon(22px 0, 100% 0, calc(100% - 22px) 100%, 0 100%)';
const CUT_CARD = 'polygon(0 0, calc(100% - 34px) 0, 100% 34px, 100% 100%, 26px 100%, 0 calc(100% - 26px))';
const CUT_HEX = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';

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

const electric = (primary: string, speed: number): React.CSSProperties => ({
  backgroundColor: primary,
  backgroundImage: 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
  backgroundSize: '200% 100%',
  animation: `fr-run ${speed}s linear infinite`,
  boxShadow: `0 0 10px ${withAlpha(primary, 0.85)}`,
});

const onPicError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_CHAR)) img.src = DEFAULT_CHAR;
};

/** Count-up for numbers once the card has opened. */
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

// ─────────────────────────────────────────────
// Fragger card — two-step: storm capsule strike → opens to stats
// ─────────────────────────────────────────────
const FraggerCard: React.FC<{
  player: any;
  index: number;
  primary: string;
  secondary: string;
  themeGrad: string;
}> = ({ player, index, primary, secondary, themeGrad }) => {
  const d = 0.45 + index * STAGGER; // card start
  const open = d + OPEN_AT; // capsule splits
  const isTop = index === 0;

  const kills = Number(player.killNum) || 0;
  const damage = Math.round(Number(player.numericDamage ?? player.damage) || 0);
  const assists = Number(player.assists) || 0;
  const knocks = Number(player.knockouts ?? player.knockdowns ?? player.knockNum) || 0;
  const contribution =
    player.teamTotalKills > 0 ? Math.min(100, Math.round((kills / player.teamTotalKills) * 100)) : 0;

  const killsShown = useCountUp(kills, (open + 0.35) * 1000);
  const dmgShown = useCountUp(damage, (open + 0.5) * 1000, 1100);

  return (
    <motion.div
      className="relative shrink-0"
      style={{
        width: CARD_W,
        height: CARD_H,
        animation: `fr-glow ${isTop ? 2.4 : 3.4}s ${open + 0.6}s ease-in-out infinite`,
      }}
      initial={{ opacity: 0, y: 120 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: d, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="relative w-full h-full overflow-hidden"
        style={{ clipPath: CUT_CARD, background: 'linear-gradient(180deg, #ffffff 0%, #eef0f3 100%)' }}
      >
        {/* ═════════════ CONTENT (revealed when the capsule opens) ═════════════ */}
        {/* photo area */}
        <div
          className="absolute left-0 right-0 top-0 overflow-hidden"
          style={{
            height: PHOTO_H,
            background: `radial-gradient(ellipse 80% 70% at 50% 0%, ${withAlpha(primary, 0.75)} 0%, transparent 70%),
                         linear-gradient(165deg, #06070b 0%, ${withAlpha(secondary, 0.95)} 55%, ${primary} 150%)`,
          }}
        >
          <div
            className="absolute inset-0 opacity-[0.1]"
            style={{ background: 'repeating-linear-gradient(-60deg, #fff 0 2px, transparent 2px 22px)' }}
          />
          {/* faded team logo behind the player */}
          <div className="absolute left-1/2 top-[40px] w-[230px] h-[230px] -translate-x-1/2 opacity-[0.16]">
            <TeamLogo logo={player.teamLogo} flag={player.teamFlag} alt="" className="w-full h-full object-contain" />
          </div>
          <div className="absolute -right-[6px] -top-[22px] font-bebas text-[10rem] leading-none text-white opacity-[0.12]">
            {index + 1}
          </div>
          {/* occasional strike behind the player after it opens */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 316 360" preserveAspectRatio="none" aria-hidden>
            <g style={{ opacity: 0, animation: `fr-bolt ${4.2 + index * 0.9}s ${open + 1.5 + index * 0.6}s linear infinite` }}>
              <path d="M226 0 L206 52 L222 58 L190 124 L208 130 L176 214" fill="none" stroke={primary} strokeWidth="9" filter="url(#fr-glow-f)" />
              <path d="M226 0 L206 52 L222 58 L190 124 L208 130 L176 214" fill="none" stroke="#fff" strokeWidth="2.2" />
            </g>
          </svg>
          <img
            src={playerPhoto(player.picUrl) || DEFAULT_CHAR}
            onError={onPicError}
            alt={player.playerName}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              objectPosition: '50% 0%',
              transform: 'scale(1.12)',
              transformOrigin: '50% 0%',
              filter: 'drop-shadow(0 10px 16px rgba(0,0,0,0.55))',
            }}
          />
          <div
            className="absolute left-0 right-0 bottom-0 h-[38%]"
            style={{ background: 'linear-gradient(180deg, transparent, rgba(6,7,11,0.9))' }}
          />

          {/* rank chip */}
          <div
            className="absolute left-0 top-[14px] h-[40px] pl-[14px] pr-[22px] flex items-center gap-[6px] bg-white"
            style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)', color: INK }}
          >
            {isTop && <Crown size={20} color={primary} />}
            <span className="font-bebas text-[2.1rem] leading-none pt-[4px]">#{index + 1}</span>
          </div>
          {/* team logo chip */}
          <div
            className="absolute right-[38px] top-[12px] w-[52px] h-[52px] flex items-center justify-center p-[7px] bg-white"
            style={{ clipPath: CUT_HEX }}
          >
            <TeamLogo logo={player.teamLogo} flag={player.teamFlag} alt="" className="w-full h-full object-contain" />
          </div>
          {isTop && (
            <div
              className="absolute left-[14px] bottom-[14px] h-[28px] pl-[10px] pr-[14px] flex items-center gap-[6px] text-white font-[AGENCYB] font-bold text-[0.95rem] tracking-[0.18em]"
              style={{ background: themeGrad, clipPath: CUT_CHIP, animation: 'fr-flicker 5s 3s infinite' }}
            >
              <Bolt size={10} color="#fff" />
              MVP OF THE MATCH
            </div>
          )}
          <div className="absolute left-0 right-0 bottom-0 h-[4px]" style={electric(primary, 3.2)} />
        </div>

        {/* name plate */}
        <div className="absolute left-0 right-0 px-[20px]" style={{ top: PHOTO_H + 12, animation: `fr-up .45s ${open + 0.25}s ease-out both` }}>
          <div className="font-bebas text-[2.5rem] leading-[0.95] truncate" style={{ color: INK }}>
            {player.playerName}
          </div>
          <div className="flex items-center gap-[6px] font-[Righteous] text-[0.85rem] tracking-[0.14em] truncate" style={{ color: primary }}>
            <Bolt size={9} color={primary} />
            {(player.teamTag || '').toUpperCase()}
            {player.teamName ? <span className="text-[#5b5f68] truncate">· {player.teamName}</span> : null}
          </div>
        </div>

        {/* kills hero */}
        <div
          className="absolute left-[20px] right-[20px] h-[74px] flex items-center justify-between pl-[18px] pr-[16px] text-white"
          style={{ top: PHOTO_H + 82, background: INK, clipPath: CUT_ROW, animation: `fr-up .45s ${open + 0.35}s ease-out both` }}
        >
          <span className="font-[AGENCYB] font-bold text-[1.2rem] tracking-[0.22em]" style={{ color: primary }}>
            KILLS
          </span>
          <span
            className="font-bebas text-[4.4rem] leading-none pt-[6px]"
            style={{ textShadow: `0 0 16px ${withAlpha(primary, 0.9)}` }}
          >
            {killsShown}
          </span>
        </div>

        {/* stat grid */}
        <div
          className="absolute left-[20px] right-[20px] grid grid-cols-3 gap-[6px]"
          style={{ top: PHOTO_H + 166, animation: `fr-up .45s ${open + 0.45}s ease-out both` }}
        >
          {[
            { k: 'DAMAGE', v: dmgShown },
            { k: 'ASSISTS', v: assists },
            { k: 'KNOCKS', v: knocks },
          ].map((s) => (
            <div
              key={s.k}
              className="h-[58px] flex flex-col items-center justify-center"
              style={{ background: 'rgba(13,15,19,0.06)', clipPath: CUT_CHIP }}
            >
              <span className="font-bebas text-[1.9rem] leading-none pt-[4px]" style={{ color: INK }}>
                {s.v}
              </span>
              <span className="font-[Righteous] text-[0.62rem] tracking-[0.18em] text-[#5b5f68]">{s.k}</span>
            </div>
          ))}
        </div>

        {/* team kill share */}
        <div className="absolute left-[20px] right-[20px]" style={{ top: PHOTO_H + 238, animation: `fr-up .45s ${open + 0.55}s ease-out both` }}>
          <div className="flex items-center justify-between font-[AGENCYB] font-bold text-[0.95rem] tracking-[0.16em]" style={{ color: INK }}>
            <span>TEAM KILL SHARE</span>
            <span style={{ color: primary }}>
              {contribution}% <span className="text-[#5b5f68]">· {kills}/{player.teamTotalKills || 0}</span>
            </span>
          </div>
          <div className="relative h-[12px] mt-[4px] overflow-hidden" style={{ background: 'rgba(13,15,19,0.1)', clipPath: CUT_CHIP }}>
            <motion.div
              className="absolute left-0 top-0 bottom-0"
              style={{ ...electric(primary, 2.2), clipPath: CUT_CHIP }}
              initial={{ width: '0%' }}
              animate={{ width: `${contribution}%` }}
              transition={{ delay: open + 0.7, duration: 0.9, ease: [0.2, 0.9, 0.25, 1] }}
            />
          </div>
        </div>

        <div className="absolute left-[26px] right-0 bottom-0 h-[4px]" style={electric(primary, 4.5)} />

        {/* ═════════════ CAPSULE (step 1: strike, step 2: split open) ═════════════ */}
        {(['top', 'bottom'] as const).map((half) => (
          <div
            key={half}
            className="absolute left-0 right-0 overflow-hidden z-20"
            style={{
              top: half === 'top' ? 0 : '50%',
              height: '50%',
              animation: `${half === 'top' ? 'fr-shut-up' : 'fr-shut-down'} .6s ${open}s cubic-bezier(.6,0,.3,1) both`,
            }}
          >
            {/* each half carries its piece of the same storm backdrop */}
            <div
              className="absolute left-0 right-0"
              style={{
                top: half === 'top' ? 0 : '-100%',
                height: '200%',
                background: `radial-gradient(ellipse 80% 45% at 50% 50%, ${withAlpha(primary, 0.7)} 0%, transparent 70%),
                             linear-gradient(170deg, #06070b 0%, ${withAlpha(secondary, 0.98)} 55%, #06070b 100%)`,
              }}
            >
              <div
                className="absolute inset-0 opacity-[0.08]"
                style={{ background: 'repeating-linear-gradient(-60deg, #fff 0 2px, transparent 2px 22px)' }}
              />
            </div>
            {/* glowing seam where it splits */}
            <div
              className={`absolute left-0 right-0 h-[3px] ${half === 'top' ? 'bottom-0' : 'top-0'}`}
              style={{ ...electric(primary, 1.2), opacity: 0, animation: `fr-seam .5s ${open - 0.15}s ease-out both, fr-run 1.2s linear infinite` }}
            />
          </div>
        ))}

        {/* strike bolt down onto the logo */}
        <svg
          className="absolute inset-0 w-full h-full z-30 pointer-events-none"
          viewBox="0 0 316 700"
          preserveAspectRatio="none"
          style={{ animation: `fr-hide .25s ${open}s ease-out both` }}
          aria-hidden
        >
          {['M170 0 L148 70 L168 78 L134 160 L156 168 L130 250 L150 258 L158 300', 'M148 70 L118 104 L126 112 L96 150'].map((p, j) => (
            <g key={j}>
              <polyline
                points={p.replace(/[ML]/g, ' ').trim().replace(/\s+/g, ' ')}
                fill="none"
                stroke={primary}
                strokeWidth={j ? 6 : 12}
                filter="url(#fr-glow-f)"
                pathLength={1}
                strokeDasharray="1"
                style={{ strokeDashoffset: 1, animation: `fr-draw .3s ${d + 0.3 + j * 0.08}s ease-out both, fr-zap .7s ${d + 0.6}s linear both` }}
              />
              <polyline
                points={p.replace(/[ML]/g, ' ').trim().replace(/\s+/g, ' ')}
                fill="none"
                stroke="#fff"
                strokeWidth={j ? 1.6 : 3}
                strokeLinejoin="miter"
                pathLength={1}
                strokeDasharray="1"
                style={{ strokeDashoffset: 1, animation: `fr-draw .3s ${d + 0.3 + j * 0.08}s ease-out both, fr-zap .7s ${d + 0.6}s linear both` }}
              />
            </g>
          ))}
        </svg>

        {/* impact flash */}
        <div
          className="absolute inset-0 z-30 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 50%, #fff 0%, ${withAlpha(primary, 0.6)} 30%, transparent 65%)`,
            opacity: 0,
            animation: `fr-flash .55s ${d + 0.58}s ease-out both`,
          }}
        />

        {/* team logo in the capsule — struck, glows, then pulls away as it opens */}
        <div
          className="absolute left-1/2 top-1/2 w-[170px] h-[170px] z-30"
          style={{ animation: `fr-logo ${OPEN_AT + 0.5}s ${d}s cubic-bezier(.2,.9,.25,1) both` }}
        >
          <div className="w-full h-full p-[6px]" style={{ clipPath: CUT_HEX, background: themeGrad }}>
            <div className="w-full h-full bg-white flex items-center justify-center p-[30px]" style={{ clipPath: CUT_HEX }}>
              <TeamLogo logo={player.teamLogo} flag={player.teamFlag} alt="" className="w-full h-full object-contain" />
            </div>
          </div>
          <div
            className="absolute left-1/2 top-[178px] -translate-x-1/2 whitespace-nowrap font-bebas text-[2rem] leading-none text-white"
            style={{ textShadow: `0 0 14px ${withAlpha(primary, 0.95)}` }}
          >
            #{index + 1} · {(player.teamTag || '').toUpperCase()}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
const MatchFragrs: React.FC<MatchFragrsProps> = ({ tournament, round, match, matchData }) => {
  // Single-Match Fragger Score: same weighted formula as the Overall score,
  // fed just this match via buildFraggerPool([matchData]). latestPlayerRaw
  // is spread back in first so raw-only fields (picUrl, knockouts…) survive.
  const topPlayers = useMemo(() => {
    if (!matchData) return [];

    const scored = computeFraggerScores(buildFraggerPool([matchData])).sort(compareFraggerScore);

    return scored.slice(0, 5).map((player: any) => {
      const team = matchData.teams.find((t: Team) => t.teamTag === player.teamTag);
      const teamTotalKills = team?.players.reduce((sum, p) => sum + (p.killNum || 0), 0) || 0;

      return {
        ...(player.latestPlayerRaw as any),
        ...player,
        teamName: player.teamName ?? (team as any)?.teamName,
        killNum: player.totalKills,
        numericDamage: player.totalDamage,
        assists: player.totalAssists,
        teamTotalKills,
      };
    });
  }, [matchData]);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

  if (!matchData) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div
          className="px-[48px] py-[18px] bg-white text-[#111] text-[2rem] font-bebas tracking-[0.12em]"
          style={{ clipPath: CUT_ROW, borderLeft: `8px solid ${primary}` }}
        >
          NO MATCH DATA AVAILABLE
        </div>
      </div>
    );
  }

  const matchNo = match?.matchNo || match?._matchNo;
  const rowW = topPlayers.length * CARD_W + Math.max(topPlayers.length - 1, 0) * CARD_GAP;

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden select-none">
      <style>{`
        @keyframes fr-run   { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        @keyframes fr-line  { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes fr-glow  {
          0%, 100% { filter: drop-shadow(0 0 8px ${withAlpha(primary, 0.45)}); }
          50%      { filter: drop-shadow(0 0 24px ${withAlpha(primary, 0.9)}); }
        }
        @keyframes fr-flicker {
          0%, 88%, 100% { opacity: 1; }
          89% { opacity: .25; } 90% { opacity: 1; }
          92% { opacity: .5; }  93% { opacity: 1; }
        }
        @keyframes fr-bolt {
          0%, 100% { opacity: 0; }
          2% { opacity: 1; } 4% { opacity: .15; } 6.5% { opacity: 1; } 9% { opacity: .4; } 12% { opacity: 0; }
        }
        /* step 1 — strike */
        @keyframes fr-draw  { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes fr-zap   { 0% { opacity: 1; } 15% { opacity: .15; } 30% { opacity: 1; } 55% { opacity: .4; } 75% { opacity: .9; } 100% { opacity: 0; } }
        @keyframes fr-flash { 0% { opacity: 0; } 15% { opacity: .9; } 100% { opacity: 0; } }
        @keyframes fr-logo  {
          0%   { transform: translate(-50%,-50%) scale(.3); opacity: 0; filter: brightness(1); }
          30%  { transform: translate(-50%,-50%) scale(.3); opacity: 0; }
          42%  { transform: translate(-50%,-50%) scale(1.18); opacity: 1; filter: brightness(2) drop-shadow(0 0 24px ${withAlpha(primary, 1)}); }
          55%  { transform: translate(-50%,-50%) scale(1); filter: brightness(1) drop-shadow(0 0 14px ${withAlpha(primary, 0.8)}); }
          78%  { transform: translate(-50%,-50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(.2) rotate(18deg); opacity: 0; }
        }
        /* step 2 — open */
        @keyframes fr-seam  { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 1; } }
        @keyframes fr-shut-up   { from { transform: translateY(0); } to { transform: translateY(-104%); } }
        @keyframes fr-shut-down { from { transform: translateY(0); } to { transform: translateY(104%); } }
        @keyframes fr-hide  { from { opacity: 1; } to { opacity: 0; } }
        @keyframes fr-up    { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* shared bolt glow filter */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <filter id="fr-glow-f" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
      </svg>

      {/* ============================ HEADER ============================ */}
      <motion.div
        className="absolute left-[120px] right-[120px] top-[44px] flex items-end justify-between z-30"
        initial={{ opacity: 0, x: -60 }}
        animate={{ opacity: 1, x: 0 }}
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
            <div className="font-bebas leading-[0.9] text-[6.2rem] tracking-[0.02em] flex gap-[18px] whitespace-nowrap">
              <span
                style={{
                  background: themeGrad,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                TOP
              </span>
              <span style={{ color: INK }}>FRAGGERS</span>
            </div>
            <div
              className="absolute left-[34px] right-[90px] bottom-[14px] h-[5px] origin-left"
              style={{ background: themeGrad, animation: 'fr-line .9s .3s ease-out both' }}
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-[10px] pb-[8px]">
          <div className="h-[58px] pl-[54px] pr-[34px] flex items-center gap-[14px] text-white" style={{ background: themeGrad, clipPath: CUT_TAG }}>
            <Bolt size={20} color="#fff" />
            <span className="font-[AGENCYB] text-[2.2rem] tracking-[0.08em] leading-none uppercase whitespace-nowrap">
              {round?.roundName || 'MATCH'}
            </span>
          </div>
          <div
            className="h-[40px] px-[26px] flex items-center gap-[10px] bg-white font-[Righteous] text-[1.15rem] tracking-[0.2em] uppercase"
            style={{ clipPath: CUT_CHIP, color: INK }}
          >
            {matchNo ? `MATCH ${matchNo}` : match?.matchName || 'THIS MATCH'}
          </div>
        </div>
      </motion.div>

      {/* ============================ CARDS ============================ */}
      {topPlayers.length > 0 ? (
        <div className="absolute flex" style={{ top: 248, left: (1920 - rowW) / 2, gap: CARD_GAP }}>
          {topPlayers.map((player: any, index: number) => (
            <FraggerCard
              key={player._id || player.playerName || index}
              player={player}
              index={index}
              primary={primary}
              secondary={secondary}
              themeGrad={themeGrad}
            />
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="px-[48px] py-[18px] bg-white text-[#111] text-[2rem] font-bebas tracking-[0.12em]"
            style={{ clipPath: CUT_ROW, borderLeft: `8px solid ${primary}` }}
          >
            NO FRAGGERS YET
          </div>
        </div>
      )}

    </div>
  );
};

export default MatchFragrs;