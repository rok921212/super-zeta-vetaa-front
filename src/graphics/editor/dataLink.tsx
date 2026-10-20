// "Follow live data" for style fields deep inside the Inspector (gradient stops,
// fill level). The Inspector provides the selected layer's scope and its
// DataPicker button; a field without a provider (tests, effect panels) simply
// offers no data link.

import React, { createContext, useContext } from 'react';
import type { StyleValue } from '../schema/layoutTypes.ts';
import { resolvePath, type BindingScope } from '../bindings/resolve.ts';
import { explainBinding } from '../bindings/explain.ts';
import { Btn, NumberInput } from './ui.tsx';

export interface DataLink {
  scope: BindingScope;
  /** The Inspector's DataPicker button. */
  picker(current: string | undefined, onPick: (path: string) => void, label?: string): React.ReactNode;
}

export const DataLinkContext = createContext<DataLink | null>(null);
export const useDataLink = () => useContext(DataLinkContext);

const preview = (v: unknown): string => {
  if (v === undefined) return 'no data yet';
  if (v === null) return 'null';
  if (typeof v === 'object') return Array.isArray(v) ? `[${v.length}]` : '{…}';
  const s = String(v);
  return s.length > 24 ? `${s.slice(0, 24)}…` : s;
};

/** The chip shown for a value that follows data: its path, what it is right now, and ✕ to detach. */
export function LinkedChip({ path, onDetach, swatch }: { path: string; onDetach(): void; swatch?: boolean }) {
  const link = useDataLink();
  const now = link ? resolvePath(link.scope, path) : undefined;
  const why = link ? explainBinding(link.scope, path) : null;
  return (
    <div className="flex min-w-0 items-center gap-1.5" data-linked-path={path}>
      {swatch && <span className="h-4 w-4 shrink-0 rounded border border-white/20" style={{ background: typeof now === 'string' ? now : 'transparent' }} />}
      <span className="min-w-0 flex-1 truncate rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 font-mono text-[10px] text-emerald-200" title={why && !why.found ? why.message : `Follows live data: ${path}`}>
        {path} <span className="text-emerald-400/70">= {preview(now)}</span>
      </span>
      <Btn small onClick={onDetach} title="Stop following data">✕</Btn>
    </div>
  );
}

/** A number that can be typed or follow a data path ({ ref }). */
export function DataNumberField({ value, onChange, min }: { value: StyleValue | undefined; onChange(v: StyleValue | undefined): void; min?: number }) {
  const link = useDataLink();
  if (value && typeof value === 'object' && 'ref' in value) return <LinkedChip path={value.ref} onDetach={() => onChange(undefined)} />;
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <NumberInput value={typeof value === 'number' ? value : value != null && value !== '' && !isNaN(Number(value)) ? Number(value) : undefined} min={min} onChange={(v) => onChange(v)} />
      </div>
      {link?.picker(undefined, (p) => onChange({ ref: p }), 'Data')}
    </div>
  );
}
