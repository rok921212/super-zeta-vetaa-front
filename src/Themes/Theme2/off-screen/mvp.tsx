// src/components/Mvp.tsx
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../../shared/hooks/fraggerScore';
import {
  aggregateWeaponStats,
  formatDuration,
  PlayerWeaponDetailEntry,
} from '../../shared/hooks/Weapondetailstats ';
import { useLocalWeaponDetails } from '../../shared/hooks/useLocalWeaponDetails';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { isPlayerDead } from '../../shared/hooks/unsortteams';
import { playerPhoto } from '../../shared/playerPhoto.ts';

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
  survivalTime?: number;
  liveState?: number;
  bHasDied?: boolean;
  teamLogo?: string;
  teamFlag?: string;
  teamTag?: string;
  teamName?: string;
  picUrl?: string;
}

interface Team {
  _id: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
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

/* -------------------- Theme helpers -------------------- */
const DEFAULT_CHAR = '/def_char.avif';
const INK = '#0d0f13';

const onPicError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_CHAR)) img.src = DEFAULT_CHAR;
};

const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/* Lightning-cut shapes */
const CUT_BOLT = 'polygon(0 0, 100% 0, 84% 46%, 96% 46%, 78% 100%, 0 100%)';
const CUT_CHIP = 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)';
const CUT_HEAD = 'polygon(0 0, 100% 0, calc(100% - 40px) 100%, 0 100%)';
const CUT_TAG = 'polygon(26px 0, 100% 0, 100% 100%, 0 100%, 14px 50%)';
/* side panels: chamfer facing the centre */
const CUT_PANEL_L = 'polygon(0 0, calc(100% - 50px) 0, 100% 50px, 100% 100%, 40px 100%, 0 calc(100% - 40px))';
const CUT_PANEL_R = 'polygon(50px 0, 100% 0, 100% calc(100% - 40px), calc(100% - 40px) 100%, 0 100%, 0 50px)';
/* hero frame: big chamfers + lightning notch on both sides */
const CUT_HERO =
  'polygon(70px 0, calc(100% - 70px) 0, 100% 70px, 100% 38%, calc(100% - 14px) 41%, 100% 44%, 100% 100%, 0 100%, 0 44%, 14px 41%, 0 38%, 0 70px)';
/* name plate: lightning step on top edge */
const CUT_PLATE = 'polygon(0 26px, 36% 26px, 40% 0, 100% 0, 100% 100%, 0 100%)';

const ease = [0.2, 0.9, 0.25, 1] as const;

const Bolt: React.FC<{ size?: number; color: string; style?: React.CSSProperties }> = ({ size = 28, color, style }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" style={style} aria-hidden>
    <path d="M13 0 L2 16 H9 L6 28 L18 10 H11 L15 0 Z" fill={color} />
  </svg>
);

const Crown: React.FC<{ size?: number; color: string }> = ({ size = 40, color }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
    <rect x="6" y="27" width="28" height="3" fill={color} />
  </svg>
);

/** A clipped panel with a soft shadow and an offset themed "echo" frame behind it. */
const Panel: React.FC<{
  clip: string;
  echo: string;
  echoOffset: { x: number; y: number };
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ clip, echo, echoOffset, className = '', style, children }) => (
  <div className={`relative ${className}`} style={style}>
    <div
      className="absolute inset-0"
      style={{ clipPath: clip, background: echo, transform: `translate(${echoOffset.x}px, ${echoOffset.y}px)` }}
    />
    <div className="relative h-full" style={{ filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.28))' }}>
      <div
        className="relative h-full overflow-hidden"
        style={{ clipPath: clip, background: 'linear-gradient(180deg, #ffffff 0%, #eef0f4 100%)' }}
      >
        {children}
      </div>
    </div>
  </div>
);

/** Panel title strip used by both side panels. */
const PanelTitle: React.FC<{ kicker: string; title: string; themeGrad: string; align?: 'left' | 'right' }> = ({
  kicker,
  title,
  themeGrad,
  align = 'left',
}) => (
  <div
    className={`relative h-[92px] flex flex-col justify-center text-white ${align === 'right' ? 'items-end pr-[40px] pl-[70px]' : 'pl-[36px] pr-[70px]'}`}
    style={{ background: themeGrad }}
  >
    <div
      className="absolute inset-0 opacity-[0.14]"
      style={{ backgroundImage: 'repeating-linear-gradient(-55deg, #fff 0 2px, transparent 2px 18px)' }}
    />
    <span className="relative font-[Righteous] text-[1rem] tracking-[0.32em] opacity-80">{kicker}</span>
    <span className="relative font-[AGENCYB] text-[2.2rem] leading-none tracking-[0.04em] flex items-center gap-[10px] whitespace-nowrap">
      <span className="flex shrink-0"><Bolt size={20} color="#fff" /></span>
      {title}
    </span>
  </div>
);

/* -------------------- Damage distribution -------------------- */
interface DamageRow {
  label: string;
  pct: number | null; // null = no weapon detail for this player yet
  color: string;
}

/* Anatomical silhouette, viewBox 0 0 200 460. Left-side limbs are drawn
   once and mirrored for the right side. */
const FIG_HEAD =
  'M100,8 C119,8 130,23 130,43 C130,52 128,60 124,66 C120,73 113,79 106,81 L94,81 C87,79 80,73 76,66 C72,60 70,52 70,43 C70,23 81,8 100,8 Z';
const FIG_TORSO =
  'M90,80 L110,80 L112,94 C126,97 140,100 148,108 C154,114 155,124 153,136 L147,174 C145,190 141,206 140,222 C139,234 138,242 134,250 L66,250 C62,242 61,234 60,222 C59,206 55,190 53,174 L47,136 C45,124 46,114 52,108 C60,100 74,97 88,94 Z';
const FIG_ARM =
  'M50,110 C40,114 35,126 34,142 L31,198 C30,212 28,226 27,240 L25,266 C24,274 22,284 24,294 C26,303 33,305 37,297 C40,290 40,280 40,272 L43,246 C45,232 48,218 51,204 L56,158 C57,140 56,122 50,110 Z';
const FIG_LEG =
  'M67,252 L99,252 L98,270 C97,298 95,328 94,356 C93,382 93,404 95,426 L97,440 C98,448 93,452 85,452 L71,452 C64,452 64,445 71,441 L78,434 C78,412 76,388 75,362 C73,332 70,302 68,274 Z';
const MIRROR = 'translate(200,0) scale(-1,1)';

/** Small HUD crosshair marker placed on a zone. */
const HitMarker: React.FC<{ x: number; y: number; n: string; color: string; hot: boolean }> = ({ x, y, n, color, hot }) => (
  <g transform={`translate(${x},${y})`}>
    {hot && (
      <circle r={16} fill="none" stroke={color} strokeWidth={1.5} opacity={0.9}>
        <animate attributeName="r" values="10;20;10" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0;0.9" dur="2.4s" repeatCount="indefinite" />
      </circle>
    )}
    <circle r={9} fill="#0d0f13" stroke="#fff" strokeWidth={1.5} />
    <line x1={-15} x2={-11} y1={0} y2={0} stroke="#fff" strokeWidth={1.5} />
    <line x1={11} x2={15} y1={0} y2={0} stroke="#fff" strokeWidth={1.5} />
    <line x1={0} x2={0} y1={-15} y2={-11} stroke="#fff" strokeWidth={1.5} />
    <line x1={0} x2={0} y1={11} y2={15} stroke="#fff" strokeWidth={1.5} />
    <text y={3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" fontFamily="AGENCYB, sans-serif">
      {n}
    </text>
  </g>
);

const HumanFigure: React.FC<{ rows: DamageRow[]; primary: string }> = ({ rows, primary }) => {
  const [head, body, limbs] = rows;
  const maxPct = Math.max(...rows.map((r) => r.pct ?? 0), 1);
  const hotLabel = rows.reduce((a, r) => ((r.pct ?? -1) > (a.pct ?? -1) ? r : a), rows[0])?.label;
  const strength = (r?: DamageRow) => (r && r.pct !== null ? 0.25 + 0.75 * (r.pct / maxPct) : 0.16);
  const isHot = (r?: DamageRow) => !!r && r.pct !== null && r.label === hotLabel;

  const zone = (id: string, r?: DamageRow) => ({
    fill: `url(#dd-${id})`,
    opacity: strength(r),
    stroke: 'rgba(255,255,255,0.55)',
    strokeWidth: 1.2,
    filter: isHot(r) ? 'url(#dd-glow)' : undefined,
  });

  const grad = (id: string, color: string) => (
    <linearGradient id={`dd-${id}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
      <stop offset="18%" stopColor={color} />
      <stop offset="100%" stopColor={color} stopOpacity={0.75} />
    </linearGradient>
  );

  return (
    <svg width={176} height={404} viewBox="0 0 200 460" className="relative">
      <defs>
        {/* heat-map: every zone uses the theme colour, intensity = share */}
        {grad('head', primary)}
        {grad('body', primary)}
        {grad('limbs', primary)}
        <filter id="dd-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ghost outline */}
      <g fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={8} strokeLinejoin="round">
        <path d={FIG_HEAD} />
        <path d={FIG_TORSO} />
        <path d={FIG_ARM} />
        <path d={FIG_ARM} transform={MIRROR} />
        <path d={FIG_LEG} />
        <path d={FIG_LEG} transform={MIRROR} />
      </g>

      <g {...zone('limbs', limbs)}>
        <path d={FIG_ARM} />
        <path d={FIG_ARM} transform={MIRROR} />
        <path d={FIG_LEG} />
        <path d={FIG_LEG} transform={MIRROR} />
      </g>
      <path d={FIG_TORSO} {...zone('body', body)} />
      <path d={FIG_HEAD} {...zone('head', head)} />

      {/* anatomy detail lines */}
      <g fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1.2} strokeLinecap="round">
        <path d="M76,106 C88,114 112,114 124,106" />
        <path d="M100,118 L100,236" />
        <path d="M74,160 C86,166 114,166 126,160" />
        <path d="M78,200 C90,204 110,204 122,200" />
      </g>

      <HitMarker x={100} y={44} n="01" color={head?.color || primary} hot={isHot(head)} />
      <HitMarker x={100} y={150} n="02" color={body?.color || primary} hot={isHot(body)} />
      <HitMarker x={84} y={350} n="03" color={limbs?.color || primary} hot={isHot(limbs)} />
    </svg>
  );
};

const DamageDistributionPanel: React.FC<{ rows: DamageRow[]; primary: string; themeGrad: string }> = ({
  rows,
  primary,
  themeGrad,
}) => {
  const maxPct = Math.max(...rows.map((r) => r.pct ?? 0), 1);
  const hasData = rows.some((r) => r.pct !== null);

  return (
    <Panel
      clip={CUT_PANEL_L}
      echo={withAlpha(primary, 0.55)}
      echoOffset={{ x: -14, y: 14 }}
      className="w-[500px] h-[710px]"
    >
      <PanelTitle kicker="HIT LOCATION" title="DAMAGE DISTRIBUTION" themeGrad={themeGrad} />

      <div className="flex gap-[24px] px-[30px] pt-[30px]">
        {/* figure – HUD scanner plate */}
        <div
          className="relative w-[196px] h-[440px] shrink-0 flex items-center justify-center overflow-hidden"
          style={{
            background: `radial-gradient(90% 60% at 50% 38%, #1d212a 0%, ${INK} 70%)`,
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 26px), calc(100% - 26px) 100%, 0 100%)',
          }}
        >
          {/* grid */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />
          <div
            className="absolute left-1/2 top-[38%] w-[300px] h-[300px] rounded-full"
            style={{ transform: 'translate(-50%, -50%)', background: `radial-gradient(circle, ${withAlpha(primary, 0.4)}, transparent 62%)` }}
          />
          {/* scan line */}
          <div
            className="absolute inset-x-0 h-[2px]"
            style={{
              background: `linear-gradient(90deg, transparent, ${primary}, transparent)`,
              boxShadow: `0 0 12px ${primary}`,
              animation: 'mvpm-scan 3.6s ease-in-out infinite',
            }}
          />
          {/* corner brackets */}
          {[
            'left-[10px] top-[10px] border-l-2 border-t-2',
            'right-[10px] top-[10px] border-r-2 border-t-2',
            'left-[10px] bottom-[10px] border-l-2 border-b-2',
          ].map((c) => (
            <span key={c} className={`absolute w-[18px] h-[18px] ${c}`} style={{ borderColor: withAlpha('#ffffff', 0.5) }} />
          ))}

          <HumanFigure rows={rows} primary={primary} />
        </div>

        {/* rows */}
        <div className="flex-1 flex flex-col justify-between py-[4px]">
          {rows.map((row, i) => (
            <motion.div
              key={row.label}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.12, duration: 0.45, ease }}
            >
              <div className="flex items-center gap-[10px]">
                <span
                  className="h-[24px] px-[8px] flex items-center font-[AGENCYB] text-[0.95rem] text-white"
                  style={{ background: INK, clipPath: CUT_CHIP }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="font-[AGENCYB] text-[1.35rem] tracking-[0.2em] text-[#4b505a]">{row.label}</span>
              </div>
              <div className="font-bebas text-[5rem] leading-[0.9] text-[#0d0f13] pt-[8px]">
                {row.pct === null ? '--' : row.pct.toFixed(0)}
                {row.pct !== null && <span className="text-[2rem] ml-[2px]" style={{ color: primary }}>%</span>}
              </div>
              <div className="mt-[6px] h-[6px] bg-[#dde0e6]">
                <motion.div
                  className="h-full"
                  style={{ background: row.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${((row.pct ?? 0) / maxPct) * 100}%` }}
                  transition={{ delay: 0.9 + i * 0.12, duration: 0.7, ease }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* stacked share bar */}
      <div className="px-[30px] pt-[30px]">
        <div className="flex h-[22px] gap-[4px]">
          {hasData ? (
            rows.map((row, i) => (
              <motion.div
                key={row.label}
                className="h-full"
                style={{ background: row.color, clipPath: CUT_CHIP }}
                initial={{ flexGrow: 0.0001 }}
                animate={{ flexGrow: Math.max(row.pct ?? 0, 0.5) }}
                transition={{ delay: 0.9 + i * 0.1, duration: 0.8, ease }}
              />
            ))
          ) : (
            <div className="flex-1 h-full bg-[#d9dce2]" style={{ clipPath: CUT_CHIP }} />
          )}
        </div>
        <div className="mt-[12px] font-[Righteous] text-[0.95rem] tracking-[0.24em] text-[#8a8f99]">
          {hasData ? 'SHARE OF HITS LANDED' : 'AWAITING WEAPON DATA'}
        </div>
      </div>
    </Panel>
  );
};

/* -------------------- Stats panel -------------------- */
interface StatCell {
  key: string;
  value: string | number;
  label: string;
}

const StatsPanel: React.FC<{ stats: StatCell[]; primary: string; themeGrad: string }> = ({
  stats,
  primary,
  themeGrad,
}) => {
  const [hero, ...rest] = stats;
  if (!hero) return null;

  return (
    <Panel
      clip={CUT_PANEL_R}
      echo={withAlpha(primary, 0.55)}
      echoOffset={{ x: 14, y: 14 }}
      className="w-[500px] h-[710px]"
    >
      <PanelTitle kicker="THIS MATCH" title="PERFORMANCE" themeGrad={themeGrad} align="right" />

      {/* hero stat */}
      <div className="relative h-[180px] flex items-center justify-between px-[40px] border-b-[2px] border-[#dfe2e8]">
        <div>
          <div className="font-[Righteous] text-[1rem] tracking-[0.3em] text-[#8a8f99]">TOTAL</div>
          <div className="font-[AGENCYB] text-[3.4rem] leading-none tracking-[0.06em] text-[#0d0f13]">{hero.label}</div>
        </div>
        <div className="flex items-center gap-[12px]">
          <Bolt size={34} color={primary} />
          <span
            className="font-bebas text-[10rem] leading-[0.8] pt-[14px]"
            style={{
              background: themeGrad,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {hero.value}
          </span>
        </div>
      </div>

      {/* list */}
      <div className="px-[24px] pt-[10px]">
        {rest.map((s, i) => (
          <motion.div
            key={s.key}
            className="relative h-[84px] flex items-center pl-[20px] pr-[16px]"
            style={{ borderBottom: i < rest.length - 1 ? '1px solid #e3e6eb' : 'none' }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + i * 0.08, duration: 0.45, ease }}
          >
            <span className="w-[6px] h-[34px] mr-[18px]" style={{ background: themeGrad, transform: 'skewX(-18deg)' }} />
            <span className="font-[AGENCYB] text-[1.6rem] tracking-[0.14em] text-[#4b505a]">{s.label}</span>
            <span className="ml-auto font-bebas text-[3.6rem] leading-none text-[#0d0f13] pt-[6px]">{s.value}</span>
          </motion.div>
        ))}
      </div>
    </Panel>
  );
};

/* -------------------- Fallback demo numbers -------------------- */
// Only off an overlay route (home simulator / previews). A live overlay shows
// the real numbers, zeros included.
const DEMO_STATS = { elims: 10, damage: 1297, knockouts: 8, survSeconds: 27 * 60 + 47, headshots: 4, longestElim: 210 };
const DEMO_DISTRIBUTION = { headPct: 9, bodyPct: 45, limbsPct: 46 };

/* -------------------- Main Component -------------------- */
const Mvp: React.FC<MatchFragrsProps> = ({ tournament, round, matchData, weaponDetails }) => {
  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;

  // Hit-zone colours derived from the theme so the panel stays white-label.
  const HEAD_COLOR = primary;
  const BODY_COLOR = secondary;
  const LIMB_COLOR = withAlpha(primary, 0.45);

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

  const topPlayer: any = topPlayers[0];

  // The feed may only stamp survivalTime once a player dies, so an alive MVP
  // reads 0. Anyone still alive has survived at least as long as the
  // longest-surviving player in the match, so use that as the floor.
  const matchSurvivalSeconds = useMemo(() => {
    let max = 0;
    matchData?.teams?.forEach((t) =>
      t.players?.forEach((p) => {
        max = Math.max(max, Number(p.survivalTime) || 0);
      })
    );
    return max;
  }, [matchData]);

  // The prop wins (tests / callers that already have the feed); otherwise the
  // local relay. null = no relay here (simulator), so demo numbers are used.
  const localWeaponDetails = useLocalWeaponDetails(!weaponDetails);
  const details = weaponDetails ?? localWeaponDetails;
  const demo = details === null;

  // Weapon feed is used for the hit-location split only. Entries outside the
  // feed's dominant room are dropped so a previous match can't bleed in.
  const weaponStats = useMemo(() => {
    if (!details?.length) return aggregateWeaponStats(details, null);
    const roomCounts = new Map<string, number>();
    details.forEach((e) => {
      const room = String(e.RoomID ?? '');
      roomCounts.set(room, (roomCounts.get(room) || 0) + 1);
    });
    const room = Array.from(roomCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
    const current = details.filter((e) => String(e.RoomID ?? '') === room);
    return aggregateWeaponStats(current, topPlayer?.uId ?? topPlayer?._id);
  }, [details, topPlayer]);

  const distributionRows: DamageRow[] = useMemo(() => {
    const dist = weaponStats.distribution;
    const has = dist.total > 0;
    const pick = (live: number, fallback: number) => (has ? live : demo ? fallback : null);
    return [
      { label: 'HEAD', pct: pick(dist.headPct, DEMO_DISTRIBUTION.headPct), color: HEAD_COLOR },
      { label: 'BODY', pct: pick(dist.bodyPct, DEMO_DISTRIBUTION.bodyPct), color: BODY_COLOR },
      { label: 'LIMBS', pct: pick(dist.limbsPct, DEMO_DISTRIBUTION.limbsPct), color: LIMB_COLOR },
    ];
  }, [weaponStats, demo, HEAD_COLOR, BODY_COLOR, LIMB_COLOR]);

  const statCells: StatCell[] = useMemo(() => {
    if (!topPlayer) return [];
    const or = (value: number | undefined | null, fallback: number): number =>
      demo ? value || fallback : value ?? 0;
    const elims = or(topPlayer.killNum, DEMO_STATS.elims);
    const damage = Math.round(or(topPlayer.numericDamage, DEMO_STATS.damage));
    const knockouts = or(topPlayer.knockouts, DEMO_STATS.knockouts);
    const alive = !isPlayerDead(topPlayer);
    const ownSurvival = Number(topPlayer.survivalTime) || 0;
    const survSeconds = or(alive ? Math.max(ownSurvival, matchSurvivalSeconds) : ownSurvival, DEMO_STATS.survSeconds);
    const headshots = or(topPlayer.headShotNum, DEMO_STATS.headshots);
    // maxKillDistance is in cm.
    const longestElim = or(topPlayer.maxKillDistance, DEMO_STATS.longestElim * 100) / 100;

    return [
      { key: 'elims', value: elims, label: 'ELIMS' },
      { key: 'damage', value: damage.toLocaleString(), label: 'DAMAGE' },
      { key: 'knockouts', value: knockouts, label: 'KNOCKOUTS' },
      { key: 'surv', value: formatDuration(survSeconds), label: 'SURV. TIME' },
      { key: 'headshots', value: headshots, label: 'HEADSHOTS' },
      { key: 'longest', value: `${longestElim.toFixed(1)}m`, label: 'LONGEST ELIM' },
    ];
  }, [topPlayer, demo, matchSurvivalSeconds]);

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden select-none">
      <style>{`
        @keyframes mvpm-glow {
          0%, 100% { filter: drop-shadow(0 0 14px ${withAlpha(primary, 0.55)}) drop-shadow(0 24px 40px rgba(0,0,0,0.3)); }
          50%      { filter: drop-shadow(0 0 40px ${withAlpha(primary, 0.95)}) drop-shadow(0 24px 40px rgba(0,0,0,0.3)); }
        }
        @keyframes mvpm-scan { 0% { top: 6%; } 50% { top: 92%; } 100% { top: 6%; } }
        @keyframes mvpm-line { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes mvpm-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes mvpm-sweep {
          0%   { transform: translateX(-200%) skewX(-22deg); }
          55%, 100% { transform: translateX(800%) skewX(-22deg); }
        }
      `}</style>

      {!topPlayer ? (
        <div className="flex items-center justify-center w-full h-full">
          <div
            className="px-[48px] py-[18px] bg-white text-[#111] text-[2rem] font-bebas tracking-[0.12em]"
            style={{ clipPath: CUT_CHIP, borderLeft: `8px solid ${primary}` }}
          >
            LOADING MVP...
          </div>
        </div>
      ) : (
        <>
          {/* ============================ HEADER ============================ */}
          <motion.div
            className="absolute left-[100px] top-[50px] z-30 flex items-stretch"
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
           
            <div
              className="relative bg-white pl-[34px] pr-[80px] flex flex-col justify-center -ml-[18px]"
              style={{ clipPath: CUT_HEAD }}
            >
              <div className="flex items-center gap-[10px]">
                <Bolt size={16} color={primary} />
                <span className="font-[AGENCYB] text-[1.45rem] tracking-[0.16em] uppercase text-[#5b5f68]">
                  {tournament.tournamentName}
                </span>
              </div>
              <div className="font-bebas leading-[0.9] text-[6rem] tracking-[0.02em] flex gap-[16px]">
                <span className="text-[#0d0f13]">MATCH</span>
                <span
                  style={{
                    background: themeGrad,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  MVP
                </span>
              </div>
              <div
                className="absolute left-[34px] right-[80px] bottom-[0px] h-[5px] origin-left"
                style={{ background: themeGrad, animation: 'mvpm-line .9s .3s ease-out both' }}
              />
            </div>
          </motion.div>

          <motion.div
            className="absolute right-[100px] top-[70px] z-30 flex flex-col items-end gap-[10px]"
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <div
              className="h-[58px] pl-[54px] pr-[34px] flex items-center gap-[14px] text-white"
              style={{ background: themeGrad, clipPath: CUT_TAG }}
            >
              <Bolt size={20} color="#fff" />
              <span className="font-[AGENCYB] text-[2.2rem] tracking-[0.08em] leading-none">
                {round?.roundName || 'No Round'}
              </span>
            </div>
            <div
              className="h-[40px] px-[26px] flex items-center bg-white text-[#0d0f13] font-[Righteous] text-[1.05rem] tracking-[0.22em]"
              style={{ clipPath: CUT_CHIP }}
            >
              MOST VALUABLE PLAYER
            </div>
          </motion.div>

          {/* ============================ LEFT PANEL ============================ */}
          <motion.div
            className="absolute left-[100px] top-[300px] z-20"
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35, duration: 0.6, ease }}
          >
            <DamageDistributionPanel rows={distributionRows} primary={primary} themeGrad={themeGrad} />
          </motion.div>

          {/* ============================ RIGHT PANEL ============================ */}
          <motion.div
            className="absolute right-[100px] top-[300px] z-20"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35, duration: 0.6, ease }}
          >
            <StatsPanel stats={statCells} primary={primary} themeGrad={themeGrad} />
          </motion.div>

          {/* ============================ HERO FRAME ============================ */}
          <motion.div
            className="absolute left-[660px] top-[150px] w-[600px] h-[860px] z-10"
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7, ease }}
          >
            <div className="relative w-full h-full" style={{ animation: 'mvpm-glow 3.2s ease-in-out infinite' }}>
              <div
                className="relative w-full h-full overflow-hidden"
                style={{
                  clipPath: CUT_HERO,
                  background: `radial-gradient(120% 80% at 50% 38%, ${primary} 0%, ${secondary} 78%)`,
                }}
              >
                {/* stripes */}
                <div
                  className="absolute inset-0 opacity-[0.10]"
                  style={{ backgroundImage: 'repeating-linear-gradient(-55deg, #fff 0 2px, transparent 2px 26px)' }}
                />
                {/* rays */}
                <div
                  className="absolute left-1/2 top-[44%] w-[1300px] h-[1300px]"
                  style={{
                    background:
                      'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.12) 0deg 5deg, transparent 5deg 20deg)',
                    maskImage: 'radial-gradient(circle, #000 0%, transparent 58%)',
                    WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 58%)',
                    transform: 'translate(-50%, -50%)',
                    animation: 'mvpm-spin 80s linear infinite',
                  }}
                />
                {/* giant outlined MVP */}
                <div
                  className="absolute inset-x-0 top-[70px] text-center font-bebas leading-[0.8] text-[21rem]"
                  style={{ color: 'transparent', WebkitTextStroke: '3px rgba(255,255,255,0.22)' }}
                >
                  MVP
                </div>
                {/* halo */}
                <div
                  className="absolute left-1/2 top-[46%] w-[560px] h-[560px] rounded-full"
                  style={{
                    transform: 'translate(-50%, -50%)',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.08) 45%, transparent 70%)',
                  }}
                />
                {/* inner frame line */}
                <div
                  className="absolute inset-[16px] pointer-events-none"
                  style={{
                    clipPath: CUT_HERO,
                    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.35)',
                  }}
                />

                {/* PLAYER – centred, static */}
                <motion.div
                  className="absolute inset-x-0 top-[90px] bottom-[150px] flex items-end justify-center"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.45, duration: 0.7, ease }}
                >
                  <img
                    src={playerPhoto(topPlayer.picUrl)?.trim() || DEFAULT_CHAR}
                    onError={onPicError}
                    alt=""
                    className="absolute object-contain object-bottom h-full max-w-full left-[60px] "
                    style={{ filter: 'drop-shadow(0 16px 26px rgba(0,0,0,0.5))' }}
                  />
                </motion.div>

                {/* floor fade into the plate */}
                <div
                  className="absolute inset-x-0 bottom-[150px] h-[140px]"
                  style={{ background: `linear-gradient(0deg, ${withAlpha(secondary, 0.85)}, transparent)` }}
                />

                {/* sweep */}
                <div
                  className="pointer-events-none absolute top-0 bottom-0 w-[120px]"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                    animation: 'mvpm-sweep 7s 2s ease-in-out infinite',
                  }}
                />

                {/* NAME PLATE */}
                <motion.div
                  className="absolute inset-x-0 bottom-0 h-[176px]"
                  initial={{ y: 180 }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.8, duration: 0.55, ease }}
                >
                  <div className="relative w-full h-full bg-white flex items-center pt-[26px]" style={{ clipPath: CUT_PLATE }}>
                    <div
                      className="ml-[40px] w-[112px] h-[112px] flex items-center justify-center p-[14px]"
                      style={{ background: themeGrad, clipPath: CUT_CHIP }}
                    >
                      <div className="w-full h-full bg-white flex items-center justify-center p-[8px]" style={{ clipPath: CUT_CHIP }}>
                        <TeamLogo
                          logo={topPlayer.teamLogo}
                          flag={topPlayer.teamFlag}
                          alt={topPlayer.teamName}
                          className="object-contain max-w-full max-h-full"
                        />
                      </div>
                    </div>
                    <div className="ml-[26px] min-w-0 flex-1 pr-[40px]">
                      <div
                        className="font-[Righteous] text-[1.05rem] tracking-[0.26em] uppercase truncate"
                        style={{ color: primary }}
                      >
                        {topPlayer.teamName || topPlayer.teamTag}
                      </div>
                      <div className="font-[AGENCYB] text-[4.2rem] leading-[0.95] text-[#0d0f13] uppercase truncate">
                        {topPlayer.playerName}
                      </div>
                    </div>
                    <div className="absolute left-0 right-0 bottom-0 h-[8px]" style={{ background: themeGrad }} />
                  </div>
                </motion.div>
              </div>

              {/* crown tab on top edge */}
              <div
                className="absolute left-1/2 -top-[26px] -translate-x-1/2 h-[56px] px-[30px] flex items-center gap-[12px] bg-white"
                style={{ clipPath: CUT_CHIP }}
              >
                <Crown size={30} color={primary} />
                <span className="font-[AGENCYB] text-[1.8rem] tracking-[0.18em] text-[#0d0f13]">MVP</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
};

export default Mvp;