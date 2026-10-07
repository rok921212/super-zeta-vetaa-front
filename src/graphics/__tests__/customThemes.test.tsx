import React from 'react';
import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createEmptyLayout } from '../schema/layoutSchema.js';

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
import { apiErrorMessage, findThemeSlot, nextThemeNumber, type CustomTheme } from '../api.ts';
// eslint-disable-next-line import/first
import { applyThemeChoice, defaultThemeChoice } from '../editor/ThemeAssign.tsx';
// eslint-disable-next-line import/first
import { VIEW_OPTIONS, guessViewKey } from '../../dashboard/overlayViews.ts';
// eslint-disable-next-line import/first
import DesignerEditorPage from '../editor/DesignerEditor.tsx';

const mockApi = api as unknown as Record<'get' | 'post' | 'put' | 'patch' | 'delete', jest.Mock>;
beforeEach(() => {
  clearCache();
  try { localStorage.setItem('designer.guide.seen', '1'); } catch { /* no storage */ }
  Object.values(mockApi).forEach((m) => typeof m === 'function' && 'mockReset' in m && m.mockReset());
  mockApi.get.mockResolvedValue({ data: [] });
});

const theme = (over: Partial<CustomTheme> = {}): CustomTheme => ({ _id: 't9', number: 9, label: 'Theme9', name: 'Theme 9', slots: [], ...over });

test('view keys match the backend whitelist (drift guard)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../../../Render_hosted/test-back/controller/customTheme.controller.js'), 'utf8');
  const block = src.slice(src.indexOf('const VIEW_KEYS = ['), src.indexOf('];', src.indexOf('const VIEW_KEYS = [')));
  const backendKeys = Array.from(block.matchAll(/'([^']+)'/g)).map((m) => m[1]);
  const frontBuiltIn = VIEW_OPTIONS.map((v) => v.key).filter((k) => !/^Custom\d$/.test(k));
  expect(frontBuiltIn.sort()).toEqual([...backendKeys].sort());
});

test('helpers: numbering, slot lookup, defaults, view guess, error text', () => {
  expect(nextThemeNumber([])).toBe(9);
  expect(nextThemeNumber([theme({ number: 9 }), theme({ _id: 'x', number: 12 })])).toBe(13);
  const t = theme({ slots: [{ viewKey: 'Alerts', layoutId: 'L1', name: 'x', publicId: 'p', publishedRev: 1, defaults: null }] });
  expect(findThemeSlot([t], 'L1')?.slot.viewKey).toBe('Alerts');
  expect(defaultThemeChoice([t], 'L1', 'x')).toEqual({ themeId: 't9', viewKey: 'Alerts' });
  expect(defaultThemeChoice([], 'L2', 'Lower Third')).toEqual({ themeId: 'new', viewKey: 'Lower' });
  expect(guessViewKey('Kill Feed')).toBe('Alerts');
  expect(guessViewKey('Something new')).toBe('Custom1');
  expect(apiErrorMessage({ response: { status: 507, data: { message: 'Database collection limit reached' } } })).toBe('Database collection limit reached');
  expect(apiErrorMessage({ response: { status: 500, data: {} } }, 'Create failed')).toBe('Create failed (HTTP 500)');
  expect(apiErrorMessage({ message: 'Network Error' })).toMatch(/unreachable/);
});

test('applyThemeChoice: new theme -> create + setSlot; none -> clears the current slot', async () => {
  mockApi.post.mockResolvedValue({ data: theme() });
  mockApi.put.mockImplementation(async (url: string, body: any) => ({ data: theme({ slots: [{ viewKey: 'Lower', layoutId: body.layoutId, name: 'x', publicId: 'p', publishedRev: 1, defaults: null }] }) }));
  const res = await applyThemeChoice({ themeId: 'new', viewKey: 'Lower' }, 'L1', []);
  expect(mockApi.post).toHaveBeenCalledWith('/custom-themes', {});
  expect(mockApi.put).toHaveBeenCalledWith('/custom-themes/t9/slots/Lower', { layoutId: 'L1' });
  expect(res?.label).toBe('Theme9');

  mockApi.put.mockClear();
  const inTheme = theme({ slots: [{ viewKey: 'Lower', layoutId: 'L1', name: 'x', publicId: 'p', publishedRev: 1, defaults: null }] });
  expect(await applyThemeChoice({ themeId: 'none', viewKey: 'Lower' }, 'L1', [inTheme])).toBeNull();
  expect(mockApi.put).toHaveBeenCalledWith('/custom-themes/t9/slots/Lower', { layoutId: null });
});

test('publishing from the editor adds the layout to a new Theme9', async () => {
  const doc = { ...createEmptyLayout(), elements: [{ id: 'a', type: 'text', x: 0, y: 0, w: 100, h: 40, text: 'hi' }] };
  const layout = {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Lower Third', publicId: 'pub12345', schemaVersion: 1, draftRev: 1, publishedRev: 0,
    publishedAt: null, productionLocked: false, defaults: { tournamentId: null, roundId: null, matchMode: 'selectedMatch' },
    assetBase: '', createdAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z', draft: doc,
  };
  let themes: CustomTheme[] = [];
  mockApi.get.mockImplementation(async (url: string) => {
    if (url === '/custom-themes') return { data: themes };
    if (url.startsWith('/overlay-layouts/')) return { data: layout };
    return { data: [] };
  });
  mockApi.post.mockImplementation(async (url: string) => {
    if (url.endsWith('/publish')) return { data: { ...layout, publishedRev: 1 } };
    if (url === '/custom-themes') { themes = [theme()]; return { data: theme() }; }
    throw new Error(`unexpected POST ${url}`);
  });
  mockApi.put.mockImplementation(async (url: string, body: any) => {
    expect(url).toBe('/custom-themes/t9/slots/Lower');
    themes = [theme({ slots: [{ viewKey: 'Lower', layoutId: body.layoutId, name: 'Lower Third', publicId: 'pub12345', publishedRev: 1, defaults: null }] })];
    return { data: themes[0] };
  });

  render(
    <MemoryRouter initialEntries={['/designer/aaaaaaaaaaaaaaaaaaaaaaaa']}>
      <Routes><Route path="/designer/:id" element={<DesignerEditorPage />} /></Routes>
    </MemoryRouter>
  );
  await screen.findByText('Publish');
  await waitFor(() => expect(screen.getByTestId('save-status').textContent).toBe('Saved'));
  fireEvent.click(screen.getByText('Publish'));
  // "Add to theme" defaults to a NEW theme (Theme9) as Lower Third, guessed from the name
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('+ New theme → Theme9')).toBeInTheDocument();
  expect((within(dialog).getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('new');
  expect((within(dialog).getAllByRole('combobox')[1] as HTMLSelectElement).value).toBe('Lower');
  const dialogPublish = within(dialog).getByText('Publish');
  await act(async () => { fireEvent.click(dialogPublish); });
  expect(await screen.findByTestId('publish-theme')).toHaveTextContent('Added to Theme9 (Theme 9) as Lower Third.');
  // the toolbar chip follows the reloaded theme list
  await waitFor(() => expect(screen.getByTestId('theme-chip')).toHaveTextContent('Theme9 · Lower Third'));
});
