import { describe, expect, it } from "vitest";
import {
  businessNameFollowUp,
  inferEntityLabelFromDescription,
  resolveEntityLabel,
} from "./entityLabels";

describe("entityLabels", () => {
  it("infers hospital from description for clinic_medical", () => {
    expect(
      inferEntityLabelFromDescription("I want a site for my hospital", "clinic_medical"),
    ).toBe("hospital");
  });

  it("resolves shop for retail subcategories", () => {
    expect(resolveEntityLabel({ subcategory: "gift_shop" })).toBe("shop");
    expect(resolveEntityLabel({ subcategory: "clothing" })).toBe("store");
  });

  it("resolves restaurant and café", () => {
    expect(resolveEntityLabel({ subcategory: "restaurant" })).toBe("restaurant");
    expect(resolveEntityLabel({ subcategory: "cafe" })).toBe("café");
  });

  it("prefers facility_type for clinic medical", () => {
    expect(
      resolveEntityLabel({
        subcategory: "clinic_medical",
        facility_type: "general_multi_department",
      }),
    ).toBe("hospital");
  });

  it("builds contextual business_name follow-up copy", () => {
    expect(
      businessNameFollowUp({
        category: "health_education",
        subcategory: "clinic_medical",
        entity_label: "hospital",
      }),
    ).toMatch(/name of your hospital/i);
    expect(businessNameFollowUp({ subcategory: "gift_shop" })).toMatch(/name of your shop/i);
    expect(businessNameFollowUp({ subcategory: "restaurant" })).toMatch(/name of your restaurant/i);
    expect(businessNameFollowUp({ subcategory: "electrician" })).toMatch(/electrical service/i);
    expect(businessNameFollowUp({ subcategory: "personal_blog" })).toMatch(/blog/i);
    expect(businessNameFollowUp({ subcategory: "saas_startup" })).toMatch(/product|Axon/i);
  });
});
