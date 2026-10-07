import { decideSwap, prepareLayout, staticAssetUrls } from '../runtime/loadLayout.ts';
import { createEmptyLayout } from '../schema/layoutSchema.js';

const payload = (rev: number, elements: any[]) => ({
  publicId: 'abcDEF123456',
  name: 'x',
  publishedRev: rev,
  publishedAt: null,
  schemaVersion: 1,
  stage: { width: 1920, height: 1080, background: null },
  defaults: { tournamentId: null, roundId: null, matchMode: 'selectedMatch' as const },
  assetBase: '',
  published: { ...createEmptyLayout(), elements } as any,
});

const ok = (id: string) => ({ id, type: 'text', x: 0, y: 0, w: 10, h: 10, text: id });

test('first valid layout swaps in', () => {
  const d = decideSwap(null, payload(1, [ok('a')]));
  expect(d.action).toBe('swap');
});

test('same or older revision is kept', () => {
  const cur = (prepareLayout(payload(3, [ok('a')])) as any).layout;
  expect(decideSwap(cur, payload(3, [ok('b')])).action).toBe('keep');
  expect(decideSwap(cur, payload(2, [ok('b')]))).toEqual({ action: 'keep', reason: 'older-revision' });
});

test('an invalid new revision never replaces a valid running one', () => {
  const cur = (prepareLayout(payload(1, [ok('a')])) as any).layout;
  const bad = payload(2, [{ id: 'x', type: 'image', x: 0, y: 0, w: 1, h: 1, src: 'javascript:alert(1)' }]);
  const d = decideSwap(cur, bad);
  expect(d.action).toBe('keep');
  expect((d as any).reason).toBe('invalid');
  expect(decideSwap(cur, payload(2, [ok('b')])).action).toBe('swap');
});

test('static assets are collected for preloading (bound ones skipped)', () => {
  const doc: any = {
    ...createEmptyLayout(),
    elements: [
      { id: 'bg', type: 'image', x: 0, y: 0, w: 1, h: 1, src: '/bg.png' },
      { id: 'logo', type: 'teamLogo', x: 0, y: 0, w: 1, h: 1, src: '/x.png', bind: { src: { path: 'item.teamLogo' } }, fallbackSrc: '/def_logo.avif' },
    ],
  };
  expect(staticAssetUrls(doc, 'https://cdn.example.com')).toEqual([
    'https://cdn.example.com/bg.png',
    'https://cdn.example.com/def_logo.avif',
  ]);
});
