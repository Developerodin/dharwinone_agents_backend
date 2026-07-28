"use client";

import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef } from "react";

type AnimatedTextProps = {
  text: string;
  className?: string;
};

export function AnimatedText({ text, className }: AnimatedTextProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.8", "end 0.2"],
  });

  const chars = text.split("");

  return (
    <p
      ref={ref}
      className={className}
      style={{
        color: "#D7E2EA",
        fontWeight: 500,
        textAlign: "center",
        lineHeight: 1.625,
        maxWidth: "560px",
        fontSize: "clamp(1rem, 2vw, 1.35rem)",
      }}
    >
      {chars.map((char, i) => (
        <Char key={`${char}-${i}`} char={char} index={i} total={chars.length} progress={scrollYProgress} />
      ))}
    </p>
  );
}

function Char({
  char,
  index,
  total,
  progress,
}: {
  char: string;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const start = index / total;
  const end = Math.min(1, start + 1 / total + 0.05);
  const opacity = useTransform(progress, [start, end], [0.2, 1]);

  if (char === " ") {
    return <span aria-hidden="true">&nbsp;</span>;
  }

  return (
    <span className="relative inline-block whitespace-pre">
      <span className="invisible">{char}</span>
      <motion.span className="absolute left-0 top-0" style={{ opacity }} aria-hidden="true">
        {char}
      </motion.span>
    </span>
  );
}
