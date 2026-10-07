// Pen / pencil / direct-select geometry (pure).
//
// While drawing or editing, a path is a list of anchors in STAGE coordinates:
//   { x, y, in?: {x,y}, out?: {x,y} }  (handles absolute; absent = corner)
// `toElementPath` turns anchors into the stored form: a `path` element whose
// `d` is relative to its own box, with `vb` = that box's size so the shape
// scales with the element. `fromElementPath` goes back for editing.

import type { LayoutElement } from '../schema/layoutTypes.ts';

export interface Pt { x: number; y: number }
export interface Anchor extends Pt { in?: Pt; out?: Pt }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** SVG path data for anchors (absolute coords), offset by -origin. */
export function anchorsToD(anchors: Anchor[], closed: boolean, origin: Pt = { x: 0, y: 0 }): string {
  if (!anchors.length) return '';
  const p = (q: Pt) => `${r2(q.x - origin.x)} ${r2(q.y - origin.y)}`;
  const parts = [`M${p(anchors[0])}`];
  const seg = (a: Anchor, b: Anchor) => {
    if (a.out || b.in) parts.push(`C${p(a.out || a)} ${p(b.in || b)} ${p(b)}`);
    else parts.push(`L${p(b)}`);
  };
  for (let i = 1; i < anchors.length; i++) seg(anchors[i - 1], anchors[i]);
  if (closed && anchors.length > 2) {
    const last = anchors[anchors.length - 1];
    if (last.out || anchors[0].in) seg(last, anchors[0]);
    parts.push('Z');
  }
  return parts.join(' ');
}

/** Bounding box of anchors + handles (conservative: the curve stays inside its control hull). */
export function anchorBounds(anchors: Anchor[]): { x: number; y: number; w: number; h: number } {
  const pts: Pt[] = [];
  for (const a of anchors) { pts.push(a); if (a.in) pts.push(a.in); if (a.out) pts.push(a.out); }
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

/** Anchors (stage coords, relative to `parentOrigin`) -> path element fields. */
export function toElementPath(anchors: Anchor[], closed: boolean, parentOrigin: Pt = { x: 0, y: 0 }): Pick<LayoutElement, 'x' | 'y' | 'w' | 'h' | 'd' | 'vb'> {
  const b = anchorBounds(anchors);
  const w = r2(b.w);
  const h = r2(b.h);
  return {
    x: Math.round(b.x - parentOrigin.x),
    y: Math.round(b.y - parentOrigin.y),
    w: Math.max(1, Math.round(w)),
    h: Math.max(1, Math.round(h)),
    d: anchorsToD(anchors, closed, { x: b.x, y: b.y }),
    vb: [w, h],
  };
}

const NUM_RE = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/**
 * Parse a path made of absolute M / L / C / Z (what the pen & pencil write)
 * back into anchors, mapped from the element's vb box onto its stage box.
 * Returns null for paths using other commands (not point-editable).
 */
export function fromElementPath(el: Pick<LayoutElement, 'd' | 'vb' | 'w' | 'h'>, stageOrigin: Pt): { anchors: Anchor[]; closed: boolean } | null {
  if (!el.d) return null;
  const sx = el.vb ? el.w / el.vb[0] : 1;
  const sy = el.vb ? el.h / el.vb[1] : 1;
  const map = (x: number, y: number): Pt => ({ x: stageOrigin.x + x * sx, y: stageOrigin.y + y * sy });
  const anchors: Anchor[] = [];
  let closed = false;
  const re = /([A-Za-z])([^A-Za-z]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(el.d))) {
    const cmd = m[1];
    const n = (m[2].match(NUM_RE) || []).map(Number);
    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i + 1 < n.length; i += 2) anchors.push(map(n[i], n[i + 1]));
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < n.length; i += 6) {
        const prev = anchors[anchors.length - 1];
        if (!prev) return null;
        const c1 = map(n[i], n[i + 1]);
        const c2 = map(n[i + 2], n[i + 3]);
        const end = map(n[i + 4], n[i + 5]);
        if (!samePt(c1, prev)) prev.out = c1;
        anchors.push({ ...end, ...(samePt(c2, end) ? null : { in: c2 }) });
      }
    } else if (cmd === 'Z' || cmd === 'z') {
      closed = true;
    } else {
      return null;
    }
  }
  // A closed path's final curve lands back on the first anchor: fold it into anchor 0.
  if (closed && anchors.length > 2 && samePt(anchors[anchors.length - 1], anchors[0])) {
    const last = anchors.pop()!;
    if (last.in) anchors[0].in = last.in;
  }
  return anchors.length ? { anchors, closed } : null;
}

const samePt = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

/** Split segment i -> i+1 at t=0.5 (de Casteljau), inserting a new smooth anchor. */
export function splitSegment(anchors: Anchor[], i: number, closed: boolean): Anchor[] {
  const a = anchors[i];
  const j = (i + 1) % anchors.length;
  if (!closed && j === 0) return anchors;
  const b = anchors[j];
  const p0 = a;
  const p1 = a.out || a;
  const p2 = b.in || b;
  const p3 = b;
  const mid = (u: Pt, v: Pt): Pt => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 });
  const q0 = mid(p0, p1);
  const q1 = mid(p1, p2);
  const q2 = mid(p2, p3);
  const r0 = mid(q0, q1);
  const r1 = mid(q1, q2);
  const s = mid(r0, r1);
  const curved = !!(a.out || b.in);
  const next = anchors.map((x) => ({ ...x }));
  if (curved) {
    next[i] = { ...next[i], out: q0 };
    next[j] = { ...next[j], in: q2 };
  }
  const inserted: Anchor = curved ? { ...s, in: r0, out: r1 } : s;
  next.splice(i + 1, 0, inserted);
  return next;
}

/** Corner <-> smooth: a smooth point gets mirrored handles 1/3 of the way to its neighbours. */
export function toggleSmooth(anchors: Anchor[], i: number, closed: boolean): Anchor[] {
  const next = anchors.map((x) => ({ ...x }));
  const a = next[i];
  if (a.in || a.out) { delete a.in; delete a.out; return next; }
  const prev = next[i - 1] ?? (closed ? next[next.length - 1] : null);
  const nxt = next[i + 1] ?? (closed ? next[0] : null);
  const dir = prev && nxt ? { x: nxt.x - prev.x, y: nxt.y - prev.y } : nxt ? { x: nxt.x - a.x, y: nxt.y - a.y } : prev ? { x: a.x - prev.x, y: a.y - prev.y } : { x: 60, y: 0 };
  const len = Math.hypot(dir.x, dir.y) || 1;
  const k = Math.min(80, len / 3) / len;
  a.out = { x: a.x + dir.x * k, y: a.y + dir.y * k };
  a.in = { x: a.x - dir.x * k, y: a.y - dir.y * k };
  return next;
}

// ── pencil: freehand -> smooth bezier ───────────────────────────────────────

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!len) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Ramer-Douglas-Peucker simplification. */
export function simplify(points: Pt[], epsilon = 2): Pt[] {
  if (points.length < 3) return points.slice();
  let max = 0;
  let idx = 0;
  const last = points.length - 1;
  for (let i = 1; i < last; i++) {
    const d = perpDist(points[i], points[0], points[last]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= epsilon) return [points[0], points[last]];
  const left = simplify(points.slice(0, idx + 1), epsilon);
  const right = simplify(points.slice(idx), epsilon);
  return [...left.slice(0, -1), ...right];
}

/** Catmull-Rom through the points -> anchors with bezier handles (a smooth stroke). */
export function smoothAnchors(points: Pt[], tension = 1 / 6): Anchor[] {
  if (points.length < 3) return points.map((q) => ({ ...q }));
  return points.map((p, i) => {
    const prev = points[i - 1] ?? p;
    const next = points[i + 1] ?? p;
    const tx = (next.x - prev.x) * tension;
    const ty = (next.y - prev.y) * tension;
    const a: Anchor = { x: p.x, y: p.y };
    if (i > 0) a.in = { x: p.x - tx, y: p.y - ty };
    if (i < points.length - 1) a.out = { x: p.x + tx, y: p.y + ty };
    return a;
  });
}

/** A freehand stroke (raw pointer samples) -> anchors. */
export function pencilToAnchors(raw: Pt[], zoom = 1): Anchor[] {
  const pts = simplify(raw, Math.max(1, 2.5 / Math.max(zoom, 0.05)));
  return smoothAnchors(pts);
}
