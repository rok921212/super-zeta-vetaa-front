import { TEMPLATES } from '../templates/index.ts';
import { createEmptyLayout, normalizeLayout, validateLayout } from '../schema/layoutSchema.js';
import { cloneWithNewIds } from '../editor/ids.ts';
import { allIds } from '../editor/tree.ts';

test.each(TEMPLATES.map((t) => [t.id, t] as const))('template %s is a valid layout', (_id, t) => {
  const doc = normalizeLayout({ ...createEmptyLayout(), elements: t.elements });
  const v = validateLayout(doc);
  expect(v.errors).toEqual([]);
  expect(v.ok).toBe(true);
});

test('all templates together in one layout, re-id\'d on insert, stay valid with unique ids', () => {
  let elements: any[] = [];
  for (const t of TEMPLATES) elements = [...elements, ...cloneWithNewIds(t.elements, elements)];
  const doc = normalizeLayout({ ...createEmptyLayout(), elements });
  expect(validateLayout(doc).ok).toBe(true);
  const ids = allIds(elements);
  // Element ids only (timeline clips have their own, per-element ids).
  let count = 0;
  const walk = (list: any[]) => list.forEach((e) => { count++; if (e.children) walk(e.children); });
  walk(elements);
  expect(ids.size).toBe(count);
});
