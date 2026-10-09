import { validateLayout, createEmptyLayout } from '../schema/layoutSchema.js';
import { DEFAULT_CSS_DURATION, clipForLayer, importCssAnimations } from '../animation/cssImport.ts';
import { sampleClip } from '../renderer/timeline.ts';

const box = { w: 400, h: 100, rotation: 0 };
const track = (clip: any, prop: string) => clip.tracks.find((t: any) => t.prop === prop);
const keys = (clip: any, prop: string) => track(clip, prop).keyframes.map((k: any) => [k.t, k.value]);

/** The clip on a real layer validates under the shared schema (what the server runs on save and publish). */
const validOnLayer = (clip: any) => validateLayout({
  ...createEmptyLayout(),
  elements: [{ id: 'a', type: 'rect', x: 0, y: 0, w: 400, h: 100, timeline: { clips: [clip] } }],
} as any);

describe('CSS animation import', () => {
  test('a slide-in: keyframes become relative move + opacity, timing comes from the animation line', () => {
    const r = importCssAnimations(`
      @keyframes slide-in-left {
        from { opacity: 0; transform: translateX(-120px); }
        60%  { opacity: 1; transform: translateX(12px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      .layer { animation: slide-in-left 600ms ease-out 200ms; }
    `, { box });
    expect(r.errors).toEqual([]);
    expect(r.animations).toHaveLength(1);
    const { clip, timed, name } = r.animations[0];
    expect([name, timed, clip.duration, clip.delay]).toEqual(['slide-in-left', true, 600, 200]);
    expect(keys(clip, 'dx')).toEqual([[0, -120], [360, 12], [600, 0]]);
    expect(keys(clip, 'opacity')).toEqual([[0, 0], [360, 1], [600, 1]]);
    // translateY / scale / rotation never leave their resting value: no track for them.
    expect(clip.tracks.map((t: any) => t.prop).sort()).toEqual(['dx', 'opacity']);
    expect(track(clip, 'dx').keyframes[0].ease).toEqual([0, 0, 0.58, 1]); // ease-out, per segment
    expect(clip.trigger).toEqual({ type: 'enter' });
    expect(validOnLayer(clip).ok).toBe(true);
    // It plays like the CSS: half-way through the first segment the layer is still left of rest and fading in.
    const mid = sampleClip(clip, 180, null);
    expect(mid.dx as number).toBeLessThan(0);
    expect(mid.opacity as number).toBeGreaterThan(0);
  });

  test('transforms: translate %, uniform vs separate scale, rotation relative to the layer, skew, 3D, origin', () => {
    const r = importCssAnimations(`
      @keyframes spin-pop {
        0%   { transform: translate(50%, -50%) scale(0.5) rotate(0.5turn); transform-origin: left top; }
        100% { transform: translate(0, 0) scale(1) rotate(360deg); transform-origin: 50% 100%; }
      }
      @keyframes squash { from { transform: scaleX(1.2) scaleY(0.8) skewX(10deg) rotateY(90deg); } to { transform: none; } }
    `, { box: { w: 400, h: 100, rotation: 15 } });
    expect(r.errors).toEqual([]);
    const [spin, squash] = r.animations.map((a) => a.clip);
    expect(keys(spin, 'dx')).toEqual([[0, 200], [1000, 0]]);   // 50% of the layer's 400 px width
    expect(keys(spin, 'dy')).toEqual([[0, -50], [1000, 0]]);   // 50% of its 100 px height
    expect(keys(spin, 'scale')).toEqual([[0, 0.5], [1000, 1]]); // x and y always agree: one track
    expect(keys(spin, 'rotation')).toEqual([[0, 195], [1000, 375]]); // on top of the layer's own 15°
    expect(keys(spin, 'originX')).toEqual([[0, 0], [1000, 50]]);
    expect(keys(spin, 'originY')).toEqual([[0, 0], [1000, 100]]);
    expect(keys(squash, 'scaleX')).toEqual([[0, 1.2], [1000, 1]]);
    expect(keys(squash, 'scaleY')).toEqual([[0, 0.8], [1000, 1]]);
    expect(keys(squash, 'skewX')).toEqual([[0, 10], [1000, 0]]);
    expect(keys(squash, 'rotateY')).toEqual([[0, 90], [1000, 0]]);
    expect(r.animations.every((a) => !a.timed && a.clip.duration === DEFAULT_CSS_DURATION)).toBe(true);
    expect(validOnLayer(spin).ok && validOnLayer(squash).ok).toBe(true);
  });

  test('filters, colours and tracking map onto the timeline\'s own units', () => {
    const r = importCssAnimations(`@keyframes flash {
      from { filter: blur(8px) grayscale(100%) brightness(150%) saturate(2) contrast(80%) hue-rotate(90deg); color: #fff; background-color: rgba(255, 0, 0, 0.5); letter-spacing: 4px; }
      to   { filter: none; color: #ffcc00; background-color: #111827; letter-spacing: normal; }
    }`);
    expect(r.errors).toEqual([]);
    const clip = r.animations[0].clip;
    expect(keys(clip, 'blur')).toEqual([[0, 8], [1000, 0]]);
    expect(keys(clip, 'grayscale')).toEqual([[0, 1], [1000, 0]]);
    expect(keys(clip, 'brightness')).toEqual([[0, 1.5], [1000, 1]]);
    expect(keys(clip, 'saturate')).toEqual([[0, 2], [1000, 1]]);
    expect(keys(clip, 'contrast')).toEqual([[0, 0.8], [1000, 1]]);
    expect(keys(clip, 'hueRotate')).toEqual([[0, 90], [1000, 0]]);
    expect(keys(clip, 'color')).toEqual([[0, '#fff'], [1000, '#ffcc00']]);
    expect(keys(clip, 'fill')).toEqual([[0, 'rgba(255, 0, 0, 0.5)'], [1000, '#111827']]);
    expect(keys(clip, 'letterSpacing')).toEqual([[0, 4], [1000, 0]]);
    expect(validOnLayer(clip).ok).toBe(true);
  });

  test('animation settings: longhands, infinite, counts, alternate, reverse, per-keyframe easing, cubic-bezier, hold', () => {
    const loop = importCssAnimations(`
      @keyframes pulse { 0% { transform: scale(1); animation-timing-function: cubic-bezier(0.2, 0, 0, 1.4); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
      .x { animation-name: pulse; animation-duration: 1.5s; animation-iteration-count: infinite; animation-direction: alternate; animation-timing-function: linear; }
    `).animations[0].clip;
    expect([loop.duration, loop.loop, loop.direction, loop.trigger.type]).toEqual([1500, true, 'alternate', 'loop']);
    expect(track(loop, 'scale').keyframes[0].ease).toEqual([0.2, 0, 0, 1.4]); // the keyframe's own easing wins
    expect(track(loop, 'scale').keyframes[1].ease).toBeUndefined();          // linear is the default: not stored

    const thrice = importCssAnimations('@keyframes a { from { opacity: 0 } to { opacity: 1 } } .x { animation: a 2s 3 steps(1, end); }').animations[0].clip;
    expect(thrice.loop).toBe(2); // three plays = two repeats
    expect(track(thrice, 'opacity').keyframes[0].ease).toBe('hold');

    const back = importCssAnimations('@keyframes a { from { opacity: 0 } 25% { opacity: 1; animation-timing-function: ease-in } to { opacity: 0.5 } } .x { animation: a 1s reverse; }').animations[0].clip;
    expect(keys(back, 'opacity')).toEqual([[0, 0.5], [750, 1], [1000, 0]]);
    expect(track(back, 'opacity').keyframes[0].ease).toEqual([0.42, 0, 1, 1]); // the segment's easing moved with it
  });

  test('missing from / to starts and ends at rest, and says so', () => {
    const r = importCssAnimations('@keyframes nudge { 50% { transform: translateY(-20px); } }');
    expect(r.errors).toEqual([]);
    expect(keys(r.animations[0].clip, 'dy')).toEqual([[0, 0], [500, -20], [1000, 0]]); // out and back, as CSS would play it
    const fade = importCssAnimations('@keyframes fade { to { opacity: 0; } }');
    expect(keys(fade.animations[0].clip, 'opacity')).toEqual([[0, 1], [1000, 0]]);
    expect(fade.warnings.map((w) => w.message).join(' ')).toMatch(/no 0%/);
  });

  test('anything outside the subset is an error with its line, and nothing is imported', () => {
    const cases: Array<[string, RegExp, number?]> = [
      ['@import url("https://evil.example/a.css");\n@keyframes a { from { opacity: 0 } to { opacity: 1 } }', /@import is not allowed/, 1],
      ['@keyframes a {\n  from { opacity: 0 }\n  to { background-image: url(https://evil.example/p.png) }\n}', /url\(\) is not allowed/, 3],
      ['@keyframes a { from { width: 10px } to { width: 20px } }', /“width” cannot be animated/],
      ['@keyframes a { from { opacity: 0 } to { opacity: 1 } }\n@media (min-width: 1px) { .x { color: red } }', /@media is not allowed/, 2],
      ['@keyframes a { from { opacity: 0 } to { opacity: 1 } }\nbody > * { animation: a 1s }', /Selector .* is not allowed/, 2],
      ['@keyframes a { from { opacity: 0 } to { opacity: 1 } }\n.x { animation: a 1s; display: none }', /“display” is not an animation property/],
      ['@keyframes a { from { transform: matrix(1,0,0,1,0,0) } to { transform: none } }', /matrix\(\) is not supported/],
      ['@keyframes a { from { opacity: var(--o) } to { opacity: 1 } }', /var\(\) is not supported/],
      ['@keyframes a { from { opacity: 0 !important } to { opacity: 1 } }', /!important is not allowed/],
      ['@keyframes a { from { opacity: 0 } to { opacity: 1 } }\n.x { animation: a 1s steps(4); }', /steps\(4\).*not supported/],
      ['@keyframes a { 120% { opacity: 0 } }', /not a keyframe position/],
      ['@keyframes a { from { opacity: 0 } to { opacity: 1 } ', /never closed/],
      ['@keyframes a { from { opacity: 0 } to { opacity: 1 } }\n.x { animation: a 90s; }', /at most 60s/],
      ['@keyframes a { from { opacity: 0 } to { opacity: 1 } }\n.x { animation: a 1s -2s; }', /negative animation-delay/],
      ['<style>@keyframes a { from { opacity: 0 } }</style>', /without <style>/],
      ['.x { color: red }', /“color” is not an animation property/],
      ['', /Paste a CSS @keyframes/],
    ];
    for (const [css, message, line] of cases) {
      const r = importCssAnimations(css, { box });
      expect(r.animations).toEqual([]);
      const hit = r.errors.find((e) => message.test(e.message));
      expect({ css, errors: r.errors, found: !!hit }).toMatchObject({ found: true });
      if (line) expect(hit!.line).toBe(line);
    }
  });

  test('translate in % needs the layer; comments are ignored without moving line numbers', () => {
    expect(importCssAnimations('@keyframes a { from { transform: translateX(-100%) } to { transform: none } }').errors[0].message).toMatch(/needs a selected layer/);
    const r = importCssAnimations('/* a\n   two-line comment */\n@keyframes a { from { opacity: 0 } to { opacity: 1 } }\n.x { animation: a 1s; colour: red }');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].line).toBe(4);
  });

  test('several animations in one paste; ids never collide with the layer\'s clips; a second copy gets a new id', () => {
    const r = importCssAnimations('@keyframes in { from { opacity: 0 } to { opacity: 1 } } @keyframes out { from { opacity: 1 } to { opacity: 0 } } .a { animation: in 300ms, out 500ms 1s; }', { takenIds: ['css_in'] });
    expect(r.errors).toEqual([]);
    expect(r.animations.map((a) => [a.name, a.clip.id, a.clip.duration, a.clip.delay])).toEqual([['in', 'css_in_2', 300, undefined], ['out', 'css_out', 500, 1000]]);
    const again = clipForLayer(r.animations[1].clip, { type: 'exit' }, ['css_out']);
    expect([again.id, again.trigger.type]).toEqual(['css_out_2', 'exit']);
    expect(r.animations[1].clip.trigger.type).toBe('enter'); // the imported clip itself is not touched
    expect(clipForLayer(r.animations[0].clip, { type: 'loop' }, []).loop).toBe(true);
  });
});
