// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  bespokeTemplatesForCategory,
  defaultBespokeForProfile,
  enabledBespokeTemplateIds,
  isBespokeTemplateId,
  isEnabledBespokeTemplateId,
  resolveToBespokeTemplateId,
} from "./bespokeTemplateMapping";

describe("bespokeTemplateMapping", () => {
  it("recognizes bespoke launch templates including pf_blog_scroll_v1", () => {
    expect(isBespokeTemplateId("gn_axon_v1")).toBe(true);
    expect(isBespokeTemplateId("pf_blog_scroll_v1")).toBe(true);
    expect(isBespokeTemplateId("he_dental_v1")).toBe(true);
    expect(isBespokeTemplateId("ls_electrician_v1")).toBe(false);
  });

  it("excludes temporarily disabled templates from enabled lists", () => {
    expect(isEnabledBespokeTemplateId("he_dental_v1")).toBe(false);
    expect(isEnabledBespokeTemplateId("he_vibrant_wellness_v1")).toBe(true);
    expect(enabledBespokeTemplateIds()).not.toContain("he_dental_v1");
  });

  it("maps categories to bespoke fallbacks", () => {
    expect(bespokeTemplatesForCategory("health_education", "fitness_gym")).toEqual([
      "he_fitness_v1",
      "he_fitness_v2",
    ]);
    expect(bespokeTemplatesForCategory("health_education", "clinic_medical")).toEqual([
      "he_vibrant_wellness_v1",
    ]);
    expect(bespokeTemplatesForCategory("local_service", "electrician")).toEqual(["gn_axon_v1"]);
    expect(bespokeTemplatesForCategory("professional", "portfolio_freelancer")).toEqual([
      "pf_portfolio_jack_v1",
    ]);
    expect(bespokeTemplatesForCategory("professional", "personal_blog")).toEqual([
      "pf_blog_scroll_v1",
    ]);
  });

  it("remaps legacy generic template ids using profile category", () => {
    expect(
      resolveToBespokeTemplateId("ls_electrician_v1", {
        category: "local_service",
        subcategory: "electrician",
      }),
    ).toBe("gn_axon_v1");
    expect(
      resolveToBespokeTemplateId("ht_cafe_v1", {
        category: "hospitality_travel",
        subcategory: "cafe",
      }),
    ).toBe("he_vibrant_wellness_v1");
  });

  it("preserves existing bespoke site template ids (Odin ps_securify_v1)", () => {
    expect(resolveToBespokeTemplateId("ps_securify_v1", {})).toBe("ps_securify_v1");
    expect(resolveToBespokeTemplateId("he_dental_v1", {})).toBe("he_dental_v1");
    expect(defaultBespokeForProfile({})).toBe("gn_axon_v1");
  });
});
