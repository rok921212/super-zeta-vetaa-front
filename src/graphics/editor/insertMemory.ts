// Favourites and recently inserted items for the Insert panel. Per browser
// (localStorage), a convenience only: losing it (private window, cleared
// site data) changes nothing about any design.
//
// Keys are `kind:<InsertKind>` and `part:<part id>`; a key whose item no
// longer exists is simply skipped when shown.

import { useCallback, useState } from 'react';

const STORE_KEY = 'ss.designer.insertMemory';
export const RECENT_LIMIT = 6;

export interface InsertMemory { recent: string[]; favorites: string[] }

const EMPTY: InsertMemory = { recent: [], favorites: [] };

export function loadInsertMemory(): InsertMemory {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null');
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : []);
    return raw && typeof raw === 'object' ? { recent: list(raw.recent).slice(0, RECENT_LIMIT), favorites: list(raw.favorites) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function save(m: InsertMemory) {
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(m)); } catch { /* not remembered */ }
}

/** Most recent first, no duplicates, at most RECENT_LIMIT. */
export const withRecent = (m: InsertMemory, key: string): InsertMemory => ({ ...m, recent: [key, ...m.recent.filter((k) => k !== key)].slice(0, RECENT_LIMIT) });

export const withFavorite = (m: InsertMemory, key: string): InsertMemory => ({
  ...m,
  favorites: m.favorites.includes(key) ? m.favorites.filter((k) => k !== key) : [...m.favorites, key],
});

export function useInsertMemory() {
  const [memory, setMemory] = useState(loadInsertMemory);
  const update = useCallback((fn: (m: InsertMemory) => InsertMemory) => setMemory((m) => { const next = fn(m); save(next); return next; }), []);
  const used = useCallback((key: string) => update((m) => withRecent(m, key)), [update]);
  const toggleFavorite = useCallback((key: string) => update((m) => withFavorite(m, key)), [update]);
  return { memory, used, toggleFavorite };
}
