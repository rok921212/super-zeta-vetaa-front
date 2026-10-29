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
import { smashPointBar } from './smashPoint.ts';

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
// As the themes draw them: the flag is on and the team is not out.
const TEAM_ALIVE: Condition = { path: 'item.isAllDead', op: 'notEquals', value: true };
export const TEAM_OUTSIDE_ZONE: Condition = { all: [{ path: 'item.hasOutsideBlueCircle', op: 'equals', value: true }, TEAM_ALIVE] };
export const TEAM_FIRING: Condition = { all: [{ path: 'item.hasFiring', op: 'equals', value: true }, TEAM_ALIVE] };

const player = (el: Draft, rows: PlayerRows, specs: BehaviorSpec[]): Draft => withBehaviors(el as unknown as LayoutElement, specs, CTX[rows]) as unknown as Draft;
const team = (el: Draft, specs: BehaviorSpec[]): Draft => withBehaviors(el as unknown as LayoutElement, specs) as unknown as Draft;

/** Text style for a label inside a shape (tags, stamps, slashes). */
const LABEL = (fontSize: number, letterSpacing = 2) => ({ color: '#ffffff', fontFamily: FONT, fontSize, fontWeight: 900, align: 'center', letterSpacing, textFit: 'shrink', padding: 4 });

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

/** A red bar that swipes across when the player dies, with the player's name on it. */
function deadSlash(w = 160, h = 200): Draft {
  const bar = 22;
  return {
    type: 'rect', name: 'Dead slash', x: -Math.round(w * 0.1), y: Math.round(h / 2 - bar / 2), w: Math.round(w * 1.2), h: bar, rotation: -24,
    bind: { text: { path: 'item.playerName', format: 'upper', suffix: ' · DEAD', fallback: 'DEAD' } },
    style: { fill: '#ef4444', radius: 2, ...LABEL(13) },
    visibleWhen: PLAYER_DEAD,
    timeline: { clips: [{ id: 'swipe', name: 'Swipe in', duration: 320, trigger: { type: 'enter' }, retrigger: 'restart', tracks: [{ prop: 'wipeR', keyframes: [{ t: 0, value: 1, ease: 'easeOutCubic' }, { t: 320, value: 0 }] }] }] },
  } as Draft;
}

// ── team pieces ─────────────────────────────────────────────────────────────

/** A red sweep over a team row that plays when one of its players dies, naming who died. */
function deadSweep(w: number, h: number): Draft {
  return team({
    type: 'rect', name: 'Dead sweep', x: 0, y: 0, w, h,
    // The death event is in scope while the sweep plays (event.payload.player = the dead player).
    bind: { text: { path: 'event.payload.player.playerName', format: 'upper', suffix: ' DEAD', fallback: 'DEAD' } },
    style: { fill: 'rgba(239,68,68,0.6)', radius: 4, ...LABEL(Math.round(h * 0.45), 3), textShadow: '0 2px 6px rgba(0,0,0,0.6)' },
  } as Draft, [['teamDeath', 'wipeInOutLeft', { hold: 1600 }]]);
}

function eliminatedStamp(w = 300, h = 40): Draft {
  return {
    type: 'rect', name: 'Eliminated stamp', x: 0, y: 0, w, h, rotation: -6, text: 'ELIMINATED',
    bind: { text: { path: 'item.teamTag', format: 'upper', suffix: ' ELIMINATED', fallback: 'ELIMINATED' } },
    style: { fill: 'rgba(220,38,38,0.92)', radius: 4, ...LABEL(Math.round(h * 0.55), 3) },
    visibleWhen: TEAM_ELIMINATED,
    timeline: { clips: [{ id: 'stamp', name: 'Stamp in', duration: 380, trigger: { type: 'enter' }, retrigger: 'restart', tracks: [{ prop: 'scale', keyframes: [{ t: 0, value: 1.8, ease: 'backOut' }, { t: 380, value: 1 }] }, { prop: 'opacity', keyframes: [{ t: 0, value: 0, ease: 'easeOut' }, { t: 200, value: 1 }] }] }] },
  } as Draft;
}

/** An opacity loop between full and `low`, like the themes' pulse classes. */
const pulse = (id: string, duration: number, low: number) => ({
  clips: [{ id, name: 'Pulse', duration, loop: true, trigger: { type: 'loop' as const }, retrigger: 'restart' as const, tracks: [{ prop: 'opacity' as const, keyframes: [{ t: 0, value: 1, ease: 'easeInOut' as const }, { t: duration / 2, value: low, ease: 'easeInOut' as const }, { t: duration, value: 1 }] }] }],
});

/** A pulsing blue glow over a team row while one of its players is outside the zone. */
export function zoneGlow(w: number, h: number): Draft {
  return {
    type: 'rect', name: 'Outside zone glow', x: 0, y: 0, w, h,
    style: { fill: 'rgba(59,130,246,0.15)', radius: 4 },
    effects: [{ type: 'innerGlow', color: '#3b82f6', opacity: 0.8, size: 20 }],
    visibleWhen: TEAM_OUTSIDE_ZONE,
    timeline: pulse('zone', 1200, 0.45),
  } as Draft;
}

// The themes' bullet (Theme6/7 LiveStats), drawn in a 500 × 500 box: case, body, tip, base.
export const BULLET_D ='M285.374,191.068L285.374,151.082L218.227,151.082L218.227,191.068L204.646,218.23L298.955,218.23Z'
  + 'M201.441,235.015h100.721v184.656h-100.721Z'
  + 'M270.558,41.682L259.84,5.985C258.774,2.434,255.509,0,251.799,0c-3.702,0-6.975,2.434-8.041,5.984l-10.71,35.697c-9.031,30.107-13.765,61.23-14.512,92.613h66.535C284.323,102.912,279.589,71.789,270.558,41.682z'
  + 'M294.703,458.164c0.26-0.688,0.537-1.368,0.713-2.09l4.902-19.615h-97.037l4.893,19.615c0.185,0.722,0.453,1.402,0.722,2.09c-4.516,3.794-7.453,9.417-7.453,15.763v8.998c0,11.407,9.275,20.681,20.681,20.681h59.358c11.398,0,20.681-9.275,20.681-20.681v-8.998C302.165,467.581,299.228,461.957,294.703,458.164z';

/**
 * The themes' firing bullet, exactly as Theme6/7 draw it: white, pointing right, a thin red
 * outline and a double red glow (drop-shadow 18px + 30px), pulsing — shown while anyone on the
 * team is firing. `size` 44 is the themes' size.
 */
export function firingBullet(size = 44): Draft {
  return {
    type: 'path', name: 'Firing bullet', x: 0, y: 0, w: size, h: size, rotation: 90, d: BULLET_D, vb: [500, 500],
    // The themes stroke 2 units of a 500-unit box: about 0.2px at 44px.
    style: { fill: '#ffffff', stroke: '#ff0000', strokeWidth: Math.max(0.1, Math.round((2 * size / 500) * 100) / 100) },
    effects: [{ type: 'outerGlow', color: '#ff0000', opacity: 1, size: 18 }, { type: 'outerGlow', color: '#ff0000', opacity: 1, size: 30 }],
    visibleWhen: { path: 'item.hasFiring', op: 'equals', value: true },
    timeline: pulse('firing', 2000, 0.5),
  } as Draft;
}

// ── the themes' row sweeps (Theme6/7 EliminatedOverlay, shared RecalledOverlay) ──

/** Theme6/7 recall bar colours (shared RecalledOverlay). */
const RECALL_GRADIENT = { type: 'linear' as const, angle: 135, stops: [{ offset: 0, color: '#0dd10d' }, { offset: 1, color: '#067d06' }] };

/**
 * A bar that grows across the row from the left, stays, then shrinks back (1.5s in, out at
 * 2.5s, 0.6s back), with its label fading in after 0.8s — the themes' sweep. `trigger` is the
 * Animate rule that starts it; the label reads `label` (a binding) or `text`.
 */
function themeSweep(name: string, w: number, h: number, trigger: string, fill: Record<string, unknown>, label: { text?: string; bind?: Record<string, unknown> }, fontFamily: unknown, fontSize: number, letterSpacing: number): Draft {
  const bar = { type: 'rect', name: `${name} bar`, x: 0, y: 0, w: w - 5, h, style: { ...fill } } as Draft;
  const text = team(txt({
    name: `${name} label`, x: 0, y: 0, w: w - 5, h,
    ...(label.text ? { text: label.text } : null),
    ...(label.bind ? { bind: { text: label.bind } } : null),
    style: { fontFamily, fontSize, fontWeight: 700, align: 'center', valign: 'middle', letterSpacing, textShadow: '0 1px 6px rgba(0,0,0,0.6)', textFit: 'shrink' },
  }), [[trigger, 'themeSweepText', { hold: 1000 }]]);
  // The label is wiped with the bar (same clip on the group), so it never shows past the bar's edge.
  return team({ type: 'group', name, x: 0, y: 0, w, h, children: [bar, text] } as Draft, [[trigger, 'themeSweep', { hold: 1000 }]]);
}

/** ELIMINATED across the row in the tournament's colours, the moment the team is wiped (again after a recall). */
function eliminatedSweep(w: number, h: number): Draft {
  return themeSweep('Eliminated sweep', w, h, 'teamJustEliminated', { fill: T('primary'), gradient: TOURNAMENT_GRADIENT }, { text: 'ELIMINATED' }, 'RELIDUX', 16, 4);
}

/** RECALLED - NAME across the row in green, when one of its players is recalled. */
function recallSweep(w: number, h: number): Draft {
  // The recall event is in scope while it plays (event.payload = the recalled player).
  return themeSweep('Recall sweep', w, h, 'teamRecall', { fill: '#0dd10d', gradient: RECALL_GRADIENT }, { bind: { path: 'event.payload.playerName', format: 'upper', prefix: 'RECALLED - ', fallback: 'RECALLED' } }, 'AGENCYB', Math.min(32, Math.round(h * 0.64)), 0);
}

/** Theme6/7 health bar: green, red while knocked, empty when dead, on a grey track. */
function themeAliveBar(w = 10, h = 40): Draft {
  return {
    type: 'rect', name: 'Health bar', x: 0, y: 0, w, h,
    style: { fill: '#0dd10d', fillValue: { ref: 'item.health' }, fillMax: { ref: 'item.healthMax' }, fillDirection: 'up', fillTrack: '#4b5563' },
    styleWhen: [
      { when: PLAYER_KNOCKED, style: { fill: '#ef4444' } },
      { when: PLAYER_DEAD, style: { fillValue: 0 } },
    ],
  } as Draft;
}

function themeAliveBars(barW = 10, barH = 40, gap = 2): Draft {
  return {
    type: 'repeater', name: 'Alive bars', x: 0, y: 0, w: barW * 4 + gap * 3, h: barH,
    repeater: { source: 'item.players', limit: 4, direction: 'row', itemWidth: barW, itemHeight: barH, gap },
    children: [themeAliveBar(barW, barH)],
  };
}

const ROW_FONT = 'RELIDUX';
const WHITE_BORDER = { stroke: '#ffffff', strokeWidth: 1 };

/**
 * The Theme7 LiveStats row, piece for piece: rank (the firing bullet takes its place), logo +
 * tag on the tournament gradient, kills, points and four health bars on black — with the
 * outside-zone glow, the ELIMINATED sweep (row dims to 70%) and the RECALLED sweep.
 */
function liveStatsRow(): Draft {
  const W = 570; const H = 50;
  const firing: Condition = { path: 'item.hasFiring', op: 'equals', value: true };
  return {
    type: 'group', name: 'LiveStats team row', x: 0, y: 0, w: W, h: H,
    styleWhen: [{ when: TEAM_ELIMINATED, style: {}, opacity: 0.7 }],
    children: [
      { type: 'rect', name: 'Rank cell', x: 0, y: 0, w: 80, h: H, style: { fill: T('primary'), gradient: TOURNAMENT_GRADIENT, ...WHITE_BORDER } } as Draft,
      { type: 'rect', name: 'Rank shade', x: 0, y: 0, w: 80, h: H, style: { fill: 'rgba(0,0,0,0.7)' } } as Draft,
      txt({
        name: 'Rank', x: 0, y: 0, w: 80, h: H, bind: { text: { path: 'rank' } },
        style: { fontFamily: ROW_FONT, fontSize: 17, fontWeight: 700, align: 'center', valign: 'middle' },
        // The bullet takes the rank's place while the team is firing.
        styleWhen: [{ when: firing, style: { color: 'rgba(0,0,0,0)' } }],
      }),
      { ...firingBullet(44), x: 18, y: 3 },
      { type: 'rect', name: 'Tag cell', x: 80, y: 0, w: 230, h: H, style: { fill: T('primary'), gradient: TOURNAMENT_GRADIENT, ...WHITE_BORDER } } as Draft,
      {
        type: 'teamLogo', name: 'Team logo', x: 88, y: 3, w: 44, h: 44, src: '/def_logo.png', fallbackSrc: '/def_logo.png', bind: { src: { path: 'item.teamLogo' } },
        style: { gradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#a8a8a8' }, { offset: 1, color: '#ffffff' }] } },
      } as Draft,
      txt({ name: 'Team tag', x: 140, y: 0, w: 165, h: H, bind: { text: { path: 'item.teamTag', format: 'upper', fallback: 'TEAM' } }, style: { fontFamily: ROW_FONT, fontSize: 17, fontWeight: 700, letterSpacing: 1.7, valign: 'middle', textFit: 'shrink' } }),
      { type: 'rect', name: 'Stats cell', x: 310, y: 0, w: 260, h: H, style: { fill: 'rgba(0,0,0,0.843)', ...WHITE_BORDER } } as Draft,
      txt({ name: 'Kills', x: 310, y: 0, w: 70, h: H, bind: { text: { path: 'item.totalKills', fallback: 0 } }, style: { fontFamily: ROW_FONT, fontSize: 19, fontWeight: 700, align: 'center', valign: 'middle' } }),
      { type: 'rect', name: 'Divider', x: 380, y: 0, w: 1, h: H, style: { fill: 'rgba(255,255,255,0.2)' } } as Draft,
      txt({ name: 'Points', x: 381, y: 0, w: 70, h: H, bind: { text: { path: 'item.totalPoints', fallback: 0 } }, style: { fontFamily: ROW_FONT, fontSize: 19, fontWeight: 700, align: 'center', valign: 'middle' } }),
      { ...themeAliveBars(), x: 461, y: 5 },
      zoneGlow(W, H),
      eliminatedSweep(W, H),
      recallSweep(W, H),
    ],
  } as Draft;
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
    type: 'rect', name: 'Knocked tag', x: 0, y: 0, w: 200, h: 30, text: 'KNOCKED',
    bind: { text: { path: 'item.playerName', format: 'upper', suffix: ' · KNOCKED', fallback: 'KNOCKED' } },
    style: { fill: '#ef4444', radius: 4, ...LABEL(16) },
    visibleWhen: PLAYER_KNOCKED,
    timeline: { clips: [{ id: 'blink', name: 'Blink', duration: 900, loop: true, trigger: { type: 'loop' }, retrigger: 'restart', tracks: [{ prop: 'opacity', keyframes: [{ t: 0, value: 1, ease: 'easeInOut' }, { t: 450, value: 0.45, ease: 'easeInOut' }, { t: 900, value: 1 }] }] }] },
  } as Draft;
}

function recalledTag(): Draft {
  return team({
    type: 'rect', name: 'Recalled tag', x: 0, y: 0, w: 240, h: 30, text: 'RECALLED',
    // The recall event is in scope while the tag shows: it names the player who came back.
    bind: { text: { path: 'event.payload.playerName', format: 'upper', suffix: ' · RECALLED', fallback: 'RECALLED' } },
    style: { fill: '#16a34a', radius: 4, ...LABEL(16) },
  } as Draft, [['teamRecall', 'popInOut', { hold: 2500 }]]);
}

/**
 * A pop-up that names the player on a live event (death / knock): team logo, player, team tag
 * and a label. The event is in scope while it plays, so every text reads `event.payload.*`.
 */
function playerEventAlert(name: string, trigger: 'anyDeath' | 'anyKnock', label: string, colour: string): Draft {
  const W = 460; const H = 84;
  return team({
    type: 'group', name, x: 0, y: 0, w: W, h: H,
    children: [
      { type: 'rect', name: 'Panel', x: 0, y: 0, w: W, h: H, style: { fill: PANEL, radius: 8 } } as Draft,
      { type: 'rect', name: 'Accent', x: 0, y: 0, w: 8, h: H, style: { fill: colour, radius: 2 } } as Draft,
      { type: 'teamLogo', name: 'Team logo', x: 20, y: 12, w: 60, h: 60, src: '/def_logo.avif', fallbackSrc: '/def_logo.avif', bind: { src: { path: 'event.payload.teamLogo' } } } as Draft,
      txt({ name: 'Player', x: 94, y: 8, w: 250, h: 40, bind: { text: { path: 'event.payload.player.playerName', format: 'upper', fallback: 'PLAYER' } }, style: { fontSize: 26, textFit: 'shrink' } }),
      txt({ name: 'Team tag', x: 94, y: 46, w: 250, h: 28, bind: { text: { path: 'event.payload.teamTag', format: 'upper', fallback: '' } }, style: { fontSize: 16, fontWeight: 700, color: T('muted'), letterSpacing: 3 } }),
      { type: 'rect', name: 'Label', x: 350, y: 24, w: 96, h: 36, text: label, style: { fill: colour, radius: 4, ...LABEL(16) } } as Draft,
    ],
  } as Draft, [[trigger, 'popInOut', { hold: 3000 }]]);
}

export const PARTS: Part[] = [
  { id: 'live-stats-row', name: 'LiveStats team row (Theme 7)', hint: 'The Theme 7 row: rank, logo, tag, kills, points, health bars — with the ELIMINATED and RECALLED sweeps, zone glow and firing bullet', badges: ['Team row', 'Eliminated', 'Recall', 'Zone', 'Firing'], needs: 'team', build: liveStatsRow },
  { id: 'eliminated-sweep', name: 'ELIMINATED sweep', hint: 'The themes’ bar that sweeps across the row the moment the team is wiped out', badges: ['Team row', 'Eliminated'], needs: 'team', build: () => eliminatedSweep(570, 50) },
  { id: 'top-team-photos', name: 'Top team photo stack', hint: 'The leading team’s 4 player photos (LiveStats top box)', badges: ['4 players', 'Dead swipe', 'Knocked', 'Recall'], needs: 'none', build: topTeamPhotoStack },
  { id: 'player-photo', name: 'Dynamic player photo', hint: 'The player’s own picture with their name inside', badges: ['Player', 'Dead swipe', 'Knocked', 'Recall'], needs: 'player', build: (r) => playerPhoto(r) },
  { id: 'player-card', name: 'Player card', hint: 'Photo, name, kills and health', badges: ['Player', 'Dead swipe', 'Knocked', 'Kills'], needs: 'player', build: playerCard },
  { id: 'alive-bars', name: 'Alive bars (4 players)', hint: 'One bar per player: health, knocked red, dead empty', badges: ['Team row', 'Health', 'Knocked'], needs: 'team', build: () => aliveBars('raw') },
  { id: 'dead-slash', name: 'Dead slash', hint: 'A red bar swipes across when the player dies', badges: ['Player', 'Dead swipe'], needs: 'player', build: () => deadSlash() },
  { id: 'knocked-tag', name: 'Knocked tag', hint: 'Blinks while the player is knocked', badges: ['Player', 'Knocked'], needs: 'player', build: knockedTag },
  { id: 'eliminated-stamp', name: 'Eliminated stamp', hint: 'Stamps in when the team is wiped out', badges: ['Team row', 'Eliminated'], needs: 'team', build: () => eliminatedStamp() },
  { id: 'recall-sweep', name: 'RECALLED sweep', hint: 'The themes’ green bar: RECALLED - NAME across the row when a player comes back', badges: ['Team row', 'Recall'], needs: 'team', build: () => recallSweep(570, 50) },
  { id: 'dead-sweep', name: 'Player dead sweep', hint: 'A red sweep across the row when one of its players dies', badges: ['Team row', 'Dead'], needs: 'team', build: () => deadSweep(400, 48) },
  { id: 'zone-glow', name: 'Outside zone glow', hint: 'A pulsing blue glow over the row while a player is outside the zone', badges: ['Team row', 'Zone'], needs: 'team', build: () => zoneGlow(400, 48) },
  { id: 'firing-bullet', name: 'Firing bullet', hint: 'The themes’ glowing bullet, pulsing while anyone on the team is firing', badges: ['Team row', 'Firing'], needs: 'team', build: () => firingBullet() },
  { id: 'recalled-tag', name: 'Recalled tag', hint: 'Pops up with the recalled player’s name', badges: ['Team row', 'Recall'], needs: 'team', build: recalledTag },
  { id: 'dead-alert', name: 'Dead alert', hint: 'Pops up naming the player who died, with their team', badges: ['Any player', 'Dead'], needs: 'none', build: () => playerEventAlert('Dead alert', 'anyDeath', 'DEAD', '#ef4444') },
  { id: 'knock-alert', name: 'Knock alert', hint: 'Pops up naming the player who was knocked', badges: ['Any player', 'Knocked'], needs: 'none', build: () => playerEventAlert('Knock alert', 'anyKnock', 'KNOCKED', '#f59e0b') },
  { id: 'smash-point', name: 'Smash Point bar', hint: 'The Smash Point set for this match; hidden while it is off', badges: ['Match', 'Smash Point'], needs: 'none', build: () => smashPointBar('sp', 0, 0, 520, 44) as unknown as Draft },
];

export const PARTS_BY_ID: Record<string, Part> = Object.fromEntries(PARTS.map((p) => [p.id, p]));
