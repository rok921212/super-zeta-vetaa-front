import React, { useState } from 'react';
import type { SiteContent } from '../../content/siteContent.types.ts';
import { Container, SmartLink } from './ui.tsx';

export const Nav: React.FC<{ meta: SiteContent['meta']; nav: SiteContent['nav'] }> = ({ meta, nav }) => {
  const [open, setOpen] = useState(false);
  return (
    // Solid background, no backdrop blur: a blurred sticky bar recomputes every scroll frame.
    <nav className="bg-[#0B0C0E]/95 border-b border-[#24262B] sticky top-0 z-50">
      <Container>
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(!open)} className="lg:hidden text-[#F4F2EE] p-2 -ml-2" aria-label="Toggle menu" aria-expanded={open}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
            <a href="#home" className="flex items-center gap-3" aria-label={meta.brand}>
              {meta.logos.map((src, i) => (
                <img key={src} src={src} alt={i === 0 ? meta.brand : ''} width={i === 0 ? 40 : 34} height={i === 0 ? 40 : 34} className={i === 0 ? 'w-8 h-8 md:w-10 md:h-10' : 'w-[26px] h-[26px] md:w-[34px] md:h-[34px]'} />
              ))}
            </a>
          </div>

          <div
            className={`${open ? 'flex' : 'hidden'} lg:flex flex-col lg:flex-row gap-5 lg:gap-9 absolute lg:static top-full left-0 w-full lg:w-auto bg-[#0B0C0E] lg:bg-transparent border-b lg:border-0 border-[#24262B] px-4 py-6 lg:p-0`}
          >
            {nav.links.map((l) => (
              <SmartLink key={l.href} href={l.href} onClick={() => setOpen(false)} className="font-mono text-[11px] tracking-[0.18em] uppercase text-[#93959C] hover:text-[#F4F2EE]">
                {l.label}
              </SmartLink>
            ))}
          </div>

          <SmartLink href="/login" className="bg-[#F4F2EE] hover:bg-[#E11D2E] hover:text-white text-[#0B0C0E] text-[11px] font-mono font-medium tracking-[0.18em] uppercase px-5 py-2.5 transition-colors">
            {nav.login}
          </SmartLink>
        </div>
      </Container>
    </nav>
  );
};
