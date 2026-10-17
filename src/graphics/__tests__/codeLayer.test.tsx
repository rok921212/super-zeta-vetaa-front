import React from 'react';
import { render } from '@testing-library/react';
import { transform } from 'sucrase';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { createEmptyLayout, extractAssetIds, validateLayout } from '../schema/layoutSchema.js';
import { classCandidates, parseSsx, serializeSsx, ssxFromFile } from '../code/ssx.ts';
import { compileParts, lowerCss, oklchToRgb } from '../code/compileCore.ts';
import { compileSsx, setCompiler } from '../code/compile.ts';
import { FRAME_CSP, FRAME_SANDBOX, buildSrcdoc, rewriteAssets } from '../code/srcdoc.ts';
import { codeProps, diffProps } from '../code/protocol.ts';
import { setCodeRuntime } from '../code/CodeLayerEl.tsx';
import { CODE_SAMPLES } from '../code/samples.ts';
import { ssxFromCssLayer } from '../editor/CodeLayerPanel.tsx';

// A plain function: CRA's jest resets jest.fn implementations between tests.
const twCalls: Array<[string, string[]]> = [];
const tailwindStub = async (css: string, candidates: string[]) => {
  twCalls.push([css, candidates]);
  return `/*tw ${candidates.length}*/ .x{color:oklch(100% 0 0)}\n${css.replace('@import "tailwindcss";', '')}`;
};
const deps = { transform: transform as any, tailwind: tailwindStub };

const ASSET = '0123456789abcdef01234567';

describe('code layer: .ssx files', () => {
  it('splits overlay, template, style and script', () => {
    const { parts, problems } = parseSsx(`<!-- scoresync-component v1 -->
<overlay name="Board" width="1280" height="720" />
<template>
  <div class="a">{{match.matchNo}}</div>
</template>
<style lang="css">
  .a { color: red; }
</style>
<script lang="js">
  const s = "</template> and <style> inside a string";
  ss.on('data', () => {});
</script>`);
    expect(problems).toEqual([]);
    expect(parts).toMatchObject({ name: 'Board', width: 1280, height: 720, lang: 'js', styleLang: 'css' });
    expect(parts.html).toBe('<div class="a">{{match.matchNo}}</div>');
    expect(parts.css).toBe('.a { color: red; }');
    expect(parts.script).toContain('</template> and <style> inside a string');
  });

  it('defaults: components get Tailwind, plain JS gets CSS as written', () => {
    expect(parseSsx('<script lang="tsx">export default () => null</script>').parts.styleLang).toBe('tailwind');
    expect(parseSsx('<template><b>x</b></template><script lang="js">1</script>').parts.styleLang).toBe('css');
    expect(parseSsx('<script lang="tsx">export default () => null</script><style lang="css">a{}</style>').parts.styleLang).toBe('css');
  });

  it('takes an untagged file as a bare tsx script, and reports what is missing', () => {
    const bare = parseSsx('export default function A() { return <div/>; }');
    expect(bare.parts.script).toContain('export default');
    expect(bare.parts.lang).toBe('tsx');
    expect(parseSsx('<style>a{}</style>').problems[0].message).toContain('add a <script>');
    expect(parseSsx('<script lang="python">x</script>').problems[0].message).toContain('unknown script lang');
    expect(parseSsx('<script lang="tsx">x').problems[0].message).toContain('never closed');
  });

  it('round-trips through serializeSsx', () => {
    const parts = { name: 'R', width: 800, height: 200, html: '<b>{{x}}</b>', css: '.b{color:red}', styleLang: 'css' as const, script: "ss.on('data', () => {});", lang: 'js' as const };
    expect(parseSsx(serializeSsx(parts)).parts).toEqual(parts);
  });

  it('opens .tsx and .html files as .ssx', () => {
    expect(parseSsx(ssxFromFile('Board.tsx', 'export default () => <div/>').source).parts).toMatchObject({ name: 'Board', lang: 'tsx', styleLang: 'tailwind' });
    const page = ssxFromFile('card.html', '<!doctype html><html><head><title>t</title><style>.a{color:red}</style><script src="https://cdn/x.js"></script></head><body><div class="a">hi</div><script>ss.on("data", () => {})</script></body></html>');
    const { parts } = parseSsx(page.source);
    expect(parts).toMatchObject({ lang: 'js', styleLang: 'css', html: '<div class="a">hi</div>', css: '.a{color:red}' });
    expect(parts.script).toContain('ss.on("data"');
    expect(page.notes.join(' ')).toContain('<script src=');
  });

  it('turns an HTML + CSS layer into a code layer with the same markup', () => {
    const { parts } = parseSsx(ssxFromCssLayer({ name: 'Card', w: 600, h: 120, css: { html: '<div>{{a}}</div>', css: '.x{}' } }));
    expect(parts).toMatchObject({ name: 'Card', width: 600, height: 120, html: '<div>{{a}}</div>', css: '.x{}', lang: 'js' });
  });

  it('collects Tailwind class candidates, arbitrary values included', () => {
    const c = classCandidates('<div className="absolute w-[1400px] grid-cols-[1fr,2fr] bg-black/70">');
    expect(c).toEqual(expect.arrayContaining(['absolute', 'w-[1400px]', 'grid-cols-[1fr,2fr]', 'bg-black/70']));
  });
});

describe('code layer: compiling', () => {
  it('compiles TSX to plain JS with require() imports and React.createElement', async () => {
    const { parts } = parseSsx(`<script lang="tsx">
import { motion } from 'framer-motion';
type P = { n: number };
export default function A({ n }: P) { return <motion.div className="w-[10px]">{n}</motion.div>; }
</script>`);
    const out = await compileParts(parts, deps);
    expect(out.problems).toEqual([]);
    expect(out.compiledJs).toContain("require('framer-motion')");
    expect(out.compiledJs).toContain('React.createElement');
    expect(out.compiledJs).not.toContain(': P');
    const [twCss, twCandidates] = twCalls[twCalls.length - 1];
    expect(twCss).toContain('@import "tailwindcss"');
    expect(twCandidates).toEqual(expect.arrayContaining(['w-[10px]']));
    expect(out.compiledCss).toContain('rgb(255, 255, 255)'); // lowered from oklch
  });

  it('reports syntax errors with the line, and a missing default export', async () => {
    const bad = await compileParts(parseSsx('<script lang="tsx">\nexport default function A() {\n  return <div>;\n}\n</script>').parts, deps);
    expect(bad.problems[0]).toMatchObject({ where: 'script', level: 'error' });
    expect(bad.problems[0].line).toBeGreaterThanOrEqual(2);
    const noExport = await compileParts(parseSsx('<script lang="tsx">const A = 1;</script>').parts, deps);
    expect(noExport.problems.map((p) => p.message).join(' ')).toContain('export default');
    const plain = await compileParts(parseSsx("<script lang=\"js\">ss.on('data', () => {});</script>").parts, deps);
    expect(plain.problems).toEqual([]);
  });

  it('never lets compiled code close the sandbox <script> early', async () => {
    const out = await compileParts(parseSsx('<script lang="js">const s = "</script><b>";</script>').parts, deps);
    expect(out.compiledJs).not.toMatch(/<\/script/i);
  });

  it('compileSsx: line numbers are file lines, and the layer is only built when there are no errors', async () => {
    setCompiler({ version: 1, compile: (p) => compileParts(p, deps) });
    const src = '<!-- x -->\n<overlay name="A" />\n<script lang="tsx">\nexport default function A() {\n  return <div>;\n}\n</script>';
    const r = await compileSsx(src);
    expect(r.layer).toBeNull();
    expect(r.problems[0].line).toBeGreaterThan(3);
    const ok = await compileSsx('<script lang="tsx">export default () => <div className="p-2" />;</script>');
    expect(ok.layer).toMatchObject({ lang: 'tsx', styleLang: 'tailwind', compilerVersion: 1 });
    expect(ok.layer?.compiledJs).toContain('React.createElement');
    setCompiler(null);
  });

  it.each(CODE_SAMPLES.map((s) => [s.id, s]))('sample "%s" compiles cleanly', async (_id, sample) => {
    const { parts, problems } = parseSsx(sample.source);
    expect(problems).toEqual([]);
    const out = await compileParts(parts, deps);
    expect(out.problems).toEqual([]);
  });
});

describe('code layer: CSS lowering for older OBS browsers', () => {
  it('converts oklch to rgb', () => {
    expect(oklchToRgb(1, 0, 0)).toEqual([255, 255, 255]);
    expect(oklchToRgb(0, 0, 0)).toEqual([0, 0, 0]);
    const [r, g, b] = oklchToRgb(0.637, 0.237, 25.331); // Tailwind red-500 ≈ #fb2c36
    expect(r).toBeGreaterThan(240); expect(g).toBeLessThan(60); expect(b).toBeLessThan(70);
  });

  it('rewrites color-mix fallbacks and drops modern-only @supports branches', () => {
    const out = lowerCss('.a{background-color:color-mix(in srgb, oklch(0% 0 0) 50%, transparent);@supports (color: color-mix(in lab, red, red)){background-color:color-mix(in oklab, var(--c) 50%, transparent);}}\n.b{color:color-mix(in srgb, #fff 25%, transparent)}');
    expect(out).toContain('background-color:rgb(0 0 0 / 0.5)');
    expect(out).toContain('color:rgb(255 255 255 / 0.25)');
    expect(out).not.toContain('@supports');
    expect(out).not.toContain('oklab');
  });
});

describe('code layer: sandbox document', () => {
  const doc = buildSrcdoc({
    runtime: 'window.__ssBoot=function(f){};/* </script> */',
    compiledJs: 'const a = "</script>"; const img = "asset:' + ASSET + '";',
    compiledCss: '.a{background:url(asset:' + ASSET + ')} </style>',
    html: '<img src="asset:' + ASSET + '">',
    config: { assetOrigin: 'https://api.example', mode: 'runtime', lang: 'tsx' },
    assetFile: (id) => `https://api.example/f/${id}`,
  });

  it('is scripts-only and cannot reach the network or the page', () => {
    expect(FRAME_SANDBOX).toBe('allow-scripts');
    expect(FRAME_SANDBOX).not.toContain('allow-same-origin');
    expect(FRAME_CSP).toContain("connect-src 'none'");
    expect(FRAME_CSP).toContain("default-src 'none'");
    expect(doc).toContain(`content="${FRAME_CSP}"`);
  });

  it('escapes closing tags and resolves asset references', () => {
    expect(doc.match(/<\/script>/g)?.length).toBe(3); // config, runtime, layer — nothing from inside them
    expect(doc.match(/<\/style>/g)?.length).toBe(2);
    expect(doc).not.toContain('asset:' + ASSET);
    expect(doc).toContain(`https://api.example/f/${ASSET}`);
    expect(rewriteAssets('url(asset:' + ASSET + ')', (id) => `/x/${id}`)).toBe(`url(/x/${ASSET})`);
  });
});

describe('code layer: data to the frame', () => {
  it('gives the built-in theme props plus the Designer extras', () => {
    const p = codeProps({ tournament: { tournamentName: 'T' }, matches: [{ _id: 'm1' }], derived: { teams: [] }, variables: { a: 1 } }, { width: 800, height: 200 });
    expect(p).toMatchObject({ tournament: { tournamentName: 'T' }, totalMatches: 1, selectedScheduleMatches: ['m1'], derived: { teams: [] }, variables: { a: 1 }, width: 800, height: 200 });
  });

  it('sends only what changed', () => {
    const scope = { matchData: { teams: [] }, matches: [{ _id: 'm1' }] };
    const a = codeProps(scope, { width: 1, height: 1 });
    const b = codeProps(scope, { width: 1, height: 1 });
    expect(diffProps(a, b)).toBeNull(); // rebuilt arrays with the same items do not count
    const c = codeProps({ ...scope, matchData: { teams: [1] } }, { width: 1, height: 1 });
    expect(Object.keys(diffProps(b, c) || {})).toEqual(['matchData']);
    expect(diffProps(null, a)).toBe(a);
  });
});

describe('code layer: schema', () => {
  const el = (code: any, extra: any = {}) => ({ id: 'k1', type: 'code', x: 0, y: 0, w: 400, h: 100, code, ...extra });
  const validate = (e: any) => validateLayout({ ...createEmptyLayout(), elements: [e] } as any);

  it('accepts a compiled layer (scripts are fine here: they only run sandboxed)', () => {
    expect(validate(el({ source: '<script lang="js">x()</script>', lang: 'js', styleLang: 'css', compiledJs: 'x()', compiledCss: '', html: '<b onclick="x">', compilerVersion: 1 })).ok).toBe(true);
  });

  it('refuses bad shapes, unknown fields and code on other layers', () => {
    expect(validate(el({ source: 'x', lang: 'python' })).ok).toBe(false);
    expect(validate(el({ source: 'x', lang: 'js', extra: 1 })).ok).toBe(false);
    expect(validate(el({ source: 'x'.repeat(120001), lang: 'js' })).ok).toBe(false);
    expect(validate(el(null)).ok).toBe(false);
    expect(validate({ id: 'r', type: 'rect', x: 0, y: 0, w: 1, h: 1, code: { source: 'x', lang: 'js' } }).ok).toBe(false);
  });

  it('counts images named anywhere in the file as used assets', () => {
    const doc = { ...createEmptyLayout(), elements: [el({ source: `const logo = "asset:${ASSET}"`, lang: 'js' })] };
    expect(extractAssetIds(doc)).toEqual([ASSET]);
  });
});

describe('code layer: renderer', () => {
  afterEach(() => setCodeRuntime(null));
  const layout = (code: any) => ({ ...createEmptyLayout(), elements: [{ id: 'k1', type: 'code', name: 'Board', x: 0, y: 0, w: 400, h: 100, code }] }) as any;

  it('draws the compiled code in a sandboxed iframe', () => {
    setCodeRuntime('/*runtime*/');
    const { container } = render(<LayoutRenderer layout={layout({ source: 's', lang: 'js', compiledJs: 'window.__ran = 1;', compiledCss: '.q{}' })} state={null} events={null} mode="runtime" />);
    const frame = container.querySelector('iframe') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    const doc = frame.getAttribute('srcdoc') || '';
    expect(doc).toContain('/*runtime*/');
    expect(doc).toContain('window.__ran = 1;');
    expect(doc).toContain('.q{}');
  });

  it('shows "not compiled" in the editor only', () => {
    setCodeRuntime('/*runtime*/');
    const editor = render(<LayoutRenderer layout={layout({ source: 's', lang: 'tsx' })} state={null} events={null} mode="editor" />);
    expect(editor.container.querySelector('[data-testid="code-layer-error"]')?.textContent).toContain('Not compiled');
    const live = render(<LayoutRenderer layout={layout({ source: 's', lang: 'tsx' })} state={null} events={null} mode="runtime" />);
    expect(live.container.querySelector('[data-testid="code-layer-error"]')).toBeNull();
  });
});

describe('code layer: guidance (imports, run-time errors, snippets, status)', () => {
  const { checkImports, ensureImports, SCORESYNC_NAMES } = require('../code/imports.ts');
  const { errorLine, errorHint, tagLine } = require('../code/diagnose.ts');
  const { CODE_SNIPPETS, insertSnippet } = require('../code/snippets.ts');
  const { setCodeStatus, getCodeStatus, describeStatus } = require('../code/layerStatus.ts');

  test('scoresync offers exactly the names the import check knows', () => {
    const api = require('../code/scoresyncApi.ts');
    expect(Object.keys(api).sort()).toEqual([...SCORESYNC_NAMES].sort());
  });

  test('theme-file imports are pointed at scoresync on the same line', () => {
    const script = "import React from 'react';\nimport TeamLogo from '../../shared/components/TeamLogo';\nimport { useSortedTeams } from '../../shared/hooks/unsortteams';\n";
    const r = checkImports(script);
    expect(r.problems.filter((p: any) => p.level === 'error')).toEqual([]);
    expect(r.script.split('\n')).toHaveLength(script.split('\n').length);
    expect(r.script).toContain("import { TeamLogo } from 'scoresync'");
    expect(r.script).toContain("import { useSortedTeams } from 'scoresync'");
  });

  test('imports the sandbox cannot provide are errors on their line, with advice', () => {
    const r = checkImports("import React from 'react';\nimport { FaSkull } from 'react-icons/fa';\nimport './x.css';\nimport { useSortedTeam } from 'scoresync';\n");
    const byLine = Object.fromEntries(r.problems.map((p: any) => [p.line, p]));
    expect(byLine[2].message).toMatch(/react-icons/);
    expect(byLine[2].hint).toMatch(/svg/);
    expect(byLine[3].message).toMatch(/stylesheet/);
    expect(byLine[4].message).toMatch(/Did you mean “useSortedTeams”/);
  });

  test('ensureImports merges into an existing import or adds one under <script>', () => {
    const src = "<script lang=\"tsx\">\nimport { format } from 'scoresync';\nexport default () => null;\n</script>";
    expect(ensureImports(src, 'scoresync', ['format', 'isPlayerDead'])).toContain("import { format, isPlayerDead } from 'scoresync'");
    const bare = '<script lang="tsx">\nexport default () => null;\n</script>';
    expect(ensureImports(bare, 'framer-motion', ['motion'])).toMatch(/<script lang="tsx">\nimport \{ motion \} from 'framer-motion';/);
  });

  test('a run-time stack maps back to the .ssx line, and common errors get a hint', () => {
    const source = '<overlay name="x"/>\n<template></template>\n<script lang="tsx">\nconst a = 1;\nexport default () => a.b.c;\n</script>';
    expect(tagLine(source, 'script')).toBe(3);
    // Wrapper adds one line: script line 2 is reported as 3.
    expect(errorLine('TypeError: x\n    at Comp (ss-layer.tsx:3:20)', source)).toBe(5);
    expect(errorLine('no frames here', source)).toBeNull();
    expect(errorHint("Cannot read properties of undefined (reading 'teams')")).toMatch(/\?\./);
    expect(errorHint('x.map is not a function')).toMatch(/\?\? \[\]/);
    expect(errorHint('something unusual')).toBeUndefined();
  });

  test('snippets go above export default with their dependencies and imports, once', () => {
    const src = CODE_SAMPLES.find((s: any) => /lang="tsx"/.test(s.source))!.source;
    const withDeps = CODE_SNIPPETS.find((s: any) => s.id === 'team-rows') ? 'team-rows' : CODE_SNIPPETS[0].id;
    const r = insertSnippet(src, withDeps);
    expect(r.error).toBeUndefined();
    expect(r.added.length).toBeGreaterThan(0);
    expect(r.source.indexOf('function ')).toBeLessThan(r.source.search(/^\s*export\s+default/m));
    expect(r.source).toMatch(/from 'scoresync'/);
    expect(checkImports(parseSsx(r.source).parts.script).problems.filter((p: any) => p.level === 'error')).toEqual([]);
    expect(insertSnippet(r.source, withDeps).added).toEqual([]);
    if (withDeps === 'team-rows') expect(r.added).toContain(CODE_SNIPPETS.find((s: any) => s.id === 'alive-bars').name);
  });

  test('snippets refuse plain js and jsx scripts with a clear reason', () => {
    expect(insertSnippet('<script lang="js">\n</script>', 'alive-bars').error).toMatch(/plain js/);
    expect(insertSnippet('<script lang="jsx">\nexport default () => null;\n</script>', 'alive-bars').error).toMatch(/lang="tsx"/);
    expect(insertSnippet('<template></template>', 'alive-bars').error).toMatch(/<script/);
  });

  test('every snippet compiles as TSX', () => {
    for (const s of CODE_SNIPPETS) expect(() => transform(s.code, { transforms: ['typescript', 'jsx'] })).not.toThrow();
  });

  test('status store keeps one status per layer and describes it', () => {
    setCodeStatus('l1', { state: 'running', drawn: 3 });
    expect(describeStatus(getCodeStatus('l1'))).toBe('Running · draws 3 elements');
    setCodeStatus('l1', { state: 'error', message: 'boom', line: 7 });
    expect(describeStatus(getCodeStatus('l1'))).toBe('Line 7: boom');
    setCodeStatus('l1', null);
    expect(getCodeStatus('l1')).toBeNull();
  });
});
