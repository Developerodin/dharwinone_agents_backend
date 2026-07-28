"use client";

import { FadeIn } from "../components/FadeIn";
import { CONTACT } from "../data/content";

export function ContactSection() {
  return (
    <section
      id="contact"
      className="relative bg-[#0C0C0C] px-5 pb-10 pt-24 sm:px-8 md:px-10 md:pt-32"
    >
      <div className="mx-auto max-w-6xl">
        <FadeIn y={20}>
          <p className="mb-6 text-center text-xs font-medium uppercase tracking-[0.3em] text-[#D7E2EA]/50 sm:text-sm">
            {CONTACT.eyebrow}
          </p>
        </FadeIn>

        <FadeIn y={40} delay={0.1}>
          <h2
            className="hero-heading text-center font-black uppercase leading-[0.9] tracking-tight"
            style={{ fontSize: "clamp(3rem, 12vw, 160px)" }}
          >
            {CONTACT.headline[0]}
            <br />
            {CONTACT.headline[1]}
          </h2>
        </FadeIn>

        {/* Oversized email is the primary CTA — the section's signature moment. */}
        <FadeIn y={30} delay={0.2}>
          <div className="mt-12 flex justify-center sm:mt-16">
            <a
              href={`mailto:${CONTACT.email}`}
              className="jack-email group inline-flex items-center gap-3 rounded-full font-black uppercase tracking-tight text-[#D7E2EA] outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-[#D7E2EA] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0C0C0C] sm:gap-5"
              style={{ fontSize: "clamp(1.35rem, 5vw, 4rem)" }}
            >
              <span>{CONTACT.email}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
                className="h-[0.7em] w-[0.7em] shrink-0 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"
              >
                <path d="M7 17L17 7M17 7H8M17 7V16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </FadeIn>

        {/* Availability + socials */}
        <FadeIn y={20} delay={0.3}>
          <div className="mt-20 flex flex-col items-center gap-8 border-t border-[#D7E2EA]/15 pt-10 sm:mt-24 md:flex-row md:justify-between">
            <span className="text-sm font-light uppercase tracking-wider text-[#D7E2EA]/70">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#B600A8] align-middle" />
              {CONTACT.availability}
            </span>
            <nav className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
              {CONTACT.socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium uppercase tracking-wider text-[#D7E2EA] transition-opacity hover:opacity-60"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </FadeIn>

        {/* Footer bar */}
        <div className="mt-10 flex flex-col items-center gap-3 pb-2 text-xs uppercase tracking-wider text-[#D7E2EA]/40 sm:flex-row sm:justify-between">
          <span>
            {CONTACT.name} · {CONTACT.role}
          </span>
          <span>© 2026 — All rights reserved</span>
          <a href="#top" className="transition-opacity hover:opacity-100 hover:text-[#D7E2EA]/80">
            Back to top ↑
          </a>
        </div>
      </div>
    </section>
  );
}
