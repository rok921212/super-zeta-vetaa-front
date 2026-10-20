import { removeBackground } from './bgRemoval';
import { cleanupAlphaEdges, composeOnCanvas, downscaleSource, type PlacementMode } from './imageUtils';

export { isModelCached } from './bgRemoval';

export type ImageKind = 'logo' | 'flag' | 'player';

/** Fixed output canvas per kind — what actually gets uploaded. */
export const OUTPUT_SIZE: Record<ImageKind, { width: number; height: number }> = {
  logo: { width: 512, height: 512 },
  flag: { width: 512, height: 512 },
  player: { width: 600, height: 800 },
};

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
