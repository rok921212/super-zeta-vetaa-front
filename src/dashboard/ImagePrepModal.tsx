import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaTimes, FaSpinner } from 'react-icons/fa';
import { prepareImage, loadSource, isModelCached, describeBgRemovalError, OUTPUT_SIZE, type ImageKind } from '../utils/imagePrep';

// Opened when a logo / flag / player photo is picked. Everything happens in
// the browser: background removal (model from IMG.LY's CDN, cached after the
// first use), crop, and resize onto a fixed canvas — so only a small PNG
// ever gets uploaded.

const KIND_LABEL: Record<ImageKind, string> = { logo: 'Team logo', flag: 'Team flag', player: 'Player photo' };
const DEFAULT_REMOVE_BG: Record<ImageKind, boolean> = { logo: true, flag: false, player: true };
const removeBgKey = (kind: ImageKind) => `imagePrep:removeBg:${kind}`;
const CROP_LINE_MIN_GAP = 0.05;

function readRemoveBg(kind: ImageKind): boolean {
  try {
    const v = localStorage.getItem(removeBgKey(kind));
    return v == null ? DEFAULT_REMOVE_BG[kind] : v === '1';
  } catch { return DEFAULT_REMOVE_BG[kind]; }
}

function writeRemoveBg(kind: ImageKind, value: boolean) {
  try { localStorage.setItem(removeBgKey(kind), value ? '1' : '0'); } catch { /* storage blocked */ }
}

type Status = 'loading' | 'model' | 'working' | 'ready' | 'uploading' | 'error';

const STYLES = `
.ip-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 260; padding: 16px; }
.ip-box { width: 100%; max-width: 760px; max-height: 92vh; overflow-y: auto; background: #0B0C0E; border: 1px solid rgba(225,29,46,0.35); box-shadow: 0 40px 80px rgba(0,0,0,0.7); font-family: 'Inter', sans-serif; }
.ip-hdr { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 12px; border-bottom: 1px solid #24262B; }
.ip-body { padding: 16px 20px 20px; }
.ip-panes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 600px) { .ip-panes { grid-template-columns: 1fr; } }
.ip-pane-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #E11D2E; letter-spacing: 2px; margin-bottom: 6px; text-transform: uppercase; }
.ip-frame { position: relative; background: #131418; border: 1px solid #24262B; display: flex; align-items: center; justify-content: center; min-height: 220px; max-height: 420px; overflow: hidden; }
.ip-checker { background-color: #1a1b20; background-image: linear-gradient(45deg, #24262B 25%, transparent 25%), linear-gradient(-45deg, #24262B 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #24262B 75%), linear-gradient(-45deg, transparent 75%, #24262B 75%); background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0; }
.ip-frame img { max-width: 100%; max-height: 400px; display: block; user-select: none; }
.ip-crop-wrap { position: relative; display: inline-block; touch-action: none; cursor: ns-resize; }
.ip-dim { position: absolute; left: 0; right: 0; background: rgba(0,0,0,0.6); pointer-events: none; }
.ip-line { position: absolute; left: 0; right: 0; height: 0; border-top: 2px dashed #E11D2E; pointer-events: none; }
.ip-line span { position: absolute; left: 6px; top: -18px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #fff; background: #E11D2E; padding: 1px 6px; }
.ip-status { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: rgba(11,12,14,0.75); color: #F4F2EE; font-size: 12px; text-align: center; padding: 12px; }
.ip-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.ip-toggle { display: inline-flex; align-items: center; gap: 8px; color: #F4F2EE; font-size: 13px; cursor: pointer; user-select: none; }
.ip-toggle input { accent-color: #E11D2E; width: 15px; height: 15px; }
.ip-hint { color: #93959C; font-size: 12px; line-height: 1.5; margin-top: 8px; }
.ip-err { color: #E11D2E; font-size: 12px; margin-top: 8px; }
.ip-spin { animation: ip-spin 0.9s linear infinite; }
@keyframes ip-spin { to { transform: rotate(360deg); } }
`;

const ImagePrepModal: React.FC<{
  file: File;
  kind: ImageKind;
  /** Uploads the chosen blob; the modal closes when it resolves. */
  upload: (blob: Blob, filename: string) => Promise<void>;
  onClose: () => void;
}> = ({ file, kind, upload, onClose }) => {
  const [source, setSource] = useState<Blob | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [removeBg, setRemoveBg] = useState(() => readRemoveBg(kind));
  // Committed crop (drives the preview) vs. live crop while dragging.
  const [crop, setCrop] = useState({ top: 0, bottom: 1 });
  const [dragCrop, setDragCrop] = useState({ top: 0, bottom: 1 });
  const [status, setStatus] = useState<Status>('loading');
  const [modelProgress, setModelProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // The library's own message, shown small under the explanation (for support).
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  // Bumped by "Try again": re-runs the pipeline (a failed cut-out is not cached).
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const runRef = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const draggingRef = useRef<'top' | 'bottom' | null>(null);

  // Downscaled working copy (≤2048 px) — the only thing the pipeline touches.
  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    loadSource(file)
      .then(blob => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setSource(blob);
        setSourceUrl(url);
      })
      .catch(() => { if (alive) { setStatus('error'); setError('This file could not be read as an image.'); } });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [file]);

  // Re-run the pipeline whenever the toggle or committed crop changes. The
  // cutout itself is cached per source, so crop changes are instant.
  useEffect(() => {
    if (!source) return;
    const run = ++runRef.current;
    setError(null);
    setErrorDetail(null);
    setStatus(removeBg && !isModelCached() ? 'model' : 'working');
    prepareImage(source, {
      kind,
      removeBg,
      cropTopRatio: crop.top > 0.001 ? crop.top : undefined,
      cropBottomRatio: crop.bottom < 0.999 ? crop.bottom : undefined,
      onModelProgress: f => { if (runRef.current === run) setModelProgress(f); },
    })
      .then(blob => {
        if (runRef.current !== run) return;
        setResult(blob);
        setStatus('ready');
      })
      .catch(err => {
        if (runRef.current !== run) return;
        console.error('Image prep failed:', err);
        setResult(null);
        setStatus('error');
        setError(removeBg ? describeBgRemovalError(err) : 'Could not process this image. Use the original instead.');
        setErrorDetail(String(err?.message || err || '').slice(0, 300) || null);
      });
  }, [source, removeBg, crop, kind, attempt]);

  useEffect(() => {
    if (!result) { setResultUrl(null); return; }
    const url = URL.createObjectURL(result);
    setResultUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  const toggleRemoveBg = useCallback((value: boolean) => {
    setRemoveBg(value);
    writeRemoveBg(kind, value);
  }, [kind]);

  // ── Crop lines (players only), same interaction as the imageResize helper ──
  const ratioFromClientY = (clientY: number) => {
    const el = imgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
  };

  const applyRatio = (line: 'top' | 'bottom', rel: number) => {
    setDragCrop(prev =>
      line === 'top'
        ? { top: Math.max(0, Math.min(rel, prev.bottom - CROP_LINE_MIN_GAP)), bottom: prev.bottom }
        : { top: prev.top, bottom: Math.min(1, Math.max(rel, prev.top + CROP_LINE_MIN_GAP)) }
    );
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rel = ratioFromClientY(e.clientY);
    if (rel == null) return;
    const line = rel - dragCrop.top < dragCrop.bottom - rel ? 'top' : 'bottom';
    draggingRef.current = line;
    e.currentTarget.setPointerCapture(e.pointerId);
    applyRatio(line, rel);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const line = draggingRef.current;
    if (!line) return;
    const rel = ratioFromClientY(e.clientY);
    if (rel != null) applyRatio(line, rel);
  };

  const stopDragging = () => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    setCrop(dragCrop);
  };

  const resetCrop = () => {
    setDragCrop({ top: 0, bottom: 1 });
    setCrop({ top: 0, bottom: 1 });
  };

  const baseName = file.name.replace(/\.[^.]+$/, '') || kind;

  const doUpload = useCallback(async (blob: Blob, filename: string) => {
    setStatus('uploading');
    setError(null);
    try {
      await upload(blob, filename);
      onClose();
    } catch (err: any) {
      setStatus(result ? 'ready' : 'error');
      setError(err?.message === 'Max file size is 5MB' ? 'The original is over 5 MB — use the processed image.' : 'Upload failed. Try again.');
    }
  }, [upload, onClose, result]);

  const busy = status === 'loading' || status === 'model' || status === 'working' || status === 'uploading';
  const out = OUTPUT_SIZE[kind];

  return (
    // stopPropagation: this sits inside the team form's overlay, whose own
    // click-outside handler would otherwise close the whole form.
    <div className="ip-overlay" onClick={e => { e.stopPropagation(); if (status !== 'uploading') onClose(); }}>
      <style>{STYLES}</style>
      <div className="ip-box" onClick={e => e.stopPropagation()}>
        <div className="ip-hdr">
          <span className="tm-orb" style={{ color: '#F4F2EE', fontSize: 15, fontWeight: 700, textTransform: 'uppercase' }}>
            {KIND_LABEL[kind]}
          </span>
          <button onClick={onClose} disabled={status === 'uploading'} aria-label="Close" style={{ width: 30, height: 30, background: 'transparent', border: '1px solid #24262B', color: '#93959C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FaTimes size={13} />
          </button>
        </div>
        <div className="ip-body">
          <div className="ip-panes">
            <div>
              <div className="ip-pane-label">{kind === 'player' ? 'Original — drag to set crop' : 'Original'}</div>
              <div className="ip-frame">
                {sourceUrl && (kind === 'player' ? (
                  <div className="ip-crop-wrap" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDragging} onPointerCancel={stopDragging}>
                    <img ref={imgRef} src={sourceUrl} alt="Original" draggable={false} />
                    <div className="ip-dim" style={{ top: 0, height: `${dragCrop.top * 100}%` }} />
                    <div className="ip-dim" style={{ top: `${dragCrop.bottom * 100}%`, bottom: 0 }} />
                    <div className="ip-line" style={{ top: `${dragCrop.top * 100}%` }}><span>Top</span></div>
                    <div className="ip-line" style={{ top: `${dragCrop.bottom * 100}%` }}><span>Waist</span></div>
                  </div>
                ) : (
                  <img src={sourceUrl} alt="Original" draggable={false} />
                ))}
              </div>
            </div>
            <div>
              <div className="ip-pane-label">Result · {out.width}×{out.height}</div>
              <div className="ip-frame ip-checker">
                {resultUrl && <img src={resultUrl} alt="Result" />}
                {(status === 'loading' || status === 'model' || status === 'working') && (
                  <div className="ip-status">
                    <FaSpinner className="ip-spin" />
                    {status === 'model'
                      ? <>Downloading background model (first time only)…{modelProgress > 0 && ` ${Math.round(modelProgress * 100)}%`}</>
                      : status === 'loading' ? 'Loading…' : removeBg ? 'Removing background…' : 'Processing…'}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="ip-row">
            <label className="ip-toggle">
              <input type="checkbox" checked={removeBg} disabled={status === 'uploading'} onChange={e => toggleRemoveBg(e.target.checked)} />
              Remove background
            </label>
            {kind === 'player' && (
              <button type="button" className="tm-btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={resetCrop} disabled={status === 'uploading'}>
                Reset crop
              </button>
            )}
          </div>
          <p className="ip-hint">
            {kind === 'player'
              ? 'Drag the Top line down to trim headroom and the Waist line up to cut at the waist, so every player is cut at the same points. '
              : 'The logo is trimmed to its edges and centred. '}
            Processing runs on your computer; only the finished image is uploaded.
          </p>
          {error && (
            <div className="ip-err">
              <p style={{ margin: 0 }}>{error}</p>
              {errorDetail && <p style={{ margin: '4px 0 0', color: '#93959C', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{errorDetail}</p>}
              {status === 'error' && (
                <button type="button" className="tm-btn-ghost" style={{ marginTop: 8, padding: '6px 12px', fontSize: 12 }} onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </button>
              )}
            </div>
          )}

          <div className="ip-row" style={{ borderTop: '1px solid #24262B', paddingTop: 14 }}>
            <button type="button" className="tm-btn-ghost" onClick={onClose} disabled={status === 'uploading'}>Cancel</button>
            <button type="button" className="tm-btn-outline" disabled={busy} onClick={() => doUpload(file, file.name)}>
              Use original
            </button>
            <button type="button" className="tm-btn-primary" style={{ marginLeft: 'auto' }} disabled={busy || !result} onClick={() => result && doUpload(result, `${baseName}.png`)}>
              {status === 'uploading' ? <><FaSpinner className="ip-spin" /> Uploading…</> : 'Use image'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImagePrepModal;
