// Gradient editing (pure). A gradient is the schema's `{ type, angle, stops }`
// with 2 to 16 stops; a stop's transparency lives in its colour (rgba).

import type { Gradient, GradientStop } from '../schema/layoutTypes.ts';
import { mixColors } from './color.ts';

export const MIN_STOPS = 2;
export const MAX_STOPS = 16;

const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
const sorted = (stops: GradientStop[]) => [...stops].sort((a, b) => a.offset - b.offset);
/** A stop's colour for editing maths; one that follows data uses a neutral stand-in. */
export const stopColor = (s: GradientStop): string => (typeof s.color === 'string' ? s.color : '#888888');

/** A two-stop gradient that starts from the colour the layer already has. */
export function defaultGradient(from?: string | null, to = '#111827'): Gradient {
  return { type: 'linear', angle: 90, stops: [{ offset: 0, color: from || '#e11d2e' }, { offset: 1, color: to }] };
}

/** The colour the gradient shows at `offset` (0..1). */
export function colorAt(g: Gradient, offset: number): string {
  const s = sorted(g.stops);
  if (!s.length) return '#000000';
  if (offset <= s[0].offset) return stopColor(s[0]);
  if (offset >= s[s.length - 1].offset) return stopColor(s[s.length - 1]);
  for (let i = 1; i < s.length; i++) {
    if (offset <= s[i].offset) {
      const span = s[i].offset - s[i - 1].offset;
      return mixColors(stopColor(s[i - 1]), stopColor(s[i]), span > 0 ? (offset - s[i - 1].offset) / span : 0);
    }
  }
  return stopColor(s[s.length - 1]);
}

/** Add a stop at `offset` with the colour already there; returns the new gradient and the stop's index. */
export function addStop(g: Gradient, offset: number): { gradient: Gradient; index: number } {
  if (g.stops.length >= MAX_STOPS) return { gradient: g, index: -1 };
  const stop = { offset: round(offset), color: colorAt(g, offset) };
  const stops = sorted([...g.stops, stop]);
  return { gradient: { ...g, stops }, index: stops.indexOf(stop) };
}

/** Remove a stop; a gradient never drops below two. */
export function removeStop(g: Gradient, index: number): Gradient {
  if (g.stops.length <= MIN_STOPS) return g;
  return { ...g, stops: g.stops.filter((_, i) => i !== index) };
}

/** Change one stop in place (its index is kept even when it is dragged past a neighbour). */
export function updateStop(g: Gradient, index: number, patch: Partial<GradientStop>): Gradient {
  return { ...g, stops: g.stops.map((s, i) => (i === index ? { ...s, ...patch, offset: round(patch.offset ?? s.offset) } : s)) };
}

export function reverseGradient(g: Gradient): Gradient {
  return { ...g, stops: sorted(g.stops.map((s) => ({ ...s, offset: round(1 - s.offset) }))) };
}

/** Stops in position order (what is saved once an edit is finished). */
export const normalizeGradient = (g: Gradient): Gradient => ({ ...g, stops: sorted(g.stops) });

const PRIMARY = { ref: 'tournament.primaryColor' };
const SECONDARY = { ref: 'tournament.secondaryColor' };

/**
 * Gradients made from the tournament's own colours. Their stops follow the
 * data, so a colour changed on the tournament shows in every design using
 * them at once, with nothing saved again.
 */
export const TOURNAMENT_GRADIENT_PRESETS: Array<{ name: string; gradient: Gradient }> = [
  { name: 'Primary → Black', gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: PRIMARY }, { offset: 1, color: '#000000' }] } },
  { name: 'Primary → Secondary', gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: PRIMARY }, { offset: 1, color: SECONDARY }] } },
  { name: 'Secondary → Black', gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: SECONDARY }, { offset: 1, color: '#000000' }] } },
  { name: 'Primary → Transparent', gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: PRIMARY }, { offset: 1, color: PRIMARY, opacity: 0 }] } },
];

export const GRADIENT_PRESETS: Array<{ name: string; gradient: Gradient }> = [
  { name: 'Ember', gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#f97316' }, { offset: 1, color: '#b91c1c' }] } },
  { name: 'Royal', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#7c3aed' }, { offset: 1, color: '#1e3a8a' }] } },
  { name: 'Ice', gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#38bdf8' }, { offset: 1, color: '#1d4ed8' }] } },
  { name: 'Gold', gradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#fde68a' }, { offset: 0.5, color: '#f59e0b' }, { offset: 1, color: '#92400e' }] } },
  { name: 'Steel', gradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#e5e7eb' }, { offset: 0.5, color: '#9ca3af' }, { offset: 1, color: '#374151' }] } },
  { name: 'Toxic', gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#a3e635' }, { offset: 1, color: '#047857' }] } },
  { name: 'Night', gradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#1f2937' }, { offset: 1, color: '#030712' }] } },
  { name: 'Fade to clear', gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: 'rgba(0, 0, 0, 0)' }] } },
  { name: 'Spotlight', gradient: { type: 'radial', stops: [{ offset: 0, color: 'rgba(255, 255, 255, 0.9)' }, { offset: 1, color: 'rgba(255, 255, 255, 0)' }] } },
  { name: 'Vignette', gradient: { type: 'radial', stops: [{ offset: 0.4, color: 'rgba(0, 0, 0, 0)' }, { offset: 1, color: 'rgba(0, 0, 0, 0.85)' }] } },
];
