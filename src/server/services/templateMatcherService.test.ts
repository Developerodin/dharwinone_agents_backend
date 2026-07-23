// @vitest-environment node
import { describe, expect, it } from "vitest";
import { matchTemplates } from "./templateMatcherService";

describe("templateMatcherService", () => {
  it("ranks electrician profile to ls_electrician_v1 first when professional", () => {
    const matches = matchTemplates({
      category: "local_service",
      subcategory: "electrician",
      tone_preference: "professional",
      cta_preference: "whatsapp",
      services: ["wiring", "AC repair"],
    });
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches[0]!.templateId).toBe("ls_electrician_v1");
    expect(matches[0]!.score).toBeGreaterThan(matches[1]!.score);
  });

  it("ranks electrician profile to ls_electrician_v1 first when local_trustworthy", () => {
    const matches = matchTemplates({
      category: "local_service",
      subcategory: "electrician",
      tone_preference: "local_trustworthy",
      cta_preference: "whatsapp",
      services: ["wiring", "AC repair"],
    });
    expect(matches[0]!.templateId).toBe("ls_electrician_v1");
  });

  it("ranks plumber profile to plumber_v1 first", () => {
    const matches = matchTemplates({
      category: "local_service",
      subcategory: "plumber",
      cta_preference: "whatsapp",
      services: ["pipe repair", "leak fixing"],
      tone_preference: "local_trustworthy",
    });
    expect(matches[0]!.templateId).toBe("plumber_v1");
  });

  it("returns two to three template ids", () => {
    const matches = matchTemplates({
      category: "local_service",
      subcategory: "electrician",
    });
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.length).toBeLessThanOrEqual(3);
  });

  it("does not use equal scores for category-matched templates", () => {
    const matches = matchTemplates({
      category: "local_service",
      subcategory: "electrician",
      tone_preference: "professional",
      cta_preference: "whatsapp",
    });
    const generic = matches.find((m) => m.templateId === "gn_generic_v1");
    const primary = matches.find((m) => m.templateId === "ls_electrician_v1");
    expect(primary?.score).toBeGreaterThan(generic?.score ?? 0);
  });

  it("ranks restaurant profile to ht_restaurant_v1, not electrician", () => {
    const matches = matchTemplates({
      category: "local_service",
      business_name: "jonte",
      services: ["menu", "reservations", "location map"],
      cta_preference: "phone",
    });
    expect(matches[0]!.templateId).toBe("ht_restaurant_v1");
    expect(matches[0]!.templateId).not.toBe("electrician_bold_v1");
  });

  it("ranks a corrected restaurant profile to ht_restaurant_v1 first", () => {
    const matches = matchTemplates({
      category: "hospitality_travel",
      subcategory: "restaurant",
      business_name: "jonte",
      services: ["menu", "reservations", "location map"],
    });
    expect(matches[0]!.templateId).toBe("ht_restaurant_v1");
    expect(matches[0]!.score).toBeGreaterThanOrEqual(18);
  });

  it("ranks a cafe profile to ht_cafe templates first", () => {
    const matches = matchTemplates({
      category: "hospitality_travel",
      subcategory: "cafe",
      business_name: "brew bar",
      services: ["espresso", "bakery", "sweets"],
    });
    expect(matches[0]!.templateId).toMatch(/^ht_cafe_/);
  });
});
