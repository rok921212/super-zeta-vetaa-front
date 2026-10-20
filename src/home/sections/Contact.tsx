import React from 'react';
import type { SiteContent } from '../../content/siteContent.types.ts';
import { Container, SmartLink } from './ui.tsx';

const MAIL = 'M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z';
const CHAT = 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z';

export const Contact: React.FC<{ contact: SiteContent['contact'] }> = ({ contact }) => {
  const wa = contact.whatsapp.number.replace(/[^\d]/g, '');
  const cards = [
    { title: contact.email.title, value: contact.email.address, note: contact.email.note, href: `mailto:${contact.email.address}`, icon: MAIL },
    { title: contact.whatsapp.title, value: contact.whatsapp.number, note: contact.whatsapp.note, href: wa ? `https://wa.me/${wa}` : '', icon: CHAT },
  ];
  return (
    <section id="contact" className="py-20 border-b border-[#24262B] scroll-mt-16">
      <Container className="max-w-4xl text-center">
        <h2 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-[#F4F2EE] uppercase tracking-tight">{contact.title}</h2>
        {contact.subtitle && <p className="text-lg text-[#93959C] mt-4">{contact.subtitle}</p>}

        <div className="mt-12 grid md:grid-cols-2 gap-6">
          {cards.map((c) => {
            const body = (
              <>
                <div className="w-11 h-11 border border-[#E11D2E]/40 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-5 h-5 text-[#E11D2E]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={c.icon} />
                  </svg>
                </div>
                <h3 className="text-xl font-display font-bold text-[#F4F2EE] mb-3 uppercase">{c.title}</h3>
                <p className="text-[#F4F2EE]/85 mb-2 break-words">{c.value}</p>
                {c.note && <p className="text-sm text-[#55565C]">{c.note}</p>}
              </>
            );
            const cls = 'block bg-[#131418] p-8 border border-[#24262B] hover:border-[#E11D2E] transition-colors';
            return c.href
              ? <a key={c.title} href={c.href} className={cls} {...(c.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{body}</a>
              : <div key={c.title} className={cls}>{body}</div>;
          })}
        </div>

        {contact.trial.title && (
          <div className="mt-6 bg-[#131418] p-8 border border-[#24262B]">
            <h3 className="text-2xl font-display font-bold text-[#F4F2EE] mb-4 uppercase">{contact.trial.title}</h3>
            {contact.trial.desc && <p className="text-[#93959C] mb-8">{contact.trial.desc}</p>}
            <SmartLink href={contact.trial.href} className="inline-block px-8 py-4 bg-[#E11D2E] hover:bg-[#8C1220] text-white font-display font-bold tracking-wide uppercase transition-colors">
              {contact.trial.button}
            </SmartLink>
          </div>
        )}
      </Container>
    </section>
  );
};

export const Footer: React.FC<{ footer: SiteContent['footer'] }> = ({ footer }) => (
  <footer className="py-10">
    <Container className="flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="text-sm text-[#55565C] text-center sm:text-left">{footer.copyright}</div>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#E11D2E]" />
        <span className="font-mono text-[10px] tracking-[0.15em] text-[#55565C]">{footer.status}</span>
      </div>
    </Container>
  </footer>
);
