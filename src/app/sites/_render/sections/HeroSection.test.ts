import { describe, expect, it } from "vitest";
import { HeroSection } from "./HeroSection";
import { FAMILIES } from "../families";
import { baseSectionProps, renderSection } from "../testHelpers";

describe("HeroSection", () => {
  it("renders headline and WhatsApp CTA for premium_dark", () => {
    const html = renderSection(
      HeroSection,
      baseSectionProps({
        family: FAMILIES.premium_dark,
        content: {
          headline: "Explore the coast",
          subtext: "Curated travel experiences",
          cta_text: "Book now",
        },
      }),
    );
    expect(html).toContain("Explore the coast");
    expect(html).toContain('data-element-key="hero.headline"');
    expect(html).toContain('href="https://wa.me/919876543210"');
    expect(html).toContain('data-section="hero"');
  });

  it("uses split layout for trust_local", () => {
    const html = renderSection(
      HeroSection,
      baseSectionProps({
        family: FAMILIES.trust_local,
        content: { headline: "Trusted electricians" },
      }),
    );
    expect(html).toContain("Trusted electricians");
    expect(html).toContain('data-section="hero"');
  });
});
