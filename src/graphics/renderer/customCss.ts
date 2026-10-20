// Custom CSS on any layer (el.customCss) and a layout-wide stylesheet
// (doc.stylesheet).
//
//   • A layer's CSS is a list of declarations ("border-radius: 12px; backdrop-filter: blur(6px)").
//     It may hold {{ … }} tokens filled from live data ("background: {{item.teamColor}}",
//     "color: {{ item.isFiring ? '#ff5a1f' : '#fff' }}"), and @when blocks that apply
//     only while their condition holds:  @when item.isFiring { transform: scale(1.1); }
//     Position and size stay with the editor: those properties are dropped.
//   • The stylesheet holds whole rules. Every selector is prefixed with the overlay root,
//     so it can never style anything outside the overlay. Layers are reachable as
//     [data-layer="Layer name"] (and [data-element-id="id"]).
//
// Both go through the same URL / expression filtering as HTML + CSS layers (htmlCss.ts).

import type React from 'react';
import type { BindingScope } from '../bindings/resolve.ts';
import { fillTokens, hasTokens, sanitizeCss } from './htmlCss.ts';
import { splitCustomCss } from '../schema/layoutSchema.js';
import { evaluateExpression, expressionProblem, isTruthy } from '../bindings/expr.ts';
import { tokenProblems } from '../bindings/tokens.ts';

/** Placement belongs to the editor (x / y / w / h / rotation): never taken from custom CSS. */
const BLOCKED_PROPS = new Set([
  'position', 'left', 'top', 'right', 'bottom', 'inset', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'inset-block', 'inset-inline', 'z-index',
  // old IE / Gecko ways to run code from CSS
  'behavior', '-moz-binding',
]);
const BAD_VALUE = /expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|behavior\s*:|@import|[<>{}]/i;

const camel = (prop: string) => (prop.startsWith('--') ? prop : prop.replace(/^-ms-/, 'ms-').replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()));

export interface CssProblem { line: number; message: string }

/** Split declarations on `;` outside of brackets and quotes (data: URLs and rgba() hold `;` / `,`). */
function splitDeclarations(css: string): Array<{ text: string; line: number; start: number }> {
  const out: Array<{ text: string; line: number; start: number }> = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  const lineAt = (i: number) => css.slice(0, i).split('\n').length;
  for (let i = 0; i <= css.length; i++) {
    const ch = css[i];
    if (quote) { if (ch === quote && css[i - 1] !== '\\') quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if ((ch === ';' && depth === 0) || i === css.length) {
      const raw = css.slice(start, i);
      const text = raw.trim();
      const lead = raw.search(/\S/);
      if (text) out.push({ text, line: lineAt(start + lead), start: start + lead });
      start = i + 1;
    }
  }
  return out;
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
// {{ … }} tokens hold quotes, < > and braces: same-length stand-ins while checking.
const maskTokens = (css: string) => css.replace(/\{\{[\s\S]*?\}\}/g, (m) => m.replace(/[^\n]/g, 'x'));

/** Declarations -> React style. Unknown-looking or unsafe declarations are skipped (see cssProblems). */
export function parseDeclarations(css: string | undefined, assetBase?: string): React.CSSProperties {
  const out: Record<string, string> = {};
  if (!css) return out;
  for (const { text } of splitDeclarations(stripComments(css))) {
    const colon = text.indexOf(':');
    if (colon <= 0) continue;
    const prop = text.slice(0, colon).trim().toLowerCase();
    let value = text.slice(colon + 1).trim();
    if (!/^(--[\w-]+|-?[a-z][a-z-]*)$/.test(prop) || BLOCKED_PROPS.has(prop) || !value || BAD_VALUE.test(value)) continue;
    value = value.replace(/\s*!important\s*$/i, '');
    out[camel(prop)] = sanitizeCss(value, assetBase);
  }
  return out as React.CSSProperties;
}

const BARE_TOKEN_HINT = "Data goes inside a value, e.g. color: {{ item.isFiring ? '#ff5a1f' : '#fff' }}; — or wrap declarations in @when item.isFiring { … }";

function declarationLineProblems(part: string, out: CssProblem[]): void {
  const masked = maskTokens(stripComments(part));
  for (const { text, line, start } of splitDeclarations(masked)) {
    const colon = text.indexOf(':');
    if (colon <= 0) {
      const original = part.slice(start, start + text.length).trim();
      out.push({ line, message: original.startsWith('{{') ? BARE_TOKEN_HINT : `“${original.slice(0, 40)}” is not property: value` });
      continue;
    }
    const prop = text.slice(0, colon).trim().toLowerCase();
    const value = text.slice(colon + 1).trim();
    if (!/^(--[\w-]+|-?[a-z][a-z-]*)$/.test(prop)) out.push({ line, message: `“${prop}” is not a CSS property` });
    else if (BLOCKED_PROPS.has(prop)) out.push({ line, message: `${prop} is ignored — position and size come from the canvas` });
    else if (!value) out.push({ line, message: `${prop} has no value` });
    else if (BAD_VALUE.test(value)) out.push({ line, message: `${prop}: this value is not allowed` });
  }
}

/** What the CSS box in the Inspector reports, line by line. */
export function declarationProblems(css: string | undefined): CssProblem[] {
  const out: CssProblem[] = [];
  if (!css) return out;
  const parts = splitCustomCss(css);
  if (parts.error) return [{ line: parts.line || 1, message: parts.error }];
  declarationLineProblems(parts.base, out);
  for (const block of parts.blocks) {
    const p = expressionProblem(block.when);
    if (p) out.push({ line: block.line, message: `@when: ${p.message}` });
    declarationLineProblems(block.body, out);
  }
  for (const p of tokenProblems(css)) {
    const token = p.token.length > 30 ? `${p.token.slice(0, 28)}…}}` : p.token;
    out.push({ line: p.line, message: `${token}: ${p.message}` });
  }
  return out.sort((a, b) => a.line - b.line);
}

/** A layer's CSS with live data filled in, as React style (memo-friendly: same text, same object). */
const cache = new Map<string, React.CSSProperties>();
const splitCache = new Map<string, ReturnType<typeof splitCustomCss>>();
export function layerCss(css: string | undefined, scope: BindingScope, assetBase?: string): React.CSSProperties | null {
  if (!css || !css.trim()) return null;
  let parts = splitCache.get(css);
  if (!parts) {
    parts = splitCustomCss(css);
    if (splitCache.size > 500) splitCache.clear();
    splitCache.set(css, parts);
  }
  // Base declarations, then every @when block that holds right now (a later one wins).
  let text: string = parts.error ? css : parts.base;
  if (!parts.error) {
    for (const block of parts.blocks) {
      if (isTruthy(evaluateExpression(block.when, scope))) text += `;\n${block.body}`;
    }
  }
  if (hasTokens(text)) text = fillTokens(text, scope);
  const key = `${assetBase || ''}\u0000${text}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = parseDeclarations(text, assetBase);
    if (cache.size > 500) cache.clear();
    cache.set(key, hit);
  }
  return hit;
}

// ── layout stylesheet ───────────────────────────────────────────────────────

/** Find the `}` that closes the block opened at `open` (quotes and comments already blanked). */
function closeOf(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return css.length;
}

const ROOT_SELECTORS = /^(:root|html|body|:host)$/i;

function prefixSelectors(selectors: string, root: string): string {
  return selectors.split(',').map((sel) => {
    const s = sel.trim();
    if (!s) return '';
    if (ROOT_SELECTORS.test(s)) return root;
    return `${root} ${s.replace(/^(:root|html|body)\s+/i, '')}`;
  }).filter(Boolean).join(', ');
}

function scopeBlock(css: string, root: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    const close = closeOf(css, open);
    const body = css.slice(open + 1, close);
    if (/^@(-webkit-)?keyframes\b/i.test(head)) out += `${head}{${body}}\n`;
    else if (/^@(media|supports|container)\b/i.test(head)) out += `${head}{${scopeBlock(body, root)}}\n`;
    else if (/^@font-face\b/i.test(head)) out += `${head}{${body}}\n`;
    else if (head.startsWith('@')) { /* @page, @layer, @namespace… : dropped */ }
    else if (head) out += `${prefixSelectors(head, root)}{${body}}\n`;
    i = close + 1;
  }
  return out;
}

/**
 * The layout stylesheet, every selector scoped under `root` (e.g. `[data-ss-root="abc"]`).
 * Rules that cannot be scoped are dropped; url() keeps safe targets only.
 */
export function scopeStylesheet(css: string | undefined, root: string, assetBase?: string): string {
  if (!css || !css.trim()) return '';
  // Comments out, then the same filtering as an HTML + CSS layer's sheet.
  const noBlocks = stripComments(css).replace(/<\s*(script|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  const clean = sanitizeCss(noBlocks, assetBase).replace(/<\s*\/?\s*[a-z][^>]*>?/gi, '');
  return scopeBlock(clean, root);
}

/** Braces that do not pair up, for the stylesheet editor. */
export function stylesheetProblems(css: string | undefined): CssProblem[] {
  const out: CssProblem[] = [];
  if (!css) return out;
  let depth = 0;
  let line = 1;
  for (const ch of stripComments(css)) {
    if (ch === '\n') line++;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth < 0) { out.push({ line, message: 'Extra “}”' }); depth = 0; } }
  }
  if (depth > 0) out.push({ line, message: `${depth} “{” never closed` });
  if (/@import\b/i.test(css)) out.push({ line: 1, message: '@import is not allowed — upload fonts in the Font picker instead' });
  if (/expression\s*\(|javascript\s*:/i.test(css)) out.push({ line: 1, message: 'Scripts and CSS expressions are not allowed' });
  return out;
}
