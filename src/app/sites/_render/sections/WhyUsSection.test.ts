import { describe, expect, it } from "vitest";
import { WhyUsSection } from "./WhyUsSection";
import { FAMILIES } from "../families";
import { baseSectionProps, renderSection } from "../testHelpers";

describe("WhyUsSection", () => {
  it("renders points with checkmarks by default", () => {
    const html = renderSection(
      WhyUsSection,
      baseSectionProps({
        content: {
          section_title: "Why choose us",
          points: ["Licensed", "Insured"],
        },
      }),
    );
    expect(html).toContain("Why choose us");
    expect(html).toContain('data-section="why_us"');
    expect(html).toContain("Licensed");
  });

  it("uses numbered steps for trust_local", () => {
    const html = renderSection(
      WhyUsSection,
      baseSectionProps({
        family: FAMILIES.trust_local,
        content: { section_title: "Process", points: ["Call us"] },
      }),
    );
    expect(html).toContain("<ol");
  });
});
