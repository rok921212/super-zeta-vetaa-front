import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';

// The app's axios instance: every call is a jest mock (no network).
jest.mock('../../login/api.tsx', () => {
  const api = { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: api, DEFAULT_BACKEND: 'http://backend.test' };
});

// eslint-disable-next-line import/first
import api from '../../login/api.tsx';
// eslint-disable-next-line import/first
import { clearCache } from '../requestCache.ts';
// eslint-disable-next-line import/first
import {
  BUILTIN_FONTS, familyFromFileName, fontFileUrl, fontValue, isWoff2, primaryFamily, registerFontFaces, FONT_FAMILY_RE,
} from '../renderer/fonts.ts';
// eslint-disable-next-line import/first
import { FontPicker, WOFF2_ONLY, checkFontFile, useFontLibrary } from '../editor/FontPicker.tsx';

const mockApi = api as unknown as Record<'get' | 'post' | 'delete', jest.Mock>;

/** Bytes with a valid WOFF2 header ('wOF2' + flavor + total length). */
function woff2Bytes(size = 64): Uint8Array {
  const b = new Uint8Array(size).fill(7);
  b.set([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0, (size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255]);
  return b;
}
const fontFile = (name: string, bytes: Uint8Array = woff2Bytes()) => new File([bytes], name, { type: 'font/woff2' });

beforeEach(() => {
  clearCache();
  try { localStorage.setItem('designer.guide.seen', '1'); } catch { /* no storage */ }
  [mockApi.get, mockApi.post, mockApi.delete].forEach((m) => m.mockReset());
  mockApi.get.mockResolvedValue({ data: [] });
});

// ── pure helpers ────────────────────────────────────────────────────────────

test('fontValue / primaryFamily round-trip, and the stored value passes the layout schema', () => {
  for (const family of ['Tungsten', 'Bebas Neue', 'Clan Display 2']) {
    expect(primaryFamily(fontValue(family))).toBe(family);
  }
  expect(primaryFamily('Inter, sans-serif')).toBe('Inter');
  expect(primaryFamily("'Agency FB', Impact")).toBe('Agency FB');
  expect(primaryFamily(undefined)).toBe('');

  const doc: any = createEmptyLayout();
  doc.theme.typography.fontFamily = fontValue('Clan Display 2');
  doc.elements = [{ id: 't', type: 'text', x: 0, y: 0, w: 10, h: 10, style: { fontFamily: fontValue('Bebas Neue') } }];
  expect(validateLayout(doc)).toMatchObject({ ok: true });
});

test('isWoff2 accepts only the wOF2 signature with a matching length field', () => {
  expect(isWoff2(woff2Bytes(64), 64)).toBe(true);
  expect(isWoff2(woff2Bytes(64))).toBe(true);
  expect(isWoff2(woff2Bytes(64), 100)).toBe(false); // truncated / padded
  expect(isWoff2(new Uint8Array([0x77, 0x4f, 0x46, 0x46, 0, 0, 0, 0, 0, 0, 0, 64]), 64)).toBe(false); // WOFF 1
  expect(isWoff2(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64]), 64)).toBe(false); // TrueType
  expect(isWoff2(new Uint8Array(4))).toBe(false);
});

test('familyFromFileName always yields a name the server accepts', () => {
  expect(familyFromFileName('Clan-Display_Bold.woff2')).toBe('Clan-Display_Bold');
  expect(familyFromFileName('ufonts.com_agencyfb-black (1).woff2')).toBe('ufonts com_agencyfb-black 1');
  expect(familyFromFileName('123.woff2')).toBe('Custom Font');
  for (const n of ['Clan-Display_Bold.woff2', 'ufonts.com_agencyfb-black (1).woff2', '9 lives!.woff2', `${'x'.repeat(80)}.woff2`, '…….woff2']) {
    expect(familyFromFileName(n)).toMatch(FONT_FAMILY_RE);
  }
});

test('registerFontFaces adds each font once, from the cloud file route', () => {
  const added: any[] = [];
  const FontFaceMock = jest.fn(function (this: any, family: string, src: string, desc: any) { Object.assign(this, { family, src, desc }); });
  (global as any).FontFace = FontFaceMock;
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add: (f: any) => added.push(f), delete: jest.fn() } });
  try {
    const id = 'a'.repeat(24);
    registerFontFaces([{ id, family: 'Clan Display' }, { id: 'nope', family: 'Bad Id' }, { id: 'b'.repeat(24), family: 'x";}' }]);
    registerFontFaces([{ id, family: 'Clan Display' }]);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ family: 'Clan Display', src: `url("${fontFileUrl(id)}") format("woff2")`, desc: { display: 'block' } });
    expect(fontFileUrl(id)).toBe(`http://backend.test/api/overlay-fonts/file/${id}`);
  } finally {
    delete (global as any).FontFace;
    delete (document as any).fonts;
  }
});

test('checkFontFile: only .woff2, by extension and by content', async () => {
  await expect(checkFontFile(fontFile('ok.woff2'))).resolves.toBeUndefined();
  await expect(checkFontFile(fontFile('font.ttf'))).rejects.toThrow(WOFF2_ONLY);
  await expect(checkFontFile(fontFile('renamed.woff2', new Uint8Array(64).fill(1)))).rejects.toThrow(WOFF2_ONLY);
  const big = new File([new Uint8Array(1)], 'big.woff2');
  Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 });
  await expect(checkFontFile(big)).rejects.toThrow('2 MB');
});

// ── picker ──────────────────────────────────────────────────────────────────

function Harness({ initial, emptyLabel }: { initial?: string; emptyLabel?: string }) {
  const library = useFontLibrary();
  const [value, setValue] = React.useState<string | undefined>(initial);
  return (
    <div>
      <FontPicker value={value} onChange={setValue} library={library} emptyLabel={emptyLabel} />
      <output data-testid="value">{value ?? ''}</output>
    </div>
  );
}

const optionLabels = () => within(screen.getByRole('combobox')).getAllByRole('option').map((o) => o.textContent);

test('picker lists uploaded fonts then built-ins, and keeps an unknown current value', async () => {
  mockApi.get.mockResolvedValue({ data: [{ _id: 'a'.repeat(24), family: 'Clan Display', size: 100 }] });
  render(<Harness initial="Inter, sans-serif" />);
  await waitFor(() => expect(optionLabels()).toContain('Clan Display · uploaded'));
  expect(optionLabels()).toEqual(['Inter', 'Clan Display · uploaded', ...BUILTIN_FONTS]);
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('Inter');
  expect(screen.getByTestId('value').textContent).toBe('Inter, sans-serif'); // untouched until the user picks

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Tungsten' } });
  expect(screen.getByTestId('value').textContent).toBe('"Tungsten", sans-serif');
  expect(optionLabels()).not.toContain('Inter');
});

test('picker: a non-woff2 file is refused before any request', async () => {
  render(<Harness />);
  await act(async () => {
    fireEvent.change(screen.getByTestId('font-file'), { target: { files: [fontFile('Cool.ttf')] } });
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(WOFF2_ONLY);
  expect(mockApi.post).not.toHaveBeenCalled();
});

test('picker: uploading a .woff2 posts the raw file, lists it and selects it', async () => {
  mockApi.post.mockImplementation(async (_url: string, _body: any, cfg: any) => ({ data: { _id: 'c'.repeat(24), family: cfg.params.name, size: 64 } }));
  render(<Harness emptyLabel="default" />);
  const file = fontFile('Clan Display.woff2');
  await act(async () => {
    fireEvent.change(screen.getByTestId('font-file'), { target: { files: [file] } });
  });
  await waitFor(() => expect(screen.getByTestId('value').textContent).toBe('"Clan Display", sans-serif'));
  expect(mockApi.post).toHaveBeenCalledWith('/overlay-fonts', file, { params: { name: 'Clan Display' }, headers: { 'Content-Type': 'font/woff2' } });
  expect(optionLabels()).toContain('Clan Display · uploaded');
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('Clan Display');
});

test('picker: a server refusal (duplicate name) is shown, nothing is selected', async () => {
  mockApi.post.mockRejectedValue({ response: { status: 409, data: { message: 'You already have a font named "Dup"' } } });
  render(<Harness />);
  await act(async () => {
    fireEvent.change(screen.getByTestId('font-file'), { target: { files: [fontFile('Dup.woff2')] } });
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('already have a font named');
  expect(screen.getByTestId('value').textContent).toBe('');
});

test('picker: deleting the selected uploaded font needs a second click, then clears the value', async () => {
  const id = 'd'.repeat(24);
  mockApi.get.mockResolvedValue({ data: [{ _id: id, family: 'Old Font', size: 10 }] });
  mockApi.delete.mockResolvedValue({ data: undefined });
  render(<Harness initial={fontValue('Old Font')} />);
  const del = await screen.findByText('Delete font');
  fireEvent.click(del);
  expect(mockApi.delete).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByText('Confirm delete')); });
  expect(mockApi.delete).toHaveBeenCalledWith(`/overlay-fonts/${id}`);
  await waitFor(() => expect(optionLabels()).not.toContain('Old Font · uploaded'));
  expect(screen.getByTestId('value').textContent).toBe('');
});
