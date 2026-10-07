// The formatter registry — the only transformations a binding can apply.
// Names are validated by the shared schema (FORMATTERS); an unknown name at
// runtime is ignored (value passes through) rather than throwing.

import type { FormatterName } from '../schema/layoutTypes.ts';

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = Math.abs(n) % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const clock = (totalSeconds: number) => {
  const t = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

type Formatter = (v: unknown, scope?: { item?: any }) => unknown;

export const FORMATTER_IMPLS: Record<FormatterName, Formatter> = {
  upper: (v) => (v == null ? v : String(v).toUpperCase()),
  lower: (v) => (v == null ? v : String(v).toLowerCase()),
  number: (v) => { const n = toNumber(v); return n == null ? v : n.toLocaleString('en-US'); },
  pad2: (v) => { const n = toNumber(v); return n == null ? v : String(Math.trunc(n)).padStart(2, '0'); },
  percent: (v) => { const n = toNumber(v); return n == null ? v : `${Math.round(n)}%`; },
  ordinal: (v) => { const n = toNumber(v); return n == null ? v : ordinal(Math.trunc(n)); },
  time: (v) => { const n = toNumber(v); return n == null ? v : clock(n); },
  // health / healthMax of the current player (item), as a 0-100 percentage.
  healthPercent: (v, scope) => {
    const n = toNumber(v);
    if (n == null) return v;
    const max = toNumber(scope?.item?.healthMax) || 100;
    return Math.max(0, Math.min(100, Math.round((n / max) * 100)));
  },
  currency: (v) => { const n = toNumber(v); return n == null ? v : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }); },
  date: (v) => {
    if (v == null || v === '') return v;
    const d = new Date(v as any);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  duration: (v) => {
    const n = toNumber(v);
    if (n == null) return v;
    const m = Math.floor(n / 60);
    const s = Math.floor(n % 60);
    return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
  },
  abs: (v) => { const n = toNumber(v); return n == null ? v : Math.abs(n); },
  round: (v) => { const n = toNumber(v); return n == null ? v : Math.round(n); },
  fixed1: (v) => { const n = toNumber(v); return n == null ? v : n.toFixed(1); },
  fixed2: (v) => { const n = toNumber(v); return n == null ? v : n.toFixed(2); },
  plusMinus: (v) => { const n = toNumber(v); return n == null ? v : n > 0 ? `+${n}` : String(n); },
};

export function applyFormatter(name: string | undefined, value: unknown, scope?: { item?: any }): unknown {
  if (!name) return value;
  const f = (FORMATTER_IMPLS as Record<string, Formatter>)[name];
  if (!f) return value;
  try {
    return f(value, scope);
  } catch {
    return value;
  }
}
