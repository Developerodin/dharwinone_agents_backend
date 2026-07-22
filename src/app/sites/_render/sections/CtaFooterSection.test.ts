import { describe, expect, it } from "vitest";
import { CtaFooterSection } from "./CtaFooterSection";
import { baseSectionProps, renderSection } from "../testHelpers";

describe("CtaFooterSection", () => {
  it("renders headline and CTA button", () => {
    const html = renderSection(
      CtaFooterSection,
      baseSectionProps({
        content: {
          headline: "Ready to start?",
          cta_text: "Call now",
        },
      }),
    );
    expect(html).toContain("Ready to start?");
    expect(html).toContain('data-section="cta_footer"');
    expect(html).toContain("Call now");
  });
});
