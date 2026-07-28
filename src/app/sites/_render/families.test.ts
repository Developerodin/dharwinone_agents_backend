import { describe, it, expect } from "vitest";
import { FAMILIES, FONT_PAIRS, LEGACY_FAMILY_ALIASES, resolveFamilyId } from "./families";
import familiesCatalog from "@/server/data/familiesCatalog.json";

describe("FAMILIES", () => {
  it("has all catalog families with metadata and 5-var palettes", () => {
    for (const row of familiesCatalog.families) {
      const f = FAMILIES[row.id as keyof typeof FAMILIES];
      expect(f, row.id).toBeDefined();
      expect(f.name).toBe(row.name);
      expect(f.definition).toBe(row.definition);
      expect(f.surfaceStyle).toBe(row.surfaceStyle);
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

  it("warm uses square buttons, split hero, and numbered steps", () => {
    expect(FAMILIES.warm.buttonRadius).toBe("0");
    expect(FAMILIES.warm.heroStyle).toBe("split");
    expect(FAMILIES.warm.numberedSteps).toBe(true);
  });

  it("bold uses full-bleed hero and tile services", () => {
    expect(FAMILIES.bold.heroStyle).toBe("fullbleed_veil");
    expect(FAMILIES.bold.servicesStyle).toBe("tiles");
  });

  it("organic uses split hero and tile services", () => {
    expect(FAMILIES.organic.heroStyle).toBe("split");
    expect(FAMILIES.organic.servicesStyle).toBe("tiles");
  });

  it("each family default fontPair resolves in FONT_PAIRS", () => {
    for (const family of Object.values(FAMILIES)) {
      const pair = FONT_PAIRS[family.fontPair];
      expect(pair, family.id).toBeDefined();
      expect(pair.heading).toBe(family.fonts.heading);
      expect(pair.body).toBe(family.fonts.body);
    }
  });

  it("resolves legacy family ids to the UI axis", () => {
    expect(resolveFamilyId("trust_local")).toBe("warm");
    expect(resolveFamilyId("clean_pro")).toBe("professional");
    expect(resolveFamilyId("generic")).toBe("minimalist");
    expect(Object.keys(LEGACY_FAMILY_ALIASES).length).toBeGreaterThan(0);
  });
});
