// Font dropdown for the Inspector: the fonts that are actually available (the
// user's uploaded library, then the faces the app ships) plus an upload button.
// Uploads are .woff2 only — checked here by extension, size and file
// signature, and again on the server by the bytes.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fontsApi, apiErrorMessage, type FontInfo } from '../api.ts';
import {
  BUILTIN_FONTS, MAX_FONT_BYTES, familyFromFileName, fontValue, isWoff2, primaryFamily, registerFontFaces,
  sameFamily, unregisterFontFace,
} from '../renderer/fonts.ts';
import { Btn, Select } from './ui.tsx';
import { CACHE_KEYS, setCached, useCached } from '../requestCache.ts';

export const WOFF2_ONLY = 'Only .woff2 fonts are supported';

export interface FontLibrary {
  /** null until the first load finishes. */
  fonts: FontInfo[] | null;
  upload(file: File): Promise<FontInfo>;
  remove(id: string): Promise<void>;
}

/** First bytes of a file (the WOFF2 header is 48 bytes; 12 are enough to identify it). */
function readHead(file: Blob, bytes = 12): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error || new Error('Could not read the file'));
    reader.readAsArrayBuffer(file.slice(0, bytes));
  });
}

/** Throws a user-facing Error unless the file is a .woff2 within the size limit. */
export async function checkFontFile(file: File): Promise<void> {
  if (!/\.woff2$/i.test(file.name)) throw new Error(WOFF2_ONLY);
  if (file.size > MAX_FONT_BYTES) throw new Error('Font is larger than 2 MB');
  if (!isWoff2(await readHead(file), file.size)) throw new Error(WOFF2_ONLY);
}

/** The account's uploaded fonts, registered on this page so the canvas can render them. */
export function useFontLibrary(): FontLibrary {
  const q = useCached<FontInfo[]>(CACHE_KEYS.fonts, async () => { const list = await fontsApi.list(); return Array.isArray(list) ? list : []; });
  const fonts: FontInfo[] | null = q.data ?? (q.error ? [] : null);
  const setFonts = (fn: (list: FontInfo[] | null) => FontInfo[]) => setCached<FontInfo[]>(CACHE_KEYS.fonts, (cur) => fn(cur ?? null));
  useEffect(() => {
    registerFontFaces((fonts || []).map((f) => ({ id: f._id, family: f.family })));
  }, [fonts]);

  const upload = useCallback(async (file: File) => {
    await checkFontFile(file);
    const font = await fontsApi.upload(file, familyFromFileName(file.name));
    setFonts((list) => [...(list || []), font]);
    return font;
  }, []);
  const remove = useCallback(async (id: string) => {
    await fontsApi.remove(id);
    unregisterFontFace(id);
    setFonts((list) => (list || []).filter((f) => f._id !== id));
  }, []);
  // Stable identity while the list is unchanged, so the memoised Inspector is not re-rendered for nothing.
  return useMemo(() => ({ fonts, upload, remove }), [fonts, upload, remove]);
}

export function FontPicker({ value, onChange, library, emptyLabel }: {
  /** The CSS font-family value stored in the layout. */
  value: string | undefined | null;
  onChange(value: string | undefined): void;
  library: FontLibrary;
  /** When set, the list starts with an empty choice with this label. */
  emptyLabel?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const uploaded = library.fonts || [];
  const current = primaryFamily(value);
  const currentUpload = uploaded.find((f) => sameFamily(f.family, current)) || null;
  // Uploaded names can never equal a built-in one (the server refuses them).
  const known = currentUpload?.family ?? BUILTIN_FONTS.find((f) => sameFamily(f, current));
  const options = [
    // A value typed before this picker existed (or the "Inter" default) stays selectable.
    ...(current && !known ? [{ value: current, label: current }] : []),
    ...uploaded.map((f) => ({ value: f.family, label: `${f.family} · uploaded` })),
    ...BUILTIN_FONTS.map((f) => ({ value: f, label: f })),
  ];

  const pick = (family: string | undefined) => {
    setConfirmDelete(null);
    if (!family) return onChange(undefined);
    if (sameFamily(family, current)) return;
    onChange(fontValue(family));
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // picking the same file again must fire a change
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const font = await library.upload(file);
      onChange(fontValue(font.family));
    } catch (err) {
      setError(apiErrorMessage(err, 'Upload failed'));
    } finally {
      setBusy(false);
    }
  };

  const removeCurrent = async () => {
    if (!currentUpload) return;
    if (confirmDelete !== currentUpload._id) return setConfirmDelete(currentUpload._id);
    setBusy(true);
    setError(null);
    try {
      await library.remove(currentUpload._id);
      onChange(undefined);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not delete the font'));
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="flex flex-col gap-1" data-testid="font-picker">
      <Select value={known ?? (current || undefined)} allowEmpty={emptyLabel} options={options} onChange={pick} />
      <div className="flex flex-wrap items-center gap-1.5">
        <Btn small disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Working…' : 'Upload .woff2'}</Btn>
        {currentUpload && (
          <Btn small danger disabled={busy} onClick={removeCurrent} title="Remove this font from your library">
            {confirmDelete === currentUpload._id ? 'Confirm delete' : 'Delete font'}
          </Btn>
        )}
        <input ref={fileRef} type="file" accept=".woff2,font/woff2" className="hidden" data-testid="font-file" onChange={onFile} />
      </div>
      {confirmDelete && <div className="text-[10px] normal-case text-amber-300">Published overlays using this font will fall back to a default font.</div>}
      {error && <div className="text-[10px] normal-case text-red-300" role="alert">{error}</div>}
    </div>
  );
}
