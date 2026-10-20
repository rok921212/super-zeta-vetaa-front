// Single lazily-created background-removal worker (adapted from the
// imageResize helper's pool, sized to one so low-end laptops stay within
// memory). Callers just `await removeBackground(blob)`.

type Job = {
  resolve: (b: Blob) => void;
  reject: (e: unknown) => void;
  onProgress?: (fraction: number) => void;
};

let worker: Worker | null = null;
let busy = false;
let inFlight: number | null = null;
const queue: Array<{ blob: Blob; id: number }> = [];
const pending = new Map<number, Job>();
let nextId = 1;

const MODEL_CACHED_KEY = 'imagePrep:modelCached:v1';

/** True once a removal has succeeded in this browser (the model is cached). */
export function isModelCached(): boolean {
  try { return localStorage.getItem(MODEL_CACHED_KEY) === '1'; } catch { return false; }
}

function markModelCached() {
  try { localStorage.setItem(MODEL_CACHED_KEY, '1'); } catch { /* storage blocked */ }
}

function pump() {
  if (busy || queue.length === 0 || !worker) return;
  const task = queue.shift()!;
  busy = true;
  inFlight = task.id;
  worker.postMessage({ blob: task.blob, id: task.id });
}

function createWorker(): Worker {
  const w = new Worker(new URL('./bgWorker.js', import.meta.url), { type: 'module' });
  w.addEventListener('message', (e: MessageEvent) => {
    const { result, error, id, progress } = e.data;
    const job = pending.get(id);
    if (progress) {
      if (job?.onProgress && progress.total) job.onProgress(progress.current / progress.total);
      return;
    }
    if (job) {
      pending.delete(id);
      if (error) job.reject(new Error(error));
      else { markModelCached(); job.resolve(result); }
    }
    busy = false;
    inFlight = null;
    pump();
  });
  // An uncaught worker error (out of memory, model fetch blocked) would leave
  // the job hanging forever — reject it and replace the worker.
  w.addEventListener('error', (e: ErrorEvent) => {
    console.error('Background removal worker crashed:', e.message);
    if (inFlight != null) {
      pending.get(inFlight)?.reject(new Error(e.message || 'Background removal worker crashed'));
      pending.delete(inFlight);
    }
    w.terminate();
    if (worker === w) {
      worker = createWorker();
      busy = false;
      inFlight = null;
      pump();
    }
  });
  return w;
}

export function removeBackground(blob: Blob, onProgress?: (fraction: number) => void): Promise<Blob> {
  if (!worker) worker = createWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    queue.push({ blob, id });
    pump();
  });
}
