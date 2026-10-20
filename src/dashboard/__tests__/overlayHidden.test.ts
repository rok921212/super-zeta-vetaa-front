import { isOnAirDesign, isOnAirView, shouldHide } from '../overlayHidden.ts';

jest.mock('../socketManager.tsx', () => ({ __esModule: true, default: { getInstance: () => ({ connect: () => ({ on() {}, off() {} }) }) } }));

describe('hide On-air overlays scope', () => {
  test('only the live match views are On-air', () => {
    for (const v of ['Alerts', 'Lower', 'Upper', 'Dom', 'intro', 'LiveStats', 'LiveFrags', 'LiveData', 'Recall']) {
      expect(isOnAirView(v)).toBe(true);
    }
    for (const v of ['OverAllData', 'Champions', 'MatchSummary', 'CommingUpNext', 'Schedule', '', null]) {
      expect(isOnAirView(v as string)).toBe(false);
    }
  });

  test('a hidden On-air message fades On-air pages only', () => {
    const msg = { hidden: true, scope: 'onair' };
    expect(shouldHide(msg, true)).toBe(true);
    expect(shouldHide(msg, false)).toBe(false);
    expect(shouldHide({ hidden: false, scope: 'onair' }, true)).toBe(false);
    expect(shouldHide(null, true)).toBe(false);
  });

  test('an older relay without a scope means On-air; scope all fades every page', () => {
    expect(shouldHide({ hidden: true }, true)).toBe(true);
    expect(shouldHide({ hidden: true }, false)).toBe(false);
    expect(shouldHide({ hidden: true, scope: 'all' }, false)).toBe(true);
  });

  test('designs: the link wins, then the category; uncategorised counts as On-air', () => {
    expect(isOnAirDesign('leaderboards', '1')).toBe(true);
    expect(isOnAirDesign('lower-thirds', '0')).toBe(false);
    expect(isOnAirDesign('lower-thirds', null)).toBe(true);
    expect(isOnAirDesign('kill-feed', null)).toBe(true);
    expect(isOnAirDesign('leaderboards', null)).toBe(false);
    expect(isOnAirDesign('mvp-winners', null)).toBe(false);
    expect(isOnAirDesign(null, null)).toBe(true);
  });
});
