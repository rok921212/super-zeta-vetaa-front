// Hide On-air overlays (Ctrl+Shift+F8 by default in the desktop app). The desktop app posts
// the flag to the local relay, which tells every socket on it as
// `overlayHidden` (desktop-app/relay/server.cjs; a socket that connects while
// hidden gets it on connect). Only the live match views obey it: a page passes
// whether it is one (`onAir`), and a post-match, awards or pre-match page
// stays up. An overlay page served through the relay — an OBS Browser Source
// — fades out and back in; nothing unmounts, so every overlay keeps its state.
// On the cloud socket the event never comes and the page stays shown.

import { useEffect, useRef } from 'react';
import SocketManager from './socketManager.tsx';
import { ONAIR_VIEW_KEYS } from './overlayViews.ts';

const FADE_MS = 250;

/** Library categories of Designer designs that are On-air (live match) graphics. */
export const ONAIR_DESIGN_CATEGORIES: ReadonlySet<string> = new Set([
  'lower-thirds', 'player-cards', 'team-cards', 'kill-feed', 'match-statistics',
]);

export interface OverlayHiddenMsg { hidden?: boolean; scope?: string }

/** Whether a page should be faded for this message. A missing scope (an older relay) means On-air. */
export function shouldHide(msg: OverlayHiddenMsg | null | undefined, onAir: boolean): boolean {
  if (!msg?.hidden) return false;
  return msg.scope === 'all' || onAir;
}

/** Built-in theme page: is this view one of the On-air views? */
export function isOnAirView(view: string | null | undefined): boolean {
  return !!view && ONAIR_VIEW_KEYS.has(view);
}

/**
 * Designer page: `?onair=1|0` in the link wins; otherwise the design's
 * library category decides. An uncategorised design counts as On-air, which
 * is what the hotkey did for every design before it was scoped.
 */
export function isOnAirDesign(categoryId: string | null | undefined, onairParam: string | null): boolean {
  if (onairParam === '1') return true;
  if (onairParam === '0') return false;
  if (!categoryId) return true;
  return ONAIR_DESIGN_CATEGORIES.has(categoryId);
}

export function useRelayOverlayHidden(onAir: boolean): void {
  const last = useRef<OverlayHiddenMsg | null>(null);
  const onAirRef = useRef(onAir);
  const apply = () => {
    const body = document.body;
    body.style.transition = `opacity ${FADE_MS}ms ease`;
    body.style.opacity = shouldHide(last.current, onAirRef.current) ? '0' : '';
  };

  useEffect(() => {
    const onHidden = (msg?: OverlayHiddenMsg) => {
      last.current = msg || null;
      apply();
    };
    const socket = SocketManager.getInstance().connect();
    socket.on('overlayHidden', onHidden);
    return () => {
      socket.off('overlayHidden', onHidden);
      document.body.style.transition = '';
      document.body.style.opacity = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The page switched view (page buttons) while hidden: a post-match view
  // comes back, a newly chosen On-air view fades.
  useEffect(() => {
    onAirRef.current = onAir;
    if (last.current) apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAir]);
}
