// Entry of /code-sdk/v1/runtime.js (built by scripts/build-code-sdk.mjs).
// Runs INSIDE a code layer's sandboxed iframe (sandbox="allow-scripts", no
// allow-same-origin, CSP connect-src 'none'): it cannot see the page, its
// storage or its login, and cannot open connections. Everything it shows
// arrives by postMessage from CodeLayerEl.
//
// The layer's compiled script is wrapped by the sandbox document as
//   __ssBoot(function (require, module, exports, React, ss) { … })
// and either exports a React component (tsx / jsx: rendered with live props)
// or is plain JS that uses the `ss` API.

import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactDOM from 'react-dom';
import * as FramerMotion from 'framer-motion';
import * as scoresync from '../src/graphics/code/scoresyncApi.ts';
import { applyPatch, emitEvent, getProps, hasData, subscribeData, subscribeEvents, useData, type CodeEvent } from '../src/graphics/code/runtimeStore.ts';
import { fillTokens, hasTokens } from '../src/graphics/bindings/tokens.ts';
import { resolvePath } from '../src/graphics/bindings/resolve.ts';
import { applyFormatter } from '../src/graphics/bindings/formatters.ts';
import type { FontBytes, FrameConfig, FromFrame } from '../src/graphics/code/protocol.ts';

const w = window as any;
const config: FrameConfig = w.__SS_CONFIG || { assetOrigin: '', mode: 'runtime', lang: 'tsx' };
const parentWin: Window = window.parent;

const post = (msg: Omit<FromFrame, 'ss'> & Record<string, any>) => {
  try { parentWin.postMessage({ ss: 1, ...msg }, '*'); } catch { /* parent gone */ }
};

// ── errors ──────────────────────────────────────────────────────────────────
const report = (err: unknown) => {
  const e = err as { message?: string; stack?: string } | undefined;
  post({ type: 'error', message: String(e?.message || err || 'Unknown error').slice(0, 2000), stack: e?.stack ? String(e.stack).slice(0, 4000) : undefined });
};
window.addEventListener('error', (e) => report(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => report((e as PromiseRejectionEvent).reason));

// ── modules a layer may import ──────────────────────────────────────────────
const MODULES: Record<string, unknown> = {
  react: React,
  'react-dom': ReactDOM,
  'react-dom/client': ReactDOMClient,
  'framer-motion': FramerMotion,
  'motion/react': FramerMotion,
  scoresync,
};
function requireModule(name: string): unknown {
  if (Object.prototype.hasOwnProperty.call(MODULES, name)) {
    const m = MODULES[name] as any;
    // sucrase's interop reads __esModule / default.
    return m && !m.__esModule && name !== 'react' ? { ...m, __esModule: true, default: m.default ?? m } : m;
  }
  throw new Error(`Cannot import "${name}" in a code layer. Available: ${Object.keys(MODULES).join(', ')}`);
}

// ── the `ss` API (plain-JS layers, and handy in components) ────────────────
type DataFn = (props: Record<string, any>) => void;
const ss = {
  root: document.getElementById('ss-root') as HTMLElement,
  template: document.getElementById('ss-template') as HTMLElement,
  mode: config.mode,
  get data() { return getProps(); },
  get width() { return getProps().width || window.innerWidth; },
  get height() { return getProps().height || window.innerHeight; },
  /** ss.on('data', fn) — every data update (and once right away if data is here); ss.on('event', fn) — live events. */
  on(kind: 'data' | 'event', fn: DataFn | ((e: CodeEvent) => void)): () => void {
    if (kind === 'event') return subscribeEvents(fn as (e: CodeEvent) => void);
    const run = () => { try { (fn as DataFn)(getProps()); } catch (err) { report(err); } };
    if (hasData()) run();
    return subscribeData(run);
  },
  /** ss.get('matchData.teams[0].teamName') — the same paths as {{tokens}}. */
  get(path: string): unknown { try { return resolvePath(getProps() as any, path); } catch { return undefined; } },
  format: (value: unknown, name: string) => applyFormatter(name, value, getProps() as any),
  fill: (template: string) => fillTokens(template, getProps()),
  asset: (id: string) => `${config.assetOrigin}/api/overlay-assets/file/${encodeURIComponent(String(id).replace(/^asset:/, ''))}`,
};
w.ss = ss;

// ── {{tokens}} in the <template> ────────────────────────────────────────────
type Slot = { node: Text; template: string } | { node: Element; attr: string; template: string };
const slots: Slot[] = [];
(function collect(n: Node) {
  if (n.nodeType === 3) { if (hasTokens(n.nodeValue)) slots.push({ node: n as Text, template: n.nodeValue || '' }); return; }
  if (n.nodeType !== 1) return;
  for (const a of Array.from((n as Element).attributes)) if (hasTokens(a.value)) slots.push({ node: n as Element, attr: a.name, template: a.value });
  n.childNodes.forEach(collect);
})(ss.template);
const fillTemplate = () => {
  for (const s of slots) {
    const v = fillTokens(s.template, getProps());
    if ('attr' in s) { if (s.node.getAttribute(s.attr) !== v) s.node.setAttribute(s.attr, v); }
    else if (s.node.nodeValue !== v) s.node.nodeValue = v;
  }
};
if (slots.length) subscribeData(fillTemplate);

// ── fonts (bytes from the page) ─────────────────────────────────────────────
const loadFonts = (fonts: FontBytes[]) => {
  for (const f of fonts || []) {
    try {
      const face = new FontFace(f.family, f.data, { weight: f.weight || 'normal', style: f.style || 'normal', display: 'block' } as FontFaceDescriptors);
      (document as any).fonts.add(face);
      face.load().catch(() => {});
    } catch { /* bad font: the fallback face is used */ }
  }
};

// ── messages from the page ──────────────────────────────────────────────────
window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== parentWin) return;
  const d = e.data;
  if (!d || typeof d !== 'object' || d.ss !== 1) return;
  if (d.type === 'state' && d.patch && typeof d.patch === 'object') applyPatch(d.patch);
  else if (d.type === 'event' && d.event && typeof d.event.type === 'string') emitEvent(d.event);
  else if (d.type === 'fonts' && Array.isArray(d.fonts)) loadFonts(d.fonts);
});

// ── mounting a component ────────────────────────────────────────────────────
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { report(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Live({ Comp }: { Comp: React.ComponentType<any> }) {
  const props = useData();
  return <Comp {...props} />;
}

function mount(Comp: React.ComponentType<any>) {
  const host = document.getElementById('ss-app') as HTMLElement;
  const root = ReactDOMClient.createRoot(host);
  const render = () => root.render(<Boundary><Live Comp={Comp} /></Boundary>);
  // Theme components expect data on their first render: wait for the first state.
  if (hasData()) render();
  else { const off = subscribeData(() => { off(); render(); }); }
  post({ type: 'mounted' });
}

w.__ssBoot = (factory: (require: unknown, module: unknown, exports: unknown, react: unknown, api: unknown) => void) => {
  const module = { exports: {} as any };
  try {
    factory(requireModule, module, module.exports, React, ss);
  } catch (err) {
    report(err);
    return;
  }
  const exp = module.exports;
  const Comp = exp && (exp.__esModule ? exp.default : exp.default || exp);
  if (typeof Comp === 'function' || (Comp && typeof Comp === 'object' && Comp.$typeof)) mount(Comp);
  else if (config.lang !== 'js') {
    // A component file that exports no component would otherwise show nothing, silently.
    const got = Comp === undefined ? 'nothing' : Array.isArray(Comp) ? 'a list' : typeof Comp;
    report(new Error(`Nothing to show: the default export is ${got}, not a component. Write export default function MyOverlay(props) { return <div>…</div>; }`));
  }
};

// ── what is on screen (editor only): the Designer says "draws nothing" / "outside the layer" ──
const measure = () => {
  const W = window.innerWidth;
  const H = window.innerHeight;
  let count = 0; let visible = 0; let inside = 0;
  const tpl = document.getElementById('ss-template');
  if (tpl && Array.from(tpl.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue || '').trim())) { count++; visible++; inside++; }
  document.querySelectorAll('#ss-template *, #ss-app *').forEach((e) => {
    count++;
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      visible++;
      if (r.right > 0 && r.bottom > 0 && r.left < W && r.top < H) inside++;
    }
  });
  post({ type: 'drawn', count, visible, inside });
};
if (config.mode === 'editor') {
  setTimeout(measure, 300);
  setTimeout(measure, 1000);
  setInterval(measure, 2000);
}

// Alive: the page restarts a frame that stops beating (an endless loop).
setInterval(() => post({ type: 'beat' }), 2000);
post({ type: 'ready' });
