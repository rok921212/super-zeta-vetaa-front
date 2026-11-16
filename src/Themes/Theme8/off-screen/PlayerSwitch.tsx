import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { playerPhoto } from '../../shared/playerPhoto.ts';

// PlayerSwitch — two-man rotation.
//
//   1) the FRONT player rises in
//   2) a moment later the BACK player rises in, behind and to the side
//   3) both hold
//   4) they leave in reverse: the back player drops out first, then the front
//   5) the next pair comes in — and so on
//
// Who shows: a pair is drawn at RANDOM from the players not yet shown in the
// current loop, so nobody repeats until everyone with a real photo has been
// on screen. Then the loop starts over (still avoiding the pair that was just
// shown). A refresh starts from a fresh random pair, never in roster order.
// Photo filtering and bad-image removal are unchanged.
//
// SWAP button (just BELOW the 1920×1080 canvas, never captured): changes the
// DEPTH, not the places. The left player always stands on the left and the
// right player on the right; the swap only changes which of them is in front.
// By default the left one is in front (full size, bright) and the right one is
// behind (smaller, darker). Swapped: the left one steps back — darker, smaller,
// behind — and the right one comes forward — brighter, bigger, on top.
// Animated live on the pair on screen, and remembered for every pair after it.
// Entry order is unchanged: the left player comes in first and leaves last.

interface Player {
  uId: string;
  playerName: string;
  picUrl?: string;
}

interface Team {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  teamFlag?: string;
  players: Player[];
}

interface MatchData {
  _id: string;
  matchId: string;
  userId: string;
  teams: Team[];
}

interface PlayerSwitchProps {
  matchData: MatchData | null;
  loading: boolean;
  error: string | null;
}

interface Entry {
  player: Player;
  team: Team;
}

/* ── timing (ms) ── */
const ENTER_MS = 1150; // one rise in (same feel as before)
const EXIT_MS = 950; // one drop out
const BACK_DELAY = 650; // back player follows the front one
const HOLD_MS = 4200; // both on screen, after the back player has landed
const EXIT_GAP = 350; // front leaves this long after the back one

/* ── layout (1920×1080) ── */
const IMG_W = 900;
const IMG_H = 1100;
const FRONT_LEFT = 360;
const BACK_LEFT = 820;
const BACK_SCALE = 0.86;

const SWAP_MS = 700;
const SWAP_KEY = 'playerSwitch.swapped';

const EASE_IN: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_SWAP: [number, number, number, number] = [0.65, 0, 0.25, 1];
const EASE_OUT: [number, number, number, number] = [0.7, 0, 0.84, 0];

/** Fisher–Yates shuffle (a copy). */
function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/*
  Stage of the current pair:
  0 both hidden (just mounted) · 1 front in · 2 back in (hold)
  3 back out · 4 front out
*/
type Stage = 0 | 1 | 2 | 3 | 4;

const PlayerSwitch: React.FC<PlayerSwitchProps> = ({ matchData, loading, error }) => {
  const [players, setPlayers] = useState<Entry[]>([]);
  const [badImages, setBadImages] = useState<Record<string, boolean>>({});

  const [pair, setPair] = useState<Entry[]>([]);
  const [pairId, setPairId] = useState(0);
  const [stage, setStage] = useState<Stage>(0);

  // Which of the pair stands in front: false = the first-drawn player.
  const [swapped, setSwapped] = useState<boolean>(() => {
    try { return localStorage.getItem(SWAP_KEY) === '1'; } catch { return false; }
  });
  // Draw order follows the swap halfway through it (so they pass each other
  // smoothly instead of jumping layers at the click).
  const [layerSwapped, setLayerSwapped] = useState(swapped);
  useEffect(() => {
    const t = window.setTimeout(() => setLayerSwapped(swapped), SWAP_MS / 2);
    return () => clearTimeout(t);
  }, [swapped]);

  const toggleSwap = () =>
    setSwapped((v) => {
      try { localStorage.setItem(SWAP_KEY, v ? '0' : '1'); } catch { /* storage blocked: this session only */ }
      return !v;
    });

  // Same filter as before: only real photos, minus the ones that failed to load.
  useEffect(() => {
    if (!matchData?.teams) return;

    const list: Entry[] = [];
    matchData.teams.forEach((team) => {
      team.players.forEach((player) => {
        const img = player.picUrl?.toLowerCase() || "";
        if (img && !img.includes("def_char") && !img.includes("default") && !badImages[player.uId]) {
          list.push({ player, team });
        }
      });
    });

    setPlayers(list);
  }, [matchData, badImages]);

  const removePlayer = (id: string) => {
    setBadImages((prev) => ({ ...prev, [id]: true }));
  };

  // ── Draw the next pair: random, no repeats until the loop is complete ─────
  const playersRef = useRef<Entry[]>([]);
  playersRef.current = players;
  const seenRef = useRef(new Set<string>()); // uIds shown in the current loop
  const lastPairRef = useRef<string[]>([]);

  const drawPair = useCallback((): Entry[] => {
    const all = playersRef.current;
    if (all.length === 0) return [];
    const want = Math.min(2, all.length);

    let pool = all.filter((e) => !seenRef.current.has(e.player.uId));
    const picked: Entry[] = shuffle(pool).slice(0, want);

    if (picked.length < want) {
      // Loop complete: start a new one. Fill the pair from everyone, avoiding
      // the pair just shown (and anyone already picked) where possible.
      seenRef.current.clear();
      const taken = new Set(picked.map((e) => e.player.uId));
      pool = all.filter((e) => !taken.has(e.player.uId));
      const fresh = pool.filter((e) => !lastPairRef.current.includes(e.player.uId));
      const fill = shuffle(fresh.length >= want - picked.length ? fresh : pool);
      picked.push(...fill.slice(0, want - picked.length));
    }

    picked.forEach((e) => seenRef.current.add(e.player.uId));
    lastPairRef.current = picked.map((e) => e.player.uId);
    return picked;
  }, []);

  // ── The cycle: enter front → enter back → hold → exit back → exit front ──
  const hasPlayers = players.length > 0;
  useEffect(() => {
    if (!hasPlayers) return;
    let cancelled = false;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !cancelled && fn(), ms));

    const run = () => {
      const next = drawPair();
      if (!next.length) return;
      const two = next.length > 1;
      setPair(next);
      setPairId((n) => n + 1);
      setStage(0);

      let t = 60; // let the hidden state paint first
      at(t, () => setStage(1)); // front in
      t += two ? BACK_DELAY : 0;
      at(t, () => setStage(2)); // back in
      t += ENTER_MS + HOLD_MS;
      at(t, () => setStage(3)); // back out
      t += two ? EXIT_GAP : 0;
      at(t, () => setStage(4)); // front out
      t += EXIT_MS;
      at(t, run); // next pair
    };

    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [hasPlayers, drawPair]);

  if (loading)
    return (
      <div className="w-[1920px] h-[1080px] bg-black text-white flex justify-center items-center">
        Loading...
      </div>
    );

  if (error)
    return (
      <div className="w-[1920px] h-[1080px] bg-black text-white flex justify-center items-center">
        {error}
      </div>
    );

  if (!pair.length) return null;

  const two = pair.length > 1;

  // Entry order and SIDE belong to the pair order: entry 0 is always on the
  // left, entry 1 on the right. Only the DEPTH (front / back) comes from the swap.
  const visibleOf = (i: number) => (i === 0 ? stage >= 1 && stage <= 3 : stage === 2);
  const leavingOf = (i: number) => (i === 0 ? stage >= 4 : stage >= 3);
  const isFrontOf = (i: number) => !two || (i === 0) !== swapped;

  const poseOf = (i: number) => {
    const front = isFrontOf(i);
    const shown = visibleOf(i);
    const leaving = leavingOf(i);
    // fixed sides: left slot / right slot (the right one enters from a little further right)
    const x = !two ? 460 - FRONT_LEFT : i === 0 ? 0 : BACK_LEFT - FRONT_LEFT + (shown ? 0 : 80);
    const scale = (front ? 1 : BACK_SCALE) * (shown ? 1 : 0.85);
    const tilt = i === 0 ? 5 : -5;
    return {
      y: shown ? 0 : 1200,
      opacity: shown ? 1 : 0,
      rotate: shown ? 0 : leaving ? -tilt : tilt,
      x,
      scale,
      filter: front ? 'brightness(1)' : 'brightness(0.82)',
    };
  };

  const transitionOf = (i: number) => {
    const leaving = leavingOf(i);
    const move = { duration: (leaving ? EXIT_MS : ENTER_MS) / 1000, ease: leaving ? EASE_OUT : EASE_IN };
    const swap = { duration: SWAP_MS / 1000, ease: EASE_SWAP };
    // while on screen, size and shade follow the swap's own timing
    return visibleOf(i) ? { ...move, scale: swap, filter: swap } : move;
  };

  const btn: React.CSSProperties = {
    position: 'absolute',
    top: 1100,
    left: 20,
    padding: '10px 16px',
    background: '#0B0B0E',
    color: '#FFFFFF',
    border: '2px solid #FFFFFF',
    fontFamily: "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif",
    fontWeight: 700,
    fontSize: 18,
    letterSpacing: '0.1em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ width: "1920px", height: "1080px", position: "relative", overflow: "visible" }}>
      <div style={{ width: "1920px", height: "1080px", position: "relative", overflow: "hidden", background: "transparent" }}>
        {pair.map((entry, i) => {
          const pose = poseOf(i);
          return (
            <motion.img
              key={`p-${pairId}-${i}-${entry.player.uId}`}
              src={playerPhoto(entry.player.picUrl)}
              onError={() => removePlayer(entry.player.uId)}
              initial={{ ...pose, y: 1200, opacity: 0 }}
              animate={pose}
              transition={transitionOf(i)}
              style={{
                position: "absolute",
                bottom: "-100px",
                left: `${FRONT_LEFT}px`,
                // FORCE SAME SIZE
                width: `${IMG_W}px`,
                height: `${IMG_H}px`,
                maxWidth: "none",
                objectFit: "contain",
                transformOrigin: "50% 100%",
                zIndex: !two || (i === 0) !== layerSwapped ? 2 : 1,
              }}
            />
          );
        })}
      </div>

      {/* reposition — BELOW the 1920×1080 canvas, never captured */}
      <button type="button" onClick={toggleSwap} style={btn}>
        ⇄ SWAP FRONT / BACK {two ? '' : '(needs two players)'}
      </button>
    </div>
  );
};

export default PlayerSwitch;