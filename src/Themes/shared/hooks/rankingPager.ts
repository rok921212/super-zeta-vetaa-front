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

import { useEffect, useSyncExternalStore } from 'react';
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

// ── Page state ───────────────────────────────────────────────────────────
// Kept here, outside any component, one entry per ranking: a page picked on
// DisplayHud remounts the ranking so its animation plays again (`replay`,
// used as the component's key by PublicThemeRenderer), and the remounted
// component has to come back up on the page that was picked.
interface PagerState {
  /** The page the timer is on. */
  auto: number;
  /** The page held from DisplayHud; null = on the timer. */
  held: number | null;
  /** Counts the pages picked on DisplayHud, the same page picked again too. */
  replay: number;
}

const state: Record<RankingView, PagerState> = {
  MatchData: { auto: 0, held: null, replay: 0 },
  OverAllData: { auto: 0, held: null, replay: 0 },
};
const lastStamp: Record<RankingView, number> = { MatchData: 0, OverAllData: 0 };
const subscribers = new Set<() => void>();
let listening = false;

const isRankingView = (view: unknown): view is RankingView => view === 'MatchData' || view === 'OverAllData';

function update(view: RankingView, patch: Partial<PagerState>) {
  state[view] = { ...state[view], ...patch };
  subscribers.forEach(notify => notify());
}

function onCommand(msg?: { reason?: string; pageCmd?: { view?: string; page?: number | null; stamp?: number } }) {
  const cmd = msg?.reason === 'overlayPage' ? msg.pageCmd : null;
  if (!cmd || !isRankingView(cmd.view)) return;
  const view = cmd.view;
  const stamp = Number(cmd.stamp) || 0;
  if (stamp < lastStamp[view]) return;
  lastStamp[view] = stamp;
  if (cmd.page === null || cmd.page === undefined) {
    // Back to the timer, carrying on from the page that was held.
    const { held } = state[view];
    if (held !== null) update(view, { held: null, auto: held });
  } else if (Number.isInteger(cmd.page) && cmd.page >= 0) {
    update(view, { held: cmd.page, replay: state[view].replay + 1 });
  }
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  // One listener for the page, on the shared socket that outlives every view.
  if (!listening) {
    listening = true;
    SocketManager.getInstance().connect().on('publicDataInvalidated', onCommand);
  }
  return () => { subscribers.delete(notify); };
}

/** The zero-based page to show: the timer's, or the one held from DisplayHud. */
export function useRankingPager(view: RankingView, totalPages: number, intervalMs: number): number {
  const pages = Math.max(1, totalPages);
  const { auto, held } = useSyncExternalStore(subscribe, () => state[view]);

  useEffect(() => {
    if (held !== null || pages <= 1) return;
    const interval = setInterval(() => update(view, { auto: (state[view].auto + 1) % pages }), intervalMs);
    return () => clearInterval(interval);
  }, [view, held, pages, intervalMs]);

  return held !== null ? Math.min(held, pages - 1) : auto % pages;
}

/**
 * A key for the ranking's component: it changes every time a page is picked
 * on DisplayHud, so the ranking is mounted again and plays its animation on
 * that page. 0 for every other view.
 */
export function useRankingReplay(view: string): number {
  const all = useSyncExternalStore(subscribe, () => (isRankingView(view) ? state[view] : null));
  return all ? all.replay : 0;
}
