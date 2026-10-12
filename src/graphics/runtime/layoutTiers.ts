// Which live socket tiers a published Designer layout needs.
//
// A Designer overlay has no built-in view. Joining with no view means "every
// tier", and that includes the positional feed: player `location` changes on
// nearly every tick, so almost every alive team is re-sent every tick, and
// those frames are volatile (dropped under backpressure → sequence gaps →
// rate-limited recovery). Built-in themes join the light core feed instead,
// which is why they used to update faster than Designer overlays.
//
// Only a map (or a binding that reads positions) needs the positional tier.

import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import type { LiveTier } from '../../overlayClient/engineTypes.ts';

function needsPositions(list: LayoutElement[] | undefined): boolean {
  for (const el of list || []) {
    if (el.type === 'map') return true;
    if (el.children && needsPositions(el.children)) return true;
  }
  return false;
}

export function layoutLiveTiers(doc: Pick<LayoutDocument, 'elements' | 'components'> | null | undefined): LiveTier[] {
  if (!doc) return ['matchData', 'overall'];
  const positional = needsPositions(doc.elements)
    || Object.values(doc.components || {}).some((c) => needsPositions(c?.elements))
    // a binding, condition or HTML token that reads a player's position
    || /\blocation\b/.test(JSON.stringify(doc.elements || []));
  return [positional ? 'matchDataPositional' : 'matchData', 'overall'];
}
