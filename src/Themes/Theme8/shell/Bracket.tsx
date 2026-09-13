import React from 'react';
import { HAIRLINE_SOFT, brand, BrandFallback } from './tokens';

/* ============================================================================
   Bracket — wraps an on-screen panel. A 2px brand "binding edge" on one side,
   L-shaped corner marks (default the top-left + bottom-right diagonal, echoing
   the chamfer), and a soft hairline outline. Purely decorative; children are
   positioned by the caller.
   ========================================================================== */

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Edge = 'left' | 'right' | 'top' | 'bottom' | 'none';

interface BracketProps {
  edge?: Edge;
  accent?: string | null;
  accentSecondary?: string | null;
  fallback?: BrandFallback;
  corners?: Corner[];
  len?: number; // corner-mark arm length
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function armStyles(c: Corner, color: string, len: number): [React.CSSProperties, React.CSSProperties] {
  const vY: React.CSSProperties = c[0] === 't' ? { top: 0 } : { bottom: 0 };
  const vX: React.CSSProperties = c[1] === 'l' ? { left: 0 } : { right: 0 };
  const horiz: React.CSSProperties = { position: 'absolute', ...vY, ...vX, width: len, height: 2, background: color };
  const vert: React.CSSProperties = { position: 'absolute', ...vY, ...vX, width: 2, height: len, background: color };
  return [horiz, vert];
}

function edgeStyle(edge: Edge, color: string): React.CSSProperties {
  switch (edge) {
    case 'left': return { borderLeft: `2px solid ${color}` };
    case 'right': return { borderRight: `2px solid ${color}` };
    case 'top': return { borderTop: `2px solid ${color}` };
    case 'bottom': return { borderBottom: `2px solid ${color}` };
    default: return {};
  }
}

const Bracket: React.FC<BracketProps> = ({
  edge = 'left',
  accent,
  accentSecondary,
  fallback = 'default',
  corners = ['tl', 'br'],
  len = 16,
  children,
  className,
  style,
}) => {
  const { primary, secondary } = brand(accent, accentSecondary, fallback);
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        outline: `1px solid ${HAIRLINE_SOFT}`,
        outlineOffset: -1,
        ...edgeStyle(edge, primary),
        ...style,
      }}
    >
      {children}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {corners.map((c) => {
          const [h, v] = armStyles(c, c === 'tl' || c === 'br' ? primary : secondary, len);
          return (
            <React.Fragment key={c}>
              <div style={h} />
              <div style={v} />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default Bracket;
