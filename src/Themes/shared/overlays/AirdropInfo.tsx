// Airdrop Info — one overlay for every theme (dashboard view key
// 'AirdropInfo'), on the 1920×1080 canvas, left-hand side.
//
// When a crate lands, one panel slides in from the left with what's inside
// it, stays POP_MS, then slides out to the right. Nothing is on screen
// between drops. The panel reads top to bottom:
//   [ ▲ AIRDROP | 05 ]          white label + theme-coloured crate number
//   gun icon  GUN NAME          the gun, large, with its ammo
//             ×60 7.62MM
//   ─ scope / attachments / meds / outfit, one line each
//   ─ LEVEL 3 GEAR  vest helmet backpack (they come in every crate)
//
// While there is no real crate (loading, relay not reached yet, before the
// match's first drop, dashboard previews) a DEMO SESSION plays: demo crates
// land one by one on a loop. The first real crate replaces it.
//
// Data: useLocalAirdrops (relay /local/airdrops, local only).

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocalAirdrops, AIRDROP_DEMO_CRATES, type AirdropCrate } from '../hooks/useLocalAirdrops.ts';
import { airdropItem, CATEGORY_ORDER } from '../airdropItems.ts';
import AirdropIcon, { readableOn, isNearWhite } from './AirdropIcons';

const POP_MS = 12_000;
/** Demo session: a crate lands every DEMO_STEP_MS, its panel stays DEMO_POP_MS. */
export const DEMO_STEP_MS = 10_000;
export const DEMO_POP_MS = 6_000;
const FONT = 'AGENCYB, "Arial Narrow", Arial, sans-serif';
const PANEL_W = 500;
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface Props {
  tournament: { primaryColor?: string; secondaryColor?: string } | any;
  /** Unused today; kept so every theme view gets the same props. */
  matchData?: unknown;
}

/** Items of a crate, gun first, armour last. */
function sortItems(items: AirdropCrate['items']) {
  return [...items].sort(
    (a, b) => CATEGORY_ORDER.indexOf(airdropItem(a.id).category) - CATEGORY_ORDER.indexOf(airdropItem(b.id).category),
  );
}

/** The demo session's position: which demo crate is current, and whether its panel is up. */
function useDemoClock(on: boolean): { index: number; popping: boolean } {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const started = Date.now();
    setT(0);
    const timer = window.setInterval(() => setT(Date.now() - started), 500);
    return () => window.clearInterval(timer);
  }, [on]);
  const inCycle = t % (DEMO_STEP_MS * AIRDROP_DEMO_CRATES.length);
  return { index: Math.floor(inCycle / DEMO_STEP_MS), popping: inCycle % DEMO_STEP_MS < DEMO_POP_MS };
}

const AirdropInfo: React.FC<Props> = ({ tournament }) => {
  const primary = tournament?.primaryColor || '#E7A801';
  const { crates: realCrates, matchSeq, loaded } = useLocalAirdrops();

  const demo = realCrates.length === 0;
  const demoClock = useDemoClock(demo);

  // ── Show a real crate when it arrives (not one already there on load) ────
  const realNewest = realCrates[realCrates.length - 1];
  const realNewestKey = realNewest ? `${matchSeq}:${realNewest.id}` : '';
  const [popKey, setPopKey] = useState('');
  const seenKey = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded) return undefined;
    if (seenKey.current === null) {
      seenKey.current = realNewestKey; // first relay answer: nothing new yet
      return undefined;
    }
    if (!realNewestKey || realNewestKey === seenKey.current) return undefined;
    seenKey.current = realNewestKey;
    setPopKey(realNewestKey);
    const t = window.setTimeout(() => setPopKey(''), POP_MS);
    return () => window.clearTimeout(t);
  }, [loaded, realNewestKey]);

  const shown = demo
    ? (demoClock.popping ? AIRDROP_DEMO_CRATES[demoClock.index] : undefined)
    : (popKey && popKey === realNewestKey ? realNewest : undefined);

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'hidden', pointerEvents: 'none', fontFamily: FONT, color: '#fff' }}>
      <AnimatePresence>
        {shown && (
          <motion.div
            key={`${demo ? 'demo' : matchSeq}-${shown.id}`}
            initial={{ x: -PANEL_W - 40 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 140, opacity: 0, transition: { duration: 0.45, ease: [0.55, 0, 0.75, 0.2] } }}
            transition={{ duration: 0.6, ease: EASE }}
            style={{ position: 'absolute', left: 0, top: 250, width: PANEL_W }}
          >
            <AirdropPanel crate={shown} primary={primary} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** A small parachute: the airdrop mark next to the label. */
const Chute: React.FC<{ color: string }> = ({ color }) => (
  <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
    <path d="M2 11 Q12 -1 22 11 Q19 9 17 11 Q14.5 9 12 11 Q9.5 9 7 11 Q5 9 2 11 Z" fill={color} />
    <path d="M2.5 11 L10.5 18 M21.5 11 L13.5 18 M12 11 L12 18" stroke={color} strokeWidth={1.2} />
    <rect x={9.5} y={18} width={5} height={4.5} fill={color} />
  </svg>
);

/** One line of the panel, revealed after the panel has slid in (staggered). */
const Line: React.FC<{ i: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ i, children, style }) => (
  <motion.div
    initial={{ opacity: 0, x: -24 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.35, delay: 0.35 + i * 0.07, ease: EASE }}
    style={style}
  >
    {children}
  </motion.div>
);

const DARK_BG = 'rgba(12,12,14,0.86)';

/** What's in the crate. Exported for previews/tests. */
export const AirdropPanel: React.FC<{ crate: AirdropCrate; primary: string }> = ({ crate, primary }) => {
  const items = sortItems(crate.items);
  const gun = items.find((i) => airdropItem(i.id).category === 'gun');
  const ammo = items.find((i) => airdropItem(i.id).category === 'ammo');
  const armor = items.filter((i) => airdropItem(i.id).category === 'armor');
  const rest = items.filter((i) => i !== gun && i !== ammo && !armor.includes(i));
  const onPrimary = readableOn(primary);
  let line = 0;
  // A white theme colour would vanish next to the white AIRDROP label: use ink instead.
  const numberBg = isNearWhite(primary) ? '#0c0c0e' : primary;
  const numberInk = isNearWhite(primary) ? '#fff' : onPrimary;

  return (
    <div style={{ width: PANEL_W, color: '#fff', fontFamily: FONT }}>
      {/* Label: white AIRDROP tag + theme-coloured crate number */}
      <div style={{ display: 'flex', alignItems: 'stretch', height: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', color: '#0c0c0e', padding: '0 18px 0 22px', fontSize: 30, letterSpacing: 6 }}>
          <Chute color={numberBg} />
          AIRDROP
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', background: numberBg, color: numberInk,
            padding: '0 26px 0 16px', fontSize: 34, letterSpacing: 2,
            clipPath: 'polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)',
          }}
        >
          {String(crate.id).padStart(2, '0')}
        </div>
      </div>

      {/* The gun */}
      {gun && (
        <Line i={line++} style={{ display: 'flex', alignItems: 'center', gap: 18, background: DARK_BG, padding: '18px 22px 16px', borderLeft: `4px solid ${primary}` }}>
          <AirdropIcon id={gun.id} size={78} accent={primary} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 50, lineHeight: 0.95, letterSpacing: 1 }}>{airdropItem(gun.id).name.toUpperCase()}</div>
            {ammo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ background: '#fff', color: '#0c0c0e', fontSize: 18, padding: '1px 7px' }}>×{ammo.count}</span>
                <span style={{ fontSize: 20, opacity: 0.8, letterSpacing: 1 }}>{airdropItem(ammo.id).name.toUpperCase()}</span>
              </div>
            )}
          </div>
        </Line>
      )}

      {/* Everything else, one line each */}
      {rest.map((it, k) => (
        <Line
          key={`${it.id}-${k}`}
          i={line++}
          style={{ display: 'flex', alignItems: 'center', gap: 14, background: DARK_BG, padding: '6px 22px', borderLeft: `4px solid ${primary}`, borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          <AirdropIcon id={it.id} size={40} accent={primary} hideBadge />
          <span style={{ flex: 1, fontSize: airdropItem(it.id).name.length > 24 ? 19 : 23, letterSpacing: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {airdropItem(it.id).name.toUpperCase()}
          </span>
          {it.count > 1 && <span style={{ background: '#fff', color: '#0c0c0e', fontSize: 18, padding: '1px 7px' }}>×{it.count}</span>}
        </Line>
      ))}

      {/* Lv.3 vest / helmet / backpack on one line */}
      {armor.length > 0 && (
        <Line
          i={line++}
          style={{ display: 'flex', alignItems: 'center', gap: 12, background: DARK_BG, padding: '6px 22px', borderLeft: `4px solid ${primary}`, borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span style={{ flex: 1, fontSize: 24, letterSpacing: 1 }}>
            LEVEL {Math.max(...armor.map((a) => airdropItem(a.id).level || 0)) || ''} GEAR
          </span>
          {armor.map((a, k) => (
            <span key={`${a.id}-${k}`} title={airdropItem(a.id).name} aria-label={airdropItem(a.id).name} style={{ display: 'flex' }}>
              <AirdropIcon id={a.id} size={42} accent={primary} hideBadge />
            </span>
          ))}
        </Line>
      )}

      {/* Theme-colour base line that draws in last */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.5, delay: 0.35 + line * 0.07, ease: EASE }}
        style={{ height: 4, background: primary, transformOrigin: 'left' }}
      />
    </div>
  );
};

export default AirdropInfo;
