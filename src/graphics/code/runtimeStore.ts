// Inside a code layer's sandbox: the latest data the Designer sent, and the
// live events. The runtime (sdk-src/codeRuntime.tsx) writes here from
// postMessage; components read it with useData / useEvent, plain-JS layers
// with ss.on('data' | 'event').

import { useEffect, useRef, useSyncExternalStore } from 'react';

export type CodeProps = Record<string, any>;
export interface CodeEvent { type: string; [key: string]: any }

let props: CodeProps = {};
let received = false;
const dataListeners = new Set<() => void>();
const eventListeners = new Set<(e: CodeEvent) => void>();

/** Merge a patch of changed props (the parent only sends what changed). */
export function applyPatch(patch: CodeProps): void {
  props = { ...props, ...patch };
  received = true;
  dataListeners.forEach((fn) => fn());
}

export const getProps = (): CodeProps => props;
export const hasData = (): boolean => received;

export function subscribeData(fn: () => void): () => void {
  dataListeners.add(fn);
  return () => { dataListeners.delete(fn); };
}

export function emitEvent(e: CodeEvent): void {
  eventListeners.forEach((fn) => { try { fn(e); } catch (err) { setTimeout(() => { throw err; }); } });
}

export function subscribeEvents(fn: (e: CodeEvent) => void): () => void {
  eventListeners.add(fn);
  return () => { eventListeners.delete(fn); };
}

/** Every prop the layer gets (tournament, matchData, derived, live, …), live. */
export function useData(): CodeProps {
  return useSyncExternalStore(subscribeData, getProps, getProps);
}

/**
 * Run `fn` on every live event (kill, elimination, knock, revive, recall,
 * milestone, rankChange, …), or only on the given type(s).
 */
export function useEvent(type: string | string[] | null, fn: (e: CodeEvent) => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  const key = Array.isArray(type) ? type.join(',') : type || '';
  useEffect(() => {
    const wanted = key ? key.split(',') : null;
    return subscribeEvents((e) => { if (!wanted || wanted.includes(e.type)) ref.current(e); });
  }, [key]);
}

/** Tests only. */
export function resetStore(): void {
  props = {};
  received = false;
  dataListeners.clear();
  eventListeners.clear();
}
