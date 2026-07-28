"use client";

import { motion, useAnimation, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { AXON_EASE, scrollRevealHidden, scrollRevealVisible, staggerContainer, staggerItem } from "./motionPresets";

type StaggerRevealProps = {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "ul";
  sectionId?: string;
};

export function StaggerReveal({ children, className, as = "div", sectionId }: StaggerRevealProps) {
  const reduceMotion = useReducedMotion();
  const controls = useAnimation();
  const Component = motion[as];

  useEffect(() => {
    if (!sectionId || reduceMotion) return;

    const handleNavScroll = (event: Event) => {
      const targetId = (event as CustomEvent<string>).detail;
      if (targetId !== sectionId) return;

      controls.set("hidden");
      controls.start("visible");
    };

    window.addEventListener("axon-nav-scroll", handleNavScroll);
    return () => window.removeEventListener("axon-nav-scroll", handleNavScroll);
  }, [controls, reduceMotion, sectionId]);

  if (reduceMotion) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px", amount: 0.12 }}
      variants={staggerContainer}
      animate={controls}
    >
      {children}
    </Component>
  );
}

type StaggerItemProps = {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
};

export function StaggerItem({ children, className, as = "div" }: StaggerItemProps) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as];

  if (reduceMotion) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <Component
      className={className}
      variants={staggerItem}
      transition={{ duration: 0.5, ease: AXON_EASE }}
    >
      {children}
    </Component>
  );
}
