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

  it("infers restaurant text to hospitality_travel/restaurant", () => {
    const inferred = inferTaxonomy("Fine dining restaurant with a seasonal menu and bistro seating");
    expect(inferred).toMatchObject({
      category: "hospitality_travel",
      subcategory: "restaurant",
      configId: "hospitality_travel_restaurant",
    });
    expect(inferred?.confidence).toBeGreaterThanOrEqual(2);
  });

  it("infers cafe text to hospitality_travel/cafe", () => {
    const inferred = inferTaxonomy("Cozy cafe serving espresso, fresh bakery bakes and sweets");
    expect(inferred).toMatchObject({
      category: "hospitality_travel",
      subcategory: "cafe",
      configId: "hospitality_travel_cafe",
    });
  });

  it("returns matcher eligible templates for the restaurant subcategory", () => {
    const config = getConfigBySegmentSubcategory("hospitality_travel", "restaurant");
    expect(config?.matcher?.eligible_template_ids).toContain("ht_restaurant_v1");

    const matcher = getMatcherForProfile({
      category: "hospitality_travel",
      subcategory: "restaurant",
    });
    expect(matcher?.default_rank_order[0]).toBe("ht_restaurant_v1");
  });

  it("returns matcher eligible templates for the cafe subcategory", () => {
    const matcher = getMatcherForProfile({ category: "hospitality_travel", subcategory: "cafe" });
    expect(matcher?.default_rank_order[0]).toBe("ht_cafe_v1");
  });

  it("returns image pack refs per hospitality subcategory", () => {
    expect(getImagePackRefsForProfile({ category: "hospitality_travel", subcategory: "cafe" })).toEqual([
      "pack_cafe_v1",
    ]);
    expect(
      getImagePackRefsForProfile({ category: "hospitality_travel", subcategory: "restaurant" }),
    ).toEqual(["pack_restaurant_v1"]);
  });
});
