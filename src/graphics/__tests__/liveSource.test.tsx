import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('../../login/api.tsx', () => {
  const api = { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return {
    __esModule: true, default: api, DEFAULT_BACKEND: 'http://backend.test', RELAY_ORIGIN: 'http://127.0.0.1:8787',
    isOverlayRoute: () => false, isUsingRelay: () => false, getBackendOrigin: () => 'http://backend.test', getRelayOrigin: () => null,
    markRelayUnreachable: jest.fn(), markRelayReachable: jest.fn(),
  };
});

// eslint-disable-next-line import/first
import api from '../../login/api.tsx';
// eslint-disable-next-line import/first
import { LiveSourceBar } from '../editor/LiveSourceBar.tsx';
// eslint-disable-next-line import/first
import { clearCache } from '../requestCache.ts';

const T = '65f0000000000000000000t1'.replace('t', 'a');
const R = '65f0000000000000000000r1'.replace('r', 'b');
const M = '65f0000000000000000000m4'.replace('m', 'c');

beforeEach(() => {
  clearCache();
  (api.get as jest.Mock).mockImplementation(async (url: string) => {
    if (url === '/tournaments') return { data: [{ _id: T, tournamentName: 'R2R Finals' }] };
    if (url === `/tournaments/${T}/rounds`) return { data: [{ _id: R, roundName: 'Day 1' }] };
    if (url === `/tournaments/${T}/rounds/${R}/matches`) return { data: [{ _id: M, matchNo: 4, map: 'Erangel' }] };
    throw new Error('unexpected ' + url);
  });
});

const selects = () => screen.getAllByRole('combobox') as HTMLSelectElement[];

test('nothing picked: lists tournaments and says how to connect', async () => {
  const onDefaults = jest.fn();
  render(<LiveSourceBar defaults={{ tournamentId: null, roundId: null, matchMode: 'selectedMatch' }} onDefaults={onDefaults} matchId={null} onMatch={jest.fn()} />);
  await screen.findByText('R2R Finals');
  expect(screen.getByText(/Pick a tournament and round to connect/)).toBeInTheDocument();
  fireEvent.change(selects()[0], { target: { value: T } });
  expect(onDefaults).toHaveBeenCalledWith({ tournamentId: T, roundId: null });
});

test('tournament + round picked: matches are listed; picking one pins the preview, "follow" unpins', async () => {
  const onMatch = jest.fn();
  const { rerender } = render(
    <LiveSourceBar defaults={{ tournamentId: T, roundId: R, matchMode: 'selectedMatch' }} onDefaults={jest.fn()} matchId={null} onMatch={onMatch} phase="CONNECTED" />
  );
  await screen.findByText('Match 4 · Erangel');
  expect(screen.getByText('Day 1')).toBeInTheDocument();
  expect(screen.getByText(/Follows the match selected in the dashboard/)).toBeInTheDocument();
  expect(screen.getByTestId('live-phase')).toHaveTextContent('connected · live');

  fireEvent.change(selects()[2], { target: { value: M } });
  expect(onMatch).toHaveBeenLastCalledWith(M);

  rerender(<LiveSourceBar defaults={{ tournamentId: T, roundId: R, matchMode: 'selectedMatch' }} onDefaults={jest.fn()} matchId={M} onMatch={onMatch} />);
  expect(screen.getByText(/Preview pinned to this match/)).toBeInTheDocument();
  fireEvent.change(selects()[2], { target: { value: '__follow__' } });
  expect(onMatch).toHaveBeenLastCalledWith(null);
});

test('a failed list says so instead of showing an empty dropdown', async () => {
  (api.get as jest.Mock).mockRejectedValue(new Error('offline'));
  render(<LiveSourceBar defaults={{ tournamentId: null, roundId: null, matchMode: 'selectedMatch' }} onDefaults={jest.fn()} matchId={null} onMatch={jest.fn()} />);
  await waitFor(() => expect(screen.getByText(/Could not load the list/)).toBeInTheDocument());
});
