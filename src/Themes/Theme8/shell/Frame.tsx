import React from 'react';
import { HAIRLINE, HAIRLINE_SOFT, FONT_MONO, TEXT_DIM, brand } from './tokens';

/* ============================================================================
   Frame — full-screen registration frame for off-screen "scene" components.
   Offset double hairline (inner frame nudged +12px on top+left only), a "+"
   crosshair at each outer corner, and a mono broadcast slug. Renders children
   first, then the frame decoration as a pointer-events-none overlay, so an
   existing absolutely-positioned scene tree keeps working untouched — the
   reshell just wraps the old return value.
   ========================================================================== */

interface FrameProps {
  accent?: string | null;
  slug?: string;
  inset?: number; // outer inset in px (default 48)
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const CROSS = 14;

function crossStyle(x: 'l' | 'r', y: 't' | 'b', at: number): React.CSSProperties {
  const s: React.CSSProperties = { position: 'absolute', width: CROSS, height: CROSS };
  if (x === 'l') s.left = at - CROSS / 2; else s.right = at - CROSS / 2;
  if (y === 't') s.top = at - CROSS / 2; else s.bottom = at - CROSS / 2;
  return s;
}

const Cross: React.FC<{ x: 'l' | 'r'; y: 't' | 'b'; at: number; color: string }> = ({ x, y, at, color }) => (
  <div style={crossStyle(x, y, at)}>
    <div style={{ position: 'absolute', left: CROSS / 2 - 1, top: 0, width: 2, height: CROSS, background: color }} />
    <div style={{ position: 'absolute', left: 0, top: CROSS / 2 - 1, width: CROSS, height: 2, background: color }} />
  </div>
);

const Frame: React.FC<FrameProps> = ({ accent, slug, inset = 48, children, className, style }) => {
  const { primary } = brand(accent);
  return (
    <div
      className={className}
      style={{ width: '1920px', height: '1080px', position: 'relative', ...style }}
    >
      {children}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset, border: `1px solid ${HAIRLINE}` }} />
        <div
          style={{
            position: 'absolute',
            top: inset + 12,
            left: inset + 12,
            right: inset,
            bottom: inset,
            border: `1px solid ${HAIRLINE_SOFT}`,
          }}
        />
        <Cross x="l" y="t" at={inset} color={primary} />
        <Cross x="r" y="t" at={inset} color={primary} />
        <Cross x="l" y="b" at={inset} color={primary} />
        <Cross x="r" y="b" at={inset} color={primary} />
        {slug ? (
          <div
            style={{
              position: 'absolute',
              left: inset + 18,
              bottom: inset + 12,
              font: `12px/1 ${FONT_MONO}`,
              letterSpacing: '0.18em',
              color: TEXT_DIM,
            }}
          >
            {slug}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Frame;
