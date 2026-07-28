import type { Metadata } from "next";
import { Readex_Pro } from "next/font/google";
import "./securify.css";

const readexPro = Readex_Pro({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-readex-pro",
});

export const metadata: Metadata = {
  title: "Securify — Protect Your Data",
  description: "Enterprise-grade data security for modern SaaS teams.",
};

export default function SecurifyLayout({ children }: { children: React.ReactNode }) {
  return <div className={`securify-page min-h-screen ${readexPro.className}`}>{children}</div>;
}
