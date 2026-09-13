import React from 'react';
import { FONT_LABEL, TEXT, brand } from './tokens';

/* ============================================================================
   Label — a technical label. Uppercase, letter-spaced, with a leading glyph
   ("/" by default) and an optional 2px brand underline for the active label.
   ========================================================================== */

interface LabelProps {
  glyph?: string | null; // '/', '[', ']', '·' ...  null = no glyph
  accent?: string | null; // underline colour; omit for no underline
  size?: number;          // px, default 13
  color?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const Label: React.FC<LabelProps> = ({
  glyph = '/',
  accent,
  size = 13,
  color = TEXT,
  children,
  className,
  style,
}) => {
  const { primary } = brand(accent);
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: '0.5em',
        fontFamily: FONT_LABEL,
        fontSize: size,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color,
        ...(accent ? { borderBottom: `2px solid ${primary}`, paddingBottom: 3 } : {}),
        ...style,
      }}
    >
      {glyph ? <span style={{ opacity: 0.5 }}>{glyph}</span> : null}
      <span>{children}</span>
    </span>
  );
};

export default Label;
