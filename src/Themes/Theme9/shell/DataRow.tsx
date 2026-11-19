import React from 'react';
import {
  FONT_DISPLAY,
  FONT_LABEL,
  FONT_MONO,
  ROW_ALT,
  HAIRLINE_SOFT,
  TEXT,
  TEXT_DIM,
  YELLOW_LIVE,
  brand,
} from './tokens';

/* ============================================================================
   DataRow — the ledger row. Reads as:
     [ 2-digit index ] | [ media ] | [ label / sublabel ] ···dotted leader···
       | [ value ][ value ] ...
   Fixed-width value slots lock columns across rows. No row-fill gradient —
   alternating rows differ only by a faint scrim.
   ========================================================================== */

export interface RowValue {
  v: React.ReactNode;
  accent?: boolean; // yellow live emphasis
  w?: number;       // slot width px (default 96)
}

interface DataRowProps {
  index?: string | number;
  label: React.ReactNode;
  sub?: React.ReactNode;
  media?: React.ReactNode; // logo / avatar node
  values: RowValue[];
  accent?: string | null;  // brand primary — index divider + dotted leader
  leader?: boolean;        // default true
  alt?: boolean;           // alternate row scrim
  height?: number;         // px, default 64
  className?: string;
  style?: React.CSSProperties;
}

const DataRow: React.FC<DataRowProps> = ({
  index,
  label,
  sub,
  media,
  values,
  accent,
  leader = true,
  alt,
  height = 64,
  className,
  style,
}) => {
  const { primary } = brand(accent);
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height,
        background: alt ? ROW_ALT : 'transparent',
        borderBottom: `1px solid ${HAIRLINE_SOFT}`,
        ...style,
      }}
    >
      {index != null ? (
        <div
          style={{
            width: height,
            minWidth: height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT_MONO,
            fontSize: 15,
            color: TEXT,
            borderRight: `2px solid ${primary}`,
          }}
        >
          {typeof index === 'number' ? String(index).padStart(2, '0') : index}
        </div>
      ) : null}

      {media ? (
        <div
          style={{
            width: height,
            minWidth: height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 8,
          }}
        >
          {media}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 14, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: Math.round(height * 0.42),
            lineHeight: 1,
            color: TEXT,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
        {sub != null ? (
          <div
            style={{
              fontFamily: FONT_LABEL,
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: TEXT_DIM,
              marginTop: 3,
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 24,
          alignSelf: 'center',
          margin: '0 16px',
          borderBottom: leader ? `2px dotted ${primary}` : 'none',
          opacity: leader ? 0.5 : 0,
        }}
      />

      {values.map((val, i) => (
        <div
          key={i}
          style={{
            width: val.w ?? 96,
            minWidth: val.w ?? 96,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 16,
            fontFamily: FONT_DISPLAY,
            fontSize: Math.round(height * 0.5),
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            color: val.accent ? YELLOW_LIVE : TEXT,
          }}
        >
          {val.v}
        </div>
      ))}
    </div>
  );
};

export default DataRow;
