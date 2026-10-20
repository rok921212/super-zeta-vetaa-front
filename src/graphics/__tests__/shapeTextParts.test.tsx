// Text inside shapes (typed, connected to data, edited on the canvas) and the
// Live parts library (valid layouts, real data, behaviours on, smart placement).

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { createEmptyLayout, normalizeLayout, validateLayout } from '../schema/layoutSchema.js';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { createOverlayEngine } from '../../overlayClient/engine.ts';
import { createSimulation, SIM_ROUND_ID, SIM_TOURNAMENT_ID } from '../editor/simulation.ts';
import { bindablePropsFor } from '../editor/Inspector.tsx';
import { addShapeText, disconnectText, hasShapeText, removeShapeText, setTypedText } from '../editor/shapeText.ts';
import { InlineTextEditor } from '../editor/InlineTextEditor.tsx';
import { defaultPropFor } from '../bindings/compat.ts';
import { PARTS } from '../templates/parts.ts';
import { placePart, rowContextAt } from '../editor/partPlacement.ts';
import { EFFECTS, DEFAULT_OPTIONS } from '../editor/animationEffects.ts';
import { sampleClip } from '../renderer/timeline.ts';
import { flatten, locate } from '../editor/tree.ts';
import { materialize } from '../editor/elementFactory.ts';

jest.setTimeout(60000);

let state: any = null;
beforeAll(async () => {
  const sim = createSimulation();
  const engine = createOverlayEngine({ tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, matchId: null, followSelected: true, view: null }, { transport: sim.transport });
  await new Promise<void>((resolve) => {
    const un = engine.subscribe((s: any) => { if (s.matchData?.teams?.length && s.overallData && !s.status.loading) { un(); resolve(); } });
  });
  state = engine.getState();
  engine.destroy();
});

const docWith = (elements: LayoutElement[]): LayoutDocument => normalizeLayout({ ...createEmptyLayout(), elements }) as LayoutDocument;
const draw = (elements: LayoutElement[]) =>
  render(<LayoutRenderer layout={docWith(elements)} state={state} events={null} fit={1} mode="editor" playTimelines={false} />).container;
const textOfLayer = (c: HTMLElement, id: string) => Array.from(c.querySelectorAll(`[data-element-id$="${id}"]`)).map((n) => (n.textContent || '').trim());

const rect: LayoutElement = { id: 'box', type: 'rect', x: 10, y: 10, w: 300, h: 80, style: { fill: '#112233' } };

describe('text inside shapes', () => {
  test('a rectangle draws its typed text, and a plain one draws none', () => {
    expect(textOfLayer(draw([rect]), 'box')).toEqual(['']);
    expect(textOfLayer(draw([{ ...rect, text: 'HELLO' }]), 'box')).toEqual(['HELLO']);
    expect(textOfLayer(draw([{ ...rect, type: 'ellipse', text: 'ROUND' }]), 'box')).toEqual(['ROUND']);
  });

  test('text in a shape connects to data, with the fallback when the value is missing', () => {
    const tag = String(state.derived.teams[0].teamTag);
    const bound = { ...rect, bind: { text: { path: 'derived.teams[0].teamTag', format: 'upper' as const } } };
    expect(textOfLayer(draw([bound]), 'box')).toEqual([tag.toUpperCase()]);
    const missing = { ...rect, bind: { text: { path: 'derived.teams[99].teamTag', fallback: 'NO TEAM' } } };
    expect(textOfLayer(draw([missing]), 'box')).toEqual(['NO TEAM']);
  });

  test('shapes offer text as a data connection; a dropped text field binds the text', () => {
    expect(bindablePropsFor('rect')).toEqual(expect.arrayContaining(['text', 'color', 'fill', 'src']));
    expect(bindablePropsFor('line')).not.toContain('text');
    expect(defaultPropFor(bindablePropsFor('rect'), 'text')).toBe('text');
    expect(defaultPropFor(bindablePropsFor('rect'), 'number')).toBe('text');
    expect(defaultPropFor(bindablePropsFor('rect'), 'image')).toBe('src');
  });

  test('the schema accepts text on shapes', () => {
    const v = validateLayout(docWith([{ ...rect, text: 'A' }, { ...rect, id: 'p', type: 'polygon', points: [[0, 0], [10, 0], [5, 10]], text: 'B' }]));
    expect(v.errors).toEqual([]);
  });

  test('add, retype, connect and remove text keep the shape itself intact', () => {
    const added = addShapeText(rect);
    expect(added.text).toBe('Text');
    expect(added.style).toMatchObject({ fill: '#112233', color: '#ffffff', align: 'center' });
    expect(hasShapeText(added)).toBe(true);
    expect(setTypedText(added, 'GO').text).toBe('GO');
    expect(setTypedText(rect, 'NEW')).toMatchObject({ text: 'NEW', style: { fill: '#112233', color: '#ffffff' } });
    const bound = { ...added, bind: { text: { path: 'rank' }, fill: { path: 'x' } } };
    const removed = removeShapeText(bound);
    expect(removed.text).toBeUndefined();
    expect(removed.bind).toEqual({ fill: { path: 'x' } });
    expect(removed.style).toEqual({ fill: '#112233' });
    expect(hasShapeText(removed)).toBe(false);
    // Emptied by typing: a shape loses its text, a text layer keeps an empty one.
    expect(hasShapeText(setTypedText(added, ''))).toBe(false);
    expect(disconnectText(bound, '3')).toMatchObject({ text: '3', bind: { fill: { path: 'x' } } });
  });

  test('the on-canvas editor commits on Enter, cancels on Esc, and keeps typing when closed by a click', () => {
    const doc = docWith([{ ...rect, text: 'OLD' }]);
    const commit = jest.fn(); const cancel = jest.fn();
    const props = { doc, id: 'box', zoom: 0.5, scope: {} as any, onCommit: commit, onCancel: cancel, onDisconnect: jest.fn(), onRebind: jest.fn() };
    const a = render(<InlineTextEditor {...props} />);
    const area = a.getByTestId('inline-text') as HTMLTextAreaElement;
    expect(area.value).toBe('OLD');
    fireEvent.change(area, { target: { value: 'NEW' } });
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(commit).toHaveBeenCalledWith('NEW');
    a.unmount();
    expect(commit).toHaveBeenCalledTimes(1);

    const b = render(<InlineTextEditor {...props} />);
    fireEvent.keyDown(b.getByTestId('inline-text'), { key: 'Escape' });
    expect(cancel).toHaveBeenCalled();
    b.unmount();
    expect(commit).toHaveBeenCalledTimes(1);

    const c = render(<InlineTextEditor {...props} />);
    fireEvent.change(c.getByTestId('inline-text'), { target: { value: 'KEPT' } });
    c.unmount();
    expect(commit).toHaveBeenLastCalledWith('KEPT');
  });

  test('text connected to data opens the data card, not a typing box', () => {
    const doc = docWith([{ ...rect, bind: { text: { path: 'rank' } } }]);
    const disconnect = jest.fn();
    const r = render(<InlineTextEditor doc={doc} id="box" zoom={1} scope={{ rank: 4 } as any} onCommit={jest.fn()} onCancel={jest.fn()} onDisconnect={disconnect} onRebind={jest.fn()} />);
    expect(r.queryByTestId('inline-text')).toBeNull();
    expect(r.getByTestId('inline-text-bound').textContent).toContain('rank');
    fireEvent.click(r.getByTestId('inline-text-disconnect'));
    expect(disconnect).toHaveBeenCalledWith('4');
  });
});

describe('live parts', () => {
  const empty = docWith([]);

  test.each(PARTS.map((p) => [p.id, p] as const))('part %s is a valid layout wherever it is placed', (_id, p) => {
    const placed = placePart(p, empty, []);
    const v = validateLayout(docWith([placed.el]));
    expect(v.errors).toEqual([]);
    for (const rows of ['raw', 'live'] as const) expect(validateLayout(docWith([materialize(p.build(rows), empty)])).errors).toEqual([]);
  });

  test('every part reacts to the match: each carries live rules or conditions', () => {
    for (const p of PARTS) {
      const json = JSON.stringify(placePart(p, empty, []).el);
      expect(/"clips"|"visibleWhen"|"styleWhen"/.test(json)).toBe(true);
    }
  });

  test('the LiveStats row fills one row per team with real values', () => {
    const placed = placePart('live-stats-row', empty, []);
    expect(placed.el.type).toBe('repeater');
    expect(placed.el.repeater?.source).toBe('derived.teams');
    expect(placed.note).toMatch(/team list/);
    const c = draw([placed.el]);
    const tagId = flatten([placed.el]).find((x) => x.el.name === 'Team tag')!.el.id;
    const tags = textOfLayer(c, tagId);
    expect(tags.length).toBeGreaterThan(4);
    expect(tags[0]).toBe(String(state.derived.teams[0].teamTag).toUpperCase());
    // Alive bars: 4 per team.
    const barId = flatten([placed.el]).find((x) => x.el.name === 'Health bar')!.el.id;
    expect(c.querySelectorAll(`[data-element-id$="${barId}"]`).length).toBe(tags.length * 4);
  });

  test('the sample match starts with one team firing and one outside the zone, so both show at once', () => {
    const placed = placePart('live-stats-row', empty, []);
    const idOf = (name: string) => flatten([placed.el]).find((x) => x.el.name === name)!.el.id;
    expect(state.derived.teams.filter((t: any) => t.hasFiring).length).toBe(1);
    expect(state.derived.teams.filter((t: any) => t.hasOutsideBlueCircle).length).toBe(1);
    const c = draw([placed.el]);
    expect(c.querySelectorAll(`[data-element-id$="${idOf('Firing bullet')}"]`).length).toBe(1);
    expect(c.querySelectorAll(`[data-element-id$="${idOf('Outside zone glow')}"]`).length).toBe(1);
  });

  test('the zone glow and firing bullet show only on teams with the flag on', () => {
    const placed = placePart('live-stats-row', empty, []);
    const idOf = (name: string) => flatten([placed.el]).find((x) => x.el.name === name)!.el.id;
    const teams = state.derived.teams.map((t: any, i: number) => ({ ...t, isAllDead: false, hasFiring: i === 0, hasOutsideBlueCircle: i === 1 }));
    const flagged = { ...state, derived: { ...state.derived, teams } };
    const c = render(<LayoutRenderer layout={docWith([placed.el])} state={flagged} events={null} fit={1} mode="editor" playTimelines={false} />).container;
    expect(c.querySelectorAll(`[data-element-id$="${idOf('Firing bullet')}"]`).length).toBe(1);
    expect(c.querySelectorAll(`[data-element-id$="${idOf('Outside zone glow')}"]`).length).toBe(1);
    const bullet = placePart('firing-bullet', empty, []).el;
    const b = bullet.type === 'path' ? bullet : bullet.children![0];
    expect(b.effects?.map((e) => e.type)).toEqual(['outerGlow', 'outerGlow']);
    expect(b.timeline!.clips[0].loop).toBe(true);
  });

  test('the top team photo stack shows the leading team’s four photos', () => {
    const placed = placePart('top-team-photos', empty, []);
    const c = draw([placed.el]);
    const photoId = flatten([placed.el]).find((x) => x.el.name === 'Player photo')!.el.id;
    const photos = c.querySelectorAll(`[data-element-id$="${photoId}"] img`);
    expect(photos.length).toBe(4);
    expect(photos[0].getAttribute('src')).toContain('def_char');
  });

  test('placement: in place inside the right list, wrapped anywhere else', () => {
    const teams: LayoutElement = { id: 'teams', type: 'repeater', x: 0, y: 0, w: 400, h: 600, repeater: { source: 'derived.teams', limit: 8, direction: 'column', itemHeight: 60 }, children: [] };
    const players: LayoutElement = { id: 'pl', type: 'repeater', x: 0, y: 0, w: 400, h: 600, repeater: { source: 'live.players', limit: 8, direction: 'column', itemHeight: 60 }, children: [] };
    const doc = docWith([teams, players]);
    expect(rowContextAt(doc, 'teams')).toEqual({ kind: 'team' });
    expect(rowContextAt(doc, 'pl')).toEqual({ kind: 'player', rows: 'live' });

    const inTeam = placePart('eliminated-stamp', doc, ['teams']);
    expect(inTeam.parentId).toBe('teams');
    expect(inTeam.el.type).toBe('rect');
    expect(inTeam.note).toBeUndefined();

    const photoInTeam = placePart('player-photo', doc, ['teams']);
    expect(photoInTeam.el.repeater?.source).toBe('item.players');
    expect(photoInTeam.el.repeater?.limit).toBe(4);

    const photoInPlayers = placePart('player-photo', doc, ['pl']);
    expect(photoInPlayers.el.type).toBe('rect');
    // live.players rows: the dead rule reads `item.dead`.
    expect(JSON.stringify(photoInPlayers.el.timeline)).toContain('item.dead');

    const photoAlone = placePart('player-photo', empty, []);
    expect(photoAlone.el.repeater?.source).toBe('live.players');
    expect(photoAlone.parentId).toBeNull();
  });

  test('the dead swipe settles grey and dimmed; the recall sweep is hidden until a recall', () => {
    const el = { ...rect } as LayoutElement;
    const built = EFFECTS.deadSwipe.build(el, DEFAULT_OPTIONS);
    const end = sampleClip({ id: 'c', trigger: { type: 'enter' }, duration: built.duration, tracks: built.tracks }, built.duration, null) as any;
    expect(end.grayscale).toBe(1);
    expect(end.opacity).toBeCloseTo(0.5);
    const sweep = placePart('recall-sweep', empty, []).el.children![0];
    const clip = sweep.timeline!.clips[0];
    expect(clip.trigger).toMatchObject({ type: 'event', event: 'recall' });
    const first = sampleClip(clip, 0, null) as any;
    expect(first.wipeL === 1 || first.wipeR === 1 || first.opacity === 0).toBe(true);
    const dead = placePart('dead-sweep', empty, []).el.children![0];
    const deadClip = dead.timeline!.clips[0];
    expect(deadClip.trigger).toMatchObject({ type: 'event', event: 'playerDeath', self: true });
    expect(dead.bind?.text?.path).toBe('event.payload.player.playerName');
    const deadFirst = sampleClip(deadClip, 0, null) as any;
    expect(deadFirst.wipeL === 1 || deadFirst.wipeR === 1 || deadFirst.opacity === 0).toBe(true);
  });

  test('the whole library together stays valid with unique ids', () => {
    let doc = empty;
    for (const p of PARTS) {
      const placed = placePart(p, doc, []);
      doc = docWith([...doc.elements, placed.el]);
    }
    expect(validateLayout(doc).errors).toEqual([]);
    const ids = flatten(doc.elements).map((x) => x.el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(locate(doc.elements, ids[0])).not.toBeNull();
  });
});
