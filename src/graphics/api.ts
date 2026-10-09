// Designer layouts API client.
//
// Owner routes (/api/overlay-layouts) go through the app's authenticated axios
// `api`. The public render route is fetched straight from the CLOUD origin —
// never through the local relay — because on overlay pages `api` points at
// the relay, and layouts are not part of the relay's public live feed.

import api, { DEFAULT_BACKEND } from '../login/api.tsx';
import type { LayoutDocument } from './schema/layoutTypes.ts';

export interface LayoutDefaults {
  tournamentId: string | null;
  roundId: string | null;
  matchMode: 'fixedMatch' | 'selectedMatch' | 'liveMatch' | 'roundOverall' | 'tournamentOverall';
}

export interface LayoutSummary {
  _id: string;
  name: string;
  publicId: string;
  schemaVersion: number;
  draftRev: number;
  publishedRev: number;
  publishedAt: string | null;
  productionLocked: boolean;
  defaults: LayoutDefaults;
  assetBase: string;
  createdAt: string;
  updatedAt: string;
  // ── library metadata (absent from a backend that predates the dashboard) ──
  description?: string;
  /** A built-in category id (DESIGN_CATEGORIES) or the id of one of the account's own categories. */
  categoryId?: string | null;
  tags?: string[];
  archivedAt?: string | null;
  isTemplate?: boolean;
  /** Canvas size as of the last save; null on a design saved before this was recorded. */
  stage?: { width: number; height: number } | null;
}

/** What PATCH /overlay-layouts/:id/meta accepts. None of it touches the draft or its revision. */
export interface LayoutMetaPatch {
  name?: string;
  description?: string;
  categoryId?: string | null;
  tags?: string[];
  archived?: boolean;
  isTemplate?: boolean;
}

export interface LayoutFull extends LayoutSummary {
  draft: LayoutDocument;
  /** What this backend's save route understands (absent on an older deploy): 'gzip-save', 'summary-save'. */
  capabilities?: string[];
}

export interface RevisionInfo {
  rev: number;
  createdAt: string;
  publishedBy: string;
}

export interface RenderPayload {
  publicId: string;
  name: string;
  publishedRev: number;
  publishedAt: string | null;
  schemaVersion: number;
  stage: LayoutDocument['stage'];
  defaults: LayoutDefaults;
  assetBase: string;
  /** The owner's uploaded fonts as of this publish (renderer/fonts.ts registers them). */
  fonts?: Array<{ id: string; family: string }>;
  published: LayoutDocument;
}

/** A 409 from an autosave / publish: somebody (another tab) saved first. */
export class ConflictError extends Error {
  currentRev: number;
  constructor(currentRev: number) {
    super('Layout changed since you loaded it');
    this.currentRev = currentRev;
  }
}
export class LockedError extends Error {
  constructor() { super('Layout is production-locked'); }
}
export class ValidationError extends Error {
  errors: Array<{ path: string; message: string }>;
  constructor(errors: Array<{ path: string; message: string }>) {
    super(errors[0] ? `${errors[0].path}: ${errors[0].message}` : 'Invalid layout');
    this.errors = errors;
  }
}

function rethrow(err: any): never {
  const status = err?.response?.status;
  const body = err?.response?.data || {};
  if (status === 409) throw new ConflictError(body.currentRev);
  if (status === 423) throw new LockedError();
  if (status === 400 && Array.isArray(body.errors)) throw new ValidationError(body.errors);
  throw err;
}

const call = async <T>(p: Promise<{ data: T }>): Promise<T> => {
  try {
    return (await p).data;
  } catch (err) {
    return rethrow(err);
  }
};

// ── save transport ──────────────────────────────────────────────────────────
// A save used to upload the whole draft as plain JSON and get the whole draft
// echoed back. Now, when the backend says it can (LayoutFull.capabilities):
//   - the body is gzipped in the browser (drafts are repetitive JSON: ~8-12x);
//   - the reply is the summary only (the editor already has its own draft).
// Both are opt-in per backend, so an older deploy keeps working unchanged.

const saveCaps = new Map<string, Set<string>>();

/** Remember what the backend that served this layout can do. */
export function noteCapabilities(id: string, caps: string[] | undefined): void {
  saveCaps.set(id, new Set(Array.isArray(caps) ? caps : []));
}

/** Bodies smaller than this are not worth compressing. */
export const GZIP_MIN_BYTES = 1024;

/** gzip a string with the browser's CompressionStream; null where it is not available. */
export async function gzipText(text: string): Promise<Blob | null> {
  const CS = (globalThis as any).CompressionStream;
  if (typeof CS !== 'function' || typeof Blob === 'undefined' || typeof Response === 'undefined') return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CS('gzip'));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
}

/** Byte counts of the last save, for the status bar / diagnostics. */
export const lastSave = { rawBytes: 0, sentBytes: 0 };

async function putLayout(id: string, body: Record<string, unknown>): Promise<{ data: LayoutFull | LayoutSummary }> {
  const caps = saveCaps.get(id);
  const params = caps?.has('summary-save') ? { return: 'summary' } : undefined;
  const json = JSON.stringify(body);
  lastSave.rawBytes = json.length;
  lastSave.sentBytes = json.length;
  if (caps?.has('gzip-save') && json.length >= GZIP_MIN_BYTES) {
    const gz = await gzipText(json);
    if (gz && gz.size < json.length) {
      lastSave.sentBytes = gz.size;
      return api.put(`/overlay-layouts/${id}`, gz, { params, headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } });
    }
  }
  return api.put(`/overlay-layouts/${id}`, body, { params });
}

export const layoutsApi = {
  list: () => call<LayoutSummary[]>(api.get('/overlay-layouts')),
  create: (body: { name?: string; draft?: LayoutDocument; defaults?: Partial<LayoutDefaults> }) =>
    call<LayoutFull>(api.post('/overlay-layouts', body)),
  get: async (id: string) => { const full = await call<LayoutFull>(api.get(`/overlay-layouts/${id}`)); noteCapabilities(id, full.capabilities); return full; },
  /** Resolves with the saved layout's summary (and its draft too, from a backend that still echoes it). */
  save: (id: string, expectedRev: number, patch: { draft?: LayoutDocument; name?: string; defaults?: Partial<LayoutDefaults>; assetBase?: string }) =>
    call<LayoutSummary>(putLayout(id, { expectedRev, ...patch }) as Promise<{ data: LayoutSummary }>),
  remove: (id: string) => call<void>(api.delete(`/overlay-layouts/${id}`)),
  /** Rename / describe / categorise / tag / archive / mark as template. */
  patchMeta: (id: string, patch: LayoutMetaPatch) => call<LayoutSummary>(api.patch(`/overlay-layouts/${id}/meta`, patch)),
  publish: (id: string, expectedRev?: number) => call<LayoutSummary>(api.post(`/overlay-layouts/${id}/publish`, { expectedRev })),
  revisions: (id: string) => call<RevisionInfo[]>(api.get(`/overlay-layouts/${id}/revisions`)),
  restore: (id: string, rev: number, expectedRev: number) =>
    call<LayoutFull>(api.post(`/overlay-layouts/${id}/revisions/${rev}/restore`, { expectedRev })),
  duplicate: (id: string) => call<LayoutFull>(api.post(`/overlay-layouts/${id}/duplicate`)),
  lock: (id: string) => call<LayoutSummary>(api.post(`/overlay-layouts/${id}/lock`)),
  unlock: (id: string) => call<LayoutSummary>(api.post(`/overlay-layouts/${id}/unlock`)),
};

// ── custom themes (Theme9, Theme10, …) ────────────────────────────────────────

export interface ThemeSlot {
  viewKey: string;
  layoutId: string;
  name: string;
  publicId: string;
  publishedRev: number;
  defaults: LayoutDefaults | null;
}

export interface CustomTheme {
  _id: string;
  number: number;
  /** "Theme9" — what DisplayHud shows next to Theme1-8. */
  label: string;
  name: string;
  slots: ThemeSlot[];
  updatedAt?: string;
}

export const themesApi = {
  list: () => call<CustomTheme[]>(api.get('/custom-themes')),
  create: (name?: string) => call<CustomTheme>(api.post('/custom-themes', name ? { name } : {})),
  rename: (id: string, name: string) => call<CustomTheme>(api.patch(`/custom-themes/${id}`, { name })),
  remove: (id: string) => call<void>(api.delete(`/custom-themes/${id}`)),
  /** Put a layout into a view slot (or clear the slot with null). A layout lives in one slot only. */
  setSlot: (id: string, viewKey: string, layoutId: string | null) =>
    call<CustomTheme>(api.put(`/custom-themes/${id}/slots/${encodeURIComponent(viewKey)}`, { layoutId })),
};

/** The custom theme + view a layout currently sits in, if any. */
export function findThemeSlot(themes: CustomTheme[], layoutId: string): { theme: CustomTheme; slot: ThemeSlot } | null {
  for (const theme of themes) {
    const slot = theme.slots.find((s) => s.layoutId === layoutId);
    if (slot) return { theme, slot };
  }
  return null;
}

/** The number the next new custom theme will get (mirrors the backend: max(8, highest) + 1). */
export const nextThemeNumber = (themes: CustomTheme[]): number => Math.max(8, ...themes.map((t) => t.number)) + 1;

// ── uploaded fonts (.woff2, one library per account) ──────────────────────────

export interface FontInfo {
  _id: string;
  family: string;
  size: number;
  createdAt?: string;
}

// Not through `call`: its 409 -> ConflictError mapping is about layout revisions;
// here a 409 is "name taken" / "library full" and the server's message is the answer.
export const fontsApi = {
  list: async (): Promise<FontInfo[]> => (await api.get('/overlay-fonts')).data,
  /** The request body IS the file; the family name rides in the query string. */
  upload: async (file: Blob, name: string): Promise<FontInfo> =>
    (await api.post('/overlay-fonts', file, { params: { name }, headers: { 'Content-Type': 'font/woff2' } })).data,
  remove: async (id: string): Promise<void> => { await api.delete(`/overlay-fonts/${id}`); },
};

// ── uploaded images (one library per account) ───────────────────────────────

export interface AssetInfo {
  _id: string;
  name: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  hasThumb: boolean;
  createdAt?: string;
  /** Set by an upload of bytes the library already had. */
  duplicate?: boolean;
}

// Not through `call` (see fontsApi): a 409 here is "library full" / "image in use".
export const assetsApi = {
  list: async (): Promise<AssetInfo[]> => (await api.get('/overlay-assets')).data,
  /** The request body IS the file; `onProgress` gets 0..1 while it uploads. */
  upload: async (file: Blob, name: string, onProgress?: (fraction: number) => void): Promise<AssetInfo> =>
    (await api.post('/overlay-assets', file, {
      params: { name },
      headers: { 'Content-Type': 'application/octet-stream' },
      onUploadProgress: onProgress ? (e: { loaded: number; total?: number }) => onProgress(e.total ? Math.min(1, e.loaded / e.total) : 0) : undefined,
    })).data,
  setThumb: async (id: string, thumb: Blob): Promise<AssetInfo> =>
    (await api.put(`/overlay-assets/${id}/thumb`, thumb, { headers: { 'Content-Type': 'application/octet-stream' } })).data,
  rename: async (id: string, name: string): Promise<AssetInfo> => (await api.patch(`/overlay-assets/${id}`, { name })).data,
  /** `force` deletes an image drafts still use; one a published revision uses is never deleted. */
  remove: async (id: string, force = false): Promise<void> => { await api.delete(`/overlay-assets/${id}`, { params: force ? { force: 1 } : undefined }); },
};

// ── design categories the account made itself ────────────────────────────────

export interface CategoryInfo { _id: string; name: string }

export const categoriesApi = {
  list: async (): Promise<CategoryInfo[]> => (await api.get('/overlay-categories')).data,
  create: async (name: string): Promise<CategoryInfo> => (await api.post('/overlay-categories', { name })).data,
  rename: async (id: string, name: string): Promise<CategoryInfo> => (await api.patch(`/overlay-categories/${id}`, { name })).data,
  /** Its designs are kept and become uncategorised. */
  remove: async (id: string): Promise<{ removed: boolean; uncategorised: number }> => (await api.delete(`/overlay-categories/${id}`)).data,
};

// ── theme files (.sstheme): export a layout / theme, import one as a new theme ──

export const THEME_FILE_EXTENSION = '.sstheme';

/** What an import will create — the dry-run answer the naming dialog shows. */
export interface ThemeFileSummary {
  /** The name the file suggests for the new theme. */
  name: string;
  layouts: Array<{ name: string; viewKey: string }>;
  fonts: string[];
  /** Uploaded images travelling in the file. */
  images?: number;
  warnings: string[];
}

const PACK_HEADERS = { 'Content-Type': 'application/octet-stream' };

/** A blob download's error body is a Blob too: turn it back into JSON so `apiErrorMessage` can read it. */
async function readBlobError(err: any): Promise<never> {
  const data = err?.response?.data;
  if (data && typeof data.text === 'function') {
    try { err.response.data = JSON.parse(await data.text()); } catch { /* not JSON: keep the transport error */ }
  }
  throw err;
}

// Not through `call` (see fontsApi): a 409 here is never a layout-revision conflict.
export const packApi = {
  /** `viewKey` is only a suggestion for a layout that sits in no theme yet. */
  exportLayout: (id: string, viewKey?: string): Promise<Blob> =>
    api.get(`/overlay-layouts/${id}/export`, { params: viewKey ? { viewKey } : undefined, responseType: 'blob' }).then((r) => r.data, readBlobError),
  exportTheme: (id: string): Promise<Blob> =>
    api.get(`/custom-themes/${id}/export`, { responseType: 'blob' }).then((r) => r.data, readBlobError),
  /** Reads the file on the server and writes nothing. */
  inspect: async (file: Blob): Promise<ThemeFileSummary> =>
    (await api.post('/custom-themes/import', file, { params: { dryRun: 1 }, headers: PACK_HEADERS })).data,
  /** The request body IS the file; the new theme's name rides in the query string. */
  importPack: async (file: Blob, name: string): Promise<{ theme: CustomTheme; warnings: string[] }> =>
    (await api.post('/custom-themes/import', file, { params: { name }, headers: PACK_HEADERS })).data,
};

/** "Finals: pack" -> "Finals-pack.sstheme" (same rule as the backend's Content-Disposition). */
export function themeFileName(name: string): string {
  const base = name.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
  return `${base || 'theme'}${THEME_FILE_EXTENSION}`;
}

/** Hand a blob to the browser as a file download. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "3.4 KB" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Human message for a failed API call: the server's `message` when it sent one, else the transport error. */
export function apiErrorMessage(err: any, fallback = 'Request failed'): string {
  if (err instanceof ValidationError) return err.message;
  if (err instanceof ConflictError || err instanceof LockedError) return err.message;
  const serverMsg = err?.response?.data?.message;
  if (typeof serverMsg === 'string' && serverMsg) return serverMsg;
  if (err?.response?.status) return `${fallback} (HTTP ${err.response.status})`;
  if (err?.message === 'Network Error') return 'The server is unreachable — check your connection.';
  return err?.message || fallback;
}

/**
 * Public, cloud-direct fetch of a published overlay. No custom headers (so no
 * CORS preflight): `cache: 'no-cache'` makes the browser revalidate its cached
 * copy with the server's ETag itself, so an unchanged layout costs a 304 on
 * the wire. Callers compare `publishedRev` to detect a new publish.
 */
export async function fetchPublishedOverlay(publicId: string, signal?: AbortSignal): Promise<RenderPayload> {
  const res = await fetch(`${DEFAULT_BACKEND}/api/overlay-render/${encodeURIComponent(publicId)}`, { signal, cache: 'no-cache' });
  if (!res.ok) throw Object.assign(new Error(`overlay-render ${res.status}`), { status: res.status });
  return res.json();
}

/** The shareable OBS URL for a published layout. */
export function overlayUrl(publicId: string, params: { t?: string | null; r?: string | null; m?: string | null; mode?: string; k?: string | null } = {}): string {
  const q = new URLSearchParams();
  // Permanent link: the account's overlay key stands in for tournament / round / match.
  if (params.k) return `${window.location.origin}/o/${publicId}?k=${encodeURIComponent(params.k)}`;
  if (params.t) q.set('t', params.t);
  if (params.r) q.set('r', params.r);
  if (params.m) q.set('m', params.m);
  if (params.mode && params.mode !== 'selectedMatch') q.set('mode', params.mode);
  const qs = q.toString();
  return `${window.location.origin}/o/${publicId}${qs ? `?${qs}` : ''}`;
}
