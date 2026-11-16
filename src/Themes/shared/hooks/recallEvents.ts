import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, MatchData, isRondoMap } from './unsortteams';
import {
  createRecallDetector,
  killFeedList,
  recallsUsedFromKillfeed,
  type KillFeedEntry,
  type RecallDetector,
} from '../../../overlayClient/detectors.ts';
import { RELAY_ORIGIN, isOverlayRoute } from '../../../login/api.tsx';

// The killfeed (whole game so far) is read through the desktop relay only:
// local traffic, no cloud. 5 s is plenty — live recalls are counted at once
// by the dead→alive tracker; the feed only fills in what the overlay missed.
const RECALL_FEED_POLL_MS = 5_000;

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
  teamFlag?: string;
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

export interface RecallsUsed {
  /** Rondo only — the pip is hidden elsewhere. */
  on: boolean;
  /** uId -> recalls used this match. */
  used: Record<string, number>;
}

/**
 * Recalls used per player (Rondo), for the "recall left" pip.
 *
 * Two sources, the larger wins per player:
 *  - live: dead→alive transitions this overlay saw (`recallEvents`);
 *  - killfeed: deaths in the game's killfeed minus "dead right now"
 *    (recallsUsedFromKillfeed), which knows recalls made before the overlay
 *    was opened or refreshed.
 * Both reset on a match switch. Relay/game down = live counts only.
 */
export function useRecallsUsed(
  matchData: MatchData | null | undefined,
  match: { map?: string; _id?: string } | null | undefined,
  recallEvents: RecallEvent[],
): RecallsUsed {
  const isRondo = isRondoMap(match?.map);
  const currentMatchId = matchData?._id ? String(matchData._id) : null;

  // Live counts. Events already counted (or carried over from the previous
  // match) are skipped, so a match switch can't charge the old match's recall
  // to the new one.
  const [live, setLive] = useState<{ matchId: string | null; used: Record<string, number> }>({
    matchId: null,
    used: {},
  });
  const countedEventsRef = useRef<RecallEvent[] | null>(null);
  const lastMatchIdRef = useRef<string | null>(currentMatchId);
  useEffect(() => {
    const switched = lastMatchIdRef.current !== currentMatchId;
    lastMatchIdRef.current = currentMatchId;
    const fresh = !switched && recallEvents !== countedEventsRef.current;
    countedEventsRef.current = recallEvents;
    setLive((prev) => {
      const base = prev.matchId === currentMatchId ? prev.used : {};
      if (!fresh || recallEvents.length === 0) {
        return prev.matchId === currentMatchId ? prev : { matchId: currentMatchId, used: {} };
      }
      const used = { ...base };
      for (const e of recallEvents) used[e.id] = (used[e.id] || 0) + 1;
      return { matchId: currentMatchId, used };
    });
  }, [recallEvents, currentMatchId]);

  // Killfeed: keep the raw list (tagged with the match it was read for) and
  // judge "dead right now" against the latest matchData on every update.
  const [feed, setFeed] = useState<{ matchId: string | null; list: KillFeedEntry[] }>({
    matchId: null,
    list: [],
  });
  const matchIdRef = useRef(currentMatchId);
  matchIdRef.current = currentMatchId;
  const feedOn = isRondo && isOverlayRoute();
  useEffect(() => {
    if (!feedOn) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const forMatch = matchIdRef.current;
      try {
        if (forMatch) {
          const res = await fetch(`${RELAY_ORIGIN}/local/feed/kill-info`, { cache: 'no-store' });
          if (res.ok && !stopped && matchIdRef.current === forMatch) {
            const list = killFeedList(await res.json());
            if (!stopped) setFeed({ matchId: forMatch, list });
          }
        }
      } catch {
        // Relay or game feed down: live counts carry on; try again next tick.
      }
      if (!stopped) timer = setTimeout(poll, RECALL_FEED_POLL_MS);
    };
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [feedOn]);

  const fromFeed = useMemo(
    () => (feedOn && feed.matchId === currentMatchId ? recallsUsedFromKillfeed(feed.list, matchData as any) : {}),
    [feedOn, feed, currentMatchId, matchData]
  );

  return useMemo<RecallsUsed>(() => {
    const used: Record<string, number> = { ...fromFeed };
    if (live.matchId === currentMatchId) {
      for (const [id, n] of Object.entries(live.used)) used[id] = Math.max(used[id] || 0, n);
    }
    return { on: isRondo, used };
  }, [isRondo, fromFeed, live, currentMatchId]);
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
