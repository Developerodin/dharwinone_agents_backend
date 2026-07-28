"use client";

import { FadeIn } from "../components/FadeIn";
import { ContactButton } from "../components/Buttons";
import { Magnet } from "../components/Magnet";
import { HERO_PORTRAIT } from "../data/content";

const NAV = [
  { label: "About", href: "#about" },
  { label: "Price", href: "#price" },
  { label: "Projects", href: "#projects" },
  { label: "Contact", href: "#contact" },
];

export function HeroSection() {
  return (
    <section id="top" className="relative flex h-screen min-h-[680px] flex-col overflow-x-clip bg-[#0C0C0C]">
      <FadeIn delay={0} y={-20} className="relative z-30">
        <nav className="flex justify-between px-6 pt-6 md:px-10 md:pt-8">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm font-medium uppercase tracking-wider text-[#D7E2EA] transition-opacity duration-200 hover:opacity-70 md:text-lg lg:text-[1.4rem]"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </FadeIn>

      <div className="jack-hero-headline-wrap relative z-10 mt-6 px-6 sm:mt-4 md:-mt-5 md:px-10">
        <FadeIn delay={0.15} y={40}>
          <h1 className="hero-heading jack-hero-headline jack-hero-headline--inline w-full font-black uppercase leading-none tracking-tight" style={{ ["--jack-hero-fit" as string]: "min(17.5vw, calc(100cqi / 12 / 0.65))" }}>
            Hi, i&apos;m jack
          </h1>
        </FadeIn>
      </div>

      <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center pb-0 sm:items-end">
        <Magnet
          padding={150}
          strength={3}
          className="pointer-events-auto absolute left-1/2 top-1/2 w-[280px] -translate-x-1/2 -translate-y-[42%] sm:top-auto sm:bottom-0 sm:w-[360px] sm:translate-y-0 md:w-[440px] lg:w-[520px]"
        >
          <FadeIn delay={0.6} y={30} className="w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={HERO_PORTRAIT}
              alt="Jack portrait"
              className="h-auto w-full object-contain object-bottom"
              draggable={false}
            />
          </FadeIn>
        </Magnet>
      </div>

      <div className="relative z-30 mt-auto flex items-end justify-between px-6 pb-7 sm:pb-8 md:px-10 md:pb-10">
        <FadeIn delay={0.35} y={20}>
          <p
            className="max-w-[160px] font-light uppercase leading-snug tracking-wide text-[#D7E2EA] sm:max-w-[220px] md:max-w-[260px]"
            style={{ fontSize: "clamp(0.75rem, 1.4vw, 1.5rem)" }}
          >
            a 3d creator driven by crafting striking and unforgettable projects
          </p>
        </FadeIn>
        <FadeIn delay={0.5} y={20}>
          <ContactButton />
        </FadeIn>
      </div>
    </section>
  );
}
