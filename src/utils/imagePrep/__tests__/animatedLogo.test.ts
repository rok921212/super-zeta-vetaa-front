import {
  encodeLogoGif,
  logoSequence,
  transitionFrames,
  TRANSITION_FRAME_MS,
  TRANSITION_STEPS,
  type LogoTransition,
} from '../animatedLogo';

const SIZE = 8;

// Half clear, half one solid colour.
function frame(r: number, g: number, b: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (i < (SIZE * SIZE) / 2) continue;
    px.set([r, g, b, 255], i * 4);
  }
  return px;
}

/** Walks the GIF blocks and reports what a player would see. */
function readGif(b: Uint8Array) {
  let i = 13;
  if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 7) + 1));
  const out = { frames: 0, delays: [] as number[], disposals: [] as number[], transparent: [] as boolean[], loops: false };
  const skipBlocks = () => { while (b[i]) i += b[i] + 1; i += 1; };
  while (i < b.length) {
    const code = b[i++];
    if (code === 0x3b) break;
    if (code === 0x21) {
      const label = b[i++];
      if (label === 0xf9) {
        out.disposals.push((b[i + 1] >> 2) & 7);
        out.transparent.push((b[i + 1] & 1) === 1);
        out.delays.push(b[i + 2] | (b[i + 3] << 8));
      }
      if (label === 0xff && String.fromCharCode(...Array.from(b.slice(i + 1, i + 12))) === 'NETSCAPE2.0') out.loops = true;
      skipBlocks();
    } else if (code === 0x2c) {
      out.frames += 1;
      const flags = b[i + 8];
      i += 9;
      if (flags & 0x80) i += 3 * (1 << ((flags & 7) + 1));
      i += 1;
      skipBlocks();
    } else throw new Error(`bad block ${code} at ${i}`);
  }
  return out;
}

const hold = (pixels: Uint8ClampedArray) => ({ pixels, delayMs: 2000 });

describe('encodeLogoGif', () => {
  const bytes = encodeLogoGif([hold(frame(255, 0, 0)), hold(frame(0, 0, 255)), hold(frame(0, 255, 0))], SIZE);
  const gif = readGif(bytes);

  it('is a GIF of the right size', () => {
    expect(String.fromCharCode(...Array.from(bytes.slice(0, 6)))).toBe('GIF89a');
    expect(bytes[6] | (bytes[7] << 8)).toBe(SIZE);
  });

  it('has one frame per logo and loops', () => {
    expect(gif.frames).toBe(3);
    expect(gif.loops).toBe(true);
  });

  it('holds each logo for the chosen time (in 1/100 s)', () => {
    expect(gif.delays).toEqual([200, 200, 200]);
  });

  it('keeps the background clear, and clears it between logos', () => {
    expect(gif.transparent).toEqual([true, true, true]);
    expect(gif.disposals).toEqual([2, 2, 2]);
  });
});

// A full solid square of one colour, so every pixel says which logo it came from.
function solid(r: number, g: number, b: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) px.set([r, g, b, 255], i * 4);
  return px;
}
const count = (px: Uint8ClampedArray, r: number, g: number, b: number) => {
  let n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] && px[i] === r && px[i + 1] === g && px[i + 2] === b) n++;
  return n;
};
const RED = solid(255, 0, 0);
const BLUE = solid(0, 0, 255);

describe('transitionFrames', () => {
  it('"none" is a plain cut', () => {
    expect(transitionFrames(RED, BLUE, SIZE, 'none')).toEqual([]);
  });

  it.each<LogoTransition>(['zoom', 'fade', 'slide', 'flip'])('%s gives the in-between frames, from the old logo to the new', (style) => {
    const frames = transitionFrames(RED, BLUE, SIZE, style);
    expect(frames).toHaveLength(TRANSITION_STEPS);
    frames.forEach((f) => expect(f).toHaveLength(SIZE * SIZE * 4));
    const first = frames[0];
    const last = frames[frames.length - 1];
    expect(count(first, 255, 0, 0)).toBeGreaterThan(count(first, 0, 0, 255));
    expect(count(last, 0, 0, 255)).toBeGreaterThan(count(last, 255, 0, 0));
  });

  it('zoom shrinks the old logo away before the new one grows in', () => {
    const frames = transitionFrames(RED, BLUE, SIZE, 'zoom');
    const reds = frames.slice(0, TRANSITION_STEPS / 2).map((f) => count(f, 255, 0, 0));
    reds.slice(1).forEach((n, i) => expect(n).toBeLessThanOrEqual(reds[i]));
  });
});

describe('logoSequence', () => {
  it('holds each logo, then changes into the next and loops back', () => {
    const seq = logoSequence([RED, BLUE], SIZE, 10000, 'fade');
    expect(seq).toHaveLength(2 + 2 * TRANSITION_STEPS);
    expect(seq[0]).toMatchObject({ pixels: RED, delayMs: 10000 });
    expect(seq[1 + TRANSITION_STEPS]).toMatchObject({ pixels: BLUE, delayMs: 10000 });
    expect(seq[1].delayMs).toBe(TRANSITION_FRAME_MS);
  });

  it('with "none" it is just the logos', () => {
    expect(logoSequence([RED, BLUE], SIZE, 2000, 'none').map((f) => f.delayMs)).toEqual([2000, 2000]);
  });

  it('encodes into one looping GIF with every frame', () => {
    const gif = readGif(encodeLogoGif(logoSequence([RED, BLUE], SIZE, 7500, 'zoom'), SIZE));
    expect(gif.frames).toBe(2 + 2 * TRANSITION_STEPS);
    expect(gif.delays[0]).toBe(750);
    expect(gif.delays[1]).toBe(TRANSITION_FRAME_MS / 10);
    expect(gif.loops).toBe(true);
  });
});
