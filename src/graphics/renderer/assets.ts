// Uploaded images. A layout never stores an image's URL or bytes: it stores
// `asset:<id>` (an id in the account's image library on the cloud backend).
// Everything that draws a picture resolves its source through `assetUrl`, so
// the same document renders in the Designer, in OBS and in the desktop app.

import { DEFAULT_BACKEND } from '../../login/api.tsx';
import { resolveAssetUrl } from '../../overlayClient/client.ts';

const ASSET_REF_RE = /^asset:([a-f0-9]{24})$/;

/** `asset:<id>` for an uploaded image id. */
export const assetRef = (id: string): string => `asset:${id}`;

/** The id inside an `asset:<id>` reference, or null for any other source. */
export function assetIdOf(src: string | null | undefined): string | null {
  const m = typeof src === 'string' ? ASSET_REF_RE.exec(src) : null;
  return m ? m[1] : null;
}

export const assetFileUrl = (id: string): string => `${DEFAULT_BACKEND}/api/overlay-assets/file/${encodeURIComponent(id)}`;
export const assetThumbUrl = (id: string): string => `${DEFAULT_BACKEND}/api/overlay-assets/thumb/${encodeURIComponent(id)}`;

/**
 * A drawable URL for any image source a layout may hold: an uploaded asset,
 * an https:// URL, or a root-relative path (resolved against `assetBase`).
 */
export function assetUrl(src: string | null | undefined, assetBase?: string | null): string {
  if (!src) return '';
  const id = assetIdOf(src);
  return id ? assetFileUrl(id) : resolveAssetUrl(src, assetBase);
}

// ── upload-side checks (the server repeats every one of them) ────────────────

export const MAX_ASSET_BYTES = 4 * 1024 * 1024;
export const MAX_ASSET_SIDE = 8192;
export const ASSET_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg';
const ASSET_EXT_RE = /\.(png|jpe?g|webp|svg)$/i;
const ASSET_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

/** Why this file cannot be uploaded, or null when it looks fine. */
export function assetFileProblem(file: { name: string; size: number; type?: string }): string | null {
  if (!ASSET_TYPES.has(file.type || '') && !ASSET_EXT_RE.test(file.name)) return 'Only PNG, JPEG, WebP and SVG images are supported';
  if (file.size > MAX_ASSET_BYTES) return 'Image is larger than 4 MB';
  if (file.size === 0) return 'The file is empty';
  return null;
}

/** Any image file in a drag / paste, in order. */
export function imageFilesOf(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list || []).filter((f) => ASSET_TYPES.has(f.type) || ASSET_EXT_RE.test(f.name));
}
