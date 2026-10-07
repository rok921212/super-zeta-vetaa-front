import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createEmptyLayout } from '../schema/layoutSchema.js';
import type { LayoutDocument } from '../schema/layoutTypes.ts';

// The app's axios instance: every call is a jest mock (no network).
jest.mock('../../login/api.tsx', () => {
  const api = { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return {
    __esModule: true,
    default: api,
    DEFAULT_BACKEND: 'http://backend.test',
    RELAY_ORIGIN: 'http://127.0.0.1:8787',
    isOverlayRoute: () => false,
    isUsingRelay: () => false,
    getBackendOrigin: () => 'http://backend.test',
    getRelayOrigin: () => null,
    markRelayUnreachable: jest.fn(),
    markRelayReachable: jest.fn(),
  };
});
jest.mock('../../dashboard/isPolling.tsx', () => ({ __esModule: true, default: () => null, stopAllPolling: jest.fn() }));
jest.mock('../../dashboard/socketManager', () => ({ __esModule: true, default: { getInstance: () => ({ connect: () => ({ on() {}, off() {}, emit() {}, connected: false }), updateAuthToken() {}, forceDisconnect() {} }) } }));

// eslint-disable-next-line import/first
import api from '../../login/api.tsx';
// eslint-disable-next-line import/first
import { CACHE_KEYS, cached, clearCache, dropMemoryCache, invalidate, isFresh, peek, setCached, ttlFor, useCached } from '../requestCache.ts';
// eslint-disable-next-line import/first
import { anchorScrollDelta, wheelZoom, ZOOM_MAX, ZOOM_MIN } from '../editor/zoom.ts';
// eslint-disable-next-line import/first
import { AutosaveController } from '../editor/autosave.ts';
// eslint-disable-next-line import/first
import { InfoButton, QuickStart } from '../editor/Help.tsx';
// eslint-disable-next-line import/first
import { HELP } from '../editor/helpContent.ts';
// eslint-disable-next-line import/first
import DesignerEditorPage from '../editor/DesignerEditor.tsx';

const mockApi = api as unknown as Record<'get' | 'post' | 'put' | 'patch' | 'delete', jest.Mock>;

beforeEach(() => {
  clearCache();
  localStorage.clear();
  Object.values(mockApi).forEach((m) => typeof m === 'function' && 'mockReset' in m && m.mockReset());
});

// ── zoom ────────────────────────────────────────────────────────────────────

describe('canvas zoom', () => {
  test('wheel up zooms in, down zooms out, within limits; pinch deltas are scaled', () => {
    expect(wheelZoom(0.5, -100)).toBeGreaterThan(0.5);
    expect(wheelZoom(0.5, 100)).toBeLessThan(0.5);
    expect(wheelZoom(0.5, -3, { deltaMode: 1 })).toBeCloseTo(wheelZoom(0.5, -48), 3); // line mode = 16px a line
    expect(wheelZoom(1, -10, { pinch: true })).toBeGreaterThan(wheelZoom(1, -10));
    expect(wheelZoom(ZOOM_MAX, -100000)).toBe(ZOOM_MAX);
    expect(wheelZoom(ZOOM_MIN, 100000)).toBe(ZOOM_MIN);
    expect(wheelZoom(1, -100000)).toBeLessThanOrEqual(1.65); // one event never jumps more than ~1.6x
  });

  test('the stage point under the cursor stays under the cursor', () => {
    // cursor at client (500, 300); stage starts at (100, 50) at 50% -> stage point (800, 500)
    const before = { left: 100, top: 50, zoom: 0.5 };
    // after zooming to 100% the (re-centred) stage sits at (-60, -20)
    const after = { left: -60, top: -20, zoom: 1 };
    const { dx, dy } = anchorScrollDelta({ pointer: { x: 500, y: 300 }, before, after });
    // scrolling by (dx, dy) moves the stage to (left - dx, top - dy)
    expect((after.left - dx) + 800 * after.zoom).toBe(500);
    expect((after.top - dy) + 500 * after.zoom).toBe(300);
  });
});

// ── request cache ───────────────────────────────────────────────────────────

describe('request cache', () => {
  test('one request per key: concurrent callers share it, later callers reuse the value', async () => {
    const fetcher = jest.fn(async () => ['a']);
    const [x, y] = await Promise.all([cached('k', fetcher), cached('k', fetcher)]);
    expect(x).toBe(y);
    expect(await cached('k', fetcher)).toEqual(['a']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(isFresh('k')).toBe(true);
  });

  test('ttl, force, invalidate and write-through', async () => {
    let n = 0;
    const fetcher = jest.fn(async () => ++n);
    expect(await cached('k', fetcher)).toBe(1);
    expect(await cached('k', fetcher, { ttlMs: 0 })).toBe(2); // expired
    expect(await cached('k', fetcher, { force: true })).toBe(3);
    setCached<number>('k', (cur) => (cur || 0) + 100);
    expect(await cached('k', fetcher)).toBe(103); // no request
    expect(fetcher).toHaveBeenCalledTimes(3);
    invalidate('k');
    expect(peek('k')).toBe(103); // stale value is still shown…
    expect(await cached('k', fetcher)).toBe(4); // …and the next use refetches
  });

  test('a failed request is not cached and does not poison the key', async () => {
    const fetcher = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
    await expect(cached('k', fetcher)).rejects.toThrow('boom');
    expect(await cached('k', fetcher)).toBe('ok');
  });

  test('keys are per account', async () => {
    localStorage.setItem('user', JSON.stringify({ token: 'token-of-alice-0001' }));
    await cached('k', async () => 'alice');
    localStorage.setItem('user', JSON.stringify({ token: 'token-of-bob-00002' }));
    expect(peek('k')).toBeUndefined();
    expect(await cached('k', async () => 'bob')).toBe('bob');
  });

  test('useCached: remounting does not refetch; an invalidation elsewhere does', async () => {
    const fetcher = jest.fn(async () => ['t1']);
    function Probe() { const q = useCached<string[]>('list', fetcher); return <div data-testid="v">{q.data ? q.data.join(',') : 'loading'}</div>; }
    const a = render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('t1'));
    a.unmount();
    for (let i = 0; i < 4; i++) { const r = render(<Probe />); expect(screen.getByTestId('v')).toHaveTextContent('t1'); r.unmount(); }
    expect(fetcher).toHaveBeenCalledTimes(1);

    render(<Probe />);
    fetcher.mockResolvedValueOnce(['t1', 't2']);
    act(() => invalidate('list'));
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('t1,t2'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

// ── autosave ────────────────────────────────────────────────────────────────

describe('saving skips a draft the server already has', () => {
  const doc = (n: number): LayoutDocument => ({ ...(createEmptyLayout() as LayoutDocument), variables: { n } });

  test('undo back to the loaded document sends nothing; a real change still saves', async () => {
    const save = jest.fn(async (rev: number) => ({ draftRev: rev + 1 }));
    const statuses: string[] = [];
    const c = new AutosaveController({ rev: 1, savedDraft: doc(0), save, onStatus: (s) => statuses.push(s) });
    c.change(doc(1));
    c.change(doc(0)); // undone before saving
    await c.save();
    expect(save).not.toHaveBeenCalled();
    expect(c.status).toBe('saved');

    c.change(doc(2));
    await c.save();
    expect(save).toHaveBeenCalledTimes(1);
    c.change(doc(2)); // identical to what was just saved
    await c.save();
    expect(save).toHaveBeenCalledTimes(1);
  });

  test('a rename is still sent even when the draft is unchanged, without the draft', async () => {
    const save = jest.fn(async (rev: number, _patch: any) => ({ draftRev: rev + 1 }));
    const c = new AutosaveController({ rev: 1, savedDraft: doc(0), save });
    c.change(doc(0));
    c.changeMeta({ name: 'New name' });
    await c.save();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1]).toEqual({ name: 'New name' });
  });

  test('after a restore / conflict (resume) the next save is never skipped', async () => {
    const save = jest.fn(async (rev: number) => ({ draftRev: rev + 1 }));
    const c = new AutosaveController({ rev: 1, savedDraft: doc(0), save });
    c.resume(5, false); // the server draft is now something else
    c.change(doc(0));
    await c.save();
    expect(save).toHaveBeenCalledTimes(1);
  });
});

// ── help ────────────────────────────────────────────────────────────────────

describe('guidance', () => {
  test('every help entry has a title and something to read', () => {
    for (const [key, e] of Object.entries(HELP)) {
      expect({ key, ok: !!e.title && !!(e.intro || e.steps?.length || e.tips?.length) }).toEqual({ key, ok: true });
    }
  });

  test('an info button opens its card, and works inside a read-only (disabled) panel', () => {
    render(<fieldset disabled><InfoButton topic="data" /></fieldset>);
    expect(screen.queryByTestId('help-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Help: Connect to data' }));
    const card = screen.getByTestId('help-card');
    expect(card).toHaveTextContent('Select data');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('help-card')).toBeNull();
  });

  test('quick start lists the four steps', () => {
    const onClose = jest.fn();
    render(<QuickStart onClose={onClose} />);
    for (const s of ['1 · Add', '2 · Connect data', '3 · Animate', '4 · Publish']) expect(screen.getByText(s)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start designing'));
    expect(onClose).toHaveBeenCalled();
  });
});

// ── the editor shell ────────────────────────────────────────────────────────

const LAYOUT_ID = '65f0000000000000000000c1';
const layoutFull = (over: any = {}) => ({
  _id: LAYOUT_ID, name: 'My overlay', publicId: 'AbCdEf123456', schemaVersion: 1, draftRev: 1, publishedRev: 0, publishedAt: null,
  productionLocked: false, defaults: { tournamentId: null, roundId: null, matchMode: 'selectedMatch' }, assetBase: '',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  draft: { ...createEmptyLayout(), elements: [{ id: 'title', type: 'text', name: 'Title', x: 100, y: 100, w: 400, h: 60, text: 'HELLO' }] },
  ...over,
});

function mountEditor() {
  mockApi.get.mockImplementation(async (url: string) => {
    if (url === `/overlay-layouts/${LAYOUT_ID}`) return { data: layoutFull() };
    if (url === '/tournaments') return { data: [{ _id: 't1', tournamentName: 'Cup' }] };
    return { data: [] };
  });
  return render(
    <MemoryRouter initialEntries={[`/designer/${LAYOUT_ID}`]}>
      <Routes><Route path="/designer/:id" element={<DesignerEditorPage />} /></Routes>
    </MemoryRouter>
  );
}
const calls = (url: string) => mockApi.get.mock.calls.filter((c: any[]) => c[0] === url).length;

describe('editor', () => {
  test('first visit shows the quick start once; the Guide button brings it back', async () => {
    mountEditor();
    expect(await screen.findByTestId('quick-start')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start designing'));
    expect(screen.queryByTestId('quick-start')).toBeNull();
    expect(localStorage.getItem('designer.guide.seen')).toBe('1');
    fireEvent.click(screen.getByTestId('guide-button'));
    expect(screen.getByTestId('quick-start')).toBeInTheDocument();
  });

  test('each panel has its own help; the dock opens on simple rules', async () => {
    localStorage.setItem('designer.guide.seen', '1');
    mountEditor();
    await screen.findByText('Title');
    expect(document.querySelector('[data-help="layers"]')).toBeInTheDocument(); // left panel
    expect(document.querySelector('[data-help="document"]')).toBeInTheDocument(); // right panel, nothing selected
    expect(document.querySelector('[data-help="liveData"]')).toBeInTheDocument();
    const dock = screen.getByTestId('animate-dock');
    expect(within(dock).getByTestId('animate-panel')).toBeInTheDocument();
    expect(within(dock).getByRole('button', { name: /Help: How to animate/ })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Title')); // select the layer
    for (const topic of ['layout', 'text', 'data', 'showWhen', 'animation', 'effects', 'mask']) {
      expect({ topic, found: !!document.querySelector(`[data-help="${topic}"]`) }).toEqual({ topic, found: true });
    }
    // Animate: add a rule from the dock, then switch the same rule to keyframes
    fireEvent.click(within(dock).getByTestId('add-animation'));
    expect(within(dock).getByLabelText('When')).toBeInTheDocument();
    fireEvent.click(within(dock).getByText('Keyframes', { selector: '[data-rule] button' }));
    expect(within(dock).getByTestId('timeline-panel')).toBeInTheDocument();
    expect(document.querySelector('[data-help="keyframes"]')).toBeInTheDocument();
    fireEvent.click(within(dock).getByText('Simple rules'));
    expect(within(dock).getByTestId('animate-panel')).toBeInTheDocument();
  });

  test('clearing the selection again and again fetches tournaments once', async () => {
    localStorage.setItem('designer.guide.seen', '1');
    mountEditor();
    const row = await screen.findByText('Title');
    await waitFor(() => expect(calls('/tournaments')).toBe(1));
    for (let i = 0; i < 5; i++) {
      fireEvent.click(row); // select: the Document panel (and its Live data section) unmounts
      expect(document.querySelector('[data-help="liveData"]')).toBeNull();
      fireEvent.keyDown(window, { key: 'Escape' }); // deselect: it mounts again
      await waitFor(() => expect(document.querySelector('[data-help="liveData"]')).toBeInTheDocument());
    }
    expect(calls('/tournaments')).toBe(1);
    expect(calls('/custom-themes')).toBe(1);
    expect(calls('/overlay-fonts')).toBe(1);
    expect(calls(`/overlay-layouts/${LAYOUT_ID}`)).toBe(1);
  });

  test('wheel over the canvas zooms the canvas and is consumed (no page scroll / browser zoom)', async () => {
    localStorage.setItem('designer.guide.seen', '1');
    mountEditor();
    await screen.findByText('Title');
    const stage = document.querySelector('[data-stage]') as HTMLElement;
    const viewport = stage.closest('.overflow-auto') as HTMLElement;
    const pct = () => screen.getByTitle('Fit to screen').textContent;
    const before = pct();

    const ev = new WheelEvent('wheel', { deltaY: -300, bubbles: true, cancelable: true });
    act(() => { stage.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect(parseInt(pct()!, 10)).toBeGreaterThan(parseInt(before!, 10));

    const pinch = new WheelEvent('wheel', { deltaY: 40, ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { viewport.dispatchEvent(pinch); });
    expect(pinch.defaultPrevented).toBe(true); // Ctrl+wheel never reaches the browser's page zoom

    // outside the canvas the wheel is left alone
    const outside = new WheelEvent('wheel', { deltaY: -300, bubbles: true, cancelable: true });
    act(() => { screen.getByTestId('animate-dock').dispatchEvent(outside); });
    expect(outside.defaultPrevented).toBe(false);
  });
});

test('cache keys used by writers and readers agree', () => {
  expect(CACHE_KEYS.rounds('t1')).toBe('rounds:t1');
  expect(CACHE_KEYS.revisions('l1')).toBe('revisions:l1');
});

// ── persistent cache ────────────────────────────────────────────────────────

describe('cache survives a reload', () => {
  const stored = () => Object.keys(localStorage).filter((k) => k.startsWith('dz.cache.v1|'));

  test('small lists are kept on disk and painted at once after a reload; drafts are not', async () => {
    await cached(CACHE_KEYS.themes, async () => [{ _id: 't9', name: 'Theme 9' }]);
    await cached('layout:abc', async () => ({ draft: 'big' }));
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toContain('|themes');

    dropMemoryCache(); // = a page reload
    expect(peek(CACHE_KEYS.themes)).toEqual([{ _id: 't9', name: 'Theme 9' }]);
    expect(peek('layout:abc')).toBeUndefined();
    const fetcher = jest.fn(async () => []);
    expect(await cached(CACHE_KEYS.themes, fetcher)).toEqual([{ _id: 't9', name: 'Theme 9' }]); // still fresh: no request
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('a stale disk value is shown immediately and refreshed once in the background', async () => {
    await cached(CACHE_KEYS.layouts, async () => [{ _id: 'a', name: 'Old' }]);
    invalidate(CACHE_KEYS.layouts); // e.g. the editor saved something
    dropMemoryCache();
    const fetcher = jest.fn(async () => [{ _id: 'a', name: 'New' }]);
    function Probe() { const q = useCached<any[]>(CACHE_KEYS.layouts, fetcher); return <div data-testid="v">{q.data ? q.data[0].name : 'loading'}</div>; }
    render(<Probe />);
    expect(screen.getByTestId('v')).toHaveTextContent('Old'); // no spinner: straight from disk
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('New'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('write-through reaches the disk; an oversized value is not stored; clearCache wipes both tiers', async () => {
    setCached(CACHE_KEYS.fonts, [{ _id: 'f1', family: 'Headline' }]);
    dropMemoryCache();
    expect(peek(CACHE_KEYS.fonts)).toEqual([{ _id: 'f1', family: 'Headline' }]);

    setCached(CACHE_KEYS.revisions('l1'), [{ blob: 'x'.repeat(300 * 1024) }]);
    expect(stored().some((k) => k.includes('revisions:l1'))).toBe(false);

    clearCache();
    expect(stored()).toHaveLength(0);
    expect(peek(CACHE_KEYS.fonts)).toBeUndefined();
  });

  test('another account never reads this one\'s disk cache; lifetimes are per kind of data', async () => {
    localStorage.setItem('user', JSON.stringify({ token: 'token-of-alice-0001' }));
    await cached(CACHE_KEYS.tournaments, async () => ['alice']);
    dropMemoryCache();
    localStorage.setItem('user', JSON.stringify({ token: 'token-of-bob-00002' }));
    expect(peek(CACHE_KEYS.tournaments)).toBeUndefined();
    expect(ttlFor('tournaments')).toBe(5 * 60000);
    expect(ttlFor('rounds:t1')).toBe(5 * 60000);
    expect(ttlFor('layouts')).toBe(60000);
  });
});

// ── manual save ─────────────────────────────────────────────────────────────

describe('saving is manual', () => {
  test('editing never saves by itself; the Save button does; leaving with unsaved changes asks first', async () => {
    localStorage.setItem('designer.guide.seen', '1');
    mockApi.put.mockImplementation(async (_url: string, body: any) => ({ data: layoutFull({ draftRev: body.expectedRev + 1 }) }));
    mountEditor();
    await screen.findByText('Title');
    expect(screen.getByTestId('save-status').textContent).toBe('Saved');

    fireEvent.click(screen.getByText('Insert'));
    fireEvent.click(screen.getByText('Rectangle'));
    await screen.findByText('Rectangle', { selector: '[data-layer-id] span' });
    expect(screen.getByTestId('save-status').textContent).toBe('Unsaved changes');
    expect(screen.getByTestId('save-button').textContent).toBe('● Save');
    await act(async () => { await new Promise((r) => setTimeout(r, 1600)); }); // longer than the old auto-save delay
    expect(mockApi.put).not.toHaveBeenCalled();

    // leaving now would lose the change: the editor asks
    fireEvent.click(screen.getByText('← Layouts'));
    expect(screen.getByTestId('leave-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Stay'));
    expect(screen.queryByTestId('leave-dialog')).toBeNull();

    await act(async () => { fireEvent.click(screen.getByTestId('save-button')); });
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledTimes(1));
    expect(mockApi.put.mock.calls[0][1].draft.elements).toHaveLength(2);
    await waitFor(() => expect(screen.getByTestId('save-status').textContent).toBe('Saved'));
    expect(screen.getByTestId('save-button').textContent).toBe('Save');

    // saved: leaving no longer asks
    fireEvent.click(screen.getByText('← Layouts'));
    expect(screen.queryByTestId('leave-dialog')).toBeNull();
  });

  test('a failed save keeps the work and is not retried behind the user\'s back', async () => {
    localStorage.setItem('designer.guide.seen', '1');
    mockApi.put.mockRejectedValue(new Error('Network Error'));
    mountEditor();
    await screen.findByText('Title');
    fireEvent.click(screen.getByText('Insert'));
    fireEvent.click(screen.getByText('Rectangle'));
    await act(async () => { fireEvent.keyDown(window, { key: 's', ctrlKey: true }); });
    await waitFor(() => expect(screen.getByTestId('save-status').textContent).toBe('Save failed — press Save to try again'));
    await act(async () => { await new Promise((r) => setTimeout(r, 1200)); });
    expect(mockApi.put).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Rectangle', { selector: '[data-layer-id] span' })).toBeInTheDocument();
  });
});
