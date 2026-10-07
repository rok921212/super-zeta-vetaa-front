// Ready-made live behaviour for templates and inserted data elements: the
// rules an overlay of that kind is expected to have out of the box (a knocked
// player pulses, a dead one greys out, a recall lights up, a wiped team dims).
//
// Every behaviour is an ordinary Animate-panel rule (editor/animationLibrary),
// so the user sees it in the rule list and can change or delete it.

import type { LayoutElement, TimelineClip } from '../schema/layoutTypes.ts';
import { DEFAULT_OPTIONS, ruleToClip, withLifecycle, type EffectOptions, type TriggerContext } from '../editor/animationLibrary.ts';

/** What an effect needs to know about a layer — a template element, or an insert-panel draft that has no id yet. */
type Geometry = Pick<LayoutElement, 'type' | 'x' | 'y' | 'w' | 'h'> & Pick<Partial<LayoutElement>, 'rotation' | 'opacity' | 'style' | 'timeline'>;

/** [trigger id, effect id, option overrides?] */
export type BehaviorSpec = [string, string, Partial<EffectOptions>?];

/** Raw match players (`item.players` of a team) — `liveState`, not the live.* `knocked` flag. */
const RAW_PLAYER: TriggerContext = { item: { liveState: 0, bHasDied: false, health: 100 } };
/** `live.players` / `live.alivePlayers` rows. */
const LIVE_PLAYER: TriggerContext = { item: { knocked: false, dead: false, healthPct: 100 } };

function clipsFor(el: Geometry, specs: BehaviorSpec[], ctx: TriggerContext): TimelineClip[] {
  return specs.map(([trigger, effect, options], i) =>
    ruleToClip(el as LayoutElement, { trigger, effect, options: { ...DEFAULT_OPTIONS, ...(options || {}) } }, `b${i + 1}`, ctx));
}

/** Add behaviour rules to an element (after any clips it already has). */
export function withBehaviors<T extends Geometry>(el: T, specs: BehaviorSpec[], ctx: TriggerContext = {}): T {
  const existing = el.timeline?.clips || [];
  const taken = new Set(existing.map((c) => c.id));
  const added = clipsFor(el, specs, ctx).map((c) => {
    let id = c.id;
    for (let n = 1; taken.has(id); n++) id = `b${n}`;
    taken.add(id);
    return { ...c, id };
  });
  return { ...el, timeline: { clips: [...existing, ...added] } };
}

/** A player marker fed by a team's raw players (alive pips, roster cards). */
export const rawPlayerBehaviors = <T extends Geometry>(el: T, specs: BehaviorSpec[] = [
  ['playerKnocked', 'blinkLoop'],
  ['playerRevived', 'pop'],
  ['playerRecalled', 'pop'],
]): T => withBehaviors(el, specs, RAW_PLAYER);

/** A whole player row fed by live.players. */
export const livePlayerBehaviors = <T extends Geometry>(el: T, specs: BehaviorSpec[] = [
  ['playerKnocked', 'alertPulse'],
  ['playerDead', 'greyOut'],
  ['playerRecalled', 'glow'],
  ['playerRevived', 'glow'],
  ['playerKill', 'pop'],
]): T => withBehaviors(el, specs, LIVE_PLAYER);

/** A team row (or its background). */
export const teamRowBehaviors = <T extends Geometry>(el: T, specs: BehaviorSpec[] = [
  ['teamEliminated', 'dim'],
  ['teamKill', 'glow'],
  ['teamKnock', 'shake'],
]): T => withBehaviors(el, specs);

/**
 * In → stay → out. `staySeconds` null = it stays until its "Only show when…"
 * condition hides it; a number = it leaves by itself after that long (an
 * alert, or with no condition a one-off intro).
 */
export const lifecycle = <T extends Geometry>(el: T, inEffect: string | null, staySeconds: number | null, outEffect: string | null): T =>
  withLifecycle(el as unknown as LayoutElement, { in: inEffect, stay: staySeconds, out: outEffect }) as unknown as T;
