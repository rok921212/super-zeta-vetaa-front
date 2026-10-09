// Import a CSS animation: paste @keyframes, see exactly what is wrong (with
// line numbers) or watch it play on the selected layer, then assign it to the
// layer or keep it as a preset in this design.
//
// The CSS itself never reaches the page: animation/cssImport.ts turns it into
// an ordinary timeline clip, and the preview below plays THAT clip through the
// same renderer OBS uses.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutDocument, LayoutElement, TimelineClip } from '../schema/layoutTypes.ts';
import { TIMELINE_LIMITS } from '../schema/layoutSchema.js';
import { LayoutRenderer, createPreviewStore } from '../renderer/LayoutRenderer.tsx';
import type { DataState } from '../bindings/index.ts';
import { clipForLayer, importCssAnimations, type ImportedAnimation } from '../animation/cssImport.ts';
import { type Command, editElements, setDocFieldCmd } from './store.ts';
import { absoluteOrigin, locate } from './tree.ts';
import { addClip, clipsOf } from './timelineOps.ts';
import { Modal } from './dialogs.tsx';
import { InfoButton } from './Help.tsx';
import { Btn, cx } from './ui.tsx';

export const CSS_EXAMPLE = `@keyframes slide-in-left {
  from { opacity: 0; transform: translateX(-120px); }
  60%  { opacity: 1; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0); }
}

.layer { animation: slide-in-left 600ms ease-out; }
`;

type TriggerChoice = 'enter' | 'exit' | 'loop';
const TRIGGER_LABEL: Record<TriggerChoice, string> = { enter: 'When the layer appears', exit: 'When the layer leaves', loop: 'All the time (loop)' };
const MAX_PRESETS = Math.min(30, (TIMELINE_LIMITS as { maxClips: number }).maxClips);

/** The stand-in layer the preview animates when nothing is selected. */
const SAMPLE_LAYER: LayoutElement = {
  id: 'css_preview_sample', type: 'text', name: 'Sample', x: 660, y: 480, w: 600, h: 120, text: 'SAMPLE',
  style: { fill: '#1f2937', color: '#ffffff', fontSize: 64, fontWeight: 800, align: 'center', radius: 12 },
};

export function CssImportDialog({ doc, selectedId, state, assetBase, disabled, exec, onClose, onAssigned }: {
  doc: LayoutDocument;
  selectedId: string | null;
  state: DataState | null;
  assetBase?: string;
  disabled?: boolean;
  exec(cmd: Command | null): void;
  onClose(): void;
  /** The clip is on the layer: the caller may open it in the Animate panel. */
  onAssigned?(elementId: string, clipId: string): void;
}) {
  const el = selectedId ? locate(doc.elements, selectedId)?.el ?? null : null;
  const [css, setCss] = useState('');
  const [picked, setPicked] = useState(0);
  const [trigger, setTrigger] = useState<TriggerChoice>('enter');
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const presets = doc.editor?.animPresets || [];

  const box = el ? { w: el.w, h: el.h, rotation: el.rotation || 0 } : { w: SAMPLE_LAYER.w, h: SAMPLE_LAYER.h, rotation: 0 };
  const result = useMemo(
    () => (css.trim() ? importCssAnimations(css, { box, takenIds: el ? clipsOf(el).map((c) => c.id) : [] }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [css, box.w, box.h, box.rotation, el?.id]
  );
  const animations: ImportedAnimation[] = result?.animations || [];
  const current = animations[Math.min(picked, animations.length - 1)] || null;
  useEffect(() => { if (current && current.clip.loop === true) setTrigger('loop'); }, [current?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── preview: the real renderer, one layer, driven outside React ──
  const store = useMemo(() => createPreviewStore(), []);
  const previewEl = useMemo<LayoutElement>(() => {
    const source = el || SAMPLE_LAYER;
    const abs = el ? absoluteOrigin(doc.elements, el.id) : null;
    const base: LayoutElement = { ...JSON.parse(JSON.stringify(source)), x: abs?.x ?? source.x, y: abs?.y ?? source.y };
    delete base.visibleWhen;
    delete base.anim;
    delete base.clipToBelow;
    base.hidden = false;
    // Only the clip being previewed, so nothing else moves the layer.
    return current ? { ...base, timeline: { clips: [current.clip] } } : { ...base, timeline: undefined };
  }, [el, doc.elements, current]);
  const previewDoc = useMemo<LayoutDocument>(() => ({ ...doc, elements: [previewEl] }), [doc, previewEl]);

  useEffect(() => {
    if (!current) { store.set(null); setPlaying(false); return; }
    const clip = current.clip;
    if (!playing) { store.set({ elementId: previewEl.id, clipId: clip.id, t: clip.duration }); return; }
    let frame = 0;
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const hold = 500; // rest on the last frame before repeating
    const step = (now: number) => {
      const e = (now - started) % (clip.duration + hold);
      store.set({ elementId: previewEl.id, clipId: clip.id, t: Math.min(clip.duration, Math.round(e)) });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, current, previewEl.id, store]);
  useEffect(() => () => store.set(null), [store]);

  const lines = Math.max(12, css.split('\n').length);
  const errorLines = new Set((result?.errors || []).map((e) => e.line));
  const warnLines = new Set((result?.warnings || []).map((e) => e.line));

  const triggerFor = (choice: TriggerChoice): TimelineClip['trigger'] => ({ type: choice });

  const assign = () => {
    if (!el || !current || disabled) return;
    if (clipsOf(el).length >= (TIMELINE_LIMITS as { maxClips: number }).maxClips) { setNote(`This layer already has ${clipsOf(el).length} animations, which is the most a layer can hold. Remove one first.`); return; }
    const clip = clipForLayer(current.clip, triggerFor(trigger), clipsOf(el).map((c) => c.id));
    exec(editElements(doc, [el.id], (e) => addClip(e, clip), `Import CSS animation “${current.name}”`));
    onAssigned?.(el.id, clip.id);
    onClose();
  };

  const savePreset = () => {
    if (!current || disabled) return;
    if (presets.length >= MAX_PRESETS) { setNote(`A design can keep ${MAX_PRESETS} saved animations. Delete one first.`); return; }
    const clip = clipForLayer(current.clip, triggerFor(trigger), presets.map((p) => p.id));
    exec(setDocFieldCmd(doc, 'editor', { ...(doc.editor || {}), animPresets: [...presets, clip] }, `Save animation preset “${current.name}”`));
    setNote(`Saved “${current.name}” in this design. It is listed below and travels with the design when you save or export it.`);
  };

  const removePreset = (id: string) => {
    const next = presets.filter((p) => p.id !== id);
    const editor = { ...(doc.editor || {}) };
    if (next.length) editor.animPresets = next; else delete editor.animPresets;
    exec(setDocFieldCmd(doc, 'editor', editor, 'Delete animation preset'));
  };

  const applyPreset = (preset: TimelineClip) => {
    if (!el || disabled) return;
    if (clipsOf(el).length >= (TIMELINE_LIMITS as { maxClips: number }).maxClips) { setNote('This layer cannot hold more animations. Remove one first.'); return; }
    const clip = clipForLayer(preset, preset.trigger, clipsOf(el).map((c) => c.id));
    exec(editElements(doc, [el.id], (e) => addClip(e, clip), `Apply animation “${preset.name || preset.id}”`));
    onAssigned?.(el.id, clip.id);
    onClose();
  };

  return (
    <Modal title="Import a CSS animation" onClose={onClose} width={980}>
      <div className="flex flex-col gap-3" data-testid="css-import">
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>Paste <span className="font-mono text-slate-200">@keyframes</span> (and the <span className="font-mono text-slate-200">animation:</span> line, if you have it). It is converted to keyframes on {el ? <>“<span className="text-slate-200">{el.name || el.type}</span>”</> : 'a layer'}; the CSS itself is never added to the page.</span>
          <InfoButton topic="cssImport" label="What is supported" />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex h-64 overflow-hidden rounded border border-white/10 bg-black/50 font-mono text-[12px] leading-5">
              <div ref={gutter} className="select-none overflow-hidden border-r border-white/5 bg-white/[0.02] py-2 text-right text-slate-600" aria-hidden="true">
                {Array.from({ length: lines }, (_, i) => (
                  <div key={i} className={cx('px-2', errorLines.has(i + 1) ? 'bg-red-500/25 text-red-200' : warnLines.has(i + 1) ? 'bg-amber-500/20 text-amber-200' : '')}>{i + 1}</div>
                ))}
              </div>
              <textarea
                aria-label="CSS"
                spellCheck={false}
                autoFocus
                wrap="off"
                className="min-w-0 flex-1 resize-none bg-transparent p-2 leading-5 text-slate-100 outline-none"
                placeholder={CSS_EXAMPLE}
                value={css}
                onChange={(e) => { setCss(e.target.value); setNote(null); setPicked(0); }}
                onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop; }}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Btn small onClick={() => { setCss(CSS_EXAMPLE); setPicked(0); setNote(null); }}>Load an example</Btn>
              <Btn small disabled={!css} onClick={() => { setCss(''); setPlaying(false); setNote(null); }}>Reset</Btn>
            </div>
            <div className="max-h-40 overflow-auto rounded border border-white/10 bg-black/30 p-2 text-[11px]" data-testid="css-problems" role="status">
              {!result && <div className="text-slate-500">Problems and warnings appear here as you type.</div>}
              {result && result.errors.length === 0 && result.warnings.length === 0 && <div className="text-emerald-300">No problems. {animations.length} animation{animations.length === 1 ? '' : 's'} ready.</div>}
              {result?.errors.map((p, i) => <div key={`e${i}`} className="text-red-300"><span className="font-mono text-red-400">Line {p.line}</span> · {p.message}</div>)}
              {result?.warnings.map((p, i) => <div key={`w${i}`} className="text-amber-200"><span className="font-mono text-amber-400">Line {p.line}</span> · {p.message}</div>)}
              {result && result.errors.length > 0 && <div className="mt-1 text-slate-500">Nothing is imported until every problem is fixed.</div>}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <div className="relative h-64 overflow-hidden rounded border border-white/10" style={{ backgroundColor: '#1a1a1f', backgroundImage: 'linear-gradient(45deg,#232329 25%,transparent 25%),linear-gradient(-45deg,#232329 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#232329 75%),linear-gradient(-45deg,transparent 75%,#232329 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0,0 10px,10px -10px,-10px 0' }} data-testid="css-preview">
              <LayoutRenderer layout={previewDoc} state={state} events={null} mode="editor" fit="contain" assetBase={assetBase} playTimelines={false} previewStore={store} />
              {!el && <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-slate-300">No layer selected: shown on a sample</div>}
            </div>
            {animations.length > 1 && (
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                <span>Animation</span>
                {animations.map((a, i) => <Btn key={a.name} small active={a === current} onClick={() => setPicked(i)}>{a.name}</Btn>)}
              </div>
            )}
            {current && (
              <div className="text-[11px] text-slate-400" data-testid="css-summary">
                <span className="text-slate-200">{current.name}</span> · {current.clip.duration} ms{current.timed ? '' : ' (default: no duration was given)'}
                {current.clip.delay ? ` · starts after ${current.clip.delay} ms` : ''}
                {current.clip.loop === true ? ' · repeats forever' : typeof current.clip.loop === 'number' ? ` · plays ${current.clip.loop + 1} times` : ''}
                {current.clip.direction === 'alternate' ? ' · back and forth' : ''} · animates {current.clip.tracks.map((t) => t.prop).join(', ')}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Btn small active={playing} disabled={!current} onClick={() => setPlaying(!playing)} data-testid="css-play">{playing ? '■ Stop' : '▶ Preview'}</Btn>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                Plays
                <select aria-label="When it plays" className="rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-slate-100 outline-none focus:border-amber-400/60" value={trigger} onChange={(e) => setTrigger(e.target.value as TriggerChoice)}>
                  {(Object.keys(TRIGGER_LABEL) as TriggerChoice[]).map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
                </select>
              </label>
            </div>
            <div className="text-[10px] text-slate-500">Other triggers (on a kill, while a player is knocked…) can be chosen in the Animate panel after it is on the layer.</div>
          </div>
        </div>

        {note && <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100" role="status">{note}</div>}

        {presets.length > 0 && (
          <div data-testid="css-presets">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Saved in this design</div>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <span key={p.id} className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-200">
                  {p.name || p.id} <span className="text-slate-500">{p.duration} ms</span>
                  <button type="button" disabled={!el || disabled} title={el ? `Put it on “${el.name || el.type}”` : 'Select a layer first'} className="text-amber-200 hover:underline disabled:text-slate-600 disabled:no-underline" onClick={() => applyPreset(p)}>Apply</button>
                  <button type="button" disabled={disabled} aria-label={`Delete preset ${p.name || p.id}`} className="text-slate-500 hover:text-red-300" onClick={() => removePreset(p.id)}>✕</button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!el && <span className="mr-auto text-[11px] text-slate-500">Select a layer on the canvas to assign the animation to it.</span>}
          <Btn onClick={onClose}>Close</Btn>
          <Btn disabled={!current || disabled} onClick={savePreset} title="Keep it in this design to reuse on other layers">Save as preset</Btn>
          <Btn active disabled={!current || !el || disabled} onClick={assign} data-testid="css-assign">Assign to layer</Btn>
        </div>
      </div>
    </Modal>
  );
}
