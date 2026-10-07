import { useCallback, useEffect, useRef, useState } from 'react';
import { Player, MatchData, isRondoMap } from './unsortteams';
import { createRecallDetector, type RecallDetector } from '../../../overlayClient/detectors.ts';

// Shared PUBG "recall" (Rondo) detection + banner queue.
//
// A recall is a genuine dead → alive transition for a player whose team's
// mode can revive a fully-dead player. This used to be hand-rolled three
// times: Theme6/on-screen/LiveStats.tsx (AnimatedTeamRow), plus a
// byte-identical copy in Theme6/on-screen/Recall.tsx and
// Theme7/on-screen/Recall.tsx. This module is the one implementation.
//
// The DISPLAY treatment (row overlay vs full-screen card, timing) stays in
// the theme — that is presentation. Only the detection + one-at-a-time
// queueing live here.

export interface RecallEvent {
  /** Stable identity — uId. A recalled player gets a fresh subdoc _id from
   *  the backend, which would orphan an _id-keyed tracker. */
  id: string;
  playerName: string;
  /** team._id — lets a per-team-row consumer (LiveStats) filter the
   *  match-wide event stream down to its own row. */
  teamId: string;
  teamTag: string;
  teamLogo: string;
  /** Latest raw player record, for richer cards (picUrl, etc.). */
  player: Player;
}

/**
 * Per-player dead→alive detector.
 *
 * - Keyed by the STABLE identity (uId).
 * - First sight of a player only records state, never fires (no false
 *   banner on mount / roster join / socket reconnect / match switch).
 * - Gated on isRondoMap(match?.map) — the tracker still records state on
 *   non-recall maps so a later map flip can't retro-fire, but nothing is
 *   ever emitted.
 * - Trackers reset when match._id changes.
 *
 * Returns the recall transitions detected on the MOST RECENT matchData
 * change — normally an empty array (stable reference), occasionally 1+.
 * The caller owns display + queueing (see useRecallBanner).
 *
 * Detection lives in overlayClient/detectors.ts (shared with the overlay
 * engine's `recall` event stream); this hook is the React driver.
 */
export function useRecallEvents(
  matchData: MatchData | null | undefined,
  match: { map?: string; _id?: string } | null | undefined,
): RecallEvent[] {
  const detectorRef = useRef<RecallDetector | null>(null);
  if (!detectorRef.current) detectorRef.current = createRecallDetector(matchData?._id?.toString() ?? null);
  const [events, setEvents] = useState<RecallEvent[]>([]);

  const supportsRecall = isRondoMap(match?.map);

  useEffect(() => {
    if (!matchData) return;
    const detector = detectorRef.current!;
    const found = detector.process(matchData as any, match?.map) as RecallEvent[];
    if (detector.lastCallResetMatch) setEvents((prev) => (prev.length === 0 ? prev : []));
    if (found.length > 0) setEvents(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchData, supportsRecall]);

  return events;
}

export interface RecallBanner {
  /** bannerKey is monotonic — use it as the React `key` on the display
   *  component so the same player recalling twice still replays the anim. */
  current: (RecallEvent & { bannerKey: number }) | null;
  onDone: () => void;
}

/**
 * One-at-a-time queue for recall banners. No internal timer — the display
 * component owns its own animation lifecycle and calls onDone() when it is
 * finished (RecalledOverlay self-times; the Recall view runs a setTimeout).
 * Dedupes by player id against the current banner + the pending queue.
 */
export function useRecallBanner(incoming: RecallEvent[]): RecallBanner {
  const queueRef = useRef<RecallEvent[]>([]);
  const showingRef = useRef(false);
  const keyRef = useRef(0);
  const [current, setCurrent] = useState<(RecallEvent & { bannerKey: number }) | null>(null);

  const processQueue = useCallback(() => {
    if (showingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    showingRef.current = true;
    keyRef.current += 1;
    setCurrent({ ...next, bannerKey: keyRef.current });
  }, []);

  const onDone = useCallback(() => {
    setCurrent(null);
    showingRef.current = false;
    // small gap so back-to-back banners don't visually collide
    setTimeout(processQueue, 300);
  }, [processQueue]);

  useEffect(() => {
    if (incoming.length === 0) return;
    let queued = false;
    for (const ev of incoming) {
      const dup =
        current?.id === ev.id || queueRef.current.some((q) => q.id === ev.id);
      if (!dup) {
        queueRef.current.push(ev);
        queued = true;
      }
    }
    if (queued) processQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  return { current, onDone };
}
