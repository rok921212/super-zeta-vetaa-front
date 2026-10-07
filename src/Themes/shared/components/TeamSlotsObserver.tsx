import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSortedTeams, isPlayerDead, Player, MatchData, OverallData, SortedTeam } from '../hooks/unsortteams';

// Observer panel: every team as a card in slot order, for a browser tab or an
// OBS custom dock (not an on-air overlay, so it is theme-independent). The
// look is the desktop app's Team Slots (desktop-app TeamSlotsView.tsx): dark
// background, a red glow around a team that is fighting. It is drawn from the
// same feed and derived fields as LiveStats (useSortedTeams).
//
// The whole grid is scaled to fit the window it is given, so every team stays
// in view in a small dock and the glow shows where the fights are.

const C = {
  bg: '#0a0a0a',
  panel: '#121212',
  panelAlt: '#161616',
  line: 'rgba(255,255,255,0.08)',
  lineRed: 'rgba(220,38,38,0.35)',
  red: '#dc2626',
  redBright: '#ef4444',
  redDim: 'rgba(220,38,38,0.15)',
  white: '#f5f5f5',
  muted: '#8a8a8a',
  dim: '#4a4a4a',
  gold: '#facc15',
};

// The card the grid is laid out with, before it is scaled to the window.
const CARD_W = 124;
const CARD_H = 158;
const GAP = 12;
const PAD = 12;
const MAX_SCALE = 2;

/** A team counts as fighting for this long after its last sign of a fight,
 *  so the glow holds through a firefight instead of blinking shot by shot. */
const FIGHT_HOLD_MS = 5000;
/** The white flash on a team that just dealt damage. */
const FLASH_MS = 900;

const teamKey = (team: SortedTeam): string => String(team._id ?? team.teamId);

const slotOf = (team: SortedTeam): number | null => {
  const slot = Number((team as any).slot);
  return Number.isFinite(slot) && slot > 0 ? slot : null;
};

interface Seen {
  damage: number;
  kills: number;
  health: number;
  down: number;
}

/**
 * Which teams are in a fight right now. Signs of one, read off each tick of
 * the feed:
 *   - a player is firing,
 *   - the team's dealt damage or kills went up,
 *   - one of its players was knocked or killed,
 *   - it lost health while inside the zone (zone damage is not a fight).
 * Returns the fighting teams and the ones that dealt damage a moment ago.
 */
function useFights(teams: SortedTeam[], matchId: string | null) {
  const seen = useRef<Record<string, Seen>>({});
  const fightAt = useRef<Record<string, number>>({});
  const hitAt = useRef<Record<string, number>>({});
  const [, setTick] = useState(0);

  // A new match starts every count from zero.
  useEffect(() => {
    seen.current = {};
    fightAt.current = {};
    hitAt.current = {};
  }, [matchId]);

  useEffect(() => {
    const now = Date.now();
    const next: Record<string, Seen> = {};
    teams.forEach((team) => {
      const key = teamKey(team);
      const alive = team.players.filter((p: Player) => !isPlayerDead(p));
      const stats: Seen = {
        damage: team.players.reduce((sum: number, p: Player) => sum + (Number(p.damage) || 0), 0),
        kills: team.totalKills,
        health: alive.reduce((sum: number, p: Player) => sum + (p.health || 0), 0),
        down: team.players.filter((p: Player) => isPlayerDead(p) || p.liveState === 4).length,
      };
      next[key] = stats;
      const before = seen.current[key];
      const dealt = !!before && (stats.damage > before.damage || stats.kills > before.kills);
      const taken = !!before && (stats.down > before.down || (stats.health < before.health && !team.hasOutsideBlueCircle));
      if (dealt) hitAt.current[key] = now;
      if (dealt || taken || alive.some((p: Player) => p.isFiring)) fightAt.current[key] = now;
    });
    seen.current = next;
    setTick((n) => n + 1);
  }, [teams]);

  // The feed only speaks when something changes: let a hold run out on time.
  const now = Date.now();
  const fighting = new Set(Object.keys(fightAt.current).filter((key) => now - fightAt.current[key] < FIGHT_HOLD_MS));
  const flashing = new Set(Object.keys(hitAt.current).filter((key) => now - hitAt.current[key] < FLASH_MS));
  const active = fighting.size > 0 || flashing.size > 0;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [active]);

  return { fighting, flashing };
}

interface CardProps {
  team: SortedTeam;
  fighting: boolean;
  flashing: boolean;
  /** Another team is fighting: this one steps back so the fight stands out. */
  quiet: boolean;
  apiEnabled: boolean;
}

const TeamCard = memo(({ team, fighting, flashing, quiet, apiEnabled }: CardProps) => {
  const alive = !team.isAllDead;
  const isFighting = alive && fighting;
  const slot = slotOf(team);
  const standing = team.players.filter((p: Player) => !isPlayerDead(p));
  const avgHealth = standing.length
    ? Math.round(standing.reduce((sum: number, p: Player) => sum + ((p.health || 0) / (p.healthMax || 100)) * 100, 0) / standing.length)
    : 0;

  return (
    <div
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        width: CARD_W,
        height: CARD_H,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '14px 10px',
        borderRadius: 8,
        background: isFighting ? '#2a0d0d' : alive ? C.panel : '#0d0d0d',
        border: `1px solid ${isFighting ? C.red : alive ? C.line : 'rgba(255,255,255,0.04)'}`,
        // A plain value swap with one ease, not a looping animation: cheap
        // to draw with twenty cards on screen.
        boxShadow: isFighting
          ? `0 0 0 2px ${C.red}, 0 0 16px 4px rgba(220,38,38,0.6)`
          : flashing && alive
          ? '0 0 0 1px #fff, 0 0 14px 2px rgba(255,255,255,0.5)'
          : 'none',
        opacity: !alive ? 0.38 : quiet ? 0.6 : 1,
        filter: alive ? 'none' : 'grayscale(1)',
        transition: 'box-shadow 200ms ease, opacity 200ms ease, background 200ms ease',
      }}
    >
      <img
        src={team.teamLogo || '/def_logo.png'}
        alt=""
        style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, background: C.panelAlt, border: `1px solid ${C.line}`, marginBottom: 8, flexShrink: 0 }}
      />

      <span
        style={{
          fontWeight: 700,
          fontSize: 22,
          lineHeight: 1,
          padding: '2px 8px',
          borderRadius: 999,
          marginBottom: 4,
          color: alive ? C.white : C.dim,
          border: `1px solid ${alive ? C.lineRed : C.line}`,
          background: alive ? C.redDim : 'transparent',
        }}
      >
        {slot ?? '—'}
      </span>

      <div
        style={{
          width: '100%',
          textAlign: 'center',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.025em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: alive ? C.muted : C.dim,
        }}
      >
        {team.teamTag || team.teamName || ''}
      </div>

      <div style={{ fontSize: 10, marginTop: 2, color: alive ? C.red : C.dim }}>{alive ? `${team.aliveCount} alive` : 'eliminated'}</div>

      {isFighting && (
        <div style={{ fontSize: 9, fontWeight: 700, marginTop: 4, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.025em', background: C.red, color: '#fff' }}>
          FIGHTING
        </div>
      )}

      {/* Squad health, when the round reports it live. */}
      {apiEnabled && alive && standing.length > 0 && (
        <div style={{ width: '100%', marginTop: 6, padding: '0 4px', boxSizing: 'border-box' }}>
          <div style={{ width: '100%', height: 3, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 999,
                width: `${Math.max(0, Math.min(100, avgHealth))}%`,
                background: avgHealth > 50 ? '#22c55e' : avgHealth > 20 ? C.gold : C.redBright,
                transition: 'width 200ms ease',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
});
TeamCard.displayName = 'TeamCard';

/** Columns and scale that show `count` cards as large as a w × h window allows. */
function fit(count: number, w: number, h: number) {
  let best = { cols: Math.min(7, Math.max(1, count)), scale: 1 };
  if (!count || w <= 0 || h <= 0) return best;
  let bestScale = 0;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const scale = Math.min(
      (w - PAD * 2) / (cols * CARD_W + (cols - 1) * GAP),
      (h - PAD * 2) / (rows * CARD_H + (rows - 1) * GAP)
    );
    if (scale > bestScale) {
      bestScale = scale;
      best = { cols, scale: Math.min(MAX_SCALE, Math.max(0.05, scale)) };
    }
  }
  return best;
}

interface Props {
  round?: { apiEnable?: boolean } | null;
  matchData: MatchData | null;
  overallData?: OverallData | null;
  /** No background, for showing it over something else. */
  transparent?: boolean;
}

const TeamSlotsObserver: React.FC<Props> = ({ round, matchData, overallData, transparent }) => {
  const sorted: SortedTeam[] = useSortedTeams(matchData, overallData, 'liveUntilDead');
  // Slot order, so a team keeps its place for the whole match.
  const teams = useMemo(
    () => [...sorted].sort((a, b) => (slotOf(a) ?? Infinity) - (slotOf(b) ?? Infinity)),
    [sorted]
  );
  const apiEnabled = round?.apiEnable === true;
  const { fighting, flashing } = useFights(teams, matchData?._id ?? null);
  const anyFight = teams.some((team) => !team.isAllDead && fighting.has(teamKey(team)));

  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useLayoutEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const { cols, scale } = fit(teams.length, size.w, size.h);
  const rows = Math.ceil(teams.length / cols);
  const gridW = cols * CARD_W + (cols - 1) * GAP;
  const gridH = rows * CARD_H + (rows - 1) * GAP;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: transparent ? 'transparent' : C.bg,
        color: C.white,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      {teams.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 14, color: C.muted }}>Waiting for match data…</div>
      ) : (
        <div
          style={{
            position: 'absolute',
            left: Math.max(PAD, (size.w - gridW * scale) / 2),
            top: PAD,
            width: gridW,
            height: gridH,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${CARD_W}px)`,
            gap: GAP,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {teams.map((team) => {
            const key = teamKey(team);
            const isFighting = fighting.has(key);
            return (
              <TeamCard
                key={key}
                team={team}
                fighting={isFighting}
                flashing={flashing.has(key)}
                quiet={anyFight && !isFighting}
                apiEnabled={apiEnabled}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TeamSlotsObserver;
