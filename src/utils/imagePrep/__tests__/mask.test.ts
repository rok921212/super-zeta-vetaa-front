import {
  analyzeBorder, colorKeyMask, decontaminate, refineEdges, removeSmallIslands, snapOutsideEdgeBand,
  strokeBrush, tightenAlpha, wandFill, type Pixels,
} from '../mask';

// W×H picture: white card with a red square in the middle (and an optional
// white hole inside the square, like the inside of an "O").
function card(w = 20, h = 20, hole = false): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const inSquare = x >= 5 && x < 15 && y >= 5 && y < 15;
    const inHole = hole && x >= 9 && x < 11 && y >= 9 && y < 11;
    const red = inSquare && !inHole;
    data.set(red ? [220, 20, 30, 255] : [255, 255, 255, 255], i);
  }
  return { data, width: w, height: h };
}

const at = (m: Uint8ClampedArray, w: number, x: number, y: number) => m[y * w + x];

describe('analyzeBorder', () => {
  it('finds a flat card colour', () => {
    const b = analyzeBorder(card());
    expect(b.uniformity).toBeGreaterThan(0.95);
    expect(b.color![0]).toBeGreaterThan(250);
    expect(b.transparent).toBe(0);
  });

  it('reports a transparent border', () => {
    const px = card();
    for (let i = 3; i < px.data.length; i += 4) px.data[i] = 0;
    expect(analyzeBorder(px).transparent).toBe(1);
  });
});

describe('colorKeyMask', () => {
  it('removes the border-connected background and keeps the logo', () => {
    const m = colorKeyMask(card(), { color: [255, 255, 255], tolerance: 30 });
    expect(at(m, 20, 0, 0)).toBe(0);
    expect(at(m, 20, 10, 10)).toBe(255);
  });

  it('keeps an enclosed hole unless "everywhere" is set', () => {
    const px = card(20, 20, true);
    expect(at(colorKeyMask(px, { color: [255, 255, 255], tolerance: 30 }), 20, 9, 9)).toBe(255);
    expect(at(colorKeyMask(px, { color: [255, 255, 255], tolerance: 30, everywhere: true }), 20, 9, 9)).toBe(0);
  });
});

describe('decontaminate', () => {
  it('un-blends the background from a half-transparent edge pixel', () => {
    // 50% red over white → (237.5, 137.5, 142.5)
    const px: Pixels = { data: new Uint8ClampedArray([238, 138, 143, 255]), width: 1, height: 1 };
    decontaminate(px, new Uint8ClampedArray([128]), [255, 255, 255]);
    expect(px.data[0]).toBeGreaterThan(215);
    expect(px.data[1]).toBeLessThan(30);
  });
});

describe('removeSmallIslands', () => {
  it('drops a lone kept speck and fills a pin-hole', () => {
    const w = 20, h = 20;
    const m = new Uint8ClampedArray(w * h);
    for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) m[y * w + x] = 255;
    m[10 * w + 10] = 0; // pin-hole
    m[1 * w + 1] = 255; // speck
    removeSmallIslands(m, w, h, 4);
    expect(at(m, w, 1, 1)).toBe(0);
    expect(at(m, w, 10, 10)).toBe(255);
    expect(at(m, w, 6, 6)).toBe(255);
  });
});

describe('refineEdges', () => {
  it('pulls a blurry edge towards the real image edge', () => {
    const px = card();
    // Blurry mask: soft ramp straddling the square's left edge (x = 5).
    const m = new Uint8ClampedArray(400);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const inside = x >= 5 && x < 15 && y >= 5 && y < 15;
      m[y * 20 + x] = inside ? 255 : 0;
      if (y >= 5 && y < 15 && (x === 4 || x === 3)) m[y * 20 + x] = x === 4 ? 160 : 90;
    }
    const out = refineEdges(px, m, 2);
    // Outside the square (white) moves towards removed.
    expect(at(out, 20, 3, 10)).toBeLessThan(90);
    expect(at(out, 20, 10, 10)).toBeGreaterThan(200);
    expect(at(out, 20, 0, 0)).toBe(0);
  });
});

describe('snapOutsideEdgeBand', () => {
  it('keeps soft alpha at the outline but snaps a far-away half-grey ghost', () => {
    const w = 40, h = 10;
    const m = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      m[y * w + x] = x < 10 ? 255 : x === 10 ? 150 : x === 11 ? 90 : x >= 25 ? 100 : 0;
    }
    snapOutsideEdgeBand(m, w, h, 3);
    expect(at(m, w, 10, 5)).toBe(150); // outline: soft kept
    expect(at(m, w, 11, 5)).toBe(90);
    expect(at(m, w, 35, 5)).toBe(0); // ghost far from outline
  });
});

describe('tightenAlpha', () => {
  it('snaps near-0 and near-255', () => {
    const m = tightenAlpha(new Uint8ClampedArray([10, 128, 240]));
    expect(Array.from(m)).toEqual([0, expect.any(Number), 255]);
  });
});

describe('marking', () => {
  it('Remove brush clears and Keep brush restores up to the source alpha', () => {
    const w = 20, h = 20;
    const m = new Uint8ClampedArray(w * h).fill(255);
    strokeBrush(m, w, h, 2, 10, 18, 10, 2, 'remove');
    expect(at(m, w, 10, 10)).toBe(0);
    expect(at(m, w, 10, 2)).toBe(255);
    const limit = new Uint8ClampedArray(w * h).fill(200);
    strokeBrush(m, w, h, 2, 10, 18, 10, 2, 'keep', limit);
    expect(at(m, w, 10, 10)).toBe(200);
  });

  it('wand removes the connected same-colour area only', () => {
    const px = card();
    const m = new Uint8ClampedArray(400).fill(255);
    const rect = wandFill(px, m, 0, 0, 30, 'remove');
    expect(rect).not.toBeNull();
    expect(at(m, 20, 0, 0)).toBe(0);
    expect(at(m, 20, 19, 19)).toBe(0);
    expect(at(m, 20, 10, 10)).toBe(255);
  });
});
