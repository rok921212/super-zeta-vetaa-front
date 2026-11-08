// Single lazily-created background-removal worker (sized to one so low-end
// laptops stay within memory; jobs queue). Callers `await aiMask(blob)` and
// get the raw alpha mask at the blob's size.

export type AiQuality = 'fast' | 'high' | 'best';

/** Model per quality. 'best' also runs a mirrored second pass and averages. */
export const AI_MODEL: Record<AiQuality, 'isnet_quint8' | 'isnet_fp16' | 'isnet'> = {
  fast: 'isnet_quint8',
  high: 'isnet_fp16',
  best: 'isnet',
};

export const AI_QUALITY_LABEL: Record<AiQuality, string> = {
  fast: 'Fast · 40 MB model',
  high: 'Accurate · 88 MB model',
  best: 'Best · 176 MB model, 2 passes',
};

type Job = {
  resolve: (m: Uint8ClampedArray) => void;
  reject: (e: unknown) => void;
  onProgress?: (fraction: number) => void;
};

interface Task { blob: Blob; id: number; model: string; flip: boolean }

let worker: Worker | null = null;
let busy = false;
let inFlight: number | null = null;
const queue: Task[] = [];
const pending = new Map<number, Job>();
let nextId = 1;

const cachedKey = (model: string) => `imagePrep:modelCached:v2:${model}`;

/** True once this model has run in this browser (it is in the HTTP cache). */
export function isModelCached(quality: AiQuality): boolean {
  try { return localStorage.getItem(cachedKey(AI_MODEL[quality])) === '1'; } catch { return false; }
}

function markModelCached(model: string) {
  try { localStorage.setItem(cachedKey(model), '1'); } catch { /* storage blocked */ }
}

const taskModel = new Map<number, string>();

function pump() {
  if (busy || queue.length === 0 || !worker) return;
  const task = queue.shift()!;
  busy = true;
  inFlight = task.id;
  taskModel.set(task.id, task.model);
  worker.postMessage({ blob: task.blob, id: task.id, model: task.model, flip: task.flip });
}

function finish(id: number) {
  taskModel.delete(id);
  busy = false;
  inFlight = null;
  pump();
}

function createWorker(): Worker {
  const w = new Worker(new URL('./bgWorker.js', import.meta.url), { type: 'module' });
  // Download progress summed over the model's chunks.
  const chunkProgress = new Map<number, Map<string, [number, number]>>();
  w.addEventListener('message', (e: MessageEvent) => {
    const { mask, error, id, progress } = e.data;
    const job = pending.get(id);
    if (progress) {
      if (!job?.onProgress || !progress.total) return;
      let byKey = chunkProgress.get(id);
      if (!byKey) { byKey = new Map(); chunkProgress.set(id, byKey); }
      byKey.set(progress.key, [progress.current, progress.total]);
      let cur = 0, tot = 0;
      byKey.forEach(([c, t]) => { cur += c; tot += t; });
      job.onProgress(tot ? cur / tot : 0);
      return;
    }
    chunkProgress.delete(id);
    if (job) {
      pending.delete(id);
      if (error) job.reject(new Error(error));
      else { const m = taskModel.get(id); if (m) markModelCached(m); job.resolve(mask); }
    }
    finish(id);
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
      if (inFlight != null) finish(inFlight);
      else { busy = false; pump(); }
    }
  });
  return w;
}

function run(blob: Blob, model: string, flip: boolean, onProgress?: (f: number) => void): Promise<Uint8ClampedArray> {
  if (!worker) worker = createWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    queue.push({ blob, id, model, flip });
    pump();
  });
}

/**
 * AI foreground mask for `blob` (one byte per pixel, at the blob's own size).
 * 'best' averages a normal and a mirrored pass, which steadies the edges and
 * recovers thin parts one pass misses.
 */
export async function aiMask(
  blob: Blob, width: number, height: number, quality: AiQuality, onProgress?: (f: number) => void,
): Promise<Uint8ClampedArray> {
  const model = AI_MODEL[quality];
  const first = await run(blob, model, false, onProgress);
  if (quality !== 'best') return first;
  const mirrored = await run(blob, model, true);
  const out = new Uint8ClampedArray(first.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      out[row + x] = (first[row + x] + mirrored[row + width - 1 - x] + 1) >> 1;
    }
  }
  return out;
}
