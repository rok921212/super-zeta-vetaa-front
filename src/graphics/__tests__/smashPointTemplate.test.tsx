// Smash Point in the Designer: the bar's layers (templates/smashPoint.ts) are
// valid, hidden unless the match has Smash Point on with a value, and show the
// operator's label and value. Used by the Insert part, the standalone
// template and the Live Stats rebuild.

import React from 'react';
import { render } from '@testing-library/react';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
import { smashPointBar } from '../templates/smashPoint.ts';
import { TEMPLATES } from '../templates/index.ts';
import { PARTS_BY_ID } from '../templates/parts.ts';

const doc = (): any => {
  const d = { ...createEmptyLayout(), elements: [smashPointBar('sp', 0, 0, 520, 44)] };
  const v = validateLayout(d);
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return d;
};
const state = (smashPoint: unknown) => ({ match: { _id: 'm1', smashPoint } }) as any;
const show = (smashPoint: unknown) => {
  const { container } = render(<LayoutRenderer layout={doc()} state={state(smashPoint)} events={null} fit={1} />);
  return {
    bar: container.querySelector('[data-element-id="sp"]'),
    text: (id: string) => container.querySelector(`[data-element-id="${id}"]`)?.textContent,
  };
};

test('hidden while Smash Point is off, unset or blank', () => {
  expect(show(undefined).bar).toBeNull();
  expect(show({ enabled: false, value: '80' }).bar).toBeNull();
  expect(show({ enabled: true, value: '' }).bar).toBeNull();
});

test('shows the value, and the default label when none is typed', () => {
  const v = show({ enabled: true, value: '80', displayText: '' });
  expect(v.bar).not.toBeNull();
  expect(v.text('sp_value')).toBe('80');
  expect(v.text('sp_label')).toBe('SMASH POINT');
  expect(show({ enabled: true, value: 120, displayText: 'Match point' }).text('sp_label')).toBe('MATCH POINT');
});

test('the template, the Insert part and the Live Stats rebuild all carry the bar', () => {
  const ids = (els: any[]): string[] => els.flatMap((e) => [e.id, ...ids(e.children || [])]);
  expect(TEMPLATES.find((t) => t.id === 'smash-point')).toBeDefined();
  expect(ids(TEMPLATES.find((t) => t.id === 'rb-live-stats')!.elements)).toContain('rls_smash');
  expect(PARTS_BY_ID['smash-point'].build('raw').visibleWhen).toBeDefined();
});
