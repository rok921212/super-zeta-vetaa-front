// Canvas sizes a design can start from, and the limits a custom size must stay
// inside (the same numbers the shared schema validates: stage.width 16..7680,
// stage.height 16..4320).

export interface CanvasPreset { id: string; label: string; width: number; height: number }

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: 'fhd', label: 'Full HD', width: 1920, height: 1080 },
  { id: 'hd', label: 'HD', width: 1280, height: 720 },
  { id: 'square', label: 'Square', width: 1080, height: 1080 },
  { id: 'vertical', label: 'Vertical', width: 1080, height: 1920 },
];

export const CANVAS_LIMITS = { minSide: 16, maxWidth: 7680, maxHeight: 4320 };

/** Why this size cannot be used, or null. */
export function canvasSizeProblem(width: unknown, height: unknown): string | null {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isInteger(w) || !Number.isInteger(h)) return 'Width and height must be whole numbers';
  if (w < CANVAS_LIMITS.minSide || h < CANVAS_LIMITS.minSide) return `The smallest canvas is ${CANVAS_LIMITS.minSide} × ${CANVAS_LIMITS.minSide}`;
  if (w > CANVAS_LIMITS.maxWidth) return `Width can be at most ${CANVAS_LIMITS.maxWidth}`;
  if (h > CANVAS_LIMITS.maxHeight) return `Height can be at most ${CANVAS_LIMITS.maxHeight}`;
  return null;
}

/** The preset a size matches, if any. */
export const presetFor = (width: number, height: number): CanvasPreset | undefined =>
  CANVAS_PRESETS.find((p) => p.width === width && p.height === height);

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** "16:9", "9:16", "1:1"; an awkward ratio is shown as a decimal ("1.85:1"). */
export function aspectLabel(width: number, height: number): string {
  if (!(width > 0 && height > 0)) return '';
  const g = gcd(Math.round(width), Math.round(height));
  const a = Math.round(width) / g;
  const b = Math.round(height) / g;
  if (a <= 32 && b <= 32) return `${a}:${b}`;
  return `${Math.round((width / height) * 100) / 100}:1`;
}
