import React from 'react';
import {
  RAIL_TICK_GAP,
  RAIL_MAJOR_EVERY,
  HAIRLINE,
  TEXT_DIM,
  FONT_MONO,
  brand,
} from './tokens';

/* ============================================================================
   Rail — a ticked measurement rule. Replaces the gold bars, the column-label
   strips and the simple gauges. Minor ticks every `gap` px; every Nth is a
   major tick (longer, optional mono label); the tick at `activeIndex` is
   brand-coloured and 2px longer (current row / winner / live selection).
   Rendered as one <svg> for crisp sub-pixel ticks.
   ========================================================================== */

interface RailProps {
  dir?: 'h' | 'v';
  length?: number;                // px along the rail
  minor?: number;
  major?: number;
  gap?: number;
  majorEvery?: number;
  activeIndex?: number | null;
  accent?: string | null;
  labels?: Array<string | null>;  // indexed by tick number
  className?: string;
  style?: React.CSSProperties;
}

const Rail: React.FC<RailProps> = ({
  dir = 'h',
  length = 400,
  minor = 6,
  major = 12,
  gap = RAIL_TICK_GAP,
  majorEvery = RAIL_MAJOR_EVERY,
  activeIndex = null,
  accent,
  labels,
  className,
  style,
}) => {
  const { primary } = brand(accent);
  const count = Math.max(1, Math.floor(length / gap) + 1);
  const cross = major + 16; // room for a label alongside the ticks
  const w = dir === 'h' ? length : cross;
  const h = dir === 'h' ? cross : length;

  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const isMajor = i % majorEvery === 0;
    const isActive = i === activeIndex;
    const len = isActive ? major + 2 : isMajor ? major : minor;
    const col = isActive ? primary : HAIRLINE;
    const sw = isActive || isMajor ? 2 : 1;
    const pos = i * gap;
    if (dir === 'h') {
      nodes.push(<line key={`t${i}`} x1={pos} y1={0} x2={pos} y2={len} stroke={col} strokeWidth={sw} />);
      if (labels && labels[i]) {
        nodes.push(
          <text key={`l${i}`} x={pos} y={cross - 2} fontFamily={FONT_MONO} fontSize={10} fill={TEXT_DIM} textAnchor="middle" letterSpacing="0.1em">
            {labels[i]}
          </text>,
        );
      }
    } else {
      nodes.push(<line key={`t${i}`} x1={cross} y1={pos} x2={cross - len} y2={pos} stroke={col} strokeWidth={sw} />);
      if (labels && labels[i]) {
        nodes.push(
          <text key={`l${i}`} x={cross - major - 4} y={pos + 3} fontFamily={FONT_MONO} fontSize={10} fill={TEXT_DIM} textAnchor="end" letterSpacing="0.1em">
            {labels[i]}
          </text>,
        );
      }
    }
  }

  return (
    <svg className={className} style={style} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {dir === 'h' ? (
        <line x1={0} y1={0} x2={length} y2={0} stroke={HAIRLINE} strokeWidth={1} />
      ) : (
        <line x1={cross} y1={0} x2={cross} y2={length} stroke={HAIRLINE} strokeWidth={1} />
      )}
      {nodes}
    </svg>
  );
};

export default Rail;
