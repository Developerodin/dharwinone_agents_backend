"use client";

import { useRef, useState, type ReactNode, type CSSProperties } from "react";

type MagnetProps = {
  children: ReactNode;
  padding?: number;
  strength?: number;
  activeTransition?: string;
  inactiveTransition?: string;
  className?: string;
  style?: CSSProperties;
};

export function Magnet({
  children,
  padding = 150,
  strength = 3,
  activeTransition = "transform 0.3s ease-out",
  inactiveTransition = "transform 0.6s ease-in-out",
  className,
  style,
}: MagnetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [transition, setTransition] = useState(inactiveTransition);

  const reset = () => {
    setOffset({ x: 0, y: 0 });
    setTransition(inactiveTransition);
  };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const withinX = e.clientX >= rect.left - padding && e.clientX <= rect.right + padding;
    const withinY = e.clientY >= rect.top - padding && e.clientY <= rect.bottom + padding;
    if (!withinX || !withinY) {
      reset();
      return;
    }
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setTransition(activeTransition);
    setOffset({
      x: (e.clientX - cx) / strength,
      y: (e.clientY - cy) / strength,
    });
  };

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      onMouseMove={onMove}
      onMouseLeave={reset}
    >
      <div
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
          transition,
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
