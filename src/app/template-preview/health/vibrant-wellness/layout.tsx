import type { Metadata } from "next";
import "./vibrant-wellness.css";

export const metadata: Metadata = {
  title: "Vibrant Wellness — Heal Your Body Naturally",
  description: "Holistic wellness with transformative results. Begin your journey to natural healing.",
};

export default function VibrantWellnessLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
      />
      <div className="vw-page min-h-dvh">{children}</div>
    </>
  );
}
