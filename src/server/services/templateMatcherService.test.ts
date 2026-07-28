// @vitest-environment node
import { describe, expect, it } from "vitest";
import { matchTemplates } from "./templateMatcherService";

describe("templateMatcherService", () => {
  it("ranks gn_axon_v1 for local_service/electrician (bespoke fallback)", () => {
    const matches = matchTemplates({
      category: "local_service",
      subcategory: "electrician",
      tone_preference: "local_trustworthy",
      cta_preference: "whatsapp",
      services: ["wiring", "AC repair"],
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]!.templateId).toBe("gn_axon_v1");
    expect(matches.every((m) => m.templateId === "gn_axon_v1")).toBe(true);
  });

  it("does not return generic catalog templates", () => {
    const matches = matchTemplates({
      category: "local_service",
      subcategory: "electrician",
      tone_preference: "professional",
      cta_preference: "whatsapp",
    });
    expect(matches.some((m) => m.templateId === "electrician_v3")).toBe(false);
    expect(matches.some((m) => m.templateId === "ls_electrician_v1")).toBe(false);
    expect(matches.some((m) => m.templateId === "ht_restaurant_v1")).toBe(false);
    expect(matches.some((m) => m.templateId === "gn_axon_v1")).toBe(true);
  });

  it("matches portfolio templates for professional/portfolio_freelancer", () => {
    const matches = matchTemplates({
      category: "professional",
      subcategory: "portfolio_freelancer",
      services: ["photography", "portfolio"],
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]!.templateId).toBe("pf_portfolio_jack_v1");
  });

  it("matches pf_blog_scroll_v1 for professional/personal_blog", () => {
    const matches = matchTemplates({
      category: "professional",
      subcategory: "personal_blog",
      services: ["writing", "essays"],
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]!.templateId).toBe("pf_blog_scroll_v1");
  });

  it("matches pf_blog_scroll_v1 for personal blog description in profile", () => {
    const matches = matchTemplates({
      description: "Personal blog with clean typography and dark mode toggle",
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]!.templateId).toBe("pf_blog_scroll_v1");
  });

  it("falls back to category bespoke default when profile is thin", () => {
    const matches = matchTemplates({
      category: "local_service",
      business_name: "Quick Fix",
      services: ["repairs"],
      cta_preference: "phone",
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]!.templateId).toBe("gn_axon_v1");
  });

  it("ranks gn_axon_v1 first for professional/saas_startup by default", () => {
    const matches = matchTemplates({
      category: "professional",
      subcategory: "saas_startup",
      business_name: "Odin",
      services: ["SaaS platform", "product demo"],
    });
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches[0]!.templateId).toBe("gn_axon_v1");
    expect(matches.map((m) => m.templateId)).toEqual(
      expect.arrayContaining(["gn_axon_v1", "ps_securify_v1"]),
    );
  });

  it("ranks ps_securify_v1 ahead of gn_axon when tone is tech", () => {
    const matches = matchTemplates({
      category: "professional",
      subcategory: "saas_startup",
      business_name: "SecureStack",
      services: ["cybersecurity", "SaaS"],
      tone_preference: "tech",
    });
    expect(matches[0]!.templateId).toBe("ps_securify_v1");
    expect(matches.some((m) => m.templateId === "gn_axon_v1")).toBe(true);
  });

  it("does not pick generic pack pf_saas_v1 for saas_startup", () => {
    const matches = matchTemplates({
      category: "professional",
      subcategory: "saas_startup",
      business_name: "Odin",
      services: ["software product"],
    });
    expect(matches[0]!.templateId).not.toBe("pf_saas_v1");
    expect(matches[0]!.templateId).not.toBe("pf_saas_v2");
  });

  it("matches fitness gym bespoke templates", () => {
    const matches = matchTemplates({
      category: "health_education",
      subcategory: "fitness_gym",
      services: ["gym", "yoga"],
    });
    expect(matches.map((m) => m.templateId)).toEqual(
      expect.arrayContaining(["he_fitness_v1", "he_fitness_v2"]),
    );
  });

  it("ranks he_vibrant_wellness_v1 for clinic_medical / dental intake while he_dental_v1 is disabled", () => {
    const matches = matchTemplates({
      category: "health_education",
      subcategory: "clinic_medical",
      facility_type: "dental_clinic",
      services: ["dental implants", "teeth whitening"],
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]!.templateId).toBe("he_vibrant_wellness_v1");
    expect(matches.map((m) => m.templateId)).not.toContain("he_dental_v1");
  });
});
