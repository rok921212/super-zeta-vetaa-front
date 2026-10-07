// Pure state transitions of the overlay protocol.
//
// Moved verbatim (semantics, not just shape) out of PublicThemeRenderer's
// applyBulkPayload / processLiveMatchUpdate / handleLiveMatchSnapshot /
// handleOverallDataUpdate, so every consumer applies the wire the same way.
// Each function takes the current data + the mutable per-match bookkeeping
// and returns the next data (untouched slices keep their identity, so a
// theme's useMemo on e.g. `overallData` does not recompute on a live tick).

import { mergeTeamsWithPlayers, normalizeMatchTeams, replaceTeamsPinningIds } from '../dashboard/matchTeamMerge.ts';
import {
  computeDeadTeamList,
  sortDeadTeamList,
  newDeathTracker,
  type DeathTracker,
} from './deadTeamList.ts';
import type { EngineData } from './engineTypes.ts';

export interface LiveBook {
  /** Backs computeDeadTeamList — per-match, stamps each wipe once. */
  deathTracker: { current: DeathTracker };
  /** The dead list only changes when its length does (entries are never re-mutated). */
  lastDeadLength: number;
  /** Last live seq applied; 0 = no baseline yet (first payload is always in-order). */
  lastSeq: number;
  /** matchId whose roster the SOCKET owns — bulk (Mongo, SAVE-DATA-backed) must not overwrite it. */
  socketOwnedMatchId: string | null;
  /** Highest Round.publicRev from any socket signal. */
  knownRev: number;
  /** Highest rev actually applied to live state. */
  appliedRev: number;
  /** Highest roundStructureChanged version acted on. */
  structureVersion: number;
}

export const newLiveBook = (): LiveBook => ({
  deathTracker: { current: newDeathTracker() },
  lastDeadLength: 0,
  lastSeq: 0,
  socketOwnedMatchId: null,
  knownRev: 0,
  appliedRev: 0,
  structureVersion: 0,
});

export const emptyData = (): EngineData => ({
  tournament: null,
  round: null,
  match: null,
  matches: [],
  matchData: null,
  deadTeamList: [],
  overallData: null,
  matchDatas: [],
});

/** Per-match bookkeeping reset (followSelected match boundary). Keeps structureVersion. */
export function resetMatchScope(book: LiveBook): void {
  book.knownRev = 0;
  book.appliedRev = 0;
  book.deathTracker.current = newDeathTracker();
  book.lastDeadLength = 0;
  book.lastSeq = 0;
}

/** Full live reset (public-cache invalidation / round change). */
export function resetLive(book: LiveBook): void {
  resetMatchScope(book);
  book.socketOwnedMatchId = null;
}

export interface BulkResult {
  data: EngineData;
  /** False when the body was older than a socket signal and its live slices were skipped. */
  liveApplied: boolean;
}

/**
 * Apply an HTTP bulk body. Static/structural slices always apply; live slices
 * only when the body is at least as new as the highest socket-signalled rev,
 * and the match roster only when the socket doesn't already own it.
 */
export function applyBulk(prev: EngineData, book: LiveBook, bulk: any, httpRev: number | null): BulkResult {
  let data: EngineData = {
    ...prev,
    tournament: bulk?.tournamentData ?? null,
    round: bulk?.roundData ?? null,
    match: bulk?.matchesData?.current ?? null,
    matches: bulk?.matchesData?.list ?? [],
  };

  if (httpRev !== null && httpRev < book.knownRev) return { data, liveApplied: false };

  const rawMatchData = bulk?.currentMatchData?.matchData ?? null;
  const bulkMatchId = rawMatchData?.matchId != null ? String(rawMatchData.matchId) : null;
  const liveOwnedBySocket =
    bulkMatchId != null &&
    book.socketOwnedMatchId === bulkMatchId &&
    prev.matchData != null &&
    String(prev.matchData.matchId) === bulkMatchId;

  if (!liveOwnedBySocket) {
    const initial = rawMatchData ? { ...rawMatchData, teams: normalizeMatchTeams(rawMatchData.teams) } : null;
    const computed = computeDeadTeamList(initial?.matchId, initial?.teams, book.deathTracker);
    data.matchData = initial ? { ...initial, deadTeamList: computed } : null;
    book.lastDeadLength = computed.length;
    data.deadTeamList = sortDeadTeamList(computed);
  }

  const rawOverall = bulk?.overallData ?? null;
  data.overallData = rawOverall ? { ...rawOverall, teams: normalizeMatchTeams(rawOverall.teams) } : null;
  data.matchDatas = (bulk?.matchDatasData ?? []).map((e: any) => e.matchData).filter(Boolean);

  if (httpRev !== null) book.appliedRev = Math.max(book.appliedRev, httpRev);
  data = { ...data };
  return { data, liveApplied: true };
}

/** Does this live payload belong to the match this consumer is showing? */
export const isOurMatch = (incoming: any, followSelected: boolean, matchId: string | null): boolean =>
  followSelected || String(incoming?.matchId) === String(matchId);

export interface LiveResult {
  data: EngineData;
  /** The payload is a different match than the one held (followSelected boundary). */
  boundary: boolean;
  /** A delta skipped at least one seq. */
  gap: boolean;
  /** A snapshot older than applied deltas — ignored. */
  skipped: boolean;
  previousMatchId: string | null;
}

/**
 * A team-level (and within a team, player-level) DELTA. Merged by id onto the
 * latest roster; a gap still merges what DID arrive (the caller asks for a
 * snapshot to repair what didn't).
 */
export function applyLiveDelta(prev: EngineData, book: LiveBook, incoming: any): LiveResult {
  const incomingTeams: any[] = Array.isArray(incoming.teams) ? incoming.teams : [];
  const prevMatchData = prev.matchData;
  const previousMatchId = prevMatchData?.matchId != null ? String(prevMatchData.matchId) : null;
  const sameMatch = previousMatchId != null && previousMatchId === String(incoming.matchId);

  const boundary = previousMatchId != null && !sameMatch;
  if (boundary) resetMatchScope(book);

  let gap = false;
  const incomingSeq = typeof incoming.seq === 'number' ? incoming.seq : null;
  if (incomingSeq != null) {
    const prevSeq = book.lastSeq;
    if (prevSeq > 0 && incomingSeq > prevSeq + 1) gap = true;
    if (incomingSeq > prevSeq) book.lastSeq = incomingSeq;
  }

  const mergedTeams = mergeTeamsWithPlayers(sameMatch ? prevMatchData?.teams || [] : [], incomingTeams);
  // Re-check only the teams in this delta — against their FULL merged roster
  // (a changed team's `players` may be just the one player who changed).
  const changedKeys = new Set(incomingTeams.map((t) => String(t.teamId ?? t._id)));
  const computed = computeDeadTeamList(
    incoming.matchId,
    mergedTeams.filter((t) => changedKeys.has(String(t.teamId ?? t._id))),
    book.deathTracker
  );
  const matchData = sameMatch
    ? { ...prevMatchData, ...incoming, teams: mergedTeams, deadTeamList: computed }
    : { ...incoming, teams: mergedTeams, deadTeamList: computed };
  book.socketOwnedMatchId = String(incoming.matchId);

  let deadTeamList = prev.deadTeamList;
  // A boundary ALWAYS republishes: the reset set lastDeadLength to 0, and a new
  // match with no wipes yet is also 0 — the length gate alone would keep the
  // previous match's elimination list on screen (a bug the old renderer had).
  if (boundary || computed.length !== book.lastDeadLength) {
    book.lastDeadLength = computed.length;
    deadTeamList = sortDeadTeamList(computed);
  }
  return { data: { ...prev, matchData, deadTeamList }, boundary, gap, skipped: false, previousMatchId };
}

/**
 * A FULL authoritative roster (hydration / keyframe / requested). REPLACES
 * the merged roster — this is where anything a lost delta left wrong is fixed.
 */
export function applyLiveSnapshot(prev: EngineData, book: LiveBook, incoming: any): LiveResult {
  const prevMatchData = prev.matchData;
  const previousMatchId = prevMatchData?.matchId != null ? String(prevMatchData.matchId) : null;
  const sameMatch = previousMatchId != null && previousMatchId === String(incoming.matchId);
  const incomingSeq = typeof incoming.seq === 'number' ? incoming.seq : null;

  if (sameMatch && incomingSeq != null && incomingSeq < book.lastSeq) {
    return { data: prev, boundary: false, gap: false, skipped: true, previousMatchId };
  }
  const boundary = previousMatchId != null && !sameMatch;
  if (boundary) resetMatchScope(book);
  if (incomingSeq != null && incomingSeq > book.lastSeq) book.lastSeq = incomingSeq;

  const teams = replaceTeamsPinningIds(sameMatch ? prevMatchData?.teams || [] : [], incoming.teams || []);
  // EVERY team: this is where a team whose final death delta was lost is recorded.
  const computed = computeDeadTeamList(incoming.matchId, teams, book.deathTracker);
  const matchData = sameMatch
    ? { ...prevMatchData, ...incoming, teams, deadTeamList: computed }
    : { ...incoming, teams, deadTeamList: computed };
  book.socketOwnedMatchId = String(incoming.matchId);

  let deadTeamList = prev.deadTeamList;
  // A boundary ALWAYS republishes: the reset set lastDeadLength to 0, and a new
  // match with no wipes yet is also 0 — the length gate alone would keep the
  // previous match's elimination list on screen (a bug the old renderer had).
  if (boundary || computed.length !== book.lastDeadLength) {
    book.lastDeadLength = computed.length;
    deadTeamList = sortDeadTeamList(computed);
  }
  return { data: { ...prev, matchData, deadTeamList }, boundary, gap: false, skipped: false, previousMatchId };
}

/** Team-level delta of the ROUND standings — keyed on roundId, never matchId. */
export function applyOverallDelta(prev: EngineData, incoming: any): EngineData {
  const incomingTeams: any[] = Array.isArray(incoming.teams) ? incoming.teams : [];
  const prevOverall = prev.overallData;
  const prevTeams: any[] =
    prevOverall && String(prevOverall.roundId) === String(incoming.roundId) ? prevOverall.teams || [] : [];
  const overallData = { ...(prevOverall || {}), ...incoming, teams: mergeTeamsWithPlayers(prevTeams, incomingTeams) };
  return { ...prev, overallData };
}
