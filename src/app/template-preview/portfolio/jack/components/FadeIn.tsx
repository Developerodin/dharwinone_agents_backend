"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import type { ElementType } from "react";

type FadeInProps = HTMLMotionProps<"div"> & {
  as?: ElementType;
  delay?: number;
  duration?: number;
  x?: number;
  y?: number;
};

export function FadeIn({
  as = "div",
  delay = 0,
  duration = 0.7,
  x = 0,
  y = 30,
  children,
  className,
  style,
  ...rest
}: FadeInProps) {
  const Component = motion[as as keyof typeof motion] ?? motion.div;

  return (
    <Component
      className={className}
      style={style}
      initial={{ opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "50px", amount: 0.1 }}
      transition={{ delay, duration, ease: [0.25, 0.1, 0.25, 1] }}
      {...rest}
    >
      {children}
    </Component>
  );
}
