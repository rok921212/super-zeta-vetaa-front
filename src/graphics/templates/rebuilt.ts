// Editable rebuilds of the most-used built-in theme graphics. Unlike the
// live-embedded built-ins, every box / text / logo here is a Designer layer:
// bound to the same engine data the themes use (derived.*, live.*, feed.*,
// event.*) and animated with timeline clips (enter / live event / loop).
// Visual reference: Theme6/Theme7. Validated in CI (templates.test.ts) and
// rendered against simulation data (rebuilt.test.tsx).

import type { LayoutElement, TimelineClip } from '../schema/layoutTypes.ts';
import type { Template } from './index.ts';
import { lifecycle, rawPlayerBehaviors, teamRowBehaviors, withBehaviors } from './behaviors.ts';

const T = (k: string) => ({ ref: `theme.colors.${k}` });
const FONT = { ref: 'theme.typography.fontFamily' };
const PANEL = 'rgba(11,11,15,0.92)';
const txt = (over: Partial<LayoutElement> & { id: string }): LayoutElement => ({ type: 'text', x: 0, y: 0, w: 100, h: 40, ...over, style: { color: '#ffffff', fontFamily: FONT, ...(over.style || {}) } } as LayoutElement);

/** Slide in on enter along x or y. */
const enterClip = (axis: 'x' | 'y', from: number, to: number, ms = 600): TimelineClip => ({
  id: 'enter', name: 'Enter', duration: ms, trigger: { type: 'enter' }, retrigger: 'restart',
  tracks: [
    { prop: axis, keyframes: [{ t: 0, value: from, ease: 'easeOut' }, { t: ms, value: to }] },
    { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: Math.round(ms / 2), value: 1 }] },
  ],
});

/** Pop in, hold, pop out on a live event (queued so back-to-back events all show). */
const eventClip = (event: 'elimination' | 'recall' | 'kill' | 'milestone', axis: 'x' | 'y', rest: number, offset: number, holdMs = 3500): TimelineClip => ({
  id: `on-${event}`, name: `On ${event}`, duration: holdMs + 900, trigger: { type: 'event', event }, retrigger: 'queue',
  tracks: [
    { prop: axis, keyframes: [{ t: 0, value: rest + offset, ease: 'backOut' }, { t: 450, value: rest }, { t: holdMs + 450, value: rest, ease: 'easeIn' }, { t: holdMs + 900, value: rest + offset }] },
    { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 200, value: 1 }, { t: holdMs + 650, value: 1 }, { t: holdMs + 900, value: 0 }] },
  ],
});

// 1 ─ Lower third ────────────────────────────────────────────────────────────
const lowerThird: Template = {
  id: 'rb-lower-third', name: 'Lower Third (pro)', source: 'Theme6 · Lower Third',
  description: 'Tournament, round, match and map bar with an accent strip. Slides in.',
  elements: [{
    id: 'rlt', type: 'group', name: 'Lower third', x: 80, y: 930, w: 1100, h: 100, timeline: { clips: [enterClip('x', -1200, 80, 700)] },
    children: [
      { id: 'rlt_bg', type: 'rect', name: 'Panel', x: 0, y: 0, w: 1100, h: 100, style: { fill: PANEL, radius: 6 }, effects: [{ type: 'dropShadow', enabled: true, color: '#000000', opacity: 0.55, x: 0, y: 10, blur: 24 }] },
      { id: 'rlt_accent', type: 'rect', name: 'Accent', x: 0, y: 0, w: 10, h: 100, style: { fill: T('primary') } },
      { id: 'rlt_logo', type: 'image', name: 'Tournament logo', x: 30, y: 12, w: 76, h: 76, src: '/def_logo.avif', bind: { src: { path: 'tournament.torLogo' } }, style: { objectFit: 'contain' } },
      txt({ id: 'rlt_title', name: 'Tournament', x: 124, y: 8, w: 640, h: 50, bind: { text: { path: 'tournament.tournamentName', format: 'upper', fallback: 'TOURNAMENT' } }, style: { fontSize: 36, fontWeight: 900, letterSpacing: 1 } }),
      txt({ id: 'rlt_round', name: 'Round', x: 124, y: 56, w: 640, h: 36, bind: { text: { path: 'round.roundName', format: 'upper', fallback: '' } }, style: { fontSize: 22, fontWeight: 600, color: T('muted'), letterSpacing: 3 } }),
      { id: 'rlt_chip', type: 'rect', name: 'Match chip', x: 800, y: 18, w: 280, h: 64, style: { fill: T('primary'), radius: 4 } },
      txt({ id: 'rlt_match', name: 'Match', x: 800, y: 18, w: 280, h: 38, bind: { text: { path: 'match.matchNo', prefix: 'MATCH ', fallback: 'MATCH' } }, style: { fontSize: 28, fontWeight: 900, align: 'center' } }),
      txt({ id: 'rlt_map', name: 'Map', x: 800, y: 52, w: 280, h: 28, bind: { text: { path: 'live.mapName', format: 'upper', fallback: '' } }, style: { fontSize: 18, fontWeight: 700, align: 'center', letterSpacing: 4 } }),
    ],
  }],
};

// 2 ─ Upper third / match header ─────────────────────────────────────────────
const statCell = (id: string, x: number, label: string, path: string): LayoutElement[] => [
  txt({ id: `${id}_v`, name: `${label} value`, x, y: 6, w: 160, h: 46, bind: { text: { path, fallback: 0 } }, style: { fontSize: 36, fontWeight: 900, align: 'center', color: T('accent') } }),
  txt({ id: `${id}_l`, name: `${label} label`, x, y: 50, w: 160, h: 24, text: label, style: { fontSize: 14, fontWeight: 700, align: 'center', color: T('muted'), letterSpacing: 3 } }),
];
const upperThird: Template = {
  id: 'rb-upper-third', name: 'Upper Third (live counters)', source: 'Theme6 · Upper Third',
  description: 'Match, map, teams alive, players alive and total kills — live.',
  elements: [{
    id: 'rut', type: 'group', name: 'Upper third', x: 510, y: 24, w: 900, h: 84, timeline: { clips: [enterClip('y', -120, 24, 600)] },
    children: [
      { id: 'rut_bg', type: 'rect', name: 'Panel', x: 0, y: 0, w: 900, h: 84, style: { fill: PANEL, radius: 8 }, effects: [{ type: 'stroke', enabled: true, color: '#ffffff', opacity: 0.08, size: 1, position: 'inside' }] },
      { id: 'rut_left', type: 'rect', name: 'Match block', x: 0, y: 0, w: 260, h: 84, style: { fill: T('primary'), radius: 8 } },
      txt({ id: 'rut_match', name: 'Match', x: 0, y: 6, w: 260, h: 44, bind: { text: { path: 'match.matchNo', prefix: 'MATCH ', fallback: 'MATCH' } }, style: { fontSize: 32, fontWeight: 900, align: 'center' } }),
      txt({ id: 'rut_map', name: 'Map', x: 0, y: 48, w: 260, h: 28, bind: { text: { path: 'live.mapName', format: 'upper', fallback: '' } }, style: { fontSize: 18, fontWeight: 700, align: 'center', letterSpacing: 4 } }),
      ...statCell('rut_teams', 290, 'TEAMS ALIVE', 'live.aliveTeamsCount'),
      ...statCell('rut_players', 490, 'PLAYERS ALIVE', 'live.alivePlayersCount'),
      ...statCell('rut_kills', 690, 'TOTAL KILLS', 'live.totalKills'),
    ],
  }],
};

// 3 ─ Elimination alert ──────────────────────────────────────────────────────
const eliminationAlert: Template = {
  id: 'rb-elimination', name: 'Elimination Alert (pro)', source: 'Theme6 · Alerts',
  description: 'Pops on every team elimination (queued): logo, team, place and eliminations.',
  elements: [{
    id: 'rea', type: 'group', name: 'Elimination alert', x: 1080, y: 150, w: 780, h: 150, opacity: 1,
    timeline: { clips: [eventClip('elimination', 'x', 1080, 900)] },
    children: [
      { id: 'rea_bg', type: 'rect', name: 'Panel', x: 0, y: 0, w: 780, h: 150, style: { fill: PANEL, radius: 10 }, effects: [{ type: 'stroke', enabled: true, color: '#ef4444', opacity: 1, size: 3, position: 'inside' }, { type: 'dropShadow', enabled: true, color: '#000000', opacity: 0.6, x: 0, y: 12, blur: 30 }] },
      { id: 'rea_band', type: 'rect', name: 'Red band', x: 0, y: 0, w: 780, h: 40, style: { fill: T('danger'), radius: 10 } },
      txt({ id: 'rea_label', name: 'Label', x: 20, y: 2, w: 500, h: 36, text: 'TEAM ELIMINATED', style: { fontSize: 22, fontWeight: 900, letterSpacing: 6 } }),
      txt({ id: 'rea_place', name: 'Place', x: 540, y: 2, w: 220, h: 36, bind: { text: { path: 'event.payload.rank', format: 'ordinal', suffix: ' PLACE', fallback: '' } }, style: { fontSize: 22, fontWeight: 800, align: 'right' } }),
      { id: 'rea_logo', type: 'teamLogo', name: 'Team logo', x: 24, y: 52, w: 86, h: 86, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'event.payload.teamLogo' } }, style: { grayscale: 1 } },
      txt({ id: 'rea_team', name: 'Team', x: 130, y: 52, w: 460, h: 56, bind: { text: { path: 'event.payload.teamName', format: 'upper', fallback: 'TEAM' } }, style: { fontSize: 40, fontWeight: 900 } }),
      txt({ id: 'rea_tag', name: 'Tag', x: 130, y: 104, w: 460, h: 30, bind: { text: { path: 'event.payload.teamTag', format: 'upper', fallback: '' } }, style: { fontSize: 20, fontWeight: 700, color: T('muted'), letterSpacing: 4 } }),
      txt({ id: 'rea_kills', name: 'Eliminations', x: 600, y: 52, w: 160, h: 60, bind: { text: { path: 'event.payload.totalKills', fallback: 0 } }, style: { fontSize: 52, fontWeight: 900, align: 'right', color: T('accent') } }),
      txt({ id: 'rea_kills_l', name: 'Elims label', x: 600, y: 108, w: 160, h: 26, text: 'ELIMS', style: { fontSize: 16, fontWeight: 700, align: 'right', color: T('muted'), letterSpacing: 4 } }),
    ],
  }],
};

// 4 ─ Recall banner ──────────────────────────────────────────────────────────
const recallBanner: Template = {
  id: 'rb-recall', name: 'Recall Banner', source: 'Theme6 · Recall',
  description: 'Shows the recalled player on recall maps (Rondo): name, team, logo.',
  elements: [{
    id: 'rrc', type: 'group', name: 'Recall banner', x: 60, y: 700, w: 620, h: 120,
    timeline: { clips: [eventClip('recall', 'x', 60, -700, 3200)] },
    children: [
      { id: 'rrc_bg', type: 'rect', name: 'Panel', x: 0, y: 0, w: 620, h: 120, style: { fill: PANEL, radius: 10 }, effects: [{ type: 'outerGlow', enabled: true, color: '#22c55e', opacity: 0.7, size: 16 }] },
      { id: 'rrc_band', type: 'rect', name: 'Green band', x: 0, y: 0, w: 14, h: 120, style: { fill: T('success'), radius: 4 } },
      { id: 'rrc_logo', type: 'teamLogo', name: 'Team logo', x: 34, y: 18, w: 84, h: 84, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'event.payload.teamLogo' } } },
      txt({ id: 'rrc_label', name: 'Label', x: 136, y: 12, w: 460, h: 34, text: 'RECALLED', style: { fontSize: 22, fontWeight: 900, color: T('success'), letterSpacing: 8 } }),
      txt({ id: 'rrc_player', name: 'Player', x: 136, y: 44, w: 460, h: 44, bind: { text: { path: 'event.payload.playerName', format: 'upper', fallback: 'PLAYER' } }, style: { fontSize: 34, fontWeight: 900 } }),
      txt({ id: 'rrc_team', name: 'Team', x: 136, y: 84, w: 460, h: 28, bind: { text: { path: 'event.payload.teamTag', format: 'upper', fallback: '' } }, style: { fontSize: 18, fontWeight: 700, color: T('muted'), letterSpacing: 4 } }),
    ],
  }],
};

// 5 ─ Kill feed ──────────────────────────────────────────────────────────────
const killFeed: Template = {
  id: 'rb-kill-feed', name: 'Kill Feed (live)', source: 'Theme6 · Live Frags',
  description: 'The last 5 kills from the live feed; new kills slide in on top.',
  elements: [{
    id: 'rkf', type: 'repeater', name: 'Kill feed', x: 1440, y: 360, w: 440, h: 330,
    repeater: { source: 'feed.kills', limit: 5, direction: 'column', itemHeight: 58, gap: 8 },
    children: [
      { id: 'rkf_bg', type: 'rect', name: 'Row', x: 0, y: 0, w: 440, h: 58, style: { fill: PANEL, radius: 6 }, timeline: { clips: [enterClip('x', 460, 0, 450)] } },
      { id: 'rkf_bar', type: 'rect', name: 'Accent', x: 0, y: 0, w: 6, h: 58, style: { fill: T('danger') } },
      { id: 'rkf_logo', type: 'teamLogo', name: 'Team logo', x: 16, y: 9, w: 40, h: 40, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'item.teamLogo' } } },
      txt({ id: 'rkf_name', name: 'Player', x: 66, y: 4, w: 260, h: 30, bind: { text: { path: 'item.player.playerName', format: 'upper', fallback: '' } }, style: { fontSize: 22, fontWeight: 800 } }),
      txt({ id: 'rkf_team', name: 'Team', x: 66, y: 32, w: 260, h: 22, bind: { text: { path: 'item.teamTag', format: 'upper', fallback: '' } }, style: { fontSize: 14, fontWeight: 700, color: T('muted'), letterSpacing: 3 } }),
      txt({ id: 'rkf_n', name: 'Kill #', x: 330, y: 0, w: 96, h: 58, bind: { text: { path: 'item.killNum', prefix: '×', fallback: '' } }, style: { fontSize: 28, fontWeight: 900, align: 'right', color: T('accent') } }),
    ],
  }],
};

// 6 ─ Live stats (team list) ─────────────────────────────────────────────────
const liveStats: Template = {
  id: 'rb-live-stats', name: 'Live Stats (pro)', source: 'Theme6 · Live Stats',
  description: 'All teams: rank, logo, alive pips, kills, points. Reacts to kills, knocks, recalls and eliminations.',
  elements: [{
    id: 'rls', type: 'group', name: 'Live stats', x: 1520, y: 40, w: 380, h: 980, timeline: { clips: [enterClip('x', 1940, 1520, 650)] },
    children: [
      { id: 'rls_head', type: 'rect', name: 'Header', x: 0, y: 0, w: 380, h: 42, style: { fill: T('primary'), radius: 6 } },
      txt({ id: 'rls_h1', name: 'Team', x: 58, y: 0, w: 140, h: 42, text: 'TEAM', style: { fontSize: 16, fontWeight: 900, letterSpacing: 3 } }),
      txt({ id: 'rls_h2', name: 'Alive', x: 196, y: 0, w: 70, h: 42, text: 'ALIVE', style: { fontSize: 14, fontWeight: 900, align: 'center' } }),
      txt({ id: 'rls_h3', name: 'Kills', x: 268, y: 0, w: 50, h: 42, text: 'KILLS', style: { fontSize: 12, fontWeight: 900, align: 'center' } }),
      txt({ id: 'rls_h4', name: 'Pts', x: 320, y: 0, w: 56, h: 42, text: 'PTS', style: { fontSize: 14, fontWeight: 900, align: 'center' } }),
      {
        id: 'rls_rows', type: 'repeater', name: 'Team rows', x: 0, y: 48, w: 380, h: 930,
        repeater: { source: 'derived.teams', limit: 16, direction: 'column', itemHeight: 54, gap: 4 },
        children: [
          teamRowBehaviors({ id: 'rls_bg', type: 'rect', name: 'Row', x: 0, y: 0, w: 380, h: 54, style: { fill: PANEL, radius: 4 }, styleWhen: [{ when: { path: 'item.isAllDead', op: 'equals', value: true }, style: { fill: 'rgba(11,11,15,0.5)' } }] }, [['teamKill', 'glow'], ['teamKnock', 'shake']]),
          txt({ id: 'rls_rank', name: 'Rank', x: 0, y: 0, w: 44, h: 54, bind: { text: { path: 'rank' } }, style: { fontSize: 22, fontWeight: 900, align: 'center', color: T('accent') } }),
          { id: 'rls_logo', type: 'teamLogo', name: 'Logo', x: 46, y: 9, w: 36, h: 36, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'item.teamLogo' } }, styleWhen: [{ when: { path: 'item.isAllDead', op: 'equals', value: true }, style: { grayscale: 1 } }] },
          txt({ id: 'rls_tag', name: 'Tag', x: 88, y: 0, w: 106, h: 54, bind: { text: { path: 'item.teamTag', format: 'upper' } }, style: { fontSize: 19, fontWeight: 800 }, styleWhen: [{ when: { path: 'item.isAllDead', op: 'equals', value: true }, style: { color: T('muted') } }] }),
          {
            id: 'rls_pips', type: 'repeater', name: 'Alive pips', x: 200, y: 17, w: 62, h: 20,
            repeater: { source: 'item.players', limit: 4, direction: 'row', itemWidth: 11, itemHeight: 20, gap: 4 },
            children: [rawPlayerBehaviors({
              id: 'rls_pip', type: 'rect', name: 'Pip', x: 0, y: 0, w: 11, h: 20, style: { fill: T('success'), radius: 2 },
              styleWhen: [
                { when: { path: 'item.liveState', op: 'equals', value: 4 }, style: { fill: T('danger') } },
                { when: { any: [{ path: 'item.liveState', op: 'equals', value: 5 }, { path: 'item.bHasDied', op: 'equals', value: true }] }, style: { fill: 'rgba(255,255,255,0.15)' } },
              ],
            })],
          },
          withBehaviors(txt({ id: 'rls_kills', name: 'Kills', x: 268, y: 0, w: 50, h: 54, bind: { text: { path: 'item.totalKills', fallback: 0 } }, style: { fontSize: 20, fontWeight: 800, align: 'center' } }), [['teamKill', 'pop']]),
          txt({ id: 'rls_pts', name: 'Points', x: 320, y: 0, w: 56, h: 54, bind: { text: { path: 'item.totalPoints', fallback: 0 } }, style: { fontSize: 22, fontWeight: 900, align: 'center', color: T('accent') } }),
        ],
      },
    ],
  }],
};

// 7 ─ Live frags (top fraggers this match) ───────────────────────────────────
const liveFrags: Template = {
  id: 'rb-live-frags', name: 'Live Frags (top 5)', source: 'Theme6 · Live Frags',
  description: 'Top 5 fraggers of the current match with photos and kills.',
  elements: [{
    id: 'rlf', type: 'group', name: 'Live frags', x: 40, y: 260, w: 420, h: 520, timeline: { clips: [enterClip('x', -460, 40, 600)] },
    children: [
      { id: 'rlf_head', type: 'rect', name: 'Header', x: 0, y: 0, w: 420, h: 50, style: { fill: T('primary'), radius: 6 } },
      txt({ id: 'rlf_title', name: 'Title', x: 16, y: 0, w: 390, h: 50, text: 'TOP FRAGGERS', style: { fontSize: 24, fontWeight: 900, letterSpacing: 4 } }),
      {
        id: 'rlf_rows', type: 'repeater', name: 'Fraggers', x: 0, y: 58, w: 420, h: 460,
        repeater: { source: 'derived.matchFraggers', limit: 5, direction: 'column', itemHeight: 86, gap: 6 },
        children: [
          { id: 'rlf_bg', type: 'rect', name: 'Row', x: 0, y: 0, w: 420, h: 86, style: { fill: PANEL, radius: 6 } },
          txt({ id: 'rlf_rank', name: 'Rank', x: 0, y: 0, w: 44, h: 86, bind: { text: { path: 'rank' } }, style: { fontSize: 26, fontWeight: 900, align: 'center', color: T('accent') } }),
          { id: 'rlf_pic', type: 'playerAvatar', name: 'Photo', x: 48, y: 8, w: 70, h: 70, src: '/def_char.avif', fallbackSrc: '/def_char.avif', bind: { src: { path: 'item.picUrl' } } },
          txt({ id: 'rlf_name', name: 'Player', x: 130, y: 10, w: 200, h: 38, bind: { text: { path: 'item.playerName', format: 'upper' } }, style: { fontSize: 22, fontWeight: 900 } }),
          txt({ id: 'rlf_team', name: 'Team', x: 130, y: 46, w: 200, h: 28, bind: { text: { path: 'item.teamTag', format: 'upper' } }, style: { fontSize: 15, fontWeight: 700, color: T('muted'), letterSpacing: 3 } }),
          withBehaviors(txt({ id: 'rlf_kills', name: 'Kills', x: 330, y: 8, w: 76, h: 50, bind: { text: { path: 'item.totalKills', fallback: 0 } }, style: { fontSize: 38, fontWeight: 900, align: 'right', color: T('accent') } }), [['playerKill', 'pop']]),
          txt({ id: 'rlf_kl', name: 'Kills label', x: 330, y: 54, w: 76, h: 24, text: 'KILLS', style: { fontSize: 13, fontWeight: 700, align: 'right', color: T('muted') } }),
        ],
      },
    ],
  }],
};

// 8 ─ Dominator (kill leader) ────────────────────────────────────────────────
const dominator: Template = {
  id: 'rb-dominator', name: 'Dominator (kill leader)', source: 'Theme6 · Dominator',
  description: 'The match kill leader; glows once they reach 5 kills.',
  elements: [{
    id: 'rdm', type: 'group', name: 'Dominator', x: 40, y: 40, w: 560, h: 150,
    timeline: { clips: [
      enterClip('y', -180, 40, 600),
      { id: 'hot', name: 'Glow at 5 kills', duration: 1400, loop: 2, trigger: { type: 'condition', when: { path: 'live.killLeader.killNum', op: 'greaterOrEqual', value: 5 } }, retrigger: 'restart', tracks: [
        { prop: 'scale', keyframes: [{ t: 0, value: 1, ease: 'easeInOut' }, { t: 700, value: 1.05, ease: 'easeInOut' }, { t: 1400, value: 1 }] },
      ] },
    ] },
    children: [
      { id: 'rdm_bg', type: 'rect', name: 'Panel', x: 0, y: 0, w: 560, h: 150, style: { fill: PANEL, radius: 10 }, effects: [{ type: 'outerGlow', enabled: true, color: '#facc15', opacity: 0.55, size: 14 }] },
      { id: 'rdm_pic', type: 'playerAvatar', name: 'Photo', x: 18, y: 15, w: 120, h: 120, src: '/def_char.avif', fallbackSrc: '/def_char.avif', bind: { src: { path: 'live.killLeader.picUrl' } }, mask: { shape: 'ellipse' } },
      txt({ id: 'rdm_label', name: 'Label', x: 160, y: 10, w: 380, h: 30, text: 'DOMINATOR', style: { fontSize: 18, fontWeight: 900, color: T('accent'), letterSpacing: 8 } }),
      txt({ id: 'rdm_name', name: 'Player', x: 160, y: 40, w: 300, h: 50, bind: { text: { path: 'live.killLeader.playerName', format: 'upper', fallback: '—' } }, style: { fontSize: 36, fontWeight: 900 } }),
      txt({ id: 'rdm_team', name: 'Team', x: 160, y: 90, w: 300, h: 30, bind: { text: { path: 'live.killLeader.teamTag', format: 'upper', fallback: '' } }, style: { fontSize: 18, fontWeight: 700, color: T('muted'), letterSpacing: 4 } }),
      txt({ id: 'rdm_kills', name: 'Kills', x: 440, y: 36, w: 100, h: 70, bind: { text: { path: 'live.killLeader.killNum', fallback: 0 } }, style: { fontSize: 64, fontWeight: 900, align: 'right', color: T('accent') } }),
      txt({ id: 'rdm_dmg', name: 'Damage', x: 360, y: 108, w: 180, h: 28, bind: { text: { path: 'live.killLeader.damage', format: 'number', suffix: ' DMG', fallback: '' } }, style: { fontSize: 16, fontWeight: 700, align: 'right', color: T('muted') } }),
    ],
  }],
};

// 9 ─ Overall standings ──────────────────────────────────────────────────────
const overallStandings: Template = {
  id: 'rb-overall', name: 'Overall Standings (16)', source: 'Theme6 · Overall Standings',
  description: 'Two-column tournament table: rank, logo, team, WWCD, place pts, kills, total.',
  elements: [{
    id: 'ros', type: 'group', name: 'Overall standings', x: 110, y: 70, w: 1700, h: 940, timeline: { clips: [enterClip('y', 140, 70, 700)] },
    children: [
      { id: 'ros_bg', type: 'rect', name: 'Backdrop', x: 0, y: 0, w: 1700, h: 940, style: { fill: 'rgba(11,11,15,0.88)', radius: 12 } },
      txt({ id: 'ros_title', name: 'Title', x: 40, y: 20, w: 1000, h: 70, text: 'OVERALL STANDINGS', style: { fontSize: 56, fontWeight: 900, letterSpacing: 4 } }),
      txt({ id: 'ros_sub', name: 'Tournament', x: 40, y: 84, w: 1000, h: 36, bind: { text: { path: 'tournament.tournamentName', format: 'upper', fallback: '' } }, style: { fontSize: 22, fontWeight: 700, color: T('muted'), letterSpacing: 4 } }),
      {
        id: 'ros_grid', type: 'repeater', name: 'Rows', x: 40, y: 140, w: 1620, h: 780,
        repeater: { source: 'derived.overallStandings', limit: 16, direction: 'grid', columns: 2, itemWidth: 800, itemHeight: 88, gap: 8 },
        children: [
          { id: 'ros_row', type: 'rect', name: 'Row', x: 0, y: 0, w: 800, h: 88, style: { fill: 'rgba(255,255,255,0.05)', radius: 6 } },
          { id: 'ros_rankbg', type: 'rect', name: 'Rank box', x: 0, y: 0, w: 70, h: 88, style: { fill: T('primary'), radius: 6 } },
          txt({ id: 'ros_rank', name: 'Rank', x: 0, y: 0, w: 70, h: 88, bind: { text: { path: 'item.rank' } }, style: { fontSize: 34, fontWeight: 900, align: 'center' } }),
          { id: 'ros_logo', type: 'teamLogo', name: 'Logo', x: 84, y: 12, w: 64, h: 64, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'item.teamLogo' } } },
          txt({ id: 'ros_team', name: 'Team', x: 160, y: 0, w: 300, h: 88, bind: { text: { path: 'item.teamName', format: 'upper' } }, style: { fontSize: 26, fontWeight: 800 } }),
          txt({ id: 'ros_wwcd', name: 'WWCD', x: 470, y: 0, w: 70, h: 88, bind: { text: { path: 'item.wwcd', fallback: 0 } }, style: { fontSize: 24, fontWeight: 800, align: 'center', color: T('muted') } }),
          txt({ id: 'ros_place', name: 'Place pts', x: 545, y: 0, w: 80, h: 88, bind: { text: { path: 'item.totalPlacePoints', fallback: 0 } }, style: { fontSize: 24, fontWeight: 800, align: 'center' } }),
          txt({ id: 'ros_kills', name: 'Kills', x: 630, y: 0, w: 70, h: 88, bind: { text: { path: 'item.totalKills', fallback: 0 } }, style: { fontSize: 24, fontWeight: 800, align: 'center' } }),
          txt({ id: 'ros_total', name: 'Total', x: 705, y: 0, w: 85, h: 88, bind: { text: { path: 'item.totalScore', fallback: 0 } }, style: { fontSize: 32, fontWeight: 900, align: 'center', color: T('accent') } }),
        ],
      },
    ],
  }],
};

// 10 ─ Match fraggers (post match) ───────────────────────────────────────────
const matchFraggers: Template = {
  id: 'rb-match-fraggers', name: 'Match Fraggers (post match)', source: 'Theme6 · Match Fraggers',
  description: 'Five player cards for the match\'s best fraggers: photo, team, kills, damage.',
  elements: [{
    id: 'rmf', type: 'group', name: 'Match fraggers', x: 110, y: 200, w: 1700, h: 680, timeline: { clips: [enterClip('y', 260, 200, 700)] },
    children: [
      txt({ id: 'rmf_title', name: 'Title', x: 0, y: 0, w: 1700, h: 80, text: 'MATCH FRAGGERS', style: { fontSize: 64, fontWeight: 900, align: 'center', letterSpacing: 6 } }),
      {
        id: 'rmf_cards', type: 'repeater', name: 'Cards', x: 0, y: 110, w: 1700, h: 560,
        repeater: { source: 'derived.matchFraggers', limit: 5, direction: 'row', itemWidth: 320, itemHeight: 560, gap: 25 },
        children: [
          { id: 'rmf_bg', type: 'rect', name: 'Card', x: 0, y: 0, w: 320, h: 560, style: { fill: PANEL, radius: 12 }, effects: [{ type: 'stroke', enabled: true, color: '#ffffff', opacity: 0.08, size: 1, position: 'inside' }] },
          { id: 'rmf_pic', type: 'playerAvatar', name: 'Photo', x: 20, y: 20, w: 280, h: 300, src: '/def_char.avif', fallbackSrc: '/def_char.avif', bind: { src: { path: 'item.picUrl' } }, style: { radius: 8, objectFit: 'cover' } },
          { id: 'rmf_fade', type: 'rect', name: 'Photo fade', x: 20, y: 220, w: 280, h: 100, clipToBelow: true, style: { gradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: 'rgba(11,11,15,0)' }, { offset: 1, color: 'rgba(11,11,15,0.95)' }] } } },
          txt({ id: 'rmf_rank', name: 'Rank', x: 20, y: 24, w: 80, h: 50, bind: { text: { path: 'rank', prefix: '#' } }, style: { fontSize: 36, fontWeight: 900, color: T('accent') } }),
          txt({ id: 'rmf_name', name: 'Player', x: 20, y: 330, w: 280, h: 44, bind: { text: { path: 'item.playerName', format: 'upper' } }, style: { fontSize: 28, fontWeight: 900, align: 'center' } }),
          txt({ id: 'rmf_team', name: 'Team', x: 20, y: 372, w: 280, h: 30, bind: { text: { path: 'item.teamTag', format: 'upper' } }, style: { fontSize: 18, fontWeight: 700, align: 'center', color: T('muted'), letterSpacing: 4 } }),
          txt({ id: 'rmf_kills', name: 'Kills', x: 20, y: 420, w: 140, h: 70, bind: { text: { path: 'item.totalKills', fallback: 0 } }, style: { fontSize: 56, fontWeight: 900, align: 'center', color: T('accent') } }),
          txt({ id: 'rmf_kl', name: 'Kills label', x: 20, y: 490, w: 140, h: 30, text: 'KILLS', style: { fontSize: 16, fontWeight: 700, align: 'center', color: T('muted') } }),
          txt({ id: 'rmf_dmg', name: 'Damage', x: 160, y: 420, w: 140, h: 70, bind: { text: { path: 'item.totalDamage', format: 'number', fallback: 0 } }, style: { fontSize: 40, fontWeight: 900, align: 'center' } }),
          txt({ id: 'rmf_dl', name: 'Damage label', x: 160, y: 490, w: 140, h: 30, text: 'DAMAGE', style: { fontSize: 16, fontWeight: 700, align: 'center', color: T('muted') } }),
        ],
      },
    ],
  }],
};

// 11 ─ WWCD / champions ──────────────────────────────────────────────────────
const wwcd: Template = {
  id: 'rb-wwcd', name: 'Winner Winner (WWCD)', source: 'Theme6 · WWCD Summary',
  description: 'The match winner: logo, team, kills, place points and the four players.',
  elements: [{
    id: 'rww', type: 'group', name: 'WWCD', x: 160, y: 120, w: 1600, h: 840, timeline: { clips: [enterClip('y', 200, 120, 800)] },
    children: [
      txt({ id: 'rww_title', name: 'Title', x: 0, y: 0, w: 1600, h: 110, text: 'WINNER WINNER CHICKEN DINNER', style: { fontSize: 76, fontWeight: 900, align: 'center', letterSpacing: 2 }, effects: [{ type: 'dropShadow', enabled: true, color: '#000000', opacity: 0.7, x: 0, y: 6, blur: 16 }] }),
      { id: 'rww_logo', type: 'teamLogo', name: 'Winner logo', x: 640, y: 130, w: 320, h: 320, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'derived.matchStandings[0].teamLogo' } }, effects: [{ type: 'outerGlow', enabled: true, color: '#facc15', opacity: 0.6, size: 30 }] },
      txt({ id: 'rww_team', name: 'Winner team', x: 0, y: 460, w: 1600, h: 90, bind: { text: { path: 'derived.matchStandings[0].teamName', format: 'upper', fallback: 'WINNER' } }, style: { fontSize: 72, fontWeight: 900, align: 'center', color: T('accent') } }),
      txt({ id: 'rww_stats', name: 'Stats', x: 0, y: 548, w: 1600, h: 46, bind: { text: { path: 'derived.matchStandings[0].totalKills', prefix: 'ELIMS ', suffix: '  ·  10 PLACE PTS', fallback: '' } }, style: { fontSize: 28, fontWeight: 700, align: 'center', color: T('muted'), letterSpacing: 4 } }),
      {
        id: 'rww_players', type: 'repeater', name: 'Players', x: 200, y: 620, w: 1200, h: 200,
        repeater: { source: 'derived.matchStandings', limit: 1, direction: 'column', itemWidth: 1200, itemHeight: 200 },
        children: [{
          id: 'rww_pl', type: 'repeater', name: 'Roster', x: 0, y: 0, w: 1200, h: 200,
          repeater: { source: 'item.players', limit: 4, direction: 'row', itemWidth: 285, itemHeight: 200, gap: 20 },
          children: [
            { id: 'rww_card', type: 'rect', name: 'Card', x: 0, y: 0, w: 285, h: 200, style: { fill: PANEL, radius: 10 } },
            txt({ id: 'rww_pname', name: 'Player', x: 10, y: 30, w: 265, h: 50, bind: { text: { path: 'item.playerName', format: 'upper' } }, style: { fontSize: 26, fontWeight: 900, align: 'center' } }),
            txt({ id: 'rww_pk', name: 'Kills', x: 10, y: 90, w: 265, h: 70, bind: { text: { path: 'item.killNum', fallback: 0 } }, style: { fontSize: 56, fontWeight: 900, align: 'center', color: T('accent') } }),
            txt({ id: 'rww_pkl', name: 'Label', x: 10, y: 156, w: 265, h: 30, text: 'KILLS', style: { fontSize: 16, fontWeight: 700, align: 'center', color: T('muted') } }),
          ],
        }],
      },
    ],
  }],
};

// 12 ─ MVP ───────────────────────────────────────────────────────────────────
const mvp: Template = {
  id: 'rb-mvp', name: 'Match MVP (pro)', source: 'Theme6 · MVP',
  description: 'The match MVP (top fragger score): photo, team and four key stats.',
  elements: [{
    id: 'rmv', type: 'group', name: 'MVP', x: 260, y: 160, w: 1400, h: 760, timeline: { clips: [enterClip('x', -1500, 260, 800)] },
    children: [
      { id: 'rmv_bg', type: 'rect', name: 'Panel', x: 0, y: 0, w: 1400, h: 760, style: { fill: PANEL, radius: 16 }, effects: [{ type: 'gradientOverlay', enabled: true, opacity: 0.35, blendMode: 'overlay', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#e11d2e' }, { offset: 1, color: '#111827' }] } }] },
      { id: 'rmv_pic', type: 'playerAvatar', name: 'Photo', x: 40, y: 40, w: 520, h: 680, src: '/def_char.avif', fallbackSrc: '/def_char.avif', bind: { src: { path: 'derived.matchFraggers[0].picUrl' } }, style: { radius: 12, objectFit: 'cover' } },
      txt({ id: 'rmv_label', name: 'Label', x: 620, y: 50, w: 740, h: 60, text: 'MATCH MVP', style: { fontSize: 44, fontWeight: 900, color: T('accent'), letterSpacing: 10 } }),
      txt({ id: 'rmv_name', name: 'Player', x: 620, y: 120, w: 740, h: 100, bind: { text: { path: 'derived.matchFraggers[0].playerName', format: 'upper', fallback: 'PLAYER' } }, style: { fontSize: 84, fontWeight: 900 } }),
      { id: 'rmv_tlogo', type: 'teamLogo', name: 'Team logo', x: 620, y: 230, w: 70, h: 70, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'derived.matchFraggers[0].teamLogo' } } },
      txt({ id: 'rmv_team', name: 'Team', x: 704, y: 230, w: 650, h: 70, bind: { text: { path: 'derived.matchFraggers[0].teamName', format: 'upper', fallback: '' } }, style: { fontSize: 32, fontWeight: 700, color: T('muted'), letterSpacing: 4 } }),
      ...([['KILLS', 'totalKills', 0], ['DAMAGE', 'totalDamage', 1], ['HEADSHOTS', 'totalHeadshots', 2], ['KNOCKS', 'totalKnockouts', 3]] as const).flatMap(([label, field, i]) => [
        { id: `rmv_box${i}`, type: 'rect' as const, name: `${label} box`, x: 620 + (i % 2) * 370, y: 340 + Math.floor(i / 2) * 190, w: 350, h: 170, style: { fill: 'rgba(255,255,255,0.06)', radius: 10 } },
        txt({ id: `rmv_v${i}`, name: `${label} value`, x: 620 + (i % 2) * 370, y: 360 + Math.floor(i / 2) * 190, w: 350, h: 90, bind: { text: { path: `derived.matchFraggers[0].${field}`, format: 'number', fallback: 0 } }, style: { fontSize: 72, fontWeight: 900, align: 'center', color: T('accent') } }),
        txt({ id: `rmv_l${i}`, name: `${label} label`, x: 620 + (i % 2) * 370, y: 450 + Math.floor(i / 2) * 190, w: 350, h: 40, text: label, style: { fontSize: 22, fontWeight: 700, align: 'center', color: T('muted'), letterSpacing: 6 } }),
      ]),
    ],
  }],
};

// 13 ─ Domination alert (in → stay → out) ────────────────────────────────────
const dominationAlert: Template = {
  id: 'rb-domination-alert', name: 'Domination Alert (in · stay · out)', source: 'Theme6 · Dominator',
  description: 'Drops in when a player reaches 3 kills, stays 6 seconds, then leaves by itself.',
  elements: [lifecycle({
    id: 'rda', type: 'group', name: 'Domination alert', x: 660, y: 120, w: 600, h: 130,
    visibleWhen: { path: 'live.killLeader.killNum', op: 'greaterOrEqual', value: 3 },
    children: [
      { id: 'rda_bg', type: 'rect', name: 'Panel', x: 0, y: 0, w: 600, h: 130, style: { fill: PANEL, radius: 10 }, effects: [{ type: 'outerGlow', enabled: true, color: '#facc15', opacity: 0.6, size: 16 }] },
      { id: 'rda_band', type: 'rect', name: 'Gold band', x: 0, y: 0, w: 12, h: 130, style: { fill: T('accent'), radius: 4 } },
      { id: 'rda_pic', type: 'playerAvatar', name: 'Photo', x: 28, y: 15, w: 100, h: 100, src: '/def_char.avif', fallbackSrc: '/def_char.avif', bind: { src: { path: 'live.killLeader.picUrl' } }, mask: { shape: 'ellipse' } },
      txt({ id: 'rda_label', name: 'Label', x: 146, y: 12, w: 330, h: 30, text: 'DOMINATING', style: { fontSize: 18, fontWeight: 900, color: T('accent'), letterSpacing: 8 } }),
      txt({ id: 'rda_name', name: 'Player', x: 146, y: 40, w: 330, h: 50, bind: { text: { path: 'live.killLeader.playerName', format: 'upper', fallback: 'PLAYER' } }, style: { fontSize: 36, fontWeight: 900 } }),
      txt({ id: 'rda_team', name: 'Team', x: 146, y: 88, w: 330, h: 28, bind: { text: { path: 'live.killLeader.teamTag', format: 'upper', fallback: '' } }, style: { fontSize: 18, fontWeight: 700, color: T('muted'), letterSpacing: 4 } }),
      txt({ id: 'rda_kills', name: 'Kills', x: 470, y: 22, w: 110, h: 70, bind: { text: { path: 'live.killLeader.killNum', fallback: 0 } }, style: { fontSize: 64, fontWeight: 900, align: 'right', color: T('accent') } }),
      txt({ id: 'rda_kl', name: 'Kills label', x: 470, y: 90, w: 110, h: 26, text: 'KILLS', style: { fontSize: 16, fontWeight: 700, align: 'right', color: T('muted'), letterSpacing: 4 } }),
    ],
  }, 'dropIn', 6, 'liftOut')],
};

// 14 ─ Match intro (one-off: in → stay → out) ─────────────────────────────────
const matchIntro: Template = {
  id: 'rb-match-intro', name: 'Match Intro (in · stay · out)', source: 'Theme6 · Intro',
  description: 'A title card when the overlay loads: match number and map zoom in, stay 5 seconds, fade away.',
  elements: [lifecycle({
    id: 'rmi', type: 'group', name: 'Match intro', x: 460, y: 390, w: 1000, h: 300,
    children: [
      { id: 'rmi_bg', type: 'rect', name: 'Panel', x: 0, y: 0, w: 1000, h: 300, style: { fill: PANEL, radius: 14 }, effects: [{ type: 'stroke', enabled: true, color: '#ffffff', opacity: 0.1, size: 1, position: 'inside' }, { type: 'dropShadow', enabled: true, color: '#000000', opacity: 0.6, x: 0, y: 14, blur: 36 }] },
      { id: 'rmi_bar', type: 'rect', name: 'Accent bar', x: 0, y: 0, w: 1000, h: 10, style: { fill: T('primary'), radius: 14 } },
      txt({ id: 'rmi_tour', name: 'Tournament', x: 40, y: 34, w: 920, h: 44, bind: { text: { path: 'tournament.tournamentName', format: 'upper', fallback: 'TOURNAMENT' } }, style: { fontSize: 28, fontWeight: 800, align: 'center', color: T('muted'), letterSpacing: 8 } }),
      txt({ id: 'rmi_match', name: 'Match', x: 40, y: 84, w: 920, h: 120, bind: { text: { path: 'match.matchNo', prefix: 'MATCH ', fallback: 'MATCH' } }, style: { fontSize: 110, fontWeight: 900, align: 'center' } }),
      txt({ id: 'rmi_map', name: 'Map', x: 40, y: 210, w: 920, h: 60, bind: { text: { path: 'live.mapName', format: 'upper', fallback: '' } }, style: { fontSize: 44, fontWeight: 800, align: 'center', color: T('accent'), letterSpacing: 10 } }),
    ],
  }, 'zoomIn', 5, 'fadeOut')],
};

export const REBUILT_TEMPLATES: Template[] = [
  lowerThird, upperThird, eliminationAlert, recallBanner, killFeed, liveStats,
  liveFrags, dominator, overallStandings, matchFraggers, wwcd, mvp, dominationAlert, matchIntro,
];
