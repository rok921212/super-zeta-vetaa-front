import React from 'react';
import { SCRIM, SCRIM_2, SCRIM_SOLID, GOLD, CUT, chamfer, brand, BrandFallback } from './tokens';

/* ============================================================================
   Surface — the flat, chamfered scrim panel that replaces every 135deg
   brand-gradient fill. Charcoal background, single-diagonal chamfer, and an
   optional brand (or gold "winner") binding edge on one side.
   ========================================================================== */

type Tone = 'scrim' | 'scrim2' | 'solid';
type Edge = 'left' | 'right' | 'top' | 'bottom' | 'none';

interface SurfaceProps {
  tone?: Tone;
  edge?: Edge;
  gold?: boolean; // winner emphasis — gold binding edge instead of brand
  accent?: string | null;
  accentSecondary?: string | null;
  fallback?: BrandFallback;
  cut?: number;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const TONES: Record<Tone, string> = { scrim: SCRIM, scrim2: SCRIM_2, solid: SCRIM_SOLID };

function edgeStyle(edge: Edge, color: string): React.CSSProperties {
  switch (edge) {
    case 'left': return { borderLeft: `2px solid ${color}` };
    case 'right': return { borderRight: `2px solid ${color}` };
    case 'top': return { borderTop: `2px solid ${color}` };
    case 'bottom': return { borderBottom: `2px solid ${color}` };
    default: return {};
  }
}

const Surface: React.FC<SurfaceProps> = ({
  tone = 'scrim',
  edge = 'none',
  gold,
  accent,
  accentSecondary,
  fallback = 'default',
  cut = CUT,
  children,
  className,
  style,
}) => {
  const { primary } = brand(accent, accentSecondary, fallback);
  const clip = chamfer(cut);
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        background: TONES[tone],
        clipPath: clip,
        WebkitClipPath: clip,
        ...edgeStyle(edge, gold ? GOLD : primary),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default Surface;
