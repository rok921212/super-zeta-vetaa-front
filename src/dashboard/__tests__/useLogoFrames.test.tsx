import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { LogoFramesList, useLogoFrames, type LogoFrames } from '../useLogoFrames';
import { uploadToCloudinary } from '../../utils/cloudinaryUpload.tsx';
import { buildAnimatedLogo } from '../../utils/imagePrep/animatedLogo';

jest.mock('../../utils/cloudinaryUpload.tsx', () => ({ uploadToCloudinary: jest.fn(async () => 'https://cdn/saved') }));
jest.mock('../../utils/imagePrep/animatedLogo', () => ({ buildAnimatedLogo: jest.fn() }));
jest.mock('../../utils/imagePrep', () => ({ OUTPUT_SIZE: { logo: { width: 600, height: 600 } } }));
// The real modal runs background removal; this one offers the same two ways out.
jest.mock('../ImagePrepModal', () => ({
  __esModule: true,
  default: ({ title, upload, onClose }: any) => (
    <div>
      <span data-testid="title">{title}</span>
      <button onClick={async () => { await upload(new Blob(['x'], { type: 'image/png' }), 'logo.png'); onClose(); }}>use</button>
      <button onClick={onClose}>skip</button>
    </div>
  ),
}));

const gif = new Blob(['gif'], { type: 'image/gif' });
let logo: LogoFrames;

const Host = () => {
  logo = useLogoFrames();
  return <>{logo.prepModal}<LogoFramesList logo={logo} /></>;
};
const file = (name: string) => new File(['x'], name, { type: 'image/png' });
const press = async (name: string) => { await act(async () => { screen.getByText(name).click(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  (buildAnimatedLogo as jest.Mock).mockResolvedValue(gif);
  (uploadToCloudinary as jest.Mock).mockResolvedValue('https://cdn/saved');
  URL.createObjectURL = jest.fn(() => 'blob:x');
  URL.revokeObjectURL = jest.fn();
});

test('one logo uploads as a static image, no GIF', async () => {
  render(<Host />);
  act(() => logo.addFiles([file('a.png')]));
  expect(screen.getByTestId('title').textContent).toBe('Tournament logo');
  await press('use');
  expect(buildAnimatedLogo).not.toHaveBeenCalled();
  expect(screen.getByText(/saved as a static image/)).toBeTruthy();
  await expect(logo.upload()).resolves.toBe('https://cdn/saved');
  const [blob, , , filename] = (uploadToCloudinary as jest.Mock).mock.calls[0];
  expect(blob.type).toBe('image/png');
  expect(filename).toBe('logo.png');
});

test('several logos are prepared one by one and upload as one GIF', async () => {
  render(<Host />);
  act(() => logo.addFiles([file('a.png'), file('b.png')]));
  expect(screen.getByTestId('title').textContent).toBe('Tournament logo 1 of 2');
  await press('use');
  expect(screen.getByTestId('title').textContent).toBe('Tournament logo 2 of 2');
  await press('use');
  expect(screen.queryByTestId('title')).toBeNull();
  await waitFor(() => expect(buildAnimatedLogo).toHaveBeenCalledTimes(1));
  expect((buildAnimatedLogo as jest.Mock).mock.calls[0].slice(1)).toEqual([600, 2000]);
  await logo.upload();
  const [blob, folder, preset, filename] = (uploadToCloudinary as jest.Mock).mock.calls[0];
  expect([blob, folder, preset, filename]).toEqual([gif, 'tournaments/logos', 'team_logo', 'tournament-logo.gif']);
});

test('nothing is uploaded until saving, and with no logo there is nothing to save', async () => {
  render(<Host />);
  await expect(logo.upload()).resolves.toBeNull();
  act(() => logo.addFiles([file('a.png')]));
  await press('use');
  expect(uploadToCloudinary).not.toHaveBeenCalled();
});

test('cancel skips that logo and goes on to the next', async () => {
  render(<Host />);
  act(() => logo.addFiles([file('a.png'), file('b.png')]));
  await press('skip');
  await press('use');
  expect(logo.frames).toHaveLength(1);
  expect(buildAnimatedLogo).not.toHaveBeenCalled();
});

test('a second pick adds to the first, and removing one goes back to static', async () => {
  render(<Host />);
  act(() => logo.addFiles([file('a.png')]));
  await press('use');
  act(() => logo.addFiles([file('b.png')]));
  await press('use');
  expect(logo.frames).toHaveLength(2);
  await waitFor(() => expect(buildAnimatedLogo).toHaveBeenCalled());
  await act(async () => logo.remove(logo.frames[0].id));
  await logo.upload();
  expect((uploadToCloudinary as jest.Mock).mock.calls[0][0].type).toBe('image/png');
});

test('order follows the moves, and a changed time rebuilds the GIF', async () => {
  render(<Host />);
  act(() => logo.addFiles([file('a.png'), file('b.png')]));
  await press('use');
  await press('use');
  const [first, second] = logo.frames;
  await act(async () => logo.moveEarlier(second.id));
  expect(logo.frames.map((f) => f.id)).toEqual([second.id, first.id]);
  await act(async () => logo.setSeconds(5));
  await waitFor(() => expect((buildAnimatedLogo as jest.Mock).mock.lastCall?.[2]).toBe(5000));
});

test('an animated logo over 5 MB says so', async () => {
  (buildAnimatedLogo as jest.Mock).mockResolvedValue(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/gif' }));
  render(<Host />);
  act(() => logo.addFiles([file('a.png'), file('b.png')]));
  await press('use');
  await press('use');
  await waitFor(() => expect(screen.getByText(/over 5 MB/)).toBeTruthy());
});
