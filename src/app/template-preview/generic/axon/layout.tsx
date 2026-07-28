import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./axon.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "Axon — Digital Workers for Mundane Workflows",
  description:
    "Deploy digital workers for mundane workflows. Eliminate tedious browser work and 10x your team's capacity.",
};

export default function AxonLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`axon-page min-h-screen ${inter.className} ${instrumentSerif.variable}`}>
      {children}
    </div>
  );
}
