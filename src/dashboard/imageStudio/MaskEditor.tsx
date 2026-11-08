import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { strokeBrush, wandFill, type Mask, type MarkMode } from '../../utils/imagePrep/mask';
import type { WorkingImage, RGB } from '../../utils/imagePrep';

// The marking canvas. It draws the working copy at full resolution into one
// canvas (CSS-scaled for zoom) and repaints only the rectangle a stroke
// touched, so brushing stays smooth on 1600 px pictures.

export type Tool = 'remove' | 'keep' | 'wand-remove' | 'wand-keep' | 'crop' | 'pick';
export type ViewMode = 'marks' | 'cutout' | 'original';

const CROP_LINE_MIN_GAP = 0.05;
const TINT: RGB = [225, 29, 46];

export interface Crop { top: number; bottom: number }

const MaskEditor: React.FC<{
  img: WorkingImage;
  mask: Mask;
  /** Bumped by the parent whenever `mask` was replaced or changed outside. */
  maskVersion: number;
  tool: Tool;
  brushSize: number; // in screen px
  wandTolerance: number;
  view: ViewMode;
  zoom: number;
  showCrop: boolean;
  crop: Crop;
  onCropChange: (c: Crop) => void;
  /** Called once before a stroke / wand fill changes the mask (undo snapshot). */
  onBeforeEdit: () => void;
  /** Called after the stroke ends. */
  onAfterEdit: () => void;
  onPickColor?: (c: RGB) => void;
}> = ({ img, mask, maskVersion, tool, brushSize, wandTolerance, view, zoom, showCrop, crop, onCropChange, onBeforeEdit, onAfterEdit, onPickColor }) => {
  const { px, alpha } = img;
  const { width: w, height: h } = px;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewDataRef = useRef<ImageData | null>(null);
  const strokeRef = useRef<{ x: number; y: number } | null>(null);
  const cropDragRef = useRef<'top' | 'bottom' | null>(null);
  const [dragCrop, setDragCrop] = useState<Crop>(crop);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [fit, setFit] = useState(1);

  useEffect(() => { if (!cropDragRef.current) setDragCrop(crop); }, [crop]);

  // Fit-to-frame scale (CSS px per image px at zoom 1).
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const availW = el.clientWidth - 2;
      const availH = Math.max(240, Math.min(window.innerHeight * 0.5, 580));
      setFit(Math.min(availW / w, availH / h, 4));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  const paint = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let vd = viewDataRef.current;
    if (!vd || vd.width !== w || vd.height !== h) { vd = ctx.createImageData(w, h); viewDataRef.current = vd; }
    const out = vd.data;
    const src = px.data;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = y * w + x;
        const i = p * 4;
        if (view === 'original') {
          out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = src[i + 3];
        } else if (view === 'cutout') {
          out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = mask[p];
        } else {
          // Removed areas tinted red over the original, kept areas untouched.
          const m = mask[p] / 255;
          const k = 1 - m;
          out[i] = src[i] * m + (src[i] * 0.35 + TINT[0] * 0.65) * k;
          out[i + 1] = src[i + 1] * m + (src[i + 1] * 0.35 + TINT[1] * 0.65) * k;
          out[i + 2] = src[i + 2] * m + (src[i + 2] * 0.35 + TINT[2] * 0.65) * k;
          out[i + 3] = src[i + 3];
        }
      }
    }
    ctx.putImageData(vd, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }, [px, mask, w, h, view]);

  // Full repaint when the picture, mask or view changes.
  useEffect(() => { paint(0, 0, w, h); }, [paint, maskVersion, w, h]);

  const scale = fit * zoom; // CSS px per image px

  const toImage = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * w,
      y: ((e.clientY - rect.top) / rect.height) * h,
      rel: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const brushRadius = () => Math.max(1, brushSize / 2 / scale);

  const applyCropRatio = (line: 'top' | 'bottom', rel: number) => {
    setDragCrop(prev => line === 'top'
      ? { top: Math.max(0, Math.min(rel, prev.bottom - CROP_LINE_MIN_GAP)), bottom: prev.bottom }
      : { top: prev.top, bottom: Math.min(1, Math.max(rel, prev.top + CROP_LINE_MIN_GAP)) });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const { x, y, rel } = toImage(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'crop') {
      const line = Math.abs(rel - dragCrop.top) < Math.abs(dragCrop.bottom - rel) ? 'top' : 'bottom';
      cropDragRef.current = line;
      applyCropRatio(line, rel);
      return;
    }
    if (tool === 'pick') {
      const xi = Math.min(w - 1, Math.max(0, Math.floor(x)));
      const yi = Math.min(h - 1, Math.max(0, Math.floor(y)));
      const i = (yi * w + xi) * 4;
      onPickColor?.([px.data[i], px.data[i + 1], px.data[i + 2]]);
      return;
    }
    if (tool === 'wand-remove' || tool === 'wand-keep') {
      onBeforeEdit();
      const rect = wandFill(px, mask, x, y, wandTolerance, tool === 'wand-remove' ? 'remove' : 'keep', alpha);
      if (rect) paint(rect[0], rect[1], rect[2], rect[3]);
      onAfterEdit();
      return;
    }
    onBeforeEdit();
    strokeRef.current = { x, y };
    const r = strokeBrush(mask, w, h, x, y, x, y, brushRadius(), tool as MarkMode, alpha);
    paint(r[0], r[1], r[2], r[3]);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y, rel } = toImage(e);
    const rect = canvasRef.current!.getBoundingClientRect();
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (cropDragRef.current) { applyCropRatio(cropDragRef.current, rel); return; }
    const last = strokeRef.current;
    if (!last) return;
    const r = strokeBrush(mask, w, h, last.x, last.y, x, y, brushRadius(), tool as MarkMode, alpha);
    strokeRef.current = { x, y };
    paint(r[0], r[1], r[2], r[3]);
  };

  const endPointer = () => {
    if (cropDragRef.current) {
      cropDragRef.current = null;
      onCropChange(dragCrop);
    }
    if (strokeRef.current) {
      strokeRef.current = null;
      onAfterEdit();
    }
  };

  const isBrush = tool === 'remove' || tool === 'keep';
  const cursorStyle = tool === 'crop' ? 'ns-resize' : isBrush ? 'none' : 'crosshair';

  return (
    // At Fit the picture always fits; scrollbars only when zoomed in.
    <div ref={wrapRef} className="is-canvas-scroll" style={{ overflow: zoom > 1 ? 'auto' : 'hidden' }}>
      <div
        className="is-canvas-wrap ip-checker"
        style={{ width: w * scale, height: h * scale, cursor: cursorStyle }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={() => setCursor(null)}
      >
        <canvas ref={canvasRef} width={w} height={h} style={{ width: '100%', height: '100%', display: 'block', imageRendering: zoom >= 2 ? 'pixelated' : 'auto' }} />
        {showCrop && (
          <>
            <div className="ip-dim" style={{ top: 0, height: `${dragCrop.top * 100}%` }} />
            <div className="ip-dim" style={{ top: `${dragCrop.bottom * 100}%`, bottom: 0 }} />
            <div className="ip-line is-top" style={{ top: `${dragCrop.top * 100}%` }}><span>Top</span></div>
            <div className="ip-line" style={{ top: `${dragCrop.bottom * 100}%` }}><span>Waist</span></div>
          </>
        )}
        {isBrush && cursor && (
          <div
            className="is-brush"
            style={{
              left: cursor.x - brushSize / 2, top: cursor.y - brushSize / 2, width: brushSize, height: brushSize,
              borderColor: tool === 'keep' ? '#22C55E' : '#E11D2E',
            }}
          />
        )}
      </div>
    </div>
  );
};

export default MaskEditor;
