// Used when /content/site.json cannot be fetched (or is missing a key after an
// edit): the page still renders, with short text and empty lists. Sections
// whose list is empty hide themselves. The real text lives in the JSON.

import type { SiteContent } from './siteContent.types.ts';

export const FALLBACK_CONTENT: SiteContent = {
  meta: { brand: 'ScoreSync', logos: ['./fusion_xgeefl.png', './logo.png'] },
  nav: {
    links: [
      { label: 'Simulator', href: '#simulator' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Contact', href: '#contact' },
    ],
    login: 'Login',
  },
  hero: {
    eyebrow: 'BROADCAST SYSTEMS FOR COMPETITIVE GAMING',
    title: 'ScoreSync',
    subtitle: 'Professional tournament management and live overlays for esports.',
    description: '',
    primaryCta: { label: 'Try the simulator', href: '#simulator' },
    secondaryCta: { label: 'Login', href: '/login' },
    image: './stats.avif',
    stats: [],
  },
  simulator: {
    eyebrow: 'TRY IT LIVE',
    title: 'Run a tournament in two minutes',
    subtitle: 'A simulation with sample data.',
    start: 'Start the simulation',
    stageTag: 'SIMULATION · 1920×1080',
    stageBackground: '',
    next: 'Next',
    back: 'Back',
    steps: {
      tournament: { title: 'Tournament', hint: '' },
      round: { title: 'Round', hint: '' },
      teams: { title: 'Groups & teams', hint: '' },
      theme: { title: 'Theme', hint: '' },
      overlays: { title: 'Overlays', hint: '' },
      live: { title: 'Go live', hint: '' },
    },
    overlayTabs: { web: 'Website overlays', desktop: 'Desktop app tools' },
    desktopTools: [],
    controls: {
      autoplay: 'Autoplay a match', stop: 'Stop', kill: '+ Kill', eliminate: 'Eliminate team', knock: 'Knock',
      revive: 'Revive', recall: 'Recall', milestone: 'Milestone', matchEnd: 'End match', reset: 'Reset', scenarios: 'Jump to a moment',
    },
    disclaimer: 'Simulation only. No data is saved.',
    pickTheme: {
      title: 'Pick a theme',
      hint: 'Choose the look first. You can still change it later.',
      start: 'Start with {theme}',
      previewLabel: 'Preview',
      themes: {},
    },
  },
  designer: {
    eyebrow: 'THE DESIGNER',
    title: 'Build your own overlays',
    subtitle: 'A no-code editor for broadcast graphics.',
    points: [],
    cta: { label: 'Open the Designer', href: '/designer' },
    hint: 'Click a layer, drag it, change a colour.',
    stageTag: 'DESIGNER · PREVIEW',
  },
  pipeline: { eyebrow: '', title: '', description: '', steps: [] },
  overlays: { eyebrow: '', title: '', description: '', items: [] },
  features: { title: '', subtitle: '', items: [] },
  projects: { eyebrow: '', title: '', items: [] },
  pricing: { title: 'Pricing', subtitle: '', toggle: { monthly: 'Monthly', yearly: 'Yearly' }, plans: [] },
  contact: {
    title: 'Get In Touch',
    subtitle: '',
    email: { title: 'Email Us', address: 'fusion1nepal@gmail.com', note: '' },
    whatsapp: { title: 'WhatsApp', number: '+977 9804344434', note: '' },
    trial: { title: '', desc: '', button: 'Get Started', href: '/login' },
  },
  footer: { copyright: '© ScoreSync', status: 'SYSTEM ON AIR' },
};
