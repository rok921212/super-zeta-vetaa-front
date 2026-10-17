// {{path}} / {{path|format}} tokens in free markup: the HTML + CSS layer
// (renderer/htmlCss.ts) and the code layer's <template> (code/runtimeEntry.tsx)
// fill them the same way. No DOM, no network: safe to bundle anywhere.

import { resolvePath, type BindingScope } from './resolve.ts';
import { applyFormatter } from './formatters.ts';

const TOKEN_RE = /\{\{\s*([^{}|]+?)\s*(?:\|\s*([A-Za-z0-9]+)\s*)?\}\}/g;

export const hasTokens = (s: string | null | undefined): boolean => !!s && s.indexOf('{{') !== -1 && /\{\{[^{}]+\}\}/.test(s);

/** Fill `{{path}}` / `{{path|format}}` from the binding scope. Missing values become ''. */
export function fillTokens(template: string, scope: BindingScope | Record<string, any> | undefined): string {
  return template.replace(TOKEN_RE, (_m, path: string, fmt?: string) => {
    let v: unknown;
    try { v = resolvePath((scope || {}) as BindingScope, path.trim()); } catch { v = undefined; }
    if (fmt) v = applyFormatter(fmt, v, scope as any);
    if (v == null || typeof v === 'object') return '';
    return String(v);
  });
}

/** Every distinct `{{path}}` used, for the dialog's "uses this data" list. */
export function tokenPaths(html: string): string[] {
  const out = new Set<string>();
  html.replace(TOKEN_RE, (_m, path: string) => { out.add(path.trim()); return ''; });
  return Array.from(out);
}
