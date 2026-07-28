// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getConfigBySegmentSubcategory,
  getImagePackRefsForProfile,
  getMatcherForProfile,
  inferTaxonomy,
  listCategoryConfigs,
  listLiveCategoryConfigs,
  listSegmentSummaries,
} from "./categoryCatalog";

describe("categoryCatalog", () => {
  it("keeps all studio category configs on disk", () => {
    const configs = listCategoryConfigs();
    expect(configs.length).toBe(43);
  });

  it("exposes all category configs as live (active) to web-agent", () => {
    const live = listLiveCategoryConfigs();
    expect(live.length).toBe(43);
    expect(live.every((c) => c.status === "active")).toBe(true);
    expect(live.map((c) => c.id)).toContain("local_service_electrician");
    expect(live.map((c) => c.id)).toContain("professional_portfolio_freelancer");
    expect(live.map((c) => c.id)).toContain("professional_personal_blog");
    expect(live.map((c) => c.id)).toContain("health_education_clinic_medical");
  });

  it("lists all taxonomy segments for infer/seed", () => {
    const segments = listSegmentSummaries();
    expect(segments.map((row) => row.categoryId)).toEqual([
      "real_estate",
      "local_service",
      "retail",
      "hospitality_travel",
      "health_education",
      "professional",
      "events_weddings",
      "legal_finance",
      "creative_media",
      "beauty_wellness",
      "nonprofit_community",
      "automotive",
    ]);
    const local = segments.find((row) => row.categoryId === "local_service");
    expect(local?.subcategories.map((row) => row.id)).toContain("electrician");
    expect(local?.subcategories.map((row) => row.id)).toContain("plumbing");
    const professional = segments.find((row) => row.categoryId === "professional");
    expect(professional?.subcategories.map((row) => row.id)).toContain("portfolio_freelancer");
    expect(professional?.subcategories.map((row) => row.id)).toContain("personal_blog");
  });

  it("infers electrician text to local_service/electrician", () => {
    const inferred = inferTaxonomy(
      "Emergency electrician for wiring, AC repair and short circuit fixes in Kolkata",
    );
    expect(inferred).toMatchObject({
      category: "local_service",
      subcategory: "electrician",
      configId: "local_service_electrician",
    });
    expect(inferred?.confidence).toBeGreaterThanOrEqual(2);
  });

  it("infers restaurant text to hospitality_travel/restaurant", () => {
    const inferred = inferTaxonomy("Fine dining restaurant with a seasonal menu and bistro seating");
    expect(inferred).toMatchObject({
      category: "hospitality_travel",
      subcategory: "restaurant",
      configId: "hospitality_travel_restaurant",
    });
  });

  it("infers medical hospital text to health_education/clinic_medical", () => {
    const inferred = inferTaxonomy("I want to create a website for my medical hospital");
    expect(inferred).toMatchObject({
      category: "health_education",
      subcategory: "clinic_medical",
      configId: "health_education_clinic_medical",
    });
    expect(inferred?.confidence).toBeGreaterThanOrEqual(2);
  });

  it("does not false-match accountant CA keyword inside medical", () => {
    const inferred = inferTaxonomy("medical hospital website");
    expect(inferred?.configId).not.toBe("legal_finance_accountant");
  });

  it("infers personal blog text to professional/personal_blog", () => {
    const inferred = inferTaxonomy(
      "Personal blog with clean typography and dark mode toggle",
    );
    expect(inferred).toMatchObject({
      category: "professional",
      subcategory: "personal_blog",
      configId: "professional_personal_blog",
    });
    expect(inferred?.confidence).toBeGreaterThanOrEqual(1);
  });

  it("infers freelancer portfolio text to professional/portfolio_freelancer", () => {
    const inferred = inferTaxonomy(
      "A modern portfolio for a freelance photographer with a fullscreen gallery",
    );
    expect(inferred).toMatchObject({
      category: "professional",
      subcategory: "portfolio_freelancer",
      configId: "professional_portfolio_freelancer",
    });
    expect(inferred?.confidence).toBeGreaterThanOrEqual(2);
  });

  it("returns bespoke eligible templates for electrician", () => {
    const config = getConfigBySegmentSubcategory("local_service", "electrician");
    expect(config?.matcher?.eligible_template_ids).toEqual(["gn_axon_v1"]);

    const matcher = getMatcherForProfile({
      category: "local_service",
      subcategory: "electrician",
    });
    expect(matcher?.default_rank_order[0]).toBe("gn_axon_v1");
  });

  it("returns image pack refs for electrician", () => {
    expect(getImagePackRefsForProfile({ category: "local_service", subcategory: "electrician" })).toEqual([
      "pack_electrician_v1",
    ]);
  });

  it("returns bespoke portfolio template for portfolio_freelancer", () => {
    const fitness = getConfigBySegmentSubcategory("health_education", "fitness_gym");
    expect(fitness?.status).toBe("active");
    expect(fitness?.matcher?.eligible_template_ids).toEqual(
      expect.arrayContaining(["he_fitness_v1", "he_fitness_v2"]),
    );

    const portfolio = getConfigBySegmentSubcategory("professional", "portfolio_freelancer");
    expect(portfolio?.status).toBe("active");
    expect(portfolio?.matcher?.eligible_template_ids).toEqual([
      "pf_portfolio_jack_v1",
    ]);

    const blog = getConfigBySegmentSubcategory("professional", "personal_blog");
    expect(blog?.status).toBe("active");
    expect(blog?.matcher?.eligible_template_ids).toEqual([
      "pf_blog_scroll_v1",
    ]);
    expect(blog?.questionnaire?.required).toEqual(
      expect.arrayContaining(["business_name", "services", "tagline", "tone_preference"]),
    );
    expect(blog?.questionnaire?.required).not.toContain("city");
  });

  it("returns launch templates for saas_startup (axon default, securify eligible)", () => {
    const saas = getConfigBySegmentSubcategory("professional", "saas_startup");
    expect(saas?.matcher?.default_rank_order[0]).toBe("gn_axon_v1");
    expect(saas?.matcher?.default_rank_order[1]).toBe("ps_securify_v1");
    expect(saas?.matcher?.eligible_template_ids).toEqual(
      expect.arrayContaining(["gn_axon_v1", "ps_securify_v1"]),
    );

    const matcher = getMatcherForProfile({
      category: "professional",
      subcategory: "saas_startup",
    });
    expect(matcher?.default_rank_order[0]).toBe("gn_axon_v1");
  });
});
