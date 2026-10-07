// The binding scope an element actually sees at render time, for the
// Inspector's DataPicker and live-value previews. Mirrors LayoutRenderer:
// root scope -> itemScope() per repeater ancestor (first item) -> `event`
// for event-driven elements (last seen event of that type, else a sample).

import type { AnimationEvent, LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { buildScope, itemScope, resolveRepeaterItems, type BindingScope, type DataState, type FeedState } from '../bindings/index.ts';
import type { EngineEvent } from '../../overlayClient/engineTypes.ts';
import { locate } from './tree.ts';

/** A plausible event per type, used when no real one has fired yet (editor preview only). */
export function sampleEvent(type: AnimationEvent, state: DataState | null): EngineEvent {
  const team = state?.derived?.teams?.[0] ?? { teamName: 'Alpha Wolves', teamTag: 'AW', teamLogo: '/def_logo.avif', totalKills: 7, rank: 3 };
  const player = team.players?.[0] ?? { playerName: 'AW_Ace', killNum: 3, health: 100 };
  const payloads: Record<AnimationEvent, any> = {
    kill: { player, killNum: player.killNum ?? 3, teamTag: team.teamTag, teamName: team.teamName, teamId: team.teamId, teamLogo: team.teamLogo },
    elimination: { teamName: team.teamName, teamTag: team.teamTag, teamLogo: team.teamLogo, totalKills: team.totalKills ?? 0, rank: team.rank ?? 16, teamId: team.teamId },
    milestone: { player, type: 'kills', value: 5 },
    recall: { ...player, teamId: team.teamId, teamName: team.teamName },
    matchStart: { previousMatchId: null, match: state?.match ?? null },
    matchEnd: { winner: team, match: state?.match ?? null },
    rankChange: { team, previousRank: 5, rank: 3 },
    killsChange: { team, previousKills: 4, kills: 5 },
    knock: { kind: 'knock', player, playerId: player.uId, teamId: team.teamId, teamTag: team.teamTag, teamLogo: team.teamLogo, from: 'alive', to: 'knocked' },
    revive: { kind: 'revive', player, playerId: player.uId, teamId: team.teamId, teamTag: team.teamTag, teamLogo: team.teamLogo, from: 'knocked', to: 'alive' },
    playerDeath: { kind: 'playerDeath', player, playerId: player.uId, teamId: team.teamId, teamTag: team.teamTag, teamLogo: team.teamLogo, from: 'knocked', to: 'dead' },
  };
  return { id: `sample:${type}`, type, timestamp: Date.now(), sequence: 0, matchId: null, payload: payloads[type] };
}

/**
 * The canvas gets ONE sample event for every idle event-driven element, so it
 * carries the union of the kill and elimination payload fields.
 */
export function canvasSampleEvent(state: DataState | null): EngineEvent {
  const kill = sampleEvent('kill', state);
  const elim = sampleEvent('elimination', state);
  return { ...kill, id: 'sample:preview', payload: { ...elim.payload, ...kill.payload, totalKills: elim.payload.totalKills, rank: elim.payload.rank } };
}

/** The event type an element (or its nearest ancestor) is driven by, if any. */
export function eventTypeFor(doc: LayoutDocument, id: string): AnimationEvent | null {
  const loc = locate(doc.elements, id);
  if (!loc) return null;
  const chain: LayoutElement[] = [...loc.ancestors, loc.el];
  for (let i = chain.length - 1; i >= 0; i--) {
    const ev = chain[i].anim?.onEvent?.event;
    if (ev) return ev;
  }
  return null;
}

export function scopeForElement(
  doc: LayoutDocument,
  id: string | null,
  state: DataState | null,
  lastEvents: Partial<Record<string, EngineEvent>> = {},
  feed?: FeedState | null
): BindingScope {
  let scope = buildScope(state, doc, feed, { sampleLocal: true });
  if (!id) return scope;
  const loc = locate(doc.elements, id);
  if (!loc) return scope;
  // Repeater ancestors: the element sees the FIRST item of each (outermost first).
  // A repeater's own props are evaluated in the outer scope, so only ancestors count.
  for (const a of loc.ancestors) {
    if (a.type !== 'repeater' || !a.repeater) continue;
    const items = resolveRepeaterItems(a.repeater, scope);
    scope = itemScope(scope, items[0] ?? {}, 0, a.repeater.offset || 0);
  }
  const evType = eventTypeFor(doc, id);
  if (evType) scope = { ...scope, event: lastEvents[evType] ?? sampleEvent(evType, state) };
  return scope;
}
