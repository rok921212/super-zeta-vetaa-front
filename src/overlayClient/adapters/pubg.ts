// PUBG game adapter — everything the engine core knows about THIS game's
// payloads lives behind this object. The core (../engine.ts) only speaks
// "bulk / live delta / live snapshot / overall delta / derived / events";
// a future Valorant/FreeFire adapter implements the same shape.

import { overlay as overlayProto } from '../../proto/overlay.pb';
import { decodeWireMessage } from '../wire.ts';
import {
  applyBulk,
  applyLiveDelta,
  applyLiveSnapshot,
  applyOverallDelta,
  type BulkResult,
  type LiveBook,
  type LiveResult,
} from '../state.ts';
import { createDerivedEngine, type DerivedEngine } from '../derived.ts';
import { createEventProcessor, type EventProcessor } from '../events.ts';
import type { EngineData } from '../engineTypes.ts';

export interface GameAdapter {
  readonly id: string;
  decodeLive(raw: unknown): any | null;
  decodeOverall(raw: unknown): any | null;
  applyBulk(prev: EngineData, book: LiveBook, bulk: any, httpRev: number | null): BulkResult;
  applyLiveDelta(prev: EngineData, book: LiveBook, incoming: any): LiveResult;
  applyLiveSnapshot(prev: EngineData, book: LiveBook, incoming: any): LiveResult;
  applyOverallDelta(prev: EngineData, incoming: any): EngineData;
  /** Authoritative per-round revision carried by a bulk body. */
  bulkRevision(bulk: any): number;
  createDerived(): DerivedEngine;
  createEvents(): EventProcessor;
}

export const pubgAdapter: GameAdapter = {
  id: 'pubg',
  decodeLive: (raw) => decodeWireMessage(raw, overlayProto.MatchDataPayload),
  decodeOverall: (raw) => decodeWireMessage(raw, overlayProto.OverallDataPayload),
  applyBulk,
  applyLiveDelta,
  applyLiveSnapshot,
  applyOverallDelta,
  bulkRevision: (bulk) => Number(bulk?.roundData?.publicRev) || 0,
  createDerived: createDerivedEngine,
  createEvents: createEventProcessor,
};
