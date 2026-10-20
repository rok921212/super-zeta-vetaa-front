// Home page: the content file loader, the seeded simulation, the shared
// theme-view mapping, the desktop-tool data and the pricing toggle.

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createOverlayEngine } from '../../overlayClient/engine.ts';
import { createSimulation, SIM_ROUND_ID, SIM_TOURNAMENT_ID, type ShowcaseSeed } from '../../graphics/editor/simulation.ts';
import { mergeContent, loadSiteContent, resetSiteContentForTests } from '../../content/useSiteContent.ts';
import { FALLBACK_CONTENT } from '../../content/fallback.ts';
import { renderThemeView, themeHasView } from '../../dashboard/themeViews.tsx';
import { setThemeRegistryForTests } from '../../Themes/registry.ts';
import { VIEW_GROUPS } from '../../dashboard/overlayViews.ts';
import { localFromEngine } from '../sim/localFromEngine.ts';
import { AUTOPLAY } from '../sim/autoplay.ts';
import { Pricing } from '../sections/Pricing.tsx';

jest.mock('react-router-dom', () => ({ Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a> }));

async function engineFor(seed?: ShowcaseSeed) {
  const sim = createSimulation(seed);
  const engine = createOverlayEngine({ tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, matchId: null, followSelected: true, view: null }, { transport: sim.transport });
  const state: any = await new Promise((resolve) => {
    const un = engine.subscribe((s: any) => { if (s.matchData?.teams?.length && s.overallData && !s.status.loading) { un(); resolve(s); } });
  });
  return { sim, engine, state };
}

const SEED: ShowcaseSeed = {
  tournament: { tournamentName: 'Spring Cup', primaryColor: '#00ff00', torLogo: '' },
  round: { roundName: 'Semi Finals' },
  groupName: 'Group B',
  maps: ['Erangel', 'Miramar'],
  teams: ['Red', 'Blue', 'Green', 'Gold'].map((name, i) => ({
    name: `${name} Squad`, tag: name.toUpperCase(), slot: i + 1,
    players: [1, 2, 3, 4, 5].map((p) => ({ name: `${name}${p}`, uId: `${i}${p}` })),
  })),
};

describe('simulation seed', () => {
  test('without a seed it is the built-in sample', async () => {
    const { engine, state } = await engineFor();
    expect(state.tournament.tournamentName).toBe('ScoreSync Invitational');
    expect(state.matchData.teams).toHaveLength(16);
    expect(state.matches).toHaveLength(6);
    engine.destroy();
  });

  test('a seed sets the teams, names, colours and matches', async () => {
    const { sim, engine, state } = await engineFor(SEED);
    expect(state.tournament.tournamentName).toBe('Spring Cup');
    expect(state.tournament.primaryColor).toBe('#00ff00');
    expect(state.tournament.torLogo).toBe('/def_logo.avif'); // blank in the seed keeps the sample's
    expect(state.round.roundName).toBe('Semi Finals');
    expect(state.matches.map((m: any) => m.map)).toEqual(['Erangel', 'Miramar']);
    expect(state.matchData.teams.map((t: any) => t.teamName)).toEqual(['Red Squad', 'Blue Squad', 'Green Squad', 'Gold Squad']);
    expect(state.matchData.teams[0].players).toHaveLength(4);
    expect(state.overallData.teams).toHaveLength(4);
    // the controls still play a match on these teams
    sim.controls.eliminate(1);
    await act(() => new Promise((r) => setTimeout(r, 30)));
    const blue = engine.getState()!.matchData!.teams.find((t: any) => t.teamName === 'Blue Squad');
    expect(blue.players.every((p: any) => p.liveState === 5)).toBe(true);
    engine.destroy();
  });

  test('a seed with too few teams falls back to the sample teams', async () => {
    const { engine, state } = await engineFor({ ...SEED, teams: SEED.teams!.slice(0, 2) });
    expect(state.matchData.teams).toHaveLength(16);
    expect(state.tournament.tournamentName).toBe('Spring Cup');
    engine.destroy();
  });
});

describe('site content', () => {
  test('missing keys keep the fallback, wrong types are ignored, arrays replace', () => {
    const merged = mergeContent(FALLBACK_CONTENT, {
      hero: { title: 'New', stats: [{ value: '1', label: 'x' }], subtitle: 42 },
      pricing: { plans: 'nope' },
      unknown: { a: 1 },
    });
    expect(merged.hero.title).toBe('New');
    expect(merged.hero.subtitle).toBe(FALLBACK_CONTENT.hero.subtitle);
    expect(merged.hero.stats).toEqual([{ value: '1', label: 'x' }]);
    expect(merged.pricing.plans).toEqual([]);
    expect(merged.contact).toEqual(FALLBACK_CONTENT.contact);
  });

  test('an unreachable file gives the fallback', async () => {
    resetSiteContentForTests();
    const realFetch = (global as any).fetch;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (global as any).fetch = jest.fn(() => Promise.reject(new Error('offline')));
    try {
      expect(await loadSiteContent()).toBe(FALLBACK_CONTENT);
    } finally {
      (global as any).fetch = realFetch;
      warn.mockRestore();
      resetSiteContentForTests();
    }
  });

  test('the shipped site.json parses and fills every section', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const json = require('../../../public/content/site.json');
    const merged = mergeContent(FALLBACK_CONTENT, json);
    expect(merged.pricing.plans.map((p: any) => p.name)).toEqual(['Basic', 'Premium']);
    for (const p of merged.pricing.plans) {
      expect(p.price.monthly.amount).toBeTruthy();
      expect(p.price.yearly.amount).toBeTruthy();
    }
    expect(merged.overlays.items.length).toBeGreaterThan(0);
    expect(merged.simulator.desktopTools.length).toBeGreaterThan(0);
  });
});

describe('theme views', () => {
  const seen: Record<string, any> = {};
  const stub = (key: string) => (props: any) => { seen[key] = props; return <div data-testid={`view-${key}`} />; };

  beforeAll(() => {
    const keys = ['Lower', 'Upper', 'Dom', 'Alerts', 'LiveStats', 'LiveFrags', 'intro', 'OverallData', 'OverallFrags', 'Mvp', 'WwcdStats', 'WwcdSummary',
      'MatchSummary', 'MatchData', 'MatchFragrs', 'PlayerH2H', 'TeamH2H', 'Champions', 'FirstRunnerUp', 'SecondRunnerUp', 'EventMvp', 'CommingUpNext',
      'HighlightPoints', 'Slots', 'RosterShowCase', 'PlayerSwitch', 'LiveData', 'Recall', 'Achive', 'Schedule', 'HighlightSchedule'];
    setThemeRegistryForTests({ ThemeX: Object.fromEntries(keys.map((k) => [k.toLowerCase(), stub(k)])) });
  });

  const data = {
    tournament: { tournamentName: 'T' }, round: { roundName: 'R' }, match: { _id: 'm1' }, matchData: { teams: [] }, matches: [{ _id: 'm1' }, { _id: 'm2' }],
    matchDatas: [], overallData: { teams: [] }, deadTeamList: [], backpackInfo: null, selectedScheduleMatchIds: ['m1'],
  };

  test('every DisplayHud view renders a component on a theme that has it', () => {
    const keys = VIEW_GROUPS.flatMap((g) => g.views.map((v) => v.key)).map((k) => ({ __schedule: 'Schedule', __highlight: 'HighlightSchedule' } as any)[k] || k);
    for (const key of keys) {
      const { container, unmount } = render(<>{renderThemeView(key, 'ThemeX', data)}</>);
      expect(container.textContent).not.toMatch(/not implemented|isn't available/);
      unmount();
    }
    expect(seen.Lower.totalMatches).toBe(2);
    expect(seen.Schedule.selectedScheduleMatches).toEqual(['m1']);
    expect(seen.Alerts.deadTeamList).toEqual([]);
  });

  test('themeHasView follows the component names, not the view keys', () => {
    setThemeRegistryForTests({ ThemeX: { lower: stub('Lower'), overalldata: stub('OverallData'), firstrunnerup: stub('FirstRunnerUp') } });
    expect(themeHasView('OverAllData', 'ThemeX')).toBe(true);
    expect(themeHasView('1stRunnerUp', 'ThemeX')).toBe(true);
    expect(themeHasView('intro', 'ThemeX')).toBe(false);
    expect(themeHasView('Lower', 'ThemeX')).toBe(true);
  });

  test('a theme without the view says so instead of crashing', () => {
    render(<>{renderThemeView('Lower', 'NoSuchTheme', data)}</>);
    expect(screen.getByText(/isn't available on NoSuchTheme/)).toBeTruthy();
  });
});

describe('desktop tools and autoplay', () => {
  test('the simulated match becomes the desktop feed', async () => {
    const { engine, state } = await engineFor(SEED);
    const local = localFromEngine(state, 10)!;
    expect(local.teams.map((t) => t.teamName)).toEqual(['Red Squad', 'Blue Squad', 'Green Squad', 'Gold Squad']);
    expect(local.players.every((p) => p.hasPosition)).toBe(true);
    expect(local.zone.known).toBe(true);
    expect(local.observed).not.toBeNull();
    expect(localFromEngine(null, 0)).toBeNull();
    engine.destroy();
  });

  test('autoplay only uses DisplayHud views', () => {
    const known = new Set(VIEW_GROUPS.flatMap((g) => g.views.map((v) => v.key)));
    for (const s of AUTOPLAY) if (s.view) expect(known.has(s.view)).toBe(true);
  });
});

describe('pricing', () => {
  test('the toggle switches every plan between monthly and yearly', () => {
    const json = require('../../../public/content/site.json');
    render(<Pricing pricing={mergeContent(FALLBACK_CONTENT, json).pricing} />);
    expect(screen.getByText('$70')).toBeTruthy();
    expect(screen.getByText('$150')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /yearly/i }));
    expect(screen.getByText('$700')).toBeTruthy();
    expect(screen.getByText('$1,500')).toBeTruthy();
    expect(screen.queryByText('$70')).toBeNull();
  });
});
