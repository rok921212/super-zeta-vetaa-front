// The guided steps (editor/progress.ts + StepsBar): worked out from the design,
// never a forced order.

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { designProgress, nextStep } from '../editor/progress.ts';
import { StepsBar } from '../editor/StepsBar.tsx';
import type { PublishReport } from '../editor/publishChecks.ts';

const report = (over: Partial<PublishReport['summary']> = {}, errors = 0): PublishReport => ({
  errors: Array.from({ length: errors }, () => ({ level: 'error' as const, elementId: null, layer: 'Design', message: 'x' })),
  warnings: [],
  summary: { layers: 0, boundLayers: 0, animatedLayers: 0, animations: 0, dataSources: [], images: 0, ...over },
});
const base = { stage: { width: 1920, height: 1080 }, previewing: false, unsaved: false, draftRev: 1, publishedRev: 0, publishedDraftRev: null };
const byId = (steps: ReturnType<typeof designProgress>) => Object.fromEntries(steps.map((s) => [s.id, s]));

test('a blank design: start first, size always set, animate optional', () => {
  const s = designProgress({ ...base, report: report() });
  expect(nextStep(s)?.id).toBe('start');
  expect(byId(s).size).toMatchObject({ done: true, label: 'Size 1920×1080' });
  expect(byId(s).animate.optional).toBe(true);
});

test('layers without data: connect data is next, and its hint says how', () => {
  const s = designProgress({ ...base, report: report({ layers: 3 }) });
  expect(nextStep(s)?.id).toBe('data');
  expect(nextStep(s)?.hint).toMatch(/Connect to live data/);
});

test('check follows the publish errors; publish follows publishedDraftRev', () => {
  const ready = { ...base, previewing: true, report: report({ layers: 3, boundLayers: 2 }) };
  expect(byId(designProgress({ ...ready, report: report({ layers: 3, boundLayers: 2 }, 2) })).check).toMatchObject({ done: false, hint: '2 problems to fix before publishing' });
  expect(nextStep(designProgress(ready))?.id).toBe('publish');
  const live = designProgress({ ...ready, draftRev: 4, publishedRev: 2, publishedDraftRev: 4 });
  expect(nextStep(live)).toBeNull();
  const edited = designProgress({ ...ready, draftRev: 5, publishedRev: 2, publishedDraftRev: 4 });
  expect(byId(edited).publish).toMatchObject({ done: false, hint: expect.stringMatching(/not on air yet/) });
  expect(byId(designProgress({ ...ready, unsaved: true, publishedRev: 2, publishedDraftRev: 1 })).save.done).toBe(false);
});

test('the strip marks the next step, jumps on click, and folds away', () => {
  const onStep = jest.fn();
  const steps = designProgress({ ...base, report: report({ layers: 3 }) });
  render(<StepsBar steps={steps} onStep={onStep} />);
  expect(screen.getByTestId('steps-next')).toHaveTextContent(/Next: Select a layer/);
  fireEvent.click(document.querySelector('[data-step="data"]')!);
  expect(onStep).toHaveBeenCalledWith('data');
  fireEvent.click(screen.getByText('Hide'));
  expect(screen.getByTestId('steps-bar')).toHaveTextContent(/next: Connect data/);
  fireEvent.click(screen.getByText('Show steps'));
  expect(document.querySelector('[data-step="data"]')).not.toBeNull();
});
