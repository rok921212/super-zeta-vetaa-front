import React from 'react';
import { useSiteContent } from './content/useSiteContent.ts';
import { Nav } from './home/sections/Nav.tsx';
import { Hero } from './home/sections/Hero.tsx';
import { SimulatorSection } from './home/sections/SimulatorSection.tsx';
import { DesignerSection } from './home/sections/DesignerSection.tsx';
import { Features, Overlays, Pipeline, Projects } from './home/sections/Showcase.tsx';
import { Pricing } from './home/sections/Pricing.tsx';
import { Contact, Footer } from './home/sections/Contact.tsx';

// ------------------------------------------------------------------
// Every word on this page comes from front/public/content/site.json
// (useSiteContent.ts): edit that file to change the text, prices or
// images, no rebuild needed. The sections live in home/sections/.
//
// PERF NOTES:
// - Nothing on this page re-renders on a timer. The simulator (its own
//   lazy chunk) only mounts when its section nears the screen.
// - No looping animations; hover states are short colour/opacity fades.
// - No backdrop blur on the sticky nav (it recomputes every scroll frame).
// - Images below the fold are `loading="lazy" decoding="async"`.
// - Fonts load from index.html (<link>), not an @import here.
//
//   Display type   Space Grotesk
//   Body type      Inter
//   Data / mono    JetBrains Mono
// ------------------------------------------------------------------

const PAGE_CSS = `
  .font-display { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; }
  .font-sans { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
  .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  .scanlines {
    background-image: repeating-linear-gradient(to bottom, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 3px);
  }
  .home-root { scroll-behavior: smooth; }
  .home-root a:focus-visible, .home-root button:focus-visible { outline: 2px solid #E11D2E; outline-offset: 2px; }
`;

const Home: React.FC = () => {
  const content = useSiteContent();

  return (
    <div className="home-root min-h-screen bg-[#0B0C0E] text-[#F4F2EE] font-sans antialiased overflow-x-hidden">
      <style>{PAGE_CSS}</style>
      {!content ? (
        // The text file is tiny; this only shows for a moment on a slow connection.
        <div className="min-h-screen flex items-center justify-center">
          <span className="w-2 h-2 rounded-full bg-[#E11D2E] animate-pulse" aria-label="Loading" />
        </div>
      ) : (
        <>
          <Nav meta={content.meta} nav={content.nav} />
          <main>
            <Hero hero={content.hero} />
            <SimulatorSection text={content.simulator} />
            <DesignerSection text={content.designer} />
            <Overlays overlays={content.overlays} />
            <Pipeline pipeline={content.pipeline} />
            <Features features={content.features} />
            <Projects projects={content.projects} />
            <Pricing pricing={content.pricing} />
            <Contact contact={content.contact} />
          </main>
          <Footer footer={content.footer} />
        </>
      )}
    </div>
  );
};

export default Home;
