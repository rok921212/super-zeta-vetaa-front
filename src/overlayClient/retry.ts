// Abortable retry primitives for the overlay engine.
//
// The old per-consumer retry loops awaited a plain setTimeout, so a cancelled
// fetch (view switch, unmount, match change) still sat out the whole backoff
// (up to 10s) before noticing. Everything here wakes immediately on abort.

export class HttpError extends Error {
  status: number;
  retryAfter: number | null;
  constructor(status: number, retryAfter: number | null = null) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export class AbortError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortError';
  }
}

export const isAbortError = (err: unknown): boolean =>
  err instanceof AbortError || (err as any)?.name === 'AbortError' || (err as any)?.name === 'CanceledError';

/** Resolves after `ms`, or rejects with AbortError the moment `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Transient = worth retrying: no response at all (relay down, network error,
 * timeout), 429 (relay rate limit) or 502/503/504 (the relay answers 503 +
 * Retry-After when it has neither an upstream answer nor a cached copy).
 */
export function isTransient(err: unknown): boolean {
  if (!(err instanceof HttpError)) return true;
  return err.status === 429 || err.status === 502 || err.status === 503 || err.status === 504;
}

// Same schedule the overlays have always used.
export const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 5000];
export const MAX_RETRY_AFTER_MS = 10000;

/** Delay before retry #attempt (0-based): the server's Retry-After when given, else the schedule, plus ≤10% jitter. */
export function backoffDelay(attempt: number, err?: unknown, random: () => number = Math.random): number {
  const retryAfter = err instanceof HttpError ? err.retryAfter : null;
  const base = retryAfter && retryAfter > 0
    ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
    : RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
  return Math.round(base + base * 0.1 * random());
}

export interface RetryOptions {
  signal: AbortSignal;
  /** Called before each wait — for logging / connection-state bookkeeping. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  random?: () => number;
}

/** Run fn until it succeeds or fails non-transiently. Never gives up on a transient error; stops at once on abort. */
export async function retryTransient<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (opts.signal.aborted) throw new AbortError();
    try {
      return await fn();
    } catch (err) {
      if (opts.signal.aborted || isAbortError(err)) throw new AbortError();
      if (!isTransient(err)) throw err;
      const delay = backoffDelay(attempt, err, opts.random);
      opts.onRetry?.(err, attempt, delay);
      await sleep(delay, opts.signal);
    }
  }
}
