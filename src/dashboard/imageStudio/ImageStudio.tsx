import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaTimes, FaSpinner, FaUndo, FaRedo, FaPlus, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import {
  AI_QUALITY_LABEL, METHOD_LABEL, OUTPUT_SIZE, autoMethod, computeMask, defaultColorSettings,
  describeBgRemovalError, isModelCached, loadImage, renderOutput,
  type AiQuality, type BgMethod, type ColorSettings, type ImageKind, type Mask, type RGB, type WorkingImage,
} from '../../utils/imagePrep';
import MaskEditor, { type Crop, type Tool, type ViewMode } from './MaskEditor';
import { STUDIO_STYLES } from './styles';

// One window for every logo / flag / player picture. Several files can be
// dropped at once: each is decoded, cut out and composed on this computer in
// a queue (one at a time, so the model never runs twice in memory), shown as
// a strip, and can be opened to mark what to keep / remove and where to crop.
// Only the finished PNGs are uploaded.

export interface StudioTarget {
  value: string;
  label: string;
  kind: ImageKind;
}

type Status = 'loading' | 'queued' | 'model' | 'working' | 'ready' | 'error' | 'uploading' | 'done';

interface Item {
  id: string;
  file: File;
  target: string;
  status: Status;
  method: BgMethod | null;
  color: ColorSettings | null;
  crop: Crop;
  useOriginal: boolean;
  resultUrl: string | null;
  /** Output must be re-rendered (marks / crop changed). */
  dirty: boolean;
  error: string | null;
  errorDetail: string | null;
  modelProgress: number;
}

interface MaskEntry { mask: Mask; undo: Mask[]; redo: Mask[]; version: number }

const UNDO_LIMIT = 12;
const QUALITY_KEY = 'imagePrep:quality';
const DEFAULT_TOOL: Record<ImageKind, Tool> = { logo: 'wand-remove', flag: 'remove', player: 'crop' };

function readQuality(): AiQuality {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    return v === 'fast' || v === 'best' ? v : 'high';
  } catch { return 'high'; }
}

const rgbCss = (c: RGB) => `rgb(${c.map(Math.round).join(',')})`;
let idSeq = 0;

const ImageStudio: React.FC<{
  title: string;
  initialFiles: File[];
  /** Fixed kind (single picture, no assignment). */
  kind?: ImageKind;
  /** Assignment choices (team form). Without it every file uses `kind`. */
  targets?: StudioTarget[];
  /** First target for a new file; `taken` = targets already used in the window. */
  suggestTarget?: (file: File, taken: string[]) => string;
  /** Single mode: the target `initialFiles[0]` is fixed to. */
  initialTarget?: string;
  /** Allow adding more files from inside the window. */
  allowAdd?: boolean;
  /** Uploads one finished picture. Rejects to mark it failed (kept for retry). */
  uploadOne: (target: string, kind: ImageKind, blob: Blob, filename: string) => Promise<void>;
  onClose: () => void;
}> = ({ title, initialFiles, kind: fixedKind = 'logo', targets, suggestTarget, initialTarget, allowAdd, uploadOne, onClose }) => {
  const kindOf = useCallback((target: string): ImageKind =>
    targets?.find(t => t.value === target)?.kind ?? fixedKind, [targets, fixedKind]);

  const makeItems = useCallback((files: File[], taken: string[]): Item[] => {
    const used = [...taken];
    return files.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|avif|gif|bmp)$/i.test(f.name)).map((file, i) => {
      const target = (i === 0 && initialTarget && !taken.length) ? initialTarget
        : suggestTarget ? suggestTarget(file, used) : (initialTarget ?? fixedKind);
      used.push(target);
      return {
        id: `img${++idSeq}`, file, target, status: 'loading' as Status, method: null, color: null,
        crop: { top: 0, bottom: 1 }, useOriginal: false, resultUrl: null, dirty: false,
        error: null, errorDetail: null, modelProgress: 0,
      };
    });
  }, [initialTarget, suggestTarget, fixedKind]);

  const [items, setItems] = useState<Item[]>(() => makeItems(initialFiles, []));
  const [selectedId, setSelectedId] = useState<string | null>(() => items[0]?.id ?? null);
  const [quality, setQuality] = useState<AiQuality>(readQuality);
  const [tool, setTool] = useState<Tool>(() => DEFAULT_TOOL[kindOf(items[0]?.target ?? fixedKind)]);
  const [brushSize, setBrushSize] = useState(28);
  const [wandTolerance, setWandTolerance] = useState(36);
  const [view, setView] = useState<ViewMode>('marks');
  const [zoom, setZoom] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [, forceRender] = useState(0);

  const imagesRef = useRef(new Map<string, WorkingImage>());
  const masksRef = useRef(new Map<string, MaskEntry>());
  const resultsRef = useRef(new Map<string, Blob>());
  const workingRef = useRef<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const patch = useCallback((id: string, p: Partial<Item> | ((it: Item) => Partial<Item>)) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...(typeof p === 'function' ? p(it) : p) } : it));
  }, []);

  const selected = items.find(it => it.id === selectedId) ?? null;
  const selectedKind = selected ? kindOf(selected.target) : fixedKind;
  const single = !targets;

  // Revoke result URLs on unmount.
  useEffect(() => () => { itemsRef.current.forEach(it => { if (it.resultUrl) URL.revokeObjectURL(it.resultUrl); }); }, []);

  // ── Decode every new file ──
  useEffect(() => {
    items.filter(it => it.status === 'loading' && !imagesRef.current.has(it.id)).forEach(it => {
      imagesRef.current.set(it.id, null as any); // claim
      loadImage(it.file)
        .then(img => {
          imagesRef.current.set(it.id, img);
          const k = kindOf(itemsRef.current.find(x => x.id === it.id)?.target ?? it.target);
          patch(it.id, { status: 'queued', method: autoMethod(k, img), color: defaultColorSettings(img) });
        })
        .catch(() => patch(it.id, { status: 'error', error: 'This file could not be read as an image.' }));
    });
  }, [items, kindOf, patch]);

  const setResult = useCallback((id: string, blob: Blob) => {
    resultsRef.current.set(id, blob);
    const url = URL.createObjectURL(blob);
    patch(id, it => { if (it.resultUrl) URL.revokeObjectURL(it.resultUrl); return { resultUrl: url, dirty: false }; });
  }, [patch]);

  const render = useCallback(async (it: Item) => {
    const img = imagesRef.current.get(it.id);
    const entry = masksRef.current.get(it.id);
    if (!img || !entry) return;
    const blob = await renderOutput(img, entry.mask, {
      kind: kindOf(it.target),
      decontaminateColor: it.method === 'color' && it.color ? it.color.color : undefined,
      cropTopRatio: it.crop.top > 0.001 ? it.crop.top : undefined,
      cropBottomRatio: it.crop.bottom < 0.999 ? it.crop.bottom : undefined,
    });
    setResult(it.id, blob);
  }, [kindOf, setResult]);

  // ── The queue: one automatic cut-out at a time, the open picture first ──
  useEffect(() => {
    if (workingRef.current) return;
    const queued = items.filter(it => it.status === 'queued');
    const next = queued.find(it => it.id === selectedId) ?? queued[0];
    if (!next || !next.method || !next.color) return;
    const img = imagesRef.current.get(next.id);
    if (!img) return;
    workingRef.current = next.id;
    const id = next.id;
    patch(id, { status: next.method === 'ai' && !isModelCached(quality) ? 'model' : 'working', error: null, errorDetail: null });
    computeMask(img, {
      method: next.method, quality, color: next.color,
      onModelProgress: f => patch(id, { modelProgress: f }),
    })
      .then(async mask => {
        const prev = masksRef.current.get(id);
        masksRef.current.set(id, { mask, undo: [], redo: [], version: (prev?.version ?? 0) + 1 });
        const current = itemsRef.current.find(x => x.id === id);
        if (current) await render(current);
        patch(id, s => (s.status === 'working' || s.status === 'model' ? { status: 'ready' } : {}));
      })
      .catch(err => {
        console.error('Image prep failed:', err);
        patch(id, {
          status: 'error',
          error: next.method === 'ai' ? describeBgRemovalError(err) : 'Could not process this picture.',
          errorDetail: String(err?.message || err || '').slice(0, 300) || null,
        });
      })
      .finally(() => { workingRef.current = null; forceRender(n => n + 1); });
  }, [items, selectedId, quality, patch, render]);

  // ── Re-render the open picture after marks / crop changes (debounced) ──
  useEffect(() => {
    if (!selected || !selected.dirty || selected.status !== 'ready') return;
    const t = window.setTimeout(() => { render(selected).catch(e => console.error(e)); }, 250);
    return () => window.clearTimeout(t);
  }, [selected, render]);

  const requeue = useCallback((id: string, p: Partial<Item>) => {
    patch(id, { ...p, status: 'queued', error: null, errorDetail: null });
  }, [patch]);

  const changeMethod = (method: BgMethod) => { if (selected) requeue(selected.id, { method }); };
  const changeQuality = (q: AiQuality) => {
    setQuality(q);
    try { localStorage.setItem(QUALITY_KEY, q); } catch { /* blocked */ }
    // Re-run every AI picture that hasn't been marked by hand yet.
    itemsRef.current.forEach(it => {
      const e = masksRef.current.get(it.id);
      if (it.method === 'ai' && (it.status === 'ready' || it.status === 'error') && !(e && e.undo.length)) requeue(it.id, {});
    });
  };
  const changeColor = (c: Partial<ColorSettings>) => {
    if (selected?.color) requeue(selected.id, { color: { ...selected.color, ...c } });
  };

  const changeTarget = (id: string, target: string) => {
    const it = itemsRef.current.find(x => x.id === id);
    if (!it) return;
    const oldKind = kindOf(it.target);
    const newKind = kindOf(target);
    const img = imagesRef.current.get(id);
    if (oldKind !== newKind && img) requeue(id, { target, method: autoMethod(newKind, img) });
    else patch(id, { target, dirty: true });
    if (id === selectedId) setTool(DEFAULT_TOOL[newKind]);
  };

  // ── Editing ──
  const entry = selected ? masksRef.current.get(selected.id) : undefined;
  const img = selected ? imagesRef.current.get(selected.id) : undefined;

  const beforeEdit = useCallback(() => {
    if (!entry) return;
    entry.undo.push(new Uint8ClampedArray(entry.mask));
    if (entry.undo.length > UNDO_LIMIT) entry.undo.shift();
    entry.redo = [];
  }, [entry]);

  const afterEdit = useCallback(() => {
    if (selected) patch(selected.id, { dirty: true });
  }, [selected, patch]);

  const undoRedo = useCallback((dir: 'undo' | 'redo') => {
    if (!entry || !selected) return;
    const from = dir === 'undo' ? entry.undo : entry.redo;
    const to = dir === 'undo' ? entry.redo : entry.undo;
    const snap = from.pop();
    if (!snap) return;
    to.push(new Uint8ClampedArray(entry.mask));
    entry.mask.set(snap);
    entry.version++;
    patch(selected.id, { dirty: true });
  }, [entry, selected, patch]);

  const resetMarks = () => { if (selected) requeue(selected.id, {}); };

  // Keyboard: Ctrl+Z / Ctrl+Y, [ and ] for brush size.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? 'redo' : 'undo'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); undoRedo('redo'); }
      else if (e.key === '[') setBrushSize(s => Math.max(4, s - 4));
      else if (e.key === ']') setBrushSize(s => Math.min(160, s + 4));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoRedo]);

  // ── Adding / removing pictures ──
  const addFiles = useCallback((files: File[]) => {
    const fresh = makeItems(files, itemsRef.current.map(it => it.target));
    if (!fresh.length) return;
    setItems(prev => [...prev, ...fresh]);
    setSelectedId(cur => cur ?? fresh[0].id);
  }, [makeItems]);

  const removeItem = (id: string) => {
    const it = itemsRef.current.find(x => x.id === id);
    if (it?.resultUrl) URL.revokeObjectURL(it.resultUrl);
    imagesRef.current.delete(id); masksRef.current.delete(id); resultsRef.current.delete(id);
    const rest = itemsRef.current.filter(x => x.id !== id);
    setItems(rest);
    if (selectedId === id) setSelectedId(rest[0]?.id ?? null);
  };

  const selectItem = (id: string) => {
    setSelectedId(id);
    const it = itemsRef.current.find(x => x.id === id);
    if (it) setTool(DEFAULT_TOOL[kindOf(it.target)]);
    setZoom(1);
  };

  // ── Upload ──
  const baseName = (f: File) => f.name.replace(/\.[^.]+$/, '') || 'image';

  const pending = items.filter(it => it.status !== 'done');
  const anyBusy = items.some(it => it.status === 'loading' || it.status === 'queued' || it.status === 'model' || it.status === 'working');
  const uploadable = pending.filter(it => it.useOriginal || it.status === 'ready');

  const uploadAll = async (list: Item[], original = false) => {
    if (!list.length) return;
    setUploading(true);
    let failed = 0;
    const work = [...list];
    const runOne = async () => {
      for (let it = work.shift(); it; it = work.shift()) {
        const id = it.id;
        try {
          patch(id, { status: 'uploading', error: null });
          const k = kindOf(it.target);
          if (original || it.useOriginal) {
            await uploadOne(it.target, k, it.file, it.file.name);
          } else {
            const fresh = itemsRef.current.find(x => x.id === id) ?? it;
            if (fresh.dirty || !resultsRef.current.has(id)) await render(fresh);
            await uploadOne(it.target, k, resultsRef.current.get(id)!, `${baseName(it.file)}.png`);
          }
          patch(id, { status: 'done' });
        } catch (err: any) {
          failed++;
          patch(id, {
            status: it.status === 'uploading' ? 'ready' : it.status,
            error: err?.message === 'Max file size is 5MB' ? 'The original is over 5 MB — upload the processed picture.' : 'Upload failed. Try again.',
          });
        }
      }
    };
    await Promise.all([runOne(), runOne(), runOne()]);
    setUploading(false);
    // Close once everything in the window is uploaded; otherwise stay open so
    // failed / unfinished pictures can be fixed and sent.
    const sent = new Set(list.map(l => l.id));
    if (!failed && itemsRef.current.every(it => it.status === 'done' || sent.has(it.id))) onClose();
  };

  // Duplicate assignment warning (two pictures for one slot — last wins).
  const targetCounts = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach(it => { if (it.status !== 'done') m.set(it.target, (m.get(it.target) ?? 0) + 1); });
    return m;
  }, [items]);
  const targetLabel = (v: string) => targets?.find(t => t.value === v)?.label ?? v;

  const out = OUTPUT_SIZE[selectedKind];
  const editable = !!(selected && img && entry && (selected.status === 'ready' || selected.status === 'uploading'));
  const statusText = (it: Item) => {
    switch (it.status) {
      case 'loading': return 'Loading…';
      case 'queued': return 'Waiting…';
      case 'model': return `Downloading model (first time only)…${it.modelProgress > 0 ? ` ${Math.round(it.modelProgress * 100)}%` : ''}`;
      case 'working': return it.method === 'ai' ? 'Removing background…' : 'Processing…';
      case 'uploading': return 'Uploading…';
      default: return '';
    }
  };
  const processedCount = items.filter(it => it.status === 'ready' || it.status === 'done' || it.status === 'uploading').length;

  const toolBtn = (t: Tool, label: string, hint: string) => (
    <button type="button" className={`is-tool${tool === t ? ' on' : ''}`} title={hint} onClick={() => setTool(t)} disabled={!editable}>{label}</button>
  );

  return (
    <div
      className="ip-overlay"
      // No click-outside close: a brush stroke released outside the box would
      // otherwise throw away every mark. stopPropagation keeps the team
      // form's own click-outside handler from closing the form.
      onClick={e => e.stopPropagation()}
      onDragOver={e => { if (allowAdd) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { if (!allowAdd) return; e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)); }}
    >
      <style>{STUDIO_STYLES}</style>
      <div className={`ip-box is-box${dragOver ? ' is-drag' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="ip-hdr">
          <span className="tm-orb" style={{ color: '#F4F2EE', fontSize: 15, fontWeight: 700, textTransform: 'uppercase' }}>{title}</span>
          <span className="is-sub">
            {items.length > 1 && `${processedCount} of ${items.length} processed`}
            {anyBusy && <FaSpinner className="ip-spin" style={{ marginLeft: 8 }} />}
          </span>
          <button onClick={onClose} disabled={uploading} aria-label="Close" className="is-x"><FaTimes size={13} /></button>
        </div>

        {(!single || items.length > 1) && (
          <div className="is-strip">
            {items.map(it => {
              const dup = (targetCounts.get(it.target) ?? 0) > 1;
              return (
                <div key={it.id} className={`is-thumb${it.id === selectedId ? ' on' : ''}${it.status === 'done' ? ' done' : ''}`} onClick={() => selectItem(it.id)}>
                  <div className="is-thumb-img ip-checker">
                    {it.resultUrl ? <img src={it.resultUrl} alt="" /> : <FaSpinner className="ip-spin" style={{ color: '#93959C' }} />}
                    {it.status === 'done' && <span className="is-badge ok"><FaCheck size={9} /></span>}
                    {(it.status === 'error' || dup) && <span className="is-badge bad" title={dup ? 'Two pictures for the same slot — the last one uploaded wins' : it.error ?? ''}><FaExclamationTriangle size={9} /></span>}
                    {(it.status === 'working' || it.status === 'model' || it.status === 'uploading') && <span className="is-badge busy"><FaSpinner className="ip-spin" size={9} /></span>}
                  </div>
                  {targets ? (
                    <select className="is-assign" value={it.target} disabled={it.status === 'done' || uploading}
                      onClick={e => e.stopPropagation()} onChange={e => changeTarget(it.id, e.target.value)}>
                      {targets.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  ) : <div className="is-assign-text">{it.file.name}</div>}
                  {it.status !== 'done' && !uploading && (
                    <button type="button" className="is-thumb-x" aria-label="Remove picture" onClick={e => { e.stopPropagation(); removeItem(it.id); }}><FaTimes size={8} /></button>
                  )}
                </div>
              );
            })}
            {allowAdd && (
              <label className="is-add" title="Add pictures (or drop them on this window)">
                <FaPlus size={12} />
                <span>Add</span>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; addFiles(f); }} />
              </label>
            )}
          </div>
        )}

        {!selected ? (
          <div className="ip-body"><p className="ip-hint">Drop pictures here or press Add. Logos, flags and player photos can go in together — each one is matched to a slot you can change.</p></div>
        ) : (
          <div className="ip-body is-main">
            <div className="is-editor">
              <div className="is-toolbar">
                {selectedKind === 'player' && toolBtn('crop', 'Crop', 'Drag the Top and Waist lines')}
                {toolBtn('remove', 'Erase', 'Brush away background the cut-out missed')}
                {toolBtn('keep', 'Restore', 'Brush back parts that were wrongly removed')}
                {toolBtn('wand-remove', 'Erase area', 'Click an area of one colour to remove all of it')}
                {toolBtn('wand-keep', 'Keep area', 'Click an area of one colour to keep all of it')}
                {selected.method === 'color' && toolBtn('pick', 'Pick bg', 'Click the background colour to remove')}
                <span className="is-sep" />
                {(tool === 'remove' || tool === 'keep') && (
                  <label className="is-slider" title="Brush size — [ and ] keys">Size
                    <input type="range" min={4} max={160} value={brushSize} onChange={e => setBrushSize(+e.target.value)} />
                  </label>
                )}
                {(tool === 'wand-remove' || tool === 'wand-keep') && (
                  <label className="is-slider" title="How different a colour can be and still count as the same area">Tolerance
                    <input type="range" min={5} max={120} value={wandTolerance} onChange={e => setWandTolerance(+e.target.value)} />
                  </label>
                )}
                <span className="is-grow" />
                <button type="button" className="is-tool" title="Undo (Ctrl+Z)" disabled={!editable || !entry?.undo.length} onClick={() => undoRedo('undo')}><FaUndo size={11} /></button>
                <button type="button" className="is-tool" title="Redo (Ctrl+Y)" disabled={!editable || !entry?.redo.length} onClick={() => undoRedo('redo')}><FaRedo size={11} /></button>
              </div>
              <div className="is-toolbar is-toolbar2">
                <div className="is-seg">
                  {(['marks', 'cutout', 'original'] as ViewMode[]).map(v => (
                    <button key={v} type="button" className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                      {v === 'marks' ? 'Marked' : v === 'cutout' ? 'Cut-out' : 'Original'}
                    </button>
                  ))}
                </div>
                <div className="is-seg">
                  {[1, 2, 4].map(z => <button key={z} type="button" className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>{z === 1 ? 'Fit' : `${z}×`}</button>)}
                </div>
                <span className="is-hint-inline">{view === 'marks' ? 'Red = removed' : view === 'cutout' ? 'What gets kept' : 'Untouched picture'}</span>
              </div>
              <div className="is-stage">
                {editable && img && entry ? (
                  <MaskEditor
                    img={img}
                    mask={entry.mask}
                    maskVersion={entry.version}
                    tool={tool}
                    brushSize={brushSize}
                    wandTolerance={wandTolerance}
                    view={view}
                    zoom={zoom}
                    showCrop={selectedKind === 'player'}
                    crop={selected.crop}
                    onCropChange={c => patch(selected.id, { crop: c, dirty: true })}
                    onBeforeEdit={beforeEdit}
                    onAfterEdit={afterEdit}
                    onPickColor={c => { changeColor({ color: c }); setTool('wand-remove'); }}
                  />
                ) : (
                  <div className="is-placeholder">
                    {selected.status === 'error' ? <FaExclamationTriangle /> : <FaSpinner className="ip-spin" />}
                    <span>{selected.status === 'error' ? 'Not processed' : statusText(selected)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="is-side">
              <div className="ip-pane-label">Result · {out.width}×{out.height}</div>
              <div className="ip-frame ip-checker is-result">
                {selected.useOriginal
                  ? <span className="ip-hint" style={{ margin: 0 }}>The original file will be uploaded.</span>
                  : selected.resultUrl && <img src={selected.resultUrl} alt="Result" />}
                {!selected.useOriginal && selected.status !== 'ready' && selected.status !== 'done' && selected.status !== 'error' && (
                  <div className="ip-status"><FaSpinner className="ip-spin" />{statusText(selected)}</div>
                )}
              </div>

              <div className="ip-pane-label" style={{ marginTop: 14 }}>Background</div>
              <div className="is-methods">
                {(['ai', 'color', 'none'] as BgMethod[]).map(m => (
                  <label key={m} className="ip-toggle">
                    <input type="radio" name={`method-${selected.id}`} checked={selected.method === m}
                      disabled={uploading || selected.status === 'loading'} onChange={() => changeMethod(m)} />
                    {METHOD_LABEL[m]}
                  </label>
                ))}
              </div>
              {selected.method === 'ai' && (
                <label className="is-field">Quality
                  <select value={quality} onChange={e => changeQuality(e.target.value as AiQuality)} disabled={uploading}>
                    {(Object.keys(AI_QUALITY_LABEL) as AiQuality[]).map(q => <option key={q} value={q}>{AI_QUALITY_LABEL[q]}</option>)}
                  </select>
                </label>
              )}
              {selected.method === 'color' && selected.color && (
                <div className="is-colorbox">
                  <div className="is-colorrow">
                    <span className="is-swatch" style={{ background: rgbCss(selected.color.color) }} />
                    <span>Background colour</span>
                    <button type="button" className="is-link" onClick={() => setTool('pick')} disabled={!editable}>Pick</button>
                  </div>
                  <label className="is-slider" style={{ width: '100%' }}>Tolerance
                    <input type="range" min={5} max={140} value={selected.color.tolerance}
                      onChange={e => patch(selected.id, it => ({ color: it.color ? { ...it.color, tolerance: +e.target.value } : it.color }))}
                      onPointerUp={() => changeColor({})} onKeyUp={() => changeColor({})} />
                  </label>
                  <label className="ip-toggle" title="Also remove this colour inside the logo (the hole of an O, gaps between letters)">
                    <input type="checkbox" checked={selected.color.everywhere} onChange={e => changeColor({ everywhere: e.target.checked })} />
                    Also inside the logo
                  </label>
                </div>
              )}
              {selected.status === 'ready' && entry && entry.undo.length > 0 && (
                <button type="button" className="tm-btn-ghost is-small" onClick={resetMarks}>Reset my marks</button>
              )}
              {!single && (
                <label className="ip-toggle" style={{ marginTop: 10 }}>
                  <input type="checkbox" checked={selected.useOriginal} disabled={uploading || selected.status === 'done'}
                    onChange={e => patch(selected.id, { useOriginal: e.target.checked })} />
                  Upload the original instead
                </label>
              )}
              {selected.error && (
                <div className="ip-err">
                  <p style={{ margin: 0 }}>{selected.error}</p>
                  {selected.errorDetail && <p className="is-detail">{selected.errorDetail}</p>}
                  {selected.status === 'error' && selected.method && (
                    <button type="button" className="tm-btn-ghost is-small" onClick={() => requeue(selected.id, {})}>Try again</button>
                  )}
                </div>
              )}
              <p className="ip-hint">
                {selectedKind === 'player'
                  ? 'Crop: drag Top and Waist so every player is cut at the same points. Then fix edges with Erase / Restore.'
                  : 'Use Erase area on leftover background, Restore on anything the cut-out ate.'}
                {' '}Everything runs on your computer; only the finished picture is uploaded.
              </p>
            </div>
          </div>
        )}

        <div className="ip-row is-footer">
          <button type="button" className="tm-btn-ghost" onClick={onClose} disabled={uploading}>Cancel</button>
          {single && selected && (
            <button type="button" className="tm-btn-outline" disabled={uploading || selected.status === 'loading'} onClick={() => uploadAll([selected], true)}>
              Use original
            </button>
          )}
          <button type="button" className="tm-btn-primary" style={{ marginLeft: 'auto' }}
            disabled={uploading || !uploadable.length || (single && !(selected?.status === 'ready'))}
            onClick={() => uploadAll(uploadable)}>
            {uploading ? <><FaSpinner className="ip-spin" /> Uploading…</>
              : single ? 'Use image'
              : `Upload ${uploadable.length} picture${uploadable.length === 1 ? '' : 's'}${anyBusy ? ' ready so far' : ''}`}
          </button>
        </div>
        {!single && items.some(it => it.status === 'done') && pending.length > 0 && !uploading && (
          <p className="ip-hint" style={{ padding: '0 20px 14px', margin: 0 }}>
            Uploaded pictures are already in the form. {pending.length} left: {pending.map(p => targetLabel(p.target)).join(', ')}.
          </p>
        )}
      </div>
    </div>
  );
};

export default ImageStudio;
