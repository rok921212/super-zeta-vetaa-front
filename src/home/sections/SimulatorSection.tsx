import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { SiteContent } from '../../content/siteContent.types.ts';
import { Container, SectionHead } from './ui.tsx';

// The simulator pulls in the overlay engine, the themes and the Designer's
// renderer, so it is its own chunk, fetched once the section is near the
// screen. Until then (and while it loads) a poster holds its place.
const HomeSimulator = lazy(() => import('../sim/HomeSimulator.tsx'));

class SimBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const Poster: React.FC<{ text: SiteContent['simulator']; onStart?: () => void }> = ({ text, onStart }) => (
  <div className="relative w-full aspect-video bg-[radial-gradient(ellipse_at_30%_20%,#1d2430_0%,#0d1117_55%,#050607_100%)] ring-1 ring-[#24262B] flex items-center justify-center">
    <button
      type="button"
      onClick={onStart}
      className="inline-flex items-center gap-3 px-7 py-4 bg-[#E11D2E] text-white font-display font-bold text-sm uppercase tracking-wide hover:bg-[#F4F2EE] hover:text-[#0B0C0E] transition-colors"
    >
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" /></svg>
      {text.start}
    </button>
  </div>
);

export const SimulatorSection: React.FC<{ text: SiteContent['simulator'] }> = ({ text }) => {
  const ref = useRef<HTMLElement>(null);
  const [mount, setMount] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || mount) return;
    if (typeof IntersectionObserver === 'undefined') { setMount(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setMount(true); io.disconnect(); }
    }, { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [mount]);

  const poster = <Poster text={text} onStart={() => setMount(true)} />;
  return (
    <section id="simulator" ref={ref} className="py-20 lg:py-24 border-b border-[#24262B] bg-[#0E0F12] scroll-mt-16">
      <Container>
        <SectionHead eyebrow={text.eyebrow} title={text.title} subtitle={text.subtitle} />
        <div className="mt-12">
          {mount
            ? (
              <SimBoundary fallback={poster}>
                <Suspense fallback={poster}><HomeSimulator text={text} /></Suspense>
              </SimBoundary>
            )
            : poster}
        </div>
      </Container>
    </section>
  );
};
