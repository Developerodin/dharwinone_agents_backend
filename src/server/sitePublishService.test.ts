// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  allocateSubdomain,
  runPrePublishChecklist,
  slugifySubdomain,
  RESERVED_SUBDOMAINS,
} from "./services/sitePublishService";
import * as sitesRepo from "./repos/sitesRepo";

vi.mock("./repos/sitesRepo", () => ({
  getBySubdomain: vi.fn(),
}));

describe("slugifySubdomain", () => {
  it("slugifies business names", () => {
    expect(slugifySubdomain("Acme Plumbing & Co.")).toBe("acme-plumbing-co");
  });

  it("rejects reserved slugs via allocateSubdomain suffix", async () => {
    vi.mocked(sitesRepo.getBySubdomain).mockResolvedValue(null);
    const slug = await allocateSubdomain({
      siteId: "s1",
      businessProfileJson: { business_name: "admin" },
    });
    expect(slug).toBe("admin-1");
    expect(RESERVED_SUBDOMAINS.has("admin")).toBe(true);
  });

  it("adds numeric suffix on collision", async () => {
    vi.mocked(sitesRepo.getBySubdomain)
      .mockResolvedValueOnce({ siteId: "other" } as never)
      .mockResolvedValueOnce(null);
    const slug = await allocateSubdomain({
      siteId: "mine",
      businessProfileJson: { business_name: "Bright Electric" },
    });
    expect(slug).toBe("bright-electric-2");
  });
});

describe("runPrePublishChecklist", () => {
  const goodSite = {
    siteId: "demo",
    templateId: "electrician_v1",
    businessProfileJson: { cta_preference: "phone", phone: "+919876543210" },
    contentJson: {
      hero: { headline: "Hello" },
      seo: { title: "Title", description: "Desc" },
    },
    themeJson: { brand: { logo_url: "https://cdn/logo.png", primary_color: "#111827", background_color: "#ffffff" } },
  };

  it("passes when required fields present", () => {
    const checklist = runPrePublishChecklist(goodSite);
    expect(checklist.every((c) => c.ok || c.warn)).toBe(true);
  });

  it("flags missing hero content", () => {
    const checklist = runPrePublishChecklist({
      siteId: "demo",
      contentJson: {},
      businessProfileJson: {},
      themeJson: {},
    });
    expect(checklist.find((c) => c.id === "content_sections")?.ok).toBe(false);
  });

  it("flags placeholder copy", () => {
    const checklist = runPrePublishChecklist({
      ...goodSite,
      contentJson: {
        hero: { headline: "{{ business_name }}" },
        seo: { title: "Title", description: "Desc" },
      },
    });
    expect(checklist.find((c) => c.id === "content_sections")?.ok).toBe(false);
  });

  it("includes contrast and page_weight stub items", () => {
    const checklist = runPrePublishChecklist(goodSite);
    expect(checklist.find((c) => c.id === "contrast")).toBeTruthy();
    expect(checklist.find((c) => c.id === "page_weight")).toBeTruthy();
    expect(checklist.find((c) => c.id === "mobile_screenshot")?.warn).toBe(true);
  });
});
