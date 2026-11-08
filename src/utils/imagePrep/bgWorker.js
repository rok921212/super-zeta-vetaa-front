/* eslint-disable no-restricted-globals */
// Background removal runs here, off the main thread. The library (and its
// onnxruntime) is imported lazily on the first job; its model + wasm come
// from IMG.LY's CDN and stay in the browser cache — never from our servers.
//
// Returns the raw alpha mask (one byte per pixel at the input's size), not a
// PNG: the main thread refines edges and lets the user mark it before
// anything is encoded.
//
// WebGPU is tried first (much faster, and lets the bigger models run in a
// couple of seconds); if the GPU path fails once, this worker stays on CPU.

let lib = null;
let gpuBroken = typeof navigator === 'undefined' || !navigator.gpu;

async function loadLibrary() {
  if (!lib) lib = await import('@imgly/background-removal');
  return lib;
}

async function flipBlob(blob) {
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d');
  ctx.translate(bmp.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

async function maskOf(blob, model, id) {
  const { removeBackground } = await loadLibrary();
  const run = (device) => removeBackground(blob, {
    model,
    device,
    output: { format: 'image/x-rgba8' },
    progress: (key, current, total) => {
      if (key.startsWith('fetch:')) self.postMessage({ id, progress: { key, current, total } });
    },
  });
  let raw;
  if (!gpuBroken) {
    try { raw = await run('gpu'); }
    catch (err) { console.warn('WebGPU background removal failed, using CPU:', err); gpuBroken = true; }
  }
  if (!raw) raw = await run('cpu');
  const rgba = new Uint8Array(await raw.arrayBuffer());
  const mask = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3];
  return mask;
}

self.onmessage = async (e) => {
  const { blob, id, model, flip } = e.data;
  try {
    const mask = await maskOf(await (flip ? flipBlob(blob) : blob), model, id);
    self.postMessage({ id, mask, gpu: !gpuBroken }, [mask.buffer]);
  } catch (error) {
    self.postMessage({ error: (error && error.message) || 'Background removal failed', id });
  }
};
