// A representative "large" design for performance tests: N layers of mixed
// kinds (text, shapes, gradients, image frames, bound text, animated layers),
// laid out on a grid so every one of them is on the canvas.

import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { createEmptyLayout } from '../schema/layoutSchema.js';

export const PERF_ASSET = 'asset:65f0000000000000000000a1';

export function buildPerfDocument(count = 500): LayoutDocument {
  const doc = createEmptyLayout() as LayoutDocument;
  const cols = 25;
  const els: LayoutElement[] = [];
  for (let i = 0; i < count; i++) {
    const x = (i % cols) * 76 + 8;
    const y = Math.floor(i / cols) * 52 + 8;
    const base = { id: `l${i}`, name: `Layer ${i}`, x, y, w: 68, h: 44 };
    switch (i % 6) {
      case 0:
        els.push({ ...base, type: 'text', text: `T${i}`, style: { color: '#ffffff', fontSize: 18, fontWeight: 700, textFit: 'shrink' } });
        break;
      case 1:
        els.push({ ...base, type: 'rect', style: { fill: '#1f2937', radius: 6, stroke: '#ffffff', strokeWidth: 1 } });
        break;
      case 2:
        els.push({ ...base, type: 'rect', style: { gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#e11d2e' }, { offset: 0.5, color: 'rgba(250, 204, 21, 0.8)' }, { offset: 1, color: '#111827' }] } } });
        break;
      case 3:
        els.push({ ...base, type: 'ellipse', imageFill: { src: PERF_ASSET, fit: 'cover', scale: 1.2, posX: 0.4 }, style: { stroke: '#facc15', strokeWidth: 2 } });
        break;
      case 4:
        els.push({ ...base, type: 'text', bind: { text: { path: 'tournament.tournamentName', fallback: 'TOURNAMENT' } }, style: { color: '#facc15', fontSize: 12 } });
        break;
      default:
        els.push({
          ...base, type: 'polygon', points: [[17, 0], [51, 0], [68, 22], [51, 44], [17, 44], [0, 22]], vb: [68, 44], style: { fill: '#7c3aed' },
          timeline: { clips: [{ id: `c${i}`, trigger: { type: 'loop' }, duration: 1200, loop: true, direction: 'alternate', tracks: [{ prop: 'opacity', keyframes: [{ t: 0, value: 1 }, { t: 1200, value: 0.4 }] }, { prop: 'dy', keyframes: [{ t: 0, value: 0 }, { t: 1200, value: -6 }] }] }] },
        });
    }
  }
  doc.elements = els;
  return doc;
}
