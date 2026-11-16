// Every theme's on-screen/Dom.tsx shows the KILL STOLEN card (its own label)
// plus the shared "KNOCKED BY …" strip when a kill steal arrives. Driven by
// the simulator's window event, which needs no relay or killfeed.

import React from 'react';
import { render, act, screen } from '@testing-library/react';
import { SIM_KILLSTEAL_EVENT } from '../../../../overlayClient/detectors.ts';
import Dom1 from '../../../Theme1/on-screen/Dom';
import Dom2 from '../../../Theme2/on-screen/Dom';
import Dom3 from '../../../Theme3/on-screen/Dom';
import Dom4 from '../../../Theme4/on-screen/Dom';
import Dom5 from '../../../Theme5/on-screen/Dom';
import Dom6 from '../../../Theme6/on-screen/Dom';
import Dom7 from '../../../Theme7/on-screen/Dom';
import Dom8 from '../../../Theme8/on-screen/Dom';

const team = (n: number) => ({
  _id: `t${n}`,
  teamId: n,
  teamTag: `TAG${n}`,
  teamName: `Team ${n}`,
  teamLogo: '',
  slot: n,
  players: [1, 2].map((k) => ({
    _id: `p${n}${k}`,
    uId: `${n}${k}`,
    playerName: `Player${n}${k}`,
    killNum: 0,
    liveState: 0,
    health: 100,
    picUrl: '',
  })),
});

const props = {
  tournament: { _id: 'tour', primaryColor: '#e10600', secondaryColor: '#111' },
  round: { _id: 'r1' },
  match: { _id: 'm1', matchNo: 1 },
  matchData: { _id: 'md1', teams: [team(1), team(2), team(3)] },
} as any;

const THEMES: Array<[string, React.ComponentType<any>]> = [
  ['Theme1', Dom1], ['Theme2', Dom2], ['Theme3', Dom3], ['Theme4', Dom4],
  ['Theme5', Dom5], ['Theme6', Dom6], ['Theme7', Dom7], ['Theme8', Dom8],
];

describe.each(THEMES)('%s Dom kill steal', (_name, Dom) => {
  it('shows KILL STOLEN for the stealer with who knocked', () => {
    render(<Dom {...props} />);
    act(() => { window.dispatchEvent(new Event(SIM_KILLSTEAL_EVENT)); });
    expect(screen.getAllByText(/KILL STOLEN/i).length).toBeGreaterThan(0);
    expect(screen.getByText('KNOCKED BY')).toBeTruthy();
    expect(screen.getByText('TAG2 PLAYER21')).toBeTruthy();
    expect(screen.getAllByText(/Player11/i).length).toBeGreaterThan(0);
  });
});
