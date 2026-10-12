// Custom CSS (per layer + layout stylesheet), gradients and fill levels driven by
// live data, conditional style, and the current match number.

import React from 'react';
import { render } from '@testing-library/react';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { declarationProblems, layerCss, parseDeclarations, scopeStylesheet, stylesheetProblems } from '../renderer/customCss.ts';
import { boxCss, fillLevel, gradientCss } from '../renderer/styleToCss.ts';
import { buildScope, resolveElementStyle, resolveGradient } from '../bindings/index.ts';
import { computeLive, currentMatchNoOf } from '../bindings/live.ts';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { TEMPLATES } from '../templates/index.ts';
import { layoutLiveTiers } from '../runtime/layoutTiers.ts';

const doc = (elements: LayoutElement[], extra: Partial<LayoutDocument> = {}) => ({ ...createEmptyLayout(), elements, ...extra }) as LayoutDocument;
const rect = (extra: Partial<LayoutElement> = {}): LayoutElement => ({ id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 50, ...extra });

describe('layer CSS declarations', () => {
  test('parses declarations into React style, keeping custom properties and data: URLs', () => {
    expect(parseDeclarations('border-radius: 12px; backdrop-filter: blur(6px);\n--glow: #fff; background: url("data:image/png;base64,AAAA")')).toEqual({
      borderRadius: '12px', backdropFilter: 'blur(6px)', '--glow': '#fff', background: 'url("data:image/png;base64,AAAA")',
    });
  });

  test('drops placement, scripts and expressions', () => {
    const css = parseDeclarations('left: 10px; width: 5px; position: fixed; color: red; behavior: url(x); background: expression(alert(1)); x: javascript:alert(1)');
    expect(css).toEqual({ color: 'red' });
  });

  test('unsafe url() targets are removed', () => {
    expect(parseDeclarations('background: url(http://evil.example/x.png)').background).toBe('none');
  });

  test('fills {{data}} tokens from the scope', () => {
    const scope = { ...buildScope({ tournament: { primaryColor: '#123456' } } as any, createEmptyLayout()) };
    expect(layerCss('box-shadow: 0 0 8px {{tournament.primaryColor}}', scope)).toEqual({ boxShadow: '0 0 8px #123456' });
  });

  test('reports problems line by line', () => {
    expect(declarationProblems('color red;\nwidth: 4px')).toEqual([
      { line: 1, message: '“color red” is not property: value' },
      { line: 2, message: 'width is ignored — position and size come from the canvas' },
    ]);
    expect(declarationProblems('a { color: red }')[0].message).toMatch(/Only declarations/);
  });
});

describe('layout stylesheet', () => {
  const root = '[data-ss-root="x"]';
  test('prefixes every selector, maps :root/body to the overlay, keeps @keyframes and scopes @media', () => {
    const out = scopeStylesheet('.a, [data-layer="Score"] { color: red }\n:root { --x: 1 }\n@keyframes spin { to { transform: rotate(1turn) } }\n@media (min-width: 10px) { .b { color: blue } }', root);
    expect(out).toContain(`${root} .a, ${root} [data-layer="Score"]{ color: red }`);
    expect(out).toContain(`${root}{ --x: 1 }`);
    expect(out).toContain('@keyframes spin{ to { transform: rotate(1turn) } }');
    expect(out).toContain(`@media (min-width: 10px){${root} .b{ color: blue }`);
  });

  test('drops @import and markup', () => {
    const out = scopeStylesheet('@import url(https://x.example/a.css);</style><script>alert(1)</script> .a { color: red }', root);
    expect(out).not.toMatch(/@import|<|script>/i);
    expect(out).toContain(`${root} .a{ color: red }`);
  });

  test('brace problems', () => {
    expect(stylesheetProblems('.a { color: red')).toEqual([{ line: 1, message: '1 “{” never closed' }]);
    expect(stylesheetProblems('.a {}}')[0].message).toBe('Extra “}”');
  });

  test('is rendered once, scoped to the stage', () => {
    const { container } = render(
      <LayoutRenderer layout={doc([rect({ name: 'Score', customCss: 'border-radius: 9px' })], { stylesheet: '[data-layer="Score"] { outline: 1px solid red }' })} state={null} fit={1} />,
    );
    const stage = container.querySelector('[data-stage]') as HTMLElement;
    const id = stage.getAttribute('data-ss-root');
    expect(id).toBeTruthy();
    const sheet = container.querySelector('style[data-ss-stylesheet]');
    expect(sheet?.textContent).toContain(`[data-ss-root="${id}"] [data-layer="Score"]`);
    expect(container.querySelector('[data-layer="Score"]')).toBeTruthy();
    expect((container.querySelector('.ss-layer') as HTMLElement).style.borderRadius).toBe('9px');
  });
});

describe('schema', () => {
  test('accepts layer CSS, a stylesheet, fill-by-data keys and data-linked gradient stops', () => {
    const el = rect({
      customCss: 'border-radius: 4px;',
      style: {
        fillValue: { ref: 'item.liveMemberNum' }, fillMax: 4, fillDirection: 'up', fillTrack: 'rgba(0,0,0,0.4)',
        gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: { ref: 'tournament.primaryColor' } }, { offset: 1, color: '#000000' }] },
      },
    });
    expect(validateLayout(doc([el], { stylesheet: '.a { color: red }' })).errors).toEqual([]);
  });

  test('refuses unsafe or misplaced CSS', () => {
    expect(validateLayout(doc([rect({ customCss: 'a { color: red }' })])).ok).toBe(false);
    expect(validateLayout(doc([rect({ customCss: 'background: url(javascript:alert(1))' })])).ok).toBe(false);
    expect(validateLayout(doc([], { stylesheet: '@import url(x.css);' })).ok).toBe(false);
    expect(validateLayout(doc([], { stylesheet: '</style><script>' })).ok).toBe(false);
    expect(validateLayout(doc([rect({ style: { fillDirection: 'sideways' } })])).ok).toBe(false);
    expect(validateLayout(doc([rect({ style: { gradient: { type: 'linear', stops: [{ offset: 0, color: { ref: 'a..b' } }, { offset: 1, color: '#000' }] } } })])).ok).toBe(false);
  });

  test('every template still validates', () => {
    for (const t of TEMPLATES) expect({ id: t.id, errors: validateLayout(doc(t.elements)).errors }).toEqual({ id: t.id, errors: [] });
  });
});

describe('gradients from live data', () => {
  const scope = buildScope({ tournament: { primaryColor: '#ff0000', secondaryColor: '#0000ff' } } as any, createEmptyLayout());

  test('stop colours follow data', () => {
    const g = resolveGradient({ type: 'linear', angle: 90, stops: [{ offset: 0, color: { ref: 'tournament.primaryColor' } }, { offset: 1, color: { ref: 'tournament.secondaryColor' } }] }, scope);
    expect(gradientCss(g)).toBe('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
  });

  test('a missing value draws transparent; nothing found drops the gradient so the fill shows', () => {
    const partial = resolveGradient({ type: 'linear', stops: [{ offset: 0, color: { ref: 'tournament.nope' } }, { offset: 1, color: '#000000' }] }, scope);
    expect(partial?.stops[0].color).toBe('transparent');
    const el = rect({ style: { fill: '#222222', gradient: { type: 'linear', stops: [{ offset: 0, color: { ref: 'x.a' } }, { offset: 1, color: { ref: 'x.b' } }] } } });
    expect(boxCss(resolveElementStyle(el, scope).style).background).toBe('#222222');
  });

  test('conditional style switches the gradient', () => {
    const gold = { type: 'linear' as const, angle: 90, stops: [{ offset: 0, color: '#fde68a' }, { offset: 1, color: '#92400e' }] };
    const el = rect({ style: { fill: '#111111' }, styleWhen: [{ when: { path: 'rank', op: 'equals', value: 1 }, style: { gradient: gold } }] });
    expect(boxCss(resolveElementStyle(el, { ...scope, rank: 1 } as any).style).background).toMatch(/^linear-gradient/);
    expect(boxCss(resolveElementStyle(el, { ...scope, rank: 2 } as any).style).background).toBe('#111111');
  });
});

describe('fill by data', () => {
  test('fill level is value / max, clamped', () => {
    expect(fillLevel({ fillValue: 3, fillMax: 4 })).toBe(0.75);
    expect(fillLevel({ fillValue: 9, fillMax: 4 })).toBe(1);
    expect(fillLevel({ fillValue: 50 })).toBe(0.5);
    expect(fillLevel({ fillValue: 'x' })).toBe(0);
    expect(fillLevel({})).toBeNull();
  });

  test('with a track colour the empty part is painted over the fill; without, it is masked away', () => {
    const withTrack = boxCss({ fill: '#ff0000', fillValue: 1, fillMax: 4, fillTrack: '#000000' });
    expect(withTrack.background).toBe('linear-gradient(90deg, transparent 25%, #000000 25%), #ff0000');
    const masked = boxCss({ fill: '#ff0000', fillValue: 3, fillMax: 4, fillDirection: 'up' });
    expect(masked.background).toBe('#ff0000');
    expect(masked.maskImage).toBe('linear-gradient(0deg, #000 75%, transparent 75%)');
  });

  test('the value follows data', () => {
    const el = rect({ style: { fill: '#ff0000', fillValue: { ref: 'item.alive' }, fillMax: 4 } });
    const scope = { ...buildScope(null, createEmptyLayout()), item: { alive: 2 } } as any;
    expect(boxCss(resolveElementStyle(el, scope).style).maskImage).toContain('50%');
  });
});

describe('live tiers of a published layout', () => {
  test('core feed unless the layout draws a map or reads positions', () => {
    expect(layoutLiveTiers(doc([rect()]))).toEqual(['matchData', 'overall']);
    expect(layoutLiveTiers(doc([{ id: 'g', type: 'group', x: 0, y: 0, w: 1, h: 1, children: [{ id: 'm', type: 'map', x: 0, y: 0, w: 1, h: 1 }] }]))).toEqual(['matchDataPositional', 'overall']);
    expect(layoutLiveTiers(doc([{ id: 't', type: 'text', x: 0, y: 0, w: 1, h: 1, bind: { text: { path: 'live.players[0].location.x' } } }]))).toEqual(['matchDataPositional', 'overall']);
    expect(layoutLiveTiers(null)).toEqual(['matchData', 'overall']);
  });
});

describe('current match number', () => {
  const matches = [{ _id: 'm1', matchNo: 1 }, { _id: 'm2', matchNo: 2 }];

  test('uses the match header when it is the live match', () => {
    expect(currentMatchNoOf({ match: { _id: 'm1', matchNo: 1 }, matchData: { matchId: 'm1' }, matches })).toBe(1);
  });

  test('follows the live feed when the panel switched match before the header refreshed', () => {
    expect(currentMatchNoOf({ match: { _id: 'm1', matchNo: 1 }, matchData: { matchId: 'm2' }, matches })).toBe(2);
  });

  test('falls back to _matchNo and to the header with no live data', () => {
    expect(currentMatchNoOf({ match: { _id: 'm3', _matchNo: 7 } })).toBe(7);
    expect(currentMatchNoOf({})).toBeNull();
  });

  test('is exposed as live.currentMatchNo', () => {
    expect(computeLive({ derived: { teams: [] }, match: { _id: 'm1', matchNo: 5 } }).currentMatchNo).toBe(5);
  });
});
