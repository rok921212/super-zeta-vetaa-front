// Resolved element style (tokens already substituted) -> React CSS.

import type React from 'react';
import type { Gradient } from '../schema/layoutTypes.ts';

const px = (v: unknown): string | undefined => {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return `${v}px`;
  return String(v);
};

export function gradientCss(g: Gradient | null | undefined): string | undefined {
  if (!g || !Array.isArray(g.stops) || g.stops.length < 2) return undefined;
  // Sorted by position: a stop dragged past its neighbour must not make the gradient fold back.
  // A stop still linked to data ({ ref }) here was not resolved: draw it see-through rather than break the gradient.
  const stops = [...g.stops].sort((a, b) => a.offset - b.offset).map((s) => `${typeof s.color === 'string' ? s.color : 'transparent'} ${Math.round(s.offset * 1000) / 10}%`).join(', ');
  return g.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${g.angle ?? 90}deg, ${stops})`;
}

const FILL_ANGLE: Record<string, number> = { right: 90, left: 270, up: 0, down: 180 };

/** Fill by data: how much of the box the fill covers, 0..1 (null = the whole box, no fill level set). */
export function fillLevel(style: Record<string, unknown>): number | null {
  if (style.fillValue == null || style.fillValue === '') return null;
  const value = Number(style.fillValue);
  if (!Number.isFinite(value)) return 0;
  const rawMax = style.fillMax == null || style.fillMax === '' ? 100 : Number(style.fillMax);
  const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 100;
  return Math.min(1, Math.max(0, value / max));
}

/** Box-level CSS (background, border, radius, shadow, filters). */
export function boxCss(style: Record<string, unknown>): React.CSSProperties {
  const css: React.CSSProperties = {};
  const grad = gradientCss(style.gradient as Gradient | undefined);
  const paint = grad || (style.fill != null && style.fill !== '' ? String(style.fill) : undefined);
  const level = fillLevel(style);
  if (level != null) {
    // The fill (or gradient) keeps its full size and is revealed up to the level, so a gradient
    // reads like a gauge filling up rather than being squeezed.
    const angle = FILL_ANGLE[String(style.fillDirection || 'right')] ?? 90;
    const pct = `${Math.round(level * 1000) / 10}%`;
    const track = style.fillTrack != null && style.fillTrack !== '' ? String(style.fillTrack) : '';
    if (track) {
      const cover = `linear-gradient(${angle}deg, transparent ${pct}, ${track} ${pct})`;
      css.background = paint ? `${cover}, ${paint}` : cover;
    } else {
      if (paint) css.background = paint;
      const mask = `linear-gradient(${angle}deg, #000 ${pct}, transparent ${pct})`;
      css.maskImage = mask;
      css.WebkitMaskImage = mask;
    }
  } else if (paint) css.background = paint;
  if (style.stroke) css.border = `${px(style.strokeWidth ?? 1)} solid ${String(style.stroke)}`;
  if (style.radius != null) css.borderRadius = px(style.radius);
  if (style.shadow) css.boxShadow = String(style.shadow);
  const filters: string[] = [];
  if (style.blur) filters.push(`blur(${px(style.blur)})`);
  if (style.grayscale) filters.push(`grayscale(${typeof style.grayscale === 'number' ? style.grayscale : 1})`);
  if (filters.length) css.filter = filters.join(' ');
  if (style.blendMode) css.mixBlendMode = String(style.blendMode) as any;
  if (style.overflow) css.overflow = String(style.overflow) as any;
  if (style.padding != null) css.padding = px(style.padding);
  if (style.opacity != null && typeof style.opacity === 'number') css.opacity = style.opacity;
  return css;
}

/** Typography CSS for text-bearing elements. */
export function textCss(style: Record<string, unknown>): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (style.color) css.color = String(style.color);
  if (style.fontFamily) css.fontFamily = String(style.fontFamily);
  if (style.fontSize != null) css.fontSize = px(style.fontSize);
  if (style.fontWeight != null) css.fontWeight = style.fontWeight as any;
  if (style.fontStyle) css.fontStyle = String(style.fontStyle);
  if (style.letterSpacing != null) css.letterSpacing = px(style.letterSpacing);
  if (style.lineHeight != null) css.lineHeight = typeof style.lineHeight === 'number' ? String(style.lineHeight) : String(style.lineHeight);
  if (style.textTransform) css.textTransform = String(style.textTransform) as any;
  if (style.textShadow) css.textShadow = String(style.textShadow);
  css.whiteSpace = (style.whiteSpace ? String(style.whiteSpace) : 'nowrap') as any;
  const align = String(style.align || 'left');
  const valign = String(style.valign || 'middle');
  css.display = 'flex';
  css.justifyContent = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
  css.alignItems = valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center';
  css.textAlign = align as any;
  return css;
}
