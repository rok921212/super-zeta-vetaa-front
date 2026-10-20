// Smash Point bar as editable layers: the Designer twin of the built-in
// themes' bar (Themes/shared/components/SmashPointBar.tsx). Shown only while
// the operator has switched Smash Point on for the match and typed a value
// (the same SMASH_ON condition as the "Smash Point is switched on" rule);
// fades in when it appears, and the value pops when it changes. Display only:
// no scoring rule is applied to the value.

import type { LayoutElement } from '../schema/layoutTypes.ts';
import { SMASH_ON } from '../editor/animationLibrary.ts';
import { withBehaviors } from './behaviors.ts';

const T = (k: string) => ({ ref: `theme.colors.${k}` });
const FONT = { ref: 'theme.typography.fontFamily' };
const GOLD = '#C9A54C';
const GOLD_LIGHT = '#F1D27A';

/** The bar at x/y, `w` × `h`; layer ids start with `prefix`. */
export function smashPointBar(prefix: string, x: number, y: number, w: number, h = 44): LayoutElement {
  const tabW = Math.round(Math.min(w * 0.42, h * 4.6));
  return withBehaviors({
    id: prefix, type: 'group', name: 'Smash Point', x, y, w, h,
    visibleWhen: SMASH_ON,
    children: [
      {
        id: `${prefix}_bg`, type: 'rect', name: 'Bar (theme colours)', x: 0, y: 0, w, h,
        style: { gradient: { type: 'linear', angle: 100, stops: [{ offset: 0, color: T('primary') }, { offset: 0.45, color: T('primary') }, { offset: 1, color: T('secondary') }] } },
      },
      { id: `${prefix}_trim_top`, type: 'rect', name: 'Gold trim (top)', x: 0, y: 0, w, h: 2, style: { fill: GOLD } },
      { id: `${prefix}_trim_bottom`, type: 'rect', name: 'Gold trim (bottom)', x: 0, y: h - 2, w, h: 2, style: { fill: GOLD } },
      {
        id: `${prefix}_tab`, type: 'rect', name: 'Label tab (gold)', x: 0, y: 0, w: tabW, h,
        style: { gradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: GOLD_LIGHT }, { offset: 1, color: GOLD }] } },
      },
      {
        id: `${prefix}_label`, type: 'text', name: 'Label', x: 10, y: 0, w: tabW - 20, h,
        bind: { text: { path: 'match.smashPoint.displayText', format: 'upper', fallback: 'SMASH POINT' } },
        style: { color: '#1a1406', fontFamily: FONT, fontSize: Math.round(h * 0.32), fontWeight: 800, letterSpacing: 2, textFit: 'shrink' },
      },
      withBehaviors({
        id: `${prefix}_value`, type: 'text', name: 'Smash Point value', x: tabW, y: 0, w: w - tabW, h,
        bind: { text: { path: 'match.smashPoint.value', fallback: '' } },
        style: { color: '#ffffff', fontFamily: FONT, fontSize: Math.round(h * 0.52), fontWeight: 800, align: 'center', textFit: 'shrink', textShadow: '0 1px 2px rgba(0,0,0,0.55)' },
      } as LayoutElement, [['smashPointChanges', 'pop']]),
    ],
  } as LayoutElement, [['smashPointOn', 'fadeIn']]);
}
