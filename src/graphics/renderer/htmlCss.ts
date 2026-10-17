// HTML + CSS layers (element type `css`).
//
// The designer writes ordinary markup and a stylesheet. Nothing of it runs:
//   • the HTML is parsed into an inert <template> and rebuilt from an allow-list
//     of tags and attributes (no scripts, no on…= handlers, no forms, no frames,
//     only https / relative / asset / data:image URLs);
//   • the CSS goes into the layer's own shadow root, so it styles that layer
//     only, and `contain: strict` keeps even position:fixed inside the box;
//   • `{{path}}` and `{{path|format}}` in text and attributes are filled from
//     live data, the same paths and formatters the rest of the Designer uses.
//
// The shared schema (layoutSchema.js) refuses the obvious attacks on save and
// publish; this file is the real gate and runs on every draw.

import { assetUrl } from './assets.ts';
import { hasTokens } from '../bindings/tokens.ts';

export interface HtmlCssProblem { where: 'html' | 'css'; line: number; message: string; level: 'error' | 'warning' }

const ALLOWED_TAGS = new Set([
  'div', 'span', 'p', 'b', 'i', 'u', 's', 'em', 'strong', 'small', 'sub', 'sup', 'mark', 'br', 'hr', 'wbr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'img', 'picture', 'label', 'time', 'abbr', 'a',
  // inline SVG drawing
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs',
  'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'use', 'symbol', 'title', 'desc',
]);
/** Removed together with everything inside them (their text would only be noise). */
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript', 'template', 'textarea', 'select', 'portal', 'head', 'title']);
const ALLOWED_ATTRS = new Set([
  'class', 'id', 'style', 'title', 'alt', 'src', 'srcset', 'width', 'height', 'dir', 'lang', 'role', 'colspan', 'rowspan', 'datetime',
  // svg
  'viewbox', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'fill', 'stroke', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'fill-opacity', 'stroke-opacity',
  'fill-rule', 'clip-rule', 'transform', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform',
  'preserveaspectratio', 'clip-path', 'mask', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'dominant-baseline',
  'href', 'xlink:href', 'xmlns', 'xmlns:xlink', 'patternunits', 'maskunits', 'clippathunits',
]);
const URL_ATTRS = new Set(['src', 'href', 'xlink:href']);

/** https, /relative, an uploaded asset, an in-document #ref (svg), or a data: picture. */
export function isSafeLayerUrl(raw: string): boolean {
  const url = raw.trim();
  if (!url) return true;
  if (/^#[\w-]+$/.test(url)) return true;
  if (/^asset:[a-f0-9]{24}$/.test(url)) return true;
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(url)) return true;
  if (/[\u0000-\u001f"'<>\\]/.test(url)) return false;
  if (url.startsWith('/')) return !url.startsWith('//');
  return /^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/|$|\?|#)/.test(url);
}

const BAD_CSS = /expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|behavior\s*:|@import\b|<\s*\/?\s*style/i;

/** A stylesheet that only ever reaches the layer. url() keeps safe targets only. */
export function sanitizeCss(css: string, assetBase?: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/<\s*\/?\s*style[^>]*>/gi, '')
    .replace(/expression\s*\(|-moz-binding|behavior\s*:/gi, '/*removed*/(')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_m, _q, u: string) => (!isSafeLayerUrl(u) ? 'none' : u.trim().startsWith('#') ? `url(${u.trim()})` : `url("${assetUrl(u.trim(), assetBase)}")`));
}

function cleanStyleAttr(v: string, assetBase?: string): string | null {
  if (BAD_CSS.test(v)) return null;
  return sanitizeCss(v, assetBase);
}

function cleanNode(node: Node, doc: Document, assetBase?: string): Node | null {
  if (node.nodeType === 3) return doc.createTextNode(node.nodeValue || '');
  if (node.nodeType !== 1) return null; // comments, processing instructions
  const src = node as Element;
  const tag = src.localName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) return null;
  const kids = () => Array.from(src.childNodes).map((c) => cleanNode(c, doc, assetBase)).filter(Boolean) as Node[];
  if (!ALLOWED_TAGS.has(tag)) {
    // Unknown wrapper (font, center, custom-element…): keep what is inside it.
    const frag = doc.createDocumentFragment();
    kids().forEach((k) => frag.appendChild(k));
    return frag;
  }
  const isSvg = src.namespaceURI === 'http://www.w3.org/2000/svg';
  const out = isSvg ? doc.createElementNS('http://www.w3.org/2000/svg', src.localName) : doc.createElement(tag);
  for (const a of Array.from(src.attributes)) {
    const name = a.name.toLowerCase();
    if (name.startsWith('on')) continue;
    const isData = /^data-[\w-]+$/.test(name) || /^aria-[\w-]+$/.test(name);
    if (!isData && !ALLOWED_ATTRS.has(name)) continue;
    let value = a.value;
    if (URL_ATTRS.has(name)) {
      if (tag === 'a') continue; // nothing to click in an overlay
      if (hasTokens(value)) {
        // {{data}}: filled and checked again on every draw (CssLayerEl).
        if (!/^\s*\{\{[^{}]+\}\}\s*$/.test(value) && !isSafeLayerUrl(value.replace(/\{\{[^{}]+\}\}/g, 'x'))) continue;
      } else {
        if (!isSafeLayerUrl(value)) continue;
        if (!value.trim().startsWith('#')) value = assetUrl(value.trim(), assetBase);
      }
    }
    if (name === 'srcset') {
      const parts = value.split(',').map((p) => p.trim()).filter((p) => isSafeLayerUrl(p.split(/\s+/)[0] || ''));
      if (!parts.length) continue;
      value = parts.join(', ');
    }
    if (name === 'style') {
      const v = cleanStyleAttr(value, assetBase);
      if (v == null) continue;
      value = v;
    }
    try { out.setAttribute(a.name, value); } catch { /* invalid attribute name */ }
  }
  if (tag === 'img') { out.setAttribute('draggable', 'false'); out.setAttribute('decoding', 'async'); }
  kids().forEach((k) => out.appendChild(k));
  return out;
}

/** The markup, rebuilt from the allow-list, as a fragment owned by `doc`. */
export function sanitizeHtmlToFragment(html: string, doc: Document, assetBase?: string): DocumentFragment {
  const tpl = doc.createElement('template');
  tpl.innerHTML = html; // inert: nothing in a <template> loads or runs
  const frag = doc.createDocumentFragment();
  Array.from(tpl.content.childNodes).forEach((n) => { const c = cleanNode(n, doc, assetBase); if (c) frag.appendChild(c); });
  return frag;
}

/** Sanitised markup as a string (tests, export). */
export function sanitizeHtml(html: string, doc: Document = document, assetBase?: string): string {
  const box = doc.createElement('div');
  box.appendChild(sanitizeHtmlToFragment(html, doc, assetBase));
  return box.innerHTML;
}

// ── {{data}} tokens (bindings/tokens.ts, shared with the code-layer runtime) ──
export { hasTokens, fillTokens, tokenPaths } from '../bindings/tokens.ts';

// ── checks for the import dialog ────────────────────────────────────────────
const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;

/**
 * What the designer should know before the layer is created. Errors are what
 * the server would refuse; warnings are things the renderer quietly removes.
 */
export function checkHtmlCss(html: string, css: string): HtmlCssProblem[] {
  const out: HtmlCssProblem[] = [];
  const scan = (where: 'html' | 'css', text: string, re: RegExp, message: string, level: 'error' | 'warning' = 'error') => {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = g.exec(text)) && n++ < 20) {
      out.push({ where, line: lineAt(text, m.index), message: typeof message === 'string' ? message.replace('$1', m[1] || m[0]) : message, level });
      if (m[0] === '') g.lastIndex++;
    }
  };
  scan('html', html, /<\s*\/?\s*(script|iframe|frame|frameset|object|embed|applet|base|meta|link|form|input|button|textarea|select|portal)\b/i, '<$1> is not allowed in a layer');
  scan('html', html, /[\s"'/](on[a-z]+)\s*=/i, '$1= (event handlers / scripts) is not allowed');
  scan('html', html, /javascript\s*:|vbscript\s*:|data\s*:\s*text\/html/i, 'Script URLs are not allowed');
  scan('html', html, /<\s*style\b/i, 'Put styles in the CSS box, not in a <style> tag', 'error');
  scan('html', html, /expression\s*\(|-moz-binding|behavior\s*:/i, 'CSS expressions are not allowed');
  scan('html', html, /@import\b/i, '@import is not allowed');
  scan('html', html, /<\s*a\b/i, 'Links are kept as text; nothing can be clicked in an overlay', 'warning');
  scan('html', html, /\b(src|href)\s*=\s*["']?\s*http:\/\//i, 'http:// pictures are removed — use https:// or upload the picture', 'warning');
  scan('css', css, /@import\b/i, '@import is not allowed — upload fonts in the Font picker instead');
  scan('css', css, /<\s*\/?\s*[a-z]/i, 'CSS must not contain markup');
  scan('css', css, /expression\s*\(|-moz-binding|behavior\s*:/i, 'CSS expressions are not allowed');
  scan('css', css, /javascript\s*:|vbscript\s*:/i, 'Script URLs are not allowed');
  scan('css', css, /url\(\s*['"]?\s*http:\/\//i, 'http:// URLs are removed — use https://', 'warning');
  // Brace balance is the most common paste mistake.
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth < 0) { out.push({ where: 'css', line: lineAt(css, i), message: 'Extra “}”', level: 'error' }); depth = 0; } }
  }
  if (depth > 0) out.push({ where: 'css', line: css.split('\n').length, message: `${depth} “{” never closed`, level: 'error' });
  if (/\bposition\s*:\s*fixed\b/i.test(css)) out.push({ where: 'css', line: lineAt(css, css.search(/\bposition\s*:\s*fixed\b/i)), message: 'position: fixed is relative to the layer box, not the screen', level: 'warning' });
  return out;
}

/** The base sheet every css layer starts from: the layer box is the page. */
export const LAYER_BASE_CSS = `:host{all:initial;display:block;position:absolute;inset:0;overflow:hidden;contain:strict;font-family:inherit;color:#fff;-webkit-font-smoothing:antialiased}
*,*::before,*::after{box-sizing:border-box}
.ss-root{position:absolute;inset:0;}
img,svg{max-width:none}`;

/** Split pasted text into its HTML and its <style> blocks (people paste whole files). */
export function splitPastedDocument(text: string): { html: string; css: string } {
  const styles: string[] = [];
  let html = text.replace(/<\s*style[^>]*>([\s\S]*?)<\s*\/\s*style\s*>/gi, (_m, body: string) => { styles.push(body.trim()); return ''; });
  const body = /<\s*body[^>]*>([\s\S]*?)<\s*\/\s*body\s*>/i.exec(html);
  if (body) html = body[1];
  html = html.replace(/<!doctype[^>]*>/gi, '').replace(/<\s*\/?\s*(html|head|body)[^>]*>/gi, '').replace(/<\s*(meta|title|link)[^>]*>(?:[\s\S]*?<\s*\/\s*title\s*>)?/gi, '');
  return { html: html.trim(), css: styles.join('\n\n') };
}
