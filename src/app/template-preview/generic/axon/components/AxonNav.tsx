"use client";

import { useReducedMotion } from "framer-motion";
import type { MouseEvent } from "react";
import { AxonLogo } from "./AxonLogo";
import { scrollToSection, scrollToTop } from "./smoothScroll";

const NAV_LINKS = [
  { label: "Services", href: "#services" },
  { label: "About", href: "#about" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
] as const;

export function AxonNav() {
  const reduceMotion = useReducedMotion();

  const handleAnchorClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith("#") || href === "#") return;
    event.preventDefault();
    scrollToSection(href, Boolean(reduceMotion));
  };

  return (
    <header className="relative z-10 flex justify-center px-4 pt-4 md:pt-6">
      <nav
        aria-label="Primary"
        className="flex w-full max-w-4xl items-center justify-between rounded-xl border border-white/30 bg-white/55 px-4 py-3 shadow-[0_8px_32px_rgba(27,19,60,0.12)] backdrop-blur-xl md:px-6"
      >
        <a
          href="#"
          className="axon-focus rounded-sm"
          aria-label="Axon home"
          onClick={(event) => {
            event.preventDefault();
            scrollToTop(Boolean(reduceMotion));
          }}
        >
          <AxonLogo />
        </a>
        <ul className="hidden items-center gap-6 sm:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <li key={href}>
              <a
                href={href}
                onClick={(event) => handleAnchorClick(event, href)}
                className="axon-focus rounded-sm text-sm font-medium text-[#1B133C]/85 transition-colors duration-200 hover:text-[#1B133C]"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
        <a
          href="#contact"
          onClick={(event) => handleAnchorClick(event, "#contact")}
          className="axon-focus hidden rounded-xl bg-[#1B133C] px-4 py-2 text-sm font-semibold text-[#FEFEFE] transition-opacity duration-200 hover:opacity-90 sm:inline-flex"
        >
          Get access
        </a>
        <a
          href="#contact"
          onClick={(event) => handleAnchorClick(event, "#contact")}
          className="axon-focus rounded-xl bg-[#1B133C] px-3 py-1.5 text-xs font-semibold text-[#FEFEFE] sm:hidden"
        >
          Access
        </a>
      </nav>
    </header>
  );
}
