// @vitest-environment node
import { describe, expect, it } from "vitest";
import categoryTaxonomy from "./categoryTaxonomy.json";
import familiesCatalog from "./familiesCatalog.json";
import { listCategoryConfigs, listSegmentSummaries } from "./categoryCatalog";

const familyIds = new Set(familiesCatalog.families.map((row) => row.id));

describe("categoryTaxonomy", () => {
  it("defines 12 categories and 43 subcategories", () => {
    expect(categoryTaxonomy.categories).toHaveLength(12);
    const subCount = categoryTaxonomy.categories.reduce(
      (sum, row) => sum + row.subcategories.length,
      0,
    );
    expect(subCount).toBe(43);
  });

  it("uses only valid family ids for defaults and eligible lists", () => {
    for (const category of categoryTaxonomy.categories) {
      expect(category.definition).toBeTruthy();
      for (const sub of category.subcategories) {
        expect(sub.definition).toBeTruthy();
        expect(familyIds.has(sub.default_family)).toBe(true);
        for (const family of sub.eligible_families) {
          expect(familyIds.has(family)).toBe(true);
        }
        expect(sub.eligible_families).toContain(sub.default_family);
      }
    }
  });

  it("matches synced on-disk category configs", () => {
    const configs = listCategoryConfigs();
    expect(configs.length).toBe(43);
    for (const category of categoryTaxonomy.categories) {
      for (const sub of category.subcategories) {
        const config = configs.find(
          (row) => row.category === category.id && row.subcategory === sub.id,
        );
        expect(config, `${category.id}/${sub.id}`).toBeDefined();
        expect(config?.default_family).toBe(sub.default_family);
        expect(config?.eligible_families).toEqual(sub.eligible_families);
      }
    }
  });

  it("lists all taxonomy segments with family metadata", () => {
    const segments = listSegmentSummaries();
    expect(segments.map((row) => row.categoryId)).toEqual(
      categoryTaxonomy.categories.map((row) => row.id),
    );
    const fitness = segments
      .find((row) => row.categoryId === "health_education")
      ?.subcategories.find((row) => row.id === "fitness_gym");
    expect(fitness?.default_family).toBe("bold");
    expect(fitness?.eligible_families).toContain("industrial");
  });
});
