// Bounded TTL + LRU cache with a generation fence.
//
// Replaces PublicThemeRenderer's module-level `_cache` Map, which was only
// ever cleared, never trimmed — one entry per distinct URL for the life of a
// long-running OBS tab. Entries written under an older generation are
// unreadable the moment the generation advances (an invalidation), so a stale
// in-memory hit can never defeat an invalidation.

export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
  maxEntries: number;
}

interface Entry<V> {
  value: V;
  generation: number;
  createdAt: number;
  lastUsedAt: number;
}

export class BoundedCache<K, V> {
  private map = new Map<K, Entry<V>>();
  private stats = { hits: 0, misses: 0, evictions: 0 };
  readonly maxEntries: number;
  readonly maxAgeMs: number;
  private now: () => number;

  constructor(opts: { maxEntries: number; maxAgeMs: number; now?: () => number }) {
    this.maxEntries = Math.max(1, opts.maxEntries);
    this.maxAgeMs = opts.maxAgeMs;
    this.now = opts.now ?? Date.now;
  }

  /** A hit only when fresh (≤ maxAge, or the tighter ttlMs) AND written under `generation`. */
  get(key: K, generation: number, ttlMs = this.maxAgeMs): V | undefined {
    const e = this.map.get(key);
    const now = this.now();
    if (!e || e.generation !== generation || now - e.createdAt > Math.min(ttlMs, this.maxAgeMs)) {
      if (e && (e.generation !== generation || now - e.createdAt > this.maxAgeMs)) this.map.delete(key);
      this.stats.misses++;
      return undefined;
    }
    e.lastUsedAt = now;
    // Map preserves insertion order: re-insert to mark most-recently-used.
    this.map.delete(key);
    this.map.set(key, e);
    this.stats.hits++;
    return e.value;
  }

  set(key: K, value: V, generation: number): void {
    const now = this.now();
    this.map.delete(key);
    this.map.set(key, { value, generation, createdAt: now, lastUsedAt: now });
    while (this.map.size > this.maxEntries) {
      this.map.delete(this.map.keys().next().value as K);
      this.stats.evictions++;
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  getStats(): CacheStats {
    return { entries: this.map.size, ...this.stats, maxEntries: this.maxEntries };
  }
}
