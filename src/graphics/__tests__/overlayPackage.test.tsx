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
import { packApi, packageFileName } from '../api.ts';
// eslint-disable-next-line import/first
import { ImportPackageDialog } from '../editor/ImportPackageDialog.tsx';
// eslint-disable-next-line import/first
import { ImportHtmlCssDialog } from '../editor/ImportHtmlCssDialog.tsx';

const mockApi = api as unknown as Record<'get' | 'post', jest.Mock>;
beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  clearCache();
});

const SUMMARY = {
  name: 'Neon Card', kind: 'html', description: 'A card', author: { name: 'Kai', url: '' }, license: 'CC0', tags: ['neon'],
  canvas: { width: 1920, height: 1080 }, layers: ['Card'], layerCount: 1, fonts: ['Bebas Neue'], images: 2, warnings: ['Scripts were removed: packages animate with CSS only.'],
};
const zipFile = (name = 'neon.zip') => new File([new Uint8Array([0x50, 0x4b, 3, 4])], name);

describe('overlay package API', () => {
  test('file name, export and dry run go to the package routes', async () => {
    expect(packageFileName('Finals: card!')).toBe('Finals-card.zip');
    expect(packageFileName('////')).toBe('overlay.zip');
    mockApi.get.mockResolvedValue({ data: new Blob(['x']) });
    await packApi.exportPackage('abc');
    expect(mockApi.get).toHaveBeenCalledWith('/overlay-layouts/abc/export-package', { responseType: 'blob' });
    mockApi.post.mockResolvedValue({ data: SUMMARY });
    const file = zipFile();
    await packApi.inspectPackage(file);
    expect(mockApi.post).toHaveBeenCalledWith('/overlay-layouts/import-package', file, { params: { dryRun: 1 }, headers: { 'Content-Type': 'application/zip' } });
  });
});

describe('ImportPackageDialog', () => {
  test('pick a package, see credit + warnings, rename, import', async () => {
    mockApi.post.mockImplementation((_url: string, _body: unknown, cfg: any) =>
      Promise.resolve({ data: cfg.params?.dryRun ? SUMMARY : { layout: { _id: 'L1', name: 'My card' }, warnings: [] } }));
    const onImported = jest.fn();
    render(<ImportPackageDialog onClose={() => {}} onImported={onImported} />);
    expect(screen.getByTestId('package-import-confirm')).toBeDisabled();

    fireEvent.change(screen.getByTestId('package-file-input'), { target: { files: [zipFile()] } });
    const nameInput = await screen.findByTestId('package-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Neon Card');
    expect(screen.getByTestId('package-summary').textContent).toMatch(/Kai/);
    expect(screen.getByTestId('package-summary').textContent).toMatch(/2 images/);
    expect(screen.getByText(/Scripts were removed/)).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: 'My card' } });
    fireEvent.click(screen.getByTestId('package-import-confirm'));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith('L1', 'My card', []));
    expect(mockApi.post).toHaveBeenLastCalledWith('/overlay-layouts/import-package', expect.any(File), { params: { name: 'My card' }, headers: { 'Content-Type': 'application/zip' } });
  });

  test('a refused package shows the server message and the schema errors; not a zip is caught early', async () => {
    mockApi.post.mockRejectedValue({ response: { status: 400, data: { message: 'This package has content the Designer cannot accept', errors: [{ path: 'elements.0.css.html', message: 'event handlers (on…=) are not allowed' }] } } });
    render(<ImportPackageDialog onClose={() => {}} onImported={() => {}} />);
    fireEvent.change(screen.getByTestId('package-file-input'), { target: { files: [zipFile()] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot accept');
    expect(screen.getByTestId('package-errors')).toHaveTextContent('event handlers');

    fireEvent.change(screen.getByTestId('package-file-input'), { target: { files: [zipFile('notes.txt')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('.zip');
  });

  test('the format is documented in the dialog with an example download', () => {
    render(<ImportPackageDialog onClose={() => {}} onImported={() => {}} />);
    expect(screen.getByTestId('package-example')).toHaveAttribute('href', '/designer/overlay-package-example.zip');
    fireEvent.click(screen.getByText(/Show package format/));
    expect(screen.getByTestId('package-format').textContent).toMatch(/"format": "scoresync-overlay"/);
  });
});

describe('ImportHtmlCssDialog', () => {
  test('pasted code becomes a new design with one full-canvas css layer', async () => {
    mockApi.post.mockResolvedValue({ data: { _id: 'D1', name: 'Neon', draft: {} } });
    const onCreated = jest.fn();
    render(<ImportHtmlCssDialog onClose={() => {}} onCreated={onCreated} />);
    fireEvent.change(screen.getByTestId('html-import-name'), { target: { value: 'Neon' } });
    const [htmlBox, cssBox] = screen.getAllByRole('textbox').filter((el) => el.tagName === 'TEXTAREA');
    fireEvent.change(htmlBox, { target: { value: '<div class="a">{{derived.teams[0].teamName}}</div>' } });
    fireEvent.change(cssBox, { target: { value: '.a{animation:x 1s}@keyframes x{from{opacity:0}}' } });
    fireEvent.click(screen.getByTestId('html-css-create'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('D1'));
    const [url, body] = mockApi.post.mock.calls[0];
    expect(url).toBe('/overlay-layouts');
    expect(body.name).toBe('Neon');
    expect(body.draft.stage).toMatchObject({ width: 1920, height: 1080 });
    expect(body.draft.elements).toHaveLength(1);
    expect(body.draft.elements[0]).toMatchObject({ type: 'css', w: 1920, h: 1080, css: { html: expect.stringContaining('teamName') } });
  });

  test('a script blocks creating', () => {
    render(<ImportHtmlCssDialog onClose={() => {}} onCreated={() => {}} />);
    const [htmlBox] = screen.getAllByRole('textbox').filter((el) => el.tagName === 'TEXTAREA');
    fireEvent.change(htmlBox, { target: { value: '<div onclick="x()">hi</div>' } });
    expect(screen.getByTestId('html-css-create')).toBeDisabled();
  });
});
