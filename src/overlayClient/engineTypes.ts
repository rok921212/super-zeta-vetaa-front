// Public types of the shared overlay engine (./engine.ts).
//
// Framework-free. Every live-data consumer — PublicThemeRenderer (built-in
// themes), the external SDK (connectOverlay), the Designer preview and the
// published Designer runtime (/o/:publicId) — runs the SAME engine against
// the SAME protocol (MessagePack bulk + protobuf 0xC1 socket frames). Only the
// transport differs (see ./transport.ts).

import type { DeadTeamListEntry } from './deadTeamList.ts';

export type ConnectionPhase =
  | 'IDLE'
  | 'CONNECTING'
  | 'HYDRATING'
  | 'CONNECTED'
  | 'DEGRADED'        // serving via the cloud fallback instead of the local relay
  | 'RECONNECTING'
  | 'REHYDRATING'     // a seq gap / reconnect is waiting on a fresh snapshot
  | 'RELAY_OFFLINE'
  | 'UPSTREAM_OFFLINE'
  | 'STALE'
  | 'DESTROYED';

export interface EngineError {
  code: 'NOT_FOUND' | 'FETCH_FAILED';
  status: number | null;
  message: string;
}

export interface EngineStatus {
  phase: ConnectionPhase;
  /** False once the relay has failed to answer for RELAY_OFFLINE_AFTER_MS (or the app transport fell back to cloud). */
  relayReachable: boolean;
  /** Which origin the data path is on right now. */
  transport: 'relay' | 'cloud';
  socketConnected: boolean;
  /** The relay's own cloud connection (null = not reported yet / direct cloud). */
  upstreamConnected: boolean | null;
  /** True until the first HTTP state has been applied (or failed for good). */
  loading: boolean;
  error: EngineError | null;
  lastUpdateAt: number | null;
  lastLiveAt: number | null;
  lastSnapshotAt: number | null;
  lastSequence: number;
  sequenceGapCount: number;
  reconnectCount: number;
  httpFallbackCount: number;
  /** ms since the last live payload while a live match is loaded (0 otherwise). */
  staleForMs: number;
  /** A seq gap / reconnect asked for a snapshot that hasn't landed yet. */
  awaitingSnapshot: boolean;
  /** Highest Round.publicRev seen. */
  publicRev: number;
}

export interface EngineData {
  tournament: any | null;
  round: any | null;
  /** The currently-selected match object (bulk matchesData.current). */
  match: any | null;
  /** Every match of the round (schedule). */
  matches: any[];
  /** Live, merged roster for the current match — same shape the built-in themes receive. */
  matchData: any | null;
  /** Elimination list, oldest first. */
  deadTeamList: DeadTeamListEntry[];
  overallData: any | null;
  matchDatas: any[];
}

export interface DerivedState {
  teams: any[];
  liveTeams: any[];
  overallStandings: any[];
  matchStandings: any[];
  rankedStandings: any[];
  matchTotals: any | null;
  /** Round fragger ranking (official Gunslinger score) over every saved match. */
  fraggers: any[];
  /** Same formula over the current match only. */
  matchFraggers: any[];
  /** teamId -> WWCD chance % (health-based when the round's API is on, else alive*25). */
  wwcdChance: Record<string, number>;
}

export interface EngineState extends EngineData {
  status: EngineStatus;
  /** Lazily computed + memoised on input identity — reading nothing costs nothing. */
  derived: DerivedState;
}

export type EngineEventType =
  | 'kill'
  | 'elimination'
  | 'milestone'
  | 'recall'
  | 'matchStart'
  | 'matchEnd'
  | 'rankChange'
  | 'killsChange'
  | 'knock'
  | 'revive'
  | 'playerDeath'
  | 'sequenceGap'
  | 'snapshotRecovery'
  | 'bulkApplied';

export interface EngineEvent<P = any> {
  /** Deterministic where the source allows it, so a reconnect never re-fires the same event. */
  id: string;
  type: EngineEventType;
  timestamp: number;
  sequence: number;
  matchId: string | null;
  teamId?: string;
  playerId?: string;
  payload: P;
  expiresAt?: number;
}

export interface EngineOptions {
  tournamentId: string;
  roundId: string;
  /** A fixed match id. Omit to follow the operator's live selection. */
  matchId?: string | null;
  /** Follow whichever match the operator selects. Default: true when matchId is omitted. */
  followSelected?: boolean;
  /** Built-in view name — slims the payload and gates per-view behaviour. null/omitted = everything. */
  view?: string | null;
  /** Opaque value echoed back on the `bulkApplied` event of the fetch that started with it. */
  tag?: unknown;
  /** Static slices to paint before the first fetch (e.g. a localStorage shell cache). */
  initial?: Partial<Pick<EngineData, 'tournament' | 'round' | 'matches'>>;
  /** Keep PublicThemeRenderer's [bw] console lines. */
  verbose?: boolean;
  debug?: boolean;
}

export type EngineOptionsUpdate = Partial<Omit<EngineOptions, 'initial'>>;

export interface EngineDiagnostics {
  bulkFetches: number;
  bulkBytes: number;
  bulkErrors: number;
  socketMessages: Record<string, number>;
  socketBytes: number;
  deltasApplied: number;
  snapshotsApplied: number;
  snapshotsSkipped: number;
  snapshotRequests: number;
  cache: { entries: number; hits: number; misses: number; evictions: number; maxEntries: number };
  derived: Record<string, { executions: number; totalMs: number; avgMs: number }>;
  events: Record<string, number>;
  startedAt: number;
}

export type StateListener = (state: EngineState) => void;
export type EventListener = (event: EngineEvent) => void;

export interface OverlayEngine {
  getState(): EngineState;
  /** Called immediately with the current state, then on every change. */
  subscribe(listener: StateListener): () => void;
  /** Subscribe to one event type, or '*' for all. */
  on(type: EngineEventType | '*', listener: EventListener): () => void;
  /** Ask for a full authoritative live roster (rate-limited to 1/s). */
  requestSnapshot(reason?: string): void;
  /** Re-pull the HTTP state now (quiet — no loading flash). */
  refresh(): Promise<void>;
  /** Drop all live state and re-hydrate (quiet). */
  hardReset(): void;
  /** Change options. A tournament/round change fully re-initialises; anything else refetches. */
  update(options: EngineOptionsUpdate): void;
  diagnostics(): EngineDiagnostics;
  destroy(): void;
}
