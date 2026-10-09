// Image commands (pure, undoable): place an uploaded image as a new layer,
// put one into a frame (a shape that clips it), pan / zoom it inside the
// frame, take it out again, and change the frame's shape without losing the
// picture. A frame and its picture stay independently editable: the picture
// is `imageFill` on the shape, never a flattened bitmap of the two.

import type { ImageFill, LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { FRAME_TYPES, IMAGE_TYPES } from '../schema/layoutSchema.js';
import { assetRef } from '../renderer/assets.ts';
import { type Command, editElements } from './store.ts';
import { allIds, locate } from './tree.ts';
import { newId } from './ids.ts';
import { polygonFields, shapePreset } from './shapes.ts';

export const isFrame = (el: LayoutElement | null | undefined): boolean => !!el && (FRAME_TYPES as string[]).includes(el.type);
export const isImageLayer = (el: LayoutElement | null | undefined): boolean => !!el && (IMAGE_TYPES as string[]).includes(el.type) && el.type !== 'video';
/** A layer an image can be dropped onto. */
export const acceptsImage = (el: LayoutElement | null | undefined): boolean => isFrame(el) || isImageLayer(el);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface AssetLike { _id: string; name: string; width: number; height: number }

/** A new image layer for an uploaded asset, at its own proportions, fitted inside the stage and centred on `at`. */
export function createImageElement(doc: LayoutDocument, asset: AssetLike, at?: { x: number; y: number }): LayoutElement {
  const W = doc.stage.width;
  const H = doc.stage.height;
  const aw = asset.width || 400;
  const ah = asset.height || 400;
  // Never larger than 60% of the stage, never upscaled past its own pixels.
  const k = Math.min(1, (W * 0.6) / aw, (H * 0.6) / ah);
  const w = Math.max(8, Math.round(aw * k));
  const h = Math.max(8, Math.round(ah * k));
  const cx = at ? at.x : W / 2;
  const cy = at ? at.y : H / 2;
  return {
    id: newId('image', allIds(doc.elements)),
    type: 'image',
    name: asset.name.slice(0, 120) || 'Image',
    x: Math.round(cx - w / 2),
    y: Math.round(cy - h / 2),
    w,
    h,
    src: assetRef(asset._id),
    style: { objectFit: 'contain' },
  };
}

/**
 * Put an image into a layer: a frame gets it as its clipped picture (the
 * frame's fit / zoom / position are kept when one is being replaced), an image
 * layer gets a new source. Null when the layer cannot hold an image.
 */
export function setLayerImageCmd(doc: LayoutDocument, id: string, src: string): Command | null {
  const el = locate(doc.elements, id)?.el;
  if (!el) return null;
  if (isFrame(el)) {
    return editElements(doc, [id], (e) => ({ ...e, imageFill: { fit: 'cover', ...(e.imageFill || {}), src } }), e_label(el, 'Place image in'));
  }
  if (isImageLayer(el)) {
    return editElements(doc, [id], (e) => { const next = { ...e, src }; delete next.crop; return next; }, e_label(el, 'Replace image of'));
  }
  return null;
}

const e_label = (el: LayoutElement, verb: string) => `${verb} ${el.name || el.type}`;

/** Take the picture out of a frame. The frame, its fill and its outline are untouched. */
export function removeFrameImageCmd(doc: LayoutDocument, id: string): Command | null {
  const el = locate(doc.elements, id)?.el;
  if (!el || !el.imageFill) return null;
  return editElements(doc, [id], (e) => {
    const next = { ...e };
    delete next.imageFill;
    if (next.bind?.src) { const bind = { ...next.bind }; delete bind.src; if (Object.keys(bind).length) next.bind = bind; else delete next.bind; }
    return next;
  }, 'Remove image from frame');
}

/** Change how the picture sits in its frame. Values are clamped to what the schema allows. */
export function patchImageFill(fill: ImageFill | undefined, patch: Partial<ImageFill>): ImageFill {
  const next: ImageFill = { ...(fill || {}), ...patch };
  if (next.scale != null) next.scale = round3(clamp(next.scale, 0.1, 10));
  if (next.posX != null) next.posX = round3(clamp(next.posX, 0, 1));
  if (next.posY != null) next.posY = round3(clamp(next.posY, 0, 1));
  if (next.opacity != null) next.opacity = round3(clamp(next.opacity, 0, 1));
  // Defaults are not stored.
  if (next.scale === 1) delete next.scale;
  if (next.posX === 0.5) delete next.posX;
  if (next.posY === 0.5) delete next.posY;
  if (next.opacity === 1) delete next.opacity;
  return next;
}

export function imageFillCmd(doc: LayoutDocument, id: string, patch: Partial<ImageFill>, label = 'Adjust image', coalesceKey?: string): Command | null {
  const el = locate(doc.elements, id)?.el;
  if (!el || !isFrame(el)) return null;
  return editElements(doc, [id], (e) => ({ ...e, imageFill: patchImageFill(e.imageFill, patch) }), label, coalesceKey);
}

/**
 * Dragging the picture inside its frame: `dx`, `dy` are the pointer's movement
 * as fractions of the frame's size. The focal point moves the other way (drag
 * right = see more of the left of the picture).
 */
export function panImageFill(fill: ImageFill | undefined, dx: number, dy: number): ImageFill {
  const s = fill?.scale ?? 1;
  return patchImageFill(fill, { posX: (fill?.posX ?? 0.5) - dx / Math.max(0.25, s), posY: (fill?.posY ?? 0.5) - dy / Math.max(0.25, s) });
}

/** Wheel zoom inside the frame (one notch = about 8%). */
export function zoomImageFill(fill: ImageFill | undefined, deltaY: number): ImageFill {
  const s = fill?.scale ?? 1;
  return patchImageFill(fill, { scale: s * Math.exp(-Math.sign(deltaY) * 0.08) });
}

/**
 * Give a frame another shape and keep everything else: its picture and how it
 * is cropped, fill, outline, bindings, animations, position and size.
 * `shape` is 'rect', 'ellipse', or a preset id from ./shapes.ts.
 */
export function convertFrameShapeCmd(doc: LayoutDocument, id: string, shape: string): Command | null {
  const el = locate(doc.elements, id)?.el;
  if (!el || !isFrame(el)) return null;
  const preset = shape === 'rect' || shape === 'ellipse' ? null : shapePreset(shape);
  if (shape !== 'rect' && shape !== 'ellipse' && !preset) return null;
  return editElements(doc, [id], (e) => {
    const next: LayoutElement = { ...e };
    delete next.points;
    delete next.d;
    delete next.vb;
    if (preset) {
      const w = Math.max(1, e.w);
      const h = Math.max(1, e.h);
      Object.assign(next, polygonFields(preset.points(w, h), w, h));
      // A CSS corner radius means nothing on a polygon.
      if (next.style?.radius != null) { const style = { ...next.style }; delete style.radius; next.style = style; }
    } else {
      next.type = shape as 'rect' | 'ellipse';
    }
    return next;
  }, `Frame shape: ${preset ? preset.label : shape === 'rect' ? 'Rectangle' : 'Ellipse'}`);
}

/** What shape a frame currently is, for the picker: 'rect', 'ellipse', 'polygon' or 'path'. */
export const frameShapeOf = (el: LayoutElement): string => el.type;
