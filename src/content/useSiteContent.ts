// Loads the home page text from front/public/content/site.json. Fetched (not
// imported) so the file can be edited on the server without a rebuild;
// `no-cache` revalidates it on every visit so an edit shows up on the next load.
// Whatever the file is missing falls back to FALLBACK_CONTENT key by key, so a
// half-edited file still renders.

import { useEffect, useState } from 'react';
import type { SiteContent } from './siteContent.types.ts';
import { FALLBACK_CONTENT } from './fallback.ts';

export const SITE_CONTENT_URL = `${process.env.PUBLIC_URL || ''}/content/site.json`;
const TIMEOUT_MS = 4000;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Objects merge key by key; arrays and values from `over` replace `base`. Wrong types are ignored. */
export function mergeContent<T>(base: T, over: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(over)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k];
    if (isPlainObject(b)) out[k] = mergeContent(b, v);
    else if (Array.isArray(b)) out[k] = Array.isArray(v) ? v : b;
    else if (b === undefined || typeof v === typeof b) out[k] = v;
  }
  return out as T;
}

let loaded: SiteContent | null = null;
let pending: Promise<SiteContent> | null = null;

export function loadSiteContent(): Promise<SiteContent> {
  if (loaded) return Promise.resolve(loaded);
  if (pending) return pending;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), TIMEOUT_MS);
  pending = fetch(SITE_CONTENT_URL, { cache: 'no-cache', signal: ctrl?.signal })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((json) => mergeContent(FALLBACK_CONTENT, json))
    .catch((err) => {
      console.warn('[site content] using built-in fallback:', err?.message || err);
      return FALLBACK_CONTENT;
    })
    .then((content) => {
      clearTimeout(timer);
      loaded = content;
      return content;
    });
  return pending;
}

/** `content` is null until the file has loaded (or failed and fallen back). */
export function useSiteContent(): SiteContent | null {
  const [content, setContent] = useState<SiteContent | null>(loaded);
  useEffect(() => {
    if (content) return;
    let alive = true;
    void loadSiteContent().then((c) => { if (alive) setContent(c); });
    return () => { alive = false; };
  }, [content]);
  return content;
}

/** Tests only. */
export function resetSiteContentForTests() {
  loaded = null;
  pending = null;
}
