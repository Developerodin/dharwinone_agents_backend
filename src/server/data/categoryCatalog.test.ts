// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getConfigBySegmentSubcategory,
  getImagePackRefsForProfile,
  getMatcherForProfile,
  inferTaxonomy,
  listCategoryConfigs,
  listSegmentSummaries,
} from "./categoryCatalog";

describe("categoryCatalog", () => {
  it("loads all studio category configs", () => {
    const configs = listCategoryConfigs();
    expect(configs.length).toBeGreaterThanOrEqual(23);
  });

  it("lists all six taxonomy segments", () => {
    const segments = listSegmentSummaries();
    expect(segments.map((row) => row.categoryId)).toEqual([
      "real_estate",
      "local_service",
      "retail",
      "hospitality_travel",
      "health_education",
      "professional",
    ]);
  });

  it("uses catalog subcategories without invented ids", () => {
    const local = listSegmentSummaries().find((row) => row.categoryId === "local_service");
    expect(local?.subcategories.map((row) => row.id)).toEqual([
      "plumbing",
      "electrician",
      "landscaping",
      "car_wash",
      "cleaning_handyman",
      "insurance_agent",
    ]);
    expect(local?.subcategories.some((row) => row.id === "salon")).toBe(false);
  });

  it("infers restaurant text to hospitality_travel/cafe_restaurant", () => {
    const inferred = inferTaxonomy("Restaurant website with menu, reservations, and bakery sweets");
    expect(inferred).toMatchObject({
      category: "hospitality_travel",
      subcategory: "cafe_restaurant",
      configId: "hospitality_travel_cafe_restaurant",
    });
    expect(inferred?.confidence).toBeGreaterThanOrEqual(2);
  });

  it("returns matcher eligible templates for resolved subcategory", () => {
    const config = getConfigBySegmentSubcategory("hospitality_travel", "cafe_restaurant");
    expect(config?.matcher?.eligible_template_ids).toContain("ht_cafe_v1");

    const matcher = getMatcherForProfile({
      category: "hospitality_travel",
      subcategory: "cafe_restaurant",
    });
    expect(matcher?.default_rank_order[0]).toBe("ht_cafe_v1");
  });

  it("returns image pack refs for cafe restaurant profile", () => {
    const refs = getImagePackRefsForProfile({
      category: "hospitality_travel",
      subcategory: "cafe_restaurant",
    });
    expect(refs).toEqual(["pack_cafe_restaurant_v1"]);
  });
});
