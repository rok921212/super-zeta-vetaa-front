// Browse the ready-made animations: search, grouped by family, and each one
// plays in its own little thumbnail when you point at it — so 150 presets can
// be chosen by look, not by name.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutElement, TimelineClip } from '../schema/layoutTypes.ts';
import { applyFrame } from '../renderer/useTimeline.ts';
import { clipTime, sampleClip } from '../renderer/timeline.ts';
import { DEFAULT_OPTIONS, EFFECT_GROUP_LABEL, type EffectDef, type EffectGroup } from './animationEffects.ts';

// The thumbnail is a 320×180 "stage" drawn at 22 %: presets move in real pixels.
const STAGE = { w: 320, h: 180, scale: 0.22 };
const DEMO: LayoutElement = { id: 'demo', type: 'rect', x: 100, y: 60, w: 120, h: 60, style: { fill: '#fbbf24' } };
const BASE = { x: DEMO.x, y: DEMO.y, w: DEMO.w, h: DEMO.h, rotation: 0, opacity: 1 };

function Thumb({ effect, playing }: { effect: EffectDef; playing: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const clip = useMemo<TimelineClip>(() => {
    const built = effect.build(DEMO, { ...DEFAULT_OPTIONS, hold: 700 });
    return { id: 't', duration: built.duration, trigger: { type: 'enter' }, tracks: built.tracks, ...(built.loop ? { loop: true } : null) };
  }, [effect]);
  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    if (!playing) {
      // at rest: show the layer as it normally looks ("out" effects start from it, "in" effects end on it)
      applyFrame(node, BASE, effect.group === 'in' || effect.group === 'popup' ? sampleClip(clip, effect.group === 'popup' ? clip.duration / 2 : clip.duration, null) : null);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      // play, pause briefly at the end, and go again
      const total = clip.duration + 500;
      const e = (performance.now() - start) % total;
      const { t } = clipTime({ ...clip, loop: undefined }, Math.min(e, clip.duration));
      applyFrame(node, BASE, sampleClip(clip, clip.loop ? e % clip.duration : t, null));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, clip, effect.group]);
  return (
    <div className="relative shrink-0 overflow-hidden rounded bg-black/50" style={{ width: STAGE.w * STAGE.scale, height: STAGE.h * STAGE.scale }} aria-hidden>
      <div style={{ position: 'absolute', left: 0, top: 0, width: STAGE.w, height: STAGE.h, transform: `scale(${STAGE.scale})`, transformOrigin: '0 0' }}>
        <div ref={boxRef} style={{ position: 'absolute', left: DEMO.x, top: DEMO.y, width: DEMO.w, height: DEMO.h, borderRadius: 8, background: 'var(--tl-fill, #fbbf24)' }} />
      </div>
    </div>
  );
}

export function EffectGallery({ groups, value, onPick, onClose }: {
  /** The effects that fit the rule's trigger, by group. */
  groups: Array<{ group: EffectGroup; effects: EffectDef[] }>;
  value: string | null;
  onPick(effectId: string): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const shown = groups
    .map((g) => ({ ...g, effects: g.effects.filter((e) => !q || `${e.label} ${e.family} ${EFFECT_GROUP_LABEL[e.group]}`.toLowerCase().includes(q)) }))
    .filter((g) => g.effects.length > 0);
  const total = groups.reduce((n, g) => n + g.effects.length, 0);

  return (
    <div className="fixed inset-0 z-[112] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose} data-testid="effect-gallery">
      <div className="flex max-h-[86vh] w-full max-w-5xl flex-col rounded-lg border border-white/10 bg-neutral-900 text-slate-200 shadow-2xl" role="dialog" aria-label="Choose an animation" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="text-sm font-semibold text-slate-100">Choose an animation</div>
          <span className="text-[11px] text-slate-500">{total} that fit this rule · point at one to see it move</span>
          <input
            autoFocus
            className="ml-auto w-64 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-400/60"
            placeholder="Search — slide, bounce, wipe, flip…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }}
          />
          <button type="button" className="text-slate-500 hover:text-slate-200" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {shown.length === 0 && <div className="text-xs text-slate-500">Nothing matches “{query}”.</div>}
          {shown.map((g) => {
            const families = Array.from(new Set(g.effects.map((e) => e.family)));
            return (
              <div key={g.group} className="mb-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/90">{EFFECT_GROUP_LABEL[g.group]} <span className="text-slate-600">· {g.effects.length}</span></div>
                {families.map((fam) => (
                  <div key={fam} className="mb-2">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{fam}</div>
                    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {g.effects.filter((e) => e.family === fam).map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          data-effect={e.id}
                          onMouseEnter={() => setHover(e.id)}
                          onMouseLeave={() => setHover((h) => (h === e.id ? null : h))}
                          onFocus={() => setHover(e.id)}
                          onClick={() => { onPick(e.id); onClose(); }}
                          className={`flex items-center gap-2 rounded border p-1.5 text-left text-[11px] ${value === e.id ? 'border-amber-400/70 bg-amber-400/10 text-amber-100' : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-amber-400/40 hover:bg-white/[0.06]'}`}
                        >
                          <Thumb effect={e} playing={hover === e.id} />
                          <span className="min-w-0 flex-1 leading-tight">{e.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
