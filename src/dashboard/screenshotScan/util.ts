// Ported from imageResize/src/matchData/util.ts.

let idSeq = 0;
export function makeId() {
  idSeq += 1;
  return `${Date.now()}-${idSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

// Built with RegExp() so TypeScript's es5 target doesn't reject the `u` flag;
// Babel handles it at runtime like any other unicode regex.
const NON_NAME_CHARS = new RegExp('[^\\p{L}\\p{N}]', 'gu');

/** Lowercase letters/digits only (any script), for fuzzy comparisons and lookup keys. */
export function normalizeName(value: string): string {
  return value.toLowerCase().replace(NON_NAME_CHARS, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity between two names after normalization. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
}
