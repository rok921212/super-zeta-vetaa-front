// src/components/Mvp.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

/* THEME8 "WHITE LABEL" — MVP (open layout).
   Data pipeline unchanged: top fragger by the single-match Fragger Score,
   hit-location split from the weapon-detail feed (dominant room only),
   alive-MVP survival floor, demo numbers off an overlay route.

     ┌ MOST VALUABLE PLAYER ┐
     │ round · day          │
     ┌─ HIT LOCATION ─────────┐                      (player photo, no panel,
     │  figure ──── HEAD  9%  │                       standing on the right)
     │        ──── BODY 45%   │
     │        ──── LIMBS 46%  │                    PLAYER NAME
     │  [■■|■■■■■■■■|■■■■■■■] │                    [logo] TEAM
     └────────────────────────┘
     ▌MATCH STATS │ 10 ELIMS │ 1297 DAMAGE │ 8 KNOCKS │ 27:47 │ 4 HS │ 210m │

   Motion (state + CSS transitions only — always plays, even with OS
   "reduce motion"):
     1) heading drops in
     2) the player rises in on the right; name slides in, team tag follows
     3) the hit-location panel rises from below; figure lights up part by part,
        callout lines draw out to their numbers, percentages count, split bar grows
     4) the stats bar wipes open along the bottom; cells count up left → right
   PREVIEW: a "Preview MVP" button OUTSIDE the 1920×1080 canvas replays the
   sequence (dummy MVP when there is no data). */

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

/* -------------------- Palette + type -------------------- */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
const LIMB = '#8E8E99';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* -------------------- Geometry -------------------- */
const LEFT_X = 80;
const PANEL_TOP = 236;
const PANEL_W = 720;
const PANEL_H = 620;
const HEAD_BAR = 58;
const STRIP_TOP = 896;
const STRIP_H = 124;
const STRIP_W = 1760;
const STRIP_LABEL_W = 220;
const CUT = 28;
// Player photo box. The image fills this box (object-fit: cover, anchored to
// the top), so narrow cut-outs are scaled up until they span the full width.
// The bottom of the box sits behind the stats bar, hiding any crop edge.
const PHOTO_W = 840; // wider box → bigger, more visible player
const PHOTO_H = 1000;
const PHOTO_CENTER_X = 1400;
const PHOTO_FOCUS_Y = '6%'; // vertical anchor of the crop (0% = keep the very top)

/* -------------------- Timeline (ms) -------------------- */
const T_PLAYER = 350;
const T_NAME = 1050;
const T_PANEL = 700;
const RISE_MS = 900;
const T_FIG = T_PANEL + RISE_MS - 100;
const T_STRIP = 1900;
const STRIP_WIPE_MS = 700;
const T_CELLS = T_STRIP + 450;
const CELL_STAGGER = 110;

/* -------------------- Fallback demo numbers -------------------- */
// Only off an overlay route (home simulator / previews). A live overlay shows
// the real numbers, zeros included.
const DEMO_STATS = { elims: 10, damage: 1297, knockouts: 8, survSeconds: 27 * 60 + 47, headshots: 4, longestElim: 210 };
const DEMO_DISTRIBUTION = { headPct: 9, bodyPct: 45, limbsPct: 46 };
const DEMO_PLAYER = {
  _id: 'demo',
  playerName: 'VIPER',
  teamTag: 'DMY',
  teamName: 'DUMMY ESPORTS',
  teamLogo: '/def_logo.png',
  picUrl: '',
  killNum: DEMO_STATS.elims,
  numericDamage: DEMO_STATS.damage,
  knockouts: DEMO_STATS.knockouts,
  survivalTime: DEMO_STATS.survSeconds,
  headShotNum: DEMO_STATS.headshots,
  maxKillDistance: DEMO_STATS.longestElim * 100,
  bHasDied: true,
};

/* flip to true after `ms` (two frames later, so the start state paints first) */
function useAfter(ms: number, key: unknown) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(false);
    let r1 = 0;
    let r2 = 0;
    const t = window.setTimeout(() => {
      r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setOn(true));
      });
    }, ms);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [ms, key]);
  return on;
}

/* number counts up 0 → n once `active` turns true */
function useCountUp(target: number, active: boolean, durMs = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) {
      setV(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - start) / durMs));
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durMs]);
  return v;
}

/* -------------------- Hit-location diagram -------------------- */
interface DamageRow {
  label: string;
  pct: number | null; // null = no weapon detail for this player yet
  color: string;
}

/* figure geometry (in the panel's own pixel space) */
const FIG = { x: 76, y: HEAD_BAR + 40, w: 190, h: 400 };
// anchor points on the figure the callout lines start from (viewBox 168×340 → FIG)
const sx = FIG.w / 168;
const sy = FIG.h / 340;
const ANCHORS = [
  { x: FIG.x + 114 * sx, y: FIG.y + 40 * sy }, // head (right edge of the head)
  { x: FIG.x + 120 * sx, y: FIG.y + 130 * sy }, // torso
  { x: FIG.x + 104 * sx, y: FIG.y + 280 * sy }, // leg
];
const LABEL_X = 350; // where the callout rows begin
const ROW_YS = [FIG.y + 18, FIG.y + 150, FIG.y + 282]; // top of each callout row

const Callout: React.FC<{ row: DamageRow; index: number; maxPct: number; on: boolean }> = ({ row, index, maxPct, on }) => {
  const delay = index * 220;
  const v = useCountUp(row.pct ?? 0, on, 900);
  return (
    <div
      style={{
        position: 'absolute',
        left: LABEL_X,
        right: 40,
        top: ROW_YS[index],
        opacity: on ? 1 : 0,
        transform: on ? 'none' : 'translateX(18px)',
        transition: `opacity 300ms linear ${delay + 250}ms, transform 500ms cubic-bezier(.2,.8,.2,1) ${delay + 250}ms`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 22, letterSpacing: '0.26em', color: DIM, paddingBottom: 10 }}>{row.label}</span>
        <span style={{ fontSize: 84, lineHeight: 0.85, color: INK, fontVariantNumeric: 'tabular-nums' }}>
          {row.pct === null ? '--' : Math.round(v)}
          {row.pct !== null && <span style={{ fontSize: 32, marginLeft: 2 }}>%</span>}
        </span>
      </div>
      <div style={{ position: 'relative', height: 10, marginTop: 12, background: LINE }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: on ? `${((row.pct ?? 0) / maxPct) * 100}%` : '0%',
            background: row.color,
            transition: `width 900ms cubic-bezier(.2,.8,.2,1) ${delay + 300}ms`,
          }}
        />
      </div>
    </div>
  );
};

const HitLocation: React.FC<{ rows: DamageRow[]; on: boolean; primary: string; secondary: string }> = ({ rows, on, primary, secondary }) => {
  const maxPct = Math.max(...rows.map((r) => r.pct ?? 0), 1);
  const [head, body, limbs] = rows;
  const part = (i: number): React.CSSProperties => ({ opacity: on ? 1 : 0.1, transition: `opacity 450ms linear ${i * 220}ms` });
  const total = rows.reduce((s, r) => s + (r.pct ?? 0), 0) || 1;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: WHITE,
        clipPath: `polygon(${CUT}px 0, 100% 0, 100% calc(100% - ${CUT}px), calc(100% - ${CUT}px) 100%, 0 100%, 0 ${CUT}px)`,
        fontFamily: FONT,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {/* header */}
      <div
        style={{
          height: HEAD_BAR,
          background: INK,
          color: WHITE,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: `0 24px 0 ${CUT + 10}px`,
          fontSize: 26,
          letterSpacing: '0.18em',
          position: 'relative',
        }}
      >
        <span style={{ width: 12, height: 12, background: primary }} />
        HIT LOCATION
        <span style={{ marginLeft: 'auto', fontSize: 17, letterSpacing: '0.2em', color: 'rgba(255,255,255,.55)' }}>DAMAGE SPLIT</span>
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: primary }} />
      </div>
      <div style={{ position: 'absolute', left: 0, top: HEAD_BAR, bottom: 0, width: 8, background: primary }} />

      {/* faint target rings behind the figure */}
      <svg
        width={280}
        height={280}
        viewBox="0 0 100 100"
        style={{ position: 'absolute', left: FIG.x + FIG.w / 2 - 140, top: FIG.y + FIG.h / 2 - 140, opacity: on ? 0.5 : 0, transition: 'opacity 600ms linear' }}
        aria-hidden
      >
        <g fill="none" stroke={LINE} strokeWidth={0.8}>
          <circle cx={50} cy={50} r={48} />
          <circle cx={50} cy={50} r={33} />
          <path d="M50 0 V12 M50 88 V100 M0 50 H12 M88 50 H100" />
        </g>
      </svg>

      {/* figure */}
      <svg width={FIG.w} height={FIG.h} viewBox="0 0 168 340" style={{ position: 'absolute', left: FIG.x, top: FIG.y }} aria-hidden>
        <circle cx={84} cy={40} r={30} fill={head.color} style={part(0)} />
        <path d="M52,74 Q84,64 116,74 L124,190 Q84,204 44,190 Z" fill={body.color} style={part(1)} />
        <g fill={limbs.color} style={part(2)}>
          <rect x={16} y={78} width={30} height={140} rx={15} />
          <rect x={122} y={78} width={30} height={140} rx={15} />
          <rect x={52} y={196} width={30} height={138} rx={14} />
          <rect x={86} y={196} width={30} height={138} rx={14} />
        </g>
      </svg>

      {/* callout lines — draw out from the figure to each number */}
      <svg width={PANEL_W} height={PANEL_H} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} aria-hidden>
        {ANCHORS.map((a, i) => {
          const y = ROW_YS[i] + 62; // baseline of the % number
          const midX = LABEL_X - 30;
          const d = `M ${a.x} ${a.y} L ${midX} ${y} L ${LABEL_X - 8} ${y}`;
          const len = Math.hypot(midX - a.x, y - a.y) + (LABEL_X - 8 - midX);
          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke={rows[i].color}
                strokeWidth={2.5}
                strokeDasharray={len}
                strokeDashoffset={on ? 0 : len}
                style={{ transition: `stroke-dashoffset 500ms cubic-bezier(.2,.8,.2,1) ${i * 220 + 120}ms` }}
              />
              <circle cx={a.x} cy={a.y} r={on ? 6 : 0} fill={rows[i].color} stroke={WHITE} strokeWidth={2} style={{ transition: `r 300ms ease ${i * 220}ms` }} />
            </g>
          );
        })}
      </svg>

      {/* callout numbers */}
      {rows.map((r, i) => (
        <Callout key={r.label} row={r} index={i} maxPct={maxPct} on={on} />
      ))}

      {/* 100% split bar */}
      <div style={{ position: 'absolute', left: 40, right: 40, bottom: 36 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, letterSpacing: '0.24em', color: DIM, marginBottom: 10 }}>
          <span>TOTAL DAMAGE SPLIT</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 30, height: 5, background: primary, alignSelf: 'center' }} />
            <span style={{ width: 10, height: 5, background: secondary, alignSelf: 'center' }} />
          </span>
        </div>
        <div style={{ display: 'flex', height: 22, gap: 3, background: WHITE }}>
          {rows.map((r, i) => (
            <div
              key={r.label}
              style={{
                width: on ? `${((r.pct ?? 0) / total) * 100}%` : '0%',
                background: r.color,
                transition: `width 800ms cubic-bezier(.2,.8,.2,1) ${700 + i * 120}ms`,
                transform: 'skewX(-18deg)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

/* -------------------- Stats bar cell -------------------- */
interface StatCell {
  key: string;
  value: string | number;
  label: string;
}

const StripCell: React.FC<{ cell: StatCell; at: number; run: number; accent?: string; first: boolean }> = ({ cell, at, run, accent, first }) => {
  const on = useAfter(at, run);
  const isNum = typeof cell.value === 'number';
  const v = useCountUp(isNum ? (cell.value as number) : 0, on && isNum, 900);
  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        boxShadow: first ? 'none' : `inset 1px 0 0 ${LINE}`,
      }}
    >
      {accent && <span style={{ position: 'absolute', left: 26, right: 26, top: 0, height: 6, background: accent }} />}
      <div
        style={{
          fontSize: 64,
          color: INK,
          lineHeight: 0.85,
          fontVariantNumeric: 'tabular-nums',
          opacity: on ? 1 : 0,
          transform: on ? 'none' : 'translateY(14px)',
          transition: 'opacity 250ms linear, transform 450ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {isNum ? Math.round(v) : cell.value}
      </div>
      <div style={{ fontSize: 17, letterSpacing: '0.24em', color: DIM, paddingLeft: '0.24em' }}>{cell.label}</div>
    </div>
  );
};

/* -------------------- Main Component -------------------- */
const Mvp: React.FC<MatchFragrsProps> = ({ tournament, round, matchData, weaponDetails }) => {
  const [run, setRun] = useState(0);
  const [preview, setPreview] = useState(false);

  const topPlayers = useMemo(() => {
    if (!matchData?.teams) return [];
    const scored = computeFraggerScores(buildFraggerPool([matchData] as any)).sort(compareFraggerScore);
    return scored.slice(0, 10).map((player: any) => ({
      ...(player.latestPlayerRaw as any),
      ...player,
      killNum: player.totalKills,
      numericDamage: player.totalDamage,
      maxKillDistance: player.longestKillDistance,
      headShotNum: player.totalHeadshots,
    }));
  }, [matchData]);

  const realTop: any = topPlayers[0];
  const usingDummy = !realTop && preview;
  const topPlayer: any = realTop ?? (preview ? DEMO_PLAYER : undefined);

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
  const demo = details === null || usingDummy;

  // The weapon feed only lands when a player dies / the match ends, so it is
  // used for the hit-location split alone; every stat below is live matchData.
  // Entries outside the feed's dominant room are dropped so a previous match
  // can't bleed in.
  const weaponStats = useMemo(() => {
    if (!details?.length) return aggregateWeaponStats(details as any, null);
    const roomCounts = new Map<string, number>();
    details.forEach((e: any) => {
      const room = String(e.RoomID ?? '');
      roomCounts.set(room, (roomCounts.get(room) || 0) + 1);
    });
    let room = '';
    let best = -1;
    roomCounts.forEach((count, id) => {
      if (count > best) {
        best = count;
        room = id;
      }
    });
    const current = details.filter((e: any) => String(e.RoomID ?? '') === room);
    return aggregateWeaponStats(current, realTop?.uId ?? realTop?._id);
  }, [details, realTop]);

  const primary = tournament.primaryColor || '#E8192C';
  const secondary = tournament.secondaryColor || primary;

  const distributionRows: DamageRow[] = useMemo(() => {
    const dist = weaponStats.distribution;
    const has = !usingDummy && dist.total > 0;
    const pick = (live: number, fallback: number) => (has ? live : demo ? fallback : null);
    return [
      { label: 'HEAD', pct: pick(dist.headPct, DEMO_DISTRIBUTION.headPct), color: primary },
      { label: 'BODY', pct: pick(dist.bodyPct, DEMO_DISTRIBUTION.bodyPct), color: INK },
      { label: 'LIMBS', pct: pick(dist.limbsPct, DEMO_DISTRIBUTION.limbsPct), color: LIMB },
    ];
  }, [weaponStats, demo, usingDummy, primary]);

  const statCells: StatCell[] = useMemo(() => {
    if (!topPlayer) return [];
    const or = (value: number | undefined | null, fallback: number): number => (demo ? value || fallback : value ?? 0);
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
      { key: 'damage', value: damage, label: 'DAMAGE' },
      { key: 'knockouts', value: knockouts, label: 'KNOCKOUTS' },
      { key: 'surv', value: formatDuration(survSeconds), label: 'SURV. TIME' },
      { key: 'headshots', value: headshots, label: 'HEADSHOTS' },
      { key: 'longest', value: `${longestElim.toFixed(1)}m`, label: 'LONGEST ELIM' },
    ];
  }, [topPlayer, demo, matchSurvivalSeconds]);

  const doPreview = useCallback(() => {
    setPreview(true);
    setRun((r) => r + 1);
  }, []);

  /* timeline */
  const headIn = useAfter(60, run);
  const playerIn = useAfter(T_PLAYER, run);
  const nameIn = useAfter(T_NAME, run);
  const panelUp = useAfter(T_PANEL, run);
  const figOn = useAfter(T_FIG, run);
  const stripOpen = useAfter(T_STRIP, run);

  const day = round?.day || tournament.day || '';
  const context = [round?.roundName, day ? (/^day/i.test(day) ? day : `DAY ${day}`) : ''].filter(Boolean).join('  ·  ').toUpperCase();
  const name = (topPlayer?.playerName || '').toUpperCase();
  const nameSize = name.length <= 8 ? 150 : name.length <= 12 ? 118 : name.length <= 16 ? 92 : 74;
  const teamLabel = (topPlayer?.teamName || topPlayer?.teamTag || '').toUpperCase();

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible', fontFamily: FONT, fontWeight: 700 }}>
      {topPlayer ? (
        <>
          {/* ── player photo — no panel, standing on the right ── */}
          <div
            key={`photo-${run}`}
            style={{
              position: 'absolute',
              left: PHOTO_CENTER_X,
              top: STRIP_TOP + STRIP_H - PHOTO_H,
              width: PHOTO_W,
              height: PHOTO_H,
              transform: `translateX(-50%) translateY(${playerIn ? 0 : 90}px)`,
              opacity: playerIn ? 1 : 0,
              transition: 'transform 1000ms cubic-bezier(.16,1,.3,1), opacity 400ms linear',
              filter: 'drop-shadow(0 24px 40px rgba(0,0,0,.55))',
            }}
          >
            <img
              src={playerPhoto(topPlayer.picUrl) || '/def_char.avif'}
              alt={topPlayer.playerName || 'Player'}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                objectFit: 'cover',
                objectPosition: `center ${PHOTO_FOCUS_Y}`,
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/def_char.avif';
              }}
            />
          </div>

          {/* ── player name — no background, over the photo ── */}
          <div
            key={`name-${run}`}
            style={{
              position: 'absolute',
              right: 80,
              bottom: 1080 - STRIP_TOP + 22,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              textAlign: 'right',
              lineHeight: 0.85,
            }}
          >
            <div
              style={{
                fontSize: 30,
                letterSpacing: '0.34em',
                color: WHITE,
                textShadow: '0 2px 10px rgba(0,0,0,.65)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                opacity: nameIn ? 1 : 0,
                transform: nameIn ? 'none' : 'translateX(30px)',
                transition: 'opacity 300ms linear, transform 600ms cubic-bezier(.2,.8,.2,1)',
              }}
            >
              <svg width={30} height={22} viewBox="0 0 40 30" aria-hidden style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))' }}>
                <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={primary} />
              </svg>
              MVP
            </div>
            <div
              style={{
                fontSize: nameSize,
                color: WHITE,
                letterSpacing: '0.01em',
                marginTop: 10,
                whiteSpace: 'nowrap',
                textShadow: '0 6px 26px rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.5)',
                clipPath: nameIn ? 'inset(0 0 0 0)' : 'inset(0 0 0 100%)',
                transition: 'clip-path 700ms cubic-bezier(.65,0,.25,1) 100ms',
              }}
            >
              {name}
            </div>
            {/* team tag — logo tile + team, with a primary rule */}
            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                marginTop: 18,
                height: 54,
                opacity: nameIn ? 1 : 0,
                transform: nameIn ? 'none' : 'translateY(12px)',
                transition: 'opacity 300ms linear 450ms, transform 500ms cubic-bezier(.2,.8,.2,1) 450ms',
                filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.35))',
              }}
            >
              <div style={{ width: 54, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 7, boxSizing: 'border-box' }}>
                <TeamLogo
                  logo={topPlayer.teamLogo}
                  flag={topPlayer.teamFlag}
                  alt={topPlayer.teamName}
                  fallback={'/def_logo.png'}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 22px 0 18px',
                  background: INK,
                  color: WHITE,
                  fontSize: 26,
                  letterSpacing: '0.2em',
                  boxShadow: `inset 4px 0 0 ${primary}`,
                }}
              >
                {teamLabel}
              </div>
            </div>
          </div>

          {/* ── heading, top-left ── */}
          <div
            key={`head-${run}`}
            style={{
              position: 'absolute',
              left: LEFT_X,
              top: 60,
              transform: `translateY(${headIn ? 0 : -24}px)`,
              opacity: headIn ? 1 : 0,
              transition: 'transform 600ms cubic-bezier(.2,.8,.2,1), opacity 300ms linear',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              filter: 'drop-shadow(0 14px 28px rgba(0,0,0,0.35))',
            }}
          >
            <div
              style={{
                position: 'relative',
                height: 96,
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                padding: '0 60px 6px 30px',
                background: INK,
                color: WHITE,
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 30px) 100%, 0 100%)',
                fontSize: 64,
                letterSpacing: '0.07em',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ width: 16, height: 16, background: primary, flex: 'none' }} />
              MOST VALUABLE PLAYER
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, background: primary }} />
            </div>
            {context && (
              <div
                style={{
                  marginTop: -1,
                  background: WHITE,
                  color: INK,
                  padding: '8px 26px 7px 30px',
                  fontSize: 24,
                  letterSpacing: '0.22em',
                  clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
                  whiteSpace: 'nowrap',
                  boxShadow: `inset 6px 0 0 ${secondary}`,
                }}
              >
                {context}
              </div>
            )}
          </div>

          {/* ── hit-location panel, left ── */}
          <div
            key={`panel-${run}`}
            style={{
              position: 'absolute',
              left: LEFT_X,
              top: PANEL_TOP,
              width: PANEL_W,
              height: PANEL_H,
              filter: 'drop-shadow(0 18px 34px rgba(0,0,0,0.35))',
              transform: panelUp ? 'translateY(0px)' : `translateY(${1080 - PANEL_TOP + 60}px)`,
              opacity: panelUp ? 1 : 0,
              transition: `transform ${RISE_MS}ms cubic-bezier(.16,1,.3,1), opacity 150ms linear`,
            }}
          >
            <HitLocation rows={distributionRows} on={figOn} primary={primary} secondary={secondary} />
          </div>

          {/* ── stats bar, along the bottom ── */}
          <div
            key={`strip-${run}`}
            style={{
              position: 'absolute',
              left: LEFT_X,
              top: STRIP_TOP,
              width: STRIP_W,
              height: STRIP_H,
              filter: 'drop-shadow(0 16px 30px rgba(0,0,0,0.35))',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: stripOpen ? '100%' : '0%',
                overflow: 'hidden',
                transition: `width ${STRIP_WIPE_MS}ms cubic-bezier(.65,0,.25,1)`,
                clipPath: `polygon(0 0, 100% 0, calc(100% - ${CUT}px) 100%, 0 100%)`,
              }}
            >
              <div style={{ width: STRIP_W, height: STRIP_H, display: 'flex', background: WHITE, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
                {/* label block */}
                <div
                  style={{
                    width: STRIP_LABEL_W,
                    flex: 'none',
                    background: INK,
                    color: WHITE,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '0 26px',
                    gap: 10,
                    clipPath: 'polygon(0 0, 100% 0, calc(100% - 22px) 100%, 0 100%)',
                    position: 'relative',
                  }}
                >
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: primary }} />
                  <span style={{ fontSize: 34, letterSpacing: '0.08em' }}>MATCH</span>
                  <span style={{ fontSize: 34, letterSpacing: '0.08em', color: primary === INK ? WHITE : primary }}>STATS</span>
                </div>
                {statCells.map((c, i) => (
                  <StripCell key={c.key} cell={c} at={T_CELLS + i * CELL_STAGGER} run={run} accent={i === 0 ? primary : undefined} first={i === 0} />
                ))}
                <div style={{ width: CUT + 10, flex: 'none' }} />
              </div>
              <div style={{ position: 'absolute', left: STRIP_LABEL_W - 22, right: 0, bottom: 0, height: 5, background: secondary }} />
            </div>
          </div>

        </>
      ) : (
        matchData && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 120,
              transform: 'translateX(-50%)',
              background: WHITE,
              borderLeft: `10px solid ${primary}`,
              padding: '16px 28px',
              fontSize: 30,
              letterSpacing: '0.14em',
              color: INK,
            }}
          >
            LOADING MVP…
          </div>
        )
      )}

      {/* ── preview control — outside the 1920×1080 canvas ── */}
      <button
        type="button"
        onClick={doPreview}
        style={{
          position: 'absolute',
          left: 1940,
          top: 580,
          padding: '10px 16px',
          background: INK,
          color: WHITE,
          border: `2px solid ${primary}`,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: '0.1em',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        ▶ PREVIEW MVP
      </button>
    </div>
  );
};

export default Mvp;