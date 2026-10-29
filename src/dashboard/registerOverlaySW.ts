// Registers front/public/overlay-sw.js (the overlay asset cache), scoped to
// the overlay routes only: /public/ (themes) and /o/ (Designer). Called once
// from PublicThemeRenderer and from OverlayRuntime.
//
// The service worker cache-firsts the app shell + <img>/font assets so a hard
// OBS Browser Source reload paints branding / logos / art from disk even with
// no network. It never touches the data path (/api, /public/bulk, /socket.io).
//
// Secure-context gate: a service worker needs https OR a localhost/127.0.0.1
// origin. On a plain http://<LAN-IP> host `navigator.serviceWorker` is simply
// absent, so this no-ops there and the overlay still works — it just loses the
// offline asset cache. `?nosw=1` force-unregisters as an escape hatch.

export function registerOverlaySW(): void {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // /public/* = theme overlays, /o/* = Designer overlays.
    const scope = ['/public/', '/o/'].find((s) => window.location.pathname.startsWith(s));
    if (!scope) return;

    if (new URLSearchParams(window.location.search).get('nosw') === '1') {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => undefined);
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register('/overlay-sw.js', { scope })
        .catch((err) => console.warn('[overlay-sw] register failed', err));
    };
    // The overlay routes are lazy chunks, so this usually runs after `load`
    // has already fired; waiting for it then meant never registering.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  } catch (err) {
    console.warn('[overlay-sw] unavailable', err);
  }
}
