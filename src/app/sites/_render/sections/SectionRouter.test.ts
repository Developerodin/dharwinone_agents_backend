import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionRouter } from "./SectionRouter";
import { FAMILIES } from "../families";
import { resolveTheme } from "../resolveTheme";

function routerProps(sectionKey: string) {
  const ctx = resolveTheme({
    family: "warm",
    themeJson: {},
    sectionSchemaSections: ["hero", "services", "cta_footer"],
  });
  return {
    sectionKey,
    contentJson: {
      hero: { headline: "Hello world" },
    },
    family: FAMILIES.warm,
    ctx,
    businessProfile: {},
    resolveImage: () => null,
  };
}

describe("SectionRouter", () => {
  it("returns null for unknown section keys", () => {
    const html = renderToStaticMarkup(
      React.createElement(SectionRouter, routerProps("unknown_section")),
    );
    expect(html).toBe("");
  });

  it("renders hero section with data-section attribute", () => {
    const html = renderToStaticMarkup(
      React.createElement(SectionRouter, routerProps("hero")),
    );
    expect(html).toContain('data-section="hero"');
    expect(html).toContain("Hello world");
  });
});
