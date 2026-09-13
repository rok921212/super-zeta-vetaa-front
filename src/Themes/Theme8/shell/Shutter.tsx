import React, { useEffect, useState } from 'react';
import { EASE_IN, DUR_IN, DUR_OUT } from './tokens';

/* ============================================================================
   Shutter — a mechanical clip-path wipe for entrances/exits. Opens along one
   axis (like a machine cover sliding). Honours prefers-reduced-motion:
   collapses to a 120ms opacity cut (matching Theme1 Alerts' existing
   `transition:{duration:0}` philosophy). No infinite animation.
   ========================================================================== */

interface ShutterProps {
  show?: boolean;    // omit -> animates in once on mount
  axis?: 'x' | 'y';
  durIn?: number;
  durOut?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function prefersReduced(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const Shutter: React.FC<ShutterProps> = ({
  show = true,
  axis = 'x',
  durIn = DUR_IN,
  durOut = DUR_OUT,
  children,
  className,
  style,
}) => {
  const reduced = prefersReduced();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const open = show && mounted;

  const closedClip = axis === 'x' ? 'inset(0 100% 0 0)' : 'inset(0 0 100% 0)';
  const openClip = 'inset(0 0 0 0)';
  const clip = reduced ? openClip : open ? openClip : closedClip;

  return (
    <div
      className={className}
      style={{
        clipPath: clip,
        WebkitClipPath: clip,
        opacity: reduced ? (show ? 1 : 0) : 1,
        transition: reduced
          ? 'opacity 120ms linear'
          : `clip-path ${show ? durIn : durOut}ms ${EASE_IN}, -webkit-clip-path ${show ? durIn : durOut}ms ${EASE_IN}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default Shutter;
