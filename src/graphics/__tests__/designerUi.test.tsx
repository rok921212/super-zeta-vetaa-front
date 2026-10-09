import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
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
import { clearCache } from '../requestCache.ts';
// eslint-disable-next-line import/first
import { Inspector } from '../editor/Inspector.tsx';
// eslint-disable-next-line import/first
import { LayersPanel } from '../editor/LayersPanel.tsx';
// eslint-disable-next-line import/first
import Navbar from '../../dashboard/Navbar';
// eslint-disable-next-line import/first
import DesignerEditorPage from '../editor/DesignerEditor.tsx';
// eslint-disable-next-line import/first
import DesignerList from '../editor/DesignerList.tsx';
// eslint-disable-next-line import/first
import OverlayRuntime from '../runtime/OverlayRuntime.tsx';

const mockApi = api as unknown as Record<'get' | 'post' | 'put' | 'patch' | 'delete', jest.Mock>;

const makeDoc = (elements: any[]): LayoutDocument => ({ ...createEmptyLayout(), elements }) as any;

beforeEach(() => {
  clearCache();
  try { localStorage.setItem('designer.guide.seen', '1'); } catch { /* no storage */ }
  Object.values(mockApi).forEach((m) => typeof m === 'function' && 'mockReset' in m && m.mockReset());
  mockApi.get.mockResolvedValue({ data: [] });
});

// ── Inspector ───────────────────────────────────────────────────────────────

function inspectorHarness(doc: LayoutDocument, selected: string[]) {
  let current = doc;
  const exec = jest.fn((cmd: any) => { if (cmd) current = cmd.apply(current); });
  const utils = render(
    <Inspector
      doc={doc}
      selected={selected}
      state={{ derived: { teams: [{ teamId: 't1', teamName: 'Alpha', totalKills: 3 }] } } as any}
      lastEvents={{}}
      exec={exec}
      onSelect={jest.fn()}
      name="Test"
      onRename={jest.fn()}
      defaults={{ tournamentId: null, roundId: null, matchMode: 'selectedMatch' }}
      onDefaults={jest.fn()}
      fontLibrary={{ fonts: [], upload: jest.fn(), remove: jest.fn() }}
    />
  );
  return { ...utils, exec, doc: () => current };
}

test('inspector: editing X updates the real document', () => {
  const h = inspectorHarness(makeDoc([{ id: 't', type: 'text', x: 10, y: 0, w: 100, h: 40, text: 'hi' }]), ['t']);
  const x = within(screen.getByText('X').closest('label')!).getByRole('spinbutton');
  fireEvent.change(x, { target: { value: '250' } });
  expect(h.exec).toHaveBeenCalled();
  expect(h.doc().elements[0].x).toBe(250);
});

test('inspector: a typed binding path is saved into bind.text; an unsafe path is rejected', () => {
  const h = inspectorHarness(makeDoc([{ id: 't', type: 'text', x: 0, y: 0, w: 100, h: 40 }]), ['t']);
  const input = screen.getByLabelText('text binding path');
  fireEvent.change(input, { target: { value: 'constructor.prototype' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByText('Not an allowed path')).toBeInTheDocument();
  expect(h.doc().elements[0].bind).toBeUndefined();

  fireEvent.change(input, { target: { value: 'tournament.tournamentName' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(h.doc().elements[0].bind?.text?.path).toBe('tournament.tournamentName');
  expect(validateLayout(h.doc()).ok).toBe(true);
});

/** The open DataPicker: drawn in a portal on document.body (so a scrolling panel cannot clip it). */
const openPicker = () => screen.getByPlaceholderText('derived.teams[0].teamName').closest('.fixed') as HTMLElement;

test('inspector: inside a repeater the DataPicker offers item.*; picking writes the binding', () => {
  const doc = makeDoc([{
    id: 'rep', type: 'repeater', x: 0, y: 0, w: 200, h: 200,
    repeater: { source: 'derived.teams', limit: 5, direction: 'column' },
    children: [{ id: 'name', type: 'text', x: 0, y: 0, w: 100, h: 20 }],
  }]);
  const h = inspectorHarness(doc, ['name']);
  const row = document.querySelector('[data-binding="text"]') as HTMLElement;
  fireEvent.click(within(row).getByText('Select data'));
  // `item` is expanded by default and shows the first team's fields
  fireEvent.click(within(openPicker()).getByText('teamName'));
  const next = h.doc();
  expect((next.elements[0].children as any)[0].bind.text.path).toBe('item.teamName');
});

test('inspector: event-driven elements offer event.*', () => {
  const doc = makeDoc([{
    id: 'pop', type: 'group', x: 0, y: 0, w: 200, h: 80, anim: { onEvent: { event: 'kill', preset: 'fade' } },
    children: [{ id: 'who', type: 'text', x: 0, y: 0, w: 100, h: 20 }],
  }]);
  inspectorHarness(doc, ['who']);
  const row = document.querySelector('[data-binding="text"]') as HTMLElement;
  fireEvent.click(within(row).getByText('Select data'));
  expect(within(openPicker()).getByText('event')).toBeInTheDocument();
  expect(screen.getByText(/Event-driven: use/)).toBeInTheDocument();
});

test('inspector: nothing selected shows Document settings', () => {
  inspectorHarness(makeDoc([]), []);
  expect(screen.getByText('Document')).toBeInTheDocument();
  expect(screen.getByText('Live data')).toBeInTheDocument();
});

// ── Layers ─────────────────────────────────────────────────────────────────

test('layers: click selects (shared selection), selected row is highlighted, toggles fire', () => {
  const onSelect = jest.fn();
  const onToggle = jest.fn();
  const els: any[] = [
    { id: 'a', type: 'rect', name: 'Back', x: 0, y: 0, w: 1, h: 1 },
    { id: 'b', type: 'text', name: 'Front', x: 0, y: 0, w: 1, h: 1 },
  ];
  const props = {
    elements: els, selected: ['a'], onSelect, onToggle, onRename: jest.fn(), onDelete: jest.fn(), onReorder: jest.fn(),
    onMoveToParent: jest.fn(), onGroup: jest.fn(), onUngroup: jest.fn(), canGroup: false, canUngroup: false,
  };
  render(<LayersPanel {...props} />);
  const rows = Array.from(document.querySelectorAll('[data-layer-id]')).map((r) => r.getAttribute('data-layer-id'));
  expect(rows).toEqual(['b', 'a']); // top-most first
  expect(document.querySelector('[data-layer-id="a"]')!.className).toMatch(/amber/);
  fireEvent.click(screen.getByText('Front'));
  expect(onSelect).toHaveBeenCalledWith(['b']);
  fireEvent.click(screen.getByText('Front'), { shiftKey: true });
  expect(onSelect).toHaveBeenLastCalledWith(['a', 'b']);
  fireEvent.click(within(document.querySelector('[data-layer-id="b"]') as HTMLElement).getByLabelText('Hide layer'));
  expect(onToggle).toHaveBeenCalledWith('b', 'hidden');
});

// ── Navigation ─────────────────────────────────────────────────────────────

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}</div>;
}

test('navbar: DESIGNER navigates to /designer without a reload', () => {
  render(
    <MemoryRouter initialEntries={['/teams']}>
      <Routes>
        <Route path="*" element={<><Navbar active="teams" brandText="TEAM OPS" /><Where /></>} />
      </Routes>
    </MemoryRouter>
  );
  const btn = screen.getAllByText('DESIGNER')[0];
  fireEvent.click(btn);
  expect(screen.getByTestId('where').textContent).toBe('/designer');
});

// ── Routed pages ───────────────────────────────────────────────────────────

const layoutFull = (over: any = {}) => ({
  _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'My overlay', publicId: 'pub12345', schemaVersion: 1, draftRev: 1, publishedRev: 0,
  publishedAt: null, productionLocked: false, defaults: { tournamentId: null, roundId: null, matchMode: 'selectedMatch' },
  assetBase: '', createdAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z',
  draft: makeDoc([{ id: 'title', type: 'text', name: 'Title', x: 10, y: 10, w: 300, h: 60, text: 'Hello' }]),
  ...over,
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/designer" element={<DesignerList />} />
        <Route path="/designer/:id" element={<DesignerEditorPage />} />
        <Route path="/o/:publicId" element={<OverlayRuntime />} />
      </Routes>
      <Where />
    </MemoryRouter>
  );
}

test('/designer lists the user layouts with status', async () => {
  mockApi.get.mockImplementation(async (url: string) => {
    if (url === '/overlay-layouts') return { data: [layoutFull({ publishedRev: 3, productionLocked: true })] };
    return { data: [] };
  });
  renderAt('/designer');
  expect(await screen.findByText('My overlay')).toBeInTheDocument();
  expect(screen.getByText('Published · rev 3')).toBeInTheDocument();
  expect(screen.getByText('🔒 Locked')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Edit'));
  expect(screen.getByTestId('where').textContent).toBe('/designer/aaaaaaaaaaaaaaaaaaaaaaaa');
});

test('/designer: create from a template opens the new layout', async () => {
  mockApi.get.mockResolvedValue({ data: [] });
  mockApi.post.mockImplementation(async (url: string, body: any) => {
    expect(url).toBe('/overlay-layouts');
    expect(validateLayout(body.draft).ok).toBe(true);
    expect(body.draft.elements.length).toBeGreaterThan(0);
    return { data: layoutFull({ _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: body.name, draft: body.draft }) };
  });
  renderAt('/designer');
  // Nothing saved yet: the home opens on the template gallery.
  const card = await waitFor(() => { const c = document.querySelector('[data-template="lower-third"]'); expect(c).not.toBeNull(); return c as HTMLElement; });
  fireEvent.click(within(card).getByText('Use template'));
  const dialog = screen.getByTestId('new-design-dialog');
  // A design needs a name: creating without one is refused and sends nothing.
  fireEvent.click(within(dialog).getByTestId('create-design'));
  expect(mockApi.post).not.toHaveBeenCalled();
  fireEvent.change(within(dialog).getByLabelText('Design name'), { target: { value: 'R2R Lower Third V1' } });
  fireEvent.click(within(dialog).getByTestId('create-design'));
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/designer/bbbbbbbbbbbbbbbbbbbbbbbb'));
  expect(mockApi.post.mock.calls[0][1].name).toBe('R2R Lower Third V1');
});

test('/designer/:id: loads, inserts, undoes, and autosaves with expectedRev', async () => {
  mockApi.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/overlay-layouts/')) return { data: layoutFull() };
    return { data: [] };
  });
  mockApi.put.mockImplementation(async (_url: string, body: any) => ({ data: layoutFull({ draftRev: body.expectedRev + 1, draft: body.draft }) }));
  renderAt('/designer/aaaaaaaaaaaaaaaaaaaaaaaa');
  expect(await screen.findByText('Title')).toBeInTheDocument(); // layers panel
  expect(screen.getByTestId('save-status').textContent).toBe('Saved');

  // select via layers -> the inspector follows
  fireEvent.click(screen.getByText('Title'));
  expect(screen.getByLabelText('text binding path')).toBeInTheDocument();

  // insert a rectangle
  fireEvent.click(screen.getByText('Insert'));
  fireEvent.click(screen.getByText('Rectangle'));
  expect(await screen.findByText('Rectangle', { selector: '[data-layer-id] span' })).toBeInTheDocument();
  expect(screen.getByTestId('save-status').textContent).toBe('Unsaved changes');

  // undo removes it, redo brings it back
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  await waitFor(() => expect(screen.queryByText('Rectangle', { selector: '[data-layer-id] span' })).toBeNull());
  fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
  expect(await screen.findByText('Rectangle', { selector: '[data-layer-id] span' })).toBeInTheDocument();

  // Ctrl+S saves now, carrying the loaded rev
  await act(async () => { fireEvent.keyDown(window, { key: 's', ctrlKey: true }); });
  await waitFor(() => expect(mockApi.put).toHaveBeenCalledTimes(1));
  const [url, body] = mockApi.put.mock.calls[0];
  expect(url).toBe('/overlay-layouts/aaaaaaaaaaaaaaaaaaaaaaaa');
  expect(body.expectedRev).toBe(1);
  expect(body.draft.elements).toHaveLength(2);
  await waitFor(() => expect(screen.getByTestId('save-status').textContent).toBe('Saved'));
});

test('/designer/:id: a 409 opens the conflict dialog and does not overwrite', async () => {
  mockApi.get.mockImplementation(async (url: string) => (url.startsWith('/overlay-layouts/') ? { data: layoutFull() } : { data: [] }));
  mockApi.put.mockRejectedValue({ response: { status: 409, data: { currentRev: 7 } } });
  renderAt('/designer/aaaaaaaaaaaaaaaaaaaaaaaa');
  await screen.findByText('Title');
  fireEvent.click(screen.getByText('Insert'));
  fireEvent.click(screen.getByText('Rectangle'));
  await act(async () => { fireEvent.keyDown(window, { key: 's', ctrlKey: true }); });
  expect(await screen.findByText('This layout was changed somewhere else')).toBeInTheDocument();
  expect(mockApi.put).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Keep editing'));
  expect(screen.getByTestId('save-status').textContent).toBe('Changed elsewhere');
});

test('/designer/:id: a locked layout is read-only with Create new draft', async () => {
  mockApi.get.mockImplementation(async (url: string) => (url.startsWith('/overlay-layouts/') ? { data: layoutFull({ productionLocked: true }) } : { data: [] }));
  renderAt('/designer/aaaaaaaaaaaaaaaaaaaaaaaa');
  expect(await screen.findByText('🔒 Production Locked')).toBeInTheDocument();
  expect(screen.getByText('This layout is locked for production. Editing, publishing and deleting are blocked.')).toBeInTheDocument();
  expect(screen.getByText('Publish').closest('button')).toBeDisabled();
  expect(screen.getByText('Create new draft')).toBeInTheDocument();
});

test('/designer/:id: another user\'s / missing layout shows not found', async () => {
  mockApi.get.mockRejectedValue({ response: { status: 404 } });
  renderAt('/designer/cccccccccccccccccccccccc');
  expect(await screen.findByText('Layout not found')).toBeInTheDocument();
});

test('/o/:publicId renders the PUBLISHED document from the public render route', async () => {
  const published = makeDoc([{ id: 'p', type: 'text', x: 0, y: 0, w: 200, h: 40, text: 'PUBLISHED TEXT' }]);
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => ({ publicId: 'pub12345', name: 'x', publishedRev: 2, publishedAt: null, schemaVersion: 1, stage: published.stage, defaults: { tournamentId: null, roundId: null, matchMode: 'selectedMatch' }, assetBase: '', published }),
  }));
  (global as any).fetch = fetchMock;
  renderAt('/o/pub12345');
  expect(await screen.findByText('PUBLISHED TEXT')).toBeInTheDocument();
  expect((fetchMock.mock.calls[0] as any)[0]).toBe('http://backend.test/api/overlay-render/pub12345');
  expect(screen.queryByText('DESIGNER')).toBeNull(); // no app chrome
});
