"use client";

import { GlassPanel } from "../components/GlassPanel";
import { ScrollReveal } from "../components/ScrollReveal";

export function ContactSection() {
  return (
    <section id="contact" className="axon-section scroll-mt-24 px-4 py-20 md:py-28">
      <div className="relative mx-auto max-w-5xl">
        <div className="grid gap-10 md:grid-cols-[0.95fr_1.05fr] md:items-start md:gap-14">
          <ScrollReveal sectionId="contact">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1B133C]/50">Contact</p>
            <h2 className="axon-heading mt-3 text-3xl leading-tight text-[#1B133C] md:text-5xl">
              Tell us what your team keeps redoing
            </h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-[#1B133C]/75 md:text-base">
              Share one workflow that drains time each week. We will reply within one business day with a pilot
              scope and expected hours saved.
            </p>
            <dl className="mt-8 space-y-4 text-sm text-[#1B133C]/75">
              <div>
                <dt className="font-semibold text-[#1B133C]">Email</dt>
                <dd>
                  <a href="mailto:hello@axon.work" className="axon-focus rounded-sm underline-offset-2 hover:underline">
                    hello@axon.work
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#1B133C]">Offices</dt>
                <dd>San Francisco · Dubai · Bengaluru</dd>
              </div>
            </dl>
          </ScrollReveal>

          <ScrollReveal sectionId="contact" delay={0.14} y={36}>
            <GlassPanel as="section" aria-labelledby="axon-contact-form-title">
              <h3 id="axon-contact-form-title" className="sr-only">
                Request early access
              </h3>
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                }}
              >
                <div>
                  <label htmlFor="axon-name" className="block text-sm font-medium text-[#1B133C]">
                    Name
                  </label>
                  <input
                    id="axon-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    className="axon-input mt-2 w-full"
                    placeholder="Jordan Lee"
                  />
                </div>
                <div>
                  <label htmlFor="axon-email" className="block text-sm font-medium text-[#1B133C]">
                    Work email
                  </label>
                  <input
                    id="axon-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="axon-input mt-2 w-full"
                    placeholder="you@company.com"
                  />
                </div>
                <div>
                  <label htmlFor="axon-workflow" className="block text-sm font-medium text-[#1B133C]">
                    Workflow to automate
                  </label>
                  <textarea
                    id="axon-workflow"
                    name="workflow"
                    rows={4}
                    required
                    className="axon-input mt-2 w-full resize-y"
                    placeholder="Example: pull weekly status from three client portals and post a summary to Slack"
                  />
                </div>
                <button
                  type="submit"
                  className="axon-focus w-full rounded-xl bg-[#1B133C] px-6 py-3.5 text-sm font-semibold text-[#FEFEFE] shadow-[0px_4px_12px_rgba(27,19,60,0.2)] transition-all duration-300 hover:shadow-[0px_6px_16px_rgba(27,19,60,0.28)] sm:w-auto sm:px-8"
                >
                  Get Early Access
                </button>
              </form>
            </GlassPanel>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
