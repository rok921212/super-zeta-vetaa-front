// The account's image library as the editor uses it: the list (cached), and
// uploads with progress, per-file errors and a browser-made thumbnail.
//
// A file is checked here first (type, size) so an obvious mistake costs no
// request; the server repeats every check and is the one that decides.
// Nothing is ever kept as a local object URL in the design: an upload either
// becomes an `asset:<id>` on the server or it is reported as failed.

import { useCallback, useMemo, useRef, useState } from 'react';
import { assetsApi, apiErrorMessage, type AssetInfo } from '../api.ts';
import { CACHE_KEYS, setCached, useCached } from '../requestCache.ts';
import { assetFileProblem } from '../renderer/assets.ts';

export interface UploadState {
  key: string;
  name: string;
  /** 0..1 while uploading. */
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

export interface AssetLibraryApi {
  /** null while loading. */
  assets: AssetInfo[] | null;
  /** Why the library is unavailable (old backend, overlay database not configured…), else null. */
  error: string | null;
  uploads: UploadState[];
  /** Uploads every file; resolves with the assets that made it (failures are in `uploads`). */
  upload(files: File[]): Promise<AssetInfo[]>;
  rename(id: string, name: string): Promise<void>;
  /** Rejects with the server's error (409 = still used; see `usedByOf`). */
  remove(id: string, force?: boolean): Promise<void>;
  dismissUpload(key: string): void;
  reload(): Promise<unknown>;
}

const THUMB_SIDE = 256;
const THUMB_MAX_BYTES = 60 * 1024;

/** A small preview drawn in the browser; null where that is not possible (SVG, no canvas, a file the browser cannot decode). */
export async function makeThumbnail(file: Blob): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return null;
  if (file.type === 'image/svg+xml') return null; // an SVG is its own (tiny, sharp) preview
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('decode failed'));
      i.src = url;
    });
    const k = Math.min(1, THUMB_SIDE / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const [type, quality] of [['image/webp', 0.8], ['image/webp', 0.5], ['image/png', undefined]] as const) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
      if (blob && blob.size <= THUMB_MAX_BYTES) return blob;
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url); // never left behind
  }
}

/** `{ drafts, published }` from a "still in use" refusal, else null. */
export function usedByOf(err: any): { drafts: number; published: number; code: string } | null {
  const data = err?.response?.status === 409 ? err.response.data : null;
  return data && data.usedBy ? { ...data.usedBy, code: String(data.code || '') } : null;
}

let uploadSeq = 0;

export function useAssetLibrary(): AssetLibraryApi {
  const q = useCached<AssetInfo[]>(CACHE_KEYS.assets, async () => { const list = await assetsApi.list(); return Array.isArray(list) ? list : []; });
  const assets: AssetInfo[] | null = q.data ?? (q.error ? [] : null);
  const error = q.error && !q.data ? apiErrorMessage(q.error, 'The image library could not be loaded') : null;
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const alive = useRef(true);
  const setList = useCallback((fn: (list: AssetInfo[]) => AssetInfo[]) => setCached<AssetInfo[]>(CACHE_KEYS.assets, (cur) => fn(cur ?? [])), []);
  const patchUpload = useCallback((key: string, patch: Partial<UploadState>) => {
    if (alive.current) setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }, []);

  const upload = useCallback(async (files: File[]): Promise<AssetInfo[]> => {
    const made: AssetInfo[] = [];
    for (const file of files) {
      const key = `up${++uploadSeq}`;
      const problem = assetFileProblem(file);
      setUploads((u) => [...u, { key, name: file.name, progress: 0, status: problem ? 'error' : 'uploading', error: problem || undefined }]);
      if (problem) continue;
      try {
        let asset = await assetsApi.upload(file, file.name, (p) => patchUpload(key, { progress: p }));
        if (!asset.hasThumb) {
          // Best effort: without a thumbnail the library shows the image itself.
          const thumb = await makeThumbnail(file);
          if (thumb) { try { asset = await assetsApi.setThumb(asset._id, thumb); } catch { /* the upload itself succeeded */ } }
        }
        const saved = asset;
        setList((list) => [saved, ...list.filter((a) => a._id !== saved._id)]);
        made.push(saved);
        patchUpload(key, { status: 'done', progress: 1 });
        // A finished upload leaves the list by itself; a failed one stays until dismissed.
        setTimeout(() => { if (alive.current) setUploads((u) => u.filter((x) => x.key !== key)); }, 2500);
      } catch (err) {
        patchUpload(key, { status: 'error', error: apiErrorMessage(err, 'Upload failed') });
      }
    }
    return made;
  }, [patchUpload, setList]);

  const rename = useCallback(async (id: string, name: string) => {
    const next = await assetsApi.rename(id, name);
    setList((list) => list.map((a) => (a._id === id ? next : a)));
  }, [setList]);

  const remove = useCallback(async (id: string, force = false) => {
    await assetsApi.remove(id, force);
    setList((list) => list.filter((a) => a._id !== id));
  }, [setList]);

  const dismissUpload = useCallback((key: string) => setUploads((u) => u.filter((x) => x.key !== key)), []);

  return useMemo(() => ({ assets, error, uploads, upload, rename, remove, dismissUpload, reload: q.reload }), [assets, error, uploads, upload, rename, remove, dismissUpload, q.reload]);
}
