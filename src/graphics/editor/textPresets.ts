// "Attach text": ready-made labels that put the right text on any layer in
// one click — the player's name on a photo, "DEAD" over a dead player, the
// team tag on a recall sweep, the event's player on a pop-up. The presets on
// offer follow what the layer can read: the row it sits in (team / player
// list) and the live event it plays on.
//
// A shape (rect, circle, polygon, path) takes the text inside itself. Any
// other layer gets a text layer next to it, and the two are grouped so they
// move together; a group just gets the text as a new child. Presets that only
// show in a state (dead, knocked, eliminated) always become their own label,
// so the condition hides the words and not the layer they are attached to.

import type { AnimationEvent, Condition, DataRef, ElementStyle, LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { PLAYER_DEAD, PLAYER_KNOCKED, TEAM_ELIMINATED } from '../templates/parts.ts';
import { type Command, setChildrenCmd } from './store.ts';
import { allIds, childrenOf, locate } from './tree.ts';
import { newId } from './ids.ts';
import { addShapeText, canHoldText } from './shapeText.ts';
import { rowContextAt } from './partPlacement.ts';
import { eventTypeFor } from './scope.ts';
import type { MenuEntry } from './CanvasMenu.tsx';

export type PresetGroup = 'Player' | 'Team' | 'Event' | 'Match' | 'Words';

export interface TextPreset {
  id: string;
  label: string;
  group: PresetGroup;
  /** Typed text (may hold {{path}} tokens). */
  text?: string;
  /** Live text. */
  bind?: DataRef;
  /** Only shown while this holds: always attached as its own label. */
  when?: Condition;
  /** Where a separate label goes: under the layer, or centred over it. */
  place?: 'below' | 'over';
  /** Label fill (a coloured tag); none = plain text. */
  fill?: string;
}

const up = (path: string, extra: Partial<DataRef> = {}): DataRef => ({ path, format: 'upper', fallback: '', ...extra });

const PLAYER: TextPreset[] = [
  { id: 'p-name', label: 'Player name', group: 'Player', bind: up('item.playerName', { fallback: 'PLAYER' }) },
  { id: 'p-kills', label: 'Player kills', group: 'Player', bind: { path: 'item.killNum', suffix: ' KILLS', fallback: 0 } },
  { id: 'p-dead', label: '“DEAD” (shows when the player dies)', group: 'Player', bind: up('item.playerName', { suffix: ' · DEAD', fallback: 'DEAD' }), when: PLAYER_DEAD, place: 'over', fill: '#ef4444' },
  { id: 'p-knocked', label: '“KNOCKED” (shows while knocked)', group: 'Player', bind: up('item.playerName', { suffix: ' · KNOCKED', fallback: 'KNOCKED' }), when: PLAYER_KNOCKED, place: 'over', fill: '#f59e0b' },
];

const TEAM: TextPreset[] = [
  { id: 't-tag', label: 'Team tag', group: 'Team', bind: up('item.teamTag', { fallback: 'TEAM' }) },
  { id: 't-name', label: 'Team name', group: 'Team', bind: up('item.teamName', { fallback: 'TEAM' }) },
  { id: 't-rank', label: 'Rank', group: 'Team', bind: { path: 'rank', prefix: '#', fallback: '' } },
  { id: 't-points', label: 'Points', group: 'Team', bind: { path: 'item.totalPoints', suffix: ' PTS', fallback: 0 } },
  { id: 't-kills', label: 'Team kills', group: 'Team', bind: { path: 'item.totalKills', suffix: ' KILLS', fallback: 0 } },
  { id: 't-elim', label: '“ELIMINATED” (shows when the team is out)', group: 'Team', bind: up('item.teamTag', { suffix: ' ELIMINATED', fallback: 'ELIMINATED' }), when: TEAM_ELIMINATED, place: 'over', fill: 'rgba(220,38,38,0.92)' },
];

/** What each live event's payload calls its player / team (overlayClient/detectors.ts). */
const EVENT_PLAYER: Partial<Record<AnimationEvent, string>> = {
  kill: 'event.payload.player.playerName', knock: 'event.payload.player.playerName', revive: 'event.payload.player.playerName',
  playerDeath: 'event.payload.player.playerName', recall: 'event.payload.playerName', milestone: 'event.payload.playerName',
};
const EVENT_WORD: Partial<Record<AnimationEvent, string>> = {
  kill: 'KILL', knock: 'KNOCKED', revive: 'REVIVED', playerDeath: 'DEAD', recall: 'RECALLED', elimination: 'ELIMINATED',
};

function eventPresets(ev: AnimationEvent): TextPreset[] {
  const out: TextPreset[] = [];
  const player = EVENT_PLAYER[ev];
  if (player) out.push({ id: 'e-player', label: 'Event player', group: 'Event', bind: up(player, { fallback: 'PLAYER' }) });
  if (ev === 'elimination') out.push({ id: 'e-team-name', label: 'Event team name', group: 'Event', bind: up('event.payload.teamName', { fallback: 'TEAM' }) });
  if (ev !== 'matchStart' && ev !== 'matchEnd' && ev !== 'rankChange' && ev !== 'killsChange') {
    out.push({ id: 'e-team', label: 'Event team tag', group: 'Event', bind: up('event.payload.teamTag') });
  }
  if (ev === 'kill') out.push({ id: 'e-kills', label: 'Event kill count', group: 'Event', bind: { path: 'event.payload.killNum', suffix: ' KILLS', fallback: '' } });
  if (ev === 'elimination') {
    out.push({ id: 'e-place', label: 'Event place', group: 'Event', bind: { path: 'event.payload.rank', format: 'ordinal', suffix: ' PLACE', fallback: '' } });
    out.push({ id: 'e-elims', label: 'Event team kills', group: 'Event', bind: { path: 'event.payload.totalKills', suffix: ' ELIMS', fallback: 0 } });
  }
  if (ev === 'milestone') out.push({ id: 'e-label', label: 'Milestone (FIRST BLOOD, RAMPAGE…)', group: 'Event', bind: up('event.payload.label', { fallback: 'MILESTONE' }) });
  const word = EVENT_WORD[ev];
  if (word && player) out.push({ id: 'e-says', label: `“PLAYER ${word}”`, group: 'Event', bind: up(player, { suffix: ` ${word}`, fallback: word }) });
  return out;
}

const MATCH: TextPreset[] = [
  { id: 'm-tournament', label: 'Tournament name', group: 'Match', bind: up('tournament.tournamentName', { fallback: 'TOURNAMENT' }) },
  { id: 'm-match', label: 'Match number', group: 'Match', bind: { path: 'live.currentMatchNo', prefix: 'MATCH ', fallback: 'MATCH' } },
  { id: 'm-map', label: 'Map', group: 'Match', bind: up('live.mapName') },
  { id: 'm-alive', label: 'Teams alive', group: 'Match', bind: { path: 'live.aliveTeamsCount', suffix: ' TEAMS ALIVE', fallback: 0 } },
];

const WORDS: TextPreset[] = ['DEAD', 'KNOCKED', 'RECALLED', 'ELIMINATED', 'WINNER WINNER CHICKEN DINNER'].map((w) => ({
  id: `w-${w.toLowerCase().replace(/\W+/g, '-')}`, label: `“${w}”`, group: 'Words' as const, text: w,
})).concat([{ id: 'w-custom', label: 'My own text', group: 'Words', text: 'Text' }]);

/** The presets a layer can use: its row's fields, its event's fields, then match-wide ones and plain words. */
export function presetsFor(doc: LayoutDocument, id: string): TextPreset[] {
  const loc = locate(doc.elements, id);
  if (!loc) return [];
  const row = rowContextAt(doc, loc.parentId);
  const ev = eventTypeFor(doc, id);
  return [
    ...(row.kind === 'player' ? PLAYER : row.kind === 'team' ? TEAM : []),
    ...(ev ? eventPresets(ev) : []),
    ...MATCH,
    ...WORDS,
  ];
}

/** The presets as menu items, a separator between groups (right-click menu, Inspector button). */
export function presetMenu(presets: TextPreset[], pick: (p: TextPreset) => void, disabled = false): MenuEntry[] {
  const out: MenuEntry[] = [];
  presets.forEach((p, i) => {
    if (i > 0 && presets[i - 1].group !== p.group) out.push(null);
    out.push({ label: `${p.group} · ${p.label}`, disabled, onClick: () => pick(p), testId: `attach-${p.id}` });
  });
  return out;
}

/** A text layer's look for a label of `h` px; a tag fill makes it a coloured shape holding the text. */
function labelLayer(id: string, preset: TextPreset, x: number, y: number, w: number, h: number): LayoutElement {
  const textStyle: ElementStyle = {
    color: '#ffffff', fontFamily: { ref: 'theme.typography.fontFamily' }, fontSize: Math.max(10, Math.round(h * 0.6)),
    fontWeight: 800, align: 'center', valign: 'middle', textFit: 'shrink',
  } as ElementStyle;
  return {
    id, type: preset.fill ? 'rect' : 'text', name: preset.label.replace(/[“”]/g, '').replace(/\s*\(.*\)$/, ''), x, y, w, h,
    ...(preset.text != null ? { text: preset.text } : {}),
    ...(preset.bind ? { bind: { text: preset.bind } } : {}),
    ...(preset.when ? { visibleWhen: preset.when } : {}),
    style: preset.fill ? { ...textStyle, fill: preset.fill, radius: 4, padding: 4 } as ElementStyle : textStyle,
  } as LayoutElement;
}

/** The layer with the preset as its own text (a shape). */
function intoShape(el: LayoutElement, preset: TextPreset): LayoutElement {
  const withText = addShapeText({ ...el, text: undefined }, preset.text ?? '');
  const next: LayoutElement = { ...withText, ...(preset.text != null ? { text: preset.text } : {}) };
  if (preset.bind) next.bind = { ...(el.bind || {}), text: preset.bind };
  else if (next.bind?.text) {
    const bind = { ...next.bind };
    delete bind.text;
    if (Object.keys(bind).length) next.bind = bind; else delete next.bind;
  }
  if (preset.text == null) delete next.text;
  return next;
}

/**
 * Attach `preset` to layer `id`. Returns the command and the layer to select
 * afterwards (the shape itself, or the new label), or null if `id` is gone.
 */
export function attachTextCmd(doc: LayoutDocument, id: string, preset: TextPreset): { cmd: Command; selectId: string } | null {
  const loc = locate(doc.elements, id);
  if (!loc) return null;
  const el = loc.el;
  const taken = allIds(doc.elements);
  const siblings = childrenOf(doc.elements, loc.parentId);

  // 1. A shape holds it.
  if (canHoldText(el) && !preset.when) {
    const next = siblings.map((s) => (s.id === id ? intoShape(s, preset) : s));
    return { cmd: setChildrenCmd(doc, loc.parentId, next, 'Attach text'), selectId: id };
  }

  const labelId = newId('text', taken);
  taken.add(labelId);
  const over = preset.place === 'over';
  const h = over ? Math.max(20, Math.min(40, Math.round(el.h * 0.22))) : Math.max(20, Math.min(36, Math.round(el.h * 0.3)));
  const w = Math.max(80, el.w);

  // 2. A group takes it as a new child (on top), in its own space.
  if (el.type === 'group') {
    const label = labelLayer(labelId, preset, Math.round((el.w - w) / 2), over ? Math.round(el.h / 2 - h / 2) : el.h + 4, w, h);
    const grown: LayoutElement = { ...el, h: over ? el.h : el.h + 4 + h, children: [...(el.children || []), label] };
    const next = siblings.map((s) => (s.id === id ? grown : s));
    return { cmd: setChildrenCmd(doc, loc.parentId, next, 'Attach text'), selectId: labelId };
  }

  // 3. Anything else: the layer and its label, grouped so they move together.
  const lx = Math.round(el.x + (el.w - w) / 2);
  const ly = over ? Math.round(el.y + el.h / 2 - h / 2) : el.y + el.h + 4;
  const gx = Math.min(el.x, lx); const gy = Math.min(el.y, ly);
  const gw = Math.max(el.x + el.w, lx + w) - gx; const gh = Math.max(el.y + el.h, ly + h) - gy;
  const groupId = newId('group', taken);
  const group: LayoutElement = {
    id: groupId, type: 'group', name: `${el.name || el.type} + text`, x: gx, y: gy, w: gw, h: gh,
    children: [{ ...el, x: el.x - gx, y: el.y - gy }, labelLayer(labelId, preset, lx - gx, ly - gy, w, h)],
  };
  const next = siblings.map((s) => (s.id === id ? group : s));
  return { cmd: setChildrenCmd(doc, loc.parentId, next, 'Attach text'), selectId: labelId };
}
