import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./jack.css";

const kanit = Kanit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-kanit",
});

export const metadata: Metadata = {
  title: "Jack -- 3D Creator",
  description: "3D creator portfolio — Jack",
};

export default function JackPortfolioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`jack-portfolio min-h-screen ${kanit.className}`}
      style={{ background: "#0C0C0C" }}
    >
      {children}
    </div>
  );
}
