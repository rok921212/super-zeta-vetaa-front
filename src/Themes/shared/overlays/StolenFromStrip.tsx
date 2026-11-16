// The "KNOCKED BY …" strip every theme's on-screen/Dom.tsx shows under its
// card for a KILL STOLEN event (shared/hooks/killMilestones.ts). The card
// itself keeps each theme's own look (stealer's photo, team, "KILL STOLEN");
// this strip only adds who made the knock that was stolen. Renders nothing
// for every other milestone type.

import React from 'react';
import type { MilestoneEvent } from '../hooks/killMilestones.ts';

interface Props {
  event: MilestoneEvent | null | undefined;
  visible: boolean;
  /** Placement on the 1920×1080 canvas, just under the theme's card. */
  top: number;
  left: number;
  width: number;
  primary?: string;
  secondary?: string;
}

export const stolenFromText = (e: MilestoneEvent | null | undefined): string | null => {
  if (!e || e.type !== 'killSteal' || !e.knockerName) return null;
  return [e.knockerTeamTag, e.knockerName].filter(Boolean).join(' ');
};

const StolenFromStrip: React.FC<Props> = ({ event, visible, top, left, width, primary, secondary }) => {
  const knocker = stolenFromText(event);
  if (!knocker) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 14px',
        boxSizing: 'border-box',
        background: 'rgba(0,0,0,0.82)',
        borderLeft: `6px solid ${primary || '#E7A801'}`,
        borderBottom: `2px solid ${secondary || primary || '#E7A801'}`,
        color: '#fff',
        fontFamily: 'AGENCYB, Arial, sans-serif',
        fontSize: 24,
        letterSpacing: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(-40px)',
        transition: 'opacity .4s ease, transform .4s ease',
        pointerEvents: 'none',
      }}
    >
      <span style={{ color: primary || '#E7A801' }}>KNOCKED BY</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{knocker.toUpperCase()}</span>
      {event?.victimName ? (
        <span style={{ opacity: 0.7, fontSize: 20, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          ON {event.victimName.toUpperCase()}
        </span>
      ) : null}
    </div>
  );
};

export default StolenFromStrip;
