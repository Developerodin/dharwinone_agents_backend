"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AxonNav } from "./AxonNav";
import { AXON_EASE } from "./motionPresets";
import { scrollToSection } from "./smoothScroll";

export function AxonHero() {
  const reduceMotion = useReducedMotion();

  const fadeUp = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 24, filter: "blur(8px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { delay, duration: 0.65, ease: AXON_EASE },
        };

  return (
    <section className="relative flex min-h-dvh w-full flex-col">
      <AxonNav />

      <div className="axon-hero-content relative z-10 mx-auto mt-8 flex flex-1 flex-col items-center px-4 pb-12 text-center md:mt-16">
        <motion.div
          {...fadeUp(0.1)}
          className="mb-6 inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/55 px-4 py-2 text-sm font-medium backdrop-blur-xl"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded bg-orange-500 text-xs font-bold text-[#FEFEFE]">
            Y
          </span>
          <span>Funded by Y Combinator</span>
        </motion.div>

        <motion.h1
          {...fadeUp(0.2)}
          className="axon-heading axon-hero-text max-w-4xl text-4xl leading-[0.95] tracking-tight text-[#1B133C] sm:text-5xl md:text-7xl lg:text-8xl"
        >
          <span className="block">Deploy digital workers</span>
          <span className="block">for mundane workflows</span>
        </motion.h1>

        <motion.p
          {...fadeUp(0.32)}
          className="axon-hero-text mt-5 max-w-3xl text-xs leading-relaxed text-[#1B133C]/85 sm:mt-6 sm:text-sm md:text-base"
        >
          Eliminate your tedious browser work and 10x your team&apos;s capacity. Put intelligent agents on every
          routine process so you grow faster and deliver more for clients, effortlessly.
        </motion.p>

        <motion.a
          {...fadeUp(0.44)}
          href="#contact"
          onClick={(event) => {
            event.preventDefault();
            scrollToSection("#contact", Boolean(reduceMotion));
          }}
          className="axon-focus mt-7 rounded-xl bg-[#FEFEFE]/92 px-6 py-3 text-sm font-semibold text-[#1B133C] shadow-[0px_4px_12px_rgba(0,0,0,0.15)] transition-all duration-300 hover:shadow-[0px_6px_16px_rgba(0,0,0,0.2)] sm:mt-8 sm:px-8 sm:py-3.5"
        >
          Get Early Access
        </motion.a>
      </div>
    </section>
  );
}
