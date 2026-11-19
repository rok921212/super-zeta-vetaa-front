// Airdrop Info overlay (one left-side panel: what's in the crate, nothing else):
//  • no real crate (preview, loading, before the first drop) -> the demo
//    session plays: demo crates land one by one;
//  • real crates replace it — nothing for a crate already there on load, the
//    panel for a crate that lands while watching;
//  • no crate list, no "looted by";
//  • every item has its own drawn icon and accurate name.

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import AirdropInfo, { DEMO_STEP_MS, DEMO_POP_MS } from '../../../Theme1/on-screen/airdrop';
import AirdropIcon from '../AirdropIcons';
import { AIRDROP_ITEMS } from '../../airdropItems';

const tournament = { primaryColor: '#e10600', secondaryColor: '#111' };

const crate = (id: number, gun: number, ammo: number, count: number) => ({
  id, at: id * 1000,
  items: [{ id: gun, count: 1 }, { id: ammo, count }, { id: 203004, count: 1 }, { id: 503003, count: 1 }, { id: 502003, count: 1 }, { id: 501003, count: 1 }],
});

const relay = (get: () => any[]) =>
  (global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ available: true, matchSeq: 0, crates: get() }) })) as any);

describe('AirdropInfo', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
    window.history.pushState({}, '', '/');
    window.localStorage.clear();
  });

  it('DEMO OFF waits for drop data, is remembered, and a real crate still shows', async () => {
    const { unmount } = render(<AirdropInfo tournament={tournament} />);
    expect(screen.getByText('AMR')).toBeTruthy(); // demo is on by default
    act(() => { screen.getByText('DEMO ON').click(); });
    expect(screen.getByText('Waiting for drop data')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('AMR')).toBeNull()); // after the exit slide
    unmount();

    // Remembered after a reload, and real data still comes through.
    window.history.pushState({}, '', '/public/test');
    let calls = 0;
    relay(() => (++calls === 1 ? [] : [crate(1, 103003, 306001, 20)]));
    render(<AirdropInfo tournament={tournament} />);
    expect(screen.getByText('DEMO OFF')).toBeTruthy();
    expect(screen.queryByText('AMR')).toBeNull();
    await waitFor(() => expect(screen.getByText('AWM')).toBeTruthy(), { timeout: 5000 });
  }, 10000);

  it('plays the demo session when there is no data (crates land one by one)', () => {
    jest.useFakeTimers();
    render(<AirdropInfo tournament={tournament} />);
    expect(screen.getByText('AIRDROP')).toBeTruthy();
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('AMR')).toBeTruthy();
    expect(screen.getByText('×10')).toBeTruthy();
    expect(screen.getByText('.50 CAL')).toBeTruthy();
    expect(screen.getByText('8X SCOPE')).toBeTruthy();
    expect(screen.getByText('LEVEL 3 GEAR')).toBeTruthy();
    expect(screen.queryByText(/LOOTED/)).toBeNull();
    expect(screen.queryByText('AIRDROPS')).toBeNull(); // no crate list
    act(() => { jest.advanceTimersByTime(DEMO_STEP_MS + 600); });
    expect(screen.getAllByText('02').length).toBeGreaterThan(0);
    expect(screen.getByText('P90')).toBeTruthy();
    expect(DEMO_POP_MS).toBeLessThan(DEMO_STEP_MS); // the panel leaves before the next one lands
  });

  it('shows the demo while loading, then the first real crate that lands', async () => {
    window.history.pushState({}, '', '/public/test');
    let calls = 0;
    relay(() => (++calls === 1 ? [] : [crate(1, 103003, 306001, 20)])); // first answer: no crates yet
    render(<AirdropInfo tournament={tournament} />);
    expect(screen.getByText('AMR')).toBeTruthy(); // demo before the relay answers
    await waitFor(() => expect(screen.getByText('AWM')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText('.300 MAGNUM')).toBeTruthy();
    expect(screen.getByText('4X SCOPE')).toBeTruthy();
  }, 10000);

  it('shows nothing for a crate already there on load, then the next one that lands', async () => {
    window.history.pushState({}, '', '/public/test');
    let crates = [crate(1, 103003, 306001, 20)];
    relay(() => crates);
    render(<AirdropInfo tournament={tournament} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByText('AWM')).toBeNull();

    crates = [...crates, crate(2, 102105, 301002, 200)];
    await waitFor(() => expect(screen.getByText('P90')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText('×200')).toBeTruthy();
    expect(screen.queryByText('AWM')).toBeNull();
  }, 10000);

  it('draws an icon for every catalogued item, with level / zoom badges', () => {
    for (const id of Object.keys(AIRDROP_ITEMS).map(Number)) {
      const { container, unmount } = render(<AirdropIcon id={id} size={60} accent="#e10600" />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('aria-label')).toBe(AIRDROP_ITEMS[id].name);
      expect(svg.querySelectorAll('path,rect,polygon,circle,ellipse').length).toBeGreaterThan(2);
      unmount();
    }
    const text = (el: React.ReactElement) => render(el).container.textContent;
    expect(text(<AirdropIcon id={503003} size={60} accent="#e10600" />)).toBe('Lv.3');
    expect(text(<AirdropIcon id={203005} size={60} accent="#e10600" />)).toBe('8x');
    expect(text(<AirdropIcon id={502003} size={60} accent="#e10600" hideBadge />)).toBe('');
  });

  // Every theme has its own on-screen/airdrop.tsx: each one must render the demo panel.
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])('Theme%i has a working airdrop.tsx', (n) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ThemeAirdrop = require(`../../../Theme${n}/on-screen/airdrop`).default;
    const { unmount } = render(<ThemeAirdrop tournament={tournament} />);
    expect(screen.getByText('AIRDROP')).toBeTruthy();
    expect(screen.getByText('AMR')).toBeTruthy();
    unmount();
  });
});
