import React from 'react';
import type { SiteContent } from '../../content/siteContent.types.ts';
import { Container, Eyebrow, Framed, SmartLink } from './ui.tsx';

export const Hero: React.FC<{ hero: SiteContent['hero'] }> = ({ hero }) => (
  <section id="home" className="relative overflow-hidden border-b border-[#24262B]">
    {/* A soft red glow behind the headline: static, drawn once. */}
    <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 w-[640px] h-[640px] rounded-full bg-[#E11D2E]/10 blur-3xl" />
    <Container className="relative py-16 lg:py-24 grid lg:grid-cols-[1.05fr_1fr] gap-14 lg:gap-12 items-center">
      <div>
        <Eyebrow>{hero.eyebrow}</Eyebrow>
        <h1 className="font-display font-extrabold text-[#F4F2EE] text-[15vw] leading-[0.9] tracking-tight uppercase mt-6 sm:text-7xl lg:text-[5.4rem]">
          {hero.title}
        </h1>
        <p className="mt-7 max-w-lg text-[#F4F2EE]/85 text-xl leading-relaxed">{hero.subtitle}</p>
        {hero.description && <p className="mt-4 max-w-xl text-[#93959C] leading-relaxed">{hero.description}</p>}

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <SmartLink href={hero.primaryCta.href} className="inline-flex items-center gap-2 px-8 py-4 bg-[#E11D2E] text-white font-display font-bold text-sm tracking-wide uppercase hover:bg-[#F4F2EE] hover:text-[#0B0C0E] transition-colors">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            {hero.primaryCta.label}
          </SmartLink>
          <SmartLink href={hero.secondaryCta.href} className="inline-flex items-center px-8 py-4 border border-[#24262B] text-[#F4F2EE] font-display font-bold text-sm tracking-wide uppercase hover:border-[#E11D2E] hover:text-[#E11D2E] transition-colors">
            {hero.secondaryCta.label}
          </SmartLink>
        </div>

        {hero.stats.length > 0 && (
          <dl className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#24262B] border border-[#24262B]">
            {hero.stats.map((s) => (
              <div key={s.label} className="bg-[#0B0C0E] px-4 py-4">
                <dt className="font-mono text-[10px] tracking-[0.14em] text-[#55565C] uppercase">{s.label}</dt>
                <dd className="mt-1 font-display font-extrabold text-2xl text-[#F4F2EE]">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {hero.image && (
        <Framed live>
          <div className="aspect-[16/10] bg-black scanlines overflow-hidden relative">
            {/* Above the fold: eager. */}
            <img src={hero.image} alt="Live broadcast overlay" className="w-full h-full object-cover opacity-90" loading="eager" decoding="async" />
            <span className="absolute bottom-2 left-3 font-mono text-[9px] tracking-[0.15em] text-white/70">CAM.MAIN — PROGRAM OUT</span>
          </div>
        </Framed>
      )}
    </Container>
  </section>
);
