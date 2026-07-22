import { describe, expect, it } from "vitest";
import { ServicesSection } from "./ServicesSection";
import { FAMILIES } from "../families";
import { baseSectionProps, renderSection } from "../testHelpers";

describe("ServicesSection", () => {
  it("renders section title and items", () => {
    const html = renderSection(
      ServicesSection,
      baseSectionProps({
        content: {
          section_title: "Our Services",
          items: [{ title: "Wiring", desc: "Safe electrical wiring" }],
        },
      }),
    );
    expect(html).toContain("Our Services");
    expect(html).toContain('data-section="services"');
    expect(html).toContain("Wiring");
  });

  it("uses list layout for clean_pro", () => {
    const html = renderSection(
      ServicesSection,
      baseSectionProps({
        family: FAMILIES.clean_pro,
        content: {
          section_title: "Services",
          items: [{ title: "Repairs", desc: "Fast repairs" }],
        },
      }),
    );
    expect(html).toContain("<ul");
  });

  it("uses tile layout for warm_craft", () => {
    const html = renderSection(
      ServicesSection,
      baseSectionProps({
        family: FAMILIES.warm_craft,
        content: {
          section_title: "Services",
          items: [{ title: "Menu", desc: "Seasonal dishes" }],
        },
      }),
    );
    expect(html).not.toContain("<ul");
    expect(html).toContain("Seasonal dishes");
  });
});
