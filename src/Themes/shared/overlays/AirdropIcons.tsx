// Drawn icons for the Airdrop Info overlay: one shape per item kind
// (airdropItems.ts `icon`), so a vest shows a vest, a sniper a sniper rifle,
// a scope its zoom, armour its level. Light tones, drawn for the overlay's
// dark card. Guns are 2:1 (viewBox 200×80), everything else square (80×80).
// An item with `image` set uses that picture instead.

import React from 'react';
import { airdropItem, type AirdropIconKind } from '../airdropItems.ts';

const METAL = '#d9dde2';
const STEEL = '#8b9097';
const DARK = '#50555c';
const BRASS = '#d9b04f';
const COPPER = '#b8763a';
const OLIVE = '#8f9a72';
const OLIVE_LIGHT = '#b3bd93';
const OLIVE_DARK = '#6f7957';
const RED = '#d63a3a';

type Draw = (accent: string) => React.ReactNode;

/** Perceived brightness 0–255 of #rgb / #rrggbb; null for anything else. */
function brightness(color: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Black or white, whichever reads better on `bg` (anything unparseable -> black). */
export function readableOn(bg: string): string {
  const b = brightness(bg);
  return b == null || b > 150 ? '#000' : '#fff';
}

/** True for white / near-white colours (they vanish on a white label). */
export const isNearWhite = (color: string): boolean => (brightness(color) ?? 0) > 225;

// ── Guns (viewBox 0 0 200 80) ───────────────────────────────────────────────
const barrel = (x: number, len: number, y = 33, h = 5, brake = 8) => (
  <>
    <rect x={x} y={y} width={len} height={h} fill={STEEL} />
    <rect x={x + len - 2} y={y - 2} width={brake} height={h + 4} rx={1} fill={METAL} />
  </>
);
const scopeOnTop = (x: number, w: number, y = 14) => (
  <>
    <rect x={x + 10} y={y + 9} width={4} height={7} fill={DARK} />
    <rect x={x + w - 16} y={y + 9} width={4} height={7} fill={DARK} />
    <rect x={x} y={y + 1} width={8} height={11} rx={2} fill={STEEL} />
    <rect x={x + 6} y={y + 2} width={w - 14} height={9} rx={4} fill={DARK} />
    <rect x={x + w - 10} y={y - 2} width={10} height={15} rx={2} fill={STEEL} />
  </>
);
const grip = (x: number, y: number) => <polygon points={`${x},${y} ${x + 12},${y} ${x + 8},${y + 16} ${x - 4},${y + 16}`} fill={DARK} />;

const GUNS: Partial<Record<AirdropIconKind, Draw>> = {
  ar: (a) => (
    <>
      <polygon points="4,30 40,26 40,46 10,54 4,52" fill={DARK} />
      <rect x={40} y={24} width={80} height={20} rx={2} fill={METAL} />
      <rect x={50} y={20} width={60} height={4} fill={STEEL} />
      {grip(62, 44)}
      <polygon points="84,44 98,44 102,66 90,68" fill={DARK} />
      <rect x={120} y={26} width={44} height={14} fill={STEEL} />
      {barrel(164, 26)}
      <rect x={40} y={41} width={80} height={3} fill={a} />
    </>
  ),
  bullpup: (a) => (
    <>
      <polygon points="6,30 30,28 30,52 8,56 6,54" fill={DARK} />
      <rect x={30} y={26} width={96} height={22} rx={3} fill={METAL} />
      <polygon points="44,48 60,48 62,68 48,70" fill={DARK} />
      {grip(88, 48)}
      <path d="M50 26 L54 14 L116 14 L120 26" stroke={STEEL} strokeWidth={5} fill="none" />
      <rect x={126} y={28} width={36} height={16} fill={STEEL} />
      {barrel(162, 28)}
      <rect x={30} y={45} width={96} height={3} fill={a} />
    </>
  ),
  // Groza: short bullpup, curved AK magazine behind the grip, top rail, no carry handle.
  groza: (a) => (
    <>
      <polygon points="10,30 30,28 30,50 12,54 10,52" fill={DARK} />
      <rect x={30} y={26} width={84} height={22} rx={3} fill={METAL} />
      <rect x={60} y={21} width={52} height={5} fill={STEEL} />
      {[64, 72, 80, 88, 96, 104].map((x) => <rect key={x} x={x} y={19} width={3} height={2} fill={STEEL} />)}
      <path d="M40 48 L56 48 Q58 60 66 70 L54 74 Q44 62 40 48 Z" fill={DARK} />
      {grip(84, 48)}
      <rect x={114} y={29} width={30} height={15} rx={2} fill={STEEL} />
      {barrel(144, 40, 33, 5, 10)}
      <rect x={30} y={45} width={84} height={3} fill={a} />
    </>
  ),
  smg: (a) => (
    <>
      <path d="M20 34 Q20 22 34 22 L150 22 Q162 22 164 32 L166 46 Q166 56 154 56 L118 56 L108 66 L90 66 L96 56 L40 56 Q20 56 20 44 Z" fill={METAL} />
      <ellipse cx={46} cy={42} rx={10} ry={6} fill="#0b0b0d" />
      <ellipse cx={104} cy={47} rx={7} ry={4} fill="#0b0b0d" />
      <rect x={44} y={14} width={104} height={8} rx={2} fill={a} opacity={0.85} />
      {barrel(166, 22, 34, 6, 6)}
    </>
  ),
  sniper: (a) => (
    <>
      <polygon points="4,34 46,32 52,40 46,54 30,50 12,58 4,56" fill={DARK} />
      <ellipse cx={30} cy={44} rx={6} ry={4} fill="#0b0b0d" />
      <rect x={46} y={32} width={60} height={12} rx={2} fill={METAL} />
      <rect x={74} y={44} width={12} height={10} fill={STEEL} />
      {grip(56, 44)}
      <circle cx={98} cy={47} r={3} fill={STEEL} />
      {barrel(106, 84, 35, 4, 10)}
      {scopeOnTop(52, 70, 14)}
      <rect x={46} y={41} width={60} height={3} fill={a} />
    </>
  ),
  dmr: (a) => (
    <>
      <polygon points="4,30 44,28 44,48 12,56 4,54" fill={DARK} />
      <rect x={44} y={28} width={76} height={16} rx={2} fill={METAL} />
      <rect x={84} y={44} width={14} height={18} fill={DARK} />
      {grip(60, 44)}
      <rect x={120} y={30} width={40} height={12} fill={STEEL} />
      {barrel(160, 30, 34, 4, 8)}
      {scopeOnTop(56, 54, 12)}
      <rect x={44} y={41} width={76} height={3} fill={a} />
    </>
  ),
  lmg: (a) => (
    <>
      <polygon points="4,32 34,28 34,50 8,56 4,54" fill={DARK} />
      <rect x={34} y={26} width={70} height={22} rx={2} fill={METAL} />
      <rect x={40} y={22} width={56} height={4} fill={STEEL} />
      <rect x={104} y={29} width={66} height={14} fill={STEEL} />
      {[112, 122, 132, 142, 152, 162].map((x) => <circle key={x} cx={x} cy={36} r={3} fill="#0b0b0d" />)}
      {barrel(170, 20, 33, 5, 8)}
      <rect x={56} y={48} width={24} height={16} rx={2} fill={a} />
      {grip(86, 48)}
      <path d="M160 43 L150 66 M160 43 L170 66" stroke={DARK} strokeWidth={3} />
    </>
  ),
  amr: (a) => (
    <>
      <polygon points="4,32 48,30 54,40 48,56 30,52 12,60 4,58" fill={DARK} />
      <rect x={48} y={30} width={66} height={16} rx={2} fill={METAL} />
      <rect x={78} y={46} width={14} height={12} fill={STEEL} />
      {grip(58, 46)}
      <rect x={114} y={34} width={68} height={7} fill={STEEL} />
      <rect x={178} y={29} width={18} height={17} rx={2} fill={METAL} />
      <rect x={182} y={32} width={3} height={11} fill="#0b0b0d" />
      <rect x={188} y={32} width={3} height={11} fill="#0b0b0d" />
      {scopeOnTop(56, 72, 12)}
      <path d="M150 41 L140 66 M150 41 L160 66" stroke={DARK} strokeWidth={3} />
      <rect x={48} y={43} width={66} height={3} fill={a} />
    </>
  ),
};

// ── Everything else (viewBox 0 0 80 80) ─────────────────────────────────────
const bullet = (x: number, w: number, top: number, tip: number) => (
  <g key={x}>
    <rect x={x} y={top} width={w} height={70 - top} rx={1} fill={BRASS} />
    <rect x={x} y={64} width={w} height={4} fill="#a8862f" />
    <polygon points={`${x},${top} ${x + w},${top} ${x + w / 2},${tip}`} fill={COPPER} />
  </g>
);

const ITEMS: Partial<Record<AirdropIconKind, Draw>> = {
  ammo: () => <>{[16, 34, 52].map((x) => bullet(x, 12, 36, 18))}</>,
  ammoLarge: () => <>{[22, 44].map((x) => bullet(x, 14, 30, 6))}</>,
  vest: (a) => (
    <>
      <path d="M22 10 L33 10 Q40 20 47 10 L58 10 L64 22 L67 64 Q67 71 60 71 L20 71 Q13 71 13 64 L16 22 Z" fill={OLIVE} />
      <path d="M22 10 L33 10 Q40 20 47 10 L58 10 L60 16 Q40 30 20 16 Z" fill={OLIVE_DARK} />
      <rect x={22} y={26} width={36} height={14} rx={3} fill={OLIVE_LIGHT} />
      {[19, 34, 49].map((x) => <rect key={x} x={x} y={44} width={12} height={16} rx={2} fill={OLIVE_DARK} />)}
      <rect x={13} y={62} width={54} height={4} fill={a} />
    </>
  ),
  helmet: (a) => (
    <>
      <path d="M12 50 Q12 16 40 14 Q68 16 68 50 Z" fill={OLIVE} />
      <path d="M20 30 Q40 18 60 30" stroke={OLIVE_LIGHT} strokeWidth={3} fill="none" />
      <rect x={35} y={18} width={10} height={7} rx={1} fill={OLIVE_DARK} />
      <rect x={8} y={48} width={64} height={7} rx={3} fill={OLIVE_DARK} />
      <path d="M18 55 L28 68 M62 55 L52 68 M28 68 L52 68" stroke={DARK} strokeWidth={3} fill="none" />
      <rect x={12} y={44} width={56} height={3} fill={a} />
    </>
  ),
  backpack: (a) => (
    <>
      <rect x={20} y={8} width={4} height={14} fill={DARK} />
      <rect x={56} y={8} width={4} height={14} fill={DARK} />
      <rect x={16} y={18} width={48} height={54} rx={9} fill="#a08a5c" />
      <path d="M16 32 Q16 14 40 14 Q64 14 64 32 Z" fill="#7d6a44" />
      <rect x={24} y={42} width={32} height={24} rx={4} fill="#7d6a44" />
      <rect x={37} y={30} width={6} height={8} rx={1} fill={a} />
      <path d="M24 50 L56 50" stroke="#5c4d30" strokeWidth={2} />
    </>
  ),
  scope: () => (
    <>
      <rect x={24} y={44} width={6} height={10} fill={DARK} />
      <rect x={48} y={44} width={6} height={10} fill={DARK} />
      <rect x={14} y={32} width={46} height={14} rx={6} fill="#3d4147" />
      <polygon points="56,28 74,22 74,56 56,50" fill={STEEL} />
      <rect x={6} y={30} width={12} height={18} rx={3} fill={STEEL} />
      <rect x={33} y={24} width={10} height={8} rx={1} fill={STEEL} />
      <rect x={14} y={36} width={46} height={2} fill={METAL} opacity={0.5} />
    </>
  ),
  suppressor: () => (
    <>
      <rect x={6} y={30} width={62} height={20} rx={7} fill="#3d4147" />
      {[18, 28, 38, 48, 58].map((x) => <rect key={x} x={x} y={30} width={2} height={20} fill={STEEL} />)}
      <rect x={64} y={33} width={10} height={14} rx={3} fill={STEEL} />
      <rect x={8} y={33} width={58} height={3} fill={METAL} opacity={0.4} />
    </>
  ),
  mag: (a) => (
    <>
      <path d="M22 8 L42 8 Q44 36 52 62 L34 70 Q26 40 22 8 Z" fill="#3d4147" />
      <path d="M44 14 L60 14 Q62 38 70 60 L56 66 Q48 40 44 14 Z" fill={STEEL} />
      <rect x={30} y={68} width={22} height={5} rx={2} transform="rotate(-22 41 70)" fill={a} />
      {[20, 30, 40].map((y) => <rect key={y} x={26} y={y} width={14} height={2} fill={STEEL} />)}
    </>
  ),
  stock: () => (
    <>
      <polygon points="10,30 60,24 74,26 74,40 60,40 22,58 10,58" fill="#3d4147" />
      <rect x={6} y={28} width={7} height={32} rx={2} fill={DARK} />
      <ellipse cx={36} cy={42} rx={8} ry={5} fill="#0b0b0d" />
      <rect x={60} y={28} width={14} height={4} fill={STEEL} />
    </>
  ),
  cheekpad: () => (
    <>
      <polygon points="10,34 60,28 74,30 74,44 60,44 22,62 10,62" fill="#3d4147" />
      <rect x={6} y={32} width={7} height={32} rx={2} fill={DARK} />
      <rect x={26} y={18} width={30} height={12} rx={5} fill={OLIVE} />
      <rect x={30} y={21} width={22} height={3} fill={OLIVE_LIGHT} />
    </>
  ),
  syringe: () => (
    <g transform="rotate(-40 40 40)">
      <rect x={4} y={39} width={14} height={2} fill={STEEL} />
      <rect x={18} y={33} width={38} height={14} rx={2} fill="#e8f2f7" />
      <rect x={21} y={35.5} width={24} height={9} fill={RED} />
      {[26, 32, 38].map((x) => <rect key={x} x={x} y={33} width={1.5} height={5} fill={DARK} />)}
      <rect x={56} y={37} width={14} height={6} fill={STEEL} />
      <rect x={70} y={31} width={5} height={18} rx={1} fill={STEEL} />
    </g>
  ),
  painkiller: () => (
    <>
      <rect x={22} y={24} width={36} height={46} rx={6} fill="#f2f2f2" />
      <rect x={24} y={12} width={32} height={14} rx={3} fill={RED} />
      <rect x={22} y={38} width={36} height={18} fill="#2f6fd6" />
      <rect x={36} y={42} width={8} height={10} fill="#fff" />
      <rect x={35} y={45} width={10} height={4} fill="#fff" />
    </>
  ),
  firstaid: () => (
    <>
      <rect x={10} y={22} width={60} height={46} rx={6} fill="#e8e8e8" />
      <rect x={10} y={22} width={60} height={8} rx={4} fill="#c9c9c9" />
      <rect x={34} y={33} width={12} height={30} fill={RED} />
      <rect x={25} y={42} width={30} height={12} fill={RED} />
    </>
  ),
  medkit: () => (
    <>
      <path d="M28 24 V14 H52 V24" stroke={DARK} strokeWidth={5} fill="none" />
      <rect x={6} y={22} width={68} height={48} rx={7} fill={RED} />
      <rect x={34} y={30} width={12} height={32} fill="#fff" />
      <rect x={24} y={40} width={32} height={12} fill="#fff" />
      <rect x={6} y={58} width={68} height={3} fill="#a82626" />
    </>
  ),
  ghillie: () => (
    <>
      {/* hooded suit covered in grass strands */}
      <path d="M26 30 Q26 6 40 6 Q54 6 54 30 Z" fill="#7f9f4f" />
      <ellipse cx={40} cy={24} rx={8} ry={7} fill="#2c3a1c" />
      <path d="M18 34 Q40 24 62 34 L68 74 L12 74 Z" fill="#7f9f4f" />
      {[16, 23, 30, 37, 44, 51, 58].map((x, i) => (
        <path key={x} d={`M${x + 2} ${34 + (i % 2) * 4} l-3 38 M${x + 5} ${38 + (i % 3) * 4} l2 34`} stroke="#4f6a2b" strokeWidth={2.2} />
      ))}
      {[28, 36, 44, 52].map((x) => <path key={x} d={`M${x} 8 l-2 16`} stroke="#4f6a2b" strokeWidth={2} />)}
    </>
  ),
  item: (a) => (
    <>
      <rect x={14} y={20} width={52} height={44} rx={4} fill={STEEL} />
      <rect x={14} y={20} width={52} height={10} fill={a} />
    </>
  ),
};

interface Props {
  id: number;
  /** Height in px; guns are drawn twice as wide. */
  size: number;
  accent: string;
  /** Leave out the Lv. / zoom badge (when the text next to it already says it). */
  hideBadge?: boolean;
}

/** The item's icon (drawn, or its `image` when one is set), with level / zoom badges. */
const AirdropIcon: React.FC<Props> = ({ id, size, accent, hideBadge }) => {
  const item = airdropItem(id);
  const gun = !!GUNS[item.icon];
  const w = gun ? size * 2 : size;
  if (item.image) {
    return <img src={item.image} alt={item.name} style={{ width: w, height: size, objectFit: 'contain', display: 'block' }} />;
  }
  const draw = (gun ? GUNS[item.icon] : ITEMS[item.icon]) || ITEMS.item!;
  const badge = hideBadge ? undefined : item.level ? `Lv.${item.level}` : item.zoom;
  return (
    <svg
      width={w}
      height={size}
      viewBox={gun ? '0 0 200 80' : '0 0 80 80'}
      role="img"
      aria-label={item.name}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {draw(accent)}
      {badge ? (
        <g>
          <rect x={gun ? 160 : 46} y={gun ? 60 : 60} width={32} height={18} rx={3} fill={accent} />
          <text
            x={gun ? 176 : 62}
            y={gun ? 73.5 : 73.5}
            textAnchor="middle"
            fontSize={13}
            fontWeight={700}
            fontFamily="Arial, sans-serif"
            fill={readableOn(accent)}
          >
            {badge}
          </text>
        </g>
      ) : null}
    </svg>
  );
};

export default AirdropIcon;
