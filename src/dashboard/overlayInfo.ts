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

import { useSyncExternalStore } from 'react';

/** The `view` query value that marks an Info link. */
export const INFO_LINK_VIEW = 'Info';
const STORAGE_KEY = 'overlayInfo:v1';
const VIEW_RE = /^[A-Za-z0-9_]{1,40}$/;
const THEME_RE = /^Theme\d{1,3}$/;

export interface OverlayInfo { view: string | null; theme: string | null }

let info: OverlayInfo = { view: null, theme: null };
let infoStamp = -1;
const subscribers = new Set<() => void>();

const cleanTheme = (t: unknown): string | null => (typeof t === 'string' && THEME_RE.test(t) ? t : null);

try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (stored && typeof stored.view === 'string' && VIEW_RE.test(stored.view)) {
    info = { view: stored.view, theme: cleanTheme(stored.theme) };
    infoStamp = Number(stored.stamp) || 0;
  }
} catch { /* storage unavailable */ }

/** Applies a `{ view, theme, stamp }` answer or push; older than what is held is ignored. */
export function applyOverlayInfo(raw: unknown): void {
  const v = raw as { view?: unknown; theme?: unknown; stamp?: unknown } | null;
  if (!v || typeof v.view !== 'string' || !VIEW_RE.test(v.view)) return;
  const stamp = Number(v.stamp) || 0;
  // A never-set account answers stamp 0: it only fills in when nothing is held.
  if (stamp < infoStamp || (stamp === 0 && info.view)) return;
  infoStamp = stamp;
  const theme = cleanTheme(v.theme);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ view: v.view, theme, stamp })); } catch { /* storage unavailable */ }
  if (v.view === info.view && theme === info.theme) return;
  info = { view: v.view, theme };
  subscribers.forEach((fn) => fn());
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
}
const getInfo = () => info;

/** What an Info link shows now; null fields = the account has not picked one yet. */
export function useOverlayInfo(): OverlayInfo {
  return useSyncExternalStore(subscribe, getInfo, getInfo);
}
