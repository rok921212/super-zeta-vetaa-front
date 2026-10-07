// Editable versions of the overlay types that otherwise only exist as
// hand-coded theme graphics: post-match tables and head-to-heads, awards and
// pre-match screens. With templates/index.ts and templates/rebuilt.ts this
// gives every overlay type in DisplayHud a version made of ordinary layers.
//
// Each layer keeps what makes it work: its data binding (the same derived.*
// values the themes compute), its fallback, its formatting and its entrance.
// Change the look of any layer, or delete it, and the others still fill in.
// Colours and the font follow the layout theme.
//
// One neutral look per overlay type, not a copy of each of the eight themes.
// Validated in CI (templates.test.ts) and drawn on simulation data (views.test.tsx).

import type { LayoutElement, TimelineClip } from '../schema/layoutTypes.ts';
import type { Template } from './index.ts';

const T = (k: string) => ({ ref: `theme.colors.${k}` });
const FONT = { ref: 'theme.typography.fontFamily' };
const PANEL = 'rgba(11,11,15,0.92)';
const SOFT = 'rgba(255,255,255,0.06)';
type El = Partial<LayoutElement> & { id: string };
const txt = (over: El): LayoutElement => ({ type: 'text', x: 0, y: 0, w: 100, h: 40, ...over, style: { color: '#ffffff', fontFamily: FONT, ...(over.style || {}) } } as LayoutElement);
const box = (over: El): LayoutElement => ({ type: 'rect', x: 0, y: 0, w: 100, h: 100, ...over, style: { fill: SOFT, radius: 8, ...(over.style || {}) } } as LayoutElement);
const logo = (over: El, path: string): LayoutElement => ({ type: 'teamLogo', x: 0, y: 0, w: 80, h: 80, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path } }, ...over } as LayoutElement);
const photo = (over: El, path: string): LayoutElement => ({ type: 'playerAvatar', x: 0, y: 0, w: 200, h: 200, src: '/def_char.avif', fallbackSrc: '/def_char.avif', bind: { src: { path } }, ...over, style: { radius: 8, objectFit: 'cover', ...(over.style || {}) } } as LayoutElement);
const bound = (path: string, extra: Record<string, unknown> = {}) => ({ text: { path, ...extra } });

const enter = (axis: 'x' | 'y', from: number, to: number, ms = 700): TimelineClip => ({
  id: 'enter', name: 'Enter', duration: ms, trigger: { type: 'enter' }, retrigger: 'restart',
  tracks: [
    { prop: axis, keyframes: [{ t: 0, value: from, ease: 'easeOut' }, { t: ms, value: to }] },
    { prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: Math.round(ms / 2), value: 1 }] },
  ],
});

/** A full-screen board: backdrop, title, a line with tournament · round, then `children`. */
const board = (p: string, name: string, title: string, children: LayoutElement[]): LayoutElement => ({
  id: p, type: 'group', name, x: 110, y: 60, w: 1700, h: 960, timeline: { clips: [enter('y', 130, 60)] },
  children: [
    box({ id: `${p}_bg`, name: 'Backdrop', w: 1700, h: 960, style: { fill: 'rgba(11,11,15,0.88)', radius: 12 } }),
    box({ id: `${p}_bar`, name: 'Accent bar', x: 40, y: 30, w: 10, h: 96, style: { fill: T('primary'), radius: 4 } }),
    txt({ id: `${p}_title`, name: 'Title', x: 70, y: 22, w: 1100, h: 70, text: title, style: { fontSize: 56, fontWeight: 900, letterSpacing: 4 } }),
    txt({ id: `${p}_sub`, name: 'Tournament', x: 70, y: 88, w: 700, h: 36, bind: bound('tournament.tournamentName', { format: 'upper', fallback: '' }), style: { fontSize: 22, fontWeight: 700, color: T('muted'), letterSpacing: 4 } }),
    txt({ id: `${p}_round`, name: 'Round', x: 1060, y: 40, w: 600, h: 36, bind: bound('round.roundName', { format: 'upper', fallback: '' }), style: { fontSize: 24, fontWeight: 800, align: 'right' } }),
    txt({ id: `${p}_match`, name: 'Match', x: 1060, y: 80, w: 600, h: 36, bind: bound('match.matchNo', { prefix: 'MATCH ', fallback: '' }), style: { fontSize: 22, fontWeight: 700, align: 'right', color: T('accent') } }),
    ...children,
  ],
} as LayoutElement);

/** Label over value, for a stat. */
const stat = (id: string, x: number, y: number, w: number, label: string, path: string, size = 48): LayoutElement[] => [
  box({ id: `${id}_box`, name: `${label} box`, x, y, w, h: size + 62 }),
  txt({ id: `${id}_v`, name: `${label} value`, x, y: y + 8, w, h: size + 14, bind: bound(path, { format: 'number', fallback: 0 }), style: { fontSize: size, fontWeight: 900, align: 'center', color: T('accent') } }),
  txt({ id: `${id}_l`, name: `${label} label`, x, y: y + size + 22, w, h: 30, text: label, style: { fontSize: 16, fontWeight: 700, align: 'center', color: T('muted'), letterSpacing: 3 } }),
];

// ── Post match · this match ──────────────────────────────────────────────────
const matchData: Template = {
  id: 'vw-match-data', name: 'Match Standings (16)', source: 'Match Data',
  description: 'This match’s table in two columns: rank, logo, team, place points, kills and total.',
  elements: [board('vmd', 'Match standings', 'MATCH STANDINGS', [{
    id: 'vmd_rows', type: 'repeater', name: 'Rows', x: 40, y: 150, w: 1620, h: 790,
    repeater: { source: 'derived.matchStandings', limit: 16, direction: 'grid', columns: 2, itemWidth: 800, itemHeight: 90, gap: 8 },
    children: [
      box({ id: 'vmd_row', name: 'Row', w: 800, h: 90, style: { radius: 6 } }),
      box({ id: 'vmd_rankbg', name: 'Rank box', w: 70, h: 90, style: { fill: T('primary'), radius: 6 } }),
      txt({ id: 'vmd_rank', name: 'Rank', w: 70, h: 90, bind: bound('rank'), style: { fontSize: 34, fontWeight: 900, align: 'center' } }),
      logo({ id: 'vmd_logo', name: 'Logo', x: 84, y: 13, w: 64, h: 64 }, 'item.teamLogo'),
      txt({ id: 'vmd_team', name: 'Team', x: 160, w: 330, h: 90, bind: bound('item.teamName', { format: 'upper' }), style: { fontSize: 26, fontWeight: 800 } }),
      txt({ id: 'vmd_place', name: 'Place points', x: 500, w: 90, h: 90, bind: bound('item.placePoints', { fallback: 0 }), style: { fontSize: 24, fontWeight: 800, align: 'center', color: T('muted') } }),
      txt({ id: 'vmd_kills', name: 'Kills', x: 595, w: 90, h: 90, bind: bound('item.totalKills', { fallback: 0 }), style: { fontSize: 24, fontWeight: 800, align: 'center' } }),
      txt({ id: 'vmd_total', name: 'Total', x: 690, w: 100, h: 90, bind: bound('item.total', { fallback: 0 }), style: { fontSize: 34, fontWeight: 900, align: 'center', color: T('accent') } }),
    ],
  } as LayoutElement])],
};

const matchSummary: Template = {
  id: 'vw-match-summary', name: 'Match Summary', source: 'Match Summary',
  description: 'The match in numbers (eliminations, knocks, headshots, damage, assists) with the winning team and the top fragger.',
  elements: [board('vms', 'Match summary', 'MATCH SUMMARY', [
    ...stat('vms_el', 40, 160, 310, 'ELIMINATIONS', 'derived.matchTotals.totalEliminations', 72),
    ...stat('vms_kn', 370, 160, 310, 'KNOCKS', 'derived.matchTotals.totalKnockouts', 72),
    ...stat('vms_hs', 700, 160, 310, 'HEADSHOTS', 'derived.matchTotals.totalHeadshots', 72),
    ...stat('vms_dm', 1030, 160, 310, 'DAMAGE', 'derived.matchTotals.totalDamage', 72),
    ...stat('vms_as', 1360, 160, 300, 'ASSISTS', 'derived.matchTotals.totalAssists', 72),
    box({ id: 'vms_win', name: 'Winner panel', x: 40, y: 330, w: 800, h: 600, style: { fill: PANEL } }),
    txt({ id: 'vms_win_l', name: 'Winner label', x: 40, y: 350, w: 800, h: 44, text: 'WINNER', style: { fontSize: 28, fontWeight: 800, align: 'center', color: T('muted'), letterSpacing: 8 } }),
    logo({ id: 'vms_win_logo', name: 'Winner logo', x: 290, y: 410, w: 300, h: 300 }, 'derived.matchStandings[0].teamLogo'),
    txt({ id: 'vms_win_name', name: 'Winner team', x: 40, y: 730, w: 800, h: 80, bind: bound('derived.matchStandings[0].teamName', { format: 'upper', fallback: 'WINNER' }), style: { fontSize: 54, fontWeight: 900, align: 'center', color: T('accent') } }),
    txt({ id: 'vms_win_k', name: 'Winner kills', x: 40, y: 820, w: 800, h: 50, bind: bound('derived.matchStandings[0].totalKills', { suffix: ' ELIMINATIONS', fallback: '' }), style: { fontSize: 26, fontWeight: 700, align: 'center' } }),
    box({ id: 'vms_top', name: 'Top fragger panel', x: 860, y: 330, w: 800, h: 600, style: { fill: PANEL } }),
    txt({ id: 'vms_top_l', name: 'Top fragger label', x: 860, y: 350, w: 800, h: 44, text: 'TOP FRAGGER', style: { fontSize: 28, fontWeight: 800, align: 'center', color: T('muted'), letterSpacing: 8 } }),
    photo({ id: 'vms_top_pic', name: 'Top fragger photo', x: 1110, y: 410, w: 300, h: 300 }, 'derived.matchFraggers[0].picUrl'),
    txt({ id: 'vms_top_name', name: 'Top fragger', x: 860, y: 730, w: 800, h: 80, bind: bound('derived.matchFraggers[0].playerName', { format: 'upper', fallback: 'PLAYER' }), style: { fontSize: 54, fontWeight: 900, align: 'center', color: T('accent') } }),
    txt({ id: 'vms_top_k', name: 'Top fragger kills', x: 860, y: 820, w: 800, h: 50, bind: bound('derived.matchFraggers[0].totalKills', { suffix: ' KILLS', fallback: '' }), style: { fontSize: 26, fontWeight: 700, align: 'center' } }),
  ])],
};

const wwcdStats: Template = {
  id: 'vw-wwcd-stats', name: 'WWCD Stats', source: 'WWCD Stats',
  description: 'The winning team’s match: team totals and a card per player with kills, damage and knocks.',
  elements: [board('vws', 'WWCD stats', 'WINNER STATS', [
    logo({ id: 'vws_logo', name: 'Winner logo', x: 40, y: 160, w: 220, h: 220 }, 'derived.matchStandings[0].teamLogo'),
    txt({ id: 'vws_team', name: 'Winner team', x: 290, y: 170, w: 700, h: 90, bind: bound('derived.matchStandings[0].teamName', { format: 'upper', fallback: 'WINNER' }), style: { fontSize: 64, fontWeight: 900, color: T('accent') } }),
    txt({ id: 'vws_tag', name: 'Winner tag', x: 290, y: 262, w: 700, h: 44, bind: bound('derived.matchStandings[0].teamTag', { format: 'upper', fallback: '' }), style: { fontSize: 28, fontWeight: 700, color: T('muted'), letterSpacing: 6 } }),
    ...stat('vws_k', 1010, 170, 200, 'KILLS', 'derived.matchStandings[0].totalKills', 60),
    ...stat('vws_d', 1230, 170, 220, 'DAMAGE', 'derived.matchStandings[0].totalDamage', 60),
    ...stat('vws_n', 1470, 170, 190, 'KNOCKS', 'derived.matchStandings[0].totalKnockouts', 60),
    {
      id: 'vws_team_rep', type: 'repeater', name: 'Winner', x: 40, y: 410, w: 1620, h: 520,
      repeater: { source: 'derived.matchStandings', limit: 1, direction: 'column', itemWidth: 1620, itemHeight: 520 },
      children: [{
        id: 'vws_players', type: 'repeater', name: 'Players', x: 0, y: 0, w: 1620, h: 520,
        repeater: { source: 'item.players', limit: 4, direction: 'row', itemWidth: 390, itemHeight: 520, gap: 20 },
        children: [
          box({ id: 'vws_card', name: 'Card', w: 390, h: 520, style: { fill: PANEL, radius: 12 } }),
          photo({ id: 'vws_pic', name: 'Photo', x: 20, y: 20, w: 350, h: 280 }, 'item.picUrl'),
          txt({ id: 'vws_pname', name: 'Player', x: 20, y: 310, w: 350, h: 50, bind: bound('item.playerName', { format: 'upper' }), style: { fontSize: 30, fontWeight: 900, align: 'center' } }),
          txt({ id: 'vws_pk', name: 'Kills', x: 20, y: 370, w: 116, h: 70, bind: bound('item.killNum', { fallback: 0 }), style: { fontSize: 50, fontWeight: 900, align: 'center', color: T('accent') } }),
          txt({ id: 'vws_pkl', name: 'Kills label', x: 20, y: 444, w: 116, h: 28, text: 'KILLS', style: { fontSize: 15, fontWeight: 700, align: 'center', color: T('muted') } }),
          txt({ id: 'vws_pd', name: 'Damage', x: 137, y: 370, w: 116, h: 70, bind: bound('item.damage', { format: 'number', fallback: 0 }), style: { fontSize: 36, fontWeight: 900, align: 'center' } }),
          txt({ id: 'vws_pdl', name: 'Damage label', x: 137, y: 444, w: 116, h: 28, text: 'DAMAGE', style: { fontSize: 15, fontWeight: 700, align: 'center', color: T('muted') } }),
          txt({ id: 'vws_pn', name: 'Knocks', x: 254, y: 370, w: 116, h: 70, bind: bound('item.knockouts', { fallback: 0 }), style: { fontSize: 36, fontWeight: 900, align: 'center' } }),
          txt({ id: 'vws_pnl', name: 'Knocks label', x: 254, y: 444, w: 116, h: 28, text: 'KNOCKS', style: { fontSize: 15, fontWeight: 700, align: 'center', color: T('muted') } }),
        ],
      }],
    } as LayoutElement,
  ])],
};

/** Two sides and a column of compared stats between them. */
const versus = (p: string, name: string, title: string, side: (i: 0 | 1, x: number) => LayoutElement[], rows: Array<[string, string]>, source: string): LayoutElement =>
  board(p, name, title, [
    ...side(0, 40),
    ...side(1, 1160),
    txt({ id: `${p}_vs`, name: 'VS', x: 700, y: 170, w: 300, h: 110, text: 'VS', style: { fontSize: 96, fontWeight: 900, align: 'center', color: T('primary') } }),
    ...rows.flatMap(([label, field], i) => [
      box({ id: `${p}_r${i}`, name: `${label} row`, x: 560, y: 320 + i * 118, w: 580, h: 104 }),
      txt({ id: `${p}_a${i}`, name: `${label} left`, x: 570, y: 320 + i * 118, w: 170, h: 104, bind: bound(`${source}[0].${field}`, { format: 'number', fallback: 0 }), style: { fontSize: 46, fontWeight: 900, align: 'center', color: T('accent') } }),
      txt({ id: `${p}_l${i}`, name: `${label} label`, x: 740, y: 320 + i * 118, w: 220, h: 104, text: label, style: { fontSize: 20, fontWeight: 700, align: 'center', color: T('muted'), letterSpacing: 3 } }),
      txt({ id: `${p}_b${i}`, name: `${label} right`, x: 960, y: 320 + i * 118, w: 170, h: 104, bind: bound(`${source}[1].${field}`, { format: 'number', fallback: 0 }), style: { fontSize: 46, fontWeight: 900, align: 'center', color: T('accent') } }),
    ]),
  ]);

const playerH2H: Template = {
  id: 'vw-player-h2h', name: 'Player Head to Head', source: 'Player H2H',
  description: 'The match’s two best fraggers side by side: photo, team, and kills, damage, headshots, knocks and assists compared.',
  elements: [versus('vph', 'Player head to head', 'PLAYER HEAD TO HEAD', (i, x) => [
    box({ id: `vph_card${i}`, name: `Player ${i + 1} card`, x, y: 160, w: 500, h: 770, style: { fill: PANEL, radius: 12 } }),
    photo({ id: `vph_pic${i}`, name: `Player ${i + 1} photo`, x: x + 30, y: 190, w: 440, h: 500 }, `derived.matchFraggers[${i}].picUrl`),
    txt({ id: `vph_name${i}`, name: `Player ${i + 1} name`, x, y: 710, w: 500, h: 70, bind: bound(`derived.matchFraggers[${i}].playerName`, { format: 'upper', fallback: 'PLAYER' }), style: { fontSize: 46, fontWeight: 900, align: 'center' } }),
    logo({ id: `vph_logo${i}`, name: `Player ${i + 1} team logo`, x: x + 210, y: 790, w: 80, h: 80 }, `derived.matchFraggers[${i}].teamLogo`),
    txt({ id: `vph_team${i}`, name: `Player ${i + 1} team`, x, y: 876, w: 500, h: 40, bind: bound(`derived.matchFraggers[${i}].teamName`, { format: 'upper', fallback: '' }), style: { fontSize: 22, fontWeight: 700, align: 'center', color: T('muted'), letterSpacing: 4 } }),
  ], [['KILLS', 'totalKills'], ['DAMAGE', 'totalDamage'], ['HEADSHOTS', 'totalHeadshots'], ['KNOCKS', 'totalKnockouts'], ['ASSISTS', 'totalAssists']], 'derived.matchFraggers')],
};

const teamH2H: Template = {
  id: 'vw-team-h2h', name: 'Team Head to Head', source: 'Team H2H',
  description: 'The match’s top two teams side by side: logo, name, and total, kills, damage, knocks and headshots compared.',
  elements: [versus('vth', 'Team head to head', 'TEAM HEAD TO HEAD', (i, x) => [
    box({ id: `vth_card${i}`, name: `Team ${i + 1} card`, x, y: 160, w: 500, h: 770, style: { fill: PANEL, radius: 12 } }),
    logo({ id: `vth_logo${i}`, name: `Team ${i + 1} logo`, x: x + 70, y: 220, w: 360, h: 360 }, `derived.matchStandings[${i}].teamLogo`),
    txt({ id: `vth_name${i}`, name: `Team ${i + 1} name`, x, y: 620, w: 500, h: 80, bind: bound(`derived.matchStandings[${i}].teamName`, { format: 'upper', fallback: 'TEAM' }), style: { fontSize: 46, fontWeight: 900, align: 'center' } }),
    txt({ id: `vth_tag${i}`, name: `Team ${i + 1} tag`, x, y: 704, w: 500, h: 44, bind: bound(`derived.matchStandings[${i}].teamTag`, { format: 'upper', fallback: '' }), style: { fontSize: 26, fontWeight: 700, align: 'center', color: T('muted'), letterSpacing: 6 } }),
    txt({ id: `vth_pos${i}`, name: `Team ${i + 1} place`, x, y: 780, w: 500, h: 110, text: `#${i + 1}`, style: { fontSize: 90, fontWeight: 900, align: 'center', color: T('primary') } }),
  ], [['TOTAL', 'total'], ['KILLS', 'totalKills'], ['DAMAGE', 'totalDamage'], ['KNOCKS', 'totalKnockouts'], ['HEADSHOTS', 'totalHeadshots']], 'derived.matchStandings')],
};

/** Cards for a list of fraggers: photo, name, team, kills and damage. */
const fraggerCards = (p: string, source: string, limit: number, columns: number, w: number, h: number): LayoutElement => ({
  id: `${p}_cards`, type: 'repeater', name: 'Player cards', x: 40, y: 150, w: 1620, h: 790,
  repeater: { source, limit, direction: 'grid', columns, itemWidth: w, itemHeight: h, gap: 16 },
  children: [
    box({ id: `${p}_card`, name: 'Card', w, h, style: { fill: PANEL, radius: 12 } }),
    photo({ id: `${p}_pic`, name: 'Photo', x: 14, y: 14, w: w - 28, h: h - 170 }, 'item.picUrl'),
    txt({ id: `${p}_rank`, name: 'Rank', x: 22, y: 18, w: 90, h: 50, bind: bound('rank', { prefix: '#' }), style: { fontSize: 34, fontWeight: 900, color: T('accent') } }),
    txt({ id: `${p}_name`, name: 'Player', x: 14, y: h - 150, w: w - 28, h: 40, bind: bound('item.playerName', { format: 'upper' }), style: { fontSize: 26, fontWeight: 900, align: 'center' } }),
    txt({ id: `${p}_team`, name: 'Team', x: 14, y: h - 112, w: w - 28, h: 28, bind: bound('item.teamTag', { format: 'upper', fallback: '' }), style: { fontSize: 16, fontWeight: 700, align: 'center', color: T('muted'), letterSpacing: 4 } }),
    txt({ id: `${p}_kills`, name: 'Kills', x: 14, y: h - 82, w: (w - 28) / 2, h: 50, bind: bound('item.totalKills', { fallback: 0 }), style: { fontSize: 40, fontWeight: 900, align: 'center', color: T('accent') } }),
    txt({ id: `${p}_kl`, name: 'Kills label', x: 14, y: h - 34, w: (w - 28) / 2, h: 24, text: 'KILLS', style: { fontSize: 13, fontWeight: 700, align: 'center', color: T('muted') } }),
    txt({ id: `${p}_dmg`, name: 'Damage', x: w / 2, y: h - 82, w: (w - 28) / 2, h: 50, bind: bound('item.totalDamage', { format: 'number', fallback: 0 }), style: { fontSize: 30, fontWeight: 900, align: 'center' } }),
    txt({ id: `${p}_dl`, name: 'Damage label', x: w / 2, y: h - 34, w: (w - 28) / 2, h: 24, text: 'DAMAGE', style: { fontSize: 13, fontWeight: 700, align: 'center', color: T('muted') } }),
  ],
} as LayoutElement);

const playerSummary: Template = {
  id: 'vw-player-summary', name: 'Player Summary', source: 'Player Summary',
  description: 'This match’s best four players as large cards: photo, team, kills and damage.',
  elements: [board('vps', 'Player summary', 'PLAYER SUMMARY', [fraggerCards('vps', 'derived.matchFraggers', 4, 4, 393, 790)])],
};

// ── Post match · overall ─────────────────────────────────────────────────────
const overallFrags: Template = {
  id: 'vw-overall-frags', name: 'Overall Fraggers (top 10)', source: 'Overall Frags',
  description: 'The tournament’s ten best fraggers across every match: photo, team, kills and damage.',
  elements: [board('vof', 'Overall fraggers', 'OVERALL FRAGGERS', [fraggerCards('vof', 'derived.fraggers', 10, 5, 311, 387)])],
};

// ── Awards ───────────────────────────────────────────────────────────────────
const podium = (p: string, id: string, name: string, title: string, index: number, description: string): Template => ({
  id, name, source: name, description,
  elements: [{
    id: p, type: 'group', name, x: 260, y: 90, w: 1400, h: 900, timeline: { clips: [enter('y', 200, 90, 900)] },
    children: [
      txt({ id: `${p}_title`, name: 'Title', w: 1400, h: 120, text: title, style: { fontSize: 96, fontWeight: 900, align: 'center', letterSpacing: 8, color: T('accent') }, effects: [{ type: 'dropShadow', enabled: true, color: '#000000', opacity: 0.7, x: 0, y: 6, blur: 16 }] }),
      txt({ id: `${p}_event`, name: 'Tournament', y: 118, w: 1400, h: 44, bind: bound('tournament.tournamentName', { format: 'upper', fallback: '' }), style: { fontSize: 28, fontWeight: 700, align: 'center', color: T('muted'), letterSpacing: 8 } }),
      logo({ id: `${p}_logo`, name: 'Team logo', x: 500, y: 190, w: 400, h: 400, effects: [{ type: 'outerGlow', enabled: true, color: '#facc15', opacity: 0.55, size: 34 }] }, `derived.overallStandings[${index}].teamLogo`),
      txt({ id: `${p}_team`, name: 'Team', y: 610, w: 1400, h: 100, bind: bound(`derived.overallStandings[${index}].teamName`, { format: 'upper', fallback: 'TEAM' }), style: { fontSize: 84, fontWeight: 900, align: 'center' } }),
      ...stat(`${p}_tot`, 230, 730, 300, 'TOTAL POINTS', `derived.overallStandings[${index}].totalScore`, 64),
      ...stat(`${p}_kil`, 550, 730, 300, 'ELIMINATIONS', `derived.overallStandings[${index}].totalKills`, 64),
      ...stat(`${p}_win`, 870, 730, 300, 'WWCD', `derived.overallStandings[${index}].wwcd`, 64),
    ],
  } as LayoutElement],
});

const champions = podium('vch', 'vw-champions', 'Champions', 'CHAMPIONS', 0, 'The tournament winner: logo, name, total points, eliminations and chicken dinners.');
const firstRunnerUp = podium('vr1', 'vw-first-runner-up', '1st Runner Up', '1ST RUNNER UP', 1, 'Second place overall: logo, name, total points, eliminations and chicken dinners.');
const secondRunnerUp = podium('vr2', 'vw-second-runner-up', '2nd Runner Up', '2ND RUNNER UP', 2, 'Third place overall: logo, name, total points, eliminations and chicken dinners.');

const eventMvp: Template = {
  id: 'vw-event-mvp', name: 'Event MVP', source: 'Event MVP',
  description: 'The tournament’s MVP across every match: photo, team and four key stats.',
  elements: [{
    id: 'vem', type: 'group', name: 'Event MVP', x: 260, y: 160, w: 1400, h: 760, timeline: { clips: [enter('x', -1500, 260, 800)] },
    children: [
      box({ id: 'vem_bg', name: 'Panel', w: 1400, h: 760, style: { fill: PANEL, radius: 16 } }),
      photo({ id: 'vem_pic', name: 'Photo', x: 40, y: 40, w: 520, h: 680, style: { radius: 12 } }, 'derived.fraggers[0].picUrl'),
      txt({ id: 'vem_label', name: 'Label', x: 620, y: 50, w: 740, h: 60, text: 'EVENT MVP', style: { fontSize: 44, fontWeight: 900, color: T('accent'), letterSpacing: 10 } }),
      txt({ id: 'vem_name', name: 'Player', x: 620, y: 120, w: 740, h: 100, bind: bound('derived.fraggers[0].playerName', { format: 'upper', fallback: 'PLAYER' }), style: { fontSize: 84, fontWeight: 900 } }),
      logo({ id: 'vem_tlogo', name: 'Team logo', x: 620, y: 230, w: 70, h: 70 }, 'derived.fraggers[0].teamLogo'),
      txt({ id: 'vem_team', name: 'Team', x: 704, y: 230, w: 650, h: 70, bind: bound('derived.fraggers[0].teamName', { format: 'upper', fallback: '' }), style: { fontSize: 32, fontWeight: 700, color: T('muted'), letterSpacing: 4 } }),
      ...stat('vem_k', 620, 340, 350, 'KILLS', 'derived.fraggers[0].totalKills', 72),
      ...stat('vem_d', 990, 340, 350, 'DAMAGE', 'derived.fraggers[0].totalDamage', 72),
      ...stat('vem_h', 620, 530, 350, 'HEADSHOTS', 'derived.fraggers[0].totalHeadshots', 72),
      ...stat('vem_n', 990, 530, 350, 'KNOCKS', 'derived.fraggers[0].totalKnockouts', 72),
    ],
  } as LayoutElement],
};

// ── Pre-match ────────────────────────────────────────────────────────────────
const upNext: Template = {
  id: 'vw-up-next', name: 'Up Next', source: 'Up Next',
  description: 'A title card for the coming match: tournament logo and name, round, match number and map.',
  elements: [{
    id: 'vun', type: 'group', name: 'Up next', x: 360, y: 260, w: 1200, h: 560, timeline: { clips: [enter('y', 340, 260, 800)] },
    children: [
      box({ id: 'vun_bg', name: 'Panel', w: 1200, h: 560, style: { fill: PANEL, radius: 16 } }),
      box({ id: 'vun_bar', name: 'Accent bar', w: 1200, h: 12, style: { fill: T('primary'), radius: 6 } }),
      logo({ id: 'vun_logo', name: 'Tournament logo', x: 60, y: 80, w: 240, h: 240 }, 'tournament.torLogo'),
      txt({ id: 'vun_label', name: 'Label', x: 340, y: 70, w: 800, h: 60, text: 'UP NEXT', style: { fontSize: 44, fontWeight: 900, color: T('accent'), letterSpacing: 12 } }),
      txt({ id: 'vun_match', name: 'Match', x: 340, y: 130, w: 800, h: 130, bind: bound('match.matchNo', { prefix: 'MATCH ', fallback: 'MATCH' }), style: { fontSize: 110, fontWeight: 900 } }),
      txt({ id: 'vun_map', name: 'Map', x: 340, y: 262, w: 800, h: 70, bind: bound('match.map', { format: 'upper', fallback: '' }), style: { fontSize: 50, fontWeight: 800, color: T('muted'), letterSpacing: 6 } }),
      txt({ id: 'vun_event', name: 'Tournament', x: 60, y: 400, w: 1080, h: 60, bind: bound('tournament.tournamentName', { format: 'upper', fallback: '' }), style: { fontSize: 40, fontWeight: 800, align: 'center' } }),
      txt({ id: 'vun_round', name: 'Round', x: 60, y: 464, w: 1080, h: 44, bind: bound('round.roundName', { format: 'upper', fallback: '' }), style: { fontSize: 28, fontWeight: 700, align: 'center', color: T('muted'), letterSpacing: 6 } }),
    ],
  } as LayoutElement],
};

const highlightPoints: Template = {
  id: 'vw-highlight-points', name: 'Highlight Points (top 3)', source: 'Highlight Points',
  description: 'The three teams leading the tournament, as large cards with their points, eliminations and chicken dinners.',
  elements: [board('vhp', 'Highlight points', 'POINTS LEADERS', [{
    id: 'vhp_cards', type: 'repeater', name: 'Leaders', x: 40, y: 160, w: 1620, h: 770,
    repeater: { source: 'derived.overallStandings', limit: 3, direction: 'row', itemWidth: 526, itemHeight: 770, gap: 21 },
    children: [
      box({ id: 'vhp_card', name: 'Card', w: 526, h: 770, style: { fill: PANEL, radius: 14 } }),
      txt({ id: 'vhp_rank', name: 'Rank', x: 24, y: 14, w: 160, h: 90, bind: bound('item.rank', { prefix: '#' }), style: { fontSize: 72, fontWeight: 900, color: T('primary') } }),
      logo({ id: 'vhp_logo', name: 'Logo', x: 113, y: 110, w: 300, h: 300 }, 'item.teamLogo'),
      txt({ id: 'vhp_team', name: 'Team', x: 14, y: 430, w: 498, h: 70, bind: bound('item.teamName', { format: 'upper' }), style: { fontSize: 44, fontWeight: 900, align: 'center' } }),
      txt({ id: 'vhp_total', name: 'Total points', x: 14, y: 506, w: 498, h: 120, bind: bound('item.totalScore', { fallback: 0 }), style: { fontSize: 110, fontWeight: 900, align: 'center', color: T('accent') } }),
      txt({ id: 'vhp_total_l', name: 'Points label', x: 14, y: 626, w: 498, h: 34, text: 'POINTS', style: { fontSize: 20, fontWeight: 700, align: 'center', color: T('muted'), letterSpacing: 8 } }),
      txt({ id: 'vhp_kills', name: 'Eliminations', x: 14, y: 680, w: 249, h: 60, bind: bound('item.totalKills', { suffix: ' ELIMS', fallback: 0 }), style: { fontSize: 28, fontWeight: 800, align: 'center' } }),
      txt({ id: 'vhp_wwcd', name: 'WWCD', x: 263, y: 680, w: 249, h: 60, bind: bound('item.wwcd', { suffix: ' WWCD', fallback: 0 }), style: { fontSize: 28, fontWeight: 800, align: 'center' } }),
    ],
  } as LayoutElement])],
};

const slots: Template = {
  id: 'vw-slots', name: 'Slots', source: 'Slots',
  description: 'Every team in the lobby with its slot number, logo and name.',
  elements: [board('vsl', 'Slots', 'TEAM SLOTS', [{
    id: 'vsl_grid', type: 'repeater', name: 'Teams', x: 40, y: 150, w: 1620, h: 790,
    repeater: { source: 'matchData.teams', limit: 24, direction: 'grid', columns: 4, itemWidth: 393, itemHeight: 120, gap: 14 },
    children: [
      box({ id: 'vsl_card', name: 'Card', w: 393, h: 120, style: { fill: PANEL } }),
      box({ id: 'vsl_slotbg', name: 'Slot box', w: 80, h: 120, style: { fill: T('primary') } }),
      txt({ id: 'vsl_slot', name: 'Slot', w: 80, h: 120, bind: bound('item.slot', { format: 'pad2', fallback: '' }), style: { fontSize: 36, fontWeight: 900, align: 'center' } }),
      logo({ id: 'vsl_logo', name: 'Logo', x: 94, y: 20, w: 80, h: 80 }, 'item.teamLogo'),
      txt({ id: 'vsl_team', name: 'Team', x: 186, y: 14, w: 196, h: 56, bind: bound('item.teamName', { format: 'upper' }), style: { fontSize: 22, fontWeight: 800 } }),
      txt({ id: 'vsl_tag', name: 'Tag', x: 186, y: 68, w: 196, h: 36, bind: bound('item.teamTag', { format: 'upper', fallback: '' }), style: { fontSize: 18, fontWeight: 700, color: T('muted'), letterSpacing: 4 } }),
    ],
  } as LayoutElement])],
};

/** Team cards with the names of their players. `photos` adds each player's picture. */
const rosters = (p: string, photos: boolean): LayoutElement => ({
  id: `${p}_grid`, type: 'repeater', name: 'Teams', x: 40, y: 150, w: 1620, h: 790,
  repeater: { source: 'matchData.teams', limit: photos ? 8 : 16, direction: 'grid', columns: 4, itemWidth: 393, itemHeight: photos ? 387 : 187, gap: 14 },
  children: [
    box({ id: `${p}_card`, name: 'Card', w: 393, h: photos ? 387 : 187, style: { fill: PANEL } }),
    logo({ id: `${p}_logo`, name: 'Logo', x: 12, y: 10, w: 54, h: 54 }, 'item.teamLogo'),
    txt({ id: `${p}_team`, name: 'Team', x: 76, y: 10, w: 305, h: 54, bind: bound('item.teamName', { format: 'upper' }), style: { fontSize: 24, fontWeight: 900 } }),
    photos
      ? {
        id: `${p}_players`, type: 'repeater', name: 'Players', x: 12, y: 76, w: 369, h: 300,
        repeater: { source: 'item.players', limit: 4, direction: 'grid', columns: 2, itemWidth: 180, itemHeight: 146, gap: 8 },
        children: [
          photo({ id: `${p}_pic`, name: 'Photo', w: 180, h: 112, style: { radius: 6 } }, 'item.picUrl'),
          txt({ id: `${p}_pname`, name: 'Player', y: 114, w: 180, h: 30, bind: bound('item.playerName', { format: 'upper' }), style: { fontSize: 16, fontWeight: 800, align: 'center' } }),
        ],
      } as LayoutElement
      : {
        id: `${p}_players`, type: 'repeater', name: 'Players', x: 12, y: 72, w: 369, h: 108,
        repeater: { source: 'item.players', limit: 4, direction: 'grid', columns: 2, itemWidth: 180, itemHeight: 50, gap: 8 },
        children: [
          box({ id: `${p}_prow`, name: 'Player row', w: 180, h: 50, style: { radius: 5 } }),
          txt({ id: `${p}_pname`, name: 'Player', x: 8, w: 164, h: 50, bind: bound('item.playerName', { format: 'upper' }), style: { fontSize: 17, fontWeight: 700 } }),
        ],
      } as LayoutElement,
  ],
} as LayoutElement);

const rosterShowcase: Template = {
  id: 'vw-roster-showcase', name: 'Roster Showcase', source: 'Roster Showcase',
  description: 'Every team with its four players named, sixteen teams to a screen.',
  elements: [board('vrs', 'Roster showcase', 'TEAM ROSTERS', [rosters('vrs', false)])],
};

const playerSwitch: Template = {
  id: 'vw-player-switch', name: 'Player Switch', source: 'Player Switch',
  description: 'The line-ups for this match: each team with photos and names of the players it fields.',
  elements: [board('vpw', 'Player switch', 'LINE-UPS', [rosters('vpw', true)])],
};

export const VIEW_TEMPLATES: Template[] = [
  matchData, matchSummary, wwcdStats, playerH2H, teamH2H, playerSummary, overallFrags,
  champions, firstRunnerUp, secondRunnerUp, eventMvp,
  upNext, highlightPoints, slots, rosterShowcase, playerSwitch,
];

/** The DisplayHud view each one fills (editor/templateCatalog.ts). */
export const VIEW_TEMPLATE_SLOTS: Record<string, string> = {
  'vw-match-data': 'MatchData', 'vw-match-summary': 'MatchSummary', 'vw-wwcd-stats': 'WwcdStats', 'vw-player-h2h': 'playerH2H',
  'vw-team-h2h': 'TeamH2H', 'vw-player-summary': 'Achive', 'vw-overall-frags': 'OverallFrags',
  'vw-champions': 'Champions', 'vw-first-runner-up': '1stRunnerUp', 'vw-second-runner-up': '2ndRunnerUp', 'vw-event-mvp': 'EventMvp',
  'vw-up-next': 'CommingUpNext', 'vw-highlight-points': 'highlightPoints', 'vw-slots': 'slots',
  'vw-roster-showcase': 'RosterShowCase', 'vw-player-switch': 'PlayerSwitch',
};
