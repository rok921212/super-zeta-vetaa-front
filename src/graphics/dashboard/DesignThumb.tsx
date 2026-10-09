// Thumbnails on the dashboard. A thumbnail is not a screenshot: it is the real
// LayoutRenderer drawing the real document, scaled into the card, on a frozen
// snapshot of sample data. So it can never drift from what the design looks
// like, costs no storage, and needs no image library.
//
// Nothing is drawn (or fetched) until the card scrolls into view.

import React, { memo, useEffect, useRef, useState } from 'react';
import type { LayoutDocument, LayoutElement } from '../schema/layoutTypes.ts';
import { createEmptyLayout } from '../schema/layoutSchema.js';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { layoutsApi, type LayoutSummary } from '../api.ts';
import { CACHE_KEYS, cached } from '../requestCache.ts';
import { useSampleState } from './sampleState.ts';

export const CHECKER: React.CSSProperties = {
  backgroundColor: '#15151a',
  backgroundImage: 'linear-gradient(45deg,#1c1c22 25%,transparent 25%),linear-gradient(-45deg,#1c1c22 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1c1c22 75%),linear-gradient(-45deg,transparent 75%,#1c1c22 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
};

/** True once the element has been on screen (and stays true: a drawn thumbnail is kept). */
export function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen || !ref.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

class ThumbBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div className="flex h-full w-full items-center justify-center text-[10px] text-red-300/80">Preview failed</div>
      : this.props.children;
  }
}

/** A document drawn still (no animation, no pointer events), fitted and centred in its parent. */
export const StaticStage = memo(function StaticStage({ doc }: { doc: LayoutDocument }) {
  const state = useSampleState();
  const W = doc.stage?.width || 1920;
  const H = doc.stage?.height || 1080;
  // The renderer fits the stage to its box from the top-left corner, so the box itself has the stage's shape.
  const wide = W / H >= 16 / 9;
  return (
    <div className="flex h-full w-full items-center justify-center" style={{ pointerEvents: 'none' }} aria-hidden="true">
      <div style={{ aspectRatio: `${W} / ${H}`, width: wide ? '100%' : 'auto', height: wide ? 'auto' : '100%', maxWidth: '100%', maxHeight: '100%' }}>
        <ThumbBoundary>
          <LayoutRenderer layout={doc} state={state} events={null} mode="editor" fit="contain" playTimelines={false} previewEvents />
        </ThumbBoundary>
      </div>
    </div>
  );
});

/** A template's elements on an empty stage. */
export function templateDocument(elements: LayoutElement[], stage?: Partial<LayoutDocument['stage']>): LayoutDocument {
  const doc = createEmptyLayout() as LayoutDocument;
  doc.elements = elements;
  if (stage) doc.stage = { ...doc.stage, ...stage };
  return doc;
}

/** The thumbnail of a saved design: its draft, fetched when the card is first seen. */
export const DesignThumb = memo(function DesignThumb({ layout, onSize }: {
  layout: Pick<LayoutSummary, '_id' | 'name' | 'draftRev'>;
  /** The canvas size, once the draft is known (designs saved before sizes were recorded). */
  onSize?(size: { width: number; height: number }): void;
}) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [doc, setDoc] = useState<LayoutDocument | null>(null);
  const [failed, setFailed] = useState(false);
  const onSizeRef = useRef(onSize);
  onSizeRef.current = onSize;
  useEffect(() => {
    if (!seen) return;
    let alive = true;
    setFailed(false);
    cached<LayoutDocument>(CACHE_KEYS.thumb(layout._id, layout.draftRev), async () => (await layoutsApi.get(layout._id)).draft, { ttlMs: 10 * 60000 })
      .then((d) => {
        if (!alive) return;
        setDoc(d);
        if (d?.stage) onSizeRef.current?.({ width: d.stage.width, height: d.stage.height });
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [seen, layout._id, layout.draftRev]);

  return (
    <div ref={ref} className="h-full w-full" style={CHECKER} data-testid="design-thumb">
      {doc ? <StaticStage doc={doc} /> : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="text-2xl font-semibold tracking-wide text-white/15">{failed ? '!' : layout.name.slice(0, 2).toUpperCase()}</span>
        </div>
      )}
    </div>
  );
});

/** A template card's thumbnail: drawn straight from its document when first seen. */
export const DocThumb = memo(function DocThumb({ make, label }: { make(): LayoutDocument; label: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [doc, setDoc] = useState<LayoutDocument | null>(null);
  const makeRef = useRef(make);
  makeRef.current = make;
  useEffect(() => { if (seen && !doc) setDoc(makeRef.current()); }, [seen, doc]);
  return (
    <div ref={ref} className="h-full w-full" style={CHECKER}>
      {doc ? <StaticStage doc={doc} /> : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="text-xl font-semibold tracking-wide text-white/15">{label.slice(0, 2).toUpperCase()}</span>
        </div>
      )}
    </div>
  );
});
