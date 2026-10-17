// The ScoreSync component file (.ssx): one file holding a code layer's markup,
// styles and script, each in its own top-level tag — the same idea as a Vue
// single-file component.
//
//   <!-- scoresync-component v1 -->
//   <overlay name="Overall Standings" width="1920" height="1080" />
//   <template> …optional HTML ({{tokens}} work)… </template>
//   <style lang="css|tailwind"> … </style>
//   <script lang="tsx|jsx|js"> … </script>
//
// Parsing is purely textual (no DOM), so it runs the same in the editor, in
// jest and on the backend's package import.

export type CodeLang = 'tsx' | 'jsx' | 'js';
export type StyleLang = 'css' | 'tailwind';

export interface SsxParts {
  name?: string;
  width?: number;
  height?: number;
  html: string;
  css: string;
  styleLang: StyleLang;
  script: string;
  lang: CodeLang;
}

export interface SsxProblem { line: number; message: string }

export const SSX_HEADER = '<!-- scoresync-component v1 -->';
const LANGS: CodeLang[] = ['tsx', 'jsx', 'js'];

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>/]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/** Strip the common indentation of a block so the editor shows it flush left. */
function dedent(text: string): string {
  const body = text.replace(/^\s*\n/, '').replace(/\s+$/, '');
  const lines = body.split('\n');
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => (/^[ \t]*/.exec(l) as RegExpExecArray)[0].length), Infinity);
  return Number.isFinite(pad) && pad > 0 ? lines.map((l) => l.slice(pad)).join('\n') : body;
}

/** Find one top-level block `<tag …>…</tag>` (the LAST closing tag, so a script may mention `</template>` in a string). */
function block(text: string, tag: string, problems: SsxProblem[]): { attrs: string; body: string } | null {
  const open = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi');
  const first = open.exec(text);
  if (!first) return null;
  if (open.exec(text) && tag !== 'template') problems.push({ line: lineAt(text, open.lastIndex), message: `only one <${tag}> block is allowed; the first one is used` });
  const start = first.index + first[0].length;
  const close = text.toLowerCase().lastIndexOf(`</${tag}>`);
  if (close < start) {
    problems.push({ line: lineAt(text, first.index), message: `<${tag}> is never closed` });
    return { attrs: first[1] || '', body: text.slice(start) };
  }
  return { attrs: first[1] || '', body: text.slice(start, close) };
}

/** Split an .ssx file into its parts. A file with no tags at all is taken as a bare script. */
export function parseSsx(text: string): { parts: SsxParts; problems: SsxProblem[] } {
  const problems: SsxProblem[] = [];
  const src = String(text || '').replace(/\r\n?/g, '\n');
  const parts: SsxParts = { html: '', css: '', styleLang: 'css', script: '', lang: 'tsx' };

  const ov = /<overlay\b([^>]*)\/?>/i.exec(src);
  if (ov) {
    parts.name = attr(ov[1], 'name');
    const w = Number(attr(ov[1], 'width'));
    const h = Number(attr(ov[1], 'height'));
    if (Number.isFinite(w) && w > 0) parts.width = Math.min(7680, Math.round(w));
    if (Number.isFinite(h) && h > 0) parts.height = Math.min(7680, Math.round(h));
  }

  // Script first: it is the block most likely to contain other tag names in strings / JSX.
  const sc = block(src, 'script', problems);
  // Template and style are searched outside the script, so JSX like <style> inside it is not mistaken for a block.
  const outside = sc ? src.replace(sc.body, '') : src;
  const tp = block(outside, 'template', problems);
  const st = block(outside, 'style', problems);

  if (sc) {
    parts.script = dedent(sc.body);
    const lang = (attr(sc.attrs, 'lang') || attr(sc.attrs, 'type')?.replace(/^text\//, '') || 'tsx').toLowerCase();
    const known = LANGS.find((l) => l === lang) || (lang === 'javascript' ? 'js' : lang === 'typescript' || lang === 'ts' ? 'tsx' : null);
    if (!known) problems.push({ line: lineAt(src, src.indexOf(sc.attrs)), message: `unknown script lang "${lang}" (use tsx, jsx or js)` });
    parts.lang = known || 'tsx';
  }
  if (tp) parts.html = dedent(tp.body);
  // Components (tsx / jsx) get Tailwind utilities by default, like the built-in themes;
  // plain-JS layers get the CSS as written. `<style lang="…">` overrides either.
  const styleAttr = st ? attr(st.attrs, 'lang') : undefined;
  parts.styleLang = styleAttr ? (styleAttr.toLowerCase() === 'tailwind' ? 'tailwind' : 'css') : (parts.lang === 'js' ? 'css' : 'tailwind');
  if (st) parts.css = dedent(st.body);
  if (!sc && !tp && !st && src.trim()) {
    parts.script = src.trim();
  }
  if (!parts.script.trim() && !parts.html.trim()) problems.push({ line: 1, message: 'add a <script> (a component) or a <template> (plain HTML)' });
  return { parts, problems };
}

const indent = (text: string) => text.split('\n').map((l) => (l ? '  ' + l : l)).join('\n');

/** Write the parts back as one .ssx file (the format stored on the layer). */
export function serializeSsx(p: SsxParts): string {
  const out = [SSX_HEADER];
  const head = [`name="${(p.name || 'Code layer').replace(/"/g, "'")}"`];
  if (p.width) head.push(`width="${p.width}"`);
  if (p.height) head.push(`height="${p.height}"`);
  out.push(`<overlay ${head.join(' ')} />`, '');
  if (p.html.trim()) out.push('<template>', indent(p.html.trim()), '</template>', '');
  if (p.css.trim() || p.styleLang !== (p.lang === 'js' ? 'css' : 'tailwind')) out.push(`<style lang="${p.styleLang}">`, indent(p.css.trim()), '</style>', '');
  if (p.script.trim()) out.push(`<script lang="${p.lang}">`, p.script.trim(), '</script>', '');
  return out.join('\n');
}

/**
 * Any file a user opens, as .ssx text: an .ssx as it is; a .tsx / .jsx / .js
 * file as its script; an .html page as template + style + plain-JS script
 * (inline <script> blocks only — <script src> is dropped).
 */
export function ssxFromFile(fileName: string, text: string): { source: string; notes: string[] } {
  const notes: string[] = [];
  const ext = (/\.([a-z0-9]+)$/i.exec(fileName)?.[1] || '').toLowerCase();
  const name = fileName.replace(/\.[^.]*$/, '').replace(/"/g, "'") || 'Code layer';
  if (ext === 'tsx' || ext === 'jsx' || ext === 'js' || ext === 'ts') {
    return { source: serializeSsx({ name, html: '', css: '', styleLang: ext === 'js' ? 'css' : 'tailwind', script: text, lang: ext === 'ts' ? 'tsx' : ext }), notes };
  }
  if (ext === 'html' || ext === 'htm') {
    const styles: string[] = [];
    const scripts: string[] = [];
    let body = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css: string) => { styles.push(css.trim()); return ''; });
    body = body.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_m, attrs: string, js: string) => {
      if (/\bsrc\s*=/.test(attrs)) notes.push('A <script src=…> was left out: code layers cannot load outside scripts. Paste its code in instead.');
      else if (js.trim()) scripts.push(js.trim());
      return '';
    });
    const m = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(body);
    body = (m ? m[1] : body).replace(/<!doctype[^>]*>|<\/?(html|head|body)\b[^>]*>|<(meta|title|link)\b[^>]*>(?:[^<]*<\/title>)?/gi, '').trim();
    return { source: serializeSsx({ name, html: body, css: styles.join('\n\n'), styleLang: 'css', script: scripts.join('\n\n'), lang: 'js' }), notes };
  }
  return { source: text, notes };
}

/** Utility-class candidates for Tailwind: every token that could be a class name in the source. */
export function classCandidates(text: string): string[] {
  const seen = new Set<string>();
  // Split on characters that can never be inside a class name (arbitrary values keep [], (), #, %, etc.).
  for (const tok of String(text || '').split(/[\s"'`{}<>;=]+/)) {
    const t = tok.replace(/^[.:]+/, '');
    if (t && t.length <= 120 && /[a-z]/i.test(t) && !/^\d+$/.test(t)) seen.add(t);
  }
  return Array.from(seen);
}
