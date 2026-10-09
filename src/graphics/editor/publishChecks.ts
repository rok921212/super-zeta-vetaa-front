// What is checked before a design is published, in words a designer can act
// on: every finding names the layer and says what is wrong with it.
//
//   error    publishing is refused: the overlay would be broken on air
//            (invalid document, an image that is gone, a field that can never
//            fit the property it drives, a list with nothing to repeat)
//   warning  it publishes if the user says so: it works, but probably not as
//            meant (a field missing from the current data, an empty text, a
//            layer off the canvas)
//
// The server runs its own validation on publish (the shared schema + image
// ownership); this is the same schema plus the checks that need the live
// data scope. Pure.

import type { BindableProp, Condition, LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { validateLayout } from '../schema/layoutSchema.js';
import { resolvePathDetailed, resolveRepeaterItems, type DataState, type FeedState } from '../bindings/index.ts';
import { bindingProblem, bindingsOf, propLabel } from '../bindings/compat.ts';
import type { EngineEvent } from '../../overlayClient/engineTypes.ts';
import { assetIdOf } from '../renderer/assets.ts';
import { scopeForElement } from './scope.ts';
import { absoluteOrigin, flatten } from './tree.ts';

export interface PublishIssue {
  level: 'error' | 'warning';
  /** The layer to jump to; null = the design as a whole. */
  elementId: string | null;
  /** The layer's name as the user sees it ("Player Portrait"), or "Canvas" / "Design". */
  layer: string;
  message: string;
}

export interface PublishSummary {
  layers: number;
  boundLayers: number;
  animatedLayers: number;
  animations: number;
  /** Which kinds of data the design reads ("tournament", "live", "feed"…). */
  dataSources: string[];
  images: number;
}

export interface PublishReport {
  errors: PublishIssue[];
  warnings: PublishIssue[];
  summary: PublishSummary;
}

export interface PublishCheckInput {
  name: string;
  /** The data the editor is previewing on (live or simulation); null = none yet. */
  state: DataState | null;
  lastEvents?: Partial<Record<string, EngineEvent>>;
  feed?: FeedState | null;
  /** Ids of the images in the account's library; null = the library has not loaded (image checks are skipped, the server still checks). */
  assetIds: Set<string> | null;
}

const SOURCE_LABEL: Record<string, string> = {
  tournament: 'Tournament', round: 'Round', match: 'Match', matches: 'Match', matchData: 'Match', derived: 'Teams and players',
  live: 'Match state', feed: 'Kill feed', event: 'Events', overallData: 'Overall standings', matchDatas: 'Overall standings',
  deadTeamList: 'Overall standings', local: 'Desktop app feed', item: '', rank: '', index: '', parent: '', theme: '', variables: '', brand: '', status: 'Connection',
};

const nameOf = (el: LayoutElement): string => el.name || `${el.type} ${el.id}`;
const rootOf = (path: string): string => path.split(/[.[]/)[0];

function conditionPaths(c: Condition | undefined, out: string[] = []): string[] {
  if (!c) return out;
  if ('all' in c) c.all.forEach((x) => conditionPaths(x, out));
  else if ('any' in c) c.any.forEach((x) => conditionPaths(x, out));
  else if ('not' in c) conditionPaths(c.not, out);
  else if (c.path) out.push(c.path);
  return out;
}

/** `elements[2].children[0].bind.text` -> that element (and the rest of the path). */
export function elementAtPath(doc: LayoutDocument, path: string): { el: LayoutElement; rest: string } | null {
  const m = path.match(/^elements((?:\[\d+\](?:\.children)?)+)\.?(.*)$/);
  if (!m) return null;
  const idx = (m[1].match(/\d+/g) || []).map(Number);
  let list: LayoutElement[] | undefined = doc.elements;
  let el: LayoutElement | undefined;
  for (const i of idx) {
    el = list?.[i];
    if (!el) return null;
    list = el.children;
  }
  return el ? { el, rest: m[2] } : null;
}

const FIELD_WORDS: Array<[RegExp, string]> = [
  [/^bind\.(\w+)/, 'data connection'], [/^style\.(\w+)/, 'style'], [/^timeline/, 'animation'], [/^anim/, 'animation'],
  [/^imageFill/, 'picture'], [/^src$|^fallbackSrc$/, 'image source'], [/^repeater/, 'list settings'], [/^mask/, 'mask'],
  [/^effects/, 'effects'], [/^visibleWhen/, '“only show when” rule'], [/^points$|^d$/, 'shape'], [/^text$/, 'text'],
];
const fieldWord = (rest: string): string => FIELD_WORDS.find(([re]) => re.test(rest))?.[1] || rest || 'layer';

export function checkPublish(doc: LayoutDocument, input: PublishCheckInput): PublishReport {
  const errors: PublishIssue[] = [];
  const warnings: PublishIssue[] = [];
  const add = (level: 'error' | 'warning', el: LayoutElement | null, layer: string, message: string) =>
    (level === 'error' ? errors : warnings).push({ level, elementId: el ? el.id : null, layer, message });

  if (!input.name.trim()) add('error', null, 'Design', 'Give the design a name before publishing.');

  // ── the document itself (the schema the server enforces) ──
  const schema = validateLayout(doc) as { ok: boolean; errors: Array<{ path: string; message: string }> };
  for (const e of schema.errors.slice(0, 40)) {
    const at = elementAtPath(doc, e.path);
    if (at) add('error', at.el, nameOf(at.el), `Its ${fieldWord(at.rest)} is not valid: ${e.message}.`);
    else if (e.path.startsWith('stage')) add('error', null, 'Canvas', `${e.message.charAt(0).toUpperCase()}${e.message.slice(1)}.`);
    else add('error', null, 'Design', `${e.path ? `${e.path}: ` : ''}${e.message}.`);
  }

  const all = flatten(doc.elements).map((f) => f.el);
  const sources = new Set<string>();
  const images = new Set<string>();
  const noteImage = (src: string | null | undefined) => { const id = assetIdOf(src); if (id) images.add(id); };
  const imageGone = (src: string | null | undefined): boolean => { const id = assetIdOf(src); return !!id && !!input.assetIds && !input.assetIds.has(id); };
  let boundLayers = 0;
  let animatedLayers = 0;
  let animations = 0;

  noteImage(doc.stage.backgroundImage);
  if (imageGone(doc.stage.backgroundImage)) add('error', null, 'Canvas', 'The background image is no longer in your library. Choose another one or remove it.');

  for (const el of all) {
    const layer = nameOf(el);
    const clips = el.timeline?.clips.length || 0;
    if (clips || el.anim) { animatedLayers++; animations += clips + (el.anim ? Object.keys(el.anim).length : 0); }
    for (const c of el.timeline?.clips || []) conditionPaths(c.trigger.when).concat(conditionPaths(c.trigger.filter)).forEach((p) => sources.add(rootOf(p)));
    conditionPaths(el.visibleWhen).forEach((p) => sources.add(rootOf(p)));
    if (el.type === 'repeater' && el.repeater) sources.add(rootOf(el.repeater.source));

    // images
    for (const [src, what] of [[el.src, 'image'], [el.fallbackSrc, 'fallback image'], [el.imageFill?.src, 'picture']] as const) {
      noteImage(src);
      if (imageGone(src)) add('error', el, layer, `The selected ${what} is no longer in your library. Replace it or remove it.`);
    }

    // A hidden layer is never drawn: what follows is about what the audience sees.
    if (el.hidden) { if (bindingsOf(el).length) boundLayers++; continue; }

    const bindings = bindingsOf(el);
    if (bindings.length) {
      boundLayers++;
      const scope = scopeForElement(doc, el.id, input.state, input.lastEvents || {}, input.feed ?? null);
      for (const { prop, ref } of bindings) {
        sources.add(rootOf(ref.path));
        if (!input.state) continue; // nothing to compare against yet
        const found = resolvePathDetailed(scope, ref.path);
        if (!found.found) {
          // event.* only exists while that event is on screen.
          if (rootOf(ref.path) === 'event') continue;
          const fb = ref.fallback !== undefined && ref.fallback !== '' ? ` Its fallback “${String(ref.fallback)}” is shown instead.` : ' Nothing is shown for it until the data has that value: consider a fallback.';
          add('warning', el, layer, `The selected data field for ${propLabel(prop as BindableProp)} (${ref.path}) is not in the current data.${fb}`);
          continue;
        }
        const problem = bindingProblem(prop as BindableProp, found.value, ref);
        if (problem) add(problem.level, el, layer, `${ref.path} for ${propLabel(prop as BindableProp)}: ${problem.message}`);
      }
    }

    if (el.type === 'repeater') {
      if (!(el.children || []).length) add('error', el, layer, 'This list has nothing to repeat. Put a layer inside it (a row design), or delete it.');
      else if (input.state && el.repeater) {
        const scope = scopeForElement(doc, el.id, input.state, input.lastEvents || {}, input.feed ?? null);
        let count = 0;
        try { count = resolveRepeaterItems(el.repeater, scope).length; } catch { count = 0; }
        if (!count && rootOf(el.repeater.source) !== 'feed') add('warning', el, layer, `Its list (${el.repeater.source}) is empty in the current data, so no rows are drawn.`);
      }
    }
    if (el.type === 'text' && !el.text && !el.bind?.text) add('warning', el, layer, 'This text layer is empty.');
    if ((el.type === 'image' || el.type === 'teamLogo' || el.type === 'playerAvatar' || el.type === 'flag') && !el.src && !el.bind?.src) add('warning', el, layer, 'This image layer has no picture.');
    if (el.type !== 'line' && (el.w <= 0 || el.h <= 0)) add('warning', el, layer, 'This layer has no size (width or height is 0), so it is not visible.');
    if (el.type === 'builtin' && !el.builtin) add('error', el, layer, 'No built-in graphic is chosen for this layer.');
  }

  // Root layers that are entirely outside the canvas.
  for (const el of doc.elements) {
    if (el.hidden) continue;
    const o = absoluteOrigin(doc.elements, el.id);
    if (!o) continue;
    const moves = (el.timeline?.clips || []).some((c) => c.tracks.some((t) => ['x', 'y', 'dx', 'dy'].includes(t.prop)));
    if (!moves && (o.x >= doc.stage.width || o.y >= doc.stage.height || o.x + el.w <= 0 || o.y + el.h <= 0)) {
      add('warning', el, nameOf(el), 'This layer is completely outside the canvas, so it is not visible.');
    }
  }

  if (all.length === 0) add('warning', null, 'Design', 'The design is empty: the published overlay would show nothing.');

  const dataSources = Array.from(new Set(Array.from(sources).map((r) => SOURCE_LABEL[r] ?? r).filter(Boolean))).sort();
  return { errors, warnings, summary: { layers: all.length, boundLayers, animatedLayers, animations, dataSources, images: images.size } };
}
