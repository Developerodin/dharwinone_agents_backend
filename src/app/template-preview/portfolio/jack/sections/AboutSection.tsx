"use client";

import { FadeIn } from "../components/FadeIn";
import { AnimatedText } from "../components/AnimatedText";
import { ContactButton } from "../components/Buttons";
import { ABOUT_DECOR, ABOUT_TEXT } from "../data/content";

export function AboutSection() {
  return (
    <section
      id="about"
      className="relative flex min-h-screen flex-col items-center justify-center px-5 py-20 sm:px-8 md:px-10"
    >
      <FadeIn delay={0.1} x={-80} y={0} duration={0.9} className="absolute left-[1%] top-[4%] sm:left-[2%] md:left-[4%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ABOUT_DECOR.moon} alt="" className="w-[120px] sm:w-[160px] md:w-[210px]" />
      </FadeIn>
      <FadeIn
        delay={0.25}
        x={-80}
        y={0}
        duration={0.9}
        className="absolute bottom-[8%] left-[3%] sm:left-[6%] md:left-[10%]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ABOUT_DECOR.object} alt="" className="w-[100px] sm:w-[140px] md:w-[180px]" />
      </FadeIn>
      <FadeIn delay={0.15} x={80} y={0} duration={0.9} className="absolute right-[1%] top-[4%] sm:right-[2%] md:right-[4%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ABOUT_DECOR.lego} alt="" className="w-[120px] sm:w-[160px] md:w-[210px]" />
      </FadeIn>
      <FadeIn
        delay={0.3}
        x={80}
        y={0}
        duration={0.9}
        className="absolute bottom-[8%] right-[3%] sm:right-[6%] md:right-[10%]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ABOUT_DECOR.group} alt="" className="w-[130px] sm:w-[170px] md:w-[220px]" />
      </FadeIn>

      <div className="relative z-10 flex flex-col items-center gap-10 sm:gap-14 md:gap-16">
        <FadeIn delay={0} y={40}>
          <h2
            className="hero-heading text-center font-black uppercase leading-none tracking-tight"
            style={{ fontSize: "clamp(3rem, 12vw, 160px)" }}
          >
            About me
          </h2>
        </FadeIn>

        <div className="flex flex-col items-center gap-16 sm:gap-20 md:gap-24">
          <AnimatedText text={ABOUT_TEXT} />
          <ContactButton />
        </div>
      </div>
    </section>
  );
}
