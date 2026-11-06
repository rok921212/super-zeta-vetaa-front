import { GIFEncoder, applyPalette, quantize } from 'gifenc';

// Several prepared logos become one looping GIF, so a tournament still has a
// single logo URL and every overlay shows it with a plain <img>. A GIF pixel is
// either solid or clear, so soft logo edges come out slightly harder than PNG.

/** One logo as RGBA pixels, `size` × `size`. */
export type LogoPixels = Uint8ClampedArray;

const ALPHA_THRESHOLD = 128;

export function encodeLogoGif(frames: LogoPixels[], size: number, delayMs: number): Uint8Array {
  const gif = GIFEncoder();
  for (const rgba of frames) {
    const palette = quantize(rgba, 256, {
      format: 'rgba4444',
      oneBitAlpha: true,
      clearAlpha: true,
      clearAlphaThreshold: ALPHA_THRESHOLD,
    });
    const index = applyPalette(rgba, palette, 'rgba4444');
    const transparentIndex = palette.findIndex((color) => color[3] === 0);
    gif.writeFrame(index, size, size, {
      palette,
      delay: delayMs,
      repeat: 0, // forever
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(transparentIndex, 0),
      dispose: 2, // clear between logos, or the last one shows through the clear parts
    });
  }
  gif.finish();
  return gif.bytes();
}

/** Any image the browser can show, fitted and centred on a square canvas. */
async function toPixels(blob: Blob, size: number): Promise<LogoPixels> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas is not available');
    ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
    return ctx.getImageData(0, 0, size, size).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function buildAnimatedLogo(blobs: Blob[], size: number, delayMs: number): Promise<Blob> {
  const frames = await Promise.all(blobs.map((blob) => toPixels(blob, size)));
  const bytes = encodeLogoGif(frames, size, delayMs);
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/gif' });
}
