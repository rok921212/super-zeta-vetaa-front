import React, { useEffect, useState, useRef, useCallback } from 'react';
// NOTE: framer-motion removed. The AnimatePresence/motion.div slide-in +
// fade was doing exactly what a CSS transition on transform/opacity does —
// see the .dom-alert-* classes below — for a fraction of the bundle
// weight, with the same double-rAF flip technique the other Dom.tsx
// conversions already use to make sure the transition actually plays
// rather than snapping straight to its end state.
//
// NOTE: SocketManager import removed, along with mergeSocketData and
// handleSocketUpdate. PublicThemeRenderer owns the single socket
// connection and passes freshly-merged `matchData` down as a prop on every
// 'bulkUpdate' — this component just reacts to that prop changing, same as
// Alerts.tsx / LiveStats.tsx / the other Dom.tsx conversions.
//
// detectAlert / buildKillMaps / killFingerprint are unchanged pure
// functions — they never cared whether the MatchData they were handed came
// from a socket merge or a prop update, so nothing about the milestone
// detection logic itself needed to change.

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface Player {
  _id: string;
  teamName: string;
  playerName: string;
  killNum: number;
  bHasDied: boolean;
  picUrl?: string;
  health: number;
  healthMax: number;
  liveState: number;
  killNumInVehicle?: number;
  killNumByGrenade?: number;
  gotAirDropNum?: number;
  damage?: number;
  maxKillDistance?: number;
}

interface Team {
  _id: string;
  teamName: string;
  teamTag: string;
  teamId?: string;
  slot?: number;
  placePoints: number;
  players: Player[];
  teamLogo: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface AlertPlayer extends Player {
  teamTag: string;
  teamLogo: string;
  milestone: string;
}

interface DomProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

// ─── Pure helpers — unchanged ──────────────────────────────────────────────────

type KillMap = Record<string, number>;

function buildKillMaps(matchData: MatchData): { kills: KillMap; vehicle: KillMap; grenade: KillMap; airdrop: KillMap; damage: KillMap; distance: KillMap } {
  const kills: KillMap = {};
  const vehicle: KillMap = {};
  const grenade: KillMap = {};
  const airdrop: KillMap  = {};
  const damage: KillMap    = {};
  const distance: KillMap  = {};
  for (const team of matchData.teams) {
    for (const p of team.players) {
      kills[p.playerName]   = p.killNum           || 0;
      vehicle[p.playerName] = p.killNumInVehicle  || 0;
      grenade[p.playerName] = p.killNumByGrenade  || 0;
      airdrop[p.playerName]  = p.gotAirDropNum     || 0;
      damage[p.playerName]    = p.damage            || 0;
      distance[p.playerName]  = p.maxKillDistance   || 0;
    }
  }
  return { kills, vehicle, grenade, airdrop, damage, distance };
}

function killFingerprint(md: MatchData): string {
  return md.teams
    .flatMap(t =>
      t.players.map(p => `${p._id}:${p.killNum ?? 0}:${p.killNumInVehicle ?? 0}:${p.killNumByGrenade ?? 0}:${p.gotAirDropNum ?? 0}:${p.damage ?? 0}:${p.maxKillDistance ?? 0}`)
    )
    .join('|');
}

// ─── Pure alert detector — uses PRE-update snapshots ─────────────────────────

function detectAlert(
  md: MatchData,
  snapKills: KillMap,
  snapVehicle: KillMap,
  snapGrenade: KillMap,
  snapAirdrop: KillMap,
  snapDamage: KillMap,
  snapDistance: KillMap,
  firstBloodDone: boolean
): AlertPlayer | null {

  // 1. First blood — killNum field
  if (!firstBloodDone) {
    for (const team of md.teams) {
      for (const p of team.players) {
        if ((p.killNum || 0) === 1 && (snapKills[p.playerName] ?? 0) === 0) {
          return { ...p, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: 'FIRST BLOOD' };
        }
      }
    }
  }

  // 2. Kill streaks — killNum field, reverse order = most recent update
  for (let ti = md.teams.length - 1; ti >= 0; ti--) {
    const team = md.teams[ti];
    for (let pi = team.players.length - 1; pi >= 0; pi--) {
      const p    = team.players[pi];
      const cur  = p.killNum || 0;
      const prev = snapKills[p.playerName] ?? 0;
      if (cur > prev) {
        if (cur >= 8 && prev < 8) return { ...p, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: 'UNSTOPABLE' };
        if (cur >= 5 && prev < 5) return { ...p, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: 'RAMPAGE' };
        if (cur >= 3 && prev < 3) return { ...p, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: 'DOMINATION' };
      }
    }
  }

  // 3. Vehicle elimination — killNumInVehicle field
  for (let ti = md.teams.length - 1; ti >= 0; ti--) {
    const team = md.teams[ti];
    for (let pi = team.players.length - 1; pi >= 0; pi--) {
      const p    = team.players[pi];
      const cur  = p.killNumInVehicle || 0;
      const prev = snapVehicle[p.playerName] ?? 0;
      if (cur > prev) {
        return { ...p, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: 'VEHICLE ELIM' };
      }
    }
  }

  // 4. Grenade elimination — killNumByGrenade field
  for (let ti = md.teams.length - 1; ti >= 0; ti--) {
    const team = md.teams[ti];
    for (let pi = team.players.length - 1; pi >= 0; pi--) {
      const p    = team.players[pi];
      const cur  = p.killNumByGrenade || 0;
      const prev = snapGrenade[p.playerName] ?? 0;
      if (cur > prev) {
        return { ...p, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: 'GRENADE ELIM' };
      }
    }
  }


  // 5. Airdrop — gotAirDropNum field — fires on every new airdrop
  for (let ti = md.teams.length - 1; ti >= 0; ti--) {
    const team = md.teams[ti];
    for (let pi = team.players.length - 1; pi >= 0; pi--) {
      const p    = team.players[pi];
      const cur  = p.gotAirDropNum || 0;
      const prev = snapAirdrop[p.playerName] ?? 0;
      if (cur > prev) {
        return { ...p, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: 'AIRDROP LOOTED' };
      }
    }
  }

  // 6. Damage milestone — damage field — fires every time player crosses 600 damage threshold
  //    maxKillDistance is in cm, so 300m = 30000cm
  for (let ti = md.teams.length - 1; ti >= 0; ti--) {
    const team = md.teams[ti];
    for (let pi = team.players.length - 1; pi >= 0; pi--) {
      const p    = team.players[pi];
      const cur  = p.damage || 0;
      const prev = snapDamage[p.playerName] ?? 0;
      // Fire each time player crosses a new 600-damage multiple
      const curBracket  = Math.floor(cur  / 600);
      const prevBracket = Math.floor(prev / 600);
      if (curBracket > prevBracket && cur >= 600) {
        return { ...p, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: '600+ DAMAGE' };
      }
    }
  }

  // 7. Kill distance — maxKillDistance in CM — fires when player crosses 30000cm (300m)
  for (let ti = md.teams.length - 1; ti >= 0; ti--) {
    const team = md.teams[ti];
    for (let pi = team.players.length - 1; pi >= 0; pi--) {
      const p       = team.players[pi];
      const curCm   = p.maxKillDistance || 0;
      const prevCm  = snapDistance[p.playerName] ?? 0;
      if (curCm >= 30000 && prevCm < 30000) {
        return { ...p, teamTag: team.teamTag, teamLogo: team.teamLogo, milestone: '300m KILL' };
      }
    }
  }

  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const DISPLAY_MS   = 6000;
const EXIT_ANIM_MS = 600;

const Dom: React.FC<DomProps> = React.memo(({ tournament, matchData }) => {
  const [isVisible,      setIsVisible]      = useState(false);
  const [displayedPlayer, setDisplayedPlayer] = useState<AlertPlayer | null>(null);

  // Stable refs
  const prevKillsRef   = useRef<KillMap>({});
  const prevVehicleRef = useRef<KillMap>({});
  const prevGrenadeRef = useRef<KillMap>({});
  const prevAirdropRef  = useRef<KillMap>({});
  const prevDamageRef    = useRef<KillMap>({});
  const prevDistanceRef  = useRef<KillMap>({});
  const firstBloodRef  = useRef(false);
  const fingerprintRef = useRef('');
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the matchData._id we last saw, so a new match (as opposed to a
  // routine live update to the same match) can be told apart and trackers
  // reset accordingly — same idea as the other converted files.
  const matchDataIdRef = useRef<string | null>(matchData?._id?.toString() ?? null);

  // Show alert banner. isVisible drives the .dom-alert-visible /
  // .dom-alert-hidden CSS classes below instead of framer-motion's
  // initial/animate/exit props.
  const showAlert = useCallback((player: AlertPlayer) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    setDisplayedPlayer(player);
    // Start hidden, then flip to visible a frame later so the browser has
    // committed the "off-screen" transform first — otherwise the browser
    // may coalesce both state changes into one paint and the transition
    // never plays.
    setIsVisible(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setIsVisible(true)));

    timerRef.current = setTimeout(() => {
      setIsVisible(false);
      timerRef.current = setTimeout(() => {
        setDisplayedPlayer(null);
        timerRef.current = null;
      }, EXIT_ANIM_MS + 100);
    }, DISPLAY_MS);
  }, []);

  // ── Milestone detection — runs whenever the matchData PROP changes,
  // instead of inside a socket merge handler. Same fingerprint-diffing /
  // pre-update-snapshot approach as before, just triggered by prop updates
  // rather than raw socket events. ──
  useEffect(() => {
    if (!matchData) return;

    const newId = matchData._id?.toString() ?? null;
    if (newId !== matchDataIdRef.current) {
      // Match changed — reset every tracker so old-match counters can't
      // leak into new-match milestone comparisons.
      matchDataIdRef.current = newId;
      const { kills, vehicle, grenade, airdrop, damage, distance } = buildKillMaps(matchData);
      prevKillsRef.current    = kills;
      prevVehicleRef.current  = vehicle;
      prevGrenadeRef.current  = grenade;
      prevAirdropRef.current  = airdrop;
      prevDamageRef.current   = damage;
      prevDistanceRef.current = distance;
      fingerprintRef.current  = killFingerprint(matchData);
      firstBloodRef.current   = false;
      return; // nothing to alert on for a match we're just now seeing
    }

    const fp = killFingerprint(matchData);
    if (fp === fingerprintRef.current) return; // nothing kill-related changed

    // ── Snapshot BEFORE updating maps ──────────────────────────────────────
    const snapKills    = { ...prevKillsRef.current };
    const snapVehicle  = { ...prevVehicleRef.current };
    const snapGrenade  = { ...prevGrenadeRef.current };
    const snapAirdrop  = { ...prevAirdropRef.current };
    const snapDamage   = { ...prevDamageRef.current };
    const snapDistance = { ...prevDistanceRef.current };

    // ── Update maps ─────────────────────────────────────────────────────────
    fingerprintRef.current = fp;
    const { kills, vehicle, grenade, airdrop, damage, distance } = buildKillMaps(matchData);
    prevKillsRef.current    = kills;
    prevVehicleRef.current  = vehicle;
    prevGrenadeRef.current  = grenade;
    prevAirdropRef.current  = airdrop;
    prevDamageRef.current   = damage;
    prevDistanceRef.current = distance;

    // ── Detect alert using PRE-update snapshots ────────────────────────────
    const alert = detectAlert(matchData, snapKills, snapVehicle, snapGrenade, snapAirdrop, snapDamage, snapDistance, firstBloodRef.current);

    if (alert) {
      if (alert.milestone === 'FIRST BLOOD') firstBloodRef.current = true;
      showAlert(alert);
    }
  }, [matchData, showAlert]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (!matchData || !displayedPlayer) return null;

  const primary   = tournament.primaryColor  || '#6b21a8';
  const secondary = tournament.secondaryColor || '#c084fc';

  return (
    <div className="w-[1920px] h-[1080px] text-white relative overflow-hidden">
      <style>{`
        .dom-alert-card {
          transition: transform 0.55s cubic-bezier(0.32, 0, 0.67, 0),
                      opacity 0.55s cubic-bezier(0.32, 0, 0.67, 0);
          will-change: transform, opacity;
        }
        .dom-alert-hidden {
          transform: translateX(-110%);
          opacity: 0;
        }
        .dom-alert-visible {
          transform: translateX(0);
          opacity: 1;
        }
      `}</style>

      <div
        key={displayedPlayer._id + displayedPlayer.milestone}
        className={`dom-alert-card absolute top-[500px] left-[-10px] w-[400px] h-[450px] ${
          isVisible ? 'dom-alert-visible' : 'dom-alert-hidden'
        }`}
      >
        <div className="w-full h-full relative">

          {/* Background gradient */}
          <div
            style={{ backgroundImage: `linear-gradient(to left top, ${primary}, ${secondary})` }}
            className="absolute inset-0 w-full h-full"
          />

          {/* Player + team logo layer */}
          <div className="absolute top-[5px] w-[475px] h-[175px]">

            {/* Small team logo top-right */}
            <img
              src={displayedPlayer.teamLogo}
              alt=""
              className="w-[80px] h-[80px] absolute top-[2px] left-[307px]"
              loading="eager"
              decoding="async"
            />

            {/* Faded background team logo */}
            <img
              src={displayedPlayer.teamLogo}
              alt=""
              className="absolute w-[300px] h-[300px] grayscale opacity-30 left-[50px] top-[20px]"
              loading="eager"
              decoding="async"
            />

            {/* Player image */}
            <img
              src={displayedPlayer.picUrl || '/def_char.avif'}
              alt={displayedPlayer.playerName}
              className="w-full h-full object-contain absolute z-10 scale-[2.2] left-[-30px] top-[-10px]"
              loading="eager"
              decoding="async"
            />

            {/* Info panel */}
            <div
              className="absolute top-[270px] left-[10px] w-[82%] h-full"
              style={{ backgroundImage: `linear-gradient(to bottom right, ${primary}, ${secondary})` }}
            >
              {/* Team name bar */}
              <div
                style={{
                  backgroundImage: `url('/theme3assets/lines.avif')`,
                  backgroundSize: '300px',
                  backgroundRepeat: 'repeat',
                }}
                className="w-full h-[25%] bg-black relative overflow-hidden font-[AGENCYB] text-[30px] text-center"
              >
                {displayedPlayer.teamName.toUpperCase()}
              </div>

              {/* Player name */}
              <div className="font-[TUNGSTEN] text-[70px] text-center relative top-[-10px]">
                {displayedPlayer.playerName.toUpperCase()}
              </div>

              {/* Milestone bar */}
              <div
                style={{
                  backgroundImage: `url('/theme3assets/lines.avif')`,
                  backgroundSize: '300px',
                  backgroundRepeat: 'repeat',
                }}
                className="w-full h-[25%] bg-black absolute top-[133px] font-[AGENCYB] text-[38px] text-center"
              >
                <div className="relative top-[-7px]">
                  {displayedPlayer.milestone.toUpperCase()}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
});

Dom.displayName = 'Dom';
export default Dom;