// Insert-panel element factory. Every kind maps onto an EXISTING schema
// element type (layoutSchema.js) — the Designer never invents a new one — and
// every created subtree gets fresh ids that are unique within the document.

import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { allIds } from './tree.ts';
import { newId } from './ids.ts';
import { livePlayerBehaviors, teamRowBehaviors, withBehaviors } from '../templates/behaviors.ts';

export type InsertKind =
  | 'text' | 'rect' | 'circle' | 'line' | 'image' | 'icon'
  | 'dynamicText' | 'repeater' | 'playerRows' | 'grid' | 'healthBar' | 'progress'
  | 'group' | 'eventPopup' | 'map' | 'observedName' | 'zoneTime';

export interface InsertItem { kind: InsertKind; label: string; hint: string }

export const INSERT_CATEGORIES: Array<{ title: string; items: InsertItem[] }> = [
  {
    title: 'Basic',
    items: [
      { kind: 'text', label: 'Text', hint: 'Static text' },
      { kind: 'rect', label: 'Rectangle', hint: 'Box / panel' },
      { kind: 'circle', label: 'Circle', hint: 'Ellipse' },
      { kind: 'line', label: 'Line', hint: 'Straight line' },
      { kind: 'image', label: 'Image', hint: 'URL image' },
      { kind: 'icon', label: 'Icon', hint: 'Built-in icon' },
    ],
  },
  {
    title: 'Data',
    items: [
      { kind: 'dynamicText', label: 'Dynamic Text', hint: 'Text bound to live data' },
      { kind: 'repeater', label: 'Team list', hint: 'One row per team — reacts to kills & wipes' },
      { kind: 'playerRows', label: 'Player list', hint: 'Health, knocked, dead, recalled' },
      { kind: 'grid', label: 'Grid', hint: 'Teams in a grid' },
      { kind: 'healthBar', label: 'Health Bar', hint: 'Player health' },
      { kind: 'progress', label: 'Progress Bar', hint: 'Value / max' },
    ],
  },
  {
    title: 'Desktop app',
    items: [
      { kind: 'map', label: 'Map', hint: 'Minimap: players, zone' },
      { kind: 'observedName', label: 'Observed player', hint: 'Name of the player on screen' },
      { kind: 'zoneTime', label: 'Zone time', hint: 'Time left in the zone phase' },
    ],
  },
  {
    title: 'Advanced',
    items: [
      { kind: 'group', label: 'Group', hint: 'Container' },
      { kind: 'eventPopup', label: 'Event Popup', hint: 'Shows on each kill' },
    ],
  },
];

const FONT = { ref: 'theme.typography.fontFamily' };
const C = (k: string) => ({ ref: `theme.colors.${k}` });

type Draft = Omit<LayoutElement, 'id' | 'children'> & { children?: Draft[] };

function blueprint(kind: InsertKind): Draft {
  switch (kind) {
    case 'text':
      return { type: 'text', name: 'Text', x: 0, y: 0, w: 400, h: 60, text: 'Your text', style: { color: '#ffffff', fontSize: 40, fontWeight: 700, fontFamily: FONT } };
    case 'rect':
      return { type: 'rect', name: 'Rectangle', x: 0, y: 0, w: 320, h: 180, style: { fill: C('primary'), radius: 8 } };
    case 'circle':
      return { type: 'ellipse', name: 'Circle', x: 0, y: 0, w: 160, h: 160, style: { fill: C('accent'), radius: 9999 } };
    case 'line':
      return { type: 'line', name: 'Line', x: 0, y: 0, w: 400, h: 0, style: { stroke: '#ffffff', strokeWidth: 4 } };
    case 'image':
      return { type: 'image', name: 'Image', x: 0, y: 0, w: 240, h: 240, src: '/def_logo.avif', style: { objectFit: 'contain' } };
    case 'icon':
      return { type: 'icon', name: 'Icon', x: 0, y: 0, w: 80, h: 80, icon: 'trophy', style: { color: '#ffffff' } };
    case 'dynamicText':
      return {
        type: 'text', name: 'Tournament name', x: 0, y: 0, w: 700, h: 60,
        bind: { text: { path: 'tournament.tournamentName', fallback: 'TOURNAMENT' } },
        style: { color: '#ffffff', fontSize: 40, fontWeight: 800, fontFamily: FONT },
      };
    case 'repeater':
      return {
        type: 'repeater', name: 'Team rows', x: 0, y: 0, w: 420, h: 560,
        repeater: { source: 'derived.teams', limit: 10, direction: 'column', itemHeight: 52, gap: 4 },
        children: [
          teamRowBehaviors({ type: 'rect', name: 'Row background', x: 0, y: 0, w: 420, h: 52, style: { fill: 'rgba(17,24,39,0.9)', radius: 4 } }),
          { type: 'text', name: 'Rank', x: 8, y: 0, w: 50, h: 52, bind: { text: { path: 'rank' } }, style: { color: '#ffffff', fontSize: 22, fontWeight: 800, align: 'center', fontFamily: FONT } },
          { type: 'text', name: 'Team name', x: 66, y: 0, w: 260, h: 52, bind: { text: { path: 'item.teamName', format: 'upper' } }, style: { color: '#ffffff', fontSize: 22, fontWeight: 700, fontFamily: FONT } },
          withBehaviors({ type: 'text', name: 'Kills', x: 330, y: 0, w: 80, h: 52, bind: { text: { path: 'item.totalKills', fallback: 0 } }, style: { color: C('accent'), fontSize: 22, fontWeight: 800, align: 'right', fontFamily: FONT } }, [['teamKill', 'pop']]),
        ],
      };
    case 'playerRows':
      return {
        type: 'repeater', name: 'Player rows', x: 0, y: 0, w: 340, h: 412,
        repeater: { source: 'live.players', limit: 8, direction: 'column', itemHeight: 48, gap: 4 },
        children: [
          // One group per player, so knocked / dead / recalled animate the whole row.
          livePlayerBehaviors({
            type: 'group', name: 'Player row', x: 0, y: 0, w: 340, h: 48,
            children: [
              { type: 'rect', name: 'Row background', x: 0, y: 0, w: 340, h: 48, style: { fill: 'rgba(17,24,39,0.9)', radius: 4 } },
              { type: 'text', name: 'Player name', x: 12, y: 2, w: 230, h: 26, bind: { text: { path: 'item.playerName', format: 'upper' } }, style: { color: '#ffffff', fontSize: 17, fontWeight: 800, fontFamily: FONT } },
              { type: 'healthBar', name: 'Health', x: 12, y: 30, w: 230, h: 10, max: 100, bind: { value: { path: 'item.healthPct', fallback: 0 } }, style: { radius: 3 } },
              { type: 'text', name: 'Kills', x: 250, y: 0, w: 80, h: 48, bind: { text: { path: 'item.killNum', suffix: ' K', fallback: 0 } }, style: { color: C('accent'), fontSize: 20, fontWeight: 800, align: 'right', fontFamily: FONT } },
            ],
          } as Draft),
        ],
      };
    case 'grid':
      return {
        type: 'repeater', name: 'Team grid', x: 0, y: 0, w: 1000, h: 480,
        repeater: { source: 'derived.teams', limit: 16, direction: 'grid', columns: 4, itemWidth: 240, itemHeight: 110, gap: 12 },
        children: [
          { type: 'rect', name: 'Card', x: 0, y: 0, w: 240, h: 110, style: { fill: 'rgba(17,24,39,0.9)', radius: 8 } },
          { type: 'teamLogo', name: 'Logo', x: 10, y: 15, w: 80, h: 80, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'item.teamLogo' } } },
          { type: 'text', name: 'Team', x: 100, y: 20, w: 130, h: 40, bind: { text: { path: 'item.teamTag' } }, style: { color: '#ffffff', fontSize: 24, fontWeight: 800, fontFamily: FONT } },
        ],
      };
    case 'healthBar':
      return {
        type: 'healthBar', name: 'Health bar', x: 0, y: 0, w: 240, h: 16, max: 100,
        bind: { value: { path: 'derived.teams[0].players[0].health', fallback: 100 } },
        style: { radius: 4 },
      };
    case 'progress':
      return { type: 'progress', name: 'Progress bar', x: 0, y: 0, w: 400, h: 20, max: 100, bind: { value: { path: 'match.matchNo', fallback: 0 } }, style: { color: C('primary'), radius: 6 } };
    case 'group':
      return { type: 'group', name: 'Group', x: 0, y: 0, w: 400, h: 200, children: [] };
    case 'map':
      return { type: 'map', name: 'Map', x: 0, y: 0, w: 600, h: 600, map: { mapId: 'auto', follow: 'none', dotSize: 14, showZone: true }, style: { radius: 8 } };
    case 'observedName':
      return {
        type: 'text', name: 'Observed player', x: 0, y: 0, w: 500, h: 60,
        bind: { text: { path: 'local.observed.playerName', format: 'upper', fallback: 'PLAYER' } },
        style: { color: '#ffffff', fontSize: 40, fontWeight: 800, fontFamily: FONT },
      };
    case 'zoneTime':
      return {
        type: 'text', name: 'Zone time left', x: 0, y: 0, w: 200, h: 60,
        bind: { text: { path: 'local.zone.timeLeft', format: 'time', fallback: '00:00' } },
        style: { color: '#ffffff', fontSize: 40, fontWeight: 800, fontFamily: FONT },
      };
    case 'eventPopup':
      return {
        type: 'group', name: 'Kill popup', x: 0, y: 0, w: 480, h: 80,
        anim: { onEvent: { event: 'kill', preset: 'slideLeft', duration: 400, hold: 3000 } },
        children: [
          { type: 'rect', name: 'Background', x: 0, y: 0, w: 480, h: 80, style: { fill: C('secondary'), radius: 8 } },
          { type: 'text', name: 'Player', x: 20, y: 6, w: 300, h: 40, bind: { text: { path: 'event.payload.player.playerName', format: 'upper', fallback: 'PLAYER' } }, style: { color: '#ffffff', fontSize: 26, fontWeight: 800, fontFamily: FONT } },
          { type: 'text', name: 'Kills', x: 330, y: 0, w: 130, h: 80, bind: { text: { path: 'event.payload.killNum', suffix: ' KILLS', fallback: '' } }, style: { color: C('accent'), fontSize: 22, fontWeight: 800, align: 'right', fontFamily: FONT } },
        ],
      };
    default:
      throw new Error(`unknown insert kind ${kind}`);
  }
}

const prefixFor = (type: string) => type.replace(/[^A-Za-z]/g, '').slice(0, 8) || 'el';

/**
 * Build a new element subtree for `kind`, centred inside `area` (the stage, or
 * the parent container's own box when inserting into a group/repeater).
 */
export function createElement(kind: InsertKind, doc: LayoutDocument, area?: { w: number; h: number }): LayoutElement {
  const taken = allIds(doc.elements);
  const withIds = (d: Draft): LayoutElement => {
    const { children, ...rest } = d;
    const el: LayoutElement = { ...(JSON.parse(JSON.stringify(rest)) as Omit<LayoutElement, 'id'>), id: newId(prefixFor(d.type), taken) };
    if (children) el.children = children.map(withIds);
    return el;
  };
  const el = withIds(blueprint(kind));
  const W = area?.w ?? doc.stage.width;
  const H = area?.h ?? doc.stage.height;
  el.x = Math.max(0, Math.round((W - el.w) / 2));
  el.y = Math.max(0, Math.round((H - el.h) / 2));
  return el;
}
