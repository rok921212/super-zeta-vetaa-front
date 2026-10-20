// The event the site admin picked for the home page simulation
// (admin panel → Home showcase). Missing, unreachable or slow: the simulator
// uses its built-in sample instead, so the home page never waits on the API.

import { DEFAULT_BACKEND } from '../../login/api';
import type { ShowcaseSeed } from '../../graphics/editor/simulation.ts';

export interface HomeShowcase {
  seed: ShowcaseSeed;
  /** The theme the simulator opens on. */
  defaultTheme?: string;
  /** View keys visitors may pick; empty = all of them. */
  views?: string[];
  updatedAt?: string;
}

export const SHOWCASE_URL = `${DEFAULT_BACKEND.replace(/\/+$/, '')}/api/public/home-showcase`;

let pending: Promise<HomeShowcase | null> | null = null;

export function loadShowcase(timeoutMs = 3500): Promise<HomeShowcase | null> {
  if (pending) return pending;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
  pending = fetch(SHOWCASE_URL, { signal: ctrl?.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => (body?.showcase?.seed ? (body.showcase as HomeShowcase) : null))
    .catch(() => null)
    .finally(() => clearTimeout(timer));
  return pending;
}
