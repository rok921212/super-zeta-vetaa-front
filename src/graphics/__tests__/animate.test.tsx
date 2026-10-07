import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createEmptyLayout, validateLayout, ANIMATION_EVENTS } from '../schema/layoutSchema.js';
import type { LayoutDocument, LayoutElement, TimelineClip } from '../schema/layoutTypes.ts';
import type { EngineEvent } from '../../overlayClient/engineTypes.ts';
import { createPlayerStateDetector, playerLifeState } from '../../overlayClient/detectors.ts';
import { createEventProcessor } from '../../overlayClient/events.ts';
import { LayoutRenderer, type EventSource } from '../renderer/LayoutRenderer.tsx';
import { eventMatchesItem } from '../renderer/useTimeline.ts';
import { frameStyle } from '../renderer/timeline.ts';
import { computeLive } from '../bindings/index.ts';
import {
  DEFAULT_OPTIONS, EFFECTS, TRIGGERS, clipToRule, decodePreset, effectsFor, encodePreset, rowKindOf, ruleToClip, suggestionsFor,
  triggersFor,
} from '../editor/animationLibrary.ts';
import { AnimatePanel, describeAnimations } from '../editor/AnimatePanel.tsx';
import { editorReducer, initEditor } from '../editor/store.ts';
import { createElement } from '../editor/elementFactory.ts';
import { TEMPLATES } from '../templates/index.ts';
import { createSimulation } from '../editor/simulation.ts';

const P = (uId: string, liveState = 0, extra: any = {}) => ({ uId, playerName: `P${uId}`, liveState, bHasDied: liveState === 5, health: liveState === 5 ? 0 : 100, healthMax: 100, killNum: 0, ...extra });
const md = (players: any[], matchId = 'm1') => ({ _id: `md-${matchId}`, matchId, teams: [{ teamId: 't1', _id: 'd1', teamTag: 'AA', teamLogo: '/l', players }] });

// ── engine: knock / revive / death ──────────────────────────────────────────

describe('player state events', () => {
  test('detector: first sight only records; then knock, revive and death are reported once', () => {
    const d = createPlayerStateDetector();
    expect(playerLifeState(P('1', 4))).toBe('knocked');
    expect(d.process(md([P('1'), P('2', 4)]))).toEqual([]); // seeded silently (2 is already knocked)
    expect(d.process(md([P('1', 4), P('2', 4)])).map((f) => [f.kind, f.playerId])).toEqual([['knock', '1']]);
    expect(d.process(md([P('1', 4), P('2', 4)]))).toEqual([]); // no change, no repeat
    expect(d.process(md([P('1', 0), P('2', 5)])).map((f) => [f.kind, f.playerId, f.from])).toEqual([['revive', '1', 'knocked'], ['playerDeath', '2', 'knocked']]);
    expect(d.process(md([P('1', 0), P('2', 0)]))).toEqual([]); // dead -> alive is a recall, not a revive
    expect(d.process(md([P('1', 5)], 'm2'))).toEqual([]); // a new match re-seeds
  });

  test('the engine event stream carries them, with team and player ids, and a second knock fires again', () => {
    const proc = createEventProcessor();
    const wanted = new Set(ANIMATION_EVENTS as any[]) as any;
    let seq = 0;
    const run = (players: any[]) => proc.process({ data: { matchData: md(players), deadTeamList: [], match: { map: 'Erangel' } } as any, derived: { teams: [] } as any, sequence: ++seq, now: seq }, wanted);
    expect(run([P('1')])).toEqual([]);
    const knock = run([P('1', 4)]);
    expect(knock.map((e) => [e.type, e.teamId, e.playerId])).toEqual([['knock', 't1', '1']]);
    expect(run([P('1', 0)]).map((e) => e.type)).toEqual(['revive']);
    const again = run([P('1', 4)]);
    expect(again.map((e) => e.type)).toEqual(['knock']);
    expect(again[0].id).not.toBe(knock[0].id);
    expect(run([P('1', 5)]).map((e) => e.type)).toEqual(['playerDeath']);
  });

  test('live.players expose one `state` field', () => {
    const live = computeLive({ derived: { teams: [{ teamId: 'a', teamTag: 'A', players: [P('1'), P('2', 4), P('3', 5)] }] }, match: {}, round: {}, deadTeamList: [] });
    expect(live.players.map((p) => [p.state, p.knocked, p.dead])).toEqual([['alive', false, false], ['knocked', true, false], ['dead', false, true]]);
  });

  test('the simulation can knock and revive a player (real engine frames)', () => {
    const sim = createSimulation();
    expect(typeof sim.controls.knock).toBe('function');
    expect(typeof sim.controls.revive).toBe('function');
  });
});

// ── renderer: self + revert ─────────────────────────────────────────────────

describe('row-only events and reverting states', () => {
  const ev = (over: Partial<EngineEvent>): EngineEvent => ({ id: 'e', type: 'kill', timestamp: 0, sequence: 1, matchId: null, payload: {}, ...over });

  test('eventMatchesItem: team rows match on team, player rows on player, no row matches all', () => {
    const team = { teamId: 't1', players: [] };
    const player = { uId: 'p1', playerName: 'A' };
    expect(eventMatchesItem(ev({ teamId: 't1', playerId: 'p9' }), team)).toBe(true);
    expect(eventMatchesItem(ev({ teamId: 't2' }), team)).toBe(false);
    expect(eventMatchesItem(ev({ payload: { team: { teamId: 't1' } } }), team)).toBe(true); // rankChange shape
    expect(eventMatchesItem(ev({ teamId: 't1', playerId: 'p1' }), player)).toBe(true);
    expect(eventMatchesItem(ev({ teamId: 't1', playerId: 'p2' }), player)).toBe(false);
    expect(eventMatchesItem(ev({ payload: { player: { uId: 'p1' } } }), player)).toBe(true);
    expect(eventMatchesItem(ev({ teamId: 'x' }), undefined)).toBe(true);
  });

  test('grayscale and brightness reach the frame filter', () => {
    const f = frameStyle({ x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1 }, { grayscale: 1, brightness: 1.5, blur: 2 });
    expect(f.filter).toBe('blur(2px) grayscale(1) brightness(1.5)');
    expect(frameStyle({ x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1 }, {}).filter).toBeUndefined();
  });

  describe('runtime', () => {
    let raf: FrameRequestCallback[];
    let clock = 0;
    beforeEach(() => {
      raf = [];
      clock = 0;
      jest.spyOn(performance, 'now').mockImplementation(() => clock);
      (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => { raf.push(cb); return raf.length; };
      (global as any).cancelAnimationFrame = () => {};
    });
    afterEach(() => jest.restoreAllMocks());
    const step = (ms: number) => { clock += ms; const q = raf; raf = []; q.forEach((cb) => cb(clock)); };

    const rowsDoc = (clip: TimelineClip): LayoutDocument => {
      const doc: any = {
        ...createEmptyLayout(),
        elements: [{
          id: 'rows', type: 'repeater', x: 0, y: 0, w: 200, h: 200,
          repeater: { source: 'live.players', limit: 4, direction: 'column', itemHeight: 40 },
          children: [{ id: 'row', type: 'rect', x: 0, y: 0, w: 200, h: 40, style: { fill: '#111111' }, timeline: { clips: [clip] } }],
        }],
      };
      const v = validateLayout(doc);
      if (!v.ok) throw new Error(JSON.stringify(v.errors));
      return doc;
    };
    const stateWith = (players: any[]) => ({ derived: { teams: [{ teamId: 't1', teamTag: 'A', players }] }, match: {}, round: {}, deadTeamList: [] });
    const rowOf = (c: HTMLElement, uId: string) => c.querySelector(`[data-instance="/${uId}"][data-element-id="row"]`) as HTMLElement;

    test('self: a kill only animates the killer’s row', () => {
      const listeners: Record<string, Array<(e: EngineEvent) => void>> = {};
      const events: EventSource = { on: (t, l) => { (listeners[t] ||= []).push(l); return () => {}; } };
      const clip = ruleToClip({ id: 'row', type: 'rect', x: 0, y: 0, w: 200, h: 40 } as LayoutElement, { trigger: 'playerKill', effect: 'pop', options: DEFAULT_OPTIONS }, 'c1');
      expect(clip.trigger).toEqual({ type: 'event', event: 'kill', self: true });
      const { container } = render(<LayoutRenderer layout={rowsDoc(clip)} state={stateWith([P('1'), P('2')])} events={events} fit={1} />);
      act(() => { listeners.kill.forEach((l) => l(ev({ id: 'k1', teamId: 't1', playerId: '2' }))); });
      act(() => step(140));
      expect(rowOf(container, '2').style.transform).toContain('scale(1.25');
      expect(rowOf(container, '1').style.transform).toBe('');
    });

    test('revert: a knocked row takes the look, and returns to normal when revived', () => {
      const base = { id: 'row', type: 'rect', x: 0, y: 0, w: 200, h: 40 } as LayoutElement;
      const clip = ruleToClip(base, { trigger: 'playerKnocked', effect: 'greyOut', options: DEFAULT_OPTIONS }, 'c1', { item: { knocked: false } });
      expect(clip.trigger).toEqual({ type: 'condition', when: { path: 'item.knocked', op: 'equals', value: true }, revert: true });
      const doc = rowsDoc(clip);
      const { container, rerender } = render(<LayoutRenderer layout={doc} state={stateWith([P('1'), P('2')])} events={null} fit={1} />);
      expect(rowOf(container, '1').style.filter).toBe('');

      rerender(<LayoutRenderer layout={doc} state={stateWith([P('1', 4), P('2')])} events={null} fit={1} />);
      act(() => step(400));
      expect(rowOf(container, '1').style.filter).toBe('grayscale(1)');
      expect(rowOf(container, '1').style.opacity).toBe('0.55');
      expect(rowOf(container, '2').style.filter).toBe(''); // the other row is untouched

      rerender(<LayoutRenderer layout={doc} state={stateWith([P('1', 0), P('2')])} events={null} fit={1} />);
      act(() => step(500));
      expect(rowOf(container, '1').style.filter).toBe('');
      expect(rowOf(container, '1').style.opacity).toBe('1');
    });
  });
});

// ── the rule library ────────────────────────────────────────────────────────

describe('animation library', () => {
  const text: LayoutElement = { id: 't', type: 'text', x: 100, y: 50, w: 200, h: 40, style: { color: { ref: 'theme.colors.text' } } };
  const group: LayoutElement = { id: 'g', type: 'group', x: 10, y: 20, w: 300, h: 60, children: [] };

  test('every trigger × every effect it offers builds a clip the schema accepts and reads back', () => {
    let built = 0;
    for (const el of [text, group]) {
      for (const row of ['none', 'team', 'player'] as const) {
        for (const trig of triggersFor(row)) {
          for (const g of effectsFor(trig.kind, el)) {
            for (const eff of g.effects) {
              const clip = ruleToClip(el, { trigger: trig.id, effect: eff.id, options: { speed: 1.6, hold: 2500, color: '#22c55e' } }, 'c1');
              const doc: any = { ...createEmptyLayout(), elements: [{ ...el, timeline: { clips: [clip] } }] };
              const v = validateLayout(doc);
              expect({ rule: `${trig.id}/${eff.id}`, errors: v.errors }).toEqual({ rule: `${trig.id}/${eff.id}`, errors: [] });
              const back = clipToRule(clip);
              expect([back.trigger?.id, back.effect?.id, back.options]).toEqual([trig.id, eff.id, { speed: 1.6, hold: 2500, color: '#22c55e' }]);
              built++;
            }
          }
        }
      }
    }
    expect(built).toBeGreaterThan(300);
    expect(Object.keys(EFFECTS).length).toBeGreaterThanOrEqual(38);
    expect(Object.keys(TRIGGERS).length).toBeGreaterThanOrEqual(25);
  });

  test('presets, numbers and context', () => {
    expect(decodePreset(encodePreset('popInOut', { speed: 0.6, hold: 1500, color: '#AABBCC' }))).toEqual({ effect: 'popInOut', options: { speed: 0.6, hold: 1500, color: '#aabbcc' } });
    expect(decodePreset('nope_s100')).toBeNull();
    expect(decodePreset(undefined)).toBeNull();
    // "N or fewer" triggers keep their number
    const c = ruleToClip(group, { trigger: 'finalTeams', effect: 'fadeIn', n: 6, options: DEFAULT_OPTIONS }, 'c');
    expect(clipToRule(c).n).toBe(6);
    // raw match players have liveState, live.* players have `knocked`
    expect(TRIGGERS.playerKnocked.make({ item: { liveState: 0 } }).when).toEqual({ path: 'item.liveState', op: 'equals', value: 4 });
    expect(TRIGGERS.playerKnocked.make({ item: { knocked: false } }).when).toEqual({ path: 'item.knocked', op: 'equals', value: true });
    // popups queue (back-to-back alerts all show), looks restart
    expect(ruleToClip(group, { trigger: 'anyElimination', effect: 'popInOut', options: DEFAULT_OPTIONS }, 'c').retrigger).toBe('queue');
    expect(ruleToClip(group, { trigger: 'always', effect: 'pulseLoop', options: DEFAULT_OPTIONS }, 'c').loop).toBe(true);
    // a theme colour stays a live reference in a colour effect
    const flash = ruleToClip(text, { trigger: 'playerKill', effect: 'colorFlash', options: DEFAULT_OPTIONS }, 'c');
    expect(flash.tracks[0].keyframes[0].value).toEqual({ bind: { path: 'theme.colors.text' } });
    // colour effects are not offered for groups
    expect(effectsFor('state', group).flatMap((g) => g.effects.map((e) => e.id))).not.toContain('tint');
    expect(effectsFor('state', text).flatMap((g) => g.effects.map((e) => e.id))).toContain('tint');
  });

  test('row kinds decide which triggers and suggestions are offered', () => {
    expect(rowKindOf({ teamId: 'a', players: [] })).toBe('team');
    expect(rowKindOf({ uId: '1', playerName: 'x' })).toBe('player');
    expect(rowKindOf({}, 'live.players')).toBe('player');
    expect(rowKindOf({}, 'derived.teams')).toBe('team');
    expect(rowKindOf(undefined)).toBe('none');
    expect(triggersFor('player').map((t) => t.id)).toEqual(expect.arrayContaining(['playerKnocked', 'playerDead', 'playerRecalled', 'playerRevived', 'appear', 'anyKill']));
    expect(triggersFor('none').map((t) => t.id)).not.toContain('playerKnocked');
    expect(suggestionsFor('player').map((s) => s.trigger)).toEqual(expect.arrayContaining(['playerKnocked', 'playerDead', 'playerRecalled']));
    expect(suggestionsFor('team')[0].trigger).toBe('teamEliminated');
  });
});

// ── templates and inserts come with behaviour ───────────────────────────────

describe('built-in behaviour', () => {
  const find = (els: LayoutElement[], id: string): LayoutElement | null => {
    for (const e of els) { if (e.id === id) return e; const c = e.children && find(e.children, id); if (c) return c; }
    return null;
  };
  const rulesOf = (el: LayoutElement | null) => (el?.timeline?.clips || []).map((c) => clipToRule(c).trigger?.id);

  test('templates ship ready rules for knocked / dead / recalled / eliminated, and still validate', () => {
    const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!;
    expect(rulesOf(find(tpl('player-status').elements, 'ps_row'))).toEqual(['playerKnocked', 'playerDead', 'playerRecalled', 'playerRevived', 'playerKill']);
    expect(rulesOf(find(tpl('live-standings').elements, 'ls_pip'))).toEqual(['playerKnocked', 'playerRevived', 'playerRecalled']);
    expect(rulesOf(find(tpl('rb-live-stats').elements, 'rls_pip'))).toEqual(['playerKnocked', 'playerRevived', 'playerRecalled']);
    expect(rulesOf(find(tpl('rb-live-stats').elements, 'rls_bg'))).toEqual(['teamKill', 'teamKnock']);
    // pips are raw players: the knocked rule reads liveState
    expect(find(tpl('live-standings').elements, 'ls_pip')!.timeline!.clips[0].trigger.when).toEqual({ path: 'item.liveState', op: 'equals', value: 4 });
    for (const t of TEMPLATES) {
      const v = validateLayout({ ...createEmptyLayout(), elements: t.elements });
      expect({ id: t.id, errors: v.errors }).toEqual({ id: t.id, errors: [] });
    }
  });

  test('an inserted Player list / Team list already reacts', () => {
    const doc = createEmptyLayout() as LayoutDocument;
    const players = createElement('playerRows', doc);
    expect(players.repeater?.source).toBe('live.players');
    expect(rulesOf(players.children![0])).toEqual(['playerKnocked', 'playerDead', 'playerRecalled', 'playerRevived', 'playerKill']);
    const teams = createElement('repeater', doc);
    expect(rulesOf(teams.children![0])).toEqual(['teamEliminated', 'teamKill', 'teamKnock']);
    expect(validateLayout({ ...doc, elements: [players, teams] }).errors).toEqual([]);
  });
});

// ── the Animate panel ───────────────────────────────────────────────────────

describe('AnimatePanel', () => {
  function harness(doc: LayoutDocument, selectedId: string | null, scope: any = {}, sim: any = null) {
    let st = initEditor(doc);
    const onPreview = jest.fn();
    const onEditKeyframes = jest.fn();
    const view = () => (
      <AnimatePanel doc={st.doc} selectedId={selectedId} exec={(cmd) => { if (cmd) st = editorReducer(st, { type: 'exec', cmd }); utils.rerender(view()); }}
        scope={scope} sim={sim} onPreview={onPreview} onEditKeyframes={onEditKeyframes} />
    );
    const utils = render(view());
    const el = () => (function f(els: LayoutElement[]): LayoutElement | null { for (const e of els) { if (e.id === selectedId) return e; const c = e.children && f(e.children); if (c) return c; } return null; })(st.doc.elements)!;
    return { ...utils, doc: () => st.doc, el, onPreview, onEditKeyframes };
  }
  const playerDoc = (): LayoutDocument => ({
    ...(createEmptyLayout() as LayoutDocument),
    elements: [{
      id: 'rows', type: 'repeater', x: 0, y: 0, w: 300, h: 300, repeater: { source: 'live.players', limit: 4, direction: 'column', itemHeight: 40 },
      children: [{ id: 'row', type: 'group', name: 'Player row', x: 0, y: 0, w: 300, h: 40, children: [] }],
    }],
  });

  test('nothing selected: explains what to do and offers the guide', () => {
    harness(playerDoc(), null);
    expect(screen.getByText('Select a layer to animate it.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Help: How to animate/ }));
    expect(screen.getByTestId('help-card')).toHaveTextContent('WHEN something happens');
  });

  test('a player row: one click adds "knocked → alert pulse"; the rule is a valid, reverting, row-scoped clip', () => {
    const h = harness(playerDoc(), 'row', { item: { uId: '1', playerName: 'A', knocked: false, dead: false } });
    expect(screen.getByText('in a player row')).toBeInTheDocument();
    const chips = screen.getByTestId('animation-suggestions');
    fireEvent.click(within(chips).getByText('+ Knocked → alert pulse'));
    const clip = h.el().timeline!.clips[0];
    expect(clip.trigger).toEqual({ type: 'condition', when: { path: 'item.knocked', op: 'equals', value: true }, revert: true });
    expect(clip.loop).toBe(true);
    expect(validateLayout(h.doc()).errors).toEqual([]);
    expect(describeAnimations(h.el())).toEqual(['While this player is knocked → Alert pulse (keeps pulsing)']);
    // the used suggestion is gone, the others remain
    expect(within(screen.getByTestId('animation-suggestions')).queryByText('+ Knocked → alert pulse')).toBeNull();
    expect(within(screen.getByTestId('animation-suggestions')).getByText('+ Dead → grey out')).toBeInTheDocument();
  });

  test('changing WHEN / DO / speed rebuilds the same clip; delete removes it', () => {
    const h = harness(playerDoc(), 'row', { item: { uId: '1', knocked: false } });
    fireEvent.click(screen.getByTestId('add-animation'));
    const id = h.el().timeline!.clips[0].id;
    const row = () => document.querySelector(`[data-rule="${id}"]`) as HTMLElement;

    fireEvent.change(within(row()).getByLabelText('When'), { target: { value: 'playerRecalled' } });
    expect(h.el().timeline!.clips[0].trigger).toEqual({ type: 'event', event: 'recall', self: true });
    expect(clipToRule(h.el().timeline!.clips[0]).effect?.group).toBe('attention'); // an effect that fits an event

    fireEvent.change(within(row()).getByLabelText('Do'), { target: { value: 'shake' } });
    fireEvent.change(within(row()).getByLabelText('Speed'), { target: { value: '0.6' } });
    const c = h.el().timeline!.clips[0];
    expect([c.id, clipToRule(c).effect?.id, clipToRule(c).options.speed, c.duration]).toEqual([id, 'shake', 0.6, 300]);
    expect(h.el().timeline!.clips).toHaveLength(1);

    fireEvent.click(within(row()).getByText('Keyframes'));
    expect(h.onEditKeyframes).toHaveBeenCalledWith(id);

    fireEvent.click(within(row()).getByLabelText('Delete animation'));
    expect(h.el().timeline).toBeUndefined();
  });

  test('Test live fires the matching simulation action; states offer Undo', () => {
    const sim = { knock: jest.fn(), revive: jest.fn() };
    const doc = playerDoc();
    (doc.elements[0].children![0] as any).timeline = { clips: [ruleToClip(doc.elements[0].children![0], { trigger: 'playerKnocked', effect: 'alertPulse', options: DEFAULT_OPTIONS }, 'c1', { item: { knocked: false } })] };
    harness(doc, 'row', { item: { uId: '1', knocked: false } }, sim);
    fireEvent.click(screen.getByText('⚡ Test live'));
    expect(sim.knock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('↺ Undo'));
    expect(sim.revive).toHaveBeenCalledTimes(1);
  });

  test('a hand-made clip is shown as custom, not rewritten', () => {
    const doc = playerDoc();
    const custom: TimelineClip = { id: 'c1', name: 'Mine', duration: 500, trigger: { type: 'event', event: 'kill', filter: { path: 'event.payload.killNum', op: 'greaterThan', value: 3 } }, tracks: [{ prop: 'opacity', keyframes: [{ t: 0, value: 0 }, { t: 500, value: 1 }] }] };
    (doc.elements[0].children![0] as any).timeline = { clips: [custom] };
    const h = harness(doc, 'row', { item: { uId: '1' } });
    expect(screen.getByText('custom trigger (set in Keyframes)')).toBeInTheDocument();
    expect(screen.getByText('custom keyframes')).toBeInTheDocument();
    expect(h.el().timeline!.clips[0]).toEqual(custom);
  });
});
