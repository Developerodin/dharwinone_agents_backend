import type { ReactNode } from "react";

type GlassPanelProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "section";
};

export function GlassPanel({ children, className = "", as: Tag = "div" }: GlassPanelProps) {
  return (
    <Tag
      className={`rounded-2xl border border-[#1B133C]/10 bg-white/78 p-6 shadow-[0_8px_32px_rgba(27,19,60,0.08)] backdrop-blur-lg md:p-8 ${className}`}
    >
      {children}
    </Tag>
  );
}
