// The desktop app's tools as editable templates: map, battle bar, observing
// player, zone timer and team slots. Every piece is an ordinary layer bound
// to local.* (bindings/local.ts), the desktop app's own game feed, and each
// carries its behaviour with it: a knocked player pulses, a dead one greys
// out, a wiped team dims. Move, restyle or delete any layer and the rest
// keeps working.
//
// Designed on the website (which shows sample players), run in the desktop
// app. Validated in CI with the other templates (templates.test.ts).

import type { LayoutElement } from '../schema/layoutTypes.ts';
import type { Template } from './index.ts';
import { livePlayerBehaviors } from './behaviors.ts';

const T = (k: string) => ({ ref: `theme.colors.${k}` });
const FONT = { ref: 'theme.typography.fontFamily' };
const PANEL = 'rgba(11,11,15,0.92)';
const txt = (over: Partial<LayoutElement> & { id: string }): LayoutElement => ({ type: 'text', x: 0, y: 0, w: 100, h: 40, ...over, style: { color: '#ffffff', fontFamily: FONT, ...(over.style || {}) } } as LayoutElement);

/** local.* player rows: knocked and dead are flags on the row itself. */
const playerStates = <E extends LayoutElement>(el: E): E => livePlayerBehaviors(el, [['playerKnocked', 'alertPulse'], ['playerDead', 'greyOut']]);

const IS_DEAD = { path: 'item.dead', op: 'equals', value: true } as const;
const IS_KNOCKED = { path: 'item.knocked', op: 'equals', value: true } as const;
const IS_OUT = { path: 'item.eliminated', op: 'equals', value: true } as const;

/** Four pips, one per player of the team row: green, red when knocked, faint when dead. */
const pips = (id: string, x: number, y: number, w = 12, h = 20): LayoutElement => ({
  id, type: 'repeater', name: 'Player pips', x, y, w: (w + 4) * 4, h,
  repeater: { source: 'item.players', limit: 4, direction: 'row', itemWidth: w, itemHeight: h, gap: 4 },
  children: [{
    id: `${id}_pip`, type: 'rect', name: 'Player pip', x: 0, y: 0, w, h, style: { fill: T('success'), radius: 2 },
    styleWhen: [{ when: IS_KNOCKED, style: { fill: T('danger') } }, { when: IS_DEAD, style: { fill: 'rgba(255,255,255,0.15)' } }],
  }],
} as LayoutElement);

const zoneTimerGroup = (prefix: string, x: number, y: number): LayoutElement => ({
  id: `${prefix}_zone`, type: 'group', name: 'Zone timer', x, y, w: 360, h: 84,
  visibleWhen: { path: 'local.zone.known', op: 'equals', value: true },
  children: [
    { id: `${prefix}_zone_bg`, type: 'rect', name: 'Background', x: 0, y: 0, w: 360, h: 84, style: { fill: PANEL, radius: 10 } },
    txt({ id: `${prefix}_zone_status`, name: 'Zone status', x: 16, y: 8, w: 220, h: 30, bind: { text: { path: 'local.zone.statusLabel', format: 'upper', fallback: 'ZONE' } }, style: { fontSize: 18, fontWeight: 700, color: T('muted') } }),
    txt({ id: `${prefix}_zone_no`, name: 'Circle number', x: 240, y: 8, w: 104, h: 30, bind: { text: { path: 'local.zone.index', prefix: 'CIRCLE ', fallback: '' } }, style: { fontSize: 16, fontWeight: 700, align: 'right', color: T('muted') } }),
    {
      id: `${prefix}_zone_time`, type: 'text', name: 'Time left', x: 16, y: 34, w: 130, h: 44, bind: { text: { path: 'local.zone.timeLeft', format: 'time', fallback: '00:00' } },
      style: { color: '#ffffff', fontSize: 34, fontWeight: 800, fontFamily: FONT },
      styleWhen: [{ when: { path: 'local.zone.moving', op: 'equals', value: true }, style: { color: '#3fa9ff' } }],
    },
    {
      id: `${prefix}_zone_bar`, type: 'progress', name: 'Phase progress', x: 150, y: 50, w: 194, h: 12, max: 1,
      bind: { value: { path: 'local.zone.progress', fallback: 0 } }, style: { color: T('primary'), radius: 6 },
    },
  ],
} as LayoutElement);

const desktopMap: Template = {
  id: 'dt-map', name: 'Desktop · Map', source: 'Desktop app · Map',
  description: 'The live minimap: every player as a team-coloured dot, the safe zone and its timer, players and teams alive.',
  elements: [
    { id: 'dtm_frame', type: 'rect', name: 'Frame', x: 410, y: 0, w: 1100, h: 1080, style: { fill: PANEL } },
    { id: 'dtm_map', type: 'map', name: 'Map', x: 420, y: 0, w: 1080, h: 1080, map: { mapId: 'auto', follow: 'none', dotSize: 16, showZone: true, showNames: false } },
    zoneTimerGroup('dtm', 440, 20),
    {
      id: 'dtm_counts', type: 'group', name: 'Alive counters', x: 1160, y: 20, w: 320, h: 84,
      children: [
        { id: 'dtm_counts_bg', type: 'rect', name: 'Background', x: 0, y: 0, w: 320, h: 84, style: { fill: PANEL, radius: 10 } },
        txt({ id: 'dtm_teams_n', name: 'Teams alive', x: 0, y: 6, w: 160, h: 46, bind: { text: { path: 'local.counts.aliveTeams', fallback: 0 } }, style: { fontSize: 36, fontWeight: 800, align: 'center' }, anim: { onChange: { preset: 'pulse', duration: 400 } } }),
        txt({ id: 'dtm_teams_l', name: 'Teams label', x: 0, y: 50, w: 160, h: 26, text: 'TEAMS', style: { fontSize: 15, fontWeight: 700, align: 'center', color: T('muted') } }),
        txt({ id: 'dtm_players_n', name: 'Players alive', x: 160, y: 6, w: 160, h: 46, bind: { text: { path: 'local.counts.alivePlayers', fallback: 0 } }, style: { fontSize: 36, fontWeight: 800, align: 'center', color: T('accent') }, anim: { onChange: { preset: 'pulse', duration: 400 } } }),
        txt({ id: 'dtm_players_l', name: 'Players label', x: 160, y: 50, w: 160, h: 26, text: 'PLAYERS', style: { fontSize: 15, fontWeight: 700, align: 'center', color: T('muted') } }),
      ],
    },
  ] as LayoutElement[],
};

const battleBar: Template = {
  id: 'dt-battle-bar', name: 'Desktop · Battle Bar', source: 'Desktop app · Battle Bar',
  description: 'A bar of every team still alive: logo, tag, a pip per player (red when knocked) and the team’s kills.',
  elements: [{
    id: 'dtb_bar', type: 'group', name: 'Battle bar', x: 20, y: 960, w: 1880, h: 100,
    children: [
      { id: 'dtb_bg', type: 'rect', name: 'Background', x: 0, y: 0, w: 1880, h: 100, style: { fill: PANEL, radius: 10 } },
      {
        id: 'dtb_teams', type: 'repeater', name: 'Teams', x: 10, y: 8, w: 1860, h: 84,
        repeater: { source: 'local.teams', limit: 16, direction: 'row', itemWidth: 112, itemHeight: 84, gap: 4 },
        children: [{
          id: 'dtb_team', type: 'group', name: 'Team', x: 0, y: 0, w: 112, h: 84,
          styleWhen: [{ when: IS_OUT, style: { opacity: 0.3, grayscale: 1 } }],
          children: [
            {
              id: 'dtb_card', type: 'rect', name: 'Card', x: 0, y: 0, w: 112, h: 84, style: { fill: 'rgba(255,255,255,0.06)', radius: 6 },
              styleWhen: [{ when: { path: 'item.observed', op: 'equals', value: true }, style: { fill: 'rgba(253,224,71,0.22)' } }],
            },
            { id: 'dtb_stripe', type: 'rect', name: 'Team colour', x: 0, y: 0, w: 112, h: 4, bind: { fill: { path: 'item.color' } }, style: { fill: T('primary'), radius: 2 } },
            { id: 'dtb_logo', type: 'teamLogo', name: 'Logo', x: 6, y: 10, w: 36, h: 36, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'item.teamLogo' } } },
            txt({ id: 'dtb_tag', name: 'Team tag', x: 46, y: 8, w: 62, h: 22, bind: { text: { path: 'item.teamTag', format: 'upper' } }, style: { fontSize: 15, fontWeight: 800 } }),
            txt({ id: 'dtb_kills', name: 'Kills', x: 46, y: 28, w: 62, h: 20, bind: { text: { path: 'item.kills', suffix: ' K', fallback: 0 } }, style: { fontSize: 14, fontWeight: 700, color: T('accent') }, anim: { onChange: { preset: 'pulse', duration: 400 } } }),
            pips('dtb_pips', 24, 56),
          ],
        }],
      },
    ],
  }] as LayoutElement[],
};

const observingPlayer: Template = {
  id: 'dt-observing', name: 'Desktop · Observing Player', source: 'Desktop app · Observing Player',
  description: 'The player on screen: photo, name, team, health and kills, with their teammates’ status below. Follows the spectated player.',
  elements: [{
    id: 'dto_card', type: 'group', name: 'Observed player', x: 40, y: 760, w: 520, h: 280,
    visibleWhen: { path: 'local.observed', op: 'exists' },
    children: [
      { id: 'dto_bg', type: 'rect', name: 'Background', x: 0, y: 0, w: 520, h: 280, style: { fill: PANEL, radius: 12 } },
      { id: 'dto_stripe', type: 'rect', name: 'Team colour', x: 0, y: 0, w: 10, h: 280, bind: { fill: { path: 'local.observed.color' } }, style: { fill: T('primary'), radius: 4 } },
      { id: 'dto_photo', type: 'playerAvatar', name: 'Photo', x: 26, y: 20, w: 120, h: 120, src: '/def_char.avif', fallbackSrc: '/def_char.avif', bind: { src: { path: 'local.observed.picUrl' } }, style: { radius: 10 } },
      { id: 'dto_logo', type: 'teamLogo', name: 'Team logo', x: 440, y: 20, w: 60, h: 60, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'local.observed.teamLogo' } } },
      txt({ id: 'dto_name', name: 'Player name', x: 162, y: 18, w: 270, h: 46, bind: { text: { path: 'local.observed.playerName', format: 'upper', fallback: 'PLAYER' } }, style: { fontSize: 32, fontWeight: 800 } }),
      txt({ id: 'dto_team', name: 'Team name', x: 162, y: 62, w: 270, h: 30, bind: { text: { path: 'local.observed.teamName', format: 'upper', fallback: '' } }, style: { fontSize: 18, fontWeight: 700, color: T('muted') } }),
      { id: 'dto_hp', type: 'healthBar', name: 'Health', x: 162, y: 104, w: 230, h: 14, max: 100, bind: { value: { path: 'local.observed.healthPct', fallback: 0 } }, style: { radius: 4 } },
      txt({ id: 'dto_kills', name: 'Kills', x: 400, y: 92, w: 100, h: 40, bind: { text: { path: 'local.observed.killNum', suffix: ' KILLS', fallback: '0 KILLS' } }, style: { fontSize: 20, fontWeight: 800, align: 'right', color: T('accent') }, anim: { onChange: { preset: 'pop', duration: 400 } } }),
      { id: 'dto_knocked', type: 'text', name: 'Knocked label', x: 26, y: 112, w: 120, h: 28, text: 'KNOCKED', visibleWhen: { path: 'local.observed.knocked', op: 'equals', value: true }, style: { color: '#ffffff', fill: T('danger'), fontSize: 16, fontWeight: 800, align: 'center', fontFamily: FONT, radius: 4 } },
      {
        id: 'dto_mates', type: 'repeater', name: 'Teammates', x: 26, y: 160, w: 470, h: 104,
        repeater: { source: 'local.observedTeam.players', limit: 4, direction: 'grid', columns: 2, itemWidth: 230, itemHeight: 48, gap: 8 },
        children: [playerStates({
          id: 'dto_mate', type: 'group', name: 'Teammate', x: 0, y: 0, w: 230, h: 48,
          children: [
            {
              id: 'dto_mate_bg', type: 'rect', name: 'Row background', x: 0, y: 0, w: 230, h: 48, style: { fill: 'rgba(255,255,255,0.06)', radius: 6 },
              styleWhen: [{ when: { path: 'item.observed', op: 'equals', value: true }, style: { fill: 'rgba(253,224,71,0.22)' } }],
            },
            txt({ id: 'dto_mate_name', name: 'Name', x: 10, y: 2, w: 160, h: 24, bind: { text: { path: 'item.playerName', format: 'upper' } }, style: { fontSize: 15, fontWeight: 700 } }),
            { id: 'dto_mate_hp', type: 'healthBar', name: 'Health', x: 10, y: 30, w: 160, h: 8, max: 100, bind: { value: { path: 'item.healthPct', fallback: 0 } }, style: { radius: 3 } },
            txt({ id: 'dto_mate_k', name: 'Kills', x: 174, y: 0, w: 48, h: 48, bind: { text: { path: 'item.killNum', suffix: ' K', fallback: 0 } }, style: { fontSize: 16, fontWeight: 800, align: 'right', color: T('accent') } }),
          ],
        } as LayoutElement)],
      },
    ],
  }] as LayoutElement[],
};

const zoneTimer: Template = {
  id: 'dt-map-timer', name: 'Desktop · Zone Timer', source: 'Desktop app · Map Timer',
  description: 'The safe zone clock: what the zone is doing, which circle, time left and a bar for the phase. Turns blue while the zone closes.',
  elements: [zoneTimerGroup('dtt', 780, 30)] as LayoutElement[],
};

const teamSlots: Template = {
  id: 'dt-team-slots', name: 'Desktop · Team Slots', source: 'Desktop app · Team Slots',
  description: 'Every team as a card: slot, logo, name, kills, and each player with health. Knocked players pulse, dead ones grey out, wiped teams dim.',
  elements: [{
    id: 'dts_grid', type: 'repeater', name: 'Team cards', x: 40, y: 40, w: 1840, h: 1000,
    repeater: { source: 'local.teams', limit: 16, direction: 'grid', columns: 4, itemWidth: 448, itemHeight: 238, gap: 16 },
    children: [{
      id: 'dts_team', type: 'group', name: 'Team card', x: 0, y: 0, w: 448, h: 238,
      styleWhen: [{ when: IS_OUT, style: { opacity: 0.35, grayscale: 1 } }],
      children: [
        { id: 'dts_bg', type: 'rect', name: 'Card', x: 0, y: 0, w: 448, h: 238, style: { fill: PANEL, radius: 10 } },
        { id: 'dts_head', type: 'rect', name: 'Team colour', x: 0, y: 0, w: 448, h: 6, bind: { fill: { path: 'item.color' } }, style: { fill: T('primary'), radius: 3 } },
        txt({ id: 'dts_slot', name: 'Slot', x: 12, y: 14, w: 46, h: 44, bind: { text: { path: 'item.slot', format: 'pad2' } }, style: { fontSize: 26, fontWeight: 800, align: 'center', color: T('accent') } }),
        { id: 'dts_logo', type: 'teamLogo', name: 'Logo', x: 62, y: 14, w: 44, h: 44, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'item.teamLogo' } } },
        txt({ id: 'dts_name', name: 'Team name', x: 116, y: 14, w: 230, h: 44, bind: { text: { path: 'item.teamName', format: 'upper' } }, style: { fontSize: 22, fontWeight: 800 } }),
        txt({ id: 'dts_kills', name: 'Kills', x: 350, y: 14, w: 86, h: 44, bind: { text: { path: 'item.kills', suffix: ' K', fallback: 0 } }, style: { fontSize: 22, fontWeight: 800, align: 'right', color: T('accent') }, anim: { onChange: { preset: 'pulse', duration: 400 } } }),
        {
          id: 'dts_players', type: 'repeater', name: 'Players', x: 12, y: 68, w: 424, h: 160,
          repeater: { source: 'item.players', limit: 4, direction: 'column', itemHeight: 37, gap: 4 },
          children: [playerStates({
            id: 'dts_player', type: 'group', name: 'Player row', x: 0, y: 0, w: 424, h: 37,
            children: [
              { id: 'dts_p_bg', type: 'rect', name: 'Row background', x: 0, y: 0, w: 424, h: 37, style: { fill: 'rgba(255,255,255,0.06)', radius: 5 } },
              txt({ id: 'dts_p_name', name: 'Player name', x: 10, y: 0, w: 190, h: 37, bind: { text: { path: 'item.playerName', format: 'upper' } }, style: { fontSize: 16, fontWeight: 700 } }),
              { id: 'dts_p_hp', type: 'healthBar', name: 'Health', x: 206, y: 13, w: 150, h: 10, max: 100, bind: { value: { path: 'item.healthPct', fallback: 0 } }, style: { radius: 3 } },
              txt({ id: 'dts_p_k', name: 'Kills', x: 362, y: 0, w: 54, h: 37, bind: { text: { path: 'item.killNum', suffix: ' K', fallback: 0 } }, style: { fontSize: 16, fontWeight: 800, align: 'right', color: T('accent') } }),
            ],
          } as LayoutElement)],
        },
      ],
    }],
  }] as unknown as LayoutElement[],
};

export const DESKTOP_TEMPLATES: Template[] = [desktopMap, battleBar, observingPlayer, zoneTimer, teamSlots];
