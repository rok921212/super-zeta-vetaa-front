// Declarative conditions: { path, op, value } leaves combined with all / any / not.
// Pure data — evaluated here, never executed.

import type { Condition } from '../schema/layoutTypes.ts';
import { resolvePath, type BindingScope } from './resolve.ts';

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
};

// Loose equality that treats "5" and 5, "true" and true alike (bound data is untyped).
function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  const na = num(a);
  const nb = num(b);
  if (na != null && nb != null) return na === nb;
  return String(a) === String(b);
}

function compare(a: unknown, b: unknown, cmp: (x: number, y: number) => boolean): boolean {
  const na = num(a);
  const nb = num(b);
  return na != null && nb != null && cmp(na, nb);
}

export function evaluateCondition(c: Condition | undefined | null, scope: BindingScope, depth = 0): boolean {
  if (!c || depth > 8) return true;
  if ('all' in c) return c.all.every((s) => evaluateCondition(s, scope, depth + 1));
  if ('any' in c) return c.any.some((s) => evaluateCondition(s, scope, depth + 1));
  if ('not' in c) return !evaluateCondition(c.not, scope, depth + 1);
  const v = resolvePath(scope, c.path);
  switch (c.op) {
    case 'equals': return looseEquals(v, c.value);
    case 'notEquals': return !looseEquals(v, c.value);
    case 'greaterThan': return compare(v, c.value, (x, y) => x > y);
    case 'lessThan': return compare(v, c.value, (x, y) => x < y);
    case 'greaterOrEqual': return compare(v, c.value, (x, y) => x >= y);
    case 'lessOrEqual': return compare(v, c.value, (x, y) => x <= y);
    case 'exists': return v !== undefined && v !== null && v !== '';
    case 'notExists': return v === undefined || v === null || v === '';
    case 'contains':
      if (Array.isArray(v)) return v.some((x) => looseEquals(x, c.value));
      if (typeof v === 'string') return c.value != null && v.toLowerCase().includes(String(c.value).toLowerCase());
      return false;
    default:
      return false;
  }
}
