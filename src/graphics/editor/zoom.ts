// Canvas zoom maths (pure): wheel -> zoom factor, and the scroll correction
// that keeps the stage point under the cursor where it is.

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 4;

export const clampZoom = (z: number): number => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

/**
 * Next zoom for one wheel event. `pinch` = Ctrl+wheel / trackpad pinch, whose
 * deltas are much smaller than a mouse wheel notch.
 */
export function wheelZoom(zoom: number, deltaY: number, opts: { deltaMode?: number; pinch?: boolean } = {}): number {
  const px = opts.deltaMode === 1 ? deltaY * 16 : opts.deltaMode === 2 ? deltaY * 400 : deltaY;
  const k = opts.pinch ? 0.01 : 0.0015;
  // A single huge delta (free-spinning wheels) must not jump more than ~1.6x.
  const step = Math.max(-0.5, Math.min(0.5, -px * k));
  return Math.round(clampZoom(zoom * Math.exp(step)) * 1000) / 1000;
}

/**
 * How far to scroll the viewport so the stage point that was under the cursor
 * before the zoom is under it again. `stageLeft/Top` are the stage's client
 * position before and after the zoom was applied.
 */
export function anchorScrollDelta(a: {
  pointer: { x: number; y: number };
  before: { left: number; top: number; zoom: number };
  after: { left: number; top: number; zoom: number };
}): { dx: number; dy: number } {
  const px = (a.pointer.x - a.before.left) / a.before.zoom;
  const py = (a.pointer.y - a.before.top) / a.before.zoom;
  return {
    dx: a.after.left + px * a.after.zoom - a.pointer.x,
    dy: a.after.top + py * a.after.zoom - a.pointer.y,
  };
}
