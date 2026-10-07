// Animation presets -> framer-motion props. Presets are names from the shared
// schema's fixed list; nothing user-supplied is ever executed.

import type { AnimationStep, AnimationPreset, Easing } from '../schema/layoutTypes.ts';

type Target = Record<string, any>;

const OFF = 60;

const ENTER: Record<AnimationPreset, { from: Target; to: Target }> = {
  none: { from: {}, to: {} },
  fade: { from: { opacity: 0 }, to: { opacity: 1 } },
  slideLeft: { from: { x: -OFF, opacity: 0 }, to: { x: 0, opacity: 1 } },
  slideRight: { from: { x: OFF, opacity: 0 }, to: { x: 0, opacity: 1 } },
  slideUp: { from: { y: OFF, opacity: 0 }, to: { y: 0, opacity: 1 } },
  slideDown: { from: { y: -OFF, opacity: 0 }, to: { y: 0, opacity: 1 } },
  scale: { from: { scale: 0.6, opacity: 0 }, to: { scale: 1, opacity: 1 } },
  pop: { from: { scale: 0.3, opacity: 0 }, to: { scale: 1, opacity: 1 } },
  wipe: { from: { clipPath: 'inset(0 100% 0 0)' }, to: { clipPath: 'inset(0 0% 0 0)' } },
  bounce: { from: { y: -80, opacity: 0 }, to: { y: 0, opacity: 1 } },
  pulse: { from: { scale: 1 }, to: { scale: [1, 1.08, 1] } },
  flash: { from: { opacity: 1 }, to: { opacity: [1, 0.2, 1, 0.2, 1] } },
};

const EASE: Partial<Record<Easing, any>> = {
  linear: 'linear',
  easeIn: 'easeIn',
  easeOut: 'easeOut',
  easeInOut: 'easeInOut',
  backOut: 'backOut',
  anticipate: 'anticipate',
};

export function transitionOf(step: AnimationStep | undefined): Target {
  if (!step) return { duration: 0 };
  const t: Target = {
    duration: (step.duration ?? 400) / 1000,
    delay: (step.delay ?? 0) / 1000,
    ease: EASE[step.easing || (step.preset === 'pop' ? 'backOut' : 'easeOut')] || 'easeOut',
  };
  if (step.preset === 'bounce') Object.assign(t, { type: 'spring', bounce: 0.5, ease: undefined });
  if (step.repeat) t.repeat = step.repeat;
  return t;
}

/** Props for a motion element with the given enter / exit steps. */
export function motionProps(enter?: AnimationStep, exit?: AnimationStep): Target {
  const e = enter && enter.preset !== 'none' ? ENTER[enter.preset] : null;
  const x = exit && exit.preset !== 'none' ? ENTER[exit.preset] : null;
  return {
    initial: e ? e.from : false,
    animate: e ? { ...e.to, transition: transitionOf(enter) } : { opacity: 1 },
    exit: x ? { ...x.from, transition: transitionOf(exit) } : undefined,
  };
}

/** An onChange "kick" (re-mounted on every change of the watched value). */
export function changeProps(step?: AnimationStep): Target | null {
  if (!step || step.preset === 'none') return null;
  const p = ENTER[step.preset];
  return { initial: p.from, animate: { ...p.to, transition: transitionOf(step) } };
}
