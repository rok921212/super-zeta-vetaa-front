// Request queue system to prevent 429 errors
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private isProcessing = false;
  private readonly maxConcurrent = 3;
  private readonly delayBetweenRequests = 100; // ms
  private activeRequests = 0;

  async add<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.activeRequests >= this.maxConcurrent) {
      return;
    }

    this.isProcessing = true;

    while (
      this.queue.length > 0 &&
      this.activeRequests < this.maxConcurrent
    ) {
      const request = this.queue.shift();

      if (request) {
        this.activeRequests++;

        setTimeout(async () => {
          try {
            await request();
          } catch (error) {
            console.error("Request failed:", error);
          } finally {
            this.activeRequests--;
            this.processQueue();
          }
        }, this.delayBetweenRequests);
      }
    }

    this.isProcessing = false;
  }

  clear() {
    this.queue.length = 0;
  }

  getStatus() {
    return {
      pending: this.queue.length,
      active: this.activeRequests,
      isProcessing: this.isProcessing,
    };
  }
}

export const requestQueue = new RequestQueue();

// Debounce utility for batching rapid updates
export class UpdateBatcher<T> {
  private pendingUpdates = new Map<string, T>();
  private timeouts = new Map<string, NodeJS.Timeout>();
  private callbacks = new Map<string, (batched: T) => Promise<void>>();

  private readonly delay: number;
  private readonly accumulator?: (
    existing: T,
    newUpdate: T
  ) => T;

  constructor(
    delay: number = 300,
    accumulator?: (existing: T, newUpdate: T) => T
  ) {
    this.delay = delay;
    this.accumulator = accumulator;
  }

  batch(
    key: string,
    update: T,
    callback: (batched: T) => Promise<void>
  ) {
    const existingTimeout = this.timeouts.get(key);

    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const existingUpdate = this.pendingUpdates.get(key);

    const finalUpdate =
      existingUpdate && this.accumulator
        ? this.accumulator(existingUpdate, update)
        : update;

    this.pendingUpdates.set(key, finalUpdate);
    this.callbacks.set(key, callback);

    const timeout = setTimeout(async () => {
      const batchedUpdate = this.pendingUpdates.get(key);
      const storedCallback = this.callbacks.get(key);

      if (batchedUpdate && storedCallback) {
        this.pendingUpdates.delete(key);
        this.timeouts.delete(key);
        this.callbacks.delete(key);

        try {
          await requestQueue.add(() =>
            storedCallback(batchedUpdate)
          );
        } catch (error) {
          console.error("Batched update failed:", error);
        }
      }
    }, this.delay);

    this.timeouts.set(key, timeout);
  }

  async flush() {
    const promises: Promise<void>[] = [];

    this.pendingUpdates.forEach((update, key) => {
      const timeout = this.timeouts.get(key);
      const callback = this.callbacks.get(key);

      if (timeout) {
        clearTimeout(timeout);
        this.timeouts.delete(key);
      }

      if (callback) {
        promises.push(
          requestQueue.add(() => callback(update))
        );
        this.callbacks.delete(key);
      }

      this.pendingUpdates.delete(key);
    });

    return Promise.all(promises);
  }

  clear() {
    this.timeouts.forEach((timeout) => {
      clearTimeout(timeout);
    });

    this.pendingUpdates.clear();
    this.timeouts.clear();
    this.callbacks.clear();
  }
}