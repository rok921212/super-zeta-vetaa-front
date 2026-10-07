// React adapter over the overlay engine. Owns nothing protocol-related: it
// creates one engine per mount (per tournament/round identity survives option
// changes via engine.update), mirrors its published state into React, and
// tears it down on unmount.

import { useEffect, useRef, useState } from 'react';
import { createOverlayEngine, type EngineDeps } from './engine.ts';
import type {
  EngineEvent,
  EngineEventType,
  EngineOptions,
  EngineState,
  OverlayEngine,
} from './engineTypes.ts';
import type { EngineTransport } from './transport.ts';

export interface UseOverlayEngineResult {
  state: EngineState | null;
  engine: OverlayEngine | null;
}

/**
 * `makeTransport` is called once per engine instance. Options may change
 * freely between renders — they are applied with engine.update(), never by
 * recreating the engine (so the socket room, caches and live state carry over).
 * Pass `enabled: false` to hold off (e.g. until route params resolve).
 */
export function useOverlayEngine(
  options: EngineOptions | null,
  makeTransport: () => EngineTransport,
  deps: Omit<EngineDeps, 'transport'> = {}
): UseOverlayEngineResult {
  const [engine, setEngine] = useState<OverlayEngine | null>(null);
  const [state, setState] = useState<EngineState | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const makeTransportRef = useRef(makeTransport);
  makeTransportRef.current = makeTransport;

  const enabled = !!(options && options.tournamentId && options.roundId);

  useEffect(() => {
    if (!enabled) return;
    const e = createOverlayEngine(optionsRef.current as EngineOptions, {
      ...deps,
      transport: makeTransportRef.current(),
    });
    const unsub = e.subscribe(setState);
    setEngine(e);
    return () => {
      unsub();
      e.destroy();
      setEngine(null);
    };
    // One engine per mount (and per enabled flip). Option changes go through update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const o = options;
  useEffect(() => {
    if (!engine || !o) return;
    engine.update({
      tournamentId: o.tournamentId,
      roundId: o.roundId,
      matchId: o.matchId ?? null,
      followSelected: o.followSelected,
      view: o.view ?? null,
      tag: o.tag,
      verbose: o.verbose,
      debug: o.debug,
    });
  }, [engine, o?.tournamentId, o?.roundId, o?.matchId, o?.followSelected, o?.view, o?.tag, o?.verbose, o?.debug]); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, engine };
}

/** Subscribe to one engine event type (or '*') for the life of the component. */
export function useEngineEvent(
  engine: OverlayEngine | null,
  type: EngineEventType | '*',
  listener: (event: EngineEvent) => void
): void {
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => {
    if (!engine) return;
    return engine.on(type, (ev) => ref.current(ev));
  }, [engine, type]);
}
