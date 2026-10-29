// Fonts for a code layer's sandbox. The frame has an opaque origin, so it
// cannot download the app's fonts itself (font requests need CORS). The page
// fetches the files the layer mentions — the app's own @font-face faces
// (Supermolot, Tungsten, …) and the account's uploaded fonts — and hands the
// bytes over; the frame registers them with `new FontFace(family, bytes)`.

import type { FontBytes } from './protocol.ts';
import { cachedFontBytes, fontFileUrl, registeredFontRefs } from '../renderer/fonts.ts';

interface FontSource { family: string; url: string; weight?: string; style?: string }

const bytes = new Map<string, Promise<ArrayBuffer | null>>();

/** Every font face this page can name: same-origin @font-face rules + uploaded fonts. */
export function pageFontSources(): FontSource[] {
  const out: FontSource[] = [];
  if (typeof document === 'undefined') return out;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; } // cross-origin sheet (Google Fonts): skip
    for (const rule of Array.from(rules)) {
      if (rule.type !== 5) continue; // CSSRule.FONT_FACE_RULE
      const st = (rule as CSSFontFaceRule).style;
      const family = st.getPropertyValue('font-family').trim().replace(/^["']|["']$/g, '');
      const m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(st.getPropertyValue('src'));
      if (!family || !m) continue;
      try {
        out.push({ family, url: new URL(m[1], sheet.href || document.baseURI).href, weight: st.getPropertyValue('font-weight') || undefined, style: st.getPropertyValue('font-style') || undefined });
      } catch { /* bad url */ }
    }
  }
  for (const f of registeredFontRefs()) out.push({ family: f.family, url: fontFileUrl(f.id) });
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The faces whose family the layer's code mentions (case-insensitive, CSS family names are). */
export function fontsUsedBy(code: string, sources: FontSource[]): FontSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.family.toLowerCase()}|${s.weight || ''}|${s.style || ''}`;
    if (seen.has(key)) return false;
    const used = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRe(s.family)}([^A-Za-z0-9_-]|$)`, 'i').test(code);
    if (used) seen.add(key);
    return used;
  });
}

function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  let p = bytes.get(url);
  if (!p) {
    // On-device cache first (fonts.ts), so a refresh does not download them again.
    p = cachedFontBytes(url)
      .then((cached) => cached ?? fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)))
      .catch(() => null);
    bytes.set(url, p);
  }
  return p;
}

/** Bytes of every font the code uses (cached per URL for the page's lifetime). */
export async function fontBytesFor(code: string): Promise<FontBytes[]> {
  if (typeof fetch !== 'function') return [];
  const wanted = fontsUsedBy(code, pageFontSources());
  const loaded = await Promise.all(wanted.map(async (s) => ({ s, data: await fetchBytes(s.url) })));
  return loaded.filter((x) => x.data).map(({ s, data }) => ({ family: s.family, data: data as ArrayBuffer, weight: s.weight, style: s.style }));
}
