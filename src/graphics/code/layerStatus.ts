// What each code layer on this page is doing right now — loading, running,
// drawing nothing, or failing on a given line. CodeLayerEl writes it; the
// code panel, the Inspector and the canvas badge read it.

import { useSyncExternalStore } from 'react';

export type CodeRunState = 'loading' | 'waiting' | 'running' | 'empty' | 'outside' | 'error' | 'stalled';

export interface CodeRunStatus {
  state: CodeRunState;
  /** Error text, or what is wrong. */
  message?: string;
  /** Line of the .ssx file the error points at. */
  line?: number | null;
  /** What to do about it. */
  hint?: string;
  /** How many elements it draws (running / empty / outside). */
  drawn?: number;
}

const statuses = new Map<string, CodeRunStatus>();
const listeners = new Set<() => void>();

const same = (a: CodeRunStatus | undefined, b: CodeRunStatus | undefined) =>
  !!a && !!b && a.state === b.state && a.message === b.message && a.line === b.line && a.drawn === b.drawn && a.hint === b.hint;

export function setCodeStatus(id: string, status: CodeRunStatus | null): void {
  const prev = statuses.get(id);
  if (status == null) { if (!prev) return; statuses.delete(id); }
  else { if (same(prev, status)) return; statuses.set(id, status); }
  listeners.forEach((fn) => fn());
}

export const getCodeStatus = (id: string): CodeRunStatus | null => statuses.get(id) ?? null;

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function useCodeStatus(id: string | null | undefined): CodeRunStatus | null {
  return useSyncExternalStore(subscribe, () => (id ? statuses.get(id) ?? null : null), () => null);
}

/** One line for a badge / list. */
export function describeStatus(s: CodeRunStatus): string {
  switch (s.state) {
    case 'loading': return 'Starting…';
    case 'waiting': return 'Waiting for data…';
    case 'running': return `Running · draws ${s.drawn ?? 0} element${s.drawn === 1 ? '' : 's'}`;
    case 'empty': return 'Runs, but draws nothing';
    case 'outside': return 'Draws only outside the layer’s box';
    case 'stalled': return 'Stopped responding (an endless loop?)';
    default: return `${s.line ? `Line ${s.line}: ` : ''}${s.message || 'Error'}`;
  }
}
