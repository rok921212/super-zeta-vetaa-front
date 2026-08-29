import React, { useMemo } from 'react';
import { RecallEvent, useRecallBanner } from '../hooks/recallEvents';
import RecalledOverlay from './RecalledOverlay';

// Drop-in per-team-row recall banner for every theme's LiveStats.
//
// The parent calls useRecallEvents(matchData, match) once and hands the
// match-wide event list to every row via `recallEvents`; this component
// filters it to its own team, runs the shared one-at-a-time queue, and
// renders the shared RecalledOverlay card. Renders nothing when idle.
//
// It is a positioned <div>, so inside an SVG row wrap it in
// <foreignObject> (see Theme3's LiveStats).

export interface TeamRecallOverlayProps {
  recallEvents: RecallEvent[];
  teamId: string;
  rowHeight?: number;
}

const TeamRecallOverlay: React.FC<TeamRecallOverlayProps> = ({ recallEvents, teamId, rowHeight }) => {
  const key = String(teamId ?? '');
  const rowRecalls = useMemo(
    () => recallEvents.filter((e) => e.teamId === key),
    [recallEvents, key]
  );
  const { current, onDone } = useRecallBanner(rowRecalls);

  if (!current) return null;
  return (
    <RecalledOverlay
      key={current.bannerKey}
      playerName={current.playerName}
      rowHeight={rowHeight}
      onDone={onDone}
    />
  );
};

export default TeamRecallOverlay;
