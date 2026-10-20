// Loose comparisons for untyped bound data, shared by conditions.ts and
// expr.ts so `"5" == 5` and `"true" == true` mean the same everywhere.

export const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
};

/** Loose equality that treats "5" and 5, "true" and true alike (bound data is untyped). */
export function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  const na = num(a);
  const nb = num(b);
  if (na != null && nb != null) return na === nb;
  return String(a) === String(b);
}

export function compare(a: unknown, b: unknown, cmp: (x: number, y: number) => boolean): boolean {
  const na = num(a);
  const nb = num(b);
  return na != null && nb != null && cmp(na, nb);
}
