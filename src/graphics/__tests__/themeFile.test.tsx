import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('../../login/api.tsx', () => {
  const api = { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: api, DEFAULT_BACKEND: 'http://backend.test' };
});

// eslint-disable-next-line import/first
import api from '../../login/api.tsx';
// eslint-disable-next-line import/first
import { clearCache } from '../requestCache.ts';
// eslint-disable-next-line import/first
import { apiErrorMessage, formatBytes, packApi, themeFileName, type CustomTheme } from '../api.ts';
// eslint-disable-next-line import/first
import { ImportThemeDialog, MAX_THEME_FILE_BYTES } from '../editor/ImportThemeDialog.tsx';

const mockApi = api as unknown as Record<'get' | 'post', jest.Mock>;
beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  clearCache();
});

const SUMMARY = { name: 'Finals pack', layouts: [{ name: 'Lower bar', viewKey: 'Lower' }, { name: 'Kill alerts', viewKey: 'Alerts' }], fonts: ['Clan Display'], warnings: [] as string[] };
const THEME: CustomTheme = { _id: 't1', number: 9, label: 'Theme9', name: 'My finals', slots: [] };
const themeFile = (size = 10) => new File([new Uint8Array(size)], 'finals.sstheme');

function choose(file: File) {
  fireEvent.change(screen.getByTestId('theme-file-input'), { target: { files: [file] } });
}

describe('theme file helpers', () => {
  test('file names and sizes', () => {
    expect(themeFileName('Finals: pack / 2026!')).toBe('Finals-pack-2026.sstheme');
    expect(themeFileName('////')).toBe('theme.sstheme');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(3482)).toBe('3.4 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  test('export asks for a blob and passes the view suggestion', async () => {
    const blob = new Blob(['x']);
    mockApi.get.mockResolvedValue({ data: blob });
    await expect(packApi.exportLayout('abc', 'Lower')).resolves.toBe(blob);
    expect(mockApi.get).toHaveBeenCalledWith('/overlay-layouts/abc/export', { params: { viewKey: 'Lower' }, responseType: 'blob' });
    await packApi.exportTheme('t1');
    expect(mockApi.get).toHaveBeenLastCalledWith('/custom-themes/t1/export', { responseType: 'blob' });
  });

  test('a failed export still surfaces the server message (the error body arrives as a blob)', async () => {
    const body = { text: async () => JSON.stringify({ message: 'This theme has no layouts to export yet' }) };
    mockApi.get.mockRejectedValue({ response: { status: 400, data: body } });
    const err = await packApi.exportTheme('t1').catch((e) => e);
    expect(apiErrorMessage(err, 'Export failed')).toBe('This theme has no layouts to export yet');
  });
});

describe('ImportThemeDialog', () => {
  test('pick a file, see what is in it, rename the theme, import', async () => {
    mockApi.post.mockImplementation((_url: string, _body: unknown, cfg: any) =>
      Promise.resolve({ data: cfg.params.dryRun ? SUMMARY : { theme: THEME, warnings: ['Font "X" was skipped: your font library is full (30).'] } }));
    const onImported = jest.fn();
    render(<ImportThemeDialog onClose={() => {}} onImported={onImported} />);
    expect(screen.getByTestId('theme-import-confirm')).toBeDisabled();

    const file = themeFile();
    choose(file);
    const nameInput = await screen.findByTestId('theme-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Finals pack');
    expect(mockApi.post).toHaveBeenCalledWith('/custom-themes/import', file, { params: { dryRun: 1 }, headers: { 'Content-Type': 'application/octet-stream' } });
    expect(screen.getByText('2 layouts')).toBeInTheDocument();
    expect(screen.getByText('Kill alerts', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Fonts: Clan Display')).toBeInTheDocument();

    // A name is required.
    fireEvent.change(nameInput, { target: { value: '   ' } });
    expect(screen.getByTestId('theme-import-confirm')).toBeDisabled();
    fireEvent.change(nameInput, { target: { value: '  My finals ' } });
    fireEvent.click(screen.getByTestId('theme-import-confirm'));

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(mockApi.post).toHaveBeenLastCalledWith('/custom-themes/import', file, { params: { name: 'My finals' }, headers: { 'Content-Type': 'application/octet-stream' } });
    expect(onImported).toHaveBeenCalledWith(THEME, ['Font "X" was skipped: your font library is full (30).']);
  });

  test('a file the server rejects shows its message and cannot be imported', async () => {
    mockApi.post.mockRejectedValue({ response: { status: 400, data: { message: 'This is not a ScoreSync theme file (.sstheme)' } } });
    render(<ImportThemeDialog onClose={() => {}} onImported={() => {}} />);
    choose(themeFile());
    expect(await screen.findByRole('alert')).toHaveTextContent('This is not a ScoreSync theme file (.sstheme)');
    expect(screen.queryByTestId('theme-name-input')).toBeNull();
    expect(screen.getByTestId('theme-import-confirm')).toBeDisabled();
  });

  test('an oversized file is refused without uploading it', async () => {
    render(<ImportThemeDialog onClose={() => {}} onImported={() => {}} />);
    const big = themeFile();
    Object.defineProperty(big, 'size', { value: MAX_THEME_FILE_BYTES + 1 });
    choose(big);
    expect(await screen.findByRole('alert')).toHaveTextContent('too large');
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  test('a failed import keeps the dialog open with the reason', async () => {
    mockApi.post.mockImplementation((_url: string, _body: unknown, cfg: any) =>
      (cfg.params.dryRun ? Promise.resolve({ data: SUMMARY }) : Promise.reject({ response: { status: 507, data: { message: 'Database collection limit reached — contact the administrator' } } })));
    const onImported = jest.fn();
    render(<ImportThemeDialog onClose={() => {}} onImported={onImported} />);
    choose(themeFile());
    await screen.findByTestId('theme-name-input');
    fireEvent.click(screen.getByTestId('theme-import-confirm'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Database collection limit reached');
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.getByTestId('theme-import-confirm')).not.toBeDisabled();
  });
});
