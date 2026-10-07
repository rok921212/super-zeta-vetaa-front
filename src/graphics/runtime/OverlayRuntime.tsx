// Published Designer overlay — the page an OBS Browser Source loads:
//   /o/:publicId?t=<tournamentId>&r=<roundId>&m=<matchId>&mode=<matchMode>&clean=1&debug=1
//
// 1. fetch the published layout (cloud, ETag-revalidated), validate it with
//    the shared schema;
// 2. run the ONE overlay engine (same protobuf relay feed, recovery and
//    events as the built-in themes) with the full feed (view: null);
// 3. render with the same LayoutRenderer the Designer uses;
// 4. every 60s, pick up a new publish: validate + preload, then swap
//    atomically — an invalid publish never replaces a working layout.
// Output is transparent, with no spinners / scrollbars / UI unless
// ?debug=1; a "relay offline" badge only when the relay is unreachable and
// ?clean=1 is not set.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useOverlayEngine } from '../../overlayClient/react.ts';
import { createAppTransport } from '../../overlayClient/appTransport.ts';
import type { EngineOptions } from '../../overlayClient/engineTypes.ts';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { registerFontFaces } from '../renderer/fonts.ts';
import { fetchPublishedOverlay } from '../api.ts';
import { useOverlaySyncTarget } from '../../dashboard/overlaySync.ts';
import { decideSwap, preloadImages, staticAssetUrls, type LoadedLayout } from './loadLayout.ts';

const HOT_RELOAD_MS = 60000;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

export default function OverlayRuntime() {
  const { publicId = '' } = useParams<{ publicId: string }>();
  const [params] = useSearchParams();
  const clean = params.get('clean') === '1';
  const debug = params.get('debug') === '1';

  const [layout, setLayout] = useState<LoadedLayout | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const layoutRef = useRef<LoadedLayout | null>(null);
  layoutRef.current = layout;

  // Transparent page for OBS compositing.
  useEffect(() => {
    const prev = { html: document.documentElement.style.background, body: document.body.style.background, overflow: document.body.style.overflow };
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.background = prev.html;
      document.body.style.background = prev.body;
      document.body.style.overflow = prev.overflow;
    };
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const payload = await fetchPublishedOverlay(publicId, signal);
      const decision = decideSwap(layoutRef.current, payload);
      if (decision.action === 'keep') {
        if (decision.reason === 'invalid') {
          console.warn('[overlay] published layout rejected (keeping the current one):', decision.errors);
          setRejected(`rev ${payload.publishedRev} rejected: ${decision.errors?.[0]?.path} ${decision.errors?.[0]?.message}`);
          if (!layoutRef.current) setLoadError('Published layout is invalid');
        }
        return;
      }
      const assetBase = decision.next.payload.assetBase || window.location.origin;
      await preloadImages(staticAssetUrls(decision.next.doc, assetBase));
      if (signal?.aborted) return;
      registerFontFaces(decision.next.payload.fonts);
      setLayout(decision.next); // atomic: the old tree renders until this moment
      setLoadError(null);
      setRejected(null);
    } catch (err: any) {
      if (signal?.aborted) return;
      if (!layoutRef.current) setLoadError(err?.status === 404 ? 'Overlay not found or not published' : 'Could not load overlay');
      console.warn('[overlay] layout fetch failed:', err?.message || err);
    }
  }, [publicId]);

  useEffect(() => {
    const ctl = new AbortController();
    load(ctl.signal);
    const t = setInterval(() => load(ctl.signal), HOT_RELOAD_MS);
    return () => { ctl.abort(); clearInterval(t); };
  }, [load]);

  // URL overrides the layout's saved defaults.
  const defaults = layout?.payload.defaults;
  // SYNC OVERLAY: the account's sync target (if any) replaces the round, and
  // with it the pinned match — see dashboard/overlaySync.ts.
  // A permanent link (?k=<overlay key>) names no round at all and takes
  // both ids from that target.
  const sync = useOverlaySyncTarget(
    params.get('t') || defaults?.tournamentId || '',
    params.get('r') || defaults?.roundId || '',
    params.get('k')
  );
  const tournamentId = sync.tournamentId || '';
  const roundId = sync.roundId || '';
  const matchId = sync.redirected ? null : params.get('m') || null;
  const mode = sync.redirected ? 'selectedMatch' : params.get('mode') || defaults?.matchMode || 'selectedMatch';
  const idsOk = OBJECT_ID_RE.test(tournamentId) && OBJECT_ID_RE.test(roundId);

  const engineOptions = useMemo<EngineOptions | null>(() => {
    if (!idsOk) return null;
    const fixed = mode === 'fixedMatch' && !!matchId && OBJECT_ID_RE.test(matchId);
    return {
      tournamentId,
      roundId,
      matchId: fixed ? matchId : null,
      followSelected: !fixed,
      view: null, // the full feed: every field, every event
      debug,
    };
  }, [idsOk, tournamentId, roundId, matchId, mode, debug]);

  const makeTransport = useCallback(() => createAppTransport(), []);
  const { state, engine } = useOverlayEngine(engineOptions, makeTransport);

  const assetBase = layout?.payload.assetBase || window.location.origin;
  const phase = state?.status.phase;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'transparent', overflow: 'hidden' }}>
      {layout && (
        <LayoutRenderer layout={layout.doc} state={state} events={engine} assetBase={assetBase} fit="contain" />
      )}
      {!clean && phase === 'RELAY_OFFLINE' && (
        <div style={badgeStyle}>Relay offline — start the ScoreSync desktop app</div>
      )}
      {debug && (
        <DebugPanel
          lines={[
            `layout: ${publicId} rev ${layout?.rev ?? '-'}${rejected ? ` (${rejected})` : ''}`,
            loadError ? `error: ${loadError}` : null,
            idsOk ? `round: ${tournamentId}/${roundId} mode=${mode}${matchId ? ` m=${matchId}` : ''}` : 'no tournament/round — add ?t=&r= or set defaults in the Designer',
            state ? `engine: ${state.status.phase} via ${state.status.transport} seq=${state.status.lastSequence} gaps=${state.status.sequenceGapCount} reconnects=${state.status.reconnectCount}` : 'engine: idle',
            state ? `match: ${state.matchData?.matchId ?? '-'} teams=${state.matchData?.teams?.length ?? 0} dead=${state.deadTeamList.length} stale=${state.status.staleForMs}ms` : null,
            engine ? `diag: ${summarizeDiag(engine.diagnostics())}` : null,
          ]}
        />
      )}
    </div>
  );
}

function summarizeDiag(d: ReturnType<NonNullable<ReturnType<typeof useOverlayEngine>['engine']>['diagnostics']>): string {
  const ev = Object.entries(d.events).map(([k, v]) => `${k}:${v}`).join(' ');
  return `bulk=${d.bulkFetches} deltas=${d.deltasApplied} snaps=${d.snapshotsApplied} bytes=${Math.round((d.bulkBytes + d.socketBytes) / 1024)}KB cache=${d.cache.entries}/${d.cache.maxEntries} ${ev}`;
}

const badgeStyle: React.CSSProperties = {
  position: 'fixed', right: 12, bottom: 12, padding: '6px 10px', borderRadius: 6,
  background: 'rgba(220,38,38,0.9)', color: '#fff', font: '600 13px system-ui, sans-serif', zIndex: 10,
};

function DebugPanel({ lines }: { lines: Array<string | null> }) {
  return (
    <pre style={{
      position: 'fixed', left: 8, top: 8, margin: 0, padding: 8, maxWidth: '60vw', whiteSpace: 'pre-wrap',
      background: 'rgba(0,0,0,0.75)', color: '#a7f3d0', font: '12px/1.4 ui-monospace, monospace', zIndex: 11, borderRadius: 6,
    }}>
      {lines.filter(Boolean).join('\n')}
    </pre>
  );
}
