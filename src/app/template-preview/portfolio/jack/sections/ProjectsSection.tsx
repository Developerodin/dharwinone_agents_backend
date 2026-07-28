"use client";

import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useRef, type CSSProperties } from "react";
import { LiveProjectButton } from "../components/Buttons";
import { PROJECTS } from "../data/content";

const STICKY_BASE = 96; // top-24
const STICKY_BASE_MD = 128; // top-32
const STACK_STEP = 28;

function useStickyTop(index: number) {
  return {
    mobile: STICKY_BASE + index * STACK_STEP,
    desktop: STICKY_BASE_MD + index * STACK_STEP,
  };
}

function ProjectImage({
  src,
  className,
  style,
  imageScale,
}: {
  src: string;
  className?: string;
  style?: CSSProperties;
  imageScale: MotionValue<number>;
}) {
  return (
    <div className={`overflow-hidden ${className ?? ""}`} style={style}>
      <motion.div className="h-full w-full" style={{ scale: imageScale }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-full w-full object-cover" />
      </motion.div>
    </div>
  );
}

// col2 spans the full height of the two stacked col1 images (+ gap-3).
const COL2_HEIGHT =
  "calc(clamp(130px, 16vw, 230px) + clamp(160px, 22vw, 340px) + 0.75rem)";

function ProjectCard({
  project,
  index,
  total,
  progress,
}: {
  project: (typeof PROJECTS)[number];
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sticky = useStickyTop(index);
  const targetScale = 1 - (total - 1 - index) * 0.03;
  const rangeStart = index / total;

  const scale = useTransform(
    progress,
    [rangeStart, 1],
    [1, targetScale],
  );

  const { scrollYProgress: imageProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "start start"],
  });
  const imageScale = useTransform(imageProgress, [0, 1], [1.15, 1]);

  const cardStyle = {
    ["--stack-top" as string]: `${sticky.mobile}px`,
    ["--stack-top-md" as string]: `${sticky.desktop}px`,
  } as CSSProperties;

  return (
    <div ref={containerRef} className="relative h-[85vh]">
      {/* Sticky on a plain div — never apply transform here (breaks stack + scale). */}
      <div
        className="jack-project-card sticky w-full"
        style={{
          ...cardStyle,
          zIndex: index + 1,
        }}
      >
        <motion.div
          style={{
            scale,
            transformOrigin: "top center",
          }}
          className="flex flex-col rounded-[40px] border-2 border-[#D7E2EA] bg-[#0C0C0C] p-4 sm:rounded-[50px] sm:p-6 md:rounded-[60px] md:p-8"
        >
          <div className="mb-4 flex shrink-0 items-center justify-between gap-4 sm:mb-6">
            <div className="flex items-center gap-4 sm:gap-6">
              <span
                className="hero-heading font-black leading-none"
                style={{ fontSize: "clamp(3rem, 10vw, 120px)" }}
              >
                {project.num}
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-sm uppercase tracking-widest text-[#D7E2EA]/70">
                  {project.category}
                </span>
                <h3
                  className="font-medium text-[#D7E2EA]"
                  style={{ fontSize: "clamp(1.1rem, 2vw, 1.75rem)" }}
                >
                  {project.name}
                </h3>
              </div>
            </div>
            <LiveProjectButton />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:gap-4">
            <div className="flex w-full flex-col gap-3 md:w-[40%]">
              <ProjectImage
                src={project.col1Top}
                imageScale={imageScale}
                className="rounded-[40px] sm:rounded-[50px] md:rounded-[60px]"
                style={{ height: "clamp(130px, 16vw, 230px)" }}
              />
              <ProjectImage
                src={project.col1Bottom}
                imageScale={imageScale}
                className="rounded-[40px] sm:rounded-[50px] md:rounded-[60px]"
                style={{ height: "clamp(160px, 22vw, 340px)" }}
              />
            </div>
            <ProjectImage
              src={project.col2}
              imageScale={imageScale}
              className="w-full rounded-[40px] sm:rounded-[50px] md:w-[60%] md:rounded-[60px]"
              style={{ height: COL2_HEIGHT }}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export function ProjectsSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  return (
    <section
      id="projects"
      className="relative z-10 -mt-10 rounded-t-[40px] bg-[#0C0C0C] px-5 pb-24 pt-16 sm:-mt-12 sm:rounded-t-[50px] sm:px-8 md:-mt-14 md:rounded-t-[60px] md:px-10 md:pt-20"
    >
      <h2
        className="hero-heading mb-12 text-center font-black uppercase leading-none tracking-tight sm:mb-16"
        style={{ fontSize: "clamp(3rem, 12vw, 160px)" }}
      >
        Project
      </h2>

      <div ref={containerRef} className="relative mx-auto max-w-6xl pb-[30vh]">
        {PROJECTS.map((project, index) => (
          <ProjectCard
            key={project.num}
            project={project}
            index={index}
            total={PROJECTS.length}
            progress={scrollYProgress}
          />
        ))}
      </div>
    </section>
  );
}
