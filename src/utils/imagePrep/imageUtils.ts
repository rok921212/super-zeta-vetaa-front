// Canvas helpers ported from the imageResize helper: decoding the working
// copy, and composing the cutout onto a fixed-size canvas so
// every logo/player photo ends up consistent (and small to upload).

export type PlacementMode = 'contain-center' | 'bottom-anchored';

export interface ComposeSettings {
  width: number;
  height: number;
  placement: PlacementMode;
  // Fraction (0-1) of the source photo's height marking where the kept
  // region starts/ends — only used for 'bottom-anchored' (player) placement.
  cropTopRatio?: number;
  cropBottomRatio?: number;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Longest side the pipeline ever works on — keeps model + canvas work fast. */
export const MAX_SOURCE_SIDE = 1600;

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('Failed to export canvas'));
    }, type, quality);
  });
}

function drawToCanvas(bitmap: ImageBitmap, width = bitmap.width, height = bitmap.height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  // Default smoothing is 'low', which aliases on the working-copy downscale.
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { canvas, ctx };
}

/**
 * Decodes a picked file into the working copy every step uses: longest side
 * at most MAX_SOURCE_SIDE, EXIF orientation baked in, plus its raw pixels.
 */
export async function loadWorking(file: Blob): Promise<{ blob: Blob; data: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > MAX_SOURCE_SIDE ? MAX_SOURCE_SIDE / longest : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const { canvas, ctx } = drawToCanvas(bitmap, width, height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);
  return { blob: await canvasToBlob(canvas), data, width, height };
}

/**
 * Scans the alpha channel to find the tight bounding box of visible
 * (non-transparent) pixels. Falls back to the full image if everything is
 * transparent.
 */
function findAlphaBoundingBox(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  threshold = 10,
  scanMinY = 0,
  scanMaxY = height
): BoundingBox {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = scanMinY; y < scanMaxY; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: scanMinY, width, height: scanMaxY - scanMinY };
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Composes a (background-removed) image onto a fixed-size transparent canvas:
 *  - 'contain-center' (logo/flag): fit inside with a small margin, centered.
 *  - 'bottom-anchored' (player): scale the subject to a fixed fraction of the
 *    canvas height, center horizontally, anchor near the bottom.
 */
export async function composeOnCanvas(source: Blob | ImageData, settings: ComposeSettings): Promise<Blob> {
  const bitmap = await createImageBitmap(source as ImageBitmapSource);
  const { canvas: srcCanvas, ctx: srcCtx } = drawToCanvas(bitmap);
  const srcHeight = bitmap.height;
  const srcWidth = bitmap.width;
  bitmap.close();

  const MIN_CROP_GAP_PX = 1;
  let scanMinY = 0;
  let scanMaxY = srcHeight;
  if (settings.placement === 'bottom-anchored') {
    if (settings.cropTopRatio) scanMinY = Math.round(srcHeight * settings.cropTopRatio);
    if (settings.cropBottomRatio) scanMaxY = Math.round(srcHeight * settings.cropBottomRatio);
    scanMinY = Math.max(0, Math.min(scanMinY, srcHeight - MIN_CROP_GAP_PX));
    scanMaxY = Math.max(scanMinY + MIN_CROP_GAP_PX, Math.min(scanMaxY, srcHeight));
  }
  const bbox = findAlphaBoundingBox(srcCtx, srcWidth, srcHeight, 10, scanMinY, scanMaxY);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = settings.width;
  outCanvas.height = settings.height;
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.imageSmoothingQuality = 'high';
  // Leave the canvas unfilled so the export stays a transparent PNG.

  let drawWidth: number;
  let drawHeight: number;
  let dx: number;
  let dy: number;

  if (settings.placement === 'bottom-anchored') {
    const SUBJECT_HEIGHT_RATIO = 0.92;
    const BOTTOM_MARGIN_RATIO = 0.04;
    const MAX_WIDTH_RATIO = 0.96;

    let scale = (settings.height * SUBJECT_HEIGHT_RATIO) / bbox.height;
    scale = Math.min(scale, (settings.width * MAX_WIDTH_RATIO) / bbox.width);

    drawWidth = bbox.width * scale;
    drawHeight = bbox.height * scale;
    dx = (settings.width - drawWidth) / 2;
    dy = settings.height * (1 - BOTTOM_MARGIN_RATIO) - drawHeight;
  } else {
    const MARGIN_RATIO = 0.1;
    const scale = Math.min(
      (settings.width * (1 - MARGIN_RATIO)) / bbox.width,
      (settings.height * (1 - MARGIN_RATIO)) / bbox.height
    );
    drawWidth = bbox.width * scale;
    drawHeight = bbox.height * scale;
    dx = (settings.width - drawWidth) / 2;
    dy = (settings.height - drawHeight) / 2;
  }

  outCtx.drawImage(srcCanvas, bbox.x, bbox.y, bbox.width, bbox.height, dx, dy, drawWidth, drawHeight);
  return canvasToBlob(outCanvas);
}
