// Shared building blocks of the home page: the broadcast frame, section
// eyebrows and headings, and the link that knows in-page anchors from routes.
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

import React from 'react';
import { Link } from 'react-router-dom';

// Broadcast HUD framing — red corner brackets, static, no motion.
export const Framed: React.FC<{ children: React.ReactNode; className?: string; live?: boolean }> = ({ children, className = '', live = false }) => (
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

export const Eyebrow: React.FC<{ children: React.ReactNode; tone?: 'red' | 'muted' }> = ({ children, tone = 'red' }) => (
  <div className="inline-flex items-center gap-2">
    <span className={`w-1.5 h-1.5 ${tone === 'red' ? 'bg-[#E11D2E]' : 'bg-[#55565C]'}`} />
    <span className="font-mono text-[11px] tracking-[0.24em] text-[#93959C]">{children}</span>
  </div>
);

export const SectionHead: React.FC<{ eyebrow?: string; title: string; subtitle?: string; center?: boolean }> = ({ eyebrow, title, subtitle, center }) => (
  <div className={center ? 'text-center max-w-2xl mx-auto' : 'max-w-2xl'}>
    {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
    <h2 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-[#F4F2EE] uppercase leading-[1.05] tracking-tight">{title}</h2>
    {subtitle && <p className="mt-5 text-[#93959C] text-lg leading-relaxed">{subtitle}</p>}
  </div>
);

/** `#anchor` and external links are plain <a>; app paths go through the router. */
export const SmartLink: React.FC<{ href: string; className?: string; children: React.ReactNode; onClick?: () => void }> = ({ href, className, children, onClick }) => {
  if (href.startsWith('/') && !href.startsWith('//')) return <Link to={href} className={className} onClick={onClick}>{children}</Link>;
  const external = /^https?:/i.test(href);
  return (
    <a href={href} className={className} onClick={onClick} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  );
};

export const Container: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>
);
