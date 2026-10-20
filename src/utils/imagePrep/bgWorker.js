/* eslint-disable no-restricted-globals */
// Background removal runs here, off the main thread. The library (and its
// onnxruntime) is imported lazily on the first job, and its model + wasm are
// fetched from IMG.LY's CDN and kept in the browser cache — never from our
// own servers. isnet_quint8 is the smallest model (~40 MB, downloaded once).

let removeBackgroundFn = null;

async function loadLibrary() {
  if (!removeBackgroundFn) {
    const mod = await import('@imgly/background-removal');
    removeBackgroundFn = mod.removeBackground;
  }
  return removeBackgroundFn;
}

self.onmessage = async (e) => {
  const { blob, id } = e.data;
  try {
    const removeBackground = await loadLibrary();
    const result = await removeBackground(blob, {
      model: 'isnet_quint8',
      output: { format: 'image/png' },
      progress: (key, current, total) => {
        if (key.startsWith('fetch:')) self.postMessage({ id, progress: { current, total } });
      },
    });
    self.postMessage({ result, id });
  } catch (error) {
    self.postMessage({ error: (error && error.message) || 'Background removal failed', id });
  }
};
