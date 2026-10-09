import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

jest.mock('../../login/api.tsx', () => {
  const api = { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return {
    __esModule: true, default: api, DEFAULT_BACKEND: 'http://backend.test', RELAY_ORIGIN: 'http://127.0.0.1:8787',
    isOverlayRoute: () => false, isUsingRelay: () => false, getBackendOrigin: () => 'http://backend.test', getRelayOrigin: () => null,
    markRelayUnreachable: jest.fn(), markRelayReachable: jest.fn(),
  };
});

// eslint-disable-next-line import/first
import api from '../../login/api.tsx';
// eslint-disable-next-line import/first
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
// eslint-disable-next-line import/first
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
// eslint-disable-next-line import/first
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
// eslint-disable-next-line import/first
import { assetIdOf, assetRef, assetUrl, assetFileProblem, imageFilesOf } from '../renderer/assets.ts';
// eslint-disable-next-line import/first
import { frameClipCss, imageFillCss, textPaintCss } from '../renderer/elements.tsx';
// eslint-disable-next-line import/first
import { gradientCss } from '../renderer/styleToCss.ts';
// eslint-disable-next-line import/first
import * as bindings from '../bindings/index.ts';
// eslint-disable-next-line import/first
import { bindingProblem, defaultPropFor, propsForKind, valueKind } from '../bindings/compat.ts';
// eslint-disable-next-line import/first
import { listFields, searchFields, describeField } from '../bindings/fieldCatalog.ts';
// eslint-disable-next-line import/first
import { clearCache } from '../requestCache.ts';
// eslint-disable-next-line import/first
import { formatColor, mixColors, parseColor, recentColors, rememberColor, resetRecentColors, withAlpha } from '../editor/color.ts';
// eslint-disable-next-line import/first
import { addStop, colorAt, defaultGradient, normalizeGradient, removeStop, reverseGradient, updateStop, GRADIENT_PRESETS } from '../editor/gradient.ts';
// eslint-disable-next-line import/first
import { SHAPE_PRESETS, polygonFields, presetMask, regularPolygon, starPolygon } from '../editor/shapes.ts';
// eslint-disable-next-line import/first
import {
  acceptsImage, convertFrameShapeCmd, createImageElement, imageFillCmd, panImageFill, patchImageFill, removeFrameImageCmd, setLayerImageCmd, zoomImageFill,
} from '../editor/imageOps.ts';
// eslint-disable-next-line import/first
import { checkPublish } from '../editor/publishChecks.ts';
// eslint-disable-next-line import/first
import { editorReducer, initEditor, editElements, HISTORY_LIMIT } from '../editor/store.ts';
// eslint-disable-next-line import/first
import { layerMarks, searchLayers } from '../editor/LayersPanel.tsx';
// eslint-disable-next-line import/first
import { parseShadow, formatShadow } from '../editor/inspector/ShadowField.tsx';
// eslint-disable-next-line import/first
import { textFitMode, textFitStyle } from '../editor/inspector/TextStyleSection.tsx';
// eslint-disable-next-line import/first
import { FillSection } from '../editor/inspector/FillSection.tsx';
// eslint-disable-next-line import/first
import { GradientEditor } from '../editor/GradientEditor.tsx';
// eslint-disable-next-line import/first
import { ColorInput } from '../editor/ui.tsx';
// eslint-disable-next-line import/first
import { AssetGrid } from '../editor/AssetLibrary.tsx';
// eslint-disable-next-line import/first
import { useAssetLibrary } from '../editor/useAssets.ts';
// eslint-disable-next-line import/first
import { listConnections } from '../editor/DataPanel.tsx';
// eslint-disable-next-line import/first
import { SIM_SCENARIOS, runScenario } from '../editor/simulation.ts';
// eslint-disable-next-line import/first
import { PublishDialog } from '../editor/dialogs.tsx';
// eslint-disable-next-line import/first
import { buildPerfDocument } from '../__fixtures__/perfDoc.ts';

const mockApi = api as unknown as Record<'get' | 'post' | 'put' | 'patch' | 'delete', jest.Mock>;
const A1 = '65f0000000000000000000a1';
const A2 = '65f0000000000000000000a2';
const docWith = (elements: LayoutElement[], extra: Partial<LayoutDocument> = {}): LayoutDocument => ({ ...(createEmptyLayout() as LayoutDocument), ...extra, elements });
const rect = (over: Partial<LayoutElement> = {}): LayoutElement => ({ id: 'r', type: 'rect', name: 'Portrait frame', x: 100, y: 100, w: 200, h: 200, style: { fill: '#111827', stroke: '#ffffff', strokeWidth: 2 }, ...over });
const apply = (doc: LayoutDocument, cmd: any) => cmd.apply(doc) as LayoutDocument;

beforeEach(() => {
  clearCache();
  resetRecentColors();
  (['get', 'post', 'put', 'patch', 'delete'] as const).forEach((k) => mockApi[k].mockReset());
  mockApi.get.mockResolvedValue({ data: [] });
});

// ── uploaded images ──────────────────────────────────────────────────────────

describe('asset references', () => {
  test('a design stores an id, never a URL or the bytes; the id resolves to the backend file', () => {
    expect(assetRef(A1)).toBe(`asset:${A1}`);
    expect(assetIdOf(`asset:${A1}`)).toBe(A1);
    expect(assetIdOf('/def_logo.avif')).toBeNull();
    expect(assetUrl(`asset:${A1}`)).toBe(`http://backend.test/api/overlay-assets/file/${A1}`);
    expect(assetUrl('/def_logo.avif', 'https://cdn.example')).toBe('https://cdn.example/def_logo.avif');
    expect(assetUrl('https://x.example/a.png')).toBe('https://x.example/a.png');
    expect(assetUrl('')).toBe('');
  });

  test('files are checked before any request: type, size, emptiness', () => {
    expect(assetFileProblem({ name: 'logo.png', size: 1000, type: 'image/png' })).toBeNull();
    expect(assetFileProblem({ name: 'portrait.JPG', size: 1000, type: '' })).toBeNull();
    expect(assetFileProblem({ name: 'notes.txt', size: 10, type: 'text/plain' })).toMatch(/Only PNG/);
    expect(assetFileProblem({ name: 'big.png', size: 5 * 1024 * 1024, type: 'image/png' })).toMatch(/4 MB/);
    expect(assetFileProblem({ name: 'empty.png', size: 0, type: 'image/png' })).toMatch(/empty/);
    const files = [new File(['x'], 'a.png', { type: 'image/png' }), new File(['x'], 'b.pdf', { type: 'application/pdf' }), new File(['x'], 'c.svg', { type: '' })];
    expect(imageFilesOf(files).map((f) => f.name)).toEqual(['a.png', 'c.svg']);
  });
});

describe('image frames', () => {
  const doc = docWith([rect(), { id: 'img', type: 'image', x: 0, y: 0, w: 100, h: 100, src: '/def_logo.avif', crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }, { id: 't', type: 'text', x: 0, y: 0, w: 100, h: 30, text: 'hi' }]);

  test('placing an image in a shape keeps the frame; replacing keeps the crop; removing leaves the frame as it was', () => {
    expect(acceptsImage(doc.elements[0]) && acceptsImage(doc.elements[1]) && !acceptsImage(doc.elements[2])).toBe(true);
    expect(setLayerImageCmd(doc, 't', assetRef(A1))).toBeNull(); // text cannot hold a picture

    let d = apply(doc, setLayerImageCmd(doc, 'r', assetRef(A1)));
    expect(d.elements[0]).toMatchObject({ type: 'rect', imageFill: { src: `asset:${A1}`, fit: 'cover' }, style: doc.elements[0].style });
    d = apply(d, imageFillCmd(d, 'r', { scale: 1.6, posX: 0.2, posY: 0.9 }));
    d = apply(d, setLayerImageCmd(d, 'r', assetRef(A2)));
    expect(d.elements[0].imageFill).toEqual({ src: `asset:${A2}`, fit: 'cover', scale: 1.6, posX: 0.2, posY: 0.9 }); // the crop survives a replace
    expect(validateLayout(d).ok).toBe(true);

    // resizing / restyling the frame does not touch the picture's settings
    const resized = apply(d, editElements(d, ['r'], (e) => ({ ...e, w: 640, h: 360, style: { ...e.style, stroke: '#ff0000' } }), 'Resize'));
    expect(resized.elements[0].imageFill).toEqual(d.elements[0].imageFill);

    const removed = apply(d, removeFrameImageCmd(d, 'r'));
    expect(removed.elements[0]).toEqual(doc.elements[0]);

    // an image LAYER gets a new source and loses a crop that belonged to the old picture
    const swapped = apply(doc, setLayerImageCmd(doc, 'img', assetRef(A1)));
    expect(swapped.elements[1].src).toBe(`asset:${A1}`);
    expect(swapped.elements[1].crop).toBeUndefined();
  });

  test('pan and zoom inside the frame are clamped and store no defaults', () => {
    expect(patchImageFill({ src: 'x' }, { scale: 99, posX: -1, posY: 2, opacity: 5 })).toEqual({ src: 'x', scale: 10, posX: 0, posY: 1 });
    expect(patchImageFill({ src: 'x', scale: 2, posX: 0.1 }, { scale: 1, posX: 0.5 })).toEqual({ src: 'x' });
    // dragging the picture right shows more of its left side
    expect(panImageFill({ src: 'x' }, 0.2, 0).posX).toBeCloseTo(0.3);
    expect(panImageFill({ src: 'x', scale: 2 }, 0.2, 0).posX).toBeCloseTo(0.4); // zoomed in: the same drag moves it less
    expect(zoomImageFill({ src: 'x' }, -100).scale!).toBeGreaterThan(1);
    expect(zoomImageFill({ src: 'x' }, 100).scale!).toBeLessThan(1);
  });

  test('changing the frame shape keeps the picture, colours, bindings and animation', () => {
    const framed = docWith([rect({ imageFill: { src: assetRef(A1), fit: 'cover', scale: 1.4 }, bind: { src: { path: 'item.teamLogo' } }, timeline: { clips: [{ id: 'c', trigger: { type: 'enter' }, duration: 300, tracks: [{ prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 300, value: 1 }] }] }] }, style: { fill: '#111827', radius: 12 } })]);
    const hex = apply(framed, convertFrameShapeCmd(framed, 'r', 'hexagon')).elements[0];
    expect(hex.type).toBe('polygon');
    expect(hex.points).toHaveLength(6);
    expect(hex.vb).toEqual([200, 200]);
    expect(hex.style).toEqual({ fill: '#111827' }); // the corner radius means nothing on a polygon
    expect([hex.imageFill, hex.bind, hex.timeline, hex.x, hex.w]).toEqual([framed.elements[0].imageFill, framed.elements[0].bind, framed.elements[0].timeline, 100, 200]);
    const circle = apply(docWith([hex]), convertFrameShapeCmd(docWith([hex]), 'r', 'ellipse')).elements[0];
    expect([circle.type, circle.points, circle.vb, circle.imageFill]).toEqual(['ellipse', undefined, undefined, framed.elements[0].imageFill]);
    expect(validateLayout(docWith([hex])).ok && validateLayout(docWith([circle])).ok).toBe(true);
    expect(convertFrameShapeCmd(framed, 'r', 'no-such-shape')).toBeNull();
  });

  test('a new image layer keeps the picture\'s proportions and fits inside the canvas', () => {
    const el = createImageElement(createEmptyLayout() as LayoutDocument, { _id: A1, name: 'Wide banner', width: 4000, height: 1000 }, { x: 960, y: 540 });
    expect(el.src).toBe(`asset:${A1}`);
    expect(el.w / el.h).toBeCloseTo(4, 1);
    expect(el.w).toBeLessThanOrEqual(1920 * 0.6 + 1);
    expect([Math.round(el.x + el.w / 2), Math.round(el.y + el.h / 2)]).toEqual([960, 540]);
    const small = createImageElement(createEmptyLayout() as LayoutDocument, { _id: A1, name: 'Icon', width: 64, height: 64 });
    expect([small.w, small.h]).toEqual([64, 64]); // never upscaled
  });

  test('shapes: presets fill their box, scale with the layer, and work as masks', () => {
    for (const p of SHAPE_PRESETS) {
      const pts = p.points(300, 120);
      expect(Math.min(...pts.map((q) => q[0]))).toBeCloseTo(0, 0);
      expect(Math.max(...pts.map((q) => q[0]))).toBeCloseTo(300, 0);
      expect(Math.max(...pts.map((q) => q[1]))).toBeCloseTo(120, 0);
      const el: LayoutElement = { id: p.id.replace(/[^a-z]/g, ''), x: 0, y: 0, w: 300, h: 120, ...polygonFields(pts, 300, 120) } as LayoutElement;
      expect(validateLayout(docWith([el])).ok).toBe(true);
    }
    expect(regularPolygon(6, 100, 100)).toHaveLength(6);
    expect(starPolygon(5, 100, 100)).toHaveLength(10);
    const mask = presetMask('hexagon', 200, 100)!;
    expect(mask).toMatchObject({ shape: 'path', vb: [200, 100] });
    expect(mask.d).toMatch(/^M50 0 L150 0 L200 50 L150 100 L50 100 L0 50 Z$/);
    expect(validateLayout(docWith([rect({ mask })])).ok).toBe(true);
    expect(presetMask('nope', 1, 1)).toBeNull();
  });

  test('the renderer clips the picture to the frame and positions it from fit / zoom / focal point', () => {
    expect(imageFillCss({ fit: 'contain', scale: 2, posX: 0.25, posY: 1 })).toMatchObject({ objectFit: 'contain', objectPosition: '25% 100%', transform: 'scale(2)', transformOrigin: '25% 100%' });
    expect(imageFillCss(undefined)).toMatchObject({ objectFit: 'cover', objectPosition: '50% 50%', transform: undefined });
    expect((frameClipCss({ type: 'polygon', points: [[0, 0], [100, 0], [50, 50]], vb: [100, 50], w: 400, h: 200 }) as any).clipPath).toBe('polygon(0% 0%, 100% 0%, 50% 100%)');
    expect((frameClipCss({ type: 'path', d: 'M0 0 L10 0 L10 10 Z', vb: [10, 10], w: 100, h: 50 }) as any).clipPath).toBe("path('M0 0 L100 0 L100 50 Z')");

    const doc = docWith([
      rect({ id: 'circle', type: 'ellipse', imageFill: { src: assetRef(A1), fit: 'cover' } }),
      { id: 'hex', type: 'polygon', x: 0, y: 0, w: 100, h: 100, points: [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]], vb: [100, 100], imageFill: { src: '/portrait.png' }, style: { fill: '#000000', stroke: '#ffffff' } },
      rect({ id: 'empty' }),
      rect({ id: 'bound', bind: { src: { path: 'tournament.logo' } }, imageFill: { src: '/fallback.png' } }),
    ]);
    const { container } = render(<LayoutRenderer layout={doc} state={{ tournament: { logo: `asset:${A2}` } } as any} events={null} fit={1} mode="editor" playTimelines={false} assetBase="https://site.example" />);
    const img = (id: string) => container.querySelector(`[data-element-id="${id}"] [data-frame-image] img`) as HTMLImageElement | null;
    expect(img('circle')!.getAttribute('src')).toBe(`http://backend.test/api/overlay-assets/file/${A1}`);
    expect(img('hex')!.getAttribute('src')).toBe('https://site.example/portrait.png');
    expect((container.querySelector('[data-element-id="hex"] [data-frame-image]') as HTMLElement).style.clipPath).toContain('polygon(');
    expect(container.querySelectorAll('[data-element-id="hex"] svg')).toHaveLength(2); // fill below the picture, outline above it
    expect(img('empty')).toBeNull();                                                    // an empty frame is just the shape
    expect(img('bound')!.getAttribute('src')).toBe(`http://backend.test/api/overlay-assets/file/${A2}`); // live data wins over the stored picture

    // a picture that fails to load leaves the frame standing
    act(() => { fireEvent.error(img('circle')!); });
    expect(img('circle')).toBeNull();
    expect(container.querySelector('[data-element-id="circle"]')).not.toBeNull();
  });

  test('text: outline, gradient fill and the stage background image render', () => {
    const doc = docWith([{ id: 't', type: 'text', x: 0, y: 0, w: 300, h: 60, text: 'MVP', style: { textStroke: '#000000', textStrokeWidth: 3, textGradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#fde68a' }, { offset: 1, color: '#92400e' }] }, textOverflow: 'clip' } }],
      { stage: { width: 1920, height: 1080, background: null, backgroundImage: assetRef(A1) } });
    const { container } = render(<LayoutRenderer layout={doc} state={null} events={null} fit={1} mode="editor" playTimelines={false} />);
    const span = container.querySelector('[data-element-id="t"] span') as HTMLElement;
    expect(span.textContent).toBe('MVP');
    // jsdom drops gradient values from inline styles, so the paint itself is checked where it is computed.
    expect(textPaintCss(doc.elements[0].style as any)).toMatchObject({ background: 'linear-gradient(180deg, #fde68a 0%, #92400e 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', WebkitTextStroke: '3px #000000' });
    expect(span.style.textOverflow).toBe('clip');
    expect((container.querySelector('[data-stage-background]') as HTMLImageElement).getAttribute('src')).toBe(`http://backend.test/api/overlay-assets/file/${A1}`);
  });
});

// ── colour + gradient ────────────────────────────────────────────────────────

describe('colour and gradient', () => {
  test('colours parse and format: hex when opaque, rgba when not', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#ff000080')!.a).toBeCloseTo(0.5, 1);
    expect(parseColor('rgba(10, 20, 30, 0.25)')).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
    expect(parseColor('rgb(10 20 30 / 50%)')!.a).toBe(0.5);
    expect(parseColor('tomato')).toBeNull();
    expect(formatColor({ r: 255, g: 204, b: 0, a: 1 })).toBe('#ffcc00');
    expect(formatColor({ r: 255, g: 204, b: 0, a: 0.4 })).toBe('rgba(255, 204, 0, 0.4)');
    expect(withAlpha('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(withAlpha('rgba(0, 0, 0, 0.5)', 1)).toBe('#000000');
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    // every value the picker can produce is a colour the schema accepts
    const doc = docWith([rect({ style: { fill: formatColor({ r: 1, g: 2, b: 3, a: 0.33 }) } })]);
    expect(validateLayout(doc).ok).toBe(true);
  });

  test('recent colours: newest first, no repeats, bounded', () => {
    rememberColor('#ff0000');
    rememberColor('rgba(0, 0, 0, 0.5)');
    rememberColor('#FF0000');
    rememberColor('not a colour');
    expect(recentColors()).toEqual(['#ff0000', 'rgba(0, 0, 0, 0.5)']);
    for (let i = 0; i < 40; i++) rememberColor(`#0000${i.toString(16).padStart(2, '0')}`);
    expect(recentColors().length).toBeLessThanOrEqual(14);
  });

  test('gradient stops: add takes the colour already there, remove keeps two, reverse mirrors, dragging keeps the index', () => {
    const g = defaultGradient('#000000', '#ffffff');
    expect(colorAt(g, 0.5)).toBe('#808080');
    const added = addStop(g, 0.5);
    expect(added.index).toBe(1);
    expect(added.gradient.stops.map((s) => [s.offset, s.color])).toEqual([[0, '#000000'], [0.5, '#808080'], [1, '#ffffff']]);
    expect(removeStop(g, 0)).toBe(g); // never below two stops
    expect(removeStop(added.gradient, 1).stops).toHaveLength(2);
    expect(reverseGradient(added.gradient).stops.map((s) => s.color)).toEqual(['#ffffff', '#808080', '#000000']);
    // a stop dragged past its neighbour stays at its index until the drag ends, then the list is put in order
    const dragged = updateStop(added.gradient, 1, { offset: 1.4 });
    expect(dragged.stops[1].offset).toBe(1);
    expect(normalizeGradient(updateStop(added.gradient, 0, { offset: 0.9 })).stops.map((s) => s.offset)).toEqual([0.5, 0.9, 1]);
    let many = g;
    for (let i = 0; i < 40; i++) many = addStop(many, i / 40).gradient;
    expect(many.stops.length).toBe(16);
    expect(validateLayout(docWith([rect({ style: { gradient: many } })])).ok).toBe(true);
    for (const p of GRADIENT_PRESETS) expect(validateLayout(docWith([rect({ style: { gradient: p.gradient } })])).ok).toBe(true);
    expect(gradientCss({ type: 'radial', stops: [{ offset: 1, color: '#000000' }, { offset: 0, color: 'rgba(0, 0, 0, 0)' }] })).toBe('radial-gradient(circle, rgba(0, 0, 0, 0) 0%, #000000 100%)');
    expect(gradientCss(many)).toContain('linear-gradient(90deg');
  });

  test('shadows and text fit modes round-trip through their stored style values', () => {
    expect(parseShadow('0 8px 24px rgba(0,0,0,.4)')).toEqual({ x: 0, y: 8, blur: 24, spread: 0, color: 'rgba(0,0,0,.4)' });
    expect(parseShadow('0 0 4px #000, 0 0 8px #fff')).toBeNull(); // two shadows: left as typed
    expect(parseShadow('inset 0 0 4px #000')).toBeNull();
    expect(formatShadow({ x: 2, y: 4, blur: 6, spread: 0, color: '#000000' })).toBe('2px 4px 6px #000000');
    expect(formatShadow({ x: 2, y: 4, blur: 6, spread: 3, color: '#000000' })).toBe('2px 4px 6px 3px #000000');
    expect(formatShadow({ x: 2, y: 4, blur: 6, spread: 3, color: '#000000' }, true)).toBe('2px 4px 6px #000000'); // text has no spread
    expect(parseShadow(formatShadow({ x: -3, y: 1.5, blur: 0, spread: 2, color: 'rgba(1, 2, 3, 0.5)' }))).toEqual({ x: -3, y: 1.5, blur: 0, spread: 2, color: 'rgba(1, 2, 3, 0.5)' });
    for (const mode of ['ellipsis', 'clip', 'wrap', 'shrink'] as const) {
      const style = Object.fromEntries(Object.entries(textFitStyle(mode)).filter(([, v]) => v !== undefined));
      expect(textFitMode(style as any)).toBe(mode);
      expect(validateLayout(docWith([{ id: 't', type: 'text', x: 0, y: 0, w: 10, h: 10, style: style as any }])).ok).toBe(true);
    }
  });

  test('colour field: the popover edits opacity and HEX, offers recent colours, and "No colour" clears it', () => {
    rememberColor('#123456');
    const Host = () => { const [v, setV] = React.useState<string | undefined>('#ff0000'); return <><ColorInput value={v} onChange={setV} /><output data-testid="v">{String(v)}</output></>; };
    render(<Host />);
    fireEvent.click(screen.getByLabelText('Open the colour picker'));
    const pop = within(screen.getByTestId('color-popover'));
    fireEvent.change(pop.getByLabelText('Opacity'), { target: { value: '50' } });
    expect(screen.getByTestId('v').textContent).toBe('rgba(255, 0, 0, 0.5)');
    const hex = pop.getByLabelText('HEX or RGBA');
    fireEvent.change(hex, { target: { value: 'nonsense' } });
    fireEvent.blur(hex);
    expect(screen.getByTestId('v').textContent).toBe('rgba(255, 0, 0, 0.5)'); // not a colour: nothing changes
    fireEvent.change(hex, { target: { value: '#00ff00' } });
    fireEvent.keyDown(hex, { key: 'Enter' });
    expect(screen.getByTestId('v').textContent).toBe('#00ff00');
    fireEvent.click(pop.getByLabelText('Recent · #123456'));
    expect(screen.getByTestId('v').textContent).toBe('#123456');
    fireEvent.click(pop.getByText('No colour'));
    expect(screen.getByTestId('v').textContent).toBe('undefined');
  });

  test('gradient editor: add a stop on the bar, recolour it, remove it, switch type, apply a preset', () => {
    const Host = () => { const [g, setG] = React.useState(defaultGradient('#000000', '#ffffff')); return <><GradientEditor value={g} onChange={setG} /><output data-testid="g">{JSON.stringify(g)}</output></>; };
    render(<Host />);
    const value = () => JSON.parse(screen.getByTestId('g').textContent!);
    const bar = screen.getByTitle('Click to add a colour stop');
    (bar as any).getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 24, right: 200, bottom: 24 });
    fireEvent.click(bar, { clientX: 100 });
    expect(value().stops.map((s: any) => s.offset)).toEqual([0, 0.5, 1]);
    expect(screen.getByText('Stop 2 of 3')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Gradient angle'), { target: { value: '45' } });
    expect(value().angle).toBe(45);
    fireEvent.click(screen.getByText('Remove'));
    expect(value().stops).toHaveLength(2);
    expect(screen.getByText('Remove')).toBeDisabled(); // two stops is the minimum
    fireEvent.click(screen.getByLabelText('Preset Gold'));
    expect(value().stops).toHaveLength(3);
    fireEvent.click(screen.getByText('Reverse'));
    expect(value().stops[0].color).toBe('#92400e');
  });

  test('fill section: Colour / Gradient / Image tabs write fill, gradient and the frame picture', () => {
    let el = rect();
    const edit = (_f: string, fn: (e: LayoutElement) => LayoutElement) => { el = fn(el); view.rerender(<FillSection el={el} edit={edit} resolvedFill="#111827" />); };
    const view = render(<FillSection el={el} edit={edit} resolvedFill="#111827" />);
    fireEvent.click(screen.getByRole('tab', { name: /Gradient/ }));
    expect(el.style!.gradient!.stops[0].color).toBe('#111827'); // starts from the colour it had
    expect(screen.getByTestId('gradient-editor')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Remove gradient'));
    expect(el.style!.gradient).toBeUndefined();
    fireEvent.click(screen.getByRole('tab', { name: /Image/ }));
    fireEvent.change(within(screen.getByTestId('frame-image')).getByRole('textbox'), { target: { value: '/portrait.png' } });
    expect(el.imageFill).toEqual({ src: '/portrait.png' });
    fireEvent.change(screen.getByLabelText('Zoom inside the frame'), { target: { value: '150' } });
    expect(el.imageFill).toEqual({ src: '/portrait.png', scale: 1.5 });
    fireEvent.click(screen.getByText('Remove'));
    expect(el.imageFill).toBeUndefined();
    expect(el.style).toEqual({ fill: '#111827', stroke: '#ffffff', strokeWidth: 2 }); // the frame is as it was
  });
});

// ── data ─────────────────────────────────────────────────────────────────────

describe('data binding checks', () => {
  test('value kinds are read from the value itself', () => {
    expect([valueKind('Alpha'), valueKind(12), valueKind('12'), valueKind(true), valueKind('/def_logo.avif'), valueKind(`asset:${A1}`), valueKind('#ff0000'), valueKind([1]), valueKind({}), valueKind(null), valueKind('')])
      .toEqual(['text', 'number', 'number', 'boolean', 'image', 'image', 'color', 'list', 'object', 'empty', 'empty']);
  });

  test('a field must fit the property it drives', () => {
    expect(bindingProblem('text', 'Alpha')).toBeNull();
    expect(bindingProblem('text', 12)).toBeNull();
    expect(bindingProblem('text', [{ a: 1 }])).toMatchObject({ level: 'error' });       // a list is not a text
    expect(bindingProblem('text', { teamName: 'A' })).toMatchObject({ level: 'error' });
    expect(bindingProblem('src', '/logo.png')).toBeNull();
    expect(bindingProblem('src', 'Alpha')).toMatchObject({ level: 'warning' });
    expect(bindingProblem('src', 12)).toMatchObject({ level: 'error' });
    expect(bindingProblem('opacity', 0.5)).toBeNull();
    expect(bindingProblem('width', 'wide')).toMatchObject({ level: 'error' });
    expect(bindingProblem('fill', '#ff0000')).toBeNull();
    expect(bindingProblem('fill', 3)).toMatchObject({ level: 'error' });
    expect(bindingProblem('visible', [1, 2])).toMatchObject({ level: 'warning' });      // always "yes"
    expect(bindingProblem('value', null)).toBeNull();                                   // empty: the fallback's business
  });

  test('a dropped field picks the property that fits; nothing fits a list', () => {
    expect(defaultPropFor(['text', 'color', 'visible', 'opacity'], 'text')).toBe('text');
    expect(defaultPropFor(['src', 'visible', 'opacity'], 'image')).toBe('src');
    expect(defaultPropFor(['fill', 'stroke', 'src', 'visible', 'opacity'], 'image')).toBe('src');
    expect(defaultPropFor(['fill', 'stroke', 'src', 'visible', 'opacity'], 'color')).toBe('fill');
    expect(defaultPropFor(['fill', 'stroke', 'visible', 'opacity'], 'boolean')).toBe('visible');
    expect(defaultPropFor(['value', 'max', 'color', 'fill', 'visible'], 'number')).toBe('value');
    expect(defaultPropFor(['src', 'visible', 'opacity'], 'text')).toBe('visible');
    expect(propsForKind(['text'], 'list')).toEqual([]);
  });

  test('the field list is built from the scope that bindings resolve in: only what is there, bounded, searchable', () => {
    const scope: any = { tournament: { tournamentName: 'Invitational', _id: 'hidden', torLogo: '/logo.png' }, derived: { teams: [{ teamName: 'Alpha', players: [{ playerName: 'P1', killNum: 3 }] }, { teamName: 'Bravo' }] }, live: { aliveTeamsCount: 12 }, item: { teamName: 'Alpha' }, rank: 1 };
    const fields = listFields(scope);
    const paths = fields.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(['tournament.tournamentName', 'derived.teams.length', 'derived.teams[0].teamName', 'derived.teams[0].players[0].killNum', 'live.aliveTeamsCount', 'item.teamName', 'rank']));
    expect(paths).not.toContain('tournament._id');              // bookkeeping is not offered
    expect(paths).not.toContain('derived.teams[1].teamName');   // a list shows the shape of one item
    expect(paths.some((p) => p.startsWith('round'))).toBe(false); // not in the scope: not invented
    for (const f of fields) expect(bindings.resolvePathDetailed(scope, f.path).found).toBe(true); // every listed field really resolves
    expect(fields.find((f) => f.path === 'tournament.torLogo')).toMatchObject({ kind: 'image', category: 'tournament' });
    expect(fields.find((f) => f.path === 'item.teamName')).toMatchObject({ category: 'row', description: 'Full team name', label: 'teamName' });
    expect(searchFields(fields, 'kills player').map((f) => f.path)).toEqual(['derived.teams[0].players[0].killNum']);
    expect(describeField('some.unknownField')).toBeUndefined();
  });

  test('connections in a design report ok / missing / wrong kind, per row scope', () => {
    const doc = docWith([
      { id: 'name', type: 'text', name: 'Tournament', x: 0, y: 0, w: 10, h: 10, bind: { text: { path: 'tournament.tournamentName' } } },
      { id: 'gone', type: 'text', name: 'Sponsor', x: 0, y: 0, w: 10, h: 10, bind: { text: { path: 'tournament.sponsorName', fallback: 'TBA' } } },
      { id: 'bad', type: 'text', name: 'Teams', x: 0, y: 0, w: 10, h: 10, bind: { text: { path: 'derived.teams' } } },
      { id: 'list', type: 'repeater', name: 'Rows', x: 0, y: 0, w: 10, h: 10, repeater: { source: 'derived.teams', limit: 5, direction: 'column' }, children: [{ id: 'row', type: 'text', name: 'Team name', x: 0, y: 0, w: 10, h: 10, bind: { text: { path: 'item.teamName' } } }] },
    ]);
    const state: any = { tournament: { tournamentName: 'Invitational' }, derived: { teams: [{ teamId: 't1', teamName: 'Alpha' }] } };
    const c = listConnections(doc, state, {}, null);
    expect(c.map((x) => [x.layer, x.status])).toEqual([['Tournament', 'ok'], ['Sponsor', 'missing'], ['Teams', 'error'], ['Team name', 'ok']]);
    expect(c[1].detail).toMatch(/fallback “TBA”/);
    expect(c[3].detail).toBe('= Alpha'); // resolved inside its list row
  });

  test('simulation scenarios drive the same controls as the buttons', () => {
    const calls: string[] = [];
    const controls: any = new Proxy({}, { get: (_t, k: string) => () => { calls.push(k); } });
    expect(SIM_SCENARIOS.map((s) => s.id)).toEqual(['start', 'early', 'mid', 'final', 'ended']);
    expect(runScenario(controls, 'ended')).toBe(true);
    expect(calls[0]).toBe('reset');
    expect(calls[calls.length - 1]).toBe('matchEnd');
    expect(runScenario(controls, 'nope')).toBe(false);
  });
});

// ── publish ──────────────────────────────────────────────────────────────────

describe('publish checks', () => {
  const state: any = { tournament: { tournamentName: 'Invitational', logo: '/logo.png' }, derived: { teams: [{ teamId: 't1', teamName: 'Alpha' }] } };
  const check = (doc: LayoutDocument, over: any = {}) => checkPublish(doc, { name: 'MVP Reveal', state, assetIds: new Set([A1]), ...over });
  const messages = (issues: Array<{ layer: string; message: string }>) => issues.map((i) => `${i.layer}: ${i.message}`);

  test('a clean design passes, with a summary of what it uses', () => {
    const doc = docWith([
      { id: 'a', type: 'text', name: 'Player Name', x: 10, y: 10, w: 300, h: 40, bind: { text: { path: 'tournament.tournamentName' } }, timeline: { clips: [{ id: 'c', trigger: { type: 'enter' }, duration: 300, tracks: [{ prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 300, value: 1 }] }] }] } },
      rect({ id: 'b', name: 'Player Portrait', imageFill: { src: assetRef(A1) } }),
    ]);
    const r = check(doc);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.summary).toEqual({ layers: 2, boundLayers: 1, animatedLayers: 1, animations: 1, dataSources: ['Tournament'], images: 1 });
  });

  test('errors name the layer and say what to do: missing image, unusable field, empty list, invalid document, no name', () => {
    const doc = docWith([
      rect({ id: 'p', name: 'Player Portrait', imageFill: { src: assetRef(A2) } }),
      { id: 'n', type: 'text', name: 'Player Name', x: 0, y: 0, w: 100, h: 20, bind: { text: { path: 'derived.teams' } } },
      { id: 'l', type: 'repeater', name: 'Standings', x: 0, y: 0, w: 100, h: 100, repeater: { source: 'derived.teams', limit: 5, direction: 'column' }, children: [] },
      { id: 'w', type: 'text', name: 'Winner Banner', x: 0, y: 0, w: 100, h: 20, text: 'WWCD', style: { fill: 'url(javascript:alert(1))' } as any },
    ], { stage: { width: 1920, height: 1080, background: null, backgroundImage: assetRef(A2) } });
    const r = check(doc, { name: '  ' });
    const m = messages(r.errors);
    expect(m).toEqual(expect.arrayContaining([
      'Design: Give the design a name before publishing.',
      'Player Portrait: The selected picture is no longer in your library. Replace it or remove it.',
      'Canvas: The background image is no longer in your library. Choose another one or remove it.',
      'Standings: This list has nothing to repeat. Put a layer inside it (a row design), or delete it.',
    ]));
    expect(m.find((x) => x.startsWith('Player Name: derived.teams for the text: This field is a list'))).toBeTruthy();
    expect(m.find((x) => x.startsWith('Winner Banner: Its style is not valid'))).toBeTruthy();
    expect(r.errors.find((e) => e.layer === 'Player Portrait')!.elementId).toBe('p'); // so the dialog can jump to it
  });

  test('warnings do not block: a field missing from the data, an empty text, a layer off the canvas, an empty list', () => {
    const doc = docWith([
      { id: 'n', type: 'text', name: 'Player Name', x: 0, y: 0, w: 100, h: 20, bind: { text: { path: 'tournament.sponsorName' } } },
      { id: 'f', type: 'text', name: 'Sponsor', x: 0, y: 0, w: 100, h: 20, bind: { text: { path: 'tournament.sponsorName', fallback: 'TBA' } } },
      { id: 'e', type: 'text', name: 'Caption', x: 0, y: 0, w: 100, h: 20 },
      rect({ id: 'o', name: 'Lost panel', x: 5000, y: 100 }),
      { id: 'l', type: 'repeater', name: 'Fraggers', x: 0, y: 0, w: 100, h: 100, repeater: { source: 'derived.fraggers', limit: 5, direction: 'column' }, children: [{ id: 'lr', type: 'rect', x: 0, y: 0, w: 10, h: 10 }] },
      { id: 'ev', type: 'text', name: 'Killer', x: 0, y: 0, w: 100, h: 20, bind: { text: { path: 'event.payload.player.playerName' } } },
      { id: 'h', type: 'text', name: 'Hidden note', x: 0, y: 0, w: 100, h: 20, hidden: true },
    ]);
    const r = check(doc);
    expect(r.errors).toEqual([]);
    const m = messages(r.warnings);
    expect(m.find((x) => x.startsWith('Player Name: The selected data field for the text (tournament.sponsorName) is not in the current data.') && /consider a fallback/.test(x))).toBeTruthy();
    expect(m.find((x) => x.startsWith('Sponsor:') && /fallback “TBA” is shown/.test(x))).toBeTruthy();
    expect(m).toEqual(expect.arrayContaining([
      'Caption: This text layer is empty.',
      'Lost panel: This layer is completely outside the canvas, so it is not visible.',
      'Fraggers: Its list (derived.fraggers) is empty in the current data, so no rows are drawn.',
    ]));
    expect(m.some((x) => x.startsWith('Killer'))).toBe(false);      // event data only exists while the event is on screen
    expect(m.some((x) => x.startsWith('Hidden note'))).toBe(false); // a hidden layer is never drawn
  });

  test('without data or an image library those checks are skipped, not guessed', () => {
    const doc = docWith([rect({ imageFill: { src: assetRef(A2) }, bind: { src: { path: 'tournament.nothing' } } })]);
    const r = checkPublish(doc, { name: 'X', state: null, assetIds: null });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  test('the dialog: problems block Publish; warnings need a tick; clicking an issue goes to its layer', async () => {
    const onSelectElement = jest.fn();
    const publish = jest.fn(async () => ({ publishedRev: 4 }));
    const flush = jest.fn(async () => {});
    const base = { layoutId: 'aaaaaaaaaaaaaaaaaaaaaaaa', layoutName: 'MVP Reveal', themes: null, onThemesChanged: jest.fn(), publicId: 'pubAAAAAAAAAA', publishedRev: 3, defaults: { tournamentId: null, roundId: null, matchMode: 'selectedMatch' as const }, flush, publish, onClose: jest.fn(), onSelectPath: jest.fn(), onSelectElement, check: { state, assetIds: new Set([A1]) } };

    const broken = docWith([rect({ id: 'p', name: 'Player Portrait', imageFill: { src: assetRef(A2) } })]);
    const view = render(<PublishDialog {...base} doc={broken} />);
    const summary = within(screen.getByTestId('publish-summary'));
    expect(summary.getByText('MVP Reveal')).toBeInTheDocument();
    expect(summary.getByText(/^4 \(replaces 3 on air/)).toBeInTheDocument();
    expect(summary.getByText(/1920 × 1080 · 16:9 · transparent/)).toBeInTheDocument();
    expect(screen.getByTestId('publish-checks').textContent).toBe('1 problem to fix');
    expect(screen.getByText('Publish').closest('button')).toBeDisabled();
    fireEvent.click(within(screen.getByTestId('publish-issues')).getByText(/no longer in your library/));
    expect(onSelectElement).toHaveBeenCalledWith('p');

    const warned = docWith([{ id: 'e', type: 'text', name: 'Caption', x: 0, y: 0, w: 100, h: 20 }]);
    view.rerender(<PublishDialog {...base} doc={warned} />);
    expect(screen.getByTestId('publish-checks').textContent).toBe('Passed, with 1 warning');
    expect(screen.getByText('Publish').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByTestId('publish-accept'));
    expect(screen.getByText('Publish').closest('button')).not.toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByText('Publish')); });
    expect(flush).toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Published successfully')).toBeInTheDocument();
  });

  test('a failed publish shows the server\'s message and never claims success', async () => {
    const publish = jest.fn(async () => { throw { response: { status: 500, data: { message: 'Database is unreachable' } } }; });
    render(<PublishDialog doc={docWith([rect()])} layoutId="a" layoutName="X" themes={null} onThemesChanged={jest.fn()} publicId="pubAAAAAAAAAA" publishedRev={0} defaults={{ tournamentId: null, roundId: null, matchMode: 'selectedMatch' }} flush={async () => {}} publish={publish} onClose={jest.fn()} onSelectPath={jest.fn()} check={{ state, assetIds: null }} />);
    await act(async () => { fireEvent.click(screen.getByText('Publish')); });
    expect(await screen.findByText('Database is unreachable')).toBeInTheDocument();
    expect(screen.queryByText('Published successfully')).toBeNull();
    expect(screen.getByText('Retry publish')).toBeInTheDocument();
  });
});

// ── layers ───────────────────────────────────────────────────────────────────

test('layers: marks say what a layer does; search finds nested layers by name or type', () => {
  const els: LayoutElement[] = [
    rect({ id: 'a', name: 'Portrait', imageFill: { src: '/p.png' }, bind: { src: { path: 'item.teamLogo' } }, mask: { shape: 'ellipse' } }),
    { id: 'g', type: 'group', name: 'Card', x: 0, y: 0, w: 10, h: 10, children: [{ id: 't', type: 'text', name: 'Player Name', x: 0, y: 0, w: 10, h: 10, visibleWhen: { path: 'match.matchNo', op: 'exists' }, timeline: { clips: [{ id: 'c', trigger: { type: 'enter' }, duration: 100, tracks: [] }] } }] },
  ];
  expect(layerMarks(els[0]).map((m) => m.key)).toEqual(['data', 'frame', 'mask']);
  expect(layerMarks(els[1].children![0]).map((m) => m.key)).toEqual(['when', 'anim']);
  expect(layerMarks(rect())).toEqual([]);
  expect(searchLayers(els, 'player').map((e) => e.id)).toEqual(['t']);
  expect(searchLayers(els, 'GROUP').map((e) => e.id)).toEqual(['g']);
  expect(searchLayers(els, '')).toEqual([]);
});

// ── asset library UI ─────────────────────────────────────────────────────────

describe('asset library', () => {
  const asset = (over: any = {}) => ({ _id: A1, name: 'Team logo', mime: 'image/png', size: 2048, width: 512, height: 512, hasThumb: true, ...over });
  function Host({ onPick = () => {} }: { onPick?: (a: any) => void }) {
    const library = useAssetLibrary();
    return <AssetGrid library={library} manage onPick={onPick} />;
  }

  test('lists images with their size, picks one, and refuses files that are not images before any upload', async () => {
    mockApi.get.mockResolvedValue({ data: [asset()] });
    const onPick = jest.fn();
    render(<Host onPick={onPick} />);
    expect(await screen.findByText('Team logo')).toBeInTheDocument();
    expect(screen.getByText('512 × 512 · 2.0 KB')).toBeInTheDocument();
    expect(document.querySelector(`[data-asset-id="${A1}"] img`)!.getAttribute('src')).toBe(`http://backend.test/api/overlay-assets/thumb/${A1}`);
    fireEvent.click(screen.getByLabelText('Use Team logo'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ _id: A1 }));

    await act(async () => { fireEvent.change(screen.getByTestId('asset-file-input'), { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } }); });
    expect(screen.getByText('Only PNG, JPEG, WebP and SVG images can be uploaded.')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  test('an upload shows up when the server accepted it; a failed one says why and adds nothing', async () => {
    mockApi.get.mockResolvedValue({ data: [] });
    mockApi.post.mockImplementationOnce(async (_url: string, _body: any, cfg: any) => { cfg.onUploadProgress?.({ loaded: 5, total: 10 }); return { data: asset({ _id: A2, name: 'portrait', hasThumb: true }) }; })
      .mockRejectedValueOnce({ response: { status: 413, data: { message: 'Image is 9000×100 — the largest side allowed is 8192 px' } } });
    render(<Host />);
    await screen.findByText(/No images yet/);
    await act(async () => { fireEvent.change(screen.getByTestId('asset-file-input'), { target: { files: [new File(['a'], 'portrait.png', { type: 'image/png' }), new File(['b'], 'huge.png', { type: 'image/png' })] } }); });
    expect(await screen.findByText('portrait')).toBeInTheDocument();
    expect(mockApi.post.mock.calls[0][0]).toBe('/overlay-assets');
    expect(mockApi.post.mock.calls[0][2].params).toEqual({ name: 'portrait.png' });
    expect(await screen.findByText(/largest side allowed is 8192 px/)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-asset-id]')).toHaveLength(1);
    expect(document.querySelector('[data-upload="error"]')).not.toBeNull();
  });

  test('deleting an image a draft uses asks first; one that is on air is refused outright', async () => {
    mockApi.get.mockResolvedValue({ data: [asset()] });
    mockApi.delete
      .mockRejectedValueOnce({ response: { status: 409, data: { message: 'This image is used by 2 designs.', code: 'ASSET_IN_USE', usedBy: { drafts: 2, published: 0 } } } })
      .mockResolvedValueOnce({ data: null });
    render(<Host />);
    await screen.findByText('Team logo');
    await act(async () => { fireEvent.click(screen.getByText('Delete')); });
    expect(await screen.findByText(/is used by 2 designs/)).toBeInTheDocument();
    expect(document.querySelector('[data-asset-id]')).not.toBeNull(); // still there
    await act(async () => { fireEvent.click(screen.getByText('Delete anyway')); });
    expect(mockApi.delete).toHaveBeenLastCalledWith(`/overlay-assets/${A1}`, { params: { force: 1 } });
    expect(document.querySelector('[data-asset-id]')).toBeNull();
  });

  test('an image on air cannot be deleted', async () => {
    mockApi.get.mockResolvedValue({ data: [asset()] });
    mockApi.delete.mockRejectedValue({ response: { status: 409, data: { message: 'This image is on air: 1 published revision use it. Delete or republish those designs first.', code: 'ASSET_PUBLISHED', usedBy: { drafts: 1, published: 1 } } } });
    render(<Host />);
    await screen.findByText('Team logo');
    await act(async () => { fireEvent.click(screen.getByText('Delete')); });
    expect(await screen.findByText(/This image is on air/)).toBeInTheDocument();
    expect(screen.queryByText('Delete anyway')).toBeNull();
    expect(document.querySelector('[data-asset-id]')).not.toBeNull();
  });
});

// ── performance (structure, not frame rates: those are profiled in a browser) ─

describe('a 500-layer design', () => {
  const doc = buildPerfDocument(500);

  test('is a valid document of mixed layers', () => {
    expect(doc.elements).toHaveLength(500);
    expect(validateLayout(doc).ok).toBe(true);
    expect(new Set(doc.elements.map((e) => e.type))).toEqual(new Set(['text', 'rect', 'ellipse', 'polygon']));
    expect(JSON.stringify(doc).length).toBeLessThan(512 * 1024); // inside the save limit, with no image bytes in it
    expect(JSON.stringify(doc)).not.toMatch(/data:image|base64/);
  });

  test('a drag is one history step however many pointer moves it has, and history stays bounded', () => {
    let st = initEditor(doc);
    for (let i = 1; i <= 240; i++) st = editorReducer(st, { type: 'exec', cmd: editElements(st.doc, ['l7'], (e) => ({ ...e, x: e.x + 1 }), 'Transform', 'move:1')!, now: 1000 + i });
    expect(st.past).toHaveLength(1);
    expect(st.doc.elements[7].x).toBe(doc.elements[7].x + 240);
    // every untouched layer is the very same object: nothing else is rebuilt
    expect(st.doc.elements.filter((e, i) => e !== doc.elements[i])).toHaveLength(1);
    st = editorReducer(st, { type: 'undo' });
    expect(st.doc.elements[7].x).toBe(doc.elements[7].x); // and one undo takes the whole drag back
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) st = editorReducer(st, { type: 'exec', cmd: editElements(st.doc, ['l1'], (e) => ({ ...e, y: e.y + 1 }), 'Nudge')!, now: 1e6 + i * 5000 });
    expect(st.past.length).toBe(HISTORY_LIMIT);
  });

  test('moving one layer re-renders that layer only, and makes no request', () => {
    const spy = jest.spyOn(bindings, 'resolveBoundProps');
    const { rerender } = render(<LayoutRenderer layout={doc} state={null} events={null} fit={1} mode="editor" playTimelines={false} />);
    expect(document.querySelectorAll('[data-element-id]')).toHaveLength(500);
    const moved = { ...doc, elements: doc.elements.map((e, i) => (i === 42 ? { ...e, x: e.x + 30 } : e)) };
    rerender(<LayoutRenderer layout={moved} state={null} events={null} fit={1} mode="editor" playTimelines={false} />);
    spy.mockClear();
    const started = Date.now();
    const again = { ...moved, elements: moved.elements.map((e, i) => (i === 42 ? { ...e, x: e.x + 30 } : e)) };
    rerender(<LayoutRenderer layout={again} state={null} events={null} fit={1} mode="editor" playTimelines={false} />);
    expect(spy.mock.calls.map((c: any[]) => (c[0] as LayoutElement).id)).toEqual(['l42']);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(mockApi.get).not.toHaveBeenCalled();
    expect(mockApi.put).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
