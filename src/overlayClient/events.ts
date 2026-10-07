// The engine's live-event stream: kill / elimination / milestone / recall /
// matchStart / matchEnd / rankChange / killsChange / knock / revive /
// playerDeath.
//
// Driven from state changes (not raw frames), using the SAME detectors the
// theme hooks use (./detectors.ts). Rules shared by every event type:
//   - Event ids are deterministic from the data (matchId + subject + counter),
//     and a per-match bounded seen-set drops repeats — so a reconnect /
//     snapshot replaying the same state never re-fires a notification.
//   - The first state the engine sees for a match SEEDS the detectors
//     silently: an overlay opened mid-match must not replay every kill and
//     elimination that already happened. (matchStart is the exception — it
//     fires on a genuine followSelected boundary.)
//   - The engine only runs this processor while something listens for a
//     detected type, and re-seeds it (reset) when the first such listener
//     attaches.

import { createKillDetector, createMilestoneDetector, createPlayerStateDetector, createRecallDetector } from './detectors.ts';
import type { DeadTeamListEntry } from './deadTeamList.ts';
import type { DerivedState, EngineData, EngineEvent, EngineEventType } from './engineTypes.ts';

const SEEN_LIMIT = 5000;

export interface EventContext {
  data: EngineData;
  derived: DerivedState;
  sequence: number;
  now: number;
}

export interface EventProcessor {
  /** Run detectors for the types in `wanted` over the new state. Returns new (deduped) events. */
  process(ctx: EventContext, wanted: Set<EngineEventType>): EngineEvent[];
  reset(): void;
}

const matchKey = (md: any): string | null => (md?.matchId != null ? String(md.matchId) : null);

export function createEventProcessor(): EventProcessor {
  let kills = createKillDetector();
  let milestones = createMilestoneDetector();
  let recalls = createRecallDetector();
  let playerStates = createPlayerStateDetector();
  let seen = new Set<string>();
  let currentMatch: string | null = null;
  let seeded = false;
  let lastMatchData: any = null;
  let lastDeadList: DeadTeamListEntry[] | null = null;
  let prevRanks = new Map<string, number>();
  let prevKills = new Map<string, number>();
  let wasContested = false;
  let pendingMatchStart: { from: string; to: string } | null = null;

  const reset = () => {
    kills = createKillDetector();
    milestones = createMilestoneDetector();
    recalls = createRecallDetector();
    playerStates = createPlayerStateDetector();
    seen = new Set();
    currentMatch = null;
    seeded = false;
    lastMatchData = null;
    lastDeadList = null;
    prevRanks = new Map();
    prevKills = new Map();
    wasContested = false;
    pendingMatchStart = null;
  };

  const make = (
    ctx: EventContext,
    type: EngineEventType,
    id: string,
    payload: any,
    extra: Partial<EngineEvent> = {}
  ): EngineEvent | null => {
    if (seen.has(id)) return null;
    seen.add(id);
    if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string);
    return { id, type, timestamp: ctx.now, sequence: ctx.sequence, matchId: currentMatch, payload, ...extra };
  };

  return {
    reset,
    process(ctx, wanted) {
      const md = ctx.data.matchData;
      if (!md || !Array.isArray(md.teams)) return [];
      if (md === lastMatchData && ctx.data.deadTeamList === lastDeadList) return [];
      lastMatchData = md;
      lastDeadList = ctx.data.deadTeamList;

      const mid = matchKey(md);
      if (mid !== currentMatch) {
        if (currentMatch != null && mid != null) pendingMatchStart = { from: currentMatch, to: mid };
        currentMatch = mid;
        seeded = false;
        seen = new Set();
        prevRanks = new Map();
        prevKills = new Map();
        wasContested = false;
      }

      const out: EngineEvent[] = [];
      const push = (e: EngineEvent | null) => { if (e) out.push(e); };

      if (pendingMatchStart && wanted.has('matchStart')) {
        push(make(ctx, 'matchStart', `${mid}:matchStart`, { previousMatchId: pendingMatchStart.from, match: ctx.data.match }));
      }
      pendingMatchStart = null;

      // All detectors run on every processed change (so each one's baseline
      // stays current); only EMISSION is gated on `wanted`.
      const killFound = kills.process(md);
      const milestoneFound = milestones.process(md);
      const recallFound = recalls.process(md, ctx.data.match?.map);
      const stateFound = playerStates.process(md);

      const needTeams = wanted.has('rankChange') || wanted.has('killsChange') || wanted.has('matchEnd');
      const teams: any[] = needTeams ? ctx.derived.teams : [];

      if (!seeded) {
        // Baseline only.
        for (const e of ctx.data.deadTeamList) seen.add(`${mid}:elim:${e.teamId}`);
        for (const t of teams) {
          const id = String(t.teamId ?? t._id);
          prevRanks.set(id, t.teamRank);
          prevKills.set(id, t.totalKills);
        }
        wasContested = teams.filter((t) => !t.isAllDead).length > 1;
        seeded = true;
        return out;
      }

      if (wanted.has('kill')) {
        for (const k of killFound) {
          push(make(ctx, 'kill', `${mid}:kill:${k.playerId}:${k.killNum}`, k, { teamId: k.teamId, playerId: k.playerId }));
        }
      }

      if (wanted.has('elimination')) {
        for (const e of ctx.data.deadTeamList) {
          push(make(ctx, 'elimination', `${mid}:elim:${e.teamId}`, e, { teamId: String(e.teamId) }));
        }
      } else {
        for (const e of ctx.data.deadTeamList) seen.add(`${mid}:elim:${e.teamId}`);
      }

      if (milestoneFound && wanted.has('milestone')) {
        const p = milestoneFound.player;
        const pid = String(p?.uId ?? p?._id ?? p?.playerName ?? '');
        push(make(ctx, 'milestone', `${mid}:ms:${pid}:${milestoneFound.type}:${milestoneFound.value ?? ''}`,
          milestoneFound, { playerId: pid }));
      }

      if (wanted.has('recall')) {
        for (const r of recallFound) {
          // A player can be recalled more than once — count per player.
          let n = 1;
          while (seen.has(`${mid}:recall:${r.id}:${n}`)) n++;
          push(make(ctx, 'recall', `${mid}:recall:${r.id}:${n}`, r, { teamId: r.teamId, playerId: r.id }));
        }
      }

      // A player can be knocked / revived repeatedly — count per player and kind.
      for (const s of stateFound) {
        if (!wanted.has(s.kind)) continue;
        let n = 1;
        while (seen.has(`${mid}:${s.kind}:${s.playerId}:${n}`)) n++;
        push(make(ctx, s.kind, `${mid}:${s.kind}:${s.playerId}:${n}`, s, { teamId: s.teamId, playerId: s.playerId }));
      }

      if (needTeams) {
        for (const t of teams) {
          const id = String(t.teamId ?? t._id);
          const rank = t.teamRank;
          const killsNow = t.totalKills;
          const pr = prevRanks.get(id);
          const pk = prevKills.get(id);
          if (wanted.has('rankChange') && pr !== undefined && pr !== rank) {
            push(make(ctx, 'rankChange', `${mid}:rank:${id}:${ctx.sequence}:${pr}>${rank}`,
              { team: t, previousRank: pr, rank }, { teamId: id }));
          }
          if (wanted.has('killsChange') && pk !== undefined && pk !== killsNow) {
            push(make(ctx, 'killsChange', `${mid}:kills:${id}:${killsNow}`,
              { team: t, previousKills: pk, kills: killsNow }, { teamId: id }));
          }
          prevRanks.set(id, rank);
          prevKills.set(id, killsNow);
        }
        const alive = teams.filter((t) => !t.isAllDead && (t.players || []).length > 0);
        if (wasContested && alive.length <= 1 && wanted.has('matchEnd')) {
          push(make(ctx, 'matchEnd', `${mid}:matchEnd`, { winner: alive[0] ?? null, match: ctx.data.match }));
        }
        wasContested = alive.length > 1;
      }
      return out;
    },
  };
}
