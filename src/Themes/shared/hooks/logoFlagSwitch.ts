// Team logo <-> team flag switcher, shared by every theme (TeamLogo /
// TeamLogoSvg) and the Designer's teamLogo element.
//
// One global clock: the phase is derived from wall time (Date.now() / 3 s),
// so every switcher on screen — and in every OBS browser source — flips at
// the same moment. A team with no real flag never subscribes and just shows
// its logo, exactly as before.
//
// The swap is a fade-through on the ONE existing element (fade out, swap src,
// fade in) using the Web Animations API. Nothing is added to the DOM and no
// inline style is written, so the caller's layout, classes and opacity
// (e.g. `opacity-40` watermarks) are untouched — the fade animates from the
// element's own computed opacity down to 0 and back.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

export const LOGO_FLAG_PERIOD_MS = 3000;
const FADE_MS = 350;

// --- global clock ----------------------------------------------------------
const phaseNow = () => Math.floor(Date.now() / LOGO_FLAG_PERIOD_MS) % 2 === 1; // true = flag
let phase = phaseNow();
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function tick() {
  phase = phaseNow();
  subscribers.forEach((fn) => fn());
  schedule();
}
function schedule() {
  // Re-align to the next wall-clock boundary each time so timers never drift apart.
  timer = setTimeout(tick, LOGO_FLAG_PERIOD_MS - (Date.now() % LOGO_FLAG_PERIOD_MS) + 5);
}
function subscribe(cb: () => void) {
  subscribers.add(cb);
  if (subscribers.size === 1) { phase = phaseNow(); schedule(); }
  return () => {
    subscribers.delete(cb);
    if (!subscribers.size && timer !== undefined) { clearTimeout(timer); timer = undefined; }
  };
}
const subscribeNone = () => () => {};
const getPhase = () => phase;
const getOff = () => false;

/** true while the global clock is in its "show flag" half. Off (false) when disabled. */
export function useLogoFlagPhase(enabled = true): boolean {
  return useSyncExternalStore(enabled ? subscribe : subscribeNone, enabled ? getPhase : getOff, getOff);
}

// --- flag filtering --------------------------------------------------------
/** The flag to alternate with, or '' — the built-in default flag placeholder counts as none. */
export function realFlag(flag: unknown): string {
  const v = typeof flag === 'string' ? flag.trim() : '';
  return v && !/(^|\/)def_flag\.\w+$/.test(v) ? v : '';
}

// --- per-element switcher --------------------------------------------------
export interface LogoFlagSwitch<T extends Element> {
  /** Attach to the rendered <img>/<image>. */
  ref: React.RefObject<T | null>;
  /** The flag URL while the flag is showing, else null (show the logo). */
  flagSrc: string | null;
  /** Call from the element's onError while flagSrc is showing: stops switching for that flag. */
  dropFlag: () => void;
}

export function useLogoFlagSwitch<T extends Element>(flagIn: unknown): LogoFlagSwitch<T> {
  const flag = realFlag(flagIn);
  const [brokenFlag, setBrokenFlag] = useState('');
  const active = !!flag && brokenFlag !== flag;
  const wantFlag = useLogoFlagPhase(active);
  const [showFlag, setShowFlag] = useState(false);
  const ref = useRef<T | null>(null);
  const fadedOut = useRef<Animation | null>(null);

  // Warm the browser cache so the swap mid-fade doesn't show a blank frame.
  useEffect(() => {
    if (!active) return;
    const img = new Image();
    img.src = flag;
  }, [active, flag]);

  // Phase changed: fade the current image out, then swap.
  useEffect(() => {
    const target = active && wantFlag;
    if (target === showFlag) return;
    const el = ref.current as (Element & { animate?: Element['animate'] }) | null;
    if (!el || typeof el.animate !== 'function') { setShowFlag(target); return; }
    const base = getComputedStyle(el).opacity || '1';
    const out = el.animate([{ opacity: base }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-in', fill: 'forwards' });
    let done = false;
    out.onfinish = () => { done = true; fadedOut.current = out; setShowFlag(target); };
    return () => { if (!done) out.cancel(); };
  }, [active, wantFlag, showFlag]);

  // Swapped: drop the held fade-out and fade the new image back in.
  useLayoutEffect(() => {
    const out = fadedOut.current;
    if (!out) return;
    fadedOut.current = null;
    out.cancel();
    const el = ref.current;
    if (!el || typeof (el as any).animate !== 'function') return;
    const base = getComputedStyle(el).opacity || '1';
    el.animate([{ opacity: 0 }, { opacity: base }], { duration: FADE_MS, easing: 'ease-out' });
  }, [showFlag]);

  return {
    ref,
    flagSrc: active && showFlag ? flag : null,
    dropFlag: () => setBrokenFlag(flag),
  };
}
