import React from 'react';
import type { SiteContent } from '../../content/siteContent.types.ts';
import { Container, Framed, SectionHead } from './ui.tsx';

export const Pipeline: React.FC<{ pipeline: SiteContent['pipeline'] }> = ({ pipeline }) => {
  if (!pipeline.steps.length) return null;
  return (
    <section className="border-b border-[#24262B]">
      <Container className="py-20 lg:py-24">
        <SectionHead eyebrow={pipeline.eyebrow} title={pipeline.title} subtitle={pipeline.description} />
        <div className="relative mt-14 grid md:grid-cols-3 gap-8 md:gap-6">
          <div className="hidden md:block absolute top-[26px] left-[16.6%] right-[16.6%] h-px bg-[#24262B]" />
          {pipeline.steps.map((step) => (
            <div key={step.index} className="relative bg-[#131418] border border-[#24262B] p-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-[52px] h-[52px] shrink-0 flex items-center justify-center border border-[#E11D2E]/40 font-mono text-[#E11D2E] text-sm bg-[#0B0C0E]">{step.index}</span>
                <h3 className="font-display font-bold text-xl text-[#F4F2EE] uppercase tracking-tight">{step.title}</h3>
              </div>
              <p className="text-[#93959C] text-[15px] leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
};

export const Overlays: React.FC<{ overlays: SiteContent['overlays'] }> = ({ overlays }) => {
  if (!overlays.items.length) return null;
  return (
    <section id="overlays" className="py-20 lg:py-28 border-b border-[#24262B] scroll-mt-16">
      <Container>
        <SectionHead eyebrow={overlays.eyebrow} title={overlays.title} subtitle={overlays.description} />
        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-14">
          {overlays.items.map((item) => (
            <div key={item.title} className="group">
              <Framed className="mb-5">
                <div className="aspect-[16/10] bg-black scanlines overflow-hidden">
                  <img src={item.image} alt={item.title} className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity" loading="lazy" decoding="async" />
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
      </Container>
    </section>
  );
};

const ICONS: Record<string, string> = {
  realTime: 'M13 10V3L4 14h7v7l9-11h-7z',
  themes: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z',
  broadcast: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  api: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4',
  events: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  scoring: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
};

export const Features: React.FC<{ features: SiteContent['features'] }> = ({ features }) => {
  if (!features.items.length) return null;
  return (
    <section id="features" className="py-20 bg-[#131418] border-b border-[#24262B] scroll-mt-16">
      <Container>
        <SectionHead title={features.title} subtitle={features.subtitle} center />
        <div className="mt-16 grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#24262B] border border-[#24262B]">
          {features.items.map((f) => (
            <div key={f.title} className="bg-[#131418] p-8 hover:bg-[#17181D] transition-colors">
              <div className="w-11 h-11 border border-[#E11D2E]/40 flex items-center justify-center mb-6">
                <svg className="w-5 h-5 text-[#E11D2E]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS[f.icon] || ICONS.realTime} />
                </svg>
              </div>
              <h3 className="font-display font-bold text-xl text-[#F4F2EE] mb-3 uppercase tracking-tight">{f.title}</h3>
              <p className="text-[#93959C] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
};

const youTubeId = (url: string) => {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    return null;
  } catch {
    return null;
  }
};

export const Projects: React.FC<{ projects: SiteContent['projects'] }> = ({ projects }) => {
  if (!projects.items.length) return null;
  return (
    <section id="projects" className="py-20 lg:py-28 border-b border-[#24262B] scroll-mt-16">
      <Container>
        <SectionHead eyebrow={projects.eyebrow} title={projects.title} center />
        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.items.map((p) => {
            const yt = youTubeId(p.link);
            return (
              <a key={p.title} href={p.link} target="_blank" rel="noopener noreferrer" className="group relative block bg-black overflow-hidden aspect-[4/5] border border-[#24262B] hover:border-[#E11D2E] transition-colors">
                {yt && (
                  <img src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`} alt={p.title} className="w-full h-full object-cover opacity-75 group-hover:opacity-95 transition-opacity" loading="lazy" decoding="async" width={480} height={360} />
                )}
                <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/70 px-2 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E11D2E]" />
                  <span className="font-mono text-[9px] tracking-[0.15em] text-white/90">REC</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black via-black/70 to-transparent">
                  <h3 className="font-display font-bold text-white text-base uppercase tracking-tight leading-tight mb-4">{p.title}</h3>
                  <div className="grid grid-cols-3 gap-2 border-t border-white/15 pt-3">
                    {[['PRIZE', p.prizePool], ['PLAYERS', p.participants], ['VIEWERS', p.viewers]].map(([k, v]) => (
                      <div key={k}>
                        <div className="font-mono text-[9px] tracking-[0.1em] text-white/45">{k}</div>
                        <p className="font-display font-bold text-sm text-white">{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </Container>
    </section>
  );
};
