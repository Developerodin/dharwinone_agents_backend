"use client";

import { useEffect, useRef, useState } from "react";
import { MARQUEE_GIFS } from "../data/content";

function triple(items: string[]) {
  return [...items, ...items, ...items];
}

function MarqueeRow({
  images,
  direction,
  offset,
}: {
  images: string[];
  direction: "left" | "right";
  offset: number;
}) {
  const translate = direction === "right" ? offset - 200 : -(offset - 200);

  return (
    <div
      className="flex w-max gap-3"
      style={{ transform: `translate3d(${translate}px, 0, 0)`, willChange: "transform" }}
    >
      {triple(images).map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${src}-${i}`}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-[270px] w-[420px] shrink-0 rounded-2xl object-cover"
        />
      ))}
    </div>
  );
}

export function MarqueeSection() {
  const ref = useRef<HTMLElement>(null);
  const sectionTopRef = useRef(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const measure = () => {
      if (ref.current) {
        sectionTopRef.current = ref.current.offsetTop;
      }
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });

    const onScroll = () => {
      const next = (window.scrollY - sectionTopRef.current + window.innerHeight) * 0.3;
      setOffset(next);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const row1 = MARQUEE_GIFS.slice(0, 11);
  const row2 = MARQUEE_GIFS.slice(11);

  return (
    <section ref={ref} className="overflow-x-clip bg-[#0C0C0C] pb-10 pt-24 sm:pt-32 md:pt-40">
      <div className="flex flex-col gap-3 overflow-x-clip">
        <MarqueeRow images={row1} direction="right" offset={offset} />
        <MarqueeRow images={row2} direction="left" offset={offset} />
      </div>
    </section>
  );
}
