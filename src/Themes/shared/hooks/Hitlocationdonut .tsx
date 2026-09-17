// src/components/HitLocationDonut.tsx
//
// Hit Location Distribution — circular donut chart for the MVP broadcast
// overlay. Pure presentational component: pass it raw hit counts and it
// derives every percentage itself (never trust a caller to pre-compute %,
// rounding drift is how "adds up to 100%" bugs get introduced).
//
// Built with stacked SVG <circle> strokes (dasharray/dashoffset), not <path>
// arcs — five categories at fixed, known percentages don't need arc-flag
// math, and circles stay crisp at any broadcast scale.
import React, { useMemo } from 'react';

export interface HitLocationCounts {
  head: number;
  body: number;
  limbs: number;
  hands: number;
  feet: number;
}

interface Segment {
  key: keyof HitLocationCounts;
  label: string;
  count: number;
  pct: number;
  color: string;
}

const CATEGORY_META: { key: keyof HitLocationCounts; label: string; color: string }[] = [
  { key: 'head', label: 'HEAD', color: '#FF3B57' },
  { key: 'body', label: 'BODY', color: '#FFB33D' },
  { key: 'limbs', label: 'LIMBS', color: '#2FD8CE' },
  { key: 'hands', label: 'HANDS', color: '#9B7BFF' },
  { key: 'feet', label: 'FEET', color: '#5B6472' },
];

interface HitLocationDonutProps {
  counts: HitLocationCounts;
  accentColor?: string;
  size?: number; // px, square
}

const HitLocationDonut: React.FC<HitLocationDonutProps> = ({
  counts,
  accentColor = '#FFD400',
  size = 420,
}) => {
  const total =
    (counts.head || 0) + (counts.body || 0) + (counts.limbs || 0) + (counts.hands || 0) + (counts.feet || 0);

  const segments: Segment[] = useMemo(() => {
    return CATEGORY_META.map((meta) => {
      const count = Number(counts[meta.key]) || 0;
      const pct = total > 0 ? (count / total) * 100 : 0;
      return { ...meta, count, pct };
    });
  }, [counts, total]);

  // Geometry
  const viewBox = 300;
  const cx = viewBox / 2;
  const cy = viewBox / 2;
  const strokeWidth = 34;
  const r = (viewBox - strokeWidth) / 2 - 4;
  const circumference = 2 * Math.PI * r;

  // Cumulative offset per segment, in the same order as CATEGORY_META so the
  // ring reads clockwise starting at 12 o'clock (the whole group is rotated
  // -90deg below to move SVG's default 3-o'clock start to the top).
  let cumulativePct = 0;
  const rings = segments.map((seg) => {
    const dash = (seg.pct / 100) * circumference;
    const gap = circumference - dash;
    const offset = -(cumulativePct / 100) * circumference;
    cumulativePct += seg.pct;
    return { ...seg, dash, gap, offset };
  });

  const fontFamily = "'AGENCYB', 'Arial Narrow', sans-serif";

  return (
    <div className="flex items-center" style={{ fontFamily, gap: 28 }}>
      {/* ---------------- Donut ---------------- */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${viewBox} ${viewBox}`}>
          {/* base track — the full 100% circle, dim, so the 0% Feet slice is
              still implicitly "present" on the ring even with no color arc */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {rings
              .filter((seg) => seg.pct > 0)
              .map((seg) => (
                <circle
                  key={seg.key}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${seg.dash} ${seg.gap}`}
                  strokeDashoffset={seg.offset}
                  strokeLinecap="butt"
                  style={{ filter: `drop-shadow(0 0 6px ${seg.color}88)` }}
                />
              ))}
          </g>
          {/* thin separators between slices for a clean broadcast edge */}
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {(() => {
              let acc = 0;
              return rings
                .filter((seg) => seg.pct > 0)
                .map((seg) => {
                  const angle = (acc / 100) * 360;
                  acc += seg.pct;
                  const rad = (angle * Math.PI) / 180;
                  const inner = r - strokeWidth / 2;
                  const outer = r + strokeWidth / 2;
                  const x1 = cx + inner * Math.cos(rad);
                  const y1 = cy + inner * Math.sin(rad);
                  const x2 = cx + outer * Math.cos(rad);
                  const y2 = cy + outer * Math.sin(rad);
                  return (
                    <line
                      key={`sep-${seg.key}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="rgba(6,8,12,0.9)"
                      strokeWidth={3}
                    />
                  );
                });
            })()}
          </g>
        </svg>

        {/* ---------------- Center readout ---------------- */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div
            className="leading-none font-bold"
            style={{ fontSize: size * 0.17, color: '#fff', textShadow: '0 0 18px rgba(255,255,255,.25)' }}
          >
            {total}
          </div>
          <div
            className="tracking-[4px] mt-1"
            style={{ fontSize: size * 0.045, color: accentColor, letterSpacing: 3 }}
          >
            TOTAL HITS
          </div>
        </div>
      </div>

      {/* ---------------- Legend ---------------- */}
      <div className="flex flex-col" style={{ gap: 14 }}>
        <div
          className="mb-1 pb-2"
          style={{
            fontSize: 22,
            letterSpacing: 4,
            color: 'rgba(255,255,255,.55)',
            borderBottom: '1px solid rgba(255,255,255,.12)',
          }}
        >
          HIT LOCATION DISTRIBUTION
        </div>
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center" style={{ gap: 14, minWidth: 300 }}>
            <span
              className="inline-block rounded-[2px]"
              style={{
                width: 16,
                height: 16,
                background: seg.pct > 0 ? seg.color : 'transparent',
                border: seg.pct > 0 ? 'none' : `2px dashed ${seg.color}`,
                boxShadow: seg.pct > 0 ? `0 0 8px ${seg.color}99` : 'none',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 26, color: '#fff', width: 110, letterSpacing: 2 }}>{seg.label}</span>
            <span style={{ fontSize: 22, color: 'rgba(255,255,255,.5)', width: 60 }}>x{seg.count}</span>
            <span
              className="font-bold"
              style={{ fontSize: 30, color: seg.pct > 0 ? seg.color : 'rgba(255,255,255,.35)', marginLeft: 'auto' }}
            >
              {seg.pct.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HitLocationDonut;