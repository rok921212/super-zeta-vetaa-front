import { aiMask, type AiQuality } from './bgRemoval';
import { composeOnCanvas, loadWorking, type PlacementMode } from './imageUtils';
import {
  alphaOf, analyzeBorder, applyMask, colorKeyMask, decontaminate, intersect, keptArea,
  refineEdges, removeSmallIslands, snapOutsideEdgeBand, tightenAlpha, type Mask, type Pixels, type RGB,
} from './mask';

export { isModelCached, AI_QUALITY_LABEL, type AiQuality } from './bgRemoval';
export type { Mask, Pixels, RGB } from './mask';

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
 * How the background is found:
 *  - ai: the IS-Net model (photos, players, busy logos)
 *  - color: flood-fill the border colour (logos on a flat card — sharper and
 *    exact, where the photo-trained model tends to eat flat logo parts)
 *  - none: keep the picture as it is (its own transparency is kept)
 */
export type BgMethod = 'ai' | 'color' | 'none';

export const METHOD_LABEL: Record<BgMethod, string> = {
  ai: 'AI cut-out',
  color: 'Remove background colour',
  none: 'Keep background',
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
    return 'Your browser ran out of memory removing the background. Close other tabs, pick "Fast" quality, or use a smaller picture, then press Try again.';
  }
  if (/session|wasm|webassembly|backend/i.test(msg)) {
    return 'Background removal could not start in this browser (WebAssembly). Update the browser or try Chrome / Edge, then press Try again.';
  }
  return 'Background removal failed on this device. Press Try again, switch to "Remove background colour", or use the original.';
}

const PLACEMENT: Record<ImageKind, PlacementMode> = {
  logo: 'contain-center',
  flag: 'contain-center',
  player: 'bottom-anchored',
};

/** Decoded working copy of one picked file. */
export interface WorkingImage {
  blob: Blob; // re-encoded working copy (what the model sees)
  px: Pixels;
  /** The file's own alpha — Keep brushes never restore past it. */
  alpha: Mask;
  border: ReturnType<typeof analyzeBorder>;
}

export async function loadImage(file: Blob): Promise<WorkingImage> {
  const { blob, data, width, height } = await loadWorking(file);
  const px: Pixels = { data, width, height };
  return { blob, px, alpha: alphaOf(px), border: analyzeBorder(px) };
}

/** Best first guess per picture. */
export function autoMethod(kind: ImageKind, img: WorkingImage): BgMethod {
  // Already a transparent PNG: nothing to remove.
  if (img.border.transparent > 0.6) return 'none';
  if (kind === 'flag') return 'none';
  if (kind === 'logo') return img.border.color && img.border.uniformity >= 0.8 ? 'color' : 'ai';
  return 'ai';
}

export interface ColorSettings {
  color: RGB;
  tolerance: number;
  everywhere: boolean;
}

export function defaultColorSettings(img: WorkingImage): ColorSettings {
  return { color: img.border.color ?? [255, 255, 255], tolerance: 40, everywhere: false };
}

export interface MaskRequest {
  method: BgMethod;
  quality: AiQuality;
  color: ColorSettings;
  onModelProgress?: (fraction: number) => void;
}

/** The automatic mask for a method — the starting point the user marks on. */
export async function computeMask(img: WorkingImage, req: MaskRequest): Promise<Mask> {
  const { px } = img;
  if (req.method === 'none') return new Uint8ClampedArray(img.alpha);
  if (req.method === 'color') {
    const m = colorKeyMask(px, { color: req.color.color, tolerance: req.color.tolerance, everywhere: req.color.everywhere });
    return intersect(m, img.alpha);
  }
  const raw = await aiMask(img.blob, px.width, px.height, req.quality, req.onModelProgress);
  if (raw.length !== px.width * px.height) throw new Error('Background model returned a mask of the wrong size');
  const refined = tightenAlpha(snapOutsideEdgeBand(refineEdges(px, raw), px.width, px.height));
  const minArea = Math.max(48, Math.round(keptArea(refined) * 0.003));
  return intersect(removeSmallIslands(refined, px.width, px.height, minArea), img.alpha);
}

export interface RenderOptions {
  kind: ImageKind;
  /** Known background colour to strip from soft edges (colour method). */
  decontaminateColor?: RGB;
  cropTopRatio?: number;
  cropBottomRatio?: number;
}

/** Applies the mask and composes onto the kind's fixed canvas → transparent PNG. */
export async function renderOutput(img: WorkingImage, mask: Mask, opts: RenderOptions): Promise<Blob> {
  const rgba = applyMask(img.px, mask);
  const out: Pixels = { data: rgba, width: img.px.width, height: img.px.height };
  if (opts.decontaminateColor) decontaminate(out, mask, opts.decontaminateColor);
  return composeOnCanvas(new ImageData(rgba, img.px.width, img.px.height), {
    ...OUTPUT_SIZE[opts.kind],
    placement: PLACEMENT[opts.kind],
    cropTopRatio: opts.kind === 'player' ? opts.cropTopRatio : undefined,
    cropBottomRatio: opts.kind === 'player' ? opts.cropBottomRatio : undefined,
  });
}
