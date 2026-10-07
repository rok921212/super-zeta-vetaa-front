import { resolvePath, resolvePathDetailed } from '../bindings/resolve.ts';
import { applyFormatter } from '../bindings/formatters.ts';
import { evaluateCondition } from '../bindings/conditions.ts';
import {
  buildScope,
  diagnoseElement,
  resolveBinding,
  resolveElementStyle,
  resolveRepeaterItems,
  itemScope,
} from '../bindings/index.ts';
import { createEmptyLayout, validateLayout, normalizeLayout, migrateLayout, isSafeUrl } from '../schema/layoutSchema.js';

const state = {
  tournament: { tournamentName: 'Parity Cup' },
  match: { map: 'Erangel', matchNo: 3 },
  derived: {
    teams: [
      { teamId: 'a', teamName: 'Alpha', totalKills: 7, isAllDead: false, players: [{ uId: '1', playerName: 'P1', health: 50, healthMax: 100 }] },
      { teamId: 'b', teamName: 'Bravo', totalKills: 2, isAllDead: true, players: [] },
      { teamId: 'c', teamName: 'Charlie', totalKills: 4, isAllDead: false, players: [] },
    ],
  },
};
const layout = { ...createEmptyLayout(), variables: { accentColor: '#ff0' } };
const scope = buildScope(state as any, layout as any);

describe('resolvePath', () => {
  test('reads whitelisted roots, arrays and length', () => {
    expect(resolvePath(scope, 'derived.teams[0].teamName')).toBe('Alpha');
    expect(resolvePath(scope, 'derived.teams.length')).toBe(3);
    expect(resolvePath(scope, 'variables.accentColor')).toBe('#ff0');
    expect(resolvePath(scope, 'theme.colors.primary')).toBe('#e11d2e');
  });
  test('never reaches prototypes, non-whitelisted roots or globals', () => {
    expect(resolvePath(scope, 'derived.teams.constructor')).toBeUndefined();
    expect(resolvePath(scope, 'derived.__proto__')).toBeUndefined();
    expect(resolvePath(scope, 'window.location')).toBeUndefined();
    expect(resolvePath(scope, 'derived.teams[0].teamName.toString')).toBeUndefined();
    expect(resolvePath(scope, 'derived.teams[9].teamName')).toBeUndefined();
  });
  test('detailed result reports the first missing segment', () => {
    const r = resolvePathDetailed(scope, 'derived.teams[0].nope.x');
    expect(r.found).toBe(false);
    expect(r.missingAt).toBe(3); // derived, teams, [0], nope
  });
});

describe('formatters', () => {
  test.each([
    ['upper', 'abc', 'ABC'],
    ['pad2', 7, '07'],
    ['percent', 42.4, '42%'],
    ['ordinal', 1, '1st'],
    ['ordinal', 12, '12th'],
    ['ordinal', 23, '23rd'],
    ['time', 125, '02:05'],
    ['duration', 65, '1m 05s'],
    ['plusMinus', 3, '+3'],
    ['number', 12345, '12,345'],
    ['fixed1', 2.345, '2.3'],
  ])('%s(%p) = %p', (name, v, out) => {
    expect(applyFormatter(name, v)).toBe(out);
  });
  test('healthPercent uses the item healthMax; unknown formatter passes through', () => {
    expect(applyFormatter('healthPercent', 50, { item: { healthMax: 200 } })).toBe(25);
    expect(applyFormatter('nope', 5)).toBe(5);
  });
});

describe('conditions', () => {
  const s = { ...scope, item: state.derived.teams[1] };
  test('leaf operators with loose typing', () => {
    expect(evaluateCondition({ path: 'item.isAllDead', op: 'equals', value: true }, s)).toBe(true);
    expect(evaluateCondition({ path: 'item.totalKills', op: 'greaterThan', value: '1' }, s)).toBe(true);
    expect(evaluateCondition({ path: 'item.teamName', op: 'contains', value: 'rav' }, s)).toBe(true);
    expect(evaluateCondition({ path: 'item.nope', op: 'notExists' }, s)).toBe(true);
  });
  test('all / any / not', () => {
    expect(evaluateCondition({ all: [{ path: 'item.isAllDead', op: 'equals', value: true }, { not: { path: 'item.totalKills', op: 'equals', value: 0 } }] }, s)).toBe(true);
    expect(evaluateCondition({ any: [{ path: 'item.totalKills', op: 'greaterThan', value: 10 }, { path: 'item.teamId', op: 'equals', value: 'x' }] }, s)).toBe(false);
  });
});

describe('bindings', () => {
  test('format, prefix/suffix and fallback', () => {
    expect(resolveBinding({ path: 'derived.teams[0].teamName', format: 'upper', prefix: '#1 ' }, scope)).toBe('#1 ALPHA');
    expect(resolveBinding({ path: 'derived.teams[5].teamName', fallback: 'TBD' }, scope)).toBe('TBD');
  });
  test('style tokens and styleWhen rules', () => {
    const el: any = {
      id: 'x', type: 'rect', x: 0, y: 0, w: 1, h: 1,
      style: { fill: { ref: 'variables.accentColor' } },
      styleWhen: [{ when: { path: 'item.isAllDead', op: 'equals', value: true }, style: { grayscale: 1 }, opacity: 0.35 }],
    };
    const r = resolveElementStyle(el, { ...scope, item: state.derived.teams[1] });
    expect(r.style.fill).toBe('#ff0');
    expect(r.style.grayscale).toBe(1);
    expect(r.opacity).toBe(0.35);
  });
  test('repeater: filter, sort, offset/limit, rank', () => {
    const items = resolveRepeaterItems({
      source: 'derived.teams', limit: 2, direction: 'column',
      filter: { path: 'item.isAllDead', op: 'equals', value: false },
      sort: { path: 'item.totalKills', dir: 'desc' },
    }, scope);
    expect(items.map((t) => t.teamId)).toEqual(['a', 'c']);
    expect(itemScope(scope, items[1], 1, 3).rank).toBe(5);
    expect(resolveRepeaterItems({ source: 'derived.teams', limit: 1, offset: 1, direction: 'row' }, scope)[0].teamId).toBe('b');
  });
});

describe('diagnoseElement', () => {
  test('explains a missing binding path and a failed condition', () => {
    const doc: any = normalizeLayout({
      ...createEmptyLayout(),
      elements: [{
        id: 'rep', type: 'repeater', x: 0, y: 0, w: 400, h: 400,
        repeater: { source: 'derived.teams', limit: 3, direction: 'column' },
        children: [{
          id: 'kills', type: 'text', x: 0, y: 0, w: 100, h: 30,
          bind: { text: { path: 'item.killz' } },
          visibleWhen: { path: 'item.isAllDead', op: 'equals', value: true },
        }],
      }],
    });
    const d = diagnoseElement(doc, 'kills', scope)!;
    expect(d.bindings[0].found).toBe(false);
    expect(d.bindings[0].missingSegment).toBe('killz');
    const labels = Object.fromEntries(d.checks.map((c) => [c.label, c.ok]));
    expect(labels['Visibility condition passed']).toBe(false);
    expect(labels['Repeater "rep" has items']).toBe(true);
  });
});

describe('schema', () => {
  test('migrate v0 stage w/h, normalize defaults, validate', () => {
    const m = migrateLayout({ stage: { w: 1280, h: 720 }, elements: [] });
    expect(m.schemaVersion).toBe(1);
    expect(m.stage.width).toBe(1280);
    const n = normalizeLayout(m);
    expect(n.variables).toEqual({});
    expect(validateLayout(n).ok).toBe(true);
  });
  test('URL rules', () => {
    expect(isSafeUrl('https://cdn.example.com/a.png')).toBe(true);
    expect(isSafeUrl('/def_logo.avif')).toBe(true);
    expect(isSafeUrl('//evil.example/a.png')).toBe(false);
    expect(isSafeUrl('http://x.example/a.png')).toBe(false);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('/a/../b')).toBe(false);
  });
});
