// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getDraftRenderable,
  RenderForbiddenError,
} from "./siteRenderService";

vi.mock("../repos/sitesRepo", () => ({
  get: vi.fn(),
}));

import * as sitesRepo from "../repos/sitesRepo";

describe("getDraftRenderable", () => {
  beforeEach(() => {
    vi.mocked(sitesRepo.get).mockReset();
  });

  it("returns renderable site for owner with legacy template remapped to bespoke", async () => {
    vi.mocked(sitesRepo.get).mockResolvedValue({
      siteId: "acme",
      userId: "user-1",
      templateId: "electrician_v3",
      contentJson: { hero: { headline: "Hi" } },
      themeJson: {},
      businessProfileJson: {
        business_name: "Acme",
        category: "local_service",
        subcategory: "electrician",
      },
    });

    const result = await getDraftRenderable("acme", "user-1");
    expect(result.templateId).toBe("gn_axon_v1");
    expect(result.family).toBe("glassmorphism");
    expect(result.contentJson.hero).toEqual({ headline: "Hi" });
  });

  it("throws RenderForbiddenError for owner mismatch", async () => {
    vi.mocked(sitesRepo.get).mockResolvedValue({
      siteId: "acme",
      userId: "user-1",
      templateId: "electrician_v3",
      contentJson: {},
      themeJson: {},
      businessProfileJson: {},
    });

    await expect(getDraftRenderable("acme", "user-2")).rejects.toBeInstanceOf(
      RenderForbiddenError,
    );
  });
});
