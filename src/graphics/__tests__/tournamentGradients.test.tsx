// Gradients made from the tournament's colours: presets with data-linked
// stops, a stop's own opacity, live resolution, and old designs still loading.

import React from 'react';
import { render } from '@testing-library/react';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
import type { Gradient, LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { boxCss, gradientCss } from '../renderer/styleToCss.ts';
import { buildScope, resolveElementStyle, resolveGradient, withOpacity } from '../bindings/index.ts';
import { TOURNAMENT_GRADIENT_PRESETS } from '../editor/gradient.ts';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { teamSlotColor } from '../../Themes/shared/teamColor.ts';
import { teamColor } from '../bindings/local.ts';

const doc = (elements: LayoutElement[]) => ({ ...createEmptyLayout(), elements }) as LayoutDocument;
const rect = (gradient: Gradient): LayoutElement => ({ id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 50, style: { gradient } });
const preset = (name: string) => TOURNAMENT_GRADIENT_PRESETS.find((p) => p.name === name)!.gradient;
const scopeWith = (primaryColor: string, secondaryColor = '#0000ff') =>
  buildScope({ tournament: { primaryColor, secondaryColor } } as any, createEmptyLayout());

describe('tournament gradient presets', () => {
  test('there are the four brand presets, all valid layouts', () => {
    expect(TOURNAMENT_GRADIENT_PRESETS.map((p) => p.name)).toEqual(['Primary → Black', 'Primary → Secondary', 'Secondary → Black', 'Primary → Transparent']);
    for (const p of TOURNAMENT_GRADIENT_PRESETS) expect(validateLayout(doc([rect(p.gradient)])).errors).toEqual([]);
  });

  test('Primary → Black and Primary → Secondary resolve from the tournament', () => {
    const scope = scopeWith('#ff0000');
    expect(gradientCss(resolveGradient(preset('Primary → Black'), scope))).toBe('linear-gradient(90deg, #ff0000 0%, #000000 100%)');
    expect(gradientCss(resolveGradient(preset('Primary → Secondary'), scope))).toBe('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
  });

  test('Primary → Transparent fades the primary colour itself', () => {
    expect(gradientCss(resolveGradient(preset('Primary → Transparent'), scopeWith('#ff0000')))).toBe(
      'linear-gradient(90deg, #ff0000 0%, color-mix(in srgb, #ff0000 0%, transparent) 100%)'
    );
  });

  // jsdom drops gradient backgrounds from inline styles, so the render-time
  // path (resolveElementStyle -> boxCss, what LayoutRenderer draws) is checked.
  test('a new tournament colour shows on the next render, with nothing saved again', () => {
    const el = rect(preset('Primary → Black'));
    const drawn = (primary: string) => boxCss(resolveElementStyle(el, scopeWith(primary)).style).background;
    expect(drawn('#ff0000')).toBe('linear-gradient(90deg, #ff0000 0%, #000000 100%)');
    expect(drawn('#00ff00')).toBe('linear-gradient(90deg, #00ff00 0%, #000000 100%)');
    expect(el.style!.gradient).toEqual(preset('Primary → Black'));
  });

  test('the layout renders with a tournament gradient', () => {
    const { container } = render(<LayoutRenderer layout={doc([rect(preset('Primary → Secondary'))])} scope={scopeWith('#ff0000')} />);
    expect(container.querySelector('[data-element-id="r1"]')).not.toBeNull();
  });
});

describe('stop opacity', () => {
  test('applies to a data-linked stop; full opacity leaves the colour alone', () => {
    expect(withOpacity('#123456', undefined)).toBe('#123456');
    expect(withOpacity('#123456', 1)).toBe('#123456');
    expect(withOpacity('#123456', 0.4)).toBe('color-mix(in srgb, #123456 40%, transparent)');
  });

  test('the schema accepts 0..1 and refuses anything else', () => {
    const g = (opacity: unknown) => rect({ type: 'linear', stops: [{ offset: 0, color: { ref: 'tournament.primaryColor' }, opacity } as any, { offset: 1, color: '#000000' }] });
    expect(validateLayout(doc([g(0.5)])).errors).toEqual([]);
    expect(validateLayout(doc([g(2)])).ok).toBe(false);
    expect(validateLayout(doc([g('half')])).ok).toBe(false);
  });

  test('an old design (solid fill, literal-only gradient) loads and draws unchanged', () => {
    const old: LayoutElement = { id: 'r1', type: 'rect', x: 0, y: 0, w: 10, h: 10, style: { fill: '#222222', gradient: { type: 'linear', angle: 45, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: 'rgba(0, 0, 0, 0)' }] } } };
    expect(validateLayout(doc([old])).errors).toEqual([]);
    expect(resolveGradient(old.style!.gradient as Gradient, scopeWith('#00ff00'))).toBe(old.style!.gradient);
  });
});

describe('team colour', () => {
  test('the website and the desktop feed give a team the same colour', () => {
    expect(teamColor(3)).toBe(teamSlotColor(3));
    expect(teamSlotColor(1)).toBe('hsl(47, 82%, 58%)');
  });
});
