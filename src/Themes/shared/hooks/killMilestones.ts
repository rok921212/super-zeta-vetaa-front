import { useEffect, useRef, useState } from 'react';
import { Player, MatchData } from './unsortteams';
import {
  createMilestoneDetector,
  type MilestoneDetector,
  type MilestoneOptions,
  type MilestoneType,
} from '../../../overlayClient/detectors.ts';

// Shared kill-milestone detection for every theme's on-screen/Dom.tsx.
//
// The per-theme Dom.tsx files each hand-rolled ~150 lines of per-player
// prev-value ref tracking for: first blood, 3/5/8 kill streaks, grenade
// kills, vehicle kills, a damage threshold, and airdrop pickups — and they
// had drifted apart (Theme1 tracked only a subset; damage threshold and
// streak labels differed). This is the one detector.
//
// The detection itself lives in overlayClient/detectors.ts (framework-free) so
// the overlay engine's `milestone` event stream runs the exact same code; this
// hook is the React driver.
//
// It emits a canonical typed event; each theme maps `type` to its own
// label string ("UNSTOPPABLE" vs "UNSTOPABLE" …) and renders its own card.
// `types` lets a theme opt into a subset; `damageThreshold` defaults to 500.

export type { MilestoneType, MilestoneOptions };

export interface MilestoneEvent {
  /** Monotonic — use as the React key / useEffect dep so the same player
   *  hitting the same milestone twice still re-fires the card. */
  nonce: number;
  type: MilestoneType;
  player: Player;
  teamTag: string;
  teamLogo: string;
  value?: number;
}

export function useKillMilestones(
  matchData: MatchData | null | undefined,
  match: { _id?: string } | null | undefined,
  options?: MilestoneOptions
): MilestoneEvent | null {
  const detectorRef = useRef<MilestoneDetector | null>(null);
  if (!detectorRef.current) {
    detectorRef.current = createMilestoneDetector(options, matchData?._id?.toString() ?? null);
  }
  const nonceRef = useRef(0);
  const [event, setEvent] = useState<MilestoneEvent | null>(null);

  useEffect(() => {
    if (!matchData) return;
    const detector = detectorRef.current!;
    const found = detector.process(matchData as any);
    if (detector.lastCallResetMatch) setEvent(null);
    if (found) {
      nonceRef.current += 1;
      setEvent({ ...found, nonce: nonceRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchData]);

  return event;
}
