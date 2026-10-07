// Photoshop-style layer effects -> CSS (pure). Applied by the renderer on the
// element's content box, so they work on every element type — shapes, text,
// images, whole groups and built-in theme graphics.
//
//   dropShadow / outerGlow  -> filter: drop-shadow()   (follows the real alpha shape)
//   innerShadow / innerGlow -> inset box-shadow on a top layer (box / rounded box)
//   stroke                  -> outline (outside/center) or inset box-shadow (inside)
//   blur                    -> filter: blur()
//   colorOverlay / gradientOverlay -> an overlay layer with mix-blend-mode,
//                              masked to the content (see overlayStyles)

import type React from 'react';
import type { Effect, LayoutElement } from '../schema/layoutTypes.ts';
import { gradientCss } from './styleToCss.ts';

const hexA = (color: string | undefined, opacity: number | undefined, fallback = '#000000'): string => {
  const c = color || fallback;
  const a = opacity ?? 1;
  if (a >= 1) return c;
  const m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  }
  return c; // rgba()/named: opacity already expressed or not applicable
};

export interface EffectsCss {
  /** On the content box. */
  filter?: string;
  outline?: string;
  outlineOffset?: string;
  mixBlendMode?: React.CSSProperties['mixBlendMode'];
  /** Overlay layers drawn on top of the content, clipped to it. */
  overlays: React.CSSProperties[];
}

const on = (fx: Effect) => fx.enabled !== false;

export function effectsToCss(el: Pick<LayoutElement, 'effects' | 'style'>): EffectsCss {
  const out: EffectsCss = { overlays: [] };
  const filters: string[] = [];
  const shadows: string[] = [];
  for (const fx of (el.effects || []).filter(on)) {
    const col = hexA(fx.color, fx.opacity);
    switch (fx.type) {
      case 'dropShadow':
        filters.push(`drop-shadow(${fx.x ?? 0}px ${fx.y ?? 6}px ${fx.blur ?? 12}px ${hexA(fx.color, fx.opacity ?? 0.6)})`);
        break;
      case 'outerGlow':
        filters.push(`drop-shadow(0 0 ${fx.size ?? fx.blur ?? 16}px ${hexA(fx.color || '#facc15', fx.opacity ?? 0.9)})`);
        break;
      case 'innerShadow':
        shadows.push(`inset ${fx.x ?? 0}px ${fx.y ?? 4}px ${fx.blur ?? 10}px ${fx.spread ?? 0}px ${hexA(fx.color, fx.opacity ?? 0.6)}`);
        break;
      case 'innerGlow':
        shadows.push(`inset 0 0 ${fx.size ?? fx.blur ?? 16}px ${fx.spread ?? 0}px ${hexA(fx.color || '#ffffff', fx.opacity ?? 0.8)}`);
        break;
      case 'stroke': {
        const size = fx.size ?? 2;
        if (fx.position === 'inside') shadows.push(`inset 0 0 0 ${size}px ${col}`);
        else {
          out.outline = `${size}px solid ${col}`;
          out.outlineOffset = fx.position === 'center' ? `${-size / 2}px` : '0px';
        }
        break;
      }
      case 'blur':
        filters.push(`blur(${fx.blur ?? fx.size ?? 4}px)`);
        break;
      case 'colorOverlay':
        out.overlays.push({ background: fx.color || '#e11d2e', opacity: fx.opacity ?? 1, mixBlendMode: (fx.blendMode || 'normal') as any });
        break;
      case 'gradientOverlay': {
        const g = gradientCss(fx.gradient) || 'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(0,0,0,0.35))';
        out.overlays.push({ background: g, opacity: fx.opacity ?? 1, mixBlendMode: (fx.blendMode || 'normal') as any });
        break;
      }
      default:
        break;
    }
  }
  if (filters.length) out.filter = filters.join(' ');
  // Inset shadows / inside stroke go on a TOP layer: an inset box-shadow on the
  // wrapper would be painted over by the element's own background.
  if (shadows.length) out.overlays.unshift({ boxShadow: shadows.join(', ') });
  const blend = el.style?.blendMode;
  if (typeof blend === 'string' && blend !== 'normal') out.mixBlendMode = blend as React.CSSProperties['mixBlendMode'];
  return out;
}

export const hasEffects = (el: Pick<LayoutElement, 'effects' | 'style'>) =>
  !!(el.effects && el.effects.some(on)) || (typeof el.style?.blendMode === 'string' && el.style.blendMode !== 'normal');

/** Sensible defaults for a newly added effect. */
export function defaultEffect(type: Effect['type']): Effect {
  switch (type) {
    case 'dropShadow': return { type, enabled: true, color: '#000000', opacity: 0.6, x: 0, y: 8, blur: 18 };
    case 'innerShadow': return { type, enabled: true, color: '#000000', opacity: 0.5, x: 0, y: 4, blur: 10 };
    case 'outerGlow': return { type, enabled: true, color: '#facc15', opacity: 0.9, size: 18 };
    case 'innerGlow': return { type, enabled: true, color: '#ffffff', opacity: 0.6, size: 14 };
    case 'stroke': return { type, enabled: true, color: '#ffffff', opacity: 1, size: 3, position: 'outside' };
    case 'colorOverlay': return { type, enabled: true, color: '#e11d2e', opacity: 0.5, blendMode: 'multiply' };
    case 'gradientOverlay': return { type, enabled: true, opacity: 0.6, blendMode: 'overlay', gradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] } };
    case 'blur': return { type, enabled: true, blur: 6 };
    default: return { type, enabled: true };
  }
}
