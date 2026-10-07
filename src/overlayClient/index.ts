// Public entry point of the external overlay client — bundled by
// desktop-app/relay/build-sdk.mjs and served by the local relay at
// http://127.0.0.1:8787/sdk/v1/overlay-client.js.
//
//   import { connectOverlay } from 'http://127.0.0.1:8787/sdk/v1/overlay-client.js';
//   const feed = connectOverlay({ tournamentId, roundId });
//   feed.subscribe((state) => render(state));
//
// Everything exported here is part of the v1 contract. Additive changes only;
// a breaking change needs /sdk/v2.

export {
  connectOverlay,
  resolveAssetUrl,
  OVERLAY_API_VERSION,
  DEFAULT_RELAY_ORIGIN,
  type OverlayClientOptions,
  type OverlayFeed,
  type OverlayListener,
  type OverlayState,
  type OverlayStatus,
} from './client.ts';

// The shared engine itself (v1.1) — the same one the built-in themes run.
export { createOverlayEngine } from './engine.ts';
export { createDirectTransport } from './transport.ts';
export type {
  OverlayEngine,
  EngineOptions,
  EngineState,
  EngineStatus,
  EngineEvent,
  EngineEventType,
  ConnectionPhase,
  DerivedState,
} from './engineTypes.ts';

// The raw building blocks, for overlays that want to consume the socket
// themselves but keep the built-in themes' numbers.
export { decodeWireMessage, PROTOBUF_MARKER_BYTE } from './wire.ts';
export { computeDeadTeamList, sortDeadTeamList, isTeamAllDead, type DeadTeamListEntry } from './deadTeamList.ts';
export { mergeTeamsWithPlayers, replaceTeamsPinningIds, normalizeMatchTeams } from '../dashboard/matchTeamMerge.ts';
export { deriveTeams, isPlayerDead } from '../Themes/shared/hooks/unsortteams.ts';
export {
  buildOverallStandings,
  computeMatchStandings,
  computeRankedStandings,
} from '../Themes/shared/hooks/officialStandings.ts';
export { computeMatchTotals } from '../Themes/shared/hooks/matchTotals.ts';
export { buildFraggerPool, computeFraggerScores, compareFraggerScore } from '../Themes/shared/hooks/fraggerScore.ts';
export { wwcdChance } from '../Themes/shared/hooks/liveDerived.ts';
export { createMilestoneDetector, createRecallDetector, createKillDetector } from './detectors.ts';
export { overlay as overlayProto } from '../proto/overlay.pb';
