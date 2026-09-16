import React, { useEffect, useMemo, useState } from 'react';
import { FaSkull, FaHeartbeat, FaBomb, FaBullseye } from 'react-icons/fa';
import { computeMatchStandings } from '../../shared/hooks/officialStandings';

// NOTE: SocketManager import removed, along with the localMatchData mirror
// state and its socket-handler block. PublicThemeRenderer owns the single
// socket connection and passes freshly-merged `matchData` down as a prop —
// this component now just reads that prop directly.
//
// -----------------------------------------------------------------------
// DESIGN REFERENCE
// Rebuilt against the actual PMGC/PMPL broadcast language rather than a
// generic "gaming HUD": diagonal chevron-cut panels, a hexagonal badge for
// the winning team's crest, Tungsten for the huge display numerals and
// AGENCYB for labels/names (both assumed already registered in your
// Tailwind/global CSS the way the original file's font-[agencyb] class
// implied — no @font-face added here). Scoreboard numbers roll digit by
// digit like a physical odometer/scoreboard flap instead of glowing or
// simply counting up — that mechanical "clunk into place" is the
// standout motion here, and there is no blur/box-shadow glow anywhere.
// -----------------------------------------------------------------------

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

interface Player {
  _id: string;
  playerName: string;
  killNum: number;
  rank?: number;
  bHasDied: boolean;
  picUrl?: string;
  heal?: number;
  damage?: string | number;
  survivalTime?: number;
  assists?: number;
  health?: number;
  healthMax?: number;
  liveState?: number;
  useSmokeGrenadeNum?: number;
  useFragGrenadeNum?: number;
  useBurnGrenadeNum?: number;
  useFlashGrenadeNum?: number;
}

interface Team {
  _id: string;
  teamId?: string;
  teamName?: string;
  teamTag: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface WwcdSummaryProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

// -----------------------------------------------------------------------
// Digit / NumberRoll — a mechanical scoreboard-flap number. Each digit is
// a vertical strip of 0-9 that rolls to the target value, staggered
// left-to-right so multi-digit numbers "clunk" into place in sequence.
// -----------------------------------------------------------------------
const Digit: React.FC<{ value: string; delay: number; emSize: number }> = ({ value, delay, emSize }) => {
  const [settled, setSettled] = useState(false);
  const isDigit = /[0-9]/.test(value);
  const target = isDigit ? parseInt(value, 10) : 0;

  useEffect(() => {
    setSettled(false);
    const t = setTimeout(() => setSettled(true), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  if (!isDigit) {
    return <span style={{ display: 'inline-block', width: `${emSize * 0.4}em` }}>{value}</span>;
  }

  return (
    <span
      style={{
        display: 'inline-block',
        overflow: 'hidden',
        height: `${emSize}em`,
        lineHeight: `${emSize}em`,
        verticalAlign: 'top',
        width: `${emSize * 0.62}em`,
      }}
    >
      <span
        style={{
          display: 'block',
          transform: settled ? `translateY(-${target * emSize}em)` : 'translateY(0em)',
          transition: 'transform 0.62s cubic-bezier(.16,.87,.22,1.02)',
        }}
      >
        {Array.from({ length: 10 }).map((_, n) => (
          <span key={n} style={{ display: 'block', height: `${emSize}em` }}>
            {n}
          </span>
        ))}
      </span>
    </span>
  );
};

const NumberRoll: React.FC<{ value: number; delay?: number; stagger?: number; emSize?: number; resetKey: string }> = ({
  value,
  delay = 0,
  stagger = 55,
  emSize = 1,
  resetKey,
}) => {
  const chars = String(Math.max(0, Math.round(value))).split('');
  return (
    <span key={resetKey}>
      {chars.map((c, i) => (
        <Digit key={i} value={c} delay={delay + i * stagger} emSize={emSize} />
      ))}
    </span>
  );
};

const ICON_STYLE = { fontSize: '1.9rem' };

const WwcdStats: React.FC<WwcdSummaryProps> = ({ tournament, round, match, matchData }) => {
  const localMatchData = matchData ?? null;
  const primary = tournament.primaryColor || '#FF7A1A'; // PUBG-style burnt orange
  const secondary = tournament.secondaryColor || '#F2F2F0'; // near-white, not pure white

  const teamsWithTotals = useMemo(
    () => computeMatchStandings(localMatchData).filter((t: any) => t.wwcd),
    [localMatchData]
  );

  const winner = teamsWithTotals[0];
  const resetKey = `${winner?._id ?? 'none'}-${match?._id ?? ''}`;

  const sortedPlayers: Player[] = useMemo(() => {
    const players = winner?.players ?? [];
    return [...players].sort((a, b) => (b.killNum || 0) - (a.killNum || 0));
  }, [winner]);

  if (!localMatchData) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div className="text-white text-2xl font-[agencyb]">No match data available</div>
      </div>
    );
  }

  return (
    <div key={resetKey} className="relative w-[1920px] h-[1080px] overflow-hidden font-[agencyb]" style={{ background: 'transparent' }}>
      <style>{`
        @keyframes wwcd-curtain { 0% { transform: translateX(-140%) skewX(-18deg); } 45% { transform: translateX(0%) skewX(-18deg); } 100% { transform: translateX(140%) skewX(-18deg); } }
        @keyframes wwcd-badge { 0% { transform: perspective(700px) rotateY(85deg) scale(.7); opacity: 0; } 60% { transform: perspective(700px) rotateY(-8deg) scale(1.03); opacity: 1; } 100% { transform: perspective(700px) rotateY(0deg) scale(1); opacity: 1; } }
        @keyframes wwcd-title { 0% { clip-path: inset(0 100% 0 0); transform: skewX(-6deg) translateX(-20px); opacity: 0; } 100% { clip-path: inset(0 0% 0 0); transform: skewX(-6deg) translateX(0); opacity: 1; } }
        @keyframes wwcd-ribbon { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes wwcd-seam { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes wwcd-panel-l { from { opacity: 0; transform: translateX(-46px) skewX(6deg); } to { opacity: 1; transform: translateX(0) skewX(6deg); } }
        @keyframes wwcd-ticket { 0% { opacity: 0; transform: translateY(46px) skewX(6deg) scale(.94); } 70% { opacity: 1; transform: translateY(-6px) skewX(6deg) scale(1.01); } 100% { opacity: 1; transform: translateY(0) skewX(6deg) scale(1); } }
        @keyframes wwcd-meta { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wwcd-pip { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
        .wwcd-curtain { animation: wwcd-curtain 0.85s 0s cubic-bezier(.62,0,.34,1) forwards; }
        .wwcd-badge { animation: wwcd-badge 0.9s 0.35s cubic-bezier(.2,.7,.2,1) forwards; }
        .wwcd-title { animation: wwcd-title 0.6s 0.55s cubic-bezier(.2,.8,.2,1) forwards; }
        .wwcd-ribbon { transform-origin: left; animation: wwcd-ribbon 0.55s 0.05s cubic-bezier(.2,.8,.2,1) forwards; }
        .wwcd-seam { transform-origin: top; animation: wwcd-seam 0.7s 0.4s cubic-bezier(.2,.8,.2,1) forwards; }
        .wwcd-panel-l { animation: wwcd-panel-l 0.65s 0.42s cubic-bezier(.2,.8,.2,1) forwards; }
        .wwcd-ticket { animation: wwcd-ticket 0.6s cubic-bezier(.2,.8,.2,1) forwards; }
        .wwcd-meta { animation: wwcd-meta 0.5s 0.5s ease-out forwards; }
        .wwcd-pip { animation: wwcd-pip 1.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .wwcd-curtain { display: none; }
          .wwcd-badge, .wwcd-title, .wwcd-ribbon, .wwcd-seam, .wwcd-panel-l, .wwcd-ticket, .wwcd-meta, .wwcd-pip {
            animation: none !important; opacity: 1 !important; transform: none !important;
          }
        }
      `}</style>

      {/* one-shot broadcast wipe transition, not a looping effect */}
      <div
        className="wwcd-curtain absolute top-0 bottom-0 -left-[10%] w-[38%] z-[20] pointer-events-none"
        style={{ background: primary }}
      />

      {/* ================= TOP RIBBON ================= */}
      <div className="absolute top-[46px] left-[140px] right-[140px] h-[86px] z-[3] flex items-stretch">
        <div
          className="wwcd-ribbon h-full flex items-center pl-[30px] pr-[46px]"
          style={{ background: primary, clipPath: 'polygon(0 0, 100% 0, 86% 100%, 0 100%)' }}
        >
          <span className="font-[Tungsten] font-bold text-[36px] tracking-wide text-black">MATCH RESULT</span>
        </div>
        <div className="wwcd-meta flex-1 flex items-center justify-end gap-[26px] pl-[26px]">
          <span className="font-[agencyb] font-semibold text-[24px] tracking-[3px]" style={{ color: secondary }}>
            {round?.roundName}
          </span>
          <span className="w-[2px] h-[26px]" style={{ background: `${secondary}55` }} />
          <span className="font-[agencyb] font-semibold text-[24px] tracking-[3px]" style={{ color: secondary }}>
            DAY {round?.day} — MATCH {match?.matchNo}
          </span>
        </div>
      </div>

      {/* ================= TITLE ================= */}
      <div className="absolute top-[150px] left-[140px] right-[140px] z-[3] overflow-hidden h-[110px]">
        <div
          className="wwcd-title font-[Tungsten] font-black text-[104px] leading-[0.85] text-white"
          style={{ WebkitTextStroke: `1.5px ${primary}` }}
        >
          WINNER WINNER CHICKEN DINNER
        </div>
      </div>

      {/* seam accent under the title */}
      <div
        className="wwcd-seam absolute top-[270px] left-[140px] w-[6px] h-[720px] z-[2]"
        style={{ background: `linear-gradient(180deg, ${primary}, transparent)` }}
      />

      {/* ================= MAIN ================= */}
      <div className="absolute top-[300px] left-[140px] right-[140px] bottom-[54px] flex gap-[30px] z-[3]">
        {/* ---- winner spotlight ---- */}
        <div
          className="wwcd-panel-l relative w-[430px] flex-shrink-0 flex flex-col items-center pt-[38px] pb-[30px] px-[26px]"
          style={{
            background: 'rgba(10,10,10,0.66)',
            clipPath: 'polygon(0 0, 100% 0, 92% 100%, 0 100%)',
          }}
        >
          <div
            className="wwcd-badge w-[168px] h-[150px] flex items-center justify-center"
            style={{
              background: `linear-gradient(155deg, ${primary}, #1a1a1a 70%)`,
              clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
            }}
          >
            <img src={winner?.teamLogo} alt="" className="w-[74%] h-[74%] object-contain" />
          </div>

          <div className="font-[Tungsten] font-bold text-[58px] text-white leading-none text-center mt-[22px]">
            {winner?.teamName}
          </div>
          <div
            className="font-[agencyb] font-semibold text-[20px] tracking-[6px] mt-[6px] px-[14px] py-[3px]"
            style={{ background: primary, color: '#000' }}
          >
            {winner?.teamTag}
          </div>

          <div className="mt-auto w-full pt-[26px]" style={{ borderTop: `2px solid ${primary}` }}>
            <div className="flex items-baseline justify-center gap-[14px]">
              <span
                className="font-[Tungsten] font-black text-[128px] leading-[0.8] text-white"
                style={{ WebkitTextStroke: `1px ${primary}` }}
              >
                <NumberRoll value={winner?.totalKills ?? 0} delay={650} emSize={1} resetKey={resetKey} />
              </span>
            </div>
            <div className="font-[agencyb] font-semibold text-[22px] tracking-[8px] text-center mt-[2px]" style={{ color: primary }}>
              TOTAL ELIMS
            </div>
          </div>
        </div>

        {/* ---- player tickets (no rank index) ---- */}
        <div className="flex-1 flex gap-[22px]">
          {sortedPlayers.map((player, index) => {
            const throwables =
              (player.useSmokeGrenadeNum || 0) +
              (player.useFragGrenadeNum || 0) +
              (player.useBurnGrenadeNum || 0) +
              (player.useFlashGrenadeNum || 0);
            const damageVal = Number(player.damage) || 0;
            const baseDelay = 620 + index * 110;

            return (
              <div
                key={player._id}
                className="wwcd-ticket relative flex-1 flex flex-col"
                style={{
                  animationDelay: `${baseDelay}ms`,
                  background: 'rgba(10,10,10,0.66)',
                  clipPath: 'polygon(8% 0, 100% 0, 100% 100%, 0 100%)',
                }}
              >
                <div
                  className="relative overflow-hidden"
                  style={{ height: '46%', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 92%)' }}
                >
                  <img
                    src={player?.picUrl || '/def_char.avif'}
                    alt={player.playerName}
                    className="absolute top-0 left-0 w-full h-full object-cover"
                  />
                  <div
                    className="absolute bottom-0 left-0 right-0 h-[60%]"
                    style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.92), transparent)' }}
                  />
                  <div
                    className="absolute bottom-[10px] left-[16px] right-[16px] font-[Tungsten] font-bold text-[34px] text-white truncate"
                  >
                    {player.playerName}
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-center gap-[10px] px-[18px] py-[16px]">
                  {[
                    { icon: <FaSkull style={ICON_STYLE} />, label: 'DAMAGE', value: damageVal, d: baseDelay + 90 },
                    { icon: <FaBullseye style={ICON_STYLE} />, label: 'ELIMS', value: player.killNum || 0, d: baseDelay + 150 },
                    { icon: <FaBomb style={ICON_STYLE} />, label: 'NADES', value: throwables, d: baseDelay + 210 },
                    { icon: <FaHeartbeat style={ICON_STYLE} />, label: 'HEAL', value: player.heal || 0, d: baseDelay + 270 },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between" style={{ color: secondary }}>
                      <div className="flex items-center gap-[10px]">
                        <span style={{ color: primary }}>{row.icon}</span>
                        <span className="font-[agencyb] font-semibold text-[16px] tracking-[2px]">{row.label}</span>
                      </div>
                      <span className="font-[Tungsten] font-bold text-[28px] text-white">
                        <NumberRoll value={row.value} delay={row.d} emSize={0.92} resetKey={resetKey} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================= FOOTER ================= */}
      <div className="absolute left-[140px] right-[140px] bottom-[18px] flex items-center justify-between z-[3]">
        <div className="flex items-center gap-[9px] font-[agencyb] font-semibold text-[16px] tracking-[4px]" style={{ color: primary }}>
          <span className="wwcd-pip w-[9px] h-[9px] rounded-full" style={{ background: primary }} />
          LIVE
        </div>
        <div className="font-[agencyb] font-semibold text-[16px] tracking-[4px]" style={{ color: `${secondary}aa` }}>
          {tournament.tournamentName}
        </div>
      </div>
    </div>
  );
};

export default WwcdStats;