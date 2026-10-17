// The code layer (element type `code`): the designer's own component (TSX /
// JSX + Tailwind, like the built-in themes) or plain JS + HTML + CSS, running
// in a sandboxed iframe.
//
//   • sandbox="allow-scripts" without allow-same-origin: the code gets an
//     opaque origin — no access to this page, its storage or its login.
//   • CSP connect-src 'none': it cannot fetch, open sockets or send beacons.
//   • It never compiles anything here: it runs the JS/CSS the editor compiled
//     on save (el.code.compiledJs / compiledCss).
//
// Data goes in by postMessage: the props a theme component gets, sent as a
// patch of what changed, at most once per frame. Live events (feed.last) are
// forwarded as they happen.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LeafProps } from '../renderer/elements.tsx';
import { assetFileUrl } from '../renderer/assets.ts';
import { RUNTIME_PATH, codeProps, diffProps, isFromFrame, type ToFrameBody } from './protocol.ts';
import { FRAME_SANDBOX, buildSrcdoc } from './srcdoc.ts';
import { fontBytesFor } from './fontBridge.ts';
import { errorHint, errorLine } from './diagnose.ts';
import { describeStatus, setCodeStatus, type CodeRunStatus } from './layerStatus.ts';

// ── the runtime text: fetched once per page, inlined into every frame ───────
let runtimeText: string | null = null;
let runtimePromise: Promise<string> | null = null;

/** Tests (and hosts that bundle the runtime themselves) can hand it over directly. */
export function setCodeRuntime(text: string | null): void {
  runtimeText = text;
  runtimePromise = text == null ? null : Promise.resolve(text);
}

export function loadCodeRuntime(): Promise<string> {
  if (runtimeText != null) return Promise.resolve(runtimeText);
  if (!runtimePromise) {
    const base = (typeof process !== 'undefined' && process.env?.PUBLIC_URL) || '';
    runtimePromise = fetch(`${base}${RUNTIME_PATH}`)
      .then((r) => { if (!r.ok) throw new Error(`code runtime: HTTP ${r.status}`); return r.text(); })
      .then((t) => (runtimeText = t))
      .catch((err) => { runtimePromise = null; throw err; });
  }
  return runtimePromise;
}

const assetOrigin = () => { try { return new URL(assetFileUrl('0'.repeat(24))).origin; } catch { return ''; } };

const BEAT_TIMEOUT = 7000;

export const CodeLayerEl: React.FC<LeafProps> = ({ el, style, scope, mode }) => {
  const code = el.code;
  const frame = useRef<HTMLIFrameElement>(null);
  const [runtime, setRuntime] = useState<string | null>(runtimeText);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [frameError, setFrameError] = useState<{ message: string; stack?: string } | null>(null);
  const [drawn, setDrawn] = useState<{ count: number; visible: number; inside: number } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [stalled, setStalled] = useState(false);
  const ready = useRef(false);
  const lastSent = useRef<Record<string, any> | null>(null);
  const lastEvent = useRef<unknown>(null);
  const lastBeat = useRef(0);
  const restarts = useRef(0);
  const pending = useRef(0);
  const editor = mode === 'editor';

  useEffect(() => {
    if (runtime) return;
    let alive = true;
    loadCodeRuntime().then((t) => { if (alive) setRuntime(t); }, (err) => { if (alive) setLoadError(String(err?.message || err)); });
    return () => { alive = false; };
  }, [runtime]);

  const compiledJs = code?.compiledJs || '';
  const compiledCss = code?.compiledCss || '';
  const html = code?.html || '';
  const lang = code?.lang || 'tsx';
  const srcDoc = useMemo(() => {
    if (!runtime || (!compiledJs && !html)) return null;
    return buildSrcdoc({
      runtime, compiledJs, compiledCss, html,
      config: { assetOrigin: assetOrigin(), mode: editor ? 'editor' : 'runtime', lang },
      assetFile: assetFileUrl,
    });
  }, [runtime, compiledJs, compiledCss, html, lang, editor]);

  const props = codeProps(scope, { width: el.w, height: el.h });
  const propsRef = useRef(props);
  propsRef.current = props;

  const send = (msg: ToFrameBody) => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    try { win.postMessage({ ss: 1, ...msg }, '*'); }
    catch {
      // Something in the data cannot be cloned (a function, a DOM node): send a JSON copy.
      try { win.postMessage(JSON.parse(JSON.stringify({ ss: 1, ...msg })), '*'); } catch { /* give up on this update */ }
    }
  };

  const flush = () => {
    pending.current = 0;
    if (!ready.current) return;
    const patch = diffProps(lastSent.current, propsRef.current);
    if (patch) { send({ type: 'state', patch }); lastSent.current = propsRef.current; }
    const last = propsRef.current.feed?.last ?? null;
    if (last && last !== lastEvent.current) { lastEvent.current = last; send({ type: 'event', event: last }); }
  };

  // Every render may carry new data: post the change on the next frame.
  useLayoutEffect(() => {
    if (!ready.current || pending.current) return;
    pending.current = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(flush) : (setTimeout(flush, 16) as unknown as number);
  });

  // Messages from this layer's frame only.
  useEffect(() => {
    ready.current = false;
    lastSent.current = null;
    setFrameError(null);
    setDrawn(null);
    setIsReady(false);
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow || !isFromFrame(e.data)) return;
      const d = e.data;
      if (d.type === 'ready') {
        ready.current = true;
        setIsReady(true);
        lastBeat.current = Date.now();
        lastEvent.current = propsRef.current.feed?.last ?? null; // old events are not replayed
        flush();
        fontBytesFor(`${compiledCss}\n${compiledJs}\n${html}`).then((fonts) => { if (fonts.length) send({ type: 'fonts', fonts }); });
      } else if (d.type === 'beat') {
        lastBeat.current = Date.now();
      } else if (d.type === 'drawn') {
        setDrawn((cur) => (cur && cur.count === d.count && cur.visible === d.visible && cur.inside === d.inside ? cur : { count: d.count, visible: d.visible, inside: d.inside }));
      } else if (d.type === 'error') {
        // The first error is the cause; later ones are usually its consequences.
        setFrameError((cur) => cur || { message: d.message, stack: d.stack });
        if (editor) console.warn(`[code layer ${el.id}]`, d.message, d.stack || '');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcDoc, generation]);

  // Watchdog: a frame that stops beating (an endless loop) is restarted once, then left stopped.
  useEffect(() => {
    if (!srcDoc) return;
    const t = setInterval(() => {
      if (!ready.current || Date.now() - lastBeat.current < BEAT_TIMEOUT) return;
      ready.current = false;
      if (restarts.current < 1) { restarts.current++; setGeneration((g) => g + 1); }
      else setStalled(true);
    }, 2500);
    return () => clearInterval(t);
  }, [srcDoc, generation]);

  useEffect(() => () => { if (pending.current && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(pending.current); }, []);

  const source = code?.source || '';
  const status: CodeRunStatus = !code ? { state: 'error', message: 'No code yet' }
    : loadError ? { state: 'error', message: `The code runtime did not load (${loadError})`, hint: 'The site is missing /code-sdk/v1/runtime.js: run npm run build:code-sdk and deploy again.' }
      : !compiledJs && !html ? { state: 'error', message: 'Not compiled', hint: 'Open the layer (Edit code…) and save it.' }
        : stalled ? { state: 'stalled', hint: 'A loop never ends (while (true)…, or a setState that triggers itself). Fix it and save again.' }
          : frameError ? { state: 'error', message: frameError.message, line: errorLine(frameError.stack, source), hint: errorHint(frameError.message) }
            : !isReady || !drawn ? { state: 'loading' }
              : drawn.count === 0 ? { state: 'empty', hint: lang === 'js' ? 'Nothing is in <template> and the script adds nothing to the page. Write HTML in <template>, or create elements in ss.on("data", …).' : 'The component returned nothing. If it waits for data (no match in the preview), switch to Simulation; otherwise check what it returns.' }
                : drawn.visible === 0 ? { state: 'empty', drawn: drawn.count, hint: 'Its elements have no size. Give them one (w-[300px] h-[60px], or absolute inset-0) — a percentage height needs a parent with a height.' }
                  : drawn.inside === 0 ? { state: 'outside', drawn: drawn.count, hint: `Positions are inside this layer's own ${el.w}×${el.h} box. A design made for the full 1920×1080 screen needs a full-stage layer (press Full stage).` }
                    : { state: 'running', drawn: drawn.count };
  const statusKey = JSON.stringify(status);
  useEffect(() => { setCodeStatus(el.id, status); }, [el.id, statusKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setCodeStatus(el.id, null), [el.id]);
  const showBadge = editor && ['error', 'empty', 'outside', 'stalled'].includes(status.state);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: (style.radius as number) || undefined, opacity: style.opacity as number, filter: el.filter || undefined }} data-code-layer={el.id}>
      {srcDoc && !stalled && (
        <iframe
          key={generation}
          ref={frame}
          title={el.name || 'Code layer'}
          sandbox={FRAME_SANDBOX}
          srcDoc={srcDoc}
          referrerPolicy="no-referrer"
          scrolling="no"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, background: 'transparent', colorScheme: 'normal', pointerEvents: 'none' }}
        />
      )}
      {showBadge && (
        <div
          style={{
            position: 'absolute', left: 4, top: 4, maxWidth: 'min(calc(100% - 8px), 460px)', padding: '4px 7px', borderRadius: 4,
            background: status.state === 'error' || status.state === 'stalled' ? 'rgba(127,29,29,0.9)' : 'rgba(120,53,15,0.9)',
            color: status.state === 'error' || status.state === 'stalled' ? '#fecaca' : '#fde68a', font: '600 11px/1.35 system-ui', pointerEvents: 'none',
          }}
          data-testid="code-layer-error"
          data-state={status.state}
        >
          <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{describeStatus(status)}</div>
          <div style={{ fontWeight: 400, opacity: 0.85 }}>Select the layer › Edit code… for the details</div>
        </div>
      )}
    </div>
  );
};
