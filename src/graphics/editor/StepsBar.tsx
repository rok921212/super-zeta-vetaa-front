// The guided steps strip under the toolbar (progress.ts): where the design is,
// what is missing, one click to the place that fixes it. Never a wizard: any
// step can be done in any order, and experienced users can fold it away
// (remembered per browser).

import React, { useState } from 'react';
import { nextStep, type DesignStep, type StepId } from './progress.ts';
import { cx } from './ui.tsx';

const HIDE_KEY = 'ss.designer.stepsHidden';

const readHidden = () => {
  try { return window.localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
};
const writeHidden = (v: boolean) => {
  try { window.localStorage.setItem(HIDE_KEY, v ? '1' : '0'); } catch { /* private window: not remembered */ }
};

export function StepsBar({ steps, onStep }: { steps: DesignStep[]; onStep(id: StepId): void }) {
  const [hidden, setHidden] = useState(readHidden);
  const next = nextStep(steps);
  const toggle = () => { setHidden(!hidden); writeHidden(!hidden); };
  const done = steps.filter((s) => s.done).length;

  if (hidden) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-white/5 bg-neutral-900/40 px-4 py-0.5 text-[11px] text-slate-500" data-testid="steps-bar">
        <span>{done}/{steps.length} steps{next ? ` · next: ${next.label}` : ' · ready'}</span>
        <button type="button" className="ml-auto hover:text-slate-200" onClick={toggle}>Show steps</button>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-white/5 bg-neutral-900/40 px-4 py-1 text-[11px]" data-testid="steps-bar">
      {steps.map((s, i) => (
        <button
          key={s.id}
          type="button"
          data-step={s.id}
          data-done={s.done ? '1' : '0'}
          title={s.hint}
          onClick={() => onStep(s.id)}
          className={cx(
            'flex items-center gap-1 rounded px-1.5 py-[1px]',
            s.done ? 'text-emerald-300/90 hover:bg-emerald-400/10' : next?.id === s.id ? 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/40' : 'text-slate-400 hover:bg-white/5',
          )}
        >
          <span aria-hidden>{s.done ? '✓' : `${i + 1}`}</span>
          {s.label}
          {s.optional && !s.done && <span className="text-slate-500">(optional)</span>}
        </button>
      ))}
      <span className="ml-2 min-w-0 flex-1 truncate text-slate-400" data-testid="steps-next">
        {next ? `Next: ${next.hint}` : 'Ready: everything is on air.'}
      </span>
      <button type="button" className="text-slate-500 hover:text-slate-200" onClick={toggle} title="Fold the steps away (remembered in this browser)">Hide</button>
    </div>
  );
}
