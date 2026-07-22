// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  injectResolvedImagesIntoContent,
  logoTextFallback,
  packRefsFromProfile,
  resolveLogo,
  resolveSlot,
} from "./services/imageResolverService";

describe("imageResolverService", () => {
  it("falls back to pack then template defaults", () => {
    const hero = resolveSlot({
      slotKey: "hero",
      packRefs: ["pack/local_service/default"],
    });
    expect(hero.source).toBe("pack");
    expect(hero.url).toContain("local_service");
  });

  it("resolves cafe pack hero from catalog ref", () => {
    const hero = resolveSlot({
      slotKey: "hero",
      packRefs: ["pack_cafe_restaurant_v1"],
    });
    expect(hero.source).toBe("pack");
    expect(hero.url).toContain("unsplash.com");
  });

  it("uses text logo when no image available", () => {
    const logo = resolveLogo({
      businessProfile: { business_name: "Bright Electric" },
      theme: { brand: {} },
    });
    expect(logo.source).toBe("text_logo");
    expect(logo.textLogo).toBe("BE");
  });

  it("derives logo initials from business name", () => {
    expect(logoTextFallback({ business_name: "Acme" })).toBe("AC");
  });

  it("derives pack refs from business profile category/subcategory", () => {
    const refs = packRefsFromProfile({
      category: "hospitality_travel",
      subcategory: "cafe_restaurant",
    });
    expect(refs).toContain("pack_cafe_restaurant_v1");
  });

  it("injects hero.image from cafe pack into generated content", () => {
    const { content } = injectResolvedImagesIntoContent({
      content: {
        hero: {
          headline: "Welcome to Helum",
          subtext: "Cozy cafe in Jaipur",
          cta_text: "Book a Table",
        },
      },
      theme: {},
      businessProfile: {
        business_name: "Helum",
        category: "hospitality_travel",
        subcategory: "cafe_restaurant",
      },
    });

    const hero = content.hero as Record<string, unknown>;
    expect(typeof hero.image).toBe("string");
    expect(String(hero.image)).toContain("unsplash.com");
  });

  it("does not overwrite existing hero.image", () => {
    const existing = "https://example.com/hero.jpg";
    const { content } = injectResolvedImagesIntoContent({
      content: {
        hero: {
          headline: "Keep mine",
          image: existing,
        },
      },
      theme: {},
      businessProfile: {
        category: "hospitality_travel",
        subcategory: "cafe_restaurant",
      },
    });
    expect((content.hero as Record<string, unknown>).image).toBe(existing);
  });
});
