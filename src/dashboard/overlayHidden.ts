// Hide all overlays (Ctrl+Alt+F8 in the desktop app). The desktop app posts
// the flag to the local relay, which tells every socket on it as
// `overlayHidden` (desktop-app/relay/server.cjs; a socket that connects while
// hidden gets it on connect). An overlay page served through the relay — an
// OBS Browser Source — fades out and back in; nothing unmounts, so every
// overlay keeps its state. On the cloud socket the event never comes and the
// page stays shown.

import { useEffect } from 'react';
import SocketManager from './socketManager.tsx';

const FADE_MS = 250;

export function useRelayOverlayHidden(): void {
  useEffect(() => {
    const body = document.body;
    const onHidden = (msg?: { hidden?: boolean }) => {
      const hidden = !!msg?.hidden;
      body.style.transition = `opacity ${FADE_MS}ms ease`;
      body.style.opacity = hidden ? '0' : '';
    };
    const socket = SocketManager.getInstance().connect();
    socket.on('overlayHidden', onHidden);
    return () => {
      socket.off('overlayHidden', onHidden);
      body.style.transition = '';
      body.style.opacity = '';
    };
  }, []);
}
