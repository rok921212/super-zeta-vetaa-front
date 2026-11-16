import { GIFEncoder, applyPalette, quantize } from 'gifenc';

// Several prepared logos become one looping GIF, so a tournament still has a
// single logo URL and every overlay shows it with a plain <img>. A GIF pixel is
// either solid or clear, so soft logo edges come out slightly harder than PNG.
// The change from one logo to the next is baked in as short in-between frames.

/** One logo as RGBA pixels, `size` × `size`. */
export type LogoPixels = Uint8ClampedArray;

/** How one logo changes into the next. */
export type LogoTransition = 'none' | 'zoom' | 'fade' | 'slide' | 'flip';

export interface GifFrame {
  pixels: LogoPixels;
  delayMs: number;
  /** Palette size; in-between frames use fewer colours to keep the file small. */
  colors?: number;
}

const ALPHA_THRESHOLD = 128;
/** In-between frames: 10 × 50 ms = a half-second change. */
export const TRANSITION_STEPS = 10;
export const TRANSITION_FRAME_MS = 50;
const TRANSITION_COLORS = 128;

export function encodeLogoGif(frames: GifFrame[], size: number): Uint8Array {
  const gif = GIFEncoder();
  for (const { pixels, delayMs, colors = 256 } of frames) {
    const palette = quantize(pixels, colors, {
      format: 'rgba4444',
      oneBitAlpha: true,
      clearAlpha: true,
      clearAlphaThreshold: ALPHA_THRESHOLD,
    });
    const index = applyPalette(pixels, palette, 'rgba4444');
    const transparentIndex = palette.findIndex((color) => color[3] === 0);
    gif.writeFrame(index, size, size, {
      palette,
      delay: delayMs,
      repeat: 0, // forever
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(transparentIndex, 0),
      dispose: 2, // clear between frames, or the last one shows through the clear parts
    });
  }
  gif.finish();
  return gif.bytes();
}

const easeIn = (t: number) => t * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** Ends at 1 after overshooting a little, so the new logo "pops" in. */
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/**
 * Draws `src` onto `out`, scaled around the centre and shifted by `dx` pixels.
 * Nearest-neighbour: the frames are on screen for 50 ms each.
 */
function drawScaled(out: LogoPixels, src: LogoPixels, size: number, scaleX: number, scaleY: number, dx = 0) {
  if (scaleX <= 0.001 || scaleY <= 0.001) return;
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    const v = Math.floor((y + 0.5 - half) / scaleY + half);
    if (v < 0 || v >= size) continue;
    for (let x = 0; x < size; x++) {
      const u = Math.floor((x + 0.5 - half - dx) / scaleX + half);
      if (u < 0 || u >= size) continue;
      const s = (v * size + u) * 4;
      if (src[s + 3] < ALPHA_THRESHOLD) continue;
      const d = (y * size + x) * 4;
      out[d] = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = src[s + 3];
    }
  }
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * The in-between frames from one logo to the next (both ends excluded).
 * GIF alpha is on/off, so "fade" is a dithered cross-fade, not a blend.
 */
export function transitionFrames(
  from: LogoPixels,
  to: LogoPixels,
  size: number,
  style: LogoTransition,
  steps = TRANSITION_STEPS,
): LogoPixels[] {
  if (style === 'none' || steps <= 0) return [];
  const frames: LogoPixels[] = [];
  for (let k = 1; k <= steps; k++) {
    const t = k / (steps + 1);
    const out = new Uint8ClampedArray(size * size * 4);
    if (style === 'zoom') {
      if (t < 0.5) {
        const s = 1 - easeIn(t / 0.5);
        drawScaled(out, from, size, s, s);
      } else {
        const s = easeOutBack((t - 0.5) / 0.5);
        drawScaled(out, to, size, s, s);
      }
    } else if (style === 'flip') {
      const s = Math.abs(Math.cos(Math.PI * t));
      drawScaled(out, t < 0.5 ? from : to, size, s, 1);
    } else if (style === 'slide') {
      const e = easeInOut(t);
      drawScaled(out, from, size, 1, 1, -e * size);
      drawScaled(out, to, size, 1, 1, (1 - e) * size);
    } else {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const threshold = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
          const src = t > threshold ? to : from;
          const i = (y * size + x) * 4;
          out[i] = src[i];
          out[i + 1] = src[i + 1];
          out[i + 2] = src[i + 2];
          out[i + 3] = src[i + 3];
        }
      }
    }
    frames.push(out);
  }
  return frames;
}

/** Each logo held for `holdMs`, then the change into the next; loops back to the first. */
export function logoSequence(logos: LogoPixels[], size: number, holdMs: number, transition: LogoTransition): GifFrame[] {
  const out: GifFrame[] = [];
  logos.forEach((pixels, i) => {
    out.push({ pixels, delayMs: holdMs });
    if (logos.length < 2) return;
    const next = logos[(i + 1) % logos.length];
    for (const between of transitionFrames(pixels, next, size, transition)) {
      out.push({ pixels: between, delayMs: TRANSITION_FRAME_MS, colors: TRANSITION_COLORS });
    }
  });
  return out;
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

export interface AnimatedLogoOptions {
  holdMs: number;
  transition: LogoTransition;
}

export async function buildAnimatedLogo(blobs: Blob[], size: number, { holdMs, transition }: AnimatedLogoOptions): Promise<Blob> {
  const logos = await Promise.all(blobs.map((blob) => toPixels(blob, size)));
  const bytes = encodeLogoGif(logoSequence(logos, size, holdMs, transition), size);
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/gif' });
}
