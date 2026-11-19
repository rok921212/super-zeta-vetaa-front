/* ============================================================================
   THEME8 · "DATUM" — design tokens
   ----------------------------------------------------------------------------
   A measurement-instrument / broadcast-schematic shell language. Plain module:
   consts + pure helpers, NO React context, NO provider.

   Rules this file encodes:
   - Brand colour (tournament.primaryColor / secondaryColor) is a MARKING —
     edges, ticks, brackets, crosshairs — never a panel fill.
   - Surfaces are flat charcoal scrims.
   - One chamfer, one diagonal pair (top-left + bottom-right).
   - Ticked rails replace bars/gauges.
   - Gold ramp survives ONLY as a "winner" marker; silver ONLY as the champion
     name plate; yellow-300/400 ONLY as live-value emphasis.
   - Every existing brand-gradient fallback contract is preserved (see brand()).
   ========================================================================== */

export const CUT = 24;                // px — single chamfer size
export const RAIL_TICK_GAP = 16;      // px between minor ticks
export const RAIL_MAJOR_EVERY = 4;    // every Nth tick is a major tick

/* flat surface scrims — replace the 135deg brand-gradient fills */
export const SCRIM = 'rgba(11,11,12,0.90)';
export const SCRIM_2 = 'rgba(16,16,19,0.86)';
export const SCRIM_SOLID = 'rgba(9,9,10,0.96)';
export const ROW_ALT = 'rgba(255,255,255,0.04)';
export const HAIRLINE = 'rgba(255,255,255,0.16)';
export const HAIRLINE_SOFT = 'rgba(255,255,255,0.08)';

/* preserved palette anchors — DO NOT introduce a new hue */
export const GOLD_RAMP = ['#FFD700', '#FFA500', '#FFC300', '#FFA500', '#FFD700'];
export const GOLD = '#FFD700';
export const SILVER_RAMP = ['#cdcdcd', '#fbfbfb', '#afafaf']; // champion plate only
export const YELLOW_LIVE = '#FDE047';   // tailwind yellow-300 — live emphasis
export const YELLOW_LIVE_2 = '#FACC15'; // tailwind yellow-400

export const TEXT = '#FFFFFF';
export const TEXT_DIM = '#8A8A93';
export const TEXT_MUTE = 'rgba(255,255,255,0.55)';

/* motion */
export const EASE_IN = 'cubic-bezier(0.16, 1, 0.3, 1)';    // firm decel — entrances
export const EASE_STEP = 'cubic-bezier(0.87, 0, 0.13, 1)'; // near-step — row reindex
export const DUR_IN = 260;      // ms
export const DUR_OUT = 200;     // ms
export const DUR_REORDER = 420; // ms

/* type — all faces already @font-face-registered in front/src/index.css,
   except the system mono stack which needs no asset */
export const FONT_DISPLAY = "'Tungsten', 'Bebas', 'Bebas Neue', sans-serif";
export const FONT_LABEL = "'AGENCYB', 'Unisans', sans-serif";
export const FONT_MONO = 'ui-monospace, "Cascadia Mono", "SF Mono", Consolas, monospace';

/* ---------------------------------------------------------------------------
   brand() — the ONLY place brand colour touches the shell. Resolves the
   runtime accent against the exact fallback each original component used:
     'default' -> #000 / #333   (every on/off-screen component)
     'frags'   -> #333 / #666   (Theme1 LiveFrags.tsx)
     'alert'   -> #FF0000 / #CC0000 (Theme1 Alerts.tsx dynamicGradient)
   ------------------------------------------------------------------------- */
export type BrandFallback = 'default' | 'frags' | 'alert';

const FALLBACKS: Record<BrandFallback, [string, string]> = {
  default: ['#000', '#333'],
  frags: ['#333', '#666'],
  alert: ['#FF0000', '#CC0000'],
};

export function brand(
  primary?: string | null,
  secondary?: string | null,
  fb: BrandFallback = 'default',
): { primary: string; secondary: string } {
  const [p, s] = FALLBACKS[fb];
  return { primary: primary || p, secondary: secondary || s };
}

/* single-chamfer silhouette — top-left + bottom-right corners cut */
export function chamfer(cut: number = CUT): string {
  return `polygon(${cut}px 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%, 0 ${cut}px)`;
}

/* broadcast slug — "PMWL  /  GRANDFINALS  /  M12" */
export function slug(
  tournament?: { tournamentName?: string } | null,
  round?: { roundName?: string } | null,
  match?: { matchNo?: number; _matchNo?: number } | null,
): string {
  const t =
    (tournament?.tournamentName || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() ||
    'MATCH';
  const r = (round?.roundName || '').toUpperCase() || '—';
  const m = match?.matchNo ?? match?._matchNo;
  return [t, r, m != null ? `M${m}` : 'M—'].join('  /  ');
}
