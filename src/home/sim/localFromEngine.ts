// The desktop tools (map, battle bar, team slots ...) read `local.*`: the game
// feed the desktop app gets on the PC. The website has none, so the simulator
// builds one from the simulated match: the same players, kills and deaths the
// theme overlays show, spread around a zone on the map.

import { buildLocal, MAP_UNITS, type LocalState } from '../../graphics/bindings/local.ts';

const ZONE = {
  CircleArray: [
    { X: 0.5 * MAP_UNITS, Y: 0.5 * MAP_UNITS, Size: 0.45 * MAP_UNITS },
    { X: 0.52 * MAP_UNITS, Y: 0.48 * MAP_UNITS, Size: 0.26 * MAP_UNITS },
    { X: 0.54 * MAP_UNITS, Y: 0.47 * MAP_UNITS, Size: 0.14 * MAP_UNITS },
  ],
};

/**
 * `tick` (seconds since the simulation started) runs the zone clock and moves
 * players a little, so the map and timer are not frozen.
 */
export function localFromEngine(state: any, tick: number): LocalState | null {
  const teams: any[] = state?.matchData?.teams || [];
  if (!teams.length) return null;
  const players = teams.flatMap((t, ti) => {
    const angle = (ti / teams.length) * Math.PI * 2 + tick * 0.004;
    const cx = 0.52 + Math.cos(angle) * 0.15;
    const cy = 0.48 + Math.sin(angle) * 0.15;
    return (t.players || []).map((p: any, i: number) => ({
      uId: p.uId,
      teamId: t.slot ?? ti + 1,
      location: { x: (cx + (i % 2) * 0.012) * MAP_UNITS, y: (cy + Math.floor(i / 2) * 0.012) * MAP_UNITS, z: 0 },
      health: p.health, healthMax: p.healthMax || 100, liveState: p.liveState, bHasDied: p.bHasDied, killNum: p.killNum,
    }));
  });
  const firstAlive = players.find((p) => p.liveState !== 5);
  const phase = tick % 120;
  return buildLocal({
    connected: true,
    map: String(state?.match?.map || 'erangle'),
    matchData: { teams },
    players,
    observedUid: firstAlive?.uId ?? null,
    globalInfo: ZONE,
    // 60 s holding, then 60 s closing, on repeat.
    circle: { CircleIndex: '2', CircleStatus: phase < 60 ? '0' : '2', Counter: String(phase % 60), MaxTime: '60', GameTime: String(tick) },
  });
}
