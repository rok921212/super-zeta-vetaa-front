import React from 'react';
import { render } from '@testing-library/react';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { createEmptyLayout, validateLayout } from '../schema/layoutSchema.js';
import { checkHtmlCss, fillTokens, sanitizeCss, sanitizeHtml, splitPastedDocument, tokenPaths } from '../renderer/htmlCss.ts';
import { HTML_EXAMPLE, LAYER_CSS_EXAMPLE } from '../editor/HtmlCssLayerPanel.tsx';

const layer = (css: any, extra: any = {}) => ({ id: 'c1', type: 'css', x: 0, y: 0, w: 400, h: 100, css, ...extra });
const validate = (el: any) => validateLayout({ ...createEmptyLayout(), elements: [el] } as any);

describe('HTML + CSS layer: schema', () => {
  it('accepts the example and an empty layer', () => {
    expect(validate(layer({ html: HTML_EXAMPLE, css: LAYER_CSS_EXAMPLE })).ok).toBe(true);
    expect(validate(layer({})).ok).toBe(true);
  });

  it.each([
    [{ html: '<div><script>alert(1)</script></div>' }, 'tag is not allowed'],
    [{ html: '<img src="x.png" onerror="alert(1)">' }, 'event handlers'],
    [{ html: '<iframe src="https://a.b"></iframe>' }, 'tag is not allowed'],
    [{ html: '<div style="background:url(javascript:alert(1))"></div>' }, 'script URLs'],
    [{ css: '@import url(https://evil.example/x.css);' }, '@import'],
    [{ css: 'a{width:expression(alert(1))}' }, 'expressions'],
    [{ css: '</style><script>x</script>' }, 'not allowed'],
  ])('refuses %j', (css, msg) => {
    const r = validate(layer(css));
    expect(r.ok).toBe(false);
    expect(r.errors.map((e: any) => e.message).join(' ')).toContain(msg);
  });

  it('refuses html/css on other layer types and oversize content', () => {
    expect(validate({ id: 'r', type: 'rect', x: 0, y: 0, w: 1, h: 1, css: { html: '<b>x</b>' } }).ok).toBe(false);
    expect(validate(layer({ html: 'x'.repeat(60001) })).ok).toBe(false);
  });
});

describe('HTML + CSS layer: sanitiser', () => {
  it('keeps layout markup and strips everything that could run', () => {
    const out = sanitizeHtml('<div class="a" onclick="x()"><b>hi</b><script>bad()</script><img src="javascript:x" alt="p"><a href="https://x.y">link</a><custom-tag><span>kept</span></custom-tag></div>');
    expect(out).toContain('<div class="a"><b>hi</b>');
    expect(out).not.toMatch(/onclick|script|javascript|href/i);
    expect(out).toContain('<img alt="p"');
    expect(out).toContain('<a>link</a>');
    expect(out).toContain('<span>kept</span>');
    expect(out).not.toContain('custom-tag');
  });

  it('keeps https / relative / asset pictures and inline svg', () => {
    const out = sanitizeHtml('<img src="https://cdn.example/a.png"><img src="//evil.example/a.png"><svg viewBox="0 0 10 10"><path d="M0 0L10 10" fill="red"/></svg>');
    expect(out).toContain('src="https://cdn.example/a.png"');
    expect(out).not.toContain('evil.example');
    expect(out).toMatch(/<svg viewBox="0 0 10 10"><path d="M0 0L10 10" fill="red"><\/path><\/svg>/);
  });

  it('drops unsafe url() and @import from the stylesheet', () => {
    const css = sanitizeCss('@import "x.css"; .a{background:url(javascript:alert(1))} .b{background:url("https://x.y/p.png")}');
    expect(css).not.toMatch(/@import|javascript/);
    expect(css).toContain('url("https://x.y/p.png")');
  });

  it('splits a whole pasted page into html and css', () => {
    const r = splitPastedDocument('<!doctype html><html><head><title>t</title><style>.a{color:red}</style></head><body><div class="a">x</div></body></html>');
    expect(r).toEqual({ html: '<div class="a">x</div>', css: '.a{color:red}' });
  });

  it('reports problems with line numbers', () => {
    const p = checkHtmlCss('<div>\n<button onclick="x">b</button>\n</div>', '.a {\n color: red;\n');
    expect(p).toEqual(expect.arrayContaining([
      expect.objectContaining({ where: 'html', line: 2, level: 'error' }),
      expect.objectContaining({ where: 'css', level: 'error', message: expect.stringContaining('never closed') }),
    ]));
    expect(checkHtmlCss(HTML_EXAMPLE, LAYER_CSS_EXAMPLE).filter((x) => x.level === 'error')).toEqual([]);
  });
});

describe('HTML + CSS layer: data tokens', () => {
  const scope = { derived: { teams: [{ teamName: 'Alpha', totalPoints: 42 }] } };
  it('fills paths and formatters', () => {
    expect(fillTokens('{{derived.teams[0].teamName|upper}} · {{ derived.teams[0].totalPoints }} · {{derived.nothing}}', scope)).toBe('ALPHA · 42 · ');
    expect(tokenPaths(HTML_EXAMPLE)).toContain('derived.teams[0].teamName');
  });
});

describe('HTML + CSS layer: renderer', () => {
  it('draws the markup in a shadow root with the stylesheet scoped to it', () => {
    const layout = { ...createEmptyLayout(), elements: [layer({ html: '<div class="t">Hello <b>there</b><script>window.__x=1</script></div>', css: '.t{color:red}' })] };
    const { container } = render(<LayoutRenderer layout={layout as any} state={null} fit={1} />);
    const host = container.querySelector('[data-css-layer="c1"]') as HTMLElement;
    expect(host).toBeTruthy();
    const root = host.shadowRoot!;
    expect(root.querySelector('.t')!.textContent).toBe('Hello there');
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('style')!.textContent).toContain('.t{color:red}');
    // Not leaked into the page.
    expect(document.querySelector('.t')).toBeNull();
    expect((window as any).__x).toBeUndefined();
  });
});
