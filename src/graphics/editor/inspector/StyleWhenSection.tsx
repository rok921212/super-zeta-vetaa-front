// Inspector: "Change style when…" — the layer's styleWhen rules. Each rule is a
// condition on live data plus the style it switches on (fill, gradient, text
// colour, outline, opacity). The renderer already applies them
// (bindings/index.ts resolveElementStyle); this is the editor for them.

import React from 'react';
import type { Condition, ElementStyle, Gradient, LayoutElement } from '../../schema/layoutTypes.ts';
import { LIMITS } from '../../schema/layoutSchema.js';
import type { BindingScope } from '../../bindings/resolve.ts';
import { evaluateCondition } from '../../bindings/conditions.ts';
import { defaultGradient } from '../gradient.ts';
import { GradientEditor } from '../GradientEditor.tsx';
import { Btn, Grid2, NumberInput, Section, Select } from '../ui.tsx';
import { StyleColorField } from './FillSection.tsx';

type Edit = (field: string, fn: (e: LayoutElement) => LayoutElement, label?: string) => void;
type Rule = NonNullable<LayoutElement['styleWhen']>[number];

const GOLD: Gradient = { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fde68a' }, { offset: 0.5, color: '#f59e0b' }, { offset: 1, color: '#92400e' }] };

/** One-click rules for the cases built-in themes handle. `item.*` = a row of a team / player list. */
export const STYLE_RULE_PRESETS: Array<{ label: string; rule: Rule; inList?: boolean }> = [
  { label: 'Team eliminated → grey', inList: true, rule: { when: { path: 'item.isAllDead', op: 'equals', value: true }, style: { grayscale: 1 }, opacity: 0.55 } },
  { label: 'First place → gold', inList: true, rule: { when: { path: 'rank', op: 'equals', value: 1 }, style: { gradient: GOLD } } },
  { label: 'Player knocked → red', inList: true, rule: { when: { path: 'item.liveState', op: 'equals', value: 4 }, style: { fill: '#ef4444' } } },
  { label: 'Final circle (≤ 4 teams) → red', rule: { when: { path: 'live.aliveTeamsCount', op: 'lessOrEqual', value: 4 }, style: { fill: '#b91c1c' } } },
];

export function StyleWhenSection({ el, edit, scope, renderCondition }: {
  el: LayoutElement;
  edit: Edit;
  scope: BindingScope;
  /** The Inspector's condition editor (path picker + operator + value). */
  renderCondition(cond: Condition | undefined, onChange: (c: Condition | undefined) => void): React.ReactNode;
}) {
  const rules = el.styleWhen || [];
  const inList = scope.item !== undefined;
  const setRules = (next: Rule[], label = 'Style rule') => edit('styleWhen', (e) => {
    const out = { ...e };
    if (next.length) out.styleWhen = next; else delete out.styleWhen;
    return out;
  }, label);
  const update = (i: number, patch: Partial<Rule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setStyle = (i: number, patch: Partial<ElementStyle>) => {
    const style: Record<string, unknown> = { ...(rules[i].style || {}) };
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === null || v === '') delete style[k]; else style[k] = v; }
    update(i, { style: style as ElementStyle });
  };
  const full = rules.length >= LIMITS.maxStyleRules;
  const text = el.type === 'text';

  return (
    <Section title="Change style when…" help="styleWhen">
      {rules.map((rule, i) => {
        const on = (() => { try { return evaluateCondition(rule.when, scope); } catch { return false; } })();
        const st = rule.style || {};
        return (
          <div key={i} className="flex flex-col gap-1.5 rounded border border-white/5 bg-white/[0.02] p-2" data-style-rule={i}>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
              <span>Rule {i + 1} {on ? <span className="ml-1 rounded bg-emerald-400/20 px-1 text-emerald-200 normal-case">active now</span> : null}</span>
              <Btn small danger onClick={() => setRules(rules.filter((_, j) => j !== i), 'Remove style rule')}>✕</Btn>
            </div>
            {renderCondition(rule.when, (c) => (c ? update(i, { when: c }) : setRules(rules.filter((_, j) => j !== i), 'Remove style rule')))}
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Then</div>
            {text
              ? <StyleColorField label="Text colour" value={st.color} onChange={(v) => setStyle(i, { color: v })} />
              : <StyleColorField label="Fill" value={st.fill} onChange={(v) => setStyle(i, { fill: v })} />}
            {!text && (
              st.gradient
                ? (
                  <>
                    <GradientEditor value={st.gradient} onChange={(g) => setStyle(i, { gradient: g })} />
                    <Btn small onClick={() => setStyle(i, { gradient: undefined })}>Remove gradient</Btn>
                  </>
                )
                : <Btn small onClick={() => setStyle(i, { gradient: defaultGradient(typeof st.fill === 'string' ? st.fill : undefined) })}>+ Gradient</Btn>
            )}
            <StyleColorField label="Outline" value={st.stroke} onChange={(v) => setStyle(i, { stroke: v })} />
            <Grid2>
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                <span className="uppercase tracking-wide">Opacity %</span>
                <NumberInput value={rule.opacity == null ? undefined : Math.round(rule.opacity * 100)} min={0} max={100} onChange={(v) => update(i, { opacity: v == null ? undefined : Math.min(100, Math.max(0, v)) / 100 })} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                <span className="uppercase tracking-wide">Greyscale</span>
                <Select value={st.grayscale ? 'on' : 'off'} options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} onChange={(v) => setStyle(i, { grayscale: v === 'on' ? 1 : undefined })} />
              </label>
            </Grid2>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-1">
        <Btn small disabled={full} onClick={() => setRules([...rules, { when: { path: 'live.aliveTeamsCount', op: 'lessOrEqual', value: 4 }, style: {} }], 'Add style rule')}>+ Rule</Btn>
        {STYLE_RULE_PRESETS.filter((p) => !p.inList || inList).map((p) => (
          <Btn key={p.label} small disabled={full} onClick={() => setRules([...rules, JSON.parse(JSON.stringify(p.rule))], p.label)}>{p.label}</Btn>
        ))}
      </div>
      {!inList && <div className="text-[10px] text-slate-500">Inside a team or player list more presets appear (eliminated, first place, knocked).</div>}
    </Section>
  );
}
