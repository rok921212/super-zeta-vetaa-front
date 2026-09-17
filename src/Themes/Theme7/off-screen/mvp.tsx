// src/components/Mvp.tsx
import React, { useMemo } from 'react';
import Round from 'dashboard/Round.tsx';
import { motion } from 'framer-motion';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
import {
  aggregateWeaponStats,
  formatDuration,
  PlayerWeaponDetailEntry,
} from '../../shared/hooks/Weapondetailstats ';

/* -------------------- Interfaces -------------------- */
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

interface Player {
  _id: string;
  uId?: string | number;
  playerName: string;
  killNum?: number;
  damage?: number;
  heal?: number;
  maxKillDistance?: number;
  headShotNum?: number;
  killNumByGrenade?: number;
  knockouts?: number;
  surviveTime?: number;
  liveTime?: number;
  teamLogo?: string;
  teamTag?: string;
  teamName?: string;
  picUrl?: string;
}

interface Team {
  _id: string;
  teamTag: string;
  teamLogo: string;
  teamName: string;
  slot?: number;
  placePoints: number;
  players: Player[];
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface MatchFragrsProps {
  tournament: Tournament;
  round?: Round | null;
  matchData?: MatchData | null;
  weaponDetails?: PlayerWeaponDetailEntry[];
}

/* -------------------- Shared HUD tokens -------------------- */
const HEAD_COLOR = '#FF3B3B';
const BODY_COLOR = '#B9A6F0';
const LIMB_COLOR = '#2F5FE0';
const FONT = "'AGENCYB', 'Arial Narrow', sans-serif";

// Chamfered "wing" panels that slant toward the center subject — used for
// both the distribution card (left) and the stat card (right) so the two
// flanking panels read as one matched broadcast furniture set.
const leftPanelClip = 'polygon(20px 0, 100% 0, 100% calc(100% - 34px), 0 100%, 0 20px)';
const rightPanelClip = 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 calc(100% - 34px))';

const glassPanel = (accent: string, side: 'left' | 'right'): React.CSSProperties => ({
  background: 'rgba(6,7,12,.64)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  border: '1px solid rgba(255,255,255,.08)',
  borderLeft: side === 'left' ? `3px solid ${accent}` : '1px solid rgba(255,255,255,.08)',
  borderRight: side === 'right' ? `3px solid ${accent}` : '1px solid rgba(255,255,255,.08)',
  clipPath: side === 'left' ? leftPanelClip : rightPanelClip,
});

/* -------------------- Damage-distribution silhouette -------------------- */
interface DamageRow {
  label: string;
  pct: number;
  color: string;
}

const DamageDistributionFigure: React.FC<{ rows: DamageRow[]; accentColor: string }> = ({ rows, accentColor }) => {
  const maxPct = Math.max(...rows.map((r) => r.pct), 1);

  return (
    <div className="relative flex flex-col" style={{ fontFamily: FONT, width: 380, padding: '28px 26px 24px' }}>
      <div className="absolute inset-0" style={{ ...glassPanel(accentColor, 'left') }} />

      {/* corner bracket accent at the chamfered corner */}
      <span
        style={{
          position: 'absolute',
          top: 6,
          left: 26,
          width: 22,
          height: 2,
          background: accentColor,
          transform: 'rotate(-45deg)',
          transformOrigin: 'left center',
        }}
      />

      

      <div className="relative flex items-center" style={{ gap: 28 }}>
        {/* diagonal color bleed behind the figure */}
        <div className="relative" style={{ width: 150, height: 300 }}>
          
          <svg width={150} height={300} viewBox="0 0 168 340" className="relative">
            <circle cx={84} cy={40} r={30} fill={HEAD_COLOR} style={{ filter: `drop-shadow(0 0 10px ${HEAD_COLOR}aa)` }} />
            <path
              d="M52,74 Q84,64 116,74 L124,190 Q84,204 44,190 Z"
              fill={BODY_COLOR}
              style={{ filter: `drop-shadow(0 0 10px ${BODY_COLOR}88)` }}
            />
            <rect x={16} y={78} width={30} height={140} rx={15} fill={LIMB_COLOR} />
            <rect x={122} y={78} width={30} height={140} rx={15} fill={LIMB_COLOR} />
            <rect x={52} y={196} width={30} height={138} rx={14} fill={LIMB_COLOR} />
            <rect x={86} y={196} width={30} height={138} rx={14} fill={LIMB_COLOR} />
          </svg>
        </div>

        <div className="flex flex-col" style={{ gap: 0, width: 170 }}>
          {rows.map((row, i) => (
            <div
              key={row.label}
              style={{
                paddingTop: i > 0 ? 12 : 0,
                marginTop: i > 0 ? 12 : 0,
                borderTop: i > 0 ? '1px solid rgba(255,255,255,.16)' : 'none',
              }}
            >
              <div className="font-bold leading-none" style={{ fontSize: 46, color: row.color, textShadow: '0 2px 10px rgba(0,0,0,.55)' }}>
                {row.pct.toFixed(0)}
                <span style={{ fontSize: 20 }}>%</span>
              </div>
              <div style={{ fontSize: 16, letterSpacing: 3, color: '#e9e9ea', marginTop: 2 }}>{row.label}</div>
              <div style={{ marginTop: 7, height: 3, width: '100%', background: 'rgba(255,255,255,.14)' }}>
                <div style={{ height: '100%', width: `${(row.pct / maxPct) * 100}%`, background: row.color, boxShadow: `0 0 6px ${row.color}aa` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* section label chip, docked to the panel's slanted bottom edge */}
      <div
        className="relative mt-[60px] self-start top-[-10px]"
        style={{
          background: accentColor,
          padding: '7px 20px 7px 14px',
          clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
          boxShadow: `0 4px 16px ${accentColor}55`,
        }}
      >
        <span className='text-white text-[20px] relative'>DAMAGE DISTRIBUTION</span>
      </div>
    </div>
  );
};

/* -------------------- Stat grid -------------------- */
interface StatCell {
  key: string;
  value: string | number;
  label: string;
}

const StatGrid: React.FC<{ stats: StatCell[]; accentColor: string }> = ({ stats, accentColor }) => {
  return (
    <div className="relative grid grid-cols-2" style={{ fontFamily: FONT, width: 420, padding: '10px 16px' }}>
      <div className="absolute inset-0" style={{ ...glassPanel(accentColor, 'right') }} />
      <span
        style={{
          position: 'absolute',
          top: 6,
          right: 26,
          width: 22,
          height: 2,
          background: accentColor,
          transform: 'rotate(45deg)',
          transformOrigin: 'right center',
        }}
      />
      {stats.map((stat, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        return (
          <div
            key={stat.key}
            className="relative flex flex-col items-center justify-center"
            style={{
              padding: '24px 16px',
              borderLeft: col === 1 ? '1px solid rgba(255,255,255,.16)' : 'none',
              borderTop: row > 0 ? '1px solid rgba(255,255,255,.16)' : 'none',
            }}
          >
            <div className="font-bold leading-none" style={{ fontSize: 48, color: "white" }}>
              {stat.value}
            </div>
            <div
              className="mt-2 pt-2"
              style={{
                fontSize: 16,
                letterSpacing: 3,
                color: 'white',
                borderTop: '1px solid rgba(255,255,255,.3)',
                width: '68%',
                textAlign: 'center',
              }}
            >
              {stat.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* -------------------- Fallback demo numbers -------------------- */
const DEMO_STATS = { elims: 10, damage: 1297, knockouts: 8, survSeconds: 27 * 60 + 47, headshots: 4, longestElim: 210 };
const DEMO_DISTRIBUTION = { headPct: 9, bodyPct: 45, limbsPct: 46 };

/* -------------------- Main Component -------------------- */
const Mvp: React.FC<MatchFragrsProps> = ({ tournament, round, matchData, weaponDetails }) => {
  const topPlayers = useMemo(() => {
    if (!matchData?.teams) return [];
    const scored = computeFraggerScores(buildFraggerPool([matchData])).sort(compareFraggerScore);
    return scored.slice(0, 10).map((player) => ({
      ...(player.latestPlayerRaw as any),
      ...player,
      killNum: player.totalKills,
      numericDamage: player.totalDamage,
      maxKillDistance: player.longestKillDistance,
      headShotNum: player.totalHeadshots,
    }));
  }, [matchData]);

  const topPlayer = topPlayers[0];

  const weaponStats = useMemo(
    () => aggregateWeaponStats(weaponDetails, topPlayer?.uId ?? topPlayer?._id),
    [weaponDetails, topPlayer]
  );

  const distributionRows: DamageRow[] = useMemo(() => {
    const hasReal = weaponStats.distribution.total > 0;
    return [
      { label: 'HEAD', pct: hasReal ? weaponStats.distribution.headPct : DEMO_DISTRIBUTION.headPct, color: HEAD_COLOR },
      { label: 'BODY', pct: hasReal ? weaponStats.distribution.bodyPct : DEMO_DISTRIBUTION.bodyPct, color: BODY_COLOR },
      { label: 'LIMBS', pct: hasReal ? weaponStats.distribution.limbsPct : DEMO_DISTRIBUTION.limbsPct, color: LIMB_COLOR },
    ];
  }, [weaponStats]);

  const statCells: StatCell[] = useMemo(() => {
    if (!topPlayer) return [];
    const hasWeaponStats = weaponStats.kills + weaponStats.damage + weaponStats.knockouts > 0;
    const elims = hasWeaponStats ? weaponStats.kills : topPlayer.killNum || DEMO_STATS.elims;
    const damage = Math.round(hasWeaponStats ? weaponStats.damage : topPlayer.numericDamage || DEMO_STATS.damage);
    const knockouts = hasWeaponStats ? weaponStats.knockouts : topPlayer.knockouts || DEMO_STATS.knockouts;
    const survSeconds = topPlayer.surviveTime ?? topPlayer.liveTime ?? weaponStats.maxOwnTimeSeconds ?? DEMO_STATS.survSeconds;
    const headshots = hasWeaponStats ? weaponStats.headshots : topPlayer.headShotNum || DEMO_STATS.headshots;
    const longestElim = weaponStats.longestHitDistance || topPlayer.maxKillDistance || DEMO_STATS.longestElim;

    return [
      { key: 'elims', value: elims, label: 'ELIMS' },
      { key: 'damage', value: damage.toLocaleString(), label: 'DAMAGE' },
      { key: 'knockouts', value: knockouts, label: 'KNOCKOUTS' },
      { key: 'surv', value: formatDuration(survSeconds), label: 'SURV. TIME' },
      { key: 'headshots', value: headshots, label: 'HEADSHOTS' },
      { key: 'longest', value: `${Math.round(longestElim)}m`, label: 'LONGEST ELIM' },
    ];
  }, [topPlayer, weaponStats]);

  const primary = tournament.primaryColor || '#E8192C';

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden " style={{ background: '' }}>
      {/* faint diagonal scanline texture across the whole canvas, ties every element to one surface */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'repeating-linear-gradient(115deg, rgba(255,255,255,.02) 0px, rgba(255,255,255,.02) 1px, transparent 1px, transparent 6px)' }}
      />

      {!topPlayer ? (
        <div className="w-full h-full flex items-center justify-center text-white text-2xl" style={{ fontFamily: FONT }}>
          Loading MVP...
        </div>
      ) : (
        <>
        

          {/* Body: distribution | player | stats */}
          <div className="absolute inset-0 flex items-end justify-between px-[64px] pb-[70px] pt-[130px]">
            <motion.div initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.55, delay: 0.15 }}>
              <DamageDistributionFigure rows={distributionRows} accentColor={primary} />
            </motion.div>

            {/* Center: MVP ribbon + player photo + identity */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55 }}
              className="relative flex flex-col items-center"
              style={{ width: 580 }}
            >
              {/* MVP chevron ribbon, docked directly above the player */}
            <div
  className="absolute top-[-900px] w-[620px] h-[112px] flex items-center left-[180px]"
  style={{
    background: `linear-gradient(90deg, ${primary} 0%, ${primary}dd 72%, ${primary}88 100%)`,
    padding: '10px 26px',
    clipPath: 'polygon(18px 0, 100% 0, calc(100% - 18px) 100%, 0 100%)',
    boxShadow: `0 8px 28px ${primary}66`,
    overflow: 'hidden',
  }}
>
  {/* Accent line */}
  <div
    className="absolute left-0 top-0 w-[6px] h-full"
    style={{
      background: '#fff',
      opacity: 0.9,
    }}
  />

  {/* Decorative diagonal */}
  <div
    className="absolute right-[-35px] top-[-30px] w-[180px] h-[180px]"
    style={{
      background: '#fff',
      opacity: 0.08,
      transform: 'rotate(25deg)',
    }}
  />

  {/* MVP Label */}
  <div className="flex flex-col justify-center mr-5 min-w-[155px] relative z-10 ">
    <div
      className="font-[AGENCYB] uppercase"
      style={{
        fontSize: 22,
        letterSpacing: 5,
        color: '#fff',
        lineHeight: 1,
        opacity: 0.75,
      }}
    >
      MOST VALUEABLE
    </div>

    <div
      className="font-[AGENCYB] uppercase"
      style={{
        fontSize: 42,
        letterSpacing: 2,
        color: '#fff',
        lineHeight: 0.9,
        textShadow: '0 3px 12px rgba(0,0,0,.35)',
      }}
    >
      PLAYER
    </div>
  </div>

  {/* Divider */}
  <div
    className="h-[62px] w-[2px] mr-5"
    style={{
      background: 'rgba(255,255,255,.35)',
    }}
  />

  {/* Team Logo */}
  {topPlayer.teamLogo && (
    <div
      className="w-[70px] h-[70px] flex items-center justify-center mr-4"
      style={{
        background: 'rgba(0,0,0,.16)',
        clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
      }}
    >
      <img
        src={topPlayer.teamLogo}
        alt={topPlayer.teamName}
        style={{
          width: 58,
          height: 58,
          objectFit: 'contain',
          filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.5))',
        }}
      />
    </div>
  )}

  {/* Player Information */}
  <div className="flex flex-col justify-center min-w-0 relative z-10">

    {/* Player Name */}
    <div
      className="font-[AGENCYB] uppercase whitespace-nowrap"
      style={{
        fontSize: 46,
        color: '#fff',
        lineHeight: 0.95,
        letterSpacing: 1,
        textShadow: '0 4px 12px rgba(0,0,0,.55)',
      }}
    >
      {topPlayer.playerName}
    </div>

    {/* Team */}
    <div
      className="uppercase whitespace-nowrap"
      style={{
        marginTop: 7,
        fontSize: 16,
        letterSpacing: 4,
        color: '#fff',
        fontWeight: 800,
        opacity: 0.8,
      }}
    >
      {(
        topPlayer.teamTag ||
        topPlayer.teamName ||
        ''
      ).toUpperCase()}
    </div>
  </div>

  {/* Bottom highlight */}
  <div
    className="absolute bottom-0 left-0 h-[3px]"
    style={{
      width: '100%',
      background: 'rgba(255,255,255,.8)',
    }}
  />
</div>


            

             
            </motion.div>
  <div className="relative w-[100%] h-[90%] bottom-[-100px] left-[-100px]">
                <img
                  src={topPlayer.picUrl || '/def_char.avif'}
                  alt={topPlayer.playerName || 'Player'}
                  className="w-full h-full  "
                  style={{ filter: 'drop-shadow(0 20px 30px rgba(0,0,0,.6))' }}
                />
              </div>
            <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.55, delay: 0.15 }}>
              <StatGrid stats={statCells} accentColor={primary} />
            </motion.div>
          </div>

         
       
        </>
      )}
    </div>
  );
};

export default Mvp;