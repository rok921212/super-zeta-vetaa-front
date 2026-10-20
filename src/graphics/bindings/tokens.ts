// {{ … }} tokens in free text: text layers, shape labels, layer CSS, the
// HTML + CSS layer (renderer/htmlCss.ts) and the code layer's <template>
// (code/runtimeEntry.tsx) all fill them the same way. No DOM, no network:
// safe to bundle anywhere.
//
//   {{path}} / {{path|format}}        — a data path, optionally one formatter (unchanged)
//   {{ any expression }}              — bindings/expr.ts: ? :, + - * /, ==, &&, helpers, | fixed(1)…

import { isSafePath } from '../schema/layoutSchema.js';
import { resolvePath, type BindingScope } from './resolve.ts';
import { applyFormatter } from './formatters.ts';
import { evaluateExpression, expressionPaths, expressionProblem, type ExpressionProblem } from './expr.ts';

const TOKEN_RE = /\{\{([\s\S]+?)\}\}/g;
// The original token form: one path, at most one formatter.
const SIMPLE_RE = /^\s*([^{}|]+?)\s*(?:\|\s*([A-Za-z0-9]+)\s*)?$/;

export const hasTokens = (s: string | null | undefined): boolean => !!s && s.indexOf('{{') !== -1 && /\{\{[\s\S]+?\}\}/.test(s);

function simple(inner: string): { path: string; fmt?: string } | null {
  const m = SIMPLE_RE.exec(inner);
  if (!m || !isSafePath(m[1].trim())) return null;
  return { path: m[1].trim(), fmt: m[2] };
}

/** The value one token stands for (before it is turned into text). */
export function tokenValue(inner: string, scope: BindingScope | Record<string, any> | undefined): unknown {
  const s = simple(inner);
  if (s) {
    let v: unknown;
    try { v = resolvePath((scope || {}) as BindingScope, s.path); } catch { v = undefined; }
    return s.fmt ? applyFormatter(s.fmt, v, scope as any) : v;
  }
  return evaluateExpression(inner, scope);
}

const asText = (v: unknown): string => {
  if (v == null || typeof v === 'object') return '';
  if (typeof v === 'number' && !Number.isFinite(v)) return '';
  return String(v);
};

/** Fill every `{{ … }}` from the binding scope. Missing values and unreadable expressions become ''. */
export function fillTokens(template: string, scope: BindingScope | Record<string, any> | undefined): string {
  return template.replace(TOKEN_RE, (_m, inner: string) => asText(tokenValue(inner, scope)));
}

/** Every distinct data path used, for the "uses this data" lists and publish checks. */
export function tokenPaths(html: string): string[] {
  const out = new Set<string>();
  html.replace(TOKEN_RE, (_m, inner: string) => {
    const s = simple(inner);
    if (s) out.add(s.path);
    else expressionPaths(inner).forEach((p) => out.add(p));
    return '';
  });
  return Array.from(out);
}

/** Problems in the {{ … }} tokens of a text, with the 1-based line each sits on. */
export function tokenProblems(text: string): Array<ExpressionProblem & { line: number; token: string }> {
  const out: Array<ExpressionProblem & { line: number; token: string }> = [];
  if (!text || text.indexOf('{{') === -1) return out;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text))) {
    if (simple(m[1])) continue;
    const p = expressionProblem(m[1]);
    if (p) out.push({ ...p, line: text.slice(0, m.index).split('\n').length, token: m[0] });
  }
  return out;
}
