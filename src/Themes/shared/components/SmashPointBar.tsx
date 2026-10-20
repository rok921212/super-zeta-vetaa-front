// Smash Point bar, shared by every theme's LiveStats and LiveData so the two
// views can never disagree. The value is what the operator typed for the
// match (Match.smashPoint, set in the match form or the desktop Overlays
// page); no scoring rule is applied to it. It arrives with the match in the
// bulk payload, so it needs no extra request or socket.
//
// Hidden (renders nothing, so no empty gap) unless `enabled` and the value
// is not blank. It slides in once when it appears; a new value pulses the
// value only. A reconnect or a re-sent identical match changes nothing, so
// it never replays. Colours: the tournament's primary → secondary gradient
// with a thin gold trim.

import React, { useEffect, useRef, useState } from 'react';

export interface SmashPoint {
  enabled?: boolean;
  value?: string | number | null;
  displayText?: string | null;
}

export interface SmashPointView {
  visible: boolean;
  label: string;
  value: string;
}

const GOLD = '#C9A54C';
const GOLD_LIGHT = '#F1D27A';

/** What the bar shows for a match (exported for tests and the Designer). */
export function smashPointOf(match: unknown): SmashPointView {
  const sp = (match as { smashPoint?: SmashPoint | null } | null | undefined)?.smashPoint;
  const value = sp?.value == null ? '' : String(sp.value).trim();
  const label = (sp?.displayText || '').trim() || 'SMASH POINT';
  return { visible: !!sp?.enabled && value !== '', label, value };
}

const STYLE_ID = 'ss-smash-point-style';
const CSS = `
@keyframes ss-smash-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes ss-smash-pulse { 0% { transform: scale(1); filter: brightness(1); } 35% { transform: scale(1.08); filter: brightness(1.35); } 100% { transform: scale(1); filter: brightness(1); } }
.ss-smash-bar { animation: ss-smash-in 380ms cubic-bezier(.2,.8,.2,1) both; }
.ss-smash-pulse { animation: ss-smash-pulse 420ms ease-out; display: inline-block; }
@media (prefers-reduced-motion: reduce) { .ss-smash-bar, .ss-smash-pulse { animation: none; } }
`;

function useStyleOnce() {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

interface Props {
  /** The theme's match prop (each theme has its own Match type, so any object). */
  match?: unknown;
  tournament?: { primaryColor?: string; secondaryColor?: string } | null;
  /** Bar height in px (default 44). Width follows the parent. */
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

const Bar: React.FC<{ view: SmashPointView; primary: string; secondary: string; height: number; className?: string; style?: React.CSSProperties }> = ({
  view, primary, secondary, height, className, style,
}) => {
  useStyleOnce();
  // Pulse on a change of value, never on the first value shown.
  const [pulse, setPulse] = useState(0);
  const last = useRef(view.value);
  useEffect(() => {
    if (view.value !== last.current) {
      last.current = view.value;
      setPulse((n) => n + 1);
    }
  }, [view.value]);

  return (
    <div
      className={`ss-smash-bar ${className || ''}`}
      data-testid="smash-point-bar"
      role="status"
      aria-label={`${view.label}: ${view.value}`}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        height,
        background: `linear-gradient(100deg, ${primary} 0%, ${primary} 45%, ${secondary} 100%)`,
        borderTop: `2px solid ${GOLD}`,
        borderBottom: `2px solid ${GOLD}`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        color: '#fff',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          background: `linear-gradient(180deg, ${GOLD_LIGHT}, ${GOLD})`,
          color: '#1a1406',
          fontWeight: 800,
          letterSpacing: '0.12em',
          fontSize: Math.round(height * 0.32),
          whiteSpace: 'nowrap',
          clipPath: 'polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
          paddingRight: 22,
        }}
      >
        {view.label}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: Math.round(height * 0.52),
          letterSpacing: '0.04em',
          textShadow: '0 1px 2px rgba(0,0,0,0.55)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span key={pulse} className={pulse > 0 ? 'ss-smash-pulse' : undefined}>{view.value}</span>
      </div>
    </div>
  );
};

const SmashPointBar: React.FC<Props> = ({ match, tournament, height = 44, className, style }) => {
  const view = smashPointOf(match);
  if (!view.visible) return null;
  return (
    <Bar
      view={view}
      primary={tournament?.primaryColor || '#1f1147'}
      secondary={tournament?.secondaryColor || '#3b1f7a'}
      height={height}
      className={className}
      style={style}
    />
  );
};

export default SmashPointBar;
