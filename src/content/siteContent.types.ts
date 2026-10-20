// Shape of front/public/content/site.json — every piece of text on the home
// page. The JSON is fetched at runtime (useSiteContent.ts), so editing it needs
// no rebuild; these types only catch typos in the code that reads it.

export interface Link { label: string; href: string }

export interface PlanPrice { amount: string; period: string }
export type Billing = 'monthly' | 'yearly';

export interface Plan {
  id: string;
  name: string;
  tagline?: string;
  badge?: string;
  highlight?: boolean;
  price: Record<Billing, PlanPrice>;
  features: string[];
  cta: Link;
}

export interface SimStepText { title: string; hint: string }
export type SimStepId = 'tournament' | 'round' | 'teams' | 'theme' | 'overlays' | 'live';

export interface DesktopToolText { key: string; label: string; hint: string }

/** The theme picker shown before the simulation starts. */
export interface ThemePickText {
  title: string;
  hint: string;
  /** "{theme}" is replaced with the picked theme's name. */
  start: string;
  previewLabel: string;
  /** Optional names / one-liners per built-in theme ("Theme1": {...}); missing ones show "Theme N". */
  themes: Record<string, { name?: string; hint?: string }>;
}

export interface DesignerText {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Short selling points beside the editor. */
  points: Array<{ title: string; desc: string }>;
  cta: Link;
  hint: string;
  stageTag: string;
}

export interface SiteContent {
  meta: { brand: string; logos: string[] };
  nav: { links: Link[]; login: string };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    description: string;
    primaryCta: Link;
    secondaryCta: Link;
    image?: string;
    stats: Array<{ value: string; label: string }>;
  };
  simulator: {
    eyebrow: string;
    title: string;
    subtitle: string;
    start: string;
    stageTag: string;
    /** A clean gameplay screenshot behind the overlays; empty = a dark backdrop. */
    stageBackground?: string;
    next: string;
    back: string;
    steps: Record<SimStepId, SimStepText>;
    overlayTabs: { web: string; desktop: string };
    desktopTools: DesktopToolText[];
    controls: Record<
      'autoplay' | 'stop' | 'kill' | 'eliminate' | 'knock' | 'revive' | 'recall' | 'milestone' | 'matchEnd' | 'reset' | 'scenarios',
      string
    >;
    disclaimer: string;
    pickTheme: ThemePickText;
  };
  designer: DesignerText;
  pipeline: {
    eyebrow: string;
    title: string;
    description: string;
    steps: Array<{ index: string; title: string; desc: string }>;
  };
  overlays: {
    eyebrow: string;
    title: string;
    description: string;
    items: Array<{ tag: string; title: string; description: string; image: string }>;
  };
  features: {
    title: string;
    subtitle: string;
    items: Array<{ icon: string; title: string; desc: string }>;
  };
  projects: {
    eyebrow: string;
    title: string;
    items: Array<{ title: string; prizePool: string; participants: string; viewers: string; link: string }>;
  };
  pricing: {
    title: string;
    subtitle: string;
    toggle: { monthly: string; yearly: string; yearlyBadge?: string };
    plans: Plan[];
  };
  contact: {
    title: string;
    subtitle: string;
    email: { title: string; address: string; note: string };
    whatsapp: { title: string; number: string; note: string };
    trial: { title: string; desc: string; button: string; href: string };
  };
  footer: { copyright: string; status: string };
}
