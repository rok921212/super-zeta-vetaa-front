// Run-time errors of a code layer, made readable: which line of the .ssx file
// it came from, and what usually causes it.
//
// The sandbox runs the layer's script as its own <script> named
// `ss-layer.<lang>` (a sourceURL), wrapped in one extra first line, and the
// compiler keeps line numbers — so a stack frame's line maps straight back.

export const LAYER_SCRIPT_NAME = 'ss-layer';

/** Line (1-based) in the .ssx file where `<tag …>` opens, or 0. */
export function tagLine(source: string, tag: string): number {
  const i = source.search(new RegExp(`<${tag}(\\s[^>]*)?>`, 'i'));
  return i < 0 ? 0 : source.slice(0, i).split('\n').length;
}

/** The .ssx line an error's stack points at (the first frame in the layer's own script), or null. */
export function errorLine(stack: string | undefined, source: string): number | null {
  if (!stack) return null;
  const m = new RegExp(`${LAYER_SCRIPT_NAME}\\.(?:tsx|jsx|js):(\\d+)`).exec(stack);
  if (!m) return null;
  const scriptLine = Number(m[1]) - 1; // the wrapper's own first line
  if (scriptLine < 1) return null;
  return scriptLine + tagLine(source, 'script');
}

const HINTS: Array<[RegExp, string]> = [
  [/Cannot read propert(y|ies) of (undefined|null)|is (undefined|null)|undefined is not an object/i,
    'Some data is not there yet (no match loaded, a team with no players…). Read it carefully: matchData?.teams ?? [] — and test with Simulation data.'],
  [/\.map is not a function|\.filter is not a function|\.slice is not a function/i,
    'That value is not a list here. Use (value ?? []).map(…), or check it with Array.isArray(value).'],
  [/Element type is invalid|is not a function.*(Component|Logo)|got: undefined/i,
    'A component you use is undefined — usually an import name that does not exist. Check the spelling against Reference.'],
  [/is not defined/i,
    'A name is used without being imported or declared. Hooks need importing: import { useState } from \'react\'; theme helpers: import { … } from \'scoresync\'.'],
  [/Too many re-renders|Maximum update depth/i,
    'A setState runs on every render. Move it into useEffect(() => { … }, [deps]) or an event handler.'],
  [/Invalid hook call|Rendered (more|fewer) hooks/i,
    'Hooks (useState, useEffect, useData…) must be called at the top of the component, never inside if / loops / callbacks.'],
  [/Content Security Policy|connect-src|Refused to connect/i,
    'A code layer cannot fetch or open sockets. All data arrives as props.'],
  [/Objects are not valid as a React child/i,
    'An object is being shown as text. Show one of its fields instead, e.g. {team.teamName}, not {team}.'],
];

/** Advice for a run-time error message, if it is a common one. */
export function errorHint(message: string): string | undefined {
  for (const [re, hint] of HINTS) if (re.test(message)) return hint;
  return undefined;
}

/** "matchData.teams[0].teamName" → "matchData?.teams?.[0]?.teamName" (safe to read in a component). */
export function optionalChain(path: string): string {
  return path.replace(/\[(\d+)\]/g, '.[$1]').split('.').filter(Boolean).map((p, i) => (i === 0 ? p : `?.${p}`)).join('').replace(/\?\.\.\[/g, '?.[');
}
