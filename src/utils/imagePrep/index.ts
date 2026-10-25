import { removeBackground } from './bgRemoval';
import { cleanupAlphaEdges, composeOnCanvas, downscaleSource, type PlacementMode } from './imageUtils';

export { isModelCached } from './bgRemoval';

export type ImageKind = 'logo' | 'flag' | 'player';

/**
 * Fixed output canvas per kind — what actually gets uploaded. Player photos
 * are 1000×1000: EventMvp / WwcdSummary / the podium screens show them up to
 * ~900 px tall, and at 600 px they were visibly upscaled (soft).
 */
export const OUTPUT_SIZE: Record<ImageKind, { width: number; height: number }> = {
  logo: { width: 600, height: 600 },
  flag: { width: 600, height: 600 },
  player: { width: 1000, height: 1000 },
};

/**
 * Why background removal failed, in words the operator can act on. The library
 * downloads its model from IMG.LY's CDN (staticimgly.com) on first use, so a
 * blocked or broken download is the usual cause.
 */
export function describeBgRemovalError(err: unknown): string {
  const msg = String((err as any)?.message ?? err ?? '');
  if (/fetch|network|load|resource|404|cors|blocked|offline/i.test(msg)) {
    return 'The background-removal model could not be downloaded from staticimgly.com. Check your internet connection, and allow staticimgly.com if an ad blocker, privacy extension or firewall blocks it — then press Try again.';
  }
  if (/memory|allocation|out of bounds|RangeError/i.test(msg)) {
    return 'Your browser ran out of memory removing the background. Close other tabs, or use a smaller picture, then press Try again.';
  }
  if (/session|wasm|webassembly|backend/i.test(msg)) {
    return 'Background removal could not start in this browser (WebAssembly). Update the browser or try Chrome / Edge, then press Try again.';
  }
  return 'Background removal failed on this device. Press Try again, turn it off, or use the original.';
}

const PLACEMENT: Record<ImageKind, PlacementMode> = {
  logo: 'contain-center',
  flag: 'contain-center',
  player: 'bottom-anchored',
};

export interface PrepareOptions {
  kind: ImageKind;
  removeBg: boolean;
  cropTopRatio?: number;
  cropBottomRatio?: number;
  /** Fraction 0-1 of the first-time model download. */
  onModelProgress?: (fraction: number) => void;
}

/**
 * Background removal result for a source, keyed by the source blob so
 * moving the crop lines doesn't re-run the (slow) model.
 */
const cutoutCache = new WeakMap<Blob, Promise<Blob>>();

function cutout(source: Blob, onProgress?: (fraction: number) => void): Promise<Blob> {
  let p = cutoutCache.get(source);
  if (!p) {
    p = removeBackground(source, onProgress).then(cleanupAlphaEdges);
    p.catch(() => cutoutCache.delete(source));
    cutoutCache.set(source, p);
  }
  return p;
}

/** Downscaled working copy of a picked file (call once per file). */
export const loadSource = downscaleSource;

/**
 * Full local pipeline: optional background removal → alpha clean-up →
 * crop + compose onto the kind's fixed canvas. Returns a transparent PNG.
 */
export async function prepareImage(source: Blob, opts: PrepareOptions): Promise<Blob> {
  const base = opts.removeBg ? await cutout(source, opts.onModelProgress) : source;
  return composeOnCanvas(base, {
    ...OUTPUT_SIZE[opts.kind],
    placement: PLACEMENT[opts.kind],
    cropTopRatio: opts.kind === 'player' ? opts.cropTopRatio : undefined,
    cropBottomRatio: opts.kind === 'player' ? opts.cropBottomRatio : undefined,
  });
}
