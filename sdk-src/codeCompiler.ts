// Entry of /code-sdk/v1/compiler.js (built by scripts/build-code-sdk.mjs):
// sucrase + Tailwind v4 for the Designer's code layers. Loaded by the editor
// only when a code layer is opened (graphics/code/compile.ts), so neither
// ships in the main app bundle and an overlay page never loads it.

import { transform } from 'sucrase';
// @ts-ignore — aliased to tailwindcss@4 (package "tailwindcss-v4") by the build.
import { compile } from 'tailwindcss-v4';
// @ts-ignore — imported as text by the build.
import tailwindIndexCss from 'tailwindcss-v4/index.css';
import { compileParts, COMPILER_VERSION } from '../src/graphics/code/compileCore.ts';
import { parseSsx } from '../src/graphics/code/ssx.ts';

async function tailwind(css: string, candidates: string[]): Promise<string> {
  const compiler = await compile(css, {
    base: '/',
    loadStylesheet: async (id: string, base: string) => {
      if (id === 'tailwindcss' || id === 'tailwindcss/index.css') return { path: 'tailwindcss/index.css', base, content: tailwindIndexCss };
      throw new Error(`@import "${id}" is not available — only "tailwindcss" can be imported`);
    },
    loadModule: async (id: string) => { throw new Error(`@plugin / @config "${id}" is not supported in code layers`); },
  });
  return compiler.build(candidates);
}

(self as any).ScoreSyncCodeCompiler = {
  version: COMPILER_VERSION,
  parseSsx,
  compile: (parts: Parameters<typeof compileParts>[0]) => compileParts(parts, { transform: transform as any, tailwind }),
};
