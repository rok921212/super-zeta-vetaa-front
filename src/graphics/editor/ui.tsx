// Small shared controls for the Designer chrome (Tailwind, dark).

import React, { useCallback, useState } from 'react';
import { InfoButton } from './Help.tsx';
import { ColorPopover, Swatch } from './ColorPicker.tsx';
import type { HelpTopic } from './helpContent.ts';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export function Btn({ className, active, danger, small, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; danger?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        'inline-flex items-center gap-1.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        danger ? 'border-red-500/40 text-red-300 hover:bg-red-500/15'
          : active ? 'border-amber-400/70 bg-amber-400/15 text-amber-200'
            : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10',
        className
      )}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-slate-400">
      <span className="uppercase tracking-wide">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-slate-500 normal-case">{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-400/60';

export function TextInput({ value, onChange, placeholder, mono, ...rest }: {
  value: string | number | undefined | null; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      {...rest}
      className={cx(inputCls, mono && 'font-mono')}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

/** Number input that commits on change; empty -> undefined. */
export function NumberInput({ value, onChange, step = 1, min, max }: {
  value: number | undefined | null; onChange: (v: number | undefined) => void; step?: number; min?: number; max?: number;
}) {
  return (
    <input
      type="number"
      className={inputCls}
      value={value ?? ''}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

export function Select<T extends string>({ value, onChange, options, allowEmpty }: {
  value: T | undefined | null; onChange: (v: T | undefined) => void; options: ReadonlyArray<T | { value: T; label: string }>; allowEmpty?: string;
}) {
  return (
    <select className={inputCls} value={value ?? ''} onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

/**
 * Colour field: a swatch that opens the colour popover (opacity, HEX / RGBA,
 * the design's colours, recent colours, eyedropper) plus a text input that
 * accepts any CSS colour the schema allows.
 */
export function ColorInput({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="relative flex items-center gap-1.5">
      <Swatch color={value} size={24} title="Open the colour picker" selected={open} onClick={() => setOpen(!open)} />
      <TextInput value={value ?? ''} onChange={(v) => onChange(v || undefined)} placeholder="none" mono />
      {open && <div className="absolute left-0 right-0 top-full"><ColorPopover value={value} onChange={onChange} onClose={close} /></div>}
    </div>
  );
}

export function Section({ title, children, right, help }: { title: string; children: React.ReactNode; right?: React.ReactNode; /** ⓘ explaining this section. */ help?: HelpTopic }) {
  return (
    <div className="border-b border-white/5 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</div>
          {help && <InfoButton topic={help} />}
        </div>
        {right}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: ReadonlyArray<{ id: T; label: string }>; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex flex-wrap gap-0.5 border-b border-white/5 px-2 pt-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx(
            'rounded-t px-2 py-1 text-[11px]',
            value === t.id ? 'bg-white/10 text-amber-200' : 'text-slate-400 hover:text-slate-200'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
