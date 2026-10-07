// Binding facade used by the renderer, the Designer's data picker and the
// "why is this not showing?" diagnostics — one code path for all three.

import type {
  BindableProp,
  DataRef,
  ElementStyle,
  LayoutDocument,
  LayoutElement,
  RepeaterConfig,
  StyleValue,
} from '../schema/layoutTypes.ts';
import { applyFormatter } from './formatters.ts';
import { evaluateCondition } from './conditions.ts';
import { resolvePath, resolvePathDetailed, type BindingScope } from './resolve.ts';
import { computeLive, EMPTY_FEED, type FeedState } from './live.ts';
import { EMPTY_LOCAL, SAMPLE_LOCAL } from './local.ts';

export { buildLocal, EMPTY_LOCAL, SAMPLE_LOCAL, type LocalState, type LocalPlayer, type LocalTeam, type LocalZone } from './local.ts';
export { computeLive, feedReducer, EMPTY_FEED, FEED_LIMIT, type FeedState, type LiveState } from './live.ts';

export { resolvePath, resolvePathDetailed, tokenizePath, type BindingScope } from './resolve.ts';
export { evaluateCondition } from './conditions.ts';
export { applyFormatter, FORMATTER_IMPLS } from './formatters.ts';

/** Anything shaped like an engine state (EngineState, SDK v1 state, simulation state). */
export interface DataState {
  tournament?: any;
  round?: any;
  match?: any;
  matches?: any[];
  matchData?: any;
  deadTeamList?: any[];
  overallData?: any;
  matchDatas?: any[];
  derived?: any;
  status?: any;
  /** Desktop only: the local game feed, already shaped (bindings/local.ts). */
  local?: any;
}

/** The root scope for a layout: live data + the layout's own theme / variables / brand. */
export function buildScope(state: DataState | null | undefined, layout: Pick<LayoutDocument, 'theme' | 'variables' | 'brand'>, feed?: FeedState | null, opts?: { sampleLocal?: boolean }): BindingScope {
  const s = state || {};
  return {
    tournament: s.tournament ?? null,
    round: s.round ?? null,
    match: s.match ?? null,
    matches: s.matches ?? [],
    matchData: s.matchData ?? null,
    deadTeamList: s.deadTeamList ?? [],
    overallData: s.overallData ?? null,
    matchDatas: s.matchDatas ?? [],
    derived: s.derived ?? {},
    status: s.status ?? {},
    variables: layout.variables || {},
    theme: layout.theme || {},
    brand: layout.brand || {},
    live: computeLive(state),
    feed: feed || EMPTY_FEED,
    // The Designer has no local game feed: it shows sample players and a sample zone.
    local: s.local ?? (opts?.sampleLocal ? SAMPLE_LOCAL : EMPTY_LOCAL),
  };
}

/** Resolve one binding to its display value: lookup -> formatter -> prefix/suffix, else fallback. */
export function resolveBinding(ref: DataRef | undefined, scope: BindingScope): unknown {
  if (!ref) return undefined;
  const raw = resolvePath(scope, ref.path);
  if (raw === undefined || raw === null || raw === '') return ref.fallback;
  const v = applyFormatter(ref.format, raw, scope);
  if (ref.prefix || ref.suffix) return `${ref.prefix || ''}${v}${ref.suffix || ''}`;
  return v;
}

export function resolveBoundProps(el: LayoutElement, scope: BindingScope): Partial<Record<BindableProp, unknown>> {
  const out: Partial<Record<BindableProp, unknown>> = {};
  if (!el.bind) return out;
  for (const key of Object.keys(el.bind) as BindableProp[]) out[key] = resolveBinding(el.bind[key], scope);
  return out;
}

export function resolveStyleValue(v: StyleValue | undefined, scope: BindingScope): unknown {
  if (v && typeof v === 'object' && 'ref' in v) return resolvePath(scope, v.ref);
  return v;
}

/** Style with `{ ref }` tokens resolved and matching `styleWhen` rules merged on top. */
export function resolveElementStyle(el: LayoutElement, scope: BindingScope): { style: Record<string, unknown>; opacity?: number } {
  const merged: ElementStyle = { ...(el.style || {}) };
  let opacity: number | undefined;
  for (const rule of el.styleWhen || []) {
    if (evaluateCondition(rule.when, scope)) {
      Object.assign(merged, rule.style || {});
      if (rule.opacity != null) opacity = rule.opacity;
    }
  }
  const style: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) style[k] = k === 'gradient' ? v : resolveStyleValue(v as StyleValue, scope);
  return { style, opacity };
}

export function isElementVisible(el: LayoutElement, scope: BindingScope, bound?: Partial<Record<BindableProp, unknown>>): boolean {
  if (el.hidden) return false;
  if (el.visibleWhen && !evaluateCondition(el.visibleWhen, scope)) return false;
  const b = bound ?? (el.bind?.visible ? { visible: resolveBinding(el.bind.visible, scope) } : {});
  if (el.bind?.visible && !b.visible) return false;
  return true;
}

/** The list a repeater iterates: source -> filter -> sort -> offset/limit. */
export function resolveRepeaterItems(cfg: RepeaterConfig, scope: BindingScope): any[] {
  const src = resolvePath(scope, cfg.source);
  if (!Array.isArray(src)) return [];
  let items = src.slice();
  if (cfg.filter) items = items.filter((item, index) => evaluateCondition(cfg.filter, { ...scope, item, index }));
  if (cfg.sort) {
    const { path, dir } = cfg.sort;
    const sign = dir === 'desc' ? -1 : 1;
    items = items
      .map((item, i) => ({ item, i, key: resolvePath({ ...scope, item }, path) as any }))
      .sort((a, b) => {
        const an = typeof a.key === 'number' ? a.key : Number(a.key);
        const bn = typeof b.key === 'number' ? b.key : Number(b.key);
        const c = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(a.key ?? '').localeCompare(String(b.key ?? ''));
        return c !== 0 ? c * sign : a.i - b.i;
      })
      .map((x) => x.item);
  }
  const offset = cfg.offset || 0;
  return items.slice(offset, offset + cfg.limit);
}

/** Child scope for repeater item i. rank is 1-based and counts the offset. */
export function itemScope(parent: BindingScope, item: any, i: number, offset = 0): BindingScope {
  return { ...parent, parent: parent.item, item, index: i, rank: offset + i + 1 };
}

// ── diagnostics ("why is this not showing?") ────────────────────────────────

export interface DiagnosticCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ElementDiagnosis {
  elementId: string;
  checks: DiagnosticCheck[];
  bindings: Array<{ prop: string; path: string; found: boolean; raw: unknown; value: unknown; missingSegment?: string }>;
}

/** Find an element (and the chain of its ancestors) anywhere in the tree. */
export function findElementPath(elements: LayoutElement[], id: string, trail: LayoutElement[] = []): LayoutElement[] | null {
  for (const el of elements) {
    if (el.id === id) return [...trail, el];
    if (el.children) {
      const found = findElementPath(el.children, id, [...trail, el]);
      if (found) return found;
    }
  }
  return null;
}

export function diagnoseElement(
  layout: LayoutDocument,
  elementId: string,
  rootScope: BindingScope,
  extra: { assetFailed?: boolean } = {}
): ElementDiagnosis | null {
  const chain = findElementPath(layout.elements, elementId);
  if (!chain) return null;
  const el = chain[chain.length - 1];
  const checks: DiagnosticCheck[] = [];

  // Inside a repeater, diagnose against its FIRST item (what the canvas shows first).
  let scope = rootScope;
  for (const anc of chain.slice(0, -1)) {
    if (anc.type === 'repeater' && anc.repeater) {
      const items = resolveRepeaterItems(anc.repeater, scope);
      checks.push({ label: `Repeater "${anc.name || anc.id}" has items`, ok: items.length > 0, detail: `${items.length} item(s) from ${anc.repeater.source}` });
      if (items.length) scope = itemScope(scope, items[0], 0, anc.repeater.offset || 0);
    }
  }

  const bindings = Object.entries(el.bind || {}).map(([prop, ref]) => {
    const r = resolvePathDetailed(scope, ref!.path);
    const tokens = ref!.path.split(/[.[\]]/).filter(Boolean);
    return {
      prop,
      path: ref!.path,
      found: r.found,
      raw: r.value,
      value: resolveBinding(ref, scope),
      missingSegment: r.found ? undefined : tokens[r.missingAt],
    };
  });
  for (const b of bindings) {
    checks.push({
      label: `Binding ${b.prop} → ${b.path}`,
      ok: b.found,
      detail: b.found ? `resolved: ${JSON.stringify(b.value)?.slice(0, 80)}` : `path does not exist (missing "${b.missingSegment}")`,
    });
  }
  if (el.visibleWhen) {
    const pass = evaluateCondition(el.visibleWhen, scope);
    checks.push({ label: 'Visibility condition passed', ok: pass });
  }
  checks.push({ label: 'Element not hidden', ok: !el.hidden });
  const hiddenAncestor = chain.slice(0, -1).find((a) => a.hidden || (a.visibleWhen && !evaluateCondition(a.visibleWhen, rootScope)));
  checks.push({ label: 'Parents visible', ok: !hiddenAncestor, detail: hiddenAncestor ? `"${hiddenAncestor.name || hiddenAncestor.id}" is hidden` : undefined });
  const { opacity } = resolveElementStyle(el, scope);
  const effectiveOpacity = opacity ?? el.opacity ?? 1;
  checks.push({ label: 'Opacity > 0', ok: effectiveOpacity > 0, detail: `opacity ${effectiveOpacity}` });
  checks.push({ label: 'Has size', ok: el.w > 0 && el.h > 0, detail: `${el.w}×${el.h}` });
  if (chain.length === 1) {
    const inside = el.x < layout.stage.width && el.y < layout.stage.height && el.x + el.w > 0 && el.y + el.h > 0;
    checks.push({ label: 'Within stage', ok: inside, detail: `at ${el.x},${el.y}` });
  }
  if (el.anim?.onEvent) {
    checks.push({ label: `Event-driven: waits for a "${el.anim.onEvent.event}" event`, ok: true, detail: 'only visible while that event plays' });
  }
  if (extra.assetFailed != null) checks.push({ label: 'Asset loaded', ok: !extra.assetFailed });
  return { elementId, checks, bindings };
}
