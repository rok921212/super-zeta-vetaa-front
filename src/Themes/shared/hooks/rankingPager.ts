// Paging for the ranking overlays (Match Data, Overall Data).
//
// A ranking shows its teams a page at a time and flips pages on a timer. The
// operator can also pick the page from DisplayHud: that click reaches every
// open overlay as a `publicDataInvalidated` event with reason 'overlayPage'
// (overlaySync.controller.js sendOverlayPage) — the one JSON control event the
// local relay forwards verbatim, the same route SYNC OVERLAY uses. A page
// number holds that page; `null` hands the ranking back to the timer.
//
// `rankingPageCount` is the one place that knows how many pages each theme
// cuts a ranking into, so the buttons on DisplayHud always match the overlay.

import { useEffect, useRef, useState } from 'react';
import SocketManager from '../../../dashboard/socketManager.tsx';

export type RankingView = 'MatchData' | 'OverAllData';

export function rankingPageCount(theme: string, view: RankingView, teamCount: number): number {
  const n = Math.max(0, Math.floor(teamCount) || 0);
  const per = (size: number) => Math.max(1, Math.ceil(n / size));
  if (view === 'OverAllData') {
    if (theme === 'Theme4') return per(16);
    if (theme === 'Theme5') return per(22);
    return per(8);
  }
  switch (theme) {
    // Winner + ranks 2–4, then 9 rows a page.
    case 'Theme4': return n > 22 ? 3 : n > 13 ? 2 : 1;
    // Winner + ranks 2–7, then 9 rows a page.
    case 'Theme6': return n > 25 ? 3 : n > 16 ? 2 : 1;
    case 'Theme5': return per(11);
    // Winner, then 10 rows a page.
    case 'Theme7': return Math.max(1, Math.ceil((n - 1) / 10));
    // Winner + ranks 2–11, then one page with the rest.
    default: return n > 11 ? 2 : 1;
  }
}

/** The zero-based page to show: the timer's, or the one held from DisplayHud. */
export function useRankingPager(view: RankingView, totalPages: number, intervalMs: number): number {
  const pages = Math.max(1, totalPages);
  const [auto, setAuto] = useState(0);
  const [held, setHeld] = useState<number | null>(null);
  const stampRef = useRef(0);

  useEffect(() => {
    if (held !== null || pages <= 1) return;
    const interval = setInterval(() => setAuto(prev => (prev + 1) % pages), intervalMs);
    return () => clearInterval(interval);
  }, [held, pages, intervalMs]);

  useEffect(() => {
    const sock = SocketManager.getInstance().connect();
    const onCommand = (msg?: { reason?: string; pageCmd?: { view?: string; page?: number | null; stamp?: number } }) => {
      const cmd = msg?.reason === 'overlayPage' ? msg.pageCmd : null;
      if (!cmd || cmd.view !== view) return;
      const stamp = Number(cmd.stamp) || 0;
      if (stamp < stampRef.current) return;
      stampRef.current = stamp;
      if (cmd.page === null || cmd.page === undefined) {
        // Back to the timer, carrying on from the page that was held.
        setHeld(prev => {
          if (prev !== null) setAuto(prev);
          return null;
        });
      } else if (Number.isInteger(cmd.page) && cmd.page >= 0) {
        setHeld(cmd.page);
      }
    };
    sock.on('publicDataInvalidated', onCommand);
    return () => { sock.off('publicDataInvalidated', onCommand); };
  }, [view]);

  return held !== null ? Math.min(held, pages - 1) : auto % pages;
}
