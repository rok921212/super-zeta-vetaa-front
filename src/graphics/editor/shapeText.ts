// Text inside a shape: a rectangle, circle, polygon or drawn path may carry
// its own text (`el.text`, or `bind.text` for live data) styled with the same
// text keys a text layer uses. These helpers are what the Inspector, the
// right-click menu and the on-canvas text editor all call, so adding,
// editing and removing text is the same edit everywhere.

import type { ElementStyle, LayoutElement } from '../schema/layoutTypes.ts';
import { TEXT_SHAPE_TYPES } from '../schema/layoutSchema.js';

const SHAPES = new Set<string>(TEXT_SHAPE_TYPES as string[]);

/** Can this layer hold text inside it (shapes), as opposed to being text itself? */
export const canHoldText = (el: Pick<LayoutElement, 'type'>): boolean => SHAPES.has(el.type);

/** Does this shape carry text (typed or connected to data)? */
export const hasShapeText = (el: LayoutElement): boolean => canHoldText(el) && (el.text != null || !!el.bind?.text);

/** Is this layer's text typed on the canvas (a text layer, or a shape that can hold text)? */
export const isTextEditable = (el: LayoutElement): boolean => el.type === 'text' || canHoldText(el);

/** Style keys that only describe text: removed with the text so a plain shape stays plain. */
export const TEXT_STYLE_KEYS: Array<keyof ElementStyle> = [
  'color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform',
  'textShadow', 'align', 'valign', 'textFit', 'textStroke', 'textStrokeWidth', 'textGradient', 'textOverflow', 'whiteSpace',
] as Array<keyof ElementStyle>;

/** Text added to a shape: white, bold, centred, sized to the shape; existing text style is kept. */
export function addShapeText(el: LayoutElement, text = 'Text'): LayoutElement {
  const fontSize = Math.max(10, Math.min(48, Math.round(Math.min(el.h * 0.45, el.w / 4))));
  const defaults: ElementStyle = {
    color: '#ffffff', fontSize, fontWeight: 800, align: 'center', valign: 'middle',
    fontFamily: { ref: 'theme.typography.fontFamily' },
  } as ElementStyle;
  return { ...el, text, style: { ...defaults, ...(el.style || {}) } };
}

/** The shape without its text, its data connection for text, or its text styling. */
export function removeShapeText(el: LayoutElement): LayoutElement {
  const next: LayoutElement = { ...el };
  delete next.text;
  if (next.bind?.text) {
    const bind = { ...next.bind };
    delete bind.text;
    if (Object.keys(bind).length) next.bind = bind; else delete next.bind;
  }
  if (next.style) {
    const style: ElementStyle = { ...next.style };
    for (const k of TEXT_STYLE_KEYS) delete style[k];
    if (Object.keys(style).length) next.style = style; else delete next.style;
  }
  return next;
}

/** Typed text for a text layer or shape. Empty text on a shape removes it; on a text layer it is kept empty. */
export function setTypedText(el: LayoutElement, text: string): LayoutElement {
  const t = text.slice(0, 2000);
  if (canHoldText(el)) {
    if (!t && !el.bind?.text) return removeShapeText(el);
    return el.text == null && !el.bind?.text ? addShapeText(el, t) : { ...el, text: t || undefined };
  }
  const next: LayoutElement = { ...el, text: t };
  if (!t) delete next.text;
  return next;
}

/** Stop showing data in this text, keeping what it showed as typed text. */
export function disconnectText(el: LayoutElement, shown: string): LayoutElement {
  const bind = { ...(el.bind || {}) };
  delete bind.text;
  const next: LayoutElement = { ...el, bind, text: shown || el.text || 'Text' };
  if (!Object.keys(bind).length) delete next.bind;
  return next;
}
