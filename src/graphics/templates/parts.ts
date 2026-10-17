// Live parts: the pieces the built-in themes are made of — a LiveStats team
// row, alive bars, the top team's photo stack, a dynamic player photo, the
// dead swipe, recall and eliminated looks — as one-click inserts.
//
// Each part is ordinary layers with real bindings and its live behaviour
// already attached as Animate-panel rules (templates/behaviors), so every bit
// of it stays editable. A part says what row it needs (a team or a player);
// the Insert panel drops it into such a list, or wraps it in one.

import type { Condition, LayoutElement } from '../schema/layoutTypes.ts';
import type { Draft } from '../editor/elementFactory.ts';
import type { TriggerContext } from '../editor/animationLibrary.ts';
import { withBehaviors, type BehaviorSpec } from './behaviors.ts';

/** `raw` = a team's own players (`item.players`: liveState / bHasDied); `live` = `live.players` rows (knocked / dead). */
export type PlayerRows = 'raw' | 'live';
export type PartNeeds = 'team' | 'player' | 'none';

export interface Part {
  id: string;
  name: string;
  hint: string;
  /** Short labels on the card: what it reacts to. */
  badges: string[];
  /** The row it reads from: a team row (item.teamTag…), a player row (item.playerName…), or none. */
  needs: PartNeeds;
  build(rows: PlayerRows): Draft;
}

const T = (k: string) => ({ ref: `theme.colors.${k}` });
const FONT = { ref: 'theme.typography.fontFamily' };
const PANEL = 'rgba(17,24,39,0.92)';
/** The tournament's own two colours; the theme colour shows when the tournament has none. */
const TOURNAMENT_GRADIENT = { type: 'linear' as const, angle: 135, stops: [{ offset: 0, color: { ref: 'tournament.primaryColor' } }, { offset: 1, color: { ref: 'tournament.secondaryColor' } }] };

const CTX: Record<PlayerRows, TriggerContext> = {
  raw: { item: { liveState: 0, bHasDied: false, health: 100 } },
  live: { item: { knocked: false, dead: false, healthPct: 100 } },
};

// Conditions that read both kinds of player row.
export const PLAYER_DEAD: Condition = { any: [{ path: 'item.dead', op: 'equals', value: true }, { path: 'item.liveState', op: 'equals', value: 5 }, { path: 'item.bHasDied', op: 'equals', value: true }] };
export const PLAYER_KNOCKED: Condition = { any: [{ path: 'item.knocked', op: 'equals', value: true }, { path: 'item.liveState', op: 'equals', value: 4 }] };
export const TEAM_ELIMINATED: Condition = { path: 'item.isAllDead', op: 'equals', value: true };

const player = (el: Draft, rows: PlayerRows, specs: BehaviorSpec[]): Draft => withBehaviors(el as unknown as LayoutElement, specs, CTX[rows]) as unknown as Draft;
const team = (el: Draft, specs: BehaviorSpec[]): Draft => withBehaviors(el as unknown as LayoutElement, specs) as unknown as Draft;

const txt = (d: Partial<Draft> & Pick<Draft, 'name' | 'x' | 'y' | 'w' | 'h'>): Draft =>
  ({ type: 'text', ...d, style: { color: '#ffffff', fontFamily: FONT, fontWeight: 800, ...(d.style || {}) } } as Draft);

// ── player pieces ───────────────────────────────────────────────────────────

/** One alive bar per player: fills with health, red when knocked, empty when dead. */
function aliveBar(rows: PlayerRows, w = 10, h = 30): Draft {
  return player({
    type: 'rect', name: 'Health bar', x: 0, y: 0, w, h,
    style: { fill: '#ffffff', fillValue: { ref: 'item.health' }, fillMax: { ref: 'item.healthMax' }, fillDirection: 'up', fillTrack: 'rgba(255,255,255,0.18)', radius: 1 },
    styleWhen: [
      { when: PLAYER_KNOCKED, style: { fill: '#ef4444' } },
      { when: PLAYER_DEAD, style: { fillValue: 0 } },
    ],
  } as Draft, rows, [['playerKnocked', 'alertPulse'], ['playerRecalled', 'glow'], ['playerRevived', 'glow']]);
}

function aliveBars(rows: PlayerRows, barW = 10, barH = 30): Draft {
  return {
    type: 'repeater', name: 'Alive bars', x: 0, y: 0, w: barW * 4 + 3 * 3, h: barH,
    repeater: { source: 'item.players', limit: 4, direction: 'row', itemWidth: barW, itemHeight: barH, gap: 3 },
    children: [aliveBar(rows, barW, barH)],
  };
}

/** A photo frame showing the player's picture; the dead swipe, knock pulse and recall glow are built in. */
function playerPhoto(rows: PlayerRows, w = 160, h = 200, withName = true): Draft {
  return player({
    type: 'rect', name: 'Player photo', x: 0, y: 0, w, h,
    bind: {
      src: { path: 'item.picUrl', fallback: '/def_char.png' },
      ...(withName ? { text: { path: 'item.playerName', format: 'upper', fallback: 'PLAYER' } } : {}),
    },
    imageFill: { fit: 'cover', posX: 0.5, posY: 0.2 },
    style: {
      fill: 'rgba(255,255,255,0.06)', radius: 6,
      ...(withName ? { color: '#ffffff', fontFamily: FONT, fontSize: Math.round(w / 9), fontWeight: 800, align: 'center', valign: 'bottom', padding: 6, textShadow: '0 2px 6px rgba(0,0,0,0.9)', textFit: 'shrink' } : {}),
    },
  } as Draft, rows, [['playerDead', 'deadSwipe'], ['playerKnocked', 'alertPulse'], ['playerRecalled', 'glow'], ['playerRevived', 'glow']]);
}

/** A red bar that swipes across when the player dies. */
function deadSlash(w = 160, h = 200): Draft {
  return {
    type: 'rect', name: 'Dead slash', x: -Math.round(w * 0.1), y: Math.round(h / 2 - 7), w: Math.round(w * 1.2), h: 14, rotation: -24,
    style: { fill: '#ef4444', radius: 2 },
    visibleWhen: PLAYER_DEAD,
    timeline: { clips: [{ id: 'swipe', name: 'Swipe in', duration: 320, trigger: { type: 'enter' }, retrigger: 'restart', tracks: [{ prop: 'wipeR', keyframes: [{ t: 0, value: 1, ease: 'easeOutCubic' }, { t: 320, value: 0 }] }] }] },
  } as Draft;
}

// ── team pieces ─────────────────────────────────────────────────────────────

/** A green sweep over a team row that plays when one of its players is recalled. */
function recallSweep(w: number, h: number): Draft {
  return team({ type: 'rect', name: 'Recall sweep', x: 0, y: 0, w, h, style: { fill: 'rgba(34,197,94,0.55)', radius: 4 } } as Draft, [['teamRecall', 'wipeInOutLeft', { hold: 1600 }]]);
}

function eliminatedStamp(w = 220, h = 40): Draft {
  return {
    type: 'rect', name: 'Eliminated stamp', x: 0, y: 0, w, h, rotation: -6, text: 'ELIMINATED',
    style: { fill: 'rgba(220,38,38,0.92)', radius: 4, color: '#ffffff', fontFamily: FONT, fontSize: Math.round(h * 0.55), fontWeight: 900, align: 'center', letterSpacing: 3 },
    visibleWhen: TEAM_ELIMINATED,
    timeline: { clips: [{ id: 'stamp', name: 'Stamp in', duration: 380, trigger: { type: 'enter' }, retrigger: 'restart', tracks: [{ prop: 'scale', keyframes: [{ t: 0, value: 1.8, ease: 'backOut' }, { t: 380, value: 1 }] }, { prop: 'opacity', keyframes: [{ t: 0, value: 0, ease: 'easeOut' }, { t: 200, value: 1 }] }] }] },
  } as Draft;
}

/** The LiveStats row: rank, logo, tag, alive bars, points, kills — dead swipe, recall sweep, kill glow. */
function liveStatsRow(): Draft {
  const rows: PlayerRows = 'raw'; // a team row's players are its own item.players
  const W = 400; const H = 48;
  return team({
    type: 'group', name: 'LiveStats team row', x: 0, y: 0, w: W, h: H,
    children: [
      team({ type: 'rect', name: 'Row background', x: 0, y: 0, w: W, h: H, style: { fill: PANEL, radius: 4 } } as Draft, [['teamKill', 'glow'], ['teamKnock', 'shake']]),
      {
        type: 'rect', name: 'Rank', x: 0, y: 0, w: 40, h: H, bind: { text: { path: 'rank' } },
        style: { fill: T('primary'), gradient: TOURNAMENT_GRADIENT, radius: 4, color: '#ffffff', fontFamily: FONT, fontSize: 22, fontWeight: 800, align: 'center' },
      } as Draft,
      { type: 'teamLogo', name: 'Team logo', x: 46, y: 6, w: 36, h: 36, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'item.teamLogo' } } } as Draft,
      txt({ name: 'Team tag', x: 88, y: 0, w: 160, h: H, bind: { text: { path: 'item.teamTag', format: 'upper', fallback: 'TEAM' } }, style: { fontSize: 22 } }),
      { ...aliveBars(rows, 9, 28), x: 252, y: 10 },
      txt({ name: 'Points', x: 296, y: 0, w: 50, h: H, bind: { text: { path: 'item.totalPoints', fallback: 0 } }, style: { fontSize: 22, align: 'center', color: T('accent') } }),
      team(txt({ name: 'Kills', x: 346, y: 0, w: 50, h: H, bind: { text: { path: 'item.totalKills', fallback: 0 } }, style: { fontSize: 22, align: 'center' } }), [['teamKill', 'pop']]),
      recallSweep(W, H),
    ],
  } as Draft, [['teamEliminated', 'deadSwipe']]);
}

/** The LiveStats top box: the leading team's four player photos side by side, its tag and stats underneath. */
function topTeamPhotoStack(): Draft {
  const rows: PlayerRows = 'raw';
  const W = 400; const H = 220;
  return {
    type: 'repeater', name: 'Top team photos', x: 0, y: 0, w: W, h: H,
    repeater: { source: 'derived.teams', limit: 1, direction: 'column', itemHeight: H, gap: 0 },
    children: [
      { type: 'rect', name: 'Background', x: 0, y: 0, w: W, h: H, style: { fill: T('primary'), gradient: TOURNAMENT_GRADIENT } } as Draft,
      {
        type: 'repeater', name: 'Player photos', x: -25, y: 10, w: 455, h: 200,
        repeater: { source: 'item.players', limit: 4, direction: 'row', itemWidth: 85, itemHeight: 200, gap: 0 },
        children: [playerPhoto(rows, 200, 200, false)],
      },
      { type: 'rect', name: 'Shade', x: 0, y: 120, w: W, h: 100, style: { gradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: 'rgba(0,0,0,0)' }, { offset: 0.6, color: 'rgba(0,0,0,0.7)' }, { offset: 1, color: 'rgba(0,0,0,1)' }] } } } as Draft,
      txt({ name: 'Rank', x: 14, y: 180, w: 30, h: 40, bind: { text: { path: 'rank' } }, style: { fontSize: 24 } }),
      { type: 'teamLogo', name: 'Team logo', x: 46, y: 184, w: 32, h: 32, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'item.teamLogo' } } } as Draft,
      txt({ name: 'Team tag', x: 88, y: 180, w: 170, h: 40, bind: { text: { path: 'item.teamTag', format: 'upper', fallback: 'TEAM' } }, style: { fontSize: 24 } }),
      { ...aliveBars(rows, 8, 28), x: 262, y: 186 },
      txt({ name: 'Points', x: 300, y: 180, w: 46, h: 40, bind: { text: { path: 'item.totalPoints', fallback: 0 } }, style: { fontSize: 22, align: 'center' } }),
      team(txt({ name: 'Kills', x: 346, y: 180, w: 46, h: 40, bind: { text: { path: 'item.totalKills', fallback: 0 } }, style: { fontSize: 22, align: 'center' } }), [['teamKill', 'pop']]),
    ],
  };
}

/** A player card: photo, name, kills, health bar. */
function playerCard(rows: PlayerRows): Draft {
  return player({
    type: 'group', name: 'Player card', x: 0, y: 0, w: 180, h: 260,
    children: [
      { type: 'rect', name: 'Card', x: 0, y: 0, w: 180, h: 260, style: { fill: PANEL, radius: 8 } } as Draft,
      { ...playerPhoto(rows, 164, 180, false), x: 8, y: 8, timeline: undefined },
      { ...deadSlash(164, 180), x: 8 - 16, y: 8 + 83 },
      txt({ name: 'Player name', x: 8, y: 192, w: 164, h: 30, bind: { text: { path: 'item.playerName', format: 'upper', fallback: 'PLAYER' } }, style: { fontSize: 18, align: 'center', textFit: 'shrink' } }),
      player(txt({ name: 'Kills', x: 8, y: 220, w: 80, h: 30, bind: { text: { path: 'item.killNum', suffix: ' KILLS', fallback: 0 } }, style: { fontSize: 15, color: T('accent') } }), rows, [['playerKill', 'pop']]),
      {
        type: 'rect', name: 'Health', x: 92, y: 231, w: 80, h: 8,
        style: { fill: '#22c55e', fillValue: { ref: 'item.health' }, fillMax: { ref: 'item.healthMax' }, fillTrack: 'rgba(255,255,255,0.15)', radius: 4 },
        styleWhen: [{ when: PLAYER_KNOCKED, style: { fill: '#ef4444' } }, { when: PLAYER_DEAD, style: { fillValue: 0 } }],
      } as Draft,
    ],
  } as Draft, rows, [['playerDead', 'deadSwipe'], ['playerKnocked', 'alertPulse'], ['playerRecalled', 'glow'], ['playerRevived', 'glow'], ['playerKill', 'pop']]);
}

function knockedTag(): Draft {
  return {
    type: 'rect', name: 'Knocked tag', x: 0, y: 0, w: 120, h: 30, text: 'KNOCKED',
    style: { fill: '#ef4444', radius: 4, color: '#ffffff', fontFamily: FONT, fontSize: 16, fontWeight: 900, align: 'center', letterSpacing: 2 },
    visibleWhen: PLAYER_KNOCKED,
    timeline: { clips: [{ id: 'blink', name: 'Blink', duration: 900, loop: true, trigger: { type: 'loop' }, retrigger: 'restart', tracks: [{ prop: 'opacity', keyframes: [{ t: 0, value: 1, ease: 'easeInOut' }, { t: 450, value: 0.45, ease: 'easeInOut' }, { t: 900, value: 1 }] }] }] },
  } as Draft;
}

function recalledTag(): Draft {
  return team({
    type: 'rect', name: 'Recalled tag', x: 0, y: 0, w: 140, h: 30, text: 'RECALLED',
    style: { fill: '#16a34a', radius: 4, color: '#ffffff', fontFamily: FONT, fontSize: 16, fontWeight: 900, align: 'center', letterSpacing: 2 },
  } as Draft, [['teamRecall', 'popInOut', { hold: 2500 }]]);
}

export const PARTS: Part[] = [
  { id: 'live-stats-row', name: 'LiveStats team row', hint: 'Rank, logo, tag, alive bars, points, kills', badges: ['Team row', 'Dead swipe', 'Recall', 'Kills'], needs: 'team', build: liveStatsRow },
  { id: 'top-team-photos', name: 'Top team photo stack', hint: 'The leading team’s 4 player photos (LiveStats top box)', badges: ['4 players', 'Dead swipe', 'Knocked', 'Recall'], needs: 'none', build: topTeamPhotoStack },
  { id: 'player-photo', name: 'Dynamic player photo', hint: 'The player’s own picture with their name inside', badges: ['Player', 'Dead swipe', 'Knocked', 'Recall'], needs: 'player', build: (r) => playerPhoto(r) },
  { id: 'player-card', name: 'Player card', hint: 'Photo, name, kills and health', badges: ['Player', 'Dead swipe', 'Knocked', 'Kills'], needs: 'player', build: playerCard },
  { id: 'alive-bars', name: 'Alive bars (4 players)', hint: 'One bar per player: health, knocked red, dead empty', badges: ['Team row', 'Health', 'Knocked'], needs: 'team', build: () => aliveBars('raw') },
  { id: 'dead-slash', name: 'Dead slash', hint: 'A red bar swipes across when the player dies', badges: ['Player', 'Dead swipe'], needs: 'player', build: () => deadSlash() },
  { id: 'knocked-tag', name: 'Knocked tag', hint: 'Blinks while the player is knocked', badges: ['Player', 'Knocked'], needs: 'player', build: knockedTag },
  { id: 'eliminated-stamp', name: 'Eliminated stamp', hint: 'Stamps in when the team is wiped out', badges: ['Team row', 'Eliminated'], needs: 'team', build: () => eliminatedStamp() },
  { id: 'recall-sweep', name: 'Recall sweep', hint: 'A green sweep across the row on a recall', badges: ['Team row', 'Recall'], needs: 'team', build: () => recallSweep(400, 48) },
  { id: 'recalled-tag', name: 'Recalled tag', hint: 'Pops up for a moment when a teammate is recalled', badges: ['Team row', 'Recall'], needs: 'team', build: recalledTag },
];

export const PARTS_BY_ID: Record<string, Part> = Object.fromEntries(PARTS.map((p) => [p.id, p]));
