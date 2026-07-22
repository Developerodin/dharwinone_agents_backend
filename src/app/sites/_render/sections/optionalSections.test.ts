import { describe, expect, it } from "vitest";
import { AboutSection } from "./AboutSection";
import { GallerySection } from "./GallerySection";
import { PricingSection } from "./PricingSection";
import { FaqSection } from "./FaqSection";
import { ContactSection } from "./ContactSection";
import { baseSectionProps, renderSection } from "../testHelpers";

describe("optional sections", () => {
  it("AboutSection renders body copy", () => {
    const html = renderSection(
      AboutSection,
      baseSectionProps({ content: { section_title: "About", body: "Our story" } }),
    );
    expect(html).toContain('data-section="about"');
    expect(html).toContain("Our story");
  });

  it("GallerySection renders images", () => {
    const html = renderSection(
      GallerySection,
      baseSectionProps({ content: { section_title: "Gallery", images: ["/img/a.jpg"] } }),
    );
    expect(html).toContain('data-section="gallery"');
  });

  it("PricingSection renders plans", () => {
    const html = renderSection(
      PricingSection,
      baseSectionProps({
        content: { section_title: "Pricing", items: [{ title: "Basic", price: "$99" }] },
      }),
    );
    expect(html).toContain('data-section="pricing"');
    expect(html).toContain("Basic");
  });

  it("FaqSection renders details elements", () => {
    const html = renderSection(
      FaqSection,
      baseSectionProps({
        content: { section_title: "FAQ", items: [{ question: "Hours?", answer: "9-5" }] },
      }),
    );
    expect(html).toContain('data-section="faq"');
    expect(html).toContain("<details");
  });

  it("ContactSection renders phone from businessProfile", () => {
    const html = renderSection(
      ContactSection,
      baseSectionProps({
        content: {},
        businessProfile: { phone: "+15551234567" },
      }),
    );
    expect(html).toContain('data-section="contact"');
    expect(html).toContain("+15551234567");
  });

  // content-gated: an unfilled section renders nothing (no empty shell)
  it("skips sections with no content", () => {
    const empty = baseSectionProps({ content: {}, businessProfile: {} });
    expect(renderSection(AboutSection, empty)).toBe("");
    expect(renderSection(GallerySection, empty)).toBe("");
    expect(renderSection(PricingSection, empty)).toBe("");
    expect(renderSection(FaqSection, empty)).toBe("");
    expect(renderSection(ContactSection, empty)).toBe("");
  });
});
