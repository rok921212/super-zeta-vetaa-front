import { AutosaveController, type SavePatch, type SaveStatus } from '../editor/autosave.ts';
import { ConflictError, LockedError } from '../api.ts';
import { createEmptyLayout } from '../schema/layoutSchema.js';

const doc = (n: number) => ({ ...createEmptyLayout(), variables: { n } }) as any;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/** Let time pass: with manual saving, nothing may ever happen because of it. */
async function wait(ms: number) {
  jest.advanceTimersByTime(ms);
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function setup(saveImpl?: (rev: number, patch: SavePatch) => Promise<{ draftRev: number }>) {
  const calls: Array<{ rev: number; patch: SavePatch }> = [];
  const statuses: SaveStatus[] = [];
  const conflicts: number[] = [];
  const save = jest.fn(async (rev: number, patch: SavePatch) => {
    calls.push({ rev, patch });
    return saveImpl ? saveImpl(rev, patch) : { draftRev: rev + 1 };
  });
  const c = new AutosaveController({ rev: 3, save, onStatus: (s) => statuses.push(s), onConflict: (r) => conflicts.push(r) });
  return { c, save, calls, statuses, conflicts };
}

test('nothing is ever saved by itself: edits only mark the layout unsaved', async () => {
  const { c, calls } = setup();
  c.change(doc(1));
  c.changeMeta({ name: 'New name' });
  c.hold(true);
  c.hold(false);
  await wait(10 * 60 * 1000);
  expect(calls).toHaveLength(0);
  expect(c.status).toBe('dirty');
  expect(c.dirty).toBe(true);
  expect(jest.getTimerCount()).toBe(0); // no timer was even scheduled
});

test('save() sends ONE request with the latest document and metadata', async () => {
  const { c, calls } = setup();
  c.change(doc(1));
  c.change(doc(2));
  c.changeMeta({ name: 'New name' });
  await c.save();
  expect(calls).toHaveLength(1);
  expect(calls[0].rev).toBe(3);
  expect(calls[0].patch.draft!.variables.n).toBe(2);
  expect(calls[0].patch.name).toBe('New name');
  expect(c.rev).toBe(4);
  expect(c.status).toBe('saved');
  expect(c.dirty).toBe(false);
  await c.save(); // nothing new: nothing sent
  expect(calls).toHaveLength(1);
});

test('flush() is the same thing (Ctrl+S, Publish, Lock)', async () => {
  const { c, calls } = setup();
  c.change(doc(1));
  await c.flush();
  expect(calls).toHaveLength(1);
  expect(c.status).toBe('saved');
});

test('single-flight: a change made during a save stays unsaved until the next save', async () => {
  let resolveFirst!: (v: { draftRev: number }) => void;
  let n = 0;
  const { c, calls } = setup((rev) => {
    n++;
    if (n === 1) return new Promise((r) => { resolveFirst = r; });
    return Promise.resolve({ draftRev: rev + 1 });
  });
  c.change(doc(1));
  const first = c.save();
  await wait(0);
  expect(calls).toHaveLength(1);
  c.change(doc(2));
  resolveFirst({ draftRev: 4 });
  await first;
  await wait(60 * 1000);
  expect(calls).toHaveLength(1); // not sent on its own
  expect(c.status).toBe('dirty');
  await c.save();
  expect(calls).toHaveLength(2);
  expect(calls[1].rev).toBe(4);
  expect(calls[1].patch.draft!.variables.n).toBe(2);
});

test('two save() calls while one is in flight never overlap', async () => {
  let resolveFirst!: (v: { draftRev: number }) => void;
  const { c, calls } = setup(() => new Promise((r) => { resolveFirst = r; }));
  c.change(doc(1));
  const a = c.save();
  const b = c.save();
  await wait(0);
  expect(calls).toHaveLength(1);
  resolveFirst({ draftRev: 4 });
  await Promise.all([a, b]);
  expect(calls).toHaveLength(1);
});

test('a failed save keeps the changes, says so, and is NOT retried automatically', async () => {
  let fail = true;
  const { c, calls, statuses } = setup(async (rev) => {
    if (fail) throw new Error('network');
    return { draftRev: rev + 1 };
  });
  c.change(doc(1));
  await c.save();
  expect(c.status).toBe('error');
  expect(c.dirty).toBe(true);
  fail = false;
  await wait(10 * 60 * 1000);
  expect(calls).toHaveLength(1);
  await c.save(); // the user presses Save again
  expect(calls).toHaveLength(2);
  expect(calls[1].patch.draft!.variables.n).toBe(1);
  expect(c.status).toBe('saved');
  expect(statuses).toContain('error');
});

test('409 conflict blocks saving and never overwrites until resolved', async () => {
  const { c, calls, conflicts } = setup(async () => { throw new ConflictError(9); });
  c.change(doc(1));
  await c.save();
  expect(c.status).toBe('conflict');
  expect(conflicts).toEqual([9]);
  c.change(doc(2));
  await c.save();
  expect(calls).toHaveLength(1); // blocked
});

test('keep mine: resume with the server rev, then save re-sends the local doc', async () => {
  let conflict = true;
  const { c, calls } = setup(async (rev) => {
    if (conflict) throw new ConflictError(9);
    return { draftRev: rev + 1 };
  });
  c.change(doc(1));
  await c.save();
  conflict = false;
  c.resume(9, true);
  expect(c.status).toBe('dirty');
  expect(calls).toHaveLength(1); // resume alone writes nothing
  await c.save();
  expect(calls).toHaveLength(2);
  expect(calls[1].rev).toBe(9);
  expect(calls[1].patch.draft!.variables.n).toBe(1);
  expect(c.rev).toBe(10);
});

test('reload server version: resume dropping local changes leaves nothing to save', async () => {
  const { c, calls } = setup(async () => { throw new ConflictError(9); });
  c.change(doc(1));
  await c.save();
  c.resume(9, false);
  await c.save();
  expect(calls).toHaveLength(1);
  expect(c.status).toBe('saved');
  expect(c.rev).toBe(9);
});

test('423 locked blocks saving', async () => {
  const { c, calls } = setup(async () => { throw new LockedError(); });
  c.change(doc(1));
  await c.save();
  expect(c.status).toBe('locked');
  c.change(doc(2));
  await c.save();
  expect(calls).toHaveLength(1);
});

describe('opt-in autosave', () => {
  test('debounced: a burst of edits becomes ONE save, AUTOSAVE_DELAY_MS after the last edit', async () => {
    const { c, calls } = setup();
    c.setAuto(true);
    c.change(doc(1));
    await wait(1500);
    c.change(doc(2));
    await wait(1500);
    expect(calls).toHaveLength(0);
    await wait(600);
    expect(calls).toHaveLength(1);
    expect((calls[0].patch.draft as any).variables.n).toBe(2);
    expect(c.status).toBe('saved');
  });

  test('a held gesture never saves mid-drag; releasing reschedules', async () => {
    const { c, calls } = setup();
    c.setAuto(true);
    c.hold(true);
    c.change(doc(1));
    await wait(10000);
    expect(calls).toHaveLength(0);
    c.hold(false);
    await wait(2100);
    expect(calls).toHaveLength(1);
  });

  test('network failures retry with backoff; a conflict is never retried', async () => {
    let fail = 2;
    const { c, calls } = setup(async (rev) => { if (fail-- > 0) throw new Error('offline'); return { draftRev: rev + 1 }; });
    c.setAuto(true);
    c.change(doc(1));
    await wait(2000); // first try fails
    expect(c.status).toBe('error');
    await wait(2000); // retry 1 (2s) fails
    expect(calls).toHaveLength(2);
    await wait(4000); // retry 2 (4s) succeeds
    expect(calls).toHaveLength(3);
    expect(c.status).toBe('saved');

    const k = setup(async () => { throw new ConflictError(9); });
    k.c.setAuto(true);
    k.c.change(doc(1));
    await wait(60000);
    expect(k.calls).toHaveLength(1);
    expect(k.c.status).toBe('conflict');
  });

  test('turning autosave off cancels the pending timer', async () => {
    const { c, calls } = setup();
    c.setAuto(true);
    c.change(doc(1));
    c.setAuto(false);
    await wait(60000);
    expect(calls).toHaveLength(0);
    expect(c.status).toBe('dirty');
  });
});
