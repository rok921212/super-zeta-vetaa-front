import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
import type { LayoutElement } from '../schema/layoutTypes.ts';
import {
  anchorsToD, fromElementPath, pencilToAnchors, simplify, splitSegment, toElementPath, toggleSmooth, type Anchor,
} from '../editor/pathTools.ts';
import { effectsToCss, defaultEffect, hasEffects } from '../renderer/effects.ts';
import { clipBases, clipToBaseCss, maskCss, transformPath, pathBounds } from '../renderer/masks.ts';
import { alignCmd, distributeCmd, matchSizeCmd } from '../editor/align.ts';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { Canvas } from '../editor/Canvas.tsx';
import { handleEditorKey } from '../editor/useEditorHotkeys.ts';

// jsdom (Jest 27) has no PointerEvent: without it, fireEvent.pointer* drops clientX/clientY.
if (!(window as any).PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  }
  (window as any).PointerEvent = PointerEventPolyfill;
}

const doc = (elements: any[]) => ({ ...createEmptyLayout(), elements }) as any;
const rect = (id: string, x: number, y: number, w = 100, h = 50, over: Partial<LayoutElement> = {}): LayoutElement => ({ id, type: 'rect', x, y, w, h, ...over });

describe('pen / pencil geometry', () => {
  const tri: Anchor[] = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 250, in: { x: 250, y: 250 }, out: { x: 150, y: 250 } }];

  test('anchors -> path element (local d + vb) -> anchors round trip', () => {
    const fields = toElementPath(tri, true);
    expect(fields).toMatchObject({ x: 100, y: 100, w: 200, h: 150, vb: [200, 150] });
    expect(fields.d).toBe('M0 0 L200 0 C200 0 150 150 100 150 C50 150 0 0 0 0 Z');
    const el: LayoutElement = { id: 'p', type: 'path', ...fields };
    expect(validateLayout(doc([el])).ok).toBe(true);
    const back = fromElementPath(el, { x: el.x, y: el.y })!;
    expect(back.closed).toBe(true);
    expect(back.anchors.map((a) => [a.x, a.y])).toEqual([[100, 100], [300, 100], [200, 250]]);
    expect(back.anchors[2]).toMatchObject({ in: { x: 250, y: 250 }, out: { x: 150, y: 250 } });
  });

  test('resizing the element scales the parsed points (vb)', () => {
    const el: LayoutElement = { id: 'p', type: 'path', ...toElementPath(tri, false), w: 400, h: 300 };
    const back = fromElementPath(el, { x: 0, y: 0 })!;
    expect(back.anchors[1]).toMatchObject({ x: 400, y: 0 });
  });

  test('split a segment and toggle smooth', () => {
    const line: Anchor[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const s = splitSegment(line, 0, false);
    expect(s.map((a) => [a.x, a.y])).toEqual([[0, 0], [50, 0], [100, 0]]);
    const sm = toggleSmooth(s, 1, false);
    expect(sm[1].in && sm[1].out).toBeTruthy();
    expect(toggleSmooth(sm, 1, false)[1].in).toBeUndefined();
    expect(anchorsToD(sm, false)).toMatch(/^M0 0 C/);
  });

  test('pencil: RDP simplifies a noisy straight stroke, then smooths', () => {
    const noisy = Array.from({ length: 50 }, (_, i) => ({ x: i * 4, y: (i % 2) * 0.5 }));
    expect(simplify(noisy, 2)).toHaveLength(2);
    const curve = Array.from({ length: 60 }, (_, i) => ({ x: i * 5, y: Math.sin(i / 6) * 60 }));
    const anchors = pencilToAnchors(curve);
    expect(anchors.length).toBeGreaterThan(3);
    expect(anchors.length).toBeLessThan(40);
    expect(anchors[1].in && anchors[1].out).toBeTruthy();
  });
});

describe('effects, masks, clipping', () => {
  test('effects -> css', () => {
    const fx = effectsToCss({ effects: [defaultEffect('dropShadow'), defaultEffect('outerGlow'), defaultEffect('innerShadow'), defaultEffect('stroke'), defaultEffect('colorOverlay'), { type: 'blur', enabled: false, blur: 9 }], style: { blendMode: 'screen' } });
    expect(fx.filter).toBe('drop-shadow(0px 8px 18px rgba(0,0,0,0.6)) drop-shadow(0 0 18px rgba(250,204,21,0.9))');
    expect(fx.outline).toBe('3px solid #ffffff');
    expect(fx.mixBlendMode).toBe('screen');
    expect(fx.overlays[0].boxShadow).toMatch(/^inset 0px 4px 10px 0px rgba\(0,0,0,0.5\)/);
    expect(fx.overlays[1]).toMatchObject({ background: '#e11d2e', mixBlendMode: 'multiply' });
    expect(hasEffects({ effects: [{ type: 'blur', enabled: false }] })).toBe(false);
  });

  test('path transform / bounds', () => {
    expect(transformPath('M0 0 L10 20 C1 2 3 4 5 6 Z', 2, 3, 5, 7)).toBe('M5 7 L25 67 C7 13 11 19 15 25 Z');
    expect(transformPath('m1 1 l2 2', 2, 2, 100, 100)).toBe('m2 2 l4 4');
    expect(pathBounds('M10 10 L50 30 L20 70 Z')).toEqual({ x: 10, y: 10, w: 40, h: 60 });
  });

  test('masks and clipping masks resolve to clip-path in the element box', () => {
    expect(maskCss({ mask: { shape: 'ellipse' }, w: 200, h: 100 })!.clipPath).toBe('ellipse(100px 50px at 100px 50px)');
    expect(maskCss({ mask: { shape: 'rect', radius: 12 }, w: 200, h: 100 })!.clipPath).toBe('inset(0px 0px 0px 0px round 12px)');
    expect(String(maskCss({ mask: { shape: 'ellipse', invert: true }, w: 20, h: 10 })!.maskImage)).toMatch(/^url\("data:image\/svg\+xml/);
    const base = rect('b', 10, 20, 100, 50, { style: { radius: 8 } });
    expect(clipToBaseCss({ x: 0, y: 0, w: 200, h: 100 }, base).clipPath).toBe('inset(20px 90px 30px 10px round 8px)');
    const list = [base, rect('c1', 0, 0, 1, 1, { clipToBelow: true }), rect('c2', 0, 0, 1, 1, { clipToBelow: true }), rect('d', 0, 0)];
    expect(clipBases(list).map((b) => b?.id ?? null)).toEqual([null, 'b', 'b', null]);
  });

  test('renderer applies effects wrappers and clipping masks', () => {
    const layout = doc([
      rect('base', 10, 10, 100, 100, { type: 'ellipse', style: { fill: '#fff' } }),
      rect('clipped', 0, 0, 200, 200, { clipToBelow: true, style: { fill: '#f00' } }),
      rect('fx', 300, 0, 50, 50, { effects: [defaultEffect('dropShadow')], style: { fill: '#0f0', blendMode: 'multiply' } }),
    ]);
    expect(validateLayout(layout).ok).toBe(true);
    const { container } = render(<LayoutRenderer layout={layout} state={null} fit={1} />);
    const clippedFx = container.querySelector('[data-element-id="clipped"] [data-fx]') as HTMLElement;
    expect(clippedFx.style.clipPath).toBe('ellipse(50px 50px at 60px 60px)');
    const fx = container.querySelector('[data-element-id="fx"] [data-fx]') as HTMLElement;
    expect(fx.style.filter).toMatch(/^drop-shadow/);
    expect(fx.style.mixBlendMode).toBe('multiply');
    expect(container.querySelector('[data-element-id="base"] [data-fx]')).toBeNull(); // no wrappers when unused
  });
});

describe('align & distribute', () => {
  const d = doc([rect('a', 0, 0, 100, 50), rect('b', 200, 100, 50, 50), rect('c', 500, 300, 100, 100)]);
  const xs = (cmd: any) => cmd.apply(d).elements.map((e: any) => [e.x, e.y]);

  test('align to selection bounds / stage', () => {
    expect(xs(alignCmd(d, ['a', 'b', 'c'], 'left'))).toEqual([[0, 0], [0, 100], [0, 300]]);
    expect(xs(alignCmd(d, ['a', 'b', 'c'], 'bottom'))).toEqual([[0, 350], [200, 350], [500, 300]]);
    expect(xs(alignCmd(d, ['a'], 'hcenter'))).toEqual([[910, 0], [200, 100], [500, 300]]); // single -> stage
  });

  test('distribute equal gaps; match size', () => {
    expect(xs(distributeCmd(d, ['a', 'b', 'c'], 'h'))).toEqual([[0, 0], [275, 100], [500, 300]]);
    expect(distributeCmd(d, ['a', 'b'], 'h')).toBeNull();
    expect(matchSizeCmd(d, ['a', 'c'], 'w')!.apply(d).elements[2].w).toBe(100);
  });
});

test('tool hotkeys', () => {
  const calls: string[] = [];
  const h: any = new Proxy({}, { get: (_t, k) => (...a: any[]) => calls.push(`${String(k)}${a.length ? ` ${a.join(',')}` : ''}`) });
  handleEditorKey({ key: 'p', ctrlKey: false, metaKey: false, shiftKey: false, target: document.body }, h, false);
  handleEditorKey({ key: 'c', ctrlKey: true, metaKey: false, shiftKey: false, altKey: true, target: document.body }, h, false);
  handleEditorKey({ key: "'", ctrlKey: true, metaKey: false, shiftKey: false, target: document.body }, h, false);
  expect(calls).toEqual(['setTool pen', 'copyStyle', 'toggleGrid']);
});

test('canvas pen tool: click, drag a curve, close on the first point -> path', () => {
  const created: Array<{ anchors: Anchor[]; closed: boolean }> = [];
  const { container } = render(
    <Canvas
      doc={doc([])} selected={[]} state={null} events={null} previewEvents={false} sampleEvent={null} zoom={1} showSafeZones={false}
      onSelect={() => {}} onGeometry={() => {}} onGestureEnd={() => {}}
      tool="pen" onCreatePath={(anchors, closed) => created.push({ anchors, closed })}
    />
  );
  const stage = container.querySelector('[data-stage]') as HTMLElement;
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const layer = container.querySelector('[data-tool-layer]') as SVGElement;
  const click = (x: number, y: number) => { fireEvent.pointerDown(layer, { button: 0, clientX: x, clientY: y }); fireEvent.pointerUp(window, { clientX: x, clientY: y }); };
  click(100, 100);
  click(300, 100);
  fireEvent.pointerDown(layer, { button: 0, clientX: 200, clientY: 250 });
  fireEvent.pointerMove(window, { clientX: 150, clientY: 250 }); // drag = smooth point
  fireEvent.pointerUp(window, { clientX: 150, clientY: 250 });
  click(101, 101); // back on the first anchor -> close
  expect(created).toHaveLength(1);
  expect(created[0].closed).toBe(true);
  expect(created[0].anchors).toHaveLength(3);
  expect(created[0].anchors[2]).toMatchObject({ x: 200, y: 250, out: { x: 150, y: 250 }, in: { x: 250, y: 250 } });
});
