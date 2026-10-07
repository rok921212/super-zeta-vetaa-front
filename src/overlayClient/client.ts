// SDK v1 facade for EXTERNAL, self-hosted overlays (served by the local relay
// at /sdk/v1/overlay-client.js — see desktop-app/relay/build-sdk.mjs).
//
// There is no protocol code here any more: connectOverlay() is a thin wrapper
// over the ONE shared engine (./engine.ts) that PublicThemeRenderer and the
// Designer also run, on a direct relay transport. It only maps the engine's
// state onto the v1 contract (desktop-app/relay/sdk/overlay-client.d.ts).
// Changes to that contract are additive only.

import { createOverlayEngine } from './engine.ts';
import { createDirectTransport, DEFAULT_RELAY_ORIGIN, type EngineTransport } from './transport.ts';
import type {
  ConnectionPhase,
  EngineDiagnostics,
  EngineEvent,
  EngineEventType,
  EngineState,
  OverlayEngine,
} from './engineTypes.ts';
import type { DeadTeamListEntry } from './deadTeamList.ts';

export const OVERLAY_API_VERSION = 1;
export { DEFAULT_RELAY_ORIGIN };

export interface OverlayClientOptions {
  tournamentId: string;
  roundId: string;
  /** A fixed match. Omit (or pass followSelected) to follow the operator's live selection. */
  matchId?: string;
  /** Follow whichever match the operator has selected. Default: true when matchId is omitted. */
  followSelected?: boolean;
  /**
   * Optional built-in view name (e.g. 'LiveStats'). Omit for EVERYTHING —
   * full player fields, overall standings and every match's data. Passing a
   * view slims the payload to what that view needs.
   */
  view?: string | null;
  /** Relay origin. Default http://127.0.0.1:8787 (the desktop app's local relay). */
  origin?: string;
  /** Resolve relative image paths (/def_logo.avif, /def_char.avif) against this origin. */
  assetBase?: string;
  debug?: boolean;
}

export interface OverlayStatus {
  /** Socket to the relay is up. */
  socketConnected: boolean;
  /** The relay's own cloud connection (null = not reported yet). */
  upstreamConnected: boolean | null;
  /** True until the first HTTP state has been applied. */
  loading: boolean;
  error: string | null;
  /** Epoch ms of the last applied change (HTTP or socket). */
  lastUpdateAt: number | null;
  /** Epoch ms of the last live socket payload. */
  lastLiveAt: number | null;
  /** Last live sequence number applied (0 = none yet). */
  seq: number;
  /** Highest Round.publicRev seen. */
  publicRev: number;
  // ── additive (v1.1) ──
  phase: ConnectionPhase;
  /** False once the relay hasn't answered for ~8s (the client keeps retrying). */
  relayReachable: boolean;
  lastSnapshotAt: number | null;
  sequenceGapCount: number;
  reconnectCount: number;
  staleForMs: number;
}

export interface OverlayState {
  apiVersion: number;
  status: OverlayStatus;
  tournament: any | null;
  round: any | null;
  match: any | null;
  matches: any[];
  /** Live, merged roster for the current match — same shape the built-in themes receive. */
  matchData: any | null;
  /** Elimination list, oldest first. */
  deadTeamList: DeadTeamListEntry[];
  overallData: any | null;
  matchDatas: any[];
  /** Lazily computed on read. */
  derived: EngineState['derived'];
}

export type OverlayListener = (state: OverlayState) => void;

export interface OverlayFeed {
  /** Called immediately with the current state, then on every change. Returns an unsubscribe fn. */
  subscribe(listener: OverlayListener): () => void;
  getState(): OverlayState;
  /** Ask for a full authoritative live roster (rate-limited to 1/s). */
  requestSnapshot(): void;
  /** Re-pull the HTTP state now. */
  refresh(): Promise<void>;
  close(): void;
  // ── additive (v1.1) ──
  /** Live events: kill / elimination / milestone / recall / matchStart / matchEnd / rankChange / killsChange / ... */
  on(type: EngineEventType | '*', listener: (event: EngineEvent) => void): () => void;
  diagnostics(): EngineDiagnostics;
  /** Resolve a possibly-relative asset URL (team logo, player photo) for this page. */
  resolveAsset(url: string | null | undefined): string;
}

/** Absolute URLs pass through; root-relative ones resolve against `assetBase`. */
export function resolveAssetUrl(url: string | null | undefined, assetBase?: string | null): string {
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (!assetBase) return url;
  return `${assetBase.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

function toV1(s: EngineState): OverlayState {
  const st = s.status;
  return {
    apiVersion: OVERLAY_API_VERSION,
    status: {
      socketConnected: st.socketConnected,
      upstreamConnected: st.upstreamConnected,
      loading: st.loading,
      error: st.error ? st.error.message : null,
      lastUpdateAt: st.lastUpdateAt,
      lastLiveAt: st.lastLiveAt,
      seq: st.lastSequence,
      publicRev: st.publicRev,
      phase: st.phase,
      relayReachable: st.relayReachable,
      lastSnapshotAt: st.lastSnapshotAt,
      sequenceGapCount: st.sequenceGapCount,
      reconnectCount: st.reconnectCount,
      staleForMs: st.staleForMs,
    },
    tournament: s.tournament,
    round: s.round,
    match: s.match,
    matches: s.matches,
    matchData: s.matchData,
    deadTeamList: s.deadTeamList,
    overallData: s.overallData,
    matchDatas: s.matchDatas,
    derived: s.derived,
  };
}

/** @param internal test seam — not part of the public contract. */
export function connectOverlay(options: OverlayClientOptions, internal?: { transport?: EngineTransport }): OverlayFeed {
  if (!options?.tournamentId || !options?.roundId) {
    throw new Error('connectOverlay: tournamentId and roundId are required');
  }
  const engine: OverlayEngine = createOverlayEngine(
    {
      tournamentId: options.tournamentId,
      roundId: options.roundId,
      matchId: options.matchId,
      followSelected: options.followSelected,
      view: options.view ?? null,
      debug: options.debug,
    },
    { transport: internal?.transport ?? createDirectTransport(options.origin || DEFAULT_RELAY_ORIGIN) }
  );

  // Keep v1 state objects stable per engine publish.
  let lastEngineState: EngineState | null = null;
  let lastV1: OverlayState | null = null;
  const v1 = (s: EngineState): OverlayState => {
    if (s !== lastEngineState || !lastV1) {
      lastEngineState = s;
      lastV1 = toV1(s);
    }
    return lastV1;
  };

  return {
    subscribe(listener) {
      return engine.subscribe((s) => listener(v1(s)));
    },
    getState: () => v1(engine.getState()),
    requestSnapshot: () => engine.requestSnapshot('manual'),
    refresh: () => engine.refresh(),
    close: () => engine.destroy(),
    on: (type, listener) => engine.on(type, listener),
    diagnostics: () => engine.diagnostics(),
    resolveAsset: (url) => resolveAssetUrl(url, options.assetBase),
  };
}
