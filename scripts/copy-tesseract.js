// Copies the tesseract.js worker, core wasm and English language data into
// public/tesseract/ so the MatchData screenshot import reads screenshots with
// no CDN fetches. Runs before `npm start` / `npm run build`.
// (Ported from imageResize/scripts/copy-tesseract.mjs.)
const { copyFileSync, existsSync, mkdirSync, readdirSync } = require('fs');
const { basename, join } = require('path');

const root = join(__dirname, '..');
const out = join(root, 'public', 'tesseract');
const nm = join(root, 'node_modules');

function copy(from, toDir) {
  mkdirSync(toDir, { recursive: true });
  const dest = join(toDir, basename(from));
  if (!existsSync(dest)) copyFileSync(from, dest);
}

copy(join(nm, 'tesseract.js', 'dist', 'worker.min.js'), out);

const coreDir = join(nm, 'tesseract.js-core');
for (const file of readdirSync(coreDir)) {
  if (/^tesseract-core.*\.(wasm|js)$/.test(file)) copy(join(coreDir, file), join(out, 'core'));
}

copy(join(nm, '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'lang'));

console.log('tesseract assets ready in public/tesseract');
