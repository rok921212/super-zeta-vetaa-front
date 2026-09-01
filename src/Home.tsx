import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './components/LanguageSwitcher';

// ------------------------------------------------------------------
// PERF NOTES:
// - The old `useTimecode` hook ran a setInterval every ~33ms (30x/sec)
//   and called setState on every tick, forcing this whole page to
//   re-render 30 times a second forever. That was the actual source of
//   the "choppy" feel — removed entirely, along with the fake clock UI.
// - No CSS keyframe animations, no `transition` / `duration` classes
//   anywhere below. All hover states are instant color/opacity swaps
//   via plain CSS (no animation work on interaction).
// - `backdrop-blur-sm` on the sticky nav removed — a blurred sticky
//   element recomputes its blur every scroll frame. Solid background
//   at high opacity looks the same here and costs nothing.
// - All <img> tags now carry explicit width/height (or are wrapped in
//   fixed-aspect containers) so the browser can reserve layout space
//   up front — avoids reflow as images load in.
// - Hero images (above the fold) load eagerly; everything below the
//   fold is `loading="lazy" decoding="async"`.
//
//   bg / void      #0B0C0E   page background — the control-room dark
//   panel          #131418   card / tile surface
//   panel-raised   #17181D   hovered / active surface
//   line           #24262B   hairline borders
//   text           #F4F2EE   primary text
//   text-muted     #93959C   secondary text
//   text-dim       #55565C   tertiary / captions
//   tally          #E11D2E   on-air red — the one accent, used sparingly
//   tally-dim      #8C1220   pressed / darker red
//
//   Display type   Space Grotesk
//   Body type      Inter
//   Data / mono    JetBrains Mono
// ------------------------------------------------------------------

const overlayShowcase = [
  { tag: 'CH.01', title: 'Live Stats', description: 'Real-time match data delivered straight to the broadcast, so viewers stay locked to the current game state.', image: './stats.avif' },
  { tag: 'CH.02', title: 'Player Statistics', description: 'Individual performance tracking across every round — kills, assists, damage, survival.', image: './wwcd.avif' },
  { tag: 'CH.03', title: 'Kill Feed', description: 'Elimination alerts that fire instantly, keeping viewers locked into every action in the match.', image: './dom.avif' },
  { tag: 'CH.04', title: 'Team Rankings', description: 'Live standings updated as the tournament unfolds — positions, points, progression.', image: './ranks.avif' },
  { tag: 'CH.05', title: 'Battle Bar', description: 'At-a-glance team health and progress, built for viewers to read fight dynamics in a glance.', image: './upper.avif' },
  { tag: 'CH.06', title: 'Observer System', description: 'Multi-angle observing built for cinematic, broadcast-ready POV switching mid-match.', image: './oberseber.avif' },
  { tag: 'CH.07', title: 'Real-Time Player Observation', description: 'Advanced spectator system — instant POV switching, live monitoring, cinematic control.', image: './real-player.avif' },
];

const productionSteps = [
  { index: '01', title: 'Ingest', desc: "Match data is pulled directly from the game and tournament bracket the instant a round starts — kills, damage, circle phase, team standings." },
  { index: '02', title: 'Render', desc: "Raw data is mapped onto the tournament's overlay theme in real time: live stats, kill feed, battle bar and rankings, updating as the match moves." },
  { index: '03', title: 'Deliver', desc: "The finished overlay is handed to the broadcast feed through our HUD control panel, where a producer switches views, themes and observer POVs live." },
];

const projects = [
  { title: 'DAY 1 BEFL Season 1 Grand Final Live | PUBG Mobile Esports Bangladesh', prizePool: '$300', participants: '500+', viewers: '30K+', link: 'https://www.youtube.com/watch?v=w_i9Vg-s4I4' },
  { title: 'X SPACE ELITE STARS | PRO PMGC & PMSL TEAMS CLUTCH', prizePool: '$100', participants: '80', viewers: '5K+', link: 'https://www.youtube.com/watch?v=u9nT78FQuQE&t=1367s' },
  { title: '[NP] DANGER DEVICE INVITATION S-3 | GRAND FINAL DAY 2', prizePool: '$200', participants: '30', viewers: '4K+', link: 'https://www.youtube.com/watch?v=O_zT7S2ullQ&t=1781s' },
  { title: '[NP] PUBG MOBILE PMUD S10 50K GRAND FINAL', prizePool: 'NRS 50,000', participants: '180', viewers: '11K+', link: 'https://www.youtube.com/watch?v=ONjwjVKkCKE&t=1s' },
  { title: 'EID SPECIAL B4B ULTIMATE ROYAL TOURNAMENT | GRAND FINALS', prizePool: '$250', participants: '80+', viewers: '24K+', link: 'https://www.youtube.com/watch?v=jOWakcKkK5E' },
  { title: 'RSD THE BATTLE ZONE SEASON 2 GRAND FINALS DAY 3', prizePool: '$500', participants: '22', viewers: '29K+', link: 'https://www.youtube.com/watch?v=c8qmBPYJ8FQ&t=3088s' },
];

const getYouTubeId = (url: string) => {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    return null;
  } catch {
    return null;
  }
};

// Broadcast HUD framing — red corner brackets, static, no motion.
const Framed: React.FC<{ children: React.ReactNode; className?: string; live?: boolean }> = ({ children, className = '', live = false }) => (
  <div className={`relative ${className}`}>
    {children}
    <span className="pointer-events-none absolute -top-[1px] -left-[1px] w-5 h-5 border-t-2 border-l-2 border-[#E11D2E]" />
    <span className="pointer-events-none absolute -top-[1px] -right-[1px] w-5 h-5 border-t-2 border-r-2 border-[#E11D2E]" />
    <span className="pointer-events-none absolute -bottom-[1px] -left-[1px] w-5 h-5 border-b-2 border-l-2 border-[#E11D2E]" />
    <span className="pointer-events-none absolute -bottom-[1px] -right-[1px] w-5 h-5 border-b-2 border-r-2 border-[#E11D2E]" />
    {live && (
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 px-2 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#E11D2E]" />
        <span className="font-mono text-[9px] tracking-[0.15em] text-white/90">LIVE</span>
      </div>
    )}
  </div>
);

const Eyebrow: React.FC<{ children: React.ReactNode; tone?: 'red' | 'muted' }> = ({ children, tone = 'red' }) => (
  <div className="inline-flex items-center gap-2">
    <span className={`w-1.5 h-1.5 ${tone === 'red' ? 'bg-[#E11D2E]' : 'bg-[#55565C]'}`} />
    <span className="font-mono text-[11px] tracking-[0.24em] text-[#93959C]">{children}</span>
  </div>
);

const Home: React.FC = () => {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-[#F4F2EE] font-sans antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

        .font-display { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; }
        .font-sans { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

        .scanlines {
          background-image: repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,0.025) 0px,
            rgba(255,255,255,0.025) 1px,
            transparent 1px,
            transparent 3px
          );
        }

        a:focus-visible, button:focus-visible {
          outline: 2px solid #E11D2E;
          outline-offset: 2px;
        }
      `}</style>
      {/*
        NOTE: the @import above still costs a render-blocking font fetch on
        first paint. For a real perf win, move these three Google Fonts to
        a <link rel="preconnect" href="https://fonts.googleapis.com"> plus
        a normal <link rel="stylesheet"> in index.html's <head> instead of
        importing them from inside a component's <style> tag.
      */}

      {/* ============ NAVIGATION ============ */}
      <nav className="bg-[#0B0C0E]/98 border-b border-[#24262B] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="lg:hidden text-[#F4F2EE] p-2 -ml-2" aria-label="Toggle menu">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <img src="./fusion_xgeefl.png" alt="Fusion Logo" width={40} height={40} className="w-[32px] h-[32px] md:w-[40px] md:h-[40px]" />
              <img src="./logo.png" alt="ScoreSync Logo" width={34} height={34} className="w-[26px] h-[26px] md:w-[34px] md:h-[34px]" />
            </div>

            <div
              className={`${isMenuOpen ? 'flex' : 'hidden'} lg:flex flex-col lg:flex-row space-y-4 lg:space-y-0 lg:space-x-9 absolute lg:relative top-full lg:top-auto left-0 lg:left-auto w-full lg:w-auto bg-[#0B0C0E] lg:bg-transparent border-t lg:border-t-0 border-[#24262B] z-50 px-4 py-6 lg:p-0`}
            >
              <a href="#home" className="font-mono text-[11px] tracking-[0.18em] text-[#93959C] hover:text-[#E11D2E]">{t('nav.home')}</a>
              <a href="#overlays" className="font-mono text-[11px] tracking-[0.18em] text-[#93959C] hover:text-[#E11D2E]">OVERLAYS</a>
              <a href="#features" className="font-mono text-[11px] tracking-[0.18em] text-[#93959C] hover:text-[#E11D2E]">{t('nav.features')}</a>
              <a href="#projects" className="font-mono text-[11px] tracking-[0.18em] text-[#93959C] hover:text-[#E11D2E]">PROJECTS</a>
              <a href="#pricing" className="font-mono text-[11px] tracking-[0.18em] text-[#93959C] hover:text-[#E11D2E]">{t('nav.pricing')}</a>
              <a href="#contact" className="font-mono text-[11px] tracking-[0.18em] text-[#93959C] hover:text-[#E11D2E]">{t('nav.contact')}</a>
            </div>

            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center gap-2 pr-4 border-r border-[#24262B]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E11D2E]" />
                <span className="font-mono text-[10px] tracking-[0.15em] text-[#55565C]">ON AIR</span>
              </div>
              <LanguageSwitcher />
              <Link to="/login" className="bg-[#F4F2EE] hover:bg-[#E11D2E] hover:text-white text-[#0B0C0E] text-[11px] font-mono font-medium tracking-[0.18em] px-5 py-2.5">
                {t('nav.login')}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ============ HERO ============ */}
      <section id="home" className="relative overflow-hidden border-b border-[#24262B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 grid lg:grid-cols-[1fr_1fr] gap-14 lg:gap-10 items-center">
          <div>
            <Eyebrow>BROADCAST SYSTEMS FOR COMPETITIVE GAMING</Eyebrow>

            <h1 className="font-display font-extrabold text-[#F4F2EE] text-[13vw] leading-[0.92] tracking-tight uppercase mt-6 sm:text-6xl lg:text-[4.6rem]">
              {t('home.title')}
            </h1>

            <p className="mt-7 max-w-lg text-[#93959C] text-lg leading-relaxed">
              {t('home.subtitle')}
            </p>
            <p className="mt-4 max-w-xl text-[#55565C] leading-relaxed">
              {t('home.description')}
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link to="/login" className="group inline-flex items-center gap-2 px-8 py-4 bg-[#E11D2E] text-white font-display font-bold text-sm tracking-wide hover:bg-[#F4F2EE] hover:text-[#0B0C0E]">
                {t('home.getStarted')}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <a href="#overlays" className="inline-flex items-center px-8 py-4 border border-[#24262B] text-[#F4F2EE] font-display font-bold text-sm tracking-wide hover:border-[#E11D2E] hover:text-[#E11D2E]">
                {t('home.exploreFeatures')}
              </a>
            </div>
          </div>

          {/* Monitor wall — hero images load eagerly since they're above the fold */}
          <div className="relative">
            <div className="grid grid-cols-2 gap-3">
              <Framed className="col-span-2" live>
                <div className="aspect-[16/8] bg-black scanlines overflow-hidden relative">
                  <img src="./stats.avif" alt="Live broadcast overlay showing real-time match stats" className="w-full h-full object-cover opacity-90" loading="eager" decoding="async" />
                  <span className="absolute bottom-2 left-3 font-mono text-[9px] tracking-[0.15em] text-white/70">CAM.MAIN — LIVE STATS</span>
                </div>
              </Framed>
              <Framed>
                <div className="aspect-square bg-black scanlines overflow-hidden relative">
                  <img src="./wwcd.avif" alt="Player statistics overlay" className="w-full h-full object-cover opacity-80" loading="eager" decoding="async" />
                  <span className="absolute bottom-2 left-2 font-mono text-[8px] tracking-[0.12em] text-white/60">CH.02</span>
                </div>
              </Framed>
              <Framed>
                <div className="aspect-square bg-black scanlines overflow-hidden relative">
                  <img src="./dom.avif" alt="Kill feed overlay" className="w-full h-full object-cover opacity-80" loading="eager" decoding="async" />
                  <span className="absolute bottom-2 left-2 font-mono text-[8px] tracking-[0.12em] text-white/60">CH.03</span>
                </div>
              </Framed>
            </div>
            <p className="mt-3 font-mono text-[10px] tracking-[0.15em] text-[#55565C] text-center">MULTIVIEWER — 3 SOURCES ACTIVE</p>
          </div>
        </div>
      </section>

      {/* ============ PRODUCTION PIPELINE (signal chain) ============ */}
      <section className="bg-[#0B0C0E] border-b border-[#24262B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-24">
          <div className="max-w-xl mb-14">
            <Eyebrow>HOW A BROADCAST GETS BUILT</Eyebrow>
            <h2 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl text-[#F4F2EE] uppercase leading-[1.05]">
              One signal chain, run live for every match
            </h2>
            <p className="mt-5 text-[#93959C] leading-relaxed">
              Every graphic on screen starts as raw match data. Our overlay system pulls that data the moment it's
              generated, turns it into broadcast-ready visuals, and pushes it to the stream — no manual entry,
              no delay between what happens in-game and what the audience sees.
            </p>
          </div>

          <div className="relative grid md:grid-cols-3 gap-8 md:gap-6">
            <div className="hidden md:block absolute top-[26px] left-[16.6%] right-[16.6%] h-px bg-[#24262B]" />
            {productionSteps.map((step) => (
              <div key={step.index} className="relative bg-[#131418] border border-[#24262B] p-6">
                <div className="flex items-center gap-3 mb-5">
                  <span className="w-[52px] h-[52px] shrink-0 flex items-center justify-center border border-[#E11D2E]/40 font-mono text-[#E11D2E] text-sm bg-[#0B0C0E]">
                    {step.index}
                  </span>
                  <h3 className="font-display font-bold text-xl text-[#F4F2EE] uppercase tracking-tight">{step.title}</h3>
                </div>
                <p className="text-[#93959C] text-[15px] leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ OVERLAY SHOWCASE ============ */}
      <section id="overlays" className="py-20 lg:py-28 border-b border-[#24262B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <Eyebrow>A GLIMPSE OF OUR SYSTEM</Eyebrow>
            <h2 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-[#F4F2EE] uppercase leading-[1.05]">
              Broadcast overlay modules
            </h2>
            <p className="mt-5 text-[#93959C] leading-relaxed">
              Each module runs independently and together — mix and match per tournament, per theme, per broadcast.
            </p>
          </div>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-14">
            {overlayShowcase.map((item) => (
              <div key={item.title}>
                <Framed className="mb-5">
                  <div className="aspect-[16/10] bg-black scanlines overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover opacity-85 hover:opacity-100"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </Framed>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-mono text-[10px] tracking-[0.15em] text-[#E11D2E]">{item.tag}</span>
                  <span className="h-px flex-1 bg-[#24262B]" />
                </div>
                <h3 className="font-display font-bold text-lg text-[#F4F2EE] uppercase tracking-tight">{item.title}</h3>
                <p className="mt-2 text-[#93959C] text-[15px] leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#131418] border-b border-[#24262B]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-[#F4F2EE] uppercase tracking-tight">{t('features.title')}</h2>
            <p className="text-lg text-[#93959C] max-w-2xl mx-auto mt-4">{t('features.subtitle')}</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#24262B] border border-[#24262B]">
            {[
              { key: 'realTime', path: 'M13 10V3L4 14h7v7l9-11h-7z' },
              { key: 'themes', path: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z' },
              { key: 'broadcast', path: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
              { key: 'api', path: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4' },
              { key: 'events', path: 'M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10m-9 0V1m10 3V1m0 3l1 1v16a2 2 0 01-2 2H6a2 2 0 01-2-2V5l1-1z' },
              { key: 'scoring', path: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
            ].map((f) => (
              <div key={f.key} className="bg-[#131418] p-8 hover:bg-[#17181D]">
                <div className="w-11 h-11 border border-[#E11D2E]/40 flex items-center justify-center mb-6">
                  <svg className="w-5 h-5 text-[#E11D2E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={f.path} />
                  </svg>
                </div>
                <h3 className="font-display font-bold text-xl text-[#F4F2EE] mb-3 uppercase tracking-tight">{t(`features.${f.key}.title`)}</h3>
                <p className="text-[#93959C] leading-relaxed">{t(`features.${f.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PROJECTS ============ */}
      <section id="projects" className="py-20 lg:py-28 px-4 sm:px-6 lg:px-8 border-b border-[#24262B]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Eyebrow>A SELECTION OF</Eyebrow>
            <h2 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-[#F4F2EE] uppercase tracking-tight">Broadcasts we've run</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((p) => {
              const ytId = getYouTubeId(p.link);
              return (
                <a
                  key={p.title}
                  href={p.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative block bg-black overflow-hidden aspect-[4/5] border border-[#24262B] hover:border-[#E11D2E]"
                >
                  {ytId && (
                    <img
                      src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                      alt={p.title}
                      className="w-full h-full object-cover opacity-75 group-hover:opacity-95"
                      loading="lazy"
                      decoding="async"
                      width={480}
                      height={360}
                    />
                  )}
                  <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/70 px-2 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E11D2E]" />
                    <span className="font-mono text-[9px] tracking-[0.15em] text-white/90">REC</span>
                  </div>
                  <div className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center bg-white/0 border border-white/20 opacity-0 group-hover:opacity-100 group-hover:bg-[#E11D2E] group-hover:border-[#E11D2E]">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M7 7h10v10" />
                    </svg>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black via-black/70 to-transparent">
                    <h3 className="font-display font-bold text-white text-base uppercase tracking-tight leading-tight mb-4">{p.title}</h3>
                    <div className="grid grid-cols-3 gap-2 border-t border-white/15 pt-3">
                      <div>
                        <div className="font-mono text-[9px] tracking-[0.1em] text-white/45">PRIZE</div>
                        <p className="font-display font-bold text-sm text-white">{p.prizePool}</p>
                      </div>
                      <div>
                        <div className="font-mono text-[9px] tracking-[0.1em] text-white/45">PLAYERS</div>
                        <p className="font-display font-bold text-sm text-white">{p.participants}</p>
                      </div>
                      <div>
                        <div className="font-mono text-[9px] tracking-[0.1em] text-white/45">VIEWERS</div>
                        <p className="font-display font-bold text-sm text-white">{p.viewers}</p>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#131418] border-b border-[#24262B]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-[#F4F2EE] uppercase tracking-tight">{t('pricing.title')}</h2>
            <p className="text-lg text-[#93959C] max-w-2xl mx-auto mt-4">{t('pricing.subtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['daily', 'monthly', 'yearly'].map((plan) => (
              <div
                key={plan}
                className={`bg-[#0B0C0E] p-6 border flex flex-col justify-between relative ${
                  plan === 'monthly' ? 'border-[#E11D2E]' : 'border-[#24262B]'
                }`}
              >
                {plan === 'monthly' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#E11D2E] text-white px-3 py-1 text-xs font-mono tracking-wide">
                      {t('pricing.monthly.popular')}
                    </span>
                  </div>
                )}
                <div>
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-display font-bold text-[#F4F2EE] mb-2 uppercase">{t(`pricing.${plan}.title`)}</h3>
                    <div className="text-3xl font-display font-extrabold text-[#E11D2E] mb-2">
                      {t(`pricing.${plan}.price`)}
                      <span className="text-base font-sans font-normal text-[#93959C]">{t(`pricing.${plan}.period`)}</span>
                    </div>
                    <p className="text-[#93959C]">{t(`pricing.${plan}.desc`)}</p>
                  </div>
                  <ul className="space-y-4 mb-8">
                    {(t(`pricing.${plan}.features`, { returnObjects: true }) as string[]).map((feature, index) => (
                      <li key={index} className="flex items-center text-[#93959C]">
                        <svg className="w-5 h-5 text-[#E11D2E] mr-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  to="/login"
                  className={`w-full block text-center py-3 font-display font-bold tracking-wide ${
                    plan === 'monthly' ? 'bg-[#E11D2E] text-white hover:bg-[#8C1220]' : 'bg-[#F4F2EE] text-[#0B0C0E] hover:bg-[#E11D2E] hover:text-white'
                  }`}
                >
                  {t(`pricing.${plan}.button`)}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CONTACT ============ */}
      <section id="contact" className="py-20 px-4 sm:px-6 lg:px-8 border-b border-[#24262B]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-[#F4F2EE] uppercase tracking-tight">{t('contact.title')}</h2>
          <p className="text-lg text-[#93959C] mb-12 mt-4">{t('contact.subtitle')}</p>

          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <div className="bg-[#131418] p-8 border border-[#24262B] hover:border-[#E11D2E]">
              <div className="w-11 h-11 border border-[#E11D2E]/40 flex items-center justify-center mx-auto mb-6">
                <svg className="w-5 h-5 text-[#E11D2E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-display font-bold text-[#F4F2EE] mb-4 uppercase">{t('contact.email.title')}</h3>
              <p className="text-[#93959C] mb-2">{t('contact.email.address')}</p>
              <p className="text-sm text-[#55565C]">{t('contact.email.note')}</p>
            </div>

            <div className="bg-[#131418] p-8 border border-[#24262B] hover:border-[#E11D2E]">
              <div className="w-11 h-11 border border-[#E11D2E]/40 flex items-center justify-center mx-auto mb-6">
                <svg className="w-5 h-5 text-[#E11D2E]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
                </svg>
              </div>
              <h3 className="text-xl font-display font-bold text-[#F4F2EE] mb-4 uppercase">{t('contact.whatsapp.title')}</h3>
              <p className="text-[#93959C] mb-2">{t('contact.whatsapp.number')}</p>
              <p className="text-sm text-[#55565C]">{t('contact.whatsapp.note')}</p>
            </div>
          </div>

          <div className="bg-[#131418] p-8 border border-[#24262B]">
            <h3 className="text-2xl font-display font-bold text-[#F4F2EE] mb-4 uppercase">{t('contact.trial.title')}</h3>
            <p className="text-[#93959C] mb-8">{t('contact.trial.desc')}</p>
            <Link to="/login" className="inline-block px-8 py-4 bg-[#E11D2E] hover:bg-[#8C1220] text-white font-display font-bold tracking-wide">
              {t('contact.trial.button')}
            </Link>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-sm text-[#55565C]">{t('footer.copyright')}</div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E11D2E]" />
            <span className="font-mono text-[10px] tracking-[0.15em] text-[#55565C]">SYSTEM ON AIR</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;