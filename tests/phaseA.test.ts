import { beforeEach, describe, expect, it, vi } from "vitest";
import * as sitesRepo from "@/server/repos/sitesRepo";
import { personalizeHtml, generateForProject } from "@/server/services/personalizationService";
import { resetForTests as resetComposition } from "@/server/services/compositionService";
import { resetLlmProviderForTests } from "@/server/llmProvider";

vi.mock("@/server/db", () => ({
  prisma: () => ({
    site: {
      findFirst: vi.fn(async ({ where }: { where: { siteId: string } }) =>
        where.siteId === "site-taken" ? { siteId: "site-taken" } : null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 1,
        ...data,
      })),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    siteVersion: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 1, ...data })) },
  }),
  setPrismaForTests: vi.fn(),
}));

vi.mock("@/server/repos/projectsRepo", () => ({
  get: vi.fn(async () => ({
    projectId: "proj-1",
    projectName: "Dharwin One",
    initialPrompt: "Build HR software website",
  })),
  updateFields: vi.fn(async () => ({})),
}));

vi.mock("@/server/repos/profilesRepo", () => ({
  get: vi.fn(async () => ({
    projectId: "proj-1",
    brand: { brandName: "Dharwin One" },
    business: {
      type: "SaaS",
      services: ["HRMS", "ATS"],
      description: "HR software for growing teams",
      targetAudience: "HR teams",
    },
    contact: { email: "hello@dharwin.com", phone: "+1 555 0100" },
    location: { city: "Austin" },
  })),
}));

vi.mock("@/server/repos/assetsRepo", () => ({
  listForProject: vi.fn(async () => []),
}));

const savedTemplates: Record<string, unknown>[] = [];

vi.mock("@/server/repos/templatesRepo", () => ({
  listForProject: vi.fn(async () => []),
  replaceForProject: vi.fn(async (_pid: string, templates: Record<string, unknown>[]) => {
    savedTemplates.length = 0;
    savedTemplates.push(...templates);
    return templates;
  }),
}));

describe("sitesRepo.create", () => {
  it("allocates siteId from brand name and sets draft defaults", async () => {
    const site = await sitesRepo.create("usr-1", {
      businessProfileJson: { brand: { brandName: "Sharma Electricals" } },
    });
    expect(site.siteId).toMatch(/^sharma-electricals/);
    expect(site.userId).toBe("usr-1");
    expect(site.status).toBe("draft");
    expect(site.businessProfileJson).toEqual({ brand: { brandName: "Sharma Electricals" } });
  });
});

describe("personalizationService", () => {
  beforeEach(() => {
    process.env.STUDIO_ONBOARDING_LLM = "false";
    process.env.STUDIO_COMPOSED_VARIANTS = "2";
    resetLlmProviderForTests();
    resetComposition();
    savedTemplates.length = 0;
  });

  it("personalizeHtml removes placeholders and injects brand", () => {
    const profile = {
      brand: { brandName: "Acme" },
      business: { type: "Retail", services: ["Shoes"], description: "Premium footwear" },
      contact: { email: "shop@acme.com", phone: "555-1234" },
      location: { city: "Austin" },
    };
    const raw = "<html><body><h1>{{BRAND}}</h1><p>{{TAGLINE}}</p></body></html>";
    const html = personalizeHtml(raw, profile, [], "generic");
    expect(html).not.toMatch(/\{\{/);
    expect(html).toContain("Acme");
    expect(html).toContain("shop@acme.com");
  });

  it("generateForProject persists composed templates without placeholders", async () => {
    const result = await generateForProject("proj-1");
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(savedTemplates.length).toBe(result.length);
    expect(result.some((t) => String(t.templateId).startsWith("composed-"))).toBe(true);
    for (const t of savedTemplates) {
      expect(String(t.s3HtmlKey)).toMatch(/^projects\/proj-1\/templates\//);
      expect(String(t.htmlContent)).not.toMatch(/\{\{/);
    }
    expect(String(savedTemplates[0]?.htmlContent)).toMatch(/Dharwin One/);
  });
});
