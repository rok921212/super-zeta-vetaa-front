// Colour values as the Designer edits them. A layout stores a colour as a CSS
// string the schema accepts: `#rrggbb` when opaque, `rgba(r, g, b, a)` when
// not. Pure helpers, plus the "recent colours" list (per browser).

export interface Rgba { r: number; g: number; b: number; a: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const hex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(…)`, `rgba(…)` -> channels; anything else -> null. */
export function parseColor(input: string | null | undefined): Rgba | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = h.split('').map((c) => parseInt(c + c, 16));
      return { r, g, b, a: h.length === 4 ? a / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    }
    return null;
  }
  m = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)(%)?\s*)?\)$/.exec(s);
  if (m) {
    const a = m[4] == null ? 1 : m[5] ? Number(m[4]) / 100 : Number(m[4]);
    const c = { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
    if ([c.r, c.g, c.b, c.a].some((n) => !Number.isFinite(n))) return null;
    return { r: clamp(c.r, 0, 255), g: clamp(c.g, 0, 255), b: clamp(c.b, 0, 255), a: clamp(c.a, 0, 1) };
  }
  return null;
}

/** `#rrggbb` (the opaque part of a colour). */
export const toHex = (c: Rgba): string => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;

/** The string a layout stores: hex when opaque, rgba() when it has transparency. */
export function formatColor(c: Rgba): string {
  const a = Math.round(clamp(c.a, 0, 1) * 100) / 100;
  if (a >= 1) return toHex(c);
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;
}

/** The same colour at another opacity (0..1). Unparseable colours (named ones) come back unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  return c ? formatColor({ ...c, a: alpha }) : color;
}

/** Opacity of a colour string, 1 when it cannot be read. */
export const alphaOf = (color: string | null | undefined): number => parseColor(color)?.a ?? 1;

/** Linear mix of two colours (t = 0 -> a, 1 -> b). */
export function mixColors(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return t < 0.5 ? a : b;
  const k = clamp(t, 0, 1);
  return formatColor({ r: x.r + (y.r - x.r) * k, g: x.g + (y.g - x.g) * k, b: x.b + (y.b - x.b) * k, a: x.a + (y.a - x.a) * k });
}

// ── recent colours ──────────────────────────────────────────────────────────

const RECENT_KEY = 'designer.colors.recent';
export const MAX_RECENT_COLORS = 14;
let recent: string[] | null = null;
const listeners = new Set<() => void>();

function load(): string[] {
  if (recent) return recent;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RECENT_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    recent = Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string' && parseColor(c)).slice(0, MAX_RECENT_COLORS) : [];
  } catch {
    recent = [];
  }
  return recent!;
}

export const recentColors = (): string[] => load();

/** Remember a colour the user just chose (most recent first, no repeats). */
export function rememberColor(color: string | null | undefined): void {
  const c = parseColor(color);
  if (!c) return;
  const value = formatColor(c);
  recent = [value, ...load().filter((x) => x !== value)].slice(0, MAX_RECENT_COLORS);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* storage full / blocked: the list still works for this session */ }
  listeners.forEach((l) => l());
}

export function subscribeRecentColors(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Tests. */
export function resetRecentColors(): void {
  recent = [];
  try { localStorage.removeItem(RECENT_KEY); } catch { /* nothing stored */ }
}
