// Fonts a layout can use: the faces the app already ships, plus the .woff2
// files a user uploaded to their library (served by the cloud backend).
//
// A layout stores a font as a plain CSS `fontFamily` string — there is no
// font object in the schema. What a published overlay needs to load arrives
// beside the document (RenderPayload.fonts); the editor registers the whole
// library. Registration is lazy: the browser only downloads a face that some
// text actually uses.

import { DEFAULT_BACKEND } from '../../login/api.tsx';

/** { id, family } of an uploaded font — all the renderer needs to load it. */
export interface FontRef {
  id: string;
  family: string;
}

/** Families already available on every page (front/src/index.css + the Google link in public/index.html). */
export const BUILTIN_FONTS: ReadonlyArray<string> = [
  'Tungsten', 'Supermolot', 'Unisans', 'Bebas', 'Bebas Neue', 'Anton', 'AGENCYB', 'IMPACT', 'RELIDUX',
  'PaybAck', 'Awaking', 'Righteous',
];

export const MAX_FONT_BYTES = 2 * 1024 * 1024;
export const FONT_FAMILY_RE = /^[A-Za-z][A-Za-z0-9 _-]{0,39}$/;

/** The CSS value stored in a layout for a family. Quoted: names with spaces or digits stay valid CSS. */
export const fontValue = (family: string): string => `"${family}", sans-serif`;

/** First family of a CSS font-family value, unquoted: '"Clan Display", sans-serif' -> 'Clan Display'. */
export function primaryFamily(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.split(',')[0].trim().replace(/^["']|["']$/g, '').trim();
}

export const sameFamily = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A valid family name from an uploaded file's name: "clan-display_Bold.woff2" -> "clan-display_Bold". */
export function familyFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9 _-]+/g, ' ').replace(/\s+/g, ' ').replace(/^[^A-Za-z]+/, '').trim();
  return base.slice(0, 40).trim() || 'Custom Font';
}

/** WOFF2 header check: the 'wOF2' signature and, when the size is known, the header's own total-length field. */
export function isWoff2(head: Uint8Array, totalSize?: number): boolean {
  if (head.length < 12) return false;
  if (head[0] !== 0x77 || head[1] !== 0x4f || head[2] !== 0x46 || head[3] !== 0x32) return false;
  if (totalSize == null) return true;
  const length = ((head[8] << 24) | (head[9] << 16) | (head[10] << 8) | head[11]) >>> 0;
  return length === totalSize;
}

export const fontFileUrl = (id: string): string => `${DEFAULT_BACKEND}/api/overlay-fonts/file/${encodeURIComponent(id)}`;

const registered = new Map<string, FontFace>();

/**
 * Make uploaded fonts usable by family name on this page. Idempotent per font
 * id. `display: block` — an overlay should never flash the fallback face on air.
 */
export function registerFontFaces(fonts: ReadonlyArray<FontRef> | null | undefined): void {
  if (!fonts || typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return;
  for (const f of fonts) {
    if (!f || registered.has(f.id) || !FONT_FAMILY_RE.test(f.family) || !/^[a-f0-9]{24}$/i.test(f.id)) continue;
    try {
      const face = new FontFace(f.family, `url("${fontFileUrl(f.id)}") format("woff2")`, { display: 'block' });
      document.fonts.add(face);
      registered.set(f.id, face);
    } catch (err) {
      console.warn('[fonts] could not register', f.family, err);
    }
  }
}

/** Drop a font that was deleted from the library. */
export function unregisterFontFace(id: string): void {
  const face = registered.get(id);
  if (!face) return;
  try { document.fonts.delete(face); } catch { /* already gone */ }
  registered.delete(id);
}
