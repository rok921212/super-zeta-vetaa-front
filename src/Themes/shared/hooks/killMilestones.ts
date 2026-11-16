import { useEffect, useRef, useState } from 'react';
import { Player, MatchData } from './unsortteams';
import {
  createMilestoneDetector,
  createKillStealDetector,
  killFeedList,
  SIM_KILLSTEAL_EVENT,
  type KillStealDetector,
  type MilestoneDetector,
  type MilestoneOptions,
  type MilestoneType,
} from '../../../overlayClient/detectors.ts';
import { RELAY_ORIGIN, isOverlayRoute } from '../../../login/api.tsx';

// Kill steals come from the game's killfeed, which only the desktop app's
// relay can read (GET /local/feed/kill-info -> :10086/getkillinfo). Local only:
// no cloud traffic. Off an overlay route (previews, home simulator) it's off.
const KILLFEED_POLL_MS = 2_000;

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
  teamFlag?: string;
  value?: number;
  /** killSteal only: who knocked the victim (and lost the kill), and the victim. */
  knockerName?: string;
  knockerTeamTag?: string;
  victimName?: string;
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

  // Kill steals: poll the killfeed through the relay, judge teams by matchData.
  const stealsOn = (!options?.types || options.types.includes('killSteal')) && isOverlayRoute();
  const matchDataRef = useRef(matchData);
  matchDataRef.current = matchData;
  const stealRef = useRef<KillStealDetector | null>(null);
  useEffect(() => {
    if (!stealsOn) return undefined;
    if (!stealRef.current) stealRef.current = createKillStealDetector(matchDataRef.current?._id?.toString() ?? null);
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const md = matchDataRef.current;
        if (md) {
          const res = await fetch(`${RELAY_ORIGIN}/local/feed/kill-info`, { cache: 'no-store' });
          if (res.ok && !stopped) {
            const steals = stealRef.current!.process(killFeedList(await res.json()), md as any);
            // Several in one read: show the latest (the card has one slot).
            const s = steals[steals.length - 1];
            if (s && !stopped) {
              nonceRef.current += 1;
              setEvent({
                nonce: nonceRef.current,
                type: 'killSteal',
                player: s.player,
                teamTag: s.teamTag,
                teamLogo: s.teamLogo,
                teamFlag: s.teamFlag,
                value: s.value,
                knockerName: s.knockerName,
                knockerTeamTag: s.knockerTeamTag,
                victimName: s.victimName,
              });
            }
          }
        }
      } catch {
        // Relay or game feed down: try again next tick.
      }
      if (!stopped) timer = setTimeout(poll, KILLFEED_POLL_MS);
    };
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [stealsOn]);

  // Simulators (home page, Designer preview) have no killfeed: they fire
  // SIM_KILLSTEAL_EVENT and the card uses players of three different teams.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onSim = () => {
      const teams = (matchDataRef.current?.teams || []).filter((t: any) => t.players?.length);
      if (teams.length < 2) return;
      const [stealer, knocker, victim] = [teams[0], teams[1], teams[2] || teams[1]];
      nonceRef.current += 1;
      setEvent({
        nonce: nonceRef.current,
        type: 'killSteal',
        player: stealer.players[0],
        teamTag: stealer.teamTag,
        teamLogo: stealer.teamLogo,
        teamFlag: (stealer as any).teamFlag,
        value: 42,
        knockerName: knocker.players[0].playerName,
        knockerTeamTag: knocker.teamTag,
        victimName: victim.players[victim.players.length - 1].playerName,
      });
    };
    window.addEventListener(SIM_KILLSTEAL_EVENT, onSim);
    return () => window.removeEventListener(SIM_KILLSTEAL_EVENT, onSim);
  }, []);

  return event;
}
