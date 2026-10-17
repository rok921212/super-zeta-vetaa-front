// The document a code layer's sandboxed iframe loads. Pure string building
// (testable without a DOM). Everything is inline: the runtime text was
// fetched once by the page, so the frame needs no network at all for code,
// and its CSP blocks every connection it could try to open.

import type { FrameConfig } from './protocol.ts';
import { LAYER_SCRIPT_NAME } from './diagnose.ts';

/** script-src: inline only (the runtime + the layer). connect-src: none — no fetch / XHR / WebSocket / beacons. */
export const FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline' https:",
  'img-src https: http: data: blob:',
  'media-src https: http: data: blob:',
  'font-src https: data: blob:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

/** The iframe's sandbox: scripts only. NEVER allow-same-origin (the frame would share the page's login). */
export const FRAME_SANDBOX = 'allow-scripts';

const BASE_CSS = `html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}
*,*::before,*::after{box-sizing:border-box}
#ss-root{position:absolute;inset:0;overflow:hidden;color:#fff;-webkit-font-smoothing:antialiased}
#ss-template,#ss-app{position:absolute;inset:0}
#ss-template:empty,#ss-app:empty{display:none}
img,svg{max-width:none}`;

const ASSET_RE = /asset:([a-f0-9]{24})/g;

/** `asset:<id>` anywhere in the code → the drawable URL. */
export function rewriteAssets(text: string, assetFile: (id: string) => string): string {
  return text.replace(ASSET_RE, (_m, id: string) => assetFile(id));
}

const escStyle = (css: string) => css.replace(/<\/(style)/gi, '<\\/$1');
const escScript = (js: string) => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

export function buildSrcdoc(opts: {
  runtime: string;
  compiledJs: string;
  compiledCss: string;
  html?: string;
  config: FrameConfig;
  assetFile: (id: string) => string;
}): string {
  const css = rewriteAssets(opts.compiledCss || '', opts.assetFile);
  const html = rewriteAssets(opts.html || '', opts.assetFile);
  const js = rewriteAssets(opts.compiledJs || '', opts.assetFile);
  return `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">`
    + `<style>${BASE_CSS}</style><style>${escStyle(css)}</style></head>`
    + `<body><div id="ss-root"><div id="ss-template">${html}</div><div id="ss-app"></div></div>`
    + `<script>window.__SS_CONFIG=${escScript(JSON.stringify(opts.config))};</script>`
    + `<script>${escScript(opts.runtime)}</script>`
    // Its own <script>, named by sourceURL, so an error's stack gives the line in the layer's file (code/diagnose.ts).
    + (js.trim() ? `<script>window.__ssBoot(function(require,module,exports,React,ss){"use strict";\n${escScript(js)}\n});\n//# sourceURL=${LAYER_SCRIPT_NAME}.${opts.config.lang || 'tsx'}</script>` : '')
    + `</body></html>`;
}
