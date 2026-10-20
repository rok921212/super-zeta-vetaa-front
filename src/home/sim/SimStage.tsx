// The 1920×1080 broadcast canvas, scaled down to its container's width. What
// is inside renders at full size exactly as in OBS; only the frame shrinks.

import React, { useLayoutEffect, useRef, useState } from 'react';

const W = 1920;
const H = 1080;

export const SimStage: React.FC<{ children: React.ReactNode; tag: string; background?: string; live?: boolean }> = ({ children, tag, background, live }) => {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setScale(el.getBoundingClientRect().width / W);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="relative">
      <div
        ref={box}
        className="relative w-full overflow-hidden bg-[#050607] ring-1 ring-[#24262B]"
        style={{ aspectRatio: `${W} / ${H}` }}
      >
        <div
          style={{
            position: 'absolute', left: 0, top: 0, width: W, height: H, overflow: 'hidden',
            transform: `scale(${scale})`, transformOrigin: '0 0', visibility: scale ? 'visible' : 'hidden',
            background: background
              ? `center / cover no-repeat url("${background}")`
              : 'radial-gradient(ellipse at 30% 20%, #1d2430 0%, #0d1117 55%, #050607 100%)',
          }}
        >
          {!background && (
            // A faint grid, so a transparent overlay still reads as "on a screen".
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: '96px 96px' }} />
          )}
          <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
        </div>
        <div className="pointer-events-none absolute top-2 left-2 sm:top-3 sm:left-3 flex items-center gap-1.5 bg-black/70 px-2 py-1">
          <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-[#E11D2E] animate-pulse' : 'bg-[#55565C]'}`} />
          <span className="font-mono text-[9px] tracking-[0.15em] text-white/90">{tag}</span>
        </div>
      </div>
      <span className="pointer-events-none absolute -top-[1px] -left-[1px] w-5 h-5 border-t-2 border-l-2 border-[#E11D2E]" />
      <span className="pointer-events-none absolute -top-[1px] -right-[1px] w-5 h-5 border-t-2 border-r-2 border-[#E11D2E]" />
      <span className="pointer-events-none absolute -bottom-[1px] -left-[1px] w-5 h-5 border-b-2 border-l-2 border-[#E11D2E]" />
      <span className="pointer-events-none absolute -bottom-[1px] -right-[1px] w-5 h-5 border-b-2 border-r-2 border-[#E11D2E]" />
    </div>
  );
};

export default SimStage;
