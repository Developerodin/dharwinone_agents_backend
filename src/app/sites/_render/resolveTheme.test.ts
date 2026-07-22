import { describe, it, expect } from "vitest";
import { resolveTheme } from "./resolveTheme";

const theme = {
  sectionOverrides: {
    hero: { bgColor: "#0F172A", textColor: "#FFF", padding: "spacious", align: "center" },
  },
  elementOverrides: { "hero.cta_button": { bg: "#F59E0B", radius: "full" } },
  imageOverrides: { "hero.background": { scrimOpacity: 0.6 } },
  sectionOrder: ["hero", "services"],
  hiddenSections: ["services"],
};

describe("resolveTheme", () => {
  const ctx = resolveTheme({
    family: "trust_local",
    themeJson: theme,
    sectionSchemaSections: ["hero", "services", "cta_footer"],
  });

  it("drops hidden sections from order", () => {
    expect(ctx.sectionOrder).toEqual(["hero"]);
  });

  it("maps section override to css", () => {
    expect(ctx.getSectionStyle("hero")).toMatchObject({
      backgroundColor: "#0F172A",
      color: "#FFF",
      textAlign: "center",
    });
  });

  it("reads scrim override", () => {
    expect(ctx.scrimFor("hero.background")).toBe(0.6);
  });

  it("falls back to schema order when themeJson has no order", () => {
    const c2 = resolveTheme({
      family: "trust_local",
      themeJson: {},
      sectionSchemaSections: ["hero", "cta_footer"],
    });
    expect(c2.sectionOrder).toEqual(["hero", "cta_footer"]);
  });
});
