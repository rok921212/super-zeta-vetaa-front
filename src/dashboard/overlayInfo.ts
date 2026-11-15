// Info overlay link (DisplayHud → Observer → Info): ONE link whose view AND
// theme the operator switches from the website — the Info tile's dropdown
// picks the view, the theme picker picks the theme — so a single OBS source can
// show any post-match / awards / pre-match / schedule view or ranking page in
// whichever built-in theme is selected.
//
// Sources, newest `stamp` wins (the same scheme as SWITCH FLAGS,
// Themes/shared/hooks/logoFlagSwitch.ts):
//   - localStorage, so an OBS reload paints the last pick on its first frame
//     (and outlives the local relay's short cache of the overlay-sync answer),
//   - the overlay-sync answer's `overlayInfo` (overlaySync.ts),
//   - the live 'overlayPage' push's `pageCmd.info`
//     (overlaySync.controller.js sendOverlayInfo).
//
// Rotation: the pick can instead be a list of views that the link plays one
// after another, every `intervalSec`, optionally shuffled. Nothing is sent
// while it plays: every overlay works out the current item from the
// rotation's `stamp` and its own clock, so all sources on one PC show the
// same item and change together. A shuffle is seeded by `stamp` and the loop
// number, so every source shuffles the same way, with a new order each loop.

import { useSyncExternalStore } from 'react';
import { holdRankingPageLocal } from '../Themes/shared/hooks/rankingPager.ts';

/** The `view` query value that marks an Info link. */
export const INFO_LINK_VIEW = 'Info';
const STORAGE_KEY = 'overlayInfo:v1';
const VIEW_RE = /^[A-Za-z0-9_]{1,40}$/;
const THEME_RE = /^Theme\d{1,3}$/;

export interface InfoRotationItem { view: string; theme: string | null; page: number | null }
export interface InfoRotation { items: InfoRotationItem[]; shuffle: boolean; intervalSec: number; stamp: number }

export interface OverlayInfo {
  view: string | null;
  theme: string | null;
  /** True while a rotation is playing. */
  rotating: boolean;
}

let base: { view: string | null; theme: string | null } = { view: null, theme: null };
let rotation: InfoRotation | null = null;
let infoStamp = -1;
let info: OverlayInfo = { view: null, theme: null, rotating: false };
let lastItem: InfoRotationItem | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Set<() => void>();

const cleanTheme = (t: unknown): string | null => (typeof t === 'string' && THEME_RE.test(t) ? t : null);

function cleanRotation(raw: unknown): InfoRotation | null {
  const r = raw as Partial<InfoRotation> | null;
  if (!r || !Array.isArray(r.items) || r.items.length < 2) return null;
  const items: InfoRotationItem[] = [];
  for (const it of r.items as unknown[]) {
    const i = it as { view?: unknown; theme?: unknown; page?: unknown } | null;
    if (!i || typeof i.view !== 'string' || !VIEW_RE.test(i.view)) return null;
    const page = Number.isInteger(i.page) && (i.page as number) >= 0 ? (i.page as number) : null;
    items.push({ view: i.view, theme: cleanTheme(i.theme), page });
  }
  const intervalSec = Number(r.intervalSec);
  if (!Number.isFinite(intervalSec) || intervalSec < 10) return null;
  return { items, shuffle: r.shuffle === true, intervalSec, stamp: Number(r.stamp) || 0 };
}

// ── Rotation order ───────────────────────────────────────────────────────
// mulberry32: tiny seeded PRNG, identical on every source.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loopOrder(r: InfoRotation, loop: number): number[] {
  const order = r.items.map((_, i) => i);
  if (!r.shuffle) return order;
  const rand = rng((r.stamp % 2147483647) + loop * 7919);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** The item index on screen at `now`, and when the next change is due. */
function currentSlot(r: InfoRotation, now: number): { index: number; nextAt: number } {
  const n = r.items.length;
  const ms = r.intervalSec * 1000;
  const slot = Math.max(0, Math.floor((now - r.stamp) / ms));
  const loop = Math.floor(slot / n);
  const pos = slot % n;
  let order = loopOrder(r, loop);
  // A new shuffled loop never opens on the item the last loop closed on.
  if (r.shuffle && loop > 0 && n > 1) {
    const prev = loopOrder(r, loop - 1);
    if (order[0] === prev[n - 1]) order = [order[1], order[0], ...order.slice(2)];
  }
  return { index: order[pos], nextAt: r.stamp + (slot + 1) * ms };
}

// ── Snapshot ─────────────────────────────────────────────────────────────
function recompute(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  let next: OverlayInfo;
  if (rotation) {
    const { index, nextAt } = currentSlot(rotation, Date.now());
    const item = rotation.items[index];
    // A ranking item holds its page (null = the ranking's own page timer),
    // before subscribers re-render so the ranking mounts on that page.
    if (item !== lastItem) holdRankingPageLocal(item.view, item.page);
    lastItem = item;
    next = { view: item.view, theme: item.theme || base.theme, rotating: true };
    if (subscribers.size > 0) timer = setTimeout(recompute, Math.max(50, nextAt - Date.now() + 20));
  } else {
    lastItem = null;
    next = { view: base.view, theme: base.theme, rotating: false };
  }
  if (next.view === info.view && next.theme === info.theme && next.rotating === info.rotating) return;
  info = next;
  subscribers.forEach((fn) => fn());
}

try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (stored && typeof stored.view === 'string' && VIEW_RE.test(stored.view)) {
    base = { view: stored.view, theme: cleanTheme(stored.theme) };
    rotation = cleanRotation(stored.rotation);
    infoStamp = Number(stored.stamp) || 0;
  }
} catch { /* storage unavailable */ }
// First frame already on the right item; the timer starts with the first subscriber.
recompute();

/** Applies a `{ view, theme, stamp, rotation? }` answer or push; older than what is held is ignored. */
export function applyOverlayInfo(raw: unknown): void {
  const v = raw as { view?: unknown; theme?: unknown; stamp?: unknown; rotation?: unknown } | null;
  if (!v || typeof v.view !== 'string' || !VIEW_RE.test(v.view)) return;
  const stamp = Number(v.stamp) || 0;
  // A never-set account answers stamp 0: it only fills in when nothing is held.
  if (stamp < infoStamp || (stamp === 0 && base.view)) return;
  infoStamp = stamp;
  const theme = cleanTheme(v.theme);
  const rot = cleanRotation(v.rotation);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ view: v.view, theme, stamp, rotation: rot })); } catch { /* storage unavailable */ }
  base = { view: v.view, theme };
  rotation = rot;
  lastItem = null;
  recompute();
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  if (subscribers.size === 1) recompute(); // starts the rotation timer
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && timer) { clearTimeout(timer); timer = null; }
  };
}
const getInfo = () => info;

/** What an Info link shows now; null fields = the account has not picked one yet. */
export function useOverlayInfo(): OverlayInfo {
  return useSyncExternalStore(subscribe, getInfo, getInfo);
}
