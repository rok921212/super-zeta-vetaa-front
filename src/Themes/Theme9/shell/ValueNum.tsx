import React, { useEffect, useRef } from 'react';
import { FONT_DISPLAY, TEXT, YELLOW_LIVE } from './tokens';

/* ============================================================================
   ValueNum — tabular-lining numerals. Values SNAP (no count-up tween); on a
   change the cell gets a single 180ms brand-colour edge flash (.t8-flash,
   defined in front/src/index.css @layer utilities).
   ========================================================================== */

interface ValueNumProps {
  value: React.ReactNode;
  accent?: boolean;      // yellow-300 live emphasis
  flashColor?: string;   // edge-flash colour on change (default yellow-300)
  size?: number;         // px, default 40
  unit?: string;
  className?: string;
  style?: React.CSSProperties;
}

const ValueNum: React.FC<ValueNumProps> = ({
  value,
  accent,
  flashColor,
  size = 40,
  unit,
  className,
  style,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<React.ReactNode>(value);

  useEffect(() => {
    if (prev.current !== value && ref.current) {
      const el = ref.current;
      el.style.setProperty('--t8-accent', flashColor || YELLOW_LIVE);
      el.classList.remove('t8-flash');
      // force reflow so the animation restarts on a repeated change
      void el.offsetWidth;
      el.classList.add('t8-flash');
    }
    prev.current = value;
  }, [value, flashColor]);

  return (
    <span
      ref={ref}
      className={className}
      style={{
        fontFamily: FONT_DISPLAY,
        fontSize: size,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        color: accent ? YELLOW_LIVE : TEXT,
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: '0.25em',
        ...style,
      }}
    >
      {value}
      {unit ? <span style={{ fontSize: size * 0.4, opacity: 0.6 }}>{unit}</span> : null}
    </span>
  );
};

export default ValueNum;
