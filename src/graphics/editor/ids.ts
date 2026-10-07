// Element ids and copy/paste cloning. A pasted / duplicated / template subtree
// always gets fresh ids for EVERY element (no duplicate ids, ever), and
// component-instance overrides keyed by child id stay pointed at the
// component's own (unchanged) child ids.

import type { LayoutElement } from '../schema/layoutTypes.ts';
import { allIds } from './tree.ts';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function newId(prefix = 'el', taken?: Set<string>): string {
  for (;;) {
    let s = '';
    for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    const id = `${prefix}_${s}`;
    if (!taken || !taken.has(id)) {
      taken?.add(id);
      return id;
    }
  }
}

const prefixFor = (type: string) => type.replace(/[^A-Za-z]/g, '').slice(0, 8) || 'el';

/** Deep clone with every id replaced by a fresh one not present in `existing`. */
export function cloneWithNewIds(els: LayoutElement[], existing: LayoutElement[], offset = { x: 0, y: 0 }): LayoutElement[] {
  const taken = allIds(existing);
  const walk = (list: LayoutElement[], top: boolean): LayoutElement[] =>
    list.map((el) => {
      const copy: LayoutElement = JSON.parse(JSON.stringify(el));
      copy.id = newId(prefixFor(el.type), taken);
      if (top) {
        copy.x += offset.x;
        copy.y += offset.y;
      }
      if (copy.children) copy.children = walk(el.children || [], false);
      return copy;
    });
  return walk(els, true);
}
