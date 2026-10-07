// Starter templates (spec §56). Each is a set of elements with REAL bindings
// into the engine state, placed on a 1920×1080 stage. Every template is run
// through the shared schema validator in CI (graphics/__tests__/templates.test.ts).
// `{ ref: 'theme.colors.*' }` style values make them follow the layout theme.

import type { LayoutElement } from '../schema/layoutTypes.ts';
import { livePlayerBehaviors, rawPlayerBehaviors, teamRowBehaviors } from './behaviors.ts';

export interface Template {
  id: string;
  name: string;
  description: string;
  elements: LayoutElement[];
  /** For rebuilt theme graphics: the built-in it recreates (e.g. "Theme6 · Alerts"). */
  source?: string;
}

const T = (k: string) => ({ ref: `theme.colors.${k}` });
const FONT = { ref: 'theme.typography.fontFamily' };

const lowerThird: Template = {
  id: 'lower-third',
  name: 'Lower Third',
  description: 'Tournament, round and current match bar.',
  elements: [
    {
      id: 'lt_group', type: 'group', name: 'Lower third', x: 360, y: 930, w: 1200, h: 110,
      anim: { enter: { preset: 'slideUp', duration: 500 } },
      children: [
        { id: 'lt_bg', type: 'rect', name: 'Background', x: 0, y: 0, w: 1200, h: 110, style: { fill: T('secondary'), radius: 10, shadow: '0 8px 24px rgba(0,0,0,0.45)' } },
        { id: 'lt_accent', type: 'rect', name: 'Accent', x: 0, y: 0, w: 14, h: 110, style: { fill: T('primary'), radius: 4 } },
        { id: 'lt_logo', type: 'image', name: 'Tournament logo', x: 34, y: 15, w: 80, h: 80, src: '/def_logo.avif', bind: { src: { path: 'tournament.torLogo' } } },
        { id: 'lt_title', type: 'text', name: 'Tournament', x: 134, y: 12, w: 700, h: 52, bind: { text: { path: 'tournament.tournamentName', format: 'upper', fallback: 'TOURNAMENT' } }, style: { color: T('text'), fontSize: 38, fontWeight: 800, fontFamily: FONT } },
        { id: 'lt_round', type: 'text', name: 'Round', x: 134, y: 62, w: 700, h: 36, bind: { text: { path: 'round.roundName', fallback: '' } }, style: { color: T('muted'), fontSize: 24, fontFamily: FONT } },
        { id: 'lt_match_bg', type: 'rect', name: 'Match box', x: 900, y: 18, w: 280, h: 74, style: { fill: T('primary'), radius: 8 } },
        { id: 'lt_match', type: 'text', name: 'Match number', x: 900, y: 18, w: 280, h: 42, bind: { text: { path: 'match.matchNo', prefix: 'MATCH ', fallback: 'MATCH' } }, style: { color: '#ffffff', fontSize: 28, fontWeight: 800, align: 'center', fontFamily: FONT } },
        { id: 'lt_map', type: 'text', name: 'Map', x: 900, y: 56, w: 280, h: 30, bind: { text: { path: 'match.map', format: 'upper', fallback: '' } }, style: { color: '#ffffff', fontSize: 20, align: 'center', fontFamily: FONT } },
      ],
    },
  ],
};

const liveStandings: Template = {
  id: 'live-standings',
  name: 'Live Standings',
  description: 'Every team: rank, logo, tag, alive players, kills, points. Reacts to kills, knocks, recalls and eliminations.',
  elements: [
    {
      id: 'ls_group', type: 'group', name: 'Live standings', x: 1500, y: 60, w: 400, h: 900,
      anim: { enter: { preset: 'slideLeft', duration: 500 } },
      children: [
        { id: 'ls_head', type: 'rect', name: 'Header', x: 0, y: 0, w: 400, h: 44, style: { fill: T('primary'), radius: 6 } },
        { id: 'ls_head_team', type: 'text', x: 60, y: 0, w: 150, h: 44, text: 'TEAM', style: { color: '#ffffff', fontSize: 18, fontWeight: 800, fontFamily: FONT } },
        { id: 'ls_head_alive', type: 'text', x: 214, y: 0, w: 70, h: 44, text: 'ALIVE', style: { color: '#ffffff', fontSize: 16, fontWeight: 800, align: 'center', fontFamily: FONT } },
        { id: 'ls_head_kills', type: 'text', x: 288, y: 0, w: 50, h: 44, text: 'ELIMS', style: { color: '#ffffff', fontSize: 14, fontWeight: 800, align: 'center', fontFamily: FONT } },
        { id: 'ls_head_pts', type: 'text', x: 340, y: 0, w: 56, h: 44, text: 'PTS', style: { color: '#ffffff', fontSize: 16, fontWeight: 800, align: 'center', fontFamily: FONT } },
        {
          id: 'ls_rows', type: 'repeater', name: 'Team rows', x: 0, y: 50, w: 400, h: 840,
          repeater: { source: 'derived.teams', limit: 16, direction: 'column', itemHeight: 48, gap: 4 },
          children: [
            teamRowBehaviors({
              id: 'ls_row_bg', type: 'rect', name: 'Row background', x: 0, y: 0, w: 400, h: 48, style: { fill: 'rgba(17,24,39,0.92)', radius: 4 },
              styleWhen: [{ when: { path: 'item.isEliminationLocked', op: 'equals', value: true }, style: { fill: 'rgba(17,24,39,0.55)' } }],
            }, [['teamKill', 'glow'], ['teamKnock', 'shake']]),
            { id: 'ls_rank', type: 'text', x: 0, y: 0, w: 40, h: 48, bind: { text: { path: 'rank' } }, style: { color: T('accent'), fontSize: 22, fontWeight: 800, align: 'center', fontFamily: FONT } },
            {
              id: 'ls_logo', type: 'teamLogo', x: 42, y: 6, w: 36, h: 36, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'item.teamLogo' } },
              styleWhen: [{ when: { path: 'item.isEliminationLocked', op: 'equals', value: true }, style: { grayscale: 1 } }],
            },
            {
              id: 'ls_tag', type: 'text', x: 86, y: 0, w: 124, h: 48, bind: { text: { path: 'item.teamTag', format: 'upper' } }, style: { color: T('text'), fontSize: 20, fontWeight: 700, fontFamily: FONT },
              styleWhen: [{ when: { path: 'item.isEliminationLocked', op: 'equals', value: true }, style: { color: T('muted') } }],
            },
            {
              id: 'ls_alive', type: 'repeater', name: 'Alive pips', x: 218, y: 14, w: 66, h: 20,
              repeater: { source: 'item.players', limit: 4, direction: 'row', itemWidth: 12, itemHeight: 20, gap: 4 },
              children: [rawPlayerBehaviors({
                id: 'ls_pip', type: 'rect', name: 'Player pip', x: 0, y: 0, w: 12, h: 20, style: { fill: T('success'), radius: 2 },
                styleWhen: [
                  { when: { path: 'item.liveState', op: 'equals', value: 4 }, style: { fill: T('danger') } },
                  { when: { any: [{ path: 'item.liveState', op: 'equals', value: 5 }, { path: 'item.bHasDied', op: 'equals', value: true }] }, style: { fill: 'rgba(255,255,255,0.15)' } },
                ],
              })],
            },
            { id: 'ls_kills', type: 'text', x: 288, y: 0, w: 50, h: 48, bind: { text: { path: 'item.totalKills', fallback: 0 } }, style: { color: T('text'), fontSize: 20, fontWeight: 700, align: 'center', fontFamily: FONT }, anim: { onChange: { preset: 'pulse', duration: 400 } } },
            { id: 'ls_pts', type: 'text', x: 340, y: 0, w: 56, h: 48, bind: { text: { path: 'item.totalPoints', fallback: 0 } }, style: { color: T('accent'), fontSize: 22, fontWeight: 800, align: 'center', fontFamily: FONT } },
          ],
        },
      ],
    },
  ],
};

const killFeed: Template = {
  id: 'kill-feed',
  name: 'Kill Feed',
  description: 'Pops for every kill (engine kill events), one at a time.',
  elements: [
    {
      id: 'kf_group', type: 'group', name: 'Kill toast', x: 1460, y: 820, w: 420, h: 64,
      anim: { onEvent: { event: 'kill', preset: 'slideLeft', duration: 300, hold: 2500 } },
      children: [
        { id: 'kf_bg', type: 'rect', x: 0, y: 0, w: 420, h: 64, style: { fill: 'rgba(17,24,39,0.92)', radius: 8, stroke: T('primary'), strokeWidth: 2 } },
        { id: 'kf_icon', type: 'icon', icon: 'crosshair', x: 14, y: 14, w: 36, h: 36, style: { color: T('primary') } },
        { id: 'kf_name', type: 'text', x: 60, y: 6, w: 260, h: 30, bind: { text: { path: 'event.payload.player.playerName', format: 'upper' } }, style: { color: T('text'), fontSize: 22, fontWeight: 800, fontFamily: FONT } },
        { id: 'kf_team', type: 'text', x: 60, y: 34, w: 260, h: 24, bind: { text: { path: 'event.payload.teamTag' } }, style: { color: T('muted'), fontSize: 16, fontFamily: FONT } },
        { id: 'kf_count', type: 'text', x: 320, y: 0, w: 90, h: 64, bind: { text: { path: 'event.payload.killNum', suffix: ' KILLS' } }, style: { color: T('accent'), fontSize: 18, fontWeight: 800, align: 'right', fontFamily: FONT } },
      ],
    },
  ],
};

const playerCard: Template = {
  id: 'player-card',
  name: 'Player Card',
  description: 'This match\'s top fragger: photo, kills, damage, team.',
  elements: [
    {
      id: 'pc_group', type: 'group', name: 'Player card', x: 60, y: 300, w: 380, h: 460,
      anim: { enter: { preset: 'pop', duration: 500 } },
      children: [
        { id: 'pc_bg', type: 'rect', x: 0, y: 0, w: 380, h: 460, style: { gradient: { type: 'linear', angle: 160, stops: [{ offset: 0, color: '#1f2937' }, { offset: 1, color: '#0b0b0f' }] }, radius: 14, shadow: '0 10px 30px rgba(0,0,0,0.5)' } },
        { id: 'pc_photo', type: 'playerAvatar', x: 110, y: 30, w: 160, h: 160, src: '/def_char.avif', fallbackSrc: '/def_char.avif', bind: { src: { path: 'derived.matchFraggers[0].picUrl' } }, style: { stroke: T('primary'), strokeWidth: 4 } },
        { id: 'pc_name', type: 'text', x: 20, y: 205, w: 340, h: 48, bind: { text: { path: 'derived.matchFraggers[0].playerName', format: 'upper', fallback: '—' } }, style: { color: T('text'), fontSize: 34, fontWeight: 800, align: 'center', fontFamily: FONT } },
        { id: 'pc_team', type: 'text', x: 20, y: 252, w: 340, h: 30, bind: { text: { path: 'derived.matchFraggers[0].teamName', fallback: '' } }, style: { color: T('muted'), fontSize: 20, align: 'center', fontFamily: FONT } },
        { id: 'pc_k_lbl', type: 'text', x: 30, y: 310, w: 150, h: 30, text: 'ELIMS', style: { color: T('muted'), fontSize: 18, align: 'center', fontFamily: FONT } },
        { id: 'pc_k', type: 'text', x: 30, y: 340, w: 150, h: 80, bind: { text: { path: 'derived.matchFraggers[0].totalKills', fallback: 0 } }, style: { color: T('accent'), fontSize: 64, fontWeight: 800, align: 'center', fontFamily: FONT }, anim: { onChange: { preset: 'pop', duration: 400 } } },
        { id: 'pc_d_lbl', type: 'text', x: 200, y: 310, w: 150, h: 30, text: 'DAMAGE', style: { color: T('muted'), fontSize: 18, align: 'center', fontFamily: FONT } },
        { id: 'pc_d', type: 'text', x: 200, y: 340, w: 150, h: 80, bind: { text: { path: 'derived.matchFraggers[0].totalDamage', format: 'number', fallback: 0 } }, style: { color: T('text'), fontSize: 52, fontWeight: 800, align: 'center', fontFamily: FONT } },
      ],
    },
  ],
};

const matchHeader: Template = {
  id: 'match-header',
  name: 'Match Header',
  description: 'Top bar: tournament logo, match number, map, teams alive.',
  elements: [
    {
      id: 'mh_group', type: 'group', name: 'Match header', x: 660, y: 20, w: 600, h: 70,
      anim: { enter: { preset: 'slideDown', duration: 400 } },
      children: [
        { id: 'mh_bg', type: 'rect', x: 0, y: 0, w: 600, h: 70, style: { fill: T('secondary'), radius: 35, stroke: T('primary'), strokeWidth: 3 } },
        { id: 'mh_logo', type: 'image', x: 18, y: 9, w: 52, h: 52, src: '/def_logo.avif', bind: { src: { path: 'tournament.torLogo' } } },
        { id: 'mh_match', type: 'text', x: 80, y: 0, w: 230, h: 70, bind: { text: { path: 'match.matchNo', prefix: 'MATCH ', fallback: 'MATCH' } }, style: { color: T('text'), fontSize: 30, fontWeight: 800, fontFamily: FONT } },
        { id: 'mh_map', type: 'text', x: 310, y: 0, w: 150, h: 70, bind: { text: { path: 'match.map', format: 'upper' } }, style: { color: T('accent'), fontSize: 26, fontWeight: 700, fontFamily: FONT } },
        { id: 'mh_dead', type: 'text', x: 460, y: 0, w: 124, h: 70, bind: { text: { path: 'deadTeamList.length', prefix: 'OUT ', fallback: 0 } }, style: { color: T('muted'), fontSize: 22, fontWeight: 700, align: 'right', fontFamily: FONT } },
      ],
    },
  ],
};

const mvpCard: Template = {
  id: 'mvp-card',
  name: 'MVP Card',
  description: 'Round MVP by the official fragger score.',
  elements: [
    {
      id: 'mvp_group', type: 'group', name: 'MVP', x: 660, y: 240, w: 600, h: 600,
      anim: { enter: { preset: 'scale', duration: 600 } },
      children: [
        { id: 'mvp_bg', type: 'rect', x: 0, y: 0, w: 600, h: 600, style: { gradient: { type: 'radial', stops: [{ offset: 0, color: '#3b0a10' }, { offset: 1, color: '#0b0b0f' }] }, radius: 20 } },
        { id: 'mvp_title', type: 'text', x: 0, y: 24, w: 600, h: 60, text: 'TOURNAMENT MVP', style: { color: T('accent'), fontSize: 40, fontWeight: 900, align: 'center', fontFamily: FONT, letterSpacing: 4 } },
        { id: 'mvp_photo', type: 'playerAvatar', x: 200, y: 100, w: 200, h: 200, src: '/def_char.avif', fallbackSrc: '/def_char.avif', bind: { src: { path: 'derived.fraggers[0].picUrl' } }, style: { stroke: T('accent'), strokeWidth: 5 } },
        { id: 'mvp_name', type: 'text', x: 0, y: 320, w: 600, h: 60, bind: { text: { path: 'derived.fraggers[0].playerName', format: 'upper', fallback: '—' } }, style: { color: T('text'), fontSize: 46, fontWeight: 900, align: 'center', fontFamily: FONT } },
        { id: 'mvp_team', type: 'text', x: 0, y: 380, w: 600, h: 36, bind: { text: { path: 'derived.fraggers[0].teamName', fallback: '' } }, style: { color: T('muted'), fontSize: 24, align: 'center', fontFamily: FONT } },
        { id: 'mvp_kills', type: 'text', x: 40, y: 450, w: 170, h: 100, bind: { text: { path: 'derived.fraggers[0].totalKills', suffix: ' ELIMS', fallback: 0 } }, style: { color: T('text'), fontSize: 30, fontWeight: 800, align: 'center', fontFamily: FONT } },
        { id: 'mvp_dmg', type: 'text', x: 215, y: 450, w: 170, h: 100, bind: { text: { path: 'derived.fraggers[0].totalDamage', format: 'number', suffix: ' DMG', fallback: 0 } }, style: { color: T('text'), fontSize: 30, fontWeight: 800, align: 'center', fontFamily: FONT } },
        { id: 'mvp_score', type: 'text', x: 390, y: 450, w: 170, h: 100, bind: { text: { path: 'derived.fraggers[0].fraggerScore', format: 'fixed1', suffix: ' SCORE', fallback: 0 } }, style: { color: T('accent'), fontSize: 30, fontWeight: 800, align: 'center', fontFamily: FONT } },
      ],
    },
  ],
};

const eliminationAlert: Template = {
  id: 'elimination-alert',
  name: 'Elimination Alert',
  description: 'Shows each team wipe as it happens (engine elimination events).',
  elements: [
    {
      id: 'ea_group', type: 'group', name: 'Elimination alert', x: 560, y: 160, w: 800, h: 120,
      anim: { onEvent: { event: 'elimination', preset: 'wipe', duration: 400, hold: 3500 }, exit: { preset: 'fade', duration: 300 } },
      children: [
        { id: 'ea_bg', type: 'rect', x: 0, y: 0, w: 800, h: 120, style: { fill: 'rgba(11,11,15,0.94)', radius: 10, stroke: T('danger'), strokeWidth: 3 } },
        { id: 'ea_logo', type: 'teamLogo', x: 24, y: 16, w: 88, h: 88, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'event.payload.teamLogo' } }, style: { grayscale: 1 } },
        { id: 'ea_team', type: 'text', x: 130, y: 10, w: 500, h: 56, bind: { text: { path: 'event.payload.teamName', format: 'upper' } }, style: { color: T('text'), fontSize: 40, fontWeight: 900, fontFamily: FONT } },
        { id: 'ea_label', type: 'text', x: 130, y: 64, w: 500, h: 44, text: 'ELIMINATED', style: { color: T('danger'), fontSize: 30, fontWeight: 800, letterSpacing: 6, fontFamily: FONT } },
        { id: 'ea_kills', type: 'text', x: 620, y: 10, w: 160, h: 56, bind: { text: { path: 'event.payload.totalKills', suffix: ' ELIMS', fallback: 0 } }, style: { color: T('accent'), fontSize: 28, fontWeight: 800, align: 'right', fontFamily: FONT } },
        { id: 'ea_rank', type: 'text', x: 620, y: 64, w: 160, h: 44, bind: { text: { path: 'event.payload.rank', format: 'ordinal', prefix: 'PLACE ', fallback: '' } }, style: { color: T('muted'), fontSize: 22, align: 'right', fontFamily: FONT } },
      ],
    },
  ],
};

const playerStatus: Template = {
  id: 'player-status',
  name: 'Player Status (live)',
  description: 'Every alive team\'s players with health. Knocked players pulse, dead ones grey out, recalls and revives light up.',
  elements: [
    {
      id: 'ps_group', type: 'group', name: 'Player status', x: 40, y: 120, w: 340, h: 880,
      timeline: { clips: [{ id: 'enter', name: 'it appears → Slide in from the left', duration: 600, trigger: { type: 'enter' }, retrigger: 'restart', tracks: [
        { prop: 'x', keyframes: [{ t: 0, value: -320, ease: 'easeOut' }, { t: 600, value: 40 }] },
        { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 300, value: 1 }] },
      ] }] },
      children: [
        { id: 'ps_head', type: 'rect', name: 'Header', x: 0, y: 0, w: 340, h: 40, style: { fill: T('primary'), radius: 6 } },
        { id: 'ps_title', type: 'text', name: 'Title', x: 12, y: 0, w: 316, h: 40, text: 'PLAYERS', style: { color: '#ffffff', fontSize: 18, fontWeight: 800, letterSpacing: 4, fontFamily: FONT } },
        {
          id: 'ps_rows', type: 'repeater', name: 'Player rows', x: 0, y: 46, w: 340, h: 830,
          repeater: { source: 'live.players', limit: 16, direction: 'column', itemHeight: 48, gap: 4 },
          children: [
            livePlayerBehaviors({
              id: 'ps_row', type: 'group', name: 'Player row', x: 0, y: 0, w: 340, h: 48,
              children: [
                { id: 'ps_bg', type: 'rect', name: 'Row background', x: 0, y: 0, w: 340, h: 48, style: { fill: 'rgba(17,24,39,0.92)', radius: 4 } },
                { id: 'ps_logo', type: 'teamLogo', name: 'Team logo', x: 6, y: 6, w: 36, h: 36, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'item.teamLogo' } } },
                { id: 'ps_name', type: 'text', name: 'Player name', x: 50, y: 2, w: 200, h: 26, bind: { text: { path: 'item.playerName', format: 'upper' } }, style: { color: T('text'), fontSize: 17, fontWeight: 800, fontFamily: FONT } },
                { id: 'ps_hp', type: 'healthBar', name: 'Health', x: 50, y: 30, w: 200, h: 10, max: 100, bind: { value: { path: 'item.healthPct', fallback: 0 } }, style: { radius: 3 } },
                { id: 'ps_state', type: 'text', name: 'Knocked label', x: 250, y: 0, w: 84, h: 22, text: 'KNOCKED', visibleWhen: { path: 'item.knocked', op: 'equals', value: true }, style: { color: T('danger'), fontSize: 12, fontWeight: 800, align: 'right', fontFamily: FONT } },
                { id: 'ps_kills', type: 'text', name: 'Kills', x: 250, y: 20, w: 84, h: 28, bind: { text: { path: 'item.killNum', suffix: ' K', fallback: 0 } }, style: { color: T('accent'), fontSize: 18, fontWeight: 800, align: 'right', fontFamily: FONT } },
              ],
            }),
          ],
        },
      ],
    },
  ],
};

// Rebuilt theme graphics (fully editable, timeline-animated) come after the starters.
/* eslint-disable import/first */
import { REBUILT_TEMPLATES } from './rebuilt.ts';
import { DESKTOP_TEMPLATES } from './desktop.ts';
import { VIEW_TEMPLATES } from './views.ts';
/* eslint-enable import/first */

export const STARTER_TEMPLATES: Template[] = [lowerThird, liveStandings, playerStatus, killFeed, playerCard, matchHeader, mvpCard, eliminationAlert];

export const TEMPLATES: Template[] = [...STARTER_TEMPLATES, ...REBUILT_TEMPLATES, ...VIEW_TEMPLATES, ...DESKTOP_TEMPLATES];
