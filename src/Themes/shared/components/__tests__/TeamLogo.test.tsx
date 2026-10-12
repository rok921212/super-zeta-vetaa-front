import React from 'react';
import { act, render } from '@testing-library/react';
import { TeamLogo, TeamLogoSvg } from '../TeamLogo';
import { realFlag } from '../../hooks/logoFlagSwitch';

// jsdom has no Element.animate, so the switcher swaps without the fade —
// exactly the src flow the fade wraps.
describe('TeamLogo logo <-> flag switcher', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(30_000)); // start of a "logo" half (30 s / 3 s = 10, even)
  });
  afterEach(() => jest.useRealTimers());

  const srcOf = (c: HTMLElement) => c.querySelector('img')!.getAttribute('src');

  it('alternates every 3 s, all instances in sync', () => {
    const { container } = render(<div>
      <TeamLogo logo="/a.png" flag="/fa.png" />
      <TeamLogo logo="/b.png" flag="/fb.png" />
    </div>);
    const imgs = () => Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src'));
    expect(imgs()).toEqual(['/a.png', '/b.png']);
    act(() => { jest.advanceTimersByTime(3_000); });
    expect(imgs()).toEqual(['/fa.png', '/fb.png']);
    act(() => { jest.advanceTimersByTime(3_000); });
    expect(imgs()).toEqual(['/a.png', '/b.png']);
  });

  it('stays on the logo without a real flag', () => {
    const { container } = render(<div><TeamLogo logo="/a.png" flag="" /><TeamLogo logo="/b.png" flag="/def_flag.avif" /></div>);
    act(() => { jest.advanceTimersByTime(3_000); });
    expect(Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual(['/a.png', '/b.png']);
  });

  it('uses the fallback for an empty logo and keeps caller props', () => {
    const { container } = render(<TeamLogo logo="" fallback="/def_logo.png" className="w-full" />);
    expect(srcOf(container)).toBe('/def_logo.png');
    expect(container.querySelector('img')!.className).toBe('w-full');
  });

  it('svg variant switches href', () => {
    const { container } = render(<svg><TeamLogoSvg logo="/a.png" flag="/fa.png" x={1} /></svg>);
    const href = () => container.querySelector('image')!.getAttribute('href');
    expect(href()).toBe('/a.png');
    act(() => { jest.advanceTimersByTime(3_000); });
    expect(href()).toBe('/fa.png');
  });

  it('realFlag treats default placeholders as no flag', () => {
    expect(realFlag('/def_flag.avif')).toBe('');
    expect(realFlag('https://x/y/def_flag.png')).toBe('');
    expect(realFlag(' https://x/in.png ')).toBe('https://x/in.png');
    expect(realFlag(undefined)).toBe('');
  });
});
