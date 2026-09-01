// src/utils/cache.ts
export type CacheStorage = 'local' | 'session';

const getStore = (storage: CacheStorage): Storage =>
  storage === 'session' ? sessionStorage : localStorage;

export const setCache = (key: string, data: any, storage: CacheStorage = 'local'): void => {
  try {
    getStore(storage).setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // storage unavailable/full (e.g. Safari private mode, quota exceeded) — caching is best-effort
  }
};

export const getCache = <T = any>(
  key: string,
  maxAge = 1000 * 60 * 60,
  storage: CacheStorage = 'local'
): T | null => {
  try {
    const cached = getStore(storage).getItem(key);
    if (!cached) return null;

    const parsed = JSON.parse(cached);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.timestamp !== 'number') return null; // malformed/legacy entry

    const { data, timestamp } = parsed;
    if (Date.now() - timestamp > maxAge) return null; // expired
    return data as T;
  } catch {
    return null;
  }
};

export const removeCache = (key: string, storage: CacheStorage = 'local'): void => {
  try {
    getStore(storage).removeItem(key);
  } catch {
    // ignore
  }
};

/**
 * Save new data only if it has changed compared to cached data
 */
export const updateCacheIfChanged = (
  key: string,
  newData: any,
  maxAge = 1000 * 60 * 60,
  storage: CacheStorage = 'local'
): void => {
  const oldData = getCache(key, maxAge, storage);
  if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
    removeCache(key, storage); // remove old cache
    setCache(key, newData, storage); // set new cache
  }
};

/**
 * Remove every cached entry whose key starts with `prefix`.
 */
export const clearCacheByPrefix = (prefix: string, storage: CacheStorage = 'session'): void => {
  try {
    const store = getStore(storage);
    const keysToRemove: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && key.startsWith(prefix)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => store.removeItem(key));
  } catch {
    // ignore
  }
};

export interface GetOrFetchOptions {
  maxAge?: number; // default 1 hour
  storage?: CacheStorage; // default 'session'
  forceRefresh?: boolean; // default false — still dedupes concurrent callers
}

// In-flight request dedup: concurrent callers for the same key share one network request.
const inFlight = new Map<string, Promise<any>>();

/**
 * Cache-first fetch: returns cached data immediately if present and fresh
 * (no network call at all). On a miss, dedupes concurrent callers for the
 * same key, fetches once, populates the cache, and returns the result.
 * Errors are never cached.
 */
export async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: GetOrFetchOptions
): Promise<T> {
  const { maxAge = 1000 * 60 * 60, storage = 'session', forceRefresh = false } = options || {};

  if (!forceRefresh) {
    const cached = getCache<T>(key, maxAge, storage);
    if (cached != null) return cached;
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = fetcher()
    .then((data) => {
      setCache(key, data, storage);
      inFlight.delete(key);
      return data;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}
