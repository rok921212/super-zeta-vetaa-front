// What kind of value a data field holds, and whether that kind makes sense for
// the property it is bound to. Used by the Data panel (type badges, the
// default property for a drop), the binding rows and the publish checks.
// Pure; it only looks at values, never at field names.

import type { BindableProp, DataRef, LayoutElement } from '../schema/layoutTypes.ts';

export type ValueKind = 'text' | 'number' | 'boolean' | 'image' | 'color' | 'list' | 'object' | 'empty';

export const KIND_LABEL: Record<ValueKind, string> = {
  text: 'Text', number: 'Number', boolean: 'Yes / no', image: 'Image', color: 'Colour', list: 'List', object: 'Group', empty: 'Empty',
};

const IMAGE_RE = /^(asset:[a-f0-9]{24}|(https?:\/\/|\/)[^\s]*\.(png|jpe?g|webp|avif|gif|svg)(\?[^\s]*)?)$/i;
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%deg/]+\))$/i;

/** The kind of a value as it is right now. `empty` = null / undefined / '' (nothing can be said about it). */
export function valueKind(v: unknown): ValueKind {
  if (v === null || v === undefined || v === '') return 'empty';
  if (Array.isArray(v)) return 'list';
  if (typeof v === 'object') return 'object';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  const s = String(v).trim();
  if (IMAGE_RE.test(s)) return 'image';
  if (COLOR_RE.test(s)) return 'color';
  if (s !== '' && Number.isFinite(Number(s))) return 'number';
  return 'text';
}

export interface BindingProblem { level: 'error' | 'warning'; message: string }

const NUMERIC_PROPS: ReadonlySet<BindableProp> = new Set<BindableProp>(['value', 'max', 'opacity', 'width', 'height', 'x', 'y']);
const COLOR_PROPS: ReadonlySet<BindableProp> = new Set<BindableProp>(['fill', 'color', 'stroke']);

const PROP_LABEL: Record<BindableProp, string> = {
  text: 'the text', src: 'the picture', visible: 'visibility', value: 'the bar value', max: 'the bar maximum', fill: 'the fill colour',
  color: 'the colour', stroke: 'the outline colour', opacity: 'the opacity', width: 'the width', height: 'the height', x: 'the X position', y: 'the Y position',
};
export const propLabel = (p: BindableProp): string => PROP_LABEL[p] || p;

/**
 * Why this value is wrong for this property, or null when it fits.
 *   error    it can never work (a list as text, a word as a width)
 *   warning  it works but probably not as meant
 * An `empty` value is never a problem here: whether the field exists at all is
 * a separate question (the fallback covers it).
 */
export function bindingProblem(prop: BindableProp, value: unknown, ref?: Pick<DataRef, 'format'> | null): BindingProblem | null {
  const kind = valueKind(value);
  if (kind === 'empty') return null;
  if (kind === 'list' || kind === 'object') {
    if (prop === 'visible') return { level: 'warning', message: `A ${KIND_LABEL[kind].toLowerCase()} always counts as “yes”: the layer would always be shown. Pick a value inside it, or use “Only show when…”.` };
    return { level: 'error', message: `This field is a ${KIND_LABEL[kind].toLowerCase()}, not a single value. Open it and pick one value inside${kind === 'list' ? ' (or its length)' : ''}.` };
  }
  if (prop === 'text') return null; // any single value can be shown as text
  if (prop === 'visible') return null; // any single value is yes / no by being empty or not
  if (prop === 'src') {
    if (kind === 'image') return null;
    if (kind === 'text') return { level: 'warning', message: 'This value does not look like an image address. If it is not one, the fallback image is shown.' };
    return { level: 'error', message: `${KIND_LABEL[kind]} cannot be used as a picture.` };
  }
  if (NUMERIC_PROPS.has(prop)) {
    if (kind === 'number') return null;
    // A formatter that produces text ("upper", "ordinal") defeats a numeric property.
    return { level: 'error', message: `${capital(propLabel(prop))} needs a number; this field is ${KIND_LABEL[kind].toLowerCase()}${ref?.format ? ` (format “${ref.format}”)` : ''}.` };
  }
  if (COLOR_PROPS.has(prop)) {
    if (kind === 'color') return null;
    if (kind === 'text') return { level: 'warning', message: 'This value is not a colour code (#rrggbb). A colour name works; anything else leaves the layer its own colour.' };
    return { level: 'error', message: `${capital(propLabel(prop))} needs a colour; this field is ${KIND_LABEL[kind].toLowerCase()}.` };
  }
  return null;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The properties of this layer a value of `kind` can drive, best first (what a drop or "Bind" picks by default). */
export function propsForKind(candidates: BindableProp[], kind: ValueKind): BindableProp[] {
  // A list or a group is not a single value: nothing can be driven by it directly.
  if (kind === 'list' || kind === 'object') return [];
  const score = (p: BindableProp): number => {
    if (kind === 'image') return p === 'src' ? 0 : p === 'text' ? 5 : 9;
    if (kind === 'color') return COLOR_PROPS.has(p) ? 0 : p === 'text' ? 5 : 9;
    if (kind === 'boolean') return p === 'visible' ? 0 : p === 'text' ? 5 : 9;
    if (kind === 'number') return p === 'text' ? 0 : p === 'value' ? 0 : NUMERIC_PROPS.has(p) ? 3 : p === 'visible' ? 6 : 9;
    if (kind === 'text') return p === 'text' ? 0 : p === 'visible' ? 6 : 9;
    return p === 'text' ? 0 : p === 'visible' ? 1 : 9; // empty: unknown, the commonest first
  };
  return candidates.filter((p) => score(p) < 9).sort((a, b) => score(a) - score(b));
}

/** The property a field dropped on this layer binds by default, or null when none fits. */
export function defaultPropFor(candidates: BindableProp[], kind: ValueKind): BindableProp | null {
  return propsForKind(candidates, kind)[0] ?? null;
}

/** Every binding of a layer as `{ prop, ref }` pairs. */
export function bindingsOf(el: LayoutElement): Array<{ prop: BindableProp; ref: DataRef }> {
  return (Object.keys(el.bind || {}) as BindableProp[]).filter((p) => !!el.bind![p]).map((prop) => ({ prop, ref: el.bind![prop]! }));
}
