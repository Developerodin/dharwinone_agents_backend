"use client";

import { LAUNCH_TEMPLATE_ASSETS } from "@/server/data/launchTemplateAssets";
import "./securify.css";

const VIDEO = LAUNCH_TEMPLATE_ASSETS.ps_securify_v1.heroVideo;
const NAV = [
  { label: "features", href: "#services" },
  { label: "about", href: "#about" },
  { label: "faq", href: "#faq" },
  { label: "contact", href: "#contact" },
] as const;

const SERVICES = [
  { title: "zero-trust access", desc: "Every request is verified, every session scoped. Role policies deploy in minutes without rewiring your identity provider." },
  { title: "real-time threat intel", desc: "Anomaly detection across logs, APIs, and endpoints. High-confidence alerts route to the right owner with full context." },
  { title: "encrypted data vault", desc: "Field-level encryption for PII and secrets at rest and in transit. Keys rotate automatically with audit trails baked in." },
  { title: "compliance automation", desc: "SOC 2, ISO 27001, and GDPR controls mapped to your stack. Evidence collection runs continuously — not before the audit." },
] as const;

function SecurifyLogo() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2L4 6V12C4 16.4183 7.13401 20.3023 12 22C16.866 20.3023 20 16.4183 20 12V6L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SecurifyPage() {
  return (
    <div className="securify-template min-h-dvh" data-site-root>
      <div className="sec-site">
        <div className="sec-video-layer" aria-hidden="true">
          <video autoPlay muted loop playsInline className="sec-video">
            <source src={VIDEO} type="video/mp4" />
          </video>
          <div className="sec-video-scrim" />
        </div>
        <div className="sec-site-content">
          <header className="relative z-20 flex justify-center px-5 pt-5 md:px-12 md:pt-6">
            <nav aria-label="Primary" className="sec-nav-pill flex w-full max-w-4xl items-center justify-between gap-4 rounded-full px-4 py-2.5 md:px-6 md:py-3">
              <a href="#hero" className="flex items-center gap-2 sec-text-soft">
                <SecurifyLogo />
                <span className="text-sm font-medium">securify</span>
              </a>
              <ul className="hidden items-center gap-7 md:flex">
                {NAV.map(({ label, href }) => (
                  <li key={href}>
                    <a href={href} className="text-sm font-light sec-text-muted hover:sec-text">{label}</a>
                  </li>
                ))}
              </ul>
              <a href="#contact" className="sec-btn hidden rounded-full px-4 py-2 text-xs font-medium md:inline-flex">get access</a>
            </nav>
          </header>
          <main>
            <section id="hero" className="relative flex min-h-dvh flex-col px-5 pb-10 pt-8 md:px-12 md:pb-14 md:pt-12">
              <div className="flex flex-1 flex-col justify-between">
                <div className="max-w-5xl">
                  <p className="mb-4 text-xs font-light tracking-[0.2em] sec-text-faint md:text-sm">enterprise-grade security</p>
                  <h1 className="sec-headline text-[clamp(3.5rem,14vw,9rem)] sec-text">
                    {["protect", "your", "data"].map((word) => (
                      <span key={word} className="sec-headline-word">{word}</span>
                    ))}
                  </h1>
                  <p className="mt-5 max-w-xl text-sm font-light leading-relaxed sec-text-muted md:mt-6 md:text-base">
                    securify encrypts, monitors, and defends your stack in real time — so your team ships fast without widening attack surface.
                  </p>
                  <a href="#contact" className="sec-btn mt-7 inline-flex rounded-full px-6 py-3 text-sm font-medium md:mt-8">start free trial</a>
                </div>
                <div className="mt-14 grid max-w-3xl grid-cols-3 gap-4 sm:gap-8 md:mt-20">
                  {[
                    { value: "+65k", label: "enterprise clients" },
                    { value: "+1.5b", label: "records protected" },
                    { value: "+300k", label: "threats blocked daily" },
                  ].map(({ value, label }) => (
                    <div key={label}>
                      <p className="sec-stat-value text-2xl sec-text sm:text-3xl md:text-4xl">{value}</p>
                      <p className="mt-1 text-xs font-light sec-text-faint sm:text-sm">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <section id="services" className="sec-section-dark scroll-mt-24 px-5 py-20 md:px-12 md:py-28">
              <div className="mx-auto max-w-5xl">
                <p className="text-xs font-light tracking-[0.2em] sec-text-faint">platform</p>
                <h2 className="mt-3 max-w-2xl text-3xl font-light leading-tight sec-text md:text-5xl" style={{ letterSpacing: "-0.03em" }}>
                  security that moves at product speed
                </h2>
                <div className="mt-12 grid gap-4 md:grid-cols-2 md:gap-5">
                  {SERVICES.map((service) => (
                    <article key={service.title} className="sec-panel rounded-2xl p-6 md:p-8">
                      <h3 className="text-xl font-medium sec-text md:text-2xl">{service.title}</h3>
                      <p className="mt-3 text-sm leading-relaxed sec-text-muted md:text-base">{service.desc}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>
            <section id="about" className="scroll-mt-24 px-5 py-20 md:px-12 md:py-28">
              <div className="mx-auto max-w-3xl">
                <p className="text-xs font-light tracking-[0.2em] sec-text-faint">about</p>
                <h2 className="mt-3 text-3xl font-light leading-tight sec-text md:text-5xl" style={{ letterSpacing: "-0.03em" }}>
                  built for teams who cannot afford downtime
                </h2>
                <p className="mt-5 text-sm leading-relaxed sec-text-muted md:text-base">
                  Securify started when a fintech team lost a week to a credential leak that should have been caught on day one. We built a platform that watches like a SOC, scales like SaaS, and stays out of the way of shipping.
                </p>
              </div>
            </section>
            <section id="contact" className="sec-section-dark scroll-mt-24 px-5 py-20 md:px-12 md:py-28">
              <div className="mx-auto max-w-xl text-center">
                <h2 className="text-3xl font-light sec-text md:text-5xl" style={{ letterSpacing: "-0.03em" }}>tell us what you need to protect</h2>
                <a href="mailto:hello@securify.io" className="sec-btn mt-8 inline-flex rounded-full px-8 py-3 text-sm font-medium">hello@securify.io</a>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
