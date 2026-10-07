// The Designer's client cache for read requests (themes, fonts, tournaments,
// rounds, revisions, the layout list).
//
//   - One request per key: callers that ask while a fetch is in flight share it.
//   - A value younger than its lifetime is returned without touching the network.
//   - A stale value is still handed out immediately (the panel renders at
//     once) while one background refresh runs — stale-while-revalidate. The
//     server answers that refresh with a 304 when nothing changed.
//   - Writes go through: after a mutation the caller `setCached`s the new value
//     (no refetch) or `invalidate`s the key (refetched the next time it is used).
//   - Small lists are also kept in localStorage, so a reload or a new tab paints
//     from the cache at once instead of waiting for the network.
//   - Tabs tell each other: a write or an invalidation in one tab reaches the
//     others through a BroadcastChannel, so two open editors do not drift.
//
// Keys are namespaced by the signed-in user, so a different account in the
// same browser never sees the previous one's lists.

import { useCallback, useEffect, useRef, useState } from 'react';

export const DEFAULT_TTL_MS = 60000;

/**
 * How long a value counts as fresh, by key. Data that only changes through
 * this app's own writes (which invalidate it, here and in other tabs) can live
 * longer; lists another device might change stay at a minute.
 */
export function ttlFor(key: string): number {
  if (/^(tournaments$|rounds:|fonts$|themes$)/.test(key)) return 5 * 60000;
  return DEFAULT_TTL_MS;
}

interface Entry {
  value?: unknown;
  /** When `value` was stored; 0 = never / invalidated. */
  at: number;
  promise?: Promise<unknown>;
}

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

/** A short tag for the current account (from the stored login), so keys never cross users. */
function userTag(): string {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
    const token: unknown = raw ? JSON.parse(raw)?.token : null;
    return typeof token === 'string' && token ? token.slice(-16) : 'anon';
  } catch {
    return 'anon';
  }
}

const full = (key: string) => `${userTag()}|${key}`;

function notify(k: string) {
  listeners.get(k)?.forEach((l) => l());
}

// ── persistence (localStorage) ──────────────────────────────────────────────

const STORE_PREFIX = 'dz.cache.v1|';
const MAX_PERSIST_BYTES = 256 * 1024;
const MAX_PERSIST_ENTRIES = 60;

/** Only small, list-shaped data is persisted — never a layout's draft. */
const persists = (key: string): boolean => /^(layouts$|themes$|fonts$|tournaments$|rounds:|revisions:)/.test(key);
const bareKey = (k: string): string => k.slice(k.indexOf('|') + 1);

function readStored(k: string): { v: unknown; at: number } | null {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + k);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.at === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(k: string, e: Entry): void {
  if (!persists(bareKey(k))) return;
  try {
    const raw = JSON.stringify({ v: e.value, at: e.at });
    if (raw.length > MAX_PERSIST_BYTES) { localStorage.removeItem(STORE_PREFIX + k); return; }
    localStorage.setItem(STORE_PREFIX + k, raw);
    prune();
  } catch {
    // quota / private mode: the in-memory cache still works
  }
}

/** Keep the store small: drop the oldest entries beyond the cap (other accounts' leftovers go first). */
function prune(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORE_PREFIX)) keys.push(key);
  }
  if (keys.length <= MAX_PERSIST_ENTRIES) return;
  const mine = `${STORE_PREFIX}${userTag()}|`;
  const aged = keys
    .map((key) => { let at = 0; try { at = JSON.parse(localStorage.getItem(key) || '{}').at || 0; } catch { /* unreadable: oldest */ } return { key, at, mine: key.startsWith(mine) }; })
    .sort((a, b) => Number(a.mine) - Number(b.mine) || a.at - b.at);
  for (const { key } of aged.slice(0, keys.length - MAX_PERSIST_ENTRIES)) localStorage.removeItem(key);
}

/** The entry for a full key, hydrated from localStorage the first time it is asked for. */
function entryOf(k: string, create: boolean): Entry | undefined {
  let e = entries.get(k);
  if (e) return e;
  const stored = persists(bareKey(k)) ? readStored(k) : null;
  if (stored) e = { value: stored.v, at: stored.at };
  else if (create) e = { at: 0 };
  if (e) entries.set(k, e);
  return e;
}

// ── other tabs ──────────────────────────────────────────────────────────────

type TabMessage = { k: string; kind: 'set' | 'stale' };
let channel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('designer-cache');
    channel.onmessage = (ev: MessageEvent<TabMessage>) => {
      const msg = ev.data;
      if (!msg || typeof msg.k !== 'string') return;
      const e = entries.get(msg.k);
      if (msg.kind === 'set') {
        // the other tab stored the new value: take it from there, no request needed
        const stored = readStored(msg.k);
        if (stored) { entries.set(msg.k, { value: stored.v, at: stored.at }); notify(msg.k); return; }
      }
      if (e) { e.at = 0; e.promise = undefined; notify(msg.k); }
    };
  }
} catch {
  channel = null;
}
const tell = (msg: TabMessage) => { try { channel?.postMessage(msg); } catch { /* channel closed */ } };

// ── API ─────────────────────────────────────────────────────────────────────

export interface CacheOptions {
  ttlMs?: number;
  /** Ignore a fresh value and fetch (still shares an in-flight request). */
  force?: boolean;
}

/** The cached value if there is one (fresh or stale). */
export function peek<T>(key: string): T | undefined {
  return entryOf(full(key), false)?.value as T | undefined;
}

export function isFresh(key: string, ttlMs?: number): boolean {
  const e = entryOf(full(key), false);
  return !!e && e.at > 0 && Date.now() - e.at < (ttlMs ?? ttlFor(key));
}

/** Fetch through the cache. Resolves with a fresh value; rejects only if the request fails. */
export function cached<T>(key: string, fetcher: () => Promise<T>, opts: CacheOptions = {}): Promise<T> {
  const k = full(key);
  const e = entryOf(k, true)!;
  if (!opts.force && e.at > 0 && Date.now() - e.at < (opts.ttlMs ?? ttlFor(key))) return Promise.resolve(e.value as T);
  if (e.promise) return e.promise as Promise<T>;
  const p = fetcher().then(
    (value) => {
      // A write that landed while this request was in flight wins over its (older) answer.
      if (e.promise === p) {
        e.value = value;
        e.at = Date.now();
        e.promise = undefined;
        writeStored(k, e);
        notify(k);
      }
      return e.value as T;
    },
    (err) => {
      if (e.promise === p) e.promise = undefined;
      throw err;
    }
  );
  e.promise = p;
  return p;
}

/** Write-through after a mutation: replace the value (or derive it from the current one). */
export function setCached<T>(key: string, value: T | ((current: T | undefined) => T)): void {
  const k = full(key);
  const e = entryOf(k, true)!;
  e.value = typeof value === 'function' ? (value as (c: T | undefined) => T)(e.value as T | undefined) : value;
  e.at = Date.now();
  e.promise = undefined;
  writeStored(k, e);
  notify(k);
  tell({ k, kind: persists(key) ? 'set' : 'stale' });
}

/** Mark a key (or every key starting with `prefix`) stale. Mounted users refetch; others on next use. */
export function invalidate(keyOrPrefix: string, { prefix = false } = {}): void {
  const target = full(keyOrPrefix);
  if (!prefix) entryOf(target, false); // a persisted-only entry must be marked stale too
  entries.forEach((e, k) => {
    if (prefix ? k.startsWith(target) : k === target) {
      e.at = 0;
      e.promise = undefined;
      writeStored(k, e);
      notify(k);
      tell({ k, kind: 'stale' });
    }
  });
}

/** Forget everything, in memory and on disk (sign-out; tests). */
export function clearCache(): void {
  entries.clear();
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORE_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch { /* no storage */ }
}

/** Tests: drop the in-memory tier only, as a page reload would. */
export function dropMemoryCache(): void {
  entries.clear();
}

function subscribe(key: string, l: () => void): () => void {
  const k = full(key);
  let set = listeners.get(k);
  if (!set) { set = new Set(); listeners.set(k, set); }
  set.add(l);
  return () => { set!.delete(l); if (!set!.size) listeners.delete(k); };
}

export interface CachedResult<T> {
  /** undefined until the first value arrives. */
  data: T | undefined;
  error: unknown;
  loading: boolean;
  /** Force a refetch. Resolves with the new value, or null if it failed. */
  reload(): Promise<T | null>;
}

/**
 * React binding. `key` null = disabled. Shows whatever is cached at once
 * (memory, else disk), fetches only when there is nothing fresh, and follows
 * later writes / invalidations of the same key made anywhere — this tab or
 * another one.
 */
export function useCached<T>(key: string | null, fetcher: () => Promise<T>, opts: { ttlMs?: number } = {}): CachedResult<T> {
  const [, bump] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const ttlMs = opts.ttlMs;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async (force: boolean): Promise<T | null> => {
    if (!key) return null;
    if (!force && isFresh(key, ttlMs)) return peek<T>(key) ?? null;
    setLoading(true);
    try {
      const v = await cached<T>(key, () => fetcherRef.current(), { ttlMs, force });
      if (alive.current) { setError(null); setLoading(false); bump((n) => n + 1); }
      return v;
    } catch (err) {
      if (alive.current) { setError(err); setLoading(false); }
      return null;
    }
  }, [key, ttlMs]);

  useEffect(() => {
    if (!key) return;
    void load(false);
    return subscribe(key, () => {
      if (!alive.current) return;
      bump((n) => n + 1);
      if (!isFresh(key, ttlMs)) void load(false); // invalidated elsewhere
    });
  }, [key, ttlMs, load]);

  const reload = useCallback(() => load(true), [load]);
  return { data: key ? peek<T>(key) : undefined, error, loading, reload };
}

/** Cache keys used across the Designer (one place, so writers and readers agree). */
export const CACHE_KEYS = {
  layouts: 'layouts',
  themes: 'themes',
  fonts: 'fonts',
  tournaments: 'tournaments',
  rounds: (tournamentId: string) => `rounds:${tournamentId}`,
  revisions: (layoutId: string) => `revisions:${layoutId}`,
};
