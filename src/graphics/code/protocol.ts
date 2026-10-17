// The messages between a code layer (CodeLayerEl, in the page) and its
// sandboxed iframe (sdk-src/codeRuntime.tsx). Every message carries `ss: 1`;
// each side also checks the message really comes from the other window.

import { builtinProps } from '../../Themes/registry.ts';

export const RUNTIME_PATH = '/code-sdk/v1/runtime.js';
export const COMPILER_PATH = '/code-sdk/v1/compiler.js';

/** A font the page has, handed to the sandbox as bytes (an opaque-origin frame cannot fetch it). */
export interface FontBytes { family: string; data: ArrayBuffer; weight?: string; style?: string }

export type ToFrame =
  | { ss: 1; type: 'state'; patch: Record<string, any> }
  | { ss: 1; type: 'event'; event: { type: string; [k: string]: any } }
  | { ss: 1; type: 'fonts'; fonts: FontBytes[] };

/** A ToFrame message without its ss marker (what CodeLayerEl.send takes). */
export type ToFrameBody = { [K in ToFrame['type']]: Omit<Extract<ToFrame, { type: K }>, 'ss'> }[ToFrame['type']];

export type FromFrame =
  | { ss: 1; type: 'ready' }
  | { ss: 1; type: 'beat' }
  | { ss: 1; type: 'mounted' }
  /** Editor only: how many elements the layer draws, how many have a size, how many are inside its box. */
  | { ss: 1; type: 'drawn'; count: number; visible: number; inside: number }
  | { ss: 1; type: 'error'; message: string; stack?: string; line?: number };

/** Config written into the sandbox document before the runtime runs. */
export interface FrameConfig {
  /** The page's asset origin, for ss.asset(id). */
  assetOrigin: string;
  mode: 'editor' | 'runtime';
  /** 'component' when the script exports one, otherwise plain JS. */
  lang: 'tsx' | 'jsx' | 'js';
}

const NONE = Object.freeze({}) as Record<string, any>;

/**
 * The props a code-layer component gets: exactly what the built-in theme
 * components get (builtinProps), plus the Designer's derived data, live
 * shapes, event logs, variables and the layer size.
 */
export function codeProps(scope: Record<string, any> | undefined, size: { width: number; height: number }): Record<string, any> {
  const s = scope || {};
  return {
    ...builtinProps(s),
    derived: s.derived ?? NONE,
    live: s.live ?? null,
    feed: s.feed ?? null,
    status: s.status ?? NONE,
    variables: s.variables ?? NONE,
    theme: s.theme ?? NONE,
    brand: s.brand ?? NONE,
    local: s.local ?? null,
    width: size.width,
    height: size.height,
  };
}

const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  // Small arrays rebuilt every render (selectedScheduleMatches): equal when their items are.
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.length <= 64) return a.every((v, i) => v === b[i]);
  return false;
};

/** Only the props whose value changed since the last post (by identity). */
export function diffProps(prev: Record<string, any> | null, next: Record<string, any>): Record<string, any> | null {
  if (!prev) return next;
  let patch: Record<string, any> | null = null;
  for (const k of Object.keys(next)) {
    if (!sameValue(prev[k], next[k])) (patch ||= {})[k] = next[k];
  }
  return patch;
}

const isMsg = (d: unknown): d is { ss: 1; type: string } => !!d && typeof d === 'object' && (d as any).ss === 1 && typeof (d as any).type === 'string';
export const isFromFrame = (d: unknown): d is FromFrame => isMsg(d);
export const isToFrame = (d: unknown): d is ToFrame => isMsg(d);
