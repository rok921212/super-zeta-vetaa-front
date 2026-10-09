// A shadow as four numbers and a colour instead of a CSS string to type.
// Stores an ordinary `box-shadow` / `text-shadow` value ("0px 8px 24px
// rgba(0, 0, 0, 0.45)"). A value it cannot read (several shadows, `inset`,
// typed by hand) is shown as text and left exactly as it is.

import React from 'react';
import { Btn, ColorInput, Field, NumberInput, TextInput } from '../ui.tsx';

export interface ShadowParts { x: number; y: number; blur: number; spread: number; color: string }

const SHADOW_RE = /^\s*(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?(?:\s+([\d.]+)(?:px)?)?(?:\s+(-?[\d.]+)(?:px)?)?\s+(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|[a-zA-Z]+)\s*$/;

/** One plain shadow -> its parts; null for anything more elaborate. */
export function parseShadow(value: string | null | undefined): ShadowParts | null {
  if (!value) return null;
  const m = SHADOW_RE.exec(value);
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]), blur: m[3] == null ? 0 : Number(m[3]), spread: m[4] == null ? 0 : Number(m[4]), color: m[5] };
}

/** `spread` is left out when 0 (and always for text, which has none). */
export function formatShadow(p: ShadowParts, text = false): string {
  const spread = !text && p.spread ? ` ${p.spread}px` : '';
  return `${p.x}px ${p.y}px ${Math.max(0, p.blur)}px${spread} ${p.color}`;
}

export const DEFAULT_SHADOW: ShadowParts = { x: 0, y: 8, blur: 24, spread: 0, color: 'rgba(0, 0, 0, 0.45)' };

export function ShadowField({ label, value, onChange, text }: { label: string; value: string; onChange(v: string | undefined): void; text?: boolean }) {
  const parts = parseShadow(value);
  if (!value) {
    return (
      <Field label={label}>
        <Btn small onClick={() => onChange(formatShadow(text ? { ...DEFAULT_SHADOW, y: 2, blur: 6 } : DEFAULT_SHADOW, text))}>+ Add {label.toLowerCase()}</Btn>
      </Field>
    );
  }
  if (!parts) {
    return (
      <Field label={label} hint="A custom value: edit it as text, or clear it to use the controls">
        <div className="flex items-center gap-1.5">
          <TextInput value={value} mono onChange={(v) => onChange(v || undefined)} />
          <Btn small danger onClick={() => onChange(undefined)}>✕</Btn>
        </div>
      </Field>
    );
  }
  const set = (patch: Partial<ShadowParts>) => onChange(formatShadow({ ...parts, ...patch }, text));
  const numField = (name: string, key: 'x' | 'y' | 'blur' | 'spread', min?: number) => (
    <label className="flex min-w-0 flex-col gap-0.5 text-[10px] uppercase tracking-wide text-slate-500">
      {name}
      <NumberInput value={parts[key]} min={min} onChange={(v) => set({ [key]: v ?? 0 } as Partial<ShadowParts>)} />
    </label>
  );
  return (
    <div className="rounded border border-white/5 bg-white/[0.02] p-2" data-shadow={text ? 'text' : 'box'}>
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
        <button type="button" className="text-slate-500 hover:text-red-300" onClick={() => onChange(undefined)} title={`Remove the ${label.toLowerCase()}`}>Remove</button>
      </div>
      <div className={text ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-4 gap-1.5'}>
        {numField('X', 'x')}
        {numField('Y', 'y')}
        {numField('Blur', 'blur', 0)}
        {!text && numField('Spread', 'spread')}
      </div>
      <div className="mt-1.5"><ColorInput value={parts.color} onChange={(v) => set({ color: v || 'rgba(0, 0, 0, 0.45)' })} /></div>
    </div>
  );
}
