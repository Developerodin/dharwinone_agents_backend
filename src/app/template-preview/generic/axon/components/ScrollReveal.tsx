"use client";

import { motion, useAnimation, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { AXON_EASE, scrollRevealHidden, scrollRevealVisible } from "./motionPresets";

type ScrollRevealProps = HTMLMotionProps<"div"> & {
  children: ReactNode;
  delay?: number;
  duration?: number;
  y?: number;
  as?: "div" | "section" | "article" | "li" | "footer";
  sectionId?: string;
};

export function ScrollReveal({
  children,
  delay = 0,
  duration = 0.55,
  y = 28,
  as = "div",
  sectionId,
  className,
  ...rest
}: ScrollRevealProps) {
  const reduceMotion = useReducedMotion();
  const controls = useAnimation();
  const Component = motion[as];

  useEffect(() => {
    if (!sectionId || reduceMotion) return;

    const handleNavScroll = (event: Event) => {
      const targetId = (event as CustomEvent<string>).detail;
      if (targetId !== sectionId) return;

      controls.set({ ...scrollRevealHidden, y });
      controls.start({
        ...scrollRevealVisible,
        transition: { delay: 0.15, duration, ease: AXON_EASE },
      });
    };

    window.addEventListener("axon-nav-scroll", handleNavScroll);
    return () => window.removeEventListener("axon-nav-scroll", handleNavScroll);
  }, [controls, delay, duration, reduceMotion, sectionId, y]);

  if (reduceMotion) {
    const Tag = as;
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    );
  }

  return (
    <Component
      className={className}
      initial={{ ...scrollRevealHidden, y }}
      whileInView={scrollRevealVisible}
      viewport={{ once: true, margin: "-40px", amount: 0.25 }}
      transition={{ delay, duration, ease: AXON_EASE }}
      animate={controls}
      {...rest}
    >
      {children}
    </Component>
  );
}
