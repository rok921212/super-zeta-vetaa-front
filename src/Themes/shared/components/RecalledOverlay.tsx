import React, { memo, useEffect, useState } from 'react';

export interface RecalledOverlayProps {
  playerName: string;
  rowHeight?: number;
  fontSize?: number;
  onDone: () => void;
}

const RECALL_GRADIENT: React.CSSProperties = {
  background: 'linear-gradient(135deg, #0dd10d, #067d06)',
};

const RecalledOverlay = memo(
  ({
    playerName,
    rowHeight,
    fontSize = 32,
    onDone,
  }: RecalledOverlayProps) => {
    const [phase, setPhase] = useState<'in' | 'out'>('in');
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
      const rafId = requestAnimationFrame(() => setExpanded(true));
      const outTimer = setTimeout(() => setPhase('out'), 2500);
      const doneTimer = setTimeout(() => onDone(), 3300);

      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(outTimer);
        clearTimeout(doneTimer);
      };
    }, [onDone]);

    const isExpanded = phase === 'in' && expanded;

    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          height: rowHeight ? `${rowHeight}px` : '100%',
          zIndex: 21,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            ...RECALL_GRADIENT,
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: isExpanded ? 'calc(100% - 5px)' : '0%',
            transition:
              phase === 'in'
                ? 'width 1.5s cubic-bezier(0.22, 1, 0.36, 1)'
                : 'width 0.6s cubic-bezier(0.55, 0, 1, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontFamily: 'AGENCYB, sans-serif',
              fontSize: `${fontSize}px`,
              fontWeight: 'bold',
              color: '#ffffff',
              textShadow: '0 1px 6px rgba(0,0,0,0.6)',
              opacity: phase === 'in' && expanded ? 1 : 0,
              transition:
                phase === 'in'
                  ? 'opacity 0.4s ease 0.8s'
                  : 'opacity 0.3s ease',
              whiteSpace: 'nowrap',
              padding: '0 6px',
            }}
          >
            RECALLED - {playerName.toUpperCase()}
          </span>
        </div>
      </div>
    );
  }
);

RecalledOverlay.displayName = 'RecalledOverlay';

export default RecalledOverlay;