// Build the two bundles behind the Designer's code layers:
//
//   public/code-sdk/v1/runtime.js   runs inside every code layer's sandboxed iframe
//                                   (React, framer-motion, the shared theme hooks,
//                                   the `ss` API). Also copied to the desktop app's
//                                   public/ so the desktop renders code layers offline.
//   public/code-sdk/v1/compiler.js  sucrase + Tailwind v4, loaded by the editor only
//                                   when a code layer is opened.
//
//   node scripts/build-code-sdk.mjs        (npm run build:code-sdk)
//
// Both outputs are committed so `npm start` / `tauri dev` work without a build
// step. Re-run after changing sdk-src/, src/graphics/code/, or the shared theme
// hooks the runtime exports (src/graphics/code/scoresyncApi.ts).

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import esbuild from 'esbuild';

const frontDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(frontDir, 'public', 'code-sdk', 'v1');
const desktopOut = resolve(frontDir, '..', 'desktop-app', 'public', 'code-sdk', 'v1');

// The ranking pager listens for DisplayHud's page buttons on the app socket.
// A sandboxed frame has no socket (connect-src 'none'): pages turn on their timer.
const stubSocket = {
  name: 'stub-socket-manager',
  setup(build) {
    build.onResolve({ filter: /socketManager(\.tsx)?$/ }, () => ({ path: 'socketManager', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'const socket = { on() { return socket; }, off() { return socket; }, emit() { return socket; } };\nexport default { getInstance() { return { connect() { return socket; } }; } };',
      loader: 'js',
    }));
  },
};

const common = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome95'],
  minify: true,
  write: false,
  legalComments: 'none',
  nodePaths: [join(frontDir, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
};

async function build(entry, extra = {}) {
  const result = await esbuild.build({ ...common, entryPoints: [join(frontDir, 'sdk-src', entry)], ...extra });
  return result.outputFiles[0].text;
}

const runtime = await build('codeRuntime.tsx', { plugins: [stubSocket], jsx: 'automatic' });
const compiler = await build('codeCompiler.ts', { loader: { '.css': 'text' } });

const stamp = (name, js) => `/* scoresync ${name} (${createHash('sha256').update(js).digest('hex').slice(0, 12)}) — built by front/scripts/build-code-sdk.mjs */\n${js}`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'runtime.js'), stamp('code-runtime v1', runtime));
writeFileSync(join(outDir, 'compiler.js'), stamp('code-compiler v1', compiler));
console.log(`[code-sdk] runtime.js ${(runtime.length / 1024).toFixed(1)} KB, compiler.js ${(compiler.length / 1024).toFixed(1)} KB → ${outDir}`);

if (existsSync(resolve(desktopOut, '..', '..'))) {
  mkdirSync(desktopOut, { recursive: true });
  writeFileSync(join(desktopOut, 'runtime.js'), readFileSync(join(outDir, 'runtime.js')));
  console.log(`[code-sdk] runtime.js copied → ${desktopOut}`);
}
