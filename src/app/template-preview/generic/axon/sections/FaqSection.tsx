"use client";

import { useId, useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import { ScrollReveal } from "../components/ScrollReveal";
import { StaggerItem, StaggerReveal } from "../components/StaggerReveal";

const FAQ_ITEMS = [
  {
    question: "What is a digital worker?",
    answer:
      "A digital worker is an agent trained on your process. It uses the same websites and tools your team uses, follows explicit rules, and escalates when something looks off.",
  },
  {
    question: "How is Axon different from traditional RPA?",
    answer:
      "Classic RPA breaks when a UI changes. Axon agents adapt to layout shifts, handle multi-step browser flows, and keep a readable log of every action for review.",
  },
  {
    question: "Is our client data secure?",
    answer:
      "Credentials stay encrypted, runs are scoped per workspace, and you choose which domains an agent can touch. Sensitive steps can require human approval before submission.",
  },
  {
    question: "How long until our first workflow goes live?",
    answer:
      "Most teams ship a pilot in 48 hours: one high-volume task, one owner, measurable time saved. We expand from there once the handoff feels natural.",
  },
  {
    question: "Do you replace our existing stack?",
    answer:
      "No. Axon sits on top of the tools you already pay for. We integrate through the browser and standard exports, not rip-and-replace migrations.",
  },
] as const;

export function FaqSection() {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="axon-section scroll-mt-24 px-4 py-20 md:py-28">
      <div className="relative mx-auto max-w-3xl">
        <ScrollReveal sectionId="faq">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1B133C]/50">FAQ</p>
          <h2 className="axon-heading mt-3 text-3xl leading-tight text-[#1B133C] md:text-5xl">
            Answers before you wire us in
          </h2>
        </ScrollReveal>

        <StaggerReveal sectionId="faq" as="ul" className="mt-10 space-y-3">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            const panelId = `${baseId}-panel-${index}`;
            const buttonId = `${baseId}-button-${index}`;

            return (
              <StaggerItem key={item.question} as="li">
                <GlassPanel className="p-0">
                  <h3>
                    <button
                      id={buttonId}
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpenIndex(isOpen ? null : index)}
                      className="axon-focus flex w-full items-center justify-between gap-4 rounded-2xl px-6 py-5 text-left md:px-8"
                    >
                      <span className="text-sm font-semibold text-[#1B133C] md:text-base">{item.question}</span>
                      <span
                        aria-hidden="true"
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1B133C]/15 text-lg leading-none text-[#1B133C]/70 transition-transform duration-200 ${
                          isOpen ? "rotate-45" : ""
                        }`}
                      >
                        +
                      </span>
                    </button>
                  </h3>
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    hidden={!isOpen}
                    className="border-t border-[#1B133C]/8 px-6 pb-5 pt-0 md:px-8 md:pb-6"
                  >
                    <p className="pt-4 text-sm leading-relaxed text-[#1B133C]/75 md:text-base">{item.answer}</p>
                  </div>
                </GlassPanel>
              </StaggerItem>
            );
          })}
        </StaggerReveal>
      </div>
    </section>
  );
}
