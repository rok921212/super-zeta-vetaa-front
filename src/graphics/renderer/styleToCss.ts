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
  const stops = g.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
  return g.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${g.angle ?? 90}deg, ${stops})`;
}

/** Box-level CSS (background, border, radius, shadow, filters). */
export function boxCss(style: Record<string, unknown>): React.CSSProperties {
  const css: React.CSSProperties = {};
  const grad = gradientCss(style.gradient as Gradient | undefined);
  if (grad) css.background = grad;
  else if (style.fill != null && style.fill !== '') css.background = String(style.fill);
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
