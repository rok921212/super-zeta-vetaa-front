// Declarative conditions: { path, op, value } leaves combined with all / any / not.
// Pure data — evaluated here, never executed.

import type { Condition } from '../schema/layoutTypes.ts';
import { resolvePath, type BindingScope } from './resolve.ts';
import { compare, looseEquals } from './loose.ts';

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
