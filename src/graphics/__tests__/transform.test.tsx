// Layer transforms (el.xform): scale / skew / flip / anchor / corner pin.
// The corner pin is a real projective map, the schema accepts and checks it,
// the renderer reproduces it (the same renderer published overlays use), a
// layer without it renders exactly as before, and the inspector's edits keep
// the document tidy (defaults dropped, Reset removes it).

import React from 'react';
import { render } from '@testing-library/react';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { affineCss, pinnedPoint, quadToMatrix3d } from '../renderer/staticTransform.ts';
import { createEmptyLayout, normalizeLayout, validateLayout } from '../schema/layoutSchema.js';
import { withXform } from '../editor/inspector/TransformSection.tsx';

const doc = (elements: any[]) => normalizeLayout({ ...createEmptyLayout(), elements }) as any;

test('the corner pin maps each corner of the box onto its pinned point', () => {
  const corners: any = [[40, 10], [-30, 25], [15, -20], [-5, 30]];
  const w = 400;
  const h = 120;
  const expected = [[40, 10], [w - 30, 25], [w + 15, h - 20], [-5, h + 30]];
  [[0, 0], [w, 0], [w, h], [0, h]].forEach(([x, y], i) => {
    const [px, py] = pinnedPoint(w, h, corners, x, y);
    expect(px).toBeCloseTo(expected[i][0], 4);
    expect(py).toBeCloseTo(expected[i][1], 4);
  });
  // A trapezoid really is perspective: the box's middle is not the corners' average.
  const [mx] = pinnedPoint(w, h, [[60, 0], [-60, 0], [0, 0], [0, 0]] as any, w / 2, h / 2);
  expect(mx).toBeCloseTo(w / 2, 4);
  expect(quadToMatrix3d(w, h, [[0, 0], [0, 0], [0, 0], [0, 0]] as any)).toBeUndefined();
  expect(quadToMatrix3d(w, h, [[0, 0], [-w, 0], [-w, -h], [0, -h]] as any)).toBeUndefined(); // collapsed to a point
});

test('scale, flip and skew around the anchor point', () => {
  expect(affineCss({ scaleX: 2, flipY: true, skewX: 10, originX: 0, originY: 100 })).toEqual({
    transform: 'scale(2, -1) skewX(10deg)',
    transformOrigin: '0% 100%',
  });
  expect(affineCss({})).toBeUndefined();
  expect(affineCss(undefined)).toBeUndefined();
});

test('the schema accepts a transform and rejects bad values', () => {
  const ok = doc([{ id: 'a', type: 'rect', x: 0, y: 0, w: 100, h: 50, xform: { scaleX: 1.5, skewY: -12, flipX: true, corners: [[1, 2], [3, 4], [5, 6], [7, 8]] } }]);
  expect(validateLayout(ok).ok).toBe(true);
  const bad = doc([{ id: 'a', type: 'rect', x: 0, y: 0, w: 100, h: 50, xform: { scaleX: -1, skewX: 95, flipY: 'yes', corners: [[1, 2]] } }]);
  const v = validateLayout(bad);
  expect(v.ok).toBe(false);
  const paths = v.errors.map((e: any) => e.path).join(' ');
  expect(paths).toMatch(/xform\.scaleX/);
  expect(paths).toMatch(/xform\.skewX/);
  expect(paths).toMatch(/xform\.flipY/);
  expect(paths).toMatch(/xform\.corners/);
});

test('the renderer draws the saved transform, and nothing extra without one', () => {
  const layout = doc([
    { id: 'plain', type: 'rect', x: 0, y: 0, w: 100, h: 50 },
    { id: 'bent', type: 'rect', x: 0, y: 100, w: 200, h: 100, rotation: 15, xform: { flipX: true, corners: [[20, 0], [-20, 0], [0, 0], [0, 0]] } },
  ]);
  const { container } = render(<LayoutRenderer layout={layout} state={null} fit={1} />);
  const plain = container.querySelector('[data-element-id="plain"]') as HTMLElement;
  expect(plain.querySelector('[data-xform]')).toBeNull();
  const bent = container.querySelector('[data-element-id="bent"]') as HTMLElement;
  expect(bent.style.transform).toBe('rotate(15deg)');
  const affine = bent.querySelector('[data-xform="affine"]') as HTMLElement;
  const pin = bent.querySelector('[data-xform="pin"]') as HTMLElement;
  expect(affine.style.transform).toBe('scale(-1, 1)');
  expect(pin.style.transform).toMatch(/^matrix3d\(/);
  expect(pin.style.transformOrigin).toBe('0 0');
  expect(affine.contains(pin)).toBe(true);
});

test('inspector edits drop defaults, so a reset layer has no xform at all', () => {
  const el: any = { id: 'a', type: 'rect', x: 0, y: 0, w: 10, h: 10 };
  const flipped = withXform(el, { flipX: true, scaleX: 1 });
  expect(flipped.xform).toEqual({ flipX: true });
  const back = withXform(flipped, { flipX: false });
  expect('xform' in back).toBe(false);
  expect(withXform(el, { corners: [[0, 0], [0, 0], [0, 0], [0, 0]] }).xform).toBeUndefined();
});
