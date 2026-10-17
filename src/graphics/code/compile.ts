// The editor's way to compile a code layer. The compiler (sucrase + Tailwind
// v4, ~460 KB) is a separate script, /code-sdk/v1/compiler.js, loaded the
// first time a code layer is opened — never by an overlay page.

import { COMPILER_PATH } from './protocol.ts';
import { parseSsx, type SsxParts } from './ssx.ts';
import { COMPILER_VERSION, type CodeProblem, type CompiledCode } from './compileCore.ts';
import type { CodeLayer } from '../schema/layoutTypes.ts';
import { checkImports } from './imports.ts';
import { tagLine } from './diagnose.ts';

export interface CompilerApi {
  version: number;
  compile(parts: SsxParts): Promise<CompiledCode>;
}

let api: CompilerApi | null = null;
let loading: Promise<CompilerApi> | null = null;

/** Tests hand a compiler over directly (compileParts with sucrase). */
export function setCompiler(next: CompilerApi | null): void {
  api = next;
  loading = null;
}

export function loadCompiler(): Promise<CompilerApi> {
  if (api) return Promise.resolve(api);
  if (loading) return loading;
  loading = new Promise<CompilerApi>((resolve, reject) => {
    const w = window as any;
    if (w.ScoreSyncCodeCompiler) { api = w.ScoreSyncCodeCompiler; resolve(api!); return; }
    const s = document.createElement('script');
    s.src = `${process.env.PUBLIC_URL || ''}${COMPILER_PATH}`;
    s.async = true;
    s.onload = () => {
      if (w.ScoreSyncCodeCompiler) { api = w.ScoreSyncCodeCompiler; resolve(api!); }
      else reject(new Error('the code compiler did not start'));
    };
    s.onerror = () => reject(new Error(`could not load ${COMPILER_PATH}`));
    document.head.appendChild(s);
  }).catch((err) => { loading = null; throw err; });
  return loading;
}

export interface SsxResult {
  parts: SsxParts;
  problems: CodeProblem[];
  layer: CodeLayer | null;
}

/** Parse + compile one .ssx file. `layer` is null while there is an error. */
export async function compileSsx(source: string): Promise<SsxResult> {
  const { parts, problems: parseProblems } = parseSsx(source);
  const problems: CodeProblem[] = parseProblems.map((p) => ({ where: 'file', line: p.line, message: p.message, level: 'error' }));
  if (problems.length) return { parts, problems, layer: null };
  // Imports first: one the sandbox cannot provide would only fail once the layer runs.
  // App-file imports the sandbox does have are pointed at 'scoresync' (same lines).
  const imports = checkImports(parts.script);
  let out: CompiledCode;
  try {
    out = await (await loadCompiler()).compile({ ...parts, script: imports.script });
  } catch (err) {
    return { parts, problems: [{ where: 'file', line: 1, message: String((err as Error)?.message || err), level: 'error' }], layer: null };
  }
  // Script / style lines are counted inside their block: report them as lines of the file.
  const offset = { script: tagLine(source, 'script'), style: tagLine(source, 'style') } as Record<string, number>;
  problems.push(...[...imports.problems, ...out.problems].map((p) => (offset[p.where] ? { ...p, line: p.line + offset[p.where] } : p)));
  problems.sort((a, b) => a.line - b.line);
  const layer: CodeLayer | null = problems.some((p) => p.level === 'error') ? null : {
    source,
    lang: parts.lang,
    styleLang: parts.styleLang,
    ...(parts.html.trim() ? { html: parts.html } : {}),
    ...(out.compiledJs ? { compiledJs: out.compiledJs } : {}),
    ...(out.compiledCss.trim() ? { compiledCss: out.compiledCss } : {}),
    compilerVersion: COMPILER_VERSION,
  };
  return { parts, problems, layer };
}
