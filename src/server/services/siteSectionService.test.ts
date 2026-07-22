// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mutateSection } from "./siteSectionService";

vi.mock("../repos/sitesRepo", () => ({
  get: vi.fn(async (siteId: string) =>
    siteId === "site-1"
      ? {
          siteId: "site-1",
          userId: "usr-1",
          businessProfileJson: { business_name: "Demo Co" },
          contentJson: { hero: { headline: "Old headline", subtext: "Old sub" } },
          themeJson: {},
        }
      : null,
  ),
  createVersion: vi.fn(async () => ({ versionId: "ver-snap" })),
  updateFields: vi.fn(async (_siteId: string, fields: Record<string, unknown>) => ({
    siteId: "site-1",
    userId: "usr-1",
    contentJson: fields.contentJson,
  })),
}));

vi.mock("./contentAgentService", () => ({
  regenerateSection: vi.fn(async () => ({ headline: "New headline", subtext: "New sub" })),
}));

vi.mock("./tokenService", () => ({
  withTokenHold: vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) => fn()),
  actionCost: vi.fn(() => 8),
  InsufficientTokensError: class InsufficientTokensError extends Error {},
}));

describe("mutateSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("snapshots, regenerates, and merges section content", async () => {
    const result = await mutateSection({
      siteId: "site-1",
      userId: "usr-1",
      sectionKey: "hero",
      actionType: "regenerate_section",
      idempotencyKey: "idem-regen-1",
    });
    expect(result.snapshotVersionId).toBe("ver-snap");
    expect(result.section).toEqual({ headline: "New headline", subtext: "New sub" });
    expect((result.site.contentJson as Record<string, unknown>).hero).toEqual({
      headline: "New headline",
      subtext: "New sub",
    });
    expect(result.cost).toBe(8);
  });

  it("rejects unknown site", async () => {
    await expect(
      mutateSection({
        siteId: "missing",
        userId: "usr-1",
        sectionKey: "hero",
        actionType: "regenerate_section",
        idempotencyKey: "idem-regen-2",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
