// Safe {{ … }} expressions (bindings/expr.ts), @when blocks in layer CSS, and
// "Show text instead" on style rules.

import React from 'react';
import { render } from '@testing-library/react';
import { createEmptyLayout, splitCustomCss, validateLayout } from '../schema/layoutSchema.js';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { evaluateExpression, expressionPaths, expressionProblem } from '../bindings/expr.ts';
import { fillTokens, tokenPaths, tokenProblems } from '../bindings/tokens.ts';
import { declarationProblems, layerCss } from '../renderer/customCss.ts';
import { resolveElementText } from '../bindings/index.ts';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { StyleWhenSection } from '../editor/inspector/StyleWhenSection.tsx';
import { fireEvent, screen } from '@testing-library/react';

const team = {
  teamName: 'Alpha', placePoints: 5, damage: 123.456, isFiring: false,
  players: [{ name: 'a', killNum: 2, isFiring: true }, { name: 'b', killNum: 3, isFiring: false }, { name: 'c', killNum: '1', isFiring: 'false' }],
};
const scope = { item: team, rank: 3, live: { aliveTeamsCount: 4 } } as any;
const ev = (src: string, s: any = scope) => evaluateExpression(src, s);

describe('expressions', () => {
  test('reads paths, including [index] and .length', () => {
    expect(ev('item.players[0].isFiring')).toBe(true);
    expect(ev('item.players.length')).toBe(3);
    expect(ev('item.players[1 + 1].name')).toBe('c');
    expect(ev("item['teamName']")).toBe('Alpha');
  });

  test('operators and precedence', () => {
    expect(ev('1 + 2 * 3')).toBe(7);
    expect(ev('(1 + 2) * 3')).toBe(9);
    expect(ev('rank == "3"')).toBe(true);
    expect(ev('rank === "3"')).toBe(false);
    expect(ev('rank > 2 && live.aliveTeamsCount <= 4')).toBe(true);
    expect(ev('!item.isFiring')).toBe(true);
    expect(ev('-rank')).toBe(-3);
    expect(ev("'#' + rank")).toBe('#3');
    expect(ev('item.nope ?? "TBD"')).toBe('TBD');
    expect(ev('item.nope || item.teamName')).toBe('Alpha');
    expect(ev('10 / 0')).toBeUndefined();
  });

  test('ternary: the firing bullet', () => {
    expect(ev("item.players[0].isFiring ? '•' : rank")).toBe('•');
    expect(ev("item.players[1].isFiring ? '•' : rank")).toBe(3);
    expect(ev("item.players[2].isFiring ? '•' : rank")).toBe(3); // "false" from text data is false
  });

  test('helpers and pipes', () => {
    expect(ev("sum(item.players, 'killNum') * 10 + item.placePoints")).toBe(65);
    expect(ev("count(item.players, 'isFiring')")).toBe(1);
    expect(ev("any(item.players, 'isFiring')")).toBe(true);
    expect(ev("all(item.players, 'isFiring')")).toBe(false);
    expect(ev('item.damage | fixed(1)')).toBe('123.5');
    expect(ev('round(item.damage, 2)')).toBe(123.46);
    expect(ev('upper(item.teamName)')).toBe('ALPHA');
    expect(ev('rank | ordinal')).toBe('3rd');
    expect(ev('item.teamName | lower | upper')).toBe('ALPHA');
    expect(ev('max(1, 9, 4)')).toBe(9);
    expect(ev('pad(rank, 3)')).toBe('003');
    expect(ev("if(item.isFiring, 'yes', 'no')")).toBe('no');
    expect(ev('12345 | number')).toBe('12,345');
  });

  test('can never reach outside the data', () => {
    for (const bad of [
      'item.constructor', 'item.__proto__', "item['constructor']", 'item.players.constructor',
      'window', 'globalThis.alert', 'Function', 'alert(1)', 'item.teamName.toUpperCase()', 'this',
      '(' .repeat(60) + '1' + ')'.repeat(60), '1 +'.repeat(300) + '1',
    ]) {
      expect(() => ev(bad)).not.toThrow();
      const v = ev(bad);
      expect(typeof v === 'function' || (typeof v === 'object' && v !== null)).toBe(false);
    }
    expect(ev("item['__proto__']")).toBeUndefined();
  });

  test('explains problems', () => {
    expect(expressionProblem("item.isFiring ? '•' : rank")).toBeNull();
    expect(expressionProblem('item.isFiring ?')?.message).toMatch(/ends too early/);
    expect(expressionProblem('alert(1)')?.message).toMatch(/not a helper/);
    expect(expressionProblem('hello')?.message).toMatch(/not data/);
    expect(expressionProblem("'open")?.message).toMatch(/never closed/);
  });

  test('lists the data it reads', () => {
    expect(expressionPaths("item.players[0].isFiring ? '•' : sum(item.players, 'killNum')").sort()).toEqual(['item.players', 'item.players[0].isFiring']);
  });
});

describe('{{ }} tokens', () => {
  test('old forms behave exactly as before', () => {
    expect(fillTokens('{{item.teamName}} #{{rank}}', scope)).toBe('Alpha #3');
    expect(fillTokens('{{item.teamName|upper}}', scope)).toBe('ALPHA');
    expect(fillTokens('[{{item.missing}}]', scope)).toBe('[]');
    expect(fillTokens('{{item.players}}', scope)).toBe('');
  });

  test('expressions inside tokens', () => {
    expect(fillTokens("{{ item.players[0].isFiring ? '•' : rank }} {{ item.damage | fixed(1) }} PTS", scope)).toBe('• 123.5 PTS');
    expect(tokenPaths("{{ item.isFiring ? item.teamName : rank }}").sort()).toEqual(['item.isFiring', 'item.teamName', 'rank']);
    expect(tokenProblems('ok {{rank}}\n{{ rank > }}')).toEqual([expect.objectContaining({ line: 2, token: '{{ rank > }}' })]);
  });
});

describe('layer CSS: values from expressions and @when blocks', () => {
  const css = "color: {{ item.isFiring ? '#ff5a1f' : '#ffffff' }};\nborder-radius: 4px;\n@when item.isFiring && rank <= 3 {\n  background: #ff5a1f;\n  transform: scale(1.1);\n}";

  test('applies and un-applies as the data changes', () => {
    expect(layerCss(css, { ...scope, item: { ...team, isFiring: true } })).toEqual({ color: '#ff5a1f', borderRadius: '4px', background: '#ff5a1f', transform: 'scale(1.1)' });
    expect(layerCss(css, scope)).toEqual({ color: '#ffffff', borderRadius: '4px' });
  });

  test('a later block wins; placement stays blocked inside blocks', () => {
    const two = 'color: red; @when rank > 1 { color: blue; width: 9px } @when rank > 2 { color: green }';
    expect(layerCss(two, scope)).toEqual({ color: 'green' });
  });

  test('problems: the bare token the user typed, braces, bad conditions', () => {
    expect(declarationProblems('{{item.players[0].isFiring}}')).toEqual([{ line: 1, message: expect.stringMatching(/Data goes inside a value/) }]);
    expect(declarationProblems(css)).toEqual([]);
    expect(declarationProblems('a { color: red }')[0].message).toMatch(/Only declarations/);
    expect(declarationProblems('@when rank { @when x { } }')[0].message).toMatch(/nested/);
    expect(declarationProblems('@when rank { color: red')[0].message).toMatch(/never closed/);
    expect(declarationProblems('@when rank > { color: red }')[0].message).toMatch(/^@when:/);
    expect(declarationProblems('color: {{ rank > }}')[0].message).toMatch(/ends too early/);
  });

  test('line numbers stay those of the whole box', () => {
    const parts = splitCustomCss('color: red;\n@when rank {\n  colr blue;\n}');
    expect(parts.blocks[0].line).toBe(2);
    expect(declarationProblems('color: red;\n@when rank {\n  colr blue;\n}')).toEqual([{ line: 3, message: '“colr blue” is not property: value' }]);
  });
});

describe('schema', () => {
  const doc = (elements: LayoutElement[]) => ({ ...createEmptyLayout(), elements }) as LayoutDocument;
  const rect = (extra: Partial<LayoutElement>): LayoutElement => ({ id: 'r1', type: 'rect', x: 0, y: 0, w: 100, h: 50, ...extra });

  test('accepts tokens and @when blocks in layer CSS, and text on style rules', () => {
    expect(validateLayout(doc([rect({ customCss: 'box-shadow: 0 0 8px {{item.teamColor}}; @when item.isFiring { color: red }' })])).errors).toEqual([]);
    expect(validateLayout(doc([{ id: 't', type: 'text', x: 0, y: 0, w: 10, h: 10, text: '{{rank}}', styleWhen: [{ when: { path: 'item.isFiring', op: 'equals', value: true }, text: '•' }] }])).errors).toEqual([]);
  });

  test('refuses rules, nesting and stray braces', () => {
    for (const customCss of ['a { color: red }', '@when x { @when y { } }', 'color: red }', '@when { color: red }']) {
      expect(validateLayout(doc([rect({ customCss })])).ok).toBe(false);
    }
    expect(validateLayout(doc([rect({ styleWhen: [{ when: { path: 'rank', op: 'equals', value: 1 }, text: 5 as any }] })])).ok).toBe(false);
  });
});

describe('Show text instead', () => {
  const textEl = (extra: Partial<LayoutElement> = {}): LayoutElement => ({
    id: 't', type: 'text', x: 0, y: 0, w: 100, h: 30, text: 'Rank {{tournament.rank}}',
    styleWhen: [{ when: { path: 'tournament.firing', op: 'equals', value: true }, text: '•' }],
    ...extra,
  });

  test('the last matching rule with a text wins', () => {
    const el = textEl({ styleWhen: [
      { when: { path: 'rank', op: 'equals', value: 3 }, text: 'A' },
      { when: { path: 'rank', op: 'equals', value: 3 }, style: { color: '#fff' } },
      { when: { path: 'rank', op: 'equals', value: 3 }, text: '{{ rank * 2 }}' },
    ] });
    expect(resolveElementText(el, scope)).toBe('{{ rank * 2 }}');
    expect(resolveElementText(el, { ...scope, rank: 1 })).toBeUndefined();
  });

  test('swaps the text on the canvas while the rule holds', () => {
    const layout = { ...createEmptyLayout(), elements: [textEl()] } as LayoutDocument;
    const { container, rerender } = render(<LayoutRenderer layout={layout} state={{ tournament: { rank: 2, firing: false } } as any} fit={1} />);
    expect(container.textContent).toContain('Rank 2');
    rerender(<LayoutRenderer layout={layout} state={{ tournament: { rank: 2, firing: true } } as any} fit={1} />);
    expect(container.textContent).toContain('•');
    expect(container.textContent).not.toContain('Rank 2');
  });
});

describe('Inspector: Change style when…', () => {
  const textLayer: LayoutElement = { id: 't', type: 'text', x: 0, y: 0, w: 100, h: 30, text: '{{rank}}' };
  const mount = (el: LayoutElement, inList = true) => {
    let current = el;
    const edit = jest.fn((_f: string, fn: (e: LayoutElement) => LayoutElement) => { current = fn(current); });
    const view = render(<StyleWhenSection el={el} edit={edit} scope={(inList ? { item: { isFiring: true }, rank: 1 } : {}) as any} renderCondition={() => null} />);
    return { view, edit, get: () => current };
  };

  test('the firing → bullet preset adds a rule that swaps the text', () => {
    const { get } = mount(textLayer);
    fireEvent.click(screen.getByText('Player firing → bullet'));
    const rule = get().styleWhen![0];
    expect(rule.text).toBe('•');
    expect(resolveElementText(get(), { item: { isFiring: true } } as any)).toBe('•');
    expect(resolveElementText(get(), { item: { isFiring: true, bHasDied: true } } as any)).toBeUndefined();
  });

  test('a rule on a text layer has a "Show text instead" field; a plain box has neither', () => {
    const withRule = { ...textLayer, styleWhen: [{ when: { path: 'rank', op: 'equals' as const, value: 1 } }] };
    const { get, view } = mount(withRule);
    fireEvent.change(screen.getByLabelText('Rule 1 text'), { target: { value: 'X' } });
    expect(get().styleWhen![0].text).toBe('X');
    screen.getByText('Show text instead');
    view.unmount();

    const box: LayoutElement = { id: 'b', type: 'rect', x: 0, y: 0, w: 10, h: 10, styleWhen: [{ when: { path: 'rank', op: 'equals', value: 1 } }] };
    const other = render(<StyleWhenSection el={box} edit={jest.fn()} scope={{ item: {} } as any} renderCondition={() => null} />);
    expect(other.queryByText('Player firing → bullet')).toBeNull();
    expect(other.queryAllByText('Show text instead')).toHaveLength(0);
  });
});
