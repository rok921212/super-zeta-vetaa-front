import { encodeLogoGif } from '../animatedLogo';

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

describe('encodeLogoGif', () => {
  const bytes = encodeLogoGif([frame(255, 0, 0), frame(0, 0, 255), frame(0, 255, 0)], SIZE, 2000);
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
