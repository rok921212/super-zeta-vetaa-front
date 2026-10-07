// Contextual Inspector. Nothing selected -> Document settings; one element ->
// its properties by type; several -> shared geometry. Every edit is a store
// command on the real LayoutDocument (coalesced per field, so typing or a
// slider scrub is one undo step), so the canvas updates immediately.
// Data bindings use the existing DataPicker and the same `bind` DataRef
// syntax the renderer resolves — there is no second binding syntax.

import React, { memo, useEffect, useMemo, useState } from 'react';
import type {
  AnimationEvent, AnimationPreset, AnimationStep, BindableProp, Condition, DataRef, ElementStyle, FormatterName,
  LayoutDocument, LayoutElement, Operator, RepeaterConfig, RepeaterSource, StyleValue,
} from '../schema/layoutTypes.ts';
import {
  ANIMATION_EVENTS, ANIMATION_PRESETS, FORMATTERS, OPERATORS, REPEATER_SOURCES, isSafePath,
} from '../schema/layoutSchema.js';
import { resolveBinding, resolvePathDetailed, type BindingScope, type DataState, type FeedState } from '../bindings/index.ts';
import type { EngineEvent } from '../../overlayClient/engineTypes.ts';
import { ICONS } from '../renderer/elements.tsx';
import { listBuiltinGraphics } from '../../Themes/registry.ts';
import type { LayoutDefaults } from '../api.ts';
import api from '../../login/api.tsx';
import { type Command, editElements, setDocFieldCmd } from './store.ts';
import { reorderCmd } from './ops.ts';
import { AlignBar, EffectsSection, MaskSection } from './StylePanels.tsx';
import { locate } from './tree.ts';
import { scopeForElement } from './scope.ts';
import { DataPicker } from './DataPicker.tsx';
import { FontPicker, type FontLibrary } from './FontPicker.tsx';
import { describeAnimations } from './AnimatePanel.tsx';
import { CACHE_KEYS, useCached } from '../requestCache.ts';
import { Btn, ColorInput, Field, Grid2, NumberInput, Section, Select, TextInput, cx } from './ui.tsx';

export interface InspectorProps {
  doc: LayoutDocument;
  selected: string[];
  state: DataState | null;
  lastEvents: Partial<Record<string, EngineEvent>>;
  /** feed.* (rolling event logs) so the DataPicker shows real values. */
  feed?: FeedState | null;
  disabled?: boolean;
  exec(cmd: Command | null): void;
  onSelect(ids: string[]): void;
  // document-level meta that lives on the layout record, not the document
  name: string;
  onRename(name: string): void;
  defaults: LayoutDefaults;
  onDefaults(d: Partial<LayoutDefaults>): void;
  /** Extra Document-panel sections (the custom-theme assignment). */
  documentExtra?: React.ReactNode;
  /** The account's uploaded fonts (the Font dropdowns list + upload into it). */
  fontLibrary: FontLibrary;
  /** Open the Animate dock for the selected layer. */
  onOpenAnimate?(): void;
}

const TEXT_TYPES = new Set(['text']);
const SHAPE_TYPES = new Set(['rect', 'ellipse', 'line', 'polygon', 'path']);
const IMAGE_TYPES = new Set(['image', 'teamLogo', 'playerAvatar', 'flag', 'video']);
const BAR_TYPES = new Set(['progress', 'healthBar']);

/** Which bindable properties make sense for each element type. */
export function bindablePropsFor(type: string): BindableProp[] {
  if (TEXT_TYPES.has(type)) return ['text', 'color', 'visible', 'opacity'];
  if (IMAGE_TYPES.has(type)) return ['src', 'visible', 'opacity'];
  if (BAR_TYPES.has(type)) return ['value', 'max', 'color', 'fill', 'visible'];
  if (SHAPE_TYPES.has(type)) return ['fill', 'stroke', 'visible', 'opacity'];
  if (type === 'icon') return ['color', 'visible', 'opacity'];
  return ['visible', 'opacity', 'x', 'y'];
}

const isRef = (v: unknown): v is { ref: string } => !!v && typeof v === 'object' && typeof (v as any).ref === 'string';

// ── generic element-field editor ─────────────────────────────────────────────

function useEdit(props: InspectorProps, el: LayoutElement | null) {
  return useMemo(() => {
    const edit = (field: string, fn: (e: LayoutElement) => LayoutElement, label = `Edit ${field}`) => {
      if (!el || props.disabled) return;
      props.exec(editElements(props.doc, [el.id], fn, label, `insp:${el.id}:${field}`));
    };
    const set = <K extends keyof LayoutElement>(key: K, value: LayoutElement[K]) =>
      edit(String(key), (e) => {
        const next = { ...e, [key]: value };
        if (value === undefined || value === '') delete (next as any)[key];
        return next;
      });
    const setStyle = (key: keyof ElementStyle, value: StyleValue | undefined) =>
      edit(`style.${key}`, (e) => {
        const style: ElementStyle = { ...(e.style || {}) };
        if (value === undefined || value === '') delete style[key];
        else (style as any)[key] = value;
        const next: LayoutElement = { ...e, style };
        if (!Object.keys(style).length) delete next.style;
        return next;
      });
    const setBind = (prop: BindableProp, ref: DataRef | undefined) =>
      edit(`bind.${prop}`, (e) => {
        const bind = { ...(e.bind || {}) };
        if (ref) bind[prop] = ref; else delete bind[prop];
        const next: LayoutElement = { ...e, bind };
        if (!Object.keys(bind).length) delete next.bind;
        return next;
      }, ref ? `Bind ${prop}` : `Unbind ${prop}`);
    return { edit, set, setStyle, setBind };
  }, [props, el]);
}

// ── small field helpers ─────────────────────────────────────────────────────

function StyleColor({ label, value, onChange, disabled }: { label: string; value: StyleValue | undefined; onChange(v: StyleValue | undefined): void; disabled?: boolean }) {
  if (isRef(value)) {
    return (
      <Field label={label}>
        <div className="flex items-center gap-1.5">
          <span className="flex-1 truncate rounded border border-sky-400/30 bg-sky-400/10 px-2 py-1 font-mono text-[10px] text-sky-200" title="Follows the layout theme">{value.ref}</span>
          <Btn small disabled={disabled} onClick={() => onChange(undefined)} title="Detach from theme">✕</Btn>
        </div>
      </Field>
    );
  }
  return (
    <Field label={label}>
      <ColorInput value={typeof value === 'string' ? value : undefined} onChange={(v) => onChange(v)} />
    </Field>
  );
}

const num = (v: StyleValue | undefined): number | undefined => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !isNaN(Number(v)) ? Number(v) : undefined);

export function PickerButton({ scope, value, onPick, label = 'Select data' }: { scope: BindingScope; value?: string; onPick(p: string): void; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Btn small onClick={() => setOpen(!open)} active={open}>{label}</Btn>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[300px]">
          <DataPicker
            scope={scope}
            value={value}
            onPick={(p) => { if (isSafePath(p)) { onPick(p); setOpen(false); } }}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

const preview = (v: unknown) => {
  if (v === undefined) return '—';
  if (v === null) return 'null';
  if (typeof v === 'object') return Array.isArray(v) ? `[${v.length}]` : '{…}';
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
};

function BindingRow({ prop, el, scope, setBind, disabled }: { prop: BindableProp; el: LayoutElement; scope: BindingScope; setBind(p: BindableProp, r: DataRef | undefined): void; disabled?: boolean }) {
  const ref = el.bind?.[prop];
  const [draftPath, setDraftPath] = useState(ref?.path || '');
  useEffect(() => setDraftPath(ref?.path || ''), [ref?.path]);
  const live = ref ? resolveBinding(ref, scope) : undefined;
  const found = ref ? resolvePathDetailed(scope, ref.path).found : false;
  const update = (patch: Partial<DataRef>) => {
    if (!ref) return;
    const next: DataRef = { ...ref, ...patch };
    (Object.keys(patch) as Array<keyof DataRef>).forEach((k) => { if (patch[k] === undefined || patch[k] === '') delete next[k]; });
    setBind(prop, next);
  };
  const commitPath = (p: string) => {
    if (!p) return setBind(prop, undefined);
    if (!isSafePath(p)) return; // rejected: stays in the input, shown red
    setBind(prop, { ...(ref || {}), path: p });
  };
  return (
    <div className="rounded border border-white/5 bg-white/[0.02] p-2" data-binding={prop}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{prop}</span>
        <div className="flex items-center gap-1">
          {!disabled && <PickerButton scope={scope} value={ref?.path} onPick={commitPath} label={ref ? 'Change' : 'Select data'} />}
          {ref && !disabled && <Btn small danger onClick={() => setBind(prop, undefined)} title="Remove binding">✕</Btn>}
        </div>
      </div>
      <input
        aria-label={`${prop} binding path`}
        className={cx(
          'w-full rounded border bg-black/40 px-2 py-1 font-mono text-[11px] text-slate-100 outline-none',
          draftPath && !isSafePath(draftPath) ? 'border-red-500/60' : 'border-white/10 focus:border-amber-400/60'
        )}
        placeholder="not bound"
        value={draftPath}
        disabled={disabled}
        onChange={(e) => setDraftPath(e.target.value)}
        onBlur={() => draftPath !== (ref?.path || '') && commitPath(draftPath)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitPath(draftPath); }}
      />
      {draftPath && !isSafePath(draftPath) && <div className="mt-1 text-[10px] text-red-300">Not an allowed path</div>}
      {ref && (
        <>
          <div className={cx('mt-1 truncate font-mono text-[10px]', found ? 'text-emerald-300' : 'text-amber-300')}>
            {found ? `= ${preview(live)}` : `not in current data → ${preview(live)}`}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Select<FormatterName>
              value={ref.format}
              allowEmpty="no format"
              options={FORMATTERS as FormatterName[]}
              onChange={(v) => update({ format: v })}
            />
            <TextInput value={ref.fallback == null ? '' : String(ref.fallback)} placeholder="fallback" onChange={(v) => update({ fallback: v === '' ? undefined : v })} />
            <TextInput value={ref.prefix} placeholder="prefix" onChange={(v) => update({ prefix: v || undefined })} />
            <TextInput value={ref.suffix} placeholder="suffix" onChange={(v) => update({ suffix: v || undefined })} />
          </div>
        </>
      )}
    </div>
  );
}

// ── visibility condition (single rule; compound conditions are shown read-only) ──

export function ConditionEditor({ cond, scope, onChange, disabled }: { cond: Condition | undefined; scope: BindingScope; onChange(c: Condition | undefined): void; disabled?: boolean }) {
  if (cond && !('path' in cond)) {
    return (
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span className="truncate font-mono">{JSON.stringify(cond).slice(0, 60)}</span>
        {!disabled && <Btn small danger onClick={() => onChange(undefined)}>Clear</Btn>}
      </div>
    );
  }
  const rule = cond as { path: string; op: Operator; value?: any } | undefined;
  const noValue = rule && (rule.op === 'exists' || rule.op === 'notExists');
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <span className="flex-1 truncate font-mono text-[11px] text-slate-300">{rule?.path || 'always visible'}</span>
        {!disabled && <PickerButton scope={scope} value={rule?.path} onPick={(p) => onChange({ path: p, op: rule?.op || 'exists', value: rule?.value })} label={rule ? 'Change' : 'Add rule'} />}
        {rule && !disabled && <Btn small danger onClick={() => onChange(undefined)}>✕</Btn>}
      </div>
      {rule && (
        <Grid2>
          <Select<Operator> value={rule.op} options={OPERATORS as Operator[]} onChange={(op) => op && onChange({ ...rule, op })} />
          {!noValue && (
            <TextInput
              value={rule.value == null ? '' : String(rule.value)}
              placeholder="value"
              onChange={(v) => onChange({ ...rule, value: v === 'true' ? true : v === 'false' ? false : v !== '' && !isNaN(Number(v)) ? Number(v) : v })}
            />
          )}
        </Grid2>
      )}
    </div>
  );
}

// ── animation ───────────────────────────────────────────────────────────────

function StepEditor({ label, step, onChange }: { label: string; step: AnimationStep | undefined; onChange(s: AnimationStep | undefined): void }) {
  return (
    <Grid2>
      <Field label={label}>
        <Select<AnimationPreset>
          value={step?.preset}
          allowEmpty="none"
          options={(ANIMATION_PRESETS as AnimationPreset[]).filter((p) => p !== 'none')}
          onChange={(preset) => onChange(preset ? { ...(step || {}), preset } : undefined)}
        />
      </Field>
      <Field label="ms">
        <NumberInput value={step?.duration} min={0} max={60000} onChange={(d) => step && onChange({ ...step, duration: d })} />
      </Field>
    </Grid2>
  );
}

// ── the inspector ───────────────────────────────────────────────────────────

function InspectorImpl(props: InspectorProps) {
  const { doc, selected } = props;
  const el = selected.length === 1 ? locate(doc.elements, selected[0])?.el ?? null : null;
  const scope = useMemo(
    () => scopeForElement(doc, el?.id ?? null, props.state, props.lastEvents, props.feed),
    [doc, el?.id, props.state, props.lastEvents, props.feed]
  );
  const { set, setStyle, setBind, edit } = useEdit(props, el);

  if (selected.length === 0) return <DocumentInspector {...props} />;
  const align = <AlignBar doc={doc} selected={selected} exec={props.exec} disabled={props.disabled} />;
  if (!el) return <>{align}<MultiInspector {...props} /></>;

  const d = props.disabled;
  const s = el.style || {};
  const loc = locate(doc.elements, el.id);

  return (
    <fieldset disabled={d} className="min-w-0">
      {align}
      <Section title={`${el.type}`} help="element" right={<span className="font-mono text-[10px] text-slate-600">{el.id}</span>}>
        <Field label="Name"><TextInput value={el.name} onChange={(v) => set('name', v.slice(0, 120) || undefined)} /></Field>
        {loc && loc.ancestors.length > 0 && (
          <button type="button" className="text-left text-[10px] text-slate-500 hover:text-amber-200" onClick={() => props.onSelect([loc.ancestors[loc.ancestors.length - 1].id])}>
            ↑ in {loc.ancestors[loc.ancestors.length - 1].name || loc.ancestors[loc.ancestors.length - 1].id}
          </button>
        )}
      </Section>

      <Section title="Position & size" help="layout">
        <Grid2>
          <Field label="X"><NumberInput value={el.x} onChange={(v) => v != null && set('x', v)} /></Field>
          <Field label="Y"><NumberInput value={el.y} onChange={(v) => v != null && set('y', v)} /></Field>
          <Field label="W"><NumberInput value={el.w} min={0} onChange={(v) => v != null && set('w', Math.max(0, v))} /></Field>
          <Field label="H"><NumberInput value={el.h} min={0} onChange={(v) => v != null && set('h', Math.max(0, v))} /></Field>
          <Field label="Rotation"><NumberInput value={el.rotation ?? 0} onChange={(v) => set('rotation', v || undefined)} /></Field>
          <Field label="Opacity %">
            <NumberInput value={Math.round((el.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => set('opacity', v == null || v >= 100 ? undefined : Math.max(0, v) / 100)} />
          </Field>
        </Grid2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Btn small active={!el.hidden} onClick={() => set('hidden', el.hidden ? undefined : true)}>{el.hidden ? 'Hidden' : 'Visible'}</Btn>
          <Btn small active={!!el.locked} onClick={() => set('locked', el.locked ? undefined : true)}>{el.locked ? 'Locked' : 'Unlocked'}</Btn>
          <span className="ml-auto text-[10px] text-slate-500">Order</span>
          <Btn small title="Send to back" onClick={() => props.exec(reorderCmd(doc, el.id, 'back'))}>⤓</Btn>
          <Btn small title="Backward" onClick={() => props.exec(reorderCmd(doc, el.id, -1))}>▼</Btn>
          <Btn small title="Forward" onClick={() => props.exec(reorderCmd(doc, el.id, 1))}>▲</Btn>
          <Btn small title="Bring to front" onClick={() => props.exec(reorderCmd(doc, el.id, 'front'))}>⤒</Btn>
        </div>
      </Section>

      {TEXT_TYPES.has(el.type) && (
        <Section title="Text" help="text">
          <Field label="Content" hint={el.bind?.text ? 'Bound to data — shown when the value is empty' : undefined}>
            <textarea
              className="min-h-[52px] w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-400/60"
              value={el.text ?? ''}
              onChange={(e) => set('text', e.target.value.slice(0, 2000) || undefined)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </Field>
          <Field label="Font">
            {isRef(s.fontFamily)
              ? <div className="flex items-center gap-1"><span className="flex-1 truncate font-mono text-[10px] text-sky-200">{s.fontFamily.ref}</span><Btn small onClick={() => setStyle('fontFamily', undefined)}>✕</Btn></div>
              : <FontPicker value={typeof s.fontFamily === 'string' ? s.fontFamily : ''} emptyLabel="default" library={props.fontLibrary} onChange={(v) => setStyle('fontFamily', v)} />}
          </Field>
          <Grid2>
            <Field label="Size"><NumberInput value={num(s.fontSize)} min={1} onChange={(v) => setStyle('fontSize', v)} /></Field>
            <Field label="Weight"><Select value={s.fontWeight != null ? String(s.fontWeight) : undefined} allowEmpty="normal" options={['300', '400', '500', '600', '700', '800', '900']} onChange={(v) => setStyle('fontWeight', v ? Number(v) : undefined)} /></Field>
            <Field label="Align"><Select value={typeof s.align === 'string' ? s.align : undefined} allowEmpty="left" options={['left', 'center', 'right']} onChange={(v) => setStyle('align', v)} /></Field>
            <Field label="V-align"><Select value={typeof s.valign === 'string' ? s.valign : undefined} allowEmpty="middle" options={['top', 'middle', 'bottom']} onChange={(v) => setStyle('valign', v)} /></Field>
            <Field label="Line height"><NumberInput value={num(s.lineHeight)} step={0.1} onChange={(v) => setStyle('lineHeight', v)} /></Field>
            <Field label="Letter spacing"><NumberInput value={num(s.letterSpacing)} step={0.5} onChange={(v) => setStyle('letterSpacing', v)} /></Field>
            <Field label="Case"><Select value={typeof s.textTransform === 'string' ? s.textTransform : undefined} allowEmpty="as typed" options={['uppercase', 'lowercase', 'capitalize']} onChange={(v) => setStyle('textTransform', v)} /></Field>
          </Grid2>
          <StyleColor label="Color" value={s.color} onChange={(v) => setStyle('color', v)} />
        </Section>
      )}

      {(SHAPE_TYPES.has(el.type) || el.type === 'group' || el.type === 'repeater' || BAR_TYPES.has(el.type)) && (
        <Section title={BAR_TYPES.has(el.type) ? 'Bar' : 'Colour & outline'} help={BAR_TYPES.has(el.type) ? 'bar' : 'fill'}>
          <StyleColor label={BAR_TYPES.has(el.type) ? 'Track' : 'Fill'} value={s.fill} onChange={(v) => setStyle('fill', v)} />
          {BAR_TYPES.has(el.type) && <StyleColor label="Bar color" value={s.color} onChange={(v) => setStyle('color', v)} />}
          {!BAR_TYPES.has(el.type) && <StyleColor label="Stroke" value={s.stroke} onChange={(v) => setStyle('stroke', v)} />}
          <Grid2>
            {!BAR_TYPES.has(el.type) && <Field label="Stroke width"><NumberInput value={num(s.strokeWidth)} min={0} onChange={(v) => setStyle('strokeWidth', v)} /></Field>}
            <Field label="Radius"><NumberInput value={num(s.radius)} min={0} onChange={(v) => setStyle('radius', v)} /></Field>
            {BAR_TYPES.has(el.type) && <Field label="Max"><NumberInput value={el.max} min={1} onChange={(v) => set('max', v && v > 0 ? v : undefined)} /></Field>}
          </Grid2>
          <Field label="Shadow"><TextInput value={typeof s.shadow === 'string' ? s.shadow : ''} placeholder="0 8px 24px rgba(0,0,0,.4)" onChange={(v) => setStyle('shadow', v || undefined)} /></Field>
        </Section>
      )}

      {IMAGE_TYPES.has(el.type) && (
        <Section title="Image" help="image">
          <Field label="Source" hint="https:// or /relative"><TextInput value={el.src} mono onChange={(v) => set('src', v || undefined)} /></Field>
          <Field label="Fallback"><TextInput value={el.fallbackSrc} mono onChange={(v) => set('fallbackSrc', v || undefined)} /></Field>
          <Grid2>
            <Field label="Fit"><Select value={typeof s.objectFit === 'string' ? s.objectFit : undefined} allowEmpty="auto" options={['contain', 'cover', 'fill', 'none']} onChange={(v) => setStyle('objectFit', v)} /></Field>
            <Field label="Radius"><NumberInput value={num(s.radius)} min={0} onChange={(v) => setStyle('radius', v)} /></Field>
            <Field label="Grayscale"><NumberInput value={num(s.grayscale)} min={0} max={1} step={0.1} onChange={(v) => setStyle('grayscale', v)} /></Field>
          </Grid2>
        </Section>
      )}

      {el.type === 'icon' && (
        <Section title="Icon" help="icon">
          <Field label="Icon"><Select value={el.icon} options={Object.keys(ICONS)} onChange={(v) => set('icon', v)} /></Field>
          <StyleColor label="Color" value={s.color} onChange={(v) => setStyle('color', v)} />
        </Section>
      )}

      {el.type === 'map' && <MapSection el={el} onChange={(patch) => edit('map', (e) => ({ ...e, map: { ...(e.map || {}), ...patch } }))} />}
      {el.type === 'builtin' && (
        <BuiltinSection el={el} onChange={(patch) => edit('builtin', (e) => ({ ...e, ...patch }))} />
      )}

      {el.type === 'repeater' && el.repeater && (
        <RepeaterSection r={el.repeater} scope={scope} onChange={(r) => edit('repeater', (e) => ({ ...e, repeater: r }))} />
      )}

      <EffectsSection el={el} edit={edit} />
      <MaskSection el={el} edit={edit} canClip={!!loc && loc.index > 0} />

      <Section title="Connect to data" help="data">
        {bindablePropsFor(el.type).map((p) => (
          <BindingRow key={p} prop={p} el={el} scope={scope} setBind={setBind} disabled={d} />
        ))}
        {scope.item !== undefined && <div className="text-[10px] text-slate-500">Inside a repeater: use <span className="font-mono text-slate-300">item.*</span>, <span className="font-mono text-slate-300">rank</span>, <span className="font-mono text-slate-300">index</span>.</div>}
        {scope.event !== undefined && <div className="text-[10px] text-slate-500">Event-driven: use <span className="font-mono text-slate-300">event.payload.*</span>.</div>}
      </Section>

      <Section title="Only show when…" help="showWhen">
        <ConditionEditor cond={el.visibleWhen} scope={scope} disabled={d} onChange={(c) => set('visibleWhen', c)} />
      </Section>

      <Section title="Animation" help="animation">
        {describeAnimations(el).map((line, i) => (
          <div key={i} className="truncate rounded border border-white/5 bg-white/[0.02] px-2 py-1 text-[11px] text-slate-300" title={line}>{line}</div>
        ))}
        {!el.timeline?.clips.length && <div className="text-[10px] text-slate-500">No animations yet. Add one in the Animate panel: WHEN something happens → the layer DOES something.</div>}
        {props.onOpenAnimate && <Btn small active onClick={props.onOpenAnimate} data-testid="open-animate">{el.timeline?.clips.length ? 'Edit animations' : '+ Add animation'}</Btn>}
        <details className="text-[11px] text-slate-400">
          <summary className="cursor-pointer select-none text-[10px] uppercase tracking-wide text-slate-500 hover:text-slate-300">Classic presets (enter / exit / show on event)</summary>
          <div className="mt-2 flex flex-col gap-2">
        <StepEditor label="Enter" step={el.anim?.enter} onChange={(st) => edit('anim.enter', (e) => withAnim(e, 'enter', st))} />
        <StepEditor label="Exit" step={el.anim?.exit} onChange={(st) => edit('anim.exit', (e) => withAnim(e, 'exit', st))} />
        <Grid2>
          <Field label="Show on event">
            <Select<AnimationEvent>
              value={el.anim?.onEvent?.event}
              allowEmpty="always shown"
              options={ANIMATION_EVENTS as AnimationEvent[]}
              onChange={(ev) => edit('anim.onEvent', (e) => withAnim(e, 'onEvent', ev ? { preset: 'slideLeft', duration: 400, hold: 3000, ...(e.anim?.onEvent || {}), event: ev } : undefined))}
            />
          </Field>
          {el.anim?.onEvent && (
            <Field label="Hold ms">
              <NumberInput value={el.anim.onEvent.hold} min={0} max={60000} onChange={(h) => edit('anim.onEvent.hold', (e) => withAnim(e, 'onEvent', { ...e.anim!.onEvent!, hold: h }))} />
            </Field>
          )}
        </Grid2>
          </div>
        </details>
      </Section>
    </fieldset>
  );
}

/** Memoised: canvas zoom, timeline playback and preview frames do not touch its props. */
export const Inspector = memo(InspectorImpl);

// ── built-in graphic: theme / view + recolor filter ──────────────────────────

const FILTER_FNS = [
  { key: 'hue-rotate', label: 'Hue', unit: 'deg', min: -180, max: 180, def: 0 },
  { key: 'saturate', label: 'Saturation', unit: '%', min: 0, max: 300, def: 100 },
  { key: 'brightness', label: 'Brightness', unit: '%', min: 0, max: 300, def: 100 },
  { key: 'contrast', label: 'Contrast', unit: '%', min: 0, max: 300, def: 100 },
  { key: 'grayscale', label: 'Grayscale', unit: '%', min: 0, max: 100, def: 0 },
] as const;

/** "hue-rotate(40deg) saturate(120%)" -> { 'hue-rotate': 40, saturate: 120 } */
export function parseFilter(f: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  const re = /([a-z-]+)\((-?\d+(?:\.\d+)?)(deg|%|px)?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f || ''))) out[m[1]] = Number(m[2]);
  return out;
}

export function composeFilter(values: Record<string, number>): string | undefined {
  const parts = FILTER_FNS.filter((fn) => values[fn.key] != null && values[fn.key] !== fn.def).map((fn) => `${fn.key}(${values[fn.key]}${fn.unit})`);
  return parts.length ? parts.join(' ') : undefined;
}

const MAP_PICTURES = [{ value: 'auto', label: 'Map of the match' }, { value: 'erangle', label: 'Erangel' }, { value: 'miramar', label: 'Miramar' }, { value: 'rondo', label: 'Rondo' }];
const MAP_FOLLOWS = [{ value: 'none', label: 'Whole map' }, { value: 'zone', label: 'Follow the safe zone' }, { value: 'observed', label: 'Follow the observed player' }];

function MapSection({ el, onChange }: { el: LayoutElement; onChange(patch: NonNullable<LayoutElement['map']>): void }) {
  const m = el.map || {};
  const toggle = (key: 'showZone' | 'showNames' | 'showDead', label: string, on: boolean) => (
    <label className="flex items-center gap-2 text-[11px] text-slate-300">
      <input type="checkbox" checked={on} onChange={(e) => onChange({ [key]: e.target.checked })} className="accent-amber-400" />
      {label}
    </label>
  );
  return (
    <Section title="Map" help="map" right={<span className="text-[9px] text-slate-500">desktop app</span>}>
      <Grid2>
        <Field label="Picture">
          <Select value={m.mapId || 'auto'} options={MAP_PICTURES} onChange={(v) => v && onChange({ mapId: v as any })} />
        </Field>
        <Field label="View">
          <Select value={m.follow || 'none'} options={MAP_FOLLOWS} onChange={(v) => v && onChange({ follow: v as any })} />
        </Field>
        <Field label="Dot size">
          <NumberInput value={m.dotSize ?? 14} min={1} max={200} onChange={(v) => onChange({ dotSize: Math.min(200, Math.max(1, v || 14)) })} />
        </Field>
        {m.follow === 'observed' && (
          <Field label="Zoom">
            <NumberInput value={m.zoom ?? 6} min={1} max={40} onChange={(v) => onChange({ zoom: Math.min(40, Math.max(1, v || 6)) })} />
          </Field>
        )}
      </Grid2>
      {toggle('showZone', 'Show the safe zone', m.showZone !== false)}
      {toggle('showNames', 'Show player names', m.showNames === true)}
      {toggle('showDead', 'Show dead players', m.showDead === true)}
      <div className="text-[10px] text-slate-500">Runs in the desktop app on the game's own position feed. Here it shows sample players; the map picture only loads in the desktop app.</div>
    </Section>
  );
}

function BuiltinSection({ el, onChange }: { el: LayoutElement; onChange(patch: Partial<LayoutElement>): void }) {
  const all = useMemo(() => listBuiltinGraphics(), []);
  const themes = Array.from(new Set(all.map((g) => g.theme)));
  const ref = el.builtin || { theme: themes[0] || 'Theme1', view: 'lower' };
  const views = all.filter((g) => g.theme === ref.theme);
  const f = parseFilter(el.filter);
  const setF = (k: string, v: number) => onChange({ filter: composeFilter({ ...f, [k]: v }) });
  return (
    <Section title="Built-in graphic" help="builtin" right={<span className="text-[9px] text-slate-500">live</span>}>
      <Grid2>
        <Field label="Theme">
          <Select value={ref.theme} options={themes} onChange={(t) => {
            if (!t) return;
            const view = all.some((g) => g.theme === t && g.view === ref.view) ? ref.view : (all.find((g) => g.theme === t)?.view ?? ref.view);
            onChange({ builtin: { theme: t, view } });
          }} />
        </Field>
        <Field label="Graphic">
          <Select value={ref.view} options={views.map((g) => ({ value: g.view, label: g.label }))} onChange={(v) => v && onChange({ builtin: { ...ref, view: v } })} />
        </Field>
      </Grid2>
      {FILTER_FNS.map((fn) => (
        <Field key={fn.key} label={`${fn.label} ${f[fn.key] ?? fn.def}${fn.unit === 'deg' ? '°' : '%'}`}>
          <input type="range" min={fn.min} max={fn.max} value={f[fn.key] ?? fn.def} onChange={(e) => setF(fn.key, Number(e.target.value))} className="accent-amber-400" />
        </Field>
      ))}
      {el.filter && <Btn small onClick={() => onChange({ filter: undefined })}>Reset colors</Btn>}
      <div className="text-[10px] text-slate-500">Runs the theme’s own logic (recalls, kills, eliminations). Use Effects, Mask and Timeline to style and animate it.</div>
    </Section>
  );
}

function withAnim(e: LayoutElement, key: 'enter' | 'exit' | 'onEvent', step: any): LayoutElement {
  const anim = { ...(e.anim || {}) } as any;
  if (step) anim[key] = step; else delete anim[key];
  const next = { ...e, anim };
  if (!Object.keys(anim).length) delete next.anim;
  return next;
}

function RepeaterSection({ r, scope, onChange }: { r: RepeaterConfig; scope: BindingScope; onChange(r: RepeaterConfig): void }) {
  const upd = (patch: Partial<RepeaterConfig>) => {
    const next = { ...r, ...patch } as any;
    Object.keys(patch).forEach((k) => { if ((patch as any)[k] === undefined) delete next[k]; });
    onChange(next);
  };
  return (
    <Section title="List (repeater)" help="repeater">
      <Field label="Source"><Select<RepeaterSource> value={r.source} options={REPEATER_SOURCES as RepeaterSource[]} onChange={(v) => v && upd({ source: v })} /></Field>
      <Grid2>
        <Field label="Limit"><NumberInput value={r.limit} min={1} max={100} onChange={(v) => v && upd({ limit: Math.max(1, v) })} /></Field>
        <Field label="Offset"><NumberInput value={r.offset} min={0} onChange={(v) => upd({ offset: v || undefined })} /></Field>
        <Field label="Direction"><Select value={r.direction} options={['column', 'row', 'grid']} onChange={(v) => v && upd({ direction: v as RepeaterConfig['direction'] })} /></Field>
        {r.direction === 'grid' && <Field label="Columns"><NumberInput value={r.columns} min={1} max={50} onChange={(v) => upd({ columns: v })} /></Field>}
        <Field label="Gap"><NumberInput value={r.gap} min={0} onChange={(v) => upd({ gap: v })} /></Field>
        <Field label="Item W"><NumberInput value={r.itemWidth} min={0} onChange={(v) => upd({ itemWidth: v })} /></Field>
        <Field label="Item H"><NumberInput value={r.itemHeight} min={0} onChange={(v) => upd({ itemHeight: v })} /></Field>
      </Grid2>
      <div className="flex items-center gap-1">
        <span className="flex-1 truncate font-mono text-[11px] text-slate-300">{r.sort ? `sort ${r.sort.path} ${r.sort.dir}` : 'source order'}</span>
        <PickerButton scope={scope} value={r.sort?.path} label="Sort by" onPick={(p) => upd({ sort: { path: p, dir: r.sort?.dir || 'desc' } })} />
        {r.sort && <Btn small onClick={() => upd({ sort: { ...r.sort!, dir: r.sort!.dir === 'asc' ? 'desc' : 'asc' } })}>{r.sort.dir}</Btn>}
        {r.sort && <Btn small danger onClick={() => upd({ sort: undefined })}>✕</Btn>}
      </div>
      <div className="text-[10px] text-slate-500">Sort paths are relative to each item, e.g. <span className="font-mono">item.totalPoints</span>.</div>
    </Section>
  );
}

function MultiInspector(props: InspectorProps) {
  const { doc, selected } = props;
  const els = selected.map((id) => locate(doc.elements, id)?.el).filter(Boolean) as LayoutElement[];
  const same = <K extends 'x' | 'y' | 'w' | 'h'>(k: K) => (els.every((e) => e[k] === els[0]?.[k]) ? els[0]?.[k] : undefined);
  const setAll = (k: 'x' | 'y' | 'w' | 'h', v: number | undefined) => {
    if (v == null) return;
    props.exec(editElements(doc, selected, (e) => ({ ...e, [k]: v }), `Edit ${k}`, `insp:multi:${k}`));
  };
  return (
    <fieldset disabled={props.disabled}>
      <Section title={`${els.length} elements`} help="multi">
        <Grid2>
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <Field key={k} label={k.toUpperCase()}><NumberInput value={same(k)} onChange={(v) => setAll(k, v)} /></Field>
          ))}
        </Grid2>
        <div className="text-[10px] text-slate-500">Empty = values differ. Ctrl+G groups siblings.</div>
      </Section>
    </fieldset>
  );
}

// ── document ────────────────────────────────────────────────────────────────

const THEME_COLORS = ['primary', 'secondary', 'accent', 'text', 'muted', 'surface'];

function DocumentInspector(props: InspectorProps) {
  const { doc } = props;
  const [name, setName] = useState(props.name);
  useEffect(() => setName(props.name), [props.name]);
  const setStage = (patch: Partial<LayoutDocument['stage']>) =>
    props.exec(setDocFieldCmd(doc, 'stage', { ...doc.stage, ...patch }, 'Stage', 'doc:stage'));
  const setThemeColor = (k: string, v: string | undefined) =>
    props.exec(setDocFieldCmd(doc, 'theme', { ...doc.theme, colors: { ...(doc.theme.colors || {}), [k]: v || '#000000' } }, 'Theme color', `doc:theme:${k}`));
  const setFont = (v: string) =>
    props.exec(setDocFieldCmd(doc, 'theme', { ...doc.theme, typography: { ...(doc.theme.typography || {}), fontFamily: v || 'Inter, sans-serif' } }, 'Theme font', 'doc:theme:font'));
  return (
    <fieldset disabled={props.disabled}>
      <Section title="Document" help="document">
        <Field label="Layout name">
          <TextInput value={name} onChange={setName} onBlur={() => name.trim() && name !== props.name && props.onRename(name.trim().slice(0, 120))} />
        </Field>
        <Grid2>
          <Field label="Width"><NumberInput value={doc.stage.width} min={16} max={7680} onChange={(v) => v && setStage({ width: v })} /></Field>
          <Field label="Height"><NumberInput value={doc.stage.height} min={16} max={4320} onChange={(v) => v && setStage({ height: v })} /></Field>
        </Grid2>
        <Field label="Background" hint="Empty = transparent (what OBS composites)">
          <ColorInput value={doc.stage.background ?? undefined} onChange={(v) => setStage({ background: v || null })} />
        </Field>
      </Section>
      <Section title="Theme" help="theme">
        {THEME_COLORS.map((k) => (
          <Field key={k} label={k}><ColorInput value={doc.theme.colors?.[k]} onChange={(v) => setThemeColor(k, v)} /></Field>
        ))}
        <Field label="Font family"><FontPicker value={doc.theme.typography?.fontFamily} library={props.fontLibrary} onChange={(v) => setFont(v || '')} /></Field>
      </Section>
      <LiveDataSection defaults={props.defaults} onDefaults={props.onDefaults} />
      {props.documentExtra}
    </fieldset>
  );
}

/** Tournament/round the LIVE preview and the published overlay default to. */
function LiveDataSection({ defaults, onDefaults }: { defaults: LayoutDefaults; onDefaults(d: Partial<LayoutDefaults>): void }) {
  // Cached (requestCache): this panel re-mounts every time the selection is cleared.
  const tid = defaults.tournamentId;
  const tQuery = useCached<Array<{ _id: string; tournamentName?: string }>>(CACHE_KEYS.tournaments, async () => {
    const r = await api.get('/tournaments');
    return Array.isArray(r.data) ? r.data : r.data?.tournaments || [];
  });
  const rQuery = useCached<Array<{ _id: string; roundName?: string }>>(tid ? CACHE_KEYS.rounds(tid) : null, async () => {
    const r = await api.get(`/tournaments/${tid}/rounds`);
    return Array.isArray(r.data) ? r.data : r.data?.rounds || [];
  });
  const tournaments = tQuery.data || [];
  const rounds = (tid && rQuery.data) || [];
  const err = tQuery.error && !tQuery.data ? 'Could not load tournaments' : null;
  return (
    <Section title="Live data" help="liveData">
      <Field label="Tournament">
        <Select
          value={defaults.tournamentId || undefined}
          allowEmpty="— none —"
          options={tournaments.map((t) => ({ value: t._id, label: t.tournamentName || t._id }))}
          onChange={(v) => onDefaults({ tournamentId: v || null, roundId: null })}
        />
      </Field>
      <Field label="Round">
        <Select
          value={defaults.roundId || undefined}
          allowEmpty="— none —"
          options={rounds.map((r) => ({ value: r._id, label: r.roundName || r._id }))}
          onChange={(v) => onDefaults({ roundId: v || null })}
        />
      </Field>
      <Field label="Match">
        <Select<LayoutDefaults['matchMode']>
          value={defaults.matchMode}
          options={[{ value: 'selectedMatch', label: 'Follow selected match' }, { value: 'liveMatch', label: 'Live match' }]}
          onChange={(v) => v && onDefaults({ matchMode: v })}
        />
      </Field>
      {err && <div className="text-[10px] text-red-300">{err}</div>}
      <div className="text-[10px] text-slate-500">Used by LIVE preview and as the published overlay’s default (URL ?t=&r= overrides).</div>
    </Section>
  );
}
