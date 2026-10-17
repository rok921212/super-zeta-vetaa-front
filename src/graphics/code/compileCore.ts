// Turn an .ssx file into what a code layer runs: plain JavaScript (TSX/JSX →
// React.createElement, ES imports → require) and static CSS (Tailwind
// utilities generated for exactly the classes the file uses).
//
// Compilation happens ONCE, in the editor, when the layer is saved. OBS and
// the desktop app only ever run the stored output, so an overlay never pays
// for a transpiler or a Tailwind build while it is on air.
//
// The transpiler and Tailwind are passed in (`CompilerDeps`): the editor gets
// them from the lazily loaded /code-sdk/v1/compiler.js bundle
// (compilerEntry.ts), jest passes sucrase directly.

import { classCandidates, type SsxParts } from './ssx.ts';

export const COMPILER_VERSION = 1;

export interface CodeProblem { where: 'script' | 'style' | 'template' | 'file'; line: number; message: string; level: 'error' | 'warning' | 'info'; /** What to do about it. */ hint?: string }

export interface CompilerDeps {
  /** sucrase's `transform`. */
  transform(code: string, options: Record<string, unknown>): { code: string };
  /** Tailwind: build CSS for `css` (which starts with `@import "tailwindcss"`) and the class candidates. */
  tailwind?(css: string, candidates: string[]): Promise<string>;
}

export interface CompiledCode {
  compiledJs: string;
  compiledCss: string;
  problems: CodeProblem[];
}

const TRANSFORMS: Record<SsxParts['lang'], string[]> = {
  tsx: ['typescript', 'jsx', 'imports'],
  jsx: ['jsx', 'imports'],
  js: ['imports'],
};

/** "Unexpected token (12:5)" → line 12. */
function errorLine(message: string): number {
  const m = /\((\d+):\d+\)/.exec(message);
  return m ? Number(m[1]) : 1;
}

/** Keep the compiled script safe to inline in the sandbox document: `</script` can never end the tag early. */
export const inlineSafeJs = (js: string): string => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

// ── colour lowering ─────────────────────────────────────────────────────────
// Tailwind v4 writes colours as oklch() and opacity as color-mix(), which need
// Chromium 111+. OBS browser sources on older CEF builds would draw nothing,
// so literal colours are rewritten to rgb() and the modern-only @supports
// branches are dropped (Tailwind already puts an sRGB fallback before them).

const srgb = (x: number) => {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
};

/** oklch(L C H) → [r, g, b] (0-255). L may be 0-1 or a percentage. */
export function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    srgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    srgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    srgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const num = (v: string) => (v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v));

/** Remove `@supports (<cond>) { … }` blocks whose condition mentions `needle` (brace-matched). */
function dropSupports(css: string, needle: RegExp): string {
  let out = '';
  let i = 0;
  const re = /@supports\s*([^{]*)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    if (!needle.test(m[1])) continue;
    let depth = 1;
    let j = re.lastIndex;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    out += css.slice(i, m.index);
    i = j;
    re.lastIndex = j;
  }
  return out + css.slice(i);
}

export function lowerCss(css: string): string {
  let out = css.replace(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)/g, (_m, l, c, h, alpha) => {
    const [r, g, b] = oklchToRgb(num(l), parseFloat(c), parseFloat(h));
    return alpha != null ? `rgb(${r} ${g} ${b} / ${num(alpha)})` : `rgb(${r}, ${g}, ${b})`;
  });
  // color-mix(in srgb, <literal colour> P%, transparent) → the colour at P% alpha.
  out = out.replace(/color-mix\(in srgb,\s*rgb\((\d+),?\s*(\d+),?\s*(\d+)\)\s+([\d.]+)%,\s*transparent\)/g,
    (_m, r, g, b, p) => `rgb(${r} ${g} ${b} / ${Math.round(parseFloat(p) * 10) / 1000})`);
  out = out.replace(/color-mix\(in srgb,\s*#([0-9a-f]{3}|[0-9a-f]{6})\s+([\d.]+)%,\s*transparent\)/gi, (_m, hex: string, p) => {
    const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;
    const n = parseInt(full, 16);
    return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${Math.round(parseFloat(p) * 10) / 1000})`;
  });
  return dropSupports(out, /color-mix|lab\(|oklch|oklab/i);
}

export async function compileParts(parts: SsxParts, deps: CompilerDeps): Promise<CompiledCode> {
  const problems: CodeProblem[] = [];
  let compiledJs = '';
  if (parts.script.trim()) {
    try {
      compiledJs = deps.transform(parts.script, {
        transforms: TRANSFORMS[parts.lang] || TRANSFORMS.tsx,
        production: true,
        jsxRuntime: 'classic',
        jsxPragma: 'React.createElement',
        jsxFragmentPragma: 'React.Fragment',
        disableESTransforms: true,
        filePath: `layer.${parts.lang}`,
      }).code;
      compiledJs = inlineSafeJs(compiledJs);
    } catch (err) {
      const message = String((err as Error)?.message || err);
      problems.push({ where: 'script', line: errorLine(message), message: message.replace(/\s*\(\d+:\d+\)\s*$/, ''), level: 'error' });
    }
    if (parts.lang !== 'js' && !/\bexport\s+default\b|module\.exports/.test(parts.script)) {
      problems.push({ where: 'script', line: 1, message: 'export default a component — `export default function Overlay(props) { … }`', level: 'error' });
    }
  }

  let compiledCss = parts.css;
  if (parts.styleLang === 'tailwind') {
    if (!deps.tailwind) {
      problems.push({ where: 'style', line: 1, message: 'Tailwind is not available here; the CSS is used as written', level: 'warning' });
    } else {
      try {
        const candidates = classCandidates(`${parts.html}\n${parts.script}`);
        compiledCss = lowerCss(await deps.tailwind(`@import "tailwindcss";\n${parts.css}`, candidates));
      } catch (err) {
        const message = String((err as Error)?.message || err);
        problems.push({ where: 'style', line: errorLine(message), message, level: 'error' });
      }
    }
  }
  compiledCss = compiledCss.replace(/<\/(style)/gi, '<\\/$1');
  return { compiledJs, compiledCss, problems };
}
