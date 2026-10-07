// The Animate panel's vocabulary: "WHEN <trigger> → DO <effect>".
//
// A rule is not a second animation system — it is a recipe that BUILDS an
// ordinary timeline clip (the same clips the keyframe Timeline edits and the
// renderer plays). `clip.preset` remembers which effect + options built it, so
// the rule can be shown and re-edited later; the trigger is read back from the
// clip's own trigger.
//
// Triggers are phrased for the place a layer sits: anywhere on the stage, in a
// team row, or in a player row (a repeater item).

import type { AnimationEvent, ClipTrigger, Condition, LayoutElement, TimelineClip } from '../schema/layoutTypes.ts';
import {
  DEFAULT_OPTIONS, EFFECTS, EFFECT_LIST, colorPropOf, matchingExit, type EffectDef, type EffectGroup, type EffectOptions,
} from './animationEffects.ts';
import type { SimulationControls } from './simulation.ts';

// ── where the layer sits ────────────────────────────────────────────────────

export type RowKind = 'none' | 'team' | 'player';

/** What a repeater item is: a team (has players / a team id) or a player. */
export function rowKindOf(item: unknown, repeaterSource?: string | null): RowKind {
  if (item && typeof item === 'object' && Object.keys(item as object).length) {
    const it = item as any;
    if (Array.isArray(it.players)) return 'team';
    if (it.uId != null || it.playerName != null) return 'player';
    if (it.teamId != null || it.teamName != null || it.teamTag != null) return 'team';
  }
  if (!repeaterSource) return 'none';
  return /players|fraggers/i.test(repeaterSource) ? 'player' : /teams|standings|deadTeamList/i.test(repeaterSource) ? 'team' : 'none';
}

// ── effects (the catalogue lives in animationEffects.ts) ────────────────────

export {
  DEFAULT_OPTIONS, EFFECTS, EFFECT_GROUP_LABEL, EFFECT_LIST, colorPropOf, matchingExit,
  type EffectDef, type EffectGroup, type EffectOptions,
} from './animationEffects.ts';

export const SPEEDS: Array<{ value: number; label: string }> = [
  { value: 0.6, label: 'Fast' }, { value: 1, label: 'Normal' }, { value: 1.6, label: 'Slow' },
];

// ── triggers ────────────────────────────────────────────────────────────────

export type TriggerKind = 'enter' | 'exit' | 'loop' | 'event' | 'state';

/** Which effect groups make sense for a kind of trigger (in menu order). */
export const EFFECT_GROUPS_FOR: Record<TriggerKind, EffectGroup[]> = {
  enter: ['in', 'attention'],
  exit: ['out'],
  loop: ['loop'],
  event: ['attention', 'popup'],
  state: ['state', 'loop', 'in'],
};

export interface TriggerContext {
  /** The repeater item the layer sees (first row), if it sits in a repeater. */
  item?: any;
  /** The number for "N or fewer" triggers. */
  n?: number;
}

export interface TriggerDef {
  id: string;
  /** Full sentence after "When…". */
  label: string;
  kind: TriggerKind;
  rows: RowKind | 'any';
  /** A number the user sets (teams left, players alive, health %). */
  param?: { label: string; default: number; min: number; max: number };
  defaultEffect: string;
  make(ctx: TriggerContext): ClipTrigger;
  /** Recognise a clip trigger this definition made; returns its number, if any. */
  match(t: ClipTrigger): { n?: number } | null;
  /** SIMULATION: make it happen / undo it, so the rule can be tested. */
  test?(sim: SimulationControls): void;
  untest?(sim: SimulationControls): void;
}

const rule = (c: Condition | undefined): { path: string; op: string; value?: any } | null =>
  (c && 'path' in c ? (c as any) : null);

const eventTrigger = (
  id: string, label: string, rows: RowKind | 'any', event: AnimationEvent, self: boolean, defaultEffect: string,
  test?: (s: SimulationControls) => void
): TriggerDef => ({
  id, label, kind: 'event', rows, defaultEffect, test,
  make: () => ({ type: 'event', event, ...(self ? { self: true } : null) }),
  match: (t) => (t.type === 'event' && t.event === event && !!t.self === self && !t.filter ? {} : null),
});

/** A state on a row field: `item.<field> <op> <value>`, reverting when it stops being true. */
const stateTrigger = (
  id: string, label: string, rows: RowKind | 'any', defaultEffect: string,
  pick: (ctx: TriggerContext) => Condition,
  is: (when: Condition) => { n?: number } | null,
  extra: Partial<TriggerDef> = {}
): TriggerDef => ({
  id, label, kind: 'state', rows, defaultEffect,
  make: (ctx) => ({ type: 'condition', when: pick(ctx), revert: true }),
  match: (t) => (t.type === 'condition' && t.when ? is(t.when) : null),
  ...extra,
});

const has = (item: any, key: string) => !!item && typeof item === 'object' && key in item;

const TRIGGER_LIST: TriggerDef[] = [
  // ── anywhere ──
  { id: 'appear', label: 'it appears', kind: 'enter', rows: 'any', defaultEffect: 'fadeIn', make: () => ({ type: 'enter' }), match: (t) => (t.type === 'enter' ? {} : null) },
  { id: 'disappear', label: 'it disappears', kind: 'exit', rows: 'any', defaultEffect: 'fadeOut', make: () => ({ type: 'exit' }), match: (t) => (t.type === 'exit' && t.after == null ? {} : null) },
  {
    id: 'timedExit', label: 'it has been on screen for a while (then it leaves)', kind: 'exit', rows: 'any', defaultEffect: 'fadeOut',
    param: { label: 'Seconds', default: 5, min: 0, max: 600 },
    make: ({ n = 5 }) => ({ type: 'exit', after: Math.round(n * 1000) }),
    match: (t) => (t.type === 'exit' && t.after != null ? { n: Math.round(t.after / 100) / 10 } : null),
  },
  { id: 'always', label: 'always (never stops)', kind: 'loop', rows: 'any', defaultEffect: 'pulseLoop', make: () => ({ type: 'loop' }), match: (t) => (t.type === 'loop' ? {} : null) },

  // ── this player (player rows) ──
  stateTrigger('playerKnocked', 'this player is knocked', 'player', 'alertPulse',
    ({ item }) => (has(item, 'knocked') ? { path: 'item.knocked', op: 'equals', value: true } : { path: 'item.liveState', op: 'equals', value: 4 }),
    (w) => { const r = rule(w); return r && ((r.path === 'item.knocked' && r.value === true) || (r.path === 'item.liveState' && r.value === 4)) ? {} : null; },
    { test: (s) => s.knock(), untest: (s) => s.revive() }),
  stateTrigger('playerDead', 'this player is dead', 'player', 'greyOut',
    ({ item }) => (has(item, 'dead') ? { path: 'item.dead', op: 'equals', value: true } : { any: [{ path: 'item.liveState', op: 'equals', value: 5 }, { path: 'item.bHasDied', op: 'equals', value: true }] }),
    (w) => { const r = rule(w); if (r) return r.path === 'item.dead' && r.value === true ? {} : null; return 'any' in w && w.any.some((c) => rule(c)?.path === 'item.liveState' && rule(c)?.value === 5) ? {} : null; },
    { test: (s) => s.kill(), untest: (s) => s.recall() }),
  stateTrigger('playerLowHealth', 'this player’s health is low', 'player', 'tintPulse',
    ({ item, n = 30 }) => { const p = has(item, 'healthPct') ? 'item.healthPct' : 'item.health'; return { all: [{ path: p, op: 'lessThan', value: n }, { path: p, op: 'greaterThan', value: 0 }] }; },
    (w) => { if (!('all' in w)) return null; const lt = w.all.map(rule).find((r) => r && /^item\.health(Pct)?$/.test(r.path) && r.op === 'lessThan'); return lt ? { n: Number(lt.value) } : null; },
    { param: { label: 'Below %', default: 30, min: 1, max: 99 }, test: (s) => s.setHealth(20), untest: (s) => s.setHealth(100) }),
  eventTrigger('playerRevived', 'this player is revived', 'player', 'revive', true, 'glow', (s) => s.revive()),
  eventTrigger('playerRecalled', 'this player is recalled', 'player', 'recall', true, 'glow', (s) => s.recall()),
  eventTrigger('playerKill', 'this player gets a kill', 'player', 'kill', true, 'pop', (s) => s.kill()),
  eventTrigger('playerDies', 'this player dies', 'player', 'playerDeath', true, 'flash', (s) => s.kill()),

  // ── this team (team rows) ──
  stateTrigger('teamEliminated', 'this team is eliminated', 'team', 'greyOut',
    () => ({ path: 'item.isAllDead', op: 'equals', value: true }),
    (w) => { const r = rule(w); return r && /^item\.(isAllDead|isEliminated|isEliminationLocked)$/.test(r.path) && r.value === true ? {} : null; },
    { test: (s) => s.eliminate() }),
  stateTrigger('teamFewAlive', 'this team has few players left', 'team', 'alertPulse',
    ({ n = 1 }) => ({ all: [{ path: 'item.aliveCount', op: 'lessOrEqual', value: n }, { path: 'item.aliveCount', op: 'greaterThan', value: 0 }] }),
    (w) => { if (!('all' in w)) return null; const r = w.all.map(rule).find((x) => x && x.path === 'item.aliveCount' && x.op === 'lessOrEqual'); return r ? { n: Number(r.value) } : null; },
    { param: { label: 'Players left', default: 1, min: 1, max: 3 }, test: (s) => s.kill() }),
  eventTrigger('teamKill', 'this team gets a kill', 'team', 'kill', true, 'glow', (s) => s.kill()),
  eventTrigger('teamRank', 'this team’s rank changes', 'team', 'rankChange', true, 'glow', (s) => s.rankShuffle()),
  eventTrigger('teamKnock', 'a player of this team is knocked', 'team', 'knock', true, 'shake', (s) => s.knock()),
  eventTrigger('teamRecall', 'a player of this team is recalled', 'team', 'recall', true, 'glow', (s) => s.recall()),

  // ── the match (anywhere) ──
  eventTrigger('anyKill', 'anyone gets a kill', 'any', 'kill', false, 'popInOut', (s) => s.kill()),
  eventTrigger('anyElimination', 'a team is eliminated', 'any', 'elimination', false, 'popInOut', (s) => s.eliminate()),
  eventTrigger('anyKnock', 'anyone is knocked', 'any', 'knock', false, 'popInOut', (s) => s.knock()),
  eventTrigger('anyRevive', 'anyone is revived', 'any', 'revive', false, 'popInOut', (s) => s.revive()),
  eventTrigger('anyRecall', 'anyone is recalled', 'any', 'recall', false, 'popInOut', (s) => s.recall()),
  eventTrigger('anyDeath', 'any player dies', 'any', 'playerDeath', false, 'popInOut', (s) => s.kill()),
  eventTrigger('milestone', 'a milestone happens (first blood, 5 kills…)', 'any', 'milestone', false, 'popInOut', (s) => s.milestone()),
  eventTrigger('matchStart', 'a match starts', 'any', 'matchStart', false, 'popInOut', (s) => s.matchStart()),
  eventTrigger('matchEnd', 'the match ends', 'any', 'matchEnd', false, 'popInOut', (s) => s.matchEnd()),
  eventTrigger('anyRank', 'any team’s rank changes', 'any', 'rankChange', false, 'pop', (s) => s.rankShuffle()),
  stateTrigger('finalTeams', 'only a few teams are left', 'any', 'fadeIn',
    ({ n = 4 }) => ({ path: 'live.aliveTeamsCount', op: 'lessOrEqual', value: n }),
    (w) => { const r = rule(w); return r && r.path === 'live.aliveTeamsCount' && r.op === 'lessOrEqual' ? { n: Number(r.value) } : null; },
    { param: { label: 'Teams left', default: 4, min: 1, max: 32 }, test: (s) => s.setAliveTeams(4), untest: (s) => s.reset() }),
  stateTrigger('recallMap', 'the map allows recalls', 'any', 'fadeIn',
    () => ({ path: 'live.isRecallMap', op: 'equals', value: true }),
    (w) => { const r = rule(w); return r && r.path === 'live.isRecallMap' ? {} : null; }),
];

export const TRIGGERS: Record<string, TriggerDef> = Object.fromEntries(TRIGGER_LIST.map((t) => [t.id, t]));

/** Triggers offered for a layer, most specific first (its own row, then the match). */
export function triggersFor(row: RowKind): TriggerDef[] {
  const own = TRIGGER_LIST.filter((t) => t.rows === row && row !== 'none');
  const general = TRIGGER_LIST.filter((t) => t.rows === 'any');
  return [...general.slice(0, 4), ...own, ...general.slice(4)];
}

/** Effects offered for a trigger on a layer, grouped. */
export function effectsFor(kind: TriggerKind, el: LayoutElement): Array<{ group: EffectGroup; effects: EffectDef[] }> {
  const leaf = colorPropOf(el) !== null;
  return EFFECT_GROUPS_FOR[kind]
    .map((group) => ({ group, effects: EFFECT_LIST.filter((e) => e.group === group && (leaf || !e.leafOnly)) }))
    .filter((g) => g.effects.length > 0);
}

// ── rule <-> clip ───────────────────────────────────────────────────────────

export interface AnimationRule {
  trigger: string;
  effect: string;
  /** The trigger's number (teams left, health %), when it has one. */
  n?: number;
  options: EffectOptions;
}

/**
 * "popInOut_s100_h3000_cef4444_tanyKill" — fits the schema's id rule (letters,
 * digits, _ and -). The trigger id is kept because two sentences can be the
 * same trigger object ("this team / this player gets a kill").
 */
export function encodePreset(effect: string, o: EffectOptions, trigger?: string): string {
  const hex = /^#[0-9a-f]{6}$/i.test(o.color) ? o.color.slice(1).toLowerCase() : 'ef4444';
  return `${effect}_s${Math.round(o.speed * 100)}_h${Math.round(o.hold)}_c${hex}${trigger ? `_t${trigger}` : ''}`;
}

export function decodePreset(preset: string | undefined): { effect: string; options: EffectOptions; trigger?: string } | null {
  if (!preset) return null;
  const [effect, ...parts] = preset.split('_');
  if (!EFFECTS[effect]) return null;
  const options = { ...DEFAULT_OPTIONS };
  let trigger: string | undefined;
  for (const p of parts) {
    const v = p.slice(1);
    if (p[0] === 's' && Number(v) > 0) options.speed = Number(v) / 100;
    else if (p[0] === 'h' && Number(v) >= 0) options.hold = Number(v);
    else if (p[0] === 'c' && /^[0-9a-f]{6}$/i.test(v)) options.color = `#${v}`;
    else if (p[0] === 't' && TRIGGERS[v]) trigger = v;
  }
  return { effect, options, ...(trigger ? { trigger } : null) };
}

/** Which trigger definition made this clip's trigger (null = hand-made in the keyframe editor). */
export function triggerOfClip(clip: TimelineClip): { def: TriggerDef; n?: number } | null {
  for (const def of TRIGGER_LIST) {
    const m = def.match(clip.trigger);
    if (m) return { def, n: m.n };
  }
  return null;
}

/** Read a clip back as a rule; `effect` is '' when its keyframes were not built by an effect. */
export function clipToRule(clip: TimelineClip): { trigger: TriggerDef | null; n?: number; effect: EffectDef | null; options: EffectOptions } {
  const p = decodePreset(clip.preset);
  // The remembered sentence wins while it still describes the clip's actual trigger.
  const named = p?.trigger ? TRIGGERS[p.trigger] : null;
  const namedMatch = named ? named.match(clip.trigger) : null;
  const t = named && namedMatch ? { def: named, n: namedMatch.n } : triggerOfClip(clip);
  return { trigger: t?.def ?? null, n: t?.n, effect: p ? EFFECTS[p.effect] : null, options: p?.options ?? { ...DEFAULT_OPTIONS } };
}

/** Build the timeline clip for a rule on `el`. */
export function ruleToClip(el: LayoutElement, r: AnimationRule, id: string, ctx: TriggerContext = {}): TimelineClip {
  const trig = TRIGGERS[r.trigger];
  const eff = EFFECTS[r.effect];
  if (!trig || !eff) throw new Error(`unknown animation rule ${r.trigger} -> ${r.effect}`);
  const built = eff.build(el, r.options);
  const loop = trig.kind === 'loop' || built.loop;
  return {
    id,
    name: `${trig.label} → ${eff.label}`.slice(0, 120),
    preset: encodePreset(eff.id, r.options, trig.id),
    duration: built.duration,
    trigger: trig.make({ ...ctx, n: r.n ?? trig.param?.default }),
    // Alerts for back-to-back events all get shown; everything else just restarts.
    retrigger: eff.group === 'popup' ? 'queue' : 'restart',
    ...(loop ? { loop: true } : null),
    tracks: built.tracks,
  };
}

/** One-click rules worth offering for a layer, given where it sits. */
export function suggestionsFor(row: RowKind): Array<{ trigger: string; effect: string; label: string }> {
  if (row === 'player') {
    return [
      { trigger: 'playerKnocked', effect: 'alertPulse', label: 'Knocked → alert pulse' },
      { trigger: 'playerDead', effect: 'greyOut', label: 'Dead → grey out' },
      { trigger: 'playerRecalled', effect: 'glow', label: 'Recalled → light up' },
      { trigger: 'playerRevived', effect: 'glow', label: 'Revived → light up' },
      { trigger: 'playerKill', effect: 'pop', label: 'Gets a kill → pop' },
    ];
  }
  if (row === 'team') {
    return [
      { trigger: 'teamEliminated', effect: 'greyOut', label: 'Eliminated → grey out' },
      { trigger: 'teamKill', effect: 'glow', label: 'Gets a kill → light up' },
      { trigger: 'teamRank', effect: 'pop', label: 'Rank changes → pop' },
      { trigger: 'teamKnock', effect: 'shake', label: 'Player knocked → shake' },
    ];
  }
  return [
    { trigger: 'appear', effect: 'slideInLeft', label: 'Appears → slide in' },
    { trigger: 'anyElimination', effect: 'popInOut', label: 'Team eliminated → pop up' },
    { trigger: 'anyKnock', effect: 'popInOut', label: 'Player knocked → pop up' },
    { trigger: 'always', effect: 'pulseLoop', label: 'Always → pulse' },
  ];
}

// ── lifecycle: in → stay → out ──────────────────────────────────────────────

export interface Lifecycle {
  /** Entrance effect id, or null for none. */
  in: string | null;
  /** Seconds on screen before it leaves by itself; null = until its condition hides it. */
  stay: number | null;
  /** Exit effect id, or null for none. */
  out: string | null;
}

const enterClipOf = (el: LayoutElement) => el.timeline?.clips.find((c) => c.trigger.type === 'enter') ?? null;
const exitClipOf = (el: LayoutElement) => el.timeline?.clips.find((c) => c.trigger.type === 'exit') ?? null;

/** Read a layer's lifecycle back from its enter / exit clips. */
export function lifecycleOf(el: LayoutElement): Lifecycle {
  const enter = enterClipOf(el);
  const exit = exitClipOf(el);
  return {
    in: enter ? decodePreset(enter.preset)?.effect ?? 'custom' : null,
    stay: exit && exit.trigger.after != null ? Math.round(exit.trigger.after / 100) / 10 : null,
    out: exit ? decodePreset(exit.preset)?.effect ?? 'custom' : null,
  };
}

/**
 * Apply a lifecycle to a layer: replaces (or removes) its enter and exit clips
 * and leaves every other animation alone. 'custom' keeps the existing clip.
 */
export function withLifecycle(el: LayoutElement, life: Lifecycle, options: EffectOptions = DEFAULT_OPTIONS): LayoutElement {
  const others = (el.timeline?.clips || []).filter((c) => c.trigger.type !== 'enter' && c.trigger.type !== 'exit');
  const taken = new Set(others.map((c) => c.id));
  const idFor = (prefer: string) => { let id = prefer; for (let n = 2; taken.has(id); n++) id = `${prefer}${n}`; taken.add(id); return id; };
  const optsOf = (clip: TimelineClip | null) => decodePreset(clip?.preset)?.options ?? options;
  const clips: TimelineClip[] = [];
  const curIn = enterClipOf(el);
  const curOut = exitClipOf(el);
  if (life.in === 'custom' && curIn) clips.push(curIn);
  else if (life.in && EFFECTS[life.in]) clips.push(ruleToClip(el, { trigger: 'appear', effect: life.in, options: optsOf(curIn) }, idFor(curIn?.id ?? 'enter')));
  clips.push(...others);
  const outEffect = life.out === 'custom' && curOut ? null : life.out && EFFECTS[life.out] ? life.out : life.stay != null ? matchingExit(life.in || '') : null;
  if (life.out === 'custom' && curOut) {
    const trigger = { ...curOut.trigger };
    if (life.stay == null) delete trigger.after; else trigger.after = Math.round(life.stay * 1000);
    clips.push({ ...curOut, trigger });
  } else if (outEffect) {
    clips.push(ruleToClip(el, { trigger: life.stay == null ? 'disappear' : 'timedExit', effect: outEffect, n: life.stay ?? undefined, options: optsOf(curOut) }, idFor(curOut?.id ?? 'exit')));
  }
  const next = { ...el };
  if (clips.length) next.timeline = { clips }; else delete next.timeline;
  return next;
}
