// Custom-theme assignment (Theme9, Theme10, …): which theme + overlay view a
// layout fills. Used by the Publish dialog ("Add to theme") and the Document
// inspector. A layout lives in at most one slot; the backend enforces it.

import React, { useCallback } from 'react';
import { themesApi, findThemeSlot, nextThemeNumber, apiErrorMessage, type CustomTheme } from '../api.ts';
import { VIEW_OPTIONS, guessViewKey, viewLabel } from '../../dashboard/overlayViews.ts';
import { Field, Select } from './ui.tsx';
import { CACHE_KEYS, setCached, useCached } from '../requestCache.ts';

export interface ThemeChoice {
  /** An existing theme id, 'new' (create the next Theme N), or 'none' (not in any theme). */
  themeId: string;
  viewKey: string;
}

/** The account's custom themes — one cached list shared by the editor, the list page and the publish dialog. */
export function useCustomThemes() {
  const q = useCached<CustomTheme[]>(CACHE_KEYS.themes, () => themesApi.list());
  // null only while the very first load is still running; a failed load reads as "none".
  const themes: CustomTheme[] | null = q.data ?? (q.error ? [] : null);
  const error = q.error ? apiErrorMessage(q.error, 'Could not load themes') : null;
  const setThemes = useCallback((next: CustomTheme[]) => setCached(CACHE_KEYS.themes, next), []);
  /** After a change on the server (slot assigned, theme created…): fetch the new truth. */
  return { themes, error, reload: q.reload, setThemes };
}

/** Current slot if the layout has one, else a new theme with a view guessed from the layout name. */
export function defaultThemeChoice(themes: CustomTheme[], layoutId: string, layoutName: string): ThemeChoice {
  const cur = findThemeSlot(themes, layoutId);
  if (cur) return { themeId: cur.theme._id, viewKey: cur.slot.viewKey };
  return { themeId: themes.length ? themes[themes.length - 1]._id : 'new', viewKey: guessViewKey(layoutName) };
}

/** Persist a choice. Returns the theme the layout ended up in (null for 'none'). */
export async function applyThemeChoice(choice: ThemeChoice, layoutId: string, themes: CustomTheme[]): Promise<CustomTheme | null> {
  const cur = findThemeSlot(themes, layoutId);
  if (choice.themeId === 'none') {
    if (cur) await themesApi.setSlot(cur.theme._id, cur.slot.viewKey, null);
    return null;
  }
  if (cur && cur.theme._id === choice.themeId && cur.slot.viewKey === choice.viewKey) return cur.theme;
  const themeId = choice.themeId === 'new' ? (await themesApi.create())._id : choice.themeId;
  return themesApi.setSlot(themeId, choice.viewKey, layoutId);
}

export function describeChoice(choice: ThemeChoice, themes: CustomTheme[]): string {
  if (choice.themeId === 'none') return 'Not in a theme';
  const t = choice.themeId === 'new' ? `Theme ${nextThemeNumber(themes)} (new)` : `Theme ${themes.find((x) => x._id === choice.themeId)?.number ?? '?'}`;
  return `${t} · ${viewLabel(choice.viewKey)}`;
}

export function ThemeAssign({ themes, layoutId, value, onChange, disabled }: {
  themes: CustomTheme[];
  layoutId: string;
  value: ThemeChoice;
  onChange(c: ThemeChoice): void;
  disabled?: boolean;
}) {
  const target = themes.find((t) => t._id === value.themeId);
  // Which views of the chosen theme are already taken by OTHER layouts.
  const taken = new Map((target?.slots || []).filter((s) => s.layoutId !== layoutId).map((s) => [s.viewKey, s.name]));
  const themeOptions = [
    ...themes.map((t) => ({ value: t._id, label: `${t.label} · ${t.name}` })),
    { value: 'new', label: `+ New theme → Theme${nextThemeNumber(themes)}` },
    { value: 'none', label: 'Not in a theme' },
  ];
  return (
    <div className="flex flex-col gap-2">
      <Field label="Theme">
        <Select value={value.themeId} options={themeOptions} onChange={(v) => v && onChange({ ...value, themeId: v })} />
      </Field>
      {value.themeId !== 'none' && (
        <Field label="Shows as" hint={taken.has(value.viewKey) ? `Replaces “${taken.get(value.viewKey)}” in this theme` : 'The DisplayHud tile this layout opens'}>
          <Select
            value={value.viewKey}
            options={VIEW_OPTIONS.map((v) => ({ value: v.key, label: taken.has(v.key) ? `${v.label} (in use)` : v.label }))}
            onChange={(v) => v && onChange({ ...value, viewKey: v })}
          />
        </Field>
      )}
      {disabled && <span className="text-[10px] text-slate-500">Read-only while locked.</span>}
    </div>
  );
}
