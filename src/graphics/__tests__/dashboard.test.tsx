import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { validateLayout } from '../schema/layoutSchema.js';

// The app's axios instance: every call is a jest mock (no network).
jest.mock('../../login/api.tsx', () => {
  const api = { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return {
    __esModule: true, default: api, DEFAULT_BACKEND: 'http://backend.test', RELAY_ORIGIN: 'http://127.0.0.1:8787',
    isOverlayRoute: () => false, isUsingRelay: () => false, getBackendOrigin: () => 'http://backend.test', getRelayOrigin: () => null,
    markRelayUnreachable: jest.fn(), markRelayReachable: jest.fn(),
  };
});
jest.mock('../../dashboard/isPolling.tsx', () => ({ __esModule: true, default: () => null, stopAllPolling: jest.fn() }));
jest.mock('../../dashboard/socketManager', () => ({ __esModule: true, default: { getInstance: () => ({ connect: () => ({ on() {}, off() {}, emit() {}, connected: false }), updateAuthToken() {}, forceDisconnect() {} }) } }));

// eslint-disable-next-line import/first
import api from '../../login/api.tsx';
// eslint-disable-next-line import/first
import { clearCache } from '../requestCache.ts';
// eslint-disable-next-line import/first
import DesignerList, { newLayoutDocument } from '../editor/DesignerList.tsx';
// eslint-disable-next-line import/first
import { filterDesigns, parseTags, tagsOf, hasUnpublishedChanges, type LibraryFilter } from '../dashboard/DesignLibrary.tsx';
// eslint-disable-next-line import/first
import { aspectLabel, canvasSizeProblem, presetFor } from '../dashboard/canvasPresets.ts';
// eslint-disable-next-line import/first
import { categoryForView, categoryOptions } from '../dashboard/categories.ts';
// eslint-disable-next-line import/first
import { galleryShelves, searchGallery } from '../editor/TemplateGallery.tsx';
// eslint-disable-next-line import/first
import { buildGallery } from '../editor/templateCatalog.ts';
// eslint-disable-next-line import/first
import { TEMPLATES } from '../templates/index.ts';

const mockApi = api as unknown as Record<'get' | 'post' | 'put' | 'patch' | 'delete', jest.Mock>;

const design = (over: any = {}) => ({
  _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'R2R Lower Third V1', publicId: 'pubAAAAAAAAAA', schemaVersion: 1, draftRev: 1, publishedRev: 0,
  publishedAt: null, productionLocked: false, defaults: { tournamentId: null, roundId: null, matchMode: 'selectedMatch' }, assetBase: '',
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', description: '', categoryId: null, tags: [], archivedAt: null,
  isTemplate: false, stage: { width: 1920, height: 1080 }, ...over,
});

const LIST = [
  design(),
  design({ _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'PUBGM Player Spotlight', categoryId: 'player-cards', tags: ['Finals'], publishedRev: 2, publishedAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z', stage: { width: 1080, height: 1920 } }),
  design({ _id: 'cccccccccccccccccccccccc', name: 'Tournament MVP Reveal', categoryId: 'mvp-winners', tags: ['finals', 'gold'], publishedRev: 1, publishedAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z', isTemplate: true }),
  design({ _id: 'dddddddddddddddddddddddd', name: 'Old kill feed', categoryId: 'kill-feed', archivedAt: '2026-10-05T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }),
];

const base: LibraryFilter = { tab: 'all', query: '', category: 'all', tag: null, sort: 'modified' };
const names = (f: Partial<LibraryFilter>) => filterDesigns(LIST as any, { ...base, ...f }, (id) => (id === 'player-cards' ? 'Player Cards' : '')).map((l) => l.name);

beforeEach(() => {
  clearCache();
  (['get', 'post', 'put', 'patch', 'delete'] as const).forEach((k) => mockApi[k].mockReset());
  mockApi.get.mockImplementation(async (url: string) => {
    if (url === '/overlay-layouts') return { data: LIST };
    if (url === '/overlay-categories') return { data: [{ _id: 'eeeeeeeeeeeeeeeeeeeeeeee', name: 'Grand Finals' }] };
    return { data: [] };
  });
});

// ── pure pieces ──────────────────────────────────────────────────────────────

describe('library filter', () => {
  test('tabs: archived designs only show under Archived; published / drafts / templates split the rest', () => {
    expect(names({})).toEqual(['Tournament MVP Reveal', 'PUBGM Player Spotlight', 'R2R Lower Third V1']);
    expect(names({ tab: 'archived' })).toEqual(['Old kill feed']);
    expect(names({ tab: 'published' })).toEqual(['Tournament MVP Reveal', 'PUBGM Player Spotlight']);
    expect(names({ tab: 'drafts' })).toEqual(['R2R Lower Third V1']);
    expect(names({ tab: 'templates' })).toEqual(['Tournament MVP Reveal']);
  });

  test('search matches name, tag and category label; category and tag filters; sort by name', () => {
    expect(names({ query: 'spotlight' })).toEqual(['PUBGM Player Spotlight']);
    expect(names({ query: 'GOLD' })).toEqual(['Tournament MVP Reveal']);
    expect(names({ query: 'player cards' })).toEqual(['PUBGM Player Spotlight']);
    expect(names({ category: 'mvp-winners' })).toEqual(['Tournament MVP Reveal']);
    expect(names({ category: 'none' })).toEqual(['R2R Lower Third V1']);
    expect(names({ tag: 'FINALS' })).toEqual(['Tournament MVP Reveal', 'PUBGM Player Spotlight']);
    expect(names({ sort: 'name' })).toEqual(['PUBGM Player Spotlight', 'R2R Lower Third V1', 'Tournament MVP Reveal']);
  });

  test('tags are counted ignoring case; a tag list is parsed and de-duplicated', () => {
    expect(tagsOf(LIST as any)).toEqual(['Finals', 'gold']);
    expect(parseTags(' finals, Finals ,, blue  team ')).toEqual(['finals', 'blue team']);
  });

  test('"unpublished changes" means the draft was saved after the last publish', () => {
    expect(hasUnpublishedChanges(LIST[1] as any)).toBe(true);
    expect(hasUnpublishedChanges(LIST[2] as any)).toBe(false);
    expect(hasUnpublishedChanges(LIST[0] as any)).toBe(false);
  });
});

describe('canvas', () => {
  test('presets, aspect labels and size limits', () => {
    expect(presetFor(1080, 1920)?.label).toBe('Vertical');
    expect(presetFor(1000, 1000)).toBeUndefined();
    expect([aspectLabel(1920, 1080), aspectLabel(1080, 1920), aspectLabel(1080, 1080), aspectLabel(1280, 720)]).toEqual(['16:9', '9:16', '1:1', '16:9']);
    expect(canvasSizeProblem(1920, 1080)).toBeNull();
    expect(canvasSizeProblem(0, 1080)).toMatch(/smallest/);
    expect(canvasSizeProblem(-5, 100)).toMatch(/smallest/);
    expect(canvasSizeProblem(8000, 1080)).toMatch(/7680/);
    expect(canvasSizeProblem(1920, 5000)).toMatch(/4320/);
    expect(canvasSizeProblem('', 1080)).toMatch(/smallest|whole/);
    expect(canvasSizeProblem(19.5, 1080)).toMatch(/whole/);
  });

  test('a new document takes the chosen canvas; a template copy shares no layer ids with a second copy', () => {
    const blank = newLayoutDocument(null, { width: 1080, height: 1920, background: '#101010' });
    expect(blank.stage).toMatchObject({ width: 1080, height: 1920, background: '#101010' });
    expect(blank.elements).toEqual([]);
    expect(validateLayout(blank).ok).toBe(true);
    const a = newLayoutDocument('lower-third');
    const b = newLayoutDocument('lower-third');
    expect(a.elements.length).toBeGreaterThan(0);
    expect(validateLayout(a).ok).toBe(true);
    a.elements[0].x = 7;
    expect(b.elements[0].x).not.toBe(7); // an independent working copy
    expect(TEMPLATES.find((t) => t.id === 'lower-third')!.elements[0].x).not.toBe(7); // the template itself is untouched
  });
});

describe('gallery', () => {
  const items = buildGallery(TEMPLATES, []).flatMap((c) => c.items);
  test('every template is filed under a library category, Desktop app or Other, and none is lost', () => {
    const shelves = galleryShelves(items);
    expect(shelves.reduce((n, s) => n + s.items.length, 0)).toBe(items.length);
    expect(shelves.find((s) => s.id === 'lower-thirds')!.items.some((i) => i.source === 'lower-third')).toBe(true);
    expect(shelves.find((s) => s.id === 'desktop')!.items.length).toBeGreaterThan(0);
    expect(categoryForView('mvp')).toBe('mvp-winners');
    expect(categoryForView('NoSuchView')).toBeNull();
  });
  test('search by name, description or the view it fills', () => {
    expect(searchGallery(items, 'lower third').some((i) => i.source === 'lower-third')).toBe(true);
    expect(searchGallery(items, 'zzzz-not-a-template')).toEqual([]);
    expect(searchGallery(items, '')).toHaveLength(items.length);
  });
  test('category options: built-in first, then the account\'s own', () => {
    const opts = categoryOptions([{ _id: 'x1', name: 'Grand Finals' }]);
    expect(opts[0]).toMatchObject({ id: 'lower-thirds', custom: false });
    expect(opts[opts.length - 1]).toEqual({ id: 'x1', label: 'Grand Finals', custom: true });
  });
});

// ── the page ─────────────────────────────────────────────────────────────────

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}</div>;
}
const renderHome = () => render(
  <MemoryRouter initialEntries={['/designer']}>
    <Routes>
      <Route path="/designer" element={<DesignerList />} />
      <Route path="/designer/:id" element={<div>editor</div>} />
    </Routes>
    <Where />
  </MemoryRouter>
);
const cardOf = (id: string) => document.querySelector(`[data-design-id="${id}"]`) as HTMLElement;

describe('/designer', () => {
  test('three ways in, then the library with status, size and category on every card', async () => {
    renderHome();
    const actions = within(screen.getByTestId('home-actions'));
    expect(actions.getByText('Create from template')).toBeInTheDocument();
    expect(actions.getByText('Create blank design')).toBeInTheDocument();
    expect(actions.getByText('Open existing design')).toBeInTheDocument();

    await screen.findByText('PUBGM Player Spotlight');
    const card = within(cardOf('bbbbbbbbbbbbbbbbbbbbbbbb'));
    expect(card.getByText('Published · rev 2')).toBeInTheDocument();
    expect(card.getByText('Unpublished changes')).toBeInTheDocument();
    expect(card.getByText(/Player Cards/)).toBeInTheDocument();
    expect(card.getByText(/1080 × 1920/)).toBeInTheDocument();
    expect(within(cardOf('aaaaaaaaaaaaaaaaaaaaaaaa')).getByText('Draft')).toBeInTheDocument();
    expect(screen.queryByText('Old kill feed')).toBeNull(); // archived: not in "All"
    expect(screen.getByTestId('library-count').textContent).toBe('3 of 3');
  });

  test('search and the category filter narrow the grid; an empty result offers to clear', async () => {
    renderHome();
    await screen.findByText('PUBGM Player Spotlight');
    fireEvent.change(screen.getByLabelText('Search designs'), { target: { value: 'mvp' } });
    expect(screen.queryByText('PUBGM Player Spotlight')).toBeNull();
    expect(screen.getByText('Tournament MVP Reveal')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search designs'), { target: { value: 'nothing like this' } });
    expect(within(screen.getByTestId('library-empty')).getByText('Nothing matches these filters.')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('library-empty')).getByText('Clear filters'));
    fireEvent.change(screen.getByLabelText('Category filter'), { target: { value: 'eeeeeeeeeeeeeeeeeeeeeeee' } });
    expect(screen.getByTestId('library-empty')).toBeInTheDocument(); // the account's own category exists and is empty
    fireEvent.change(screen.getByLabelText('Category filter'), { target: { value: 'player-cards' } });
    expect(screen.getByTestId('library-count').textContent).toBe('1 of 3');
  });

  test('a blank design needs a name and a valid size, then is created with that canvas and opened', async () => {
    mockApi.post.mockImplementation(async (_url: string, body: any) => ({ data: { ...design({ _id: 'ffffffffffffffffffffffff', name: body.name }), draft: body.draft } }));
    mockApi.patch.mockResolvedValue({ data: design({ _id: 'ffffffffffffffffffffffff', categoryId: 'lower-thirds' }) });
    renderHome();
    await screen.findByText('PUBGM Player Spotlight');
    fireEvent.click(within(screen.getByTestId('home-actions')).getByText('Create blank design'));
    const dialog = within(screen.getByTestId('new-design-dialog'));

    fireEvent.click(dialog.getByText('Vertical'));
    expect(dialog.getByTestId('aspect').textContent).toBe('9:16');
    fireEvent.change(dialog.getByLabelText('Width'), { target: { value: '9000' } });
    expect(dialog.getByTestId('size-problem').textContent).toMatch(/7680/);
    expect(dialog.getByTestId('create-design')).toBeDisabled();
    fireEvent.change(dialog.getByLabelText('Width'), { target: { value: '1000' } });
    fireEvent.change(dialog.getByLabelText('Height'), { target: { value: '500' } });
    expect(dialog.getByTestId('aspect').textContent).toBe('2:1');

    fireEvent.click(dialog.getByTestId('create-design'));
    expect(mockApi.post).not.toHaveBeenCalled(); // no name yet
    fireEvent.change(dialog.getByLabelText('Design name'), { target: { value: 'Match Starting Soon' } });
    fireEvent.change(dialog.getByLabelText('Category'), { target: { value: 'lower-thirds' } });
    fireEvent.click(dialog.getByTestId('create-design'));

    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/designer/ffffffffffffffffffffffff'));
    const [url, body] = mockApi.post.mock.calls[0];
    expect(url).toBe('/overlay-layouts');
    expect(body.name).toBe('Match Starting Soon');
    expect(body.draft.stage).toMatchObject({ width: 1000, height: 500, background: null });
    expect(validateLayout(body.draft).ok).toBe(true);
    expect(mockApi.patch).toHaveBeenCalledWith('/overlay-layouts/ffffffffffffffffffffffff/meta', { categoryId: 'lower-thirds' });
  });

  test('rename, archive and details go through the meta route; the card only changes after the server answers', async () => {
    mockApi.patch.mockImplementation(async (url: string, body: any) => {
      const id = url.split('/')[2];
      const cur = LIST.find((l) => l._id === id)!;
      return { data: { ...cur, ...(body.name ? { name: body.name } : {}), ...(body.archived !== undefined ? { archivedAt: body.archived ? '2026-10-09T00:00:00Z' : null } : {}), ...(body.tags ? { tags: body.tags } : {}), ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}) } };
    });
    renderHome();
    await screen.findByText('R2R Lower Third V1');

    fireEvent.click(screen.getByText('R2R Lower Third V1'));
    const input = within(cardOf('aaaaaaaaaaaaaaaaaaaaaaaa')).getByLabelText('Design name');
    fireEvent.change(input, { target: { value: 'R2R Lower Third V2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('R2R Lower Third V2')).toBeInTheDocument();
    expect(mockApi.patch).toHaveBeenCalledWith('/overlay-layouts/aaaaaaaaaaaaaaaaaaaaaaaa/meta', { name: 'R2R Lower Third V2' });

    fireEvent.click(screen.getByLabelText('More actions for R2R Lower Third V2'));
    fireEvent.click(screen.getByText('Category, tags, description…'));
    const details = within(screen.getByTestId('details-dialog'));
    fireEvent.change(details.getByLabelText('Category'), { target: { value: 'eeeeeeeeeeeeeeeeeeeeeeee' } });
    fireEvent.change(details.getByLabelText('Tags'), { target: { value: 'r2r, blue' } });
    fireEvent.click(details.getByText('Save'));
    await waitFor(() => expect(screen.queryByTestId('details-dialog')).toBeNull());
    expect(mockApi.patch).toHaveBeenLastCalledWith('/overlay-layouts/aaaaaaaaaaaaaaaaaaaaaaaa/meta', { name: 'R2R Lower Third V2', description: '', categoryId: 'eeeeeeeeeeeeeeeeeeeeeeee', tags: ['r2r', 'blue'] });
    expect(within(cardOf('aaaaaaaaaaaaaaaaaaaaaaaa')).getByText(/Grand Finals/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('More actions for R2R Lower Third V2'));
    fireEvent.click(screen.getByText('Archive'));
    await waitFor(() => expect(cardOf('aaaaaaaaaaaaaaaaaaaaaaaa')).toBeNull());
    fireEvent.click(screen.getByRole('tab', { name: /Archived/ }));
    expect(cardOf('aaaaaaaaaaaaaaaaaaaaaaaa')).not.toBeNull(); // put away, not deleted
  });

  test('a failed change is reported and the card keeps its old value', async () => {
    mockApi.patch.mockRejectedValue({ response: { status: 500, data: { message: 'Database is down' } } });
    renderHome();
    await screen.findByText('R2R Lower Third V1');
    fireEvent.click(screen.getByLabelText('More actions for R2R Lower Third V1'));
    fireEvent.click(screen.getByText('Archive'));
    expect(await screen.findByText('Database is down')).toBeInTheDocument();
    expect(cardOf('aaaaaaaaaaaaaaaaaaaaaaaa')).not.toBeNull();
  });

  test('delete asks first and says what is lost; duplicate adds a separate design', async () => {
    mockApi.delete.mockResolvedValue({ data: null });
    mockApi.post.mockResolvedValue({ data: { ...design({ _id: '999999999999999999999999', name: 'PUBGM Player Spotlight (copy)', categoryId: 'player-cards' }), draft: {} } });
    renderHome();
    await screen.findByText('PUBGM Player Spotlight');
    fireEvent.click(screen.getByLabelText('More actions for PUBGM Player Spotlight'));
    fireEvent.click(screen.getByText('Duplicate'));
    expect(await screen.findByText('PUBGM Player Spotlight (copy)')).toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledWith('/overlay-layouts/bbbbbbbbbbbbbbbbbbbbbbbb/duplicate');

    fireEvent.click(screen.getByLabelText('More actions for PUBGM Player Spotlight'));
    fireEvent.click(screen.getByText('Delete…'));
    expect(mockApi.delete).not.toHaveBeenCalled();
    expect(screen.getByText(/goes blank/)).toBeInTheDocument(); // it is published: say what happens on air
    fireEvent.click(screen.getByTestId('confirm-delete'));
    await waitFor(() => expect(cardOf('bbbbbbbbbbbbbbbbbbbbbbbb')).toBeNull());
    expect(mockApi.delete).toHaveBeenCalledWith('/overlay-layouts/bbbbbbbbbbbbbbbbbbbbbbbb');
  });

  test('the library shows a retry when the list cannot be loaded', async () => {
    mockApi.get.mockRejectedValue({ response: { status: 500, data: { message: 'Could not reach the database' } } });
    renderHome();
    expect(await screen.findByText(/Could not reach the database/)).toBeInTheDocument();
    mockApi.get.mockImplementation(async (url: string) => ({ data: url === '/overlay-layouts' ? LIST : [] }));
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('PUBGM Player Spotlight')).toBeInTheDocument();
  });

  test('categories: add one; deleting says how many designs become uncategorised and deletes none', async () => {
    mockApi.post.mockResolvedValue({ data: { _id: '111111111111111111111111', name: 'Scrims' } });
    mockApi.delete.mockResolvedValue({ data: { removed: true, uncategorised: 0 } });
    renderHome();
    await screen.findByText('PUBGM Player Spotlight');
    fireEvent.click(screen.getByText('Categories…'));
    const mgr = within(screen.getByTestId('category-manager'));
    expect(mgr.getByText('Grand Finals')).toBeInTheDocument();
    fireEvent.change(mgr.getByLabelText('New category name'), { target: { value: 'Scrims' } });
    fireEvent.click(mgr.getByText('Add'));
    expect(await mgr.findByText('Scrims')).toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledWith('/overlay-categories', { name: 'Scrims' });

    const row = mgr.getByText('Grand Finals').closest('div')!;
    fireEvent.click(within(row).getByText('Delete'));
    expect(mgr.getByText(/No design uses it/)).toBeInTheDocument();
    expect(mockApi.delete).not.toHaveBeenCalled();
    fireEvent.click(mgr.getByText('Delete category'));
    await waitFor(() => expect(mgr.queryByText('Grand Finals')).toBeNull());
    expect(mockApi.delete).toHaveBeenCalledWith('/overlay-categories/eeeeeeeeeeeeeeeeeeeeeeee');
  });
});
