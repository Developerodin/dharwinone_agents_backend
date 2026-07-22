import { describe, expect, it } from "vitest";
import { TestimonialsSection } from "./TestimonialsSection";
import { baseSectionProps, renderSection } from "../testHelpers";

describe("TestimonialsSection", () => {
  it("renders testimonial quotes", () => {
    const html = renderSection(
      TestimonialsSection,
      baseSectionProps({
        content: {
          section_title: "Reviews",
          items: [{ name: "Jane Doe", quote: "Excellent work" }],
        },
      }),
    );
    expect(html).toContain("Reviews");
    expect(html).toContain('data-section="testimonials"');
    expect(html).toContain("Jane Doe");
    expect(html).toContain("Excellent work");
  });
});
