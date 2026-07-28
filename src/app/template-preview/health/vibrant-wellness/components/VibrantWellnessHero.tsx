"use client";

import { CircleUserRound, Menu, X } from "lucide-react";
import { useState } from "react";
import { VibrantWellnessLogo } from "./VibrantWellnessLogo";

import { LAUNCH_TEMPLATE_ASSETS } from "@/server/data/launchTemplateAssets";

export const VIBRANT_WELLNESS_VIDEO_URL = LAUNCH_TEMPLATE_ASSETS.he_vibrant_wellness_v1.heroVideo;

const AVATARS = [
  "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100",
  "https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=100",
  "https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100",
  "https://images.pexels.com/photos/697509/pexels-photo-697509.jpeg?auto=compress&cs=tinysrgb&w=100",
] as const;

const NAV_LINKS = [
  { label: "Home", href: "#hero", active: true },
  { label: "Our Approach", href: "#approach", active: false },
  { label: "Healing Methods", href: "#methods", active: false },
] as const;

function DotPatternIcon() {
  const positions = [
    [0, 0],
    [8, 0],
    [16, 0],
    [0, 8],
    [8, 8],
    [16, 8],
    [0, 16],
    [8, 16],
    [16, 16],
  ];
  return (
    <div className="relative mb-3 h-5 w-5" aria-hidden="true">
      {positions.map(([left, top], i) => (
        <span
          key={i}
          className="absolute h-[2.5px] w-[2.5px] bg-white/60"
          style={{ left: `${left}px`, top: `${top}px` }}
        />
      ))}
    </div>
  );
}

function CheckerIcon() {
  const cells = [
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
  ];
  return (
    <div className="mb-3 grid w-5 grid-cols-3 gap-[2px]" aria-hidden="true">
      {cells.map((filled, i) => (
        <span key={i} className={`h-1 w-1 rounded-[1px] ${filled ? "bg-white/60" : "bg-white/0"}`} />
      ))}
    </div>
  );
}

export function VibrantWellnessHero() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <section id="hero" className="relative h-dvh w-full overflow-hidden">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
        aria-hidden="true"
      >
        <source src={VIBRANT_WELLNESS_VIDEO_URL} type="video/mp4" />
      </video>

      <nav className="relative z-20 flex items-center justify-between px-5 pt-6 sm:px-8 sm:pt-8 md:px-16 lg:px-20">
        <a href="#hero" aria-label="Vibrant Wellness home" className="shrink-0 md:h-9 md:w-9">
          <VibrantWellnessLogo className="h-8 w-8 md:h-9 md:w-9" />
        </a>

        <div className="liquid-glass hidden rounded-full px-8 py-3 md:flex">
          <ul className="flex items-center gap-8">
            {NAV_LINKS.map(({ label, href, active }) => (
              <li key={label}>
                <a
                  href={href}
                  className={`text-sm font-medium transition-opacity ${active ? "text-white" : "text-white/70 hover:text-white"}`}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="liquid-glass hidden h-10 w-10 items-center justify-center rounded-full md:flex">
          <CircleUserRound className="h-5 w-5 text-white/80" strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">Account</span>
        </div>

        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="liquid-glass relative z-50 flex h-10 w-10 items-center justify-center rounded-full md:hidden"
        >
          <Menu
            className={`absolute h-5 w-5 text-white transition-all duration-300 ${
              menuOpen ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
            }`}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <X
            className={`absolute h-5 w-5 text-white transition-all duration-300 ${
              menuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
            }`}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      </nav>

      <div
        className={`fixed inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl transition-opacity duration-500 ease-out md:hidden ${
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!menuOpen}
      >
        <div
          className={`flex flex-col items-center gap-8 transition-all duration-500 ease-out ${
            menuOpen ? "translate-y-0 opacity-100" : "-translate-y-8 opacity-0"
          }`}
        >
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              onClick={closeMenu}
              className="text-2xl font-medium text-white"
            >
              {label}
            </a>
          ))}
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="liquid-glass flex h-10 w-10 items-center justify-center rounded-full">
              <CircleUserRound className="h-5 w-5 text-white/80" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <span className="text-sm font-light text-white/60">Account</span>
          </div>
        </div>
      </div>

      <div
        className={`relative z-10 flex h-[calc(100dvh-4.5rem)] flex-col justify-between px-5 pb-8 pt-0 sm:px-8 sm:pb-10 md:px-16 md:pb-12 lg:px-20 ${
          menuOpen ? "pointer-events-none opacity-0 md:pointer-events-auto md:opacity-100" : "opacity-100"
        } transition-opacity duration-300`}
      >
        <div className="mt-14 max-w-2xl sm:mt-20 md:mt-28">
          <div className="liquid-glass mb-5 inline-flex items-center gap-2.5 rounded-full px-3 py-1.5 sm:mb-6 sm:gap-3 sm:px-4 sm:py-2">
            <div className="flex -space-x-2">
              {AVATARS.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt=""
                  className="h-5 w-5 rounded-full border-2 border-white/20 object-cover sm:h-6 sm:w-6"
                />
              ))}
            </div>
            <span className="text-xs font-light text-white/80 sm:text-sm">our path to natural wellness</span>
          </div>

          <h1
            className="text-4xl font-normal leading-[1.05] text-white sm:text-5xl md:text-6xl lg:text-7xl"
            style={{ letterSpacing: "-0.05em" }}
          >
            Heal Your Body
            <br />
            Naturally
          </h1>

          <p className="mt-4 text-sm font-light text-white/70 sm:mt-5 sm:text-base md:text-lg">
            Holistic wellness. Transformative results.
          </p>

          <button
            type="button"
            className="liquid-glass mt-6 rounded-full px-6 py-3 text-sm font-medium text-white transition-colors duration-300 hover:bg-white/10 sm:mt-8 sm:px-7 sm:py-3.5"
          >
            Begin Your Journey
          </button>
        </div>

        <div className="flex items-end gap-6 sm:gap-10 md:gap-16">
          <div>
            <DotPatternIcon />
            <p className="text-xl font-normal text-white sm:text-2xl md:text-3xl">48 Hours</p>
            <p className="text-xs font-light text-white/60 sm:text-sm">Initial Consultation</p>
          </div>
          <div>
            <CheckerIcon />
            <p className="text-xl font-normal text-white sm:text-2xl md:text-3xl">Initial Consultation</p>
            <p className="text-xs font-light text-white/60 sm:text-sm">Healing Sessions</p>
          </div>
        </div>
      </div>
    </section>
  );
}
