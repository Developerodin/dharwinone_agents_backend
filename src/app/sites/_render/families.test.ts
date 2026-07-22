import { describe, it, expect } from "vitest";
import { FAMILIES, FONT_PAIRS } from "./families";

describe("FAMILIES", () => {
  it("has all six families with 5-var palettes", () => {
    const ids = [
      "trust_local",
      "bold_convert",
      "clean_pro",
      "premium_dark",
      "warm_craft",
      "fresh_retail",
    ];
    for (const id of ids) {
      const f = FAMILIES[id as keyof typeof FAMILIES];
      expect(f, id).toBeDefined();
      expect(f.palette).toMatchObject({
        ink: expect.any(String),
        bg: expect.any(String),
        accent: expect.any(String),
        soft: expect.any(String),
        line: expect.any(String),
      });
      expect(f.fonts.heading).toBeTruthy();
    }
  });

  it("trust_local uses square buttons and split hero", () => {
    expect(FAMILIES.trust_local.buttonRadius).toBe("0");
    expect(FAMILIES.trust_local.heroStyle).toBe("split");
  });

  it("bold_convert uses full-bleed hero and tile services", () => {
    expect(FAMILIES.bold_convert.heroStyle).toBe("fullbleed_veil");
    expect(FAMILIES.bold_convert.servicesStyle).toBe("tiles");
  });

  it("warm_craft uses split hero and tile services", () => {
    expect(FAMILIES.warm_craft.heroStyle).toBe("split");
    expect(FAMILIES.warm_craft.servicesStyle).toBe("tiles");
  });

  it("each family default fontPair resolves in FONT_PAIRS", () => {
    for (const family of Object.values(FAMILIES)) {
      const pair = FONT_PAIRS[family.fontPair];
      expect(pair, family.id).toBeDefined();
      expect(pair.heading).toBe(family.fonts.heading);
      expect(pair.body).toBe(family.fonts.body);
    }
  });
});
