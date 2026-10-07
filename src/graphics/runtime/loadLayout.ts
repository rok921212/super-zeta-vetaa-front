// Pure pieces of the published runtime's layout lifecycle, kept out of the
// React component so the swap rules are unit-tested:
//   - every incoming published document is migrated, normalized and
//     validated with the ONE shared schema before it can be shown;
//   - an invalid new revision never replaces a valid running one;
//   - static image assets are preloaded BEFORE the swap (atomic swap).

import { migrateLayout, normalizeLayout, validateLayout } from '../schema/layoutSchema.js';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import type { RenderPayload } from '../api.ts';
import { resolveAssetUrl } from '../../overlayClient/client.ts';

export interface LoadedLayout {
  rev: number;
  doc: LayoutDocument;
  payload: RenderPayload;
}

export type PrepareResult =
  | { ok: true; layout: LoadedLayout }
  | { ok: false; errors: Array<{ path: string; message: string }> };

export function prepareLayout(payload: RenderPayload): PrepareResult {
  const doc = normalizeLayout(migrateLayout(payload?.published)) as LayoutDocument;
  const v = validateLayout(doc);
  if (!v.ok) return { ok: false, errors: v.errors };
  return { ok: true, layout: { rev: payload.publishedRev, doc, payload } };
}

export type SwapDecision =
  | { action: 'keep'; reason: 'same-revision' | 'older-revision' | 'invalid'; errors?: Array<{ path: string; message: string }> }
  | { action: 'swap'; next: LoadedLayout };

/** Decide what the runtime shows next. `current` null = nothing on screen yet. */
export function decideSwap(current: LoadedLayout | null, incoming: RenderPayload): SwapDecision {
  if (current && incoming.publishedRev === current.rev) return { action: 'keep', reason: 'same-revision' };
  if (current && incoming.publishedRev < current.rev) return { action: 'keep', reason: 'older-revision' };
  const prepared = prepareLayout(incoming);
  if (!prepared.ok) return { action: 'keep', reason: 'invalid', errors: prepared.errors };
  return { action: 'swap', next: prepared.layout };
}

/** Static (unbound) image URLs in a layout, for preloading. */
export function staticAssetUrls(doc: LayoutDocument, assetBase?: string): string[] {
  const out = new Set<string>();
  const walk = (list: LayoutElement[]) => {
    for (const el of list) {
      if (el.src && !el.bind?.src && el.type !== 'video') out.add(resolveAssetUrl(el.src, assetBase));
      if (el.fallbackSrc) out.add(resolveAssetUrl(el.fallbackSrc, assetBase));
      if (el.children) walk(el.children);
    }
  };
  walk(doc.elements || []);
  Object.values(doc.components || {}).forEach((c) => walk(c.elements || []));
  return Array.from(out).filter(Boolean);
}

/** Resolves once every URL has loaded or failed (a broken image must not block a swap), capped by timeoutMs. */
export function preloadImages(urls: string[], timeoutMs = 5000): Promise<void> {
  if (!urls.length || typeof Image === 'undefined') return Promise.resolve();
  const loads = urls.map((u) => new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = u;
  }));
  return Promise.race([Promise.all(loads).then(() => undefined), new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
