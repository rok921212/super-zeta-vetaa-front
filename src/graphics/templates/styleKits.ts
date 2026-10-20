// Style kits: one-click looks for a whole design. A kit only replaces the
// layout theme (colours, fonts, corner radius); every template and every
// layer whose colour or font is a theme token (`{ ref: 'theme.colors.*' }`,
// `theme.typography.*`) follows it, so any starter template can wear any kit,
// and the user's own fixed colours are never touched.
//
// The palettes are original, written for PUBG Mobile broadcast use: a strong
// primary, a quieter secondary, one accent for highlights (kills, leaders,
// Smash Point trim), readable text on dark surfaces. No event's branding is
// copied. Fonts are only ones every page already loads (renderer/fonts.ts).

import type { LayoutDocument } from '../schema/layoutTypes.ts';
import { fontValue } from '../renderer/fonts.ts';

export interface StyleKit {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string; secondary: string; accent: string; background: string; surface: string;
    text: string; muted: string; success: string; danger: string;
  };
  font: string;
  headingFont: string;
  radius: number;
}

const kit = (k: StyleKit) => k;

export const STYLE_KITS: StyleKit[] = [
  kit({
    id: 'minimal-pro', name: 'Minimal Professional', description: 'Graphite panels, one red accent, square corners. Fits any sponsor.',
    colors: { primary: '#d7263d', secondary: '#1b1e24', accent: '#f4f4f5', background: '#0d0f12', surface: '#1b1e24', text: '#ffffff', muted: '#9aa1ab', success: '#2fbf71', danger: '#e5484d' },
    font: 'Bebas Neue', headingFont: 'Bebas Neue', radius: 2,
  }),
  kit({
    id: 'purple-premium', name: 'Purple Premium', description: 'Deep violet to indigo with gold highlights: a finals-night look.',
    colors: { primary: '#5b2bd6', secondary: '#24124f', accent: '#e9b949', background: '#0e0820', surface: '#1c1238', text: '#ffffff', muted: '#b7a9de', success: '#3ccf91', danger: '#f0506e' },
    font: 'Bebas Neue', headingFont: 'Anton', radius: 6,
  }),
  kit({
    id: 'red-black', name: 'Red and Black Competitive', description: 'Hard red on black, heavy type. Loud and fast for live action.',
    colors: { primary: '#e10600', secondary: '#141414', accent: '#ffffff', background: '#000000', surface: '#161616', text: '#ffffff', muted: '#a3a3a3', success: '#22c55e', danger: '#ff3b30' },
    font: 'Anton', headingFont: 'Anton', radius: 0,
  }),
  kit({
    id: 'white-blue', name: 'White and Blue Broadcast', description: 'Clean white cards with a broadcast blue band. Daytime and studio shows.',
    colors: { primary: '#1463ff', secondary: '#0b2a6b', accent: '#00c2ff', background: '#f3f6fb', surface: '#ffffff', text: '#0b1324', muted: '#5b6b86', success: '#16a34a', danger: '#dc2626' },
    font: 'Bebas Neue', headingFont: 'Bebas Neue', radius: 8,
  }),
  kit({
    id: 'dark-tactical', name: 'Dark Tactical', description: 'Olive and gunmetal with a signal-orange accent, like a field HUD.',
    colors: { primary: '#5f6f3a', secondary: '#20241c', accent: '#ff8a00', background: '#0c0e0b', surface: '#1a1d17', text: '#eef0e6', muted: '#9ba390', success: '#7bc950', danger: '#ff5a36' },
    font: 'AGENCYB', headingFont: 'AGENCYB', radius: 1,
  }),
  kit({
    id: 'gold-championship', name: 'Gold Championship', description: 'Black and warm gold for champion reveals, MVP and grand finals.',
    colors: { primary: '#c9a54c', secondary: '#1a1406', accent: '#f1d27a', background: '#080705', surface: '#17130a', text: '#fff8e6', muted: '#bfae86', success: '#4cc38a', danger: '#e5533d' },
    font: 'Bebas Neue', headingFont: 'Anton', radius: 4,
  }),
  kit({
    id: 'clean-stats', name: 'Clean Statistics', description: 'Neutral slate and teal: easy to read in dense tables and standings.',
    colors: { primary: '#0ea5a4', secondary: '#1e293b', accent: '#facc15', background: '#0b1220', surface: '#162033', text: '#f8fafc', muted: '#94a3b8', success: '#22c55e', danger: '#ef4444' },
    font: 'Bebas Neue', headingFont: 'Bebas Neue', radius: 6,
  }),
  kit({
    id: 'neon-hud', name: 'Live Match HUD', description: 'Cyan and magenta on near-black: high contrast for small in-game HUD parts.',
    colors: { primary: '#00d1ff', secondary: '#101826', accent: '#ff2e88', background: '#05070c', surface: '#0f1622', text: '#ffffff', muted: '#8aa0b8', success: '#2ee59d', danger: '#ff4d6d' },
    font: 'Righteous', headingFont: 'Righteous', radius: 10,
  }),
];

export const styleKit = (id: string | null | undefined): StyleKit | null => STYLE_KITS.find((k) => k.id === id) ?? null;

/** The theme a kit gives a design. Theme keys a kit does not set (custom ones the user added) are kept. */
export function themeWithKit(theme: LayoutDocument['theme'], k: StyleKit): LayoutDocument['theme'] {
  return {
    ...theme,
    colors: { ...(theme?.colors || {}), ...k.colors },
    typography: { ...(theme?.typography || {}), fontFamily: fontValue(k.font), headingFamily: fontValue(k.headingFont) },
    radius: k.radius,
  };
}

/**
 * The tournament's own colours as a theme: primary and secondary from the
 * tournament, the rest from the current theme. Null when the tournament has
 * no colours set.
 */
export function themeFromTournament(theme: LayoutDocument['theme'], tournament: { primaryColor?: string; secondaryColor?: string } | null | undefined): LayoutDocument['theme'] | null {
  const ok = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c.trim());
  if (!tournament || (!ok(tournament.primaryColor) && !ok(tournament.secondaryColor))) return null;
  return {
    ...theme,
    colors: {
      ...(theme?.colors || {}),
      ...(ok(tournament.primaryColor) ? { primary: tournament.primaryColor.trim() } : null),
      ...(ok(tournament.secondaryColor) ? { secondary: tournament.secondaryColor.trim() } : null),
    },
  };
}
