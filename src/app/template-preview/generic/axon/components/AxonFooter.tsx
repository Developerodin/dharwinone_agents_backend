"use client";

import { useReducedMotion } from "framer-motion";
import type { MouseEvent } from "react";
import { AxonLogo } from "./AxonLogo";
import { ScrollReveal } from "./ScrollReveal";
import { scrollToSection } from "./smoothScroll";

const FOOTER_LINKS = [
  { label: "Services", href: "#services" },
  { label: "About", href: "#about" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
] as const;

export function AxonFooter() {
  const reduceMotion = useReducedMotion();

  const handleAnchorClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    scrollToSection(href, Boolean(reduceMotion));
  };

  return (
    <ScrollReveal
      as="footer"
      className="border-t border-white/25 bg-white/45 px-4 py-10 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <AxonLogo />
          <span className="text-sm font-medium text-[#1B133C]/80">Axon</span>
        </div>
        <p className="text-xs text-[#1B133C]/55">Digital workers for mundane workflows.</p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-4 text-xs font-medium text-[#1B133C]/65">
            {FOOTER_LINKS.map(({ label, href }) => (
              <li key={href}>
                <a
                  href={href}
                  onClick={(event) => handleAnchorClick(event, href)}
                  className="axon-focus rounded-sm hover:text-[#1B133C]"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </ScrollReveal>
  );
}
