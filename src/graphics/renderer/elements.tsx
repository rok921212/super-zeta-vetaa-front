// Leaf element renderers + the element registry. Containers (group, repeater,
// component) live in LayoutRenderer.tsx because they recurse.
//
// Every leaf receives already-resolved data (bound props, resolved style), so
// the same component renders identically in the Designer canvas and in OBS.

import React, { useEffect, useState } from 'react';
import * as Fa from 'react-icons/fa';
import type { LayoutElement } from '../schema/layoutTypes.ts';
import { resolveAssetUrl } from '../../overlayClient/client.ts';
import { boxCss, textCss } from './styleToCss.ts';
import { resolveComponent, builtinProps } from '../../Themes/registry.ts';

export interface LeafProps {
  el: LayoutElement;
  /** Resolved bindings (text, src, value, max, fill, color, stroke, ...). */
  bound: Record<string, unknown>;
  /** Style with tokens resolved and styleWhen rules applied. */
  style: Record<string, unknown>;
  assetBase?: string;
  /** Resolved current repeater item, when inside one (health defaults etc.). */
  item?: any;
  onAssetError?: (id: string) => void;
  /** The binding scope (engine slices) — built-in graphics render from it. */
  scope?: Record<string, any>;
}

const FILL = { position: 'absolute', inset: 0 } as const;

const textOf = (el: LayoutElement, bound: Record<string, unknown>): string => {
  const v = el.bind?.text ? bound.text : el.text;
  if (v === undefined || v === null) return '';
  return typeof v === 'object' ? '' : String(v);
};

const withBoundColors = (style: Record<string, unknown>, bound: Record<string, unknown>) => ({
  ...style,
  ...(bound.fill != null ? { fill: bound.fill, gradient: undefined } : {}),
  ...(bound.color != null ? { color: bound.color } : {}),
  ...(bound.stroke != null ? { stroke: bound.stroke } : {}),
});

const Rect: React.FC<LeafProps> = ({ el, bound, style }) => (
  <div style={{ ...FILL, ...boxCss(withBoundColors(style, bound)), ...(el.type === 'ellipse' ? { borderRadius: '50%' } : null) }} />
);

const Text: React.FC<LeafProps> = ({ el, bound, style }) => {
  const s = withBoundColors(style, bound);
  return (
    <div style={{ ...FILL, ...boxCss({ ...s, fill: s.fill ?? undefined }), ...textCss(s), overflow: 'hidden' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{textOf(el, bound)}</span>
    </div>
  );
};

const Image: React.FC<LeafProps> = ({ el, bound, style, assetBase, onAssetError }) => {
  const raw = (el.bind?.src ? bound.src : el.src) as string | undefined;
  const primary = raw ? resolveAssetUrl(String(raw), assetBase) : '';
  const fallback = el.fallbackSrc ? resolveAssetUrl(el.fallbackSrc, assetBase) : '';
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => { setFailed(null); }, [primary]);
  const src = failed === primary ? fallback : primary;
  if (!src || (failed && failed === src)) return null; // broken + no fallback -> transparent
  const css = boxCss(style);
  if (el.type === 'video') {
    return <video src={src} autoPlay muted loop playsInline style={{ ...FILL, ...css, width: '100%', height: '100%', objectFit: (style.objectFit as any) || 'cover' }} />;
  }
  if (el.crop) {
    // Crop = show only the {x, y, w, h} fraction of the source, stretched to the box.
    const c = el.crop;
    return (
      <div style={{ ...FILL, ...css, overflow: 'hidden' }}>
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => { setFailed(src); onAssetError?.(el.id); }}
          style={{ position: 'absolute', left: `${(-c.x / c.w) * 100}%`, top: `${(-c.y / c.h) * 100}%`, width: `${100 / c.w}%`, height: `${100 / c.h}%`, maxWidth: 'none' }}
        />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={() => {
        setFailed(src);
        onAssetError?.(el.id);
      }}
      style={{
        ...FILL,
        ...css,
        width: '100%',
        height: '100%',
        objectFit: (style.objectFit as any) || (el.type === 'playerAvatar' ? 'cover' : 'contain'),
        ...(el.type === 'playerAvatar' && style.radius == null ? { borderRadius: '50%' } : null),
      }}
    />
  );
};

const Progress: React.FC<LeafProps> = ({ el, bound, style, item }) => {
  const value = Number(bound.value ?? (el.type === 'healthBar' ? item?.health : 0)) || 0;
  const max = Number(bound.max ?? el.max ?? (el.type === 'healthBar' ? item?.healthMax : 100)) || 100;
  const pct = Math.max(0, Math.min(1, value / max));
  let barColor = (bound.color as string) || (style.color as string) || undefined;
  if (!barColor && el.type === 'healthBar') barColor = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#facc15' : '#ef4444';
  const track = boxCss({ ...style, fill: bound.fill ?? style.fill ?? 'rgba(255,255,255,0.15)' });
  const vertical = el.h > el.w * 1.5;
  return (
    <div style={{ ...FILL, ...track, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: vertical ? '100%' : `${pct * 100}%`,
          height: vertical ? `${pct * 100}%` : '100%',
          background: barColor || '#facc15',
          borderRadius: track.borderRadius,
          transition: 'width 300ms ease-out, height 300ms ease-out, background 300ms',
        }}
      />
    </div>
  );
};

const svgPaint = (style: Record<string, unknown>, bound: Record<string, unknown>) => {
  const s = withBoundColors(style, bound);
  return {
    fill: (s.fill as string) ?? 'none',
    stroke: (s.stroke as string) ?? (s.fill ? 'none' : '#ffffff'),
    strokeWidth: Number((s as Record<string, unknown>).strokeWidth ?? (s.stroke ? 1 : 2)),
  };
};

const Svg: React.FC<LeafProps> = ({ el, bound, style }) => {
  const paint = svgPaint(style, bound);
  // Paint via style (not attributes) so animated colors (CSS variables) work.
  const common = { style: { fill: paint.fill, stroke: paint.stroke, strokeWidth: paint.strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }, vectorEffect: 'non-scaling-stroke' as const };
  return (
    <svg
      width={el.w}
      height={el.h}
      // `vb` = the box the path was drawn in: the shape then scales with the element instead of being cropped.
      viewBox={el.vb ? `0 0 ${el.vb[0]} ${el.vb[1]}` : `0 0 ${Math.max(el.w, 1)} ${Math.max(el.h, 1)}`}
      preserveAspectRatio={el.vb ? 'none' : undefined}
      style={{ ...FILL, overflow: 'visible', filter: boxCss(style).filter }}
    >
      {el.type === 'line' && <line x1={0} y1={0} x2={el.w} y2={el.h} vectorEffect="non-scaling-stroke" style={{ ...common.style, fill: 'none', stroke: paint.stroke === 'none' ? (paint.fill as string) : paint.stroke }} />}
      {el.type === 'polygon' && <polygon points={(el.points || []).map((p) => p.join(',')).join(' ')} {...common} />}
      {el.type === 'path' && <path d={el.d} {...common} />}
    </svg>
  );
};

/** Curated icon set (names are ids in the layout; unknown -> nothing). */
export const ICONS: Record<string, React.ComponentType<{ size?: number | string; color?: string }>> = {
  skull: Fa.FaSkull, crosshair: Fa.FaCrosshairs, heart: Fa.FaHeart, heartbeat: Fa.FaHeartbeat, trophy: Fa.FaTrophy,
  star: Fa.FaStar, users: Fa.FaUsers, user: Fa.FaUser, clock: Fa.FaClock, pin: Fa.FaMapMarkerAlt, fire: Fa.FaFire,
  bolt: Fa.FaBolt, shield: Fa.FaShieldAlt, medal: Fa.FaMedal, crown: Fa.FaCrown, target: Fa.FaBullseye,
  airdrop: Fa.FaParachuteBox, car: Fa.FaCar, grenade: Fa.FaBomb, medkit: Fa.FaFirstAid, gamepad: Fa.FaGamepad,
  up: Fa.FaArrowUp, down: Fa.FaArrowDown, check: Fa.FaCheck, cross: Fa.FaTimes, circle: Fa.FaCircle, square: Fa.FaSquare,
  tv: Fa.FaTv, broadcast: Fa.FaBroadcastTower,
};

const Icon: React.FC<LeafProps> = ({ el, bound, style }) => {
  const Cmp = el.icon ? ICONS[el.icon] : undefined;
  if (!Cmp) return null;
  const color = (bound.color as string) || (style.color as string) || (style.fill as string) || '#ffffff';
  return (
    <div style={{ ...FILL, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: boxCss(style).filter }}>
      <Cmp size={Math.min(el.w, el.h)} color={color} />
    </div>
  );
};

// ── built-in theme graphic ──────────────────────────────────────────────────
// A finished Theme1-8 view (Alerts, Recall, LiveStats, …) rendered live from the
// SAME engine slices PublicThemeRenderer gives it, inside its native 1920×1080
// stage scaled to the element box. Behaviour (recall/kill/elimination logic) is
// the theme's own; the Designer adds placement, styling, masks and animation.
const BUILTIN_W = 1920;
const BUILTIN_H = 1080;

const Builtin: React.FC<LeafProps> = ({ el, scope }) => {
  const ref = el.builtin;
  const Comp = ref ? resolveComponent(ref.theme, ref.view) : null;
  if (!Comp) {
    return <div style={{ ...FILL, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fca5a5', font: '600 14px system-ui', border: '1px dashed rgba(252,165,165,0.5)' }}>
      {ref ? `${ref.theme} · ${ref.view} not found` : 'No graphic selected'}
    </div>;
  }
  const props = builtinProps(scope || {});
  return (
    <div style={{ ...FILL, overflow: 'hidden', filter: el.filter || undefined }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: BUILTIN_W, height: BUILTIN_H, transform: `scale(${el.w / BUILTIN_W}, ${el.h / BUILTIN_H})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
        <Comp {...props} />
      </div>
    </div>
  );
};

// ── the desktop minimap ─────────────────────────────────────────────────────
// Map picture, safe zone and one dot per player, all from scope.local. The
// picture is /<map id>.jpg (the desktop app ships them); without it a plain
// grid is drawn, so the element still works on the website.
const MAP_FILES: Record<string, string> = { erangle: '/erangle.jpg', erangel: '/erangle.jpg', miramar: '/miramar.jpg', rondo: '/rondo.jpg' };
const MAP_GRID = 'repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 12.5%), repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 12.5%), #1f2a1c';

const MapEl: React.FC<LeafProps> = ({ el, style, assetBase, scope }) => {
  const m = el.map || {};
  const local = scope?.local || {};
  const zone = local.zone || {};
  const players: any[] = local.players || [];
  const id = m.mapId && m.mapId !== 'auto' ? m.mapId : String(local.map || 'erangle').toLowerCase();
  const file = MAP_FILES[id] || MAP_FILES.erangle;
  const src = resolveAssetUrl(file, assetBase);
  const [failed, setFailed] = useState<string | null>(null);

  // What stays in the middle, and how far in the view is.
  let [cx, cy, zoom] = [0.5, 0.5, 1];
  if (m.follow === 'zone' && zone.known) [cx, cy, zoom] = [zone.x, zone.y, Math.min(20, Math.max(1, 0.5 / Math.max(0.01, zone.r * 1.2)))];
  if (m.follow === 'observed' && local.observed?.hasPosition) [cx, cy, zoom] = [local.observed.x, local.observed.y, m.zoom || 6];
  const side = Math.min(el.w, el.h) * zoom;
  // Never show past the edge of the map when it is larger than the box.
  const place = (c: number, box: number) => (side <= box ? (box - side) / 2 : Math.min(0, Math.max(box - side, box / 2 - c * side)));
  const dot = m.dotSize || 14;
  const showDead = m.showDead === true;
  const r = zone.r * 1000;

  return (
    <div style={{ ...FILL, ...boxCss(style), overflow: 'hidden', background: (style.fill as string) || '#0b0f0a' }}>
      <div style={{ position: 'absolute', left: place(cx, el.w), top: place(cy, el.h), width: side, height: side, transition: 'left 0.6s linear, top 0.6s linear, width 0.6s linear, height 0.6s linear', background: failed === src ? MAP_GRID : undefined }}>
        {failed !== src && <img src={src} alt="" draggable={false} onError={() => setFailed(src)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />}
        {m.showZone !== false && zone.known && (
          <svg viewBox="0 0 1000 1000" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <path fillRule="evenodd" fill="rgba(40,110,255,0.28)" d={'M0,0 H1000 V1000 H0 Z M ' + (zone.x * 1000 - r) + ',' + zone.y * 1000 + ' a ' + r + ',' + r + ' 0 1,0 ' + r * 2 + ',0 a ' + r + ',' + r + ' 0 1,0 ' + -r * 2 + ',0 Z'} />
            <circle cx={zone.x * 1000} cy={zone.y * 1000} r={r} fill="none" stroke="#3fa9ff" strokeWidth={3 / zoom + 1} />
            {zone.hasNext && <circle cx={zone.nextX * 1000} cy={zone.nextY * 1000} r={zone.nextR * 1000} fill="none" stroke="#ffffff" strokeWidth={3 / zoom + 1} strokeDasharray="12 10" />}
          </svg>
        )}
        {players.map((p) => {
          if (!p.hasPosition || (p.dead && !showDead)) return null;
          const size = p.observed ? dot * 1.5 : dot;
          return (
            <div key={p.uId} style={{ position: 'absolute', left: p.x * 100 + '%', top: p.y * 100 + '%', width: 0, height: 0, transition: 'left 0.5s linear, top 0.5s linear', zIndex: p.observed ? 2 : 1 }}>
              <div
                style={{
                  position: 'absolute', left: -size / 2, top: -size / 2, width: size, height: size, borderRadius: '50%', boxSizing: 'border-box',
                  background: p.dead ? '#6b7280' : p.color, opacity: p.dead ? 0.6 : 1,
                  border: Math.max(1, size * 0.14) + 'px solid ' + (p.observed ? '#fde047' : p.knocked ? '#ef4444' : '#ffffff'),
                }}
              />
              {m.showNames && !p.dead && (
                <div style={{ position: 'absolute', left: size / 2 + 3, top: -size / 2, whiteSpace: 'nowrap', fontSize: Math.max(9, size * 0.8), lineHeight: size + 'px', fontWeight: 700, color: '#ffffff', textShadow: '0 1px 2px #000, 0 0 3px #000', fontFamily: (style.fontFamily as string) || undefined }}>
                  {p.teamTag ? p.teamTag + ' ' : ''}{p.playerName}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── registry ────────────────────────────────────────────────────────────────
const registry: Record<string, React.ComponentType<LeafProps>> = {
  rect: Rect,
  ellipse: Rect,
  text: Text,
  image: Image,
  teamLogo: Image,
  playerAvatar: Image,
  flag: Image,
  video: Image,
  progress: Progress,
  healthBar: Progress,
  line: Svg,
  polygon: Svg,
  path: Svg,
  icon: Icon,
  builtin: Builtin,
  map: MapEl,
};

/** Plug in a new leaf element type (its schema entry must be added to layoutSchema.js too). */
export function registerElement(type: string, component: React.ComponentType<LeafProps>): void {
  registry[type] = component;
}

export function leafComponent(type: string): React.ComponentType<LeafProps> | undefined {
  return registry[type];
}
