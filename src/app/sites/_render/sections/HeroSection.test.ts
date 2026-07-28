import { describe, expect, it } from "vitest";
import { HeroSection } from "./HeroSection";
import { FAMILIES } from "../families";
import { baseSectionProps, renderSection } from "../testHelpers";

describe("HeroSection", () => {
  it("renders headline and WhatsApp CTA for premium", () => {
    const html = renderSection(
      HeroSection,
      baseSectionProps({
        family: FAMILIES.premium,
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

  it("uses split layout for warm", () => {
    const html = renderSection(
      HeroSection,
      baseSectionProps({
        family: FAMILIES.warm,
        content: { headline: "Trusted electricians" },
      }),
    );
    expect(html).toContain("Trusted electricians");
    expect(html).toContain('data-section="hero"');
  });
});
