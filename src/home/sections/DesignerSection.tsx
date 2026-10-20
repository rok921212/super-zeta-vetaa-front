import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { SiteContent } from '../../content/siteContent.types.ts';
import { Container, SectionHead } from './ui.tsx';

// The Designer glimpse brings in the layout renderer and its own simulation,
// so like the simulator it is a separate chunk, fetched once the section is
// near the screen. Until then a still placeholder holds its place.
const DesignerGlimpse = lazy(() => import('../designer/DesignerGlimpse.tsx'));

class GlimpseBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const Placeholder: React.FC = () => (
  <div className="w-full aspect-[16/8] bg-[#131418] border border-[#24262B] flex items-center justify-center">
    <span className="w-2 h-2 rounded-full bg-[#E11D2E] animate-pulse" aria-label="Loading" />
  </div>
);

export const DesignerSection: React.FC<{ text: SiteContent['designer'] }> = ({ text }) => {
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

  return (
    <section id="designer" ref={ref} className="py-20 lg:py-24 border-b border-[#24262B] scroll-mt-16">
      <Container>
        <SectionHead eyebrow={text.eyebrow} title={text.title} subtitle={text.subtitle} />
        {text.points.length > 0 && (
          <ul className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#24262B] border border-[#24262B]">
            {text.points.map((p) => (
              <li key={p.title} className="bg-[#0B0C0E] p-4">
                <div className="font-display font-bold text-sm text-[#F4F2EE] uppercase">{p.title}</div>
                <p className="mt-1 text-sm text-[#93959C] leading-relaxed">{p.desc}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-8">
          {mount
            ? (
              <GlimpseBoundary fallback={<Placeholder />}>
                <Suspense fallback={<Placeholder />}><DesignerGlimpse text={text} /></Suspense>
              </GlimpseBoundary>
            )
            : <Placeholder />}
        </div>
      </Container>
    </section>
  );
};
