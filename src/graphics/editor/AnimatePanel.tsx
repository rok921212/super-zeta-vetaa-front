// Animate dock (the simple view): a layer's animations as plain rules.
//
//   WHEN [this player is knocked ▾]  →  [Alert pulse ▾]  Normal ▾   ▶ Preview  ⚡ Test live  Keyframes  ✕
//
// Each rule IS a timeline clip (built by animationLibrary.ruleToClip), so the
// keyframe Timeline edits the very same thing — "Keyframes" just switches the
// dock to it. Nothing here is a second animation system.

import React, { memo, useEffect, useRef, useState } from 'react';
import type { LayoutDocument, LayoutElement, TimelineClip } from '../schema/layoutTypes.ts';
import type { BindingScope } from '../bindings/index.ts';
import type { TimelinePreview } from '../renderer/useTimeline.ts';
import type { SimulationControls } from './simulation.ts';
import { type Command, editElements } from './store.ts';
import { locate } from './tree.ts';
import { addClip, animToClip, clipsOf, newClipId, removeClip, updateClip } from './timelineOps.ts';
import {
  DEFAULT_OPTIONS, EFFECTS, EFFECT_GROUP_LABEL, EFFECT_LIST, SPEEDS, TRIGGERS, clipToRule, effectsFor, lifecycleOf, rowKindOf, ruleToClip,
  suggestionsFor, triggersFor, withLifecycle, type AnimationRule, type EffectOptions, type Lifecycle, type RowKind, type TriggerContext,
} from './animationLibrary.ts';
import { EffectGallery } from './EffectGallery.tsx';
import { InfoButton } from './Help.tsx';
import { Btn, cx } from './ui.tsx';

export interface AnimatePanelProps {
  doc: LayoutDocument;
  selectedId: string | null;
  disabled?: boolean;
  exec(cmd: Command | null): void;
  /** Scope of the selected layer (its repeater row, if any). */
  scope: BindingScope;
  /** SIMULATION controls, or null in LIVE. */
  sim: SimulationControls | null;
  /** Show one exact frame of a clip on the canvas (null = stop). */
  onPreview(p: TimelinePreview | null): void;
  /** Open this rule in the keyframe timeline. */
  onEditKeyframes(clipId: string): void;
}

const selectCls = 'rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-slate-100 outline-none focus:border-amber-400/60 disabled:opacity-50';

const ROW_LABEL: Record<RowKind, string> = { none: '', team: 'in a team row', player: 'in a player row' };

/** The nearest repeater above a layer: tells us whether it sits in a team or a player row. */
function repeaterSourceOf(doc: LayoutDocument, id: string): string | null {
  const loc = locate(doc.elements, id);
  if (!loc) return null;
  for (let i = loc.ancestors.length - 1; i >= 0; i--) {
    const a = loc.ancestors[i];
    if (a.type === 'repeater' && a.repeater) return a.repeater.source;
  }
  return null;
}

export const AnimatePanel = memo(function AnimatePanel(props: AnimatePanelProps) {
  const { doc, selectedId, exec, sim } = props;
  const el = selectedId ? locate(doc.elements, selectedId)?.el ?? null : null;
  const [playing, setPlaying] = useState<string | null>(null);
  const [tested, setTested] = useState<string | null>(null);
  /** Which rule's effect is being browsed in the gallery ('in' / 'out' = the lifecycle row). */
  const [browse, setBrowse] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const endRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPreviewRef = useRef(props.onPreview);
  onPreviewRef.current = props.onPreview;

  const cancelTimers = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (endRef.current != null) clearTimeout(endRef.current);
    rafRef.current = null;
    endRef.current = null;
  };
  const stop = () => {
    cancelTimers();
    setPlaying(null);
    onPreviewRef.current(null);
  };
  // Stop any preview when the selection changes or the panel goes away.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { cancelTimers(); onPreviewRef.current(null); }, [selectedId]);
  useEffect(() => { setTested(null); }, [selectedId]);

  if (!el) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[11px] text-slate-500" data-testid="animate-panel">
        <div className="flex items-center gap-2 text-slate-300"><span>Select a layer to animate it.</span><InfoButton topic="animate" label="How to animate" /></div>
        <div>An animation is a rule: <span className="text-slate-300">WHEN</span> something happens → the layer <span className="text-slate-300">DOES</span> something.</div>
      </div>
    );
  }

  const source = repeaterSourceOf(doc, el.id);
  const item = source ? props.scope.item : undefined;
  const row = source ? rowKindOf(item, source) : 'none';
  const ctx: TriggerContext = { item };
  const clips = clipsOf(el);
  const triggers = triggersFor(row);
  const legacy = !!(el.anim?.enter || el.anim?.onEvent);

  const edit = (fn: (e: LayoutElement) => LayoutElement, label: string, key?: string) => {
    if (props.disabled) return;
    exec(editElements(doc, [el.id], fn, label, key));
  };

  const add = (trigger: string, effect: string) => {
    const id = newClipId(el);
    const rule: AnimationRule = { trigger, effect, options: { ...DEFAULT_OPTIONS } };
    edit((x) => addClip(x, ruleToClip(x, rule, id, ctx)), 'Add animation');
  };

  const rebuild = (clip: TimelineClip, patch: Partial<AnimationRule> & { options?: EffectOptions }) => {
    const cur = clipToRule(clip);
    const trigger = patch.trigger ?? cur.trigger?.id;
    if (!trigger || !TRIGGERS[trigger]) return;
    const kind = TRIGGERS[trigger].kind;
    const allowed = effectsFor(kind, el).flatMap((g) => g.effects.map((e) => e.id));
    let effect = patch.effect ?? cur.effect?.id ?? TRIGGERS[trigger].defaultEffect;
    if (!allowed.includes(effect)) effect = allowed.includes(TRIGGERS[trigger].defaultEffect) ? TRIGGERS[trigger].defaultEffect : allowed[0];
    const rule: AnimationRule = { trigger, effect, n: patch.n ?? (patch.trigger ? undefined : cur.n), options: patch.options ?? cur.options };
    edit((x) => updateClip(x, clip.id, () => ruleToClip(x, rule, clip.id, ctx)), 'Change animation', `rule:${el.id}:${clip.id}`);
  };

  const preview = (clip: TimelineClip) => {
    if (playing === clip.id) { stop(); return; }
    cancelTimers();
    setPlaying(clip.id);
    // A looping effect has no end: show two rounds of it.
    const total = clip.loop === true ? clip.duration * 2 : clip.duration * (typeof clip.loop === 'number' ? clip.loop + 1 : 1);
    const start = performance.now();
    const step = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= total) {
        onPreviewRef.current({ elementId: el.id, clipId: clip.id, t: clip.loop ? 0 : clip.duration });
        rafRef.current = null;
        endRef.current = setTimeout(() => { endRef.current = null; setPlaying(null); onPreviewRef.current(null); }, 350);
        return;
      }
      onPreviewRef.current({ elementId: el.id, clipId: clip.id, t: Math.round(elapsed % clip.duration) });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const life = lifecycleOf(el);
  const setLife = (patch: Partial<Lifecycle>) => edit((x) => withLifecycle(x, { ...lifecycleOf(x), ...patch }), 'Lifecycle', `life:${el.id}`);
  const inEffects = EFFECT_LIST.filter((e) => e.group === 'in');
  const outEffects = EFFECT_LIST.filter((e) => e.group === 'out');

  const missing = suggestionsFor(row).filter((s) => !clips.some((c) => clipToRule(c).trigger?.id === s.trigger));

  return (
    <div className="flex h-full min-h-0 flex-col text-[11px] text-slate-300" data-testid="animate-panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-1.5">
        <span className="font-semibold text-slate-100">{el.name || el.type}</span>
        {row !== 'none' && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-200" title="Rules about “this team / this player” only animate the row they are about">{ROW_LABEL[row]}</span>}
        <span className="text-slate-500">{clips.length ? `${clips.length} animation${clips.length > 1 ? 's' : ''}` : 'no animations yet'}</span>
        <InfoButton topic="animate" label="How to animate" />
        <Btn small active className="ml-auto" disabled={props.disabled} onClick={() => { const s = missing[0] ?? { trigger: 'appear', effect: 'fadeIn' }; add(s.trigger, s.effect); }} data-testid="add-animation">+ Add animation</Btn>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded border border-emerald-400/20 bg-emerald-400/[0.04] px-2 py-1.5" data-testid="lifecycle">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">On screen</span>
          <InfoButton topic="lifecycle" />
          <span className="text-slate-500">comes in</span>
          <select aria-label="Comes in with" className={cx(selectCls, 'max-w-[190px]')} disabled={props.disabled} value={life.in ?? ''} onChange={(e) => setLife({ in: e.target.value || null })}>
            <option value="">without animation</option>
            {life.in === 'custom' && <option value="custom">custom keyframes</option>}
            {inEffects.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <Btn small disabled={props.disabled} onClick={() => setBrowse('in')} title="Browse the entrances with previews">Browse…</Btn>
          <span className="text-slate-500">· stays</span>
          <select aria-label="Stays" className={selectCls} disabled={props.disabled} value={life.stay == null ? 'until' : 'timed'} onChange={(e) => setLife({ stay: e.target.value === 'timed' ? (life.stay ?? 5) : null })}>
            <option value="until">until it is hidden</option>
            <option value="timed">for a set time</option>
          </select>
          {life.stay != null && (
            <label className="flex items-center gap-1 text-slate-500">
              <input type="number" aria-label="Seconds on screen" className={cx(selectCls, 'w-14')} disabled={props.disabled} min={0} max={600} step={0.5} value={life.stay}
                onChange={(e) => { const s = Number(e.target.value); if (Number.isFinite(s) && e.target.value !== '') setLife({ stay: Math.max(0, Math.min(600, s)) }); }}
                onKeyDown={(e) => e.stopPropagation()} />
              s
            </label>
          )}
          <span className="text-slate-500">· goes out</span>
          <select aria-label="Goes out with" className={cx(selectCls, 'max-w-[190px]')} disabled={props.disabled} value={life.out ?? ''} onChange={(e) => setLife({ out: e.target.value || null, ...(e.target.value ? null : { stay: null }) })}>
            <option value="">without animation</option>
            {life.out === 'custom' && <option value="custom">custom keyframes</option>}
            {outEffects.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <Btn small disabled={props.disabled} onClick={() => setBrowse('out')} title="Browse the exits with previews">Browse…</Btn>
        </div>

        {clips.length === 0 && (
          <div className="mb-2 text-slate-500">Nothing animates this layer yet. Press <span className="text-slate-300">+ Add animation</span>, or pick a ready-made one below.</div>
        )}

        <div className="flex flex-col gap-1.5">
          {clips.map((clip) => {
            const r = clipToRule(clip);
            const kind = r.trigger?.kind;
            const groups = kind ? effectsFor(kind, el) : [];
            const isState = kind === 'state';
            return (
              <div key={clip.id} className="flex flex-wrap items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-2 py-1.5" data-rule={clip.id}>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">{isState ? 'While' : kind === 'exit' && r.trigger?.param ? 'After' : 'When'}</span>
                <select
                  aria-label="When"
                  className={cx(selectCls, 'max-w-[250px]')}
                  disabled={props.disabled}
                  value={r.trigger?.id ?? ''}
                  onChange={(e) => e.target.value && rebuild(clip, { trigger: e.target.value })}
                >
                  {!r.trigger && <option value="">custom trigger (set in Keyframes)</option>}
                  {triggers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  {/* A rule made for another kind of row stays readable. */}
                  {r.trigger && !triggers.includes(r.trigger) && <option value={r.trigger.id}>{r.trigger.label}</option>}
                </select>
                {r.trigger?.param && (
                  <label className="flex items-center gap-1 text-slate-500">
                    {r.trigger.param.label}
                    <input
                      type="number"
                      className={cx(selectCls, 'w-14')}
                      disabled={props.disabled}
                      min={r.trigger.param.min}
                      max={r.trigger.param.max}
                      value={r.n ?? r.trigger.param.default}
                      onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && e.target.value !== '') rebuild(clip, { n: Math.max(r.trigger!.param!.min, Math.min(r.trigger!.param!.max, n)) }); }}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </label>
                )}
                <span className="text-slate-500">→</span>
                <select
                  aria-label="Do"
                  className={cx(selectCls, 'max-w-[230px]')}
                  disabled={props.disabled || !r.trigger}
                  value={r.effect?.id ?? ''}
                  onChange={(e) => e.target.value && rebuild(clip, { effect: e.target.value })}
                >
                  {!r.effect && <option value="">custom keyframes</option>}
                  {groups.map((g) => (
                    <optgroup key={g.group} label={EFFECT_GROUP_LABEL[g.group]}>
                      {g.effects.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                    </optgroup>
                  ))}
                  {r.effect && !groups.some((g) => g.effects.includes(r.effect!)) && <option value={r.effect.id}>{r.effect.label}</option>}
                </select>
                {r.trigger && <Btn small disabled={props.disabled} onClick={() => setBrowse(clip.id)} title="Browse every animation that fits, with previews">Browse…</Btn>}
                {r.effect && r.trigger && (
                  <>
                    <select aria-label="Speed" className={selectCls} disabled={props.disabled} value={String(SPEEDS.reduce((best, s) => (Math.abs(s.value - r.options.speed) < Math.abs(best - r.options.speed) ? s.value : best), 1))}
                      onChange={(e) => rebuild(clip, { options: { ...r.options, speed: Number(e.target.value) } })}>
                      {SPEEDS.map((s) => <option key={s.value} value={String(s.value)}>{s.label}</option>)}
                    </select>
                    {r.effect.group === 'popup' && (
                      <label className="flex items-center gap-1 text-slate-500">
                        stay
                        <input type="number" className={cx(selectCls, 'w-14')} disabled={props.disabled} min={0} max={30} step={0.5} value={r.options.hold / 1000}
                          onChange={(e) => { const s = Number(e.target.value); if (Number.isFinite(s) && e.target.value !== '') rebuild(clip, { options: { ...r.options, hold: Math.max(0, Math.min(30, s)) * 1000 } }); }}
                          onKeyDown={(e) => e.stopPropagation()} />
                        s
                      </label>
                    )}
                    {r.effect.usesColor && (
                      <input type="color" aria-label="Colour" className="h-6 w-7 cursor-pointer rounded border border-white/10 bg-transparent" disabled={props.disabled} value={r.options.color}
                        onChange={(e) => rebuild(clip, { options: { ...r.options, color: e.target.value } })} />
                    )}
                  </>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Btn small active={playing === clip.id} onClick={() => preview(clip)} title="Play this animation on the canvas">{playing === clip.id ? '■ Stop' : '▶ Preview'}</Btn>
                  {sim && r.trigger?.test && (
                    tested === clip.id && r.trigger.untest
                      ? <Btn small onClick={() => { r.trigger!.untest!(sim); setTested(null); }} title="Undo it in the sample match">↺ Undo</Btn>
                      : <Btn small onClick={() => { r.trigger!.test!(sim); setTested(clip.id); }} title="Make it really happen in the sample match, to see the rule fire">⚡ Test live</Btn>
                  )}
                  <Btn small onClick={() => { stop(); props.onEditKeyframes(clip.id); }} title="Fine-tune this animation on the keyframe timeline">Keyframes</Btn>
                  <Btn small danger disabled={props.disabled} onClick={() => { stop(); edit((x) => removeClip(x, clip.id), 'Delete animation'); }} title="Delete this animation" aria-label="Delete animation">✕</Btn>
                </div>
              </div>
            );
          })}
        </div>

        {legacy && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-amber-400/20 bg-amber-400/5 px-2 py-1.5 text-amber-100/90">
            <span>This layer also has a classic preset animation ({el.anim?.onEvent ? `shows on ${el.anim.onEvent.event}` : `enter: ${el.anim?.enter?.preset}`}).</span>
            <Btn small disabled={props.disabled} onClick={() => edit((x) => {
              const c = animToClip(x, newClipId(x));
              if (!c) return x;
              const anim = { ...(x.anim || {}) };
              delete anim.enter; delete anim.onEvent;
              const next = addClip({ ...x, anim }, c);
              if (!Object.keys(anim).length) delete next.anim;
              return next;
            }, 'Convert animation')}>Turn it into a rule</Btn>
          </div>
        )}

        {missing.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="animation-suggestions">
            <span className="text-slate-500">Ready-made{row !== 'none' ? ` for a ${row} row` : ''}:</span>
            {missing.map((s) => (
              <button key={s.trigger} type="button" disabled={props.disabled} onClick={() => add(s.trigger, s.effect)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-200 hover:border-amber-400/50 hover:bg-amber-400/10 disabled:opacity-40">
                + {s.label}
              </button>
            ))}
          </div>
        )}
        {clips.length > 1 && (
          <div className="mt-2 text-[10px] text-slate-500">One animation plays at a time on a layer; a new one takes over from the one before.</div>
        )}
      </div>
      {browse === 'in' && <EffectGallery groups={[{ group: 'in', effects: inEffects }]} value={life.in} onPick={(id) => setLife({ in: id })} onClose={() => setBrowse(null)} />}
      {browse === 'out' && <EffectGallery groups={[{ group: 'out', effects: outEffects }]} value={life.out} onPick={(id) => setLife({ out: id })} onClose={() => setBrowse(null)} />}
      {browse && browse !== 'in' && browse !== 'out' && (() => {
        const clip = clips.find((c) => c.id === browse);
        const r = clip ? clipToRule(clip) : null;
        if (!clip || !r?.trigger) return null;
        return <EffectGallery groups={effectsFor(r.trigger.kind, el)} value={r.effect?.id ?? null} onPick={(id) => rebuild(clip, { effect: id })} onClose={() => setBrowse(null)} />;
      })()}
    </div>
  );
});

/** For the Inspector summary: the layer's rules as short sentences. */
export function describeAnimations(el: LayoutElement): string[] {
  return clipsOf(el).map((c) => {
    const r = clipToRule(c);
    if (r.trigger && r.effect) return `${r.trigger.kind === 'state' ? 'While' : 'When'} ${r.trigger.label} → ${EFFECTS[r.effect.id].label}`;
    return c.name || 'Custom animation';
  });
}
