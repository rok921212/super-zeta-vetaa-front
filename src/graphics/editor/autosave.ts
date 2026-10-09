// Designer saving: MANUAL by default. Nothing is written to the server until
// the user saves (the Save button / Ctrl+S) or does something that needs the
// draft stored first (Publish, Lock).
//
// Autosave is an opt-in per-browser preference (setAuto). When on, a change
// schedules a save AUTOSAVE_DELAY_MS after the last edit (debounced; held while
// a drag is in progress), and a failed save (network / 5xx — never a conflict
// or lock) is retried with backoff. The single-flight + expectedRev rules
// below apply unchanged, so an older document can never overwrite a newer one.
//
// - A change marks the layout "Unsaved changes" and is kept in memory.
// - save() (alias flush()) sends ONE PUT with everything pending. Only one PUT
//   is ever in flight; a change made while it is in flight stays unsaved until
//   the next save.
// - A draft identical to the one last saved (undo back to it, a no-op edit) is
//   not sent at all.
// - Every PUT carries `expectedRev`. A 409 (another tab/device saved first)
//   reports a conflict; nothing is overwritten until the user picks a
//   resolution. A 423 (production lock) blocks saving too.
// - A failed save keeps the changes and says so; the user saves again (or,
//   with autosave on, it is retried automatically).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutDocument } from '../schema/layoutTypes.ts';
import { ConflictError, LockedError, type LayoutDefaults } from '../api.ts';

/** What one PUT carries: the draft and/or layout-record metadata (both bump draftRev). */
export interface SavePatch {
  draft?: LayoutDocument;
  name?: string;
  defaults?: LayoutDefaults;
}

export const AUTOSAVE_DELAY_MS = 2000;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;
const AUTOSAVE_PREF_KEY = 'dz.autosave';

export function readAutosavePref(): boolean {
  try { return window.localStorage.getItem(AUTOSAVE_PREF_KEY) === '1'; } catch { return false; }
}
export function writeAutosavePref(on: boolean): void {
  try { window.localStorage.setItem(AUTOSAVE_PREF_KEY, on ? '1' : '0'); } catch { /* storage unavailable: the toggle still works for this tab */ }
}

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'locked';

export interface AutosaveOptions {
  rev: number;
  /** The draft the server has right now (the one just loaded), if known. */
  savedDraft?: LayoutDocument | null;
  save(expectedRev: number, patch: SavePatch): Promise<{ draftRev: number }>;
  onStatus?(status: SaveStatus): void;
  onConflict?(currentRev: number): void;
  onSaved?(rev: number): void;
}

export class AutosaveController {
  rev: number;
  status: SaveStatus = 'saved';
  private pending: SavePatch | null = null;
  private inFlight: Promise<void> | null = null;
  private paused = false;
  private disposed = false;
  /** JSON of the draft the server holds, when we know it; null = unknown (always send). */
  private savedJson: string | null = null;
  lastError: unknown = null;
  private auto = false;
  private held = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;

  constructor(private opts: AutosaveOptions) {
    this.rev = opts.rev;
    this.savedJson = opts.savedDraft ? JSON.stringify(opts.savedDraft) : null;
  }

  private setStatus(s: SaveStatus) {
    if (this.status === s) return;
    this.status = s;
    this.opts.onStatus?.(s);
  }

  /** There is something the server does not have yet. */
  get dirty(): boolean {
    return this.pending !== null || this.status === 'saving';
  }

  /** The document changed: remembered, not sent. */
  change(doc: LayoutDocument): void {
    this.enqueue({ draft: doc });
  }

  /** Layout name / defaults changed: remembered, sent with the next save (they bump draftRev too). */
  changeMeta(patch: Omit<SavePatch, 'draft'>): void {
    this.enqueue(patch);
  }

  private enqueue(patch: SavePatch) {
    if (this.disposed) return;
    this.pending = { ...(this.pending || {}), ...patch };
    if (this.paused) return;
    if (this.status !== 'saving') this.setStatus('dirty');
    this.retries = 0; // a fresh edit restarts the backoff
    this.schedule(AUTOSAVE_DELAY_MS);
  }

  /** Turn autosave on or off. Turning it on with unsaved changes schedules a save. */
  setAuto(on: boolean): void {
    this.auto = on;
    if (!on) this.clearTimer();
    else if (this.pending) this.schedule(AUTOSAVE_DELAY_MS);
  }

  get autoEnabled(): boolean {
    return this.auto;
  }

  /** Bracket a drag/resize gesture: no autosave fires mid-gesture; releasing reschedules. */
  hold(on: boolean): void {
    this.held = on;
    if (on) this.clearTimer();
    else if (this.pending) this.schedule(AUTOSAVE_DELAY_MS);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number) {
    if (!this.auto || this.held || this.paused || this.disposed || !this.pending) return;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.held) return;
      void this.save();
    }, ms);
  }

  /** Save now. Resolves once everything that was pending is saved or has failed. */
  async save(): Promise<void> {
    this.clearTimer();
    if (this.inFlight) await this.inFlight;
    if (this.pending && !this.paused) await this.run();
  }

  /** Same as save() — the name the editor has always used for "save now". */
  flush(): Promise<void> {
    return this.save();
  }

  private run(): Promise<void> {
    if (this.inFlight || this.paused || this.disposed || !this.pending) return this.inFlight || Promise.resolve();
    const patch = this.pending;
    this.pending = null;
    const draftJson = patch.draft ? JSON.stringify(patch.draft) : null;
    if (draftJson !== null && draftJson === this.savedJson) {
      delete patch.draft; // the server already has exactly this document
      if (!Object.keys(patch).length) {
        this.setStatus('saved');
        return Promise.resolve();
      }
    }
    this.setStatus('saving');
    this.inFlight = (async () => {
      try {
        const res = await this.opts.save(this.rev, patch);
        this.rev = res.draftRev;
        if (draftJson !== null && patch.draft) this.savedJson = draftJson;
        this.lastError = null;
        this.retries = 0;
        this.opts.onSaved?.(this.rev);
        // changed again while this save was in flight: still unsaved, until the user saves again
        this.setStatus(this.pending ? 'dirty' : 'saved');
        if (this.pending) this.schedule(AUTOSAVE_DELAY_MS);
      } catch (err) {
        this.lastError = err;
        this.pending = { ...patch, ...(this.pending || {}) }; // never lose unsaved changes (newer wins)
        if (err instanceof ConflictError) {
          this.paused = true;
          this.setStatus('conflict');
          this.opts.onConflict?.(err.currentRev);
        } else if (err instanceof LockedError) {
          this.paused = true;
          this.setStatus('locked');
        } else {
          this.setStatus('error');
          // autosave on: retry with backoff; off: the user saves again
          this.retries += 1;
          this.schedule(Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (this.retries - 1)));
        }
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  /**
   * After a conflict / lock is resolved: continue from `rev`. `keepPending=false`
   * drops the local changes. Nothing is sent here — call save() to write.
   */
  resume(rev: number, keepPending = true): void {
    this.rev = rev;
    this.savedJson = null; // the server draft changed underneath us (restore / reload / other tab)
    this.paused = false;
    if (!keepPending) this.pending = null;
    this.setStatus(this.pending ? 'dirty' : 'saved');
    this.schedule(AUTOSAVE_DELAY_MS);
  }

  /** Block saving (conflict dialog "keep editing" / production lock). */
  pause(status: SaveStatus = 'conflict'): void {
    this.paused = true;
    this.clearTimer();
    this.setStatus(status);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }
}

/**
 * React wrapper: one controller per layout id. Feed it `doc` whenever
 * `version` (the reducer's change counter) moves; it only records the change.
 */
export function useAutosave(params: {
  layoutId: string | null;
  initialRev: number | null;
  doc: LayoutDocument | null;
  version: number;
  save: AutosaveOptions['save'];
  onConflict(currentRev: number): void;
  onSaved?(rev: number): void;
}) {
  const { layoutId, initialRev } = params;
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [auto, setAutoState] = useState<boolean>(readAutosavePref);
  const cbs = useRef(params);
  cbs.current = params;

  const controller = useMemo(() => {
    if (!layoutId || initialRev == null) return null;
    return new AutosaveController({
      rev: initialRev,
      savedDraft: cbs.current.doc,
      save: (rev, patch) => cbs.current.save(rev, patch),
      onStatus: setStatus,
      onConflict: (rev) => cbs.current.onConflict(rev),
      onSaved: (rev) => cbs.current.onSaved?.(rev),
    });
    // A new controller only for a different layout (initialRev is read once).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutId, initialRev != null]);

  useEffect(() => () => controller?.dispose(), [controller]);
  useEffect(() => { controller?.setAuto(auto); }, [controller, auto]);
  const setAuto = (on: boolean) => { writeAutosavePref(on); setAutoState(on); };

  // version 0 = freshly loaded; only real edits count as unsaved.
  const lastVersion = useRef(params.version);
  const ignored = useRef<number | null>(null);
  useEffect(() => {
    if (!controller || !params.doc) return;
    if (params.version === lastVersion.current) return;
    lastVersion.current = params.version;
    if (params.version === ignored.current) return; // a server document was just loaded — nothing to save
    controller.change(params.doc);
  }, [controller, params.version, params.doc]);

  /** Call right before dispatching a `load` of server data, with the version that load will produce. */
  const ignoreVersion = (v: number) => { ignored.current = v; };

  // Closing or reloading the tab with unsaved changes: the browser asks first.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (controller?.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [controller]);

  return { status, controller, ignoreVersion, auto, setAuto };
}

export const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Save failed — press Save to try again',
  conflict: 'Changed elsewhere',
  locked: 'Locked',
};

export const saveStatusColor = (s: SaveStatus): string =>
  s === 'saved' ? 'text-emerald-300' : s === 'saving' || s === 'dirty' ? 'text-amber-200' : 'text-red-300';
