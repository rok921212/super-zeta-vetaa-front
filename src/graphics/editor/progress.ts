// The guided path through a design, worked out from the design itself: which
// step a beginner is on and what is still missing. Nothing here forces an
// order: every step can be done at any time; this only says how far along the
// design is. Built on the publish checks (publishChecks.ts) so "Check" means
// exactly what Publish will refuse. Pure.

import type { PublishReport } from './publishChecks.ts';

export type StepId = 'start' | 'size' | 'data' | 'animate' | 'preview' | 'check' | 'save' | 'publish';

export interface DesignStep {
  id: StepId;
  label: string;
  done: boolean;
  /** Skippable: a design can go on air without it. */
  optional?: boolean;
  /** What to do next (when not done), or what was found (when done). */
  hint: string;
}

export interface ProgressInput {
  report: PublishReport;
  stage: { width: number; height: number };
  /** The canvas is showing data: SIMULATION, or LIVE with a tournament and round picked. */
  previewing: boolean;
  unsaved: boolean;
  draftRev: number | null;
  publishedRev: number;
  /** null/undefined = the server does not say (published before it was recorded). */
  publishedDraftRev?: number | null;
}

export function designProgress(p: ProgressInput): DesignStep[] {
  const { summary, errors } = p.report;
  const hasLayers = summary.layers > 0;
  const published = p.publishedRev > 0;
  // Unknown publishedDraftRev: trust a clean save right after a publish only.
  const behind = published && p.publishedDraftRev != null && p.draftRev != null && p.draftRev > p.publishedDraftRev;
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  return [
    { id: 'start', label: 'Start', done: hasLayers, hint: hasLayers ? plural(summary.layers, 'layer') : 'Pick a template, or add a layer from Insert.' },
    { id: 'size', label: `Size ${p.stage.width}×${p.stage.height}`, done: true, hint: 'Change it in Document settings (nothing selected).' },
    {
      id: 'data', label: 'Connect data', done: summary.boundLayers > 0,
      hint: summary.boundLayers ? `${plural(summary.boundLayers, 'layer')} show live data` : 'Select a layer and press “Connect to live data”, or drag a field from the Data tab.',
    },
    {
      id: 'animate', label: 'Motion', done: summary.animatedLayers > 0, optional: true,
      hint: summary.animatedLayers ? `${plural(summary.animatedLayers, 'layer')} animated` : 'Optional: add an entrance or a rule in the Animate panel.',
    },
    { id: 'preview', label: 'Try with data', done: p.previewing, hint: p.previewing ? 'The canvas is showing data' : 'Switch to SIMULATION, or pick a tournament and round for LIVE.' },
    {
      id: 'check', label: 'Check', done: hasLayers && errors.length === 0,
      hint: !hasLayers ? 'Nothing to check yet.' : errors.length ? `${plural(errors.length, 'problem')} to fix before publishing` : 'No problems found',
    },
    { id: 'save', label: 'Saved', done: !p.unsaved, hint: p.unsaved ? 'Unsaved changes: press Save (Ctrl+S).' : 'Saved' },
    {
      id: 'publish', label: 'On air', done: published && !behind && !p.unsaved,
      hint: !published ? 'Publish, then copy the OBS link.' : behind || p.unsaved ? 'Changes not on air yet: publish again.' : 'On air: copy the OBS link from Publish.',
    },
  ];
}

/** The first required step that is not done (where a beginner should look next); null when all are done. */
export const nextStep = (steps: DesignStep[]): DesignStep | null => steps.find((s) => !s.done && !s.optional) ?? null;
