// Deletes the onnxruntime .wasm that webpack copies into build/static/media
// when it bundles @imgly/background-removal. The library never loads it — it
// points onnxruntime at the wasm from IMG.LY's CDN (see createOnnxSession in
// @imgly/background-removal/dist/index.mjs) — so it would only add ~24 MB of
// dead weight to every deploy. Runs after `npm run build`.
const { existsSync, readdirSync, unlinkSync } = require('fs');
const { join } = require('path');

const media = join(__dirname, '..', 'build', 'static', 'media');
if (existsSync(media)) {
  for (const file of readdirSync(media)) {
    if (/^ort-wasm.*\.wasm$/.test(file)) {
      unlinkSync(join(media, file));
      console.log(`removed unused ${file}`);
    }
  }
}
