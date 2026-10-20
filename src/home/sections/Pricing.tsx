import React, { useState } from 'react';
import type { Billing, SiteContent } from '../../content/siteContent.types.ts';
import { Container, SectionHead, SmartLink } from './ui.tsx';

export const Pricing: React.FC<{ pricing: SiteContent['pricing'] }> = ({ pricing }) => {
  const [billing, setBilling] = useState<Billing>('monthly');
  const hasYearly = pricing.plans.some((p) => p.price?.yearly?.amount);

  return (
    <section id="pricing" className="py-20 lg:py-24 bg-[#131418] border-b border-[#24262B] scroll-mt-16">
      <Container>
        <SectionHead title={pricing.title} subtitle={pricing.subtitle} center />

        {hasYearly && (
          <div className="mt-10 flex justify-center">
            <div className="inline-flex border border-[#24262B] bg-[#0B0C0E] p-1" role="radiogroup" aria-label="Billing period">
              {(['monthly', 'yearly'] as Billing[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={billing === b}
                  onClick={() => setBilling(b)}
                  className={`px-5 py-2 font-mono text-[11px] tracking-[0.15em] uppercase flex items-center gap-2 transition-colors ${billing === b ? 'bg-[#F4F2EE] text-[#0B0C0E]' : 'text-[#93959C] hover:text-[#F4F2EE]'}`}
                >
                  {pricing.toggle[b]}
                  {b === 'yearly' && pricing.toggle.yearlyBadge && (
                    <span className={`px-1.5 py-0.5 text-[9px] ${billing === b ? 'bg-[#E11D2E] text-white' : 'bg-[#E11D2E]/15 text-[#E11D2E]'}`}>{pricing.toggle.yearlyBadge}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {pricing.plans.length > 0 ? (
          <div className={`mt-12 grid gap-6 mx-auto ${pricing.plans.length === 1 ? 'max-w-md' : pricing.plans.length === 2 ? 'md:grid-cols-2 max-w-4xl' : 'md:grid-cols-3'}`}>
            {pricing.plans.map((plan) => {
              const price = plan.price?.[billing] || plan.price?.monthly;
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col p-8 border ${plan.highlight ? 'border-[#E11D2E] bg-gradient-to-b from-[#1a0e10] to-[#0B0C0E] shadow-[0_0_60px_-20px_rgba(225,29,46,0.45)]' : 'border-[#24262B] bg-[#0B0C0E]'}`}
                >
                  {plan.badge && (
                    <span className="absolute -top-3 left-8 bg-[#E11D2E] text-white px-3 py-1 text-[10px] font-mono tracking-[0.15em] uppercase">{plan.badge}</span>
                  )}
                  <h3 className="font-display font-bold text-2xl text-[#F4F2EE] uppercase tracking-tight">{plan.name}</h3>
                  {plan.tagline && <p className="mt-1 text-[#93959C]">{plan.tagline}</p>}
                  {price && (
                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="font-display font-extrabold text-5xl text-[#F4F2EE]">{price.amount}</span>
                      <span className="text-[#93959C]">{price.period}</span>
                    </div>
                  )}
                  <ul className="mt-8 space-y-3.5 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-3 text-[#C9CBD1]">
                        <svg className="w-5 h-5 text-[#E11D2E] shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <SmartLink
                    href={plan.cta.href}
                    className={`mt-10 block text-center py-3.5 font-display font-bold tracking-wide uppercase transition-colors ${plan.highlight ? 'bg-[#E11D2E] text-white hover:bg-[#8C1220]' : 'bg-[#F4F2EE] text-[#0B0C0E] hover:bg-[#E11D2E] hover:text-white'}`}
                  >
                    {plan.cta.label}
                  </SmartLink>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-10 text-center text-[#93959C]">
            <a href="#contact" className="underline hover:text-[#F4F2EE]">Contact us</a> for pricing.
          </p>
        )}
      </Container>
    </section>
  );
};
